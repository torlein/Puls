// Legger de ferdige filene i dist/ inn i en Worker-modul, så siden kan
// publiseres uten Cloudflares egen opplasting av statiske filer.
// Kjøres av «npm run deploy» etter bygget.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const DIST = 'dist';
const OUT = 'worker/files.generated.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const TEXT = new Set(['.html', '.js', '.css', '.svg', '.json']);

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const entries = [];
let total = 0;
for (const file of walk(DIST)) {
  const path = '/' + relative(DIST, file).split('\\').join('/');
  if (path === '/_headers') continue;
  const ext = extname(file);
  const type = TYPES[ext];
  if (!type) throw new Error(`Ukjent filtype: ${path}`);
  const buf = readFileSync(file);
  total += buf.length;
  const etag = '"' + createHash('sha256').update(buf).digest('hex').slice(0, 20) + '"';
  const text = TEXT.has(ext);
  const body = text ? JSON.stringify(buf.toString('utf8')) : JSON.stringify(buf.toString('base64'));
  entries.push(`  ${JSON.stringify(path)}: { type: ${JSON.stringify(type)}, etag: ${JSON.stringify(etag)}, text: ${text}, body: ${body} },`);
}
writeFileSync(OUT, `// Generert av scripts/make-worker.mjs. Ikke rediger.\nexport const files = {\n${entries.join('\n')}\n};\n`);
console.log(`${entries.length} filer, ${(total / 1024).toFixed(0)} KB, skrevet til ${OUT}`);
