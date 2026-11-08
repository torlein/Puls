// Tesen øverst: «ofte» blinker ved hvert slag, «hardt» endrer vekt med trykket.

import { app } from './store';

export function initHero(): { frame(): void } {
  const strike = document.querySelector<HTMLElement>('.thesis .strike');
  const hard = document.querySelector<HTMLElement>('.thesis .hard > span');
  let visible = true;
  const section = document.querySelector('.thesis');
  if (section) {
    new IntersectionObserver((e) => (visible = e[0]?.isIntersecting ?? true)).observe(section);
  }

  app.phys.onBeat(() => {
    if (!strike || !visible) return;
    strike.classList.remove('beat');
    void strike.offsetWidth;
    strike.classList.add('beat');
  });

  let lastWeight = 0;
  return {
    frame() {
      if (!visible || !hard) return;
      const p = app.phys.pressureAt(app.phys.time);
      // 45 mmHg gir vekt 400, 200 mmHg gir vekt 900.
      const w = Math.round(Math.min(900, Math.max(400, 400 + (p - 45) * 3.2)));
      if (w !== lastWeight) {
        lastWeight = w;
        hard.style.fontWeight = String(w);
      }
    },
  };
}
