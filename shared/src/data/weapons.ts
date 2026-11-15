export type WeaponType = 'laser' | 'plasma' | 'missile' | 'railgun' | 'pulse' | 'ion' | 'drone';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export const RARITIES: Record<Rarity, { name: string; color: string; order: number }> = {
  common: { name: 'Common', color: '#c9d3e0', order: 1 },
  uncommon: { name: 'Uncommon', color: '#5cff8d', order: 2 },
  rare: { name: 'Rare', color: '#4da6ff', order: 3 },
  epic: { name: 'Epic', color: '#b46bff', order: 4 },
  legendary: { name: 'Legendary', color: '#ffb340', order: 5 },
  mythic: { name: 'Mythic', color: '#ff4d6d', order: 6 },
};

export interface WeaponDef {
  id: string;
  name: string;
  type: WeaponType;
  rarity: Rarity;
  damage: number;
  /** Seconds between shots. */
  fireInterval: number;
  range: number;
  projectileSpeed: number;
  energyCost: number;
  color: string;
  /** Phase in which the weapon becomes obtainable. */
  availableFromPhase: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  laser_mk1: {
    id: 'laser_mk1', name: 'Mk-I Laser Cannon', type: 'laser', rarity: 'common',
    damage: 14, fireInterval: 0.28, range: 760, projectileSpeed: 1100, energyCost: 5,
    color: '#5ce1ff', availableFromPhase: 1,
  },
  // NPC weapons
  drone_zapper: {
    id: 'drone_zapper', name: 'Drone Zapper', type: 'laser', rarity: 'common',
    damage: 7, fireInterval: 0.9, range: 520, projectileSpeed: 700, energyCost: 0,
    color: '#ffd04d', availableFromPhase: 1,
  },
  pirate_blaster: {
    id: 'pirate_blaster', name: 'Pirate Blaster', type: 'plasma', rarity: 'common',
    damage: 13, fireInterval: 0.75, range: 640, projectileSpeed: 820, energyCost: 0,
    color: '#ff5a4d', availableFromPhase: 1,
  },
};

export const STARTER_WEAPON = 'laser_mk1';
