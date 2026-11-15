export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  width = 0;
  height = 0;
  shakeX = 0;
  shakeY = 0;

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    // Slightly zoom out on large screens, in on small ones, so the playfield feels similar.
    this.zoom = Math.max(0.65, Math.min(1.1, Math.min(w, h) / 900));
  }

  follow(tx: number, ty: number, dt: number): void {
    const k = 1 - Math.pow(0.0005, dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }

  snap(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  applyShake(amount: number): void {
    this.shakeX = (Math.random() - 0.5) * amount;
    this.shakeY = (Math.random() - 0.5) * amount;
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.width / 2) / this.zoom + this.x,
      y: (sy - this.height / 2) / this.zoom + this.y,
    };
  }

  toScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + this.width / 2,
      y: (wy - this.y) * this.zoom + this.height / 2,
    };
  }

  /** Half extents of the visible world area. */
  get halfW(): number {
    return this.width / 2 / this.zoom;
  }
  get halfH(): number {
    return this.height / 2 / this.zoom;
  }

  visible(x: number, y: number, margin: number): boolean {
    return Math.abs(x - this.x) < this.halfW + margin && Math.abs(y - this.y) < this.halfH + margin;
  }
}
