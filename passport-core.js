// Passport / ID photo sizes, print-sheet layout and JPEG print-resolution tagging.
// head: [min,max] chin-to-crown height in mm (guide only). Always check the latest official rules.
export const PRESETS = {
  'eu-35x45': { label: '35 × 45 mm — UK, EU/Schengen and many countries', w: 35, h: 45, head: [29, 34] },
  'us-2x2': { label: '2 × 2 in (51 × 51 mm) — USA', w: 50.8, h: 50.8, head: [25.4, 35] },
  'gcc-40x60': { label: '40 × 60 mm (4 × 6 cm) — used by several Gulf countries', w: 40, h: 60, head: [32, 36] },
  'uae-43x55': { label: '43 × 55 mm — UAE visa', w: 43, h: 55, head: [32, 36] },
  'ca-50x70': { label: '50 × 70 mm — Canada', w: 50, h: 70, head: [31, 36] },
  'cn-33x48': { label: '33 × 48 mm — China visa', w: 33, h: 48, head: [28, 33] },
};
export const SHEETS = {
  '4x6': { label: '4 × 6 in photo paper (10 × 15 cm)', w: 101.6, h: 152.4 },
  'a4': { label: 'A4 paper', w: 210, h: 297 },
  'letter': { label: 'US Letter paper', w: 215.9, h: 279.4 },
};
export const mmToPx = (mm, dpi) => Math.round(mm / 25.4 * dpi);

// How many photos fit on a sheet (tries both sheet orientations), centred, with a gap for cutting.
// Uses comfortable spacing (2 mm gaps, 4 mm margin) unless edge-to-edge fits more photos.
export function sheetLayout(photo, sheet) {
  let roomy = null, tight = null;
  try { roomy = layoutWith(photo, sheet, 2, 4); } catch { /* may not fit */ }
  tight = layoutWith(photo, sheet, 0, 0);
  return roomy && roomy.count >= tight.count ? roomy : tight;
}
function layoutWith(photo, sheet, gap, margin) {
  if (!(photo.w > 0 && photo.h > 0)) throw new Error('Photo size must be positive.');
  const fit = (W, H) => { const cols = Math.floor((W - 2 * margin + gap) / (photo.w + gap)), rows = Math.floor((H - 2 * margin + gap) / (photo.h + gap)); return { W, H, cols: Math.max(0, cols), rows: Math.max(0, rows) }; };
  const a = fit(sheet.w, sheet.h), b = fit(sheet.h, sheet.w), best = b.cols * b.rows > a.cols * a.rows ? b : a;
  if (!best.cols || !best.rows) throw new Error('This photo size does not fit on the chosen sheet.');
  const usedW = best.cols * photo.w + (best.cols - 1) * gap, usedH = best.rows * photo.h + (best.rows - 1) * gap;
  const x0 = (best.W - usedW) / 2, y0 = (best.H - usedH) / 2, cells = [];
  for (let r = 0; r < best.rows; r++) for (let c = 0; c < best.cols; c++) cells.push({ x: x0 + c * (photo.w + gap), y: y0 + r * (photo.h + gap) });
  return { width: best.W, height: best.H, cols: best.cols, rows: best.rows, count: cells.length, cells, gap };
}

// Set the print resolution in a JPEG's JFIF header (or insert one) so it prints at the right physical size.
export function setJpegDpi(bytes, dpi) {
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) throw new Error('Not a JPEG.');
  const d = Math.round(dpi);
  if (bytes[2] === 0xFF && bytes[3] === 0xE0 && String.fromCharCode(...bytes.subarray(6, 11)) === 'JFIF\0') {
    const out = bytes.slice(); out[13] = 1; out[14] = d >> 8; out[15] = d & 0xFF; out[16] = d >> 8; out[17] = d & 0xFF; return out;
  }
  const app0 = new Uint8Array([0xFF, 0xE0, 0, 16, 0x4A, 0x46, 0x49, 0x46, 0, 1, 1, 1, d >> 8, d & 0xFF, d >> 8, d & 0xFF, 0, 0]);
  const out = new Uint8Array(bytes.length + app0.length); out.set(bytes.subarray(0, 2)); out.set(app0, 2); out.set(bytes.subarray(2), 2 + app0.length); return out;
}

// Keep the photo covering the whole frame: clamp offsets for a given zoom.
// img: natural size; frame: output size in px; zoom ≥ 1 multiplies the minimum "cover" scale.
export function clampPlacement(img, frame, zoom, ox, oy) {
  const scale = Math.max(frame.w / img.w, frame.h / img.h) * zoom, w = img.w * scale, h = img.h * scale;
  return { scale, x: Math.min(0, Math.max(frame.w - w, ox)), y: Math.min(0, Math.max(frame.h - h, oy)), w, h };
}
