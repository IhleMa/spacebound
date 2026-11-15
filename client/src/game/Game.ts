import {
  ENEMIES,
  INTERPOLATION_DELAY_MS,
  RESOURCES,
  STARTER_WEAPON,
  TICK_DT,
  TICK_MS,
  WEAPONS,
  computeShipStats,
  dist,
  getMap,
  type GameEvent,
  type MapDef,
  type Profile,
  type SelfState,
  type ServerMsg,
  type ShipStats,
} from '@spacebound/shared';
import { Connection } from '../net/Connection';
import { Input } from '../input/Input';
import { Camera } from '../render/Camera';
import { Effects } from '../render/effects';
import { Renderer } from '../render/Renderer';
import { engineOffsets, forgetDepositSprite } from '../render/sprites';
import { Hud, type NearbyItem } from '../ui/Hud';
import { ClientWorld } from './ClientWorld';
import { LocalShip } from './LocalShip';
import type { ClientProjectile, TargetRef } from './types';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  token: string;
  /** Called when the player logs out or the session becomes invalid. */
  onExit(message?: string): void;
}

export class Game {
  private conn: Connection | null = null;
  private input: Input;
  private camera = new Camera();
  private renderer: Renderer;
  private effects = new Effects();
  private world = new ClientWorld();
  private local = new LocalShip();
  private hud: Hud;

  private map: MapDef | null = null;
  private myId = 0;
  private profile: Profile | null = null;
  private stats: ShipStats | null = null;
  private self: SelfState | null = null;

  private projectiles: ClientProjectile[] = [];
  private target: TargetRef | null = null;
  private hover: TargetRef | null = null;
  private autoMine = false;
  private seq = 0;
  private accumulator = 0;
  private lastFrameAt = 0;
  private time = 0;
  private localNextFire = 0;
  private localEnergy = 0;
  private thrusting = false;
  private ping: number | null = null;
  private pingTimer: number | null = null;
  private raf = 0;
  private hudTimer = 0;
  private nearbyTimer = 0;
  private nearby: NearbyItem[] = [];
  private destroyed = false;

  constructor(private opts: GameOptions) {
    this.input = new Input(opts.canvas);
    this.renderer = new Renderer(opts.canvas);
    this.hud = new Hud(opts.uiRoot, {
      onUpgrade: (track) => this.conn?.send({ t: 'upgrade', track }),
      onRespawn: () => this.conn?.send({ t: 'respawn' }),
      onSelectTarget: (t) => (this.target = t),
      onReconnect: () => this.connect(),
      onLogout: () => this.exit(),
    });
    this.onResize();
    window.addEventListener('resize', this.onResize);
    this.connect();
    // Read-only inspection hook for automated browser tests (`?debug` in the URL).
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __sb: Game }).__sb = this;
    this.lastFrameAt = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.resize(w, h);
    this.renderer.resize(w, h);
  };

  private connect(): void {
    this.conn?.close();
    this.hud.setConnectionLost(null);
    this.world.clear();
    this.projectiles = [];
    this.self = null;
    this.seq = 0;
    this.conn = new Connection(this.opts.token, {
      onMessage: (m) => this.onMessage(m),
      onClose: (code) => {
        if (this.destroyed) return;
        if (code === 4003) this.exit('Your session has expired. Please log in again.');
        else this.hud.setConnectionLost('The connection to the server was lost. Your progress up to the last save is safe.');
      },
    });
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => this.conn?.send({ t: 'ping', ts: performance.now() }), 2000);
  }

  private exit(message?: string): void {
    this.destroy();
    this.opts.onExit(message);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    if (this.pingTimer) clearInterval(this.pingTimer);
    window.removeEventListener('resize', this.onResize);
    this.conn?.close();
    this.hud.destroy();
  }

  // ───────────────────────────── Networking ─────────────────────────────

  private onMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome': {
        this.myId = msg.id;
        this.map = getMap(msg.map) ?? null;
        this.setProfile(msg.profile);
        this.self = msg.self;
        this.local.reset(msg.self);
        this.localEnergy = msg.self.energy;
        this.camera.snap(msg.self.x, msg.self.y);
        this.hud.notify('info', `Welcome, ${msg.profile.name}. Connected to ${this.map?.name ?? msg.map}.`);
        break;
      }
      case 'snap': {
        if (!this.map || !this.stats) return;
        const { removedDeposits } = this.world.applySnapshot(msg);
        for (const id of removedDeposits) forgetDepositSprite(id);
        this.self = msg.self;
        this.localEnergy = msg.self.energy;
        this.local.reconcile(msg.self, msg.ack, this.stats, this.map.halfSize);
        for (const ev of msg.events) this.onEvent(ev);
        break;
      }
      case 'profile':
        this.setProfile(msg.profile);
        break;
      case 'notify':
        this.hud.notify(msg.level, msg.text);
        if (msg.level === 'level' && this.self) {
          const p = this.local.state;
          this.effects.burst(p.x, p.y, 60, '#c69bff', 260, 3, 1.1);
          this.effects.text(p.x, p.y - 50, 'LEVEL UP', '#e2c4ff', 22, 1.8);
        }
        if (msg.level === 'loot' && this.self) this.effects.text(this.local.state.x, this.local.state.y - 40, msg.text, '#a8e9ff', 14, 1.2);
        break;
      case 'pong': {
        const rtt = performance.now() - msg.ts;
        this.ping = this.ping === null ? rtt : this.ping * 0.7 + rtt * 0.3;
        break;
      }
      case 'kicked':
        this.hud.setConnectionLost(msg.reason);
        break;
    }
  }

  private setProfile(p: Profile): void {
    const prev = this.profile;
    this.profile = p;
    this.stats = computeShipStats({ shipClass: p.shipClass, level: p.level, upgrades: p.upgrades });
    this.hud.setProfile(p);
    // Floating feedback for mined resources.
    if (prev && this.self?.mining) {
      for (const [res, amt] of Object.entries(p.cargo)) {
        const before = prev.cargo[res as keyof typeof prev.cargo] ?? 0;
        if ((amt ?? 0) > before) {
          const r = RESOURCES[res as keyof typeof RESOURCES];
          this.effects.text(this.local.state.x, this.local.state.y - 36, `+${(amt ?? 0) - before} ${r.name}`, r.color, 13, 1);
        }
      }
    }
  }

  private onEvent(ev: GameEvent): void {
    const me = this.local.state;
    switch (ev.e) {
      case 'shot': {
        if (ev.o === this.myId) return; // already predicted locally
        const w = WEAPONS[ev.w];
        this.projectiles.push({
          id: ev.id, x: ev.x, y: ev.y, vx: ev.vx, vy: ev.vy, ttl: ev.ttl,
          color: w?.color ?? '#ffffff', local: false, hostileToMe: ev.ot === 'e',
        });
        break;
      }
      case 'hit': {
        this.projectiles = this.projectiles.filter((p) => p.local || p.id !== ev.id);
        const onMe = ev.tt === 'p' && ev.tid === this.myId;
        this.effects.burst(ev.x, ev.y, ev.crit ? 14 : 8, ev.sh ? '#6fb6ff' : '#ffb067', 220, 2, 0.35);
        if (ev.miss) this.effects.text(ev.x, ev.y - 14, 'MISS', '#9fb0d0', 13);
        else if (ev.crit) this.effects.text(ev.x, ev.y - 16, `${ev.dmg}!`, '#ffb340', 20, 1.1);
        else this.effects.text(ev.x, ev.y - 14, String(ev.dmg), onMe ? '#ff7088' : ev.sh ? '#9fd0ff' : '#ffffff', 14);
        if (onMe) this.effects.shake = Math.min(10, this.effects.shake + 3);
        break;
      }
      case 'boom': {
        const near = dist(ev.x, ev.y, me.x, me.y) < 900;
        this.effects.explosion(ev.x, ev.y, ev.size, near);
        break;
      }
      case 'expire':
        break;
    }
  }

  // ───────────────────────────── Simulation ─────────────────────────────

  /** Runs at the server tick rate: samples input, sends it, predicts locally. */
  private fixedTick(): void {
    if (!this.conn?.open || !this.map || !this.stats || !this.self) return;
    const me = this.local.state;
    const blocked = this.hud.activePanel !== 'world';
    const mv = blocked ? { mx: 0, my: 0 } : this.input.move();
    const mouse = this.camera.toWorld(this.input.mouseX, this.input.mouseY);
    let aim = Math.atan2(mouse.y - me.y, mouse.x - me.x);
    let fire = !blocked && this.input.mouseDown;

    if (!blocked && this.input.down('Space')) {
      const t = this.targetPosition();
      if (t && (this.target?.kind === 'e' || this.target?.kind === 'p')) {
        const weapon = WEAPONS[STARTER_WEAPON];
        const d = dist(me.x, me.y, t.x, t.y);
        // Remote entities are rendered in the past (interpolation delay) and our shot reaches the
        // server half a round-trip later – lead the target by both plus the projectile flight time.
        const lag = (INTERPOLATION_DELAY_MS + (this.ping ?? 80) / 2) / 1000 + TICK_DT;
        const tf = d / weapon.projectileSpeed + lag;
        aim = Math.atan2(t.y + t.vy * tf - me.y, t.x + t.vx * tf - me.x);
      }
      fire = true;
    }
    const mine = !blocked && (this.input.down('KeyE') || this.autoMine);

    this.seq++;
    this.conn.send({ t: 'input', seq: this.seq, mx: mv.mx, my: mv.my, aim, fire, mine });
    this.local.predict({ seq: this.seq, mx: mv.mx, my: mv.my, aim }, this.stats, this.map.halfSize);
    this.thrusting = mv.mx !== 0 || mv.my !== 0;

    // Predicted local shots (purely visual – the server decides about hits and damage).
    const weapon = WEAPONS[STARTER_WEAPON];
    this.localEnergy = Math.min(this.stats.maxEnergy, this.localEnergy + this.stats.energyRegen * TICK_DT);
    if (fire && !this.self.dead && this.time >= this.localNextFire && this.localEnergy >= weapon.energyCost) {
      this.localNextFire = this.time + weapon.fireInterval;
      this.localEnergy -= weapon.energyCost;
      const s = this.local.state;
      const off = 18 + 8;
      this.projectiles.push({
        id: -1, x: s.x + Math.cos(aim) * off, y: s.y + Math.sin(aim) * off,
        vx: Math.cos(aim) * weapon.projectileSpeed, vy: Math.sin(aim) * weapon.projectileSpeed,
        ttl: weapon.range / weapon.projectileSpeed, color: weapon.color, local: true, hostileToMe: false,
      });
    }
  }

  private targetPosition(): { x: number; y: number; vx: number; vy: number } | null {
    const t = this.target;
    if (!t) return null;
    if (t.kind === 'e') {
      const e = this.world.enemies.get(t.id);
      return e ? { x: e.x, y: e.y, vx: e.vx, vy: e.vy } : null;
    }
    if (t.kind === 'p') {
      const p = this.world.players.get(t.id);
      return p ? { x: p.x, y: p.y, vx: p.vx, vy: p.vy } : null;
    }
    if (t.kind === 'd') {
      const d = this.world.deposits.get(t.id);
      return d ? { x: d.x, y: d.y, vx: 0, vy: 0 } : null;
    }
    return null;
  }

  private pick(sx: number, sy: number, includeDeposits: boolean): TargetRef | null {
    const p = this.camera.toWorld(sx, sy);
    let best: TargetRef | null = null;
    let bestD = Infinity;
    for (const e of this.world.enemies.values()) {
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < ENEMIES[e.snap.type].radius + 14 && d < bestD) {
        bestD = d;
        best = { kind: 'e', id: e.snap.id };
      }
    }
    for (const o of this.world.players.values()) {
      const d = dist(p.x, p.y, o.x, o.y);
      if (d < 30 && d < bestD) {
        bestD = d;
        best = { kind: 'p', id: o.snap.id };
      }
    }
    if (!best && includeDeposits) {
      for (const dep of this.world.deposits.values()) {
        const d = dist(p.x, p.y, dep.x, dep.y);
        if (d < dep.r + 8 && d < bestD) {
          bestD = d;
          best = { kind: 'd', id: dep.id };
        }
      }
    }
    return best;
  }

  private handleKeys(): void {
    const i = this.input;
    if (i.pressed('KeyC')) this.hud.openPanel(this.hud.activePanel === 'ship' ? 'world' : 'ship');
    if (i.pressed('KeyH')) this.hud.openPanel(this.hud.activePanel === 'help' ? 'world' : 'help');
    if (i.pressed('Escape')) {
      if (this.hud.activePanel !== 'world') this.hud.openPanel('world');
      else this.target = null;
    }
    if (i.pressed('KeyF')) {
      this.autoMine = !this.autoMine;
      this.hud.notify('info', `Auto-mining ${this.autoMine ? 'enabled' : 'disabled'}.`);
    }
    if (i.pressed('Tab')) {
      const me = this.local.state;
      const enemies = [...this.world.enemies.values()]
        .map((e) => ({ id: e.snap.id, d: dist(me.x, me.y, e.x, e.y) }))
        .filter((e) => e.d < 1400)
        .sort((a, b) => a.d - b.d);
      if (enemies.length) {
        const idx = this.target?.kind === 'e' ? enemies.findIndex((e) => e.id === this.target!.id) : -1;
        this.target = { kind: 'e', id: enemies[(idx + 1) % enemies.length].id };
      }
    }
    if (i.rightClicked) this.target = this.pick(i.rightClicked.x, i.rightClicked.y, true);
    if (i.leftClicked) {
      const t = this.pick(i.leftClicked.x, i.leftClicked.y, false);
      if (t) this.target = t;
    }
  }

  private updateVisuals(dt: number): void {
    // Projectiles
    const keep: ClientProjectile[] = [];
    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.ttl -= dt;
      if (p.ttl <= 0) continue;
      if (p.local) {
        let hit = false;
        for (const e of this.world.enemies.values()) {
          if (dist(p.x, p.y, e.x, e.y) < ENEMIES[e.snap.type].radius) {
            hit = true;
            break;
          }
        }
        if (hit) continue;
      }
      keep.push(p);
    }
    this.projectiles = keep;

    // Engine trails
    const trail = (x: number, y: number, a: number, shape: string, size: number, color: string, intensity: number) => {
      if (intensity <= 0.05) return;
      for (const [ex, ey] of engineOffsets(shape)) {
        const c = Math.cos(a);
        const s = Math.sin(a);
        const px = x + (ex * c - ey * s) * size;
        const py = y + (ex * s + ey * c) * size;
        if (Math.random() < intensity) {
          this.effects.spawn({
            x: px, y: py, vx: -c * 80 + (Math.random() - 0.5) * 30, vy: -s * 80 + (Math.random() - 0.5) * 30,
            size: 2.2 * Math.min(1, intensity + 0.3), color, life: 0.35, drag: 0.9,
          });
        }
      }
    };
    if (this.self && !this.self.dead) {
      const r = this.local.state;
      const sp = Math.hypot(r.vx, r.vy) / (this.stats?.speed ?? 300);
      trail(r.x, r.y, r.angle, 'sparrow', 22, '#4de1ff', this.thrusting ? 1 : sp * 0.5);
    }
    for (const e of this.world.enemies.values()) {
      if (!this.camera.visible(e.x, e.y, 100)) continue;
      const def = ENEMIES[e.snap.type];
      const sp = Math.hypot(e.vx, e.vy) / def.speed;
      trail(e.x, e.y, e.a, e.snap.type, def.radius * 1.15, def.color, sp * 0.8);
    }
    for (const p of this.world.players.values()) {
      if (p.snap.dead || !this.camera.visible(p.x, p.y, 100)) continue;
      const sp = Math.hypot(p.vx, p.vy) / 320;
      trail(p.x, p.y, p.a, 'sparrow', 21.6, '#a66bff', sp);
    }

    // Mining particles flowing into the ship
    if (this.self?.mining) {
      const d = this.world.deposits.get(this.self.mining);
      if (d && Math.random() < 0.6) {
        const me = this.local.state;
        const a = Math.random() * Math.PI * 2;
        const sx = d.x + Math.cos(a) * d.r * 0.7;
        const sy = d.y + Math.sin(a) * d.r * 0.7;
        const k = 1.6;
        this.effects.spawn({ x: sx, y: sy, vx: (me.x - sx) * k, vy: (me.y - sy) * k, size: 2, color: RESOURCES[d.res].color, life: 0.55, drag: 1 });
      }
    }

    // Drop invalid targets
    if (this.target && !this.targetPosition()) this.target = null;

    this.effects.update(dt);
  }

  private computeNearby(): NearbyItem[] {
    const me = this.local.state;
    const out: NearbyItem[] = [];
    for (const e of this.world.enemies.values()) {
      const def = ENEMIES[e.snap.type];
      out.push({ ref: { kind: 'e', id: e.snap.id }, name: `${def.elite ? '★ ' : ''}${def.name}`, color: e.snap.hostile ? '#ff4d6d' : def.color, dist: dist(me.x, me.y, e.x, e.y) });
    }
    for (const p of this.world.players.values()) {
      out.push({ ref: { kind: 'p', id: p.snap.id }, name: `${p.snap.name} (Lv ${p.snap.lvl})`, color: '#a66bff', dist: dist(me.x, me.y, p.x, p.y) });
    }
    for (const d of this.world.deposits.values()) {
      const dd = dist(me.x, me.y, d.x, d.y);
      if (dd > 900) continue;
      out.push({ ref: { kind: 'd', id: d.id }, name: `${RESOURCES[d.res].name} (${d.amt})`, color: RESOURCES[d.res].color, dist: dd });
    }
    return out.filter((o) => o.dist < 1400).sort((a, b) => a.dist - b.dist).slice(0, 12);
  }

  private frame = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.lastFrameAt) / 1000);
    this.lastFrameAt = now;
    this.time += dt;

    this.handleKeys();
    this.accumulator += dt * 1000;
    let n = 0;
    while (this.accumulator >= TICK_MS && n < 4) {
      this.fixedTick();
      this.accumulator -= TICK_MS;
      n++;
    }
    if (n === 4) this.accumulator = 0;
    this.input.endFrame();

    if (!this.map || !this.self || !this.stats) return;

    this.world.interpolate(INTERPOLATION_DELAY_MS);
    const alpha = this.accumulator / TICK_MS;
    const me = this.local.renderPos(alpha, dt);
    // Hull faces the mouse immediately for responsiveness (server applies turn-rate limits).
    const meView = { x: me.x, y: me.y, angle: me.angle, thrusting: this.thrusting };

    this.updateVisuals(dt);
    this.camera.follow(me.x, me.y, dt);
    this.camera.applyShake(this.effects.shake);

    this.hover = this.pick(this.input.mouseX, this.input.mouseY, true);
    this.opts.canvas.style.cursor = this.hover ? 'pointer' : 'crosshair';

    this.renderer.draw({
      map: this.map,
      camera: this.camera,
      world: this.world,
      effects: this.effects,
      projectiles: this.projectiles,
      myId: this.myId,
      myName: this.profile?.name ?? '',
      myLevel: this.profile?.level ?? 1,
      me: meView,
      self: this.self,
      target: this.target,
      hover: this.hover,
      time: this.time,
    });

    this.nearbyTimer -= dt;
    if (this.nearbyTimer <= 0) {
      this.nearbyTimer = 0.25;
      this.nearby = this.computeNearby();
      this.hud.drawMinimap(this.map, this.world, meView, { halfW: this.camera.halfW, halfH: this.camera.halfH });
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.hud.update({
        self: this.self, stats: this.stats, target: this.target, nearby: this.nearby,
        ping: this.ping, online: this.world.online, autoMine: this.autoMine,
      }, this.world);
    }
  };
}
