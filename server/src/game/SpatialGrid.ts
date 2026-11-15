/**
 * Uniform spatial hash for broad-phase queries (collisions, interest management).
 * Rebuilt every tick – cheap for the entity counts of a single world instance and
 * keeps queries O(nearby) instead of O(all entities).
 */
export class SpatialGrid<T extends { x: number; y: number }> {
  private cells = new Map<number, T[]>();

  constructor(private cellSize: number) {}

  private key(cx: number, cy: number): number {
    // Pack two 16-bit signed cell coordinates into one number.
    return ((cx + 32768) << 16) | (cy + 32768);
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const k = this.key(Math.floor(item.x / this.cellSize), Math.floor(item.y / this.cellSize));
    let cell = this.cells.get(k);
    if (!cell) this.cells.set(k, (cell = []));
    cell.push(item);
  }

  rebuild(items: Iterable<T>): void {
    this.clear();
    for (const it of items) this.insert(it);
  }

  /** Calls `fn` for every item whose cell intersects the circle; caller does the exact distance check. */
  query(x: number, y: number, radius: number, fn: (item: T) => void): void {
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (cell) for (const it of cell) fn(it);
      }
    }
  }
}
