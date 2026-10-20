import test from 'node:test'; import assert from 'node:assert/strict';
import { parseCSV, toCSV, parseImport } from '../js/csv.js';
import { newMeasurement } from '../js/model.js';
test('parseCSV quotes/newlines', () => { assert.deepEqual(parseCSV('a,"b,""c"""\r\n"x\ny",z\n'), [['a', 'b,"c"'], ['x\ny', 'z']]); });
test('toCSV has BOM, CRLF, escaping', () => {
  const s = toCSV([newMeasurement({ label: 'Wall, "north"', value: 3.81, notes: 'line1\nline2', tags: ['a', 'b'] })]);
  assert.ok(s.startsWith('\uFEFFid,label')); assert.ok(s.includes('"Wall, ""north"""')); assert.ok(s.includes(`12' 6"`)); assert.ok(s.endsWith('\r\n'));
});
test('CSV round trip', () => {
  const ms = [newMeasurement({ label: 'A', value: 1.234, tags: ['x'] }), newMeasurement({ label: 'B', value: 2, mode: 'p2p', notes: 'n,1' })];
  const r = parseImport(toCSV(ms));
  assert.equal(r.format, 'csv'); assert.equal(r.items.length, 2); assert.equal(r.items[0].value, 1.234); assert.deepEqual(r.items[0].tags, ['x']); assert.equal(r.items[1].mode, 'p2p'); assert.equal(r.items[1].notes, 'n,1'); assert.equal(r.items[0].source, 'csv');
});
test('CSV with display values only', () => {
  const r = parseImport('label,value\nLen,12\' 6"\nBad,zzz\n'); assert.equal(r.items.length, 1); assert.ok(Math.abs(r.items[0].value - 3.81) < 1e-9); assert.equal(r.errors[0].line, 3);
});
test('paste notes', () => {
  const r = parseImport(`Kitchen length: 12' 6 1/2" #kitchen\nWidth = 3.82 m\nCeiling - 8 ft\n382 cm\nwhat is this\nDoor 36"`);
  assert.equal(r.items.length, 5); assert.equal(r.items[0].label, 'Kitchen length'); assert.deepEqual(r.items[0].tags, ['kitchen']);
  assert.equal(r.items[1].value, 3.82); assert.equal(r.items[2].label, 'Ceiling'); assert.equal(r.items[3].label, ''); assert.equal(r.items[4].label, 'Door');
  assert.equal(r.errors.length, 1); assert.equal(r.items[0].source, 'paste');
});
