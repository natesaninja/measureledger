import { parseLength, formatLength, formatValue, formatArea, formatVolume, M_PER } from './units.js';
import * as calc from './calc.js';
import { newProject, newMeasurement, MODES, KINDS, migrate, validateBackup, uid, SCHEMA_VERSION } from './model.js';
import { load, save, log, backup, filterMeasurements } from './store.js';
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

function persist() {
  try { save(db); } catch (e) { toast('Save failed: storage full?'); console.error(e); }
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2200); }
function applySettings() {
  document.documentElement.dataset.theme = db.settings.theme;
  $('#unitBtn').textContent = UNITS.find(u => u[0] === unit())?.[1] || unit();
}
function download(name, text, type = 'text/plain') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
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
  [/^#?\/?$/, viewProjects], [/^#\/p\/([\w-]+)$/, viewProject], [/^#\/report\/([\w-]+)$/, viewReport],
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
  app.innerHTML = `<div class="row"><h1>Projects</h1><button class="primary fix" id="newP">New project</button></div>
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
  app.innerHTML = `<div class="row"><h1>${esc(p.name)}</h1><button class="star fix ${p.favorite ? 'on' : ''}" id="pfav">★</button></div>
  ${p.description ? `<p class="s">${esc(p.description)}</p>` : ''}
  <div class="row no-print"><button class="primary" id="add">＋ Add</button><button id="imp">Paste / CSV</button><button id="more">Project ⋯</button></div>
  ${filterBar(f, tags)}<div id="mlist"></div><button class="primary fab" id="fab" aria-label="Add measurement">＋</button>`;
  const list = () => {
    const ms = filterMeasurements(all, f).sort((a, b) => (b.favorite - a.favorite) || (a.value == null) - (b.value == null) || b.measuredAt.localeCompare(a.measuredAt));
    $('#mlist').innerHTML = ms.length ? `<p class="s">${ms.length} of ${all.length}</p><ul class="list">${ms.map(m => measItem(m)).join('')}</ul>` : `<p class="empty">${all.length ? 'No matches.' : 'No measurements yet. Tap ＋ Add.'}</p>`;
    bindMeasList(() => viewProject(id));
  };
  list(); bindFilter(f, list);
  $('#add').onclick = $('#fab').onclick = () => editMeasurement(null, id);
  $('#imp').onclick = () => importDlg(id);
  $('#pfav').onclick = () => { p.favorite = !p.favorite; persist(); render(); };
  $('#more').onclick = () => projectMenu(p);
}
async function projectMenu(p) {
  const r = await modal(p.name, `<div class="list" style="display:grid;gap:.5rem">
   <button value="csv">Export CSV (Excel)</button><button value="report">Printable report / PDF</button><button value="share">Share / save project file (.json)</button>
   <button value="rename">Rename / edit</button><button value="arch">${p.archived ? 'Unarchive' : 'Archive'}</button><button value="del" class="danger">Delete project</button></div>`, []);
  if (!r) return; const a = r.action;
  if (a === 'csv') { download(`${slug(p.name)}_${stamp()}.csv`, toCSV(measOf(p.id), unit()), 'text/csv;charset=utf-8'); log(db, 'export', 'project', p.id, 'Exported CSV', p.id); persist(); }
  if (a === 'report') location.hash = `#/report/${p.id}`;
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
      log(db, 'delete', 'project', p.id, `Deleted project "${p.name}" (${n} measurements)`); persist(); location.hash = '#/';
    }
  }
}
async function shareProject(p) {
  const data = { app: 'MeasureLedger', kind: 'project', exportedAt: now(), schemaVersion: SCHEMA_VERSION, project: p, measurements: measOf(p.id) };
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
  const valStr = m?.value != null ? (m.kind === 'length' ? (m.original || fl(m.value)) : String(+(m.value / ({ area: { ft: M_PER.ft ** 2 }, volume: { ft: M_PER.ft ** 3 } }[m.kind]?.ft || 1)).toFixed(4))) : '';
  const local = (m?.measuredAt ? new Date(m.measuredAt) : new Date()); local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  const r = await modal(m ? 'Edit measurement' : 'Add measurement', `
   <label>Label</label><input name="label" list="labels" value="${esc(m?.label)}" placeholder="e.g. North wall"><datalist id="labels">${recent.map(l => `<option value="${esc(l)}">`).join('')}</datalist>
   <label>Value <span id="pv"></span></label><input name="value" value="${esc(valStr)}" inputmode="text" autocomplete="off" placeholder="12' 6 1/2&quot;  ·  12.54 ft  ·  3.82 m  ·  382 cm">
   <div class="grid2"><div><label>Kind</label><select name="kind">${KINDS.map(k => `<option ${k === (m?.kind || 'length') ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
   <div><label>Mode</label><select name="mode">${MODES.map(k => `<option ${k === (m?.mode || 'distance') ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
   <div><label>Reference point</label><select name="reference">${['rear', 'front', 'tripod', 'pin', ''].map(k => `<option ${k === (m?.reference ?? 'rear') ? 'selected' : ''} value="${k}">${k || '—'}</option>`).join('')}</select></div>
   <div><label>Room / group</label><input name="group" value="${esc(m?.group)}"></div></div>
   <label>Tags (comma)</label><input name="tags" value="${esc((m?.tags || []).join(', '))}">
   <label>Notes</label><input name="notes" value="${esc(m?.notes)}">
   <label>Measured at</label><input type="datetime-local" name="at" value="${local.toISOString().slice(0, 16)}">
   ${m ? `<p class="s">Source: ${esc(m.source)} · created ${m.createdAt.slice(0, 16).replace('T', ' ')}</p>` : ''}`,
  [...(m ? [{ v: 'del', label: 'Delete', cls: 'danger' }] : []), ...(!m ? [{ v: 'again', label: 'Save + next' }] : []), { v: 'ok', label: 'Save', cls: 'primary' }],
  form => {
    const v = form.elements.value, k = form.elements.kind, pv = $('#pv', form);
    const upd = () => { const x = readValue(v.value, k.value); pv.textContent = v.value.trim() ? (x ? `= ${formatValue({ kind: k.value, value: x.meters }, unit())}` : '⚠ cannot parse') : ''; pv.className = x ? 'ok' : 'bad'; };
    v.oninput = k.onchange = upd; upd(); setTimeout(() => (m ? v : form.elements.label).focus(), 50);
  });
  if (!r) return;
  if (r.action === 'del') {
    if (await confirmBox(`Delete "${m.label || 'measurement'}"?`)) { db.measurements = db.measurements.filter(x => x !== m); log(db, 'delete', 'measurement', m.id, `Deleted "${m.label}" (${fmt(m)})`, m.projectId); touch(m.projectId); persist(); render(); }
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
  if (kind === 'length') return parseLength(raw, db.settings.unit === 'ftin' ? 'ft' : db.settings.unit);
  const n = parseFloat(String(raw).replace(',', '.')); if (!isFinite(n)) return null;
  const imperial = ['ftin', 'ft', 'in'].includes(unit());
  if (kind === 'area') return { meters: imperial ? n * M_PER.ft ** 2 : n, unit: imperial ? 'ft' : 'm' };
  if (kind === 'volume') return { meters: imperial ? n * M_PER.ft ** 3 : n, unit: imperial ? 'ft' : 'm' };
  return { meters: n, unit: 'deg' };
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
   ${CALCS.map(([id, t, f]) => `<details class="card" ${sessionStorage.getItem('ml.calc') === id ? 'open' : ''} data-c="${id}"><summary><b>${t}</b></summary><form class="grid2">${f()}</form><div class="out"></div></details>`).join('')}`;
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
  });
}

// ---------- Report ----------
function viewReport(id) {
  const p = proj(id); if (!p) return (app.innerHTML = '<p class="empty">Not found</p>');
  const ms = measOf(id).sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.measuredAt.localeCompare(b.measuredAt));
  const dual = ['m', 'cm', 'mm'].includes(unit()) ? 'ftin' : 'm';
  app.innerHTML = `<div class="row no-print"><a class="btn" href="#/p/${id}">← Back</a><button class="primary" onclick="print()">Print / Save PDF</button></div>
  <h1>${esc(p.name)}</h1><p class="s">${esc(p.description)}<br>Report generated ${new Date().toLocaleString()} · ${ms.length} measurements · MeasureLedger</p>
  <table><thead><tr><th>Group</th><th>Label</th><th>Value</th><th>${dual === 'm' ? 'Metric' : 'Imperial'}</th><th>Mode</th><th>Ref</th><th>Date</th><th>Notes / tags</th></tr></thead><tbody>
  ${ms.map(m => `<tr><td>${esc(m.group)}</td><td>${esc(m.label)}</td><td><b>${esc(fmt(m))}</b></td><td>${m.value == null ? '' : esc(formatValue(m, dual))}</td><td>${m.mode}</td><td>${esc(m.reference)}</td><td>${m.measuredAt.slice(0, 10)}</td><td>${esc(m.notes)} ${esc((m.tags || []).join(', '))}</td></tr>`).join('')}
  </tbody></table>`;
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
  <h2>History</h2><div class="card"><a href="#/audit">Audit trail (${db.audit.length} entries)</a></div>
  <h2>Danger</h2><button class="danger" id="wipe">Erase all data</button>
  <p class="s">MeasureLedger · schema v${SCHEMA_VERSION}</p>`;
  const setS = (k, v) => { s[k] = v; persist(); applySettings(); };
  $('#theme').onchange = e => setS('theme', e.target.value);
  $('#unit').onchange = e => setS('unit', e.target.value);
  $('#denom').onchange = e => setS('denom', +e.target.value);
  $('#bk').onclick = () => download(`measureledger-backup_${stamp()}.json`, JSON.stringify(backup(db), null, 1), 'application/json');
  $('#rs').onchange = async e => { const f = e.target.files[0]; if (f) await restoreFile(await f.text()); e.target.value = ''; };
  $('#wipe').onclick = async () => { if (await confirmBox('Erase ALL projects, measurements and history from this device?', 'Erase everything')) { localStorage.removeItem('measureledger.v1'); db = load(); render(); } };
}
async function restoreFile(text) {
  let obj; try { obj = JSON.parse(text); } catch { return toast('Not valid JSON'); }
  if (obj?.kind === 'project' && obj.project) {
    const p = { ...obj.project, id: uid('p'), updatedAt: now() }; if (db.projects.some(x => x.name === p.name)) p.name += ' (imported)';
    db.projects.push(p); (obj.measurements || []).forEach(m => db.measurements.push(migrate({ schemaVersion: obj.schemaVersion, projects: [], measurements: [{ ...m, id: uid('m'), projectId: p.id }] }).measurements[0]));
    log(db, 'import', 'project', p.id, `Imported project file "${p.name}"`, p.id); persist(); toast('Project imported'); location.hash = `#/p/${p.id}`; return;
  }
  const err = validateBackup(obj); if (err) return toast(err);
  if (!(await confirmBox('Replace ALL current data with this backup?', 'Replace'))) return;
  db = migrate(obj.data || obj); log(db, 'restore', 'db', '', `Restored backup (${db.projects.length} projects, ${db.measurements.length} measurements)`); persist(); toast('Restored'); location.hash = '#/'; render();
}
function viewAudit() {
  app.innerHTML = `<h1>Audit trail</h1><a href="#/settings">← Settings</a>${db.audit.length ? `<table><tr><th>When</th><th>Project</th><th>Change</th></tr>${db.audit.slice(0, 500).map(a => `<tr><td>${new Date(a.at).toLocaleString()}</td><td>${esc(proj(a.projectId)?.name || '')}</td><td>${esc(a.summary)}</td></tr>`).join('')}</table>` : '<p class="empty">No changes yet.</p>'}`;
}

// ---------- boot ----------
$('#unitBtn').onclick = () => { const i = UNITS.findIndex(u => u[0] === unit()); db.settings.unit = UNITS[(i + 1) % UNITS.length][0]; persist(); render(); };
window.addEventListener('storage', e => { if (e.key === 'measureledger.v1') { db = load(); render(); } });
render();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW', e));
