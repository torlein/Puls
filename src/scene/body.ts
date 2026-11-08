// Den gjennomsiktige kroppen: overkropp med hals, venstre arm og hånd.

import { CapsuleGeometry, Group, Mesh, Quaternion, Vector3, type ShaderMaterial } from 'three';
import { ELBOW, FORE, SHOULDER, UPPER, WRIST, armFrame, onForearm } from './anatomy';
import { loft, smoothRings, type Ring } from './geometry';

const X = new Vector3(1, 0, 0);
const Z = new Vector3(0, 0, 1);

function torsoRing(y: number, w: number, d: number, zOff: number, n: number): Ring {
  return { center: new Vector3(0, y, zOff), xAxis: X.clone(), yAxis: Z.clone(), rx: w, ry: d, n };
}

function armRing(center: Vector3, dir: Vector3, rx: number, ry: number): Ring {
  const { lateral, anterior } = armFrame(dir);
  return { center, xAxis: lateral, yAxis: anterior, rx, ry, n: 2 };
}

export function buildBody(material: ShaderMaterial): Group {
  const group = new Group();
  group.name = 'Kropp';

  const torsoKeys: Ring[] = [
    torsoRing(-4.45, 2.72, 1.5, -0.12, 2.4),
    torsoRing(-3.4, 2.62, 1.48, -0.06, 2.4),
    torsoRing(-2.0, 2.52, 1.48, 0.0, 2.4),
    torsoRing(-0.5, 2.78, 1.62, 0.05, 2.5),
    torsoRing(1.0, 3.12, 1.78, 0.05, 2.6),
    torsoRing(2.5, 3.32, 1.82, 0.0, 2.6),
    torsoRing(3.6, 3.5, 1.66, -0.05, 2.8),
    torsoRing(4.3, 3.4, 1.32, -0.1, 3.0),
    torsoRing(4.78, 2.5, 1.0, -0.14, 2.6),
    torsoRing(5.12, 1.25, 0.84, -0.12, 2.2),
    torsoRing(5.4, 0.78, 0.7, -0.05, 2.0),
    torsoRing(6.4, 0.7, 0.64, 0.0, 2.0),
    torsoRing(7.15, 0.72, 0.66, 0.0, 2.0),
  ];
  const torso = new Mesh(loft(smoothRings(torsoKeys, 6), 56, 0.35, 0.3), material);
  torso.name = 'Overkropp';
  torso.renderOrder = 10;
  group.add(torso);

  const upperLen = ELBOW.distanceTo(SHOULDER);
  const foreLen = WRIST.distanceTo(ELBOW);
  const elbowDir = UPPER.clone().add(FORE).normalize();
  const armKeys: Ring[] = [
    armRing(SHOULDER.clone().addScaledVector(UPPER, -0.55).add(new Vector3(-0.15, 0.1, 0)), UPPER, 0.72, 0.7),
    armRing(SHOULDER.clone(), UPPER, 0.7, 0.68),
    armRing(SHOULDER.clone().addScaledVector(UPPER, upperLen * 0.25), UPPER, 0.62, 0.6),
    armRing(SHOULDER.clone().addScaledVector(UPPER, upperLen * 0.55), UPPER, 0.56, 0.55),
    armRing(SHOULDER.clone().addScaledVector(UPPER, upperLen * 0.82), UPPER, 0.5, 0.48),
    armRing(ELBOW.clone(), elbowDir, 0.5, 0.44),
    armRing(ELBOW.clone().addScaledVector(FORE, foreLen * 0.18), FORE, 0.52, 0.43),
    armRing(ELBOW.clone().addScaledVector(FORE, foreLen * 0.5), FORE, 0.46, 0.36),
    armRing(ELBOW.clone().addScaledVector(FORE, foreLen * 0.82), FORE, 0.41, 0.28),
    armRing(WRIST.clone(), FORE, 0.4, 0.25),
    armRing(WRIST.clone().addScaledVector(FORE, 0.45), FORE, 0.47, 0.21),
    armRing(WRIST.clone().addScaledVector(FORE, 1.0), FORE, 0.5, 0.17),
    armRing(WRIST.clone().addScaledVector(FORE, 1.18), FORE, 0.48, 0.16),
  ];
  const arm = new Mesh(loft(smoothRings(armKeys, 5), 36, 0.2, 0.08), material);
  arm.name = 'Venstre arm';
  arm.renderOrder = 11;
  group.add(arm);

  // Fingre og tommel. Håndflaten vender fremover, tommelen peker ut fra kroppen.
  const { lateral, anterior } = armFrame(FORE);
  const fingerBase = WRIST.clone().addScaledVector(FORE, 1.12);
  const fingers: [number, number][] = [
    [-0.34, 0.7],
    [-0.12, 0.88],
    [0.11, 0.95],
    [0.33, 0.86],
  ];
  for (const [off, len] of fingers) {
    const g = new CapsuleGeometry(0.085, len, 4, 10);
    const f = new Mesh(g, material);
    const start = fingerBase.clone().addScaledVector(lateral, off);
    const dir = FORE.clone().addScaledVector(lateral, off * 0.12).normalize();
    f.position.copy(start).addScaledVector(dir, len / 2 + 0.05);
    f.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
    f.renderOrder = 12;
    group.add(f);
  }
  const thumbDir = FORE.clone().multiplyScalar(0.55).addScaledVector(lateral, 0.7).addScaledVector(anterior, 0.35).normalize();
  const thumb = new Mesh(new CapsuleGeometry(0.1, 0.62, 4, 10), material);
  thumb.position.copy(onForearm(1.06, 0.36, 0.05)).addScaledVector(thumbDir, 0.38);
  thumb.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), thumbDir));
  thumb.renderOrder = 12;
  group.add(thumb);

  return group;
}
