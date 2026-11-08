// Monitoren: trykkurven på et rullende EKG-rutenett, med klammer for puls og
// blodtrykk.

import { num } from './format';
import { app } from './store';
import { cssVar, onThemeChange } from './theme';

interface Colors {
  paper: string;
  minor: string;
  major: string;
  curve: string;
  pulse: string;
  bp: string;
  muted: string;
}

const P_MIN = 30;
const P_MAX = 215;

export class Monitor {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private visible = true;
  private dirty = true;
  private colors!: Colors;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D er ikke tilgjengelig');
    this.ctx = ctx;
    this.readColors();
    onThemeChange(() => {
      this.readColors();
      this.dirty = true;
    });
    new ResizeObserver(() => this.resize()).observe(canvas);
    new IntersectionObserver((entries) => {
      this.visible = entries[0]?.isIntersecting ?? true;
      if (this.visible) this.dirty = true;
    }).observe(canvas);
    document.fonts?.ready.then(() => (this.dirty = true));
    this.resize();
  }

  private readColors(): void {
    this.colors = {
      paper: cssVar('--monitor-paper'),
      minor: cssVar('--monitor-grid-minor'),
      major: cssVar('--monitor-grid-major'),
      curve: cssVar('--monitor-curve'),
      pulse: cssVar('--pulse'),
      bp: cssVar('--bp'),
      muted: cssVar('--muted'),
    };
  }

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.dirty = true;
  }

  invalidate(): void {
    this.dirty = true;
  }

  frame(simDt: number): void {
    if (!this.visible) return;
    if (simDt === 0 && !this.dirty) return;
    this.dirty = false;
    this.draw();
  }

  private draw(): void {
    const { ctx, w, h, colors } = this;
    const phys = app.phys;
    const now = phys.time;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const narrow = w < 520;
    const left = narrow ? 34 : 44;
    const right = w - (narrow ? 74 : 104);
    const top = narrow ? 46 : 52;
    const bottom = h - 16;
    const plotW = right - left;
    const windowSec = Math.min(7, Math.max(3.4, plotW / 125));
    const pxPerSec = plotW / windowSec;
    const y = (p: number) => bottom - ((p - P_MIN) / (P_MAX - P_MIN)) * (bottom - top);

    // Papir og rutenett. De loddrette linjene ruller med tiden.
    ctx.fillStyle = colors.paper;
    ctx.fillRect(0, 0, w, h);
    const minor = 8;
    const major = 40;
    const shift = (now * pxPerSec) % major;
    ctx.lineWidth = 1;
    for (let pass = 0; pass < 2; pass++) {
      const step = pass === 0 ? minor : major;
      ctx.strokeStyle = pass === 0 ? colors.minor : colors.major;
      ctx.beginPath();
      for (let x = -shift % step; x <= w; x += step) {
        const xx = Math.round(x) + 0.5;
        ctx.moveTo(xx, 0);
        ctx.lineTo(xx, h);
      }
      for (let yy = h; yy >= 0; yy -= step) {
        const y0 = Math.round(yy) + 0.5;
        ctx.moveTo(0, y0);
        ctx.lineTo(w, y0);
      }
      ctx.stroke();
    }

    // Akse med mmHg.
    ctx.font = `500 ${narrow ? 10 : 11}px 'IBM Plex Mono', ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (let p = 40; p <= 200; p += 40) {
      ctx.fillStyle = colors.muted;
      ctx.fillText(String(p), left - 6, y(p));
    }
    ctx.textAlign = 'left';
    ctx.fillText('mmHg', 6, top - 18);

    const cur = phys.current;
    const ySys = y(cur.sys);
    const yDia = y(cur.dia);

    // Hjelpelinjer for systolisk og diastolisk trykk.
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = colors.bp;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(left, ySys);
    ctx.lineTo(right + 10, ySys);
    ctx.moveTo(left, yDia);
    ctx.lineTo(right + 10, yDia);
    ctx.stroke();
    ctx.restore();

    // Kurven.
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, 0, plotW + 2, h);
    ctx.clip();
    ctx.strokeStyle = colors.curve;
    ctx.lineWidth = narrow ? 2 : 2.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const step = 1.5;
    for (let x = left; x <= right; x += step) {
      const t = now - (right - x) / pxPerSec;
      const yy = y(phys.pressureAt(t));
      if (x === left) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    ctx.restore();

    // Punktet som skriver kurven.
    const pNow = phys.pressureAt(now);
    ctx.fillStyle = colors.curve;
    ctx.beginPath();
    ctx.arc(right, y(pNow), 4, 0, Math.PI * 2);
    ctx.fill();

    // Etiketter for linjene.
    ctx.font = `500 ${narrow ? 10 : 11}px 'IBM Plex Mono', ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.fillStyle = colors.bp;
    ctx.textBaseline = 'bottom';
    this.haloText('systolisk', left + 6, ySys - 3);
    ctx.textBaseline = 'top';
    this.haloText('diastolisk', left + 6, yDia + 3);

    // Vannrett klamme mellom de to siste toppene: tid per slag og puls.
    const peaks: number[] = [];
    for (let i = phys.beats.length - 1; i >= 0 && peaks.length < 2; i--) {
      const b = phys.beats[i];
      const tp = b.t + 0.36 * b.ts;
      if (tp <= now && tp >= now - windowSec) peaks.unshift(tp);
    }
    if (peaks.length === 2) {
      const x1 = right - (now - peaks[0]) * pxPerSec;
      const x2 = right - (now - peaks[1]) * pxPerSec;
      const yb = Math.max(top - 14, 22);
      const dt = peaks[1] - peaks[0];
      ctx.strokeStyle = colors.pulse;
      ctx.fillStyle = colors.pulse;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x1, yb + 7);
      ctx.lineTo(x1, yb);
      ctx.lineTo(x2, yb);
      ctx.lineTo(x2, yb + 7);
      ctx.stroke();
      // Tynne linjer ned til toppene.
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, yb + 7);
      ctx.lineTo(x1, y(phys.pressureAt(peaks[0])) - 4);
      ctx.moveTo(x2, yb + 7);
      ctx.lineTo(x2, y(phys.pressureAt(peaks[1])) - 4);
      ctx.stroke();
      ctx.restore();
      const label = `${num(dt, 2)} s = ${Math.round(60 / dt)} slag/min`;
      ctx.font = `600 ${narrow ? 11 : 12}px 'IBM Plex Mono', ui-monospace, monospace`;
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'center';
      const tw = ctx.measureText(label).width;
      // Hold teksten unna pauseknappen oppe til høyre.
      const cx = Math.min(Math.max((x1 + x2) / 2, left + 40 + tw / 2), w - 60 - tw / 2);
      this.haloText(label, cx, yb - 4);
    }

    // Loddrett klamme fra diastolisk til systolisk: blodtrykket.
    const xb = right + 14;
    ctx.strokeStyle = colors.bp;
    ctx.fillStyle = colors.bp;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(xb - 7, ySys);
    ctx.lineTo(xb, ySys);
    ctx.lineTo(xb, yDia);
    ctx.lineTo(xb - 7, yDia);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const mid = (ySys + yDia) / 2;
    ctx.font = `700 ${narrow ? 13 : 15}px 'Schibsted Grotesk Variable', system-ui, sans-serif`;
    this.haloText(`${Math.round(cur.sys)}/${Math.round(cur.dia)}`, xb + 7, mid - 8);
    ctx.font = `500 ${narrow ? 10 : 11}px 'IBM Plex Mono', ui-monospace, monospace`;
    this.haloText('mmHg', xb + 7, mid + 9);
  }

  /** Tekst med en ring av papirfarge rundt, så den kan leses over rutenettet. */
  private haloText(text: string, x: number, y: number): void {
    const { ctx } = this;
    const fill = ctx.fillStyle;
    ctx.save();
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.colors.paper;
    ctx.strokeText(text, x, y);
    ctx.restore();
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }
}
