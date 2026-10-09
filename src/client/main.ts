import './style.css';
import { CONFIG } from '../shared/config.js';
import { HUD } from './hud.js';
import { Controls } from './controls.js';
import { Network } from './network.js';
import { View } from './view.js';
const hud = new HUD(), network = new Network(), controls = new Controls(hud.canvas);
let view: View;
try { view = new View(hud.canvas); } catch {
  document.getElementById('join-error')!.textContent = 'WebGL could not start. Enable hardware acceleration or try another desktop browser.';
  hud.joinButton.disabled = true; throw new Error('WebGL unavailable');
}
let started = false, lastMode = false;
document.getElementById('join-form')!.addEventListener('submit', e => {
  e.preventDefault(); if (network.status === 'connecting') return;
  const name = hud.nameInput.value.trim().slice(0, 20) || 'Scout';
  try { localStorage.setItem('ridge-name', name); } catch { /* Storage is optional. */ }
  hud.joinButton.disabled = true; network.connect(name);
});
network.onWelcome = () => {
  const tank = network.latest?.tanks.find(t => t.id === network.id);
  controls.reset(tank?.turretYaw ?? 0); lastMode = false;
  hud.start(); started = true; hud.menu.hidden = true;
  // Connection completion is not a user gesture; the resume button supplies it.
  controls.active = true; hud.notice('WASD drive · F scout · click Resume in Esc menu to lock mouse. Right-drag also aims.');
};
controls.onPause = () => hud.pause();
hud.resumeButton.addEventListener('click', () => { hud.menu.hidden = true; void controls.resume(); });
hud.leaveButton.addEventListener('click', () => { controls.pause(); network.disconnect(); started = false; hud.stop(); });
hud.canvas.addEventListener('click', () => { if (started && controls.active && !document.pointerLockElement) void controls.resume(); });
window.setInterval(() => {
  const input = controls.read(), tank = network.latest?.tanks.find(t => t.id === network.id);
  if (!controls.flying && tank) { const aim = view.aim(tank); input.aimYaw = aim.yaw; input.aimPitch = aim.pitch; }
  if (network.status !== 'online') { input.throttle = 0; input.turn = 0; input.fire = false; input.strafe = 0; input.lift = 0; }
  network.send(input);
}, 1000 / CONFIG.inputRate);
let previousTime = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  if (document.hidden || now - previousTime < 1000 / (started ? 30 : 15)) return;
  const dt = Math.min(0.05, (now - previousTime) / 1000); previousTime = now;
  const state = network.sample(now), tank = state?.tanks.find(t => t.id === network.id), drone = state?.drones.find(d => d.ownerId === network.id);
  const flying = !!drone;
  if (flying !== lastMode) { controls.aimYaw = drone?.yaw ?? tank?.turretYaw ?? controls.aimYaw; controls.aimPitch = 0; lastMode = flying; }
  controls.flying = flying;
  if (network.status === 'closed' && started) { controls.pause(); started = false; hud.stop(); }
  if (network.status === 'closed') hud.joinButton.disabled = false;
  view.update(state, network.id, controls.aimYaw, controls.aimPitch, dt, now / 1000, text => hud.notice(text));
  hud.update(network, state, tank, drone);
}
requestAnimationFrame(frame);
