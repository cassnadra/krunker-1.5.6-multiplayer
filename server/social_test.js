// Social test: two players on their own server (port 8095, throwaway accounts file): profiles, leaderboards,
// the market, gifts, and clans both through the Social panel's packets and the game's clan window ones.
//   node server/social_test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const msgpack = require('msgpack-lite');

const file = path.join(os.tmpdir(), 'krunker_social_test.json');
try { fs.unlinkSync(file); } catch (e) { }
const srv = require('./server.js').start({ port: 8095, log: () => {}, lan: false, accountsFile: file, startingKR: 1000, freeSpins: true });
const enc = (label, ...a) => Buffer.concat([msgpack.encode([label, a]), Buffer.from([0, 0])]);

let failed = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failed++; };

function connect(name) {
  return new Promise(res => {
    const ws = new WebSocket('ws://localhost:8095/?name=' + name);
    const waiting = [], latest = {};
    let nextId = 1;
    ws.on('message', d => {
      const [label, ...a] = msgpack.decode(new Uint8Array(d).slice(0, -2));
      latest[label] = a;
      if (label === 'load') ws.send(enc('load', 0));
      for (let i = 0; i < waiting.length; i++) if (waiting[i].label === label && (!waiting[i].id || a[0] === waiting[i].id)) { waiting.splice(i, 1)[0].res(a); break; }
    });
    const c = {
      send: (...m) => ws.send(enc(...m)),
      next: (label, id) => new Promise(r => waiting.push({ label, id, res: r })),
      async soc(action, args) { const id = nextId++; c.send('soc', id, action, args || {}); const [, err, data] = await c.next('socR', id); return { err, data }; },
      latest, close: () => ws.close(),
    };
    ws.on('open', async () => {
      await c.next('ready');
      c.send('a', 0, [name, 'pw' + name]);
      await c.next('a');
      res(c);
    });
  });
}

(async () => {
  const A = await connect('Alice'), B = await connect('Bob');
  A.send('spinN', 2, 20);
  const [won] = await A.next('spinN');
  const ind = won[0][0];

  let r = await B.soc('profile', { name: 'alice' });
  check(!r.err && r.data.name === 'Alice' && r.data.items === 20 && r.data.online && !r.data.me, 'profile of another player: 20 items, online');
  r = await A.soc('profile');
  check(r.data.me && r.data.funds === 1000, 'own profile');
  r = await A.soc('profile', { name: 'nobody' });
  check(r.err === 'No player with that name', 'unknown profile: ' + r.err);

  r = await A.soc('leaderboard', { stat: 'items' });
  check(r.data[0].name === 'Alice' && r.data[0].value === 20 && r.data[1].name === 'Bob', 'items leaderboard');
  r = await A.soc('search', { text: 'bo' });
  check(r.data.length === 1 && r.data[0].name === 'Bob', 'search');

  // the market: Alice lists, Bob buys, KR and the item move, Alice's game gets the new KR ('ua')
  r = await A.soc('sell', { ind, price: 250 });
  check(!r.err && r.data.price === 250, 'list an item for 250 KR');
  const id = r.data.id;
  r = await A.soc('profile');
  check(r.data.items === 19 && r.data.listed === 1, 'the listed item left the inventory');
  r = await B.soc('market', { search: 'alice' });
  check(r.data.listings.length === 1 && r.data.listings[0].seller === 'Alice' && !r.data.listings[0].mine, 'the market shows it, searching by seller');
  r = await A.soc('buy', { id });
  check(r.err === "That's your own listing", "can't buy your own: " + r.err);
  const uaA = A.next('ua');
  r = await B.soc('buy', { id });
  check(!r.err, 'Bob buys it');
  const [dataA] = await uaA;
  check(dataA[5] === 1250, "Alice's game hears about her new KR: " + dataA[5]);
  r = await B.soc('profile');
  check(r.data.funds === 750 && r.data.skins.some(s => s.ind === ind), 'Bob paid 250 and has the item');
  r = await B.soc('buy', { id });
  check(r.err === 'Already sold or taken back', 'sold twice? ' + r.err);
  r = await B.soc('sell', { ind, price: 0 });
  check(r.err, 'a price of 0 is refused');
  r = await B.soc('sell', { ind, price: 99 });
  const id2 = r.data.id;
  r = await B.soc('unlist', { id: id2 });
  r = await B.soc('profile');
  check(r.data.skins.some(s => s.ind === ind) && r.data.listed === 0, 'taking a listing back returns the item');
  r = await B.soc('sell', { ind: 99999, price: 10 });
  check(r.err, "can't sell what you don't own");

  // gifts
  r = await B.soc('gift', { to: 'ALICE', ind });
  check(!r.err && /Sent .* to Alice/.test(r.data), 'gift: ' + (r.err || r.data));
  r = await B.soc('gift', { to: 'Alice', ind });
  check(r.err === "You don't have that item", 'gift what you no longer have: ' + r.err);
  r = await A.soc('profile');
  check(r.data.items === 20, 'Alice has 20 again');

  // clans through the panel: create, ask, accept, kick
  r = await A.soc('clanCreate', { tag: '<b>' });
  check(r.err, 'a tag with < > is refused: ' + r.err);
  r = await A.soc('clanCreate', { tag: 'ABCDE' });
  check(r.err === 'A clan tag is 1-4 characters', '5 characters is too long');
  r = await A.soc('clanCreate', { tag: 'м♿ﬁа' });
  check(!r.err && r.data.tag === 'м♿ﬁа', 'a tag in Cyrillic and symbols: ' + (r.err || r.data.tag));
  r = await B.soc('clanCreate', { tag: 'М♿ﬁА' });
  check(r.err === 'That clan already exists', 'unique regardless of case, Cyrillic too: ' + r.err);
  r = await A.soc('clanLeave');
  r = await A.soc('clanCreate', { tag: 'GG' });
  check(!r.err && r.data.tag === 'GG' && r.data.isOwner, 'Alice makes [GG]');
  r = await B.soc('clanCreate', { tag: 'gg' });
  check(r.err === 'That clan already exists', 'tags are unique regardless of case');
  r = await B.soc('clanJoin', { tag: 'gg' });
  check(!r.err, 'Bob asks to join');
  r = await A.soc('clan');
  check(r.data.requests.length === 1 && r.data.requests[0].name === 'Bob', 'the owner sees the request');
  r = await B.soc('clan', { tag: 'GG' });
  check(r.data.requests === null && r.data.asked, "Bob doesn't see requests, sees he asked");
  const uaB = B.next('ua');
  r = await A.soc('clanAnswer', { id: r.data.members[0].id === 1 ? 2 : 1, yes: true });
  const [dataB] = await uaB;
  check(dataB[7] === 'GG', "Bob's game gets his clan: " + dataB[7]);
  r = await A.soc('leaderboard', { stat: 'clans' });
  check(r.data[0].name === 'GG' && r.data[0].members === 2, 'clan leaderboard');
  r = await B.soc('clanKick', { id: 1 });
  check(r.err === 'Only the clan owner can do that', 'members cannot kick: ' + r.err);
  r = await A.soc('clanKick', { id: 2 });
  check(!r.err && r.data.members.length === 1, 'the owner kicks Bob');

  // the game's clan window: 'cln' packets
  B.send('cln', 2, 'GG');
  let [msg, , ok] = await B.next('cln');
  check(ok === 1 && /Asked/.test(msg), 'game window: ask to join: ' + msg);
  A.send('cln', 3, 1);
  let [, data] = await A.next('cln');
  check(data && data.clan_name === 'GG' && data.requests.length === 1 && data.requests[0].player_name === 'Bob', 'game window: clan page with the request');
  A.send('clnR', 2, 1);
  B.send('cln', 3, 1);
  [, data] = await B.next('cln');
  check(data && data.members.length === 2 && !data.requests, 'game window: accepted, Bob sees the members but not requests');
  B.send('cln', 4, 1);   // Bob leaves
  await new Promise(r => setTimeout(r, 200));
  r = await A.soc('clan');
  check(r.data.members.length === 1, 'game window: Bob left');
  A.send('cln', 4, 1);   // the owner leaving deletes it
  await new Promise(r => setTimeout(r, 200));
  r = await A.soc('clans');
  check(r.data.length === 0, 'the owner leaving deletes the clan');
  A.send('cln', 1, 'NEW');
  [, data] = await A.next('cln');
  check(data && data.clan_name === 'NEW', 'game window: create a clan');

  // spawning shows the clan tag
  A.send('etrg', [0, 0, [-1, -1], -1, -1, 2, 0, 0, 1, -1, -1]);
  await A.next('start');
  const p = srv.game.players.list.find(q => q.name === 'Alice');
  check(p && p.clan === 'NEW' && p.level >= 1, 'in game: [NEW] next to the name, level ' + (p && p.level));

  A.close(); B.close();
  await new Promise(r => setTimeout(r, 200));
  srv.close();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  check(saved.clans.NEW && saved.users.alice.clan === 'NEW' && saved.users.bob.funds === 750 && saved.market.length === 0, 'clans, KR and the market are saved');
  fs.unlinkSync(file);
  console.log(failed ? `${failed} FAILED` : 'all passed');
  process.exit(failed ? 1 : 0);
})();
