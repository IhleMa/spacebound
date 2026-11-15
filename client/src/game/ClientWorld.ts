import {
  lerp,
  lerpAngle,
  type DepositSnap,
  type EnemySnap,
  type LootSnap,
  type PlayerSnap,
  type SnapshotMsg,
} from '@spacebound/shared';

interface Sample {
  t: number;
  x: number;
  y: number;
  a: number;
}

export interface Remote<S> {
  snap: S;
  samples: Sample[];
  /** Interpolated render state (updated every frame). */
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
}

const MAX_SAMPLES = 30;

function upsert<S extends { id: number; x: number; y: number; a: number }>(map: Map<number, Remote<S>>, list: S[], t: number): void {
  const seen = new Set<number>();
  for (const s of list) {
    seen.add(s.id);
    let r = map.get(s.id);
    if (!r) {
      r = { snap: s, samples: [], x: s.x, y: s.y, a: s.a, vx: 0, vy: 0 };
      map.set(s.id, r);
    }
    r.snap = s;
    r.samples.push({ t, x: s.x, y: s.y, a: s.a });
    if (r.samples.length > MAX_SAMPLES) r.samples.shift();
  }
  for (const id of map.keys()) if (!seen.has(id)) map.delete(id);
}

function interpolate<S>(r: Remote<S>, renderT: number): void {
  const s = r.samples;
  if (s.length === 0) return;
  if (renderT <= s[0].t || s.length === 1) {
    r.x = s[0].x;
    r.y = s[0].y;
    r.a = s[0].a;
    return;
  }
  for (let i = s.length - 1; i > 0; i--) {
    const a = s[i - 1];
    const b = s[i];
    if (renderT >= a.t) {
      const span = b.t - a.t || 1;
      // Allow slight extrapolation (max 100 ms) if packets are late.
      const k = Math.min((renderT - a.t) / span, 1 + 100 / span);
      r.x = lerp(a.x, b.x, k);
      r.y = lerp(a.y, b.y, k);
      r.a = lerpAngle(a.a, b.a, Math.min(k, 1));
      r.vx = ((b.x - a.x) / span) * 1000;
      r.vy = ((b.y - a.y) / span) * 1000;
      return;
    }
  }
}

/** Client-side mirror of what the server replicates to us (everything except our own ship). */
export class ClientWorld {
  players = new Map<number, Remote<PlayerSnap>>();
  enemies = new Map<number, Remote<EnemySnap>>();
  deposits = new Map<number, DepositSnap>();
  loot = new Map<number, LootSnap>();
  online = 0;

  /** Estimated offset between server clock and performance.now(). */
  private clockOffset: number | null = null;

  applySnapshot(msg: SnapshotMsg): { removedDeposits: number[] } {
    const sample = msg.st - performance.now();
    if (this.clockOffset === null || Math.abs(sample - this.clockOffset) > 1000) this.clockOffset = sample;
    // Packets arriving early tell us more about the true offset than late ones (jitter only adds delay).
    else if (sample > this.clockOffset) this.clockOffset += (sample - this.clockOffset) * 0.2;
    else this.clockOffset += (sample - this.clockOffset) * 0.02;

    upsert(this.players, msg.players, msg.st);
    upsert(this.enemies, msg.enemies, msg.st);

    this.loot.clear();
    for (const l of msg.loot) this.loot.set(l.id, l);

    const removedDeposits: number[] = [];
    if (msg.deposits) {
      const next = new Map<number, DepositSnap>();
      for (const d of msg.deposits) next.set(d.id, d);
      for (const id of this.deposits.keys()) if (!next.has(id)) removedDeposits.push(id);
      this.deposits = next;
    }
    this.online = msg.online;
    return { removedDeposits };
  }

  serverNow(): number {
    return performance.now() + (this.clockOffset ?? 0);
  }

  interpolate(delayMs: number): void {
    const t = this.serverNow() - delayMs;
    for (const r of this.players.values()) interpolate(r, t);
    for (const r of this.enemies.values()) interpolate(r, t);
  }

  clear(): void {
    this.players.clear();
    this.enemies.clear();
    this.deposits.clear();
    this.loot.clear();
    this.clockOffset = null;
  }
}
