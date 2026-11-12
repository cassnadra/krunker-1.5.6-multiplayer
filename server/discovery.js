// Finding servers on the local network, like Minecraft's LAN worlds: the game broadcasts a question on UDP port 47800
// and every server on the network answers with its name, port, map and player count.
'use strict';
const dgram = require('dgram');
const os = require('os');

const PORT = 47800;
const ASK = 'KRUNKER-LAN? 1';
const ANSWER = 'KRUNKER-LAN! 1 ';

// server side: answer questions with info() -> {name, port, map, mode, players}
function answer(info, log = () => {}) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  sock.on('message', (msg, from) => {
    if (msg.toString() !== ASK) return;
    try { sock.send(ANSWER + JSON.stringify(info()), from.port, from.address); } catch (e) { }
  });
  sock.on('error', err => { log(`LAN discovery off: ${err.message}`); try { sock.close(); } catch (e) { } });
  sock.bind(PORT, () => log(`visible on the LAN (UDP ${PORT})`));
  return { close() { try { sock.close(); } catch (e) { } } };
}

// every IPv4 broadcast address of this PC's networks, plus 255.255.255.255
function broadcastAddresses() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(os.networkInterfaces()))
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal) continue;
      const ip = a.address.split('.').map(Number), mask = a.netmask.split('.').map(Number);
      out.add(ip.map((b, i) => (b & mask[i]) | (~mask[i] & 255)).join('.'));
    }
  return [...out];
}

// game side: ask for ms milliseconds -> [{address, name, port, map, mode, players}]
function scan(ms = 1500) {
  return new Promise(resolve => {
    const found = new Map();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const done = () => { try { sock.close(); } catch (e) { } resolve([...found.values()]); };
    sock.on('message', (msg, from) => {
      const s = msg.toString();
      if (!s.startsWith(ANSWER)) return;
      try {
        const info = JSON.parse(s.slice(ANSWER.length));
        const port = Number(info.port) || 8080;
        found.set(from.address + ':' + port, Object.assign({}, info, { address: from.address, port }));
      } catch (e) { }
    });
    sock.on('error', done);
    sock.bind(0, () => {
      sock.setBroadcast(true);
      const ask = Buffer.from(ASK);
      const send = () => { for (const a of broadcastAddresses()) sock.send(ask, PORT, a, () => { }); };
      send();
      setTimeout(send, ms / 3);   // UDP can drop: ask twice
      setTimeout(done, ms);
    });
  });
}

module.exports = { answer, scan, PORT };
