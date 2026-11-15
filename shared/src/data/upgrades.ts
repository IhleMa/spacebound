import type { ResourceId } from './resources';
import type { ShipStats } from './ships';

export type UpgradeTrack = 'hull' | 'engine' | 'shield' | 'cargo';

export interface UpgradeCost {
  credits: number;
  resources: Partial<Record<ResourceId, number>>;
}

export interface UpgradeTrackDef {
  id: UpgradeTrack;
  name: string;
  description: string;
  maxLevel: number;
  /** Cost of going from level 0 to 1. Each further level multiplies by `costGrowth`. */
  baseCost: UpgradeCost;
  costGrowth: number;
  /** Multiplicative bonus per level for each affected stat (0.1 = +10% per level). */
  perLevel: Partial<Record<keyof ShipStats, number>>;
}

export const UPGRADE_TRACKS: Record<UpgradeTrack, UpgradeTrackDef> = {
  hull: {
    id: 'hull', name: 'Hull Plating', description: 'Increases maximum hull and armor.',
    maxLevel: 10, costGrowth: 1.6,
    baseCost: { credits: 50, resources: { iron: 60, copper: 20 } },
    perLevel: { maxHull: 0.12, armor: 0.08 },
  },
  engine: {
    id: 'engine', name: 'Engines', description: 'Increases speed, acceleration and maneuverability.',
    maxLevel: 10, costGrowth: 1.6,
    baseCost: { credits: 60, resources: { iron: 40, copper: 40 } },
    perLevel: { speed: 0.05, acceleration: 0.08, maneuverability: 0.06 },
  },
  shield: {
    id: 'shield', name: 'Shield Emitters', description: 'Increases shield capacity and regeneration.',
    maxLevel: 10, costGrowth: 1.6,
    baseCost: { credits: 80, resources: { copper: 40, silicon: 30 } },
    perLevel: { maxShield: 0.12, shieldRegen: 0.1 },
  },
  cargo: {
    id: 'cargo', name: 'Cargo Bay', description: 'Increases cargo capacity, collection range and mining efficiency.',
    maxLevel: 10, costGrowth: 1.6,
    baseCost: { credits: 40, resources: { iron: 50, silicon: 20 } },
    perLevel: { cargoCapacity: 0.2, collectionRange: 0.05, miningEfficiency: 0.08 },
  },
};

export const UPGRADE_TRACK_IDS = Object.keys(UPGRADE_TRACKS) as UpgradeTrack[];

export type UpgradeLevels = Record<UpgradeTrack, number>;

export function emptyUpgrades(): UpgradeLevels {
  return { hull: 0, engine: 0, shield: 0, cargo: 0 };
}

export function isUpgradeTrack(v: unknown): v is UpgradeTrack {
  return typeof v === 'string' && v in UPGRADE_TRACKS;
}

/** Cost to buy the next level when currently at `currentLevel`. Returns null when maxed. */
export function upgradeCost(track: UpgradeTrack, currentLevel: number): UpgradeCost | null {
  const def = UPGRADE_TRACKS[track];
  if (currentLevel >= def.maxLevel) return null;
  const mult = def.costGrowth ** currentLevel;
  const resources: Partial<Record<ResourceId, number>> = {};
  for (const [k, v] of Object.entries(def.baseCost.resources)) {
    resources[k as ResourceId] = Math.round((v as number) * mult);
  }
  return { credits: Math.round(def.baseCost.credits * mult), resources };
}
