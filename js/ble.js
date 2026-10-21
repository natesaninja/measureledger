// Bluetooth groundwork. EXPERIMENTAL: the Mileseey S50 protocol is NOT known; this is a research tool.
// Device adapters turn raw notifications into measurements; the scanner logs raw GATT data for reverse-engineering.

/** Adapter interface (see docs/BLUETOOTH.md):
 *  { id, name, match(device)->bool, optionalServices:[uuid], decode(serviceUuid, charUuid, DataView) -> {meters, mode?}|null } */
export const adapters = [];
export function registerAdapter(a) { if (!a?.id || typeof a.decode !== 'function') throw new Error('invalid adapter'); adapters.push(a); return a; }

// Candidate services commonly used by BLE serial bridges / meters (to be allowed in optionalServices).
export const CANDIDATE_SERVICES = ['0000ffe0-0000-1000-8000-00805f9b34fb', '0000fff0-0000-1000-8000-00805f9b34fb', '0000ffb0-0000-1000-8000-00805f9b34fb',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', '0000180a-0000-1000-8000-00805f9b34fb', '0000180f-0000-1000-8000-00805f9b34fb', '0000fee7-0000-1000-8000-00805f9b34fb', '0000ae30-0000-1000-8000-00805f9b34fb'];

export const toHex = dv => Array.from(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength), b => b.toString(16).padStart(2, '0')).join(' ');
/** Heuristic decodes to help spot a distance in raw payloads (all candidates, none trusted). */
export function guessDecodes(dv) {
  const out = []; const n = dv.byteLength;
  const txt = new TextDecoder().decode(new Uint8Array(dv.buffer, dv.byteOffset, n)).replace(/[^\x20-\x7e]/g, '');
  const m = txt.match(/-?\d+\.\d+/); if (m) out.push({ how: 'ascii', value: +m[0] });
  for (let o = 0; o + 4 <= n; o++) { const f = dv.getFloat32(o, true); if (f > 0.01 && f < 200) out.push({ how: `f32le@${o}`, value: +f.toFixed(4) }); }
  for (let o = 0; o + 4 <= n; o++) { const u = dv.getUint32(o, true); if (u > 10 && u < 200000) out.push({ how: `u32le@${o} mm`, value: u / 1000 }); }
  for (let o = 0; o + 2 <= n; o++) { const u = dv.getUint16(o, true); if (u > 10 && u < 60000) out.push({ how: `u16le@${o} mm`, value: u / 1000 }); }
  return out.slice(0, 12);
}
export const bleSupported = () => !!globalThis.navigator?.bluetooth && !/iPhone|iPad|iPod/.test(globalThis.navigator?.userAgent || '');

/** Experimental scanner: user picks any device; we enumerate GATT and subscribe to every notify/indicate characteristic. */
export async function scan(log) {
  const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [...CANDIDATE_SERVICES, ...adapters.flatMap(a => a.optionalServices || [])] });
  log({ t: 'device', name: dev.name, id: dev.id });
  dev.addEventListener('gattserverdisconnected', () => log({ t: 'disconnected' }));
  const gatt = await dev.gatt.connect(); const services = await gatt.getPrimaryServices();
  for (const s of services) {
    log({ t: 'service', uuid: s.uuid });
    let chars = []; try { chars = await s.getCharacteristics(); } catch (e) { log({ t: 'error', msg: e.message }); }
    for (const c of chars) {
      const p = c.properties; log({ t: 'char', service: s.uuid, uuid: c.uuid, props: Object.keys(Object.getPrototypeOf(p)).filter(k => p[k] === true).join(',') || ['read', 'write', 'notify', 'indicate', 'writeWithoutResponse'].filter(k => p[k]).join(',') });
      if (p.read) { try { const v = await c.readValue(); log({ t: 'read', uuid: c.uuid, hex: toHex(v) }); } catch { } }
      if (p.notify || p.indicate) {
        try {
          await c.startNotifications();
          c.addEventListener('characteristicvaluechanged', e => { const dv = e.target.value; const hit = adapters.map(a => a.match?.(dev) && a.decode(s.uuid, c.uuid, dv)).find(Boolean); log({ t: 'notify', service: s.uuid, uuid: c.uuid, hex: toHex(dv), guesses: guessDecodes(dv), decoded: hit || null }); });
          log({ t: 'subscribed', uuid: c.uuid });
        } catch (e) { log({ t: 'error', msg: e.message }); }
      }
    }
  }
  return { device: dev, disconnect: () => dev.gatt.disconnect() };
}
