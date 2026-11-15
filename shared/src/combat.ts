export interface Damageable {
  hull: number;
  shield: number;
}

export interface AttackRoll {
  amount: number;
  crit: boolean;
  miss: boolean;
}

/** Rolls a single hit: evasion, crits and damage multipliers. */
export function rollAttack(
  baseDamage: number,
  attacker: { weaponDamage: number; critChance: number; critDamage: number },
  defender: { evasion: number },
  rng: () => number,
): AttackRoll {
  if (rng() < defender.evasion) return { amount: 0, crit: false, miss: true };
  const crit = rng() < attacker.critChance;
  const variance = 0.9 + rng() * 0.2;
  const amount = baseDamage * attacker.weaponDamage * variance * (crit ? attacker.critDamage : 1);
  return { amount, crit, miss: false };
}

/** Armor reduces hull damage with diminishing returns: 100 armor = 50% reduction. */
export function armorFactor(armor: number): number {
  return 100 / (100 + Math.max(0, armor));
}

/**
 * Applies damage: shields absorb first, the remainder hits the hull (reduced by armor).
 * Returns the effective damage dealt (shield + hull).
 */
export function applyDamage(target: Damageable, amount: number, armor: number): { shieldDmg: number; hullDmg: number } {
  const shieldDmg = Math.min(target.shield, amount);
  target.shield -= shieldDmg;
  const rest = amount - shieldDmg;
  const hullDmg = Math.min(target.hull, rest * armorFactor(armor));
  target.hull -= hullDmg;
  return { shieldDmg, hullDmg };
}
