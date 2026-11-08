import { expect, test, type Page } from '@playwright/test';

// Tester mot bygget (npm run build). Kjør: npx playwright test

type Puls = {
  app: {
    part: string;
    phys: {
      paused: boolean;
      target: { hr: number; sys: number; dia: number };
      current: { hr: number; sys: number; dia: number };
      update(dt: number): void;
      setPaused(p: boolean): void;
      time: number;
    };
  };
  cuff: { phase: string; reading: { sys: number; dia: number } | null; start(): void; update(dt: number): void; sounds: number[] };
  counter: { result: { count: number; bpm: number } | null; start(): void; update(dt: number): void };
  camera?: { projectionMatrix: unknown };
};

async function ready(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#stage-status')).toBeHidden({ timeout: 60_000 });
}

test('laster uten feil i konsollen og uten vannrett rulling', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('total nedlasting er under 3 MB', async ({ page }) => {
  let bytes = 0;
  page.on('response', async (r) => {
    try {
      const body = await r.body();
      bytes += body.length;
    } catch {
      /* omdirigeringer har ingen kropp */
    }
  });
  await ready(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  console.log(`Nedlastet ukomprimert: ${(bytes / 1024).toFixed(0)} KB`);
  expect(bytes).toBeLessThan(3 * 1024 * 1024);
});

test('fanene kan brukes med tastatur', async ({ page }) => {
  await ready(page);
  const first = page.getByRole('tab', { name: 'Oversikt', exact: true });
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Hjertet', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Hjertet', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Håndleddet', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#part-panel h3')).toHaveText('Håndleddet');
});

test('alle knapper har et tilgjengelig navn', async ({ page }) => {
  await ready(page);
  const unnamed = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => !(b.getAttribute('aria-label') || b.textContent?.trim()))
      .map((b) => b.outerHTML.slice(0, 80)),
  );
  expect(unnamed).toEqual([]);
  for (const id of ['btn-overview', 'btn-zoom-in', 'btn-zoom-out', 'btn-pause']) {
    await expect(page.locator(`#${id}`)).toHaveAttribute('aria-label', /.+/);
  }
});

test('etikettene velger del, og klikk på modellen treffer hjertet', async ({ page, isMobile }) => {
  await ready(page);
  await page.locator('#modell').scrollIntoViewIfNeeded();
  await page.locator('.label', { hasText: 'Mansjetten' }).click();
  await expect(page.getByRole('tab', { name: 'Mansjetten', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Vis oversikt' }).click();
  await page.waitForTimeout(1400);
  // Finn hjertet på skjermen ved å projisere midten av det.
  const pos = await page.evaluate(() => {
    const p = (window as unknown as { __puls: { camera: { position: unknown } & object; scene: { getObjectByName(n: string): { getWorldPosition(v: unknown): { project(c: unknown): { x: number; y: number } } } } } }).__puls;
    const heart = p.scene.getObjectByName('Hjertet');
    const v = heart.getWorldPosition(new (Object.getPrototypeOf((p.camera as { position: object }).position).constructor)());
    const s = v.project(p.camera);
    const r = document.getElementById('scene')!.getBoundingClientRect();
    return { x: r.left + ((s.x + 1) / 2) * r.width, y: r.top + ((1 - s.y) / 2) * r.height };
  });
  if (isMobile) await page.touchscreen.tap(pos.x, pos.y);
  else await page.mouse.click(pos.x, pos.y);
  await expect(page.getByRole('tab', { name: 'Hjertet', exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('glidebryterne holder minst 20 mmHg mellom trykkene', async ({ page }) => {
  await ready(page);
  await page.locator('#s-dia').fill('110');
  await page.locator('#s-sys').fill('100');
  const t = await page.evaluate(() => (window as unknown as { __puls: Puls }).__puls.app.phys.target);
  expect(t.sys - t.dia).toBeGreaterThanOrEqual(20);
  await page.getByRole('button', { name: /^Løpetur/ }).click();
  await expect(page.locator('#o-hr')).toHaveText('150 slag/min');
  await expect(page.locator('#scenario-text')).toContainText('Musklene');
});

test('blodtrykksmålingen gir en avlesning nær monitorens verdi', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(() => {
    const p = (window as unknown as { __puls: Puls }).__puls;
    p.app.phys.setPaused(true);
    p.app.phys.setPaused(false);
    p.cuff.start();
    // Kjør simuleringen raskt fremover i små steg.
    for (let i = 0; i < 6000 && p.cuff.phase !== 'done' && p.cuff.phase !== 'idle'; i++) {
      const before = p.app.phys.time;
      p.app.phys.update(0.01);
      p.cuff.update(p.app.phys.time - before);
    }
    return { phase: p.cuff.phase, reading: p.cuff.reading, sounds: p.cuff.sounds.length, c: p.app.phys.current };
  });
  expect(result.phase).toBe('done');
  expect(result.reading).not.toBeNull();
  expect(result.sounds).toBeGreaterThan(3);
  expect(Math.abs(result.reading!.sys - result.c.sys)).toBeLessThanOrEqual(8);
  expect(Math.abs(result.reading!.dia - result.c.dia)).toBeLessThanOrEqual(8);
});

test('pulstelleren teller i 15 sekunder og ganger med 4', async ({ page }) => {
  await ready(page);
  await page.getByRole('tab', { name: 'Håndleddet', exact: true }).click();
  await page.getByRole('button', { name: 'Tell pulsslag i 15 sekunder' }).click();
  // Ekte tid: tellingen varer 15 sekunder.
  await expect(page.locator('.counter-text')).toContainText('× 4 =', { timeout: 25_000 });
  const result = await page.evaluate(() => (window as unknown as { __puls: Puls }).__puls.counter.result);
  expect(result).not.toBeNull();
  expect(result!.bpm).toBe(result!.count * 4);
  // 66 slag i minuttet gir 16 eller 17 slag på 15 sekunder.
  expect(result!.bpm).toBeGreaterThanOrEqual(60);
  expect(result!.bpm).toBeLessThanOrEqual(72);
});

test('redusert bevegelse starter på pause', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await ready(page);
  const paused = await page.evaluate(() => (window as unknown as { __puls: Puls }).__puls.app.phys.paused);
  expect(paused).toBe(true);
  await expect(page.locator('#btn-pause')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#btn-pause')).toHaveAttribute('aria-label', 'Spill av animasjonen');
  await context.close();
});

test('lerretet ruller siden ved loddrett sveip', async ({ page }) => {
  await ready(page);
  const ta = await page.locator('#scene').evaluate((el) => getComputedStyle(el).touchAction);
  expect(ta).toBe('pan-y');
});
