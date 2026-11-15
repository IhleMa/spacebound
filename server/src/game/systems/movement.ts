import { isInSafeZone, stepShip } from '@spacebound/shared';
import type { World } from '../World';

/**
 * Consumes exactly one queued input per player per tick (prevents speed hacks by input
 * flooding) and advances ship movement with the shared deterministic physics step.
 */
export function processPlayerMovement(world: World, dt: number): void {
  for (const p of world.players.values()) {
    const next = p.inputQueue.shift();
    if (next) {
      p.input = next;
      p.lastProcessedSeq = next.seq;
    }
    if (p.dead) {
      p.vx = 0;
      p.vy = 0;
      continue;
    }
    stepShip(p, p.input, p.session.state.stats, dt, world.map.halfSize);
    p.safe = isInSafeZone(world.map, p.x, p.y);
  }
}
