import { CONFIG } from '../shared/config.js';
import { boxHit, segmentBox, sphereHit, terrainHit } from '../shared/collision.js';
import { add, dot, mix, scale, sub, tankAxes, weaponPose } from '../shared/math.js';
import type { MapBox } from '../shared/map.js';
import type { ShellState, TankState, DroneState, Vec3 } from '../shared/types.js';
export type Hit = { t: number; position: Vec3; kind: 'terrain' | 'box' | 'tank' | 'drone'; id?: string };
export function createShell(tank: TankState, id: string): ShellState {
  const pose = weaponPose(tank);
  return { id, ownerId: tank.id, ...pose.muzzle, velocity: scale(pose.direction, CONFIG.weapon.speed), life: CONFIG.weapon.lifetime };
}
export function traceShot(a: Vec3, b: Vec3, ownerId: string, tanks: TankState[], drones: DroneState[], boxes: MapBox[]): Hit | null {
  let hit: Hit | null = null;
  const consider = (t: number | null, kind: Hit['kind'], id?: string) => {
    if (t !== null && (hit === null || t < hit.t)) hit = { t, kind, id, position: mix(a, b, t) };
  };
  consider(terrainHit(a, b), 'terrain');
  for (const box of boxes) consider(boxHit(a, b, box), 'box', box.id);
  for (const tank of tanks) {
    if (tank.id === ownerId || tank.hp <= 0) continue;
    const axes = tankAxes(tank);
    const local = (v: Vec3) => { const rel = sub(v, tank); return { x: dot(rel, axes.right), y: dot(rel, axes.up), z: dot(rel, axes.forward) }; };
    consider(segmentBox(local(a), local(b), { x: -1.65, y: -0.8, z: -2.2 }, { x: 1.65, y: 1.8, z: 2.2 }), 'tank', tank.id);
  }
  for (const drone of drones) consider(sphereHit(a, b, drone, 0.7), 'drone', drone.id);
  return hit;
}
export function stepShell(shell: ShellState, dt: number) {
  const end = add(shell, scale(shell.velocity, dt));
  shell.velocity.y -= CONFIG.weapon.gravity * dt; shell.life -= dt;
  return end;
}
