// Geometri som bygges i kode: arterierør, kroppsformer og veggutsnittet.

import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  Vector3,
} from 'three';

// ---------- Arterier ----------

export interface VesselDef {
  name: string;
  points: Vector3[];
  /** Radius ved start og slutt. */
  r0: number;
  r1: number;
  /** Avstand fra hjertet (langs arteriene) der røret starter. */
  distStart: number;
  /** 1 for arterien ut i venstre arm, som mansjetten virker på. */
  arm?: boolean;
  radial?: number;
  /** Lukk enden med en avrundet tupp. */
  capEnd?: boolean;
}

export interface Vessel {
  def: VesselDef;
  curve: CatmullRomCurve3;
  length: number;
  geometry: BufferGeometry;
  /** Punkt og avstand fra hjertet for en brøkdel u av røret. */
  pointAt(u: number): Vector3;
  distAt(u: number): number;
  radiusAt(u: number): number;
}

/**
 * Lager et rør langs en Catmull-Rom-kurve. Hvert hjørnepunkt får avstanden
 * fra hjertet (aDist), rørets radius (aRadius) og om det ligger i armen (aArm).
 * Normalen peker rett ut fra rørets midtlinje, så pulsbølgen kan skyve
 * hjørnepunktene langs den.
 */
export function buildVessel(def: VesselDef): Vessel {
  const curve = new CatmullRomCurve3(def.points, false, 'centripetal', 0.5);
  const length = curve.getLength();
  const segs = Math.max(10, Math.ceil(length * 16));
  const radial = def.radial ?? 18;
  const frames = curve.computeFrenetFrames(segs, false);
  const radiusAt = (u: number) => def.r0 + (def.r1 - def.r0) * u;

  const rings = segs + 1;
  const extra = def.capEnd ? radial * 2 + 1 : 0;
  const count = rings * radial + extra;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const dist = new Float32Array(count);
  const rad = new Float32Array(count);
  const arm = new Float32Array(count).fill(def.arm ? 1 : 0);
  const p = new Vector3();
  const n = new Vector3();
  let v = 0;
  for (let i = 0; i < rings; i++) {
    const u = i / segs;
    curve.getPointAt(u, p);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r = radiusAt(u);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a)).normalize();
      pos[v * 3] = p.x + n.x * r;
      pos[v * 3 + 1] = p.y + n.y * r;
      pos[v * 3 + 2] = p.z + n.z * r;
      nor[v * 3] = n.x;
      nor[v * 3 + 1] = n.y;
      nor[v * 3 + 2] = n.z;
      dist[v] = def.distStart + u * length;
      rad[v] = r;
      v++;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      // Mot klokka sett utenfra, så forsiden peker ut av røret.
      idx.push(a, b, c, b, d, c);
    }
  }
  if (def.capEnd) {
    // Avrundet tupp: én ekstra ring og en spiss, som ikke beveger seg med bølgen.
    const T = frames.tangents[segs];
    const N = frames.normals[segs];
    const B = frames.binormals[segs];
    const r = radiusAt(1);
    curve.getPointAt(1, p);
    const base = v;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a)).normalize();
      const q = new Vector3().copy(p).addScaledVector(T, r * 0.45).addScaledVector(n, r * 0.75);
      const nn = new Vector3().copy(n).multiplyScalar(0.7).addScaledVector(T, 0.7).normalize();
      pos.set([q.x, q.y, q.z], v * 3);
      nor.set([nn.x, nn.y, nn.z], v * 3);
      dist[v] = def.distStart + length;
      rad[v] = 0;
      v++;
    }
    const tip = new Vector3().copy(p).addScaledVector(T, r * 0.75);
    pos.set([tip.x, tip.y, tip.z], v * 3);
    nor.set([T.x, T.y, T.z], v * 3);
    dist[v] = def.distStart + length;
    rad[v] = 0;
    const tipIndex = v;
    v++;
    const last = segs * radial;
    for (let j = 0; j < radial; j++) {
      const a = last + j;
      const b = last + ((j + 1) % radial);
      const c = base + j;
      const d = base + ((j + 1) % radial);
      idx.push(a, b, c, b, d, c);
      idx.push(c, d, tipIndex);
    }
    // Ubrukte plasser (radial) i bufferen fylles med tuppen, så de ikke synes.
    for (; v < count; v++) {
      pos.set([tip.x, tip.y, tip.z], v * 3);
      nor.set([T.x, T.y, T.z], v * 3);
      dist[v] = def.distStart + length;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('aDist', new BufferAttribute(dist, 1));
  g.setAttribute('aRadius', new BufferAttribute(rad, 1));
  g.setAttribute('aArm', new BufferAttribute(arm, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return {
    def,
    curve,
    length,
    geometry: g,
    pointAt: (u: number) => curve.getPointAt(u),
    distAt: (u: number) => def.distStart + u * length,
    radiusAt,
  };
}

/** Finner brøkdelen u på kurven som ligger nærmest punktet q. */
export function closestU(curve: CatmullRomCurve3, q: Vector3, samples = 400): number {
  let best = 0;
  let bestD = Infinity;
  const p = new Vector3();
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    curve.getPointAt(u, p);
    const d = p.distanceToSquared(q);
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

// ---------- Loft: kroppsformer ----------

export interface Ring {
  center: Vector3;
  /** Retning for rx (bredde) og ry (dybde). */
  xAxis: Vector3;
  yAxis: Vector3;
  rx: number;
  ry: number;
  /** Superellipse-eksponent. 2 er en vanlig ellipse. */
  n?: number;
}

/** Glatt interpolasjon mellom tall med Catmull-Rom. */
function cr(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Interpolerer en liste med ringer til mange, glatte ringer. */
export function smoothRings(keys: Ring[], perSpan: number): Ring[] {
  const out: Ring[] = [];
  const at = (i: number) => keys[Math.max(0, Math.min(keys.length - 1, i))];
  for (let i = 0; i < keys.length - 1; i++) {
    for (let s = 0; s < perSpan; s++) {
      const t = s / perSpan;
      const k0 = at(i - 1), k1 = at(i), k2 = at(i + 1), k3 = at(i + 2);
      const vec = (f: (k: Ring) => Vector3) =>
        new Vector3(
          cr(f(k0).x, f(k1).x, f(k2).x, f(k3).x, t),
          cr(f(k0).y, f(k1).y, f(k2).y, f(k3).y, t),
          cr(f(k0).z, f(k1).z, f(k2).z, f(k3).z, t),
        );
      out.push({
        center: vec((k) => k.center),
        xAxis: vec((k) => k.xAxis).normalize(),
        yAxis: vec((k) => k.yAxis).normalize(),
        rx: cr(k0.rx, k1.rx, k2.rx, k3.rx, t),
        ry: cr(k0.ry, k1.ry, k2.ry, k3.ry, t),
        n: cr(k0.n ?? 2, k1.n ?? 2, k2.n ?? 2, k3.n ?? 2, t),
      });
    }
  }
  out.push(keys[keys.length - 1]);
  return out;
}

/**
 * Bygger en lukket form fra ringer. Endene lukkes med en kuppel som stikker
 * capStart og capEnd ut langs aksen.
 */
export function loft(rings: Ring[], radial = 40, capStart = 0, capEnd = 0): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const sgnPow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (const r of rings) {
    const e = 2 / (r.n ?? 2);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cx = sgnPow(Math.cos(a), e) * r.rx;
      const cy = sgnPow(Math.sin(a), e) * r.ry;
      pos.push(
        r.center.x + r.xAxis.x * cx + r.yAxis.x * cy,
        r.center.y + r.xAxis.y * cx + r.yAxis.y * cy,
        r.center.z + r.xAxis.z * cx + r.yAxis.z * cy,
      );
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      const c = (i + 1) * radial + j;
      const d = (i + 1) * radial + ((j + 1) % radial);
      idx.push(a, b, c, b, d, c);
    }
  }
  const addCap = (ringIndex: number, outward: Vector3, bulge: number, flip: boolean) => {
    const r = rings[ringIndex];
    const steps = 4;
    let prevStart = ringIndex * radial;
    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      const scale = Math.cos((f * Math.PI) / 2);
      const lift = Math.sin((f * Math.PI) / 2) * bulge;
      const start = pos.length / 3;
      const e = 2 / (r.n ?? 2);
      if (s === steps) {
        const c = r.center.clone().addScaledVector(outward, lift);
        pos.push(c.x, c.y, c.z);
        for (let j = 0; j < radial; j++) {
          const a = prevStart + j;
          const b = prevStart + ((j + 1) % radial);
          if (flip) idx.push(a, start, b);
          else idx.push(a, b, start);
        }
        break;
      }
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const cx = sgnPow(Math.cos(a), e) * r.rx * scale;
        const cy = sgnPow(Math.sin(a), e) * r.ry * scale;
        pos.push(
          r.center.x + r.xAxis.x * cx + r.yAxis.x * cy + outward.x * lift,
          r.center.y + r.xAxis.y * cx + r.yAxis.y * cy + outward.y * lift,
          r.center.z + r.xAxis.z * cx + r.yAxis.z * cy + outward.z * lift,
        );
      }
      for (let j = 0; j < radial; j++) {
        const a = prevStart + j;
        const b = prevStart + ((j + 1) % radial);
        const c = start + j;
        const d = start + ((j + 1) % radial);
        if (flip) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
      prevStart = start;
    }
  };
  const first = rings[0];
  const last = rings[rings.length - 1];
  const axisStart = first.center.clone().sub(rings[1].center).normalize();
  const axisEnd = last.center.clone().sub(rings[rings.length - 2].center).normalize();
  if (capStart > 0) addCap(0, axisStart, capStart, true);
  if (capEnd > 0) addCap(rings.length - 1, axisEnd, capEnd, false);

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Retningen på trekantene avhenger av ringenes akser. Snu normalene om de peker inn.
  const n = g.getAttribute('normal');
  const p = g.getAttribute('position');
  const mid = Math.floor(rings.length / 2) * radial;
  const c = rings[Math.floor(rings.length / 2)].center;
  const out = new Vector3(p.getX(mid) - c.x, p.getY(mid) - c.y, p.getZ(mid) - c.z);
  const nv = new Vector3(n.getX(mid), n.getY(mid), n.getZ(mid));
  if (out.dot(nv) < 0) {
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i += 3) {
      const t = ix.getX(i + 1);
      ix.setX(i + 1, ix.getX(i + 2));
      ix.setX(i + 2, t);
    }
    g.computeVertexNormals();
  }
  g.computeBoundingSphere();
  return g;
}

// ---------- Veggutsnitt ----------

/**
 * Et rørstykke langs x-aksen med en kile skåret bort, så lagene synes.
 * Vinkelen måles i yz-planet fra +y mot +z. Delen fra a0 til a1 beholdes.
 */
export function annularSector(rIn: number, rOut: number, a0: number, a1: number, length: number, seg = 48): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const hx = length / 2;
  const ring = (a: number, r: number) => [r * Math.cos(a), r * Math.sin(a)] as const;
  const quad = (p: number[][], n: number[][]) => {
    const base = pos.length / 3;
    for (let i = 0; i < 4; i++) {
      pos.push(...p[i]);
      nor.push(...n[i]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + ((a1 - a0) * i) / seg;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
    const [yo0, zo0] = ring(t0, rOut);
    const [yo1, zo1] = ring(t1, rOut);
    const [yi0, zi0] = ring(t0, rIn);
    const [yi1, zi1] = ring(t1, rIn);
    const n0 = [0, Math.cos(t0), Math.sin(t0)];
    const n1 = [0, Math.cos(t1), Math.sin(t1)];
    // Ytre flate
    quad([[-hx, yo0, zo0], [hx, yo0, zo0], [hx, yo1, zo1], [-hx, yo1, zo1]], [n0, n0, n1, n1]);
    // Indre flate (normal inn)
    const m0 = n0.map((v) => -v);
    const m1 = n1.map((v) => -v);
    quad([[-hx, yi1, zi1], [hx, yi1, zi1], [hx, yi0, zi0], [-hx, yi0, zi0]], [m1, m1, m0, m0]);
    // Endeflater
    quad([[hx, yi0, zi0], [hx, yi1, zi1], [hx, yo1, zo1], [hx, yo0, zo0]], [[1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0]]);
    quad([[-hx, yo0, zo0], [-hx, yo1, zo1], [-hx, yi1, zi1], [-hx, yi0, zi0]], [[-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0]]);
  }
  // Snittflatene der kilen er skåret bort.
  const cut = (a: number, sign: number) => {
    const [yi, zi] = ring(a, rIn);
    const [yo, zo] = ring(a, rOut);
    const n = [0, -Math.sin(a) * sign, Math.cos(a) * sign];
    if (sign > 0) quad([[-hx, yi, zi], [hx, yi, zi], [hx, yo, zo], [-hx, yo, zo]], [n, n, n, n]);
    else quad([[-hx, yo, zo], [hx, yo, zo], [hx, yi, zi], [-hx, yi, zi]], [n, n, n, n]);
  };
  cut(a0, -1);
  cut(a1, 1);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
