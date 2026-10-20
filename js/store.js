import { emptyDB, migrate, auditEntry } from './model.js';
export const KEY = 'measureledger.v1';
export function load(storage = globalThis.localStorage) {
  try { const raw = storage.getItem(KEY); return raw ? migrate(JSON.parse(raw)) : emptyDB(); }
  catch (e) { console.warn('load failed', e); return emptyDB(); }
}
export function save(db, storage = globalThis.localStorage) { storage.setItem(KEY, JSON.stringify(db)); }
export function log(db, ...a) { db.audit.unshift(auditEntry(...a)); if (db.audit.length > 2000) db.audit.length = 2000; }
export function backup(db, media) { const b = { app: 'MeasureLedger', exportedAt: new Date().toISOString(), data: db }; if (media) b.media = media; return b; }
export function filterMeasurements(list, { q = '', tag = '', mode = '', from = '', to = '', projectId = '' } = {}) {
  const s = q.trim().toLowerCase();
  return list.filter(m => (!projectId || m.projectId === projectId) && (!mode || m.mode === mode) && (!tag || (m.tags || []).includes(tag))
    && (!from || m.measuredAt.slice(0, 10) >= from) && (!to || m.measuredAt.slice(0, 10) <= to)
    && (!s || [m.label, m.notes, m.reference, m.original, m.group, ...(m.tags || [])].join(' ').toLowerCase().includes(s)));
}

const normLabel = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
/** Comparison: every measurement with the same (normalized) label, oldest→newest, with Δ vs previous and vs first. */
export function compareByLabel(measurements, label, projects = []) {
  const k = normLabel(label); const pn = id => projects.find(p => p.id === id)?.name || '';
  const rows = measurements.filter(m => normLabel(m.label) === k && m.value != null).sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
  return rows.map((m, i) => ({ id: m.id, projectId: m.projectId, project: pn(m.projectId), group: m.group, kind: m.kind, measuredAt: m.measuredAt, value: m.value,
    dPrev: i ? m.value - rows[i - 1].value : null, dFirst: i ? m.value - rows[0].value : null }));
}
/** Labels occurring 2+ times (candidates for comparison) with counts. */
export function comparableLabels(measurements) {
  const c = new Map(); for (const m of measurements) if (m.label && m.value != null) { const k = normLabel(m.label); const e = c.get(k) || { label: m.label, n: 0, projects: new Set() }; e.n++; e.projects.add(m.projectId); c.set(k, e); }
  return [...c.values()].map(e => ({ label: e.label, n: e.n, projects: e.projects.size })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}
export const backupDue = (db, now = Date.now()) => (db.projects.length > 0) && (!db.settings.lastBackupAt || now - Date.parse(db.settings.lastBackupAt) > 7 * 864e5);
