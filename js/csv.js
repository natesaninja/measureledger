import { parseLength, formatLength, formatValue } from './units.js';
import { newMeasurement, MODES } from './model.js';

export function csvEscape(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
export function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"' && f === '') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
export const CSV_COLS = ['id', 'label', 'value_display', 'value_m', 'kind', 'mode', 'unit', 'reference', 'tags', 'notes', 'favorite', 'source', 'createdAt', 'updatedAt'];
export function toCSV(measurements, unit = 'ftin', bom = true) {
  const lines = [CSV_COLS.join(',')];
  for (const m of measurements) lines.push([m.id, m.label, formatValue(m, unit), m.value, m.kind, m.mode, m.unit, m.reference, (m.tags || []).join(';'), m.notes, m.favorite ? 1 : 0, m.source, m.createdAt, m.updatedAt].map(csvEscape).join(','));
  return (bom ? '\uFEFF' : '') + lines.join('\r\n') + '\r\n';
}
/** Parse pasted text or CSV into draft measurements + errors. Never throws. */
export function parseImport(text, { defaultUnit = 'ft', source } = {}) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const out = [], errors = [];
  const firstLine = text.split(/\r?\n/).find(l => l.trim()) || '';
  const isCSV = firstLine.includes(',') && /label|value|name/i.test(firstLine);
  if (isCSV) {
    const rows = parseCSV(text); const head = rows.shift().map(h => h.trim().toLowerCase());
    const col = (...n) => head.findIndex(h => n.includes(h));
    const ci = { label: col('label', 'name'), val: col('value_m'), disp: col('value_display', 'value', 'measurement'), mode: col('mode'), kind: col('kind'), ref: col('reference', 'ref'), tags: col('tags'), notes: col('notes') };
    rows.forEach((r, i) => {
      const g = k => (ci[k] >= 0 ? (r[ci[k]] || '').trim() : '');
      let meters, unit; const kind = g('kind') || 'length';
      if (g('val') !== '' && !isNaN(+g('val'))) { meters = +g('val'); unit = 'm'; }
      else { const p = kind === 'length' ? parseLength(g('disp'), defaultUnit) : (isNaN(parseFloat(g('disp'))) ? null : { meters: parseFloat(g('disp')), unit: 'm' }); if (!p) { errors.push({ line: i + 2, text: r.join(','), error: 'unparseable value' }); return; } meters = p.meters; unit = p.unit; }
      out.push(newMeasurement({ label: g('label'), value: meters, unit, kind, original: g('disp'), mode: MODES.includes(g('mode')) ? g('mode') : 'distance', reference: g('ref'), tags: g('tags') ? g('tags').split(/[;|]/).map(t => t.trim()).filter(Boolean) : [], notes: g('notes'), source: source || 'csv' }));
    });
    return { items: out, errors, format: 'csv' };
  }
  // Notes: "Label: 12' 6"", "Label - 3.82 m", "Label = 10ft #tag", or bare value
  text.split(/\r?\n/).forEach((line, i) => {
    let l = line.trim(); if (!l) return;
    const tags = []; l = l.replace(/#([\w-]+)/g, (_, t) => (tags.push(t), '')).trim();
    let label = '', val = l;
    const m = l.match(/^(.*?)\s*[:=\t]\s*(.+)$/) || l.match(/^(.*?[a-z].*?)\s+-\s+(.+)$/i);
    if (m) { label = m[1]; val = m[2]; }
    let p = parseLength(val, defaultUnit);
    if (!p && !m) { const mm = l.match(/^(.*?)\s+([\d][\d\s.\/'"ftinmc-]*)$/i); if (mm) { const q = parseLength(mm[2], defaultUnit); if (q) { label = mm[1]; p = q; val = mm[2]; } } }
    if (!p) { errors.push({ line: i + 1, text: line, error: 'unparseable value' }); return; }
    out.push(newMeasurement({ label: label.trim(), value: p.meters, unit: p.unit, original: val.trim(), tags, source: source || 'paste' }));
  });
  return { items: out, errors, format: 'text' };
}
