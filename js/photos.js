// Photos + voice notes UI (lazy-loaded). Annotation shapes are stored normalized (0..1) on the media record.
import { downscaleImage, pickAudioMime } from './media.js';
import { uid } from './model.js';

const urls = new Map();
const urlFor = rec => { if (!rec.blob) return ''; let u = urls.get(rec.id); if (!u || u.blob !== rec.blob) { if (u) URL.revokeObjectURL(u.url); u = { blob: rec.blob, url: URL.createObjectURL(rec.blob) }; urls.set(rec.id, u); } return u.url; };

/** Render photo/voice strip for a project or a measurement into el. */
export async function mediaSection(ctx, el, { projectId, measurementId = null, compact = false }) {
  const { esc } = ctx;
  const all = (await ctx.media.byProject(projectId)).filter(r => (measurementId ? r.measurementId === measurementId : true)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const photos = all.filter(r => r.kind === 'photo'), audio = all.filter(r => r.kind === 'audio');
  const canRec = !!pickAudioMime() && !!navigator.mediaDevices?.getUserMedia;
  el.innerHTML = `<div class="row no-print"><label class="btn fix" style="margin:0;color:var(--fg)">📷 Photo<input type="file" accept="image/*" capture="environment" multiple hidden data-addphoto></label>
   ${canRec ? `<button type="button" class="fix" data-rec>🎙 Voice note</button>` : `<span class="s">Voice notes not supported in this browser</span>`}</div>
   <div class="thumbs">${photos.map(p => `<figure class="thumb"><img src="${urlFor(p)}" alt="${esc(p.name || 'photo')}" data-open="${p.id}" loading="lazy">${p.annotations?.length ? `<span class="badge">${p.annotations.length}</span>` : ''}<figcaption>${esc(measLabel(ctx, p) || p.name || '')}</figcaption></figure>`).join('')}</div>
   ${audio.map(a => `<div class="row audio"><audio controls preload="none" src="${urlFor(a)}"></audio><span class="s fix">${a.createdAt.slice(0, 16).replace('T', ' ')}${!measurementId && a.measurementId ? ' · ' + esc(measLabel(ctx, a)) : ''}</span><button type="button" class="chip danger fix" data-delaudio="${a.id}">✕</button></div>`).join('')}
   ${!photos.length && !audio.length && !compact ? '<p class="s">No photos or voice notes yet.</p>' : ''}`;
  const refresh = () => mediaSection(ctx, el, { projectId, measurementId, compact });
  el.querySelector('[data-addphoto]').onchange = async e => {
    for (const f of e.target.files) {
      try { const { blob, width, height } = await downscaleImage(f); await ctx.media.put({ id: uid('ph'), kind: 'photo', mime: 'image/jpeg', blob, width, height, name: f.name, projectId, measurementId, annotations: [], createdAt: new Date().toISOString() }); ctx.log('create', 'photo', '', `Added photo ${f.name}`, projectId); }
      catch (err) { console.error(err); ctx.toast('Could not read image'); }
    }
    ctx.persist(); refresh();
  };
  el.querySelector('[data-rec]')?.addEventListener('click', async () => { if (await recordVoice(ctx, { projectId, measurementId })) refresh(); });
  el.querySelectorAll('[data-open]').forEach(i => i.onclick = async () => { await openAnnotator(ctx, await ctx.media.get(i.dataset.open)); refresh(); });
  el.querySelectorAll('[data-delaudio]').forEach(b => b.onclick = async () => { if (await ctx.confirmBox('Delete this voice note?')) { await ctx.media.del(b.dataset.delaudio); ctx.log('delete', 'audio', b.dataset.delaudio, 'Deleted voice note', projectId); ctx.persist(); refresh(); } });
}
const measLabel = (ctx, r) => (r.measurementId ? ctx.db.measurements.find(m => m.id === r.measurementId)?.label : '') || '';

export async function recordVoice(ctx, { projectId, measurementId }) {
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { ctx.toast('Microphone permission denied'); return false; }
  const mime = pickAudioMime(); const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {}); const chunks = []; const t0 = Date.now();
  rec.ondataavailable = e => e.data.size && chunks.push(e.data); rec.start();
  const timer = setInterval(() => { const el = document.getElementById('recT'); if (el) el.textContent = ((Date.now() - t0) / 1000).toFixed(0) + ' s'; }, 500);
  const r = await ctx.modal('Recording…', `<p class="out">🔴 <span id="recT">0 s</span></p>`, [{ v: 'ok', label: 'Stop & save', cls: 'primary' }]);
  clearInterval(timer);
  const done = new Promise(res => (rec.onstop = res)); rec.stop(); await done; stream.getTracks().forEach(t => t.stop());
  if (!r || !chunks.length) return false;
  const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
  await ctx.media.put({ id: uid('au'), kind: 'audio', mime: blob.type, blob, projectId, measurementId, duration: (Date.now() - t0) / 1000, createdAt: new Date().toISOString() });
  ctx.log('create', 'audio', '', 'Recorded voice note', projectId); ctx.persist(); ctx.toast('Voice note saved'); return true;
}

// ---------- drawing ----------
export function drawShapes(g, W, H, shapes, labelFor) {
  const lw = Math.max(2, Math.round(Math.max(W, H) / 300)), fs = Math.max(14, Math.round(Math.max(W, H) / 45));
  for (const s of shapes) {
    const c = s.color || '#ff2d2d'; g.strokeStyle = c; g.fillStyle = c; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
    const x1 = s.x1 * W, y1 = s.y1 * H, x2 = (s.x2 ?? s.x1) * W, y2 = (s.y2 ?? s.y1) * H;
    if (s.t === 'line' || s.t === 'arrow') {
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      if (s.t === 'arrow') { const a = Math.atan2(y2 - y1, x2 - x1), L = lw * 5; g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - L * Math.cos(a - 0.45), y2 - L * Math.sin(a - 0.45)); g.lineTo(x2 - L * Math.cos(a + 0.45), y2 - L * Math.sin(a + 0.45)); g.closePath(); g.fill(); }
    } else if (s.t === 'box') g.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    else if (s.t === 'text' || s.t === 'pin') {
      const text = s.t === 'pin' ? labelFor(s.measId) : s.text; if (!text) continue;
      g.font = `700 ${fs}px system-ui,sans-serif`; const tw = g.measureText(text).width, pad = fs * 0.3;
      if (s.t === 'pin') { g.beginPath(); g.arc(x1, y1, lw * 2.2, 0, Math.PI * 2); g.fill(); }
      const bx = s.t === 'pin' ? x1 + lw * 3 : x1, by = s.t === 'pin' ? y1 - fs * 0.6 : y1 - fs;
      g.fillStyle = 'rgba(0,0,0,.72)'; g.fillRect(bx - pad, by - pad / 2, tw + pad * 2, fs + pad); g.fillStyle = s.t === 'pin' ? '#3ddc63' : '#fff'; g.textBaseline = 'top'; g.fillText(text, bx, by);
    }
  }
}
function loadBitmap(blob) { return globalThis.createImageBitmap ? createImageBitmap(blob) : new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(blob); }); }
const pinLabel = ctx => id => { const m = ctx.db.measurements.find(x => x.id === id); return m ? `${m.label ? m.label + ': ' : ''}${ctx.fmt(m)}` : '(deleted reading)'; };
/** Full-resolution annotated canvas */
export async function renderAnnotated(ctx, rec) {
  const bmp = await loadBitmap(rec.blob); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d'); g.drawImage(bmp, 0, 0); drawShapes(g, c.width, c.height, rec.annotations || [], pinLabel(ctx)); return c;
}
export async function annotatedDataURL(ctx, rec, max = 1200, q = 0.82) {
  const full = await renderAnnotated(ctx, rec); const k = Math.min(1, max / Math.max(full.width, full.height));
  if (k === 1) return full.toDataURL('image/jpeg', q);
  const c = document.createElement('canvas'); c.width = Math.round(full.width * k); c.height = Math.round(full.height * k); c.getContext('2d').drawImage(full, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q);
}

export async function openAnnotator(ctx, rec) {
  if (!rec) return; const { esc } = ctx;
  const ms = ctx.db.measurements.filter(m => m.projectId === rec.projectId && m.value != null);
  const shapes = structuredClone(rec.annotations || []); let tool = 'arrow', color = '#ff2d2d', drag = null;
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="row tools">${[['arrow', '↗ Arrow'], ['line', '／ Line'], ['box', '▭ Box'], ['text', 'T Text'], ['pin', '📍 Reading']].map(([t, l]) => `<button type="button" class="chip" data-tool="${t}">${l}</button>`).join('')}
    <select id="anPin" class="fix" style="max-width:14rem">${ms.map(m => `<option value="${m.id}">${esc(m.label || '(unlabeled)')} · ${esc(ctx.fmt(m))}</option>`).join('') || '<option value="">no readings</option>'}</select>
    <input type="color" id="anCol" value="${color}" class="fix" style="width:3rem;padding:2px">
    <button type="button" class="chip" id="anUndo">↶ Undo</button><button type="button" class="chip" id="anJpg">⬇ JPG</button><button type="button" class="chip danger" id="anDel">Delete</button>
    <button type="button" class="chip primary" id="anSave">Save</button><button type="button" class="chip" id="anClose">Close</button></div>
    <div class="stage"><canvas id="anC"></canvas></div><p class="s" style="margin:.25rem">Drag to draw. Text/Reading: tap to place. ${shapes.length} shape(s).</p>`;
  document.body.append(ov);
  const cv = ov.querySelector('#anC'), g = cv.getContext('2d'); const bmp = await loadBitmap(rec.blob);
  const fit = () => { const st = ov.querySelector('.stage'); const k = Math.min(st.clientWidth / bmp.width, st.clientHeight / bmp.height, 1) || 1; cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k); draw(); };
  const draw = () => { g.drawImage(bmp, 0, 0, cv.width, cv.height); drawShapes(g, cv.width, cv.height, drag ? [...shapes, drag] : shapes, pinLabel(ctx)); };
  const setTool = t => { tool = t; ov.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('primary', b.dataset.tool === t)); };
  ov.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool)); setTool('arrow');
  ov.querySelector('#anCol').oninput = e => (color = e.target.value);
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  cv.onpointerdown = e => {
    const p = pos(e);
    if (tool === 'text') { const t = prompt('Text'); if (t) shapes.push({ t: 'text', x1: p.x, y1: p.y, text: t, color }); draw(); return; }
    if (tool === 'pin') { const id = ov.querySelector('#anPin').value; if (!id) return ctx.toast('No readings in this project'); shapes.push({ t: 'pin', x1: p.x, y1: p.y, measId: id, color }); draw(); return; }
    cv.setPointerCapture(e.pointerId); drag = { t: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color };
  };
  cv.onpointermove = e => { if (!drag) return; const p = pos(e); drag.x2 = p.x; drag.y2 = p.y; draw(); };
  cv.onpointerup = () => { if (drag && Math.hypot(drag.x2 - drag.x1, drag.y2 - drag.y1) > 0.01) shapes.push(drag); drag = null; draw(); };
  ov.querySelector('#anUndo').onclick = () => { shapes.pop(); draw(); };
  const save = async () => { rec.annotations = shapes; await ctx.media.put(rec); ctx.log('update', 'photo', rec.id, `Annotated photo (${shapes.length} shapes)`, rec.projectId); ctx.persist(); };
  ov.querySelector('#anJpg').onclick = async () => { await save(); const c = await renderAnnotated(ctx, rec); c.toBlob(b => ctx.downloadBlob(`photo_${rec.id}.jpg`, b), 'image/jpeg', 0.9); };
  window.addEventListener('resize', fit); fit();
  return new Promise(res => {
    const close = () => { window.removeEventListener('resize', fit); ov.remove(); res(); };
    ov.querySelector('#anSave').onclick = async () => { await save(); ctx.toast('Saved'); close(); };
    ov.querySelector('#anClose').onclick = close;
    ov.querySelector('#anDel').onclick = async () => { if (await ctx.confirmBox('Delete this photo?')) { await ctx.media.del(rec.id); ctx.log('delete', 'photo', rec.id, 'Deleted photo', rec.projectId); ctx.persist(); close(); } };
  });
}
