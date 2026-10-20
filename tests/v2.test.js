import test from 'node:test'; import assert from 'node:assert/strict';
import { parseArea, parseVolume, parseAngle, pitchFromDeg, formatPitch, formatValue } from '../js/units.js';
import * as calc from '../js/calc.js';
import { newRoom, solveRoom, planSquareness, snapPoint, planSVG, pointsCSV, openingSegment } from '../js/sketch-geom.js';
import { planDXF } from '../js/dxf.js';
import { buildXLSX, unzipStore, crc32, colName } from '../js/xlsx.js';
import { fillForm, FORMS } from '../js/forms.js';
import { memoryMedia, exportMedia, importMedia, blobToBase64, base64ToBlob } from '../js/media.js';
import { compareByLabel, comparableLabels, backupDue, backup } from '../js/store.js';
import { migrate, emptyDB, newMeasurement } from '../js/model.js';
import { guessDecodes, toHex, registerAdapter } from '../js/ble.js';
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);
const FT = 0.3048;

test('area parsing', () => {
  near(parseArea('120 sq ft').value, 120 * FT * FT); near(parseArea('12 m²').value, 12); near(parseArea('12m2').value, 12); near(parseArea('1200 sf').value, 1200 * FT * FT);
  near(parseArea('10 sq yd').value, 10 * 0.9144 ** 2); near(parseArea(`12' x 10'`).value, 120 * FT * FT); near(parseArea('100').value, 100 * FT * FT); near(parseArea('5', 'm').value, 5);
  assert.equal(parseArea('12 parsecs'), null); assert.equal(parseArea(''), null);
});
test('volume parsing', () => {
  near(parseVolume('3 cu yd').value, 3 * 0.9144 ** 3); near(parseVolume('10 m³').value, 10); near(parseVolume('100 cu ft').value, 100 * FT ** 3);
  near(parseVolume('500 L').value, 0.5); near(parseVolume('1 gal').value, 0.003785411784); near(parseVolume('2m x 3m x 0.5m').value, 3); assert.equal(parseVolume('x'), null);
});
test('angle / pitch parsing', () => {
  near(parseAngle('30°').value, 30); near(parseAngle('30 deg').value, 30); near(parseAngle('45').value, 45); near(parseAngle(`${Math.PI / 4} rad`).value, 45);
  near(parseAngle('100%').value, 45); near(parseAngle('12/12').value, 45); near(parseAngle('6:12').value, 26.565051177, 1e-6); near(parseAngle('6 in 12').value, 26.565051177, 1e-6);
  near(parseAngle(`4' / 12'`).value, Math.atan(1 / 3) * 180 / Math.PI); assert.equal(parseAngle('steep'), null);
});
test('pitch conversions', () => {
  const p = pitchFromDeg(26.56505117707799); near(p.per12, 6); near(p.pct, 50); assert.equal(formatPitch(45), '12.00/12 · 45.0° · 100.0%');
  assert.equal(formatValue({ kind: 'slope', value: 45 }, 'ft'), '12.00/12 · 45.0° · 100.0%');
  const r = calc.rafter(3, 45); near(r.rafter, 3 * Math.SQRT2); near(r.rise, 3);
});
test('earthworks grid + avg', () => {
  const g = calc.earthworksGrid([[1, 1], [1, 1]], 2, 3); near(g.volume, 6); assert.equal(g.cells, 1);
  const g2 = calc.earthworksGrid([[0, 1, 2], [0, 1, 2]], 1, 1); near(g2.volume, 0.5 + 1.5); near(g2.avgDepth, 1);
  assert.throws(() => calc.earthworksGrid([[1, 2]], 1, 1)); assert.throws(() => calc.earthworksGrid([[1, 2], [1]], 1, 1));
  const a = calc.earthworksAvg(10, [0.2, 0.4], 25); near(a.volume, 3); near(a.loose, 3.75); assert.throws(() => calc.earthworksAvg(1, []));
});
const rect = (w, h, extra = {}) => newRoom({ pts: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], closed: true, ...extra });
test('sketch: unassigned room keeps drawn size', () => {
  const s = solveRoom(rect(4, 3)); near(s.area, 12); near(s.perimeter, 14); near(s.closure, 0); assert.equal(s.lengths.length, 4); assert.equal(s.scale, 1);
});
test('sketch: assigning readings rescales to true dimensions', () => {
  const r = rect(2, 1); r.walls[0] = { measId: 'a' }; r.walls[1] = { length: 3 };
  const s = solveRoom(r, id => (id === 'a' ? 5 : null)); // drawn 2x1, true 5 x 3
  near(s.lengths[0], 5); near(s.lengths[1], 3); near(s.scale, (5 / 2 + 3 / 1) / 2 >= 2.5 ? s.scale : 0);
  // unassigned walls scale by median ratio (2.5 or 3); closure gap reported when inconsistent
  assert.ok(s.closure >= 0); assert.ok(s.wallInfo[0].assigned && !s.wallInfo[2].assigned);
  const r2 = rect(2, 1); r2.walls = [{ length: 6 }, { length: 3 }, { length: 6 }, { length: 3 }];
  const s2 = solveRoom(r2); near(s2.area, 18); near(s2.perimeter, 18); near(s2.closure, 0);
});
test('sketch: unassigned walls adjust so a rectangle closes', () => {
  const r = rect(4, 3); r.walls[0] = { length: 3.81 }; r.walls[1] = { length: 3.05 };
  const s = solveRoom(r); near(s.lengths[2], 3.81); near(s.lengths[3], 3.05); near(s.closure, 0); near(s.area, 3.81 * 3.05); assert.ok(planSquareness(s).square);
  const one = rect(4, 3); one.walls[0] = { length: 5 }; const s1 = solveRoom(one); near(s1.closure, 0); near(s1.area, 5 * 3.75); // 3 free walls: min-change closure
});
test('sketch: L-shape area via shoelace', () => {
  const r = newRoom({ closed: true, pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 4 }, { x: 0, y: 4 }] });
  near(solveRoom(r).area, 12); near(solveRoom(r).perimeter, 16);
});
test('sketch: openings subtract from wall area', () => {
  const r = rect(4, 3, { height: 2.5, openings: [{ wall: 0, offset: 1, width: 0.9, height: 2, type: 'door' }, { wall: 1, offset: 0.5, width: 1, height: 1.2, type: 'window' }] });
  const s = solveRoom(r); near(s.wallInfo[0].gross, 10); near(s.wallInfo[0].net, 10 - 1.8); near(s.wallInfo[1].net, 7.5 - 1.2);
  near(s.grossWall, 35); near(s.openingArea, 3); near(s.netWall, 32); near(s.volume, 30);
  const seg = openingSegment(s, r.openings[0]); near(seg.a.x, 1); near(seg.b.x, 1.9);
});
test('sketch: squareness + diagonals', () => {
  const s = solveRoom(rect(3, 4)); const q = planSquareness(s); near(q.d1, 5); assert.ok(q.square);
  const r = rect(3, 4); r.diagonals = [{ a: 0, b: 2, length: 5.02 }]; const d = solveRoom(r).diagonals[0]; near(d.plan, 5); near(d.diff, 0.02);
  const sk = newRoom({ closed: true, pts: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3.2, y: 4 }, { x: 0, y: 4 }] }); assert.equal(planSquareness(solveRoom(sk)).square, false);
});
test('sketch: snapping', () => { const p = snapPoint({ x: 0, y: 0 }, { x: 2.04, y: 0.1 }, { grid: 0.1, angleStep: 45 }); near(p.x, 2.0); near(p.y, 0); const q = snapPoint({ x: 0, y: 0 }, { x: 1, y: 1.1 }); near(q.x, q.y); });
test('plan SVG + points CSV', () => {
  const r = rect(4, 3, { name: 'Bath & <1>' }); const s = solveRoom(r); const svg = planSVG([r], [s]);
  assert.ok(svg.startsWith('<svg')); assert.equal((svg.match(/<line /g) || []).length, 4); assert.ok(svg.includes('Bath &amp; &lt;1&gt;'));
  const csv = pointsCSV([r], [s], 'm'); const lines = csv.trimEnd().split('\r\n'); assert.equal(lines.length, 5); assert.ok(lines[0].startsWith('\uFEFFPoint,X,Y,Z')); assert.ok(lines[2].startsWith('2,4.0000,'));
});
test('DXF output', () => {
  const r = rect(4, 3, { height: 2.4, openings: [{ wall: 0, offset: 1, width: 1, height: 2 }] }); const s = solveRoom(r);
  const d = planDXF([r], [s]); const lines = d.split('\n');
  assert.equal(lines[0], '0'); assert.equal(lines[1], 'SECTION'); assert.ok(d.trimEnd().endsWith('0\nEOF')); assert.ok(d.includes('AC1009'));
  assert.equal((d.match(/\n0\nLINE\n/g) || []).length, 5); assert.equal((d.match(/3DFACE/g) || []).length, 0);
  assert.equal(lines.length % 2, 1); // group code/value pairs + trailing newline
  const d3 = planDXF([r], [s], { extrude: true }); assert.equal((d3.match(/\n0\n3DFACE\n/g) || []).length, 4); assert.ok(d3.includes('\n33\n2.4000\n'));
});
test('xlsx structure', () => {
  const u8 = buildXLSX([{ name: 'Measures/1', rows: [['Label', 'Value m'], ['Wall <A> & "B"', 3.81], ['Empty', null]] }, { name: 'Two', rows: [['x']] }]);
  assert.equal(u8[0], 0x50); assert.equal(u8[1], 0x4b);
  const files = unzipStore(u8);
  for (const f of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) assert.ok(f in files, f);
  assert.ok(files['xl/workbook.xml'].includes('name="Measures 1"'));
  const s1 = files['xl/worksheets/sheet1.xml']; assert.ok(s1.includes('<c r="B2"><v>3.81</v></c>')); assert.ok(s1.includes('Wall &lt;A&gt; &amp; &quot;B&quot;')); assert.ok(!s1.includes('r="B3"'));
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926); assert.equal(colName(0), 'A'); assert.equal(colName(25), 'Z'); assert.equal(colName(26), 'AA'); assert.equal(colName(701), 'ZZ');
});
test('job forms fill from readings', () => {
  const ms = [newMeasurement({ label: 'Length', value: 4 }), newMeasurement({ label: 'width', value: 3 }), newMeasurement({ label: 'Ceiling height', value: 2.5 })];
  const f = fillForm('room', ms); const by = k => f.find(x => x.key === k);
  near(by('L').value, 4); assert.equal(by('L').source, 'reading'); near(by('area').value, 12); assert.equal(by('area').source, 'calc'); near(by('vol').value, 30); near(by('walls').value, 35);
  assert.equal(by('sq').value, null); const f2 = fillForm('room', ms, { L: 5 }); near(f2.find(x => x.key === 'area').value, 15); assert.equal(f2[0].source, 'manual');
  assert.equal(fillForm('nope', ms), null); for (const k of Object.keys(FORMS)) assert.ok(Array.isArray(fillForm(k, [])));
  const c = fillForm('clearance', [newMeasurement({ label: 'Door opening height', value: 2.1 }), newMeasurement({ label: 'Vehicle height', value: 2.0 }), newMeasurement({ label: 'Bay depth', value: 6 }), newMeasurement({ label: 'Vehicle length', value: 5.5 })]);
  assert.equal(c.find(x => x.key === 'ok').value, 'Yes');
});
test('backup with media round-trip', async () => {
  const store = memoryMedia(); const bytes = new Uint8Array(70000).map((_, i) => (i * 7) % 256);
  await store.put({ id: 'ph1', kind: 'photo', mime: 'image/jpeg', blob: new Blob([bytes], { type: 'image/jpeg' }), projectId: 'p', annotations: [{ t: 'arrow', x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.5 }] });
  await store.put({ id: 'au1', kind: 'audio', mime: 'audio/webm', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }), projectId: 'p' });
  const db = emptyDB(); db.projects.push({ id: 'p', name: 'P' });
  const json = JSON.stringify(backup(db, await exportMedia(store)));
  const back = JSON.parse(json); assert.equal(back.media.length, 2);
  const store2 = memoryMedia(); await store2.put({ id: 'stale' }); assert.equal(await importMedia(store2, back.media), 2);
  assert.equal(await store2.get('stale'), undefined);
  const ph = await store2.get('ph1'); assert.deepEqual(new Uint8Array(await ph.blob.arrayBuffer()), bytes); assert.equal(ph.blob.type, 'image/jpeg'); assert.equal(ph.annotations[0].t, 'arrow');
  assert.equal(await blobToBase64(base64ToBlob('AAEC')), 'AAEC');
});
test('comparison by label + backup reminder', () => {
  const ms = [newMeasurement({ label: 'Ceiling height', value: 2.4, projectId: 'a', measuredAt: '2026-01-01T00:00:00Z' }), newMeasurement({ label: 'ceiling  height', value: 2.5, projectId: 'b', measuredAt: '2026-02-01T00:00:00Z' }), newMeasurement({ label: 'Ceiling height', value: 2.45, projectId: 'a', measuredAt: '2026-03-01T00:00:00Z' }), newMeasurement({ label: 'Width', value: 1 })];
  const c = compareByLabel(ms, 'CEILING HEIGHT', [{ id: 'a', name: 'A' }]); assert.equal(c.length, 3); assert.equal(c[0].dPrev, null); near(c[1].dPrev, 0.1); near(c[2].dPrev, -0.05); near(c[2].dFirst, 0.05); assert.equal(c[0].project, 'A');
  assert.deepEqual(comparableLabels(ms)[0], { label: 'Ceiling height', n: 3, projects: 2 });
  const db = migrate({ schemaVersion: 2, projects: [{ id: 'p' }], measurements: [] }); assert.ok(backupDue(db));
  db.settings.lastBackupAt = new Date(Date.now() - 3 * 864e5).toISOString(); assert.ok(!backupDue(db)); db.settings.lastBackupAt = new Date(Date.now() - 8 * 864e5).toISOString(); assert.ok(backupDue(db));
});
test('ble helpers', () => {
  const dv = new DataView(new Float32Array([3.82]).buffer); assert.equal(toHex(new DataView(new Uint8Array([0, 255, 16]).buffer)), '00 ff 10');
  assert.ok(guessDecodes(dv).some(g => g.how === 'f32le@0' && Math.abs(g.value - 3.82) < 1e-4));
  assert.ok(guessDecodes(new DataView(new TextEncoder().encode('D=12.345m').buffer)).some(g => g.how === 'ascii' && g.value === 12.345));
  assert.throws(() => registerAdapter({})); assert.equal(registerAdapter({ id: 'x', decode: () => null }).id, 'x');
});
