import { CONFIG } from '../shared/config.js';
import { clamp, wrapAngle } from '../shared/math.js';
import type { InputMessage, ServerMessage, Snapshot, Vec3 } from '../shared/types.js';
export type ConnectionStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'closed';
type Buffered = { state: Snapshot; received: number };
export class Network {
  id = ''; status: ConnectionStatus = 'idle'; message = 'LAN ready';
  latest: Snapshot | null = null;
  onWelcome: (() => void) | undefined;
  private socket: WebSocket | null = null;
  private buffer: Buffered[] = [];
  private name = ''; private retries = 0; private retryTimer = 0; private stopped = true;
  constructor() {
    window.setInterval(() => {
      const last = this.buffer.at(-1);
      if (this.status === 'online' && last && performance.now() - last.received > 3500) this.socket?.close();
    }, 500);
  }
  connect(name: string) { this.name = name; this.retries = 0; this.stopped = false; window.clearTimeout(this.retryTimer); this.open(); }
  private open() {
    this.status = this.retries ? 'reconnecting' : 'connecting';
    this.message = this.retries ? 'Signal lost · reconnecting…' : 'Joining the valley…';
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
    this.socket = ws;
    ws.onopen = () => { if (this.socket !== ws) return; ws.send(JSON.stringify({ type: 'hello', name: this.name, token: sessionStorage.getItem('ridge-token') ?? undefined })); };
    ws.onmessage = event => {
      if (this.socket !== ws) return;
      let message: ServerMessage; try { message = JSON.parse(event.data); } catch { ws.close(); return; }
      if (message.type === 'error') { this.stopped = true; this.status = 'closed'; this.message = message.message; return; }
      if (message.type === 'welcome') {
        this.id = message.id; sessionStorage.setItem('ridge-token', message.token);
        this.buffer = []; this.retries = 0; this.status = 'online'; this.message = 'LAN connected';
        this.receive(message.state); this.onWelcome?.();
      } else if (message.type === 'snapshot') this.receive(message);
    };
    ws.onerror = () => { this.message = 'Cannot reach host · retrying…'; };
    ws.onclose = event => {
      if (this.socket !== ws) return;
      if (event.code === 4001) { this.stopped = true; sessionStorage.removeItem('ridge-token'); this.message = 'Session opened in another tab. Join again for a new tank.'; }
      if (this.stopped) { this.status = 'closed'; return; }
      this.status = 'reconnecting'; this.message = 'Connection lost · controls paused · reconnecting…';
      this.retryTimer = window.setTimeout(() => this.open(), Math.min(5000, 750 * ++this.retries));
    };
  }
  private receive(state: Snapshot) {
    this.latest = state; this.buffer.push({ state, received: performance.now() });
    if (this.buffer.length > 30) this.buffer.shift();
  }
  send(input: InputMessage) { if (this.status === 'online' && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(input)); }
  disconnect() { this.stopped = true; window.clearTimeout(this.retryTimer); this.socket?.close(); this.status = 'idle'; this.buffer = []; this.latest = null; }
  sample(now: number): Snapshot | null {
    const newest = this.buffer.at(-1); if (!newest) return null;
    const target = newest.state.time + (now - newest.received) / 1000 - CONFIG.interpolationDelay;
    let a = this.buffer[0].state, b = newest.state;
    for (const entry of this.buffer) { if (entry.state.time <= target) a = entry.state; else { b = entry.state; break; } }
    const f = clamp((target - a.time) / (b.time - a.time || 1), 0, 1);
    const interpolate = <T extends Vec3 & { id: string }>(latest: T[], before: T[], after: T[]): T[] => latest.map(current => {
      const from = before.find(e => e.id === current.id), to = after.find(e => e.id === current.id);
      if (!from || !to || Math.hypot(from.x - to.x, from.z - to.z) > 10 || ('hp' in from && ((from.hp as number) <= 0) !== ((current as T & { hp: number }).hp <= 0))) return { ...current };
      const result = { ...current, x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, z: from.z + (to.z - from.z) * f };
      const fields = ['yaw', 'turretYaw', 'gunPitch', 'slopeX', 'slopeZ', 'pitch'] as const;
      for (const field of fields) {
        if (!(field in from) || !(field in to)) continue;
        const start = (from as unknown as Record<string, number>)[field], end = (to as unknown as Record<string, number>)[field];
        (result as unknown as Record<string, number>)[field] = start + (field.toLowerCase().includes('yaw') ? wrapAngle(end - start) : end - start) * f;
      }
      return result;
    });
    return { ...newest.state, tanks: interpolate(newest.state.tanks, a.tanks, b.tanks),
      drones: interpolate(newest.state.drones, a.drones, b.drones), shells: interpolate(newest.state.shells, a.shells, b.shells) };
  }
}
