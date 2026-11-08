// Felles fysiologisk tilstand. Én kilde styrer både 3D-modellen og monitoren.
//
// Modellen har en hjerteslagsklokke. Hvert slag lagres med egne verdier,
// slik at trykkurven kan regnes ut for et hvilket som helst tidspunkt i
// historikken. Verdiene glir mykt mot målene som settes fra glidebryterne.

export interface Vitals {
  hr: number;
  sys: number;
  dia: number;
}

export interface Beat {
  /** Simuleringstid da kamrene begynte å trekke seg sammen (s). */
  t: number;
  /** Planlagt varighet av slaget (s). */
  period: number;
  /** Varighet av systole (s). */
  ts: number;
  sys: number;
  dia: number;
  /** Trykket da slaget startet, så kurven blir sammenhengende. */
  p0: number;
}

export const LIMITS = {
  hr: { min: 40, max: 180 },
  sys: { min: 90, max: 200 },
  dia: { min: 50, max: 120 },
  /** Minste avstand mellom systolisk og diastolisk trykk. */
  gap: 20,
} as const;

/** Bølgefarten i 3D-modellen, bremset ned så den synes (enheter per sekund). */
export const WAVE_SPEED = 8.5;

/** Systole varer ca. 0,3 s og blir litt kortere ved høy puls. */
export function systoleDuration(hr: number): number {
  return clamp(0.3 - 0.0006 * (hr - 66), 0.22, 0.32);
}

/**
 * Arterietrykket i et slag, ved tiden tau etter at slaget startet.
 * Rask stigning, avrundet topp, dikrotisk innsnitt og eksponentielt fall
 * mot diastolisk trykk.
 */
export function beatPressure(b: Beat, tau: number): number {
  const { period: T, ts: Ts, sys: Ps, dia: Pd, p0: P0 } = b;
  const pp = Ps - Pd;
  const tu = 0.36 * Ts; // stigetid
  const Pn = Pd + 0.6 * pp; // trykket ved innsnittet
  let p: number;
  if (tau <= 0) {
    p = P0;
  } else if (tau < tu) {
    const x = tau / tu;
    p = P0 + (Ps - P0) * (1 - (1 - x) * (1 - x));
  } else if (tau < Ts) {
    const x = (tau - tu) / (Ts - tu);
    p = Ps - (Ps - Pn) * x * x;
  } else {
    const dur = Math.max(T - Ts, 0.05);
    const x = clamp((tau - Ts) / dur, 0, 1);
    const k = 2.4;
    const g = (Math.exp(-k * x) - Math.exp(-k)) / (1 - Math.exp(-k));
    p = Pd + (Pn - Pd) * g;
  }
  // Dikrotisk innsnitt og en liten tilbakebølge når aortaklaffen lukkes.
  const s = clamp((T - Ts) / 0.45, 0.45, 1);
  const dn = (tau - Ts) / (0.022 * s);
  const dr = (tau - Ts - 0.06 * s) / (0.04 * s);
  p += -0.075 * pp * Math.exp(-dn * dn) + 0.055 * pp * Math.exp(-dr * dr);
  return p;
}

/** Hvor sterkt kamrene er trukket sammen (0 til 1), tau sekunder inn i slaget. */
export function ventricularContraction(b: Beat, tau: number): number {
  const d = b.ts * 1.12;
  if (tau < 0 || tau > d) return 0;
  const x = tau / d;
  // Rask sammentrekning, litt langsommere avslapning.
  return Math.sin(Math.PI * Math.pow(x, 0.75));
}

type BeatListener = (beat: Beat) => void;

export class Physiology {
  readonly target: Vitals = { hr: 66, sys: 116, dia: 68 };
  readonly current: Vitals = { hr: 66, sys: 116, dia: 68 };
  /** Simuleringstid i sekunder. Står stille ved pause. */
  time = 0;
  paused = false;
  readonly beats: Beat[] = [];
  private phase = 0.38;
  private listeners = new Set<BeatListener>();
  private pauseListeners = new Set<(paused: boolean) => void>();

  constructor() {
    // Lag en kort historikk, så kurven og bølgene er på plass fra start.
    const { hr, sys, dia } = this.current;
    const period = 60 / hr;
    for (let i = 7; i >= 0; i--) {
      this.beats.push({ t: -(i + this.phase) * period, period, ts: systoleDuration(hr), sys, dia, p0: dia });
    }
  }

  onBeat(fn: BeatListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onPauseChange(fn: (paused: boolean) => void): () => void {
    this.pauseListeners.add(fn);
    return () => this.pauseListeners.delete(fn);
  }

  setPaused(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    for (const fn of this.pauseListeners) fn(p);
  }

  /** Setter nye mål. Holder alltid minst 20 mmHg mellom trykkene. */
  setTarget(v: Partial<Vitals>, anchor: keyof Vitals | null = null): Vitals {
    const t = this.target;
    if (v.hr !== undefined) t.hr = clamp(Math.round(v.hr), LIMITS.hr.min, LIMITS.hr.max);
    if (v.sys !== undefined) t.sys = clamp(Math.round(v.sys), LIMITS.sys.min, LIMITS.sys.max);
    if (v.dia !== undefined) t.dia = clamp(Math.round(v.dia), LIMITS.dia.min, LIMITS.dia.max);
    if (t.sys - t.dia < LIMITS.gap) {
      if (anchor === 'dia') {
        t.sys = t.dia + LIMITS.gap;
        if (t.sys > LIMITS.sys.max) {
          t.sys = LIMITS.sys.max;
          t.dia = t.sys - LIMITS.gap;
        }
      } else {
        t.dia = t.sys - LIMITS.gap;
        if (t.dia < LIMITS.dia.min) {
          t.dia = LIMITS.dia.min;
          t.sys = t.dia + LIMITS.gap;
        }
      }
    }
    return { ...t };
  }

  /** Hopper rett til målverdiene, uten å gli. */
  snapToTarget(): void {
    Object.assign(this.current, this.target);
  }

  update(dt: number): void {
    if (this.paused) return;
    dt = Math.min(dt, 0.1);
    // Myk overgang mot målene, tidskonstant ca. 1,1 s.
    const k = 1 - Math.exp(-dt / 1.1);
    const c = this.current;
    c.hr += (this.target.hr - c.hr) * k;
    c.sys += (this.target.sys - c.sys) * k;
    c.dia += (this.target.dia - c.dia) * k;

    this.time += dt;
    this.phase += (dt * c.hr) / 60;
    if (this.phase >= 1) {
      this.phase -= 1;
      const period = 60 / c.hr;
      const t = this.time - this.phase * period;
      const beat: Beat = {
        t,
        period,
        ts: systoleDuration(c.hr),
        sys: c.sys,
        dia: c.dia,
        p0: this.pressureAt(t),
      };
      this.beats.push(beat);
      if (this.beats.length > 40) this.beats.shift();
      for (const fn of this.listeners) fn(beat);
    }
  }

  /** Slaget som pågikk ved tiden t. */
  beatAt(t: number): Beat | undefined {
    for (let i = this.beats.length - 1; i >= 0; i--) {
      if (this.beats[i].t <= t) return this.beats[i];
    }
    return this.beats[0];
  }

  /** Arterietrykket (mmHg) ved simuleringstiden t. */
  pressureAt(t: number): number {
    const b = this.beatAt(t);
    if (!b) return this.current.dia;
    return beatPressure(b, t - b.t);
  }

  get lastBeat(): Beat {
    return this.beats[this.beats.length - 1];
  }

  /** Tid til neste slag, med dagens puls. */
  timeToNextBeat(): number {
    return ((1 - this.phase) * 60) / this.current.hr;
  }

  /** Kamrenes sammentrekning nå (0 til 1). */
  ventricles(): number {
    const b = this.lastBeat;
    return ventricularContraction(b, this.time - b.t);
  }

  /** Forkamrenes sammentrekning, like før kamrene (0 til 1). */
  atria(): number {
    const x = (this.timeToNextBeat() - 0.08) / 0.05;
    return Math.exp(-x * x);
  }

  /** Alder (s) og styrke for de seks siste slagene, nyeste først. */
  recentBeats(n = 6): { age: number; amp: number }[] {
    const out: { age: number; amp: number }[] = [];
    for (let i = this.beats.length - 1; i >= 0 && out.length < n; i--) {
      const b = this.beats[i];
      out.push({ age: this.time - b.t, amp: (b.sys - b.dia) / 48 });
    }
    return out;
  }
}

export function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

// ---------- Klassifisering ----------

export type Tone = 'low' | 'normal' | 'elevated' | 'high';

export interface Classification {
  label: string;
  tone: Tone;
}

/** Hvilepuls: lav under 60, normal 60 til 100, høy over 100. */
export function classifyHr(hr: number): Classification {
  const r = Math.round(hr);
  if (r < 60) return { label: 'Lav hvilepuls', tone: 'low' };
  if (r > 100) return { label: 'Høy hvilepuls', tone: 'high' };
  return { label: 'Normal hvilepuls', tone: 'normal' };
}

/**
 * Blodtrykk etter ESC 2024. Lavt under 90/60.
 * Ikke forhøyet under 120/70, forhøyet 120 til 139 eller 70 til 89,
 * høyt fra 140/90.
 */
export function classifyBp(sys: number, dia: number): Classification {
  const s = Math.round(sys);
  const d = Math.round(dia);
  if (s >= 140 || d >= 90) return { label: 'Høyt blodtrykk', tone: 'high' };
  if (s < 90 || d < 60) return { label: 'Lavt blodtrykk', tone: 'low' };
  if (s >= 120 || d >= 70) return { label: 'Forhøyet blodtrykk', tone: 'elevated' };
  return { label: 'Ikke forhøyet', tone: 'normal' };
}
