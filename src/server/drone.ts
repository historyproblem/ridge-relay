import { CONFIG } from '../shared/config.js';
import { MAP, terrainHeight, type MapBox } from '../shared/map.js';
import { approach, approachAngle, clamp, distance, mix } from '../shared/math.js';
import { terrainHit, boxHit } from '../shared/collision.js';
import type { DroneState, InputMessage, TankState, Vec3 } from '../shared/types.js';
export interface SimDrone extends DroneState { velocity: Vec3 }
export function updateDrone(d: SimDrone, owner: TankState, input: InputMessage, dt: number, boxes: MapBox[]): boolean {
  d.remaining -= dt;
  if (d.remaining <= 0 || owner.hp <= 0) return false;
  d.yaw = approachAngle(d.yaw, input.aimYaw, CONFIG.drone.turnSpeed * dt);
  d.pitch = approach(d.pitch, clamp(input.aimPitch, -CONFIG.drone.maxPitch, CONFIG.drone.maxPitch), CONFIG.drone.turnSpeed * dt);
  const divisor = Math.max(1, Math.hypot(input.throttle, input.strafe, input.lift));
  const target = { x: (Math.sin(d.yaw) * input.throttle - Math.cos(d.yaw) * input.strafe) * CONFIG.drone.speed / divisor,
    y: input.lift * CONFIG.drone.verticalSpeed / divisor,
    z: (Math.cos(d.yaw) * input.throttle + Math.sin(d.yaw) * input.strafe) * CONFIG.drone.speed / divisor };
  for (const axis of ['x', 'y', 'z'] as const) d.velocity[axis] = approach(d.velocity[axis], target[axis], CONFIG.drone.acceleration * dt);
  const next = { x: d.x + d.velocity.x * dt, y: d.y + d.velocity.y * dt, z: d.z + d.velocity.z * dt };
  const offset = { x: next.x - owner.x, y: next.y - owner.y, z: next.z - owner.z };
  const range = distance(next, owner);
  if (range > CONFIG.drone.range) {
    next.x = owner.x + offset.x * CONFIG.drone.range / range;
    next.y = owner.y + offset.y * CONFIG.drone.range / range;
    next.z = owner.z + offset.z * CONFIG.drone.range / range;
    d.velocity = { x: 0, y: 0, z: 0 };
  }
  next.y = Math.min(next.y, terrainHeight(owner.x, owner.z) + CONFIG.drone.maxAltitude);
  if (Math.abs(next.x) > MAP.halfSize - 0.5 || Math.abs(next.z) > MAP.halfSize - 0.5) return false;
  let hit = terrainHit(d, next, CONFIG.drone.minClearance);
  for (const b of boxes) { const t = boxHit(d, next, b, CONFIG.drone.radius); if (t !== null && (hit === null || t < hit)) hit = t; }
  if (hit !== null) { Object.assign(d, mix(d, next, hit)); return false; }
  Object.assign(d, next); return true;
}
