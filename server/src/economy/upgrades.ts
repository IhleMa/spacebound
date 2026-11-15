import { UPGRADE_TRACKS, upgradeCost, type ResourceId, type UpgradeTrack } from '@spacebound/shared';
import type { PlayerSession } from '../game/PlayerSession';

export type UpgradeResult = { ok: true; level: number } | { ok: false; reason: string };

/**
 * Buys the next level of a ship upgrade track.
 * Fully validated on the server: the client merely requests a track.
 * Resources are taken from station storage (not from the cargo hold).
 */
export function purchaseUpgrade(session: PlayerSession, track: UpgradeTrack): UpgradeResult {
  const st = session.state;
  const def = UPGRADE_TRACKS[track];
  const current = st.upgrades[track] ?? 0;
  const cost = upgradeCost(track, current);
  if (!cost) return { ok: false, reason: `${def.name} is already at maximum level.` };
  if (st.credits < cost.credits) return { ok: false, reason: 'Not enough credits.' };
  if (!st.hasResources('storage', cost.resources)) return { ok: false, reason: 'Not enough resources in storage.' };

  // All checks passed – apply. PlayerState methods re-check every step, so a partial
  // application is impossible in this single-threaded tick model.
  const reason = `upgrade:${track}:${current + 1}`;
  if (!st.trySpendCredits(cost.credits, reason)) return { ok: false, reason: 'Not enough credits.' };
  for (const [res, amt] of Object.entries(cost.resources)) {
    st.removeResource('storage', res as ResourceId, amt ?? 0, reason);
  }

  // Keep hull / shield ratios when max values change.
  const before = st.stats;
  st.upgrades[track] = current + 1;
  st.invalidateStats();
  st.markDirty();
  const after = st.stats;
  const p = session.entity;
  if (p && !p.dead) {
    p.hull = (p.hull / before.maxHull) * after.maxHull;
    p.shield = (p.shield / before.maxShield) * after.maxShield;
  }
  return { ok: true, level: current + 1 };
}
