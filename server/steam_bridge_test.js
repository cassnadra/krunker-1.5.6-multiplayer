// Steam bridge test without Steam: two in-memory "PCs" linked by a fake packet link that delivers in order with a
// little delay, like Steam's Reliable P2P. A real server on port 8094, two players joining through the bridge,
// logging in, spinning, moving, and one dropping out.   node server/steam_bridge_test.js
'use strict';
const os = require('os');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const msgpack = require('msgpack-lite');
const bridge = require('./steam_bridge');

const file = path.join(os.tmpdir(), 'krunker_bridge_test.json');
try { fs.unlinkSync(file); } catch (e) { }
const srv = require('./server.js').start({ port: 8094, log: () => {}, lan: false, accountsFile: file });

// a fake network: link(id) is that PC's end; packets arrive in order after a few ms
const ends = new Map();
let sent = 0, bytes = 0;
function link(id) {
  const e = { handlers: [], gone: [] };
  ends.set(id, e);
  return {
    send(peer, buf) {
      sent++; bytes += buf.length;
      const to = ends.get(peer);
      if (to) setTimeout(() => to.handlers.forEach(h => h(id, Buffer.from(buf))), 3);
      return true;
    },
    onPacket: h => e.handlers.push(h),
    onPeerGone: h => e.gone.push(h),
  };
}
const peerGone = (who, onPc) => ends.get(onPc).gone.forEach(h => h(who));

const enc = (label, ...a) => Buffer.concat([msgpack.encode([label, a]), Buffer.from([0, 0])]);
let failed = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failed++; };

function player(url, name) {
  return new Promise(res => {
    const ws = new WebSocket(url + '?name=' + name);
    const waiting = [], got = {};
    ws.on('message', d => {
      const [label, ...a] = msgpack.decode(new Uint8Array(d).slice(0, -2));
      got[label] = (got[label] || 0) + 1;
      if (label === 'load') ws.send(enc('load', 0));
      for (let i = 0; i < waiting.length; i++) if (waiting[i].label === label) { waiting.splice(i, 1)[0].res(a); break; }
    });
    const p = { ws, got, send: (...m) => ws.send(enc(...m)), next: label => new Promise(r => waiting.push({ label, res: r })) };
    ws.on('open', () => res(p));
  });
}

(async () => {
  const hostLink = link('HOST');
  const h = bridge.host(hostLink, 8094);
  const pcA = await bridge.client(link('A'), 'HOST');
  const pcB = await bridge.client(link('B'), 'HOST');
  check(/^ws:\/\/127\.0\.0\.1:\d+\/$/.test(pcA.url), 'the joining PC gets a local address for the game: ' + pcA.url);

  const A = await player(pcA.url, 'Alice'), B = await player(pcB.url, 'Bob');
  await Promise.all([A.next('ready'), B.next('ready')]);
  check(srv.clients.size === 2 && [...srv.clients.values()].map(c => c.name).sort().join() === 'Alice,Bob', 'both reach the server, with their names');
  check(h.connections() === 2, 'the host bridge holds 2 connections');

  A.send('a', 0, ['Alice', 'pw1']);
  const [err, , name, data] = await A.next('a');
  check(!err && name === 'Alice' && data[5] === 999999, 'log in through the bridge');
  A.send('spinN', 2, 100);
  const [results] = await A.next('spinN');
  check(results.length === 100, 'a 100-spin answer comes back whole');

  const spawn = [0, 0, [-1, -1], -1, -1, 2, 0, 0, 1, -1, -1];
  A.send('etrg', spawn); B.send('etrg', spawn);
  await Promise.all([A.next('start'), B.next('start')]);
  await new Promise(r => setTimeout(r, 600));
  check(A.got['1'] > 2 && B.got['8'] > 2, 'position updates flow (A got ' + A.got['1'] + " '1', B got " + B.got['8'] + " '8')");

  A.send('c', 'hello over steam');
  const [from, msg] = await B.next('ch');
  check(from === 'Alice' && msg === 'hello over steam', 'chat from one player reaches the other');

  // Bob's PC drops off Steam: the host closes his connection, the server sees him leave
  peerGone('B', 'HOST');
  await new Promise(r => setTimeout(r, 300));
  check(srv.clients.size === 1 && h.connections() === 1, 'a peer that goes away leaves the game');

  // Alice closes the game: the close travels to the host
  A.ws.close();
  await new Promise(r => setTimeout(r, 300));
  check(srv.clients.size === 0 && h.connections() === 0, 'closing the game closes it on the host');

  console.log(`  (${sent} packets, ${Math.round(bytes / 1024)} KB over the fake link)`);
  pcA.close(); pcB.close(); h.close(); srv.close();
  fs.unlinkSync(file);
  console.log(failed ? `${failed} FAILED` : 'all passed');
  process.exit(failed ? 1 : 0);
})();
