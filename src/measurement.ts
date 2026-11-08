// Blodtrykksmåling med mansjett. Simulerer oppblåsing, gradvis tømming,
// Korotkoff-lyder og avlesning. Styrer også hvor mye pulsbølgen slipper forbi
// mansjetten i 3D-modellen.

import { even } from './format';
import { clamp } from './physiology';
import { app, pressureAtDistance, wavesCrossing } from './store';

export type MeasurePhase = 'idle' | 'inflating' | 'hold' | 'deflating' | 'release' | 'done';

/** Tømmehastighet i simuleringen (mmHg per sekund). */
export const DEFLATE_RATE = 4;
const INFLATE_RATE = 45;
const RELEASE_RATE = 40;

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export class CuffMeasurement {
  phase: MeasurePhase = 'idle';
  /** Trykket i mansjetten, uten svingninger. */
  pressure = 0;
  /** Trykket viseren viser, med små svingninger fra pulsen. */
  needle = 0;
  target = 0;
  sounds: number[] = [];
  firstSound: number | null = null;
  lastSound: number | null = null;
  reading: { sys: number; dia: number } | null = null;
  private hold = 0;
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  get running(): boolean {
    return this.phase === 'inflating' || this.phase === 'hold' || this.phase === 'deflating';
  }

  start(): void {
    this.phase = 'inflating';
    this.target = Math.min(280, Math.round((app.phys.current.sys + 30) / 10) * 10);
    this.sounds = [];
    this.firstSound = null;
    this.lastSound = null;
    this.reading = null;
    this.changed();
  }

  stop(): void {
    if (this.phase === 'idle' || this.phase === 'done') return;
    this.phase = 'release';
    this.changed();
  }

  update(simDt: number): void {
    if (simDt <= 0) {
      this.publish();
      return;
    }
    const phys = app.phys;
    const geo = app.geometry;
    const cuffMid = (geo.cuffStart + geo.cuffEnd) / 2;
    switch (this.phase) {
      case 'inflating':
        this.pressure += INFLATE_RATE * simDt;
        if (this.pressure >= this.target) {
          this.pressure = this.target;
          this.phase = 'hold';
          this.hold = 0.7;
          this.changed();
        }
        break;
      case 'hold':
        this.hold -= simDt;
        if (this.hold <= 0) {
          this.phase = 'deflating';
          this.changed();
        }
        break;
      case 'deflating': {
        const t1 = phys.time;
        const t0 = t1 - simDt;
        this.pressure -= DEFLATE_RATE * simDt;
        for (const b of wavesCrossing(cuffMid, t0, t1)) {
          if (this.pressure < b.sys && this.pressure > b.dia) {
            const p = this.pressure;
            this.sounds.push(p);
            if (this.firstSound === null) this.firstSound = p;
            this.lastSound = p;
            app.events.emit('korotkoff', p);
            this.changed();
          } else if (this.firstSound !== null && this.pressure <= b.dia) {
            // Lydene er borte. Det diastoliske trykket er det siste slaget som ble hørt.
            this.reading = { sys: even(this.firstSound), dia: even(this.lastSound ?? this.pressure) };
            this.phase = 'release';
            this.changed();
            break;
          }
        }
        if (this.phase === 'deflating' && this.pressure < 25) {
          if (this.firstSound !== null) {
            this.reading = { sys: even(this.firstSound), dia: even(this.lastSound ?? this.pressure) };
          }
          this.phase = 'release';
          this.changed();
        }
        break;
      }
      case 'release':
        this.pressure -= RELEASE_RATE * simDt;
        if (this.pressure <= 0) {
          this.pressure = 0;
          this.phase = this.reading ? 'done' : 'idle';
          this.changed();
        }
        break;
      default:
        this.pressure = 0;
    }
    this.publish();
  }

  /** Oppdaterer verdiene 3D-scenen leser. */
  private publish(): void {
    const geo = app.geometry;
    const cuffMid = (geo.cuffStart + geo.cuffEnd) / 2;
    const c = app.phys.current;
    const p = this.pressure;
    const local = pressureAtDistance(cuffMid);
    if (p <= 1) {
      app.cuffTransmission = 1;
      app.cuffOpen = 1;
      this.needle = 0;
    } else {
      app.cuffTransmission = clamp((c.sys - p) / Math.max(c.sys - c.dia, 1), 0, 1);
      app.cuffOpen = smoothstep(p - 6, p + 6, local);
      // Små svingninger på viseren, størst rundt middeltrykket.
      const map = c.dia + (c.sys - c.dia) / 3;
      const amp = 3.2 * Math.exp(-(((p - map) / 24) ** 2));
      const shape = (local - c.dia) / Math.max(c.sys - c.dia, 1) - 0.35;
      this.needle = p + amp * shape;
    }
    app.cuffPressure = p;
  }
}

export const cuff = new CuffMeasurement();
