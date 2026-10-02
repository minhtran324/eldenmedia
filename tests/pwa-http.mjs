import assert from 'node:assert/strict';
const origin = process.argv[2] ?? 'http://localhost:3100';
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS', name); }

await check('Manifest is public and has stable app identity', async () => {
  const response = await fetch(`${origin}/manifest.webmanifest`);
  assert.equal(response.status, 200); const manifest = await response.json();
  assert.equal(manifest.id, '/'); assert.equal(manifest.start_url, '/home'); assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192')); assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  assert.ok(manifest.icons.every(icon => icon.src.startsWith('/icons/elden-v2/')), 'Manifest must reference the company logo, bypassing legacy icon caches');
});
await check('Worker is public JavaScript and cannot be held by HTTP cache', async () => {
  const response = await fetch(`${origin}/sw.js`);
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /javascript/);
  assert.match(response.headers.get('cache-control'), /no-store/); assert.equal(response.headers.get('service-worker-allowed'), '/');
  const body = await response.text(); assert.match(body, /ELDEN_ACTIVATE_UPDATE/); assert.ok(!body.includes('__ELDEN_PWA_VERSION__'));
});
await check('PNG icons have their declared dimensions', async () => {
  for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['maskable-512.png', 512], ['apple-touch-icon.png', 180], ['favicon-48.png', 48]]) {
    const response = await fetch(`${origin}/icons/elden-v2/${file}`); assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), size); assert.equal(bytes.readUInt32BE(20), size);
  }
});
await check('Offline fallback is public and has no application data', async () => {
  const response = await fetch(`${origin}/offline.html`); assert.equal(response.status, 200);
  const body = await response.text(); assert.match(body, /Chưa kết nối/); assert.match(body, /Thử tải lại/); assert.ok(!body.includes('__NEXT_DATA__'));
});
await check('Installation guide is available before login', async () => {
  const response = await fetch(`${origin}/install`); assert.equal(response.status, 200);
  const body = await response.text(); assert.match(body, /Cài bằng Safari/); assert.match(body, /Cài bằng Chrome/); assert.match(body, /apple-touch-icon/);
});
await check('Installed start URL still requires authentication', async () => {
  const response = await fetch(`${origin}/home`, { redirect: 'manual' }); assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get('location'), origin).pathname, '/login'); assert.match(response.headers.get('cache-control'), /no-store/);
});
await check('Login links to install guide and exposes Apple icon metadata', async () => {
  const response = await fetch(`${origin}/login`); assert.equal(response.status, 200);
  const body = await response.text(); assert.match(body, /href="\/install"/); assert.match(body, /apple-touch-icon/); assert.match(body, /manifest.webmanifest/);
  assert.match(body, /href="\/icons\/elden-v2\/apple-touch-icon\.png"/);
  assert.match(body, /href="\/icons\/elden-v2\/favicon-48\.png"/);
});
console.log(`${passed} PWA HTTP checks passed`);
