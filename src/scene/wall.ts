// Forstørret utsnitt av arterieveggen: intima, media og adventitia,
// blodlegemer som strømmer og piler som viser trykket mot veggen.

import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LatheGeometry,
  Line,
  LineDashedMaterial,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  RingGeometry,
  MeshBasicMaterial,
  Vector2,
  Vector3,
  type Color,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WALL_CENTER } from './anatomy';
import { annularSector } from './geometry';

const LENGTH = 3.3;
const R_LUMEN = 0.8;
const A0 = (120 * Math.PI) / 180;
const A1 = (350 * Math.PI) / 180;

interface Particle {
  x: number;
  r: number;
  a: number;
  spin: Vector3;
  rot: Quaternion;
  speed: number;
}

export interface Wall {
  group: Group;
  pickables: Mesh[];
  leader: Line;
  center: Vector3;
  /** Punkter for etikettene til de tre lagene, i verdenskoordinater. */
  layerAnchors(): { intima: Vector3; media: Vector3; adventitia: Vector3 };
  update(dt: number, pressure: number, sys: number, dia: number, flow: number): void;
  setInk(color: Color): void;
}

export function buildWall(source: Vector3): Wall {
  const group = new Group();
  group.name = 'Arterieveggen';
  group.position.copy(WALL_CENTER);
  group.rotation.set(0.32, -0.42, 0.06);

  const body = new Group();
  group.add(body);

  const layer = (rIn: number, rOut: number, color: string, rough = 0.75) => {
    const m = new Mesh(
      annularSector(rIn, rOut, A0, A1, LENGTH, 56),
      new MeshStandardMaterial({ color, roughness: rough, metalness: 0, side: DoubleSide }),
    );
    m.userData.part = 'veggen';
    body.add(m);
    return m;
  };
  const intima = layer(R_LUMEN, 0.86, '#f1d6cf', 0.45);
  // Media med elastiske lag: tynne bånd i vekslende farge.
  const media: Mesh[] = [];
  const mediaIn = 0.86;
  const mediaOut = 1.2;
  const bands = 5;
  for (let i = 0; i < bands; i++) {
    const a = mediaIn + ((mediaOut - mediaIn) * i) / bands;
    const b = mediaIn + ((mediaOut - mediaIn) * (i + 1)) / bands;
    media.push(layer(a, b, i % 2 === 0 ? '#c4505d' : '#b13f4d', 0.8));
  }
  const adventitia = layer(1.2, 1.44, '#e4bf94', 0.9);

  // Blodlegemer.
  const rbcProfile = [
    [0.0, 0.019],
    [0.03, 0.021],
    [0.055, 0.033],
    [0.08, 0.037],
    [0.095, 0.026],
    [0.101, 0.0],
    [0.095, -0.026],
    [0.08, -0.037],
    [0.055, -0.033],
    [0.03, -0.021],
    [0.0, -0.019],
  ].map(([r, y]) => new Vector2(r * 1.45, y * 1.45));
  const rbcGeo = new LatheGeometry(rbcProfile, 18);
  const rbcMat = new MeshStandardMaterial({ color: '#b3142c', roughness: 0.5, emissive: '#3a0009' });
  const COUNT = 40;
  const rbc = new InstancedMesh(rbcGeo, rbcMat, COUNT);
  rbc.name = 'Blodlegemer';
  const particles: Particle[] = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: -LENGTH / 2 + rand() * LENGTH,
      r: Math.sqrt(rand()) * 0.6,
      a: rand() * Math.PI * 2,
      spin: new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
      rot: new Quaternion().setFromAxisAngle(new Vector3(rand(), rand(), rand()).normalize(), rand() * 6),
      speed: 0.7 + rand() * 0.5,
    });
  }
  body.add(rbc);

  // Trykkpiler som peker ut mot veggen.
  const shaft = new CylinderGeometry(0.04, 0.04, 0.66, 10).translate(0, 0.33, 0);
  const head = new ConeGeometry(0.11, 0.34, 16).translate(0, 0.83, 0);
  const arrowGeo = mergeGeometries([shaft, head]) as BufferGeometry;
  const arrowMat = new MeshStandardMaterial({ color: '#2a63c4', roughness: 0.35, emissive: '#1a3f86', emissiveIntensity: 0.9 });
  const arrowAngles = [150, 190, 230, 270, 310].map((d) => (d * Math.PI) / 180);
  const arrowX = [-1.05, 0, 1.05];
  const arrows = new InstancedMesh(arrowGeo, arrowMat, arrowAngles.length * arrowX.length);
  arrows.name = 'Trykkpiler';
  body.add(arrows);

  // Stiplet linje til arterien utsnittet er hentet fra, og en ring rundt stedet.
  const ink = new LineDashedMaterial({ color: '#463d3b', dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.8 });
  const from = new Vector3(LENGTH / 2, 0.9, 0).applyEuler(group.rotation).add(WALL_CENTER);
  const leaderGeo = new BufferGeometry().setFromPoints([from, source]);
  const leader = new Line(leaderGeo, ink);
  leader.computeLineDistances();
  const loupe = new Mesh(new RingGeometry(0.3, 0.34, 40), new MeshBasicMaterial({ color: '#463d3b', transparent: true, opacity: 0.8 }));
  loupe.position.copy(source).add(new Vector3(0, 0, 0.35));
  const extras = new Group();
  extras.add(leader, loupe);

  const root = new Group();
  root.add(group, extras);

  const dummy = new Object3D();
  const tmp = new Matrix4();
  const qSpin = new Quaternion();

  const updateArrows = (pressure: number) => {
    const len = 0.12 + (pressure / 200) * 0.5;
    let i = 0;
    for (const x of arrowX) {
      for (const a of arrowAngles) {
        const dir = new Vector3(0, Math.cos(a), Math.sin(a));
        const tip = R_LUMEN - 0.02;
        dummy.position.set(x, 0, 0).addScaledVector(dir, tip - len);
        dummy.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
        const w = 0.75 + len * 0.6;
        dummy.scale.set(w, len, w);
        dummy.updateMatrix();
        arrows.setMatrixAt(i++, dummy.matrix);
      }
    }
    arrows.instanceMatrix.needsUpdate = true;
  };

  const updateParticles = (dt: number, flow: number) => {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      // Raskest i midten av åren (parabolsk profil).
      const prof = 1 - (p.r / R_LUMEN) ** 2;
      p.x += dt * p.speed * prof * (0.25 + 1.05 * flow);
      if (p.x > LENGTH / 2) p.x -= LENGTH;
      qSpin.setFromAxisAngle(p.spin, dt * 1.2);
      p.rot.multiply(qSpin);
      const edge = Math.min(1, (LENGTH / 2 - Math.abs(p.x)) / 0.25);
      dummy.position.set(p.x, Math.cos(p.a) * p.r, Math.sin(p.a) * p.r);
      dummy.quaternion.copy(p.rot);
      dummy.scale.setScalar(Math.max(0.001, edge));
      dummy.updateMatrix();
      rbc.setMatrixAt(i, dummy.matrix);
    }
    rbc.instanceMatrix.needsUpdate = true;
  };

  updateArrows(100);
  updateParticles(0, 0.5);

  const pickables: Mesh[] = [intima, ...media, adventitia];
  rbc.userData.part = 'veggen';
  arrows.userData.part = 'veggen';

  return {
    group: root,
    pickables,
    leader,
    center: WALL_CENTER.clone(),
    layerAnchors() {
      group.updateMatrixWorld();
      const at = (r: number, a: number, x: number) =>
        new Vector3(x, Math.cos(a) * r, Math.sin(a) * r).applyMatrix4(tmp.copy(body.matrixWorld));
      return {
        intima: at(0.83, A1 - 0.02, -LENGTH / 2 + 0.2),
        media: at(1.03, A1 - 0.02, 0.1),
        adventitia: at(1.32, A1 - 0.02, LENGTH / 2 - 0.3),
      };
    },
    update(dt, pressure, sys, dia, flow) {
      const s = Math.max(0, Math.min(1, (pressure - dia) / Math.max(sys - dia, 1)));
      const k = 1 + 0.055 * s + 0.0006 * (pressure - 100);
      body.scale.set(1, k, k);
      updateArrows(pressure);
      updateParticles(dt, flow);
    },
    setInk(color: Color) {
      ink.color.copy(color);
      (loupe.material as MeshBasicMaterial).color.copy(color);
    },
  };
}
