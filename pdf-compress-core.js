// Pure helpers for the PDF compressor, shared by the browser UI and regression checks.
export const DPI_STEPS = [150, 120, 96, 72, 50];
export const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4, 0.25];
export const PAGE_OVERHEAD = 700; // bytes of PDF structure per image page
export const FILE_OVERHEAD = 2000;

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 2 : 1)} MB`;
}

export function parseTarget(value, unit) {
  const n = Number(String(value).trim());
  if (String(value).trim() === '' || !Number.isFinite(n) || n <= 0) throw new Error('Enter a target size greater than zero.');
  const bytes = Math.round(n * (unit === 'KB' ? 1024 : 1024 * 1024));
  if (bytes < 20 * 1024) throw new Error('Choose a target of at least 20 KB.');
  if (bytes > 500 * 1024 * 1024) throw new Error('Choose a target of at most 500 MB.');
  return bytes;
}

// A friendly starting target: about half the original, rounded.
export function suggestTarget(originalBytes) {
  const half = originalBytes / 2;
  if (half >= 1024 * 1024) return { value: Math.max(1, Math.round(half / 1024 / 1024 * 10) / 10), unit: 'MB' };
  return { value: Math.max(20, Math.round(half / 1024 / 10) * 10), unit: 'KB' };
}

// Evenly spaced page indices used to estimate the output size.
export function samplePages(count, max = 12) {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (max - 1), out = new Set();
  for (let i = 0; i < max; i++) out.add(Math.round(i * step));
  return [...out];
}

// Higher score = sharper result. Lower JPEG quality hurts text more than lower DPI.
export function visualScore(dpi, quality) {
  return dpi * Math.pow(quality, 0.7);
}

// Only a few settings are actually encoded per sample page; the rest are interpolated
// (log size is close to linear in quality and in log DPI). The retry loop corrects any error.
export const MEASURE_DPIS = [150, 72];
export const MEASURE_QUALITIES = [0.85, 0.55, 0.25];
function lerpLog(x, x0, x1, y0, y1) {
  const a = Math.log(Math.max(y0, 1)), b = Math.log(Math.max(y1, 1));
  return Math.exp(a + (b - a) * (x - x0) / (x1 - x0));
}
function interpQuality(row, q) {
  const Q = MEASURE_QUALITIES; // descending
  const i = q >= Q[1] ? 0 : 1;
  return lerpLog(q, Q[i], Q[i + 1], row[i], row[i + 1]);
}
// sparse[m][k] = bytes for MEASURE_DPIS[m], MEASURE_QUALITIES[k] → full DPI_STEPS × QUALITY_STEPS table.
export function expandMeasurements(sparse) {
  const [hi, lo] = MEASURE_DPIS;
  return DPI_STEPS.map(dpi => QUALITY_STEPS.map(q => {
    const a = interpQuality(sparse[0], q), b = interpQuality(sparse[1], q);
    return Math.round(lerpLog(Math.log(dpi), Math.log(hi), Math.log(lo), a, b));
  }));
}

// measured[d][q] = summed JPEG bytes over the sampled pages for DPI_STEPS[d], QUALITY_STEPS[q].
export function estimateSizes(measured, sampleCount, pageCount) {
  const factor = pageCount / sampleCount;
  return measured.map(row => row.map(bytes => Math.round(bytes * factor + pageCount * PAGE_OVERHEAD + FILE_OVERHEAD)));
}

// Pick the sharpest setting whose estimate fits the target (with a safety margin).
// `exclude` holds "dpi:quality" keys already tried and found too large.
export function choosePlan(estimates, targetBytes, exclude = new Set(), margin = 0.95) {
  const options = [];
  DPI_STEPS.forEach((dpi, d) => QUALITY_STEPS.forEach((quality, q) => {
    const key = `${dpi}:${quality}`;
    if (!exclude.has(key)) options.push({ dpi, quality, key, estimate: estimates[d][q], score: visualScore(dpi, quality) });
  }));
  if (!options.length) return null;
  const fitting = options.filter(o => o.estimate <= targetBytes * margin).sort((a, b) => b.score - a.score);
  if (fitting.length) return { ...fitting[0], fits: true };
  const smallest = options.sort((a, b) => a.estimate - b.estimate)[0];
  return { ...smallest, fits: false };
}

export function savingsText(original, result) {
  if (result >= original) return `${formatBytes(original)} → ${formatBytes(result)} (no saving)`;
  return `${formatBytes(original)} → ${formatBytes(result)} (${Math.round((1 - result / original) * 100)}% smaller)`;
}
