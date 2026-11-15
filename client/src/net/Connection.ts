import type { ClientMsg, ServerMsg } from '@spacebound/shared';

export interface ConnectionHandlers {
  onMessage(msg: ServerMsg): void;
  onClose(code: number, reason: string): void;
}

/** Thin WebSocket wrapper speaking the shared JSON protocol. */
export class Connection {
  private ws: WebSocket;
  private closedByUs = false;

  constructor(token: string, private handlers: ConnectionHandlers) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws.onopen = () => this.send({ t: 'auth', token });
    this.ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      this.handlers.onMessage(msg);
    };
    this.ws.onclose = (ev) => {
      if (!this.closedByUs) this.handlers.onClose(ev.code, ev.reason);
    };
  }

  get open(): boolean {
    return this.ws.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMsg): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.closedByUs = true;
    this.ws.close();
  }
}
