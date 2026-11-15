import { TICK_DT, stepShip, type MoveInput, type SelfState, type ShipKinematics, type ShipStats } from '@spacebound/shared';

interface PendingInput extends MoveInput {
  seq: number;
}

/**
 * Client-side prediction for the player's own ship.
 *
 * Inputs are applied locally immediately (using the same deterministic physics as the
 * server) and kept until the server acknowledges them. When a snapshot arrives we rewind
 * to the authoritative state and replay the unacknowledged inputs. Any remaining visual
 * error is smoothed out instead of snapping.
 */
export class LocalShip {
  state: ShipKinematics = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };
  prev: ShipKinematics = { x: 0, y: 0, vx: 0, vy: 0, angle: 0 };
  server: SelfState | null = null;
  private pending: PendingInput[] = [];
  /** Visual error offset that decays to zero. */
  errX = 0;
  errY = 0;

  reset(self: SelfState): void {
    this.state = { x: self.x, y: self.y, vx: self.vx, vy: self.vy, angle: self.angle };
    this.prev = { ...this.state };
    this.pending = [];
    this.errX = this.errY = 0;
    this.server = self;
  }

  /** Applies one fixed-step input locally. */
  predict(input: PendingInput, stats: ShipStats, halfSize: number): void {
    this.prev = { ...this.state };
    if (this.server?.dead) return;
    stepShip(this.state, input, stats, TICK_DT, halfSize);
    this.pending.push(input);
    if (this.pending.length > 120) this.pending.shift();
  }

  reconcile(self: SelfState, ack: number, stats: ShipStats, halfSize: number): void {
    const wasDead = this.server?.dead;
    this.server = self;
    if (self.dead || wasDead) {
      this.reset(self);
      return;
    }
    const before = { x: this.state.x, y: this.state.y };
    this.pending = this.pending.filter((p) => p.seq > ack);
    const s: ShipKinematics = { x: self.x, y: self.y, vx: self.vx, vy: self.vy, angle: self.angle };
    for (const p of this.pending) stepShip(s, p, stats, TICK_DT, halfSize);

    const dx = before.x - s.x;
    const dy = before.y - s.y;
    if (dx * dx + dy * dy > 200 * 200) {
      // Teleport (respawn etc.) – don't smooth.
      this.errX = this.errY = 0;
      this.prev = { ...s };
    } else {
      this.errX += dx;
      this.errY += dy;
      // Keep previous-frame state consistent with the corrected one.
      this.prev.x -= dx;
      this.prev.y -= dy;
    }
    // Keep our locally predicted facing (it's driven by the mouse) to avoid jitter.
    s.angle = this.state.angle;
    this.state = s;
  }

  /** Render position interpolated between the last two fixed steps plus decaying error. */
  renderPos(alpha: number, dt: number): { x: number; y: number; angle: number } {
    const k = Math.pow(0.001, dt);
    this.errX *= k;
    this.errY *= k;
    const a = this.prev.angle + wrap(this.state.angle - this.prev.angle) * alpha;
    return {
      x: this.prev.x + (this.state.x - this.prev.x) * alpha + this.errX,
      y: this.prev.y + (this.state.y - this.prev.y) * alpha + this.errY,
      angle: a,
    };
  }
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
