// Liten felles tilstand for siden: fysiologi, valgt del og hendelser.

import type { PartId } from './content';
import { Physiology, WAVE_SPEED, type Beat } from './physiology';

type Handler<T> = (value: T) => void;

class Emitter<E extends Record<string, unknown>> {
  private handlers: { [K in keyof E]?: Set<Handler<E[K]>> } = {};
  on<K extends keyof E>(key: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers[key];
    if (!set) {
      set = new Set();
      this.handlers[key] = set;
    }
    set.add(fn);
    return () => set.delete(fn);
  }
  emit<K extends keyof E>(key: K, value: E[K]): void {
    const set = this.handlers[key];
    if (set) for (const fn of set) fn(value);
  }
}

export interface FrameInfo {
  /** Sanntid siden forrige bilde (s). */
  dt: number;
  /** Simuleringstid som gikk i dette bildet (s). Null ved pause. */
  simDt: number;
}

export interface AppEvents extends Record<string, unknown> {
  part: PartId;
  frame: FrameInfo;
  /** Pulsbølgen nådde håndleddet. Verdien er styrken (0 til 1). */
  wristPulse: number;
  /** Korotkoff-lyd under måling. Verdien er mansjettrykket. */
  korotkoff: number;
  /** Noe i scenen må tegnes på nytt selv om animasjonen står. */
  invalidate: void;
}

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

export const app = {
  phys: new Physiology(),
  part: 'oversikt' as PartId,
  events: new Emitter<AppEvents>(),
  reducedMotion: reducedMotionQuery.matches,
  /**
   * Avstander langs arteriene fra hjertet (scenenheter). Settes av 3D-scenen
   * når geometrien er bygget. Standardverdiene gjelder før det.
   */
  geometry: {
    cuffStart: 6.6,
    cuffEnd: 8.2,
    wristDist: 14.6,
  },
  /** Hvor mye pulsbølgen slipper forbi mansjetten (0 til 1). */
  cuffTransmission: 1,
  /** Hvor åpen arterien under mansjetten er akkurat nå (0 til 1). */
  cuffOpen: 1,
  /** Mansjettrykket i mmHg. */
  cuffPressure: 0,

  selectPart(id: PartId): void {
    if (this.part === id) return;
    this.part = id;
    this.events.emit('part', id);
  },
};

reducedMotionQuery.addEventListener('change', (e) => {
  app.reducedMotion = e.matches;
});

/** Trykket som når et punkt langs arterien, forsinket av bølgefarten. */
export function pressureAtDistance(dist: number, t = app.phys.time): number {
  return app.phys.pressureAt(t - dist / WAVE_SPEED);
}

/** Slag der bølgefronten passerte avstanden dist i tidsrommet (t0, t1]. */
export function wavesCrossing(dist: number, t0: number, t1: number): Beat[] {
  const out: Beat[] = [];
  const delay = dist / WAVE_SPEED;
  for (const b of app.phys.beats) {
    const arrive = b.t + delay;
    if (arrive > t0 && arrive <= t1) out.push(b);
  }
  return out;
}
