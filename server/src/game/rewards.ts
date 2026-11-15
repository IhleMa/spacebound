import type { PlayerEntity } from './entities';
import type { World } from './World';

/** Grants XP to a player and handles level-ups (full repair + notification). */
export function grantXp(_world: World, p: PlayerEntity, amount: number): void {
  const st = p.session.state;
  const gained = st.addXp(amount);
  if (gained > 0) {
    const stats = st.stats; // recomputed with the new level
    if (!p.dead) {
      p.hull = stats.maxHull;
      p.shield = stats.maxShield;
      p.energy = stats.maxEnergy;
    }
    p.session.notify('level', `Level up! You reached level ${st.level}. Hull, shields and damage increased.`);
  }
}
