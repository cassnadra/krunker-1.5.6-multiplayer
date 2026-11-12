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

## What works, what doesn't

Works: joining and leaving, spawning with your class, movement checked by the server (your PC predicts it,
the server corrects it), shooting and hit registration with lag compensation, headshots, damage, deaths, falling
off the map, respawning, kill rewards and streak messages, the leaderboard, chat, the round timer, the end screen,
and the next round.

Not done:
- logins, the store and unlocking skins;
- custom games and voting;
- spectating (you get the spectator camera, but the server doesn't track spectators);
- server-side anti-cheat. The original server answered the client's anti-cheat checks; this one ignores them.

## For testing

- `node server/bot.js --self 3 10` starts a server on port 8099 with 3 bots for 10 s and prints what each one received.
- Set `KRUNKER_TEST=40` and run Electron to get a hidden window that joins, walks for a few seconds and quits after
  40 s. The page's console and the client and server positions print to the terminal.
- `KRUNKER_MODE`, `KRUNKER_JOIN` and `KRUNKER_NAME` override `multiplayer.json`, so you can run two copies on one PC.
