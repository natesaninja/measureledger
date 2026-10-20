// Minimal DXF (R12 ASCII) writer: walls as LINEs, labels as TEXT, openings on their own layer,
// optional 3D extrusion of walls as 3DFACEs to room height. Units: meters ($INSUNITS 6). Y is flipped (DXF y-up).
import { openingSegment } from './sketch-geom.js';
const g = (code, val) => `${code}\n${val}\n`;
const f = n => (+n).toFixed(4);
export function planDXF(rooms, solvedList, { extrude = false, labels = true } = {}) {
  let s = g(0, 'SECTION') + g(2, 'HEADER') + g(9, '$ACADVER') + g(1, 'AC1009') + g(9, '$INSUNITS') + g(70, 6) + g(0, 'ENDSEC');
  s += g(0, 'SECTION') + g(2, 'TABLES') + g(0, 'TABLE') + g(2, 'LAYER') + g(70, 4);
  for (const [name, color] of [['WALLS', 7], ['OPENINGS', 30], ['LABELS', 3], ['WALLS3D', 8]]) s += g(0, 'LAYER') + g(2, name) + g(70, 0) + g(62, color) + g(6, 'CONTINUOUS');
  s += g(0, 'ENDTAB') + g(0, 'ENDSEC') + g(0, 'SECTION') + g(2, 'ENTITIES');
  rooms.forEach((r, ri) => {
    const sol = solvedList[ri], ox = r.offset.x, oy = r.offset.y, v = sol.verts.map(p => ({ x: p.x + ox, y: -(p.y + oy) }));
    const h = r.height || 0;
    sol.wallInfo.forEach((w, i) => {
      const a = v[i], b = v[(i + 1) % v.length];
      s += g(0, 'LINE') + g(8, 'WALLS') + g(10, f(a.x)) + g(20, f(a.y)) + g(30, f(0)) + g(11, f(b.x)) + g(21, f(b.y)) + g(31, f(0));
      if (extrude && h) s += g(0, '3DFACE') + g(8, 'WALLS3D') + g(10, f(a.x)) + g(20, f(a.y)) + g(30, f(0)) + g(11, f(b.x)) + g(21, f(b.y)) + g(31, f(0)) + g(12, f(b.x)) + g(22, f(b.y)) + g(32, f(h)) + g(13, f(a.x)) + g(23, f(a.y)) + g(33, f(h));
      if (labels) s += g(0, 'TEXT') + g(8, 'LABELS') + g(10, f((a.x + b.x) / 2)) + g(20, f((a.y + b.y) / 2)) + g(30, f(0)) + g(40, f(0.15)) + g(1, `${w.label} ${w.length.toFixed(3)}m`);
    });
    for (const op of r.openings) {
      const seg = openingSegment(sol, op); if (!seg) continue;
      s += g(0, 'LINE') + g(8, 'OPENINGS') + g(10, f(seg.a.x + ox)) + g(20, f(-(seg.a.y + oy))) + g(30, f(op.sill || 0)) + g(11, f(seg.b.x + ox)) + g(21, f(-(seg.b.y + oy))) + g(31, f(op.sill || 0));
    }
    if (labels && r.closed && v.length) { const c = v.reduce((a, p) => ({ x: a.x + p.x / v.length, y: a.y + p.y / v.length }), { x: 0, y: 0 }); s += g(0, 'TEXT') + g(8, 'LABELS') + g(10, f(c.x)) + g(20, f(c.y)) + g(30, f(0)) + g(40, f(0.25)) + g(1, `${r.name} ${sol.area.toFixed(2)}m2`); }
  });
  return s + g(0, 'ENDSEC') + g(0, 'EOF');
}
