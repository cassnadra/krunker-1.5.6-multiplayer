// Account test: registers, logs in, spins every wheel and checks what got saved, against its own server on port 8098
// with a throwaway accounts file.   node server/account_test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const msgpack = require('msgpack-lite');

const file = path.join(os.tmpdir(), 'krunker_accounts_test.json');
try { fs.unlinkSync(file); } catch (e) { }
const srv = require('./server.js').start({ port: 8098, log: () => {}, lan: false, accountsFile: file, startingKR: 999999, freeSpins: true });
const store = srv.game.store;
const enc = (label, ...a) => Buffer.concat([msgpack.encode([label, a]), Buffer.from([0, 0])]);

let failed = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) failed++; };

// one connection: send, and wait for the next packet with a label
function connect() {
  return new Promise(res => {
    const ws = new WebSocket('ws://localhost:8098/?name=Tester');
    const waiting = [], got = [];
    ws.on('message', d => {
      const [label, ...a] = msgpack.decode(new Uint8Array(d).slice(0, -2));
      got.push([label, a]);
      if (label === 'load') ws.send(enc('load', 0));
      for (let i = 0; i < waiting.length; i++) if (waiting[i].label === label) { waiting.splice(i, 1)[0].res(a); break; }
    });
    const c = {
      send: (...m) => ws.send(enc(...m)),
      next: label => new Promise(r => waiting.push({ label, res: r })),
      got, close: () => ws.close(),
    };
    ws.on('open', () => res(c));
  });
}

(async () => {
  let c = await connect();
  await c.next('ready');

  c.send('a', 0, ['ab', 'pw1']);
  check((await c.next('a'))[0], 'a 2-letter name is refused');

  c.send('a', 0, ['Tester_1', 'secret']);
  let [err, id, name, data, token] = await c.next('a');
  check(!err && id === 1 && name === 'Tester_1', 'register: ' + (err || name));
  check(data[5] === 999999, 'new account has 999999 KR: ' + data[5]);
  check(typeof token === 'string' && token.length > 20, 'register hands out a token');

  c.send('a', 0, ['tester_1', 'other']);
  check((await c.next('a'))[0] === 'That name is taken', 'names are unique regardless of case');

  // every wheel 30 times: the item matches the wheel, the KR doesn't go down, the wheel stops on the item's rarity
  let spins = 0, bad = [];
  for (let w = 0; w < store.wheels.length; w++) {
    const wheel = store.wheels[w], total = wheel.rarities.reduce((x, y) => x + y, 0);
    for (let i = 0; i < 30; i++) {
      c.send('spin', w);
      const [pos, ind, funds, e] = await c.next('spin');
      const s = store.skins[ind];
      let start = 0;
      for (let k = 0; k < s.rarity; k++) start += wheel.rarities[k];
      if (e) bad.push(`wheel ${w}: error`);
      else if (funds !== 999999) bad.push(`wheel ${w}: funds ${funds}`);
      else if (wheel.itemTypes && !wheel.itemTypes.includes(s.type || 0)) bad.push(`wheel ${w}: type ${s.type}`);
      else if (wheel.weaponType != null && s.weapon !== wheel.weaponType) bad.push(`wheel ${w}: weapon ${s.weapon}`);
      else if (!(pos * total / 100 >= start && pos * total / 100 <= start + wheel.rarities[s.rarity])) bad.push(`wheel ${w}: pos ${pos} not on rarity ${s.rarity}`);
      else spins++;
      c.send('unbx');
    }
  }
  check(!bad.length, `${spins} spins on ${store.wheels.length} wheels ` + bad.slice(0, 3).join('; '));

  // the multi-spin: 10 at once on the Hunter wheel (snipers only), and the count is capped at 100
  c.send('spinN', 3, 10);
  let [many, mfunds, merr] = await c.next('spinN');
  check(!merr && many.length === 10 && mfunds === 999999 && many.every(([ind, r]) => store.skins[ind].weapon === 1 && store.skins[ind].rarity === r),
    'x10 on the Hunter wheel: 10 snipers, rarities match');
  spins += many.length;
  c.send('spinN', 0, 5000);
  [many] = await c.next('spinN');
  check(many.length === 100, 'x5000 is capped at 100: ' + many.length);
  spins += many.length;

  // spawning without an account still works
  c.send('etrg', [0, 0, [-1, -1], -1, -1, 2, 0, 0, 1, -1, -1]);
  await c.next('start');
  c.close();

  // log in again with the token, then with the password; the inventory is there
  c = await connect();
  await c.next('ready');
  c.send('a', 1, ['Tester_1', null, token]);
  [err, , , data] = await c.next('a');
  check(!err && data[10].reduce((n, s) => n + s.cnt, 0) === spins, 'token login, inventory has all ' + spins + ' items');
  const mine = data[10][0].ind, notMine = store.skins.findIndex((s, i) => !s.type && !data[10].some(o => o.ind === i));
  c.send('a', 1, ['Tester_1', 'wrong', null]);
  check((await c.next('a'))[0] === 'Wrong password', 'wrong password is refused');
  c.send('a', 1, ['TESTER_1', 'secret', null]);
  check(!(await c.next('a'))[0], 'password login');

  c.send('etrg', [0, 0, [mine, notMine], -1, -1, 2, 0, 0, 1, -1, -1]);
  await c.next('start');
  const p = srv.game.players.list.find(q => q.account && q.account.name === 'Tester_1');
  check(p && p.skins[0] === mine && p.skins[1] === -1, `cosmetics: owned ${mine} kept, unowned ${notMine} dropped (${p && p.skins})`);
  check(p && p.name === 'Tester_1', 'the player plays under the account name');
  c.close();

  await new Promise(r => setTimeout(r, 200));
  srv.close();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8')).users.tester_1;
  check(saved && saved.skins.reduce((n, s) => n + s.cnt, 0) === spins && !saved.password && saved.hash, 'saved to disk, password hashed');
  fs.unlinkSync(file);
  console.log(failed ? `${failed} FAILED` : 'all passed');
  process.exit(failed ? 1 : 0);
})();
