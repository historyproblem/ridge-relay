import * as THREE from 'three';
import { BUILDINGS, ROCKS, MAP, terrainHeight, type MapBox } from '../shared/map.js';
import { CONFIG } from '../shared/config.js';
import { material, mesh } from './models.js';
class Building {
  root = new THREE.Group(); solid = new THREE.Group(); rubble = new THREE.Group(); cracks = new THREE.Group();
  private wall: THREE.MeshStandardMaterial; private hp = -1;
  constructor(readonly definition: MapBox, index: number) {
    const b = definition; this.root.position.set(b.x, b.y, b.z); this.root.add(this.solid, this.rubble);
    this.wall = material([0xd5c4a3, 0xc7b18e, 0xe0cda9][index % 3]);
    mesh(this.solid, new THREE.BoxGeometry(b.width, b.height - 0.4, b.depth), this.wall, 0, (b.height - 0.4) / 2);
    mesh(this.solid, new THREE.BoxGeometry(b.width, 0.4, b.depth), material(0x70736b), 0, b.height - 0.2);
    const windows = material(0x435053);
    for (const z of [-b.depth / 2 - 0.025, b.depth / 2 + 0.025]) {
      for (const x of [-b.width * 0.28, b.width * 0.28]) for (const y of [2, b.height - 1.4]) mesh(this.solid, new THREE.BoxGeometry(0.95, 1.05, 0.06), windows, x, y, z);
    }
    mesh(this.solid, new THREE.BoxGeometry(1.2, 2.4, 0.08), material(0x8a7760), 0, 1.2, b.depth / 2 + 0.05);
    this.solid.add(this.cracks);
    for (let i = 0; i < 6; i++) {
      const crack = mesh(this.cracks, new THREE.BoxGeometry(0.07, 1.8, 0.08), material(0x625448), (i - 2.5) * b.width / 7, 2.5 + Math.sin(i) * 0.8, b.depth / 2 + 0.06);
      crack.rotation.z = Math.sin(i * 2) * 0.8;
    }
    for (let i = 0; i < 15; i++) {
      const chunk = mesh(this.rubble, new THREE.BoxGeometry(0.8 + (i % 3) * 0.45, 0.4 + (i % 4) * 0.2, 1), this.wall,
        Math.sin(i * 12.5) * b.width * 0.42, 1.3 + (i % 3) * 0.12, Math.cos(i * 9.1) * b.depth * 0.4);
      chunk.rotation.set(i * 0.14, i * 0.8, i * 0.16);
    }
    this.update(CONFIG.building.health);
  }
  update(hp: number) {
    if (hp === this.hp) return; this.hp = hp;
    this.solid.visible = hp > 0; this.rubble.visible = hp <= 0;
    this.cracks.visible = hp > 0 && hp < CONFIG.building.health;
    this.wall.color.setHex(hp < CONFIG.building.health ? 0xa59379 : 0xd5c4a3);
  }
}
export class MapView {
  root = new THREE.Group(); terrain: THREE.Mesh; rocks: THREE.Group;
  buildings = new Map<string, Building>();
  constructor() {
    const geometry = new THREE.BufferGeometry(), vertices: number[] = [], colors: number[] = [], indices: number[] = [];
    const cells = MAP.halfSize * 2 / MAP.grid;
    for (let iz = 0; iz <= cells; iz++) for (let ix = 0; ix <= cells; ix++) {
      const x = -MAP.halfSize + ix * MAP.grid, z = -MAP.halfSize + iz * MAP.grid, y = terrainHeight(x, z);
      vertices.push(x, y, z);
      const road = Math.abs(x) < 4.2 || Math.abs(z) < 4.2;
      const c = new THREE.Color(road ? 0x999180 : y > 9 ? 0xbcb69d : 0xb6ad8b);
      c.multiplyScalar(0.94 + 0.06 * Math.sin(ix * 16.1 + iz * 7.2)); colors.push(c.r, c.g, c.b);
      if (ix < cells && iz < cells) { const a = iz * (cells + 1) + ix, b = a + 1, c = a + cells + 1, d = c + 1; indices.push(a, d, b, a, c, d); }
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    this.terrain = mesh(this.root, geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    for (const [i, b] of BUILDINGS.entries()) { const view = new Building(b, i); this.buildings.set(b.id, view); this.root.add(view.root); }
    this.rocks = new THREE.Group(); this.root.add(this.rocks);
    for (const rock of ROCKS) mesh(this.rocks, new THREE.BoxGeometry(rock.width, rock.height, rock.depth), material(0x7d8176), rock.x, rock.y + rock.height / 2, rock.z);
    const borderMaterial = new THREE.MeshBasicMaterial({ color: 0xe8d2a5, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
    for (const axis of ['x', 'z'] as const) for (const sign of [-1, 1]) {
      const wall = mesh(this.root, new THREE.PlaneGeometry(160, 12), borderMaterial, axis === 'x' ? sign * 80 : 0, 6, axis === 'z' ? sign * 80 : 0);
      if (axis === 'x') wall.rotation.y = Math.PI / 2;
    }
    for (let i = 0; i < 48; i++) {
      const side = i % 4, along = -76 + Math.floor(i / 4) * 13.8;
      const x = side < 2 ? (side === 0 ? -78 : 78) : along, z = side >= 2 ? (side === 2 ? -78 : 78) : along;
      mesh(this.root, new THREE.BoxGeometry(0.3, 2, 0.3), material(0x47554e), x, terrainHeight(x, z) + 1, z);
      mesh(this.root, new THREE.BoxGeometry(0.6, 0.12, 0.6), material(0xefc889), x, terrainHeight(x, z) + 2, z);
    }
    // Small tufts are visual decoration; the four large stone blocks are solid cover.
    const tuftMat = material(0x7f8d71);
    for (let i = 0; i < 180; i++) {
      const x = Math.sin(i * 72.19) * 75, z = Math.cos(i * 31.17) * 75;
      if (Math.abs(x) < 6 || Math.abs(z) < 6 || BUILDINGS.some(b => Math.abs(x - b.x) < 8 && Math.abs(z - b.z) < 8)) continue;
      mesh(this.root, new THREE.ConeGeometry(0.45, 0.9, 4), tuftMat, x, terrainHeight(x, z) + 0.35, z);
    }
  }
  collidables() { return [this.terrain, this.rocks, ...[...this.buildings.values()].filter(b => b.solid.visible).map(b => b.solid)]; }
}
