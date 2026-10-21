// Job forms: per-template field lists filled from readings (by label match) or derived formulas.
// Field kinds: length|area|volume|slope|number|text|check. `from` = measurement label(s) to match; `calc` = derived.
export const FORMS = {
  room: { title: 'Room survey', fields: [
    { key: 'L', label: 'Length', kind: 'length', from: ['Length'] }, { key: 'W', label: 'Width', kind: 'length', from: ['Width'] },
    { key: 'H', label: 'Ceiling height', kind: 'length', from: ['Ceiling height'] },
    { key: 'area', label: 'Floor area', kind: 'area', calc: v => v.L * v.W }, { key: 'vol', label: 'Room volume', kind: 'volume', calc: v => v.L * v.W * v.H },
    { key: 'walls', label: 'Gross wall area', kind: 'area', calc: v => 2 * (v.L + v.W) * v.H },
    { key: 'sq', label: 'Diagonals match (Δ)', kind: 'length', calc: v => v.dA - v.dB, needs: ['dA', 'dB'] },
    { key: 'dA', label: 'Diagonal A', kind: 'length', from: ['Diagonal A'] }, { key: 'dB', label: 'Diagonal B', kind: 'length', from: ['Diagonal B'] },
    { key: 'notes', label: 'Notes', kind: 'text' }] },
  exterior: { title: 'Exterior wall', fields: [
    { key: 'L', label: 'Wall length', kind: 'length', from: ['Wall length'] }, { key: 'H', label: 'Wall height', kind: 'length', from: ['Wall height'] },
    { key: 'gross', label: 'Gross area', kind: 'area', calc: v => v.L * v.H },
    { key: 'open', label: 'Openings area', kind: 'area', calc: v => (v.w1w || 0) * (v.w1h || 0) + (v.dw || 0) * (v.dh || 0), needs: [] },
    { key: 'net', label: 'Net siding area', kind: 'area', calc: v => v.L * v.H - ((v.w1w || 0) * (v.w1h || 0) + (v.dw || 0) * (v.dh || 0)), needs: ['L', 'H'] },
    { key: 'w1w', label: 'Window 1 width', kind: 'length', from: ['Window 1 width'] }, { key: 'w1h', label: 'Window 1 height', kind: 'length', from: ['Window 1 height'] },
    { key: 'dw', label: 'Door width', kind: 'length', from: ['Door width'] }, { key: 'dh', label: 'Door height', kind: 'length', from: ['Door height'] }] },
  deck: { title: 'Deck layout', fields: [
    { key: 'L', label: 'Deck length', kind: 'length', from: ['Deck length'] }, { key: 'W', label: 'Deck width', kind: 'length', from: ['Deck width'] },
    { key: 'area', label: 'Deck area', kind: 'area', calc: v => v.L * v.W }, { key: 'sq', label: 'Diagonal Δ (A−B)', kind: 'length', calc: v => v.dA - v.dB, needs: ['dA', 'dB'] },
    { key: 'dA', label: 'Diagonal A', kind: 'length', from: ['Diagonal A'] }, { key: 'dB', label: 'Diagonal B', kind: 'length', from: ['Diagonal B'] },
    { key: 'H', label: 'Height above grade', kind: 'length', from: ['Height above grade'] }, { key: 'rail', label: 'Guard required (>30")', kind: 'text', calc: v => (v.H > 0.762 ? 'Yes' : 'No'), needs: ['H'] }] },
  clearance: { title: 'Vehicle clearance', fields: [
    { key: 'door', label: 'Door opening height', kind: 'length', from: ['Door opening height'] }, { key: 'vh', label: 'Vehicle height', kind: 'length', from: ['Vehicle height'] },
    { key: 'clr', label: 'Door clearance', kind: 'length', calc: v => v.door - v.vh }, { key: 'depth', label: 'Bay depth', kind: 'length', from: ['Bay depth'] },
    { key: 'vl', label: 'Vehicle length', kind: 'length', from: ['Vehicle length'] }, { key: 'lclr', label: 'Length clearance', kind: 'length', calc: v => v.depth - v.vl },
    { key: 'lift', label: 'Lift arm clearance', kind: 'length', from: ['Lift arm clearance'] }, { key: 'ok', label: 'Fits', kind: 'text', calc: v => (v.door - v.vh > 0 && v.depth - v.vl > 0 ? 'Yes' : 'NO'), needs: ['door', 'vh', 'depth', 'vl'] }] },
  cabinet: { title: 'Cabinet fit', fields: [
    { key: 'run', label: 'Wall run', kind: 'length', from: ['Wall run'] }, { key: 'ow', label: 'Opening width', kind: 'length', from: ['Opening width'] },
    { key: 'oh', label: 'Opening height', kind: 'length', from: ['Opening height'] }, { key: 'd', label: 'Depth available', kind: 'length', from: ['Depth available'] },
    { key: 'cab', label: 'Cabinet width planned', kind: 'length' }, { key: 'gap', label: 'Filler needed', kind: 'length', calc: v => v.ow - v.cab }] },
  plumbing: { title: 'Plumbing run', fields: [
    { key: 'run', label: 'Drain run', kind: 'length', from: ['Drain run'] }, { key: 'fall', label: 'Fall', kind: 'length', from: ['Fall (slope)', 'Fall'] },
    { key: 'slope', label: 'Slope', kind: 'slope', calc: v => Math.atan2(v.fall, v.run) * 180 / Math.PI },
    { key: 'inft', label: 'in/ft (¼" min for ≤3")', kind: 'number', calc: v => (v.fall / v.run) * 12 }, { key: 'supply', label: 'Supply run', kind: 'length', from: ['Supply run'] }] },
  fence: { title: 'Fence line', fields: [
    { key: 'r1', label: 'Run 1', kind: 'length', from: ['Run 1'] }, { key: 'r2', label: 'Run 2', kind: 'length', from: ['Run 2'] },
    { key: 'gate', label: 'Gate opening', kind: 'length', from: ['Gate opening'] }, { key: 'total', label: 'Total fence (minus gate)', kind: 'length', calc: v => (v.r1 || 0) + (v.r2 || 0) - (v.gate || 0), needs: ['r1'] },
    { key: 'sp', label: 'Post spacing', kind: 'length', from: ['Post spacing'] }, { key: 'posts', label: 'Posts (approx.)', kind: 'number', calc: v => Math.ceil(((v.r1 || 0) + (v.r2 || 0)) / v.sp) + 1 + (v.r2 ? 1 : 0), needs: ['r1', 'sp'] }] },
  flooring: { title: 'Flooring', fields: [
    { key: 'L', label: 'Room length', kind: 'length', from: ['Room length'] }, { key: 'W', label: 'Room width', kind: 'length', from: ['Room width'] },
    { key: 'cL', label: 'Closet length', kind: 'length', from: ['Closet length'] }, { key: 'cW', label: 'Closet width', kind: 'length', from: ['Closet width'] },
    { key: 'area', label: 'Total area', kind: 'area', calc: v => v.L * v.W + (v.cL || 0) * (v.cW || 0), needs: ['L', 'W'] },
    { key: 'boxft', label: 'Box coverage (ft²)', kind: 'number' }, { key: 'boxes', label: 'Boxes (+10%)', kind: 'number', calc: v => Math.ceil((v.L * v.W + (v.cL || 0) * (v.cW || 0)) / 0.09290304 * 1.1 / v.boxft), needs: ['L', 'W', 'boxft'] }] },
};
const norm = s => String(s || '').trim().toLowerCase();
/** fillForm(templateId, measurements, manual) -> [{key,label,kind,value,source:'reading'|'calc'|'manual'|null, measId}] */
export function fillForm(tid, measurements, manual = {}) {
  const def = FORMS[tid]; if (!def) return null;
  const v = {}, out = {};
  for (const f of def.fields) {
    if (manual[f.key] != null && manual[f.key] !== '') { v[f.key] = manual[f.key]; out[f.key] = { value: manual[f.key], source: 'manual' }; continue; }
    if (f.from) {
      const m = measurements.filter(x => x.value != null && f.from.map(norm).includes(norm(x.label))).sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
      if (m) { v[f.key] = m.value; out[f.key] = { value: m.value, source: 'reading', measId: m.id }; }
    }
  }
  for (const f of def.fields) {
    if (!f.calc || out[f.key]) continue;
    const needs = f.needs ?? (String(f.calc).match(/v\.(\w+)/g) || []).map(s => s.slice(2));
    if (needs.every(k => typeof v[k] === 'number' && isFinite(v[k]))) { try { const r = f.calc(v); if (r != null && (typeof r === 'string' || isFinite(r))) { v[f.key] = r; out[f.key] = { value: r, source: 'calc' }; } } catch { } }
  }
  return def.fields.map(f => ({ key: f.key, label: f.label, kind: f.kind, editable: !f.calc && !f.from || f.kind === 'text' || f.kind === 'number' || !!f.from, value: out[f.key]?.value ?? null, source: out[f.key]?.source ?? null, measId: out[f.key]?.measId }));
}
