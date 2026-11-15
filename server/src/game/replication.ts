import {
  DEPOSIT_SYNC_EVERY,
  dist2,
  round,
  type DepositSnap,
  type EnemySnap,
  type GameEvent,
  type LootSnap,
  type PlayerSnap,
  type SnapshotMsg,
} from '@spacebound/shared';
import type { World } from './World';

const pct = (v: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, Math.round((v / max) * 100))) : 0);

/**
 * Interest management: every player only receives what is within their view radius.
 * This keeps bandwidth bounded regardless of how many players share a world.
 */
export function replicate(world: World, onlineCount: number, now: number, viewRadius: number): void {
  const vr2 = viewRadius * viewRadius;
  const er2 = (viewRadius + 300) ** 2;
  const dr2 = (viewRadius + 500) ** 2;
  const depositTick = world.tick % DEPOSIT_SYNC_EVERY === 0;

  for (const p of world.players.values()) {
    const session = p.session;
    const st = session.state;
    const stats = st.stats;

    const players: PlayerSnap[] = [];
    world.playerGrid.query(p.x, p.y, viewRadius, (o) => {
      if (o.id === p.id || dist2(p.x, p.y, o.x, o.y) > vr2) return;
      const os = o.session.state;
      const ostats = os.stats;
      players.push({
        id: o.id, name: os.name, x: round(o.x), y: round(o.y), a: round(o.angle, 2),
        h: pct(o.hull, ostats.maxHull), s: pct(o.shield, ostats.maxShield),
        cls: os.shipClass, lvl: os.level, mining: o.miningDepositId, dead: o.dead,
      });
    });

    const enemies: EnemySnap[] = [];
    world.enemyGrid.query(p.x, p.y, viewRadius, (e) => {
      if (dist2(p.x, p.y, e.x, e.y) > vr2) return;
      enemies.push({
        id: e.id, type: e.def.id, x: round(e.x), y: round(e.y), a: round(e.angle, 2),
        h: pct(e.hull, e.def.hull), s: pct(e.shield, e.def.shield), hostile: e.state === 'chase',
      });
    });

    const loot: LootSnap[] = [];
    for (const l of world.loot.values()) {
      if (dist2(p.x, p.y, l.x, l.y) > vr2) continue;
      loot.push({ id: l.id, x: round(l.x), y: round(l.y), res: l.resource, amt: l.amount });
    }

    let deposits: DepositSnap[] | undefined;
    if (depositTick || session.forceDepositSync) {
      session.forceDepositSync = false;
      deposits = [];
      for (const d of world.deposits.values()) {
        if (dist2(p.x, p.y, d.x, d.y) > dr2) continue;
        deposits.push({ id: d.id, res: d.resource, kind: d.kind, x: round(d.x), y: round(d.y), r: d.r, amt: d.amount, max: d.max });
      }
    }

    const events: GameEvent[] = [];
    for (const ev of world.events) {
      if (dist2(p.x, p.y, ev.x, ev.y) <= er2) events.push(ev.ev);
    }

    const msg: SnapshotMsg = {
      t: 'snap',
      tick: world.tick,
      st: now,
      ack: p.lastProcessedSeq,
      self: {
        x: p.x, y: p.y, vx: p.vx, vy: p.vy, angle: p.angle,
        hull: round(Math.min(p.hull, stats.maxHull)), shield: round(Math.min(p.shield, stats.maxShield)),
        energy: round(p.energy), dead: p.dead, safe: p.safe, docked: p.docked, mining: p.miningDepositId,
      },
      players,
      enemies,
      loot,
      deposits,
      events,
      online: onlineCount,
    };
    session.send(msg);

    if (st.profileDirty && now - session.lastProfileSentAt >= 250) {
      st.profileDirty = false;
      session.lastProfileSentAt = now;
      session.send({ t: 'profile', profile: st.toProfile() });
    }
  }
}
