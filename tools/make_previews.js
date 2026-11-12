// Renders the skin previews the menus show (textures/previews/...), which the real game downloaded from its server.
// Each item is drawn from its own 3D model and texture with the game's renderer, like the prize wheel's reveal.
//   make_previews.bat            only the missing ones
//   make_previews.bat --all      redo all of them
// Runs hidden, on its own port, without the LAN and with a throwaway accounts file.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'main', 'krunkerio', 'textures', 'previews');
const ALL = process.argv.includes('--all');

process.env.KRUNKER_TEST = '1';
process.env.KRUNKER_MODE = 'host';
process.env.KRUNKER_PORT = '8096';
process.env.KRUNKER_ACCOUNTS = path.join(os.tmpdir(), 'krunker_previews_accounts.json');
require(path.join(ROOT, 'server', 'discovery.js')).answer = () => ({ close() { } });
const { app, BrowserWindow } = require('electron');
require(path.join(ROOT, 'main', 'main.js'));

// in the page: the list of items and where their previews go, and one item -> a PNG data URL
const PAGE = String.raw`
window.__prev = {
  list() {
    const { game, utils } = __kr, store = game.store, items = [];
    const rel = u => u.replace(/^\.?\/textures\/previews\//, '').replace(/\?.*$/, '').replace(/\.png$/, '');
    store.skins.forEach((s, i) => {
      const paths = new Set([rel(utils.getPreview(s, store))]);
      if (!s.type) paths.add('weapons/weapon_' + s.weapon + '_' + (s.pat == null ? s.id : 'c' + s.pat));
      items.push({ skin: i, paths: [...paths] });
    });
    game.weapons.forEach((w, i) => w.src && items.push({ weapon: i, paths: ['weapons/' + w.src] }));
    return items;
  },
  async shot(item) {
    const { THREE, rend, game } = __kr, store = game.store;
    let spec, pv;
    if (item.skin != null) {
      const s = store.skins[item.skin];
      pv = s.type ? s : store.previews[s.weapon] || {};
      spec = {
        src: store.types[s.type || 0] + (s.type ? s.id : s.weapon),
        texSrc: s.type && s.type == 3 ? 'melee/melee_' + (s.id || 0) + (s.tex ? '_' + s.tex : '')
          : s.type ? (s.tex ? (s.type == 1 ? 'hats/hat_' : 'body/body_') + s.id + '_' + s.tex : null)
          : s.tex ? s.tex : 'weapons/skins/weapon_' + s.weapon + '_' + s.id,
        movT: s.movT, sameGlow: s.sameGlow, glowText: s.glow || s.sameGlow, emissive: s.glow || s.sameGlow ? 0xffffff : null,
        rot: (s.type && s.type != 3 ? Math.PI : Math.PI / 2) + (pv.xRot || 0),
      };
    } else {
      pv = store.previews[item.weapon + 1] || {};
      spec = { src: 'weapons/' + game.weapons[item.weapon].src, rot: Math.PI / 2 + (pv.xRot || 0) };
    }
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0x8f8f8f));
    const light = new THREE.DirectionalLight(0xffffff, 0.6);
    light.position.set(3, 1, 0);
    scene.add(light);
    const obj = rend.genObj3D(0, 0, 0);
    obj.rotateX(-Math.PI / 7); obj.rotateY(Math.PI + 0.5 + (pv.zRota || 0)); obj.rotateZ(-0.5);
    const mesh = rend.loadMesh(Object.assign({ noGreen: true, uv2: true, fillScale: 60, centerZ: true }, spec),
      0, 0, 0, spec.rot, 2.2 * (pv.scl || 1), obj);
    scene.add(obj);
    // wait for the model and its texture (a missing texture: give up after 5 s and draw it untextured)
    const t0 = performance.now();
    const ready = () => {
      const g = mesh.geometry, mats = [].concat(mesh.material);
      // the game sets the material's map only once the texture has loaded
      return g.attributes && g.attributes.position && mats.every(m => m.map && m.map.image && m.map.image.complete);
    };
    while (!ready() && performance.now() - t0 < 5000) await new Promise(r => setTimeout(r, 30));
    if (!(mesh.geometry.attributes && mesh.geometry.attributes.position)) return null;
    // frame it: the reveal's camera angle, pulled back until the item fits
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj), center = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    const dir = new THREE.Vector3(30, 10, 0).normalize();
    const place = dist => {   // some models are in the thousands of units: near and far follow the size
      cam.position.copy(center).addScaledVector(dir, dist); cam.lookAt(center);
      cam.near = dist / 100; cam.far = dist + radius * 4; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    };
    // the bounding sphere leaves a long gun tiny: move in until the box's corners reach 90% of the frame
    let dist = radius / Math.sin(Math.PI / 12);
    place(dist);
    const corners = [];
    for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    for (let k = 0; k < 40; k++) {
      const extent = Math.max(...corners.map(c => { const v = c.clone().project(cam); return Math.max(Math.abs(v.x), Math.abs(v.y)); }));
      if (extent > 0.9 || dist < radius * 0.5) break;
      dist *= 0.95;
      place(dist);
    }
    if (!this.r) {
      this.r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      this.r.setPixelRatio(1);
      this.r.setSize(256, 256);
    }
    this.r.setClearColor(0, 0);
    this.r.render(scene, cam);
    return this.r.domElement.toDataURL('image/png');
  },
};
'ok'`;

app.whenReady().then(() => {
  const wait = setInterval(async () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (!w) return;
    clearInterval(wait);
    w.webContents.setAudioMuted(true);
    const run = code => w.webContents.executeJavaScript(code);
    while (!(await run('!!(window.__kr && __kr.game && __kr.game.store)').catch(() => false))) await new Promise(r => setTimeout(r, 500));
    await run(PAGE);
    const items = (await run('__prev.list()')).filter(it => ALL || it.paths.some(p => !fs.existsSync(path.join(OUT, p + '.png'))));
    console.log(`${items.length} previews to render`);
    let done = 0, failed = [];
    for (const it of items) {
      const url = await run(`__prev.shot(${JSON.stringify(it)})`).catch(e => (console.log(e.message), null));
      if (!url) { failed.push(it.paths[0]); continue; }
      const png = Buffer.from(url.split(',')[1], 'base64');
      for (const p of it.paths) {
        fs.mkdirSync(path.dirname(path.join(OUT, p)), { recursive: true });
        fs.writeFileSync(path.join(OUT, p + '.png'), png);
      }
      if (++done % 50 === 0) console.log(done + ' done');
    }
    // the "none" cards for hats and backs: an empty picture instead of a broken one
    for (const t of [1, 2, 3]) {
      const f = path.join(OUT, 'cosmetics', t + '_default.png');
      if (!fs.existsSync(f)) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==', 'base64')); }
    }
    console.log(`${done} rendered` + (failed.length ? `, ${failed.length} failed: ${failed.slice(0, 10).join(', ')}` : ''));
    app.quit();
  }, 200);
});
