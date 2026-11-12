// Carries the game's WebSocket connections over a packet link between two PCs (Steam P2P, see main/steam.js), so
// neither the game nor the server has to know about Steam:
//   - on the PC that joins, the game connects to a little WebSocket server here on 127.0.0.1 (client()), and every
//     message goes to the host as a packet;
//   - on the host, each of those connections becomes an ordinary connection to the real server (host()).
//
// The link only needs: send(peer, Buffer), onPacket((peer, Buffer) => ...), and optionally onPeerGone(peer => ...).
// Peers are strings (Steam IDs). Packets must arrive reliably and in order (Steam's Reliable send type does that).
//
// A packet is [type: 1 byte][connection: 4 bytes][payload]; type 1 opens a connection (payload: the URL path and
// query the game asked for, e.g. "/?name=Bob"), 2 carries one WebSocket message, 3 closes it.
'use strict';
const WebSocket = require('ws');
const { WebSocketServer } = require('ws');

const OPEN = 1, DATA = 2, CLOSE = 3;
const packet = (type, conn, payload) => {
  const head = Buffer.alloc(5);
  head[0] = type;
  head.writeUInt32BE(conn >>> 0, 1);
  return payload ? Buffer.concat([head, payload]) : head;
};

// the host: forwards every remote connection to the server on 127.0.0.1:port
function host(link, port, opts = {}) {
  const log = opts.log || (() => {});
  const conns = new Map();   // "peer/conn" -> { ws, queue }
  function close(key, tell) {
    const c = conns.get(key);
    if (!c) return;
    conns.delete(key);
    try { c.ws.close(); } catch (e) { }
    if (tell) link.send(c.peer, packet(CLOSE, c.conn));
  }
  link.onPacket((peer, buf) => {
    if (!buf || buf.length < 5) return;
    const type = buf[0], conn = buf.readUInt32BE(1), key = peer + '/' + conn, payload = buf.subarray(5);
    if (type === OPEN) {
      close(key);
      const path = payload.toString('utf8');
      const ws = new WebSocket(`ws://127.0.0.1:${port}${path.startsWith('/') ? path : '/' + path}`);
      const c = { ws, peer, conn, queue: [] };
      conns.set(key, c);
      ws.on('open', () => { for (const m of c.queue) ws.send(m); c.queue = null; });
      ws.on('message', data => link.send(peer, packet(DATA, conn, Buffer.from(data))));
      ws.on('close', () => { if (conns.get(key) === c) close(key, true); });
      ws.on('error', () => { });
      log(`steam: ${peer} connected`);
    } else if (type === DATA) {
      const c = conns.get(key);
      if (!c) return;
      if (c.queue) c.queue.push(Buffer.from(payload)); else c.ws.send(payload);
    } else if (type === CLOSE) close(key);
  });
  link.onPeerGone && link.onPeerGone(peer => { for (const [key, c] of conns) if (c.peer === peer) close(key); });
  return {
    connections: () => conns.size,
    close() { for (const key of [...conns.keys()]) close(key, true); },
  };
}

// a PC joining the host: a WebSocket server on 127.0.0.1 for the game; resolves to { port, url, close }
function client(link, hostPeer, opts = {}) {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ host: '127.0.0.1', port: opts.port || 0 });
    const conns = new Map();   // conn -> ws
    let next = 1;
    wss.on('connection', (ws, req) => {
      const conn = next++;
      conns.set(conn, ws);
      link.send(hostPeer, packet(OPEN, conn, Buffer.from(req.url || '/', 'utf8')));
      ws.on('message', data => link.send(hostPeer, packet(DATA, conn, Buffer.from(data))));
      ws.on('close', () => { if (conns.delete(conn)) link.send(hostPeer, packet(CLOSE, conn)); });
      ws.on('error', () => { });
    });
    link.onPacket((peer, buf) => {
      if (peer !== hostPeer || !buf || buf.length < 5) return;
      const type = buf[0], conn = buf.readUInt32BE(1), ws = conns.get(conn);
      if (!ws) return;
      if (type === DATA) ws.readyState === 1 && ws.send(buf.subarray(5));
      else if (type === CLOSE) { conns.delete(conn); ws.close(); }
    });
    link.onPeerGone && link.onPeerGone(peer => { if (peer === hostPeer) for (const ws of conns.values()) ws.close(); });
    wss.on('listening', () => {
      const port = wss.address().port;
      resolve({ port, url: `ws://127.0.0.1:${port}/`, close() { for (const ws of conns.values()) ws.close(); wss.close(); } });
    });
    wss.on('error', reject);
  });
}

module.exports = { host, client };
