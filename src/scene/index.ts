// 3D-scenen: bygger anatomien, kobler den til den felles tilstanden og tegner
// bare når visningen er synlig.

import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import type { PartId } from '../content';
import { WAVE_SPEED } from '../physiology';
import { app, pressureAtDistance } from '../store';
import { cssVar, isDark, onThemeChange } from '../theme';
import { HEART_POSITION, RADIAL_POINT, WALL_CENTER, armFrame, UPPER, buildArteries } from './anatomy';
import { buildBody } from './body';
import { CameraRig, type ViewDef } from './camera';
import { buildCuff } from './cuff';
import { loadHeart } from './heart';
import { Labels, type LabelDef } from './labels';
import { MAX_BEATS, createGhostMaterial, createVesselMaterial } from './materials';
import { buildWall } from './wall';
import { buildWrist } from './wrist';

export interface SceneElements {
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  labels: HTMLElement;
  status: HTMLElement;
  overview: HTMLButtonElement;
  zoomIn: HTMLButtonElement;
  zoomOut: HTMLButtonElement;
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export async function initScene(el: SceneElements): Promise<void> {
  if (!webglAvailable()) {
    el.status.textContent = '3D-visningen krever WebGL, som ikke er tilgjengelig her. Panelet og monitoren virker likevel.';
    for (const b of [el.overview, el.zoomIn, el.zoomOut]) b.disabled = true;
    return;
  }

  const renderer = new WebGLRenderer({ canvas: el.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const hemi = new HemisphereLight(0xffffff, 0x8a6f68, 1.5);
  const key = new DirectionalLight(0xffffff, 2.1);
  key.position.set(4, 7, 9);
  const fill = new DirectionalLight(0xdfe8ff, 0.7);
  fill.position.set(-8, 2, 5);
  scene.add(hemi, key, fill);

  // ---------- Anatomi ----------
  const vesselMat = createVesselMaterial();
  vesselMat.uniforms.uSpeed.value = WAVE_SPEED;
  const ghostMat = createGhostMaterial();

  const arteries = buildArteries();
  app.geometry.cuffStart = arteries.cuffDist[0];
  app.geometry.cuffEnd = arteries.cuffDist[1];
  app.geometry.wristDist = arteries.wristDist;
  vesselMat.uniforms.uCuff.value.set(arteries.cuffDist[0], arteries.cuffDist[1]);

  const pickables: Object3D[] = [];
  for (const v of arteries.all) {
    const m = new Mesh(v.geometry, vesselMat);
    m.name = v.def.name;
    m.userData.part = 'aorta';
    m.renderOrder = 20;
    scene.add(m);
    pickables.push(m);
  }

  const body = buildBody(ghostMat);
  scene.add(body);

  const cuff = buildCuff();
  scene.add(cuff.group);
  pickables.push(...cuff.pickables);

  const wall = buildWall(arteries.wallSource);
  scene.add(wall.group);
  pickables.push(...wall.pickables);

  const wrist = buildWrist();
  scene.add(wrist.group);
  pickables.push(...wrist.pickables);

  // ---------- Farger fra temaet ----------
  const applyTheme = () => {
    vesselMat.uniforms.uColor.value.set(cssVar('--scene-artery'));
    vesselMat.uniforms.uWaveColor.value.set(cssVar('--scene-wave'));
    ghostMat.uniforms.uRim.value.set(cssVar('--scene-rim'));
    ghostMat.uniforms.uFill.value.set(cssVar('--scene-fill'));
    ghostMat.uniforms.uOpacity.value = isDark() ? 0.9 : 0.75;
    ghostMat.uniforms.uRimPower.value = isDark() ? 2.2 : 1.8;
    wall.setInk(new Color(cssVar('--ink-2')));
    wrist.setColor(new Color(cssVar('--pulse')));
    cuff.setDark(isDark());
    hemi.intensity = isDark() ? 1.3 : 1.6;
    needsRender = true;
  };

  // ---------- Kamera og visninger ----------
  const views: Record<PartId, ViewDef> = {
    oversikt: { target: new Vector3(0.9, 0.25, 0), halfW: 8.9, halfH: 7.5, yaw: 0, pitch: 0.06 },
    hjertet: { target: HEART_POSITION.clone().add(new Vector3(0.05, 0.3, 0.2)), halfW: 1.95, halfH: 2.05, yaw: 0.3, pitch: 0.12 },
    aorta: { target: new Vector3(0.15, 4.35, 0.2), halfW: 2.9, halfH: 2.75, yaw: 0.18, pitch: 0.14 },
    veggen: { target: WALL_CENTER.clone().add(new Vector3(0.1, 0.05, 0)), halfW: 2.45, halfH: 1.85, yaw: -0.22, pitch: 0.2 },
    mansjetten: { target: cuff.center.clone().add(new Vector3(0.1, -0.2, 0.1)), halfW: 2.3, halfH: 2.7, yaw: 0.36, pitch: 0.1 },
    handleddet: { target: RADIAL_POINT.clone().add(new Vector3(0.1, -0.1, 0.25)), halfW: 1.45, halfH: 1.45, yaw: 0.38, pitch: 0.14 },
  };
  const rig = new CameraRig(views[app.part], 1);
  const camera = rig.camera;

  // ---------- Etiketter ----------
  const { lateral } = armFrame(UPPER);
  let heartGroup: Object3D | null = null;
  const heartAnchor = new Vector3(-0.55, -0.25, 0.95);
  const labelDefs: LabelDef[] = [
    {
      id: 'hjertet',
      part: 'hjertet',
      text: 'Hjertet',
      num: '1a',
      side: 'left',
      anchor: () => (heartGroup ? heartGroup.localToWorld(heartAnchor.clone()) : HEART_POSITION.clone().add(new Vector3(-0.6, -0.3, 1.0))),
    },
    {
      id: 'aorta',
      part: 'aorta',
      text: 'Aorta',
      num: '1b',
      side: 'left',
      anchor: () => arteries.aorta.pointAt(0.08).add(new Vector3(-0.25, 0.05, 0.1)),
    },
    {
      id: 'veggen',
      part: 'veggen',
      text: 'Arterieveggen',
      num: '1c',
      side: 'up',
      anchor: () => WALL_CENTER.clone().add(new Vector3(-0.2, 1.35, 0.2)),
    },
    {
      id: 'mansjetten',
      part: 'mansjetten',
      text: 'Mansjetten',
      num: '1d',
      side: 'right',
      anchor: () => cuff.center.clone().addScaledVector(lateral, 0.85),
    },
    {
      id: 'handleddet',
      part: 'handleddet',
      text: 'Håndleddet',
      num: '1e',
      side: 'right',
      anchor: () => wrist.anchor.clone(),
    },
    { id: 'intima', text: 'Intima', side: 'left', only: 'veggen', anchor: () => wall.layerAnchors().intima },
    { id: 'media', text: 'Media', side: 'down', only: 'veggen', anchor: () => wall.layerAnchors().media },
    { id: 'adventitia', text: 'Adventitia', side: 'right', only: 'veggen', anchor: () => wall.layerAnchors().adventitia },
  ];
  const labels = new Labels(el.labels, labelDefs);
  // Punkter etikettene ikke bør dekke.
  const keepClear = [
    HEART_POSITION.clone().add(new Vector3(0.15, -0.1, 0.8)),
    HEART_POSITION.clone().add(new Vector3(0.6, -0.6, 0.8)),
    arteries.aorta.pointAt(0.1),
    cuff.center.clone(),
    WALL_CENTER.clone(),
    RADIAL_POINT.clone(),
  ];

  // ---------- Størrelse og synlighet ----------
  let width = 1;
  let height = 1;
  let visible = true;
  let needsRender = true;
  const resize = () => {
    const r = el.stage.getBoundingClientRect();
    width = Math.max(1, Math.round(r.width));
    height = Math.max(1, Math.round(r.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    rig.setAspect(width / height);
    labels.measure();
    needsRender = true;
  };
  new ResizeObserver(resize).observe(el.stage);
  resize();
  // Mister vi WebGL-konteksten (for eksempel når mobilen sparer minne), tegner vi på nytt når den kommer tilbake.
  el.canvas.addEventListener('webglcontextrestored', () => {
    needsRender = true;
  });
  new IntersectionObserver((e) => {
    visible = e[0]?.isIntersecting ?? true;
    if (visible) needsRender = true;
  }).observe(el.stage);

  applyTheme();
  onThemeChange(applyTheme);

  // ---------- Valg av del ----------
  app.events.on('part', (id) => {
    rig.setView(views[id], app.reducedMotion);
    vesselMat.uniforms.uHighlight.value = id === 'aorta' ? 1 : 0;
    needsRender = true;
  });

  el.overview.addEventListener('click', () => {
    if (app.part === 'oversikt') rig.setView(views.oversikt, app.reducedMotion);
    else app.selectPart('oversikt');
    needsRender = true;
  });
  el.zoomIn.addEventListener('click', () => {
    rig.zoomBy(0.8);
    needsRender = true;
  });
  el.zoomOut.addEventListener('click', () => {
    rig.zoomBy(1.25);
    needsRender = true;
  });

  // ---------- Peker: dra, knip og klikk ----------
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const pointers = new Map<number, { x: number; y: number }>();
  let downAt = { x: 0, y: 0, t: 0, moved: 0 };
  let pinchStart = 0;
  let lastHover = 0;

  const pick = (clientX: number, clientY: number): PartId | null => {
    const r = el.canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    let o: Object3D | null = hit?.object ?? null;
    while (o && !o.userData.part) o = o.parent;
    return (o?.userData.part as PartId) ?? null;
  };

  const canvas = el.canvas;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) downAt = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') {
        const now = performance.now();
        if (now - lastHover > 60) {
          lastHover = now;
          canvas.classList.toggle('hovering', pick(e.clientX, e.clientY) !== null);
        }
      }
      return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downAt.moved += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 1) {
      if (downAt.moved > 4 && !canvas.hasPointerCapture(e.pointerId)) {
        canvas.setPointerCapture(e.pointerId);
        canvas.classList.add('dragging');
      }
      // På berøringsskjerm ruller loddrett sveip siden (touch-action: pan-y).
      const pitch = e.pointerType === 'touch' ? 0 : dy * 0.005;
      rig.rotate(-dx * 0.006, pitch);
      needsRender = true;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart > 0 && d > 0) {
        rig.zoomBy(pinchStart / d);
        pinchStart = d;
        needsRender = true;
      }
    }
  });
  const end = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    canvas.classList.remove('dragging');
    if (e.type === 'pointerup' && pointers.size === 0 && downAt.moved < 7 && performance.now() - downAt.t < 600) {
      const part = pick(e.clientX, e.clientY);
      if (part) app.selectPart(part);
    }
    if (pointers.size < 2) pinchStart = 0;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') canvas.classList.remove('hovering');
  });
  // Knip på styreflate kommer som hjul med ctrl. Vanlig hjul ruller siden.
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      rig.zoomBy(Math.exp(e.deltaY * 0.01));
      needsRender = true;
    },
    { passive: false },
  );

  // ---------- Hendelser fra fysiologien ----------
  app.events.on('wristPulse', (s) => wrist.pulse(s));
  app.events.on('invalidate', () => (needsRender = true));
  app.phys.onPauseChange(() => (needsRender = true));

  let flow = 0;
  let flowArm = 0;
  const ages = vesselMat.uniforms.uAge.value as number[];
  const amps = vesselMat.uniforms.uAmp.value as number[];
  const wallDist = arteries.rightSubclavian.distAt(0.62);

  const animate = (simDt: number) => {
    const phys = app.phys;
    const recent = phys.recentBeats(MAX_BEATS);
    for (let i = 0; i < MAX_BEATS; i++) {
      ages[i] = recent[i]?.age ?? 100;
      amps[i] = Math.min(1.7, Math.max(0.45, recent[i]?.amp ?? 0));
    }
    const c = phys.current;
    const pRoot = phys.pressureAt(phys.time);
    const sysFactor = Math.max(0, Math.min(1, (pRoot - c.dia) / Math.max(c.sys - c.dia, 1)));
    const v = 0.42 + 1.05 * sysFactor;
    flow += v * simDt;
    const open = app.cuffPressure > 1 ? app.cuffOpen * app.cuffTransmission : 1;
    flowArm += v * simDt * open;
    vesselMat.uniforms.uFlow.value = flow % 1000;
    vesselMat.uniforms.uFlowArm.value = flowArm % 1000;
    vesselMat.uniforms.uCuffOpen.value = app.cuffOpen;
    vesselMat.uniforms.uCuffPass.value = app.cuffTransmission;
    heart?.update(phys.ventricles(), phys.atria());
    cuff.setInflation(app.cuffPressure);
    const pWall = pressureAtDistance(wallDist);
    const wallFlow = Math.max(0, Math.min(1, (pWall - c.dia) / Math.max(c.sys - c.dia, 1)));
    wall.update(simDt, pWall, c.sys, c.dia, wallFlow);
  };

  // ---------- Hjertet ----------
  let heart: Awaited<ReturnType<typeof loadHeart>> | null = null;
  el.status.textContent = 'Laster 3D-modellen av hjertet';
  loadHeart((f) => {
    el.status.textContent = `Laster 3D-modellen av hjertet, ${Math.round(f * 100)} prosent`;
  })
    .then((h) => {
      heart = h;
      heartGroup = h.group;
      scene.add(h.group);
      pickables.push(...h.pickables);
      el.status.hidden = true;
      needsRender = true;
    })
    .catch((err) => {
      console.warn('Kunne ikke laste hjertemodellen', err);
      el.status.textContent = 'Hjertemodellen kunne ikke lastes. Resten av modellen virker.';
    });
  el.status.hidden = false;

  // ---------- Tegning ----------
  animate(0);
  app.events.on('frame', ({ dt, simDt }) => {
    if (!visible) return;
    const moving = rig.update(dt);
    if (simDt > 0 || needsRender) animate(simDt);
    const rippling = wrist.update(simDt);
    if (simDt > 0 || moving || needsRender || rippling) {
      renderer.render(scene, camera);
      labels.update(camera, width, height, keepClear);
      needsRender = false;
    }
  });

  // Til testing: les tilstanden fra konsollen.
  const w = window as unknown as { __puls?: Record<string, unknown> };
  w.__puls = { ...(w.__puls ?? {}), rig, renderer, scene, camera };
}
