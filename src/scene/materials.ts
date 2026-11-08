// Skyggeleggere for arteriene (pulsbølge og blodstrøm) og den gjennomsiktige kroppen.

import { Color, FrontSide, ShaderMaterial, Vector2 } from 'three';

export const MAX_BEATS = 6;

const vesselVertex = /* glsl */ `
attribute float aDist;
attribute float aRadius;
attribute float aArm;

uniform float uAge[${MAX_BEATS}];
uniform float uAmp[${MAX_BEATS}];
uniform float uSpeed;
uniform vec2 uCuff;        // avstand der mansjetten starter og slutter
uniform float uCuffOpen;   // 1 = arterien under mansjetten er åpen
uniform float uCuffPass;   // hvor mye av bølgen som slipper forbi

varying vec3 vNormal;
varying vec3 vView;
varying float vWave;
varying float vDist;
varying float vPast;
varying float vSqueeze;

// Bølgeprofil bak fronten: bratt front og lang hale.
float profile(float u) {
  if (u <= 0.0) return 0.0;
  float rise = smoothstep(0.0, 0.34, u);
  float tail = exp(-max(u - 0.34, 0.0) / 1.75);
  return rise * tail;
}

void main() {
  float w = 0.0;
  for (int i = 0; i < ${MAX_BEATS}; i++) {
    w += uAmp[i] * profile(uAge[i] * uSpeed - aDist);
  }
  float under = aArm * smoothstep(uCuff.x - 0.25, uCuff.x + 0.2, aDist)
                     * (1.0 - smoothstep(uCuff.y - 0.2, uCuff.y + 0.25, aDist));
  float past = aArm * smoothstep(uCuff.x, uCuff.y, aDist);
  w *= mix(1.0, uCuffPass, past);
  float squeeze = under * (1.0 - uCuffOpen);

  vec3 center = position - normal * aRadius;
  float r = aRadius * (1.0 - 0.8 * squeeze) + (0.035 + 0.33 * aRadius) * w * (1.0 - 0.6 * squeeze);
  vec3 p = center + normal * r;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = -mv.xyz;
  vNormal = normalize(normalMatrix * normal);
  vWave = w;
  vDist = aDist;
  vPast = past;
  vSqueeze = squeeze;
  gl_Position = projectionMatrix * mv;
}
`;

const vesselFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uWaveColor;
uniform float uFlow;
uniform float uFlowArm;
uniform float uHighlight;

varying vec3 vNormal;
varying vec3 vView;
varying float vWave;
varying float vDist;
varying float vPast;
varying float vSqueeze;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vView);
  vec3 L1 = normalize(vec3(0.35, 0.8, 0.55));
  vec3 L2 = normalize(vec3(-0.7, 0.1, 0.45));
  float diff = max(dot(N, L1), 0.0) * 0.72 + max(dot(N, L2), 0.0) * 0.28;
  float spec = pow(max(dot(N, normalize(L1 + V)), 0.0), 42.0) * 0.32;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.4);

  float w = clamp(vWave, 0.0, 1.6);
  vec3 base = mix(uColor, uWaveColor, clamp(w * 0.5, 0.0, 0.8));

  // Svake striper som viser selve blodstrømmen. De går mye saktere enn bølgen.
  float flow = mix(uFlow, uFlowArm, vPast);
  float s = fract((vDist - flow) * 1.3);
  float stripe = smoothstep(0.0, 0.1, s) * (1.0 - smoothstep(0.16, 0.38, s));

  vec3 col = base * (0.36 + diff) * (1.0 + stripe * 0.22) + spec + rim * 0.14 * uWaveColor + base * w * 0.22;
  col = mix(col, col * 0.75, vSqueeze);
  col *= 1.0 + uHighlight * 0.12;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function createVesselMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uAge: { value: new Array(MAX_BEATS).fill(100) },
      uAmp: { value: new Array(MAX_BEATS).fill(0) },
      uSpeed: { value: 8.5 },
      uCuff: { value: new Vector2(6, 8) },
      uCuffOpen: { value: 1 },
      uCuffPass: { value: 1 },
      uColor: { value: new Color('#c21d36') },
      uWaveColor: { value: new Color('#ff8a8a') },
      uFlow: { value: 0 },
      uFlowArm: { value: 0 },
      uHighlight: { value: 0 },
    },
    vertexShader: vesselVertex,
    fragmentShader: vesselFragment,
    // Tegnes etter den gjennomsiktige kroppen, så kroppens kant ikke dekker arteriene.
    transparent: true,
    depthWrite: true,
  });
}

const ghostVertex = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;

const ghostFragment = /* glsl */ `
uniform vec3 uRim;
uniform vec3 uFill;
uniform float uOpacity;
uniform float uRimPower;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), uRimPower);
  vec3 col = mix(uFill, uRim, f);
  float a = uOpacity * (0.06 + 0.8 * f);
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

/** Gjennomsiktig kropp med lys kant (fresnel). */
export function createGhostMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uRim: { value: new Color('#bfe0ff') },
      uFill: { value: new Color('#7a9cc9') },
      uOpacity: { value: 1 },
      uRimPower: { value: 2.2 },
    },
    vertexShader: ghostVertex,
    fragmentShader: ghostFragment,
    transparent: true,
    depthWrite: false,
    side: FrontSide,
  });
}
