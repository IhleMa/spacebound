import {
  LOOT_LIFETIME,
  LOOT_OWNER_LOCK,
  STARTER_WEAPON,
  WEAPONS,
  applyDamage,
  isPvpAllowedAt,
  rollAttack,
  type WeaponDef,
} from '@spacebound/shared';
import type { Combatant, EnemyEntity, PlayerEntity, Projectile } from '../entities';
import type { World } from '../World';
import { grantXp } from '../rewards';
import { scheduleEnemyRespawn } from './spawning';

const MUZZLE_OFFSET = 8;
/** Projectiles are treated as small circles for hit detection. */
const PROJECTILE_RADIUS = 4;

export function spawnProjectile(
  world: World,
  owner: Combatant,
  weapon: WeaponDef,
  aim: number,
  mods: { weaponDamage: number; critChance: number; critDamage: number },
): void {
  const ox = owner.x + Math.cos(aim) * (owner.radius + MUZZLE_OFFSET);
  const oy = owner.y + Math.sin(aim) * (owner.radius + MUZZLE_OFFSET);
  const vx = Math.cos(aim) * weapon.projectileSpeed;
  const vy = Math.sin(aim) * weapon.projectileSpeed;
  const ttl = weapon.range / weapon.projectileSpeed;
  const proj: Projectile = {
    id: world.newId(),
    ownerId: owner.id,
    ownerKind: owner.kind,
    x: ox,
    y: oy,
    vx,
    vy,
    ttl,
    damage: weapon.damage,
    ...mods,
  };
  world.projectiles.push(proj);
  world.emit(ox, oy, {
    e: 'shot', id: proj.id, o: owner.id, ot: owner.kind,
    x: Math.round(ox), y: Math.round(oy), vx: Math.round(vx), vy: Math.round(vy),
    ttl: Math.round(ttl * 1000) / 1000, w: weapon.id,
  });
}

/** Fires player weapons when requested, enforcing cooldown and energy costs server-side. */
export function processPlayerFiring(world: World): void {
  const weapon = WEAPONS[STARTER_WEAPON];
  for (const p of world.players.values()) {
    if (p.dead || !p.input.fire || world.time < p.nextFireAt) continue;
    if (p.energy < weapon.energyCost) continue;
    const stats = p.session.state.stats;
    p.energy -= weapon.energyCost;
    p.nextFireAt = world.time + weapon.fireInterval;
    spawnProjectile(world, p, weapon, p.input.aim, stats);
  }
}

/** Returns t in [0,1] of the first intersection of segment (ax,ay)->(bx,by) with a circle, or -1. */
export function segmentCircleHit(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0; // starts inside
  if (a === 0) return -1;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

export function updateProjectiles(world: World, dt: number): void {
  const keep: Projectile[] = [];
  for (const pr of world.projectiles) {
    const nx = pr.x + pr.vx * dt;
    const ny = pr.y + pr.vy * dt;
    const midX = (pr.x + nx) / 2;
    const midY = (pr.y + ny) / 2;
    const reach = Math.hypot(nx - pr.x, ny - pr.y) / 2 + 60;

    let bestT = 2;
    let best: Combatant | null = null;

    const consider = (target: Combatant) => {
      const t = segmentCircleHit(pr.x, pr.y, nx, ny, target.x, target.y, target.radius + PROJECTILE_RADIUS);
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = target;
      }
    };

    if (pr.ownerKind === 'p') {
      world.enemyGrid.query(midX, midY, reach, (e) => consider(e));
      const shooter = world.players.get(pr.ownerId);
      if (shooter) {
        world.playerGrid.query(midX, midY, reach, (p) => {
          if (p.id !== pr.ownerId && !p.dead && canPlayerDamagePlayer(world, shooter, p)) consider(p);
        });
      }
    } else {
      world.playerGrid.query(midX, midY, reach, (p) => {
        if (!p.dead && !p.safe) consider(p);
      });
    }

    if (best) {
      const target = best as Combatant;
      const hx = pr.x + (nx - pr.x) * bestT;
      const hy = pr.y + (ny - pr.y) * bestT;
      if (target.kind === 'e') hitEnemy(world, pr, target, hx, hy);
      else hitPlayer(world, pr, target, hx, hy);
      continue;
    }

    pr.x = nx;
    pr.y = ny;
    pr.ttl -= dt;
    if (pr.ttl > 0) keep.push(pr);
  }
  world.projectiles = keep;
}

function canPlayerDamagePlayer(world: World, a: PlayerEntity, b: PlayerEntity): boolean {
  return isPvpAllowedAt(world.map, a.x, a.y) && isPvpAllowedAt(world.map, b.x, b.y);
}

function hitEnemy(world: World, pr: Projectile, e: EnemyEntity, hx: number, hy: number): void {
  const roll = rollAttack(pr.damage, pr, { evasion: 0 }, world.rng);
  const shieldBefore = e.shield;
  const { shieldDmg, hullDmg } = applyDamage(e, roll.amount, e.def.armor);
  e.lastDamageAt = world.time;

  if (pr.ownerKind === 'p' && world.players.has(pr.ownerId)) {
    e.threat.set(pr.ownerId, (e.threat.get(pr.ownerId) ?? 0) + shieldDmg + hullDmg);
    if (e.state !== 'chase' || !world.players.has(e.targetId)) {
      e.state = 'chase';
      e.targetId = pr.ownerId;
    }
  }

  world.emit(hx, hy, {
    e: 'hit', id: pr.id, tid: e.id, tt: 'e', x: Math.round(hx), y: Math.round(hy),
    dmg: Math.round(shieldDmg + hullDmg), crit: roll.crit, miss: roll.miss, sh: shieldBefore > 0,
  });

  if (e.hull <= 0) killEnemy(world, e);
}

function hitPlayer(world: World, pr: Projectile, p: PlayerEntity, hx: number, hy: number): void {
  const stats = p.session.state.stats;
  const roll = rollAttack(pr.damage, pr, stats, world.rng);
  const shieldBefore = p.shield;
  const { shieldDmg, hullDmg } = roll.miss ? { shieldDmg: 0, hullDmg: 0 } : applyDamage(p, roll.amount, stats.armor);
  if (!roll.miss) p.lastDamageAt = world.time;

  world.emit(hx, hy, {
    e: 'hit', id: pr.id, tid: p.id, tt: 'p', x: Math.round(hx), y: Math.round(hy),
    dmg: Math.round(shieldDmg + hullDmg), crit: roll.crit, miss: roll.miss, sh: shieldBefore > 0,
  });

  if (p.hull <= 0) {
    let killer = 'unknown forces';
    if (pr.ownerKind === 'e') {
      const e = world.enemies.get(pr.ownerId);
      killer = e ? e.def.name : 'an enemy';
    } else {
      const k = world.players.get(pr.ownerId);
      if (k) killer = k.session.state.name;
    }
    killPlayer(world, p, killer);
  }
}

export function killEnemy(world: World, e: EnemyEntity): void {
  world.enemies.delete(e.id);
  world.emit(e.x, e.y, { e: 'boom', x: Math.round(e.x), y: Math.round(e.y), size: e.radius });
  scheduleEnemyRespawn(world, e);

  // Reward everybody who contributed damage, proportional to their share.
  let total = 0;
  let topId = 0;
  let topDmg = -1;
  for (const [pid, dmg] of e.threat) {
    if (!world.players.has(pid)) continue;
    total += dmg;
    if (dmg > topDmg) {
      topDmg = dmg;
      topId = pid;
    }
  }
  if (total <= 0) return;

  const def = e.def;
  const creditsPool = Math.round(def.credits[0] + world.rng() * (def.credits[1] - def.credits[0]));
  for (const [pid, dmg] of e.threat) {
    const p = world.players.get(pid);
    if (!p) continue;
    const share = dmg / total;
    // Anyone who did a meaningful part of the work gets full XP – encourages co-op.
    const xp = share >= 0.15 ? def.xp : Math.ceil(def.xp * share);
    const credits = Math.max(1, Math.round(creditsPool * share));
    const st = p.session.state;
    st.addCredits(credits, `kill:${def.id}`);
    if (pid === topId) st.kills++;
    p.session.notify('success', `Destroyed ${def.name}  ·  +${xp} XP  ·  +${credits} CR`);
    grantXp(world, p, xp);
  }

  // Loot containers – exclusive to the top damage dealer for a short time.
  for (const entry of def.loot) {
    if (world.rng() > entry.chance) continue;
    const amount = Math.round(entry.min + world.rng() * (entry.max - entry.min));
    if (amount <= 0) continue;
    const id = world.newId();
    world.loot.set(id, {
      id,
      x: e.x + (world.rng() - 0.5) * 50,
      y: e.y + (world.rng() - 0.5) * 50,
      resource: entry.resource,
      amount,
      expiresAt: world.time + LOOT_LIFETIME,
      ownerId: topId,
      ownerUntil: world.time + LOOT_OWNER_LOCK,
    });
  }
}

export function killPlayer(world: World, p: PlayerEntity, killer: string): void {
  p.dead = true;
  p.hull = 0;
  p.shield = 0;
  p.vx = 0;
  p.vy = 0;
  p.miningDepositId = 0;
  p.inputQueue.length = 0;
  const st = p.session.state;
  st.deaths++;
  st.markDirty();
  world.emit(p.x, p.y, { e: 'boom', x: Math.round(p.x), y: Math.round(p.y), size: p.radius * 1.4 });

  // Mild death penalty: half of the cargo is dropped as free-for-all loot. Storage, equipment
  // and progression are never lost.
  let dropped = 0;
  for (const [res, amt] of Object.entries(st.cargo)) {
    const lose = Math.floor((amt ?? 0) / 2);
    if (lose <= 0) continue;
    const removed = st.removeResource('cargo', res as keyof typeof st.cargo, lose, 'death-drop');
    dropped += removed;
    const id = world.newId();
    world.loot.set(id, {
      id,
      x: p.x + (world.rng() - 0.5) * 60,
      y: p.y + (world.rng() - 0.5) * 60,
      resource: res as keyof typeof st.cargo,
      amount: removed,
      expiresAt: world.time + LOOT_LIFETIME,
      ownerId: 0,
      ownerUntil: 0,
    });
  }
  p.session.notify('error', `Your ship was destroyed by ${killer}.${dropped > 0 ? ` ${dropped} cargo units were jettisoned.` : ''}`);
}

export function respawnPlayer(world: World, p: PlayerEntity): void {
  if (!p.dead) return;
  const stats = p.session.state.stats;
  const spawn = world.map.spawn;
  p.dead = false;
  p.x = spawn.x + (world.rng() - 0.5) * 120;
  p.y = spawn.y + (world.rng() - 0.5) * 120;
  p.vx = 0;
  p.vy = 0;
  p.hull = stats.maxHull;
  p.shield = stats.maxShield;
  p.energy = stats.maxEnergy;
  p.lastDamageAt = -999;
  p.session.state.markDirty();
}

