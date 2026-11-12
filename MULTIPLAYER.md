# Multiplayer

The game now has a real server. It runs the game's own logic: movement, collision, shooting, damage, kills, score,
kill rewards, the leaderboard, the round timer and the end of a round. That logic was already inside the client
bundle, because Krunker used the same code on both sides. `server/loader.js` loads it in Node and
`server/server.js` adds the networking around it.

## Play

Edit `multiplayer.json`, then double-click `play.bat`.

| `mode`    | what it does |
|-----------|--------------|
| `auto`    | **the default, like LAN worlds in Minecraft:** looks for games on your network and lets you pick one; if there are none, hosts one |
| `host`    | runs the server on this PC and you play on it; others join you |
| `join`    | plays on someone else's server at `joinAddress` (e.g. `"192.168.1.20"` or `"1.2.3.4:8080"`) |
| `offline` | the old single-player version |

- `name`: your name in the game (up to 16 characters).
- `map` (host only): `burg`, `littletown`, `sandstorm`, `subzero` or `kanji`.
- `port`: 8080 by default.
- `afkKick`: `false` by default. Set it to `true` to get the original kick after 90 s idle in the menu.
- `startingKR` (host): every account has at least this much KR; it's topped back up at each login. 999999 by default.
- `freeSpins` (host): `true` by default, so spinning a wheel costs nothing.

As host, **F4** changes the map for everyone.

`server.bat` runs a server without playing on that PC: `server.bat --map burg --mode tdm --port 8080`.

## Who can join

- **Same Wi-Fi / LAN:** with `auto`, your game shows up in their list automatically. Servers answer scans on UDP port
  47800. `join` with your local address works too; run `ipconfig` and look for the IPv4 Address.
  The first time you host, Windows asks whether to let it through the firewall; allow **Private networks**.
  If nobody can see or join you, run this once in an administrator Command Prompt:
  `netsh advfirewall firewall add rule name="Krunker" dir=in action=allow program="%CD%
ode_modules\electron\dist\electron.exe" profile=private`
  (run it from this folder).
- **Over the internet:** either forward TCP port 8080 on your router to your PC and give them your public IP,
  or install Tailscale on both PCs and use your Tailscale address (no router changes needed).

Everyone needs this whole folder, including `node_modules`.

## The start screen

With `"mode": "auto"` (the default) the game opens on a start screen: your name, a mode and map, and

- **PLAY** - matchmaking: joins the fullest Steam game in that mode that has room (up to 8), or hosts one that
  others then join the same way. All player-hosted, no server anywhere.
- **Join a friend** - paste the code they sent (a Steam lobby code, or an address like `192.168.1.20`). A code that's
  already on the clipboard is filled in.
- **Games you can join** - games on your network and on Steam.
- **Host your own instead**, and **Play offline**.

It remembers your name, mode and map in `multiplayer.json`. Nobody has to edit that file any more.

## The download for friends

`powershell -ExecutionPolicy Bypass -File tools\package.ps1` builds `dist\Krunker\` and `dist\Krunker-win64.zip`:
unzip, double-click `Krunker.exe`, nothing to install. It leaves out your own `serverccounts.json`.

## Steam (through Spacewar)

With Steam running, games also go through Steam: no port forwarding, no Tailscale, and friends anywhere can join.
It uses Spacewar, Valve's free test app (ID 480), so Steam shows you as playing Spacewar while the game is open.

- **Hosting** (`host`, or `auto` with nobody around) opens a Steam lobby as well. Its code shows at the top of
  the menu, with **Copy**.
- **Joining:** `auto` lists Steam games next to LAN ones (`[Steam] Bob's game ...`). Or put the code in
  `multiplayer.json`: `"mode": "join", "joinAddress": "steam:u0w2pmmbpaq"`. Or click **Join Game** on your friend in
  the Steam friends list while your game is open.
- `"steamOverlay": true` turns on Steam's overlay in the game and the **Invite friends** button. It's off by default:
  the overlay changes how the game is drawn.
- `"steam": false` turns all of it off.

Spacewar's lobby list is shared with everyone else testing with app 480; ours are marked and the rest are skipped,
but with very many lobbies around, Steam may not list yours. The code and Join Game always work.

How it works: the game still talks WebSocket. On the PC that joins, it connects to a little relay on 127.0.0.1 that
sends everything to the host over Steam's P2P (`server/steam_bridge.js`); on the host, each Steam player becomes a
normal connection to the server. `node server/steam_bridge_test.js` tests that part without Steam.

## Accounts, KR and skins

Accounts live on the server, in `server/accounts.json` on the PC that hosts. Register or log in from the account
window in the menu. The game remembers the login and logs you back in by itself next time. Passwords are stored
salted and hashed, never in plain text.

- Every account has 999999 KR, and with `freeSpins` the wheels don't cost anything, so you can spin forever.
- Under the wheel, pick how many to open at once (x1 up to x100) and switch on **Fast**. Fast skips the wheel's
  spin and the card-by-card reveal. Several at once shows every item as a card, then "spin again".
- All six wheels work. The item comes from the wheel's own odds, and the Hunter and Attire wheels only give snipers
  and outfits. A Legendary or better unbox is announced in chat.
- What you unbox goes into your inventory, and you can equip it from the skin, hat, back and melee menus. Other
  players see what you wear. The server only lets you wear items you own, so guests play with the defaults.
- Kills, score, wins and games are saved to your account, and you also earn KR at the end of each round.

The item pictures in the menus (`main/krunkerio/textures/previews`) were on Krunker's servers, so they're rendered
here from each item's own model and texture. `make_previews.bat` makes any that are missing, and
`make_previews.bat --all` redoes all of them.

To move accounts to another host, copy `server/accounts.json`. Delete it to wipe all accounts.

## Social

**Social** in the menu, and every player name or "market" link in the game, opens the Social panel (Esc closes it).
The original was a page on krunker.io that isn't in this copy, so this one runs on your server's accounts:

- **Profile:** a player's level, kills, K/D, wins, time played and KR, and their whole inventory. On your own profile
  every item has **Sell** and **Gift**. Find anyone with the box at the top.
- **Leaderboards:** level, kills, wins, K/D, time played, items, Contrabands, and clans.
- **Market:** items other players listed, with search, rarity and sorting. Buying pays the seller straight away. A
  listed item leaves your inventory until it sells or you take it back.
- **Clans:** make one (a 2-4 character tag), or ask to join one and the owner accepts or declines. Owners can kick
  members; the owner leaving deletes the clan. Your [TAG] shows next to your name in game. The game's own clan
  window works too.

KR doesn't go below `startingKR` at login, so with the default every login tops you back up to 999999.

`node server/social_test.js` tests all of it with two players.

## What works, what doesn't

Works: joining and leaving, spawning with your class, movement checked by the server (your PC predicts it,
the server corrects it), shooting and hit registration with lag compensation, headshots, damage, deaths, falling
off the map, respawning, kill rewards and streak messages, the leaderboard, chat, the round timer, the end screen,
and the next round.

Not done:
- buying KR with money, KR codes and daily rewards;
- custom games and voting;
- spectating (you get the spectator camera, but the server doesn't track spectators);
- server-side anti-cheat. The original server answered the client's anti-cheat checks; this one ignores them.

## For testing

- `node server/account_test.js` registers, logs in, spins every wheel and checks what was saved, on port 8098 with
  a throwaway accounts file.
- `node server/bot.js --self 3 10` starts a server on port 8099 with 3 bots for 10 s and prints what each one received.
- Set `KRUNKER_TEST=40` and run Electron to get a hidden window that joins, walks for a few seconds and quits after
  40 s. The page's console and the client and server positions print to the terminal.
- `KRUNKER_MODE`, `KRUNKER_JOIN`, `KRUNKER_NAME` and `KRUNKER_PORT` override `multiplayer.json`, so you can run two copies on one PC.
  `KRUNKER_ACCOUNTS` points the server at a different accounts file.
