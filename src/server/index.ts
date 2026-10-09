import { networkInterfaces } from 'node:os';
import { createGameServer } from './network.js';
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
const server = await createGameServer({ port, dev: process.argv.includes('--dev') });
console.log(`Ridge Relay listening on http://localhost:${server.port}`);
for (const addresses of Object.values(networkInterfaces())) for (const a of addresses ?? []) {
  if (a.family === 'IPv4' && !a.internal) console.log(`LAN: http://${a.address}:${server.port}`);
}
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => {
  if (closing) return; closing = true; await server.close(); process.exit(0);
});
