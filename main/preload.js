const msgpack = require('msgpack-lite')
const cfg = require('./mpconfig.js')()
window.LOG = console.log
window.KRUNKER_ONLINE = cfg.mode !== 'offline'
const picked = (process.argv.find(a => a.startsWith('--krunker-server=')) || '').slice('--krunker-server='.length)   // auto mode's pick
const SERVER = picked ? picked : cfg.mode === 'join'
    ? `ws://${cfg.joinAddress.includes(':') ? cfg.joinAddress : cfg.joinAddress + ':' + cfg.port}/`
    : `ws://127.0.0.1:${cfg.port}/`
class HookedWebSocket extends WebSocket {
	constructor(...args){
        let data = [...args]
        data[0] = window.KRUNKER_ONLINE ? SERVER + '?name=' + encodeURIComponent(cfg.name) : "ws://localhost:8080/"
        super(...data)
		this.addEventListener('message', ({ data: packet }) => {
			let [ label, ...data ] = msgpack.decode(new Uint8Array(packet).slice(0, -2))
			if (label !== '1' && label !== '8' && label !== 't') window.LOG('%c <= ','background:#FF6A19;color:#000',[label, ...data])
		});
		window.LOG('-> WebSocket was just hooked: ' + data[0])
	}
};
window.WebSocket = HookedWebSocket;
