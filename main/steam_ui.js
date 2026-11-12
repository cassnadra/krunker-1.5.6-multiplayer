// The Steam box in the menu, added to the page by preload.js: the code of the Steam lobby you host or are in, to give
// to friends ("joinAddress": "steam:<code>" in their multiplayer.json), Copy, and Invite friends (Steam's own invite
// window; needs "steamOverlay": true). main.js sends the lobby over 'krSteam'.
const { ipcRenderer } = require('electron')

const CSS = `
#krSteam { position: fixed; left: 50%; top: 6px; transform: translateX(-50%); z-index: 9999998; display: none; align-items: center; gap: 10px;
    background: rgba(23,26,33,0.92); padding: 6px 12px; border-radius: 4px; font-size: 17px; pointer-events: auto; white-space: nowrap; }
#krSteam * { color: #c7d5e0; }
#krSteam b { color: #fff; letter-spacing: 1px; }
#krSteam .kBtn { padding: 3px 10px; background: #2a475e; border-radius: 3px; cursor: pointer; }
#krSteam .kBtn:hover { background: #66c0f4; }
#krSteam .kBtn:hover * , #krSteam .kBtn:hover { color: #fff; }
`

module.exports = function () {
    let info = null, box = null
    ipcRenderer.on('krSteam', (e, i) => { info = i; draw() })
    function draw() {
        if (!document.body) return setTimeout(draw, 200)
        if (!box) {
            const style = document.createElement('style')
            style.textContent = CSS
            document.head.appendChild(style)
            box = document.createElement('div')
            box.id = 'krSteam'
            for (const ev of ['mousedown', 'mouseup', 'click']) box.addEventListener(ev, e => e.stopPropagation())
            box.addEventListener('click', e => {
                if (e.target.closest('[data-copy]')) {
                    try { require('electron').clipboard.writeText(info.code) } catch (err) { navigator.clipboard && navigator.clipboard.writeText(info.code) }
                    const b = e.target.closest('[data-copy]')
                    b.textContent = 'Copied!'
                    setTimeout(() => { b.textContent = 'Copy' }, 1200)
                } else if (e.target.closest('[data-invite]')) ipcRenderer.send('krSteamInvite')
            })
            document.body.appendChild(box)
            // only on the menu, not over the game
            setInterval(() => {
                const menu = window.menuHolder && menuHolder.style.display !== 'none'
                box.style.display = info && menu ? 'flex' : 'none'
            }, 300)
        }
        if (info) box.innerHTML = `<span>${info.host ? 'Your Steam lobby' : 'Steam lobby'}</span><b>${info.code}</b>` +
            `<span class='kBtn' data-copy>Copy</span>` + (info.overlay ? `<span class='kBtn' data-invite>Invite friends</span>` : '')
    }
}
