import type { ResourceId } from './resources';

export type EnemyTypeId = 'scout_drone' | 'pirate_raider' | 'pirate_captain';

export interface LootEntry {
  resource: ResourceId;
  min: number;
  max: number;
  chance: number;
}

export interface EnemyDef {
  id: EnemyTypeId;
  name: string;
  description: string;
  level: number;
  hull: number;
  shield: number;
  shieldRegen: number;
  armor: number;
  speed: number;
  acceleration: number;
  turnRate: number;
  radius: number;
  weapon: string;
  /** Aggressive enemies attack players on sight, passive ones only when provoked. */
  aggressive: boolean;
  aggroRange: number;
  /** Distance from the spawn point after which the enemy gives up and returns. */
  leashRange: number;
  /** Distance the enemy tries to keep from its target. */
  preferredRange: number;
  xp: number;
  credits: [number, number];
  loot: LootEntry[];
  color: string;
  respawnSeconds: [number, number];
  elite?: boolean;
}

export const ENEMIES: Record<EnemyTypeId, EnemyDef> = {
  scout_drone: {
    id: 'scout_drone', name: 'Scout Drone', level: 1,
    description: 'A weak automated drone. Only fights back when attacked.',
    hull: 90, shield: 30, shieldRegen: 6, armor: 0, speed: 230, acceleration: 500, turnRate: 6,
    radius: 14, weapon: 'drone_zapper', aggressive: false, aggroRange: 0, leashRange: 1300, preferredRange: 300,
    xp: 12, credits: [8, 14],
    loot: [
      { resource: 'iron', min: 4, max: 10, chance: 0.55 },
      { resource: 'copper', min: 3, max: 7, chance: 0.35 },
    ],
    color: '#ffd04d', respawnSeconds: [12, 20],
  },
  pirate_raider: {
    id: 'pirate_raider', name: 'Pirate Raider', level: 3,
    description: 'Opportunistic space pirate. Attacks anyone who strays too close.',
    hull: 220, shield: 90, shieldRegen: 8, armor: 8, speed: 270, acceleration: 600, turnRate: 5,
    radius: 19, weapon: 'pirate_blaster', aggressive: true, aggroRange: 520, leashRange: 1600, preferredRange: 380,
    xp: 34, credits: [20, 35],
    loot: [
      { resource: 'copper', min: 6, max: 14, chance: 0.5 },
      { resource: 'silicon', min: 4, max: 10, chance: 0.4 },
      { resource: 'iron', min: 8, max: 18, chance: 0.4 },
    ],
    color: '#ff5a4d', respawnSeconds: [18, 30],
  },
  pirate_captain: {
    id: 'pirate_captain', name: 'Pirate Captain', level: 6, elite: true,
    description: 'An elite pirate commander guarding the hideout. Hits hard.',
    hull: 900, shield: 400, shieldRegen: 15, armor: 20, speed: 220, acceleration: 450, turnRate: 3.5,
    radius: 28, weapon: 'pirate_blaster', aggressive: true, aggroRange: 650, leashRange: 1200, preferredRange: 420,
    xp: 160, credits: [120, 180],
    loot: [
      { resource: 'silicon', min: 25, max: 50, chance: 1 },
      { resource: 'copper', min: 25, max: 50, chance: 1 },
    ],
    color: '#ff2e63', respawnSeconds: [90, 120],
  },
};
