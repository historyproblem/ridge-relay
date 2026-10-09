import { CONFIG } from '../shared/config.js';
import { BUILDINGS, ROCKS, MAP, terrainHeight } from '../shared/map.js';
import { distance } from '../shared/math.js';
import type { Snapshot, TankState, DroneState } from '../shared/types.js';
import type { Network } from './network.js';
export class HUD {
  canvas: HTMLCanvasElement; joinButton: HTMLButtonElement; resumeButton: HTMLButtonElement; leaveButton: HTMLButtonElement;
  nameInput: HTMLInputElement; landing: HTMLElement; menu: HTMLElement;
  private game: HTMLElement; private map: HTMLCanvasElement; private background: HTMLCanvasElement;
  private status: HTMLElement; private score: HTMLElement; private noticeUntil = 0; private lastScore = '';
  constructor() {
    document.querySelector('#app')!.innerHTML = `
      <canvas id="world" aria-label="Three-dimensional battlefield" tabindex="0"></canvas>
      <header class="topbar"><div class="brand"><span class="brand-mark">R<span>↗</span></span><span>RIDGE <b>RELAY</b></span></div><div class="connection"><span class="signal-dot"></span><span id="status">LAN ready</span><span class="separator">/</span><span id="players">0 / 4</span></div></header>
      <main id="landing" class="landing"><div class="eyebrow"><span></span> LOCAL MULTIPLAYER · 2–4 PLAYERS</div><h1>Hold the ridge.<br><em>See beyond it.</em></h1><p class="intro">Steel on the ground. Eyes in the sky.<br>A tank arena built for your Wi-Fi, with destructible cover and FPV scouts.</p><form id="join-form"><label for="name">YOUR CALLSIGN</label><div class="join-row"><input id="name" maxlength="20" placeholder="Scout" value="Scout" autocomplete="nickname"/><button id="join" type="submit">Enter the valley <span>↗</span></button></div></form><div class="landing-details"><span><b>01</b> Sable Valley</span><span><b>04</b> Available seats</span><span><b>LAN</b> One host. No accounts.</span></div><p id="join-error" class="join-error" role="status"></p></main>
      <div class="map-caption" id="map-caption"><span>SABLE VALLEY</span><b>80° / 160 m</b><span>RECONNAISSANCE SECTOR 01</span></div>
      <section id="game-hud" hidden><div class="mode-panel"><span class="eyebrow">LIVE FEED</span><strong id="mode">ARMORED UNIT</strong><small id="mode-sub">Free-for-all · Sable Valley</small></div><div class="score-panel"><span class="eyebrow">FIELD ROSTER <span>K / D</span></span><div id="score"></div></div><div class="crosshair" id="crosshair"><i></i><i></i><i></i><i></i></div><div class="gun-dot" id="gun-dot" hidden></div><div class="aim-caption">+ AIM POINT <span>◦ BARREL IMPACT</span></div><div id="notice" class="notice" role="status"></div><div id="respawn" class="respawn" hidden></div><div class="bottom-hud"><div class="tank-panel"><div class="panel-title"><span id="callsign">SCOUT</span><span id="speed">0 km/h</span></div><div class="health-line"><b id="health">100</b><span>HULL INTEGRITY</span><small id="shield"></small></div><div class="meter"><span id="health-bar"></span></div><div class="reload-line"><span id="reload-label">CANNON READY</span><span id="reload-time">40 DMG</span></div><div class="meter reload"><span id="reload-bar"></span></div></div><div class="control-hint"><span><kbd>W A S D</kbd> Drive</span><span><kbd>MOUSE</kbd> Aim</span><span><kbd>LMB</kbd> Fire</span><span><kbd>ESC</kbd> Menu</span></div><div class="drone-panel"><div class="panel-title"><span>FPV SCOUT</span><kbd>F</kbd></div><strong id="drone-status">Ready to deploy</strong><small id="drone-details">Your tank stays vulnerable during flight.</small><div class="meter"><span id="drone-bar"></span></div></div><div class="minimap-panel"><canvas id="minimap" width="150" height="150" aria-label="Tactical map"></canvas><span>SABLE VALLEY <b>N ↑</b></span></div></div></section>
      <div id="labels" class="labels"></div><section id="menu" class="menu" hidden><div class="menu-card"><span class="eyebrow">FIELD MENU</span><h2>Take a breath.</h2><p>The battle continues while this menu is open.</p><button id="resume">Return to the field ↗</button><button id="leave" class="secondary">Leave arena</button><div class="menu-controls"><p><b>Tank</b> W/S drive · A/D turn · mouse aim · left click fire</p><p><b>Scout</b> W/S forward/back · A/D strafe · Space/Ctrl altitude</p><p><b>F</b> Deploy / return · <b>Esc</b> Menu</p><p>Mouse lock unavailable? Hold the right mouse button to look.</p></div></div></section>
      <footer id="landing-footer">ORIGINAL LOW-POLY ARENA <span>HOST ADDRESS <b id="host-address"></b></span></footer>`;
    const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    this.canvas = get('world'); this.joinButton = get('join'); this.resumeButton = get('resume'); this.leaveButton = get('leave');
    this.nameInput = get('name'); this.landing = get('landing'); this.menu = get('menu'); this.game = get('game-hud');
    this.status = get('status'); this.score = get('score'); this.map = get('minimap');
    this.background = document.createElement('canvas'); this.background.width = 150; this.background.height = 150;
    const ctx = this.background.getContext('2d')!;
    for (let x = 0; x < 150; x += 3) for (let z = 0; z < 150; z += 3) {
      const y = terrainHeight(x / 150 * 160 - 80, z / 150 * 160 - 80);
      const value = Math.round(43 + y * 2.5); ctx.fillStyle = `rgb(${value},${value + 12},${value + 9})`; ctx.fillRect(x, z, 3, 3);
    }
    ctx.strokeStyle = '#586460'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(75, 0); ctx.lineTo(75, 150); ctx.moveTo(0, 75); ctx.lineTo(150, 75); ctx.stroke();
    get('host-address').textContent = location.host;
    try { this.nameInput.value = localStorage.getItem('ridge-name') ?? 'Scout'; } catch { /* Storage is optional. */ }
  }
  start() { this.landing.hidden = true; this.game.hidden = false; document.getElementById('landing-footer')!.hidden = true; document.getElementById('map-caption')!.hidden = true; }
  stop() { this.landing.hidden = false; this.game.hidden = true; this.menu.hidden = true; document.getElementById('landing-footer')!.hidden = false; document.getElementById('map-caption')!.hidden = false; this.joinButton.disabled = false; this.lastScore = ''; }
  pause() { if (!this.game.hidden) this.menu.hidden = false; }
  notice(text: string) { document.getElementById('notice')!.textContent = text; this.noticeUntil = performance.now() + 4000; }
  update(net: Network, world: Snapshot | null, tank?: TankState, drone?: DroneState) {
    this.status.textContent = net.message; document.querySelector('.signal-dot')!.classList.toggle('online', net.status === 'online');
    document.getElementById('players')!.textContent = `${world?.tanks.filter(t => t.connected).length ?? 0} / ${CONFIG.maxPlayers}`;
    document.getElementById('join-error')!.textContent = net.status === 'closed' ? net.message : '';
    document.getElementById('notice')!.classList.toggle('visible', performance.now() < this.noticeUntil);
    if (!world || !tank) return;
    const set = (id: string, value: string) => { document.getElementById(id)!.textContent = value; };
    const bar = (id: string, fraction: number) => { document.getElementById(id)!.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`; };
    set('callsign', tank.name.toUpperCase()); set('speed', `${Math.round(Math.abs(tank.speed) * 3.6)} km/h`);
    set('health', String(tank.hp)); bar('health-bar', tank.hp / CONFIG.tank.health);
    set('shield', tank.shield > 0 ? 'SPAWN SHIELD' : '');
    set('reload-label', tank.reload > 0 ? 'RELOADING' : 'CANNON READY'); set('reload-time', tank.reload > 0 ? `${tank.reload.toFixed(1)} s` : `${CONFIG.weapon.damage} DMG`);
    bar('reload-bar', 1 - tank.reload / CONFIG.weapon.reload);
    set('mode', drone ? 'FPV RECONNAISSANCE' : 'ARMORED UNIT');
    set('mode-sub', drone ? 'WASD fly · Space / Ctrl altitude · F return' : 'Free-for-all · Sable Valley');
    set('drone-status', drone ? `${Math.ceil(drone.remaining)} s flight remaining` : tank.droneCooldown > 0 ? `Recharging · ${Math.ceil(tank.droneCooldown)} s` : 'Ready to deploy');
    set('drone-details', drone ? `${Math.round(distance(drone, tank))} / ${CONFIG.drone.range} m range · ${Math.round(drone.y - terrainHeight(tank.x, tank.z))} / ${CONFIG.drone.maxAltitude} m altitude` : 'Your tank stays vulnerable during flight.');
    bar('drone-bar', drone ? drone.remaining / CONFIG.drone.duration : 1 - tank.droneCooldown / CONFIG.drone.cooldown);
    document.getElementById('respawn')!.hidden = tank.hp > 0;
    set('respawn', tank.hp <= 0 ? `UNIT LOST · RESPAWN IN ${Math.ceil(tank.respawn)} s` : '');
    const scoreKey = JSON.stringify(world.tanks.map(t => [t.id, t.name, t.kills, t.deaths, t.connected]));
    if (scoreKey !== this.lastScore) {
      this.lastScore = scoreKey; this.score.replaceChildren();
      for (const t of [...world.tanks].sort((a, b) => b.kills - a.kills)) {
        const row = document.createElement('div'); row.className = `score-row${t.id === net.id ? ' you' : ''}`;
        const name = document.createElement('span'); name.textContent = `${t.name}${t.connected ? '' : ' · offline'}`; name.style.borderColor = `#${t.color.toString(16).padStart(6, '0')}`;
        const value = document.createElement('b'); value.textContent = `${t.kills} / ${t.deaths}`; row.append(name, value); this.score.append(row);
      }
    }
    const ctx = this.map.getContext('2d')!, mapX = (n: number) => (n + MAP.halfSize) / (MAP.halfSize * 2) * 150;
    ctx.drawImage(this.background, 0, 0);
    for (const b of [...BUILDINGS, ...ROCKS]) {
      ctx.fillStyle = world.buildings.find(s => s.id === b.id)?.hp === 0 ? '#7b7260' : '#c0b39c';
      ctx.fillRect(mapX(b.x - b.width / 2), mapX(b.z - b.depth / 2), b.width / 160 * 150, b.depth / 160 * 150);
    }
    // Only your own unit/scout is displayed; reconnaissance still requires looking.
    for (const p of [tank, ...(drone ? [drone] : [])]) {
      ctx.save(); ctx.translate(mapX(p.x), mapX(p.z)); ctx.rotate(-p.yaw); ctx.fillStyle = p === tank ? '#78d2c0' : '#ffd495';
      ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(-3.5, -3); ctx.lineTo(3.5, -3); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }
}
