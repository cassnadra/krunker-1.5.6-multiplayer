const msgpack = require('msgpack-lite')
const cfg = require('./mpconfig.js')()
window.LOG = console.log
// the start screen can pick offline after multiplayer.json was read: main.js passes the mode it ended up with
const MODE = (process.argv.find(a => a.startsWith('--krunker-mode=')) || '').slice('--krunker-mode='.length) || cfg.mode
window.KRUNKER_ONLINE = MODE !== 'offline'
window.KRUNKER_AFK_KICK = !!cfg.afkKick
const picked = (process.argv.find(a => a.startsWith('--krunker-server=')) || '').slice('--krunker-server='.length)   // auto mode's pick
const NAME = (process.argv.find(a => a.startsWith('--krunker-name=')) || '').slice('--krunker-name='.length) || cfg.name   // main.js: multiplayer.json's or your Steam name
const SERVER = picked ? picked : cfg.mode === 'join'
    ? `ws://${cfg.joinAddress.includes(':') ? cfg.joinAddress : cfg.joinAddress + ':' + cfg.port}/`
    : `ws://127.0.0.1:${cfg.port}/`
class HookedWebSocket extends WebSocket {
	constructor(...args){
        let data = [...args]
        data[0] = window.KRUNKER_ONLINE ? SERVER + '?name=' + encodeURIComponent(NAME) : "ws://localhost:8080/"
        super(...data)
		this.addEventListener('message', ({ data: packet }) => {
			let [ label, ...data ] = msgpack.decode(new Uint8Array(packet).slice(0, -2))
			if (label !== '1' && label !== '8' && label !== 't') window.LOG('%c <= ','background:#FF6A19;color:#000',[label, ...data])
		});
		window.LOG('-> WebSocket was just hooked: ' + data[0])
	}
};
window.WebSocket = HookedWebSocket;
require('./spins_ui.js')()   // open several at once and fast open, on the prize wheel
require('./social_ui.js')()   // the Social panel: profiles, leaderboards, market, clans
require('./steam_ui.js')()   // the Steam lobby code, Copy and Invite friends
