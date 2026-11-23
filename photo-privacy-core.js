// Photo metadata reading and lossless removal for JPEG, PNG and WebP.
// Pure functions on Uint8Array: shared by the browser UI and regression checks.

const TAGS = {
  0x010E: 'Description', 0x010F: 'Camera make', 0x0110: 'Camera model', 0x0112: 'Orientation',
  0x0131: 'Software', 0x0132: 'Modified', 0x013B: 'Artist', 0x8298: 'Copyright',
  0x9003: 'Taken', 0x9004: 'Digitized', 0x9010: 'Time zone', 0xA430: 'Camera owner',
  0xA431: 'Camera serial number', 0xA433: 'Lens make', 0xA434: 'Lens model', 0xA420: 'Unique image ID',
};
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

export function detectFormat(b) {
  if (b[0] === 0xFF && b[1] === 0xD8) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  const brand = ascii(b, 4, 8);
  if (/^ftyp(heic|heix|hevc|mif1|msf1|avif)/.test(brand)) return 'heic';
  return null;
}
function ascii(b, start, len) { let s = ''; for (let i = start; i < start + len && i < b.length; i++) s += String.fromCharCode(b[i]); return s; }
function cstr(b, start, len) { let s = ''; for (let i = start; i < start + len && i < b.length; i++) { if (!b[i]) break; s += String.fromCharCode(b[i]); } try { return decodeURIComponent(escape(s)).trim(); } catch { return s.trim(); } }

// Parse a TIFF/EXIF block. Returns { tags:{name:value}, gps:{lat,lon,alt}|null, orientation }.
export function parseTiff(b, base = 0) {
  const out = { tags: {}, gps: null, orientation: 1 };
  if (b.length < base + 8) return out;
  const order = ascii(b, base, 2);
  if (order !== 'II' && order !== 'MM') return out;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength), le = order === 'II';
  const u16 = o => view.getUint16(base + o, le), u32 = o => view.getUint32(base + o, le);
  const inside = (o, n) => o >= 0 && base + o + n <= b.length;
  function value(entry) {
    const type = u16(entry + 2), count = u32(entry + 4), size = (TYPE_SIZE[type] || 1) * count;
    if (size > 1_000_000) return null;
    const at = size <= 4 ? entry + 8 : u32(entry + 8);
    if (!inside(at, size)) return null;
    if (type === 2 || type === 7) return cstr(b, base + at, count);
    const read = i => type === 3 ? u16(at + i * 2) : type === 4 ? u32(at + i * 4) : type === 9 ? view.getInt32(base + at + i * 4, le)
      : type === 5 ? u32(at + i * 8) / (u32(at + i * 8 + 4) || 1)
      : type === 10 ? view.getInt32(base + at + i * 8, le) / (view.getInt32(base + at + i * 8 + 4, le) || 1) : b[base + at + i];
    return count === 1 ? read(0) : Array.from({ length: Math.min(count, 16) }, (_, i) => read(i));
  }
  function ifd(offset, visit, seen = new Set()) {
    if (!inside(offset, 2) || seen.has(offset)) return; seen.add(offset);
    const n = u16(offset); if (n > 500 || !inside(offset + 2, n * 12)) return;
    for (let i = 0; i < n; i++) { const e = offset + 2 + i * 12; try { visit(u16(e), value(e)); } catch { /* skip damaged entry */ } }
  }
  const pointers = {};
  ifd(u32(4), (tag, v) => {
    if (tag === 0x8769 || tag === 0x8825) pointers[tag] = v;
    else if (tag === 0x0112) out.orientation = v || 1;
    else if (TAGS[tag] && v !== null && v !== '') out.tags[TAGS[tag]] = v;
  });
  if (pointers[0x8769]) ifd(pointers[0x8769], (tag, v) => { if (TAGS[tag] && v !== null && v !== '') out.tags[TAGS[tag]] = v; });
  if (pointers[0x8825]) {
    const g = {}; ifd(pointers[0x8825], (tag, v) => { g[tag] = v; });
    const dms = a => Array.isArray(a) && a.length >= 3 ? a[0] + a[1] / 60 + a[2] / 3600 : typeof a === 'number' ? a : null;
    const lat = dms(g[2]), lon = dms(g[4]);
    if (lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) {
      out.gps = { lat: (g[1] === 'S' ? -1 : 1) * lat, lon: (g[3] === 'W' ? -1 : 1) * lon };
      if (typeof g[6] === 'number' && Number.isFinite(g[6])) out.gps.alt = (g[5] === 1 ? -1 : 1) * g[6];
    } else if (Object.keys(g).length) out.gps = { partial: true };
  }
  return out;
}

function xmpSummary(text) {
  const found = {};
  const grab = (label, re) => { const m = text.match(re); if (m) found[label] = m[1].trim().slice(0, 120); };
  grab('Creator tool', /xmp:CreatorTool(?:="|>)([^"<]+)/);
  grab('Author', /dc:creator[\s\S]*?<rdf:li[^>]*>([^<]+)/);
  grab('Location (XMP)', /exif:GPSLatitude(?:="|>)([^"<]+)/);
  grab('Camera model', /tiff:Model(?:="|>)([^"<]+)/);
  grab('Taken', /(?:photoshop:DateCreated|exif:DateTimeOriginal)(?:="|>)([^"<]+)/);
  grab('Edit history', /(xmpMM:History)/);
  return found;
}

function emptyReport(format) { return { format, gps: null, orientation: 1, tags: {}, blocks: [] }; }
function mergeTiff(report, tiff) {
  Object.assign(report.tags, tiff.tags);
  if (tiff.gps && !report.gps) report.gps = tiff.gps;
  if (tiff.orientation && tiff.orientation !== 1) report.orientation = tiff.orientation;
}

// ---- JPEG ----
// Walk JPEG segments. Calls visit(marker, start, end) for each header segment; returns the index just after EOI.
function walkJpeg(b, visit) {
  if (b[0] !== 0xFF || b[1] !== 0xD8) throw new Error('This is not a valid JPEG file.');
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xFF) throw new Error('This JPEG file appears to be damaged.');
    while (b[i] === 0xFF) i++; // fill bytes
    const marker = b[i], start = i - 1; i++;
    if (marker === 0xD9) return i;                                   // EOI
    if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { visit(marker, start, i); continue; }
    if (i + 2 > b.length) throw new Error('This JPEG file appears to be cut off.');
    const len = (b[i] << 8) | b[i + 1], end = i + len;
    if (len < 2 || end > b.length) throw new Error('This JPEG file appears to be damaged.');
    visit(marker, start, end); i = end;
    if (marker === 0xDA) {                                            // entropy-coded data until next real marker
      while (i < b.length) { if (b[i] === 0xFF && b[i + 1] !== 0x00 && !(b[i + 1] >= 0xD0 && b[i + 1] <= 0xD7)) break; i++; }
      visit(-1, end, i);                                              // scan data
    }
  }
  return b.length; // no EOI: keep everything
}
function jpegLabel(b, marker, start, end) {
  const id = ascii(b, start + 4, Math.min(30, end - start - 4));
  if (marker === 0xE1 && id.startsWith('Exif')) return 'exif';
  if (marker === 0xE1 && id.startsWith('http://ns.adobe.com/xap')) return 'xmp';
  if (marker === 0xE1 && id.startsWith('http://ns.adobe.com/xmp/extension')) return 'xmp';
  if (marker === 0xE2 && id.startsWith('ICC_PROFILE')) return 'icc';
  if (marker === 0xE2 && id.startsWith('MPF')) return 'mpf';
  if (marker === 0xED) return 'iptc';
  if (marker === 0xFE) return 'comment';
  if (marker === 0xE0) return id.startsWith('JFIF') ? 'jfif' : 'app0';
  if (marker === 0xEE) return 'adobe';
  if (marker >= 0xE0 && marker <= 0xEF) return 'app';
  return 'image';
}
const LABELS = { exif: 'EXIF (camera, dates, location)', xmp: 'XMP (editing and author data)', iptc: 'IPTC/Photoshop (captions, author)',
  comment: 'Comment', mpf: 'Embedded extra images (MPF)', app: 'Other app data', trailer: 'Data after the image (thumbnails, extras)',
  text: 'Text data', exifchunk: 'EXIF (camera, dates, location)', xmpchunk: 'XMP (editing and author data)', time: 'Last-modified time' };

function readJpeg(b) {
  const r = emptyReport('jpeg');
  const eoi = walkJpeg(b, (marker, start, end) => {
    if (marker < 0) return;
    const kind = jpegLabel(b, marker, start, end);
    if (kind === 'exif') mergeTiff(r, parseTiff(b, start + 10));
    if (kind === 'xmp') Object.assign(r.tags, xmpSummary(new TextDecoder().decode(b.subarray(start + 4, end))));
    if (kind === 'comment') r.tags.Comment = cstr(b, start + 4, end - start - 4).slice(0, 120);
    if (LABELS[kind]) r.blocks.push({ kind, label: LABELS[kind], bytes: end - start });
  });
  if (eoi < b.length - 2) r.blocks.push({ kind: 'trailer', label: LABELS.trailer, bytes: b.length - eoi });
  return r;
}
// Minimal EXIF holding only the orientation, so photos stay the right way up.
export function orientationExif(orientation) {
  const s = [0xFF, 0xE1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4D, 0x4D, 0x00, 0x2A, 0, 0, 0, 8, 0, 1,
    0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation & 0xFF, 0, 0, 0, 0, 0, 0];
  return new Uint8Array(s);
}
function stripJpeg(b, orientation) {
  const parts = [b.subarray(0, 2)]; let added = false;
  const eoi = walkJpeg(b, (marker, start, end) => {
    const kind = marker < 0 ? 'scan' : jpegLabel(b, marker, start, end);
    if (['exif', 'xmp', 'iptc', 'comment', 'mpf', 'app'].includes(kind)) return;
    if (!added && orientation > 1 && orientation <= 8 && kind !== 'jfif') { parts.push(orientationExif(orientation)); added = true; }
    parts.push(b.subarray(start, end));
  });
  parts.push(new Uint8Array([0xFF, 0xD9]));
  return concat(parts, eoi);
}

// ---- PNG ----
function* pngChunks(b) {
  let i = 8;
  while (i + 12 <= b.length) {
    const len = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3], type = ascii(b, i + 4, 4), end = i + 12 + len;
    if (end > b.length || end <= i) throw new Error('This PNG file appears to be damaged.');
    yield { type, start: i, data: i + 8, len, end }; i = end;
    if (type === 'IEND') return;
  }
}
const PNG_META = { tEXt: 'text', zTXt: 'text', iTXt: 'text', eXIf: 'exifchunk', tIME: 'time' };
function readPng(b) {
  const r = emptyReport('png');
  for (const c of pngChunks(b)) {
    const kind = PNG_META[c.type]; if (!kind) continue;
    r.blocks.push({ kind, label: LABELS[kind], bytes: c.end - c.start });
    if (c.type === 'eXIf') mergeTiff(r, parseTiff(b, c.data));
    if (c.type === 'tEXt' || c.type === 'iTXt' || c.type === 'zTXt') {
      const key = cstr(b, c.data, Math.min(79, c.len)); const sep = c.data + key.length + 1;
      if (key === 'XML:com.adobe.xmp') { Object.assign(r.tags, xmpSummary(new TextDecoder().decode(b.subarray(sep, c.end - 4)))); continue; }
      let text = '(compressed)';
      if (c.type === 'tEXt') text = cstr(b, sep, c.end - 4 - sep);
      if (c.type === 'iTXt' && b[sep] === 0) { let p = sep + 2; while (b[p]) p++; p++; while (b[p]) p++; p++; text = new TextDecoder().decode(b.subarray(p, c.end - 4)); }
      r.tags[key || 'Text'] = text.slice(0, 120);
    }
  }
  return r;
}
let crcTable = null;
function crc32(bytes) {
  if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (const x of bytes) c = crcTable[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0;
}
const tiffOnly = o => orientationExif(o).subarray(10); // bare TIFF block (no JPEG marker / "Exif" header)
function stripPng(b, orientation) {
  const parts = [b.subarray(0, 8)];
  for (const c of pngChunks(b)) {
    if (PNG_META[c.type]) continue;
    if (c.type === 'IDAT' && orientation > 1 && orientation <= 8 && !parts.added) { // eXIf must come before image data
      const tiff = tiffOnly(orientation), chunk = new Uint8Array(12 + tiff.length), dv = new DataView(chunk.buffer);
      dv.setUint32(0, tiff.length); chunk.set([0x65, 0x58, 0x49, 0x66], 4); chunk.set(tiff, 8); dv.setUint32(8 + tiff.length, crc32(chunk.subarray(4, 8 + tiff.length)));
      parts.push(chunk); parts.added = true;
    }
    parts.push(b.subarray(c.start, c.end));
  }
  return concat(parts);
}

// ---- WebP ----
function* webpChunks(b) {
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4), len = (b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)) >>> 0, end = i + 8 + len + (len & 1);
    if (i + 8 + len > b.length || end <= i) throw new Error('This WebP file appears to be damaged.');
    yield { type, start: i, data: i + 8, len, end: Math.min(end, b.length) }; i = end;
  }
}
function readWebp(b) {
  const r = emptyReport('webp');
  for (const c of webpChunks(b)) {
    if (c.type === 'EXIF') { r.blocks.push({ kind: 'exifchunk', label: LABELS.exifchunk, bytes: c.end - c.start }); mergeTiff(r, parseTiff(b, ascii(b, c.data, 4) === 'Exif' ? c.data + 6 : c.data)); }
    if (c.type === 'XMP ') { r.blocks.push({ kind: 'xmpchunk', label: LABELS.xmpchunk, bytes: c.end - c.start }); Object.assign(r.tags, xmpSummary(new TextDecoder().decode(b.subarray(c.data, c.data + c.len)))); }
  }
  return r;
}
function stripWebp(b, orientation) {
  const parts = [b.subarray(0, 12)], keep = orientation > 1 && orientation <= 8;
  for (const c of webpChunks(b)) {
    if (c.type === 'EXIF' || c.type === 'XMP ') continue;
    if (c.type === 'VP8X') { const copy = b.slice(c.start, c.end); copy[8] &= ~0x0C; if (keep) copy[8] |= 0x08; parts.push(copy); }
    else parts.push(b.subarray(c.start, c.end));
  }
  if (keep && parts.some(p => ascii(p, 0, 4) === 'VP8X')) { // EXIF chunk goes at the end of a VP8X file
    const tiff = tiffOnly(orientation), chunk = new Uint8Array(8 + tiff.length + (tiff.length & 1));
    chunk.set([0x45, 0x58, 0x49, 0x46], 0); new DataView(chunk.buffer).setUint32(4, tiff.length, true); chunk.set(tiff, 8); parts.push(chunk);
  }
  const out = concat(parts), size = out.length - 8;
  out[4] = size & 0xFF; out[5] = (size >> 8) & 0xFF; out[6] = (size >> 16) & 0xFF; out[7] = (size >>> 24) & 0xFF;
  return out;
}

function concat(parts, limit) {
  const total = parts.reduce((n, p) => n + p.length, 0), out = new Uint8Array(total); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function readMetadata(bytes) {
  const f = detectFormat(bytes);
  if (f === 'heic') throw new Error('HEIC/AVIF photos are not supported. On iPhone, choose Settings → Camera → Formats → Most Compatible, or share the photo as JPG.');
  if (f === 'jpeg') return readJpeg(bytes);
  if (f === 'png') return readPng(bytes);
  if (f === 'webp') return readWebp(bytes);
  throw new Error('Choose a JPG, PNG or WebP photo.');
}
// Returns new bytes with metadata removed. Image data is copied unchanged (no re-compression).
export function stripMetadata(bytes) {
  const r = readMetadata(bytes);
  const out = r.format === 'jpeg' ? stripJpeg(bytes, r.orientation) : r.format === 'png' ? stripPng(bytes, r.orientation) : stripWebp(bytes, r.orientation);
  return { bytes: out, format: r.format, before: r };
}
export function formatCoordinates(gps) {
  if (!gps || gps.partial) return gps ? 'Partial location data' : '';
  const f = (v, pos, neg) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;
  return `${f(gps.lat, 'N', 'S')}, ${f(gps.lon, 'E', 'W')}${gps.alt !== undefined ? ` · ${Math.round(gps.alt)} m altitude` : ''}`;
}
