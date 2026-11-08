// Glidebrytere, situasjoner og tallene som vises flere steder på siden.

import { SCENARIOS } from './content';
import { bp } from './format';
import { classifyBp, classifyHr, type Vitals } from './physiology';
import { app } from './store';

export function initControls(): { update(): void } {
  const sHr = document.getElementById('s-hr') as HTMLInputElement;
  const sSys = document.getElementById('s-sys') as HTMLInputElement;
  const sDia = document.getElementById('s-dia') as HTMLInputElement;
  const oHr = document.getElementById('o-hr') as HTMLOutputElement;
  const oSys = document.getElementById('o-sys') as HTMLOutputElement;
  const oDia = document.getElementById('o-dia') as HTMLOutputElement;
  const list = document.getElementById('scenario-list') as HTMLElement;
  const text = document.getElementById('scenario-text') as HTMLElement;

  const buttons: HTMLButtonElement[] = [];

  const reflect = (t: Vitals) => {
    sHr.value = String(t.hr);
    sSys.value = String(t.sys);
    sDia.value = String(t.dia);
    oHr.textContent = `${t.hr} slag/min`;
    oSys.textContent = `${t.sys} mmHg`;
    oDia.textContent = `${t.dia} mmHg`;
    sHr.setAttribute('aria-valuetext', `${t.hr} slag per minutt`);
    sSys.setAttribute('aria-valuetext', `${t.sys} millimeter kvikksølv`);
    sDia.setAttribute('aria-valuetext', `${t.dia} millimeter kvikksølv`);
    // Marker situasjonen som passer med verdiene, om noen.
    let match: string | null = null;
    for (const s of SCENARIOS) if (s.hr === t.hr && s.sys === t.sys && s.dia === t.dia) match = s.id;
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.id === match));
    const sc = SCENARIOS.find((s) => s.id === match);
    text.textContent = sc ? sc.text : 'Egne verdier. Velg en situasjon for å se et eksempel fra hverdagen.';
  };

  for (const s of SCENARIOS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'scenario';
    b.dataset.id = s.id;
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `${s.name}: puls ${s.hr}, blodtrykk ${s.sys}/${s.dia}`);
    const name = document.createElement('span');
    name.textContent = s.name;
    const small = document.createElement('small');
    small.textContent = `${s.hr} · ${s.sys}/${s.dia}`;
    small.setAttribute('aria-hidden', 'true');
    b.append(name, small);
    b.addEventListener('click', () => {
      reflect(app.phys.setTarget({ hr: s.hr, sys: s.sys, dia: s.dia }));
      if (app.phys.paused) app.phys.snapToTarget();
      app.events.emit('invalidate', undefined);
    });
    buttons.push(b);
    list.append(b);
  }

  const onInput = (key: keyof Vitals, input: HTMLInputElement) => () => {
    reflect(app.phys.setTarget({ [key]: Number(input.value) }, key));
    if (app.phys.paused) app.phys.snapToTarget();
    app.events.emit('invalidate', undefined);
  };
  sHr.addEventListener('input', onInput('hr', sHr));
  sSys.addEventListener('input', onInput('sys', sSys));
  sDia.addEventListener('input', onInput('dia', sDia));
  reflect({ ...app.phys.target });

  // Levende tall og merkelapper rundt på siden.
  const hrEls = document.querySelectorAll<HTMLElement>('[data-live="hr"]');
  const bpEls = document.querySelectorAll<HTMLElement>('[data-live="bp"]');
  const hrTag = document.querySelector<HTMLElement>('[data-live="hr-tag"]');
  const bpTag = document.querySelector<HTMLElement>('[data-live="bp-tag"]');
  let lastHr = '';
  let lastBp = '';
  return {
    update() {
      const c = app.phys.current;
      const hr = String(Math.round(c.hr));
      const bpText = bp(c.sys, c.dia);
      if (hr !== lastHr) {
        lastHr = hr;
        hrEls.forEach((e) => (e.textContent = hr));
        const k = classifyHr(c.hr);
        if (hrTag) {
          hrTag.textContent = k.label;
          hrTag.dataset.tone = k.tone;
        }
      }
      if (bpText !== lastBp) {
        lastBp = bpText;
        bpEls.forEach((e) => (e.textContent = bpText));
        const k = classifyBp(c.sys, c.dia);
        if (bpTag) {
          bpTag.textContent = k.label;
          bpTag.dataset.tone = k.tone;
        }
      }
    },
  };
}
