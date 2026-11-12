// multiplayer.json next to package.json:
//   mode: "auto" (find a game on the LAN, or host one if there's none), "host" (run the server here and play on it),
//         "join" (play on joinAddress) or "offline" (the old single-player stub)
//   name: your name in game; port: the server's port; map (host): burg, littletown, sandstorm, subzero or kanji
const fs = require('fs')
const path = require('path')

const FILE = path.join(__dirname, '..', 'multiplayer.json')
const DEFAULTS = { mode: 'auto', name: 'Player', joinAddress: '127.0.0.1', port: 8080, map: 'kanji' }

module.exports = function readConfig() {
    let cfg = {}
    try { cfg = JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch (e) { }
    cfg = Object.assign({}, DEFAULTS, cfg)
    // KRUNKER_MODE / KRUNKER_JOIN / KRUNKER_NAME override the file (two copies on one PC for testing)
    if (process.env.KRUNKER_MODE) cfg.mode = process.env.KRUNKER_MODE
    if (process.env.KRUNKER_JOIN) { cfg.mode = 'join'; cfg.joinAddress = process.env.KRUNKER_JOIN }
    if (process.env.KRUNKER_NAME) cfg.name = process.env.KRUNKER_NAME
    cfg.mode = String(cfg.mode).toLowerCase()
    return cfg
}
