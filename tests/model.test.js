import test from 'node:test'; import assert from 'node:assert/strict';
import { migrate, SCHEMA_VERSION, validateBackup, emptyDB } from '../js/model.js';
import { filterMeasurements, load, save, backup } from '../js/store.js';
test('migrate null -> empty', () => assert.equal(migrate(null).schemaVersion, SCHEMA_VERSION));
test('migrate v1 nested -> v2 flat', () => {
  const v1 = { version: 1, projects: [{ id: 'p1', name: 'Deck', measurements: [{ id: 'm1', label: 'L', valueM: 2.5 }] }] };
  const d = migrate(v1);
  assert.equal(d.schemaVersion, 2); assert.equal(d.measurements[0].projectId, 'p1'); assert.equal(d.measurements[0].value, 2.5);
  assert.equal(d.measurements[0].source, 'manual'); assert.equal(d.projects[0].measurements, undefined); assert.ok(d.settings.unit); assert.equal(v1.projects[0].measurements.length, 1);
});
test('migrate idempotent', () => { const d = migrate(migrate({ projects: [] })); assert.deepEqual(migrate(d), d); });
test('validateBackup', () => { assert.equal(validateBackup(backup(emptyDB())), null); assert.ok(validateBackup({ x: 1 })); assert.ok(validateBackup({ schemaVersion: 99, projects: [] })); });
test('load/save + corrupt storage', () => {
  const mem = new Map(); const st = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const d = emptyDB(); d.projects.push({ id: 'p' }); save(d, st); assert.equal(load(st).projects.length, 1);
  mem.set('measureledger.v1', '{bad'); assert.equal(load(st).projects.length, 0);
});
test('filter', () => {
  const ms = [{ label: 'Wall', tags: ['a'], mode: 'distance', measuredAt: '2026-10-01T00:00:00Z', projectId: 'p' }, { label: 'Floor', tags: [], mode: 'area', measuredAt: '2026-10-10T00:00:00Z', projectId: 'q' }];
  assert.equal(filterMeasurements(ms, { q: 'wal' }).length, 1); assert.equal(filterMeasurements(ms, { tag: 'a' }).length, 1);
  assert.equal(filterMeasurements(ms, { mode: 'area' })[0].label, 'Floor'); assert.equal(filterMeasurements(ms, { from: '2026-10-05' }).length, 1);
  assert.equal(filterMeasurements(ms, { to: '2026-10-05', projectId: 'p' }).length, 1);
});
