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
  return formatLength(meas.value, unit);
}
