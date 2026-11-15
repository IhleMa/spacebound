import {
  RESOURCES,
  SAFE_ZONE_REPAIR_RATE,
  SHIELD_REGEN_DELAY,
  dist2,
  type ResourceId,
} from '@spacebound/shared';
import type { World } from '../World';

/** Docking (cargo unload), safe-zone repairs and passive shield / energy regeneration. */
export function processStationsAndRegen(world: World, dt: number): void {
  for (const p of world.players.values()) {
    if (p.dead) {
      p.docked = false;
      continue;
    }
    const st = p.session.state;
    const stats = st.stats;

    // Energy
    p.energy = Math.min(stats.maxEnergy, p.energy + stats.energyRegen * dt);

    // Shields (instant regen start in safe zones)
    if ((p.safe || world.time - p.lastDamageAt >= SHIELD_REGEN_DELAY) && p.shield < stats.maxShield) {
      p.shield = Math.min(stats.maxShield, p.shield + stats.shieldRegen * (p.safe ? 3 : 1) * dt);
    }

    // Hull repair only in safe zones
    if (p.safe && p.hull < stats.maxHull) {
      p.hull = Math.min(stats.maxHull, p.hull + stats.maxHull * SAFE_ZONE_REPAIR_RATE * dt);
    }

    // Docking
    let docked = false;
    for (const s of world.map.stations) {
      if (dist2(p.x, p.y, s.x, s.y) <= s.dockRadius * s.dockRadius) {
        docked = true;
        break;
      }
    }
    if (docked && !p.docked) p.session.notify('info', 'Docked at Haven Outpost. Cargo is transferred to storage.');
    p.docked = docked;

    if (docked && st.cargoUsed() > 0) {
      const moved: string[] = [];
      let blocked = false;
      for (const [res, amt] of Object.entries(st.cargo)) {
        const id = res as ResourceId;
        const free = st.storageCap() - st.getResource('storage', id);
        const n = Math.min(amt ?? 0, free);
        if (n <= 0) {
          blocked = true;
          continue;
        }
        st.removeResource('cargo', id, n, 'unload');
        st.addResource('storage', id, n, 'unload');
        moved.push(`${n} ${RESOURCES[id].name}`);
        if (n < (amt ?? 0)) blocked = true;
      }
      if (moved.length) p.session.notify('success', `Unloaded ${moved.join(', ')}.`);
      if (blocked && world.time - p.cargoFullNotifiedAt > 15) {
        p.cargoFullNotifiedAt = world.time;
        p.session.notify('warn', 'Storage full for some resources – spend them on upgrades.');
      }
    }
  }
}
