// Loads the game client's webpack bundle in Node without running the browser entry point, so the server can use the
// game's own shared code: the Game object, the player manager (movement, collision, shooting, kills) and the maps.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GAME_JS = path.join(__dirname, '..', 'main', 'krunkerio', 'js', 'game.D28pq.js');

// an object that answers anything: browser APIs the shared code touches but the server doesn't need
function stub(name) {
  const f = function () { return stub(name + '()'); };
  return new Proxy(f, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (k === 'toString' || k === 'valueOf') return () => '';
      if (k === 'then') return undefined;   // not a promise
      if (k === 'length') return 0;
      if (!(k in t)) t[k] = stub(name + '.' + String(k));
      return t[k];
    },
    construct() { return stub('new ' + name); },
  });
}

function load() {
  let src = fs.readFileSync(GAME_JS, 'utf8');
  const entry = "e(e['s'] = 0x6b);";
  if (!src.includes(entry)) throw new Error('webpack entry not found in game.js');
  src = src.replace(entry, 'globalThis.__wreq = e;');
  src = src.replace('window.game = this', 'void 0');   // the offline build's debug hook

  const storage = new Map();
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, Buffer,
    performance: { now: () => Number(process.hrtime.bigint()) / 1e6 },
    navigator: { userAgent: 'node', platform: 'node', language: 'en' },
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k),
    },
    Image: function () { return stub('Image'); },
    Audio: function () { return stub('Audio'); },
    XMLHttpRequest: function () { return stub('XMLHttpRequest'); },
    WebSocket: function () { return stub('WebSocket'); },
    Howler: stub('Howler'), Howl: function () { return stub('Howl'); },
    TWEEN: stub('TWEEN'),
    requestAnimationFrame: () => 0,
    TextDecoder, TextEncoder, URL, URLSearchParams,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'game.js' });
  const wreq = sandbox.__wreq;
  wreq.m[0xe] = m => { m.exports = process; };   // webpack's browser 'process' shim -> the real one: the game's isNode
  return { req: id => wreq(id), sandbox, modules: wreq.m };
}

module.exports = { load, stub };
