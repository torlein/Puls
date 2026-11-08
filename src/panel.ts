// Panelet ved siden av 3D-modellen: faner, tekst og levende verdier.

import { setSound, soundOn, thump } from './audio';
import { PARTS, type PartId, type PartText } from './content';
import { counter, COUNT_SECONDS } from './counter';
import { bp, num } from './format';
import { cuff, DEFLATE_RATE } from './measurement';
import { classifyBp, classifyHr } from './physiology';
import { app } from './store';

interface View {
  update(): void;
  dispose?(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  if (text !== undefined) e.textContent = text;
  return e;
}

interface LiveItem {
  label: string;
  kind: 'pulse' | 'bp' | 'plain';
  unit?: string;
  value: () => string;
}

function liveList(items: LiveItem[]): { node: HTMLElement; update: () => void } {
  const dl = el('dl', { class: 'live' });
  const dds: HTMLElement[] = [];
  const units: (string | undefined)[] = [];
  for (const item of items) {
    const div = el('div', { class: item.kind });
    div.append(el('dt', {}, item.label));
    const dd = el('dd');
    div.append(dd);
    dl.append(div);
    dds.push(dd);
    units.push(item.unit);
  }
  const last: string[] = [];
  const update = () => {
    items.forEach((item, i) => {
      const v = item.value();
      if (last[i] === v) return;
      last[i] = v;
      dds[i].textContent = v;
      const u = units[i];
      if (u) dds[i].append(el('small', {}, u));
    });
  };
  update();
  return { node: dl, update };
}

function phaseName(): string {
  const b = app.phys.lastBeat;
  return app.phys.time - b.t < b.ts ? 'Systole' : 'Diastole';
}

function pressureNow(): number {
  return app.phys.pressureAt(app.phys.time);
}

// ---------- Manometer ----------

function polar(r: number, mmHg: number): [number, number] {
  const a = ((mmHg - 150) * Math.PI) / 180;
  return [100 + r * Math.sin(a), 100 - r * Math.cos(a)];
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function buildGauge(): { node: SVGSVGElement; needle: SVGLineElement; value: SVGTextElement; sounds: SVGGElement } {
  const s = svg('svg', { viewBox: '0 0 200 200', class: 'gauge', role: 'img', 'aria-label': 'Manometer som viser trykket i mansjetten' });
  s.append(svg('circle', { cx: 100, cy: 100, r: 94, class: 'face' }));
  for (let p = 0; p <= 300; p += 10) {
    const major = p % 50 === 0;
    const [x1, y1] = polar(major ? 76 : 82, p);
    const [x2, y2] = polar(89, p);
    s.append(svg('line', { x1, y1, x2, y2, class: major ? 'tick major' : 'tick' }));
    if (major) {
      const [tx, ty] = polar(64, p);
      const t = svg('text', { x: tx, y: ty });
      t.textContent = String(p);
      s.append(t);
    }
  }
  const sounds = svg('g', {});
  s.append(sounds);
  const unit = svg('text', { x: 100, y: 128, class: 'unit' });
  unit.textContent = 'mmHg';
  s.append(unit);
  const value = svg('text', { x: 100, y: 146, class: 'value' });
  value.textContent = '0';
  s.append(value);
  const needle = svg('line', { x1: 100, y1: 100, x2: 100, y2: 30, class: 'needle' });
  s.append(needle);
  s.append(svg('circle', { cx: 100, cy: 100, r: 5, class: 'hub' }));
  return { node: s, needle, value, sounds };
}

function mansjettView(root: HTMLElement): View {
  const gauge = buildGauge();
  const wrap = el('div', { class: 'gauge-wrap' });
  const status = el('p', { class: 'measure-status', 'aria-live': 'polite' });
  wrap.append(gauge.node, status);

  const row = el('div', { class: 'action-row' });
  const btn = el('button', { type: 'button', class: 'action' });
  const label = el('label', { class: 'check' });
  const box = el('input', { type: 'checkbox' }) as HTMLInputElement;
  box.checked = soundOn;
  box.addEventListener('change', () => setSound(box.checked));
  label.append(box, document.createTextNode('Spill av lydene'));
  row.append(btn, label);

  const note = el(
    'p',
    { class: 'fine' },
    `Her slippes luften ut med ${DEFLATE_RATE} mmHg i sekundet, så du slipper å vente. Anbefalt er 2 mmHg i sekundet. Avlest verdi kan derfor bomme med noen få mmHg.`,
  );
  root.append(row, wrap, note);

  btn.addEventListener('click', () => {
    if (cuff.running) cuff.stop();
    else {
      if (app.phys.paused) app.phys.setPaused(false);
      cuff.start();
    }
  });

  const renderStatus = () => {
    const running = cuff.running;
    btn.textContent = running ? 'Stopp måling' : 'Start måling';
    btn.setAttribute('aria-label', running ? 'Stopp blodtrykksmålingen' : 'Start blodtrykksmåling');
    status.replaceChildren();
    const c = app.phys.current;
    switch (cuff.phase) {
      case 'idle':
        status.append('Trykk på knappen for å måle blodtrykket.');
        break;
      case 'inflating':
        status.append(`Blåser opp mansjetten til ${cuff.target} mmHg.`);
        break;
      case 'hold':
        status.append('Arterien er klemt sammen. Ingen blod slipper forbi, og det er stille.');
        break;
      case 'deflating':
        if (cuff.firstSound === null) status.append('Slipper ut luft og lytter etter lyder.');
        else status.append(`Første lyd ved ${Math.round(cuff.firstSound)} mmHg. Det er det systoliske trykket. Lytter videre.`);
        status.append(el('span', { class: 'bang', 'aria-hidden': 'true' }, 'dunk'));
        break;
      case 'release':
        if (cuff.reading) status.append(`Lydene er borte. Siste lyd var ved ${Math.round(cuff.lastSound ?? 0)} mmHg. Det er det diastoliske trykket.`);
        else status.append('Slipper ut luften.');
        break;
      case 'done':
        if (cuff.reading) {
          status.append('Avlest blodtrykk');
          status.append(el('span', { class: 'reading' }, `${cuff.reading.sys}/${cuff.reading.dia} mmHg`));
          status.append(`Monitoren viser ${bp(c.sys, c.dia)}.`);
        }
        break;
    }
  };

  const drawSounds = () => {
    gauge.sounds.replaceChildren();
    cuff.sounds.forEach((p, i) => {
      const [x1, y1] = polar(84, p);
      const [x2, y2] = polar(95, p);
      const last = i === cuff.sounds.length - 1;
      gauge.sounds.append(svg('line', { x1, y1, x2, y2, class: last ? 'sound flash' : 'sound' }));
    });
  };

  const offChange = cuff.onChange(() => {
    renderStatus();
    drawSounds();
  });
  const offSound = app.events.on('korotkoff', () => {
    drawSounds();
    thump();
    const bang = status.querySelector('.bang');
    if (bang) {
      bang.classList.remove('on');
      void (bang as HTMLElement).offsetWidth;
      bang.classList.add('on');
    }
  });
  renderStatus();
  drawSounds();

  let lastNeedle = -1;
  return {
    update() {
      const p = Math.max(0, cuff.needle);
      if (Math.abs(p - lastNeedle) < 0.05) return;
      lastNeedle = p;
      const [x2, y2] = polar(70, p);
      gauge.needle.setAttribute('x2', x2.toFixed(2));
      gauge.needle.setAttribute('y2', y2.toFixed(2));
      gauge.value.textContent = String(Math.round(cuff.pressure));
    },
    dispose() {
      offChange();
      offSound();
    },
  };
}

// ---------- Teller ved håndleddet ----------

function handleddView(root: HTMLElement): View {
  const box = el('div', { class: 'counter' });
  const numEl = el('div', { class: 'counter-num', 'aria-hidden': 'true' }, '0');
  const right = el('div');
  const progress = el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Tid igjen av tellingen', 'aria-valuemin': '0', 'aria-valuemax': String(COUNT_SECONDS) });
  const bar = el('span');
  progress.append(bar);
  const text = el('p', { class: 'counter-text', 'aria-live': 'polite' });
  right.append(progress, text);
  box.append(numEl, right);
  const row = el('div', { class: 'action-row' });
  const btn = el('button', { type: 'button', class: 'action' });
  row.append(btn);
  root.append(row, box);

  btn.addEventListener('click', () => {
    if (counter.running) counter.stop();
    else {
      if (app.phys.paused) app.phys.setPaused(false);
      counter.start();
    }
  });

  const render = (tick: boolean) => {
    btn.textContent = counter.running ? 'Stopp tellingen' : 'Tell i 15 sekunder';
    btn.setAttribute('aria-label', counter.running ? 'Stopp pulstellingen' : 'Tell pulsslag i 15 sekunder');
    numEl.textContent = String(counter.count);
    if (tick) {
      numEl.classList.remove('tick');
      void numEl.offsetWidth;
      numEl.classList.add('tick');
    }
    text.replaceChildren();
    if (counter.result) {
      const r = counter.result;
      text.append(`${r.count} slag på 15 sekunder. ${r.count} × 4 = `);
      text.append(el('strong', {}, `${r.bpm} slag/min`));
      text.append(`. Monitoren viser ${r.actual}.`);
      if (r.count === 0) text.append(' Mansjetten stoppet pulsbølgen.');
      else if (r.bpm !== r.actual) text.append(' Tellingen gir alltid et tall i firegangen, så den kan bomme litt.');
    } else if (counter.running) {
      text.append('Teller slagene som når håndleddet.');
    } else {
      text.append('Tellingen følger pulsbølgen. Ringen viser hvert slag som når frem.');
    }
  };
  const off = counter.onChange(render);
  render(false);

  let lastShown = -1;
  return {
    update() {
      const e = counter.running || counter.result ? counter.elapsed : 0;
      const pct = (e / COUNT_SECONDS) * 100;
      if (Math.abs(pct - lastShown) < 0.2) return;
      lastShown = pct;
      bar.style.width = `${pct.toFixed(1)}%`;
      progress.setAttribute('aria-valuenow', String(Math.round(e)));
      if (counter.running && app.cuffTransmission < 0.2 && !text.dataset.cuff) {
        text.dataset.cuff = '1';
        text.append(' Mansjetten er blåst opp, så pulsen når ikke frem.');
      }
    },
    dispose: off,
  };
}

// ---------- Delene ----------

function buildView(part: PartText, root: HTMLElement): View {
  root.append(el('p', { class: 'kicker' }, part.kicker));
  root.append(el('h3', { id: 'part-title' }, part.name));
  for (const p of part.paragraphs) root.append(el('p', {}, p));

  const c = () => app.phys.current;
  let live: { node: HTMLElement; update: () => void } | null = null;
  let extra: View | null = null;
  let after: HTMLElement | null = null;

  switch (part.id) {
    case 'oversikt':
      live = liveList([
        { label: 'Puls', kind: 'pulse', unit: 'slag/min', value: () => String(Math.round(c().hr)) },
        { label: 'Blodtrykk', kind: 'bp', unit: 'mmHg', value: () => bp(c().sys, c().dia) },
        { label: 'Hvilepuls', kind: 'plain', value: () => classifyHr(c().hr).label.replace(' hvilepuls', '') },
        { label: 'Kategori', kind: 'plain', value: () => classifyBp(c().sys, c().dia).label },
      ]);
      break;
    case 'hjertet':
      live = liveList([
        { label: 'Puls', kind: 'pulse', unit: 'slag/min', value: () => String(Math.round(c().hr)) },
        { label: 'Tid per slag', kind: 'pulse', unit: 's', value: () => num(60 / c().hr, 2) },
        { label: 'Systole varer', kind: 'plain', unit: 's', value: () => num(app.phys.lastBeat.ts, 2) },
        { label: 'Fase nå', kind: 'plain', value: phaseName },
      ]);
      break;
    case 'aorta':
      live = liveList([
        { label: 'Trykk nå', kind: 'bp', unit: 'mmHg', value: () => String(Math.round(pressureNow())) },
        { label: 'Pulstrykk', kind: 'bp', unit: 'mmHg', value: () => String(Math.round(c().sys - c().dia)) },
        { label: 'Systolisk', kind: 'bp', unit: 'mmHg', value: () => String(Math.round(c().sys)) },
        { label: 'Diastolisk', kind: 'bp', unit: 'mmHg', value: () => String(Math.round(c().dia)) },
      ]);
      break;
    case 'veggen': {
      live = liveList([
        { label: 'Trykk mot veggen', kind: 'bp', unit: 'mmHg', value: () => String(Math.round(pressureNow())) },
        { label: 'Blodtrykk', kind: 'bp', unit: 'mmHg', value: () => bp(c().sys, c().dia) },
      ]);
      const meter = el('div', { class: 'meter', 'aria-hidden': 'true' });
      const fill = el('span');
      meter.append(fill);
      after = meter;
      extra = {
        update() {
          fill.style.width = `${((pressureNow() / 220) * 100).toFixed(1)}%`;
        },
      };
      break;
    }
    case 'mansjetten':
      extra = mansjettView(root);
      live = liveList([
        { label: 'Mansjettrykk', kind: 'bp', unit: 'mmHg', value: () => String(Math.round(cuff.pressure)) },
        { label: 'Monitoren', kind: 'bp', unit: 'mmHg', value: () => bp(c().sys, c().dia) },
      ]);
      break;
    case 'handleddet':
      extra = handleddView(root);
      live = liveList([
        { label: 'Puls', kind: 'pulse', unit: 'slag/min', value: () => String(Math.round(c().hr)) },
        { label: 'Tid per slag', kind: 'pulse', unit: 's', value: () => num(60 / c().hr, 2) },
      ]);
      break;
  }
  if (live) root.append(live.node);
  if (after) root.append(after);
  return {
    update() {
      live?.update();
      extra?.update();
    },
    dispose() {
      extra?.dispose?.();
    },
  };
}

export function initPanel(tabsRoot: HTMLElement, panel: HTMLElement): { update(): void } {
  const tabs = new Map<PartId, HTMLButtonElement>();
  PARTS.forEach((part, i) => {
    const b = el('button', {
      type: 'button',
      class: 'tab',
      role: 'tab',
      id: `tab-${part.id}`,
      'aria-controls': 'part-panel',
      'aria-selected': 'false',
      tabindex: '-1',
    }) as HTMLButtonElement;
    b.textContent = part.name;
    b.dataset.index = String(i);
    b.addEventListener('click', () => app.selectPart(part.id));
    tabs.set(part.id, b);
    tabsRoot.append(b);
  });

  tabsRoot.addEventListener('keydown', (e) => {
    const ids = PARTS.map((p) => p.id);
    const i = ids.indexOf(app.part);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % ids.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ids.length - 1;
    if (next < 0) return;
    e.preventDefault();
    app.selectPart(ids[next]);
    tabs.get(ids[next])?.focus();
  });

  let view: View | null = null;
  const show = (id: PartId) => {
    for (const [pid, b] of tabs) {
      const on = pid === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', `tab-${id}`);
    view?.dispose?.();
    panel.replaceChildren();
    const part = PARTS.find((p) => p.id === id) ?? PARTS[0];
    view = buildView(part, panel);
  };
  app.events.on('part', show);
  show(app.part);

  return {
    update() {
      view?.update();
    },
  };
}
