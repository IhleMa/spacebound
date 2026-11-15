import {
  MAPS,
  MAX_INPUT_QUEUE,
  TICK_DT,
  TICK_MS,
  UPGRADE_TRACKS,
  isUpgradeTrack,
  type ClientMsg,
  type MapId,
} from '@spacebound/shared';
import type { AccountRef } from '../auth/AuthService';
import type { PlayerRepository } from '../db/PlayerRepository';
import { purchaseUpgrade } from '../economy/upgrades';
import { PlayerSession, type Connection } from './PlayerSession';
import { World } from './World';
import { respawnPlayer } from './systems/combat';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Top-level game orchestrator: owns world instances, routes sessions, runs the fixed
 * tick loop and periodic persistence.
 */
export class GameServer {
  readonly worlds = new Map<MapId, World>();
  readonly sessions = new Map<number, PlayerSession>();
  private tickTimer: NodeJS.Timeout | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private lastTickAt = 0;
  private accumulator = 0;

  constructor(private repo: PlayerRepository, private saveIntervalMs = 10_000) {
    for (const map of Object.values(MAPS)) {
      if (map) this.worlds.set(map.id, new World(`${map.id}-1`, map));
    }
  }

  start(): void {
    this.lastTickAt = performance.now();
    this.tickTimer = setInterval(() => this.loop(), TICK_MS / 2);
    this.saveTimer = setInterval(() => this.saveAll(), this.saveIntervalMs);
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.tickTimer = this.saveTimer = null;
    for (const s of [...this.sessions.values()]) this.leave(s);
  }

  /** Fixed-timestep loop with catch-up (bounded) so simulation speed is independent of timer jitter. */
  private loop(): void {
    const now = performance.now();
    this.accumulator += now - this.lastTickAt;
    this.lastTickAt = now;
    let steps = 0;
    while (this.accumulator >= TICK_MS && steps < 5) {
      this.tick();
      this.accumulator -= TICK_MS;
      steps++;
    }
    if (steps === 5) this.accumulator = 0;
  }

  /** Runs one simulation step on every world and sends snapshots. Public for tests. */
  tick(): void {
    const now = Date.now();
    const online = this.sessions.size;
    for (const w of this.worlds.values()) {
      w.step(TICK_DT);
      w.broadcast(online, now);
    }
  }

  join(conn: Connection, account: AccountRef): PlayerSession {
    const existing = this.sessions.get(account.id);
    if (existing) {
      existing.send({ t: 'kicked', reason: 'Logged in from another location.' });
      this.leave(existing);
      existing.conn.close('duplicate login');
    }

    const state = this.repo.loadOrCreate(account.id, account.username);
    const session = new PlayerSession(conn, state);
    const world = this.worlds.get(state.mapId) ?? this.worlds.values().next().value!;
    const p = world.addPlayer(session);
    this.sessions.set(account.id, session);

    const stats = state.stats;
    session.send({
      t: 'welcome',
      id: p.id,
      map: world.map.id,
      profile: state.toProfile(),
      self: {
        x: p.x, y: p.y, vx: 0, vy: 0, angle: p.angle,
        hull: Math.min(p.hull, stats.maxHull), shield: p.shield, energy: p.energy,
        dead: p.dead, safe: p.safe, docked: p.docked, mining: 0,
      },
      st: Date.now(),
    });
    state.profileDirty = false;
    session.lastProfileSentAt = Date.now();
    return session;
  }

  leave(session: PlayerSession): void {
    if (this.sessions.get(session.accountId) !== session) return;
    this.sessions.delete(session.accountId);
    const world = this.worlds.get(session.state.mapId);
    world?.removePlayer(session);
    try {
      this.repo.saveMany([session.state]);
    } catch (err) {
      console.error('[save] failed to save player on leave', session.accountId, err);
    }
  }

  saveAll(): void {
    const dirty: PlayerSession['state'][] = [];
    for (const s of this.sessions.values()) {
      if (s.entity) this.worlds.get(s.state.mapId)?.syncPlayerToState(s.entity);
      if (s.state.dirty || s.entity) dirty.push(s.state);
    }
    try {
      this.repo.saveMany(dirty);
    } catch (err) {
      console.error('[save] periodic save failed', err);
    }
  }

  /** Validates and applies a client message. Never trusts client-provided values. */
  handleMessage(session: PlayerSession, msg: ClientMsg): void {
    const p = session.entity;
    switch (msg.t) {
      case 'input': {
        if (!p) return;
        if (!Number.isInteger(msg.seq) || msg.seq <= p.lastProcessedSeq) return;
        const last = p.inputQueue[p.inputQueue.length - 1];
        if (last && msg.seq <= last.seq) return;
        if (!isNum(msg.mx) || !isNum(msg.my) || !isNum(msg.aim)) return;
        p.inputQueue.push({
          seq: msg.seq,
          mx: Math.max(-1, Math.min(1, msg.mx)),
          my: Math.max(-1, Math.min(1, msg.my)),
          aim: msg.aim,
          fire: msg.fire === true,
          mine: msg.mine === true,
        });
        if (p.inputQueue.length > MAX_INPUT_QUEUE) p.inputQueue.splice(0, p.inputQueue.length - 2);
        return;
      }
      case 'upgrade': {
        if (!isUpgradeTrack(msg.track)) return;
        const res = purchaseUpgrade(session, msg.track);
        if (res.ok) {
          // Persist economy changes immediately rather than waiting for the periodic save.
          if (p) this.worlds.get(session.state.mapId)?.syncPlayerToState(p);
          try {
            this.repo.saveMany([session.state]);
          } catch (err) {
            console.error('[save] upgrade save failed', err);
          }
          session.notify('success', `${UPGRADE_TRACKS[msg.track].name} upgraded to level ${res.level}.`);
        } else {
          session.notify('error', res.reason);
        }
        session.send({ t: 'profile', profile: session.state.toProfile() });
        session.state.profileDirty = false;
        return;
      }
      case 'respawn': {
        if (!p) return;
        const world = this.worlds.get(session.state.mapId);
        if (world) respawnPlayer(world, p);
        return;
      }
      case 'ping': {
        if (isNum(msg.ts)) session.send({ t: 'pong', ts: msg.ts, st: Date.now() });
        return;
      }
      default:
        return;
    }
  }
}
