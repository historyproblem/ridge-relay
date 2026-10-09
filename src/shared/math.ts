import type { Vec3, TankState } from './types.js';
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const wrapAngle = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
export const approach = (n: number, target: number, delta: number) => n + clamp(target - n, -delta, delta);
export const approachAngle = (n: number, target: number, delta: number) => wrapAngle(n + clamp(wrapAngle(target - n), -delta, delta));
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
export const normalize = (a: Vec3) => scale(a, 1 / (length(a) || 1));
export const distance = (a: Vec3, b: Vec3) => length(sub(a, b));
export const mix = (a: Vec3, b: Vec3, t: number) => add(a, scale(sub(b, a), t));
export function tankAxes(t: Pick<TankState, 'yaw' | 'slopeX' | 'slopeZ'>) {
  const up = normalize({ x: -t.slopeX, y: 1, z: -t.slopeZ });
  const heading = { x: Math.sin(t.yaw), y: 0, z: Math.cos(t.yaw) };
  const right = normalize(cross(up, heading));
  const forward = normalize(cross(right, up));
  return { right, up, forward };
}
export function weaponPose(t: TankState) {
  const { right, up, forward } = tankAxes(t);
  const relative = wrapAngle(t.turretYaw - t.yaw);
  const turretForward = add(scale(right, Math.sin(relative)), scale(forward, Math.cos(relative)));
  const direction = normalize(add(scale(turretForward, Math.cos(t.gunPitch)), scale(up, Math.sin(t.gunPitch))));
  const pivot = add(add(t, scale(up, 1.25)), scale(turretForward, 0.6));
  return { pivot, muzzle: add(pivot, scale(direction, 2.8)), direction };
}
