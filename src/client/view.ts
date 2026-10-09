import * as THREE from 'three';
import { MapView } from './map.js';
import { TankModel, DroneModel, disposeObject } from './models.js';
import { Effects } from './effects.js';
import { terrainHeight, BUILDINGS, ROCKS } from '../shared/map.js';
import { boxHit, terrainHit } from '../shared/collision.js';
import { tankAxes, dot, sub, weaponPose, wrapAngle, clamp } from '../shared/math.js';
import { CONFIG } from '../shared/config.js';
import type { Snapshot, TankState, DroneState } from '../shared/types.js';
const vector = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
export class View {
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(60, 1, 0.15, 350);
  renderer: THREE.WebGLRenderer; map = new MapView(); effects: Effects;
  private tanks = new Map<string, TankModel>(); private drones = new Map<string, DroneModel>(); private shells = new Map<string, THREE.Mesh>();
  private demo: TankModel; private demoState: TankState;
  private ray = new THREE.Raycaster(); private lastOwner = ''; private labels = new Map<string, HTMLElement>();
  private targets: THREE.Object3D[] = [];
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.background = new THREE.Color(0xa9bfbe); this.scene.fog = new THREE.Fog(0xa9bfbe, 105, 230);
    this.scene.add(new THREE.HemisphereLight(0xc3e6ec, 0x7d7256, 2.2));
    const sun = new THREE.DirectionalLight(0xffe4b0, 3); sun.position.set(-45, 65, -30); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -85; sun.shadow.camera.right = 85;
    sun.shadow.camera.top = 85; sun.shadow.camera.bottom = -85; sun.shadow.camera.far = 180; sun.shadow.normalBias = 0.04; this.scene.add(sun);
    this.scene.add(this.map.root); this.effects = new Effects(this.scene);
    this.demo = new TankModel(0x72c9bd); this.scene.add(this.demo.root);
    const x = -24, z = -28;
    this.demoState = { id: 'demo', name: 'Scout', x, y: terrainHeight(x, z) + 0.8, z, yaw: 0.8, turretYaw: 1.1, gunPitch: 0.08,
      slopeX: 0, slopeZ: 0, hp: 100, color: 0x72c9bd, speed: 0, kills: 0, deaths: 0, reload: 0, respawn: 0, shield: 0, droneCooldown: 0, connected: true };
    this.demo.update(this.demoState, 0);
    window.addEventListener('resize', () => this.resize()); this.resize();
  }
  private resize() { this.renderer.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
  update(world: Snapshot | null, ownerId: string, yaw: number, pitch: number, dt: number, time: number, onText: (text: string) => void) {
    this.demo.root.visible = !world;
    if (!world) {
      this.camera.position.set(-48 + Math.sin(time * 0.03) * 3, 25, -48); this.camera.lookAt(0, 2, 2);
      this.labels.forEach(label => { label.hidden = true; }); this.renderer.render(this.scene, this.camera); return;
    }
    for (const b of world.buildings) this.map.buildings.get(b.id)?.update(b.hp);
    for (const t of world.tanks) {
      let model = this.tanks.get(t.id); if (!model) { model = new TankModel(t.color); this.tanks.set(t.id, model); this.scene.add(model.root); }
      model.root.visible = true; model.update(t, dt);
      if (!this.labels.has(t.id)) { const label = document.createElement('div'); label.className = 'unit-label'; label.textContent = t.name; label.style.borderColor = `#${t.color.toString(16)}`; document.getElementById('labels')!.append(label); this.labels.set(t.id, label); }
    }
    for (const [id, model] of this.tanks) if (!world.tanks.some(t => t.id === id)) { model.dispose(); this.tanks.delete(id); this.labels.get(id)?.remove(); this.labels.delete(id); }
    for (const d of world.drones) {
      let model = this.drones.get(d.id); if (!model) { model = new DroneModel(world.tanks.find(t => t.id === d.ownerId)?.color ?? 0xffffff); this.drones.set(d.id, model); this.scene.add(model.root); }
      model.update(d, dt); model.root.visible = d.ownerId !== ownerId;
    }
    for (const [id, model] of this.drones) if (!world.drones.some(d => d.id === id)) { model.dispose(); this.drones.delete(id); }
    for (const s of world.shells) {
      let model = this.shells.get(s.id);
      if (!model) { model = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd390 })); this.shells.set(s.id, model); this.scene.add(model); }
      model.position.set(s.x, s.y, s.z);
    }
    for (const [id, model] of this.shells) if (!world.shells.some(s => s.id === id)) { disposeObject(model); this.shells.delete(id); }
    const tank = world.tanks.find(t => t.id === ownerId), drone = world.drones.find(d => d.ownerId === ownerId);
    this.targets = [...this.map.collidables(), ...world.tanks.filter(t => t.id !== ownerId && t.hp > 0).map(t => this.tanks.get(t.id)!.root),
      ...world.drones.filter(d => d.ownerId !== ownerId).map(d => this.drones.get(d.id)!.root)];
    this.scene.updateMatrixWorld(true);
    if (drone) {
      this.camera.position.set(drone.x, drone.y, drone.z);
      this.camera.lookAt(drone.x + Math.sin(yaw) * Math.cos(pitch), drone.y + Math.sin(pitch), drone.z + Math.cos(yaw) * Math.cos(pitch));
    } else if (tank) {
      const focus = new THREE.Vector3(tank.x, tank.y + 1.6, tank.z);
      const desired = new THREE.Vector3(tank.x - Math.sin(yaw) * 11 * Math.cos(pitch), tank.y + 4.5 - Math.sin(pitch) * 7, tank.z - Math.cos(yaw) * 11 * Math.cos(pitch));
      let fraction = terrainHit(focus, desired, 0.5) ?? 1;
      for (const b of [...ROCKS, ...BUILDINGS.filter(b => world.buildings.find(s => s.id === b.id)?.hp !== 0)]) { const t = boxHit(focus, desired, b, 0.5); if (t !== null && t > 0.05) fraction = Math.min(fraction, t); }
      desired.copy(focus.clone().lerp(desired, Math.max(0.15, fraction - 0.05)));
      if (this.lastOwner !== ownerId || this.camera.position.distanceTo(desired) > 22) this.camera.position.copy(desired);
      else this.camera.position.lerp(desired, 1 - Math.exp(-dt * 12));
      this.camera.position.y = Math.max(this.camera.position.y, terrainHeight(this.camera.position.x, this.camera.position.z) + 0.8);
      this.camera.lookAt(focus.x + Math.sin(yaw) * Math.cos(pitch) * 35, focus.y + Math.sin(pitch) * 35, focus.z + Math.cos(yaw) * Math.cos(pitch) * 35);
    }
    this.lastOwner = ownerId; this.camera.updateMatrixWorld();
    for (const t of world.tanks) {
      const label = this.labels.get(t.id)!, point = new THREE.Vector3(t.x, t.y + 3.6, t.z).project(this.camera);
      let occluded = false;
      if (t.id !== ownerId && this.camera.position.distanceTo(vector(t)) < 65) {
        const head = { x: t.x, y: t.y + 2.8, z: t.z };
        occluded = terrainHit(this.camera.position, head) !== null || [...ROCKS, ...BUILDINGS.filter(b => world.buildings.find(s => s.id === b.id)?.hp !== 0)].some(b => boxHit(this.camera.position, head, b) !== null);
      }
      label.hidden = t.id === ownerId || t.hp <= 0 || point.z > 1 || point.z < -1 || Math.abs(point.x) > 1 || this.camera.position.distanceTo(vector(t)) > 65 || occluded;
      label.style.transform = `translate(${(point.x * 0.5 + 0.5) * innerWidth}px,${(-point.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%)`;
    }
    const dotElement = document.getElementById('gun-dot')!;
    dotElement.hidden = !tank || !!drone || tank.hp <= 0;
    if (tank && !drone && tank.hp > 0) {
      const pose = weaponPose(tank); this.ray.set(vector(pose.muzzle), vector(pose.direction)); this.ray.far = 200;
      const hit = this.ray.intersectObjects(this.targets, true)[0];
      const point = (hit?.point ?? vector(pose.muzzle).addScaledVector(vector(pose.direction), 150)).clone().project(this.camera);
      dotElement.hidden = point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
      dotElement.style.transform = `translate(${(point.x * 0.5 + 0.5) * innerWidth}px,${(-point.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%)`;
    }
    this.effects.receive(world.events, world.time, onText); this.effects.update(dt);
    this.renderer.render(this.scene, this.camera);
  }
  aim(tank: TankState) {
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.camera); this.ray.far = 200;
    const point = this.ray.intersectObjects(this.targets, true)[0]?.point ?? this.ray.ray.at(180, new THREE.Vector3());
    const direction = sub(point, weaponPose(tank).pivot), { right, up, forward } = tankAxes(tank);
    const x = dot(direction, right), y = dot(direction, up), z = dot(direction, forward);
    return { yaw: wrapAngle(tank.yaw + Math.atan2(x, z)), pitch: clamp(Math.atan2(y, Math.hypot(x, z)), CONFIG.tank.minPitch, CONFIG.tank.maxPitch) };
  }
}
