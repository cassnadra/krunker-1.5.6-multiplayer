// The social side of the server: profiles, leaderboards, the market, gifts and clans.
//
// The Social panel (main/social_ui.js) asks over the game socket: 'soc', reqId, action, args -> 'socR', reqId, error, data.
// The game's own clan window uses its own packets, answered here too:
//   'cln', 1, tag   create          'cln', 2, tag   ask to join       'cln', 3   my clan's page
//   'cln', 4        leave / delete  'cln', 5, id    kick              'clnR', id, 1|0   accept / decline a request
//   -> 'cln', message, clanData, ok
// Market listings and clans are kept in accounts.json next to the accounts.
'use strict';

function create(acc, opts = {}) {
  const store = acc.store;
  const log = opts.log || (() => {});
  const notify = opts.notify || (() => {});   // an account changed (KR, items, clan): tell its sessions
  const online = opts.online || (() => new Set());   // names of accounts playing right now
  const db = () => {
    const d = acc.db();
    d.market = d.market || [];
    d.clans = d.clans || {};
    d.nextListing = d.nextListing || 1;
    return d;
  };

  const level = a => Math.max(1, Math.floor(0.03 * Math.sqrt(a.score || 0)));   // config.rankVar
  const contrabands = a => a.skins.reduce((n, s) => n + (store.skins[s.ind] && store.skins[s.ind].rarity === 5 ? s.cnt : 0), 0);
  const kd = a => Math.round((a.kills || 0) / Math.max(1, a.deaths || 0) * 100) / 100;
  const find = name => { const k = acc.keyOf(name); return k ? acc.account(k) : null; };
  const fail = msg => { const e = new Error(msg); e.user = true; throw e; };

  // one item out of / into an inventory
  function take(a, ind) {
    const s = a.skins.find(x => x.ind === ind);
    if (!s || s.cnt < 1) fail("You don't have that item");
    if (--s.cnt === 0) a.skins.splice(a.skins.indexOf(s), 1);
  }
  function give(a, ind) {
    const s = a.skins.find(x => x.ind === ind);
    if (s) s.cnt++; else a.skins.push({ ind, cnt: 1 });
  }
  const changed = (...as) => { for (const a of as) notify(a); acc.save(); };

  // ---- clans ----
  const clanOf = a => (a.clan && db().clans[a.clan.toUpperCase()]) || null;
  const clanScore = c => c.members.reduce((n, id) => { const m = acc.byId(id); return n + (m ? m.score || 0 : 0); }, 0);
  function setClan(a, tag) {
    a.clan = tag;
    changed(a);
  }
  function clanCreate(a, tag) {
    // any letters or symbols, like the original (м♿ﬁа); 1-4 characters. Not < > & " ' ` (the game puts the tag in
    // its HTML as it is), spaces or invisible characters
    tag = String(tag || '').normalize('NFC').trim();
    const chars = [...tag].length;
    if (chars < 1 || chars > 4 || tag.length > 8) fail('A clan tag is 1-4 characters');
    if (/[<>&"'`\\\s\p{Cc}\p{Cf}]/u.test(tag)) fail("A clan tag can't have spaces or < > & \" ' ` \\");
    if (clanOf(a)) fail('Leave your clan first');
    if (db().clans[tag.toUpperCase()]) fail('That clan already exists');
    db().clans[tag.toUpperCase()] = { tag, owner: a.id, members: [a.id], requests: [], created: Date.now() };
    for (const c of Object.values(db().clans)) c.requests = c.requests.filter(id => id !== a.id);
    setClan(a, tag);
    log(`${a.name} made clan [${tag}]`);
  }
  function clanRequest(a, tag) {
    const c = db().clans[String(tag || '').trim().toUpperCase()];
    if (!c) fail('No clan with that tag');
    if (clanOf(a)) fail('Leave your clan first');
    if (c.requests.includes(a.id)) fail('Already asked, wait for the owner');
    c.requests.push(a.id);
    acc.save();
    return `Asked to join [${c.tag}]`;
  }
  function clanAnswer(a, id, yes) {
    const c = clanOf(a);
    if (!c || c.owner !== a.id) fail('Only the clan owner can do that');
    const i = c.requests.indexOf(id);
    if (i < 0) fail('No such request');
    c.requests.splice(i, 1);
    const m = acc.byId(id);
    if (yes && m && !clanOf(m)) {
      c.members.push(id);
      for (const o of Object.values(db().clans)) o.requests = o.requests.filter(r => r !== id);
      setClan(m, c.tag);
    }
    acc.save();
  }
  function clanKick(a, id) {
    const c = clanOf(a);
    if (!c || c.owner !== a.id) fail('Only the clan owner can do that');
    if (id === a.id) fail("You can't kick yourself");
    const i = c.members.indexOf(id);
    if (i < 0) fail('Not in your clan');
    c.members.splice(i, 1);
    const m = acc.byId(id);
    if (m) setClan(m, null);
  }
  function clanLeave(a) {   // the owner leaving deletes the clan
    const c = clanOf(a);
    if (!c) { if (a.clan) setClan(a, null); return; }
    if (c.owner === a.id) {
      for (const id of c.members) { const m = acc.byId(id); if (m) setClan(m, null); }
      delete db().clans[c.tag.toUpperCase()];
      log(`${a.name} deleted clan [${c.tag}]`);
    } else {
      c.members = c.members.filter(id => id !== a.id);
      setClan(a, null);
    }
    acc.save();
  }
  function clanInfo(tag, viewer) {
    const c = db().clans[String(tag || '').trim().toUpperCase()];
    if (!c) fail('No clan with that tag');
    const on = online();
    const members = c.members.map(id => acc.byId(id)).filter(Boolean).map(m => ({
      name: m.name, id: m.id, level: level(m), score: m.score || 0, kills: m.kills || 0, owner: m.id === c.owner, online: on.has(m.name),
    })).sort((x, y) => y.owner - x.owner || y.score - x.score);
    const mine = viewer && viewer.id === c.owner;
    return {
      tag: c.tag, owner: (acc.byId(c.owner) || {}).name, score: clanScore(c), level: level({ score: clanScore(c) }), created: c.created,
      members, requests: mine ? c.requests.map(id => acc.byId(id)).filter(Boolean).map(m => ({ name: m.name, id: m.id, level: level(m) })) : null,
      isOwner: !!mine, isMember: !!(viewer && c.members.includes(viewer.id)),
      asked: !!(viewer && c.requests.includes(viewer.id)),
    };
  }
  // the game's clan window wants this shape
  function gameClanData(a) {
    const c = clanOf(a);
    if (!c) return null;
    const data = {
      clan_name: c.tag, clan_playerid: c.owner, clan_score: clanScore(c),
      members: c.members.map(id => acc.byId(id)).filter(Boolean).map(m => ({ player_id: m.id, player_name: m.name })),
    };
    if (c.owner === a.id) data.requests = c.requests.map(id => acc.byId(id)).filter(Boolean).map(m => ({ player_name: m.name, cr_playerid: m.id }));
    return data;
  }

  // 'cln' / 'clnR' from the game's clan window -> [message, clanData, ok]
  function gameClan(a, label, args) {
    if (!a) return ['Log in first'];
    try {
      if (label === 'clnR') { clanAnswer(a, args[0], args[1] === 1); return null; }
      switch (args[0]) {
        case 1: clanCreate(a, args[1]); return [null, gameClanData(a)];
        case 2: return [clanRequest(a, args[1]), null, 1];
        case 3: return clanOf(a) ? [null, gameClanData(a)] : (a.clan && setClan(a, null), ['Not in a clan']);
        case 4: clanLeave(a); return null;
        case 5: clanKick(a, args[1]); return null;
      }
    } catch (e) {
      if (e.user) return [e.message];
      throw e;
    }
    return null;
  }

  // ---- the market ----
  function listing(l, viewer) {
    const s = store.skins[l.ind], seller = acc.byId(l.seller);
    return { id: l.id, ind: l.ind, price: l.price, seller: seller ? seller.name : '?', mine: !!(viewer && viewer.id === l.seller), created: l.created, rarity: s ? s.rarity : 0 };
  }
  function sell(a, ind, price) {
    price = Math.floor(Number(price));
    if (!(price >= 1 && price <= 10000000)) fail('Price: 1 to 10,000,000 KR');
    if (!store.skins[ind]) fail('No such item');
    if (db().market.filter(l => l.seller === a.id).length >= 100) fail('You have 100 listings already');
    take(a, ind);   // held by the market until it sells or you take it back
    const l = { id: db().nextListing++, seller: a.id, ind, price, created: Date.now() };
    db().market.push(l);
    changed(a);
    log(`${a.name} listed ${store.skins[ind].name} for ${price} KR`);
    return listing(l, a);
  }
  function buy(a, id) {
    const i = db().market.findIndex(l => l.id === id);
    if (i < 0) fail('Already sold or taken back');
    const l = db().market[i];
    if (l.seller === a.id) fail("That's your own listing");
    if (a.funds < l.price) fail('Not enough KR');
    const seller = acc.byId(l.seller);
    db().market.splice(i, 1);
    a.funds -= l.price;
    if (seller) seller.funds += l.price;
    give(a, l.ind);
    changed(a, ...(seller ? [seller] : []));
    log(`${a.name} bought ${store.skins[l.ind].name} for ${l.price} KR`);
  }
  function unlist(a, id) {
    const i = db().market.findIndex(l => l.id === id && l.seller === a.id);
    if (i < 0) fail('Not your listing');
    give(a, db().market[i].ind);
    db().market.splice(i, 1);
    changed(a);
  }
  function market(viewer, q = {}) {
    let ls = db().market.map(l => listing(l, viewer));
    const text = String(q.search || '').toLowerCase();
    if (text) ls = ls.filter(l => store.skins[l.ind].name.toLowerCase().includes(text) || l.seller.toLowerCase().includes(text));
    if (q.rarity != null && q.rarity !== '') ls = ls.filter(l => l.rarity === Number(q.rarity));
    if (q.mine) ls = ls.filter(l => l.mine);
    const sorts = { new: (x, y) => y.created - x.created, cheap: (x, y) => x.price - y.price, dear: (x, y) => y.price - x.price, rarity: (x, y) => y.rarity - x.rarity || x.price - y.price };
    ls.sort(sorts[q.sort] || sorts.new);
    return { total: ls.length, listings: ls.slice(0, 300) };
  }
  function gift(a, toName, ind) {
    const to = find(toName);
    if (!to) fail('No player with that name');
    if (to === a) fail("You can't gift yourself");
    take(a, ind);
    give(to, ind);
    changed(a, to);
    log(`${a.name} gifted ${store.skins[ind].name} to ${to.name}`);
    return `Sent ${store.skins[ind].name} to ${to.name}`;
  }

  // ---- profiles and leaderboards ----
  function profile(name, viewer) {
    const a = find(name);
    if (!a) fail('No player with that name');
    return {
      name: a.name, id: a.id, clan: a.clan || null, level: level(a), score: a.score || 0, kills: a.kills || 0, deaths: a.deaths || 0,
      kd: kd(a), wins: a.wins || 0, games: a.games || 0, timePlayed: a.timePlayed || 0, funds: a.funds, contrabands: contrabands(a),
      items: a.skins.reduce((n, s) => n + s.cnt, 0), skins: a.skins, created: acc.created(a), online: online().has(a.name),
      me: !!(viewer && viewer.id === a.id), listed: db().market.filter(l => l.seller === a.id).length,
    };
  }
  const BOARDS = {
    level: a => a.score || 0, kills: a => a.kills || 0, wins: a => a.wins || 0, kd, timePlayed: a => a.timePlayed || 0,
    items: a => a.skins.reduce((n, s) => n + s.cnt, 0), contrabands,
  };
  function leaderboard(stat) {
    if (stat === 'clans') {
      return Object.values(db().clans).map(c => ({ name: c.tag, value: clanScore(c), members: c.members.length, owner: (acc.byId(c.owner) || {}).name }))
        .sort((x, y) => y.value - x.value).slice(0, 100);
    }
    const f = BOARDS[stat] || BOARDS.level;
    return acc.all().map(a => ({ name: a.name, clan: a.clan || null, level: level(a), value: f(a) }))
      .sort((x, y) => y.value - x.value || x.name.localeCompare(y.name)).slice(0, 100);
  }
  function search(text) {
    const t = String(text || '').toLowerCase();
    return acc.all().filter(a => a.name.toLowerCase().includes(t)).slice(0, 20).map(a => ({ name: a.name, level: level(a), clan: a.clan || null }));
  }
  function clans() {
    return Object.values(db().clans).map(c => ({ tag: c.tag, members: c.members.length, score: clanScore(c), owner: (acc.byId(c.owner) || {}).name }))
      .sort((x, y) => y.score - x.score);
  }

  // 'soc' from the Social panel -> [error, data]
  function handle(a, action, args = {}) {
    try {
      const need = () => a || fail('Log in first');
      switch (action) {
        case 'profile': return [null, profile(args.name || (a && a.name), a)];
        case 'search': return [null, search(args.text)];
        case 'leaderboard': return [null, leaderboard(args.stat)];
        case 'market': return [null, market(a, args)];
        case 'sell': need(); return [null, sell(a, args.ind, args.price)];
        case 'buy': need(); buy(a, args.id); return [null, true];
        case 'unlist': need(); unlist(a, args.id); return [null, true];
        case 'gift': need(); return [null, gift(a, args.to, args.ind)];
        case 'clans': return [null, clans()];
        case 'clan': return [null, clanInfo(args.tag || (a && a.clan), a)];
        case 'clanCreate': need(); clanCreate(a, args.tag); return [null, clanInfo(a.clan, a)];
        case 'clanJoin': need(); return [null, clanRequest(a, args.tag)];
        case 'clanAnswer': need(); clanAnswer(a, args.id, !!args.yes); return [null, clanInfo(a.clan, a)];
        case 'clanKick': need(); clanKick(a, args.id); return [null, clanInfo(a.clan, a)];
        case 'clanLeave': need(); clanLeave(a); return [null, true];
        default: return ['Unknown action'];
      }
    } catch (e) {
      if (e.user) return [e.message];
      log('social error: ' + (e.stack || e));
      return ['Something went wrong'];
    }
  }

  return { handle, gameClan };
}

module.exports = { create };
