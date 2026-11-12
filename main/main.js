const { app, BrowserWindow, session, protocol, Menu, dialog } = require('electron')
const gameserver = require('./gameserver.js')
const cfg = require('./mpconfig.js')()
let mpServer = null   // host mode: the multiplayer server (server/server.js)
process.on('uncaughtException', err => {   // don't die silently with no window
    console.error(err)
    dialog.showErrorBox('Krunker', String(err && err.stack || err))
    app.quit()
})
const fs = require('fs')
const path = require('path')
Menu.setApplicationMenu(null)

const MAPS={
    burg:0,
    littletown:1,
    sandstorm:2,
    subzero:3,
    kanji:4
} // press F4 ingame to switch between maps

const defaultSelectedMap = MAPS.kanji

app.whenReady().then(() => {
    protocol.interceptBufferProtocol("https", (request, result) => {
        if(request.url === "https://krunker.io/"){
            let data = fs.readFileSync(path.join(__dirname, 'krunkerio/index.html'))
            result(Buffer.from(data.toString()))
            return 
        } else if(request.url.includes('main.css')){
            let data = fs.readFileSync(path.join(__dirname, 'krunkerio/css/main.css'))
            result(Buffer.from(data.toString()))
            return 
        } else if(request.url.includes('material_icons.css')){
            let data = fs.readFileSync(path.join(__dirname, 'krunkerio/css/material_icons.css'))
            result(Buffer.from(data.toString()))
            return 
        }
        protocol.uninterceptProtocol('https')
        console.log(request.url)
    })
    protocol.interceptFileProtocol('krnk', (details,callback)=>{

        let filepath = details.url.replace('krnk://',(__dirname).replaceAll('\\',"/")+"/krunkerio/")

        if(filepath.includes('?')){
            filepath = filepath.substring(0, filepath.indexOf('?'))
        }
        if(fs.existsSync(filepath)){
            callback(filepath)
            return
        }
        if(filepath.includes("matchmaker.krunker.io")){
            console.log('-> Caught matchmaker')
            callback(path.join(__dirname, 'apireqs/matchmakerSeekgame.json'))
            return
        }
        if(filepath.includes('ping')){
           callback(path.join(__dirname, 'apireqs/ping.json'))
           return
        }
        callback()
    })
    session.defaultSession.webRequest.onBeforeRequest((request,callback)=>{
        if(request.url.replaceAll('/','') === "https:krunker.io"){return}
        if(request.url.startsWith('https://krunker.io/')){
            let urlpath = request.url.replace('https://krunker.io/','')
            if(urlpath.startsWith('/')){urlpath=urlpath.replace('/','')}
            callback({redirectURL:'krnk://'+urlpath})
            return
        }
        if(request.url.includes('matchmaker')){
            callback({redirectURL:'krnk://matchmaker.krunker.io'})
            return
        }

        callback(request)
    })

    if (cfg.mode === 'host') {
        const { start, MAPS: SMAPS } = require('../server/server.js')
        const map = SMAPS[String(cfg.map).toLowerCase()]
        mpServer = start({
            port: cfg.port, map: map == null ? undefined : map, onReady: createWindow,
            // the port is taken - most likely a server.bat already running here: play on that one
            onError: err => { console.log('[server]', err.code || err.message, '- joining the server already on port ' + cfg.port); mpServer = null; createWindow() }
        })
    } else if (cfg.mode === 'join') {
        createWindow()
    } else {
        gameserver(defaultSelectedMap, createWindow)
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
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
            backgroundThrottling: !TEST
        }
    })
    mainWindow.loadURL('https://krunker.io/')
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
                mainWindow.webContents.executeJavaScript("document.exitPointerLock()")
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


app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})