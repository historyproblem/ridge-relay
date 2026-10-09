import test from 'node:test';
import assert from 'node:assert/strict';
import { World, type Player } from '../src/server/world.js';
import { CONFIG } from '../src/shared/config.js';
import { BUILDINGS, ROCKS, terrainHeight, terrainSlope } from '../src/shared/map.js';
import { emptyInput, type InputMessage } from '../src/shared/types.js';
import { terrainHit, boxHit, circleBox } from '../src/shared/collision.js';
import { canMove } from '../src/server/tank.js';
import { traceShot } from '../src/server/weapon.js';
import { distance, weaponPose } from '../src/shared/math.js';
import { parseMessage } from '../src/server/protocol.js';
function place(p: Player, x: number, z: number, yaw = 0) {
  Object.assign(p.tank, { x, y: terrainHeight(x, z) + CONFIG.tank.clearance, z, yaw, turretYaw: yaw, gunPitch: 0, hp: 100, shield: 0, speed: 0 });
  const slope = terrainSlope(x, z); p.tank.slopeX = slope.x; p.tank.slopeZ = slope.z;
}
function run(w: World, seconds: number, commands: [Player, Partial<InputMessage>][] = []) {
  for (let step = 0; step < Math.ceil(seconds * CONFIG.tickRate); step++) {
    for (const [p, command] of commands) w.setInput(p.tank.id, { ...emptyInput(), ...command, seq: p.input.seq + 1, aimYaw: command.aimYaw ?? p.tank.turretYaw });
    w.tick();
  }
}
test('tank accelerates, follows heightfield, rotates turret independently, and brakes on stale input', () => {
  const w = new World(), p = w.join('Driver')!; place(p, -55, -55);
  run(w, 1, [[p, { throttle: 1, turn: 0.5, aimYaw: -1, aimPitch: 0.3 }]]);
  assert.ok(p.tank.speed > 8); assert.ok(p.tank.yaw > 0.5);
  assert.ok(p.tank.turretYaw < -0.9); assert.ok(p.tank.gunPitch > 0.25);
  assert.equal(p.tank.y, terrainHeight(p.tank.x, p.tank.z) + CONFIG.tank.clearance);
  run(w, 2); assert.equal(p.tank.speed, 0);
});
test('solid buildings, rocks, tanks, boundary and steep slopes block movement', () => {
  const w = new World(), p = w.join('Driver')!, q = w.join('Other')!; place(p, -12, -24); place(q, -12, -32);
  assert.equal(canMove(p.tank, -12, -10, w.tanks, w.solidBoxes), false);
  assert.equal(canMove(p.tank, ROCKS[0].x, ROCKS[0].z, w.tanks, w.solidBoxes), false);
  assert.equal(canMove(p.tank, q.tank.x, q.tank.z, w.tanks, w.solidBoxes), false);
  assert.equal(canMove(p.tank, 79, 0, w.tanks, w.solidBoxes), false);
  let steep: { x: number; z: number } | undefined;
  for (let x = 30; x < 50; x += 1) for (let z = -43; z < -21; z += 1) {
    const s = terrainSlope(x, z); if (Math.hypot(s.x, s.z) > CONFIG.tank.maxSlope) steep = { x, z };
  }
  assert.ok(steep); assert.equal(canMove(p.tank, steep.x, steep.z, w.tanks, w.solidBoxes), false);
});
test('shells damage a target, count kills, then respawn at a free shielded spawn', () => {
  const w = new World(), a = w.join('Shooter')!, b = w.join('Target')!;
  place(a, -8, -49); place(b, -8, -31);
  run(w, 0.4, [[a, { fire: true, aimYaw: 0 }]]); assert.equal(b.tank.hp, 60);
  run(w, 4.6, [[a, { fire: true, aimYaw: 0 }]]);
  assert.equal(b.tank.hp, 0); assert.equal(a.tank.kills, 1); assert.equal(b.tank.deaths, 1);
  run(w, 5.1); assert.equal(b.tank.hp, 100); assert.ok(b.tank.shield > 0);
  assert.ok(Math.hypot(a.tank.x - b.tank.x, a.tank.z - b.tank.z) >= CONFIG.tank.radius * 2);
});
test('swept projectiles select the earliest obstacle and terrain intersection', () => {
  const box = BUILDINGS[0], y = box.y + box.height - 0.5;
  const a = { x: box.x, y, z: box.z - 20 }, b = { x: box.x, y, z: box.z + 20 };
  assert.ok(boxHit(a, b, box) !== null);
  const hit = traceShot(a, b, 'none', [], [], [box]); assert.equal(hit?.id, box.id);
  const start = { x: 0, y: 50, z: 0 }, end = { x: 0, y: -20, z: 0 };
  const t = terrainHit(start, end)!; assert.ok(t > 0 && t < 1);
  assert.ok(Math.abs(start.y + (end.y - start.y) * t - terrainHeight(0, 0)) < 1e-7);
  // A horizontal fast shell crossing a tall hill hits its rising face.
  assert.ok(terrainHit({ x: 20, y: 10, z: -32 }, { x: 60, y: 10, z: -32 }) !== null);
});
test('buildings pass through intact/damaged/destroyed and lose their collider; late joins see rubble', () => {
  const w = new World(), p = w.join('Demolition')!, b = BUILDINGS[0]; place(p, b.x, b.z - 18);
  run(w, 0.5, [[p, { fire: true }]]); assert.equal(w.buildings.get(b.id)!.hp, 80);
  run(w, 4.5, [[p, { fire: true }]]); assert.equal(w.buildings.get(b.id)!.hp, 0);
  assert.ok(!w.solidBoxes.some(box => box.id === b.id));
  assert.equal(canMove(p.tank, b.x, b.z, w.tanks, w.solidBoxes), true);
  w.join('Late arrival'); assert.equal(w.snapshot().buildings.find(s => s.id === b.id)!.hp, 0);
});
test('barrel muzzle matches actual terrain tilt, independent yaw and gun elevation', () => {
  const w = new World(), p = w.join('Gunner')!; place(p, 31, 26, 0.7);
  p.tank.turretYaw = -0.4; p.tank.gunPitch = 0.2;
  const pose = weaponPose(p.tank);
  assert.ok(Math.abs(distance(pose.muzzle, pose.pivot) - 2.8) < 1e-8);
  assert.ok(Math.abs(Math.hypot(pose.direction.x, pose.direction.y, pose.direction.z) - 1) < 1e-8);
});
test('one scout per owner, stationary vulnerable tank, range/height/time limits, return and cooldown', () => {
  const w = new World(), p = w.join('Pilot')!; place(p, -55, -55);
  run(w, 0.1, [[p, { droneAction: 1, throttle: 1 }]]);
  assert.equal(w.drones.size, 1); assert.equal(p.tank.speed, 0); assert.equal(p.tank.shield, 0);
  const original = { ...p.tank };
  run(w, 6, [[p, { droneAction: 1, throttle: 1, lift: 1, aimYaw: 0 }]]);
  const d = w.drones.get(p.tank.id)!; assert.ok(d);
  assert.ok(distance(d, p.tank) <= CONFIG.drone.range + 0.01);
  assert.ok(d.y <= terrainHeight(p.tank.x, p.tank.z) + CONFIG.drone.maxAltitude + 0.01);
  assert.equal(p.tank.x, original.x); assert.equal(p.tank.z, original.z);
  run(w, 0.1, [[p, { droneAction: 2 }]]); assert.equal(w.drones.size, 0); assert.ok(p.tank.droneCooldown > 0);
  run(w, 0.1, [[p, { droneAction: 3 }]]); assert.equal(w.drones.size, 0);
  run(w, 10.1); run(w, 0.1, [[p, { droneAction: 4 }]]); assert.equal(w.drones.size, 1);
  run(w, 35.1, [[p, { droneAction: 4 }]]); assert.equal(w.drones.size, 0);
});
test('scouts crash into buildings and can be shot; tank loss and disconnect end FPV', () => {
  const w = new World(), p = w.join('Pilot')!; place(p, -12, -22);
  run(w, 0.1, [[p, { droneAction: 1 }]]);
  run(w, 1.2, [[p, { droneAction: 1, throttle: 1, aimYaw: 0 }]]); assert.equal(w.drones.size, 0);
  run(w, 11); place(p, -55, -55); run(w, 0.1, [[p, { droneAction: 2 }]]);
  const d = w.drones.get(p.tank.id)!;
  assert.equal(traceShot({ x: d.x - 10, y: d.y, z: d.z }, { x: d.x + 10, y: d.y, z: d.z }, 'other', [], [d], [])?.kind, 'drone');
  // A real shell crossing the scout also removes it from the authoritative world.
  w.shells.set('test-shell', { id: 'test-shell', ownerId: 'other', x: d.x - 1, y: d.y, z: d.z, velocity: { x: 110, y: 0, z: 0 }, life: 1 });
  w.tick(); assert.equal(w.drones.size, 0);
  run(w, 11); run(w, 0.1, [[p, { droneAction: 3 }]]); p.tank.hp = 0; p.tank.respawn = 5; w.tick(); assert.equal(w.drones.size, 0);
  run(w, 11); run(w, 0.1, [[p, { droneAction: 4 }]]); assert.equal(w.drones.size, 1);
  w.disconnect(p.tank.id); assert.equal(w.drones.size, 0);
});
test('reconnect preserves a seat and score; disconnected slots expire; fifth player is rejected', () => {
  const w = new World(), p = w.join('One')!; p.tank.kills = 7;
  for (const name of ['Two', 'Three', 'Four']) assert.ok(w.join(name));
  assert.equal(w.join('Five'), null); w.disconnect(p.tank.id);
  assert.equal(w.join('Five'), null);
  assert.equal(w.join('One', p.token)?.tank.kills, 7); assert.equal(w.players.size, 4);
  w.disconnect(p.tank.id); run(w, 30.1); assert.equal(w.players.size, 3); assert.ok(w.join('Five'));
});
test('invalid network messages and client-assigned state are rejected or stripped', () => {
  assert.equal(parseMessage('not json'), null); assert.equal(parseMessage('null'), null);
  assert.equal(parseMessage(JSON.stringify({ ...emptyInput(), throttle: 99 })), null);
  assert.equal(parseMessage(JSON.stringify({ ...emptyInput(), aimYaw: 'NaN' })), null);
  assert.equal(parseMessage(JSON.stringify({ ...emptyInput(), droneAction: -1 })), null);
  const clean = parseMessage(JSON.stringify({ ...emptyInput(), x: 999, hp: 999, kills: 999 }));
  assert.ok(clean); assert.equal('x' in clean, false); assert.equal('hp' in clean, false);
  assert.equal(parseMessage('{"type":"hello","name":"<Scout>"}')?.type, 'hello');
});
