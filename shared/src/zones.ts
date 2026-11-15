import { dist2 } from './math';
import type { MapDef } from './data/maps';

export function isInSafeZone(map: MapDef, x: number, y: number): boolean {
  for (const z of map.zones) {
    if (z.kind === 'safe' && dist2(x, y, z.x, z.y) <= z.radius * z.radius) return true;
  }
  return false;
}

/** PvP is allowed only on PvP-enabled maps or inside explicit PvP zones, and never in safe zones. */
export function isPvpAllowedAt(map: MapDef, x: number, y: number): boolean {
  if (isInSafeZone(map, x, y)) return false;
  if (map.pvpEnabled) return true;
  for (const z of map.zones) {
    if (z.kind === 'pvp' && dist2(x, y, z.x, z.y) <= z.radius * z.radius) return true;
  }
  return false;
}
