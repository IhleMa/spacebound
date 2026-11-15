import {
  STARTER_SHIP,
  STARTING_MAP,
  emptyUpgrades,
  getMap,
  isResourceId,
  isUpgradeTrack,
  type MapId,
  type ResourceBag,
  type ShipClassId,
  SHIP_CLASSES,
} from '@spacebound/shared';
import type { DB } from './database';
import { PlayerState } from '../player/PlayerState';

interface PlayerRow {
  account_id: number;
  name: string;
  level: number;
  xp: number;
  credits: number;
  ship_class: string;
  map_id: string;
  x: number;
  y: number;
  hull: number | null;
  shield: number | null;
  kills: number;
  deaths: number;
}

export class PlayerRepository {
  constructor(private db: DB) {}

  /** Loads a player's state, creating a fresh starter profile on first login. */
  loadOrCreate(accountId: number, name: string): PlayerState {
    let row = this.db.prepare('SELECT * FROM players WHERE account_id = ?').get(accountId) as PlayerRow | undefined;
    if (!row) {
      const map = getMap(STARTING_MAP)!;
      const now = Date.now();
      this.db
        .prepare(
          `INSERT INTO players (account_id, name, ship_class, map_id, x, y, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(accountId, name, STARTER_SHIP, STARTING_MAP, map.spawn.x, map.spawn.y, now, now);
      row = this.db.prepare('SELECT * FROM players WHERE account_id = ?').get(accountId) as PlayerRow;
    }

    const storage: ResourceBag = {};
    const cargo: ResourceBag = {};
    const resRows = this.db
      .prepare('SELECT location, resource_id, amount FROM player_resources WHERE account_id = ?')
      .all(accountId) as { location: string; resource_id: string; amount: number }[];
    for (const r of resRows) {
      if (!isResourceId(r.resource_id) || r.amount <= 0) continue;
      (r.location === 'cargo' ? cargo : storage)[r.resource_id] = r.amount;
    }

    const upgrades = emptyUpgrades();
    const upRows = this.db
      .prepare('SELECT track, level FROM player_upgrades WHERE account_id = ?')
      .all(accountId) as { track: string; level: number }[];
    for (const u of upRows) if (isUpgradeTrack(u.track)) upgrades[u.track] = u.level;

    const shipClass = (row.ship_class in SHIP_CLASSES ? row.ship_class : STARTER_SHIP) as ShipClassId;
    const mapId = (getMap(row.map_id) ? row.map_id : STARTING_MAP) as MapId;

    return new PlayerState(
      row.account_id, row.name, row.level, row.xp, row.credits, shipClass, mapId,
      row.x, row.y, row.hull, row.shield, row.kills, row.deaths, storage, cargo, upgrades,
    );
  }

  /** Persists a batch of player states atomically (state + ledger entries). */
  saveMany(states: PlayerState[]): void {
    if (states.length === 0) return;
    const now = Date.now();
    const upPlayer = this.db.prepare(
      `UPDATE players SET level=?, xp=?, credits=?, ship_class=?, map_id=?, x=?, y=?, hull=?, shield=?,
         kills=?, deaths=?, last_seen_at=? WHERE account_id=?`,
    );
    const delRes = this.db.prepare('DELETE FROM player_resources WHERE account_id = ?');
    const insRes = this.db.prepare(
      'INSERT INTO player_resources (account_id, location, resource_id, amount) VALUES (?, ?, ?, ?)',
    );
    const upUpgrade = this.db.prepare(
      `INSERT INTO player_upgrades (account_id, track, level) VALUES (?, ?, ?)
       ON CONFLICT(account_id, track) DO UPDATE SET level = excluded.level`,
    );
    const insLedger = this.db.prepare(
      `INSERT INTO ledger (account_id, asset, location, delta, balance_after, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    const drained = new Map<PlayerState, ReturnType<PlayerState['drainLedger']>>();
    try {
      this.db.transaction(() => {
        for (const s of states) {
          upPlayer.run(s.level, s.xp, s.credits, s.shipClass, s.mapId, s.x, s.y, s.hull, s.shield,
            s.kills, s.deaths, now, s.accountId);
          delRes.run(s.accountId);
          for (const [res, amt] of Object.entries(s.storage)) if (amt && amt > 0) insRes.run(s.accountId, 'storage', res, amt);
          for (const [res, amt] of Object.entries(s.cargo)) if (amt && amt > 0) insRes.run(s.accountId, 'cargo', res, amt);
          for (const [track, level] of Object.entries(s.upgrades)) upUpgrade.run(s.accountId, track, level);
          const entries = s.drainLedger();
          drained.set(s, entries);
          for (const e of entries) {
            const balance = e.asset === 'credits' ? s.credits
              : (e.location === 'cargo' ? s.cargo : s.storage)[e.asset as keyof ResourceBag] ?? 0;
            insLedger.run(s.accountId, e.asset, e.location, e.delta, balance, e.reason, now);
          }
        }
      })();
      for (const s of states) s.dirty = false;
    } catch (err) {
      // Transaction rolled back: keep ledger entries so nothing is lost on the next attempt.
      for (const [s, entries] of drained) s.restoreLedger(entries);
      throw err;
    }
  }
}
