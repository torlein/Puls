// Etiketter som følger delene på skjermen. De er knapper, så de kan brukes med
// tastatur, og de flyttes så de ikke dekker hverandre.

import { Vector3, type PerspectiveCamera } from 'three';
import type { PartId } from '../content';
import { app } from '../store';

export type Side = 'left' | 'right' | 'up' | 'down';

export interface LabelDef {
  id: string;
  text: string;
  num?: string;
  part?: PartId;
  anchor: () => Vector3;
  side: Side;
  /** Vis bare når en bestemt del er valgt. */
  only?: PartId;
}

interface LabelState {
  def: LabelDef;
  el: HTMLElement;
  w: number;
  h: number;
  line: SVGLineElement;
  dot: SVGCircleElement;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const GAP = 24;
const MARGIN = 8;

export class Labels {
  private states: LabelState[] = [];
  private svg: SVGSVGElement;
  private v = new Vector3();

  constructor(root: HTMLElement, defs: LabelDef[]) {
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('aria-hidden', 'true');
    root.append(this.svg);
    for (const def of defs) {
      let el: HTMLElement;
      if (def.part) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'label';
        b.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-label', `Vis ${def.text.toLowerCase()}`);
        const part = def.part;
        b.addEventListener('click', () => app.selectPart(part));
        el = b;
      } else {
        el = document.createElement('span');
        el.className = 'label sub';
        el.setAttribute('aria-hidden', 'true');
      }
      el.textContent = def.text;
      if (def.num) el.dataset.num = def.num;
      root.append(el);
      const line = document.createElementNS(SVG_NS, 'line');
      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('r', '3.5');
      this.svg.append(line, dot);
      this.states.push({ def, el, w: 0, h: 0, line, dot });
    }
    this.measure();
    document.fonts?.ready.then(() => this.measure());
  }

  measure(): void {
    for (const s of this.states) {
      s.w = s.el.offsetWidth;
      s.h = s.el.offsetHeight;
    }
  }

  /**
   * obstacles er punkter i modellen som etikettene ikke bør dekke, som midten
   * av hjertet og mansjetten.
   */
  update(camera: PerspectiveCamera, width: number, height: number, obstacleWorld: Vector3[] = []): void {
    const part = app.part;
    const obstacles = [...obstacleWorld, ...this.states.filter((s) => !s.def.only || s.def.only === part).map((s) => s.def.anchor())]
      .map((p) => p.clone().project(camera))
      .filter((p) => p.z < 1)
      .map((p) => ({ x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height, r: 14 }));
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const bottomLimit = height - (width < 520 ? 64 : 62);
    // Valgt del først, så den får best plass.
    const order = [...this.states].sort((a, b) => Number(b.def.part === part) - Number(a.def.part === part));
    for (const s of order) {
      const { def, el } = s;
      const show = !def.only || def.only === part;
      this.v.copy(def.anchor()).project(camera);
      const sx = (this.v.x * 0.5 + 0.5) * width;
      const sy = (-this.v.y * 0.5 + 0.5) * height;
      const inView = this.v.z < 1 && sx > -10 && sx < width + 10 && sy > -10 && sy < height + 10;
      if (!show || !inView) {
        el.classList.add('hidden');
        s.line.style.display = 'none';
        s.dot.style.display = 'none';
        continue;
      }
      el.classList.remove('hidden');
      s.line.style.display = '';
      s.dot.style.display = '';
      if (def.part) {
        el.setAttribute('aria-pressed', String(def.part === part));
        el.classList.toggle('dim', part !== 'oversikt' && def.part !== part);
      }
      if (!s.w) this.measure();
      const { w, h } = s;
      // Prøv flere sider og velg den som dekker minst av andre etiketter og av modellen.
      const others = obstacles.filter((o) => Math.hypot(o.x - sx, o.y - sy) > 4);
      let best = { x: 0, y: 0, score: Infinity };
      for (const side of candidates(def.side)) {
        const pos = place(sx, sy, w, h, side);
        const x = clamp(pos.x, MARGIN, width - w - MARGIN);
        const y = clamp(pos.y, MARGIN, bottomLimit - h);
        let score = (Math.abs(x - pos.x) + Math.abs(y - pos.y)) * 3;
        for (const r of placed) {
          const ox = Math.max(0, Math.min(x + w, r.x + r.w) - Math.max(x, r.x) + 6);
          const oy = Math.max(0, Math.min(y + h, r.y + r.h) - Math.max(y, r.y) + 6);
          if (ox > 6 && oy > 6) score += ox * oy * 4;
        }
        // Etiketten skal ikke dekke sitt eget punkt eller andre viktige punkter.
        if (sx > x - 6 && sx < x + w + 6 && sy > y - 6 && sy < y + h + 6) score += 2000;
        for (const o of others) {
          if (o.x > x - o.r && o.x < x + w + o.r && o.y > y - o.r && o.y < y + h + o.r) score += 900;
        }
        if (score < best.score) best = { x, y, score };
      }
      let x = best.x;
      let y = best.y;
      const pos = { x, y };
      // Skyv etiketten loddrett til den ikke overlapper noen som alt er plassert.
      for (let iter = 0; iter < 8; iter++) {
        const hit = placed.find((r) => x < r.x + r.w + 4 && x + w + 4 > r.x && y < r.y + r.h + 4 && y + h + 4 > r.y);
        if (!hit) break;
        const down = hit.y + hit.h + 6;
        const up = hit.y - h - 6;
        y = down + h <= bottomLimit && (Math.abs(down - pos.y) <= Math.abs(up - pos.y) || up < MARGIN) ? down : up;
        y = clamp(y, MARGIN, bottomLimit - h);
      }
      x = clamp(x, MARGIN, width - w - MARGIN);
      placed.push({ x, y, w, h });
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      // Linje fra punktet til nærmeste kant av etiketten.
      const ex = clamp(sx, x, x + w);
      const ey = clamp(sy, y, y + h);
      s.line.setAttribute('x1', sx.toFixed(1));
      s.line.setAttribute('y1', sy.toFixed(1));
      s.line.setAttribute('x2', ex.toFixed(1));
      s.line.setAttribute('y2', ey.toFixed(1));
      s.dot.setAttribute('cx', sx.toFixed(1));
      s.dot.setAttribute('cy', sy.toFixed(1));
    }
  }
}

function candidates(side: Side): Side[] {
  switch (side) {
    case 'left':
      return ['left', 'up', 'down', 'right'];
    case 'right':
      return ['right', 'up', 'down', 'left'];
    case 'up':
      return ['up', 'right', 'left', 'down'];
    case 'down':
      return ['down', 'right', 'left', 'up'];
  }
}

function place(sx: number, sy: number, w: number, h: number, side: Side): { x: number; y: number } {
  switch (side) {
    case 'left':
      return { x: sx - GAP - w, y: sy - h / 2 };
    case 'right':
      return { x: sx + GAP, y: sy - h / 2 };
    case 'up':
      return { x: sx - w / 2, y: sy - GAP - h };
    case 'down':
      return { x: sx - w / 2, y: sy + GAP };
  }
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(Math.max(v, a), Math.max(a, b));
}
