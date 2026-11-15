import {
  VIEW_RADIUS,
  computeShipStats,
  type GameEvent,
  type MapDef,
} from '@spacebound/shared';
import { NEUTRAL_INPUT, type Deposit, type EnemyEntity, type Loot, type PlayerEntity, type Projectile } from './entities';
import type { PlayerSession } from './PlayerSession';
import { SpatialGrid } from './SpatialGrid';
import { processPlayerMovement } from './systems/movement';
import { processPlayerFiring, updateProjectiles } from './systems/combat';
import { updateEnemies } from './systems/enemyAI';
import { processMining } from './systems/mining';
import { updateLoot } from './systems/loot';
import { processStationsAndRegen } from './systems/station';
import { processRespawns, spawnInitial } from './systems/spawning';
import { replicate } from './replication';

export interface RespawnEntry {
  at: number;
  kind: 'enemy' | 'deposit';
  spawnIndex: number;
}

export interface PositionedEvent {
  x: number;
  y: number;
  ev: GameEvent;
}

/**
 * One running instance of a map. Owns all entities on that map and runs the
 * authoritative simulation. Multiple instances of the same map can exist
 * (sharding) – nothing in here is global.
 */
export class World {
  tick = 0;
  /** Simulation time in seconds. */
  time = 0;
  private nextEntityId = 1;

  readonly players = new Map<number, PlayerEntity>();
  readonly enemies = new Map<number, EnemyEntity>();
  readonly deposits = new Map<number, Deposit>();
  readonly loot = new Map<number, Loot>();
  projectiles: Projectile[] = [];
  events: PositionedEvent[] = [];
  respawnQueue: RespawnEntry[] = [];

  readonly playerGrid = new SpatialGrid<PlayerEntity>(400);
  readonly enemyGrid = new SpatialGrid<EnemyEntity>(400);
  readonly depositGrid = new SpatialGrid<Deposit>(400);

  constructor(
    readonly instanceId: string,
    readonly map: MapDef,
    readonly rng: () => number = Math.random,
  ) {
    spawnInitial(this);
    this.depositGrid.rebuild(this.deposits.values());
  }

  newId(): number {
    return this.nextEntityId++;
  }

  emit(x: number, y: number, ev: GameEvent): void {
    this.events.push({ x, y, ev });
  }

  addPlayer(session: PlayerSession): PlayerEntity {
    const st = session.state;
    const stats = computeShipStats({ shipClass: st.shipClass, level: st.level, upgrades: st.upgrades });
    const inBounds = Math.abs(st.x) <= this.map.halfSize && Math.abs(st.y) <= this.map.halfSize;
    const dead = st.hull !== null && st.hull <= 0;
    const spawn = this.map.spawn;
    const p: PlayerEntity = {
      kind: 'p',
      id: this.newId(),
      session,
      x: inBounds && !dead ? st.x : spawn.x,
      y: inBounds && !dead ? st.y : spawn.y,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      radius: 18,
      hull: st.hull !== null && st.hull > 0 ? Math.min(st.hull, stats.maxHull) : stats.maxHull,
      shield: st.shield !== null ? Math.min(Math.max(0, st.shield), stats.maxShield) : stats.maxShield,
      energy: stats.maxEnergy,
      dead: false,
      safe: false,
      docked: false,
      lastDamageAt: -999,
      nextFireAt: 0,
      input: { ...NEUTRAL_INPUT },
      inputQueue: [],
      lastProcessedSeq: 0,
      miningDepositId: 0,
      mineAccum: 0,
      mineXpAccum: 0,
      cargoFullNotifiedAt: -999,
    };
    session.entity = p;
    this.players.set(p.id, p);
    return p;
  }

  removePlayer(session: PlayerSession): void {
    const p = session.entity;
    if (!p) return;
    this.syncPlayerToState(p);
    this.players.delete(p.id);
    session.entity = null;
  }

  /** Copies volatile in-world values to the persistent state before saving. */
  syncPlayerToState(p: PlayerEntity): void {
    const st = p.session.state;
    st.x = p.x;
    st.y = p.y;
    st.hull = p.dead ? 0 : p.hull;
    st.shield = p.shield;
    st.mapId = this.map.id;
  }

  /** Advances the simulation by one fixed step. */
  step(dt: number): void {
    this.tick++;
    this.time += dt;
    this.events = [];

    processPlayerMovement(this, dt);
    this.playerGrid.rebuild(this.players.values());
    updateEnemies(this, dt);
    this.enemyGrid.rebuild(this.enemies.values());
    processPlayerFiring(this);
    updateProjectiles(this, dt);
    processMining(this, dt);
    updateLoot(this);
    processStationsAndRegen(this, dt);
    processRespawns(this);
  }

  /** Sends per-player snapshots (interest-managed). */
  broadcast(onlineCount: number, now: number): void {
    replicate(this, onlineCount, now, VIEW_RADIUS);
  }

  playerByAccount(accountId: number): PlayerEntity | undefined {
    for (const p of this.players.values()) if (p.session.accountId === accountId) return p;
    return undefined;
  }
}
