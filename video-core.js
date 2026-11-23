// Pure helpers for the video tool (time parsing, sizing, bitrates). Shared with regression checks.
export function parseTime(value, label = 'Time') {
  const s = String(value ?? '').trim(); if (!s) return null;
  const parts = s.split(':');
  if (parts.length > 3 || parts.some(p => !/^\d+(\.\d+)?$/.test(p.trim()))) throw new Error(`${label}: use seconds (e.g. 75) or minutes:seconds (e.g. 1:15).`);
  return parts.reduce((t, p) => t * 60 + Number(p), 0);
}
export function formatTime(sec) {
  if (!Number.isFinite(sec)) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  const ss = s.toFixed(1).padStart(4, '0').replace(/\.0$/, '');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss.padStart(2, '0')}` : `${m}:${ss.padStart(2, '0')}`;
}
// Output size that fits within maxHeight on the shorter side (so portrait phone videos are handled), with even dimensions.
export function scaledSize(width, height, maxShort) {
  if (!(width > 0 && height > 0)) throw new Error('Could not read the video size.');
  const short = Math.min(width, height), k = maxShort && short > maxShort ? maxShort / short : 1;
  const even = n => Math.max(2, Math.round(n / 2) * 2);
  return { width: even(width * k), height: even(height * k) };
}
// Video bitrate (bits/s) so that video + audio fit the target size, with 5% room for container overhead.
export function bitrateForTarget(targetBytes, seconds, audioBitrate) {
  if (!(targetBytes > 0)) throw new Error('Enter a target size.');
  if (!(seconds > 0)) throw new Error('The selected part of the video is empty.');
  const total = targetBytes * 8 * 0.95 / seconds, video = total - (audioBitrate || 0);
  if (video < 100_000) throw new Error(`That target is too small for ${formatTime(seconds)} of video. Choose a larger size, trim the video, or remove the sound.`);
  return Math.floor(video);
}
// Pick a sensible maximum resolution for a bitrate, so small targets don't look blocky at 1080p.
export function resolutionForBitrate(bps) {
  if (bps < 600_000) return 480;
  if (bps < 1_500_000) return 720;
  return 1080;
}

// ---- Trimming (same model as the audio trimmer: keep or delete the selected part, optional fades) ----
export const FADE_SECONDS = 0.5;
export function keptRanges({ mode, start, end }, duration) {
  const a = Math.max(0, Math.min(start, duration)), b = Math.max(a, Math.min(end, duration));
  return mode === 'delete' ? [[0, a], [b, duration]].filter(([x, y]) => y - x > 1e-3) : (b - a > 1e-3 ? [[a, b]] : []);
}
export const totalLength = ranges => ranges.reduce((n, [a, b]) => n + b - a, 0);
// Volume / brightness multiplier at output time t (0…1), matching the audio tool's half-second fades.
export function fadeGain(t, total, fadeIn, fadeOut) {
  const f = Math.min(FADE_SECONDS, total / 2); let g = 1;
  if (fadeIn && t < f) g = Math.min(g, Math.max(0, t / f));
  if (fadeOut && t > total - f) g = Math.min(g, Math.max(0, (total - t) / f));
  return g;
}
// Output position → source time, and source time → output position (null if the source time is removed).
export function outputToSource(pos, ranges) { let r = pos; for (const [a, b] of ranges) { if (r <= b - a) return a + r; r -= b - a; } return ranges.length ? ranges.at(-1)[1] : 0; }
export function sourceToOutput(t, ranges) { let o = 0; for (const [a, b] of ranges) { if (t >= a && t <= b) return o + t - a; o += b - a; } return null; }
