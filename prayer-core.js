// Prayer times and Qibla, computed on the device from date and coordinates.
// Astronomy follows the standard approach used by PrayTimes.org (sun declination and equation of time).
export const METHODS = {
  makkah: { name: 'Umm al-Qura, Makkah', fajr: 18.5, ishaMinutes: 90, ramadanIshaMinutes: 120 },
  gulf: { name: 'Gulf Region', fajr: 19.5, ishaMinutes: 90 },
  kuwait: { name: 'Kuwait', fajr: 18, isha: 17.5 },
  qatar: { name: 'Qatar', fajr: 18, ishaMinutes: 90 },
  dubai: { name: 'Dubai (UAE)', fajr: 18.2, isha: 18.2 },
  egypt: { name: 'Egyptian General Authority', fajr: 19.5, isha: 17.5 },
  mwl: { name: 'Muslim World League', fajr: 18, isha: 17 },
  isna: { name: 'ISNA (North America)', fajr: 15, isha: 15 },
  karachi: { name: 'University of Islamic Sciences, Karachi', fajr: 18, isha: 18 },
};
// Shia Ithna-Ashari methods: Maghrib when the sun is a few degrees below the horizon, and the Ja'fari midnight.
export const SHIA_METHODS = {
  jafari: { name: 'Ja\u2019fari (Leva Institute, Qum)', fajr: 16, isha: 14, maghrib: 4, midnight: 'jafari' },
  tehran: { name: 'Institute of Geophysics, Tehran', fajr: 17.7, isha: 14, maghrib: 4.5, midnight: 'jafari' },
};
export const CITIES = [
  ['Manama, Bahrain', 26.2285, 50.5860, 'Asia/Bahrain', 'gulf'], ['Muharraq, Bahrain', 26.2572, 50.6119, 'Asia/Bahrain', 'gulf'], ['Riffa, Bahrain', 26.1300, 50.5550, 'Asia/Bahrain', 'gulf'],
  ['Makkah, Saudi Arabia', 21.4225, 39.8262, 'Asia/Riyadh', 'makkah'], ['Madinah, Saudi Arabia', 24.4672, 39.6111, 'Asia/Riyadh', 'makkah'], ['Riyadh, Saudi Arabia', 24.7136, 46.6753, 'Asia/Riyadh', 'makkah'],
  ['Jeddah, Saudi Arabia', 21.5433, 39.1728, 'Asia/Riyadh', 'makkah'], ['Dammam, Saudi Arabia', 26.4207, 50.0888, 'Asia/Riyadh', 'makkah'], ['Al Khobar, Saudi Arabia', 26.2172, 50.1971, 'Asia/Riyadh', 'makkah'],
  ['Dubai, UAE', 25.2048, 55.2708, 'Asia/Dubai', 'dubai'], ['Abu Dhabi, UAE', 24.4539, 54.3773, 'Asia/Dubai', 'dubai'], ['Sharjah, UAE', 25.3463, 55.4209, 'Asia/Dubai', 'dubai'],
  ['Doha, Qatar', 25.2854, 51.5310, 'Asia/Qatar', 'qatar'], ['Kuwait City, Kuwait', 29.3759, 47.9774, 'Asia/Kuwait', 'kuwait'], ['Muscat, Oman', 23.5880, 58.3829, 'Asia/Muscat', 'gulf'],
  ['Cairo, Egypt', 30.0444, 31.2357, 'Africa/Cairo', 'egypt'], ['Amman, Jordan', 31.9454, 35.9284, 'Asia/Amman', 'mwl'], ['Baghdad, Iraq', 33.3152, 44.3661, 'Asia/Baghdad', 'mwl'],
  ['Beirut, Lebanon', 33.8938, 35.5018, 'Asia/Beirut', 'mwl'], ['Istanbul, Türkiye', 41.0082, 28.9784, 'Europe/Istanbul', 'mwl'], ['Karachi, Pakistan', 24.8607, 67.0011, 'Asia/Karachi', 'karachi'],
  ['Lahore, Pakistan', 31.5204, 74.3587, 'Asia/Karachi', 'karachi'], ['Delhi, India', 28.6139, 77.2090, 'Asia/Kolkata', 'karachi'], ['Mumbai, India', 19.0760, 72.8777, 'Asia/Kolkata', 'karachi'],
  ['Dhaka, Bangladesh', 23.8103, 90.4125, 'Asia/Dhaka', 'karachi'], ['Jakarta, Indonesia', -6.2088, 106.8456, 'Asia/Jakarta', 'mwl'], ['Kuala Lumpur, Malaysia', 3.1390, 101.6869, 'Asia/Kuala_Lumpur', 'mwl'],
  ['London, UK', 51.5074, -0.1278, 'Europe/London', 'mwl'], ['Manchester, UK', 53.4808, -2.2426, 'Europe/London', 'mwl'], ['Paris, France', 48.8566, 2.3522, 'Europe/Paris', 'mwl'],
  ['New York, USA', 40.7128, -74.0060, 'America/New_York', 'isna'], ['Toronto, Canada', 43.6532, -79.3832, 'America/Toronto', 'isna'],
].map(([name, lat, lon, tz, method]) => ({ name, lat, lon, tz, method }));

const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const fix = (a, b) => { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };
const dsin = d => Math.sin(rad(d)), dcos = d => Math.cos(rad(d)), dtan = d => Math.tan(rad(d));
const darcsin = x => deg(Math.asin(x)), darccos = x => deg(Math.acos(x)), darctan2 = (y, x) => deg(Math.atan2(y, x)), darccot = x => deg(Math.atan(1 / x));

function julian(y, m, d) { if (m <= 2) { y -= 1; m += 12; } const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4); return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5; }
function sunPosition(jd) {
  const D = jd - 2451545.0, g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * dsin(g) + 0.020 * dsin(2 * g), 360), e = 23.439 - 0.00000036 * D;
  const RA = darctan2(dcos(e) * dsin(L), dcos(L)) / 15, eqt = q / 15 - fix(RA, 24), decl = darcsin(dsin(e) * dsin(L));
  return { decl, eqt };
}

// Offset of an IANA time zone from UTC, in hours, at a given instant.
export function zoneOffset(tz, date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(date).map(x => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime()) / 3600000;
}

// Returns times as fractional hours in local time, or NaN where the sun never reaches the angle.
export function prayerTimes({ year, month, day, lat, lon, tz, method = 'mwl', asr = 'standard', highLat = 'angle', ramadan = false }) {
  const m = METHODS[method] || SHIA_METHODS[method]; if (!m) throw new Error('Choose a calculation method.');
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new Error('Latitude must be −90 to 90 and longitude −180 to 180.');
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 12));
  const offset = typeof tz === 'number' ? tz : zoneOffset(tz, noonUtc);
  const jDate = julian(year, month, day) - lon / (15 * 24);
  // Iterate once: compute at approximate times, then refine each prayer using the sun at that moment.
  const approx = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, maghrib: 18, isha: 18 };
  const midDay = t => { const { eqt } = sunPosition(jDate + t / 24); return fix(12 - eqt, 24); };
  const sunAngleTime = (angle, t, ccw) => {
    const { decl } = sunPosition(jDate + t / 24), noon = midDay(t);
    const x = (-dsin(angle) - dsin(decl) * dsin(lat)) / (dcos(decl) * dcos(lat));
    if (x > 1 || x < -1) return NaN;
    const T = darccos(x) / 15; return noon + (ccw ? -T : T);
  };
  const asrTime = (factor, t) => { const { decl } = sunPosition(jDate + t / 24); return sunAngleTime(-darccot(factor + dtan(Math.abs(lat - decl))), t); };
  let t = { ...approx };
  for (let i = 0; i < 1; i++) { // one refinement pass, as in PrayTimes; matches Aladhan best
    const h = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, (Number.isFinite(v) ? v : approx[k]) / 24]));
    t = {
      fajr: sunAngleTime(m.fajr, h.fajr * 24, true), sunrise: sunAngleTime(0.833, h.sunrise * 24, true), dhuhr: midDay(h.dhuhr * 24),
      asr: asrTime(asr === 'hanafi' ? 2 : 1, h.asr * 24), sunset: sunAngleTime(0.833, h.sunset * 24), maghrib: sunAngleTime(m.maghrib || 0.833, h.maghrib * 24),
      isha: m.isha ? sunAngleTime(m.isha, h.isha * 24) : NaN,
    };
  }
  const shift = offset - lon / 15;
  for (const k in t) t[k] += shift;
  const ishaMin = ramadan && m.ramadanIshaMinutes ? m.ramadanIshaMinutes : m.ishaMinutes;
  if (ishaMin) t.isha = t.maghrib + ishaMin / 60;
  // High-latitude adjustment (angle-based): limit night portions so Fajr/Isha always exist.
  const night = 24 + t.sunrise - t.sunset;
  if (Number.isFinite(night) && highLat === 'angle') {
    const fajrLimit = t.sunrise - night * m.fajr / 60;
    if (!Number.isFinite(t.fajr) || t.fajr < fajrLimit) t.fajr = fajrLimit;
    if (!ishaMin) { const ishaLimit = t.sunset + night * m.isha / 60; if (!Number.isFinite(t.isha) || t.isha > ishaLimit) t.isha = ishaLimit; }
  }
  // Islamic midnight: halfway from sunset to sunrise (standard) or to Fajr (Ja'fari).
  t.midnight = t.sunset + ((m.midnight === 'jafari' ? t.fajr : t.sunrise) + 24 - t.sunset) / 2;
  delete t.sunset;
  return { times: t, offset };
}

export function formatTime(h, use24 = true) {
  if (!Number.isFinite(h)) return '—';
  const total = Math.round(fix(h, 24) * 60) % 1440, hh = Math.floor(total / 60), mm = total % 60;
  if (use24) return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  return `${(hh % 12) || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

// Great-circle bearing from the location to the Kaaba, degrees clockwise from true north.
export function qibla(lat, lon) {
  const k = { lat: 21.422487, lon: 39.826206 }, dl = rad(k.lon - lon);
  return fix(deg(Math.atan2(Math.sin(dl), Math.cos(rad(lat)) * Math.tan(rad(k.lat)) - Math.sin(rad(lat)) * Math.cos(dl))), 360);
}
export function distanceToMakkah(lat, lon) {
  const k = { lat: 21.422487, lon: 39.826206 }, a = Math.sin(rad(k.lat - lat) / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(k.lat)) * Math.sin(rad(k.lon - lon) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
