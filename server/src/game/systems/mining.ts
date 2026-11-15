import { RESOURCES, dist } from '@spacebound/shared';
import type { Deposit, PlayerEntity } from '../entities';
import type { World } from '../World';
import { grantXp } from '../rewards';
import { scheduleDepositRespawn } from './spawning';

/** XP granted per mined resource unit. */
const XP_PER_UNIT = 0.5;

function findMineable(world: World, p: PlayerEntity, range: number): Deposit | null {
  let best: Deposit | null = null;
  let bestD = Infinity;
  world.depositGrid.query(p.x, p.y, range + 80, (d) => {
    if (d.amount <= 0) return;
    const dd = dist(p.x, p.y, d.x, d.y) - d.r;
    if (dd <= range && dd < bestD) {
      bestD = dd;
      best = d;
    }
  });
  return best;
}

/**
 * Server-side mining: the client only says "I want to mine"; range checks, rates,
 * deposit depletion and cargo limits are all decided here.
 */
export function processMining(world: World, dt: number): void {
  let depositsChanged = false;
  for (const p of world.players.values()) {
    if (p.dead || !p.input.mine) {
      p.miningDepositId = 0;
      p.mineAccum = 0;
      continue;
    }
    const st = p.session.state;
    const stats = st.stats;
    const deposit = findMineable(world, p, stats.collectionRange);
    if (!deposit) {
      p.miningDepositId = 0;
      continue;
    }
    if (st.cargoFree() <= 0) {
      p.miningDepositId = 0;
      if (world.time - p.cargoFullNotifiedAt > 8) {
        p.cargoFullNotifiedAt = world.time;
        p.session.notify('warn', 'Cargo hold full – return to Haven Outpost to unload.');
      }
      continue;
    }
    if (p.miningDepositId !== deposit.id) p.mineAccum = 0;
    p.miningDepositId = deposit.id;
    p.mineAccum += stats.miningEfficiency * deposit.yieldFactor * dt;
    const whole = Math.floor(p.mineAccum);
    if (whole <= 0) continue;
    p.mineAccum -= whole;

    const take = Math.min(whole, deposit.amount);
    const added = st.addResource('cargo', deposit.resource, take, 'mining');
    deposit.amount -= added;
    p.mineXpAccum += added * XP_PER_UNIT;
    if (p.mineXpAccum >= 1) {
      const xp = Math.floor(p.mineXpAccum);
      p.mineXpAccum -= xp;
      grantXp(world, p, xp);
    }

    if (deposit.amount <= 0) {
      world.deposits.delete(deposit.id);
      world.emit(deposit.x, deposit.y, { e: 'boom', x: Math.round(deposit.x), y: Math.round(deposit.y), size: deposit.r * 0.6 });
      scheduleDepositRespawn(world, deposit);
      p.miningDepositId = 0;
      p.session.notify('info', `${RESOURCES[deposit.resource].name} deposit depleted.`);
      depositsChanged = true;
    }
  }
  if (depositsChanged) world.depositGrid.rebuild(world.deposits.values());
}
