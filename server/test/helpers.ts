import type { ServerMsg } from '@spacebound/shared';
import { openDatabase, type DB } from '../src/db/database';
import { PlayerRepository } from '../src/db/PlayerRepository';
import { AuthService } from '../src/auth/AuthService';
import type { Connection } from '../src/game/PlayerSession';

export class FakeConnection implements Connection {
  messages: ServerMsg[] = [];
  closed: string | null = null;
  send(msg: ServerMsg): void {
    this.messages.push(msg);
  }
  close(reason: string): void {
    this.closed = reason;
  }
  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].t === t) return this.messages[i] as Extract<ServerMsg, { t: T }>;
    }
    return undefined;
  }
  notifications(): string[] {
    return this.messages.filter((m) => m.t === 'notify').map((m) => (m as { text: string }).text);
  }
}

export function setupDb(): { db: DB; repo: PlayerRepository; auth: AuthService } {
  const db = openDatabase(':memory:');
  return { db, repo: new PlayerRepository(db), auth: new AuthService(db, 60_000) };
}

export async function createAccount(auth: AuthService, name: string) {
  return (await auth.register(name, 'password123')).account;
}

/** Seeded PRNG for deterministic world tests. */
export function seeded(seed = 42): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
