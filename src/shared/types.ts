export interface Vec3 { x: number; y: number; z: number }
export interface InputMessage {
  type: 'input'; seq: number; throttle: number; turn: number; strafe: number;
  lift: number; aimYaw: number; aimPitch: number; fire: boolean; droneAction: number;
}
export interface HelloMessage { type: 'hello'; name: string; token?: string }
export type ClientMessage = HelloMessage | InputMessage;
export interface TankState extends Vec3 {
  id: string; name: string; color: number; yaw: number; turretYaw: number; gunPitch: number;
  slopeX: number; slopeZ: number; speed: number; hp: number; kills: number; deaths: number;
  reload: number; respawn: number; shield: number; droneCooldown: number; connected: boolean;
}
export interface DroneState extends Vec3 {
  id: string; ownerId: string; yaw: number; pitch: number; remaining: number;
}
export interface ShellState extends Vec3 { id: string; ownerId: string; velocity: Vec3; life: number }
export interface BuildingState { id: string; hp: number }
export interface WorldEvent extends Vec3 {
  id: number; time: number; kind: 'shot' | 'impact' | 'explosion' | 'notice'; text?: string;
}
export interface Snapshot {
  type: 'snapshot'; time: number; tanks: TankState[]; drones: DroneState[];
  shells: ShellState[]; buildings: BuildingState[]; events: WorldEvent[];
}
export type ServerMessage = Snapshot | {
  type: 'welcome'; id: string; token: string; time: number; state: Snapshot;
} | { type: 'error'; code: 'full' | 'invalid' | 'timeout'; message: string };
export const emptyInput = (): InputMessage => ({
  type: 'input', seq: 0, throttle: 0, turn: 0, strafe: 0, lift: 0,
  aimYaw: 0, aimPitch: 0, fire: false, droneAction: 0
});
