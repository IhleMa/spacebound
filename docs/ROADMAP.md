# Spacebound – Implementation Roadmap

Each phase ends with something playable and is built on the architecture in
[ARCHITECTURE.md](ARCHITECTURE.md), so later phases extend existing systems instead of rewriting them.

Legend: ✅ done · 🟡 partially done / foundation in place · ⬜ not started

## Phase 1 – Playable prototype ✅

Built **multiplayer-first**: instead of a single-player prototype that would have to be rewritten,
the first version already runs on the authoritative server, so movement, combat and mining
are real multiplayer from day one.

- ✅ Main game world (Frontier Sector) with station, safe zone, map bounds, background parallax
- ✅ Spaceship movement (WASD/arrows, smooth acceleration/deceleration, mouse aim, turn rate)
- ✅ Camera that smoothly follows the ship, screen shake
- ✅ Active resource collection: iron asteroids, copper meteorites, silicon crystals – mining beam,
  depletion and respawn, cargo hold, docking to unload into storage
- ✅ Basic NPC enemies: passive Scout Drones, aggressive Pirate Raiders, elite Pirate Captain
  (patrol, aggro, chase, strafe, leash/evade, never enter safe zones)
- ✅ Basic combat: lasers with cooldown/energy, shields → armor → hull, crits, evasion,
  damage numbers, explosions, loot containers, death & respawn without losing progression
- ✅ Resource counters, credits, XP and levels
- ✅ Ship statistics (all 16 attributes) and ship status UI
- ✅ Accounts, persistent progression (SQLite), economic ledger
- ✅ Real multiplayer: see other pilots in real time, shared enemies/deposits, cooperative reward split
- 🟡 Ship upgrades (Hull / Engines / Shields / Cargo, 10 levels each) – pulled forward from Phase 2
  so resources have a purpose in the prototype

## Phase 2 – Progression systems

- ⬜ Item system (`items` table) with rarities Common → Mythic
- ⬜ Weapon slots: laser, plasma, missile, railgun, pulse, ion, drone launcher
- ⬜ Generator slots (shield, reactor, engine, armor, mining, cargo, combat, regeneration) incl. unique effects
- ⬜ Inventory UI (equip, compare, salvage)
- ⬜ Idle production structures (mining drones, solar collectors, refineries, research labs,
  quantum extractors, factories) with offline progress & summary
- ⬜ First technology tree (Engineering, Weapons, Defense, Mining, Automation) with node UI
- ⬜ Level rewards (research points, slots), storage upgrades

## Phase 3 – World expansion

- ⬜ Maps 2–5: Asteroid Belt, Nebula Expanse, Void Sector, Ancient Ruins (jump gates, unlocks via tech/level)
- ⬜ Titanium, Plasma, Dark Matter, Quantum Crystals, Ancient Cores
- ⬜ New enemy types, elites with abilities, world bosses
- ⬜ Missions (daily/weekly/exploration/combat/resource/trading), exploration rewards

## Phase 4 – Multiplayer depth

- ✅ Accounts, real-time movement, shared world instances, enemy & resource sync (done in Phase 1)
- ⬜ PvP zones & open-PvP maps (rules already in `zones.ts`), kill feed, bounties, rankings
- ⬜ Multiplayer world events (defend mining sites, boss raids) with contribution-based rewards
- ⬜ Chat, groups, instance sharding with automatic load balancing

## Phase 5 – Player economy

- 🟡 Credits (earned from combat), ledger
- ⬜ Global auction house (listing fee 2 %, tax 5 %, 6/12/24/48 h durations, filters, sorting,
  price analytics, history) – transactional design in ARCHITECTURE.md §6
- ⬜ Direct player trading with versioned double confirmation
- ⬜ Commerce technologies (listing capacity, lower taxes, analytics, regional markets, auto-buy)

## Phase 6 – Advanced progression

- ⬜ Drone fleets (mining, combat, defense, collection)
- ⬜ Multiple ships (Scout, Fighter, Tank, Miner, Interceptor, Battleship – stats already defined)
- ⬜ Fleet management & automated missions
- ⬜ Player-owned space stations
- ⬜ Antimatter, endgame equipment, prestige/ascension

## Phase 7 – Polish & expansion

- ⬜ UI polish, VFX, sound, more content
- ⬜ Economy balancing using ledger data, performance work (binary protocol, WebGL renderer)
