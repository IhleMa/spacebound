import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { PASSWORD_MIN, USERNAME_RE } from '@spacebound/shared';
import type { DB } from '../db/database';

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEYLEN = 64;

export class AuthError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface AccountRef {
  id: number;
  username: string;
}

export class AuthService {
  constructor(private db: DB, private sessionTtlMs: number) {}

  async register(username: unknown, password: unknown): Promise<{ token: string; account: AccountRef }> {
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      throw new AuthError('Pilot name must be 3–16 characters (letters, numbers, underscore).');
    }
    if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > 128) {
      throw new AuthError(`Password must be at least ${PASSWORD_MIN} characters.`);
    }
    const exists = this.db.prepare('SELECT 1 FROM accounts WHERE username = ?').get(username);
    if (exists) throw new AuthError('That pilot name is already taken.', 409);
    const hash = await hashPassword(password);
    let id: number;
    try {
      id = Number(
        this.db.prepare('INSERT INTO accounts (username, password_hash, created_at) VALUES (?, ?, ?)')
          .run(username, hash, Date.now()).lastInsertRowid,
      );
    } catch {
      throw new AuthError('That pilot name is already taken.', 409);
    }
    const account = { id, username };
    return { token: this.createSession(id), account };
  }

  async login(username: unknown, password: unknown): Promise<{ token: string; account: AccountRef }> {
    if (typeof username !== 'string' || typeof password !== 'string') throw new AuthError('Invalid credentials.', 401);
    const row = this.db.prepare('SELECT id, username, password_hash FROM accounts WHERE username = ?').get(username) as
      | { id: number; username: string; password_hash: string }
      | undefined;
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      throw new AuthError('Invalid pilot name or password.', 401);
    }
    return { token: this.createSession(row.id), account: { id: row.id, username: row.username } };
  }

  /** Resolves a session token to its account, or null if invalid/expired. */
  resolveToken(token: unknown): AccountRef | null {
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
    const row = this.db
      .prepare(
        `SELECT a.id, a.username FROM sessions s JOIN accounts a ON a.id = s.account_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(hashToken(token), Date.now()) as AccountRef | undefined;
    return row ?? null;
  }

  private createSession(accountId: number): string {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
    this.db
      .prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(hashToken(token), accountId, now, now + this.sessionTtlMs);
    return token;
  }
}
