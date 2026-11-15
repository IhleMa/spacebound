/** All attributes a ship can have. Units: per second for rates, world units for distances. */
export interface ShipStats {
  maxHull: number;
  maxShield: number;
  shieldRegen: number;
  armor: number;
  speed: number;
  acceleration: number;
  /** Turn rate of the hull in radians/second (how fast the ship can face the aim direction). */
  maneuverability: number;
  cargoCapacity: number;
  weaponDamage: number; // multiplier, 1 = 100%
  maxEnergy: number;
  energyRegen: number;
  critChance: number; // 0..1
  critDamage: number; // multiplier applied on crit, e.g. 1.5
  evasion: number; // 0..1 chance to evade a hit
  miningEfficiency: number; // resource units per second while mining
  collectionRange: number; // mining / loot pickup range
}

export type ShipClassId = 'sparrow' | 'scout' | 'fighter' | 'tank' | 'miner' | 'interceptor' | 'battleship';

export interface ShipClassDef {
  id: ShipClassId;
  name: string;
  role: string;
  description: string;
  base: ShipStats;
  weaponSlots: number;
  generatorSlots: number;
  /** Collision / hit radius. */
  radius: number;
  /** Phase in which the class becomes obtainable. */
  availableFromPhase: number;
}

const base = (s: Partial<ShipStats>): ShipStats => ({
  maxHull: 400,
  maxShield: 200,
  shieldRegen: 12,
  armor: 10,
  speed: 320,
  acceleration: 900,
  maneuverability: 7,
  cargoCapacity: 150,
  weaponDamage: 1,
  maxEnergy: 100,
  energyRegen: 14,
  critChance: 0.05,
  critDamage: 1.5,
  evasion: 0.03,
  miningEfficiency: 6,
  collectionRange: 170,
  ...s,
});

export const SHIP_CLASSES: Record<ShipClassId, ShipClassDef> = {
  sparrow: {
    id: 'sparrow', name: 'Sparrow', role: 'Starter',
    description: 'A dependable all-round starter vessel issued to every new pilot.',
    base: base({}), weaponSlots: 1, generatorSlots: 1, radius: 18, availableFromPhase: 1,
  },
  scout: {
    id: 'scout', name: 'Wayfinder', role: 'Scout',
    description: 'High speed, low durability, excellent exploration capabilities.',
    base: base({ maxHull: 300, maxShield: 160, speed: 430, acceleration: 1200, maneuverability: 9, evasion: 0.08, collectionRange: 220 }),
    weaponSlots: 1, generatorSlots: 2, radius: 16, availableFromPhase: 6,
  },
  fighter: {
    id: 'fighter', name: 'Talon', role: 'Fighter',
    description: 'High damage output, designed for combat.',
    base: base({ maxHull: 450, weaponDamage: 1.3, critChance: 0.1, maxEnergy: 140 }),
    weaponSlots: 3, generatorSlots: 2, radius: 19, availableFromPhase: 6,
  },
  tank: {
    id: 'tank', name: 'Bulwark', role: 'Tank',
    description: 'High health and shields, low mobility.',
    base: base({ maxHull: 900, maxShield: 500, armor: 35, speed: 240, acceleration: 600, maneuverability: 4.5 }),
    weaponSlots: 2, generatorSlots: 3, radius: 24, availableFromPhase: 6,
  },
  miner: {
    id: 'miner', name: 'Prospector', role: 'Miner',
    description: 'Large cargo hold and efficient resource collection.',
    base: base({ cargoCapacity: 400, miningEfficiency: 12, collectionRange: 240, weaponDamage: 0.8 }),
    weaponSlots: 1, generatorSlots: 3, radius: 22, availableFromPhase: 6,
  },
  interceptor: {
    id: 'interceptor', name: 'Viper', role: 'Interceptor',
    description: 'Extremely fast, designed for PvP and hunting other players.',
    base: base({ maxHull: 350, speed: 480, acceleration: 1400, maneuverability: 10, critChance: 0.12, evasion: 0.1 }),
    weaponSlots: 2, generatorSlots: 2, radius: 17, availableFromPhase: 6,
  },
  battleship: {
    id: 'battleship', name: 'Dreadnought', role: 'Battleship',
    description: 'Expensive endgame ship with many slots, high durability and damage.',
    base: base({ maxHull: 2000, maxShield: 1200, armor: 60, speed: 220, acceleration: 500, maneuverability: 3.5, weaponDamage: 1.6, maxEnergy: 300, energyRegen: 30 }),
    weaponSlots: 6, generatorSlots: 5, radius: 34, availableFromPhase: 6,
  },
};

export const STARTER_SHIP: ShipClassId = 'sparrow';
