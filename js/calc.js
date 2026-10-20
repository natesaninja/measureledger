// Calculators. All inputs canonical meters / m² unless noted.
import { M_PER } from './units.js';
const FT2 = M_PER.ft ** 2;
export const area = (l, w) => l * w;
export const volume = (l, w, h) => l * w * h;
export const hypot = (a, b) => Math.sqrt(a * a + b * b);
export const leg = (c, a) => (c > a ? Math.sqrt(c * c - a * a) : NaN);
/** Squareness: compare two diagonals of a rectangle l×w. tol in meters. */
export function squareness(l, w, d1, d2, tol = 0.003) {
  const ideal = hypot(l, w);
  const diff = d2 == null ? d1 - ideal : d1 - d2;
  return { ideal, diff, square: Math.abs(diff) <= tol };
}
export function slope(rise, run) {
  const pct = (rise / run) * 100; const deg = Math.atan2(rise, run) * 180 / Math.PI;
  return { pct, deg, inPerFt: (rise / run) * 12 };
}
/** Flooring boxes: areaM2, coverage per box in ft², waste % */
export function flooringBoxes(areaM2, boxFt2, wastePct = 10) {
  const need = (areaM2 / FT2) * (1 + wastePct / 100);
  return { needFt2: need, boxes: Math.ceil(need / boxFt2 - 1e-9) };
}
/** Drywall sheets: wall area m², sheet w×h in ft, waste % */
export function drywallSheets(areaM2, sheetW = 4, sheetH = 8, wastePct = 10) {
  const need = (areaM2 / FT2) * (1 + wastePct / 100);
  return { needFt2: need, sheets: Math.ceil(need / (sheetW * sheetH) - 1e-9) };
}
/** Posts along a run: run length m, max spacing m -> posts, actual spacing */
export function posts(runM, maxSpacingM) {
  const spans = Math.max(1, Math.ceil(runM / maxSpacingM - 1e-9));
  return { posts: spans + 1, spacing: runM / spans, spans };
}
/** Cut list: pieces [m] from stock length with kerf; first-fit decreasing. */
export function cutList(pieces, stock, kerf = 0.003) {
  const bins = [];
  for (const p of [...pieces].sort((a, b) => b - a)) {
    if (p > stock) throw new Error('piece longer than stock');
    let b = bins.find(b => b.left >= p + (b.cuts.length ? kerf : 0));
    if (!b) { b = { cuts: [], left: stock }; bins.push(b); }
    b.left -= p + (b.cuts.length ? kerf : 0); b.cuts.push(p);
  }
  return bins;
}

/** Roof: rafter/hip helpers from pitch (deg) and horizontal run (m). */
export function rafter(runM, deg, overhangM = 0) { const c = Math.cos(deg * Math.PI / 180); return { rafter: (runM + overhangM) / c, rise: runM * Math.tan(deg * Math.PI / 180), factor: 1 / c }; }
/** Earthworks, grid method: depths[r][c] (m) at grid nodes, spacing dx, dy (m). Each cell volume = dx*dy*avg(4 corners). */
export function earthworksGrid(depths, dx, dy) {
  const rows = depths.length, cols = depths[0]?.length || 0;
  if (rows < 2 || cols < 2 || depths.some(r => r.length !== cols)) throw new Error('grid needs ≥2 rows × ≥2 cols of equal length');
  let v = 0, cells = 0;
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) { v += dx * dy * (depths[r][c] + depths[r][c + 1] + depths[r + 1][c] + depths[r + 1][c + 1]) / 4; cells++; }
  return { volume: v, area: dx * dy * cells, cells, avgDepth: v / (dx * dy * cells) };
}
/** Earthworks, average-depth method: area (m²) × mean of spot depths. swellPct for loose (truck) volume. */
export function earthworksAvg(areaM2, depths, swellPct = 0) {
  if (!depths.length) throw new Error('no depths'); const avg = depths.reduce((a, b) => a + b, 0) / depths.length;
  const bank = areaM2 * avg; return { volume: bank, loose: bank * (1 + swellPct / 100), avgDepth: avg };
}
