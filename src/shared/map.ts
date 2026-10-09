import { clamp } from './math.js';
export const MAP = { halfSize: 80, grid: 2, name: 'Sable Valley' } as const;
export const SPAWNS = [
  { x: -58, z: -58 }, { x: 58, z: 58 }, { x: 58, z: -58 }, { x: -58, z: 58 },
  { x: 0, z: -64 }, { x: 0, z: 64 }, { x: -64, z: 0 }, { x: 64, z: 0 }
];
function rawHeight(x: number, z: number) {
  const hill = (cx: number, cz: number, h: number, width: number) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (width ** 2));
  return 1.5 + Math.sin(x * 0.048) * Math.cos(z * 0.053) * 1.6
    + hill(-35, -22, 10, 18) + hill(36, 30, 12, 18)
    + hill(40, -32, 17, 10) - hill(-32, 38, 3, 22);
}
// Exactly the same triangles as the client mesh: diagonal from (0,0) to (1,1).
export function terrainHeight(x: number, z: number) {
  const step = MAP.grid;
  x = clamp(x, -MAP.halfSize, MAP.halfSize - 1e-6);
  z = clamp(z, -MAP.halfSize, MAP.halfSize - 1e-6);
  const x0 = Math.floor(x / step) * step, z0 = Math.floor(z / step) * step;
  const u = (x - x0) / step, v = (z - z0) / step;
  const a = rawHeight(x0, z0), b = rawHeight(x0 + step, z0);
  const c = rawHeight(x0, z0 + step), d = rawHeight(x0 + step, z0 + step);
  return u > v ? a + (b - a) * u + (d - b) * v : a + (d - c) * u + (c - a) * v;
}
export function terrainSlope(x: number, z: number) {
  return { x: (terrainHeight(x + 0.6, z) - terrainHeight(x - 0.6, z)) / 1.2,
    z: (terrainHeight(x, z + 0.6) - terrainHeight(x, z - 0.6)) / 1.2 };
}
export interface MapBox { id: string; x: number; z: number; width: number; depth: number; height: number; y: number }
const buildingLayout = [
  [-12, -10, 8, 7, 6], [12, -10, 7, 8, 7], [-12, 12, 8, 7, 5],
  [12, 12, 7, 9, 6], [0, 30, 9, 6, 5], [-28, 6, 6, 7, 4]
];
export const BUILDINGS: MapBox[] = buildingLayout.map(([x, z, width, depth, height], i) => ({
  id: `building-${i}`, x, z, width, depth, height, y: terrainHeight(x, z) - 1
}));
export const ROCKS: MapBox[] = [
  [-42, 8, 7, 6, 4], [28, -3, 5, 7, 3], [4, -35, 8, 5, 3], [-6, 48, 6, 5, 2.5]
].map(([x, z, width, depth, height], i) => ({ id: `rock-${i}`, x, z, width, depth, height, y: terrainHeight(x, z) - 0.5 }));
