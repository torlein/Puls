// Bygger public/models/heart.glb fra NIH 3D-modellen (3DPX-022787, CC0).
//
// Steg:
//  1. Fjerner modellens egen aortabue og avgreninger (røde trekanter over et
//     vannrett snitt). Aorta bygges i kode og skal fortsette fra stumpen.
//  2. Sveiser like hjørnepunkter og forenkler til ca. 60 000 trekanter.
//  3. Lager glatte normaler (modellen har ingen).
//  4. Roterer, skalerer og flytter modellen inn i scenens koordinater.
//  5. Krymper teksturene og lagrer dem som WebP.
//  6. Komprimerer geometrien med meshopt.
//
// Skriptet skriver også src/scene/heart-anchors.json med posisjonen og
// radien til aortastumpene, slik at koden kan koble aortarøret til hjertet.
//
// Kjør: npm run model

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  meshopt,
  prune,
  simplify,
  textureCompress,
  transformMesh,
  weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SRC = 'models/source/nih-22787-heart.glb';
const OUT = 'public/models/heart.glb';
const ANCHORS = 'src/scene/heart-anchors.json';

// Modellens høyde er 1,0. Hjertet uten store kar er ca. 0,6, som tilsvarer
// ca. 12 cm. Scenen bruker ca. 5 cm per enhet, altså skala 4.
const SCALE = 4;
// Snitthøyde i modellens egne koordinater. Over dette fjernes alt som ikke er
// blått (aortabuen og grenene er røde, hulvenen og lungearteriene er blå).
const CUT_Y = 0.235;
const TARGET_TRIANGLES = 60000;

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

const doc = await io.read(SRC);
const root = doc.getRoot();
const mesh = root.listMeshes()[0];
const prim = mesh.listPrimitives()[0];
const material = prim.getMaterial();
const baseTex = material.getBaseColorTexture();

// ---------- 1. Fjern aortabuen ----------
const { data: px, info } = await sharp(Buffer.from(baseTex.getImage()))
  .raw()
  .toBuffer({ resolveWithObject: true });

function sampleColor(u, v) {
  const x = Math.min(info.width - 1, Math.max(0, Math.round(u * (info.width - 1))));
  const y = Math.min(info.height - 1, Math.max(0, Math.round(v * (info.height - 1))));
  const i = (y * info.width + x) * info.channels;
  return [px[i], px[i + 1], px[i + 2]];
}

{
  const pos = prim.getAttribute('POSITION').getArray();
  const uv = prim.getAttribute('TEXCOORD_0').getArray();
  const idx = prim.getIndices().getArray();
  const keep = [];
  let removed = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const maxY = Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1]);
    if (maxY > CUT_Y) {
      const u = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3;
      const v = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3;
      const [r, , bl] = sampleColor(u, v);
      const blue = bl > 90 && bl > r + 40;
      if (!blue) {
        removed++;
        continue;
      }
    }
    keep.push(a, b, c);
  }
  prim.getIndices().setArray(new Uint32Array(keep));
  console.log(`Fjernet ${removed} trekanter fra aortabuen, beholdt ${keep.length / 3}.`);
}

// ---------- 2. Sveis og forenkle ----------
await doc.transform(weld(), prune());
{
  const tris = () => prim.getIndices().getCount() / 3;
  const before = tris();
  // simplify() styrer etter andel hjørnepunkter. Hjørnepunkter og trekanter
  // følger hverandre omtrent, så vi justerer i noen få runder.
  let ratio = TARGET_TRIANGLES / before;
  await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 }));
  console.log(`Forenklet fra ${before} til ${tris()} trekanter.`);
}

// ---------- 3. Glatte normaler ----------
// Hjørnepunkter er delt ved UV-sømmer. Vi samler flatenormaler per posisjon,
// slik at sømmene ikke synes.
{
  const posA = prim.getAttribute('POSITION');
  const pos = posA.getArray();
  const idx = prim.getIndices().getArray();
  const n = posA.getCount();
  const key = (i) =>
    `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
  const groupOf = new Int32Array(n);
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const k = key(i);
    let g = groups.get(k);
    if (g === undefined) {
      g = groups.size;
      groups.set(k, g);
    }
    groupOf[i] = g;
  }
  const acc = new Float64Array(groups.size * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const e1x = pos[b * 3] - ax, e1y = pos[b * 3 + 1] - ay, e1z = pos[b * 3 + 2] - az;
    const e2x = pos[c * 3] - ax, e2y = pos[c * 3 + 1] - ay, e2z = pos[c * 3 + 2] - az;
    // Kryssproduktet er arealvektet.
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      const g = groupOf[v] * 3;
      acc[g] += nx;
      acc[g + 1] += ny;
      acc[g + 2] += nz;
    }
  }
  const normals = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const g = groupOf[i] * 3;
    const l = Math.hypot(acc[g], acc[g + 1], acc[g + 2]) || 1;
    normals[i * 3] = acc[g] / l;
    normals[i * 3 + 1] = acc[g + 1] / l;
    normals[i * 3 + 2] = acc[g + 2] / l;
  }
  const normalAccessor = doc
    .createAccessor('NORMAL')
    .setType('VEC3')
    .setArray(normals)
    .setBuffer(root.listBuffers()[0]);
  prim.setAttribute('NORMAL', normalAccessor);
}

// ---------- Finn aortastumpene (før transformasjon) ----------
function boundaryLoops() {
  const pos = prim.getAttribute('POSITION').getArray();
  const idx = prim.getIndices().getArray();
  const n = prim.getAttribute('POSITION').getCount();
  // Grupper hjørnepunkter etter posisjon, så UV-sømmer ikke ser ut som kanter.
  const canon = new Int32Array(n);
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
    if (!seen.has(k)) seen.set(k, i);
    canon[i] = seen.get(k);
  }
  const edges = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [canon[idx[t]], canon[idx[t + 1]], canon[idx[t + 2]]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
  }
  const adj = new Map();
  for (const [k, count] of edges) {
    if (count !== 1) continue;
    const [a, b] = k.split('_').map(Number);
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  const visited = new Set();
  const loops = [];
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    const comp = [];
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const v = stack.pop();
      comp.push(v);
      for (const w of adj.get(v)) {
        if (!visited.has(w)) {
          visited.add(w);
          stack.push(w);
        }
      }
    }
    if (comp.length < 8) continue;
    // Stumpene til den opp- og nedadgående aorta henger sammen i én kant.
    // Del kanten i to grupper med k-means i xz-planet.
    if (comp.length > 100) {
      const parts = kmeans2(comp, pos);
      for (const part of parts) loops.push(describe(part, pos));
      continue;
    }
    loops.push(describe(comp, pos));
  }
  return loops.sort((a, b) => b.count - a.count);
}

function kmeans2(comp, pos) {
  let ca = comp[0], cb = comp[0], best = -1;
  for (const v of comp) {
    const d = Math.hypot(pos[v * 3] - pos[ca * 3], pos[v * 3 + 2] - pos[ca * 3 + 2]);
    if (d > best) { best = d; cb = v; }
  }
  let A = [pos[ca * 3], pos[ca * 3 + 2]], B = [pos[cb * 3], pos[cb * 3 + 2]];
  let ga = [], gb = [];
  for (let iter = 0; iter < 20; iter++) {
    ga = []; gb = [];
    for (const v of comp) {
      const x = pos[v * 3], z = pos[v * 3 + 2];
      (Math.hypot(x - A[0], z - A[1]) < Math.hypot(x - B[0], z - B[1]) ? ga : gb).push(v);
    }
    const mean = (g) => [g.reduce((s, v) => s + pos[v * 3], 0) / g.length, g.reduce((s, v) => s + pos[v * 3 + 2], 0) / g.length];
    A = mean(ga); B = mean(gb);
  }
  return [ga, gb];
}

function describe(comp, pos) {
  {
    let cx = 0, cy = 0, cz = 0;
    for (const v of comp) {
      cx += pos[v * 3];
      cy += pos[v * 3 + 1];
      cz += pos[v * 3 + 2];
    }
    cx /= comp.length;
    cy /= comp.length;
    cz /= comp.length;
    // Senter fra midten av utstrekningen i xz-planet, som er mindre følsomt for
    // ujevnt fordelte hjørnepunkter enn gjennomsnittet.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const v of comp) {
      minX = Math.min(minX, pos[v * 3]);
      maxX = Math.max(maxX, pos[v * 3]);
      minZ = Math.min(minZ, pos[v * 3 + 2]);
      maxZ = Math.max(maxZ, pos[v * 3 + 2]);
    }
    cx = (minX + maxX) / 2;
    cz = (minZ + maxZ) / 2;
    let r = 0;
    let rMax = 0;
    for (const v of comp) {
      const d = Math.hypot(pos[v * 3] - cx, pos[v * 3 + 2] - cz);
      r += d;
      rMax = Math.max(rMax, d);
    }
    r /= comp.length;
    return { center: [cx, cy, cz], radius: r, radiusMax: rMax, count: comp.length };
  }
}

// ---------- 4. Roter, skaler og flytt ----------
// Modellens +x er forsiden (anterior), -z er pasientens venstre side og +y er opp.
// Scenen har personen vendt mot +z, med venstre side mot +x.
// Rotasjon -90 grader om y gir: modell +x -> scene +z, modell -z -> scene +x.
// Origo legges i midten av hjertekamrene, så sammentrekningen skjer rundt den.
let center;
{
  const pos = prim.getAttribute('POSITION').getArray();
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1];
    if (y < -0.44 || y > 0.12) continue;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k]);
      max[k] = Math.max(max[k], pos[i + k]);
    }
  }
  center = min.map((m, k) => (m + max[k]) / 2);
}
function toScene([x, y, z]) {
  const dx = x - center[0], dy = y - center[1], dz = z - center[2];
  // rotasjon -90 grader om y: x' = -z, z' = x
  return [-dz * SCALE, dy * SCALE, dx * SCALE];
}
const loops = boundaryLoops().map((l) => ({
  center: toScene(l.center),
  radius: l.radius * SCALE,
  radiusMax: (l.radiusMax ?? l.radius) * SCALE,
  count: l.count,
  modelY: l.center[1],
}));
{
  const c = Math.cos(-Math.PI / 2), s = Math.sin(-Math.PI / 2);
  // Kolonnevis 4x4-matrise: T * R * S, der T flytter senteret til origo.
  const R = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
  const m = R.map((v, i) => (i < 12 ? v * SCALE : v));
  // translasjon: -R*S*center
  const cx = center[0], cy = center[1], cz = center[2];
  m[12] = -(m[0] * cx + m[4] * cy + m[8] * cz);
  m[13] = -(m[1] * cx + m[5] * cy + m[9] * cz);
  m[14] = -(m[2] * cx + m[6] * cy + m[10] * cz);
  transformMesh(mesh, m);
  for (const node of root.listNodes()) {
    node.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
    node.setName(node.getMesh() ? 'Hjerte' : node.getName());
  }
  mesh.setName('Hjerte');
  material.setName('Hjertemuskel');
}

// Bounding box i scenekoordinater, før meshopt kvantiserer posisjonene.
const bbMin = prim.getAttribute('POSITION').getMin([]);
const bbMax = prim.getAttribute('POSITION').getMax([]);

// ---------- 5. Teksturer ----------
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82, slots: /^(baseColor|normal)/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 80, slots: /^metallicRoughness/ }),
);

// ---------- 6. Rydd og komprimer ----------
await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

root.getAsset().generator = 'gltf-transform (scripts/build-model.mjs)';
root.getAsset().copyright =
  'Human Heart 3d Model, Biology Notes Online, NIH 3D 3DPX-022787. CC0 1.0 (Public Domain).';

mkdirSync(dirname(OUT), { recursive: true });
await io.write(OUT, doc);


const stumps = loops.filter((l) => Math.abs(l.modelY - CUT_Y) < 0.04 && l.radius > 0.08);
writeFileSync(
  ANCHORS,
  JSON.stringify(
    {
      note: 'Generert av scripts/build-model.mjs. Scenekoordinater før hjertets helning.',
      scale: SCALE,
      bboxMin: bbMin.map((v) => +v.toFixed(4)),
      bboxMax: bbMax.map((v) => +v.toFixed(4)),
      stumps: stumps.map((l) => ({
        center: l.center.map((v) => +v.toFixed(4)),
        radius: +l.radius.toFixed(4),
        radiusMax: +l.radiusMax.toFixed(4),
        vertices: l.count,
      })),
    },
    null,
    2,
  ) + '\n',
);

const triangles = prim.getIndices().getCount() / 3;
console.log(`Trekanter: ${triangles}`);
console.log(`Stumper ved snittet:`, JSON.stringify(stumps, null, 0));
console.log(`Alle kanter:`, loops.slice(0, 12).map((l) => `${l.count}@y${l.modelY.toFixed(3)} r${l.radius.toFixed(3)}`).join(' | '));
console.log(`${OUT}: ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
