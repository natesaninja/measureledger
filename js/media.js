// Media (photos, voice notes) in IndexedDB. Records: {id, kind:'photo'|'audio', mime, blob, projectId, measurementId, name, width, height, duration, annotations:[], createdAt}
const DB = 'measureledger-media', STORE = 'media';
export function openMedia(idb = globalThis.indexedDB) {
  let p;
  const db = () => p ||= new Promise((res, rej) => { const r = idb.open(DB, 1); r.onupgradeneeded = () => { const s = r.result.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('projectId', 'projectId'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(STORE, mode); const s = t.objectStore(STORE); let out; const r = fn(s); if (r) r.onsuccess = () => (out = r.result); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  return {
    put: rec => tx('readwrite', s => s.put(rec)), get: id => tx('readonly', s => s.get(id)), del: id => tx('readwrite', s => s.delete(id)),
    all: () => tx('readonly', s => s.getAll()), byProject: pid => tx('readonly', s => s.index('projectId').getAll(pid)), clear: () => tx('readwrite', s => s.clear()),
  };
}
/** In-memory store with the same interface (tests, fallback when IndexedDB is unavailable). */
export function memoryMedia() { const m = new Map(); return { put: async r => void m.set(r.id, r), get: async id => m.get(id), del: async id => void m.delete(id), all: async () => [...m.values()], byProject: async pid => [...m.values()].filter(r => r.projectId === pid), clear: async () => m.clear() }; }

export async function blobToBase64(blob) {
  const u8 = new Uint8Array(await blob.arrayBuffer()); let s = ''; const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
export function base64ToBlob(b64, mime = 'application/octet-stream') { const s = atob(b64); const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return new Blob([u8], { type: mime }); }
/** Serialize all media for the JSON backup. */
export async function exportMedia(store) { const out = []; for (const r of await store.all()) { const { blob, ...meta } = r; out.push({ ...meta, mime: r.mime || blob?.type, b64: blob ? await blobToBase64(blob) : null }); } return out; }
/** Restore media from backup (replace = clear first). Returns count. */
export async function importMedia(store, list = [], { replace = true } = {}) {
  if (replace) await store.clear(); let n = 0;
  for (const r of list) { const { b64, ...meta } = r; if (!meta.id) continue; await store.put({ ...meta, blob: b64 != null ? base64ToBlob(b64, meta.mime) : null }); n++; }
  return n;
}
/** Downscale an image Blob/File to max dimension; returns {blob,width,height}. Browser only. */
export async function downscaleImage(file, max = 1600, quality = 0.85) {
  const bmp = await (globalThis.createImageBitmap ? createImageBitmap(file, { imageOrientation: 'from-image' }) : loadImg(file));
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height)); const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality)); return { blob, width: w, height: h };
}
function loadImg(file) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
export function pickAudioMime() { const MR = globalThis.MediaRecorder; if (!MR) return null; return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find(t => MR.isTypeSupported?.(t)) || ''; }
