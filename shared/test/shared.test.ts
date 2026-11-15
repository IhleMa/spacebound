import { describe, expect, it } from 'vitest';
import {
  TICK_DT,
  applyDamage,
  applyXp,
  armorFactor,
  computeShipStats,
  emptyUpgrades,
  isInSafeZone,
  isPvpAllowedAt,
  MAPS,
  stepShip,
  upgradeCost,
  xpToNext,
  type ShipKinematics,
} from '../src';

describe('physics', () => {
  const stats = { speed: 300, acceleration: 900, maneuverability: 7 };

  it('is deterministic for identical inputs', () => {
    const a: ShipKinematics = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };
    const b: ShipKinematics = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };
    const inputs = Array.from({ length: 100 }, (_, i) => ({ mx: Math.sin(i), my: Math.cos(i * 0.7), aim: i * 0.1 }));
    for (const inp of inputs) {
      stepShip(a, inp, stats, TICK_DT, 3000);
      stepShip(b, inp, stats, TICK_DT, 3000);
    }
    expect(a).toEqual(b);
  });

  it('never exceeds max speed, even diagonally', () => {
    const s: ShipKinematics = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };
    for (let i = 0; i < 60; i++) stepShip(s, { mx: 1, my: 1, aim: 0 }, stats, TICK_DT, 100000);
    expect(Math.hypot(s.vx, s.vy)).toBeLessThanOrEqual(300 + 1e-9);
  });

  it('decelerates to a stop without input and respects map bounds', () => {
    const s: ShipKinematics = { x: 2990, y: 0, vx: 300, vy: 0, angle: 0 };
    for (let i = 0; i < 40; i++) stepShip(s, { mx: 0, my: 0, aim: 0 }, stats, TICK_DT, 3000);
    expect(s.vx).toBe(0);
    expect(s.x).toBeLessThanOrEqual(3000);
  });

  it('limits turn rate by maneuverability', () => {
    const s: ShipKinematics = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };
    stepShip(s, { mx: 0, my: 0, aim: Math.PI }, stats, TICK_DT, 3000);
    expect(Math.abs(s.angle)).toBeCloseTo(7 * TICK_DT, 6);
  });
});

describe('combat math', () => {
  it('shields absorb damage before hull and armor reduces hull damage', () => {
    const t = { hull: 100, shield: 30 };
    const r = applyDamage(t, 50, 100);
    expect(r.shieldDmg).toBe(30);
    expect(r.hullDmg).toBeCloseTo(20 * armorFactor(100));
    expect(t.shield).toBe(0);
    expect(t.hull).toBeCloseTo(90);
  });
});

describe('progression', () => {
  it('levels up and carries over excess xp', () => {
    const r = applyXp(1, 0, xpToNext(1) + 5);
    expect(r.level).toBe(2);
    expect(r.xp).toBe(5);
    expect(r.levelsGained).toBe(1);
  });

  it('upgrade costs grow and stats improve', () => {
    const c0 = upgradeCost('hull', 0)!;
    const c1 = upgradeCost('hull', 1)!;
    expect(c1.credits).toBeGreaterThan(c0.credits);
    expect(upgradeCost('hull', 10)).toBeNull();

    const base = computeShipStats({ shipClass: 'sparrow', level: 1, upgrades: emptyUpgrades() });
    const up = computeShipStats({ shipClass: 'sparrow', level: 1, upgrades: { ...emptyUpgrades(), hull: 2, engine: 1 } });
    expect(up.maxHull).toBeGreaterThan(base.maxHull);
    expect(up.speed).toBeGreaterThan(base.speed);
    const lvl = computeShipStats({ shipClass: 'sparrow', level: 5, upgrades: emptyUpgrades() });
    expect(lvl.weaponDamage).toBeGreaterThan(base.weaponDamage);
  });
});

describe('zones', () => {
  const map = MAPS.frontier!;
  it('station area is a safe zone without PvP', () => {
    expect(isInSafeZone(map, 0, 0)).toBe(true);
    expect(isInSafeZone(map, 2000, 0)).toBe(false);
    expect(isPvpAllowedAt(map, 2000, 0)).toBe(false); // Frontier is PvP-free
  });
});
