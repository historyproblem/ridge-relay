import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../src/server/network.js';
import { CONFIG } from '../src/shared/config.js';
import { BUILDINGS, terrainHeight, terrainSlope } from '../src/shared/map.js';
import { emptyInput, type ServerMessage, type Snapshot } from '../src/shared/types.js';
class Client {
  ws: WebSocket; messages: ServerMessage[] = [];
  constructor(url: string) { this.ws = new WebSocket(url); this.ws.on('message', raw => this.messages.push(JSON.parse(raw.toString()))); }
  async join(name: string, token?: string) {
    if (this.ws.readyState !== WebSocket.OPEN) await new Promise<void>((resolve, reject) => { this.ws.once('open', resolve); this.ws.once('error', reject); });
    this.ws.send(JSON.stringify({ type: 'hello', name, token }));
    return this.wait(m => m.type === 'welcome' || m.type === 'error');
  }
  async wait(predicate: (m: ServerMessage) => boolean, timeout = 5000): Promise<ServerMessage> {
    const start = performance.now();
    while (performance.now() - start < timeout) {
      const found = this.messages.find(predicate); if (found) return found;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Timed out waiting for network state');
  }
  close() { this.ws.close(); }
}
test('real WebSocket clients share movement, aim, damage, destruction, late-join state, scout, death, respawn and reconnect', { timeout: 20000 }, async () => {
  const server = await createGameServer({ port: 0, host: '127.0.0.1' });
  const url = `ws://127.0.0.1:${server.port}/ws`, a = new Client(url), b = new Client(url), clients = [a, b];
  try {
    const aw = await a.join('Alpha'), bw = await b.join('Bravo'); assert.equal(aw.type, 'welcome'); assert.equal(bw.type, 'welcome');
    if (aw.type !== 'welcome' || bw.type !== 'welcome') throw new Error('Welcome missing');
    const aid = aw.id, bid = bw.id;
    await a.wait(m => m.type === 'snapshot' && m.tanks.length === 2); await b.wait(m => m.type === 'snapshot' && m.tanks.length === 2);
    a.ws.send(JSON.stringify({ ...emptyInput(), seq: 1, throttle: 1, turn: 0.5, aimYaw: -1, aimPitch: 0.3 }));
    const moved = await b.wait(m => m.type === 'snapshot' && m.tanks.some(t => t.id === aid && t.speed > 1 && t.gunPitch > 0.03 && Math.abs(t.turretYaw - t.yaw) > 0.05));
    assert.equal(moved.type, 'snapshot');
    const pa = server.world.players.get(aid)!, pb = server.world.players.get(bid)!;
    for (const [p, z] of [[pa, -49], [pb, -31]] as const) {
      const x = -8, slope = terrainSlope(x, z);
      Object.assign(p.tank, { x, y: terrainHeight(x, z) + 0.8, z, yaw: 0, turretYaw: 0, gunPitch: 0, slopeX: slope.x, slopeZ: slope.z, speed: 0, hp: 100, shield: 0, reload: 0 });
      p.input = { ...emptyInput(), seq: p.input.seq };
    }
    const shoot = (seq: number) => a.ws.send(JSON.stringify({ ...emptyInput(), seq, fire: true, aimYaw: 0 }));
    shoot(2);
    const damagedA = await a.wait(m => m.type === 'snapshot' && m.tanks.some(t => t.id === bid && t.hp === 60));
    const damagedB = await b.wait(m => m.type === 'snapshot' && m.tanks.some(t => t.id === bid && t.hp === 60));
    assert.equal((damagedA as Snapshot).tanks.find(t => t.id === bid)!.hp, (damagedB as Snapshot).tanks.find(t => t.id === bid)!.hp);
    pa.tank.reload = 0; shoot(3); await b.wait(m => m.type === 'snapshot' && m.tanks.some(t => t.id === bid && t.hp === 20));
    pa.tank.reload = 0; shoot(4); await b.wait(m => m.type === 'snapshot' && m.tanks.some(t => t.id === bid && t.hp === 0));
    assert.equal(pa.tank.kills, 1);
    await b.wait(m => m.type === 'snapshot' && m.tanks.some(t => t.id === bid && t.hp === 100 && t.deaths === 1), 6500);
    const building = BUILDINGS[0];
    Object.assign(pa.tank, { x: building.x, z: building.z - 18, y: terrainHeight(building.x, building.z - 18) + 0.8, yaw: 0, turretYaw: 0, gunPitch: 0, speed: 0 });
    const slope = terrainSlope(pa.tank.x, pa.tank.z); pa.tank.slopeX = slope.x; pa.tank.slopeZ = slope.z;
    for (let i = 0; i < 3; i++) {
      pa.tank.reload = 0; shoot(5 + i);
      await b.wait(m => m.type === 'snapshot' && m.buildings.some(s => s.id === building.id && s.hp === CONFIG.building.health - CONFIG.weapon.damage * (i + 1)));
    }
    await a.wait(m => m.type === 'snapshot' && m.buildings.some(s => s.id === building.id && s.hp === 0));
    assert.ok(!server.world.solidBoxes.some(s => s.id === building.id));
    const c = new Client(url); clients.push(c); const cw = await c.join('Charlie'); assert.equal(cw.type, 'welcome');
    if (cw.type === 'welcome') assert.equal(cw.state.buildings.find(s => s.id === building.id)!.hp, 0);
    a.ws.send(JSON.stringify({ ...emptyInput(), seq: 8, droneAction: 1 }));
    await b.wait(m => m.type === 'snapshot' && m.drones.some(d => d.ownerId === aid));
    const initial = { ...server.world.drones.get(aid)! };
    a.ws.send(JSON.stringify({ ...emptyInput(), seq: 9, droneAction: 1, lift: 1 }));
    await b.wait(m => m.type === 'snapshot' && m.drones.some(d => d.ownerId === aid && d.y > initial.y + 0.15));
    const disconnectedAt = server.world.time; a.close();
    await b.wait(m => m.type === 'snapshot' && m.time > disconnectedAt && m.tanks.some(t => t.id === aid && !t.connected) && !m.drones.some(d => d.ownerId === aid));
    const reconnected = new Client(url); clients.push(reconnected);
    const rw = await reconnected.join('Alpha', aw.token); assert.equal(rw.type, 'welcome'); if (rw.type === 'welcome') { assert.equal(rw.id, aid); assert.equal(rw.state.tanks.find(t => t.id === aid)!.kills, 1); }
    const d = new Client(url); clients.push(d); assert.equal((await d.join('Delta')).type, 'welcome');
    const e = new Client(url); clients.push(e); const ew = await e.join('Echo'); assert.equal(ew.type, 'error'); if (ew.type === 'error') assert.equal(ew.code, 'full');
    const bad = new Client(url); clients.push(bad);
    await new Promise<void>(r => bad.ws.once('open', r)); bad.ws.send('{not json'); assert.equal((await bad.wait(m => m.type === 'error')).type, 'error');
  } finally { for (const client of clients) client.ws.terminate(); await server.close(); }
});
