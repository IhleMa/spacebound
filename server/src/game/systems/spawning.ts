import { ENEMIES, isInSafeZone, type SpawnArea } from '@spacebound/shared';
import type { Deposit, EnemyEntity } from '../entities';
import type { World } from '../World';

/** Random point inside an annulus sector, kept away from safe zones. */
export function randomPointIn(world: World, area: SpawnArea, avoidSafe = true): { x: number; y: number } {
  const from = area.angleFrom ?? 0;
  const to = area.angleTo ?? Math.PI * 2;
  const lim = world.map.halfSize - 60;
  for (let i = 0; i < 30; i++) {
    const a = from + world.rng() * (to - from);
    const r = Math.sqrt(area.minR ** 2 + world.rng() * (area.maxR ** 2 - area.minR ** 2));
    const x = Math.max(-lim, Math.min(lim, area.cx + Math.cos(a) * r));
    const y = Math.max(-lim, Math.min(lim, area.cy + Math.sin(a) * r));
    if (!avoidSafe) return { x, y };
    let ok = true;
    for (const z of world.map.zones) {
      if (z.kind === 'safe' && Math.hypot(x - z.x, y - z.y) < z.radius + 200) ok = false;
    }
    if (ok) return { x, y };
  }
  return { x: area.cx, y: area.cy };
}

function spawnDeposit(world: World, spawnIndex: number): void {
  const cfg = world.map.deposits[spawnIndex];
  for (let attempt = 0; attempt < 10; attempt++) {
    const pt = randomPointIn(world, cfg.area);
    // Don't overlap other deposits.
    let overlap = false;
    for (const d of world.deposits.values()) {
      if (Math.hypot(d.x - pt.x, d.y - pt.y) < d.r + 80) {
        overlap = true;
        break;
      }
    }
    if (overlap && attempt < 9) continue;
    const amount = Math.round(cfg.amount[0] + world.rng() * (cfg.amount[1] - cfg.amount[0]));
    const t = (amount - cfg.amount[0]) / Math.max(1, cfg.amount[1] - cfg.amount[0]);
    const baseR = cfg.kind === 'asteroid' ? 28 : cfg.kind === 'meteorite' ? 24 : 22;
    const dep: Deposit = {
      id: world.newId(),
      spawnIndex,
      resource: cfg.resource,
      kind: cfg.kind,
      x: pt.x,
      y: pt.y,
      r: Math.round(baseR + t * 18),
      amount,
      max: amount,
      yieldFactor: cfg.yieldFactor,
    };
    world.deposits.set(dep.id, dep);
    return;
  }
}

function spawnEnemy(world: World, spawnIndex: number): void {
  const cfg = world.map.enemies[spawnIndex];
  const def = ENEMIES[cfg.type];
  const pt = randomPointIn(world, cfg.area);
  const e: EnemyEntity = {
    kind: 'e',
    id: world.newId(),
    def,
    spawnIndex,
    homeX: pt.x,
    homeY: pt.y,
    x: pt.x,
    y: pt.y,
    vx: 0,
    vy: 0,
    angle: world.rng() * Math.PI * 2,
    radius: def.radius,
    hull: def.hull,
    shield: def.shield,
    state: 'idle',
    targetId: 0,
    wanderX: pt.x,
    wanderY: pt.y,
    nextWanderAt: 0,
    nextFireAt: 0,
    lastDamageAt: -999,
    strafeDir: 1,
    nextStrafeSwitchAt: 0,
    threat: new Map(),
    stats: { speed: def.speed, acceleration: def.acceleration, maneuverability: def.turnRate },
  };
  if (isInSafeZone(world.map, e.x, e.y)) return;
  world.enemies.set(e.id, e);
}

export function spawnInitial(world: World): void {
  world.map.deposits.forEach((cfg, i) => {
    for (let n = 0; n < cfg.count; n++) spawnDeposit(world, i);
  });
  world.map.enemies.forEach((cfg, i) => {
    for (let n = 0; n < cfg.count; n++) spawnEnemy(world, i);
  });
}

export function scheduleEnemyRespawn(world: World, e: EnemyEntity): void {
  const [a, b] = e.def.respawnSeconds;
  world.respawnQueue.push({ at: world.time + a + world.rng() * (b - a), kind: 'enemy', spawnIndex: e.spawnIndex });
}

export function scheduleDepositRespawn(world: World, d: Deposit): void {
  const [a, b] = world.map.deposits[d.spawnIndex].respawnSeconds;
  world.respawnQueue.push({ at: world.time + a + world.rng() * (b - a), kind: 'deposit', spawnIndex: d.spawnIndex });
}

export function processRespawns(world: World): void {
  if (world.respawnQueue.length === 0) return;
  const due = world.respawnQueue.filter((r) => r.at <= world.time);
  if (due.length === 0) return;
  world.respawnQueue = world.respawnQueue.filter((r) => r.at > world.time);
  let depositsChanged = false;
  for (const r of due) {
    if (r.kind === 'enemy') spawnEnemy(world, r.spawnIndex);
    else {
      spawnDeposit(world, r.spawnIndex);
      depositsChanged = true;
    }
  }
  if (depositsChanged) world.depositGrid.rebuild(world.deposits.values());
}
