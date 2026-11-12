// The Social panel, added to the page by preload.js: profiles, leaderboards, the market (with gifts) and clans.
// The real game opened krunker.io/social.html, which isn't in this copy: every link or window.open to social.html
// opens this panel instead. It asks the server over the game socket: 'soc', id, action, args -> 'socR' (server/social.js).
// The rainbow text for Contraband (.krRainbow) comes from spins_ui.js.

const CSS = `
#krSocial { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 10000000;   /* above the game UI (#gameNameHolder is 9999999) */ background: rgba(12,12,18,0.99); color: #fff;
    pointer-events: auto; display: flex; flex-direction: column; font-size: 18px; }
#krSocial * { color: inherit; }   /* the game's CSS gives every element (*) dark grey text */
#krSocial a { color: #8fd0ff; cursor: pointer; text-decoration: none; }
#krSocial a:hover { text-decoration: underline; }
#krSocial .sTop { display: flex; align-items: center; gap: 6px; padding: 14px 24px; background: rgba(255,255,255,0.05); flex-wrap: wrap; }
#krSocial .sTab { padding: 8px 18px; font-size: 22px; cursor: pointer; border-radius: 4px; background: rgba(255,255,255,0.06); }
#krSocial .sTab.on { background: #F44336; }
#krSocial .sTab:hover:not(.on) { background: rgba(255,255,255,0.14); }
#krSocial .sGrow { flex: 1; }
#krSocial input, #krSocial select { font: inherit; font-size: 17px; padding: 6px 10px; border: none; border-radius: 4px; background: #fff; color: #222; }
#krSocial .sClose { font-size: 28px; padding: 2px 14px; cursor: pointer; }
#krSocial .sBody { flex: 1; overflow-y: auto; padding: 20px 28px 60px; }
#krSocial .sWrap { max-width: 1250px; margin: 0 auto; }
#krSocial h1 { font-size: 40px; margin: 0 0 4px; font-weight: normal; }
#krSocial h2 { font-size: 26px; margin: 26px 0 10px; font-weight: normal; }
#krSocial .sSub { color: rgba(255,255,255,0.55); }
#krSocial .sDot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #4caf50; margin-left: 8px; }
#krSocial .sStats { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; margin-top: 16px; }
#krSocial .sStat { background: rgba(255,255,255,0.06); padding: 10px 14px; border-radius: 4px; }
#krSocial .sStat b { display: block; font-size: 26px; font-weight: normal; }
#krSocial .sStat span { color: rgba(255,255,255,0.5); font-size: 15px; }
#krSocial .sBtn { display: inline-block; padding: 6px 16px; background: #F44336; border-radius: 4px; cursor: pointer; font-size: 17px; }
#krSocial .sBtn.blue { background: #2196F3; }
#krSocial .sBtn.grey { background: rgba(255,255,255,0.15); }
#krSocial .sBtn.green { background: #43a047; }
#krSocial .sBtn:hover { filter: brightness(1.15); }
#krSocial .sFilters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 10px 0 14px; }
#krSocial .sChip { padding: 4px 12px; border-radius: 14px; background: rgba(255,255,255,0.08); cursor: pointer; font-size: 16px; }
#krSocial .sChip.on { background: #2196F3; }
#krSocial .sGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 12px; }
#krSocial .sCard { background: rgba(255,255,255,0.06); border-bottom: 4px solid; padding: 8px 8px 10px; text-align: center; position: relative; font-size: 15px; }
#krSocial .sCard img { width: 120px; height: 120px; object-fit: contain; display: block; margin: 0 auto 4px; }
#krSocial .sCard .sCnt { position: absolute; top: 6px; right: 8px; color: #fff; font-size: 15px; }
#krSocial .sCard .sName { min-height: 36px; line-height: 18px; }
#krSocial .sCard .sPrice { font-size: 20px; color: #ffd54f; margin: 4px 0; }
#krSocial .sCard .sBtns { display: flex; gap: 6px; justify-content: center; margin-top: 6px; }
#krSocial .sCard .sBtn { font-size: 15px; padding: 4px 10px; }
#krSocial .sCard.contra { animation: krRainbowGlow 2s linear infinite; }
#krSocial table { width: 100%; border-collapse: collapse; }
#krSocial td, #krSocial th { padding: 8px 10px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.07); font-weight: normal; }
#krSocial th { color: rgba(255,255,255,0.5); font-size: 15px; }
#krSocial td.num, #krSocial th.num { text-align: right; }
#krSocial tr.me td { background: rgba(33,150,243,0.15); }
#krSocial .sLvl { width: 26px; height: 26px; vertical-align: middle; margin-right: 6px; image-rendering: pixelated; }
#krSocial .sTag { color: #ffd54f; margin-left: 6px; }
#krSocial .sModal { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2; }
#krSocial .sModal > div { background: #23232d; padding: 24px 28px; border-radius: 6px; min-width: 380px; text-align: center; }
#krSocial .sModal img { width: 140px; height: 140px; object-fit: contain; }
#krSocial .sModal input { width: 220px; margin: 12px 0; text-align: center; }
#krSocial .sToast { position: fixed; left: 50%; bottom: 30px; transform: translateX(-50%); background: #2196F3; padding: 10px 22px; border-radius: 4px;
    font-size: 19px; z-index: 3; transition: opacity .3s; }
#krSocial .sToast.err { background: #e53935; }
#krSocial .sEmpty { color: rgba(255,255,255,0.4); padding: 20px 0; }
`

const TABS = [['profile', 'Profile'], ['leaderboard', 'Leaderboards'], ['market', 'Market'], ['clans', 'Clans']]
const BOARDS = [['level', 'Level'], ['kills', 'Kills'], ['wins', 'Wins'], ['kd', 'K/D'], ['timePlayed', 'Time played'],
    ['items', 'Items'], ['contrabands', 'Contrabands'], ['clans', 'Clans']]
const TYPES = [[null, 'All'], [0, 'Weapons'], [1, 'Hats'], [2, 'Backs'], [3, 'Melee']]

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const num = n => Number(n || 0).toLocaleString('en-US')
const time = ms => { const m = Math.floor((ms || 0) / 60000); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm' }

function init() {
    const kr = window.__kr, store = kr.game.store
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)

    // requests to the server
    let nextId = 1
    const pending = new Map()
    window.__krSocR = (id, err, data) => {
        const p = pending.get(id)
        if (!p) return
        pending.delete(id)
        clearTimeout(p.timer)
        err ? p.reject(new Error(err)) : p.resolve(data)
    }
    function ask(action, args) {
        return new Promise((resolve, reject) => {
            const net = kr.net()
            if (!net || !net.connected) return reject(new Error('Not connected to a server'))
            const id = nextId++
            pending.set(id, { resolve, reject, timer: setTimeout(() => { pending.delete(id); reject(new Error('The server did not answer')) }, 8000) })
            net.send('soc', id, action, args || {})
        })
    }

    const me = () => kr.acct()
    function shown(r) {   // a rarity's colour, readable on the dark panel
        const rar = store.rarities[r]
        if (!rar) return '#fff'
        const v = parseInt(rar.color.slice(1), 16)
        return (0.299 * (v >> 16) + 0.587 * (v >> 8 & 255) + 0.114 * (v & 255)) / 255 < 0.3 ? '#c8c8c8' : rar.color
    }
    const itemName = (s, r) => r >= 5 ? `<span class='krRainbow'>${esc(s.name)}</span>` : esc(s.name)
    const lvlIcon = l => `<img class='sLvl' src='/img/levels/${kr.utils.levelIconId(l)}.png'>`
    const player = n => `<a data-go='profile' data-q='${esc(n)}'>${esc(n)}</a>`
    const clanLink = t => t ? `<a class='sTag' data-go='clan' data-q='${esc(t)}'>[${esc(t)}]</a>` : ''

    // the panel
    let root = null, body = null, tab = 'profile'
    const state = { board: 'level', type: null, market: { sort: 'new', rarity: '', search: '', mine: false } }
    function open(view, q) {
        if (!root) build()
        root.style.display = 'flex'
        try { document.exitPointerLock() } catch (e) { }
        go(view || (me() ? 'profile' : 'leaderboard'), q)
    }
    function close() { if (root) root.style.display = 'none' }
    window.__krEsc = () => { if (root && root.style.display !== 'none') { const m = root.querySelector('.sModal'); m ? m.remove() : close() } }
    window.openSocial = open

    function build() {
        root = document.createElement('div')
        root.id = 'krSocial'
        root.innerHTML = `<div class='sTop'>${TABS.map(([k, n]) => `<div class='sTab' data-tab='${k}'>${n}</div>`).join('')}
            <div class='sGrow'></div><input class='sFind' placeholder='Find a player' list='krSocFind'><datalist id='krSocFind'></datalist>
            <div class='sClose' title='Close (Esc)'>✕</div></div><div class='sBody'><div class='sWrap'></div></div>`
        document.body.appendChild(root)
        body = root.querySelector('.sWrap')
        // keep the game from seeing clicks and keys meant for the panel
        for (const ev of ['mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'keypress', 'wheel']) root.addEventListener(ev, e => e.stopPropagation())
        root.addEventListener('click', e => {
            const t = e.target
            if (t.closest('.sClose')) return close()
            const tabEl = t.closest('[data-tab]')
            if (tabEl) return go(tabEl.dataset.tab)
            const link = t.closest('[data-go]')
            if (link) return go(link.dataset.go, link.dataset.q)
            const act = t.closest('[data-act]')
            if (act) return action(act.dataset.act, act.dataset)
        })
        const find = root.querySelector('.sFind'), list = root.querySelector('#krSocFind')
        let findTimer = null
        find.addEventListener('input', () => {
            clearTimeout(findTimer)
            findTimer = setTimeout(() => ask('search', { text: find.value }).then(r => { list.innerHTML = r.map(p => `<option value='${esc(p.name)}'>`).join('') }).catch(() => { }), 200)
        })
        find.addEventListener('keydown', e => { if (e.key === 'Enter' && find.value.trim()) { go('profile', find.value.trim()); find.value = '' } })
        find.addEventListener('change', () => { if (list.querySelector(`option[value="${window.CSS.escape(find.value)}"]`)) { go('profile', find.value); find.value = '' } })
    }

    function toast(msg, err) {
        const t = document.createElement('div')
        t.className = 'sToast' + (err ? ' err' : '')
        t.textContent = msg
        root.appendChild(t)
        setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.remove(), 300) }, 2500)
    }
    function modal(html) {
        const m = document.createElement('div')
        m.className = 'sModal'
        m.innerHTML = `<div>${html}</div>`
        m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-cancel]')) m.remove() })
        root.appendChild(m)
        const inp = m.querySelector('input')
        inp && setTimeout(() => inp.focus(), 0)
        return m
    }

    let current = null   // what's showing, to redraw after a change
    function go(view, q) {
        tab = view === 'clan' || view === 'allClans' ? 'clans' : view
        current = [view, q]
        root.querySelectorAll('.sTab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab))
        body.innerHTML = `<div class='sEmpty'>Loading...</div>`
        root.querySelector('.sBody').scrollTop = 0
        const views = { profile, leaderboard, market, clans, clan, allClans: clansList }
        Promise.resolve(views[view](q)).catch(e => { body.innerHTML = `<div class='sEmpty'>${esc(e.message)}</div>` })
    }
    const redraw = () => current && go(current[0], current[1])

    // ---- profile ----
    async function profile(name) {
        if (!name && !me()) { body.innerHTML = `<div class='sEmpty'>Log in to see your profile, or find a player above.</div>`; return }
        const p = await ask('profile', { name: name || me().name })
        const stat = (v, l) => `<div class='sStat'><b>${v}</b><span>${l}</span></div>`
        let html = `<h1>${lvlIcon(p.level)}${esc(p.name)}${clanLink(p.clan)}${p.online ? `<span class='sDot' title='Playing now'></span>` : ''}</h1>
            <div class='sSub'>Level ${p.level} · playing since ${new Date(p.created || Date.now()).toLocaleDateString()}${p.listed ? ` · <a data-go='market' data-q='${esc(p.name)}'>${p.listed} on the market</a>` : ''}</div>
            <div class='sStats'>${stat(p.level, 'Level') + stat(num(p.score), 'Score') + stat(num(p.kills), 'Kills') + stat(num(p.deaths), 'Deaths') +
            stat(p.kd, 'K/D') + stat(num(p.wins), 'Wins') + stat(num(p.games), 'Games') + stat(time(p.timePlayed), 'Time played') +
            stat(num(p.funds), 'KR') + stat(num(p.items), 'Items') + stat(p.contrabands ? `<span class='krRainbow'>${p.contrabands}</span>` : 0, 'Contrabands')}</div>`
        const skins = p.skins.filter(s => store.skins[s.ind] && (state.type == null || (store.skins[s.ind].type || 0) === state.type))
            .sort((a, b) => store.skins[b.ind].rarity - store.skins[a.ind].rarity || store.skins[a.ind].name.localeCompare(store.skins[b.ind].name))
        html += `<h2>Inventory <span class='sSub'>(${num(p.items)})</span></h2><div class='sFilters'>` +
            TYPES.map(([t, n]) => `<div class='sChip${state.type === t ? ' on' : ''}' data-act='type' data-t='${t}'>${n}</div>`).join('') + `</div>`
        html += skins.length ? `<div class='sGrid'>` + skins.map(s => {
            const sk = store.skins[s.ind], r = sk.rarity, col = shown(r)
            return `<div class='sCard${r >= 5 ? ' contra' : ''}' style='border-color:${col}'>${s.cnt > 1 ? `<div class='sCnt'>x${s.cnt}</div>` : ''}
                <img src='${kr.utils.getPreview(sk, store)}'><div class='sName' style='color:${col}'>${itemName(sk, r)}</div>` +
                (p.me ? `<div class='sBtns'><div class='sBtn' data-act='sell' data-ind='${s.ind}'>Sell</div><div class='sBtn blue' data-act='gift' data-ind='${s.ind}'>Gift</div></div>` : '') + `</div>`
        }).join('') + `</div>` : `<div class='sEmpty'>Nothing here yet${p.me ? ' - go spin a wheel!' : ''}</div>`
        body.innerHTML = html
    }

    // ---- leaderboards ----
    async function leaderboard(stat) {
        if (stat) state.board = stat
        const rows = await ask('leaderboard', { stat: state.board })
        const isClans = state.board === 'clans'
        const fmt = r => state.board === 'timePlayed' ? time(r.value) : state.board === 'level' ? `${r.level} <span class='sSub'>(${num(r.value)})</span>` :
            state.board === 'contrabands' && r.value ? `<span class='krRainbow'>${r.value}</span>` : isClans ? num(r.value) : (state.board === 'kd' ? r.value : num(r.value))
        const head = BOARDS.find(b => b[0] === state.board)[1]
        let html = `<div class='sFilters'>${BOARDS.map(([k, n]) => `<div class='sChip${k === state.board ? ' on' : ''}' data-go='leaderboard' data-q='${k}'>${n}</div>`).join('')}</div>`
        html += rows.length ? `<table><tr><th>#</th><th>${isClans ? 'Clan' : 'Player'}</th><th>${isClans ? 'Owner' : 'Clan'}</th>${isClans ? `<th class='num'>Members</th>` : ''}<th class='num'>${isClans ? 'Score' : head}</th></tr>` +
            rows.map((r, i) => `<tr class='${!isClans && me() && r.name === me().name ? 'me' : ''}'><td>${i + 1}</td>` +
                (isClans ? `<td>${clanLink(r.name)}</td><td>${r.owner ? player(r.owner) : ''}</td><td class='num'>${r.members}</td>`
                    : `<td>${lvlIcon(r.level)}${player(r.name)}</td><td>${clanLink(r.clan)}</td>`) + `<td class='num'>${fmt(r)}</td></tr>`).join('') + `</table>`
            : `<div class='sEmpty'>Nobody yet.</div>`
        body.innerHTML = html
    }

    // ---- market ----
    async function market(seller) {
        const m = state.market
        if (seller) { m.search = seller; m.mine = false }
        const r = await ask('market', m)
        let html = `<h1>Market</h1><div class='sSub'>Buy other players' items for KR, or sell yours from your profile.${me() ? ` You have <span style='color:#ffd54f'>${num(me().funds)} KR</span>.` : ''}</div>
            <div class='sFilters'><input class='mSearch' placeholder='Item or seller' value='${esc(m.search)}'>
            <select class='mRarity'><option value=''>Any rarity</option>${store.rarities.map((x, i) => x.noSpin ? '' : `<option value='${i}'${String(m.rarity) === String(i) ? ' selected' : ''}>${x.name}</option>`).join('')}</select>
            <select class='mSort'>${[['new', 'Newest'], ['cheap', 'Cheapest'], ['dear', 'Most expensive'], ['rarity', 'Rarest']].map(([k, n]) => `<option value='${k}'${m.sort === k ? ' selected' : ''}>${n}</option>`).join('')}</select>
            ${me() ? `<div class='sChip${m.mine ? ' on' : ''}' data-act='mine'>My listings</div>` : ''}<span class='sSub'>${num(r.total)} listed</span></div>`
        html += r.listings.length ? `<div class='sGrid'>` + r.listings.map(l => {
            const sk = store.skins[l.ind], col = shown(l.rarity)
            return `<div class='sCard${l.rarity >= 5 ? ' contra' : ''}' style='border-color:${col}'><img src='${kr.utils.getPreview(sk, store)}'>
                <div class='sName' style='color:${col}'>${itemName(sk, l.rarity)}</div><div class='sPrice'>${num(l.price)} KR</div>
                <div class='sSub'>by ${player(l.seller)}</div><div class='sBtns'>` +
                (l.mine ? `<div class='sBtn grey' data-act='unlist' data-id='${l.id}'>Take back</div>` : me() ? `<div class='sBtn green' data-act='buy' data-id='${l.id}' data-price='${l.price}' data-ind='${l.ind}'>Buy</div>` : '') + `</div></div>`
        }).join('') + `</div>` : `<div class='sEmpty'>Nothing for sale${m.search || m.rarity !== '' || m.mine ? ' that matches' : ' yet'}.</div>`
        body.innerHTML = html
        const s = body.querySelector('.mSearch')
        let t = null
        s.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { m.search = s.value; market().then(() => { const n = body.querySelector('.mSearch'); n.focus(); n.setSelectionRange(n.value.length, n.value.length) }) }, 300) })
        body.querySelector('.mRarity').addEventListener('change', e => { m.rarity = e.target.value; market() })
        body.querySelector('.mSort').addEventListener('change', e => { m.sort = e.target.value; market() })
    }

    // ---- clans ----
    async function clans() {
        if (me() && me().clan) return clan(me().clan)
        const list = await ask('clans')
        let html = `<h1>Clans</h1>`
        html += me() ? `<h2>Make a clan</h2><div class='sFilters'><input class='cTag' maxlength='8' placeholder='Tag (up to 4 characters)'><div class='sBtn' data-act='clanCreate'>Create</div></div>
            <div class='sSub'>Or ask to join one below; its owner lets you in.</div>` : `<div class='sSub'>Log in to make or join a clan.</div>`
        html += `<h2>All clans</h2>` + (list.length ? `<table><tr><th>Clan</th><th>Owner</th><th class='num'>Members</th><th class='num'>Score</th><th></th></tr>` +
            list.map(c => `<tr><td>${clanLink(c.tag)}</td><td>${c.owner ? player(c.owner) : ''}</td><td class='num'>${c.members}</td><td class='num'>${num(c.score)}</td>
            <td class='num'>${me() ? `<div class='sBtn blue' data-act='clanJoin' data-tag='${esc(c.tag)}'>Ask to join</div>` : ''}</td></tr>`).join('') + `</table>`
            : `<div class='sEmpty'>No clans yet - make the first one.</div>`)
        body.innerHTML = html
    }
    async function clan(tag) {
        const c = await ask('clan', { tag })
        let html = `<h1><span class='sTag' style='margin:0'>[${esc(c.tag)}]</span> ${lvlIcon(c.level)}<span class='sSub' style='font-size:22px'>Level ${c.level} · ${num(c.score)} score · owner ${c.owner ? player(c.owner) : '?'}</span></h1>`
        if (c.isMember) html += `<div style='margin-top:10px'><div class='sBtn grey' data-act='clanLeave' data-owner='${c.isOwner ? 1 : ''}'>${c.isOwner ? 'Delete clan' : 'Leave clan'}</div></div>`
        else if (me() && !me().clan) html += `<div style='margin-top:10px'>${c.asked ? `<span class='sSub'>Asked to join - waiting for the owner.</span>` : `<div class='sBtn blue' data-act='clanJoin' data-tag='${esc(c.tag)}'>Ask to join</div>`}</div>`
        if (c.requests) html += `<h2>Requests <span class='sSub'>(${c.requests.length})</span></h2>` + (c.requests.length ? `<table>` + c.requests.map(r =>
            `<tr><td>${lvlIcon(r.level)}${player(r.name)}</td><td class='num'><div class='sBtn green' data-act='clanAnswer' data-id='${r.id}' data-yes='1'>Accept</div> <div class='sBtn grey' data-act='clanAnswer' data-id='${r.id}'>Decline</div></td></tr>`).join('') + `</table>`
            : `<div class='sEmpty'>No requests.</div>`)
        html += `<h2>Members <span class='sSub'>(${c.members.length})</span></h2><table><tr><th>Player</th><th class='num'>Score</th><th class='num'>Kills</th><th></th></tr>` +
            c.members.map(m => `<tr><td>${lvlIcon(m.level)}${player(m.name)}${m.owner ? ` <span class='sSub'>owner</span>` : ''}${m.online ? `<span class='sDot' title='Playing now'></span>` : ''}</td>
            <td class='num'>${num(m.score)}</td><td class='num'>${num(m.kills)}</td><td class='num'>${c.isOwner && !m.owner ? `<div class='sBtn grey' data-act='clanKick' data-id='${m.id}' data-name='${esc(m.name)}'>Kick</div>` : ''}</td></tr>`).join('') + `</table>`
        html += `<div style='margin-top:24px'><a data-go='allClans'>All clans</a></div>`
        body.innerHTML = html
    }

    // ---- buttons ----
    const done = (msg, again) => { msg && toast(msg); again !== false && redraw() }
    const oops = e => toast(e.message, true)
    function action(act, d) {
        const ind = Number(d.ind), sk = store.skins[ind]
        switch (act) {
            case 'type': state.type = d.t === 'null' ? null : Number(d.t); return redraw()
            case 'mine': state.market.mine = !state.market.mine; state.market.search = ''; return redraw()
            case 'sell': {
                const m = modal(`<img src='${kr.utils.getPreview(sk, store)}'><div style='color:${shown(sk.rarity)};font-size:22px'>${itemName(sk, sk.rarity)}</div>
                    <div>Sell for <input type='number' min='1' max='10000000' value='${[50, 150, 500, 2000, 10000, 50000][sk.rarity] || 100}'> KR</div>
                    <div class='sBtns' style='display:flex;gap:10px;justify-content:center'><div class='sBtn green' data-ok>List it</div><div class='sBtn grey' data-cancel>Cancel</div></div>
                    <div class='sSub' style='margin-top:10px;font-size:15px'>It leaves your inventory until someone buys it or you take it back.</div>`)
                const ok = () => ask('sell', { ind, price: Number(m.querySelector('input').value) }).then(() => { m.remove(); done('Listed ' + sk.name) }).catch(oops)
                m.querySelector('[data-ok]').onclick = ok
                m.querySelector('input').onkeydown = e => e.key === 'Enter' && ok()
                return
            }
            case 'gift': {
                const m = modal(`<img src='${kr.utils.getPreview(sk, store)}'><div style='color:${shown(sk.rarity)};font-size:22px'>${itemName(sk, sk.rarity)}</div>
                    <div>Gift to <input placeholder='Player name' list='krSocFind'></div>
                    <div style='display:flex;gap:10px;justify-content:center'><div class='sBtn blue' data-ok>Send</div><div class='sBtn grey' data-cancel>Cancel</div></div>`)
                const inp = m.querySelector('input'), list = root.querySelector('#krSocFind')
                inp.addEventListener('input', () => ask('search', { text: inp.value }).then(r => { list.innerHTML = r.map(p => `<option value='${esc(p.name)}'>`).join('') }).catch(() => { }))
                const ok = () => ask('gift', { to: inp.value.trim(), ind }).then(msg => { m.remove(); done(msg) }).catch(oops)
                m.querySelector('[data-ok]').onclick = ok
                inp.onkeydown = e => e.key === 'Enter' && ok()
                return
            }
            case 'buy': {
                const m = modal(`<img src='${kr.utils.getPreview(sk, store)}'><div style='color:${shown(sk.rarity)};font-size:22px'>${itemName(sk, sk.rarity)}</div>
                    <div style='margin:10px 0'>Buy for <span style='color:#ffd54f'>${num(d.price)} KR</span>?</div>
                    <div style='display:flex;gap:10px;justify-content:center'><div class='sBtn green' data-ok>Buy</div><div class='sBtn grey' data-cancel>Cancel</div></div>`)
                m.querySelector('[data-ok]').onclick = () => ask('buy', { id: Number(d.id) }).then(() => { m.remove(); done('Bought ' + sk.name) }).catch(e => { m.remove(); oops(e); redraw() })
                return
            }
            case 'unlist': return ask('unlist', { id: Number(d.id) }).then(() => done('Back in your inventory')).catch(oops)
            case 'clanCreate': return ask('clanCreate', { tag: body.querySelector('.cTag').value }).then(c => { done(`Made clan [${c.tag}]`, false); setTimeout(() => go('clan', c.tag), 300) }).catch(oops)
            case 'clanJoin': return ask('clanJoin', { tag: d.tag }).then(msg => done(msg)).catch(oops)
            case 'clanAnswer': return ask('clanAnswer', { id: Number(d.id), yes: !!d.yes }).then(() => done(d.yes ? 'Accepted' : 'Declined')).catch(oops)
            case 'clanKick': {
                const m = modal(`<div style='font-size:22px;margin-bottom:14px'>Kick ${esc(d.name)}?</div><div style='display:flex;gap:10px;justify-content:center'><div class='sBtn' data-ok>Kick</div><div class='sBtn grey' data-cancel>Cancel</div></div>`)
                m.querySelector('[data-ok]').onclick = () => ask('clanKick', { id: Number(d.id) }).then(() => { m.remove(); done('Kicked ' + d.name) }).catch(oops)
                return
            }
            case 'clanLeave': {
                const m = modal(`<div style='font-size:22px;margin-bottom:14px'>${d.owner ? 'Delete the clan? Everyone in it leaves.' : 'Leave the clan?'}</div><div style='display:flex;gap:10px;justify-content:center'><div class='sBtn' data-ok>${d.owner ? 'Delete' : 'Leave'}</div><div class='sBtn grey' data-cancel>Cancel</div></div>`)
                m.querySelector('[data-ok]').onclick = () => ask('clanLeave').then(() => { m.remove(); done(d.owner ? 'Clan deleted' : 'Left the clan', false); setTimeout(() => go('clans'), 300) }).catch(oops)
                return
            }
        }
    }
    // the clan list even while in a clan
    async function clansList() {
        const list = await ask('clans')
        body.innerHTML = `<h1>All clans</h1>` + (list.length ? `<table><tr><th>Clan</th><th>Owner</th><th class='num'>Members</th><th class='num'>Score</th></tr>` +
            list.map(c => `<tr><td>${clanLink(c.tag)}</td><td>${c.owner ? player(c.owner) : ''}</td><td class='num'>${c.members}</td><td class='num'>${num(c.score)}</td></tr>`).join('') + `</table>` : `<div class='sEmpty'>No clans yet.</div>`)
    }

    // every way into social.html opens the panel: window.open(...) and links
    function route(url) {
        let u
        try { u = new URL(url, 'https://krunker.io/') } catch (e) { return false }
        if (!/social\.html$/.test(u.pathname)) return false
        const p = u.searchParams.get('p'), q = u.searchParams.get('q')
        if (p === 'profile') open('profile', q)
        else if (p === 'market') open('market')
        else if (p === 'leaders' || p === 'leaderboard') open('leaderboard')
        else if (q === 'clan' || p === 'clans') open('clans')
        else open()
        return true
    }
    const windowOpen = window.open
    window.open = function (url) { return route(url) ? null : windowOpen.apply(this, arguments) }
    document.addEventListener('click', e => {
        const a = e.target.closest && e.target.closest('a[href*="social.html"]')
        if (a && route(a.getAttribute('href'))) { e.preventDefault(); e.stopPropagation() }
    }, true)
}

module.exports = function () {
    const wait = setInterval(() => {
        if (window.__kr && window.__kr.game && window.__kr.game.store && document.body) {
            clearInterval(wait)
            init()
        }
    }, 200)
}
