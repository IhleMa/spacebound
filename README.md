# SPACEBOUND

A persistent multiplayer space idle MMO – fly, mine, fight and progress in a shared sci-fi universe.

> **Status: Phase 1 – playable multiplayer prototype.** See [docs/ROADMAP.md](docs/ROADMAP.md)
> for what is done and what comes next, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the
> technical design (stack, multiplayer model, database, offline production and economy security).

## What you can do right now

- Create a pilot account – progress is saved on the server.
- Fly your ship around the **Frontier Sector** with smooth, predicted movement.
- **Mine** iron asteroids, copper meteorites and silicon crystals; resources go into your cargo hold.
- **Dock** at Haven Outpost to unload cargo into storage; your hull repairs inside the safe zone.
- **Fight** scout drones, pirate raiders and the elite Pirate Captain for credits, XP and loot.
- **Level up** and buy **ship upgrades** (hull, engines, shields, cargo bay).
- See and fly alongside **other players in real time** – everything is simulated by the server.

## Controls

| Key | Action |
|---|---|
| `W A S D` / arrows | Fly |
| Mouse | Aim |
| Left click (hold) | Fire at the cursor |
| Space (hold) | Fire at the selected target (auto-aim) |
| Right click / `Tab` | Select target / cycle nearby enemies |
| `E` (hold) / `F` | Mine / toggle auto-mining |
| `C` | Ship & upgrades |
| `H` | Controls |
| `Esc` | Close panel / clear target |

## Running it

Requirements: **Node.js 20+** and npm.

```bash
npm install
npm run dev        # game server on :3000 + Vite client on http://localhost:5173
```

Open http://localhost:5173 in two browser windows (or two browsers) to see multiplayer in action.

Production build (the server also serves the built client):

```bash
npm run build
npm start          # http://localhost:3000
```

Environment variables: `PORT` (default 3000), `HOST`, `DB_PATH` (default `server/data/spacebound.db`),
`CLIENT_DIST`.

## Hosting on Pterodactyl

An egg is included at [`pterodactyl/egg-spacebound.json`](pterodactyl/egg-spacebound.json).

1. **Admin → Nests → Import Egg**, upload `egg-spacebound.json` and pick a nest (or create a "Spacebound" nest).
2. **Servers → Create New**, choose the Spacebound egg, assign **one port** (the game serves both the website and the WebSocket on it), ~512 MB RAM and ~1 GB disk (the install step needs room for dependencies).
3. Let the installer finish (it clones the repo, installs dependencies and builds), then press **Start**.
   The console shows `server listening on …` once it's ready.
4. Players open `http://<node-ip>:<port>` in a browser.

| Variable | Default | Purpose |
|---|---|---|
| Git Repository | `https://github.com/IhleMa/spacebound.git` | Where the code is installed from |
| Branch | `main` | Branch to install/update |
| Auto Update | `0` | `1` = pull, rebuild and apply the latest commit on every start |
| Git Username / Access Token | empty | Only needed if the repository is private |

Updating: either set **Auto Update = 1** and restart, or use **Settings → Reinstall Server**.
Both keep the player database in `server/data/`. Stopping the server from the panel saves all online players first.
Back up `server/data/spacebound.db` to back up all accounts and progress.

For HTTPS, put the port behind a reverse proxy (nginx, Caddy, Cloudflare Tunnel) – the client automatically uses `wss://` when loaded over HTTPS.

## Development

```bash
npm test           # unit + integration tests (shared rules, simulation, auth, persistence)
npm run typecheck  # strict TypeScript across all packages
```

### Project layout

```
shared/   game rules, data and network protocol – used by client AND server
server/   authoritative game server (Node.js, WebSocket, SQLite)
client/   browser client (TypeScript, Canvas 2D, DOM HUD, Vite)
docs/     architecture and roadmap
```

### Design rules followed in this codebase

- **Server-authoritative**: clients only send intentions (move/aim/fire/mine/buy); all results are computed and validated on the server.
- **Shared deterministic rules**: physics and stat formulas live in `shared/`, so prediction matches the server.
- **No fake features**: every button in the UI does something; systems that are not built yet are not shown.
- **Modular systems**: movement, combat, AI, mining, loot, docking, spawning and replication are separate modules operating on a `World` instance.
