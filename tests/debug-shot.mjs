// Feilsøking: åpner siden, kjører valgfri kode og tar ett skjermbilde av scenen.
// Bruk: node tests/debug-shot.mjs <fil.png> <del> [js] [bredde] [høyde] [tema]
import { chromium } from '@playwright/test';
const [file, part = 'oversikt', js = '', w = '1280', h = '900', scheme = 'light'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, colorScheme: scheme });
page.on('console', (m) => console.log('console:', m.type(), m.text()));
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.getElementById('stage-status')?.hidden === true, null, { timeout: 60000 });
if (part !== 'oversikt') await page.getByRole('tab', { name: { hjertet: 'Hjertet', aorta: 'Aorta', veggen: 'Arterieveggen', mansjetten: 'Mansjetten', handleddet: 'Håndleddet' }[part], exact: true }).click();
await page.locator('#modell').scrollIntoViewIfNeeded();
await page.waitForTimeout(1600);
if (js) console.log('eval:', JSON.stringify(await page.evaluate(js)));
await page.waitForTimeout(300);
await page.locator('#stage').screenshot({ path: file });
await browser.close();
