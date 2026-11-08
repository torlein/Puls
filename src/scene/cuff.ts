// Blodtrykksmansjetten på venstre overarm. Den blåses opp med et skyggeleggertriks:
// den ytre flaten skyves utover etter mansjettrykket.

import {
  BufferAttribute,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  TubeGeometry,
  Vector2,
  Vector3,
  type IUniform,
} from 'three';
import { CUFF_RANGE, ELBOW, SHOULDER, UPPER, armFrame } from './anatomy';

export interface Cuff {
  group: Group;
  pickables: Mesh[];
  setInflation(mmHg: number): void;
  setDark(dark: boolean): void;
  center: Vector3;
}

export function buildCuff(): Cuff {
  const upperLen = ELBOW.distanceTo(SHOULDER);
  const t0 = CUFF_RANGE[0] * upperLen;
  const t1 = CUFF_RANGE[1] * upperLen;
  const half = (t1 - t0) / 2;
  const center = SHOULDER.clone().addScaledVector(UPPER, (t0 + t1) / 2);
  const ri = 0.6;
  const ro = 0.75;

  // Tverrsnitt: et avrundet rektangel som dreies rundt armen.
  // Hjørnene gås gjennom med fallende vinkel, fra innsiden oppe til innsiden nede.
  const pts: Vector2[] = [];
  const c = 0.07;
  const corners: [number, number, number][] = [
    [ri + c, half - c, Math.PI],
    [ro - c, half - c, Math.PI / 2],
    [ro - c, -half + c, 0],
    [ri + c, -half + c, -Math.PI / 2],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= 6; i++) {
      const a = a0 - (i / 6) * (Math.PI / 2);
      pts.push(new Vector2(cx + Math.cos(a) * c, cy + Math.sin(a) * c));
    }
  }
  pts.push(pts[0].clone());
  // LatheGeometry vender forsiden utover når profilen går oppover på yttersiden.
  pts.reverse();
  const geo = new LatheGeometry(pts, 64);
  const p = geo.getAttribute('position');
  const outer = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i));
    const w = Math.min(1, Math.max(0, (r - ri) / (ro - ri)));
    const along = p.getY(i) / half;
    outer[i] = Math.pow(w, 1.4) * (1 - 0.55 * along * along);
  }
  geo.setAttribute('aOuter', new BufferAttribute(outer, 1));

  const inflate: IUniform<number> = { value: 0 };
  // Halvgjennomsiktig, så du ser arterien klemmes sammen under mansjetten.
  const mat = new MeshStandardMaterial({ color: '#2b3a57', roughness: 0.82, metalness: 0, transparent: true, opacity: 0.62, depthWrite: false });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uInflate = inflate;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aOuter;\nuniform float uInflate;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvec2 radial = normalize(position.xz + 1e-5);\ntransformed.xz += radial * uInflate * 0.24 * aOuter;',
      );
  };

  const cuffMesh = new Mesh(geo, mat);
  cuffMesh.name = 'Mansjett';
  cuffMesh.renderOrder = 25;
  const group = new Group();
  group.name = 'Mansjetten';
  group.position.copy(center);
  group.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), UPPER));
  group.add(cuffMesh);

  // Lys stripe som markerer hvor arterien skal ligge.
  const marker = new Mesh(
    new CylinderGeometry(ro + 0.004, ro + 0.004, half * 1.7, 10, 1, true, -0.12, 0.24),
    new MeshStandardMaterial({ color: '#e8e1d4', roughness: 0.7, transparent: true, opacity: 0.85 }),
  );
  const { lateral, anterior } = armFrame(UPPER);
  // Peker markeringen mot innsiden av armen og fremover, der arteria brachialis ligger.
  const toward = lateral.clone().multiplyScalar(-0.6).addScaledVector(anterior, 0.8).normalize();
  const local = toward.clone().applyQuaternion(group.quaternion.clone().invert());
  marker.rotation.y = Math.atan2(local.x, local.z);
  marker.name = 'Markering';
  marker.renderOrder = 26;
  group.add(marker);
  const markerInflate = (s: number) => marker.scale.set(1 + s * 0.3, 1, 1 + s * 0.3);

  // Slange ned mot pumpe og manometer.
  const start = center.clone().addScaledVector(anterior, ro + 0.02).addScaledVector(UPPER, half * 0.55).addScaledVector(lateral, 0.25);
  const curve = new CatmullRomCurve3([
    start,
    start.clone().addScaledVector(anterior, 0.35).addScaledVector(lateral, 0.25),
    start.clone().addScaledVector(anterior, 0.55).addScaledVector(lateral, 0.95).addScaledVector(UPPER, 1.0),
    start.clone().addScaledVector(anterior, 0.45).addScaledVector(lateral, 1.55).addScaledVector(UPPER, 2.3),
  ]);
  const hose = new Mesh(new TubeGeometry(curve, 40, 0.045, 8, false), new MeshStandardMaterial({ color: '#30353d', roughness: 0.6 }));
  hose.name = 'Slange';
  const end = curve.getPoint(1);
  const plug = new Mesh(new CylinderGeometry(0.09, 0.09, 0.22, 16), new MeshStandardMaterial({ color: '#8b929c', roughness: 0.35, metalness: 0.6 }));
  plug.position.copy(end);
  plug.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), curve.getTangent(1)));

  const root = new Group();
  root.add(group, hose, plug);
  for (const m of [cuffMesh, marker, hose, plug]) m.userData.part = 'mansjetten';

  return {
    group: root,
    pickables: [cuffMesh, hose, plug],
    center,
    setDark(dark: boolean) {
      mat.color.set(dark ? '#61759c' : '#2b3a57');
      mat.opacity = dark ? 0.7 : 0.62;
    },
    setInflation(mmHg: number) {
      const s = Math.min(1.4, Math.max(0, mmHg / 200));
      inflate.value = s;
      markerInflate(s * 0.75);
    },
  };
}
