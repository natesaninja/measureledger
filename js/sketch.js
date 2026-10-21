// Room sketch / floor-plan editor (lazy-loaded). Geometry lives in sketch-geom.js.
import { newRoom, solveRoom, snapPoint, planSVG, planSquareness, wallName, wallCount, openingSegment, pointsCSV, bbox } from './sketch-geom.js';
import { planDXF } from './dxf.js';
import { parseLength } from './units.js';

const st = { roomId: null, mode: 'draw', wall: null, floor: null, snap: true };
export function viewPlan(ctx, app, projectId) {
  const { esc, db } = ctx; const p = ctx.proj(projectId);
  if (!p) { app.innerHTML = '<p class="empty">Project not found</p>'; return; }
  const rooms = db.rooms.filter(r => r.projectId === projectId);
  const floors = [...new Set(rooms.map(r => r.floor))]; if (!floors.length) floors.push('Ground');
  if (!floors.includes(st.floor)) st.floor = floors[0];
  const onFloor = rooms.filter(r => r.floor === st.floor);
  let room = rooms.find(r => r.id === st.roomId); if (!room || room.floor !== st.floor) { room = onFloor[0] || null; st.roomId = room?.id || null; st.wall = null; }
  const lookup = id => db.measurements.find(m => m.id === id)?.value ?? null;
  const solved = new Map(onFloor.map(r => [r.id, solveRoom(r, lookup)]));
  const lens = db.measurements.filter(m => m.projectId === projectId && m.kind === 'length' && m.value != null);
  const fl = ctx.fl, fa = v => ctx.fmtArea(v);
  const sol = room ? solved.get(room.id) : null;
  const sq = sol && room.closed ? planSquareness(sol) : null;

  app.innerHTML = `<div class="row no-print"><a class="btn fix" href="#/p/${projectId}">←</a><h1 style="margin:0">${esc(p.name)} · Plan</h1></div>
  <div class="row no-print"><select id="flSel">${floors.map(f => `<option ${f === st.floor ? 'selected' : ''}>${esc(f)}</option>`).join('')}<option value="__new">＋ New floor…</option></select>
   <select id="rmSel">${onFloor.map(r => `<option value="${r.id}" ${r.id === st.roomId ? 'selected' : ''}>${esc(r.name)}</option>`).join('') || '<option value="">(no rooms)</option>'}</select>
   <button class="primary fix" id="newRoom">＋ Room</button></div>
  ${room ? `<div class="row no-print"><button class="chip ${st.mode === 'draw' ? 'primary' : ''}" id="mDraw">✎ Draw walls</button><button class="chip ${st.mode === 'select' ? 'primary' : ''}" id="mSel">☝ Select wall</button>
   <button class="chip" id="undoPt">↶ Point</button>${!room.closed && room.pts.length >= 3 ? '<button class="chip" id="closeRm">⬠ Close room</button>' : ''}${room.closed ? '<button class="chip" id="openRm">Reopen</button>' : ''}
   <label class="chip" style="margin:0;color:var(--fg)"><input type="checkbox" id="snap" ${st.snap ? 'checked' : ''} style="width:auto;min-height:0"> snap 45°/10cm</label></div>` : ''}
  <div class="plan-wrap"><svg id="plan" class="plan" xmlns="http://www.w3.org/2000/svg"></svg></div>
  <div id="side"></div>`;

  // ---- canvas ----
  const svg = app.querySelector('#plan');
  const allV = onFloor.flatMap(r => solved.get(r.id).verts.map(v => ({ x: v.x + r.offset.x, y: v.y + r.offset.y })));
  const b = bbox(allV.length ? allV : [{ x: 0, y: 0 }, { x: 6, y: 4 }]);
  const pad = 1.5, vw = Math.max(6, b.maxX - b.minX) + pad * 2, vh = Math.max(4, b.maxY - b.minY) + pad * 2;
  svg.setAttribute('viewBox', `${b.minX - pad} ${b.minY - pad} ${vw} ${vh}`);
  const fs = Math.max(vw, vh) / 40, sw = Math.max(vw, vh) / 250;
  let s = `<defs><pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="currentColor" stroke-opacity=".15" stroke-width="${sw / 2}"/></pattern></defs>
    <rect x="${b.minX - pad - 50}" y="${b.minY - pad - 50}" width="${vw + 100}" height="${vh + 100}" fill="url(#grid)"/>`;
  for (const r of onFloor) {
    const so = solved.get(r.id), v = so.verts.map(q => ({ x: q.x + r.offset.x, y: q.y + r.offset.y })), sel = r.id === st.roomId;
    if (r.closed && v.length > 2) s += `<polygon points="${v.map(q => `${q.x},${q.y}`).join(' ')}" fill="var(--acc)" fill-opacity="${sel ? 0.15 : 0.06}"/>`;
    so.wallInfo.forEach((w, i) => {
      const a = v[i], c = v[(i + 1) % v.length], mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2, on = sel && st.wall === i;
      s += `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="${on ? 'var(--acc)' : 'currentColor'}" stroke-width="${sw * (on ? 4 : 2.5)}" stroke-linecap="round" ${w.assigned ? '' : `stroke-dasharray="${sw * 4} ${sw * 3}"`} opacity="${sel ? 1 : 0.55}"/>`;
      s += `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="transparent" stroke-width="${sw * 12}" data-room="${r.id}" data-wall="${i}" class="hit"/>`;
      s += `<text x="${mx}" y="${my}" font-size="${fs}" text-anchor="middle" dy="${-fs * 0.4}" fill="currentColor" paint-order="stroke" stroke="var(--bg)" stroke-width="${fs / 4}" pointer-events="none">${esc(w.label)} ${esc(fl(w.length))}</text>`;
    });
    r.openings.forEach(op => { const seg = openingSegment(so, op); if (seg) s += `<line x1="${seg.a.x + r.offset.x}" y1="${seg.a.y + r.offset.y}" x2="${seg.b.x + r.offset.x}" y2="${seg.b.y + r.offset.y}" stroke="${op.type === 'window' ? '#2b7bd8' : '#d8892b'}" stroke-width="${sw * 5}" pointer-events="none"/>`; });
    if (sel) v.forEach((q, i) => (s += `<circle cx="${q.x}" cy="${q.y}" r="${sw * 3}" fill="${i === 0 ? 'var(--acc)' : 'currentColor'}" pointer-events="none"/>`));
    if (r.closed && v.length > 2) { const c = v.reduce((a, q) => ({ x: a.x + q.x / v.length, y: a.y + q.y / v.length }), { x: 0, y: 0 }); s += `<text x="${c.x}" y="${c.y}" font-size="${fs * 1.1}" text-anchor="middle" font-weight="700" fill="currentColor" pointer-events="none">${esc(r.name)}</text><text x="${c.x}" y="${c.y + fs * 1.3}" font-size="${fs}" text-anchor="middle" fill="currentColor" pointer-events="none">${esc(fa(so.area))}</text>`; }
  }
  svg.innerHTML = s;
  const toWorld = e => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const w = pt.matrixTransform(svg.getScreenCTM().inverse()); return { x: w.x, y: w.y }; };
  const rerender = () => viewPlan(ctx, app, projectId);
  const save = (msg) => { room.updatedAt = new Date().toISOString(); if (msg) ctx.log('update', 'room', room.id, msg, projectId); ctx.touch(projectId); ctx.persist(); rerender(); };
  svg.onclick = e => {
    const hit = e.target.closest?.('[data-wall]');
    if (st.mode === 'select' || !room || room.closed) {
      if (hit) { st.roomId = hit.dataset.room; st.wall = +hit.dataset.wall; st.mode = 'select'; rerender(); }
      return;
    }
    const w = toWorld(e); const so = solved.get(room.id), k = so.scale || 1;
    const ox = room.offset.x, oy = room.offset.y;
    const lastS = so.verts.length ? (room.closed ? so.verts[0] : so.verts[so.verts.length - 1]) : null;
    let target = { x: w.x - ox, y: w.y - oy };
    if (st.snap) target = snapPoint(lastS, target, { grid: 0.1, angleStep: 45 });
    if (room.pts.length >= 3 && Math.hypot(target.x - so.verts[0].x, target.y - so.verts[0].y) < Math.max(vw, vh) / 30) { room.closed = true; return save(`Closed room "${room.name}"`); }
    if (!room.pts.length) room.pts.push({ x: target.x / k, y: target.y / k });
    else { const lp = room.pts[room.pts.length - 1]; room.pts.push({ x: lp.x + (target.x - lastS.x) / k, y: lp.y + (target.y - lastS.y) / k }); }
    save();
  };

  // ---- controls ----
  app.querySelector('#flSel').onchange = async e => {
    if (e.target.value === '__new') { const r = await ctx.modal('New floor', '<label>Floor name</label><input name="f" required placeholder="e.g. Upstairs">'); if (r) { st.floor = r.data.get('f').trim() || 'Floor'; const nr = newRoom({ projectId, floor: st.floor, name: 'Room 1' }); db.rooms.push(nr); st.roomId = nr.id; ctx.persist(); } rerender(); return; }
    st.floor = e.target.value; st.roomId = null; rerender();
  };
  app.querySelector('#rmSel').onchange = e => { st.roomId = e.target.value; st.wall = null; rerender(); };
  app.querySelector('#newRoom').onclick = async () => {
    const r = await ctx.modal('New room', `<label>Name</label><input name="n" required value="Room ${onFloor.length + 1}"><label>Floor</label><input name="f" value="${esc(st.floor)}"><label>Wall height</label><input name="h" value="${esc(fl(2.4384))}">
      <label>Start as</label><select name="shape"><option value="">Draw it wall by wall</option><option value="rect">Rectangle (4 walls, assign lengths after)</option></select>`, [{ v: 'ok', label: 'Create', cls: 'primary' }]);
    if (!r) return; const h = parseLength(r.data.get('h'), 'ft');
    const maxX = allV.length ? b.maxX + 1 : 0;
    const nr = newRoom({ projectId, name: r.data.get('n').trim() || 'Room', floor: r.data.get('f').trim() || st.floor, height: h ? h.meters : 2.44, offset: { x: maxX, y: 0 } });
    if (r.data.get('shape') === 'rect') { nr.pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]; nr.closed = true; }
    db.rooms.push(nr); st.roomId = nr.id; st.floor = nr.floor; st.mode = nr.closed ? 'select' : 'draw'; st.wall = nr.closed ? 0 : null;
    ctx.log('create', 'room', nr.id, `Created room "${nr.name}"`, projectId); ctx.persist(); rerender();
  };
  if (room) {
    app.querySelector('#mDraw').onclick = () => { st.mode = 'draw'; st.wall = null; rerender(); };
    app.querySelector('#mSel').onclick = () => { st.mode = 'select'; rerender(); };
    app.querySelector('#snap').onchange = e => (st.snap = e.target.checked);
    app.querySelector('#undoPt').onclick = () => { if (room.closed) room.closed = false; else room.pts.pop(); room.walls.length = Math.min(room.walls.length, wallCount(room)); room.openings = room.openings.filter(o => o.wall < wallCount(room)); save(); };
    app.querySelector('#closeRm')?.addEventListener('click', () => { room.closed = true; save(`Closed room "${room.name}"`); });
    app.querySelector('#openRm')?.addEventListener('click', () => { room.closed = false; room.openings = room.openings.filter(o => o.wall < wallCount(room)); save(); });
  }

  // ---- side panel ----
  const side = app.querySelector('#side');
  if (!room) { side.innerHTML = `<p class="empty">No rooms on this floor. Tap ＋ Room, then tap the grid to place corners. Tap the first corner to close the room.</p>`; return exportBar(); }
  const w = st.wall != null && st.wall < wallCount(room) ? st.wall : null, wi = w != null ? sol.wallInfo[w] : null, wd = w != null ? (room.walls[w] ||= {}) : null;
  side.innerHTML = `
  <div class="card"><div class="grid2"><div><label>Room name</label><input id="rName" value="${esc(room.name)}"></div><div><label>Floor</label><input id="rFloor" value="${esc(room.floor)}"></div>
   <div><label>Wall height</label><input id="rH" value="${esc(fl(room.height))}"></div><div><label>Move room (x, y)</label><input id="rOff" value="${esc(fl(room.offset.x))}, ${esc(fl(room.offset.y))}"></div></div>
   <table class="kv"><tr><td>Floor area</td><td><b>${fa(sol.area)}</b></td><td>Perimeter</td><td><b>${fl(sol.perimeter)}</b></td></tr>
   <tr><td>Wall area gross</td><td>${fa(sol.grossWall)}</td><td>Net (− openings)</td><td><b>${fa(sol.netWall)}</b></td></tr>
   <tr><td>Volume</td><td>${ctx.fmtVol(sol.volume)}</td><td>Scale</td><td>${sol.scale.toFixed(3)}×</td></tr>
   ${room.closed ? `<tr><td>Closure gap</td><td class="${sol.closure > 0.01 ? 'bad' : 'ok'}">${fl(sol.closure)}</td><td>Squareness</td><td>${sq ? `<span class="${sq.square ? 'ok' : 'bad'}">${sq.square ? '✔' : '✘'} Δ ${fl(sq.diff)}</span>` : '—'}</td></tr>` : ''}</table>
   ${sol.closure > 0.01 ? `<p class="s bad">Walls don't close by ${fl(sol.closure)} — check readings or assign the remaining walls.</p>` : ''}
   <div class="row"><button class="chip" id="addDiag">＋ Diagonal check</button><button class="chip danger" id="delRoom">Delete room</button></div>
   ${sol.diagonals.map((d, i) => `<p class="s">Diagonal ${wallName(d.a)}→${wallName(d.b)}: plan ${d.plan != null ? fl(d.plan) : '?'}${d.measured != null ? ` · measured ${fl(d.measured)} · <b class="${Math.abs(d.diff) <= 0.006 ? 'ok' : 'bad'}">Δ ${fl(d.diff)}</b>` : ''} <button class="chip" data-deldiag="${i}">✕</button></p>`).join('')}</div>
  ${wi ? `<div class="card"><h2 style="margin-top:0">Wall ${esc(wi.label)} — ${fl(wi.length)} ${wi.assigned ? '<span class="tag">measured</span>' : '<span class="tag">drawn</span>'}</h2>
   <div class="grid2"><div><label>Label</label><input id="wLabel" value="${esc(wd.label || '')}" placeholder="${wallName(w)}"></div>
   <div><label>Reading</label><select id="wMeas"><option value="">— none —</option>${lens.map(m => `<option value="${m.id}" ${m.id === wd.measId ? 'selected' : ''}>${esc(m.label || '(unlabeled)')} · ${esc(ctx.fmt(m))}</option>`).join('')}</select></div>
   <div><label>…or type length</label><input id="wLen" value="${wd.length != null ? esc(fl(wd.length)) : ''}" placeholder="12' 6&quot;"></div><div><label>&nbsp;</label><button class="primary" id="wSave">Apply</button></div></div>
   <p class="s">Gross ${fa(wi.gross)} · openings ${fa(wi.openings)} · net ${fa(wi.net)}</p>
   ${room.openings.map((o, i) => (o.wall === w ? `<p class="s">${o.type} · offset ${fl(o.offset)} · ${fl(o.width)} × ${fl(o.height)} <button class="chip" data-delop="${i}">✕</button></p>` : '')).join('')}
   <button class="chip" id="addOp">＋ Door / window / opening</button></div>` : `<p class="s">${st.mode === 'draw' && !room.closed ? 'Tap the grid to add corners; tap the first (green) corner to close.' : 'Select a wall to assign a reading, label it or add openings.'}</p>`}`;
  exportBar();
  const num = v => parseLength(v, ctx.unit() === 'ftin' ? 'ft' : ctx.unit());
  const blur = (id, fn) => side.querySelector(id).addEventListener('change', e => fn(e.target.value));
  blur('#rName', v => { room.name = v.trim() || room.name; save(); }); blur('#rFloor', v => { room.floor = v.trim() || room.floor; st.floor = room.floor; save(); });
  blur('#rH', v => { const p = num(v); if (p) { room.height = p.meters; save(); } else ctx.toast('Bad height'); });
  blur('#rOff', v => { const [x, y] = v.split(',').map(t => num(t)); if (x && y) { room.offset = { x: x.meters, y: y.meters }; save(); } else ctx.toast('Use: x, y'); });
  side.querySelector('#delRoom').onclick = async () => { if (await ctx.confirmBox(`Delete room "${room.name}"?`)) { db.rooms = db.rooms.filter(r => r !== room); ctx.setRooms?.(db.rooms); ctx.log('delete', 'room', room.id, `Deleted room "${room.name}"`, projectId); st.roomId = null; ctx.persist(); rerender(); } };
  side.querySelector('#addDiag').onclick = async () => {
    const n = sol.verts.length; if (n < 4) return ctx.toast('Need 4+ corners');
    const opts = sol.verts.map((_, i) => `<option value="${i}">${wallName(i)}</option>`).join('');
    const r = await ctx.modal('Diagonal check', `<div class="grid2"><div><label>From corner</label><select name="a">${opts}</select></div><div><label>To corner</label><select name="b">${opts.replace(`value="2"`, `value="2" selected`)}</select></div></div>
      <label>Measured reading</label><select name="m"><option value="">—</option>${lens.map(m => `<option value="${m.id}">${esc(m.label)} · ${esc(ctx.fmt(m))}</option>`).join('')}</select><label>…or type</label><input name="len">`);
    if (!r) return; const len = num(r.data.get('len') || ''); room.diagonals.push({ a: +r.data.get('a'), b: +r.data.get('b'), measId: r.data.get('m') || null, length: len ? len.meters : null }); save('Added diagonal check');
  };
  side.querySelectorAll('[data-deldiag]').forEach(bt => bt.onclick = () => { room.diagonals.splice(+bt.dataset.deldiag, 1); save(); });
  if (wi) {
    side.querySelector('#wSave').onclick = () => {
      wd.label = side.querySelector('#wLabel').value.trim(); const mid = side.querySelector('#wMeas').value, lv = side.querySelector('#wLen').value.trim();
      if (lv) { const p = num(lv); if (!p) return ctx.toast('Cannot parse length'); wd.length = p.meters; wd.measId = null; } else { wd.length = null; wd.measId = mid || null; }
      save(`Wall ${wallName(w)} of "${room.name}" set to ${wd.length != null || wd.measId ? fl(wd.length ?? lookup(wd.measId)) : 'drawn'}`);
    };
    side.querySelectorAll('[data-delop]').forEach(bt => bt.onclick = () => { room.openings.splice(+bt.dataset.delop, 1); save('Removed opening'); });
    side.querySelector('#addOp').onclick = async () => {
      const r = await ctx.modal('Add opening', `<label>Type</label><select name="t"><option>door</option><option>window</option><option>opening</option></select>
       <div class="grid2"><div><label>Offset from corner ${esc(wallName(w))}</label><input name="o" value="${esc(fl(0.3))}"></div><div><label>Width</label><input name="w" value="${esc(fl(0.9144))}"></div>
       <div><label>Height</label><input name="h" value="${esc(fl(2.032))}"></div><div><label>Sill height</label><input name="s" value="0"></div></div>`);
      if (!r) return; const [o, ww, hh, ss] = ['o', 'w', 'h', 's'].map(k => num(r.data.get(k)));
      if (!o || !ww || !hh) return ctx.toast('Check opening dimensions');
      room.openings.push({ wall: w, type: r.data.get('t'), offset: o.meters, width: ww.meters, height: hh.meters, sill: ss ? ss.meters : 0 }); save(`Added ${r.data.get('t')} on wall ${wallName(w)}`);
    };
  }
  function exportBar() {
    const el = document.createElement('div'); el.className = 'card no-print';
    el.innerHTML = `<b>Export floor “${esc(st.floor)}”</b><div class="row"><button class="chip" data-x="svg">SVG</button><button class="chip" data-x="png">PNG</button><button class="chip" data-x="dxf">DXF 2D</button><button class="chip" data-x="dxf3">DXF 3D walls</button><button class="chip" data-x="pts">Points CSV</button></div>`;
    side.append(el);
    el.querySelectorAll('[data-x]').forEach(bt => bt.onclick = () => exportFloor(ctx, projectId, st.floor, bt.dataset.x));
  }
}
export function floorData(ctx, projectId, floor) {
  const lookup = id => ctx.db.measurements.find(m => m.id === id)?.value ?? null;
  const rooms = ctx.db.rooms.filter(r => r.projectId === projectId && (floor == null || r.floor === floor) && r.pts.length > 1);
  return { rooms, solved: rooms.map(r => solveRoom(r, lookup)) };
}
export function floorSVG(ctx, projectId, floor, opts = {}) { const { rooms, solved } = floorData(ctx, projectId, floor); return rooms.length ? planSVG(rooms, solved, { fmtLen: ctx.fl, fmtArea: ctx.fmtArea, ...opts }) : ''; }
export async function exportFloor(ctx, projectId, floor, kind) {
  const p = ctx.proj(projectId), name = `${(p?.name || 'plan').replace(/[^\w-]+/g, '_')}_${floor.replace(/[^\w-]+/g, '_')}`;
  const { rooms, solved } = floorData(ctx, projectId, floor); if (!rooms.length) return ctx.toast('Nothing to export');
  if (kind === 'svg') return ctx.download(name + '.svg', planSVG(rooms, solved, { fmtLen: ctx.fl, fmtArea: ctx.fmtArea }), 'image/svg+xml');
  if (kind === 'dxf' || kind === 'dxf3') return ctx.download(name + (kind === 'dxf3' ? '_3d' : '') + '.dxf', planDXF(rooms, solved, { extrude: kind === 'dxf3' }), 'application/dxf');
  if (kind === 'pts') return ctx.download(name + '_points.csv', pointsCSV(rooms, solved, ['ftin', 'ft', 'in'].includes(ctx.unit()) ? 'ft' : 'm'), 'text/csv;charset=utf-8');
  if (kind === 'png') {
    const svg = planSVG(rooms, solved, { fmtLen: ctx.fl, fmtArea: ctx.fmtArea, pxPerM: 120 });
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
    c.toBlob(b => ctx.downloadBlob(name + '.png', b), 'image/png');
  }
}
