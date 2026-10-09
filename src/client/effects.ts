import * as THREE from 'three';
import type { WorldEvent } from '../shared/types.js';
interface Particle { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; maxLife: number }
export class Effects {
  private particles: Particle[] = []; private seen = new Set<number>();
  constructor(private scene: THREE.Scene) {}
  receive(events: WorldEvent[], time: number, onText: (text: string) => void) {
    for (const e of events) {
      if (this.seen.has(e.id)) continue; this.seen.add(e.id);
      if (time - e.time > 0.5) continue;
      if (e.text) onText(e.text);
      if (e.kind === 'notice') continue;
      const count = e.kind === 'explosion' ? 28 : e.kind === 'impact' ? 10 : 4;
      for (let i = 0; i < count; i++) {
        const size = e.kind === 'explosion' ? 0.45 : 0.14;
        const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), new THREE.MeshBasicMaterial({ color: i % 3 ? 0xffba60 : 0x5f655d, transparent: true }));
        mesh.position.set(e.x, e.y + 0.3, e.z); this.scene.add(mesh);
        const life = e.kind === 'explosion' ? 1.3 : 0.45;
        this.particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - 0.5) * 9, Math.random() * 7, (Math.random() - 0.5) * 9), life, maxLife: life });
      }
    }
    if (this.seen.size > 500) { const ids = [...this.seen]; this.seen = new Set(ids.slice(-250)); }
  }
  update(dt: number) {
    this.particles = this.particles.filter(p => {
      p.life -= dt;
      if (p.life <= 0) { p.mesh.removeFromParent(); p.mesh.geometry.dispose(); (p.mesh.material as THREE.Material).dispose(); return false; }
      p.velocity.y -= dt * 8; p.mesh.position.addScaledVector(p.velocity, dt);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = p.life / p.maxLife;
      p.mesh.scale.setScalar(0.4 + p.life / p.maxLife); return true;
    });
  }
}
