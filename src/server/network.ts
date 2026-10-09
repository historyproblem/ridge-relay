import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { CONFIG } from '../shared/config.js';
import { World } from './world.js';
import { parseMessage } from './protocol.js';
export async function createGameServer(options: { port?: number; host?: string; dev?: boolean; world?: World } = {}) {
  const world = options.world ?? new World();
  let devMiddleware: ((req: IncomingMessage, res: ServerResponse) => void) | undefined;
  const root = resolve('dist/client');
  const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
  const http = createServer(async (req, res) => {
    if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ status: 'ok', players: world.tanks.filter(t => t.connected).length, capacity: CONFIG.maxPlayers })); return; }
    if (devMiddleware) { devMiddleware(req, res); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
      const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      const content = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch { res.writeHead(404); res.end('Not found. Run npm run build before npm start.'); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048, perMessageDeflate: false });
  const active = new Map<string, WebSocket>();
  const alive = new WeakMap<WebSocket, boolean>();
  http.on('upgrade', (req, socket, head) => {
    if (req.url?.split('?')[0] === '/ws') wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    else if (!options.dev) socket.destroy();
  });
  wss.on('connection', ws => {
    let playerId: string | null = null, messages = 0, windowStart = performance.now();
    alive.set(ws, true); ws.on('pong', () => alive.set(ws, true));
    const helloTimeout = setTimeout(() => { if (!playerId) ws.close(1008, 'Send hello first'); }, 5000);
    const reject = (message: string, code: 'invalid' | 'full' = 'invalid') => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'error', code, message }));
      ws.close(1008, message);
    };
    ws.on('error', () => { /* The close event performs session cleanup. */ });
    ws.on('message', (raw, binary) => {
      const now = performance.now(); if (now - windowStart > 1000) { windowStart = now; messages = 0; }
      if (++messages > 120) { reject('Too many commands'); return; }
      const m = binary ? null : parseMessage(raw.toString());
      if (!m) { reject('Invalid network message'); return; }
      if (m.type === 'hello') {
        if (playerId) { reject('Already joined'); return; }
        const p = world.join(m.name, m.token);
        if (!p) { reject(`Arena full: ${CONFIG.maxPlayers} seats. A disconnected seat is reserved for ${CONFIG.reconnectGrace}s.`, 'full'); return; }
        playerId = p.tank.id; clearTimeout(helloTimeout);
        const previous = active.get(playerId); if (previous) previous.close(4001, 'Session moved to another tab');
        active.set(playerId, ws);
        ws.send(JSON.stringify({ type: 'welcome', id: playerId, token: p.token, time: world.time, state: world.snapshot() }));
      } else {
        if (!playerId) { reject('Send hello first'); return; }
        if (active.get(playerId) === ws) world.setInput(playerId, m);
      }
    });
    ws.on('close', () => {
      clearTimeout(helloTimeout);
      if (playerId && active.get(playerId) === ws) { active.delete(playerId); world.disconnect(playerId); }
    });
  });
  let accumulator = 0, lastTime = performance.now(), ticks = 0;
  const simulation = setInterval(() => {
    const now = performance.now(); accumulator += Math.min(0.25, (now - lastTime) / 1000); lastTime = now;
    while (accumulator >= 1 / CONFIG.tickRate) {
      world.tick(); accumulator -= 1 / CONFIG.tickRate;
      if (++ticks % (CONFIG.tickRate / CONFIG.snapshotRate) === 0) {
        const data = JSON.stringify(world.snapshot());
        for (const ws of active.values()) {
          if (ws.bufferedAmount > 1024 * 1024) ws.terminate();
          else if (ws.readyState === WebSocket.OPEN) ws.send(data);
        }
      }
    }
  }, 1000 / CONFIG.tickRate / 2);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!alive.get(ws)) { ws.terminate(); continue; } alive.set(ws, false); ws.ping(); }
  }, 10000);
  let vite: Awaited<ReturnType<typeof import('vite')['createServer']>> | undefined;
  if (options.dev) {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({ server: { middlewareMode: true, hmr: { server: http, path: '/__vite_hmr' } }, appType: 'spa' });
    devMiddleware = (req, res) => vite!.middlewares(req, res);
  }
  try {
    await new Promise<void>((resolveListen, rejectListen) => {
      http.once('error', rejectListen); http.listen(options.port ?? 3000, options.host ?? '0.0.0.0', resolveListen);
    });
  } catch (error) {
    clearInterval(simulation); clearInterval(heartbeat); wss.close(); await vite?.close(); throw error;
  }
  return {
    http, world, port: (http.address() as { port: number }).port,
    async close() {
      clearInterval(simulation); clearInterval(heartbeat);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>(r => wss.close(() => r()));
      await vite?.close();
      await new Promise<void>(r => http.close(() => r()));
    }
  };
}
