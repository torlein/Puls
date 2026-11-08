// Serverer den statiske siden fra minnet i en Cloudflare Worker.
import { files } from './files.generated.js';

const decoded = new Map();

function bodyOf(path, file) {
  if (file.text) return file.body;
  let bytes = decoded.get(path);
  if (!bytes) {
    const bin = atob(file.body);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    decoded.set(path, bytes);
  }
  return bytes;
}

function cacheControl(path) {
  if (path.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (path.startsWith('/models/')) return 'public, max-age=604800';
  return 'public, max-age=0, must-revalidate';
}

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Metoden er ikke tillatt', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = files[path];
    if (!file) {
      return new Response('Fant ikke siden. Gå til forsiden: https://puls.kerlabs.no/', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    const headers = new Headers({
      'Content-Type': file.type,
      'Cache-Control': cacheControl(path),
      ETag: file.etag,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    if (request.headers.get('If-None-Match') === file.etag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(request.method === 'HEAD' ? null : bodyOf(path, file), { headers });
  },
};
