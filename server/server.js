// Multiplayer server for the Krunker v1.5.6 client.
//
// The game logic (movement, collision, shooting, damage, kills, scores, timers, modes) is the game's own shared code,
// loaded from the client bundle by loader.js and run here with this file as its "server socket" (send / broadcast).
// What this file adds is the network layer the original server had: connections, the client's packets, and the
// position updates ('0' add player, '1' others, '8' your own state).
//
//   node server/server.js [--port 8080] [--map kanji] [--mode ffa]
//   or require('./server/server.js').start({...}) from the Electron app (host mode).
'use strict';
const { WebSocketServer } = require('ws');
const { load } = require('./loader');
const discovery = require('./discovery');
const accounts = require('./accounts');
const social = require('./social');
const mpconfig = require('../main/mpconfig');

const MAPS = { burg: 0, littletown: 1, sandstorm: 2, subzero: 3, kanji: 4 };
const TICK = 1000 / 30;   // config.serverTickRate
const SEND = 100;         // config.serverSendRate

function start(opts = {}) {
  const port = opts.port || 8080;
  const log = opts.log || ((...a) => console.log('[server]', ...a));

  const bundle = load();
  const msgpack = bundle.req(0x28);
  const Game = bundle.req(0x58).obj;

  const clients = new Map();   // id -> client
  function sendTo(c, label, ...args) {
    if (!c || c.ws.readyState !== 1) return;
    const body = msgpack.encode([label, ...args]);
    const buf = Buffer.alloc(body.length + 2);   // + the 2-byte trailer the client strips
    Buffer.from(body).copy(buf);
    c.ws.send(buf);
  }

  // the game's server socket
  const net = {
    send(id, label, ...args) { sendTo(clients.get(id), label, ...args); },
    broadcast(room, label, ...args) { for (const c of clients.values()) sendTo(c, label, ...args); },
  };

  const settings = mpconfig();
  const acc = accounts.create(bundle, {
    startingKR: opts.startingKR != null ? opts.startingKR : settings.startingKR,
    freeSpins: opts.freeSpins != null ? opts.freeSpins : settings.freeSpins,
    file: opts.accountsFile, log,
  });
  // the game's database calls: 0x14 pays out a round's KR ('id,kr,...' -> 'funds,...'); the rest we save ourselves
  const dbCalls = {
    call(id, args, cb) {
      if (id === 0x14) { const result = acc.reward(args[0]); cb && cb(null, [[{ result }]]); }
      else { acc.save(); cb && cb(null, []); }
    },
  };

  const game = new Game(false, 0, dbCalls, null, null, null, net);
  const soc = social.create(acc, {
    log,
    // an account's KR, items or clan changed (a sale, a gift, a clan): its sessions get the new data
    notify(a) {
      for (const c of clients.values()) if (c.account === a) {
        sendTo(c, 'ua', a.getData());
        if (c.player) c.player.clan = a.clan || null;
      }
    },
    online: () => new Set([...clients.values()].filter(c => c.account).map(c => c.account.name)),
  });
  game.applyConfig(opts.config || {});
  game.init(opts.map != null ? opts.map : MAPS.kanji, opts.mode != null ? opts.mode : 0);
  log(`map ${game.map.maps[game.mapIndex].name}, ${game.mode.name}`);

  const initArgs = () => ['init', game.mapIndex, game.modeIndex, game.getTeamScores(), game.activeObjective, game.host,
    game.config, 0, game.customMapData ? 1 : null, game.getSyncData()];

  // '0' record: 21 fields per player
  function addRecord(p) {
    return [p.id, p.sid, round(p.x), round(p.y), round(p.z), p.name, p.classIndex, Math.ceil(p.health), p.maxHealth,
      p.team || null, p.level || 0, p.clan || null, p.skins, p.hatIndex, p.backIndex, p.secIndex, false, null,
      p.xDire || 0, p.meleeIndex, p.skinColIndex];
  }
  const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

  function makeId() {
    let s;
    do { s = Math.random().toString(36).slice(2, 9); } while (clients.has(s));
    return s;
  }

  // the client sends its inputs delta-compressed: a frame is
  //   [isn (first frame only)], delta, (xDir, yDir | 'i'), moveDir, (mouseL..wSwap: 7 values | 'i')
  // where 'i' repeats the previous frame's values
  function decodeInputs(c, s) {
    const frames = [];
    let i = 0;
    while (i < s.length) {
      const prev = c.prevInput;
      const f = new Array(12);
      f[0] = frames.length === 0 ? s[i++] : prev[0] + 1;
      f[1] = s[i++];
      if (s[i] === 'i' && prev) { f[2] = prev[2]; f[3] = prev[3]; i++; } else { f[2] = s[i++]; f[3] = s[i++]; }
      f[4] = s[i++];
      if (s[i] === 'i' && prev) { for (let k = 5; k < 12; k++) f[k] = prev[k]; i++; } else { for (let k = 5; k < 12; k++) f[k] = s[i++]; }
      if (f.some(v => v === undefined)) break;   // malformed
      c.prevInput = f;
      frames.push(f);
    }
    return frames;
  }

  function spawn(c, e) {
    const [classIndex, spray, skins, hat, back, secIndex, spectate, chall, , melee, skinCol] = e;
    if (game.endTimer > 0) return;
    if (spectate) {
      sendTo(c, 'start', game.lastTimer || '0:00', null, true, false);
      return;
    }
    const cls = game.config.classes.includes(classIndex) ? classIndex : 0;
    const old = game.players.list.find(p => p.id === c.id);
    const sp = game.getSpawnPoint(old && old.team, old);
    // cosmetics: only what this account owns (guests get the defaults)
    const own = v => (Number.isInteger(v) && acc.owns(c.account, v) ? v : -1);
    const p = game.players.add(c.id, old && old.sid, sp.x, sp.y, sp.z, c.name, cls,
      Array.isArray(skins) ? skins.slice(0, 2).map(own) : [-1, -1], own(hat), own(back), own(melee), skinCol, secIndex, false);
    p.account = c.account || null;
    p.clan = c.account && c.account.clan || null;   // the [TAG] next to the name
    p.level = c.account ? Math.max(1, Math.floor(0.03 * Math.sqrt(c.account.score || 0))) : 0;   // config.rankVar
    p.sprayIndex = spray || 0;
    p.xDire = -((sp.dir || 0) + 1) * Math.PI / 2;
    p.active = true;
    p.spectating = false;
    p.inputs.length = 0;
    c.player = p;
    c.prevInput = null;
    c.lastIsn = -1;
    sendTo(c, 'start', game.lastTimer || '0:00', p.team || null, false, !!chall);
    const rec = addRecord(p);
    for (const o of clients.values()) sendTo(o, '0', rec);
    const others = [];
    for (const q of game.players.list) if (q !== p && q.active) others.push(...addRecord(q));
    if (others.length) sendTo(c, '0', others);
    game.players.syncLeaders();
    log(`${c.name} spawned (${game.classes[cls].name})`);
  }

  function onPacket(c, label, args) {
    const p = c.player;
    switch (label) {
      case 'load':
        sendTo(c, ...initArgs());
        for (const q of game.players.list) if (q.active) sendTo(c, '0', addRecord(q));
        sendTo(c, 'ready');
        game.players.syncLeaders();
        break;
      case 'etrg': if (Array.isArray(args[0])) spawn(c, args[0]); break;
      case 'i':
        if (p && p.active && Array.isArray(args[0])) {
          for (const f of decodeInputs(c, args[0])) { p.inputs.push(f); c.lastIsn = f[0]; }
          if (p.inputs.length > 60) p.inputs.splice(0, p.inputs.length - 60);   // a stalled client can't queue minutes of input
        }
        break;
      case 'p':   // answer to '8': the round trip
        if (p && c.sent8) { const ms = Date.now() - c.sent8; p.pings.push(ms); if (p.pings.length > 10) p.pings.shift(); p.ping = Math.round(p.pings.reduce((a, b) => a + b, 0) / p.pings.length); }
        break;
      case 'po': sendTo(c, 'pir', 1); break;
      case 'c': {
        const msg = String(args[0] || '').slice(0, 100).replace(/[<>&]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[ch]);
        if (msg.trim()) { net.broadcast(null, 'ch', c.name, msg); log(`${c.name}: ${msg}`); }
        break;
      }
      case 'int':
        if (p && p.active) {
          if (args[0] === 0) game.players.spray(p);
          else if (args[0] === 1) game.players.interact(p);
          else if (args[0] === 2) game.players.dropWeapon(p);
        }
        break;
      case 'k': if (p && p.active) game.players.useStreak(p, args[0]); break;
      case 'a': {   // account: -1 log out, 0 register, 1 log in
        if (args[0] === -1) { c.account = null; if (p) p.account = null; break; }
        const [err, id, name, data, token, a] = acc.auth(args[0], args[1]);
        sendTo(c, 'a', err, id, name, data, token);
        if (err) break;
        c.account = a;
        c.name = name;
        if (p) { p.account = a; p.name = name; game.players.syncLeaders(); }
        log(`${name} logged in`);
        break;
      }
      case 'spin': {
        const r = acc.spin(c.account, args[0]);
        if (r.error) { sendTo(c, 'spin', 0, 0, c.account ? c.account.funds : 0, 1); break; }
        c.unboxed = r;
        sendTo(c, 'spin', r.pos, r.ind, c.account.funds, null);
        break;
      }
      case 'spinN': {   // the multi-spin: 'spinN', wheel, count -> 'spinN', [[ind, rarity, pos], ...], funds, error
        const r = acc.spinMany(c.account, args[0], args[1]);
        if (r.error) { sendTo(c, 'spinN', [], c.account ? c.account.funds : 0, 1); break; }
        sendTo(c, 'spinN', r.results.map(x => [x.ind, x.rarity, x.pos]), c.account.funds, null);   // pos: where its wheel stops
        for (const x of r.results) if (x.rarity >= 3) net.broadcast(null, 'unb', c.name, x.ind);
        break;
      }
      case 'soc': {   // the Social panel: 'soc', reqId, action, args -> 'socR', reqId, error, data
        const [err, data] = soc.handle(c.account, String(args[1]), args[2] || {});
        sendTo(c, 'socR', args[0], err, data);
        break;
      }
      case 'cln': case 'clnR': {   // the game's clan window
        const r = soc.gameClan(c.account, label, args);
        if (r) sendTo(c, 'cln', ...r);
        break;
      }
      case 'unbx':   // the wheel stopped: tell everyone about a Legendary or better
        if (c.unboxed && c.unboxed.rarity >= 3) net.broadcast(null, 'unb', c.name, c.unboxed.ind);
        c.unboxed = null;
        break;
      default: break;   // voting, custom games, the KR shop: not here
    }
  }

  const wss = new WebSocketServer(opts.host ? { port, host: opts.host } : { port })   // all addresses, IPv4 and IPv6;
  wss.on('connection', (ws, req) => {
    const id = makeId();
    const q = new URL(req.url, 'http://x').searchParams;
    let name = (q.get('name') || '').replace(/[^\w \-.[\]]/g, '').trim().slice(0, 16) || 'Guest_' + id.slice(0, 4);
    const taken = new Set([...clients.values()].map(o => o.name));
    for (let n = 2; taken.has(name); n++) name = name.replace(/ \d+$/, '') + ' ' + n;
    const c = { id, ws, name, player: null, prevInput: null, lastIsn: -1, sent8: 0 };
    clients.set(id, c);
    log(`${name} connected (${req.socket.remoteAddress}), ${clients.size} online`);
    ws.on('message', data => {
      try {
        const buf = new Uint8Array(data);
        const msg = msgpack.decode(buf.subarray(0, buf.length - 2));
        if (Array.isArray(msg)) onPacket(c, msg[0], Array.isArray(msg[1]) ? msg[1] : []);
      } catch (err) { log('bad packet from', name, err.message); }
    });
    ws.on('close', () => {
      clients.delete(id);
      if (game.players.list.some(pl => pl.id === id)) game.players.remove(game.players.list.find(pl => pl.id === id).sid);
      log(`${name} left, ${clients.size} online`);
    });
    ws.on('error', () => {});
    sendTo(c, 'io-init', [id]);
    sendTo(c, 'load', 20000);
  });
  let lan = null;
  wss.on('listening', () => {
    log(`listening on port ${port}`);
    if (opts.lan !== false) lan = discovery.answer(() => ({
      name: opts.name || require('os').hostname(), port, map: game.map.maps[game.mapIndex].name, mode: game.mode.name,
      players: clients.size,
    }), log);
    opts.onReady && opts.onReady();
  });
  wss.on('error', err => {   // e.g. EADDRINUSE: another server already has the port
    clearInterval(timer); clearInterval(saver);
    if (opts.onError) opts.onError(err); else { log(err.code === 'EADDRINUSE' ? `port ${port} is already in use` : err.message); process.exit(1); }
  });

  // simulation + updates
  let last = Date.now(), sendT = 0;
  const saver = setInterval(() => acc.save(), 30000);   // stats from the round in progress
  const timer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(now - last, 250);
    last = now;
    game.update(dt, now);
    sendT += dt;
    if (sendT < SEND) return;
    sendT = 0;
    const active = game.players.list.filter(p => p.active);
    const states = [];
    for (const p of active)
      states.push(p.sid, round(p.x), round(p.y), round(p.z), round(p.xDire, 3), round(p.yDire, 3), p.onGround ? 1 : 0,
        round(p.crouchVal, 2), p.weaponIndex);
    for (const c of clients.values()) {
      const p = c.player;
      sendTo(c, '1', states);
      if (p && p.active) {
        c.sent8 = now;
        sendTo(c, '8', [c.lastIsn, p.x, p.y, p.z, p.xVel, p.yVel, p.zVel, p.onGround, p.didJump, p.onLadder, p.aimVal,
          p.crouchVal, p.weaponIndex, p.slideTimer, p.canSlide, p.onTerrain, p.ping || -1]);
      }
    }
  }, TICK);

  return {
    game, clients,
    changeMap(index) {
      game.init(index != null ? index : (game.mapIndex + 1) % game.map.maps.length, game.modeIndex);
      for (const c of clients.values()) c.player = null;
      net.broadcast(null, ...initArgs());
      log(`map ${game.map.maps[game.mapIndex].name}`);
    },
    close() { clearInterval(timer); clearInterval(saver); acc.saveNow(); wss.close(); lan && lan.close(); },
  };
}

module.exports = { start, MAPS };

if (require.main === module) {
  const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : undefined; };
  const map = arg('map');
  const srv = start({
    port: Number(arg('port')) || 8080,
    name: arg('name'),
    map: map == null ? undefined : (MAPS[map.toLowerCase()] != null ? MAPS[map.toLowerCase()] : Number(map)),
    mode: arg('mode') === 'tdm' ? 1 : 0,
  });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { srv.close(); process.exit(0); });
}
