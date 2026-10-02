import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/lib/pwa/service-worker.js', import.meta.url), 'utf8').replaceAll('__ELDEN_PWA_VERSION__', 'test');
const offlineHtml = readFileSync(new URL('../public/offline.html', import.meta.url), 'utf8');
const origin = 'https://elden.example';
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS', name); }

function worker() {
  const handlers = new Map(), stores = new Map();
  const calls = { fetched: [], deleted: [], precached: [], skipped: 0, claimed: 0 };
  let network = async () => new Response('online document');
  const self = {
    location: { origin },
    addEventListener: (event, handler) => handlers.set(event, handler),
    clients: { claim: async () => { calls.claimed++; } },
    skipWaiting: async () => { calls.skipped++; },
  };
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async name => { calls.deleted.push(name); return stores.delete(name); },
    open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        addAll: async paths => { calls.precached.push(...paths); for (const path of paths) entries.set(path, new Response(path === '/offline.html' ? offlineHtml : 'public icon')); },
        match: async path => entries.get(path)?.clone(),
      };
    },
  };
  vm.runInNewContext(source, { self, caches, URL, Response, fetch: async request => { calls.fetched.push(request.url); return network(request); } });
  return {
    handlers, calls, stores,
    network: next => { network = next; },
    async lifecycle(name, data) { let promise; handlers.get(name)?.({ data, waitUntil: p => { promise = p; } }); await promise; },
    async fetch(path, { method = 'GET', mode = 'navigate' } = {}) {
      let intercepted = false, promise;
      handlers.get('fetch')({ request: { url: new URL(path, origin).href, method, mode }, respondWith: p => { intercepted = true; promise = p; } });
      return { intercepted, response: await promise };
    },
  };
}

await check('Install precaches only the generic offline document and public icons', async () => {
  const w = worker(); await w.lifecycle('install');
  assert.deepEqual(w.calls.precached, ['/offline.html', '/icons/elden-v2/icon-192.png', '/icons/elden-v2/icon-512.png', '/icons/elden-v2/maskable-512.png', '/icons/elden-v2/apple-touch-icon.png']);
  assert.equal(w.calls.skipped, 0);
});
await check('Activation removes only obsolete Elden public caches', async () => {
  const w = worker(); await w.lifecycle('install');
  w.stores.set('elden-public-old', new Map()); w.stores.set('unrelated-cache', new Map());
  await w.lifecycle('activate');
  assert.deepEqual(w.calls.deleted, ['elden-public-old']); assert.ok(w.stores.has('unrelated-cache')); assert.ok(w.stores.has('elden-public-test'));
  assert.equal(w.calls.claimed, 1);
});
await check('Authenticated page responses are fetched but never stored', async () => {
  const w = worker(); await w.lifecycle('install');
  w.network(async () => new Response('Private employee salaries and diamonds', { headers: { 'Cache-Control': 'private, no-store' } }));
  const { response } = await w.fetch('/home');
  assert.equal(await response.text(), 'Private employee salaries and diamonds');
  assert.equal(w.stores.get('elden-public-test').size, 5); assert.ok(!w.stores.get('elden-public-test').has('/home'));
});
await check('Offline navigation displays only the generic offline document', async () => {
  const w = worker(); await w.lifecycle('install'); w.network(async () => { throw Error('offline'); });
  const { response } = await w.fetch('/admin/imports?batch=private-id');
  const body = await response.text(); assert.match(body, /Chưa kết nối/); assert.ok(!body.includes('private-id'));
});
await check('Uncached navigation cannot replay private pages from previous sessions', async () => {
  const w = worker(); await w.lifecycle('install'); await w.fetch('/reports');
  w.network(async () => { throw Error('offline'); });
  assert.equal(await (await w.fetch('/reports')).response.text(), offlineHtml);
});
await check('HTTP application errors pass through instead of becoming offline pages', async () => {
  const w = worker(); w.network(async () => new Response('server failure', { status: 500 }));
  const { response } = await w.fetch('/home'); assert.equal(response.status, 500); assert.equal(await response.text(), 'server failure');
});
await check('Authentication redirect responses pass through unchanged', async () => {
  const w = worker(); w.network(async () => Response.redirect(`${origin}/login`, 307));
  const { response } = await w.fetch('/home'); assert.equal(response.status, 307); assert.equal(response.headers.get('location'), `${origin}/login`);
});
await check('All business writes bypass the service worker', async () => {
  const w = worker();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) for (const path of ['/admin/imports', '/idol/operations', '/api/imports']) assert.equal((await w.fetch(path, { method })).intercepted, false);
  assert.equal(w.calls.fetched.length, 0);
});
await check('API requests and private photographs bypass offline handling', async () => {
  const w = worker(); for (const path of ['/api/imports', '/api/notifications/counts', '/api/attendance/photos/test', '/api/homepage/media/test']) assert.equal((await w.fetch(path)).intercepted, false);
});
await check('OAuth callback and external Supabase requests bypass the worker', async () => {
  const w = worker();
  for (const path of ['/auth/callback?code=secret', 'https://supabase.example/rest/v1/profiles', 'https://accounts.google.com/']) assert.equal((await w.fetch(path)).intercepted, false);
});
await check('Next.js RSC, scripts and image optimizer requests are never cached', async () => {
  const w = worker();
  for (const path of ['/home?_rsc=123', '/_next/static/chunks/app.js', '/_next/image?url=private']) assert.equal((await w.fetch(path, { mode: 'cors' })).intercepted, false);
});
await check('Public icons remain available offline without network requests', async () => {
  const w = worker(); await w.lifecycle('install'); w.network(async () => { throw Error('offline'); });
  assert.equal(await (await w.fetch('/icons/elden-v2/icon-192.png', { mode: 'no-cors' })).response.text(), 'public icon'); assert.equal(w.calls.fetched.length, 0);
});
await check('Query variants cannot enter the public asset cache', async () => {
  const w = worker(); await w.lifecycle('install'); assert.equal((await w.fetch('/icons/elden-v2/icon-192.png?private=123', { mode: 'no-cors' })).intercepted, false);
});
await check('Missing offline cache produces a generic 503 instead of private content', async () => {
  const w = worker(); w.network(async () => { throw Error('offline'); });
  const { response } = await w.fetch('/home'); assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'no-store');
});
await check('Only explicit update messages allow a waiting worker to activate', async () => {
  const w = worker(); await w.lifecycle('install'); await w.lifecycle('message', { type: 'UNKNOWN' }); assert.equal(w.calls.skipped, 0);
  await w.lifecycle('message', { type: 'ELDEN_ACTIVATE_UPDATE' }); assert.equal(w.calls.skipped, 1);
});
await check('No background job queues or replay handlers are installed', async () => {
  const w = worker(); assert.deepEqual([...w.handlers.keys()].sort(), ['activate', 'fetch', 'install', 'message']);
});
console.log(`${passed} PWA worker checks passed`);
