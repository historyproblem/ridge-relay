import type { ClientMessage } from '../shared/types.js';
export function parseMessage(raw: string): ClientMessage | null {
  let m: Record<string, unknown>;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  if (m.type === 'hello') {
    if (typeof m.name !== 'string' || m.name.length > 80 || (m.token !== undefined && (typeof m.token !== 'string' || !/^[a-f0-9]{48}$/.test(m.token)))) return null;
    const name = m.name.replace(/[\x00-\x1f\x7f<>]/g, '').trim().slice(0, 20) || 'Scout';
    return { type: 'hello', name, token: m.token as string | undefined };
  }
  if (m.type !== 'input' || typeof m.fire !== 'boolean') return null;
  for (const key of ['seq', 'droneAction']) if (!Number.isSafeInteger(m[key]) || (m[key] as number) < 0 || (m[key] as number) > 1e9) return null;
  for (const key of ['throttle', 'turn', 'strafe', 'lift']) if (typeof m[key] !== 'number' || !Number.isFinite(m[key]) || Math.abs(m[key]) > 1) return null;
  if (typeof m.aimYaw !== 'number' || !Number.isFinite(m.aimYaw) || Math.abs(m.aimYaw) > Math.PI + 0.001) return null;
  if (typeof m.aimPitch !== 'number' || !Number.isFinite(m.aimPitch) || Math.abs(m.aimPitch) > 1.3) return null;
  return { type: 'input', seq: m.seq as number, droneAction: m.droneAction as number, fire: m.fire,
    throttle: m.throttle as number, turn: m.turn as number, strafe: m.strafe as number, lift: m.lift as number,
    aimYaw: m.aimYaw, aimPitch: m.aimPitch };
}
