import { RESOURCES, dist2 } from '@spacebound/shared';
import type { World } from '../World';

/** Loot containers: expiry and pickup (fly within collection range). */
export function updateLoot(world: World): void {
  for (const l of world.loot.values()) {
    if (world.time >= l.expiresAt) {
      world.loot.delete(l.id);
      continue;
    }
    const locked = l.ownerId !== 0 && world.time < l.ownerUntil;
    world.playerGrid.query(l.x, l.y, 300, (p) => {
      if (l.amount <= 0 || p.dead) return;
      if (locked && p.id !== l.ownerId) return;
      const range = p.session.state.stats.collectionRange * 0.6;
      if (dist2(p.x, p.y, l.x, l.y) > range * range) return;
      const added = p.session.state.addResource('cargo', l.resource, l.amount, 'loot');
      if (added > 0) {
        l.amount -= added;
        p.session.notify('loot', `+${added} ${RESOURCES[l.resource].name}`);
      } else if (world.time - p.cargoFullNotifiedAt > 8) {
        p.cargoFullNotifiedAt = world.time;
        p.session.notify('warn', 'Cargo hold full – return to Haven Outpost to unload.');
      }
    });
    if (l.amount <= 0) world.loot.delete(l.id);
  }
}
