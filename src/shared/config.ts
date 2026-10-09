export const CONFIG = {
  maxPlayers: 4, tickRate: 60, snapshotRate: 20, inputRate: 30,
  inputTimeout: 0.4, reconnectGrace: 30, interpolationDelay: 0.1,
  tank: {
    health: 100, speed: 12, reverseSpeed: 6, acceleration: 10, braking: 16,
    turnSpeed: 1.2, radius: 2.95, clearance: 0.8, maxSlope: 0.72,
    turretSpeed: 1.8, gunSpeed: 0.8, minPitch: -0.17, maxPitch: 0.52,
    respawnTime: 5, spawnShield: 2
  },
  weapon: { damage: 40, reload: 2.2, speed: 110, lifetime: 3, gravity: 4 },
  building: { health: 120 },
  drone: {
    speed: 18, verticalSpeed: 10, acceleration: 30, radius: 0.45,
    minClearance: 0.5, maxAltitude: 35, range: 65, duration: 35,
    cooldown: 10, turnSpeed: 3.5, maxPitch: 1.3
  }
} as const;
export const PLAYER_COLORS = [0x72c9bd, 0xf1b96d, 0xd18aa7, 0x91adf1];
