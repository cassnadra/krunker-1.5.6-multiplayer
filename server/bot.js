// Protocol test: bots that join a server the way the client does.
//   node server/bot.js [address] [count] [seconds]     against a running server
//   node server/bot.js --self [count] [seconds]         starts its own server on port 8099 and exits when done
// Bot 0 stands still, turns slowly and shoots; the others walk around.
'use strict';
const WebSocket = require('ws');
const msgpack = require('msgpack-lite');

let args = process.argv.slice(2);
if (args[0] === '--self') {
  require('./server.js').start({ port: 8099, log: () => {} });
  args = ['localhost:8099', ...args.slice(1)];
}
const addr = args[0] || 'localhost:8080', count = Number(args[1]) || 2, secs = Number(args[2]) || 8;
const enc = (label, ...a) => Buffer.concat([msgpack.encode([label, a]), Buffer.from([0, 0])]);
const ETRG = [0, 0, [-1, -1], -1, -1, 2, 0, 0, 1, -1, -1];

const stats = [];
for (let b = 0; b < count; b++) {
  const st = { name: 'Bot' + b, got: {}, me: null, sid: null, pos: null, start: null, sees: 0, kills: 0, deaths: 0, health: null, chat: 0 };
  stats.push(st);
  setTimeout(() => {
    const ws = new WebSocket(`ws://${addr}/?name=${st.name}`);
    let isn = 0, timer = null;
    ws.on('message', d => {
      const [label, ...a] = msgpack.decode(new Uint8Array(d).slice(0, -2));
      st.got[label] = (st.got[label] || 0) + 1;
      if (label === 'io-init') st.me = a[0][0];
      else if (label === 'load') ws.send(enc('load', 0));
      else if (label === 'ready') setTimeout(() => ws.send(enc('etrg', ETRG)), 300);
      else if (label === '0') { for (let i = 0; i < a[0].length; i += 21) if (a[0][i] === st.me) st.sid = a[0][i + 1]; }
      else if (label === '8') { st.pos = a[0].slice(1, 4).map(Math.round); if (!st.start) st.start = st.pos; ws.send(enc('p')); }
      else if (label === '1') st.sees = a[0].length / 9;
      else if (label === 'h' && a[1] == null) st.health = a[0];
      else if (label === '3' && a[0] === st.sid) { st.deaths++; setTimeout(() => ws.send(enc('etrg', ETRG)), 500); }
      else if (label === '6') st.kills++;
      else if (label === 'ch') st.chat++;
      else if (label === 'start' && !timer) {
        if (b === 1) ws.send(enc('c', 'hello from ' + st.name));
        timer = setInterval(() => {   // 3 input frames per 100 ms, compressed like the client: isn only on the first
          const flat = [];
          for (let k = 0; k < 3; k++, isn++) {
            const f = [isn, 33, b === 0 ? (isn * 0.03) % 6.28 : 1.0, 0, b === 0 ? -1 : (isn % 40 < 20 ? 0 : 4),
              b === 0 ? 1 : 0, 0, b !== 0 && isn % 30 === 0 ? 1 : 0, 0, 0, 0, 0];
            flat.push(...(k ? f.slice(1) : f));
          }
          ws.send(enc('i', flat));
        }, 100);
      }
    });
    ws.on('error', e => console.log(st.name, 'error', e.message));
  }, b * 400);
}
setTimeout(() => {
  for (const s of stats)
    console.log(`${s.name} sid ${s.sid} start ${s.start} now ${s.pos} sees ${s.sees} health ${s.health} kills ${s.kills} deaths ${s.deaths} chat ${s.chat}\n   packets ${JSON.stringify(s.got)}`);
  process.exit(0);
}, secs * 1000);
