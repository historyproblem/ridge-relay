import { randomUUID, randomBytes } from 'node:crypto';
import { CONFIG, PLAYER_COLORS } from '../shared/config.js';
import { BUILDINGS, ROCKS, SPAWNS, terrainHeight, terrainSlope } from '../shared/map.js';
import { emptyInput, type BuildingState, type InputMessage, type Snapshot, type TankState, type WorldEvent } from '../shared/types.js';
import { boxHit } from '../shared/collision.js';
import { weaponPose, distance } from '../shared/math.js';
import { canMove, updateTank } from './tank.js';
import { updateDrone, type SimDrone } from './drone.js';
import { createShell, stepShell, traceShot } from './weapon.js';
import type { ShellState } from '../shared/types.js';
export interface Player {
  tank: TankState; token: string; input: InputMessage; lastInput: number;
  disconnectedAt: number | null; lastDroneAction: number;
}
export class World {
  time = 0;
  players = new Map<string, Player>();
  drones = new Map<string, SimDrone>();
  shells = new Map<string, ShellState>();
  buildings = new Map<string, BuildingState>(BUILDINGS.map(b => [b.id, { id: b.id, hp: CONFIG.building.health }]));
  events: WorldEvent[] = [];
  private eventId = 0;
  private entityId = 0;
  get tanks() { return [...this.players.values()].map(p => p.tank); }
  get solidBoxes() { return [...ROCKS, ...BUILDINGS.filter(b => this.buildings.get(b.id)!.hp > 0)]; }
  join(name: string, token?: string): Player | null {
    if (token) {
      const existing = [...this.players.values()].find(p => p.token === token);
      if (existing) { existing.tank.connected = true; existing.disconnectedAt = null; existing.lastInput = this.time; existing.input = emptyInput(); existing.lastDroneAction = 0; return existing; }
    }
    if (this.players.size >= CONFIG.maxPlayers) return null;
    const usedColors = new Set(this.tanks.map(t => t.color));
    const color = PLAYER_COLORS.find(c => !usedColors.has(c)) ?? PLAYER_COLORS[0];
    const tank: TankState = { id: randomUUID(), name, color, x: 0, y: 0, z: 0, yaw: 0, turretYaw: 0, gunPitch: 0,
      slopeX: 0, slopeZ: 0, speed: 0, hp: 0, kills: 0, deaths: 0, reload: 0, respawn: 0, shield: 0, droneCooldown: 0, connected: true };
    const p: Player = { tank, token: randomBytes(24).toString('hex'), input: emptyInput(), lastInput: this.time, disconnectedAt: null, lastDroneAction: 0 };
    this.players.set(tank.id, p); this.spawn(tank);
    this.emit('notice', tank, `${name} entered the valley`); return p;
  }
  disconnect(id: string) {
    const p = this.players.get(id); if (!p) return;
    p.tank.connected = false; p.tank.speed = 0; p.input = emptyInput(); p.disconnectedAt = this.time;
    this.endDrone(id, 'Signal lost');
  }
  setInput(id: string, input: InputMessage) {
    const p = this.players.get(id); if (!p || !p.tank.connected || input.seq <= p.input.seq) return;
    p.input = input; p.lastInput = this.time;
    if (input.droneAction > p.lastDroneAction) { p.lastDroneAction = input.droneAction; this.toggleDrone(p); }
  }
  private spawn(t: TankState) {
    const living = this.tanks.filter(other => other.id !== t.id && other.hp > 0);
    const candidates = [...SPAWNS];
    // Additional free positions keep respawn viable when players camp primary pads.
    for (let x = -66; x <= 66; x += 22) for (let z = -66; z <= 66; z += 22) candidates.push({ x, z });
    const ranked = candidates.filter(s => canMove(t, s.x, s.z, living, this.solidBoxes))
      .sort((a, b) => Math.min(200, ...living.map(o => Math.hypot(o.x - b.x, o.z - b.z))) - Math.min(200, ...living.map(o => Math.hypot(o.x - a.x, o.z - a.z))));
    const s = ranked[0]; if (!s) return;
    t.x = s.x; t.z = s.z; t.y = terrainHeight(s.x, s.z) + CONFIG.tank.clearance;
    const slope = terrainSlope(t.x, t.z); t.slopeX = slope.x; t.slopeZ = slope.z;
    t.yaw = Math.atan2(-t.x, -t.z); t.turretYaw = t.yaw; t.gunPitch = 0;
    t.hp = CONFIG.tank.health; t.speed = 0; t.respawn = 0; t.reload = 0; t.shield = CONFIG.tank.spawnShield;
    const p = this.players.get(t.id)!; p.input = { ...emptyInput(), seq: p.input.seq, droneAction: p.lastDroneAction, aimYaw: t.yaw };
  }
  private toggleDrone(p: Player) {
    const tank = p.tank;
    if (this.drones.has(tank.id)) { this.endDrone(tank.id, 'Flight completed'); return; }
    if (tank.hp <= 0 || tank.droneCooldown > 0) return;
    const d: SimDrone = { id: `drone-${++this.entityId}`, ownerId: tank.id, x: tank.x, y: tank.y + 3, z: tank.z,
      yaw: p.input.aimYaw, pitch: 0, remaining: CONFIG.drone.duration, velocity: { x: 0, y: 0, z: 0 } };
    if (this.solidBoxes.some(b => boxHit(d, d, b, CONFIG.drone.radius) !== null)) return;
    tank.speed = 0; this.drones.set(tank.id, d); tank.shield = 0;
    this.emit('notice', d, `${tank.name} launched a scout`);
  }
  endDrone(ownerId: string, reason: string, explosion = false) {
    const d = this.drones.get(ownerId); if (!d) return;
    if (explosion) this.emit('explosion', d);
    this.drones.delete(ownerId);
    const p = this.players.get(ownerId); if (p) { p.tank.droneCooldown = CONFIG.drone.cooldown; this.emit('notice', p.tank, `${p.tank.name}: ${reason}`); }
  }
  emit(kind: WorldEvent['kind'], position: { x: number; y: number; z: number }, text?: string) {
    this.events.push({ id: ++this.eventId, time: this.time, kind, x: position.x, y: position.y, z: position.z, text });
  }
  tick(dt = 1 / CONFIG.tickRate) {
    this.time += dt;
    this.events = this.events.filter(e => this.time - e.time < 2);
    for (const [id, p] of this.players) {
      if (p.disconnectedAt !== null && this.time - p.disconnectedAt >= CONFIG.reconnectGrace) { this.players.delete(id); continue; }
      const input = this.time - p.lastInput > CONFIG.inputTimeout ? { ...emptyInput(), aimYaw: p.tank.turretYaw, aimPitch: p.tank.gunPitch } : p.input;
      updateTank(p.tank, input, dt, this.tanks, this.solidBoxes, this.drones.has(id));
      if (p.tank.hp <= 0 && p.tank.respawn <= 0 && p.tank.connected) this.spawn(p.tank);
      const drone = this.drones.get(id);
      if (drone && !updateDrone(drone, p.tank, input, dt, this.solidBoxes)) this.endDrone(id, 'Scout lost', true);
      if (!this.drones.has(id) && !drone && p.tank.hp > 0 && p.tank.connected && input.fire && p.tank.reload <= 0) {
        const shot = createShell(p.tank, `shell-${++this.entityId}`), pose = weaponPose(p.tank);
        // Also sweep from the gun pivot to muzzle: a barrel pushed into cover cannot shoot through it.
        const muzzleHit = traceShot(pose.pivot, pose.muzzle, id, this.tanks, [...this.drones.values()], this.solidBoxes);
        p.tank.reload = CONFIG.weapon.reload; p.tank.shield = 0;
        this.emit('shot', shot);
        if (muzzleHit) this.applyHit(muzzleHit, id); else this.shells.set(shot.id, shot);
      }
    }
    for (const [id, shot] of this.shells) {
      const end = stepShell(shot, dt), hit = traceShot(shot, end, shot.ownerId, this.tanks, [...this.drones.values()], this.solidBoxes);
      if (hit) { this.applyHit(hit, shot.ownerId); this.shells.delete(id); }
      else { Object.assign(shot, end); if (shot.life <= 0 || Math.abs(shot.x) > 85 || Math.abs(shot.z) > 85) this.shells.delete(id); }
    }
  }
  private applyHit(hit: ReturnType<typeof traceShot> & {}, shooterId: string) {
    this.emit('impact', hit.position);
    if (hit.kind === 'box') {
      const b = this.buildings.get(hit.id!);
      if (b) { b.hp = Math.max(0, b.hp - CONFIG.weapon.damage); if (b.hp === 0) this.emit('explosion', hit.position, 'Cover destroyed'); }
    } else if (hit.kind === 'drone') {
      const d = [...this.drones.values()].find(d => d.id === hit.id); if (d) this.endDrone(d.ownerId, 'Scout shot down', true);
    } else if (hit.kind === 'tank') {
      const target = this.players.get(hit.id!)?.tank;
      if (!target || target.shield > 0 || target.hp <= 0) return;
      target.hp = Math.max(0, target.hp - CONFIG.weapon.damage);
      if (target.hp === 0) {
        target.deaths++; target.respawn = CONFIG.tank.respawnTime; target.speed = 0;
        const shooter = this.players.get(shooterId)?.tank; if (shooter) shooter.kills++;
        this.endDrone(target.id, 'Tank destroyed', true);
        this.emit('explosion', target, `${shooter?.name ?? 'A shell'} destroyed ${target.name}`);
      }
    }
  }
  snapshot(): Snapshot {
    return { type: 'snapshot', time: this.time, tanks: this.tanks.map(t => ({ ...t })),
      drones: [...this.drones.values()].map(({ velocity: _velocity, ...d }) => ({ ...d })),
      shells: [...this.shells.values()].map(s => ({ ...s, velocity: { ...s.velocity } })),
      buildings: [...this.buildings.values()].map(b => ({ ...b })), events: this.events.map(e => ({ ...e })) };
  }
}
