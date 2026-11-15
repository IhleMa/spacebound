export const MAX_LEVEL = 100;

/** Total XP required to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.55));
}

/** Applies gained XP; returns new level / xp and how many levels were gained. */
export function applyXp(level: number, xp: number, gained: number): { level: number; xp: number; levelsGained: number } {
  let l = level;
  let x = xp + gained;
  let levelsGained = 0;
  while (l < MAX_LEVEL && x >= xpToNext(l)) {
    x -= xpToNext(l);
    l++;
    levelsGained++;
  }
  if (l >= MAX_LEVEL) x = 0;
  return { level: l, xp: x, levelsGained };
}
