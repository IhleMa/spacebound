/** Keyboard + mouse state. Ignores keys while the user is typing in a form field. */
export class Input {
  private keys = new Set<string>();
  private pressedOnce = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  rightClicked: { x: number; y: number } | null = null;
  leftClicked: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (this.isTyping(e)) return;
      const k = e.code;
      if (!this.keys.has(k)) this.pressedOnce.add(k);
      this.keys.add(k);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (e.button === 0) {
        this.mouseDown = true;
        this.leftClicked = { x: e.clientX, y: e.clientY };
      }
      if (e.button === 2) this.rightClicked = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  down(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  /** True once per physical key press. */
  pressed(code: string): boolean {
    if (this.pressedOnce.has(code)) {
      this.pressedOnce.delete(code);
      return true;
    }
    return false;
  }

  endFrame(): void {
    this.pressedOnce.clear();
    this.rightClicked = null;
    this.leftClicked = null;
  }

  move(): { mx: number; my: number } {
    let mx = 0;
    let my = 0;
    if (this.down('KeyA', 'ArrowLeft')) mx -= 1;
    if (this.down('KeyD', 'ArrowRight')) mx += 1;
    if (this.down('KeyW', 'ArrowUp')) my -= 1;
    if (this.down('KeyS', 'ArrowDown')) my += 1;
    return { mx, my };
  }
}
