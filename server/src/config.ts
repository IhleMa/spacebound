import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Works both from src/ (tsx) and dist/ (bundled): both are one level below server/.
const serverRoot = path.resolve(here, '..');

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  dbPath: process.env.DB_PATH ?? path.join(serverRoot, 'data', 'spacebound.db'),
  clientDist: process.env.CLIENT_DIST ?? path.resolve(serverRoot, '..', 'client', 'dist'),
  /** How often dirty player state is flushed to the database (ms). */
  saveIntervalMs: 10_000,
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
  /** Max client messages per second before the connection is dropped. */
  maxMessagesPerSecond: 80,
  authTimeoutMs: 5000,
};
