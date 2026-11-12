// Steam, through Valve's test app Spacewar (480): a lobby per hosted game, found in the lobby list, by a short code or
// from the Steam friends list ("Join Game"), and Steam's P2P relay to carry the game between PCs, so nobody needs to
// open ports. The game itself still talks WebSocket; server/steam_bridge.js carries that over the P2P packets.
//
// Needs Steam running and logged in. While the game is open, Steam shows you as playing Spacewar.
// Spacewar's lobby list is shared with everyone testing with app 480: ours carry game=krunker156 and the rest are
// skipped.
'use strict';
const bridge = require('../server/steam_bridge');

const APP = 480
const GAME = 'krunker156'
const P2P_SESSION_REQUEST = 6, P2P_CONNECT_FAIL = 7, LOBBY_CHAT_UPDATE = 5, LOBBY_JOIN_REQUESTED = 8   // SteamCallback
const RELIABLE = 2   // networking.SendType: ordered, up to 1 MB
const PUBLIC = 2     // matchmaking.LobbyType
const LEFT = 1, DISCONNECTED = 2, KICKED = 3, BANNED = 4   // a lobby member's state change

let sw = null, client = null, link = null, log = () => {}

// before the app is ready (the overlay needs a couple of Chromium switches); false when Steam isn't there
function start(opts = {}) {
    log = opts.log || log
    try { sw = require('steamworks.js') } catch (e) { log('steam: steamworks.js is missing'); return false }
    try { client = sw.init(APP) } catch (e) { log('steam: not available (is Steam running?) - ' + e.message); client = null; return false }
    if (opts.overlay) try { sw.electronEnableSteamOverlay() } catch (e) { log('steam: no overlay - ' + e.message) }
    log('steam: ready as ' + client.localplayer.getName())
    return true
}
const ok = () => !!client

// the P2P link the bridge uses: Steam IDs as strings, every packet Reliable
function getLink() {
    if (link) return link
    const handlers = [], gone = []
    const goneNow = id => gone.forEach(h => h(String(id)))
    client.callback.register(P2P_SESSION_REQUEST, ({ remote }) => client.networking.acceptP2PSession(remote))
    client.callback.register(P2P_CONNECT_FAIL, ({ remote }) => goneNow(remote))
    client.callback.register(LOBBY_CHAT_UPDATE, ({ user_changed, member_state_change }) => {
        if ([LEFT, DISCONNECTED, KICKED, BANNED].includes(member_state_change)) goneNow(user_changed)
    })
    setInterval(() => {   // Steam keeps arriving packets until they're read
        for (let n; (n = client.networking.isP2PPacketAvailable()) > 0;) {
            const p = client.networking.readP2PPacket(n)
            const from = String(p.steamId.steamId64)
            for (const h of handlers) h(from, p.data)
        }
    }, 4)
    link = {
        send: (peer, buf) => client.networking.sendP2PPacket(BigInt(peer), RELIABLE, buf),
        onPacket: h => handlers.push(h),
        onPeerGone: h => gone.push(h),
    }
    return link
}

// lobby IDs as short codes to share: 109775241234567890 -> "u2ld0s7c1x2"
const toCode = id => BigInt(id).toString(36)
function fromCode(code) {
    code = String(code).trim().toLowerCase().replace(/^steam:/, '')
    if (!/^[0-9a-z]{1,13}$/.test(code)) throw new Error('That is not a lobby code')
    return [...code].reduce((n, ch) => n * 36n + BigInt(parseInt(ch, 36)), 0n)
}

// host: a public lobby pointing at the server on 127.0.0.1:port; players' traffic arrives through the bridge
async function host({ port, name, map, mode }) {
    const lobby = await client.matchmaking.createLobby(PUBLIC, 16)
    lobby.mergeFullData({ game: GAME, v: '1', name: String(name || 'Krunker'), map: String(map || ''), mode: String(mode || ''), players: '1' })
    const b = bridge.host(getLink(), port, { log })
    log(`steam: lobby ${toCode(lobby.id)} open`)
    return {
        code: toCode(lobby.id), host: true,
        update(info) { lobby.mergeFullData(Object.fromEntries(Object.entries(info).map(([k, v]) => [k, String(v)]))) },
        invite: () => lobby.openInviteDialog(),
        close() { b.close(); lobby.leave() },
    }
}

// join a lobby by its code: resolves to { url } for the game to connect to (a local WebSocket server)
async function join(code) {
    const lobby = await client.matchmaking.joinLobby(fromCode(code))
    if (lobby.getData('game') !== GAME) { lobby.leave(); throw new Error('That lobby is not a Krunker game') }
    const owner = String(lobby.getOwner().steamId64)
    if (owner === String(client.localplayer.getSteamId().steamId64)) { lobby.leave(); throw new Error("That's your own game") }
    const c = await bridge.client(getLink(), owner)
    log(`steam: joined lobby ${toCode(lobby.id)}, host ${owner}`)
    return { url: c.url, code: toCode(lobby.id), host: false, invite: () => lobby.openInviteDialog(), close() { c.close(); lobby.leave() } }
}

// our games in the lobby list: [{ code, name, map, mode, players }]
async function find() {
    const lobbies = await client.matchmaking.getLobbies()
    return lobbies.filter(l => l.getData('game') === GAME).map(l => ({
        code: toCode(l.id), name: l.getData('name') || '?', map: l.getData('map') || '', mode: l.getData('mode') || '',
        players: Number(l.getData('players')) || Number(l.getMemberCount()),
    }))
}

// a friend clicked "Join Game" on you in Steam, or accepted an invite, while the game is open
function onJoinRequest(cb) { client.callback.register(LOBBY_JOIN_REQUESTED, ({ lobby_steam_id }) => cb(toCode(lobby_steam_id))) }

const name = () => client ? client.localplayer.getName() : null

module.exports = { start, ok, host, join, find, onJoinRequest, name, toCode, fromCode }
