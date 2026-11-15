import { config } from './config';
import { openDatabase } from './db/database';
import { PlayerRepository } from './db/PlayerRepository';
import { AuthService } from './auth/AuthService';
import { GameServer } from './game/GameServer';
import { createHttpServer } from './net/http';
import { attachWebSocket } from './net/ws';

const db = openDatabase(config.dbPath);
const auth = new AuthService(db, config.sessionTtlMs);
const repo = new PlayerRepository(db);
const game = new GameServer(repo, config.saveIntervalMs);

const server = createHttpServer(auth, config.clientDist, () => game.sessions.size);
attachWebSocket(server, auth, game, {
  maxMessagesPerSecond: config.maxMessagesPerSecond,
  authTimeoutMs: config.authTimeoutMs,
});

game.start();
server.listen(config.port, config.host, () => {
  console.log(`[spacebound] server listening on http://localhost:${config.port}`);
  console.log(`[spacebound] database: ${config.dbPath}`);
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[spacebound] ${signal} received – saving players and shutting down…`);
  game.stop();
  server.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
