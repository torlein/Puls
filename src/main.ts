import '@fontsource-variable/schibsted-grotesk/wght.css';
import '@fontsource-variable/newsreader/wght.css';
import '@fontsource-variable/newsreader/wght-italic.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles.css';

import { initControls } from './controls';
import { counter } from './counter';
import { initHero } from './hero';
import { cuff } from './measurement';
import { Monitor } from './monitor';
import { initPanel } from './panel';
import { app, wavesCrossing } from './store';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const phys = app.phys;

// Ved redusert bevegelse starter animasjonen på pause.
if (app.reducedMotion) phys.setPaused(true);

const hero = initHero();
const controls = initControls();
const panel = initPanel($('part-tabs'), $('part-panel'));
const monitor = new Monitor($<HTMLCanvasElement>('monitor-canvas'));

// To pauseknapper, én tilstand.
const pauseButtons = [$<HTMLButtonElement>('btn-pause'), $<HTMLButtonElement>('btn-pause-monitor')];
const syncPause = (paused: boolean) => {
  for (const b of pauseButtons) {
    b.setAttribute('aria-pressed', String(paused));
    b.setAttribute('aria-label', paused ? 'Spill av animasjonen' : 'Pause animasjonen');
    b.title = paused ? 'Spill av' : 'Pause';
  }
  monitor.invalidate();
};
phys.onPauseChange(syncPause);
syncPause(phys.paused);
for (const b of pauseButtons) b.addEventListener('click', () => phys.setPaused(!phys.paused));

app.events.on('invalidate', () => monitor.invalidate());

// ---------- Hovedløkken ----------
let last = performance.now();
let uiClock = 0;
function loop(now: number) {
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
  last = now;
  const t0 = phys.time;
  phys.update(dt);
  const simDt = phys.time - t0;
  cuff.update(simDt);
  counter.update(simDt);
  if (simDt > 0) {
    for (const b of wavesCrossing(app.geometry.wristDist, t0, phys.time)) {
      const strength = app.cuffTransmission * Math.min(1, (b.sys - b.dia) / 36);
      app.events.emit('wristPulse', strength);
    }
  }
  hero.frame();
  monitor.frame(simDt);
  uiClock += dt;
  if (uiClock > 0.1 || simDt === 0) {
    uiClock = 0;
    controls.update();
    panel.update();
  }
  app.events.emit('frame', { dt, simDt });
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Til testing: gjør tilstanden tilgjengelig fra konsollen.
(window as unknown as { __puls?: Record<string, unknown> }).__puls = { app, cuff, counter };

// ---------- 3D-scenen lastes for seg ----------
const status = $('stage-status');
import('./scene/index')
  .then(({ initScene }) =>
    initScene({
      stage: $('stage'),
      canvas: $<HTMLCanvasElement>('scene'),
      labels: $('labels'),
      status,
      overview: $<HTMLButtonElement>('btn-overview'),
      zoomIn: $<HTMLButtonElement>('btn-zoom-in'),
      zoomOut: $<HTMLButtonElement>('btn-zoom-out'),
    }),
  )
  .catch((err) => {
    console.warn('3D-scenen kunne ikke startes', err);
    status.textContent = '3D-visningen kunne ikke startes. Panelet og monitoren virker likevel.';
  });
