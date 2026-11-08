// Håndleddet: to fingre som kjenner etter pulsen, og en ring som brer seg ut når
// pulsbølgen når frem.

import {
  CapsuleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Color,
} from 'three';
import { FORE, RADIAL_POINT, armFrame } from './anatomy';

interface Ripple {
  mesh: Mesh;
  age: number;
  peak: number;
}

export interface Wrist {
  group: Group;
  pickables: Mesh[];
  anchor: Vector3;
  pulse(strength: number): void;
  update(dt: number): boolean;
  setColor(color: Color): void;
}

export function buildWrist(): Wrist {
  const group = new Group();
  group.name = 'Håndleddet';
  const { lateral, anterior } = armFrame(FORE);
  // Punktet på huden over arterien.
  const skin = RADIAL_POINT.clone().addScaledVector(anterior, 0.1).addScaledVector(lateral, 0.04);
  const out = anterior.clone().multiplyScalar(0.85).addScaledVector(lateral, 0.5).normalize();

  // Fingrene kommer fra forsiden og litt fra siden, og hviler over arterien.
  const fingerMat = new MeshStandardMaterial({ color: '#e2b394', roughness: 0.62, metalness: 0 });
  const nailMat = new MeshStandardMaterial({ color: '#f3d9cc', roughness: 0.35 });
  // Fingrene ligger på tvers over håndleddet og kommer fra tommelsiden.
  const fingerDir = lateral.clone().multiplyScalar(0.92).addScaledVector(anterior, 0.42).addScaledVector(FORE, 0.08).normalize();
  const tips = [skin.clone().addScaledVector(FORE, -0.2), skin.clone().addScaledVector(FORE, 0.13)];
  const pickables: Mesh[] = [];
  tips.forEach((tip, i) => {
    const r = 0.115;
    const len = i === 0 ? 1.25 : 1.4;
    const f = new Mesh(new CapsuleGeometry(r, len, 6, 14), fingerMat);
    f.position.copy(tip).addScaledVector(out, r * 0.85).addScaledVector(fingerDir, len / 2 + r * 0.4);
    f.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), fingerDir));
    f.userData.part = 'handleddet';
    group.add(f);
    pickables.push(f);
    const nail = new Mesh(new SphereGeometry(r * 0.78, 12, 8), nailMat);
    nail.scale.set(1, 1.5, 0.45);
    nail.position.copy(f.position).addScaledVector(fingerDir, -len / 2 + r * 0.6).addScaledVector(out, r * 0.7);
    nail.quaternion.copy(f.quaternion);
    group.add(nail);
  });

  // Usynlig, større område som gjør det lett å treffe håndleddet med fingeren.
  const hit = new Mesh(new SphereGeometry(0.95, 12, 8), new MeshBasicMaterial({ visible: false }));
  hit.position.copy(RADIAL_POINT).addScaledVector(FORE, 0.2);
  hit.userData.part = 'handleddet';
  group.add(hit);
  pickables.push(hit);

  // Ringer som brer seg ut fra stedet der pulsen kjennes.
  const ringMat = new MeshBasicMaterial({ color: '#c21d36', transparent: true, opacity: 0, depthWrite: false });
  const ripples: Ripple[] = [];
  const ringCenter = skin.clone().addScaledVector(out, 0.03).addScaledVector(FORE, -0.03);
  for (let i = 0; i < 3; i++) {
    const m = new Mesh(new RingGeometry(0.86, 1, 48), ringMat.clone());
    m.position.copy(ringCenter);
    m.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), out));
    m.visible = false;
    m.renderOrder = 30;
    group.add(m);
    ripples.push({ mesh: m, age: 10, peak: 0 });
  }
  let next = 0;

  return {
    group,
    pickables,
    anchor: skin.clone().addScaledVector(out, 0.35),
    pulse(strength: number) {
      if (strength < 0.05) return;
      const r = ripples[next];
      next = (next + 1) % ripples.length;
      r.age = 0;
      r.peak = Math.min(1, strength);
      r.mesh.visible = true;
    },
    update(dt: number) {
      let active = false;
      for (const r of ripples) {
        if (!r.mesh.visible) continue;
        r.age += dt;
        const life = 0.75;
        if (r.age >= life) {
          r.mesh.visible = false;
          continue;
        }
        active = true;
        const t = r.age / life;
        const s = 0.14 + 0.85 * (1 - Math.pow(1 - t, 2));
        r.mesh.scale.setScalar(s);
        (r.mesh.material as MeshBasicMaterial).opacity = r.peak * 0.95 * (1 - t);
      }
      return active;
    },
    setColor(color: Color) {
      for (const r of ripples) (r.mesh.material as MeshBasicMaterial).color.copy(color);
    },
  };
}
