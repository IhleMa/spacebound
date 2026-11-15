import { clamp, wrapAngle } from './math';
import type { ShipStats } from './data/ships';

export interface ShipKinematics {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
}

/** Movement-relevant part of a player input. */
export interface MoveInput {
  /** Horizontal thrust direction (-1..1). */
  mx: number;
  /** Vertical thrust direction (-1..1). */
  my: number;
  /** Direction the pilot is aiming (radians). */
  aim: number;
}

/** Brake strength relative to acceleration when no thrust is applied. */
const BRAKE_FACTOR = 0.7;

/**
 * Deterministic ship movement step.
 *
 * Runs on the server (authoritative) AND on the client (prediction / reconciliation).
 * Both must call it with identical inputs and fixed dt so results match.
 */
export function stepShip(
  s: ShipKinematics,
  input: MoveInput,
  stats: Pick<ShipStats, 'speed' | 'acceleration' | 'maneuverability'>,
  dt: number,
  halfSize: number,
): void {
  let ix = clamp(input.mx, -1, 1);
  let iy = clamp(input.my, -1, 1);
  const len = Math.hypot(ix, iy);
  if (len > 1) {
    ix /= len;
    iy /= len;
  }

  // Steer velocity towards the desired velocity (smooth acceleration & deceleration).
  const tx = ix * stats.speed;
  const ty = iy * stats.speed;
  const accel = len > 0 ? stats.acceleration : stats.acceleration * BRAKE_FACTOR;
  const dx = tx - s.vx;
  const dy = ty - s.vy;
  const d = Math.hypot(dx, dy);
  const step = accel * dt;
  if (d <= step) {
    s.vx = tx;
    s.vy = ty;
  } else {
    s.vx += (dx / d) * step;
    s.vy += (dy / d) * step;
  }

  s.x += s.vx * dt;
  s.y += s.vy * dt;

  // Map bounds.
  if (s.x < -halfSize) { s.x = -halfSize; s.vx = Math.max(0, s.vx); }
  if (s.x > halfSize) { s.x = halfSize; s.vx = Math.min(0, s.vx); }
  if (s.y < -halfSize) { s.y = -halfSize; s.vy = Math.max(0, s.vy); }
  if (s.y > halfSize) { s.y = halfSize; s.vy = Math.min(0, s.vy); }

  // Rotate hull towards the aim direction, limited by maneuverability.
  const diff = wrapAngle(input.aim - s.angle);
  const maxTurn = stats.maneuverability * dt;
  s.angle = wrapAngle(s.angle + clamp(diff, -maxTurn, maxTurn));
}
