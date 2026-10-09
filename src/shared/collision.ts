import type { Vec3 } from './types.js';
import { MAP, terrainHeight, type MapBox } from './map.js';
import { clamp, mix, sub, dot } from './math.js';
export function circleBox(x: number, z: number, radius: number, b: MapBox) {
  const dx = x - clamp(x, b.x - b.width / 2, b.x + b.width / 2);
  const dz = z - clamp(z, b.z - b.depth / 2, b.z + b.depth / 2);
  return dx * dx + dz * dz < radius * radius;
}
export function segmentBox(a: Vec3, b: Vec3, min: Vec3, max: Vec3): number | null {
  let near = 0, far = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-9) { if (a[axis] < min[axis] || a[axis] > max[axis]) return null; }
    else {
      const t1 = (min[axis] - a[axis]) / delta, t2 = (max[axis] - a[axis]) / delta;
      near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2));
      if (near > far) return null;
    }
  }
  return near;
}
export function boxHit(a: Vec3, b: Vec3, box: MapBox, radius = 0) {
  return segmentBox(a, b, { x: box.x - box.width / 2 - radius, y: box.y - radius, z: box.z - box.depth / 2 - radius },
    { x: box.x + box.width / 2 + radius, y: box.y + box.height + radius, z: box.z + box.depth / 2 + radius });
}
export function sphereHit(a: Vec3, b: Vec3, center: Vec3, radius: number): number | null {
  const d = sub(b, a), offset = sub(a, center), aa = dot(d, d), c = dot(offset, offset) - radius * radius;
  if (c <= 0) return 0;
  const bb = dot(offset, d), discriminant = bb * bb - aa * c;
  if (aa < 1e-12 || discriminant < 0) return null;
  const t = (-bb - Math.sqrt(discriminant)) / aa;
  return t >= 0 && t <= 1 ? t : null;
}
// Split at grid edges AND triangle diagonals, then intersect each linear height plane.
// This is exact for our triangulated heightfield, even for fast projectiles.
export function terrainHit(a: Vec3, b: Vec3, clearance = 0): number | null {
  const cuts = [0, 1];
  for (const [start, end] of [[a.x, b.x], [a.z, b.z], [a.x - a.z, b.x - b.z]]) {
    if (Math.abs(end - start) < 1e-9) continue;
    const first = Math.ceil(Math.min(start, end) / MAP.grid), last = Math.floor(Math.max(start, end) / MAP.grid);
    for (let i = first; i <= last; i++) {
      const t = (i * MAP.grid - start) / (end - start);
      if (t > 0 && t < 1) cuts.push(t);
    }
  }
  cuts.sort((x, y) => x - y);
  let previousT = 0, previousHeight = a.y - terrainHeight(a.x, a.z) - clearance;
  if (previousHeight <= 0) return 0;
  for (const t of cuts.slice(1)) {
    const p = mix(a, b, t), height = p.y - terrainHeight(p.x, p.z) - clearance;
    if (height <= 0) return previousT + (t - previousT) * previousHeight / (previousHeight - height);
    previousT = t; previousHeight = height;
  }
  return null;
}
