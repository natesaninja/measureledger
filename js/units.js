// Unit parsing/formatting. Canonical length = meters (number).
export const M_PER = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254, yd: 0.9144 };
const ALIAS = { m:'m',meter:'m',meters:'m',metre:'m',metres:'m', cm:'cm', mm:'mm',
  ft:'ft',feet:'ft',foot:'ft',"'":'ft','′':'ft', in:'in',inch:'in',inches:'in','"':'in','″':'in', yd:'yd',yds:'yd',yard:'yd',yards:'yd' };

function num(s) { // "6", "6.5", "1/2", "6 1/2", "6-1/2"
  s = s.trim();
  let m = s.match(/^(\d+(?:\.\d+)?)?[\s-]*(?:(\d+)\/(\d+))?$/);
  if (!m || (m[1] === undefined && m[2] === undefined)) return NaN;
  let v = m[1] !== undefined ? parseFloat(m[1]) : 0;
  if (m[2] !== undefined) { const d = +m[3]; if (!d) return NaN; v += +m[2] / d; }
  return v;
}

/** Parse a length string. Returns {meters, unit} or null. defaultUnit used for bare numbers. */
export function parseLength(input, defaultUnit = 'ft') {
  if (input == null) return null;
  let s = String(input).trim().toLowerCase().replace(/,/g, '.').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/''/g, '"');
  if (!s) return null;
  let neg = false; if (s.startsWith('-')) { neg = true; s = s.slice(1).trim(); }
  // feet + inches: 12' 6 1/2"  |  12 ft 6 in  | 12'6
  let m = s.match(/^([\d.\/\s-]+?)\s*(?:'|′|ft|feet|foot)\s*(?:([\d.\/\s-]+?)\s*(?:"|″|in|inch|inches)?)?$/);
  if (m) {
    const f = num(m[1]); const i = m[2] ? num(m[2]) : 0;
    if (isNaN(f) || isNaN(i)) return null;
    const unit = m[2] ? 'ftin' : 'ft';
    return { meters: (neg ? -1 : 1) * (f * M_PER.ft + i * M_PER.in), unit };
  }
  m = s.match(/^([\d.\/\s-]+?)\s*([a-z"'″′]+)?$/);
  if (!m) return null;
  const v = num(m[1]); if (isNaN(v)) return null;
  let u = m[2] ? ALIAS[m[2]] : (defaultUnit === 'ftin' ? 'ft' : defaultUnit);
  if (!u || !M_PER[u]) return null;
  return { meters: (neg ? -1 : 1) * v * M_PER[u], unit: u };
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

/** Format meters in a display unit: 'ftin' | 'ft' | 'in' | 'm' | 'cm' | 'mm'. denom = fraction precision for ftin/in. */
export function formatLength(meters, unit = 'ftin', { denom = 16, digits } = {}) {
  if (meters == null || !isFinite(meters)) return '';
  const sign = meters < 0 ? '-' : ''; const a = Math.abs(meters);
  if (unit === 'ftin' || unit === 'in') {
    let totalN = Math.round(a / M_PER.in * denom); // in 1/denom inches
    let ft = 0;
    if (unit === 'ftin') { ft = Math.floor(totalN / (12 * denom)); totalN -= ft * 12 * denom; }
    const whole = Math.floor(totalN / denom); let n = totalN - whole * denom;
    let frac = ''; if (n) { const g = gcd(n, denom); frac = `${n / g}/${denom / g}`; }
    const inch = whole && frac ? `${whole} ${frac}` : (frac || String(whole));
    if (unit === 'in') return `${sign}${inch}"`;
    return ft ? `${sign}${ft}' ${inch}"` : `${sign}${inch}"`;
  }
  const d = digits ?? { ft: 2, m: 3, cm: 1, mm: 0, yd: 2 }[unit] ?? 2;
  return `${sign}${(a / M_PER[unit]).toFixed(d)} ${unit}`;
}

// Area/volume
export const M2_PER = { m: 1, ft: M_PER.ft ** 2, cm: 1e-4, in: M_PER.in ** 2, mm: 1e-6, yd: M_PER.yd ** 2, ftin: M_PER.ft ** 2 };
export const M3_PER = { m: 1, ft: M_PER.ft ** 3, cm: 1e-6, in: M_PER.in ** 3, mm: 1e-9, yd: M_PER.yd ** 3, ftin: M_PER.ft ** 3 };
export function areaUnit(u) { return ['ftin', 'ft'].includes(u) ? 'ft' : u; }
export function formatArea(m2, unit = 'ft') { const u = areaUnit(unit); return `${(m2 / M2_PER[u]).toFixed(2)} ${u}²`; }
export function formatVolume(m3, unit = 'ft') { const u = areaUnit(unit); return `${(m3 / M3_PER[u]).toFixed(2)} ${u}³`; }
export function convert(value, from, to) { return value * M_PER[from] / M_PER[to]; }

/** Format a measurement's canonical value by its kind. */
export function formatValue(meas, unit) {
  if (meas.kind === 'area') return formatArea(meas.value, unit);
  if (meas.kind === 'volume') return formatVolume(meas.value, unit);
  if (meas.kind === 'angle') return `${(+meas.value).toFixed(1)}°`;
  if (meas.kind === 'slope') return formatPitch(+meas.value);
  return formatLength(meas.value, unit);
}

// ---------- Area / volume / angle / pitch parsing ----------
const AREA_ALIAS = { 'm2': 'm', 'm²': 'm', 'sqm': 'm', 'sq m': 'm', 'square meters': 'm', 'square metres': 'm',
  'ft2': 'ft', 'ft²': 'ft', 'sqft': 'ft', 'sq ft': 'ft', 'sf': 'ft', 'square feet': 'ft', 'square foot': 'ft',
  'in2': 'in', 'in²': 'in', 'sq in': 'in', 'yd2': 'yd', 'yd²': 'yd', 'sq yd': 'yd', 'sqyd': 'yd', 'cm2': 'cm', 'cm²': 'cm', 'sq cm': 'cm', 'mm2': 'mm', 'mm²': 'mm' };
const VOL_ALIAS = { 'm3': 'm', 'm³': 'm', 'cu m': 'm', 'cubic meters': 'm', 'ft3': 'ft', 'ft³': 'ft', 'cu ft': 'ft', 'cf': 'ft', 'cubic feet': 'ft',
  'yd3': 'yd', 'yd³': 'yd', 'cu yd': 'yd', 'cy': 'yd', 'cubic yards': 'yd', 'yards': 'yd', 'in3': 'in', 'in³': 'in', 'cu in': 'in', 'cm3': 'cm', 'cm³': 'cm', 'cc': 'cm' };
const VOL_EXTRA = { l: 0.001, liter: 0.001, liters: 0.001, litre: 0.001, litres: 0.001, gal: 0.003785411784, gallon: 0.003785411784, gallons: 0.003785411784 };
function splitNum(s) { const m = String(s ?? '').trim().toLowerCase().replace(/,(?=\d{1,2}\b)/, '.').match(/^(-?\d*\.?\d+(?:e-?\d+)?)\s*(.*)$/); return m ? [parseFloat(m[1]), m[2].replace(/\s+/g, ' ').replace(/\.$/, '').trim()] : null; }
/** "120 sq ft", "12 m²", "1200sf", "10 sq yd", "12' x 10'" -> {value m², unit} */
export function parseArea(input, defaultUnit = 'ft') {
  const s = String(input ?? '').trim(); if (!s) return null;
  const x = s.split(/\s*[x×*]\s*/i);
  if (x.length === 2) { const a = parseLength(x[0], defaultUnit), b = parseLength(x[1], defaultUnit); return a && b ? { value: a.meters * b.meters, unit: areaUnit(a.unit) } : null; }
  const p = splitNum(s); if (!p || isNaN(p[0])) return null;
  const u = p[1] ? AREA_ALIAS[p[1]] : areaUnit(defaultUnit); if (!u) return null;
  return { value: p[0] * M2_PER[u], unit: u };
}
export function parseVolume(input, defaultUnit = 'ft') {
  const s = String(input ?? '').trim(); if (!s) return null;
  const x = s.split(/\s*[x×*]\s*/i);
  if (x.length === 3) { const d = x.map(v => parseLength(v, defaultUnit)); return d.every(Boolean) ? { value: d[0].meters * d[1].meters * d[2].meters, unit: areaUnit(d[0].unit) } : null; }
  const p = splitNum(s); if (!p || isNaN(p[0])) return null;
  if (p[1] && VOL_EXTRA[p[1]]) return { value: p[0] * VOL_EXTRA[p[1]], unit: p[1].startsWith('g') ? 'gal' : 'L' };
  const u = p[1] ? VOL_ALIAS[p[1]] : areaUnit(defaultUnit); if (!u) return null;
  return { value: p[0] * M3_PER[u], unit: u };
}
/** Angle/pitch -> degrees. Accepts "30°", "30 deg", "0.5 rad", "6/12", "6:12", "6 in 12", "50%", "4' / 12'" (rise/run lengths). Bare number = degrees. */
export function parseAngle(input) {
  let s = String(input ?? '').trim().toLowerCase(); if (!s) return null;
  let m = s.match(/^(-?\d*\.?\d+)\s*(?:°|deg|degrees?)?$/); if (m) return { value: +m[1], unit: 'deg' };
  if ((m = s.match(/^(-?\d*\.?\d+)\s*rad$/))) return { value: +m[1] * 180 / Math.PI, unit: 'rad' };
  if ((m = s.match(/^(-?\d*\.?\d+)\s*%$/))) return { value: Math.atan(+m[1] / 100) * 180 / Math.PI, unit: 'pct' };
  if ((m = s.match(/^(-?\d*\.?\d+)\s*(?:\/|:|in)\s*12$/))) return { value: Math.atan(+m[1] / 12) * 180 / Math.PI, unit: 'pitch' };
  const parts = s.split(/\s*(?:\/|:|over)\s*/);
  if (parts.length === 2) { const r = parseLength(parts[0]), n = parseLength(parts[1]); if (r && n && n.meters) return { value: Math.atan2(r.meters, n.meters) * 180 / Math.PI, unit: 'pitch' }; }
  return null;
}
export const pitchFromDeg = deg => { const t = Math.tan(deg * Math.PI / 180); return { deg, pct: t * 100, per12: t * 12, ratio: t }; };
export function formatPitch(deg) { const p = pitchFromDeg(deg); return `${p.per12.toFixed(2)}/12 · ${deg.toFixed(1)}° · ${p.pct.toFixed(1)}%`; }
