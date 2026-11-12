// Every game mode on our server: a server per mode (port 8093), 3 players join, spawn and walk for a few seconds;
// a mode passes when nothing throws and the players spawn.   node server/modes_test.js
'use strict';
const WebSocket = require('ws');
const msgpack = require('msgpack-lite');
const { start } = require('./server.js');

const enc = (label, ...a) => Buffer.concat([msgpack.encode([label, a]), Buffer.from([0, 0])]);
const SPAWN = [0, 0, [-1, -1], -1, -1, 2, 0, 0, 1, -1, -1];
let errors = [];
process.on('uncaughtException', e => errors.push(e.message));

function bot(name) {
  const ws = new WebSocket('ws://127.0.0.1:8093/?name=' + name);
  const st = { started: 0, got: 0, ws };
  let isn = 0;
  ws.on('message', d => {
    st.got++;
    const [label] = msgpack.decode(new Uint8Array(d).slice(0, -2));
    if (label === 'load') ws.send(enc('load', 0));
    else if (label === 'ready') ws.send(enc('etrg', SPAWN));
    else if (label === 'start') {
      st.started++;
      const t = setInterval(() => {   // walk forward
        if (ws.readyState !== 1) return clearInterval(t);
        ws.send(enc('i', [isn++, 33, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]));
      }, 100);
    }
  });
  ws.on('error', () => { });
  return st;
}

(async () => {
  const modes = require('./loader').load().req(0x27).modes;
  let failed = 0;
  for (let m = 0; m < modes.length; m++) {
    errors = [];
    let srv;
    try { srv = start({ port: 8093, mode: m, log: () => { }, lan: false }); }
    catch (e) { console.log(`FAIL ${m} ${modes[m].name}: won't start - ${e.message}`); failed++; continue; }
    await new Promise(r => setTimeout(r, 300));
    const bots = ['A', 'B', 'C'].map(bot);
    await new Promise(r => setTimeout(r, 4000));
    const spawned = srv.game.players.list.filter(p => p.active).length;
    const ok = !errors.length && spawned >= 1;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${m} ${modes[m].name}: ${spawned} spawned, ${bots.map(b => b.got).join('/')} packets` + (errors.length ? ' - ' + [...new Set(errors)].slice(0, 2).join(' | ') : ''));
    bots.forEach(b => b.ws.close());
    srv.close();
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(failed ? `${failed} modes failed` : 'all modes ran');
  process.exit(0);
})();
