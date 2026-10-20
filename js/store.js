import { emptyDB, migrate, auditEntry } from './model.js';
export const KEY = 'measureledger.v1';
export function load(storage = globalThis.localStorage) {
  try { const raw = storage.getItem(KEY); return raw ? migrate(JSON.parse(raw)) : emptyDB(); }
  catch (e) { console.warn('load failed', e); return emptyDB(); }
}
export function save(db, storage = globalThis.localStorage) { storage.setItem(KEY, JSON.stringify(db)); }
export function log(db, ...a) { db.audit.unshift(auditEntry(...a)); if (db.audit.length > 2000) db.audit.length = 2000; }
export function backup(db) { return { app: 'MeasureLedger', exportedAt: new Date().toISOString(), data: db }; }
export function filterMeasurements(list, { q = '', tag = '', mode = '', from = '', to = '', projectId = '' } = {}) {
  const s = q.trim().toLowerCase();
  return list.filter(m => (!projectId || m.projectId === projectId) && (!mode || m.mode === mode) && (!tag || (m.tags || []).includes(tag))
    && (!from || m.measuredAt.slice(0, 10) >= from) && (!to || m.measuredAt.slice(0, 10) <= to)
    && (!s || [m.label, m.notes, m.reference, m.original, m.group, ...(m.tags || [])].join(' ').toLowerCase().includes(s)));
}
