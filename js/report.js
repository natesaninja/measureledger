// Printable project report (lazy-loaded). Standard: summary, form, measurements (dual units), plans, calcs.
// Detailed adds: per-wall/opening tables, annotated photos, voice-note list, project audit trail.
import { fillForm, FORMS } from './forms.js';
import { formatValue } from './units.js';
import { floorData, floorSVG } from './sketch.js';
import { planSquareness } from './sketch-geom.js';

export async function viewReport(ctx, app, id, variant = 'standard') {
  const { esc, db } = ctx; const p = ctx.proj(id); if (!p) { app.innerHTML = '<p class="empty">Not found</p>'; return; }
  const detailed = variant === 'detailed';
  const ms = ctx.measOf(id).sort((a, b) => (a.group || '').localeCompare(b.group || '') || a.measuredAt.localeCompare(b.measuredAt));
  const dual = ['m', 'cm', 'mm'].includes(ctx.unit()) ? 'ftin' : 'm';
  const val = (m, u) => (m.value == null ? '' : formatValue(m, u));
  const fv = (f) => f.value == null ? '—' : (typeof f.value === 'string' ? f.value : f.kind === 'number' ? (+f.value).toFixed(2).replace(/\.00$/, '') : f.kind === 'text' ? f.value : formatValue({ kind: f.kind, value: f.value }, ctx.unit()) + (f.kind !== 'slope' ? ` <span class="s">(${formatValue({ kind: f.kind, value: f.value }, dual)})</span>` : ''));
  const floors = [...new Set(db.rooms.filter(r => r.projectId === id).map(r => r.floor))];
  const { rooms, solved } = floorData(ctx, id, null);
  const totArea = solved.reduce((s, x) => s + x.area, 0), totNet = solved.reduce((s, x) => s + x.netWall, 0);
  const calcs = db.calcs.filter(c => c.projectId === id);
  const media = await ctx.media.byProject(id); const photos = media.filter(m => m.kind === 'photo'), audio = media.filter(m => m.kind === 'audio');
  const form = p.template && FORMS[p.template] ? fillForm(p.template, ctx.measOf(id), p.form || {}) : null;
  app.innerHTML = `<div class="row no-print"><a class="btn fix" href="#/p/${id}">← Back</a><a class="btn fix ${detailed ? '' : 'primary'}" href="#/report/${id}">Standard</a><a class="btn fix ${detailed ? 'primary' : ''}" href="#/report/${id}/detailed">Detailed</a><button class="primary" onclick="print()">Print / Save PDF</button></div>
  <article class="report">
  <h1>${esc(p.name)}</h1><p class="s">${esc(p.description)}${p.description ? '<br>' : ''}${detailed ? 'Detailed' : 'Standard'} report · generated ${new Date().toLocaleString()} · MeasureLedger</p>
  <h2>Summary</h2><table class="kv"><tr><td>Measurements</td><td>${ms.length} (${ms.filter(m => m.value != null).length} with values)</td><td>Rooms</td><td>${rooms.length}${floors.length ? ` on ${floors.length} floor(s)` : ''}</td></tr>
   <tr><td>Total floor area</td><td>${rooms.length ? ctx.fmtArea(totArea) : '—'}</td><td>Net wall area</td><td>${rooms.length ? ctx.fmtArea(totNet) : '—'}</td></tr>
   <tr><td>Photos</td><td>${photos.length}</td><td>Voice notes</td><td>${audio.length}</td></tr>
   <tr><td>Created</td><td>${p.createdAt.slice(0, 10)}</td><td>Updated</td><td>${p.updatedAt.slice(0, 10)}</td></tr></table>
  ${form ? `<h2>${esc(FORMS[p.template].title)} form</h2><table>${form.map(f => `<tr><td>${esc(f.label)}</td><td><b>${fv(f)}</b></td><td class="s">${f.source || ''}</td></tr>`).join('')}</table>` : ''}
  <h2>Measurements</h2><table><thead><tr><th>Group</th><th>Label</th><th>Value</th><th>${dual === 'm' ? 'Metric' : 'Imperial'}</th><th>Mode</th><th>Ref</th><th>Date</th><th>Notes / tags</th></tr></thead><tbody>
  ${ms.map(m => `<tr><td>${esc(m.group)}</td><td>${esc(m.label)}</td><td><b>${esc(val(m, ctx.unit()))}</b></td><td>${esc(val(m, dual))}</td><td>${m.mode}</td><td>${esc(m.reference)}</td><td>${m.measuredAt.slice(0, 10)}</td><td>${esc(m.notes)} ${esc((m.tags || []).join(', '))}</td></tr>`).join('')}</tbody></table>
  ${floors.map(f => `<section class="avoid-break"><h2>Plan · ${esc(f)}</h2><div class="plan-print">${floorSVG(ctx, id, f, { theme: 'light' })}</div>
   <table><tr><th>Room</th><th>Floor area</th><th>Perimeter</th><th>Wall net</th><th>Squareness</th></tr>${rooms.map((r, i) => (r.floor !== f ? '' : (() => { const s = solved[i], q = planSquareness(s); return `<tr><td>${esc(r.name)}</td><td>${ctx.fmtArea(s.area)}</td><td>${ctx.fl(s.perimeter)}</td><td>${ctx.fmtArea(s.netWall)}</td><td>${q ? (q.square ? '✔ ' : '✘ ') + 'Δ ' + ctx.fl(q.diff) : '—'}</td></tr>`; })())).join('')}</table>
   ${detailed ? rooms.map((r, i) => (r.floor !== f ? '' : `<h3>${esc(r.name)} walls</h3><table><tr><th>Wall</th><th>Length</th><th>Source</th><th>Gross</th><th>Openings</th><th>Net</th></tr>${solved[i].wallInfo.map(w => `<tr><td>${esc(w.label)}</td><td>${ctx.fl(w.length)}</td><td>${w.assigned ? 'reading' : 'drawn'}</td><td>${ctx.fmtArea(w.gross)}</td><td>${ctx.fmtArea(w.openings)}</td><td>${ctx.fmtArea(w.net)}</td></tr>`).join('')}</table>
     ${r.openings.length ? `<p class="s">Openings: ${r.openings.map(o => `${o.type} on ${esc(solved[i].wallInfo[o.wall]?.label)} ${ctx.fl(o.width)}×${ctx.fl(o.height)}`).join('; ')}</p>` : ''}`)).join('') : ''}</section>`).join('')}
  ${calcs.length ? `<h2>Calculations</h2><table>${calcs.map(c => `<tr><td>${esc(c.title)}</td><td class="s">${esc(Object.entries(c.inputs).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', '))}</td><td><b>${esc(c.result)}</b></td><td class="s">${c.at.slice(0, 10)}</td></tr>`).join('')}</table>` : ''}
  ${detailed && photos.length ? `<h2>Photos</h2><div class="photo-grid" id="rPhotos">${photos.map(ph => `<figure class="avoid-break"><img data-ph="${ph.id}" alt=""><figcaption>${esc(ctx.db.measurements.find(m => m.id === ph.measurementId)?.label || ph.name || '')}</figcaption></figure>`).join('')}</div>` : ''}
  ${detailed && audio.length ? `<h2>Voice notes</h2><ul>${audio.map(a => `<li>${a.createdAt.slice(0, 16).replace('T', ' ')} · ${(a.duration || 0).toFixed(0)} s${a.measurementId ? ' · ' + esc(ctx.db.measurements.find(m => m.id === a.measurementId)?.label || '') : ''} (audio in app)</li>`).join('')}</ul>` : ''}
  ${detailed ? `<h2>Change history</h2><table>${db.audit.filter(a => a.projectId === id).slice(0, 200).map(a => `<tr><td>${new Date(a.at).toLocaleString()}</td><td>${esc(a.summary)}</td></tr>`).join('')}</table>` : ''}
  </article>`;
  if (detailed && photos.length) {
    const { annotatedDataURL } = await import('./photos.js');
    for (const ph of photos) { const img = app.querySelector(`[data-ph="${ph.id}"]`); if (img && ph.blob) try { img.src = await annotatedDataURL(ctx, ph); } catch (e) { console.warn(e); } }
  }
}
