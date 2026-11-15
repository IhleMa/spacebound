import type { EnemyTypeId } from './enemies';
import type { ResourceId } from './resources';

export type MapId = 'frontier' | 'asteroid_belt' | 'nebula_expanse' | 'void_sector' | 'ancient_ruins';

export type DepositKind = 'asteroid' | 'crystal' | 'meteorite';

/** Spawn area: an annulus sector around (cx, cy). Angles in radians. */
export interface SpawnArea {
  cx: number;
  cy: number;
  minR: number;
  maxR: number;
  angleFrom?: number;
  angleTo?: number;
}

export interface DepositSpawn {
  resource: ResourceId;
  kind: DepositKind;
  count: number;
  area: SpawnArea;
  amount: [number, number];
  /** Multiplier on mining speed (harder deposits mine slower). */
  yieldFactor: number;
  respawnSeconds: [number, number];
}

export interface EnemySpawn {
  type: EnemyTypeId;
  count: number;
  area: SpawnArea;
}

export interface Station {
  id: string;
  name: string;
  x: number;
  y: number;
  /** Radius inside which cargo is automatically unloaded. */
  dockRadius: number;
}

export interface Zone {
  kind: 'safe' | 'pvp';
  x: number;
  y: number;
  radius: number;
}

export interface MapVisuals {
  bgInner: string;
  bgOuter: string;
  nebulae: { x: number; y: number; r: number; color: string }[];
  planets: { x: number; y: number; r: number; color: string; ring?: boolean; parallax: number }[];
}

export interface MapDef {
  id: MapId;
  name: string;
  difficulty: string;
  description: string;
  halfSize: number;
  spawn: { x: number; y: number };
  stations: Station[];
  zones: Zone[];
  /** Whether PvP is allowed at all on this map (outside of safe zones). */
  pvpEnabled: boolean;
  deposits: DepositSpawn[];
  enemies: EnemySpawn[];
  visuals: MapVisuals;
  availableFromPhase: number;
}

const D = Math.PI / 180;

export const MAPS: Partial<Record<MapId, MapDef>> = {
  frontier: {
    id: 'frontier',
    name: 'Frontier Sector',
    difficulty: 'Beginner',
    description: 'The outer edge of civilised space. Rich in basic minerals, patrolled by drones and pirates.',
    halfSize: 3200,
    spawn: { x: 0, y: 0 },
    stations: [{ id: 'haven', name: 'Haven Outpost', x: 0, y: 0, dockRadius: 260 }],
    zones: [{ kind: 'safe', x: 0, y: 0, radius: 700 }],
    pvpEnabled: false,
    deposits: [
      { resource: 'iron', kind: 'asteroid', count: 46, area: { cx: 0, cy: 0, minR: 850, maxR: 2300 }, amount: [60, 140], yieldFactor: 1, respawnSeconds: [25, 45] },
      { resource: 'copper', kind: 'meteorite', count: 22, area: { cx: 0, cy: 0, minR: 1200, maxR: 2900, angleFrom: -100 * D, angleTo: 10 * D }, amount: [50, 110], yieldFactor: 0.85, respawnSeconds: [30, 50] },
      { resource: 'silicon', kind: 'crystal', count: 18, area: { cx: 0, cy: 0, minR: 1400, maxR: 3000, angleFrom: 100 * D, angleTo: 230 * D }, amount: [40, 90], yieldFactor: 0.7, respawnSeconds: [35, 60] },
    ],
    enemies: [
      { type: 'scout_drone', count: 18, area: { cx: 0, cy: 0, minR: 1000, maxR: 2700 } },
      { type: 'pirate_raider', count: 9, area: { cx: 0, cy: 0, minR: 2000, maxR: 3000, angleFrom: -60 * D, angleTo: 60 * D } },
      { type: 'pirate_raider', count: 5, area: { cx: 0, cy: 0, minR: 2200, maxR: 3000, angleFrom: 150 * D, angleTo: 240 * D } },
      { type: 'pirate_captain', count: 1, area: { cx: 2650, cy: 0, minR: 0, maxR: 200 } },
    ],
    visuals: {
      bgInner: '#0b1630',
      bgOuter: '#03060f',
      nebulae: [
        { x: -1800, y: -1400, r: 1900, color: 'rgba(90, 60, 200, 0.16)' },
        { x: 2100, y: 900, r: 1700, color: 'rgba(30, 140, 220, 0.14)' },
        { x: 400, y: 2400, r: 1500, color: 'rgba(200, 60, 160, 0.10)' },
      ],
      planets: [
        { x: -900, y: -700, r: 220, color: '#3a6ea5', ring: true, parallax: 0.35 },
        { x: 1300, y: 1000, r: 120, color: '#a5573a', parallax: 0.25 },
      ],
    },
    availableFromPhase: 1,
  },
};

export function getMap(id: string): MapDef | undefined {
  return MAPS[id as MapId];
}

export const STARTING_MAP: MapId = 'frontier';
