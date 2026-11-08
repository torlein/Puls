// Tar skjermbilder av oversikten og de fem delene, i to størrelser og to temaer.
// Bruk: npm run build && npm run preview & node tests/screenshots.mjs [url]
//
// Skriver til screenshots/ og melder feil fra konsollen.

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const only = process.argv[3] ?? '';
const scale = Number(process.env.SCALE ?? 1);
const out = 'screenshots';
mkdirSync(out, { recursive: true });

const parts = [
  ['oversikt', 'Oversikt'],
  ['hjertet', 'Hjertet'],
  ['aorta', 'Aorta'],
  ['veggen', 'Arterieveggen'],
  ['mansjetten', 'Mansjetten'],
  ['handleddet', 'Håndleddet'],
];
const sizes = [
  ['desktop', { width: 1280, height: 900 }],
  ['mobil', { width: 390, height: 844 }],
];
const schemes = ['light', 'dark'];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const problems = [];
for (const [sizeName, viewport] of sizes) {
  for (const scheme of schemes) {
    if (only && !`${sizeName}-${scheme}`.includes(only)) continue;
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: scale,
      colorScheme: scheme,
      hasTouch: sizeName === 'mobil',
      isMobile: sizeName === 'mobil',
    });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${sizeName}/${scheme}] ${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`[${sizeName}/${scheme}] pageerror: ${e.message}`));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.getElementById('stage-status')?.hidden === true, null, { timeout: 60000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) problems.push(`[${sizeName}/${scheme}] vannrett rulling: ${overflow}px`);

    await page.screenshot({ path: `${out}/${sizeName}-${scheme}-0-topp.png` });
    for (const [id, name] of parts) {
      await page.getByRole('tab', { name, exact: true }).click();
      await page.locator('#modell').scrollIntoViewIfNeeded();
      await page.waitForTimeout(1700);
      const section = page.locator('#modell .model-grid');
      await section.screenshot({ path: `${out}/${sizeName}-${scheme}-${id}.png` });
    }
    await page.locator('#monitor').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.locator('#monitor').screenshot({ path: `${out}/${sizeName}-${scheme}-monitor.png` });
    await page.screenshot({ path: `${out}/${sizeName}-${scheme}-full.png`, fullPage: true });
    await context.close();
  }
}
await browser.close();
if (problems.length) {
  console.log('Problemer:\n' + problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Ingen feil i konsollen.');
}
