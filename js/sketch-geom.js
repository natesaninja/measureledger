// Pure room-plan geometry. A room is drawn as a polyline of points (drawn meters); walls can be
// assigned true lengths (from readings). The solver rescales so the plan reflects true dimensions.
import { uid } from './model.js';

export function newRoom(o = {}) {
  return { id: uid('r'), projectId: o.projectId || null, name: o.name || 'Room', floor: o.floor || 'Ground', height: o.height ?? 2.44,
    pts: o.pts || [], closed: !!o.closed, walls: o.walls || [], openings: o.openings || [], diagonals: o.diagonals || [],
    offset: o.offset || { x: 0, y: 0 }, notes: o.notes || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}
export const wallCount = r => (r.closed ? r.pts.length : Math.max(0, r.pts.length - 1));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/** Snap a point relative to prev: grid (m) and angle step (deg). */
export function snapPoint(prev, p, { grid = 0.1, angleStep = 45 } = {}) {
  if (!prev) return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
  let len = Math.round(dist(prev, p) / grid) * grid; let ang = Math.atan2(p.y - prev.y, p.x - prev.x);
  if (angleStep) { const st = angleStep * Math.PI / 180; ang = Math.round(ang / st) * st; }
  return { x: +(prev.x + Math.cos(ang) * len).toFixed(6), y: +(prev.y + Math.sin(ang) * len).toFixed(6) };
}

/** resolve(room, lookup) -> solved geometry. lookup(measId) -> meters|null */
export function solveRoom(room, lookup = () => null) {
  const n = wallCount(room), P = room.pts;
  const drawn = [], dirs = [], assigned = [];
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % P.length], d = dist(a, b);
    drawn.push(d); dirs.push(d ? { x: (b.x - a.x) / d, y: (b.y - a.y) / d } : { x: 1, y: 0 });
    const w = room.walls[i] || {}; const L = w.length ?? (w.measId ? lookup(w.measId) : null);
    assigned.push(L != null && L > 0 ? L : null);
  }
  const ratios = assigned.map((L, i) => (L && drawn[i] ? L / drawn[i] : null)).filter(Boolean).sort((a, b) => a - b);
  const scale = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;
  const lengths = assigned.map((L, i) => L ?? drawn[i] * scale);
  // Closed room: adjust unassigned walls (least change from their scaled drawn length) so the outline closes.
  const free = assigned.map((L, i) => (L == null ? i : -1)).filter(i => i >= 0);
  if (room.closed && free.length >= 2 && free.length < n) {
    let rx = 0, ry = 0; for (let i = 0; i < n; i++) { rx -= dirs[i].x * lengths[i]; ry -= dirs[i].y * lengths[i]; }
    let a = 0, b = 0, d = 0; for (const j of free) { a += dirs[j].x ** 2; b += dirs[j].x * dirs[j].y; d += dirs[j].y ** 2; }
    const det = a * d - b * b;
    if (Math.abs(det) > 1e-9) {
      const lx = (d * rx - b * ry) / det, ly = (a * ry - b * rx) / det;
      const adj = free.map(j => lengths[j] + dirs[j].x * lx + dirs[j].y * ly);
      if (adj.every(t => t > 0)) free.forEach((j, k) => (lengths[j] = adj[k]));
    }
  }
  const o = P[0] ? { x: P[0].x * scale, y: P[0].y * scale } : { x: 0, y: 0 };
  const verts = [o];
  for (let i = 0; i < n; i++) { const v = verts[i]; verts.push({ x: v.x + dirs[i].x * lengths[i], y: v.y + dirs[i].y * lengths[i] }); }
  let closure = 0;
  if (room.closed && n) { closure = dist(verts[n], verts[0]); verts.pop(); }
  const perimeter = lengths.reduce((a, b) => a + b, 0);
  const area = room.closed ? Math.abs(shoelace(verts)) : 0;
  const h = room.height || 0;
  const wallInfo = lengths.map((L, i) => {
    const ops = room.openings.filter(op => op.wall === i);
    const opArea = ops.reduce((s, op) => s + (op.width || 0) * (op.height || 0), 0);
    return { index: i, length: L, assigned: assigned[i] != null, label: room.walls[i]?.label || wallName(i), gross: L * h, openings: opArea, net: Math.max(0, L * h - opArea) };
  });
  const diagonals = room.diagonals.map(d => {
    const a = verts[d.a], b = verts[d.b]; if (!a || !b) return { ...d, plan: null };
    const plan = dist(a, b); const meas = d.length ?? (d.measId ? lookup(d.measId) : null);
    return { ...d, plan, measured: meas, diff: meas != null ? meas - plan : null };
  });
  return { verts, lengths, scale, closure, perimeter, area, volume: area * h, wallInfo,
    grossWall: wallInfo.reduce((s, w) => s + w.gross, 0), openingArea: wallInfo.reduce((s, w) => s + w.openings, 0), netWall: wallInfo.reduce((s, w) => s + w.net, 0), diagonals };
}
export function shoelace(v) { let s = 0; for (let i = 0; i < v.length; i++) { const a = v[i], b = v[(i + 1) % v.length]; s += a.x * b.y - b.x * a.y; } return s / 2; }
export const wallName = i => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');
/** Squareness of a 4-wall room: compare the two diagonals of the solved plan */
export function planSquareness(solved, tol = 0.003) {
  if (solved.verts.length !== 4) return null;
  const v = solved.verts, d1 = dist(v[0], v[2]), d2 = dist(v[1], v[3]);
  return { d1, d2, diff: d1 - d2, square: Math.abs(d1 - d2) <= tol };
}
/** Opening position along wall i: returns segment endpoints in plan coords. */
export function openingSegment(solved, op) {
  const a = solved.verts[op.wall], b = solved.verts[(op.wall + 1) % solved.verts.length]; if (!a || !b) return null;
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  const s = Math.max(0, Math.min(L, op.offset || 0)), e = Math.max(0, Math.min(L, s + (op.width || 0)));
  return { a: { x: a.x + ux * s, y: a.y + uy * s }, b: { x: a.x + ux * e, y: a.y + uy * e } };
}
/** Bounding box of solved verts (+offset) */
export function bbox(points) { const xs = points.map(p => p.x), ys = points.map(p => p.y); return xs.length ? { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) } : { minX: 0, minY: 0, maxX: 1, maxY: 1 }; }

/** Render rooms to a standalone SVG string (y down, meters → px). */
export function planSVG(rooms, solvedList, { fmtLen = v => v.toFixed(2) + ' m', fmtArea = v => v.toFixed(2) + ' m²', pxPerM = 60, pad = 40, theme = 'light' } = {}) {
  const all = solvedList.flatMap((s, i) => s.verts.map(v => ({ x: v.x + rooms[i].offset.x, y: v.y + rooms[i].offset.y })));
  const b = bbox(all); const W = (b.maxX - b.minX) * pxPerM + pad * 2, H = (b.maxY - b.minY) * pxPerM + pad * 2;
  const X = x => ((x - b.minX) * pxPerM + pad).toFixed(1), Y = y => ((y - b.minY) * pxPerM + pad).toFixed(1);
  const fg = theme === 'dark' ? '#e8eaed' : '#111', ac = '#0a7d2c';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" font-family="system-ui,sans-serif" font-size="12">`;
  if (theme !== 'dark') out += `<rect width="100%" height="100%" fill="#fff"/>`;
  rooms.forEach((r, ri) => {
    const s = solvedList[ri], ox = r.offset.x, oy = r.offset.y, v = s.verts.map(p => ({ x: p.x + ox, y: p.y + oy }));
    if (v.length < 2) return;
    out += `<polygon points="${v.map(p => X(p.x) + ',' + Y(p.y)).join(' ')}" fill="${r.closed ? ac + '22' : 'none'}" stroke="none"/>`;
    s.wallInfo.forEach((w, i) => {
      const a = v[i], c = v[(i + 1) % v.length]; const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
      out += `<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(c.x)}" y2="${Y(c.y)}" stroke="${fg}" stroke-width="4" stroke-linecap="round"${w.assigned ? '' : ' stroke-dasharray="8 5"'}/>`;
      out += `<text x="${X(mx)}" y="${Y(my)}" dy="-6" text-anchor="middle" fill="${fg}" stroke="${theme === 'dark' ? '#111' : '#fff'}" stroke-width="3" paint-order="stroke">${esc(w.label)}: ${esc(fmtLen(w.length))}</text>`;
    });
    r.openings.forEach(op => { const seg = openingSegment(s, op); if (seg) out += `<line x1="${X(seg.a.x + ox)}" y1="${Y(seg.a.y + oy)}" x2="${X(seg.b.x + ox)}" y2="${Y(seg.b.y + oy)}" stroke="${op.type === 'window' ? '#2b7bd8' : '#d8892b'}" stroke-width="8"/>`; });
    if (r.closed) { const c = v.reduce((a, p) => ({ x: a.x + p.x / v.length, y: a.y + p.y / v.length }), { x: 0, y: 0 }); out += `<text x="${X(c.x)}" y="${Y(c.y)}" text-anchor="middle" font-weight="700" fill="${fg}">${esc(r.name)}</text><text x="${X(c.x)}" y="${Y(c.y)}" dy="15" text-anchor="middle" fill="${fg}">${esc(fmtArea(s.area))}</text>`; }
  });
  return out + '</svg>';
}
/** Moasure-style point CSV rows: vertices with x,y,z (meters or ft). */
export function pointsCSV(rooms, solvedList, unit = 'm') {
  const k = unit === 'ft' ? 1 / 0.3048 : 1; const rows = ['Point,X,Y,Z,Room,Floor,Label,Unit'];
  let n = 1; rooms.forEach((r, i) => solvedList[i].verts.forEach((v, j) => rows.push([n++, ((v.x + r.offset.x) * k).toFixed(4), (-(v.y + r.offset.y) * k).toFixed(4), '0.0000', `"${r.name.replace(/"/g, '""')}"`, `"${r.floor.replace(/"/g, '""')}"`, `P${j + 1}`, unit].join(','))));
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}
