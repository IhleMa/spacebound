import { ENEMIES, RESOURCES, SHIP_CLASSES, type MapDef } from '@spacebound/shared';
import type { SceneView } from '../game/types';
import { ENEMY_STYLE, depositSprite, planetSprite, shipSprite, starTile, type Sprite } from './sprites';

const OWN_COLOR = '#4de1ff';
const OWN_ACCENT = '#d6fbff';
const ALLY_COLOR = '#a66bff';
const ALLY_ACCENT = '#eadbff';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private stars: { tile: HTMLCanvasElement; parallax: number }[];
  private planets: { sprite: Sprite; x: number; y: number; parallax: number }[] = [];
  private planetsFor: string | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.stars = [
      { tile: starTile(1024, 420, 11, 0.9, 0.55), parallax: 0.12 },
      { tile: starTile(1024, 200, 23, 1.3, 0.75), parallax: 0.3 },
      { tile: starTile(1024, 70, 37, 1.8, 0.95), parallax: 0.55 },
    ];
  }

  resize(w: number, h: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  private ensurePlanets(map: MapDef): void {
    if (this.planetsFor === map.id) return;
    this.planetsFor = map.id;
    this.planets = map.visuals.planets.map((p, i) => ({
      sprite: planetSprite(p.r, p.color, !!p.ring, 100 + i),
      x: p.x,
      y: p.y,
      parallax: p.parallax,
    }));
  }

  draw(v: SceneView): void {
    const { ctx, dpr } = this;
    const cam = v.camera;
    const W = cam.width;
    const H = cam.height;
    this.ensurePlanets(v.map);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawBackground(v, W, H);

    ctx.save();
    ctx.translate(W / 2 + cam.shakeX, H / 2 + cam.shakeY);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    this.drawGrid(v);
    this.drawBounds(v);
    this.drawZonesAndStations(v);
    this.drawDeposits(v);
    this.drawLoot(v);
    this.drawMiningBeams(v);
    this.drawEnemies(v);
    this.drawPlayers(v);
    this.drawMe(v);
    this.drawProjectiles(v);
    v.effects.drawParticles(ctx);
    this.drawTargetReticle(v);
    v.effects.drawTexts(ctx);

    ctx.restore();
    this.drawEdgeIndicators(v, W, H);
  }

  // ───────────────────────────── Background ─────────────────────────────

  private drawBackground(v: SceneView, W: number, H: number): void {
    const { ctx } = this;
    const cam = v.camera;
    const vis = v.map.visuals;
    const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    g.addColorStop(0, vis.bgInner);
    g.addColorStop(1, vis.bgOuter);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Nebulae (parallax 0.4)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const n of vis.nebulae) {
      const p = 0.4;
      const sx = W / 2 + (n.x - cam.x * p) * cam.zoom * p;
      const sy = H / 2 + (n.y - cam.y * p) * cam.zoom * p;
      const r = n.r * cam.zoom * 0.7;
      if (sx + r < 0 || sx - r > W || sy + r < 0 || sy - r > H) continue;
      const ng = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      ng.addColorStop(0, n.color);
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ng;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.restore();

    // Stars
    for (const layer of this.stars) {
      const size = 1024;
      const ox = -((cam.x * layer.parallax) % size) - size;
      const oy = -((cam.y * layer.parallax) % size) - size;
      for (let x = ox; x < W; x += size) {
        for (let y = oy; y < H; y += size) ctx.drawImage(layer.tile, x, y);
      }
    }

    // Planets
    for (const pl of this.planets) {
      const sx = W / 2 + (pl.x - cam.x * pl.parallax) * cam.zoom * 0.8;
      const sy = H / 2 + (pl.y - cam.y * pl.parallax) * cam.zoom * 0.8;
      const s = pl.sprite;
      const scale = cam.zoom * 0.8;
      const w = s.canvas.width * scale;
      if (sx + w < 0 || sx - w > W || sy + w < 0 || sy - w > H) continue;
      ctx.drawImage(s.canvas, sx - s.cx * scale, sy - s.cy * scale, s.canvas.width * scale, s.canvas.height * scale);
    }
  }

  private drawGrid(v: SceneView): void {
    const { ctx } = this;
    const cam = v.camera;
    const step = 250;
    const x0 = Math.floor((cam.x - cam.halfW) / step) * step;
    const x1 = cam.x + cam.halfW;
    const y0 = Math.floor((cam.y - cam.halfH) / step) * step;
    const y1 = cam.y + cam.halfH;
    ctx.save();
    ctx.strokeStyle = 'rgba(77, 225, 255, 0.035)';
    ctx.lineWidth = 1 / cam.zoom;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += step) {
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
    for (let y = y0; y <= y1; y += step) {
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawBounds(v: SceneView): void {
    const { ctx } = this;
    const h = v.map.halfSize;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 77, 109, 0.45)';
    ctx.lineWidth = 3;
    ctx.setLineDash([24, 16]);
    ctx.strokeRect(-h, -h, h * 2, h * 2);
    ctx.restore();
  }

  private drawZonesAndStations(v: SceneView): void {
    const { ctx } = this;
    const t = v.time;
    for (const z of v.map.zones) {
      if (!v.camera.visible(z.x, z.y, z.radius)) continue;
      ctx.save();
      const safe = z.kind === 'safe';
      const col = safe ? '92, 255, 157' : '255, 77, 109';
      const g = ctx.createRadialGradient(z.x, z.y, z.radius * 0.6, z.x, z.y, z.radius);
      g.addColorStop(0, `rgba(${col}, 0)`);
      g.addColorStop(1, `rgba(${col}, 0.06)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(${col}, 0.35)`;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 14]);
      ctx.lineDashOffset = -t * 12;
      ctx.stroke();
      ctx.restore();
    }

    for (const s of v.map.stations) {
      if (!v.camera.visible(s.x, s.y, 400)) continue;
      ctx.save();
      ctx.translate(s.x, s.y);

      // Dock radius
      ctx.strokeStyle = 'rgba(77, 225, 255, 0.25)';
      ctx.setLineDash([4, 10]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, s.dockRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Outer rotating ring with segments
      ctx.save();
      ctx.rotate(t * 0.08);
      ctx.shadowColor = '#4de1ff';
      ctx.shadowBlur = 16;
      ctx.strokeStyle = '#2b4a78';
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.arc(0, 0, 120, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      for (let i = 0; i < 12; i++) {
        ctx.rotate((Math.PI * 2) / 12);
        ctx.fillStyle = i % 3 === 0 ? '#4de1ff' : '#1c3156';
        ctx.fillRect(112, -5, 16, 10);
      }
      ctx.restore();

      // Spokes
      ctx.save();
      ctx.rotate(-t * 0.05);
      ctx.strokeStyle = '#1f3760';
      ctx.lineWidth = 7;
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(40, 0);
        ctx.lineTo(112, 0);
        ctx.stroke();
      }
      ctx.restore();

      // Hub
      const hg = ctx.createRadialGradient(-10, -10, 4, 0, 0, 48);
      hg.addColorStop(0, '#5d7fb8');
      hg.addColorStop(1, '#0e1a33');
      ctx.fillStyle = hg;
      ctx.shadowColor = '#4de1ff';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        ctx.lineTo(Math.cos(a) * 46, Math.sin(a) * 46);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(77,225,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Blinking beacons
      const on = Math.sin(t * 3) > 0;
      ctx.fillStyle = on ? '#5cff9d' : '#1d5236';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 30, Math.sin(a) * 30, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.font = '700 13px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(214, 251, 255, 0.85)';
      ctx.fillText(s.name.toUpperCase(), 0, -150);
      ctx.restore();
    }
  }

  private drawDeposits(v: SceneView): void {
    const { ctx } = this;
    for (const d of v.world.deposits.values()) {
      if (!v.camera.visible(d.x, d.y, d.r * 2)) continue;
      const s = depositSprite(d.id, d.kind, d.res, d.r);
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.kind !== 'crystal') ctx.rotate((d.id % 7) + v.time * 0.04 * ((d.id % 3) - 1 || 0.5));
      // Shrink slightly as the deposit gets depleted.
      const k = 0.7 + 0.3 * (d.amt / Math.max(1, d.max));
      ctx.scale(k, k);
      ctx.drawImage(s.canvas, -s.cx, -s.cy);
      ctx.restore();

      const targeted = v.target?.kind === 'd' && v.target.id === d.id;
      const hovered = v.hover?.kind === 'd' && v.hover.id === d.id;
      const mined = v.self.mining === d.id;
      if (targeted || hovered || mined) {
        ctx.save();
        ctx.strokeStyle = RESOURCES[d.res].color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r + 10, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * d.amt) / Math.max(1, d.max));
        ctx.stroke();
        ctx.font = '600 12px Rajdhani, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#d8e6ff';
        ctx.fillText(`${RESOURCES[d.res].name} · ${d.amt}`, d.x, d.y + d.r + 26);
        ctx.restore();
      }
    }
  }

  private drawLoot(v: SceneView): void {
    const { ctx } = this;
    for (const l of v.world.loot.values()) {
      if (!v.camera.visible(l.x, l.y, 30)) continue;
      const col = RESOURCES[l.res].color;
      const pulse = 1 + Math.sin(v.time * 5 + l.id) * 0.15;
      ctx.save();
      ctx.translate(l.x, l.y);
      ctx.rotate(v.time * 1.5 + l.id);
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#0d1424';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.rect(-7 * pulse, -7 * pulse, 14 * pulse, 14 * pulse);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.fillRect(-2.5, -2.5, 5, 5);
      ctx.restore();
    }
  }

  private drawBeam(fromX: number, fromY: number, toX: number, toY: number, color: string, t: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const segs = 10;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      for (let i = 1; i < segs; i++) {
        const k = i / segs;
        const j = Math.sin(t * 30 + i * 1.7 + pass * 3) * 4 * Math.sin(k * Math.PI);
        ctx.lineTo(fromX + dx * k + nx * j, fromY + dy * k + ny * j);
      }
      ctx.lineTo(toX, toY);
      ctx.strokeStyle = pass === 0 ? color : '#ffffff';
      ctx.globalAlpha = pass === 0 ? 0.55 : 0.8;
      ctx.lineWidth = pass === 0 ? 6 : 1.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMiningBeams(v: SceneView): void {
    if (v.self.mining) {
      const d = v.world.deposits.get(v.self.mining);
      if (d) this.drawBeam(v.me.x, v.me.y, d.x, d.y, RESOURCES[d.res].color, v.time);
    }
    for (const p of v.world.players.values()) {
      if (!p.snap.mining) continue;
      const d = v.world.deposits.get(p.snap.mining);
      if (d) this.drawBeam(p.x, p.y, d.x, d.y, RESOURCES[d.res].color, v.time + p.snap.id);
    }
  }

  private drawBars(x: number, y: number, w: number, hullPct: number, shieldPct: number): void {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 9);
    ctx.fillStyle = '#4da6ff';
    ctx.fillRect(x - w / 2, y, (w * shieldPct) / 100, 3);
    ctx.fillStyle = hullPct > 50 ? '#5cff9d' : hullPct > 25 ? '#ffd84d' : '#ff4d6d';
    ctx.fillRect(x - w / 2, y + 4, (w * hullPct) / 100, 3);
  }

  private drawShip(sprite: Sprite, x: number, y: number, angle: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(sprite.canvas, -sprite.cx, -sprite.cy);
    ctx.restore();
  }

  private drawEnemies(v: SceneView): void {
    const { ctx } = this;
    for (const e of v.world.enemies.values()) {
      if (!v.camera.visible(e.x, e.y, 60)) continue;
      const def = ENEMIES[e.snap.type];
      const style = ENEMY_STYLE[e.snap.type];
      this.drawShip(shipSprite(style.shape, def.radius * 1.15, style.color, style.accent), e.x, e.y, e.a);
      const hovered = v.hover?.kind === 'e' && v.hover.id === e.snap.id;
      const targeted = v.target?.kind === 'e' && v.target.id === e.snap.id;
      if (e.snap.h < 100 || e.snap.s < 100 || hovered || targeted || def.elite) {
        this.drawBars(e.x, e.y - def.radius - 16, Math.max(36, def.radius * 2.2), e.snap.h, e.snap.s);
      }
      if (hovered || targeted || def.elite || e.snap.hostile) {
        ctx.save();
        ctx.font = `${def.elite ? 700 : 600} 12px Rajdhani, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = e.snap.hostile ? '#ff9aac' : '#ffe9a8';
        ctx.fillText(`${def.elite ? '★ ' : ''}${def.name} · Lv ${def.level}`, e.x, e.y - def.radius - 22);
        ctx.restore();
      }
    }
  }

  private drawPlayers(v: SceneView): void {
    const { ctx } = this;
    for (const p of v.world.players.values()) {
      if (p.snap.dead || !v.camera.visible(p.x, p.y, 60)) continue;
      const cls = SHIP_CLASSES[p.snap.cls];
      this.drawShip(shipSprite('sparrow', cls.radius * 1.2, ALLY_COLOR, ALLY_ACCENT), p.x, p.y, p.a);
      this.drawBars(p.x, p.y - cls.radius - 18, 44, p.snap.h, p.snap.s);
      ctx.save();
      ctx.font = '600 12px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e2d4ff';
      ctx.fillText(`${p.snap.name} · Lv ${p.snap.lvl}`, p.x, p.y - cls.radius - 24);
      ctx.restore();
    }
  }

  private drawMe(v: SceneView): void {
    if (v.self.dead) return;
    const { ctx } = this;
    const { x, y, angle } = v.me;
    // Own-ship marker ring so the player always finds themselves.
    ctx.save();
    ctx.strokeStyle = 'rgba(77, 225, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -v.time * 10;
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    this.drawShip(shipSprite('sparrow', 22, OWN_COLOR, OWN_ACCENT), x, y, angle);

    // Shield bubble flicker when shields are up and recently hit is handled by particles; show faint bubble.
    if (v.self.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#4da6ff';
      ctx.beginPath();
      ctx.arc(x, y, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawProjectiles(v: SceneView): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of v.projectiles) {
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const len = 22;
      const tx = p.x - (p.vx / sp) * len;
      const ty = p.y - (p.vy / sp) * len;
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - (p.vx / sp) * len * 0.6, p.y - (p.vy / sp) * len * 0.6);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private targetPos(v: SceneView): { x: number; y: number; r: number; color: string } | null {
    const t = v.target;
    if (!t) return null;
    if (t.kind === 'e') {
      const e = v.world.enemies.get(t.id);
      return e ? { x: e.x, y: e.y, r: ENEMIES[e.snap.type].radius + 12, color: '#ff4d6d' } : null;
    }
    if (t.kind === 'p') {
      const p = v.world.players.get(t.id);
      return p ? { x: p.x, y: p.y, r: 30, color: ALLY_COLOR } : null;
    }
    if (t.kind === 'd') {
      const d = v.world.deposits.get(t.id);
      return d ? { x: d.x, y: d.y, r: d.r + 18, color: RESOURCES[d.res].color } : null;
    }
    return null;
  }

  private drawTargetReticle(v: SceneView): void {
    const tp = this.targetPos(v);
    if (!tp) return;
    const { ctx } = this;
    ctx.save();
    ctx.translate(tp.x, tp.y);
    ctx.rotate(v.time * 0.8);
    ctx.strokeStyle = tp.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = tp.color;
    ctx.shadowBlur = 8;
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.arc(0, 0, tp.r, -0.35, 0.35);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Arrows at the screen edge pointing to the station and the current target when off-screen. */
  private drawEdgeIndicators(v: SceneView, W: number, H: number): void {
    const items: { x: number; y: number; color: string; label: string }[] = [];
    for (const s of v.map.stations) items.push({ x: s.x, y: s.y, color: '#5cff9d', label: s.name });
    const tp = this.targetPos(v);
    if (tp) items.push({ x: tp.x, y: tp.y, color: tp.color, label: 'Target' });

    const { ctx } = this;
    const cam = v.camera;
    for (const it of items) {
      const sp = cam.toScreen(it.x, it.y);
      const margin = 40;
      if (sp.x > margin && sp.x < W - margin && sp.y > margin && sp.y < H - margin) continue;
      const cx = W / 2;
      const cy = H / 2;
      const ang = Math.atan2(sp.y - cy, sp.x - cx);
      const edgeX = Math.max(260, Math.min(W - 260, cx + Math.cos(ang) * W));
      const edgeY = Math.max(90, Math.min(H - 80, cy + Math.sin(ang) * H));
      // Project onto rectangle properly
      const tX = (Math.cos(ang) > 0 ? W - 270 - cx : 270 - cx) / (Math.cos(ang) || 1e-6);
      const tY = (Math.sin(ang) > 0 ? H - 90 - cy : 100 - cy) / (Math.sin(ang) || 1e-6);
      const tt = Math.min(Math.abs(tX), Math.abs(tY));
      const px = Number.isFinite(tt) ? cx + Math.cos(ang) * tt : edgeX;
      const py = Number.isFinite(tt) ? cy + Math.sin(ang) * tt : edgeY;
      const dist = Math.round(Math.hypot(it.x - (v.me.x), it.y - (v.me.y)));
      ctx.save();
      ctx.translate(px, py);
      ctx.save();
      ctx.rotate(ang);
      ctx.fillStyle = it.color;
      ctx.shadowColor = it.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(-6, -8);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-6, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.font = '600 12px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = it.color;
      ctx.fillText(`${it.label} · ${dist}m`, 0, 24);
      ctx.restore();
    }
  }
}
