import type http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '@spacebound/shared';
import type { AuthService } from '../auth/AuthService';
import type { GameServer } from '../game/GameServer';
import type { PlayerSession } from '../game/PlayerSession';

interface WsOptions {
  maxMessagesPerSecond: number;
  authTimeoutMs: number;
}

/** Attaches the realtime WebSocket endpoint (/ws) to the HTTP server. */
export function attachWebSocket(server: http.Server, auth: AuthService, game: GameServer, opts: WsOptions): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4 * 1024 });

  wss.on('connection', (ws: WebSocket) => {
    let session: PlayerSession | null = null;
    let windowStart = Date.now();
    let windowCount = 0;

    const send = (msg: ServerMsg) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };
    const conn = {
      send,
      close: (reason: string) => ws.close(4000, reason.slice(0, 100)),
    };

    const authTimer = setTimeout(() => {
      if (!session) ws.close(4001, 'auth timeout');
    }, opts.authTimeoutMs);

    ws.on('message', (data, isBinary) => {
      // Flood protection.
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        windowCount = 0;
      }
      if (++windowCount > opts.maxMessagesPerSecond) {
        ws.close(4008, 'rate limit');
        return;
      }
      if (isBinary) return;

      let msg: ClientMsg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;

      if (!session) {
        if (msg.t !== 'auth') return;
        const account = auth.resolveToken(msg.token);
        if (!account) {
          send({ t: 'kicked', reason: 'Session expired. Please log in again.' });
          ws.close(4003, 'invalid token');
          return;
        }
        clearTimeout(authTimer);
        session = game.join(conn, account);
        return;
      }
      game.handleMessage(session, msg);
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      if (session) game.leave(session);
    });
    ws.on('error', () => ws.close());
  });

  return wss;
}
