const { app, BrowserWindow, session, protocol, Menu, dialog, ipcMain } = require('electron')
const gameserver = require('./gameserver.js')
const config = require('./mpconfig.js')
const cfg = config()
let mpServer = null   // host mode: the multiplayer server (server/server.js)
// Steam lobbies and P2P (main/steam.js): on unless multiplayer.json has "steam": false, and never in tests
const steam = require('./steam.js')
const STEAM = cfg.steam !== false && !process.env.KRUNKER_TEST && steam.start({ log: m => console.log(m), overlay: !!cfg.steamOverlay })
let steamGame = null   // the Steam lobby this PC hosts or is in: { code, host, invite(), close() }
process.on('uncaughtException', err => {   // don't die silently with no window
    console.error(err)
    dialog.showErrorBox('Krunker', String(err && err.stack || err))
    app.quit()
})
const fs = require('fs')
const path = require('path')
Menu.setApplicationMenu(null)
// tests get their own browser profile (saved login, settings), never the player's
if (process.env.KRUNKER_TEST) app.setPath('userData', path.join(require('os').tmpdir(), 'krunker_test_profile'))

const MAPS={
    burg:0,
    littletown:1,
    sandstorm:2,
    subzero:3,
    kanji:4
} // press F4 ingame to switch between maps

const defaultSelectedMap = MAPS.kanji

app.whenReady().then(() => {
    // The page thinks it's on https://krunker.io: its files come from krunkerio/, its CDN libraries from libs/vendor, the
    // matchmaker gets the canned answers in apireqs/, and anything else on the internet (Google sign-in, PayPal, ads)
    // is "not found" straight away.
    // Every request gets an answer: one left waiting can stall the page's loading for good on newer Electron.
    const ROOT = path.join(__dirname, 'krunkerio')
    const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
        '.jpg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
        '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.obj': 'text/plain', '.gltf': 'model/gltf+json', '.txt': 'text/plain', '.wasm': 'application/wasm' }
    // the libraries index.html loads from CDNs, kept in krunkerio/libs/vendor so the game runs without the internet
    const VENDOR = {
        'code.jquery.com/jquery-3.2.1.min.js': 'jquery-3.2.1.min.js', 'code.jquery.com/ui/1.12.1/jquery-ui.js': 'jquery-ui-1.12.1.js',
        'cdnjs.cloudflare.com/ajax/libs/howler/2.0.9/howler.min.js': 'howler-2.0.9.min.js',
        'cdnjs.cloudflare.com/ajax/libs/tween.js/16.3.5/Tween.min.js': 'tween-16.3.5.min.js',
        'www.google.com/recaptcha/api.js': 'recaptcha-stub.js',   // calls captchaCallback, which starts the connection
    }
    const file = f => ({ data: fs.readFileSync(f), mimeType: TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream' })
    protocol.interceptBufferProtocol('https', (request, result) => {
        let u
        try { u = new URL(request.url) } catch (e) { return result({ error: -6 }) }
        const vendored = VENDOR[u.hostname + u.pathname]
        if (vendored) return result(file(path.join(ROOT, 'libs', 'vendor', vendored)))
        if (u.hostname === 'krunker.io') {
            const f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname))
            if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) return result(file(f))
            // the region ping (krunker.io/ping) a new player's game does before it looks for a game
            if (u.pathname.includes('ping')) return result(file(path.join(__dirname, 'apireqs/ping.json')))
        } else if (u.hostname.endsWith('krunker.io')) {   // matchmaker.krunker.io and its ping
            if (u.pathname.includes('ping')) return result(file(path.join(__dirname, 'apireqs/ping.json')))
            if (u.hostname.includes('matchmaker')) { console.log('-> Caught matchmaker'); return result(file(path.join(__dirname, 'apireqs/matchmakerSeekgame.json'))) }
        }
        if (TEST) console.log('[net] not found:', request.url)
        result({ error: -6 })   // net::ERR_FILE_NOT_FOUND
    })

    if (cfg.mode === 'auto') TEST && !process.env.KRUNKER_LAUNCHER ? autoStart() : launcher()   // KRUNKER_LAUNCHER: test the start screen
    else if (cfg.mode === 'host') host()
    else if (cfg.mode === 'join' && /^steam:/i.test(cfg.joinAddress)) {   // "joinAddress": "steam:<lobby code>"
        if (STEAM) joinSteam(cfg.joinAddress)
        else { dialog.showErrorBox('Krunker - Steam', 'Steam is not running (or "steam" is false in multiplayer.json).'); app.quit() }
    }
    else if (cfg.mode === 'join') createWindow()
    else gameserver(defaultSelectedMap, createWindow)

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// the game modes (the game's own list, bundle module 0x27), for the start screen and matchmaking
const MODES = ['Free for All', 'Team Deathmatch', 'Hardpoint', 'Capture the Flag', 'Parkour', 'Hide & Seek', 'Infected', 'Race',
    'Last Man Standing', 'Simon Says', 'Gun Game']
const MATCH_SIZE = 8   // matchmaking fills games up to this many players

// host a game here (opts: map name, mode index); other players join over the LAN, Tailscale or Steam
function host(opts = {}) {
    const { start, MAPS: SMAPS } = require('../server/server.js')
    const map = SMAPS[String(opts.map || cfg.map).toLowerCase()]
    serverUrl = null   // our own: preload uses 127.0.0.1
    mpServer = start({
        port: cfg.port, map: map == null ? undefined : map, mode: Number(opts.mode) || 0, lan: !TEST,   // tests stay off the LAN
        name: playerName() + "'s game", onReady: () => { createWindow(); steamHost() },
        // the port is taken - most likely a server.bat already running here: play on that one
        onError: err => { console.log('[server]', err.code || err.message, '- joining the server already on port ' + cfg.port); mpServer = null; createWindow() }
    })
}

// the hosted game also gets a Steam lobby, kept up to date with the player count and map
function steamHost() {
    if (!STEAM || !mpServer) return
    const info = () => ({ players: mpServer.clients.size, map: mpServer.game.map.maps[mpServer.game.mapIndex].name, mode: mpServer.game.mode.name,
        mi: mpServer.game.modeIndex, max: MATCH_SIZE })
    steam.host(Object.assign({ port: cfg.port, name: playerName() + "'s game" }, info())).then(g => {
        steamGame = g
        sendSteam()
        setInterval(() => mpServer && g.update(info()), 10000)
    }).catch(e => console.log('steam: no lobby -', e.message))
}

// join a Steam lobby by its code: the game connects to the local end of the P2P bridge; true when it worked
async function joinSteam(code, onFail) {
    try {
        const g = await steam.join(code)
        if (steamGame) steamGame.close()
        steamGame = g
        serverUrl = g.url
    } catch (e) {
        if (onFail) { onFail("Couldn't join that game: " + e.message); return false }
        dialog.showErrorBox('Krunker - Steam', "Couldn't join that Steam game: " + e.message)
        app.quit()
        return false
    }
    createWindow()
    return true
}

// matchmaking, all player-hosted: the fullest Steam game in this mode that has room, or else host one (others then
// find it the same way). Without Steam it just hosts, for the LAN.
async function matchmake(mode, map) {
    if (STEAM) {
        const games = (await steam.find().catch(() => [])).filter(g => g.mi === mode && g.players < g.max)
            .sort((a, b) => b.players - a.players)
        for (const g of games.slice(0, 5)) if (await joinSteam(g.code, msg => console.log('matchmaking:', msg))) return
    }
    host({ mode, map })
}

// the start screen (main/launcher.html), for "auto": your name, host, join a friend's code, the games found, offline
let launcherWindow = null
function launcher() {
    const w = launcherWindow = new BrowserWindow({
        width: 860, height: 700, resizable: false, title: 'Krunker', icon: path.join(__dirname, 'krunkerio/favicon.ico'), show: !TEST,
        backgroundColor: '#16161d', webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false },
    })
    w.loadFile(path.join(__dirname, 'launcher.html'))
    const send = info => !w.isDestroyed() && w.webContents.send('krLauncher', info)
    const discovery = require('../server/discovery.js')
    let searching = true
    async function search() {   // the LAN and Steam, every few seconds while it's open
        while (searching && !w.isDestroyed()) {
            const [lan, onSteam] = await Promise.all([
                discovery.scan(1500).catch(() => []),
                STEAM ? steam.find().catch(() => []) : [],
            ])
            const games = [
                ...lan.map(s => ({ steam: false, name: s.name, map: s.map, mode: s.mode, players: s.players, target: s.address + (s.port == 8080 ? '' : ':' + s.port) })),
                ...onSteam.map(s => ({ steam: true, name: s.name, map: s.map, mode: s.mode, players: s.players, target: s.code })),
            ].sort((a, b) => b.players - a.players)
            send({ games })
            await new Promise(r => setTimeout(r, 2500))
        }
    }
    ipcMain.removeAllListeners('krLauncherReady')
    ipcMain.on('krLauncherReady', () => {
        send({ name: playerName(), map: String(cfg.map).toLowerCase(), modes: MODES, mode: Number(cfg.gameMode) || 0, steam: STEAM ? steam.name() : false })
        search()
    })
    ipcMain.removeAllListeners('krLaunch')
    ipcMain.on('krLaunch', async (e, { action, name, map, mode, target }) => {
        name = String(name || '').replace(/[^\w \-.[\]]/g, '').trim().slice(0, 16)
        if (name) { cfg.name = name; config.save({ name }) }
        if (map) { cfg.map = map; config.save({ map }) }
        mode = Number(mode) || 0
        if (action === 'play' || action === 'host') { cfg.gameMode = mode; config.save({ gameMode: mode }) }
        const done = () => { searching = false; if (!w.isDestroyed()) w.destroy(); launcherWindow = null }
        const fail = msg => send({ error: msg })
        if (action === 'host') { host({ mode, map }); return done() }
        if (action === 'play') { send({ status: 'Looking for a game...' }); await matchmake(mode, map); return done() }
        if (action === 'offline') { cfg.mode = 'offline'; gameserver(defaultSelectedMap, createWindow); return done() }
        // join: a Steam lobby code, or an address (LAN, Tailscale, port forwarding)
        target = String(target || '').trim()
        const address = target.replace(/^ws:\/\//i, '').replace(/\/$/, '')
        if (/[.:]/.test(address) || /^localhost$/i.test(address)) {
            const hasPort = /^[^:]+:\d+$/.test(address) || /^\[.*\]:\d+$/.test(address)   // "1.2.3.4:8080", "[::1]:8080"
            const url = `ws://${hasPort ? address : address + ':' + cfg.port}/`
            if (!(await reachable(url))) return fail(`Nobody is hosting at ${address}. Check it with your friend.`)
            serverUrl = url
            createWindow()
            return done()
        }
        if (!STEAM) return fail("Steam isn't running, so codes don't work. Open Steam and restart the game.")
        joinSteam(target, fail).then(() => { if (BrowserWindow.getAllWindows().length > 1) done() })
    })
    w.on('closed', () => { searching = false; launcherWindow = null })
}

// is a game server answering at this address? (a quick WebSocket connect)
function reachable(url) {
    return new Promise(res => {
        const WebSocket = require('ws')
        const ws = new WebSocket(url + '?name=probe', { handshakeTimeout: 4000 })
        const end = ok => { try { ws.terminate() } catch (e) { } res(ok) }
        ws.on('open', () => end(true))
        ws.on('error', () => end(false))
        setTimeout(() => end(false), 5000)
    })
}

// "auto": like LAN worlds in Minecraft - look for games on the network and in Steam, pick one, or host your own
let serverUrl = null
async function autoStart() {
    const [lan, onSteam] = await Promise.all([
        require('../server/discovery.js').scan(TEST ? 1000 : 1500),
        STEAM ? steam.find().catch(e => (console.log('steam: no lobby list -', e.message), [])) : [],
    ])
    const found = [...lan.map(s => Object.assign({ steam: false }, s)), ...onSteam.map(s => Object.assign({ steam: true }, s))]
        .sort((a, b) => (b.players || 0) - (a.players || 0))
    console.log('[lan] found', JSON.stringify(found))
    if (!found.length) return host()
    let pick = found.findIndex(s => !s.steam)
    if (pick < 0) pick = 0
    if (!TEST) {
        const label = s => s.steam ? `[Steam] ${s.name} - ${s.map}, ${s.players} playing`
            : `${s.name} - ${s.map}, ${s.players} playing  (${s.address}${s.port == 8080 ? '' : ':' + s.port})`
        const buttons = [...found.slice(0, 8).map(label), 'Host my own game', 'Quit']
        pick = (await dialog.showMessageBox({
            type: 'question', title: 'Krunker - games', message: 'Games on your network' + (STEAM ? ' and on Steam:' : ':'),
            buttons, cancelId: buttons.length - 1, noLink: true, defaultId: 0
        })).response
        if (pick === buttons.length - 1) return app.quit()
        if (pick === buttons.length - 2) return host()
    }
    if (found[pick].steam) return joinSteam(found[pick].code, host)
    serverUrl = `ws://${found[pick].address}:${found[pick].port}/`
    createWindow()
}

// your name: multiplayer.json's, or your Steam name if you left it at "Player"
const playerName = () => (cfg.name === 'Player' && STEAM && steam.name()) || cfg.name

// the page's Steam box (main/steam_ui.js): the lobby code, Copy and Invite
function sendSteam() {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('krSteam', steamGame ? { code: steamGame.code, host: steamGame.host, overlay: !!cfg.steamOverlay } : null)
}
ipcMain.on('krSteamInvite', () => steamGame && steamGame.invite())

// a friend's invite accepted, or "Join Game" clicked on a friend in Steam, while the game is open: go to their game
if (STEAM) steam.onJoinRequest(async code => {
    const old = BrowserWindow.getAllWindows()
    if (mpServer) { mpServer.close(); mpServer = null }
    await joinSteam(code, msg => dialog.showErrorBox('Krunker - Steam', msg))
    if (BrowserWindow.getAllWindows().length > old.length) old.forEach(w => w.destroy())   // the new window is up
})

// KRUNKER_TEST=1: tests - a hidden window, the page's console in this terminal, and it enters the game by itself
const TEST = !!process.env.KRUNKER_TEST

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1100,
        height: 700,
        show: !TEST,
        icon: path.join(__dirname, 'krunkerio/favicon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            // the preload (preload.js, spins_ui.js, social_ui.js) works on the game's own window and loads modules:
            // Electron 10's defaults, which newer Electron no longer has
            contextIsolation: false,
            sandbox: false,
            additionalArguments: [...(serverUrl ? ['--krunker-server=' + serverUrl] : []), '--krunker-name=' + playerName(), '--krunker-mode=' + cfg.mode],
            // the page is served as https://krunker.io; this lets it reach ws:// servers on other PCs (mixed content)
            allowRunningInsecureContent: true,
            backgroundThrottling: !TEST
        }
    })
    mainWindow.loadURL('https://krunker.io/')
    mainWindow.webContents.on('did-finish-load', () => sendSteam())
    if (TEST) {
        mainWindow.webContents.on('console-message', (e, level, msg) => console.log('[page]', msg.slice(0, 300)))
        let tries = 0
        const enter = setInterval(() => {
            mainWindow.webContents.executeJavaScript("window.game && game.players.list.some(p => p.isYou && p.active) ? 1 : (typeof enterGame == 'function' && enterGame(), 0)")
                .then(ok => { if (ok || ++tries > 90) clearInterval(enter) }).catch(() => { })
        }, 1000)
        setInterval(() => mainWindow.webContents.executeJavaScript(
            "JSON.stringify((window.game && game.players.list || []).map(p => [p.sid, p.name, p.isYou ? 'me' : '', p.active, Math.round(p.x), Math.round(p.y), Math.round(p.z), p.health]))")
            .then(s => console.log('[state]', s)).catch(() => { }), 3000)
        // hold W, then A, for a few seconds each once spawned: the server must move you the same way the client predicts
        setTimeout(() => {
            const key = (code, down) => mainWindow.webContents.executeJavaScript(`game.controls.keys[${code}] = ${down ? 1 : 0}; game.controls.updateMoveDir()`).catch(() => { })
            key(87, 1); setTimeout(() => { key(87, 0); key(65, 1) }, 4000); setTimeout(() => key(65, 0), 7000)
        }, 22000)
        if (mpServer) setInterval(() => console.log('[server-state]', JSON.stringify(mpServer.game.players.list.map(p => [p.sid, p.name, Math.round(p.x), Math.round(p.y), Math.round(p.z)]))), 3000)
        const secs = Number(process.env.KRUNKER_TEST)
        if (secs > 1) setTimeout(() => app.quit(), secs * 1000)
    }
    mainWindow.webContents.on('before-input-event', (e, f) => {
        switch (f.key){
            case "Escape":
                e.preventDefault()
                mainWindow.webContents.executeJavaScript("document.exitPointerLock(); window.__krEsc && __krEsc()")   // __krEsc: closes the Social panel
                break
            case "F11":
                mainWindow.setFullScreen(!mainWindow.isFullScreen())
                e.preventDefault()
                break 
            case "F9":
                mainWindow.webContents.openDevTools()
                e.preventDefault()
                break
            case "F4":
                e.preventDefault()
                if (mpServer) mpServer.changeMap()
                else if (cfg.mode !== 'join') gameserver.resetMap()
        }
    })
}


app.on('before-quit', () => { if (mpServer) mpServer.close(); if (steamGame) steamGame.close() })   // writes accounts.json

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})