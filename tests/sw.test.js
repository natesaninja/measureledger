import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
test('service worker precaches every JS module and asset, and they exist', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /const CACHE = 'measureledger-v\d+\.\d+\.\d+'/);
  const assets = [...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(Boolean);
  for (const f of readdirSync(new URL('../js/', import.meta.url))) assert.ok(assets.includes('js/' + f), 'not precached: ' + f);
  for (const a of assets) assert.ok(existsSync(new URL('../' + a, import.meta.url)), 'missing: ' + a);
  const man = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.ok(man.icons.some(i => i.sizes === '192x192' && i.type === 'image/png')); assert.ok(man.icons.some(i => i.sizes === '512x512'));
  assert.equal(man.start_url, './'); assert.equal(man.scope, './');
});
