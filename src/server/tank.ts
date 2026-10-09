import { CONFIG } from '../shared/config.js';
import { MAP, terrainHeight, terrainSlope, type MapBox } from '../shared/map.js';
import { approach, approachAngle, clamp, wrapAngle } from '../shared/math.js';
import { circleBox } from '../shared/collision.js';
import type { InputMessage, TankState } from '../shared/types.js';
export function canMove(t: TankState, x: number, z: number, tanks: TankState[], boxes: MapBox[]) {
  const r = CONFIG.tank.radius;
  if (Math.abs(x) > MAP.halfSize - r || Math.abs(z) > MAP.halfSize - r) return false;
  if (boxes.some(b => circleBox(x, z, r, b))) return false;
  if (tanks.some(other => other.id !== t.id && other.hp > 0 && Math.hypot(other.x - x, other.z - z) < r * 2)) return false;
  const s = terrainSlope(x, z);
  const current = terrainSlope(t.x, t.z);
  // A tank already on steep ground can always retreat downhill.
  return Math.hypot(s.x, s.z) <= CONFIG.tank.maxSlope ||
    (Math.hypot(current.x, current.z) > CONFIG.tank.maxSlope && terrainHeight(x, z) < terrainHeight(t.x, t.z));
}
export function updateTank(t: TankState, input: InputMessage, dt: number, tanks: TankState[], boxes: MapBox[], flying: boolean) {
  t.reload = Math.max(0, t.reload - dt); t.shield = Math.max(0, t.shield - dt);
  t.droneCooldown = Math.max(0, t.droneCooldown - dt);
  if (t.hp <= 0) { t.speed = 0; t.respawn = Math.max(0, t.respawn - dt); return; }
  if (flying) { t.speed = 0; return; }
  t.yaw = wrapAngle(t.yaw + input.turn * CONFIG.tank.turnSpeed * dt);
  t.turretYaw = approachAngle(t.turretYaw, input.aimYaw, CONFIG.tank.turretSpeed * dt);
  t.gunPitch = approach(t.gunPitch, clamp(input.aimPitch, CONFIG.tank.minPitch, CONFIG.tank.maxPitch), CONFIG.tank.gunSpeed * dt);
  const target = input.throttle * (input.throttle >= 0 ? CONFIG.tank.speed : CONFIG.tank.reverseSpeed);
  const braking = input.throttle === 0 || Math.sign(target) !== Math.sign(t.speed);
  t.speed = approach(t.speed, target, (braking ? CONFIG.tank.braking : CONFIG.tank.acceleration) * dt);
  const x = t.x + Math.sin(t.yaw) * t.speed * dt, z = t.z + Math.cos(t.yaw) * t.speed * dt;
  if (canMove(t, x, z, tanks, boxes)) { t.x = x; t.z = z; } else t.speed = 0;
  t.y = terrainHeight(t.x, t.z) + CONFIG.tank.clearance;
  const s = terrainSlope(t.x, t.z); t.slopeX = s.x; t.slopeZ = s.z;
}
