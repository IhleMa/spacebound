import { WEAPONS, dist, isInSafeZone, stepShip, wrapAngle } from '@spacebound/shared';
import type { EnemyEntity, PlayerEntity } from '../entities';
import type { World } from '../World';
import { spawnProjectile } from './combat';

const NPC_MODS = { weaponDamage: 1, critChance: 0.03, critDamage: 1.5 };

function findAggroTarget(world: World, e: EnemyEntity): PlayerEntity | null {
  if (!e.def.aggressive) return null;
  let best: PlayerEntity | null = null;
  let bestD = e.def.aggroRange;
  world.playerGrid.query(e.x, e.y, e.def.aggroRange, (p) => {
    if (p.dead || p.safe) return;
    const d = dist(e.x, e.y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  });
  return best;
}

/** Steering helper: returns a normalized direction (mx,my) towards (tx,ty), scaled by `throttle`. */
function steer(e: EnemyEntity, tx: number, ty: number, throttle: number): { mx: number; my: number } {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return { mx: 0, my: 0 };
  return { mx: (dx / d) * throttle, my: (dy / d) * throttle };
}

/** Pushes the steering vector away from safe zones – NPCs never enter them. */
function avoidSafeZones(world: World, e: EnemyEntity, mv: { mx: number; my: number }): void {
  for (const z of world.map.zones) {
    if (z.kind !== 'safe') continue;
    const dx = e.x - z.x;
    const dy = e.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    const margin = z.radius + 120;
    if (d < margin) {
      const push = (margin - d) / 120;
      mv.mx += (dx / d) * push * 2;
      mv.my += (dy / d) * push * 2;
    }
  }
}

export function updateEnemies(world: World, dt: number): void {
  for (const e of world.enemies.values()) {
    const def = e.def;
    let mv = { mx: 0, my: 0 };
    let aim = e.angle;

    // Shield regeneration when not recently hit.
    if (world.time - e.lastDamageAt > 4 && e.shield < def.shield) {
      e.shield = Math.min(def.shield, e.shield + def.shieldRegen * dt);
    }

    const target = e.targetId ? world.players.get(e.targetId) : undefined;
    const homeDist = dist(e.x, e.y, e.homeX, e.homeY);

    if (e.state === 'chase') {
      if (!target || target.dead || target.safe || homeDist > def.leashRange) {
        e.state = 'return';
        e.targetId = 0;
        e.threat.clear();
      }
    }

    if (e.state === 'idle') {
      const t = findAggroTarget(world, e);
      if (t) {
        e.state = 'chase';
        e.targetId = t.id;
      } else {
        if (world.time >= e.nextWanderAt || dist(e.x, e.y, e.wanderX, e.wanderY) < 30) {
          const a = world.rng() * Math.PI * 2;
          const r = world.rng() * 260;
          e.wanderX = e.homeX + Math.cos(a) * r;
          e.wanderY = e.homeY + Math.sin(a) * r;
          e.nextWanderAt = world.time + 3 + world.rng() * 4;
        }
        mv = steer(e, e.wanderX, e.wanderY, 0.35);
        aim = Math.atan2(e.wanderY - e.y, e.wanderX - e.x);
      }
    }

    if (e.state === 'chase') {
      const t = world.players.get(e.targetId)!;
      const d = dist(e.x, e.y, t.x, t.y);
      const dx = (t.x - e.x) / (d || 1);
      const dy = (t.y - e.y) / (d || 1);
      if (world.time >= e.nextStrafeSwitchAt) {
        e.strafeDir = world.rng() < 0.5 ? -1 : 1;
        e.nextStrafeSwitchAt = world.time + 1.5 + world.rng() * 2.5;
      }
      let radial = 0;
      if (d > def.preferredRange + 60) radial = 1;
      else if (d < def.preferredRange - 60) radial = -0.8;
      mv = { mx: dx * radial + -dy * e.strafeDir * 0.6, my: dy * radial + dx * e.strafeDir * 0.6 };

      // Lead the target a little.
      const weapon = WEAPONS[def.weapon];
      const tFlight = d / weapon.projectileSpeed;
      const lx = t.x + t.vx * tFlight * 0.7;
      const ly = t.y + t.vy * tFlight * 0.7;
      aim = Math.atan2(ly - e.y, lx - e.x);

      const facing = Math.abs(wrapAngle(aim - e.angle)) < 0.35;
      if (facing && d <= weapon.range && world.time >= e.nextFireAt) {
        e.nextFireAt = world.time + weapon.fireInterval * (0.85 + world.rng() * 0.3);
        const spread = (world.rng() - 0.5) * 0.12;
        spawnProjectile(world, e, weapon, e.angle + spread, NPC_MODS);
      }
    }

    if (e.state === 'return') {
      mv = steer(e, e.homeX, e.homeY, 0.8);
      aim = Math.atan2(e.homeY - e.y, e.homeX - e.x);
      // No regeneration while retreating – players can still finish it off.
      // Once home, the enemy resets (classic MMO "evade" behaviour).
      if (homeDist < 120) {
        e.state = 'idle';
        e.hull = def.hull;
        e.shield = def.shield;
        e.threat.clear();
      }
    }

    avoidSafeZones(world, e, mv);
    stepShip(e, { mx: mv.mx, my: mv.my, aim }, e.stats, dt, world.map.halfSize);

    // Hard guarantee: never inside a safe zone.
    if (isInSafeZone(world.map, e.x, e.y)) {
      for (const z of world.map.zones) {
        if (z.kind !== 'safe') continue;
        const dx = e.x - z.x;
        const dy = e.y - z.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < z.radius) {
          e.x = z.x + (dx / d) * z.radius;
          e.y = z.y + (dy / d) * z.radius;
        }
      }
    }
  }
}
