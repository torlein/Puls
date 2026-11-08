// Laster hjertemodellen (NIH 3D, CC0) og får den til å slå.
//
// Modellen er ett sammenhengende mesh uten egne deler for forkamre og kamre.
// Sammentrekningen styres derfor av høyden i modellen: kamrene nederst trekker
// seg sammen i systole, forkamrene øverst like før. Aortastumpen øverst står
// stille, så aortarøret henger fast.

import {
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  type IUniform,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { HEART_POSITION, HEART_TILT } from './anatomy';

export interface Heart {
  group: Group;
  pickables: Mesh[];
  /** vent og atria er 0 til 1. */
  update(vent: number, atria: number): void;
}

const MODEL_URL = `${import.meta.env.BASE_URL}models/heart.glb`;

export async function loadHeart(onProgress?: (fraction: number) => void): Promise<Heart> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(MODEL_URL, (e) => {
    if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
  });

  const group = new Group();
  group.name = 'Hjertet';
  group.position.copy(HEART_POSITION);
  group.rotation.z = HEART_TILT;
  group.add(gltf.scene);
  gltf.scene.updateMatrixWorld(true);

  const uVent: IUniform<number> = { value: 0 };
  const uAtria: IUniform<number> = { value: 0 };
  const glow = new Color('#ff2a44');

  let material: MeshStandardMaterial | null = null;
  gltf.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as MeshStandardMaterial;
    material = mat;
    mat.emissive = glow.clone();
    mat.emissiveIntensity = 0.04;
    mat.roughness = 0.62;
    mat.metalness = 0;
    // Tegnes etter den gjennomsiktige kroppen, så kroppens kant ikke farger hjertet.
    mat.transparent = true;
    mat.depthWrite = true;
    mesh.renderOrder = 15;
    // Kvantiseringen fra meshopt gir noden en egen skala. Regn i hjertets rom.
    const toHeart = mesh.matrixWorld.clone();
    const fromHeart = new Matrix4().copy(toHeart).invert();
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uVent = uVent;
      shader.uniforms.uAtria = uAtria;
      shader.uniforms.uToHeart = { value: toHeart };
      shader.uniforms.uFromHeart = { value: fromHeart };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uVent;
uniform float uAtria;
uniform mat4 uToHeart;
uniform mat4 uFromHeart;
varying float vGlow;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
{
  vec3 hp = (uToHeart * vec4(transformed, 1.0)).xyz;
  float y = hp.y;
  // Kamrene: fra spissen og opp mot klaffeplanet.
  float wv = (1.0 - smoothstep(0.7, 1.25, y)) * smoothstep(-1.4, -1.12, y);
  // Forkamrene: et belte over kamrene, men under de store karene.
  float wa = smoothstep(0.45, 0.85, y) * (1.0 - smoothstep(1.3, 1.52, y));
  hp -= hp * (0.07 * uVent * wv);
  vec3 ca = vec3(-0.1, 1.0, -0.15);
  hp -= (hp - ca) * (0.08 * uAtria * wa);
  transformed = (uFromHeart * vec4(hp, 1.0)).xyz;
  vGlow = wv;
}`,
        );
      // Gløden gjelder bare den røde hjertemuskelen i kamrene, ikke de blå karene.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
totalEmissiveRadiance *= vGlow * clamp((diffuseColor.r - diffuseColor.b) * 1.6, 0.0, 1.0);`,
        );
    };
    mesh.raycast = () => {};
  });

  // Enkel, usynlig form for klikk. Raskere enn å treffe 60 000 trekanter.
  const proxy = new Mesh(new SphereGeometry(1, 20, 14), new MeshBasicMaterial({ visible: false }));
  proxy.scale.set(1.25, 1.35, 1.0);
  proxy.position.set(0.1, 0.05, 0.05);
  proxy.userData.part = 'hjertet';
  group.add(proxy);

  return {
    group,
    pickables: [proxy],
    update(vent: number, atria: number) {
      uVent.value = vent;
      uAtria.value = atria;
      if (material) (material as MeshStandardMaterial).emissiveIntensity = 0.03 + 0.22 * vent;
    },
  };
}
