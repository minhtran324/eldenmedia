import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const template = await readFile(new URL('src/lib/pwa/service-worker.js', root), 'utf8');
const version = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
if (!template.includes('__ELDEN_PWA_VERSION__')) throw new Error('PWA version placeholder missing');
const output = new URL('public/sw.js', root);
await writeFile(output, template.replaceAll('__ELDEN_PWA_VERSION__', version), 'utf8');
console.log(`PWA worker generated: ${fileURLToPath(output)}`);
