export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  drag: number;
  grow: number;
}

export interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

const MAX_PARTICLES = 2500;

export class Effects {
  particles: Particle[] = [];
  texts: FloatingText[] = [];
  shake = 0;

  spawn(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    const life = p.life ?? 0.5;
    this.particles.push({
      vx: 0, vy: 0, size: 2, color: '#fff', drag: 0.9, grow: 0, ...p, life, maxLife: life,
    });
  }

  burst(x: number, y: number, count: number, color: string, speed: number, size: number, life: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.spawn({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        size: size * (0.5 + Math.random()), color, life: life * (0.5 + Math.random() * 0.8), drag: 0.92,
      });
    }
  }

  explosion(x: number, y: number, size: number, nearCamera: boolean): void {
    this.burst(x, y, Math.round(size * 1.6), '#ffcf6b', size * 9, 3, 0.7);
    this.burst(x, y, Math.round(size * 1.0), '#ff5a3c', size * 6, 4, 0.9);
    this.burst(x, y, Math.round(size * 0.6), '#ffffff', size * 12, 1.5, 0.35);
    for (let i = 0; i < size * 0.6; i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * size, y: y + (Math.random() - 0.5) * size,
        vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40,
        size: size * 0.5, grow: size * 1.2, color: 'rgba(120,110,140,0.5)', life: 1.4, drag: 0.96,
      });
    }
    this.spawn({ x, y, size: size * 0.8, grow: size * 6, color: 'rgba(255,200,120,0.9)', life: 0.35, drag: 1 });
    if (nearCamera) this.shake = Math.min(14, this.shake + size * 0.35);
  }

  text(x: number, y: number, text: string, color: string, size = 14, life = 0.9): void {
    this.texts.push({ x: x + (Math.random() - 0.5) * 16, y, text, color, size, life, maxLife: life });
    if (this.texts.length > 120) this.texts.shift();
  }

  update(dt: number): void {
    const decay = Math.pow(0.02, dt);
    let w = 0;
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      this.particles[w++] = p;
    }
    this.particles.length = w;
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 38 * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    this.shake *= decay;
    if (this.shake < 0.1) this.shake = 0;
  }

  drawParticles(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.3, p.size), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawTexts(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.life / t.maxLife;
      ctx.globalAlpha = Math.min(1, k * 2);
      const pop = 1 + Math.max(0, k - 0.8) * 1.5;
      ctx.font = `700 ${Math.round(t.size * pop)}px Rajdhani, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}
