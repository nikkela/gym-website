// Bundles the whole site (pages + API) into one Cloudflare Worker file: dist/worker.js
// Usage: node scripts/build-worker.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app': ['app.html', 'text/html; charset=utf-8'],
  '/data.js': ['data.js', 'text/javascript; charset=utf-8'],
  '/logo.svg': ['logo.svg', 'image/svg+xml'],
  '/robots.txt': ['robots.txt', 'text/plain; charset=utf-8'],
};
const assets = Object.fromEntries(Object.entries(files).map(([k, [f, t]]) => [k, { body: read(f), type: t }]));
const api = read('functions/api/[[path]].js').replace('export async function onRequest', 'async function onRequest');
const out = `${api}
const ASSETS = ${JSON.stringify(assets)};
const ALIAS = { '/index.html': '/', '/app.html': '/app', '/app/': '/app' };
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice(5).split('/').filter(Boolean);
      return onRequest({ request, env, params: { path } });
    }
    const a = ASSETS[ALIAS[url.pathname] || url.pathname];
    if (!a) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    return new Response(a.body, { headers: { 'content-type': a.type, 'cache-control': a.type.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600' } });
  },
};
`;
mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/worker.js', root), out);
console.log('dist/worker.js', out.length, 'bytes');
