// Versioned schema + migrations. See docs/DATA_MODEL.md
export const SCHEMA_VERSION = 3;
export const MODES = ['distance', 'area', 'volume', 'p2p', 'pythagorean', 'continuous', 'angle', 'manual', 'pitch'];
export const KINDS = ['length', 'area', 'volume', 'angle', 'slope'];
export const SOURCES = ['manual', 'paste', 'csv', 'ble', 'template', 'import'];
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();

export function emptyDB() { return { schemaVersion: SCHEMA_VERSION, projects: [], measurements: [], audit: [], rooms: [], calcs: [], settings: { unit: 'ftin', theme: 'dark', denom: 16, lastBackupAt: null } }; }
export function newProject(o = {}) { const t = now(); return { id: uid('p'), name: o.name || 'Untitled project', description: o.description || '', tags: o.tags || [], favorite: !!o.favorite, archived: false, template: o.template || null, form: o.form || {}, createdAt: t, updatedAt: t }; }
export function newMeasurement(o = {}) {
  const t = now();
  return { id: uid('m'), projectId: o.projectId || null, label: o.label || '', value: o.value ?? null, kind: o.kind || 'length',
    unit: o.unit || 'm', original: o.original || '', mode: o.mode || 'distance', reference: o.reference || 'rear', group: o.group || '',
    notes: o.notes || '', tags: o.tags || [], photoIds: o.photoIds || [], favorite: !!o.favorite, source: o.source || 'manual',
    device: o.device || null, measuredAt: o.measuredAt || t, createdAt: t, updatedAt: t };
}
export function auditEntry(action, entity, entityId, summary, projectId = null) { return { id: uid('a'), at: now(), action, entity, entityId, projectId, summary }; }

/** Migrate any older shape to SCHEMA_VERSION. Pure. */
export function migrate(db) {
  if (!db || typeof db !== 'object') return emptyDB();
  db = structuredClone(db);
  let v = db.schemaVersion || db.version || 1;
  if (v < 2) { // v1: measurements nested in project.measurements, value in valueM, no kind/source
    db.projects = db.projects || []; db.measurements = db.measurements || [];
    for (const p of db.projects) {
      for (const m of p.measurements || []) db.measurements.push({ ...m, projectId: p.id, value: m.value ?? m.valueM ?? null });
      delete p.measurements; p.archived = !!p.archived; p.favorite = !!p.favorite; p.tags = p.tags || [];
    }
    db.measurements = db.measurements.map(m => { const { valueM, ...r } = m; return { ...newMeasurement(), ...r, kind: r.kind || 'length', source: r.source || 'manual', tags: r.tags || [], photoIds: r.photoIds || [] }; });
    db.audit = db.audit || []; db.settings = { ...emptyDB().settings, ...(db.settings || {}) }; delete db.version;
    v = 2;
  }
  if (v < 3) { // v3: room plans, saved calculator results, backup reminder, per-project form values
    db.rooms = db.rooms || []; db.calcs = db.calcs || []; db.settings = { ...emptyDB().settings, ...(db.settings || {}) };
    for (const p of db.projects) p.form = p.form || {};
    v = 3;
  }
  db.schemaVersion = v; return db;
}
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') return 'Not a JSON object';
  if (obj.app && obj.app !== 'MeasureLedger') return 'Not a MeasureLedger backup';
  const d = obj.data || obj; if (!Array.isArray(d.projects)) return 'Missing projects';
  if ((d.schemaVersion || 1) > SCHEMA_VERSION) return 'Backup is from a newer version';
  return null;
}
