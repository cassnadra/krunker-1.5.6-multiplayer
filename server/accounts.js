// Accounts for the multiplayer server: register / log in, KR, the prize wheels and the skin inventory.
//
// Stored in server/accounts.json (next to this file). Passwords are salted scrypt hashes; a login also hands the
// client a token, which it saves and uses to log back in by itself next time.
//
// The account object is the game's own Account class (bundle module 0x5b), so the shared game code updates kills,
// score, games etc. on it and sends them to the player ('ua') at the end of a round, like the original server did.
//
// multiplayer.json:
//   startingKR  every account has at least this much KR (topped up at each login); default 999999
//   freeSpins   spinning a wheel costs nothing; default true
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, 'accounts.json');

function create(bundle, opts = {}) {
  const Account = bundle.req(0x5b);
  const config = bundle.req(0x7);
  const store = bundle.req(0x45);
  const startingKR = opts.startingKR != null ? Number(opts.startingKR) : 999999;
  const freeSpins = opts.freeSpins != null ? !!opts.freeSpins : true;
  const log = opts.log || (() => {});
  const file = opts.file || process.env.KRUNKER_ACCOUNTS || FILE;   // KRUNKER_ACCOUNTS: tests use a throwaway file

  let db = { nextId: 1, users: {} };   // users: lower-case name -> saved record
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { }
  const live = new Map();   // lower-case name -> Account instance (shared by every session of that account)

  let saveTimer = null;
  function save() {   // batched: a round end updates every player at once
    if (saveTimer) return;
    saveTimer = setTimeout(saveNow, 500);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    for (const [key, a] of live) {
      const u = db.users[key];
      if (!u) continue;
      Object.assign(u, {
        funds: a.funds, kills: a.kills, deaths: a.deaths, wins: a.wins, games: a.games, score: a.score,
        timePlayed: a.timePlayed, stats: a.stats, skins: a.skins, clan: a.clan || null,
      });
    }
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, file);
  }

  const hash = (pass, salt) => crypto.scryptSync(String(pass), salt, 32).toString('hex');

  function account(key) {
    let a = live.get(key);
    if (a) return a;
    const u = db.users[key];
    a = new Account(u.id, u.name, {
      player_score: u.score, player_kills: u.kills, player_deaths: u.deaths, player_wins: u.wins,
      player_games_played: u.games, player_funds: u.funds, player_timeplayed: u.timePlayed, skins: u.skins || [],
      player_clan: u.clan || null,
    }, config);
    a.stats = u.stats || {};
    live.set(key, a);
    return a;
  }

  function topUp(a) {
    if (a.funds < startingKR) a.funds = startingKR;
  }

  // 'a' from the client: type 0 register [name, pass], 1 log in [name, pass, null] or [name, null, token]
  // -> [error, id, name, data, token]; error is shown to the player
  function auth(type, args) {
    const [rawName, pass, token] = Array.isArray(args) ? args : [];
    const name = String(rawName || '').trim();
    const key = name.toLowerCase();
    if (type === 0) {
      if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return ['Name: 3-16 letters, numbers or _'];
      if (String(pass || '').length < 3) return ['Password: at least 3 characters'];
      if (db.users[key]) return ['That name is taken'];
      const salt = crypto.randomBytes(16).toString('hex');
      db.users[key] = {
        id: db.nextId++, name, salt, hash: hash(pass, salt), tokens: [], created: Date.now(),
        funds: startingKR, kills: 0, deaths: 0, wins: 0, games: 0, score: 0, timePlayed: 0, stats: {}, skins: [],
      };
      log(`account created: ${name}`);
    } else {
      const u = db.users[key];
      if (!u) return ['No account with that name'];
      if (token) {
        if (!(u.tokens || []).includes(token)) return ['Session expired, log in again'];
      } else if (hash(pass, u.salt) !== u.hash) return ['Wrong password'];
    }
    const u = db.users[key];
    let tok = token;
    if (!tok) {
      tok = crypto.randomBytes(24).toString('hex');
      u.tokens = [...(u.tokens || []), tok].slice(-10);   // a few devices stay logged in
    }
    const a = account(key);
    topUp(a);
    save();
    return [null, a.id, a.name, a.getData(), tok, a];
  }

  // weighted pick of a rarity on this wheel, then a random item of that rarity the wheel allows
  function eligible(wheel, s) {
    if (store.rarities[s.rarity] && store.rarities[s.rarity].noSpin) return false;
    const type = s.type || 0;
    if (wheel.itemTypes && !wheel.itemTypes.includes(type)) return false;
    if (wheel.weaponType != null && (type !== 0 || s.weapon !== wheel.weaponType)) return false;
    return true;
  }

  // 'spin': -> { pos (0-100, where the wheel stops), ind (store skin index), rarity } or { error }
  function spin(a, wheelIndex, paid) {
    const wheel = store.wheels[wheelIndex];
    if (!a || !wheel) return { error: 1 };
    if (!paid && !freeSpins && a.funds < wheel.price) return { error: 1 };
    const total = wheel.rarities.reduce((x, y) => x + y, 0);
    let r = Math.random() * total, rarity = 0;
    for (; rarity < wheel.rarities.length - 1; rarity++) {
      if (r < wheel.rarities[rarity]) break;
      r -= wheel.rarities[rarity];
    }
    // the rarity's slice on the wheel starts where the slices before it end
    let pool = [];
    for (; rarity >= 0; rarity--) {   // nothing of that rarity on this wheel: the next one down
      store.skins.forEach((s, i) => { if (s.rarity === rarity && eligible(wheel, s)) pool.push(i); });
      if (pool.length) break;
    }
    if (!pool.length) return { error: 1 };
    const ind = pool[Math.floor(Math.random() * pool.length)];
    let start = 0;
    for (let k = 0; k < rarity; k++) start += wheel.rarities[k];
    const pos = (start + wheel.rarities[rarity] * (0.1 + 0.8 * Math.random())) * 100 / total;
    if (!paid && !freeSpins) a.funds -= wheel.price;
    const own = a.skins.find(s => s.ind === ind);
    if (own) own.cnt++; else a.skins.push({ ind, cnt: 1 });
    save();
    return { pos, ind, rarity };
  }

  // several at once (the multi-spin): paid up front, all or nothing
  function spinMany(a, wheelIndex, count) {
    const wheel = store.wheels[wheelIndex];
    count = Math.max(1, Math.min(100, count | 0));
    if (!a || !wheel) return { error: 1 };
    if (!freeSpins) {
      if (a.funds < wheel.price * count) return { error: 1 };
      a.funds -= wheel.price * count;
    }
    const out = [];
    for (let i = 0; i < count; i++) {
      const r = spin(a, wheelIndex, true);
      if (!r.error) out.push(r);
    }
    return { results: out };
  }

  const owns = (a, ind) => ind == null || ind < 0 || !!(a && a.skins.some(s => s.ind === ind));

  // the KR a round pays out (the game's saveRewards: 'id,reward,...' -> new funds 'f,f,...')
  function reward(csv) {
    const parts = String(csv).split(',').map(Number), out = [];
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const key = Object.keys(db.users).find(k => db.users[k].id === parts[i]);
      const a = key && account(key);
      if (a) { a.funds += parts[i + 1]; out.push(a.funds); } else out.push(0);
    }
    save();
    return out.join(',');
  }

  // for social.js: the saved data (market, clans live in it too) and accounts by name or id
  const keyOf = name => { const k = String(name || '').trim().toLowerCase(); return db.users[k] ? k : null; };
  const byId = id => { const k = Object.keys(db.users).find(k => db.users[k].id === id); return k ? account(k) : null; };
  const all = () => Object.keys(db.users).map(k => account(k));
  const created = a => db.users[a.name.toLowerCase()].created || 0;

  return { auth, spin, spinMany, owns, reward, save, saveNow, store, db: () => db, account, keyOf, byId, all, created };
}

module.exports = { create };
