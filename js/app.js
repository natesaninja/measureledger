import { parseLength, formatLength, formatValue, formatArea, formatVolume, M_PER, parseArea, parseVolume, parseAngle, formatPitch, pitchFromDeg } from './units.js';
import * as calc from './calc.js';
import { newProject, newMeasurement, MODES, KINDS, migrate, validateBackup, uid, SCHEMA_VERSION } from './model.js';
import { load, save, log, backup, filterMeasurements, compareByLabel, comparableLabels, backupDue } from './store.js';
import { openMedia, memoryMedia, exportMedia, importMedia } from './media.js';
import { FORMS, fillForm } from './forms.js';
import { bleSupported } from './ble.js';
import { toCSV, parseImport } from './csv.js';
import { TEMPLATES } from './templates.js';

let db = load();
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const UNITS = [['ftin', 'ft-in'], ['ft', 'dec ft'], ['in', 'in'], ['m', 'm'], ['cm', 'cm'], ['mm', 'mm']];
const unit = () => db.settings.unit;
const fmt = m => (m.value == null ? '—' : formatValue(m, unit()));
const fl = v => formatLength(v, unit(), { denom: db.settings.denom });
const now = () => new Date().toISOString();
const proj = id => db.projects.find(p => p.id === id);
const measOf = pid => db.measurements.filter(m => m.projectId === pid);
const media = (() => { try { return globalThis.indexedDB ? openMedia() : memoryMedia(); } catch { return memoryMedia(); } })();
const ctx = {
  get db() { return db; }, media, persist: () => persist(), toast: m => toast(m), modal: (...a) => modal(...a), confirmBox: (...a) => confirmBox(...a), esc: s => esc(s),
  fl: v => fl(v), fmt: m => fmt(m), unit: () => unit(), fmtArea: v => formatArea(v, unit()), fmtVol: v => formatVolume(v, unit()),
  download: (...a) => download(...a), downloadBlob: (n, b) => downloadBlob(n, b), log: (...a) => log(db, ...a), render: () => render(), proj: id => proj(id), measOf: id => measOf(id), touch: id => touch(id),
};

function persist() {
  try { save(db); } catch (e) { toast('Save failed: storage full?'); console.error(e); }
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200); }
function applySettings() {
  document.documentElement.dataset.theme = db.settings.theme;
  $('#unitBtn').textContent = UNITS.find(u => u[0] === unit())?.[1] || unit();
}
function download(name, text, type = 'text/plain') { downloadBlob(name, new Blob([text], { type })); }
function downloadBlob(name, blob) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const slug = s => (s || 'project').replace(/[^\w-]+/g, '_').slice(0, 40);
const stamp = () => new Date().toISOString().slice(0, 10);

/** Modal: returns Promise<FormData|null>. html contains fields; buttons [{v,label,cls}] */
function modal(title, html, buttons = [{ v: 'ok', label: 'Save', cls: 'primary' }], onOpen) {
  const dlg = $('#dlg'), form = $('#dlgForm');
  form.innerHTML = `<h1>${esc(title)}</h1>${html}<div class="row" style="margin-top:1rem"><button value="cancel" formnovalidate>Cancel</button>${buttons.map(b => `<button value="${b.v}" class="${b.cls || ''}">${esc(b.label)}</button>`).join('')}</div>`;
  onOpen?.(form);
  dlg.showModal();
  return new Promise(res => dlg.addEventListener('close', () => {
    const v = dlg.returnValue; res(v && v !== 'cancel' ? { action: v, data: new FormData(form), form } : null);
  }, { once: true }));
}
async function confirmBox(msg, label = 'Delete') { return !!(await modal('Confirm', `<p>${esc(msg)}</p>`, [{ v: 'ok', label, cls: 'danger' }])); }

// ---------- Router ----------
const routes = [
  [/^#?\/?$/, viewProjects], [/^#\/p\/([\w-]+)$/, viewProject], [/^#\/report\/([\w-]+)(?:\/(detailed))?$/, viewReport],
  [/^#\/plan\/([\w-]+)$/, id => import('./sketch.js').then(m => m.viewPlan(ctx, app, id))], [/^#\/compare(?:\?(.*))?$/, viewCompare], [/^#\/ble$/, viewBLE],
  [/^#\/search$/, viewSearch], [/^#\/calc$/, viewCalc], [/^#\/settings$/, viewSettings], [/^#\/audit$/, viewAudit],
];
function render() {
  applySettings();
  const h = location.hash || '#/';
  for (const [re, fn] of routes) { const m = h.match(re); if (m) { fn(...m.slice(1)); window.scrollTo?.(0, 0); return; } }
  app.innerHTML = `<p class="empty">Not found. <a href="#/">Projects</a></p>`;
}
window.addEventListener('hashchange', render);

// ---------- Projects ----------
function projectItem(p) {
  const ms = measOf(p.id); const last = ms.reduce((a, m) => (m.updatedAt > a ? m.updatedAt : a), p.updatedAt);
  return `<li class="item"><button class="star ${p.favorite ? 'on' : ''}" data-fav="${p.id}" aria-label="Favorite">★</button>
  <a class="main" href="#/p/${p.id}"><div class="t">${esc(p.name)}${p.archived ? ' <span class="tag">archived</span>' : ''}</div>
  <div class="s">${ms.length} measurement${ms.length === 1 ? '' : 's'} · ${last.slice(0, 10)}</div></a>
  <button class="chip fix" data-quick="${p.id}" aria-label="Quick add">＋</button></li>`;
}
function viewProjects() {
  const showArch = sessionStorage.getItem('ml.arch') === '1';
  const act = db.projects.filter(p => !p.archived).sort((a, b) => (b.favorite - a.favorite) || b.updatedAt.localeCompare(a.updatedAt));
  const arch = db.projects.filter(p => p.archived);
  const due = backupDue(db);
  app.innerHTML = `${due ? `<div class="card warnbar no-print">⚠ ${db.settings.lastBackupAt ? `Last backup ${Math.floor((Date.now() - Date.parse(db.settings.lastBackupAt)) / 864e5)} days ago` : 'No backup yet'} — data lives only on this device. <a href="#/settings">Back up now</a></div>` : ''}
  <div class="row"><h1>Projects</h1><button class="primary fix" id="newP">New project</button></div>
  ${act.length ? `<ul class="list">${act.map(projectItem).join('')}</ul>` : `<p class="empty">No projects yet. Create one, or start from a template (Room, Deck, Vehicle clearance…).</p>`}
  ${arch.length ? `<button class="chip" id="togArch">${showArch ? 'Hide' : 'Show'} archived (${arch.length})</button>${showArch ? `<ul class="list">${arch.map(projectItem).join('')}</ul>` : ''}` : ''}`;
  $('#newP').onclick = newProjectDlg;
  $('#togArch')?.addEventListener('click', () => { sessionStorage.setItem('ml.arch', showArch ? '0' : '1'); render(); });
  bindProjectList();
}
function bindProjectList() {
  app.querySelectorAll('[data-fav]').forEach(b => b.onclick = () => { const p = proj(b.dataset.fav); p.favorite = !p.favorite; p.updatedAt = now(); persist(); render(); });
  app.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => editMeasurement(null, b.dataset.quick));
}
async function newProjectDlg() {
  const r = await modal('New project', `<label>Name</label><input name="name" required placeholder="e.g. Bathroom Remodel" autofocus>
    <label>Template</label><select name="tpl"><option value="">Blank</option>${TEMPLATES.map(t => `<option value="${t.id}">${esc(t.name)} (${t.items.length} items)</option>`).join('')}</select>
    <label>Description</label><input name="description">`, [{ v: 'ok', label: 'Create', cls: 'primary' }]);
  if (!r) return;
  const tpl = TEMPLATES.find(t => t.id === r.data.get('tpl'));
  const p = newProject({ name: r.data.get('name').trim() || 'Untitled', description: r.data.get('description'), template: tpl?.id, tags: tpl?.tags || [] });
  db.projects.push(p);
  if (tpl) tpl.items.forEach(it => db.measurements.push(newMeasurement({ ...it, projectId: p.id, value: null, source: 'template', tags: [...tpl.tags] })));
  log(db, 'create', 'project', p.id, `Created project "${p.name}"${tpl ? ` from template ${tpl.name}` : ''}`, p.id);
  persist(); location.hash = `#/p/${p.id}`;
}

// ---------- Project detail ----------
const filters = {};
function filterBar(f, tags) {
  return `<div class="card no-print"><div class="row"><input id="fq" placeholder="Search label, notes, tags…" value="${esc(f.q || '')}" type="search"></div>
  <div class="grid2"><select id="ftag"><option value="">All tags</option>${tags.map(t => `<option ${t === f.tag ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
  <select id="fmode"><option value="">All modes</option>${MODES.map(m => `<option ${m === f.mode ? 'selected' : ''}>${m}</option>`).join('')}</select>
  <input type="date" id="ffrom" value="${f.from || ''}" aria-label="From"><input type="date" id="fto" value="${f.to || ''}" aria-label="To"></div></div>`;
}
function bindFilter(f, rerender) {
  const set = (id, k) => $(id).addEventListener(id === '#fq' ? 'input' : 'change', e => { f[k] = e.target.value; rerender(); });
  set('#fq', 'q'); set('#ftag', 'tag'); set('#fmode', 'mode'); set('#ffrom', 'from'); set('#fto', 'to');
}
function measItem(m, showProject) {
  const p = showProject ? proj(m.projectId) : null;
  return `<li class="item"><button class="star ${m.favorite ? 'on' : ''}" data-mfav="${m.id}" aria-label="Favorite">★</button>
  <div class="main" data-edit="${m.id}" role="button" tabindex="0"><div class="t">${esc(m.label || '(unlabeled)')}</div>
  <div class="s">${p ? `<a href="#/p/${p.id}">${esc(p.name)}</a> · ` : ''}${m.mode}${m.reference ? ` · ref ${esc(m.reference)}` : ''}${m.group ? ` · ${esc(m.group)}` : ''} · ${m.measuredAt.slice(0, 10)}
  ${(m.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}${m.notes ? `<br>${esc(m.notes)}` : ''}</div></div>
  <div class="val">${esc(fmt(m))}</div></li>`;
}
function bindMeasList(rerender) {
  app.querySelectorAll('[data-mfav]').forEach(b => b.onclick = () => { const m = db.measurements.find(x => x.id === b.dataset.mfav); m.favorite = !m.favorite; persist(); rerender(); });
  app.querySelectorAll('[data-edit]').forEach(b => { const go = () => editMeasurement(b.dataset.edit); b.onclick = go; b.onkeydown = e => e.key === 'Enter' && go(); });
}
function viewProject(id) {
  const p = proj(id); if (!p) { app.innerHTML = `<p class="empty">Project not found. <a href="#/">Back</a></p>`; return; }
  const f = filters[id] ||= {};
  const all = measOf(id); const tags = [...new Set(all.flatMap(m => m.tags || []))].sort();
  const tab = sessionStorage.getItem('ml.tab.' + id) || 'm';
  const nRooms = db.rooms.filter(r => r.projectId === id).length;
  app.innerHTML = `<div class="row"><h1>${esc(p.name)}</h1><button class="star fix ${p.favorite ? 'on' : ''}" id="pfav">★</button></div>
  ${p.description ? `<p class="s">${esc(p.description)}</p>` : ''}
  <div class="row no-print"><button class="primary" id="add">＋ Add</button><button id="imp">Paste / CSV</button><button id="more">Project ⋯</button></div>
  <nav class="tabs no-print">${[['m', `Readings (${all.length})`], ['plan', `Plan (${nRooms})`], ['ph', 'Photos & voice'], ['form', 'Form'], ['calc', 'Calcs']].map(([k, l]) => `<button class="chip ${k === tab ? 'primary' : ''}" data-tab="${k}">${l}</button>`).join('')}</nav>
  <div id="tabBody">${tab === 'm' ? `${filterBar(f, tags)}<div id="mlist"></div>` : ''}</div><button class="primary fab" id="fab" aria-label="Add measurement">＋</button>`;
  app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { if (b.dataset.tab === 'plan') { location.hash = `#/plan/${id}`; return; } sessionStorage.setItem('ml.tab.' + id, b.dataset.tab); render(); });
  $('#add').onclick = $('#fab').onclick = () => editMeasurement(null, id);
  $('#imp').onclick = () => importDlg(id);
  $('#pfav').onclick = () => { p.favorite = !p.favorite; persist(); render(); };
  $('#more').onclick = () => projectMenu(p);
  const body = $('#tabBody');
  if (tab === 'ph') { import('./photos.js').then(m => m.mediaSection(ctx, body, { projectId: id })); return; }
  if (tab === 'form') return formTab(p, body);
  if (tab === 'calc') {
    const cs = db.calcs.filter(c => c.projectId === id);
    body.innerHTML = cs.length ? `<ul class="list">${cs.map(c => `<li class="item"><div class="main"><div class="t">${esc(c.title)}</div><div class="s">${esc(Object.entries(c.inputs).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' · '))} · ${c.at.slice(0, 10)}</div></div><div class="val" style="font-size:1rem;white-space:normal">${esc(c.result)}</div><button class="chip danger fix" data-delc="${c.id}">✕</button></li>`).join('')}</ul>` : '<p class="empty">No saved calculations. Use Calc → “Save to project”.</p>';
    body.querySelectorAll('[data-delc]').forEach(b => b.onclick = () => { db.calcs = db.calcs.filter(c => c.id !== b.dataset.delc); persist(); render(); });
    return;
  }
  const list = () => {
    const ms = filterMeasurements(all, f).sort((a, b) => (b.favorite - a.favorite) || (a.value == null) - (b.value == null) || b.measuredAt.localeCompare(a.measuredAt));
    $('#mlist').innerHTML = ms.length ? `<p class="s">${ms.length} of ${all.length}</p><ul class="list">${ms.map(m => measItem(m)).join('')}</ul>` : `<p class="empty">${all.length ? 'No matches.' : 'No measurements yet. Tap ＋ Add.'}</p>`;
    bindMeasList(() => viewProject(id));
  };
  list(); bindFilter(f, list);
}
function formTab(p, body) {
  const tids = Object.keys(FORMS);
  const tid = p.template && FORMS[p.template] ? p.template : null;
  if (!tid) {
    body.innerHTML = `<div class="card"><p>Attach a job form to this project. Fields fill automatically from readings with matching labels.</p><select id="pickForm">${tids.map(t => `<option value="${t}">${esc(FORMS[t].title)}</option>`).join('')}</select><button class="primary" id="useForm" style="margin-top:.5rem">Use form (adds missing reading labels)</button></div>`;
    $('#useForm').onclick = () => { p.template = $('#pickForm').value; seedFormLabels(p); persist(); render(); };
    return;
  }
  const rows = fillForm(tid, measOf(p.id), p.form || {});
  body.innerHTML = `<div class="card"><h2 style="margin-top:0">${esc(FORMS[tid].title)}</h2><table class="form">${rows.map(f => `<tr><td>${esc(f.label)}</td><td><b>${esc(formVal(f))}</b> <span class="s">${f.source || ''}</span></td><td class="no-print">${f.source === 'calc' ? '' : `<button class="chip" data-ff="${f.key}">✎</button>`}</td></tr>`).join('')}</table>
   <p class="s">Values come from readings whose label matches the field name; ✎ to override manually. Included in reports.</p><button class="chip" id="chgForm">Change form</button></div>`;
  $('#chgForm').onclick = () => { p.template = null; persist(); render(); };
  body.querySelectorAll('[data-ff]').forEach(b => b.onclick = async () => {
    const f = rows.find(x => x.key === b.dataset.ff); const cur = p.form?.[f.key];
    const r = await modal(f.label, `<label>Value${f.kind === 'length' ? ' (any unit)' : ''} — empty = use reading</label><input name="v" value="${esc(cur == null ? '' : (['length'].includes(f.kind) ? fl(cur) : cur))}">`);
    if (!r) return; const raw = r.data.get('v').trim(); p.form ||= {};
    if (!raw) delete p.form[f.key];
    else if (f.kind === 'text') p.form[f.key] = raw;
    else { const v = readValue(raw, f.kind === 'number' ? 'number' : f.kind); if (!v) return toast('Cannot parse'); p.form[f.key] = v.meters; }
    log(db, 'update', 'project', p.id, `Form "${f.label}" = ${raw || '(reading)'}`, p.id); persist(); render();
  });
}
function formVal(f) { if (f.value == null) return '—'; if (typeof f.value === 'string' || f.kind === 'text') return String(f.value); if (f.kind === 'number') return String(+(+f.value).toFixed(2)); return formatValue({ kind: f.kind, value: f.value }, unit()); }
function seedFormLabels(p) {
  const have = new Set(measOf(p.id).map(m => m.label.trim().toLowerCase()));
  for (const fd of FORMS[p.template].fields) if (fd.from && !have.has(fd.from[0].toLowerCase())) db.measurements.push(newMeasurement({ projectId: p.id, label: fd.from[0], value: null, source: 'template' }));
}
async function projectMenu(p) {
  const r = await modal(p.name, `<div class="list" style="display:grid;gap:.5rem">
   <button value="csv">Export CSV</button><button value="xlsx">Export Excel (.xlsx)</button><button value="report">Report / PDF (standard)</button><button value="reportd">Report / PDF (detailed)</button>
   <button value="plan">Room plan / floor plan</button><button value="share">Share / save project file (.json)</button>
   <button value="rename">Rename / edit</button><button value="arch">${p.archived ? 'Unarchive' : 'Archive'}</button><button value="del" class="danger">Delete project</button></div>`, []);
  if (!r) return; const a = r.action;
  if (a === 'csv') { download(`${slug(p.name)}_${stamp()}.csv`, toCSV(measOf(p.id), unit()), 'text/csv;charset=utf-8'); log(db, 'export', 'project', p.id, 'Exported CSV', p.id); persist(); }
  if (a === 'report') location.hash = `#/report/${p.id}`;
  if (a === 'reportd') location.hash = `#/report/${p.id}/detailed`;
  if (a === 'plan') location.hash = `#/plan/${p.id}`;
  if (a === 'xlsx') exportXLSX(p);
  if (a === 'share') shareProject(p);
  if (a === 'rename') {
    const e = await modal('Edit project', `<label>Name</label><input name="name" value="${esc(p.name)}" required><label>Description</label><input name="description" value="${esc(p.description)}"><label>Tags (comma)</label><input name="tags" value="${esc(p.tags.join(', '))}">`);
    if (e) { const old = p.name; p.name = e.data.get('name').trim() || old; p.description = e.data.get('description'); p.tags = splitTags(e.data.get('tags')); p.updatedAt = now(); log(db, 'update', 'project', p.id, old !== p.name ? `Renamed "${old}" → "${p.name}"` : `Edited project "${p.name}"`, p.id); persist(); render(); }
  }
  if (a === 'arch') { p.archived = !p.archived; p.updatedAt = now(); log(db, p.archived ? 'archive' : 'unarchive', 'project', p.id, `${p.archived ? 'Archived' : 'Unarchived'} "${p.name}"`, p.id); persist(); render(); }
  if (a === 'del') {
    const n = measOf(p.id).length;
    if (await confirmBox(`Delete "${p.name}" and its ${n} measurement(s)? This cannot be undone (export a backup first if unsure).`)) {
      db.measurements = db.measurements.filter(m => m.projectId !== p.id); db.projects = db.projects.filter(x => x !== p);
      db.rooms = db.rooms.filter(r => r.projectId !== p.id); db.calcs = db.calcs.filter(c => c.projectId !== p.id);
      for (const r of await media.byProject(p.id).catch(() => [])) await media.del(r.id);
      log(db, 'delete', 'project', p.id, `Deleted project "${p.name}" (${n} measurements)`); persist(); location.hash = '#/';
    }
  }
}
async function exportXLSX(p) {
  const [{ buildXLSX }, { floorData }] = await Promise.all([import('./xlsx.js'), import('./sketch.js')]);
  const ms = measOf(p.id); const dual = ['m', 'cm', 'mm'].includes(unit()) ? 'ftin' : 'm';
  const sheets = [{ name: 'Measurements', rows: [['Group', 'Label', 'Value', `Value (${dual})`, 'Canonical (m / m² / m³ / °)', 'Kind', 'Mode', 'Reference', 'Tags', 'Notes', 'Measured at', 'Source'],
    ...ms.map(m => [m.group, m.label, m.value == null ? '' : formatValue(m, unit()), m.value == null ? '' : formatValue(m, dual), m.value ?? '', m.kind, m.mode, m.reference, (m.tags || []).join('; '), m.notes, m.measuredAt.replace('T', ' ').slice(0, 19), m.source])] }];
  const { rooms, solved } = floorData(ctx, p.id, null);
  if (rooms.length) {
    sheets.push({ name: 'Rooms', rows: [['Floor', 'Room', 'Floor area m²', 'Perimeter m', 'Height m', 'Gross wall m²', 'Openings m²', 'Net wall m²', 'Volume m³', 'Closure gap m'], ...rooms.map((r, i) => { const s = solved[i]; return [r.floor, r.name, +s.area.toFixed(4), +s.perimeter.toFixed(4), r.height, +s.grossWall.toFixed(4), +s.openingArea.toFixed(4), +s.netWall.toFixed(4), +s.volume.toFixed(4), +s.closure.toFixed(4)]; })] });
    sheets.push({ name: 'Walls', rows: [['Floor', 'Room', 'Wall', 'Length m', 'Length', 'Source', 'Gross m²', 'Openings m²', 'Net m²'], ...rooms.flatMap((r, i) => solved[i].wallInfo.map(w => [r.floor, r.name, w.label, +w.length.toFixed(4), fl(w.length), w.assigned ? 'reading' : 'drawn', +w.gross.toFixed(4), +w.openings.toFixed(4), +w.net.toFixed(4)]))] });
  }
  if (p.template && FORMS[p.template]) sheets.push({ name: 'Form', rows: [['Field', 'Value', 'Source'], ...fillForm(p.template, ms, p.form || {}).map(f => [f.label, formVal(f), f.source || ''])] });
  const cs = db.calcs.filter(c => c.projectId === p.id); if (cs.length) sheets.push({ name: 'Calculations', rows: [['Calculator', 'Inputs', 'Result', 'Date'], ...cs.map(c => [c.title, Object.entries(c.inputs).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', '), c.result, c.at.slice(0, 10)])] });
  downloadBlob(`${slug(p.name)}_${stamp()}.xlsx`, new Blob([buildXLSX(sheets)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  log(db, 'export', 'project', p.id, 'Exported XLSX', p.id); persist();
}
async function shareProject(p) {
  const data = { app: 'MeasureLedger', kind: 'project', exportedAt: now(), schemaVersion: SCHEMA_VERSION, project: p, measurements: measOf(p.id), rooms: db.rooms.filter(r => r.projectId === p.id), calcs: db.calcs.filter(c => c.projectId === p.id) };
  const name = `${slug(p.name)}.measureledger.json`; const text = JSON.stringify(data, null, 2);
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: p.name }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  download(name, text, 'application/json');
}
const splitTags = s => [...new Set(String(s || '').split(/[,;#]/).map(t => t.trim()).filter(Boolean))];

// ---------- Measurement edit ----------
async function editMeasurement(mid, pid) {
  const m = mid ? db.measurements.find(x => x.id === mid) : null;
  const projectId = m?.projectId || pid;
  const recent = [...new Set(db.measurements.filter(x => x.projectId === projectId && x.label).map(x => x.label))].slice(0, 30);
  const valStr = m?.value != null ? (m.original || (m.kind === 'length' ? fl(m.value) : formatValue(m, unit()).split(' · ')[0])) : '';
  const local = (m?.measuredAt ? new Date(m.measuredAt) : new Date()); local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  const r = await modal(m ? 'Edit measurement' : 'Add measurement', `
   <label>Label</label><input name="label" list="labels" value="${esc(m?.label)}" placeholder="e.g. North wall"><datalist id="labels">${recent.map(l => `<option value="${esc(l)}">`).join('')}</datalist>
   <label>Value <span id="pv"></span></label><input name="value" value="${esc(valStr)}" inputmode="text" autocomplete="off" placeholder="12' 6 1/2&quot; · 3.82 m · 120 sq ft · 6/12 · 30°">
   <div class="grid2"><div><label>Kind</label><select name="kind">${KINDS.map(k => `<option ${k === (m?.kind || 'length') ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
   <div><label>Mode</label><select name="mode">${MODES.map(k => `<option ${k === (m?.mode || 'distance') ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
   <div><label>Reference point</label><select name="reference">${['rear', 'front', 'tripod', 'pin', ''].map(k => `<option ${k === (m?.reference ?? 'rear') ? 'selected' : ''} value="${k}">${k || '—'}</option>`).join('')}</select></div>
   <div><label>Room / group</label><input name="group" value="${esc(m?.group)}"></div></div>
   <label>Tags (comma)</label><input name="tags" value="${esc((m?.tags || []).join(', '))}">
   <label>Notes</label><input name="notes" value="${esc(m?.notes)}">
   <label>Measured at</label><input type="datetime-local" name="at" value="${local.toISOString().slice(0, 16)}">
   ${m ? `<p class="s">Source: ${esc(m.source)} · created ${m.createdAt.slice(0, 16).replace('T', ' ')}</p><label>Photos & voice</label><div id="mMedia"></div>` : '<p class="s">Save first to attach photos / voice notes.</p>'}`,
  [...(m ? [{ v: 'del', label: 'Delete', cls: 'danger' }] : []), ...(!m ? [{ v: 'again', label: 'Save + next' }] : []), { v: 'ok', label: 'Save', cls: 'primary' }],
  form => {
    const v = form.elements.value, k = form.elements.kind, pv = $('#pv', form);
    const upd = () => { const x = readValue(v.value, k.value); pv.textContent = v.value.trim() ? (x ? `= ${formatValue({ kind: k.value, value: x.meters }, unit())}` : '⚠ cannot parse') : ''; pv.className = x ? 'ok' : 'bad'; };
    v.oninput = k.onchange = upd; upd(); setTimeout(() => (m ? v : form.elements.label).focus(), 50);
    form.elements.mode.onchange = e => { if (e.target.value === 'pitch') { k.value = 'slope'; upd(); } };
    if (m) import('./photos.js').then(x => x.mediaSection(ctx, $('#mMedia', form), { projectId: m.projectId, measurementId: m.id, compact: true }));
  });
  if (!r) return;
  if (r.action === 'del') {
    if (await confirmBox(`Delete "${m.label || 'measurement'}"? Its photos stay in the project.`)) { for (const r of (await media.byProject(m.projectId)).filter(r => r.measurementId === m.id)) await media.put({ ...r, measurementId: null }); db.measurements = db.measurements.filter(x => x !== m); log(db, 'delete', 'measurement', m.id, `Deleted "${m.label}" (${fmt(m)})`, m.projectId); touch(m.projectId); persist(); render(); }
    return;
  }
  const d = r.data, raw = d.get('value').trim(), kind = d.get('kind');
  const parsed = raw ? readValue(raw, kind) : null;
  if (raw && !parsed) { toast('Could not parse value — not saved'); return editMeasurement(mid, pid); }
  const fields = { label: d.get('label').trim(), kind, mode: d.get('mode'), reference: d.get('reference'), group: d.get('group').trim(), tags: splitTags(d.get('tags')), notes: d.get('notes').trim(),
    value: parsed ? parsed.meters : null, unit: parsed?.unit || (m?.unit ?? db.settings.unit), original: raw, measuredAt: d.get('at') ? new Date(d.get('at')).toISOString() : now() };
  if (m) {
    const before = fmt(m); Object.assign(m, fields, { updatedAt: now() });
    log(db, 'update', 'measurement', m.id, `Edited "${m.label}"${before !== fmt(m) ? `: ${before} → ${fmt(m)}` : ''}`, m.projectId);
  } else {
    const n = newMeasurement({ ...fields, projectId, source: 'manual' }); db.measurements.push(n);
    log(db, 'create', 'measurement', n.id, `Added "${n.label}" ${fmt(n)}`, projectId);
  }
  touch(projectId); persist(); toast('Saved'); render();
  if (r.action === 'again') editMeasurement(null, projectId);
}
function readValue(raw, kind) {
  const du = unit() === 'ftin' ? 'ft' : unit();
  if (kind === 'length') return parseLength(raw, du);
  const wrap = r => (r ? { meters: r.value, unit: r.unit } : null);
  if (kind === 'area') return wrap(parseArea(raw, du));
  if (kind === 'volume') return wrap(parseVolume(raw, du));
  if (kind === 'angle' || kind === 'slope') return wrap(parseAngle(raw));
  const n = parseFloat(String(raw).replace(',', '.')); return isFinite(n) ? { meters: n, unit: '' } : null;
}
function touch(pid) { const p = proj(pid); if (p) p.updatedAt = now(); }

// ---------- Import ----------
async function importDlg(pid) {
  let parsed = null;
  const r = await modal('Import measurements', `<p class="s">Paste notes (one per line, e.g. <code>North wall: 12' 6 1/2" #kitchen</code>) or CSV with a header row (label,value,…). Or pick a .csv/.txt file.</p>
   <input type="file" name="file" accept=".csv,.txt,text/*"><textarea name="text" placeholder="Length: 12' 6&quot;&#10;Width = 3.82 m"></textarea>
   <label>Bare numbers are in</label><select name="du">${UNITS.filter(u => u[0] !== 'ftin').map(u => `<option value="${u[0]}" ${u[0] === (unit() === 'ftin' ? 'ft' : unit()) ? 'selected' : ''}>${u[1]}</option>`).join('')}</select>
   <div id="prev"></div>`, [{ v: 'ok', label: 'Import', cls: 'primary' }], form => {
    const ta = form.elements.text, prev = $('#prev', form);
    const run = () => {
      parsed = parseImport(ta.value, { defaultUnit: form.elements.du.value });
      prev.innerHTML = !ta.value.trim() ? '' : `<p class="s">${parsed.format.toUpperCase()}: <b class="ok">${parsed.items.length} ok</b>${parsed.errors.length ? `, <b class="bad">${parsed.errors.length} skipped</b>` : ''}</p>
       <table><tr><th>Label</th><th>Value</th><th>Tags</th></tr>${parsed.items.slice(0, 50).map(m => `<tr><td>${esc(m.label)}</td><td>${esc(fmt(m))}</td><td>${esc(m.tags.join(', '))}</td></tr>`).join('')}
       ${parsed.errors.map(e => `<tr class="bad"><td colspan=3>Line ${e.line}: ${esc(e.text)} — ${e.error}</td></tr>`).join('')}</table>`;
    };
    ta.oninput = form.elements.du.onchange = run;
    form.elements.file.onchange = async e => { const f = e.target.files[0]; if (f) { ta.value = await f.text(); run(); } };
  });
  if (!r || !parsed?.items.length) return;
  parsed.items.forEach(m => { m.projectId = pid; db.measurements.push(m); });
  log(db, 'import', 'project', pid, `Imported ${parsed.items.length} measurement(s) via ${parsed.format}`, pid);
  touch(pid); persist(); toast(`Imported ${parsed.items.length}`); render();
}

// ---------- Search (global) ----------
const gf = {};
function viewSearch() {
  const tags = [...new Set(db.measurements.flatMap(m => m.tags || []))].sort();
  app.innerHTML = `<h1>Search all</h1><select id="fproj" class="no-print"><option value="">All projects</option>${db.projects.map(p => `<option value="${p.id}" ${p.id === gf.projectId ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
   <label class="no-print"><input type="checkbox" id="favOnly" ${gf.fav ? 'checked' : ''} style="width:auto;min-height:0"> Favorites only</label>
   ${filterBar(gf, tags)}<div id="mlist"></div>`;
  const list = () => {
    let ms = filterMeasurements(db.measurements, gf); if (gf.fav) ms = ms.filter(m => m.favorite);
    ms.sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
    $('#mlist').innerHTML = ms.length ? `<p class="s">${ms.length} result(s)</p><ul class="list">${ms.slice(0, 300).map(m => measItem(m, true)).join('')}</ul>` : `<p class="empty">No matches.</p>`;
    bindMeasList(list);
  };
  bindFilter(gf, list); $('#fproj').onchange = e => { gf.projectId = e.target.value; list(); };
  $('#favOnly').onchange = e => { gf.fav = e.target.checked; list(); }; list();
}

// ---------- Calculators ----------
function lenInput(name, label, ph = '') {
  const opts = db.measurements.filter(m => m.kind === 'length' && m.value != null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 60);
  return `<div><label>${label}</label><input name="${name}" data-len placeholder="${esc(ph)}" list="mlist-${name}" autocomplete="off">
   <datalist id="mlist-${name}">${opts.map(m => `<option value="${esc(fl(m.value))}">${esc((proj(m.projectId)?.name || '') + ' · ' + m.label)}</option>`).join('')}</datalist></div>`;
}
const CALCS = [
  ['pitch', 'Roof pitch / slope', () => `<div><label>Pitch (6/12, 26.6°, 50%, 4' / 12')</label><input name="pitch" data-raw value="6/12"></div>` + lenInput('run', 'Horizontal run (optional)') + lenInput('oh', 'Overhang (optional)'),
    (v, n, f) => { const a = parseAngle(f.get('pitch')); if (!a) return f.get('pitch') ? '<span class="bad">Cannot parse pitch</span>' : ''; let out = formatPitch(a.value); if (v.run) { const r = calc.rafter(v.run, a.value, v.oh || 0); out += `<br>Rise ${fl(r.rise)} · rafter ${fl(r.rafter)} · factor ${r.factor.toFixed(4)}`; } return out; }],
  ['earth', 'Earthworks / excavation volume', () => `<div style="grid-column:1/-1"><label>Depths per grid row (commas between values; any unit). One row + area = average method.</label><textarea name="depths" style="min-height:5rem" placeholder="1.0, 1.2, 1.5&#10;1' 2&quot;, 1', 1' 4&quot;"></textarea></div>` + lenInput('dx', 'Grid spacing X') + lenInput('dy', 'Grid spacing Y') + `<div><label>…or area (for average method)</label><input name="area" data-raw placeholder="400 sq ft"></div><div><label>Swell %</label><input name="swell" type="number" value="25"></div>`,
    (v, n, f) => { const du = unit() === 'ftin' ? 'ft' : unit(); const rows = f.get('depths').split('\n').map(l => l.trim()).filter(Boolean).map(l => (/[,;\t]/.test(l) ? l.split(/\s*[,;\t]\s*/) : l.split(/\s+/)).filter(Boolean).map(t => parseLength(t, du)?.meters));
      if (!rows.length) return ''; if (rows.some(r => r.some(x => x == null))) return '<span class="bad">Cannot parse a depth</span>';
      const sw = n.swell || 0; const ar = f.get('area') ? parseArea(f.get('area'), du) : null;
      try { if (rows.length >= 2 && v.dx && v.dy) { const g = calc.earthworksGrid(rows, v.dx, v.dy); return `${formatVolume(g.volume, unit())} bank · ${formatVolume(g.volume * (1 + sw / 100), unit())} loose (+${sw}%)<br>${g.cells} cells · area ${formatArea(g.area, unit())} · avg depth ${fl(g.avgDepth)}${['ftin', 'ft', 'in'].includes(unit()) ? ` · ${(g.volume / 0.764554858).toFixed(2)} yd³` : ''}`; }
        if (ar) { const a = calc.earthworksAvg(ar.value, rows.flat(), sw); return `${formatVolume(a.volume, unit())} bank · ${formatVolume(a.loose, unit())} loose · avg depth ${fl(a.avgDepth)}${['ftin', 'ft', 'in'].includes(unit()) ? ` · ${(a.loose / 0.764554858).toFixed(2)} yd³ loose` : ''}`; }
        return '<span class="s">Enter grid spacing X/Y (≥2 rows) or an area.</span>'; } catch (e) { return `<span class="bad">${esc(e.message)}</span>`; } }],
  ['area', 'Area (L × W)', () => lenInput('l', 'Length') + lenInput('w', 'Width'), v => v.l && v.w && `${formatArea(calc.area(v.l, v.w), unit())}`],
  ['vol', 'Volume (L × W × H)', () => lenInput('l', 'Length') + lenInput('w', 'Width') + lenInput('h', 'Height'), v => v.l && v.w && v.h && formatVolume(calc.volume(v.l, v.w, v.h), unit())],
  ['pyth', 'Pythagorean / diagonal', () => lenInput('a', 'Side A') + lenInput('b', 'Side B'), v => v.a && v.b && `Diagonal ${fl(calc.hypot(v.a, v.b))}`],
  ['sq', 'Squareness check', () => lenInput('l', 'Length') + lenInput('w', 'Width') + lenInput('d1', 'Diagonal 1') + lenInput('d2', 'Diagonal 2 (optional)') + `<div><label>Tolerance</label><input name="tol" data-len value="1/8&quot;"></div>`,
    v => { if (!v.l || !v.w) return ''; const ideal = fl(calc.hypot(v.l, v.w)); if (!v.d1) return `Ideal diagonal ${ideal}`; const s = calc.squareness(v.l, v.w, v.d1, v.d2 ?? null, v.tol ?? 0.003175); return `<span class="${s.square ? 'ok' : 'bad'}">${s.square ? '✔ Square' : '✘ Out of square'}</span> · ideal ${ideal} · Δ ${fl(s.diff)}`; }],
  ['slope', 'Slope / angle', () => lenInput('rise', 'Rise') + lenInput('run', 'Run'), v => { if (!v.rise || !v.run) return ''; const s = calc.slope(v.rise, v.run); return `${s.pct.toFixed(2)}% · ${s.deg.toFixed(2)}° · ${s.inPerFt.toFixed(3)} in/ft`; }],
  ['floor', 'Flooring boxes', () => lenInput('l', 'Room length') + lenInput('w', 'Room width') + `<div><label>ft² per box</label><input name="box" type="number" step="any" value="20"></div><div><label>Waste %</label><input name="waste" type="number" value="10"></div>`,
    (v, n) => v.l && v.w && n.box > 0 && (r => `${r.boxes} boxes (${r.needFt2.toFixed(1)} ft² incl. waste)`)(calc.flooringBoxes(calc.area(v.l, v.w), n.box, n.waste || 0))],
  ['dry', 'Drywall sheets', () => lenInput('l', 'Wall run (total)') + lenInput('h', 'Wall height') + `<div><label>Openings ft² (subtract)</label><input name="open" type="number" step="any" value="0"></div><div><label>Sheet</label><select name="sheet"><option>4x8</option><option>4x10</option><option>4x12</option></select></div><div><label>Waste %</label><input name="waste" type="number" value="10"></div>`,
    (v, n, f) => { if (!v.l || !v.h) return ''; const a = Math.max(0, calc.area(v.l, v.h) - (n.open || 0) * M_PER.ft ** 2); const [w, h] = f.get('sheet').split('x').map(Number); const r = calc.drywallSheets(a, w, h, n.waste || 0); return `${r.sheets} sheets ${w}×${h} (${r.needFt2.toFixed(1)} ft²)`; }],
  ['posts', 'Fence / deck posts', () => lenInput('run', 'Run length') + lenInput('max', 'Max spacing', `8'`), v => v.run && v.max && (r => `${r.posts} posts · ${r.spans} spans @ ${fl(r.spacing)}`)(calc.posts(v.run, v.max))],
  ['cut', 'Cut list', () => `<div><label>Pieces (one per line, “qty x length” ok)</label><textarea name="pieces" style="min-height:5rem" placeholder="4 x 3' 2&quot;&#10;2 x 5' 6&quot;"></textarea></div>` + lenInput('stock', 'Stock length', `8'`) + `<div><label>Kerf</label><input name="kerf" data-len value="1/8&quot;"></div>`,
    (v, n, f) => { if (!v.stock) return ''; const pcs = []; for (const line of f.get('pieces').split('\n')) { if (!line.trim()) continue; const mm = line.match(/^\s*(\d+)\s*[x×]\s*(.+)$/i); const p = parseLength(mm ? mm[2] : line); if (!p) return `<span class="bad">Can't parse: ${esc(line)}</span>`; for (let i = 0; i < (mm ? +mm[1] : 1); i++) pcs.push(p.meters); }
      if (!pcs.length) return ''; try { const b = calc.cutList(pcs, v.stock, v.kerf ?? 0.003175); return `${b.length} stock piece(s)<br>` + b.map((x, i) => `#${i + 1}: ${x.cuts.map(fl).join(' + ')} <span class="s">(offcut ${fl(x.left)})</span>`).join('<br>'); } catch (e) { return `<span class="bad">${esc(e.message)}</span>`; } }],
];
function viewCalc() {
  app.innerHTML = `<h1>Calculators</h1><p class="s">Type any unit (12' 6", 3.82 m…) or pick a saved measurement from the suggestions.</p>
   ${CALCS.map(([id, t, f]) => `<details class="card" ${sessionStorage.getItem('ml.calc') === id ? 'open' : ''} data-c="${id}"><summary><b>${t}</b></summary><form class="grid2">${f()}</form><div class="out"></div><div class="row no-print"><select class="savep">${db.projects.filter(p => !p.archived).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><button class="chip fix savec">Save to project</button></div></details>`).join('')}`;
  app.querySelectorAll('details').forEach(d => {
    const c = CALCS.find(x => x[0] === d.dataset.c), form = $('form', d), out = $('.out', d);
    d.ontoggle = () => d.open && sessionStorage.setItem('ml.calc', c[0]);
    form.oninput = form.onchange = () => {
      const fd = new FormData(form), v = {}, n = {};
      form.querySelectorAll('[data-len]').forEach(i => { const p = parseLength(i.value, unit() === 'ftin' ? 'ft' : unit()); if (p && p.meters > 0) v[i.name] = p.meters; });
      form.querySelectorAll('input[type=number]').forEach(i => n[i.name] = parseFloat(i.value));
      try { out.innerHTML = c[3](v, n, fd) || ''; } catch (e) { out.textContent = ''; console.warn(e); }
    };
    form.onsubmit = e => e.preventDefault();
    $('.savec', d).onclick = () => {
      const pid = $('.savep', d).value, txt = out.textContent.trim(); if (!pid) return toast('Create a project first'); if (!txt) return toast('Nothing to save yet');
      const inputs = {}; for (const [k, v] of new FormData(form)) if (typeof v === 'string' && v.trim()) inputs[k] = v.trim();
      db.calcs.push({ id: uid('c'), projectId: pid, type: c[0], title: c[1], inputs, result: txt, at: now() });
      log(db, 'create', 'calc', '', `Saved ${c[1]}: ${txt.slice(0, 80)}`, pid); touch(pid); persist(); toast('Saved to project');
    };
  });
}

// ---------- Report (lazy) ----------
function viewReport(id, variant) { import('./report.js').then(m => m.viewReport(ctx, app, id, variant || 'standard')).catch(e => { console.error(e); app.innerHTML = '<p class="empty">Report failed to load</p>'; }); }

// ---------- Compare ----------
function viewCompare(q) {
  const label = new URLSearchParams(q || '').get('label') || '';
  const labels = comparableLabels(db.measurements);
  if (!label) {
    app.innerHTML = `<h1>Compare</h1><p class="s">Same label across rooms, projects and time. Pick a label:</p><input id="cq" type="search" placeholder="Filter labels…">
     <ul class="list" id="cl">${labels.map(l => `<li class="item"><a class="main" href="#/compare?label=${encodeURIComponent(l.label)}"><div class="t">${esc(l.label)}</div><div class="s">${l.n} reading(s) · ${l.projects} project(s)</div></a></li>`).join('') || '<p class="empty">No labelled readings yet.</p>'}</ul>`;
    $('#cq').oninput = e => app.querySelectorAll('#cl .item').forEach(li => (li.hidden = !li.textContent.toLowerCase().includes(e.target.value.toLowerCase())));
    return;
  }
  const rows = compareByLabel(db.measurements, label, db.projects);
  const d = (x, k) => (x == null ? '' : `<span class="${x > 0 ? 'ok' : x < 0 ? 'bad' : ''}">${x > 0 ? '+' : ''}${esc(k === 'length' ? fl(x) : formatValue({ kind: k, value: x }, unit()))}</span>`);
  const vals = rows.map(r => r.value); const mn = Math.min(...vals), mx = Math.max(...vals);
  app.innerHTML = `<a href="#/compare">← All labels</a><h1>${esc(label)}</h1>
   ${rows.length ? `<p class="s">${rows.length} reading(s) · range ${esc(formatValue({ kind: rows[0].kind, value: mn }, unit()))} – ${esc(formatValue({ kind: rows[0].kind, value: mx }, unit()))} · spread ${esc(formatValue({ kind: rows[0].kind, value: mx - mn }, unit()))}</p>
   <table><tr><th>Date</th><th>Project</th><th>Group</th><th>Value</th><th>Δ prev</th><th>Δ first</th></tr>${rows.map(r => `<tr><td>${r.measuredAt.slice(0, 10)}</td><td><a href="#/p/${r.projectId}">${esc(r.project)}</a></td><td>${esc(r.group)}</td><td><b>${esc(formatValue({ kind: r.kind, value: r.value }, unit()))}</b></td><td>${d(r.dPrev, r.kind)}</td><td>${d(r.dFirst, r.kind)}</td></tr>`).join('')}</table>` : '<p class="empty">No readings with that label.</p>'}`;
}

// ---------- Bluetooth lab (experimental) ----------
function viewBLE() {
  if (!bleSupported()) { app.innerHTML = `<h1>Bluetooth (experimental)</h1><p class="empty">Web Bluetooth isn't available in this browser. It works only in Chrome/Edge on Android or desktop — not on iOS.</p>`; return; }
  const logs = [];
  app.innerHTML = `<h1>Bluetooth lab <span class="tag">experimental</span></h1>
   <p class="s">Research tool for reverse-engineering the Mileseey S50. <b>Direct S50 capture is not supported yet</b> — keep using Smart Life + paste/CSV import. This scanner connects to any device you pick, lists its GATT services/characteristics and logs raw notifications with guessed decodes. Take a reading on the meter and watch the log.</p>
   <div class="row"><button class="primary" id="bScan">Scan & connect…</button><button id="bStop" disabled>Disconnect</button><button id="bSave">Download log</button></div><pre id="bLog" class="log"></pre>`;
  let sess = null; const pre = $('#bLog');
  const L = e => { logs.push({ at: now(), ...e }); pre.textContent += `${new Date().toLocaleTimeString()} ${e.t} ${JSON.stringify({ ...e, t: undefined })}\n`; pre.scrollTop = pre.scrollHeight; };
  $('#bScan').onclick = async () => { try { const { scan } = await import('./ble.js'); sess = await scan(L); $('#bStop').disabled = false; } catch (e) { L({ t: 'error', msg: e.message }); } };
  $('#bStop').onclick = () => { sess?.disconnect(); $('#bStop').disabled = true; };
  $('#bSave').onclick = () => download(`ble-log_${stamp()}.json`, JSON.stringify(logs, null, 1), 'application/json');
}

// ---------- Settings / data ----------
function viewSettings() {
  const s = db.settings; const bytes = (localStorage.getItem('measureledger.v1') || '').length;
  app.innerHTML = `<h1>Settings & data</h1>
  <div class="card"><label>Theme</label><select id="theme">${[['dark', 'Dark'], ['light', 'Light'], ['contrast', 'High contrast (outdoor)']].map(([v, l]) => `<option value="${v}" ${v === s.theme ? 'selected' : ''}>${l}</option>`).join('')}</select>
   <label>Display units</label><select id="unit">${UNITS.map(([v, l]) => `<option value="${v}" ${v === s.unit ? 'selected' : ''}>${l}</option>`).join('')}</select>
   <label>Fraction precision (ft-in)</label><select id="denom">${[2, 4, 8, 16, 32].map(d => `<option ${d === s.denom ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
  <h2>Backup</h2><div class="card row"><button id="bk" class="primary">Export full backup (.json)</button><label class="btn" style="margin:0;color:var(--fg)">Restore / import file…<input type="file" id="rs" accept=".json,application/json" hidden></label></div>
  <p class="s">Restore accepts a full backup (replaces all data, after confirm) or a shared project file (added as a new project). Data lives only in this browser (${(bytes / 1024).toFixed(1)} KB) — export backups regularly.</p>
  <p class="s">Last backup: ${s.lastBackupAt ? new Date(s.lastBackupAt).toLocaleString() : 'never'} · backups include photos and voice notes.</p>
  <h2>History</h2><div class="card"><a href="#/audit">Audit trail (${db.audit.length} entries)</a> · <a href="#/compare">Compare readings</a></div>
  ${bleSupported() ? `<h2>Bluetooth</h2><div class="card"><a href="#/ble">Bluetooth lab (experimental S50 research)</a></div>` : ''}
  <h2>Danger</h2><button class="danger" id="wipe">Erase all data</button>
  <p class="s">MeasureLedger · schema v${SCHEMA_VERSION}</p>`;
  const setS = (k, v) => { s[k] = v; persist(); applySettings(); };
  $('#theme').onchange = e => setS('theme', e.target.value);
  $('#unit').onchange = e => setS('unit', e.target.value);
  $('#denom').onchange = e => setS('denom', +e.target.value);
  $('#bk').onclick = async () => {
    let med = []; try { med = await exportMedia(media); } catch (e) { console.error(e); toast('Media export failed — data only'); }
    db.settings.lastBackupAt = now(); persist();
    download(`measureledger-backup_${stamp()}.json`, JSON.stringify(backup(db, med)), 'application/json'); toast(`Backup: ${db.projects.length} projects, ${med.length} media`); render();
  };
  $('#rs').onchange = async e => { const f = e.target.files[0]; if (f) await restoreFile(await f.text()); e.target.value = ''; };
  $('#wipe').onclick = async () => { if (await confirmBox('Erase ALL projects, measurements and history from this device?', 'Erase everything')) { localStorage.removeItem('measureledger.v1'); await media.clear().catch(() => {}); db = load(); render(); } };
}
async function restoreFile(text) {
  let obj; try { obj = JSON.parse(text); } catch { return toast('Not valid JSON'); }
  if (obj?.kind === 'project' && obj.project) {
    const p = { ...obj.project, id: uid('p'), updatedAt: now() }; if (db.projects.some(x => x.name === p.name)) p.name += ' (imported)';
    db.projects.push(p); const idMap = {};
    (obj.measurements || []).forEach(m => { const nm = migrate({ schemaVersion: obj.schemaVersion, projects: [], measurements: [{ ...m, id: uid('m'), projectId: p.id }] }).measurements[0]; idMap[m.id] = nm.id; db.measurements.push(nm); });
    (obj.rooms || []).forEach(r => db.rooms.push({ ...r, id: uid('r'), projectId: p.id, walls: (r.walls || []).map(w => ({ ...w, measId: w.measId ? idMap[w.measId] || null : null })), diagonals: (r.diagonals || []).map(d => ({ ...d, measId: d.measId ? idMap[d.measId] || null : null })) }));
    (obj.calcs || []).forEach(c => db.calcs.push({ ...c, id: uid('c'), projectId: p.id }));
    log(db, 'import', 'project', p.id, `Imported project file "${p.name}"`, p.id); persist(); toast('Project imported'); location.hash = `#/p/${p.id}`; return;
  }
  const err = validateBackup(obj); if (err) return toast(err);
  if (!(await confirmBox('Replace ALL current data with this backup?', 'Replace'))) return;
  db = migrate(obj.data || obj); let nm = 0;
  if (Array.isArray(obj.media)) { try { nm = await importMedia(media, obj.media, { replace: true }); } catch (e) { console.error(e); toast('Media restore failed'); } }
  log(db, 'restore', 'db', '', `Restored backup (${db.projects.length} projects, ${db.measurements.length} measurements, ${nm} media)`); persist(); toast('Restored'); location.hash = '#/'; render();
}
function viewAudit() {
  app.innerHTML = `<h1>Audit trail</h1><a href="#/settings">← Settings</a>${db.audit.length ? `<table><tr><th>When</th><th>Project</th><th>Change</th></tr>${db.audit.slice(0, 500).map(a => `<tr><td>${new Date(a.at).toLocaleString()}</td><td>${esc(proj(a.projectId)?.name || '')}</td><td>${esc(a.summary)}</td></tr>`).join('')}</table>` : '<p class="empty">No changes yet.</p>'}`;
}

// ---------- boot ----------
$('#unitBtn').onclick = () => { const i = UNITS.findIndex(u => u[0] === unit()); db.settings.unit = UNITS[(i + 1) % UNITS.length][0]; persist(); render(); };
window.addEventListener('storage', e => { if (e.key === 'measureledger.v1') { db = load(); render(); } });
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW', e));
