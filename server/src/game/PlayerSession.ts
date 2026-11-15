import type { NotifyLevel, ServerMsg } from '@spacebound/shared';
import type { PlayerState } from '../player/PlayerState';
import type { PlayerEntity } from './entities';

/** Transport abstraction so the game logic does not depend on WebSockets (and is easy to test). */
export interface Connection {
  send(msg: ServerMsg): void;
  close(reason: string): void;
}

/** Binds a connected client to its persistent state and in-world entity. */
export class PlayerSession {
  entity: PlayerEntity | null = null;
  lastProfileSentAt = 0;
  /** Send the full deposit list with the next snapshot (e.g. after joining). */
  forceDepositSync = true;

  constructor(readonly conn: Connection, readonly state: PlayerState) {}

  get accountId(): number {
    return this.state.accountId;
  }

  send(msg: ServerMsg): void {
    this.conn.send(msg);
  }

  notify(level: NotifyLevel, text: string): void {
    this.conn.send({ t: 'notify', level, text });
  }
}
