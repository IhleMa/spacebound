import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { AuthError, type AuthService } from '../auth/AuthService';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

/** Very small fixed-window rate limiter for auth endpoints (per IP). */
class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private max: number, private windowMs: number) {}
  allow(key: string): boolean {
    const now = Date.now();
    const e = this.hits.get(key);
    if (!e || e.resetAt < now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    e.count++;
    return e.count <= this.max;
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
}

function readJson(req: http.IncomingMessage, limit = 4096): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new AuthError('Request too large.', 413));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        resolve(typeof v === 'object' && v ? v : {});
      } catch {
        reject(new AuthError('Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

export function createHttpServer(auth: AuthService, clientDist: string, getOnline: () => number): http.Server {
  const limiter = new RateLimiter(20, 60_000);
  const distRoot = path.resolve(clientDist);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (url.pathname === '/api/health') {
        sendJson(res, 200, { ok: true, online: getOnline() });
        return;
      }
      if (req.method === 'POST' && (url.pathname === '/api/register' || url.pathname === '/api/login')) {
        const ip = req.socket.remoteAddress ?? 'unknown';
        if (!limiter.allow(ip)) {
          sendJson(res, 429, { error: 'Too many attempts. Please wait a minute.' });
          return;
        }
        const body = await readJson(req);
        const result = url.pathname === '/api/register'
          ? await auth.register(body.username, body.password)
          : await auth.login(body.username, body.password);
        sendJson(res, 200, { token: result.token, username: result.account.username });
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'Not found.' });
        return;
      }

      // Static client (production build).
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
      }
      let file = path.resolve(distRoot, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(distRoot)) {
        res.writeHead(403).end();
        return;
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distRoot, 'index.html');
      if (!fs.existsSync(file)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Client not built. Run `npm run build` or use `npm run dev`.');
        return;
      }
      const ext = path.extname(file);
      res.writeHead(200, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Cache-Control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
    } catch (err) {
      if (err instanceof AuthError) sendJson(res, err.status, { error: err.message });
      else {
        console.error('[http]', err);
        sendJson(res, 500, { error: 'Internal server error.' });
      }
    }
  });
}
