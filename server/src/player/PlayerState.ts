import {
  BASE_STORAGE_CAPACITY,
  applyXp,
  bagTotal,
  computeShipStats,
  xpToNext,
  type MapId,
  type Profile,
  type ResourceBag,
  type ResourceId,
  type ShipClassId,
  type ShipStats,
  type UpgradeLevels,
} from '@spacebound/shared';

export type ResourceLocation = 'storage' | 'cargo';

interface LedgerDelta {
  asset: string;
  location: 'wallet' | ResourceLocation;
  reason: string;
  delta: number;
}

/**
 * Persistent, authoritative state of one player while they are online.
 *
 * All economic mutations go through the methods below so that
 *  - balances can never become negative,
 *  - storage caps are enforced,
 *  - every change is recorded in the ledger (flushed atomically with the state).
 */
export class PlayerState {
  dirty = false;
  profileDirty = true;
  private ledger = new Map<string, LedgerDelta>();
  private statsCache: ShipStats | null = null;

  constructor(
    readonly accountId: number,
    readonly name: string,
    public level: number,
    public xp: number,
    public credits: number,
    public shipClass: ShipClassId,
    public mapId: MapId,
    public x: number,
    public y: number,
    public hull: number | null,
    public shield: number | null,
    public kills: number,
    public deaths: number,
    public storage: ResourceBag,
    public cargo: ResourceBag,
    public upgrades: UpgradeLevels,
  ) {}

  get stats(): ShipStats {
    if (!this.statsCache) {
      this.statsCache = computeShipStats({ shipClass: this.shipClass, level: this.level, upgrades: this.upgrades });
    }
    return this.statsCache;
  }

  invalidateStats(): void {
    this.statsCache = null;
  }

  storageCap(): number {
    return BASE_STORAGE_CAPACITY;
  }

  cargoUsed(): number {
    return bagTotal(this.cargo);
  }

  cargoFree(): number {
    return Math.max(0, Math.floor(this.stats.cargoCapacity) - this.cargoUsed());
  }

  private touch(): void {
    this.dirty = true;
    this.profileDirty = true;
  }

  private record(asset: string, location: LedgerDelta['location'], reason: string, delta: number): void {
    if (delta === 0) return;
    const key = `${asset}|${location}|${reason}`;
    const e = this.ledger.get(key);
    if (e) e.delta += delta;
    else this.ledger.set(key, { asset, location, reason, delta });
  }

  /** Returns and clears pending ledger entries (called by the persistence layer inside its transaction). */
  drainLedger(): LedgerDelta[] {
    const out = [...this.ledger.values()].filter((e) => e.delta !== 0);
    this.ledger.clear();
    return out;
  }

  /** Puts ledger entries back if a save failed. */
  restoreLedger(entries: LedgerDelta[]): void {
    for (const e of entries) this.record(e.asset, e.location, e.reason, e.delta);
  }

  addCredits(amount: number, reason: string): void {
    amount = Math.floor(amount);
    if (amount <= 0) return;
    this.credits += amount;
    this.record('credits', 'wallet', reason, amount);
    this.touch();
  }

  /** Atomically checks and deducts credits. */
  trySpendCredits(amount: number, reason: string): boolean {
    amount = Math.floor(amount);
    if (amount < 0 || this.credits < amount) return false;
    this.credits -= amount;
    this.record('credits', 'wallet', reason, -amount);
    this.touch();
    return true;
  }

  getResource(location: ResourceLocation, res: ResourceId): number {
    return (location === 'storage' ? this.storage : this.cargo)[res] ?? 0;
  }

  /** Adds up to `amount` and returns how much was actually added (respecting capacity). */
  addResource(location: ResourceLocation, res: ResourceId, amount: number, reason: string): number {
    amount = Math.floor(amount);
    if (amount <= 0) return 0;
    const bag = location === 'storage' ? this.storage : this.cargo;
    const free = location === 'storage' ? this.storageCap() - (bag[res] ?? 0) : this.cargoFree();
    const added = Math.max(0, Math.min(amount, free));
    if (added <= 0) return 0;
    bag[res] = (bag[res] ?? 0) + added;
    this.record(res, location, reason, added);
    this.touch();
    return added;
  }

  /** Removes up to `amount`, returns how much was removed. */
  removeResource(location: ResourceLocation, res: ResourceId, amount: number, reason: string): number {
    amount = Math.floor(amount);
    const bag = location === 'storage' ? this.storage : this.cargo;
    const removed = Math.max(0, Math.min(amount, bag[res] ?? 0));
    if (removed <= 0) return 0;
    bag[res] = (bag[res] ?? 0) - removed;
    if (bag[res] === 0) delete bag[res];
    this.record(res, location, reason, -removed);
    this.touch();
    return removed;
  }

  hasResources(location: ResourceLocation, req: ResourceBag): boolean {
    for (const [k, v] of Object.entries(req)) {
      if (this.getResource(location, k as ResourceId) < (v ?? 0)) return false;
    }
    return true;
  }

  /** Grants XP; returns number of levels gained. */
  addXp(amount: number): number {
    amount = Math.floor(amount);
    if (amount <= 0) return 0;
    const r = applyXp(this.level, this.xp, amount);
    this.level = r.level;
    this.xp = r.xp;
    if (r.levelsGained > 0) this.invalidateStats();
    this.touch();
    return r.levelsGained;
  }

  markDirty(): void {
    this.touch();
  }

  toProfile(): Profile {
    return {
      name: this.name,
      level: this.level,
      xp: this.xp,
      xpNext: xpToNext(this.level),
      credits: this.credits,
      storage: { ...this.storage },
      storageCap: this.storageCap(),
      cargo: { ...this.cargo },
      shipClass: this.shipClass,
      upgrades: { ...this.upgrades },
      kills: this.kills,
      deaths: this.deaths,
    };
  }
}
