// Pulstelling ved håndleddet: tell slagene i 15 sekunder og gang med 4.

import { app } from './store';

export const COUNT_SECONDS = 15;

export class PulseCounter {
  running = false;
  elapsed = 0;
  count = 0;
  result: { count: number; bpm: number; actual: number } | null = null;
  private listeners = new Set<(tick: boolean) => void>();

  constructor() {
    app.events.on('wristPulse', (strength) => {
      if (!this.running || strength < 0.2) return;
      this.count++;
      this.changed(true);
    });
  }

  onChange(fn: (tick: boolean) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(tick = false): void {
    for (const fn of this.listeners) fn(tick);
  }

  start(): void {
    this.running = true;
    this.elapsed = 0;
    this.count = 0;
    this.result = null;
    this.changed();
  }

  stop(): void {
    this.running = false;
    this.changed();
  }

  update(simDt: number): void {
    if (!this.running || simDt <= 0) return;
    this.elapsed += simDt;
    if (this.elapsed >= COUNT_SECONDS) {
      this.elapsed = COUNT_SECONDS;
      this.running = false;
      this.result = { count: this.count, bpm: this.count * 4, actual: Math.round(app.phys.current.hr) };
      this.changed();
    }
  }
}

export const counter = new PulseCounter();
