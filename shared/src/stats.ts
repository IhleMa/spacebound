import { SHIP_CLASSES, type ShipClassId, type ShipStats } from './data/ships';
import { UPGRADE_TRACKS, UPGRADE_TRACK_IDS, type UpgradeLevels } from './data/upgrades';

/** Bonus per player level (applied multiplicatively). */
export const LEVEL_BONUS = { maxHull: 0.03, maxShield: 0.03, weaponDamage: 0.02 } as const;

export interface StatSources {
  shipClass: ShipClassId;
  level: number;
  upgrades: UpgradeLevels;
}

/**
 * Computes final ship stats from all progression sources.
 * Shared by server (authoritative) and client (display + movement prediction),
 * so both always agree on e.g. max speed.
 *
 * Later phases plug equipment, generators, technologies and prestige in here.
 */
export function computeShipStats(src: StatSources): ShipStats {
  const s: ShipStats = { ...SHIP_CLASSES[src.shipClass].base };
  const mult: Partial<Record<keyof ShipStats, number>> = {};
  const add = (k: keyof ShipStats, v: number) => {
    mult[k] = (mult[k] ?? 1) + v;
  };

  const lv = Math.max(0, src.level - 1);
  add('maxHull', LEVEL_BONUS.maxHull * lv);
  add('maxShield', LEVEL_BONUS.maxShield * lv);
  add('weaponDamage', LEVEL_BONUS.weaponDamage * lv);

  for (const track of UPGRADE_TRACK_IDS) {
    const level = src.upgrades[track] ?? 0;
    if (level <= 0) continue;
    for (const [k, v] of Object.entries(UPGRADE_TRACKS[track].perLevel)) {
      add(k as keyof ShipStats, (v as number) * level);
    }
  }

  for (const [k, m] of Object.entries(mult)) {
    const key = k as keyof ShipStats;
    s[key] = s[key] * (m as number);
  }
  s.maxHull = Math.round(s.maxHull);
  s.maxShield = Math.round(s.maxShield);
  s.cargoCapacity = Math.round(s.cargoCapacity);
  return s;
}
