export type ResourceId =
  | 'iron'
  | 'copper'
  | 'silicon'
  | 'titanium'
  | 'energy'
  | 'plasma'
  | 'darkMatter'
  | 'quantumCrystals'
  | 'antimatter'
  | 'ancientCores';

export interface ResourceDef {
  id: ResourceId;
  name: string;
  tier: 'basic' | 'advanced';
  color: string;
  description: string;
  /** Phase in which the resource becomes obtainable. Used to hide not-yet-reachable resources in the UI. */
  availableFromPhase: number;
}

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  iron: { id: 'iron', name: 'Iron', tier: 'basic', color: '#b8c4d6', description: 'Basic construction material.', availableFromPhase: 1 },
  copper: { id: 'copper', name: 'Copper', tier: 'basic', color: '#e8955a', description: 'Used for electronics and basic technology.', availableFromPhase: 1 },
  silicon: { id: 'silicon', name: 'Silicon', tier: 'basic', color: '#7fe3ff', description: 'Used for computers and advanced technology.', availableFromPhase: 1 },
  titanium: { id: 'titanium', name: 'Titanium', tier: 'basic', color: '#d9e2ff', description: 'Used for ship construction and armor.', availableFromPhase: 3 },
  energy: { id: 'energy', name: 'Energy', tier: 'basic', color: '#ffe066', description: 'Used for operating systems and research.', availableFromPhase: 2 },
  plasma: { id: 'plasma', name: 'Plasma', tier: 'advanced', color: '#ff5fd2', description: 'Used for advanced weapons.', availableFromPhase: 3 },
  darkMatter: { id: 'darkMatter', name: 'Dark Matter', tier: 'advanced', color: '#9b6bff', description: 'Used for high-tier technologies.', availableFromPhase: 3 },
  quantumCrystals: { id: 'quantumCrystals', name: 'Quantum Crystals', tier: 'advanced', color: '#5cffc8', description: 'Used for advanced generators.', availableFromPhase: 3 },
  antimatter: { id: 'antimatter', name: 'Antimatter', tier: 'advanced', color: '#ff6b6b', description: 'Used for powerful endgame upgrades.', availableFromPhase: 6 },
  ancientCores: { id: 'ancientCores', name: 'Ancient Cores', tier: 'advanced', color: '#ffb84d', description: 'Rare drops from bosses.', availableFromPhase: 3 },
};

export const RESOURCE_IDS = Object.keys(RESOURCES) as ResourceId[];

export function isResourceId(v: unknown): v is ResourceId {
  return typeof v === 'string' && v in RESOURCES;
}

export type ResourceBag = Partial<Record<ResourceId, number>>;

export function bagTotal(bag: ResourceBag): number {
  let t = 0;
  for (const k in bag) t += bag[k as ResourceId] ?? 0;
  return t;
}
