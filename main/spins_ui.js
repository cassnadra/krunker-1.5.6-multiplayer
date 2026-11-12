// The prize wheel's extras, added to the page by preload.js:
//   - open several at once (x1 up to x100): the server rolls them all ('spinN') and a wheel per spin spins on screen,
//     all together, each landing on its own item (a click stops them all)
//   - Fast: skips the spinning: the game's wheel (one at a time) or straight to the item cards (several)
// The game's own pieces come from window.__kr (set in game.js next to prizeWheel).
const COUNTS = [1, 3, 5, 10, 25, 50, 100]

function load(key, def) {
    try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v) } catch (e) { return def }
}
function save(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)) } catch (e) { }
}

const CSS = `
#krSpinBar { position: absolute; left: 50%; bottom: 150px;   /* above the ad strip (#aHolder), which sits on top and eats clicks */ transform: translateX(-50%); z-index: 14; pointer-events: auto;
    display: flex; gap: 8px; align-items: center; color: #fff; font-size: 22px; }
#krSpinBar *, #krSpinResults * { color: inherit; }   /* the game's CSS gives every element (*) dark grey text */
#krSpinBar .krOpt { padding: 6px 14px; background: rgba(0,0,0,0.45); cursor: pointer; border-radius: 4px; }
#krSpinBar .krOpt:hover { background: rgba(0,0,0,0.65); }
#krSpinBar .krOpt.on { background: #F44336; }
#krSpinBar .krFast { margin-left: 16px; }
#krSpinResults { position: fixed; top: 0; left: 0; right: 0; bottom: 0;   /* no "inset" in Electron 10 */ z-index: 10000001; background: rgba(10,10,14,0.92); overflow-y: auto;
    pointer-events: auto; color: #fff; text-align: center; padding: 30px 20px 120px; box-sizing: border-box; }
#krSpinResults .krHead { font-size: 40px; color: #fff; margin-bottom: 6px; }
#krSpinResults .krTally { font-size: 20px; margin-bottom: 22px; }
#krSpinResults .krTally span { margin: 0 10px; }
#krSpinResults .krGrid { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; max-width: 1400px; margin: 0 auto; }
#krSpinResults .krCard { width: 150px; padding: 8px 6px 10px; background: rgba(255,255,255,0.06); border-bottom: 5px solid;
    font-size: 15px; line-height: 18px; opacity: 0; transform: scale(0.6); transition: opacity .18s, transform .18s; }
#krSpinResults .krCard.shown { opacity: 1; transform: none; }
#krSpinResults .krCard img { width: 130px; height: 130px; object-fit: contain; display: block; margin: 0 auto 6px; }
#krSpinResults .krCard.big { box-shadow: 0 0 22px var(--glow); }
#krSpinResults.wheels:not(.done) .krTally { visibility: hidden; }
#krSpinResults .krWheel { display: inline-block; text-align: center; }
#krSpinResults .krWheel canvas { display: block; }
#krSpinResults .krWheel.big canvas { filter: drop-shadow(0 0 14px var(--glow)); }
#krSpinResults .krWheelName { height: 22px; font-size: 14px; line-height: 22px; white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; opacity: 0; transition: opacity .3s; }
#krSpinResults .krWheelName.shown { opacity: 1; }
/* Contraband: a rainbow glow and rainbow text */
@keyframes krRainbowGlow { 0% { box-shadow: 0 0 26px 4px #ff3b3b; border-color: #ff3b3b } 17% { box-shadow: 0 0 26px 4px #ff9f1a; border-color: #ff9f1a }
    33% { box-shadow: 0 0 26px 4px #ffe83b; border-color: #ffe83b } 50% { box-shadow: 0 0 26px 4px #3bff6a; border-color: #3bff6a }
    67% { box-shadow: 0 0 26px 4px #3bb4ff; border-color: #3bb4ff } 83% { box-shadow: 0 0 26px 4px #b03bff; border-color: #b03bff }
    100% { box-shadow: 0 0 26px 4px #ff3b3b; border-color: #ff3b3b } }
@keyframes krRainbowDrop { 0% { filter: drop-shadow(0 0 16px #ff3b3b) } 17% { filter: drop-shadow(0 0 16px #ff9f1a) }
    33% { filter: drop-shadow(0 0 16px #ffe83b) } 50% { filter: drop-shadow(0 0 16px #3bff6a) } 67% { filter: drop-shadow(0 0 16px #3bb4ff) }
    83% { filter: drop-shadow(0 0 16px #b03bff) } 100% { filter: drop-shadow(0 0 16px #ff3b3b) } }
@keyframes krRainbowText { from { background-position: 0 0 } to { background-position: 200% 0 } }
.krRainbow { background: linear-gradient(90deg, #ff3b3b, #ff9f1a, #ffe83b, #3bff6a, #3bb4ff, #b03bff, #ff3b3b); background-size: 200% 100%;
    -webkit-background-clip: text; background-clip: text; color: transparent !important; animation: krRainbowText 2s linear infinite; }
#krSpinResults .krCard.contra { animation: krRainbowGlow 2s linear infinite; }
#krSpinResults .krWheel.contra canvas { animation: krRainbowDrop 2s linear infinite; }
#krSpinResults .krBtns { position: fixed; left: 0; right: 0; bottom: 24px; display: flex; gap: 16px; justify-content: center; }
#krSpinResults .krBtn { font-size: 26px; padding: 10px 26px; cursor: pointer; background: #F44336; border-radius: 4px; }
#krSpinResults .krBtn.grey { background: rgba(255,255,255,0.15); }
`

function init() {
    const kr = window.__kr
    const store = kr.game.store
    let count = COUNTS.includes(load('krSpinCount', 1)) ? load('krSpinCount', 1) : 1
    let fast = !!load('krSpinFast', false)
    let wheel = 0, busy = false
    window.__krFast = fast

    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)

    // the bar under the wheel
    const bar = document.createElement('div')
    bar.id = 'krSpinBar'
    bar.onclick = e => e.stopPropagation()   // a click on the wheel screen closes it
    spinUI.appendChild(bar)
    function drawBar() {
        bar.innerHTML = COUNTS.map(n => `<div class='krOpt${n === count ? ' on' : ''}' data-n='${n}'>x${n}</div>`).join('') +
            `<div class='krOpt krFast${fast ? ' on' : ''}' data-fast='1'>Fast</div>`
        if (!busy && spinHeader.innerHTML) spinHeader.innerHTML = count > 1 ? 'SPIN x' + count : 'SPIN'
        const w = store.wheels[wheel]
        if (!busy && w && spinCost.innerHTML) spinCost.innerHTML = '-' + w.price * count + 'KR'
    }
    bar.addEventListener('click', e => {
        const o = e.target.closest('.krOpt')
        if (!o) return
        if (o.dataset.fast) { fast = !fast; window.__krFast = fast; save('krSpinFast', fast) }
        else { count = Number(o.dataset.n); save('krSpinCount', count) }
        drawBar()
    })

    const prizeWheel = window.prizeWheel
    window.prizeWheel = function (i) {
        wheel = i
        const r = prizeWheel.apply(this, arguments)
        bar.style.display = store.wheels[i] && store.wheels[i].free ? 'none' : 'flex'   // the free wheel: one spin
        drawBar()
        return r
    }

    // the spin button: x1 is the game's own spin, more goes to the server in one go
    const spin = spinButton.onclick
    spinButton.onclick = function (e) {
        // x1 without Fast is the game's own wheel; with Fast it's a batch of one, straight to the results
        if ((count === 1 && !fast) || (store.wheels[wheel] && store.wheels[wheel].free)) return spin.call(this, e)
        e.stopPropagation()
        e.preventDefault()
        window.idleTimer = 0
        const acct = kr.acct(), w = store.wheels[wheel]
        if (busy || !acct || !w) return
        busy = true
        spinHeader.innerHTML = ''
        spinCost.innerHTML = 'Opening ' + count + '...'
        try { kr.audio.play('buy_1', 0.1) } catch (err) { }
        kr.net().send('spinN', wheel, count)
    }

    window.__krSpinN = function (results, funds, err) {
        busy = false
        spinHeader.innerHTML = 'SPIN x' + count
        const acct = kr.acct()
        if (err || !acct) { spinCost.innerHTML = 'Not enough KR'; return }
        acct.funds = funds
        for (const [ind] of results) {
            const own = acct.skins.find(s => s.ind === ind)
            if (own) own.cnt++; else acct.skins.push({ ind, cnt: 1 })
        }
        kr.refresh()
        spinKR.innerHTML = funds + ' KR'
        drawBar()
        show(results)
    }

    let anim = null   // the wheels' animation frame
    function close() {
        cancelAnimationFrame(anim)
        const o = document.getElementById('krSpinResults')
        o && o.remove()
    }

    // a rarity's colour for text and glows on the dark results screen: Contraband (#292929) would be invisible there
    function shown(r) {
        const c = store.rarities[r].color, v = parseInt(c.slice(1), 16)
        const lum = (0.299 * (v >> 16) + 0.587 * (v >> 8 & 255) + 0.114 * (v & 255)) / 255
        return lum < 0.3 ? '#c8c8c8' : c
    }

    const byRarity = results => results.slice().sort((a, b) => b[1] - a[1] || store.skins[a[0]].name.localeCompare(store.skins[b[0]].name))

    const play = (name, vol) => { try { kr.audio.play(name, vol) } catch (err) { } }

    // Fast: every item as a card at once. Otherwise a wheel per spin, all spinning together.
    function show(results) {
        close()
        const o = document.createElement('div')
        o.id = 'krSpinResults'
        const tally = {}
        for (const [, r] of results) tally[r] = (tally[r] || 0) + 1
        const best = Math.max(...results.map(x => x[1]))
        o.innerHTML = `<div class='krHead'>${results.length} UNBOXED</div><div class='krTally'>` +
            Object.keys(tally).sort((a, b) => b - a).map(r => `<span${r >= 5 ? " class='krRainbow'" : ''} style='color:${shown(r)}'>${tally[r]} ${store.rarities[r].name}</span>`).join('') +
            `</div><div class='krGrid'></div>` +
            `<div class='krBtns'><div class='krBtn' data-again='1'>SPIN x${count} AGAIN</div><div class='krBtn grey'>CLOSE</div></div>`
        document.body.appendChild(o)
        const grid = o.querySelector('.krGrid')
        const done = () => {
            o.classList.add('done')
            play('reward', 0.3)
            best >= 1 && play('cheer_0', 0.1)
        }
        let skip = null
        o.addEventListener('click', e => {
            e.stopPropagation()
            if (e.target.closest('[data-again]')) { close(); spinButton.onclick(e) }
            else if (e.target.closest('.krBtn')) close()
            else if (skip) skip()   // a click while they spin: stop them all
            else if (e.target === o) close()
        })
        if (fast) {
            grid.innerHTML = byRarity(results).map(([ind, r]) => {
                const s = store.skins[ind], col = shown(r)
                return `<div class='krCard shown${r >= 5 ? ' contra' : r >= 3 ? ' big' : ''}' style='border-color:${col};color:${col};--glow:${col}'>` +
                    `<img src='${kr.utils.getPreview(s, store)}'>${r >= 5 ? `<span class='krRainbow'>${s.name}</span>` : s.name}</div>`
            }).join('')
            done()
            return
        }
        skip = spinWheels(o, grid, results, () => {
            skip = null
            // all stopped: line the wheels up rarest first (not before, that would give the results away)
            for (const cell of [...grid.children].sort((a, b) => b.dataset.r - a.dataset.r || a.dataset.name.localeCompare(b.dataset.name))) grid.appendChild(cell)
            done()
        })
    }

    // n wheels in a grid, as big as the screen allows; each spins to its own result and shows the item in the middle
    function spinWheels(o, grid, results, onDone) {
        const w = store.wheels[wheel], total = w.rarities.reduce((a, b) => a + b, 0)
        const n = results.length, W = innerWidth - 60, H = innerHeight - 250, label = 22
        let size = 0, cols = 1
        for (let c = 1; c <= n; c++) {
            const s = Math.min(W / c - 12, H / Math.ceil(n / c) - 12 - label)
            if (s > size) { size = s; cols = c }
        }
        size = Math.max(40, Math.min(240, Math.floor(size)))
        grid.style.maxWidth = cols * (size + 12) + 'px'
        o.classList.add('wheels')
        const dpr = devicePixelRatio || 1
        const wheels = results.map(([ind, r, pos], i) => {
            const cell = document.createElement('div')
            cell.className = 'krWheel'
            cell.style.width = size + 'px'
            const cv = document.createElement('canvas')
            cv.width = cv.height = Math.round(size * dpr)
            cv.style.width = cv.style.height = size + 'px'
            const name = document.createElement('div')
            name.className = 'krWheelName'
            name.style.color = shown(r)
            name.textContent = store.skins[ind].name
            cell.dataset.r = r
            cell.dataset.name = store.skins[ind].name
            cell.append(cv, name)
            grid.appendChild(cell)
            const img = new Image()
            img.src = kr.utils.getPreview(store.skins[ind], store)
            // the wheel turns so that pos (0-100 around it, clockwise from the top) ends under the pointer at the top
            const turns = 4 + Math.floor(Math.random() * 3)
            return {
                cv, ctx: cv.getContext('2d'), name, img, r, color: store.rarities[r].color,
                end: -2 * Math.PI * ((pos == null ? 50 : pos) / 100 + turns),
                dur: 3200 + Math.random() * 1800 + Math.min(i, 20) * 40, rot: 0, stopped: 0,
            }
        })
        const draw = (wl, now) => {
            const c = wl.ctx, R = c.canvas.width / 2
            const k = wl.stopped ? Math.min(1, (now - wl.stopped) / 300) : 0   // after the stop: the ring takes the item's colour
            c.clearRect(0, 0, 2 * R, 2 * R)
            c.save()
            c.translate(R, R)
            c.fillStyle = '#fff'
            c.beginPath(); c.arc(0, 0, R * 0.98, 0, 2 * Math.PI); c.fill()
            c.rotate(wl.rot)
            let a = -Math.PI / 2
            store.rarities.forEach((rar, j) => {
                const p = w.rarities[j] || 0
                if (p <= 0) return
                const sweep = 2 * Math.PI * p / total
                c.fillStyle = rar.color
                c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R * 0.92, a, a + sweep); c.closePath(); c.fill()
                a += sweep
            })
            c.rotate(-wl.rot)
            if (k) {
                c.globalAlpha = k
                c.fillStyle = wl.color
                c.beginPath(); c.arc(0, 0, R * 0.92, 0, 2 * Math.PI); c.fill()
                c.globalAlpha = 1
            }
            c.fillStyle = '#fff'
            c.beginPath(); c.arc(0, 0, R * 0.62, 0, 2 * Math.PI); c.fill()
            if (k && wl.img.complete && wl.img.naturalWidth) {
                c.globalAlpha = k
                const s = R * 1.3 * (0.7 + 0.3 * k)
                c.drawImage(wl.img, -s / 2, -s / 2, s, s)
                c.globalAlpha = 1
            } else if (!k) {
                c.fillStyle = '#F44336'
                c.beginPath(); c.arc(0, 0, R * 0.5, 0, 2 * Math.PI); c.fill()
            }
            c.fillStyle = '#F44336'   // the pointer, at the top
            c.beginPath(); c.moveTo(-R * 0.12, -R); c.lineTo(R * 0.12, -R); c.lineTo(0, -R * 0.74); c.closePath(); c.fill()
            c.restore()
        }
        let left = n
        const stop = (wl, now) => {
            wl.rot = wl.end
            wl.stopped = now
            wl.name.classList.add('shown')
            if (wl.r >= 5) { wl.cv.parentElement.classList.add('contra'); wl.name.classList.add('krRainbow') }
            else if (wl.r >= 3) { wl.cv.parentElement.classList.add('big'); wl.cv.parentElement.style.setProperty('--glow', shown(wl.r)) }
            if (n <= 10 || wl.r >= 3) play(wl.r >= 3 ? 'cheer_0' : 'tick_0', wl.r >= 3 ? 0.1 : 0.2)
            left--
        }
        const t0 = performance.now()
        let lastTick = 0, lastSlice = 0, finished = false
        const frame = now => {
            for (const wl of wheels) {
                if (!wl.stopped) {
                    const u = Math.min(1, (now - t0) / wl.dur)
                    wl.rot = wl.end * (1 - Math.pow(1 - u, 3))   // fast, then slowing down
                    if (u >= 1) stop(wl, now)
                }
                if (!wl.stopped || now - wl.stopped < 350) draw(wl, now)
            }
            // ticks from the first wheel only (a hundred would just be noise)
            const slice = Math.floor(-wheels[0].rot / (Math.PI / 6))
            if (!wheels[0].stopped && slice !== lastSlice && now - lastTick > 60) { play('tick_0', 0.12); lastTick = now }
            lastSlice = slice
            if (!left && !finished && wheels.every(wl => now - wl.stopped >= 350)) { finished = true; onDone(); return }
            anim = requestAnimationFrame(frame)
        }
        anim = requestAnimationFrame(frame)
        return () => { const now = performance.now(); for (const wl of wheels) if (!wl.stopped) stop(wl, now) }
    }
}

module.exports = function () {
    const wait = setInterval(() => {
        if (window.__kr && window.spinButton && spinButton.onclick && window.prizeWheel) {
            clearInterval(wait)
            init()
        }
    }, 200)
}
