import * as THREE from 'three';
import { tankAxes, wrapAngle } from '../shared/math.js';
import type { TankState, DroneState } from '../shared/types.js';
export const material = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
export function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, mat); object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export class TankModel {
  root = new THREE.Group(); turret = new THREE.Group(); gun = new THREE.Group();
  private painted: THREE.MeshStandardMaterial[] = []; private tracks: THREE.Mesh[] = [];
  private shield: THREE.Mesh;
  constructor(color: number) {
    const paint = material(color), dark = material(0x283436), trim = material(0xe8dfc8), steel = material(0x536063);
    this.painted = [paint, dark, trim, steel];
    for (const mat of this.painted) mat.userData.originalColor = mat.color.getHex();
    mesh(this.root, box(2.9, 0.85, 4.15), paint, 0, 0.4);
    const nose = mesh(this.root, box(2.7, 0.4, 1), paint, 0, 0.45, 1.75); nose.rotation.x = -0.25;
    for (const x of [-1.6, 1.6]) {
      mesh(this.root, box(0.62, 1.05, 4.5), dark, x, 0.05);
      for (let i = 0; i < 6; i++) {
        const wheel = mesh(this.root, new THREE.CylinderGeometry(0.4, 0.4, 0.64, 10), steel, x, 0, -1.65 + i * 0.66);
        wheel.rotation.z = Math.PI / 2; this.tracks.push(wheel);
      }
      mesh(this.root, box(0.12, 0.12, 3.3), trim, x, 0.65);
    }
    for (let i = 0; i < 5; i++) mesh(this.root, box(1.6, 0.08, 0.1), dark, 0, 0.86, -1.1 - i * 0.14);
    this.root.add(this.turret); this.turret.position.y = 1.05;
    mesh(this.turret, new THREE.CylinderGeometry(1.05, 1.22, 0.75, 6), paint, 0, 0.15);
    mesh(this.turret, box(0.65, 0.15, 0.7), dark, -0.38, 0.6, -0.2);
    mesh(this.turret, new THREE.CylinderGeometry(0.025, 0.025, 1.25, 5), steel, 0.6, 1.1, -0.6);
    this.turret.add(this.gun); this.gun.position.set(0, 0.2, 0.6);
    const barrel = mesh(this.gun, new THREE.CylinderGeometry(0.13, 0.19, 2.8, 8), dark, 0, 0, 1.4); barrel.rotation.x = Math.PI / 2;
    mesh(this.gun, box(0.42, 0.3, 0.38), steel, 0, 0, 2.6);
    mesh(this.root, box(0.38, 0.14, 0.08), trim, -0.9, 0.64, 2.1);
    mesh(this.root, box(0.38, 0.14, 0.08), trim, 0.9, 0.64, 2.1);
    this.shield = mesh(this.root, new THREE.RingGeometry(2.4, 2.48, 48), new THREE.MeshBasicMaterial({ color: 0xffdc99, side: THREE.DoubleSide, transparent: true, opacity: 0.65 }), 0, -0.5);
    this.shield.rotation.x = -Math.PI / 2;
  }
  update(t: TankState, dt: number) {
    this.root.userData.ownerId = t.id; this.root.position.set(t.x, t.y, t.z);
    const { right, up, forward } = tankAxes(t);
    const v = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
    this.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(v(right), v(up), v(forward)));
    this.turret.rotation.y = wrapAngle(t.turretYaw - t.yaw); this.gun.rotation.x = -t.gunPitch;
    for (const wheel of this.tracks) wheel.rotation.x += t.speed * dt * 2;
    for (const mat of this.painted) mat.color.setHex(t.hp <= 0 ? 0x292d2b : mat.userData.originalColor);
    this.shield.visible = t.shield > 0 && t.hp > 0;
  }
  dispose() { disposeObject(this.root); }
}
export class DroneModel {
  root = new THREE.Group(); private rotors: THREE.Mesh[] = [];
  constructor(color: number) {
    const dark = material(0x233033), paint = material(color);
    mesh(this.root, box(0.45, 0.2, 0.7), paint);
    const camera = mesh(this.root, new THREE.CylinderGeometry(0.12, 0.12, 0.12, 8), dark, 0, 0, 0.4); camera.rotation.x = Math.PI / 2;
    for (const x of [-0.6, 0.6]) for (const z of [-0.6, 0.6]) {
      const arm = mesh(this.root, box(0.8, 0.08, 0.1), dark, x / 2, 0, z / 2); arm.rotation.y = x * z > 0 ? -Math.PI / 4 : Math.PI / 4;
      mesh(this.root, new THREE.CylinderGeometry(0.08, 0.08, 0.18, 8), paint, x, 0.05, z);
      this.rotors.push(mesh(this.root, box(0.75, 0.02, 0.06), dark, x, 0.16, z));
    }
  }
  update(d: DroneState, dt: number) {
    this.root.position.set(d.x, d.y, d.z); this.root.rotation.set(-d.pitch * 0.25, d.yaw, 0, 'YXZ');
    for (const rotor of this.rotors) rotor.rotation.y += dt * 90;
  }
  dispose() { disposeObject(this.root); }
}
export function disposeObject(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
  for (const m of materials) m.dispose(); root.removeFromParent();
}
