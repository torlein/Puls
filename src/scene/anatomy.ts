// Koordinatene for anatomien. Personen står vendt mot +z, med venstre side mot +x.
// Én enhet tilsvarer omtrent 5 cm.

import { Matrix4, Quaternion, Vector3 } from 'three';
import anchors from './heart-anchors.json';
import { buildVessel, closestU, type Vessel, type VesselDef } from './geometry';

/** Hjertets plass i brystet og helningen som peker spissen mot venstre. */
export const HEART_POSITION = new Vector3(0.55, 2.1, 0.3);
export const HEART_TILT = 0.2;

export const SHOULDER = new Vector3(3.8, 3.75, 0.0);
export const ELBOW = new Vector3(5.95, -1.05, 0.25);
export const WRIST = new Vector3(8.2, -4.95, 0.75);

export const UPPER = ELBOW.clone().sub(SHOULDER).normalize();
export const FORE = WRIST.clone().sub(ELBOW).normalize();
const Z = new Vector3(0, 0, 1);

/** Sideretning (bort fra kroppen) og forside for en armretning. */
export function armFrame(dir: Vector3): { lateral: Vector3; anterior: Vector3 } {
  const lateral = new Vector3().crossVectors(Z, dir).normalize();
  const anterior = new Vector3().crossVectors(dir, lateral).normalize();
  return { lateral, anterior };
}

export function onUpperArm(t: number, lat = 0, ant = 0): Vector3 {
  const { lateral, anterior } = armFrame(UPPER);
  const len = ELBOW.distanceTo(SHOULDER);
  return SHOULDER.clone().addScaledVector(UPPER, t * len).addScaledVector(lateral, lat).addScaledVector(anterior, ant);
}

export function onForearm(t: number, lat = 0, ant = 0): Vector3 {
  const { lateral, anterior } = armFrame(FORE);
  const len = WRIST.distanceTo(ELBOW);
  return ELBOW.clone().addScaledVector(FORE, t * len).addScaledVector(lateral, lat).addScaledVector(anterior, ant);
}

/** Mansjetten dekker denne delen av overarmen (brøkdel fra skulder til albue). */
export const CUFF_RANGE = [0.3, 0.62] as const;

/** Stedet på håndleddet der fingrene kjenner pulsen (arteria radialis). */
export const RADIAL_POINT = onForearm(0.97, 0.24, 0.16);

/** Senter for det forstørrede utsnittet av arterieveggen. */
export const WALL_CENTER = new Vector3(-5.75, 1.45, 0.6);

export function heartMatrix(): Matrix4 {
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), HEART_TILT);
  return new Matrix4().compose(HEART_POSITION, q, new Vector3(1, 1, 1));
}

export interface Arteries {
  aorta: Vessel;
  brachiocephalic: Vessel;
  rightSubclavian: Vessel;
  leftCarotid: Vessel;
  arm: Vessel;
  all: Vessel[];
  /** Avstand fra hjertet der mansjetten starter og slutter. */
  cuffDist: [number, number];
  wristDist: number;
  /** Punkt på høyre arteria subclavia som veggutsnittet forstørrer. */
  wallSource: Vector3;
}

export function buildArteries(): Arteries {
  const m = heartMatrix();
  const toWorld = (v: number[]) => new Vector3(v[0], v[1], v[2]).applyMatrix4(m);
  // Stumpene fra modellen: den oppadgående aorta ligger lengst frem (størst z).
  const stumps = [...anchors.stumps].sort((a, b) => b.center[2] - a.center[2]);
  const asc = toWorld(stumps[0].center);
  const desc = toWorld(stumps[1].center);
  const axis = new Vector3(0, 1, 0).applyAxisAngle(new Vector3(0, 0, 1), HEART_TILT);
  // Litt videre enn stumpens største radius, så snittkanten i modellen skjules.
  const stumpR = Math.max(stumps[0].radiusMax, stumps[1].radiusMax);
  const r0 = stumpR * 1.06;

  // Buen går opp fra den oppadgående stumpen, til venstre og bakover, og ned
  // gjennom den nedadgående stumpen. Den må være vid, ellers blir den en knute.
  const aortaDef: VesselDef = {
    name: 'Aorta',
    points: [
      asc.clone().addScaledVector(axis, -0.45),
      asc.clone().addScaledVector(axis, 0.15),
      new Vector3(asc.x - 0.06, 4.18, asc.z - 0.02),
      new Vector3(asc.x + 0.22, 4.52, asc.z - 0.18),
      new Vector3(0.74, 4.5, 0.0),
      new Vector3(0.86, 4.16, -0.14),
      new Vector3(desc.x + 0.28, desc.y + 0.24, desc.z - 0.04),
      desc.clone(),
      new Vector3(desc.x + 0.03, desc.y - 0.7, desc.z - 0.3),
      new Vector3(0.45, 1.8, -1.05),
      new Vector3(0.4, -0.6, -1.0),
      new Vector3(0.3, -4.25, -0.9),
    ],
    r0,
    r1: 0.26,
    distStart: 0,
    radial: 24,
  };
  const aorta = buildVessel(aortaDef);

  const arch = (q: Vector3) => {
    const u = closestU(aorta.curve, q);
    return { p: aorta.pointAt(u), d: aorta.distAt(u) };
  };
  const bcO = arch(new Vector3(asc.x + 0.02, 4.42, asc.z - 0.1));
  const lcO = arch(new Vector3(0.45, 4.62, 0.12));
  const lsO = arch(new Vector3(0.78, 4.52, -0.02));

  // Truncus brachiocephalicus og høyre halspulsåre.
  const split = new Vector3(bcO.p.x - 0.45, bcO.p.y + 0.5, bcO.p.z + 0.02);
  const brachiocephalic = buildVessel({
    name: 'Høyre arteria carotis communis',
    points: [
      bcO.p.clone().add(new Vector3(0, -0.12, 0)),
      new Vector3(bcO.p.x - 0.14, bcO.p.y + 0.26, bcO.p.z),
      split,
      new Vector3(split.x - 0.06, split.y + 0.6, split.z + 0.03),
      new Vector3(-0.52, 6.0, 0.4),
      new Vector3(-0.58, 7.05, 0.36),
    ],
    r0: 0.17,
    r1: 0.105,
    distStart: bcO.d,
    capEnd: true,
  });
  const splitDist = brachiocephalic.distAt(closestU(brachiocephalic.curve, split));

  const rightSubclavian = buildVessel({
    name: 'Høyre arteria subclavia',
    points: [
      split.clone().add(new Vector3(0.06, -0.06, 0)),
      new Vector3(split.x - 0.5, split.y + 0.06, split.z - 0.02),
      new Vector3(-1.7, 4.6, 0.06),
      new Vector3(-2.65, 4.36, 0.12),
      new Vector3(-3.35, 3.88, 0.2),
    ],
    r0: 0.13,
    r1: 0.1,
    distStart: splitDist,
    capEnd: true,
  });

  const leftCarotid = buildVessel({
    name: 'Venstre arteria carotis communis',
    points: [
      lcO.p.clone().add(new Vector3(0, -0.12, 0)),
      new Vector3(lcO.p.x + 0.02, lcO.p.y + 0.42, lcO.p.z + 0.08),
      new Vector3(0.48, 5.4, 0.3),
      new Vector3(0.5, 6.0, 0.4),
      new Vector3(0.56, 7.05, 0.36),
    ],
    r0: 0.13,
    r1: 0.105,
    distStart: lcO.d,
    capEnd: true,
  });

  // Venstre arteria subclavia, arteria axillaris, arteria brachialis og arteria radialis.
  const armPoints = [
    lsO.p.clone().add(new Vector3(0, -0.12, 0)),
    new Vector3(lsO.p.x + 0.28, lsO.p.y + 0.24, lsO.p.z + 0.05),
    new Vector3(1.7, 4.68, 0.06),
    new Vector3(2.6, 4.45, 0.12),
    new Vector3(3.3, 4.05, 0.22),
    onUpperArm(0.12, -0.22, 0.2),
    onUpperArm(0.3, -0.28, 0.2),
    onUpperArm(0.46, -0.28, 0.2),
    onUpperArm(0.62, -0.26, 0.2),
    onUpperArm(0.82, -0.16, 0.24),
    ELBOW.clone().add(armFrame(UPPER).anterior.multiplyScalar(0.28)),
    onForearm(0.2, 0.12, 0.24),
    onForearm(0.45, 0.2, 0.22),
    onForearm(0.72, 0.24, 0.19),
    RADIAL_POINT.clone(),
    onForearm(1.04, 0.25, 0.15),
  ];
  const arm = buildVessel({
    name: 'Arterien i venstre arm',
    points: armPoints,
    r0: 0.14,
    r1: 0.075,
    distStart: lsO.d,
    arm: true,
    capEnd: true,
  });

  // Hvor langt fra hjertet mansjetten og håndleddet ligger, langs arterien.
  const cuffStart = arm.distAt(closestU(arm.curve, onUpperArm(CUFF_RANGE[0], -0.28, 0.2)));
  const cuffEnd = arm.distAt(closestU(arm.curve, onUpperArm(CUFF_RANGE[1], -0.26, 0.2)));
  const wristDist = arm.distAt(closestU(arm.curve, RADIAL_POINT));
  const wallSource = rightSubclavian.pointAt(0.62);

  return {
    aorta,
    brachiocephalic,
    rightSubclavian,
    leftCarotid,
    arm,
    all: [aorta, brachiocephalic, rightSubclavian, leftCarotid, arm],
    cuffDist: [cuffStart, cuffEnd],
    wristDist,
    wallSource,
  };
}
