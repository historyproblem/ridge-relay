import { CONFIG } from '../shared/config.js';
import { clamp, wrapAngle } from '../shared/math.js';
import { emptyInput, type InputMessage } from '../shared/types.js';
export class Controls {
  aimYaw = 0; aimPitch = 0; active = false; flying = false;
  onPause: (() => void) | undefined;
  private keys = new Set<string>(); private fire = false; private dragging = false;
  private seq = 0; private action = 0;
  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', e => {
      if (!this.active) return;
      if (['Space', 'ControlLeft', 'ControlRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyF' && !e.repeat) this.action++;
      if (e.code === 'Escape') { this.pause(); this.onPause?.(); }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.clear(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.pause(); this.onPause?.(); } });
    document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && this.active) { this.pause(); this.onPause?.(); } });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mousedown', e => { if (!this.active) return; if (e.button === 0) this.fire = true; if (e.button === 2) this.dragging = true; });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.fire = false; if (e.button === 2) this.dragging = false; });
    window.addEventListener('mousemove', e => {
      if (!this.active || (document.pointerLockElement !== canvas && !this.dragging)) return;
      // Looking right turns +Z forward towards +X; looking up increases elevation.
      this.aimYaw = wrapAngle(this.aimYaw - e.movementX * 0.0024);
      const limit = this.flying ? CONFIG.drone.maxPitch : 0.65;
      this.aimPitch = clamp(this.aimPitch - e.movementY * 0.002, -limit, limit);
    });
  }
  reset(yaw: number) { this.seq = 0; this.action = 0; this.aimYaw = yaw; this.aimPitch = 0; this.clear(); }
  async resume() { this.active = true; try { await this.canvas.requestPointerLock(); } catch { /* Right-drag aiming remains available on browsers without pointer lock. */ } }
  pause() { this.active = false; this.clear(); if (document.pointerLockElement) document.exitPointerLock(); }
  private clear() { this.keys.clear(); this.fire = false; this.dragging = false; }
  read(): InputMessage {
    const m = { ...emptyInput(), seq: ++this.seq, droneAction: this.action, aimYaw: this.aimYaw, aimPitch: this.aimPitch };
    if (!this.active) return m;
    m.throttle = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
    m.turn = Number(this.keys.has('KeyA')) - Number(this.keys.has('KeyD'));
    m.strafe = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    m.lift = Number(this.keys.has('Space')) - Number(this.keys.has('ControlLeft') || this.keys.has('ControlRight'));
    m.fire = this.fire && !this.flying; return m;
  }
}
