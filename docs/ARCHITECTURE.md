# Spacebound – Technical Architecture

This document answers the seven questions from the project brief (§23) before any feature work:
technology stack, multiplayer architecture, database structure, how the progression systems
interact, offline production, securing the economy, and the implementation roadmap
(see [ROADMAP.md](ROADMAP.md)).

---

## 1. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** everywhere | One language for client, server and shared rules. Types catch protocol mismatches at compile time. |
| Shared rules | `shared/` workspace package | Physics, stat formulas, combat math, game data and the network protocol are written **once** and used by both sides. The client uses them for prediction and display; the server uses them as the authority. |
| Server runtime | **Node.js ≥ 20** | Fast event loop for many WebSocket connections, same language as the client. |
| Realtime transport | **WebSockets** (`ws`) | Low-latency, bidirectional, works in every browser. |
| HTTP | Node `http` (no framework) | Only a handful of endpoints (`/api/register`, `/api/login`, `/api/health`) plus static files. |
| Database | **SQLite** (`better-sqlite3`, WAL mode) | Zero-ops, ACID transactions, synchronous API that fits a single-threaded tick model perfectly. The repository layer isolates SQL so a move to **PostgreSQL** (needed once several server processes share one database) is a contained change. |
| Client rendering | **Canvas 2D** with pre-rendered sprites | Plenty fast for a 2D top-down game, no engine lock-in, tiny bundle (≈23 kB gzipped). Glows/sprites are rendered once to offscreen canvases and then blitted. A move to WebGL (e.g. PixiJS) is possible behind the `Renderer` class if particle counts grow. |
| Client UI | Plain DOM + CSS | Crisp text, accessibility and easy styling for the many menus an MMO needs. |
| Build | **Vite** (client), **esbuild** (server bundle) | Fast dev server with HMR and proxying to the game server. |
| Tests | **Vitest** | Unit tests for shared rules, integration tests for the server simulation, auth and persistence. |

---

## 2. Multiplayer architecture

```
 Browser (client)                                   Node.js game server
┌──────────────────────────────┐   WebSocket   ┌─────────────────────────────────────────┐
│ Input → seq-numbered inputs  │ ────────────▶ │ ws gateway (auth, rate limit, validate) │
│ LocalShip: prediction +      │               │          │                              │
│   reconciliation             │ ◀──────────── │ GameServer (20 Hz fixed tick)           │
│ ClientWorld: interpolation   │  snapshots +  │   ├─ World "frontier-1"  ◀─ instances   │
│ Renderer / HUD               │  events       │   │    movement · AI · combat · mining  │
└──────────────────────────────┘               │   │    loot · docking · respawns        │
                                               │   └─ replication (interest management) │
                                               │ PlayerRepository ── SQLite (WAL)        │
                                               └─────────────────────────────────────────┘
```

**Server-authoritative.** The client never tells the server *what happened* – only *what the
pilot wants*: `{ mx, my, aim, fire, mine }`. Movement, hits, damage, mining yields, loot,
rewards and purchases are all computed on the server.

**Fixed tick.** `GameServer` runs every world at 20 Hz with a fixed `dt` and bounded catch-up,
so the simulation is deterministic and independent of timer jitter.

**Inputs.** Each input carries a sequence number. The server consumes **exactly one input per
tick** per player (excess inputs are dropped), so sending inputs faster cannot make a ship
faster. Values are clamped and checked for `NaN`/`Infinity`.

**Client-side prediction & reconciliation.** The client applies its own inputs immediately with
the *same* `stepShip()` function the server uses. Each snapshot contains the authoritative
ship state and the last processed input `ack`; the client rewinds to it, replays unacknowledged
inputs and smooths any residual error visually. The result is instant-feeling controls without
trusting the client.

**Entity interpolation.** Other ships and NPCs are rendered ~110 ms in the past, interpolated
between server snapshots (with a short extrapolation window for late packets) using an
estimated server clock.

**Interest management.** Each player only receives entities within `VIEW_RADIUS` (1500 units),
found through a per-tick `SpatialGrid`. Static deposits are sent at 2 Hz instead of 20 Hz.
Bandwidth per player is therefore bounded by local density, not by total players.

**Events.** Discrete things (shots, hits, explosions) are sent as compact events; clients simulate
projectile flight locally and remove them on server `hit` events. Your own shots are predicted
locally (visual only – damage is still server-side).

**World instances & scaling.**
- A `World` is one running instance of a map and owns all its entities – nothing is global – so a
  map can be sharded into several instances (`frontier-1`, `frontier-2`, …).
- Step 1 (now): one process, one instance per map.
- Step 2: several instances per map in one process when a map gets crowded.
- Step 3: multiple processes/machines, each hosting a set of worlds, with a thin gateway routing
  players to the right process, and PostgreSQL as the shared database. Cross-world services
  (auction house, direct trading, chat) become separate services that talk to the database and
  publish changes (e.g. Redis pub/sub). Because the economy already goes through transactional
  repository calls, this split does not change game logic.

**Sessions.** Accounts log in over HTTP and receive a random 256-bit session token (only its
SHA-256 hash is stored). The WebSocket's first message must be `auth` with that token. Logging
in a second time kicks the first connection after saving its state, so one account can never be
simulated twice (a classic duplication vector).

**Protection.** Max 4 KB per message, 80 messages/s per connection, auth timeout, per-IP rate
limit on login/registration, scrypt password hashing, timing-safe comparisons.

---

## 3. Database structure

Current schema (`server/src/db/migrations.ts`, versioned via `PRAGMA user_version`):

| Table | Purpose |
|---|---|
| `accounts(id, username UNIQUE NOCASE, password_hash, created_at)` | Login identity. |
| `sessions(token_hash PK, account_id, created_at, expires_at)` | Login sessions (hashed tokens). |
| `players(account_id PK, name, level, xp, credits CHECK ≥ 0, ship_class, map_id, x, y, hull, shield, kills, deaths, created_at, last_seen_at)` | Persistent pilot. |
| `player_resources(account_id, location ∈ {storage, cargo}, resource_id, amount CHECK ≥ 0)` | Resource balances – safe station storage vs. the ship's cargo hold. |
| `player_upgrades(account_id, track, level)` | Ship upgrade levels. |
| `ledger(id, account_id, asset, location, delta, balance_after, reason, created_at)` | Append-only economic audit log of every credit/resource change. |

Planned tables (designed now, added by migration in their phase):

| Phase | Table | Notes |
|---|---|---|
| 2 | `items(id, owner_id, def_id, rarity, level, rolls_json, bound BOOL, location ∈ {inventory, equipped, listed, trade, mail}, created_at)` | Every weapon/generator/drone is a unique row → duplication is detectable; `location` makes "listed" or "in trade" items unusable. |
| 2 | `ship_loadouts(account_id, ship_id, slot, item_id UNIQUE)` | Equipped weapons & generators. `UNIQUE(item_id)` makes double-equipping impossible. |
| 2 | `structures(account_id, type, level, last_collected_at)` | Idle production buildings. |
| 2 | `research(account_id, tech_id, level, completed_at)`, `research_queue(...)` | Technology tree. |
| 3 | `missions(account_id, mission_id, progress, state, expires_at)`, `discoveries(account_id, map_id)` | Missions & map unlocks. |
| 5 | `market_listings(id, seller_id, item_id NULL, resource_id NULL, quantity, unit_price, fee_paid, status ∈ {active, sold, cancelled, expired}, created_at, expires_at)` | Auction house. |
| 5 | `market_trades(id, listing_id, buyer_id, seller_id, quantity, unit_price, tax, created_at)` | Sales history + price analytics. |
| 5 | `trades(id, a_id, b_id, state, version)`, `trade_offers(trade_id, side, item_id/resource_id/credits, amount)` | Direct trading. |
| 6 | `ships(id, account_id, class, …)`, `drones(...)`, `stations(...)`, `fleet_tasks(...)`, `prestige(...)` | Advanced progression. |

---

## 4. How resources, inventory, equipment and progression interact

```
                     ┌──────────────┐  XP   ┌─────────────┐  stat bonus
  enemies ──kill───▶ │   rewards    │ ────▶ │ level / XP  │ ─────────────┐
  deposits ─mine───▶ │ (server)     │       └─────────────┘              ▼
  loot ─────pickup─▶ │              │ ──▶ cargo ──dock──▶ storage ──▶ upgrades / research / crafting
                     └──────────────┘                         │            │
                                                              ▼            ▼
                                                     auction house   computeShipStats()
                                                                           │
                         movement · combat · mining · cargo ◀──────────────┘
```

- **Single stat pipeline.** `computeShipStats({ shipClass, level, upgrades, … })` in `shared/`
  is the only place where final ship attributes are derived. Each progression system plugs a
  modifier into it: level bonus and upgrades today; equipped weapons/generators, technologies,
  drones and prestige later. The same function drives server rules and client UI.
- **Two resource locations.** Mined or looted resources go into the **cargo hold** (limited by
  cargo capacity, partially lost on death). Docking moves them into **storage** (per-resource cap,
  never lost). Spending (upgrades now; research, crafting and listings later) only uses storage.
  This creates the active-play loop *fly out → gather → return* and makes risk meaningful.
- **Wallet discipline.** All changes go through `PlayerState` methods (`addResource`,
  `removeResource`, `trySpendCredits`, …) that enforce capacity and non-negativity and record a
  ledger delta. Nothing else mutates balances.
- **Active vs. idle.** Active play yields rare drops, credits and XP that idle production will not
  (principle 3); idle production (Phase 2) fills storage with basic materials over time.

---

## 5. Offline production (Phase 2 design)

No background jobs are needed – production is a pure function of time:

1. Each structure stores `level` and `last_collected_at` (server timestamp).
2. On login (and whenever production is read or a structure changes), the server computes
   `elapsed = min(now − last_collected_at, offlineCap)`, where `offlineCap` starts at e.g. 8 h and
   is raised by Automation technologies.
3. Production is evaluated **in dependency order** (energy → mining → refineries/factories), each
   limited by its inputs and the storage caps, using the same rate formulas as online production.
   For long gaps this is evaluated in coarse steps so chains with input limits stay correct.
4. Results are added through the normal wallet methods (ledger reason `offline-production`),
   `last_collected_at` is set to `now` **in the same transaction**, and a summary is sent to the client.

Exploit resistance: only server time is used (client clocks are irrelevant); the cap prevents
infinite accumulation; updating the timestamp atomically with the payout means a second
login/reconnect can never collect the same interval twice; and the duplicate-login kick ensures
only one live session per account.

---

## 6. Securing the auction house and direct trading (Phase 5 design)

Principles: **server validates everything, every economic operation is one database transaction,
items are escrowed, and every change is logged.**

**Listing an item / resource**
1. Transaction: check ownership & tradability (`bound = 0`), check listing limit, charge the 2 %
   listing fee, move the item to `location = 'listed'` (or remove the resource quantity from
   storage into escrow), insert the listing. Any failed check rolls everything back.
2. Listed items can't be equipped, sold or traded – they are no longer in the inventory.

**Buying**
- Single transaction that runs
  `UPDATE market_listings SET status='sold' WHERE id=? AND status='active' AND expires_at > now`
  and **only proceeds if exactly one row changed**. Two simultaneous buyers can't both win; the
  second gets "already sold". Partial resource purchases use `quantity = quantity - ? WHERE quantity >= ?`.
- In the same transaction: debit buyer (`credits >= price` check constraint), credit seller minus
  5 % tax, move item ownership, write `market_trades` + ledger rows for both sides.
- SQLite serialises writers; with PostgreSQL the same statements run at `SERIALIZABLE`/row locks.
- Idempotency keys on purchase requests protect against double clicks / retries.

**Expiry & cancellation** – a periodic sweep (and lazy checks on read) returns expired listings
to the seller in a transaction; cancellation is the same operation triggered by the owner.

**Direct trading**
- A trade session has a `version` counter. Adding/removing anything increments it and resets both
  confirmations. A confirm message must contain the version the player saw.
- Execution happens only when both confirmations reference the current version, inside one
  transaction that re-validates ownership/balances of both sides, then swaps everything atomically.
- Offered items are escrowed (`location = 'trade'`) while the window is open and returned if it's
  cancelled or a player disconnects.

**Live-session interplay** – while a player is online their balances live in memory
(`PlayerState`). Cross-player operations will be executed through a small `EconomyService` that
updates the in-memory state and the database in the same step (flush + transaction), so neither
can drift. All of this is covered by an append-only ledger to audit and repair mistakes.

---

## 7. Roadmap

See [ROADMAP.md](ROADMAP.md).

---

## Code map

```
shared/src/            Game rules & data used by both sides
  physics.ts           Deterministic ship movement (prediction + authority)
  combat.ts            Damage, shields, armor, crits, evasion
  stats.ts             computeShipStats() – single stat pipeline
  progression.ts       XP curve and level-ups
  zones.ts             Safe zones / PvP rules
  protocol.ts          All network messages (typed)
  data/                Ships, upgrades, weapons, enemies, resources, maps

server/src/
  index.ts             Bootstrap (HTTP + WebSocket + game loop)
  auth/                Accounts, password hashing, session tokens
  db/                  SQLite, migrations, PlayerRepository (persistence)
  player/PlayerState   Authoritative per-player state + wallet + ledger
  economy/             Upgrade purchases (auction house, trading later)
  game/GameServer      Tick loop, sessions, message validation, saving
  game/World           One map instance; runs the systems each tick
  game/systems/        movement · combat · enemyAI · mining · loot · station · spawning
  game/replication     Interest-managed snapshots
  net/                 HTTP routes/static files, WebSocket gateway

client/src/
  main.ts              Boot: login → game
  game/Game.ts         Main loop: fixed-step input, prediction, events, rendering
  game/LocalShip.ts    Prediction & reconciliation
  game/ClientWorld.ts  Remote entity interpolation
  render/              Canvas renderer, camera, procedural sprites, particles
  ui/                  HUD, panels, login screen
```
