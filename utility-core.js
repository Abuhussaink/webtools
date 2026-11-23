export function secureIndex(max, cryptoSource = globalThis.crypto) {
  if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000) throw new Error('Invalid random range.');
  const limit = 0x100000000 - (0x100000000 % max), n = new Uint32Array(1);
  do { cryptoSource.getRandomValues(n); } while (n[0] >= limit);
  return n[0] % max;
}
export function password(length, groups) {
  if (!Number.isInteger(length) || length < 8 || length > 128 || !groups.length) throw new Error('Use 8–128 characters and select at least one character group.');
  const chars = groups.join(''), result = groups.map(g => g[secureIndex(g.length)]);
  while (result.length < length) result.push(chars[secureIndex(chars.length)]);
  for (let i = result.length - 1; i > 0; i--) { const j = secureIndex(i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result.join('');
}
// Uniformly sampled public word list; generated secrets are never stored.
export function passphrase(words, count, separator) {
  if (!Number.isInteger(count) || count < 4 || count > 12) throw new Error('Choose 4–12 words.');
  if (words.length < 1000) throw new Error('The local word list is unavailable. Refresh the page.');
  return Array.from({ length: count }, () => words[secureIndex(words.length)]).join(separator);
}
export function number(value, label = 'Value') {
  if (String(value).trim() === '' || !Number.isFinite(Number(value))) throw new Error(`${label} must be a finite number.`);
  return Number(value);
}
export function nonnegative(value, label) { const n = number(value, label); if (n < 0) throw new Error(`${label} cannot be negative.`); return n; }
export function percentage(part, total) { if (!total) throw new Error('The total cannot be zero.'); return part / total * 100; }
export function discount(price, rate) { if (price < 0 || rate < 0 || rate > 100) throw new Error('Use a nonnegative price and a discount from 0–100%.'); return { saving: price * rate / 100, total: price * (1 - rate / 100) }; }
export function vat(amount, rate, included = false) { if (amount < 0 || rate < 0) throw new Error('Amount and VAT rate cannot be negative.'); const net = included ? amount / (1 + rate / 100) : amount; return { net, tax: net * rate / 100, gross: net * (1 + rate / 100) }; }
export function dateValue(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a valid date.'); const d = new Date(value + 'T00:00:00Z'); if (!Number.isFinite(+d) || d.toISOString().slice(0,10) !== value) throw new Error('Choose a valid date.'); return d; }
export function dateDifference(a, b) { return Math.round((dateValue(b) - dateValue(a)) / 86400000); }
export function age(birth, asOf) {
  const a = dateValue(birth), b = dateValue(asOf); if (a > b) throw new Error('Birth date must be on or before the reference date.');
  let years = b.getUTCFullYear() - a.getUTCFullYear();
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) years--;
  return years;
}
export const units = {
 Length: { metre:1, kilometre:1000, centimetre:.01, millimetre:.001, inch:.0254, foot:.3048, yard:.9144, mile:1609.344 },
 Mass: { kilogram:1, gram:.001, milligram:.000001, pound:.45359237, ounce:.028349523125 },
 Volume: { litre:1, millilitre:.001, 'US gallon':3.785411784, 'Imperial gallon':4.54609, 'US cup':.2365882365 },
 Area: { 'square metre':1, 'square kilometre':1e6, hectare:10000, acre:4046.8564224, 'square foot':.09290304 },
 Speed: { 'metre/second':1, 'kilometre/hour':1/3.6, 'mile/hour':.44704, knot:.514444444444 },
 Temperature: { Celsius:1, Fahrenheit:1, Kelvin:1 }
};
export function convert(value, category, from, to) {
  const group = units[category]; if (!group || !(from in group) || !(to in group)) throw new Error('Choose valid units.');
  if (category !== 'Temperature') return value * group[from] / group[to];
  const c = from === 'Celsius' ? value : from === 'Fahrenheit' ? (value - 32) / 1.8 : value - 273.15;
  if (c < -273.150000001) throw new Error('Temperature cannot be below absolute zero.');
  return to === 'Celsius' ? c : to === 'Fahrenheit' ? c * 1.8 + 32 : c + 273.15;
}
export function removeDuplicates(text, ignoreCase = false) { const seen = new Set(); return text.split(/\r?\n/).filter(line => { const key = ignoreCase ? line.toLocaleLowerCase() : line; if (seen.has(key)) return false; seen.add(key); return true; }).join('\n'); }
export function replaceLiteral(text, find, replacement, ignoreCase = false) {
  if (!find) throw new Error('Enter text to find.');
  if (find.length > 10000 || replacement.length > 10000) throw new Error('Find and replacement text are limited to 10,000 characters.');
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, ignoreCase ? 'giu' : 'gu');
  let size = text.length;
  for (const match of text.matchAll(pattern)) { size += replacement.length - match[0].length; if (size > 5000000) throw new Error('The result would exceed 5 million characters. Use a shorter replacement.'); }
  return text.replace(pattern, () => replacement);
}
export function wordCount(text) {
  let words = 0;
  if (typeof Intl.Segmenter === 'function') { for (const segment of new Intl.Segmenter(undefined,{granularity:'word'}).segment(text)) if (segment.isWordLike) words++; }
  else words = (text.trim().match(/\S+/gu)||[]).length;
  return { words, characters:[...text].length, lines:text ? text.split(/\r?\n/).length : 0 };
}

// ---- Random picker (giveaways) ----
export const PICKER_LIMITS = { chars: 10_000_000, lines: 200_000, entries: 100_000, picks: 1000 };
// Minimal RFC 4180 CSV parser: quoted fields, doubled quotes, commas/newlines inside quotes.
export function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
      if (rows.length > PICKER_LIMITS.lines + 1) throw new Error(`Use a file with up to ${PICKER_LIMITS.lines.toLocaleString('en')} rows.`);
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
// Turn raw text into entries: one per non-empty line, in their original order.
export function textEntries(text) {
  if (text.length > PICKER_LIMITS.chars) throw new Error('Use up to 10 million characters (about 10 MB) at a time.');
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.length > PICKER_LIMITS.lines) throw new Error(`Use up to ${PICKER_LIMITS.lines.toLocaleString('en')} lines at a time.`);
  return lines;
}
// Usernames are compared without a leading @ and without capitals when `loose` is on.
const nameKey = (s, loose) => loose ? s.replace(/^@+/, '').toLowerCase() : s;
// Prepare entries: keep the first N (in list order), then optionally remove duplicates (keeping the first).
export function prepareEntries(entries, { firstN = 0, unique = true, loose = false } = {}) {
  const total = entries.length;
  if (firstN && (!Number.isInteger(firstN) || firstN < 1)) throw new Error('"Use only the first" must be a whole number of 1 or more.');
  let list = firstN ? entries.slice(0, firstN) : entries.slice();
  const used = list.length;
  if (unique) { const seen = new Set(); list = list.filter(e => { const k = nameKey(e, loose); if (seen.has(k)) return false; seen.add(k); return true; }); }
  if (list.length > PICKER_LIMITS.entries) throw new Error(`Up to ${PICKER_LIMITS.entries.toLocaleString('en')} entries can be drawn from. Use "Use only the first" to limit the list.`);
  return { list, total, used, unique: list.length };
}
// Draw n distinct entries uniformly at random (partial Fisher–Yates with crypto randomness).
export function drawWinners(list, n, cryptoSource = globalThis.crypto) {
  if (!Number.isInteger(n) || n < 1 || n > PICKER_LIMITS.picks) throw new Error(`Choose 1–${PICKER_LIMITS.picks.toLocaleString('en')} winners.`);
  if (n > list.length) throw new Error(`You asked for ${n} winners but there are only ${list.length} entries.`);
  const a = list.slice();
  for (let i = 0; i < n; i++) { const j = i + secureIndex(a.length - i, cryptoSource); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

// ---- Hijri (Umm al-Qura) ↔ Gregorian, using the browser's built-in calendar data ----
export const HIJRI_MONTHS = ['Muharram','Safar','Rabi al-Awwal','Rabi al-Thani','Jumada al-Ula','Jumada al-Akhirah','Rajab','Shaban','Ramadan','Shawwal','Dhu al-Qadah','Dhu al-Hijjah'];
const HIJRI_FMT = () => new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
const utcDate = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) throw new Error('Choose a valid date.'); const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); if (d.getUTCDate() !== +m[3]) throw new Error('Choose a valid date.'); return d; };
const isoDate = d => d.toISOString().slice(0, 10);
export function toHijri(gregorian) {
  const d = typeof gregorian === 'string' ? utcDate(gregorian) : gregorian;
  if (d.getUTCFullYear() < 1900 || d.getUTCFullYear() > 2076) throw new Error('Choose a date between 1900 and 2076.');
  const p = Object.fromEntries(HIJRI_FMT().formatToParts(d).map(x => [x.type, x.value]));
  const year = parseInt(p.year, 10), month = +p.month, day = +p.day;
  if (!(year && month && day)) throw new Error('This browser does not support the Hijri calendar. Please update it.');
  return { year, month, day, monthName: HIJRI_MONTHS[month - 1] };
}
export function fromHijri(year, month, day) {
  if (![year, month, day].every(Number.isInteger) || year < 1318 || year > 1500 || month < 1 || month > 12 || day < 1 || day > 30) throw new Error('Enter a Hijri date between 1318 and 1500 AH, month 1–12 and day 1–30.');
  // Estimate from the mean Hijri year, then search nearby days for an exact match.
  const estimate = Date.UTC(622, 6, 16) + ((year - 1) * 354.36667 + (month - 1) * 29.5306 + day - 1) * 86400000;
  for (let off = -40; off <= 40; off++) {
    const d = new Date(estimate + off * 86400000); d.setUTCHours(0, 0, 0, 0);
    const h = toHijri(d); if (h.year === year && h.month === month && h.day === day) return isoDate(d);
  }
  throw new Error(`${HIJRI_MONTHS[month - 1]} ${year} has only 29 days in the Umm al-Qura calendar.`);
}

// ---- End-of-service gratuity (private sector, statutory minimum) ----
export const GRATUITY_RULES = {
  bahrain: 'Bahrain Labour Law (Law 36 of 2012, Art. 116): half a month’s wage for each of the first 3 years, then one month’s wage for each further year.',
  saudi: 'Saudi Labour Law (Art. 84–85): half a month’s wage for each of the first 5 years, then one month’s wage for each further year. On resignation: nothing under 2 years, one third for 2–5 years, two thirds for 5–10 years, full after 10 years.',
  uae: 'UAE Labour Law (Federal Decree-Law 33 of 2021, Art. 51): 21 days’ basic wage for each of the first 5 years, then 30 days for each further year, after at least 1 year of service. The total cannot exceed 2 years’ wages.',
};
export function gratuity({ country, start, end, wage, reason = 'termination' }) {
  const s = utcDate(start), e = utcDate(end);
  if (e <= s) throw new Error('The last working day must be after the start date.');
  if (!(wage > 0)) throw new Error('Enter the monthly wage used for gratuity.');
  const days = Math.round((e - s) / 86400000) + 1, years = days / 365;
  let months, note = '';
  if (country === 'bahrain') months = Math.min(years, 3) * 0.5 + Math.max(years - 3, 0);
  else if (country === 'saudi') {
    months = Math.min(years, 5) * 0.5 + Math.max(years - 5, 0);
    if (reason === 'resignation') {
      const share = years < 2 ? 0 : years < 5 ? 1 / 3 : years < 10 ? 2 / 3 : 1;
      if (share < 1) note = share === 0 ? 'No gratuity on resignation with less than 2 years of service.' : `Resignation: ${share === 1 / 3 ? 'one third' : 'two thirds'} of the full amount.`;
      months *= share;
    }
  } else if (country === 'uae') {
    if (years < 1) { months = 0; note = 'No gratuity with less than 1 year of continuous service.'; }
    else { months = (Math.min(years, 5) * 21 + Math.max(years - 5, 0) * 30) / 30; if (months > 24) { months = 24; note = 'Capped at 2 years’ wages.'; } }
  } else throw new Error('Choose a country.');
  return { days, years, months, amount: months * wage, note, rule: GRATUITY_RULES[country] };
}

// ---- Loans ----
export function loan({ principal, annualRate, months, method = 'reducing' }) {
  if (!(principal > 0)) throw new Error('Enter the loan amount.');
  if (!(annualRate >= 0) || annualRate > 100) throw new Error('Enter an interest rate from 0 to 100%.');
  if (!Number.isInteger(months) || months < 1 || months > 600) throw new Error('Enter a term from 1 to 600 months.');
  const r = annualRate / 100 / 12;
  if (method === 'flat') {
    const interest = principal * annualRate / 100 * months / 12, payment = (principal + interest) / months;
    // Equivalent reducing-balance APR (bisection), so flat offers can be compared fairly.
    let lo = 0, hi = 1;
    for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2, pay = m === 0 ? principal / months : principal * m / (1 - Math.pow(1 + m, -months)); if (pay > payment) hi = m; else lo = m; }
    return { payment, total: payment * months, interest, apr: lo * 12 * 100, schedule: null };
  }
  const payment = r === 0 ? principal / months : principal * r / (1 - Math.pow(1 + r, -months));
  const schedule = []; let balance = principal;
  for (let m = 1; m <= months; m++) {
    const int = balance * r, princ = Math.min(payment - int, balance); balance = Math.max(0, balance - princ);
    const y = Math.ceil(m / 12); schedule[y - 1] = schedule[y - 1] || { year: y, interest: 0, principal: 0, balance: 0 };
    schedule[y - 1].interest += int; schedule[y - 1].principal += princ; schedule[y - 1].balance = balance;
  }
  return { payment, total: payment * months, interest: payment * months - principal, apr: annualRate, schedule };
}

// ---- Zakat on wealth (2.5% when net zakatable wealth reaches the nisab) ----
export function zakat({ cash = 0, gold = 0, silver = 0, investments = 0, business = 0, receivables = 0, debts = 0, nisabBasis = 'gold', goldPrice = 0, silverPrice = 0 }) {
  const values = { cash, gold, silver, investments, business, receivables, debts, goldPrice, silverPrice };
  for (const [k, v] of Object.entries(values)) if (!(v >= 0)) throw new Error('Amounts cannot be negative.');
  const price = nisabBasis === 'gold' ? goldPrice : silverPrice;
  if (!(price > 0)) throw new Error(`Enter today’s ${nisabBasis} price per gram to work out the nisab.`);
  const nisab = (nisabBasis === 'gold' ? 85 : 595) * price;
  const wealth = cash + gold + silver + investments + business + receivables, net = Math.max(0, wealth - debts);
  const due = net >= nisab;
  return { wealth, net, nisab, due, zakat: due ? net * 0.025 : 0 };
}

// ---- Text compare (Myers O(ND) diff) ----
// Returns [{type:'eq'|'del'|'ins', value}] turning a into b. Throws if the texts are too different to compare quickly.
export function diffSequences(a, b, key = x => x, maxEdits = 3000) { // 3000 edits ≈ 36 MB worst case: safe on phones
  const A = a.map(key), B = b.map(key), n = A.length, m = B.length, max = n + m, off = max + 1;
  let v = new Int32Array(2 * max + 3); const trace = [];
  let found = -1;
  for (let d = 0; d <= Math.min(max, maxEdits); d++) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1, y = x - k;
      while (x < n && y < m && A[x] === B[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) { found = d; break; }
    }
    if (found >= 0) break;
  }
  if (found < 0) throw new Error('These texts are too different to compare line by line. Try smaller sections.');
  // Backtrack through the saved frontiers.
  const ops = []; let x = n, y = m;
  for (let d = found; d > 0; d--) {
    const vd = trace[d], get = k => vd[k + d + 1], k = x - y;
    const prevK = (k === -d || (k !== d && get(k - 1) < get(k + 1))) ? k + 1 : k - 1;
    const prevX = get(prevK), prevY = prevX - prevK; // trace[d] holds the frontier reached after d-1 edits
    while (x > prevX && y > prevY) { ops.push({ type: 'eq', value: a[--x] }); y--; }
    if (x === prevX) ops.push({ type: 'ins', value: b[--y] }); else ops.push({ type: 'del', value: a[--x] });
  }
  while (x > 0 && y > 0) { ops.push({ type: 'eq', value: a[--x] }); y--; }
  return ops.reverse();
}
export function compareTexts(left, right, { ignoreCase = false, ignoreSpace = false } = {}) {
  if (left.length + right.length > 2_000_000) throw new Error('Compare up to 1 million characters per side.');
  const lines = t => t.replace(/\r\n?/g, '\n').split('\n');
  const norm = s => { if (ignoreSpace) s = s.replace(/\s+/g, ' ').trim(); if (ignoreCase) s = s.toLowerCase(); return s; };
  const a = lines(left), b = lines(right);
  if (a.length > 50000 || b.length > 50000) throw new Error('Compare up to 50,000 lines per side.');
  const ops = diffSequences(a, b, norm);
  const words = s => s.match(/\s+|[^\s]+/g) || [];
  // Pair each run of deleted lines with the following inserted lines and diff them word by word.
  const out = [];
  for (let i = 0; i < ops.length;) {
    if (ops[i].type === 'eq') { out.push({ type: 'eq', text: ops[i].value }); i++; continue; }
    const del = [], ins = [];
    while (i < ops.length && ops[i].type === 'del') del.push(ops[i++].value);
    while (i < ops.length && ops[i].type === 'ins') ins.push(ops[i++].value);
    const pairs = Math.min(del.length, ins.length);
    for (let j = 0; j < pairs; j++) {
      let parts; try { parts = diffSequences(words(del[j]), words(ins[j]), norm, 2000); } catch { parts = null; }
      out.push({ type: 'change', from: del[j], to: ins[j], parts });
    }
    for (let j = pairs; j < del.length; j++) out.push({ type: 'del', text: del[j] });
    for (let j = pairs; j < ins.length; j++) out.push({ type: 'ins', text: ins[j] });
  }
  const count = t => out.filter(o => o.type === t).length;
  return { rows: out, added: count('ins'), removed: count('del'), changed: count('change'), same: count('eq') };
}
