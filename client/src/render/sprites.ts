import { mulberry32, type DepositKind, type EnemyTypeId, type ResourceId, RESOURCES } from '@spacebound/shared';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Offset from the canvas' top-left corner to the sprite's anchor (center). */
  cx: number;
  cy: number;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return [c, c.getContext('2d')!];
}

type Pt = [number, number];

const SHAPES: Record<string, Pt[]> = {
  sparrow: [
    [1.0, 0], [0.25, -0.32], [-0.1, -0.95], [-0.5, -0.92], [-0.32, -0.32], [-0.72, -0.26],
    [-0.72, 0.26], [-0.32, 0.32], [-0.5, 0.92], [-0.1, 0.95], [0.25, 0.32],
  ],
  scout_drone: [
    [0.85, 0], [0.25, -0.55], [-0.2, -0.9], [-0.45, -0.45], [-0.75, 0], [-0.45, 0.45], [-0.2, 0.9], [0.25, 0.55],
  ],
  pirate_raider: [
    [1.0, -0.3], [0.35, -0.22], [0.25, -0.5], [0.05, -0.9], [-0.55, -0.62], [-0.8, -0.22],
    [-0.8, 0.22], [-0.55, 0.62], [0.05, 0.9], [0.25, 0.5], [0.35, 0.22], [1.0, 0.3], [0.55, 0],
  ],
  pirate_captain: [
    [1.0, 0], [0.6, -0.25], [0.55, -0.55], [0.1, -0.62], [-0.15, -1.0], [-0.55, -0.95], [-0.5, -0.45],
    [-0.9, -0.35], [-0.9, 0.35], [-0.5, 0.45], [-0.55, 0.95], [-0.15, 1.0], [0.1, 0.62], [0.55, 0.55], [0.6, 0.25],
  ],
};

const ENGINES: Record<string, Pt[]> = {
  sparrow: [[-0.72, -0.14], [-0.72, 0.14]],
  scout_drone: [[-0.75, 0]],
  pirate_raider: [[-0.8, -0.12], [-0.8, 0.12]],
  pirate_captain: [[-0.9, -0.2], [-0.9, 0], [-0.9, 0.2]],
};

const shipCache = new Map<string, Sprite>();

/** Pre-renders a ship hull with glow into an offscreen canvas (cheap to draw rotated every frame). */
export function shipSprite(shape: string, size: number, color: string, accent: string): Sprite {
  const key = `${shape}|${size}|${color}|${accent}`;
  const cached = shipCache.get(key);
  if (cached) return cached;
  const pad = 14;
  const dim = size * 2 + pad * 2;
  const [c, ctx] = makeCanvas(dim, dim);
  const cx = dim / 2;
  const cy = dim / 2;
  const pts = SHAPES[shape] ?? SHAPES.sparrow;

  const path = () => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * size, cy + y * size) : ctx.moveTo(cx + x * size, cy + y * size)));
    ctx.closePath();
  };

  // Glow
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  path();
  const g = ctx.createLinearGradient(cx - size, cy - size, cx + size, cy + size);
  g.addColorStop(0, '#0c1428');
  g.addColorStop(0.5, '#1b2a4a');
  g.addColorStop(1, '#0a1020');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  // Panel shading
  ctx.save();
  path();
  ctx.clip();
  const sheen = ctx.createLinearGradient(cx, cy - size, cx, cy + size);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, dim, dim);
  // Center spine
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.7, cy);
  ctx.lineTo(cx + size * 0.8, cy);
  ctx.stroke();
  ctx.restore();

  // Outline
  path();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Cockpit / eye
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  if (shape === 'scout_drone') ctx.arc(cx + size * 0.05, cy, size * 0.22, 0, Math.PI * 2);
  else ctx.ellipse(cx + size * 0.28, cy, size * 0.2, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Engine nozzles
  ctx.fillStyle = accent;
  for (const [ex, ey] of ENGINES[shape] ?? []) {
    ctx.beginPath();
    ctx.arc(cx + ex * size, cy + ey * size, Math.max(1.5, size * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }

  const s = { canvas: c, cx, cy };
  shipCache.set(key, s);
  return s;
}

export function engineOffsets(shape: string): Pt[] {
  return ENGINES[shape] ?? ENGINES.sparrow;
}

export const ENEMY_STYLE: Record<EnemyTypeId, { shape: string; color: string; accent: string }> = {
  scout_drone: { shape: 'scout_drone', color: '#ffd04d', accent: '#fff3b0' },
  pirate_raider: { shape: 'pirate_raider', color: '#ff5a4d', accent: '#ffb0a8' },
  pirate_captain: { shape: 'pirate_captain', color: '#ff2e63', accent: '#ffd0dc' },
};

// ───────────────────────────── Deposits ─────────────────────────────

const depositCache = new Map<number, Sprite>();

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function depositSprite(id: number, kind: DepositKind, resource: ResourceId, r: number): Sprite {
  const cached = depositCache.get(id);
  if (cached) return cached;
  const rng = mulberry32(id * 7919 + 13);
  const pad = 16;
  const dim = r * 2.6 + pad * 2;
  const [c, ctx] = makeCanvas(dim, dim);
  const cx = dim / 2;
  const cy = dim / 2;
  const col = RESOURCES[resource].color;
  const [cr, cg, cb] = hexToRgb(col);

  if (kind === 'crystal') {
    // Cluster of glowing shards growing out of a small rock base.
    ctx.fillStyle = '#1a2133';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.25, r * 0.75, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    const shards = 5 + Math.floor(rng() * 3);
    for (let i = 0; i < shards; i++) {
      const a = -Math.PI / 2 + (rng() - 0.5) * 2.0;
      const len = r * (0.7 + rng() * 0.75);
      const w = r * (0.16 + rng() * 0.12);
      const bx = cx + (rng() - 0.5) * r * 0.8;
      const by = cy + r * 0.2 + (rng() - 0.5) * r * 0.3;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(a + Math.PI / 2);
      const g = ctx.createLinearGradient(0, 0, 0, -len);
      g.addColorStop(0, `rgba(${cr * 0.3},${cg * 0.3},${cb * 0.4},1)`);
      g.addColorStop(0.6, `rgba(${cr},${cg},${cb},0.9)`);
      g.addColorStop(1, '#ffffff');
      ctx.fillStyle = g;
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(-w, 0);
      ctx.lineTo(-w * 0.8, -len * 0.8);
      ctx.lineTo(0, -len);
      ctx.lineTo(w * 0.8, -len * 0.8);
      ctx.lineTo(w, 0);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -len);
      ctx.lineTo(0, -len * 0.2);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    // Irregular rock.
    const n = 11 + Math.floor(rng() * 5);
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (0.78 + rng() * 0.3);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    const path = () => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    };
    const base = kind === 'meteorite' ? ['#3a2a24', '#16100d'] : ['#5b6170', '#22252e'];
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r * 1.1);
    g.addColorStop(0, base[0]);
    g.addColorStop(1, base[1]);
    ctx.save();
    if (kind === 'meteorite') {
      ctx.shadowColor = col;
      ctx.shadowBlur = 14;
    }
    path();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    ctx.save();
    path();
    ctx.clip();
    // Craters
    for (let i = 0; i < 5; i++) {
      const x = cx + (rng() - 0.5) * r * 1.2;
      const y = cy + (rng() - 0.5) * r * 1.2;
      const cr2 = r * (0.08 + rng() * 0.16);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.arc(x, y, cr2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath();
      ctx.arc(x - 1, y - 1, cr2, Math.PI, Math.PI * 1.6);
      ctx.stroke();
    }
    // Ore veins / flecks
    ctx.shadowColor = col;
    ctx.shadowBlur = 8;
    if (kind === 'meteorite') {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        let x = cx + (rng() - 0.5) * r;
        let y = cy + (rng() - 0.5) * r;
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (rng() - 0.5) * r * 0.6;
          y += (rng() - 0.5) * r * 0.6;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = col;
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.arc(cx + (rng() - 0.5) * r * 1.3, cy + (rng() - 0.5) * r * 1.3, 1 + rng() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    path();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const s = { canvas: c, cx, cy };
  depositCache.set(id, s);
  return s;
}

export function forgetDepositSprite(id: number): void {
  depositCache.delete(id);
}

// ───────────────────────────── Background ─────────────────────────────

export function starTile(size: number, count: number, seed: number, maxR: number, alpha: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const rng = mulberry32(seed);
  const tints = ['#ffffff', '#cfe6ff', '#ffe9c4', '#d8c9ff', '#bff6ff'];
  for (let i = 0; i < count; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 0.3 + rng() * maxR;
    ctx.globalAlpha = alpha * (0.35 + rng() * 0.65);
    ctx.fillStyle = tints[Math.floor(rng() * tints.length)];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (r > maxR * 0.8) {
      ctx.globalAlpha *= 0.25;
      ctx.beginPath();
      ctx.arc(x, y, r * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c;
}

export function planetSprite(r: number, color: string, ring: boolean, seed: number): Sprite {
  const pad = ring ? r * 0.9 : 20;
  const dim = r * 2 + pad * 2;
  const [c, ctx] = makeCanvas(dim, dim);
  const cx = dim / 2;
  const cy = dim / 2;
  const rng = mulberry32(seed);
  const [pr, pg, pb] = hexToRgb(color);

  // Atmosphere glow
  const atm = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.25);
  atm.addColorStop(0, `rgba(${pr},${pg},${pb},0.35)`);
  atm.addColorStop(1, `rgba(${pr},${pg},${pb},0)`);
  ctx.fillStyle = atm;
  ctx.fillRect(0, 0, dim, dim);

  const drawRing = (front: boolean) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35);
    ctx.scale(1, 0.28);
    ctx.beginPath();
    if (front) ctx.arc(0, 0, r * 1.7, 0, Math.PI);
    else ctx.arc(0, 0, r * 1.7, Math.PI, Math.PI * 2);
    ctx.lineWidth = r * 0.22;
    ctx.strokeStyle = `rgba(${Math.min(255, pr + 80)},${Math.min(255, pg + 60)},${Math.min(255, pb + 40)},0.45)`;
    ctx.stroke();
    ctx.restore();
  };
  if (ring) drawRing(false);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  // Bands
  for (let i = 0; i < 9; i++) {
    const y = cy - r + rng() * r * 2;
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(cx - r, y, r * 2, r * (0.05 + rng() * 0.15));
  }
  // Terminator shading
  const shade = ctx.createRadialGradient(cx - r * 0.45, cy - r * 0.45, r * 0.1, cx, cy, r * 1.15);
  shade.addColorStop(0, 'rgba(255,255,255,0.18)');
  shade.addColorStop(0.55, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = shade;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  if (ring) drawRing(true);
  return { canvas: c, cx, cy };
}
