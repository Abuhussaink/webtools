import * as pdfjs from '/vendor/pdf.min.mjs';
import { parseRanges, combineDocuments, selectPages, applyAnnotations } from './pdf-core.js';
pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
const lib = window.PDFLib;
const $ = id => document.getElementById(id);
const mode = document.body.dataset.pdfTool;
const state = { files: [], pages: [], annotations: [], viewports: new Map(), urls: [], busy: false, generation: 0, render: null, signatureDrawn: false };
const say = (text, error = false) => { $('status').textContent = text; $('status').toggleAttribute('data-error', error); };
function setBusy(busy) {
  state.busy = busy;
  $('pdf-files').disabled = busy;
  $('reset').disabled = busy;
  $('export').disabled = busy || !state.files.length;
  $('page-select').disabled = busy;
  for (const b of document.querySelectorAll('#file-list button, #organizer button, #undo, #clear-signature')) b.disabled = busy;
}
function discardDownloads() {
  for (const url of state.urls) URL.revokeObjectURL(url);
  state.urls = [];
  $('downloads').replaceChildren();
}
function reset() {
  state.generation++;
  state.render?.cancel(); state.render = null;
  for (const file of state.files) file.preview?.destroy();
  state.files = []; state.pages = []; state.annotations = []; state.viewports.clear();
  discardDownloads();
  $('pdf-files').value = '';
  for (const id of ['file-list', 'organizer', 'overlays']) $(id).replaceChildren();
  $('ranges').value = ''; $('each-page').checked = false;
  $('annotation-text').value = ''; $('page-select').replaceChildren();
  $('page-canvas').width = 1; $('page-canvas').height = 1;
  $('split-options').hidden = true; $('editor').hidden = true;
  clearSignature();
  setBusy(false); say('Choose PDF files to begin.');
}
function button(label, action, accessibleLabel = label) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'pdf-secondary'; b.textContent = label; b.setAttribute('aria-label', accessibleLabel);
  b.addEventListener('click', () => { if (!state.busy) action(); }); return b;
}
function renderFiles() {
  $('file-list').replaceChildren();
  state.files.forEach((f, i) => {
    const row = document.createElement('div'); row.className = 'pdf-file-item';
    const label = document.createElement('span'); label.textContent = `${i + 1}. ${f.name} · ${f.doc.getPageCount()} pages`; row.append(label);
    if (mode === 'merge') {
      const up = button('↑', () => moveFile(i, -1), `Move ${f.name} earlier`); up.disabled = i === 0;
      const down = button('↓', () => moveFile(i, 1), `Move ${f.name} later`); down.disabled = i === state.files.length - 1;
      row.append(up, down, button('Remove', () => { const [removed] = state.files.splice(i, 1); removed.preview?.destroy(); discardDownloads(); renderFiles(); $('export').disabled = !state.files.length; }));
    }
    $('file-list').append(row);
  });
}
function moveFile(i, delta) {
  const j = i + delta; if (j < 0 || j >= state.files.length) return;
  [state.files[i], state.files[j]] = [state.files[j], state.files[i]]; discardDownloads(); renderFiles();
}
$('pdf-files').addEventListener('change', async event => {
  const selected = [...event.target.files]; if (!selected.length) return;
  reset(); setBusy(true); say('Reading PDF files locally…');
  try {
    if (selected.some(f => f.size > 75 * 1024 * 1024) || selected.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024) throw new Error('Choose files up to 75 MB each and 100 MB in total.');
    for (const file of selected) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-')) throw new Error(`${file.name} is not a PDF file.`);
      const doc = await lib.PDFDocument.load(bytes);
      if (!doc.getPageCount()) throw new Error('This PDF has no pages.');
      // Preserve original bytes. PDF.js transfers its own copy to the local worker.
      state.files.push({ name: file.name, bytes, doc, preview: null });
    }
    renderFiles();
    const first = state.files[0];
    if (mode === 'split') {
      $('split-options').hidden = false; $('ranges').value = `1-${first.doc.getPageCount()}`;
    }
    if (mode === 'organize' || mode === 'edit' || mode === 'sign') {
      first.preview = await pdfjs.getDocument({ data: first.bytes.slice(), isEvalSupported: false, useSystemFonts: true }).promise;
      if (mode === 'organize') {
        if (first.doc.getPageCount() > 250) throw new Error('Organize up to 250 pages at once. Use Split PDF first for larger documents.');
        state.pages = first.doc.getPageIndices().map(index => ({ index, rotation: 0, keep: true }));
        await renderOrganizer();
      } else {
        $('editor').hidden = false; $('signature-controls').hidden = mode !== 'sign';
        for (const id of ['text-label', 'size-label', 'color-label', 'editor-limit']) $(id).hidden = mode === 'sign';
        $('placement-help').textContent = mode === 'sign' ? 'Draw your signature above, then click or tap the page to place it. Use the width slider before placing. Drag a placed signature to move it. Drag its corner handle to resize it. On a keyboard, focus the preview and press Enter to place; then Tab to the signature and use arrow keys to move it.' : 'Enter your text, then click or tap the page to place it. Drag added text to move it. Drag its corner handle to change the font size. On a keyboard, focus the preview and press Enter to place; then Tab to the text and use arrow keys to move it.';
        $('page-select').replaceChildren(...first.doc.getPageIndices().map(i => new Option(`Page ${i + 1}`, String(i))));
        await renderEditor();
      }
    }
    say(mode === 'merge' ? `${state.files.length} PDF file(s) ready. Arrange them in the order you want.` : `${first.doc.getPageCount()} pages ready. Your file has not been uploaded.`);
  } catch (error) {
    reset(); say(friendlyError(error), true);
  } finally { setBusy(false); }
});
function friendlyError(error) {
  if (/encrypt|password/i.test(error.message || '')) return 'Password-protected or encrypted PDFs are not supported. Choose an unprotected copy.';
  return error.message || 'This document could not be processed. Try a different PDF.';
}
async function renderOrganizer() {
  $('organizer').replaceChildren();
  for (let i = 0; i < state.pages.length; i++) {
    const item = state.pages[i];
    const card = document.createElement('div'); card.className = 'pdf-page-card';
    const canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', `Preview of original page ${item.index + 1}`);
    const page = await state.files[0].preview.getPage(item.index + 1);
    const base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 150 / base.width, rotation: (page.rotate + item.rotation) % 360 });
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    const label = document.createElement('label'), check = document.createElement('input'); check.type = 'checkbox'; check.checked = item.keep;
    check.addEventListener('change', () => { item.keep = check.checked; discardDownloads(); });
    label.append(check, ` Keep page ${item.index + 1}`);
    const actions = document.createElement('div'); actions.className = 'pdf-page-actions';
    const move = async delta => { const j = i + delta; if (j < 0 || j >= state.pages.length) return; [state.pages[i], state.pages[j]] = [state.pages[j], state.pages[i]]; await updateOrganizer(); };
    const up = button('←', () => move(-1), `Move page ${item.index + 1} earlier`); up.disabled = i === 0;
    const down = button('→', () => move(1), `Move page ${item.index + 1} later`); down.disabled = i === state.pages.length - 1;
    actions.append(up, down, button('Rotate 90°', async () => { item.rotation = (item.rotation + 90) % 360; await updateOrganizer(); }));
    card.append(canvas, label, actions); $('organizer').append(card);
    page.cleanup();
  }
}
async function updateOrganizer() {
  setBusy(true); discardDownloads();
  try { await renderOrganizer(); say('Page arrangement updated. Uncheck pages to remove them.'); }
  catch (e) { say(friendlyError(e), true); }
  finally { setBusy(false); }
}
async function renderEditor() {
  const index = Number($('page-select').value);
  const page = await state.files[0].preview.getPage(index + 1);
  const base = page.getViewport({ scale: 1 });
  const width = Math.max(240, Math.min(800, $('editor').clientWidth - 32));
  const vp = page.getViewport({ scale: Math.min(width / base.width, 1.5) });
  state.viewports.set(index, vp);
  const canvas = $('page-canvas'); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  $('page-preview').style.width = `${canvas.width}px`; $('page-preview').style.height = `${canvas.height}px`;
  state.render = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
  await state.render.promise; state.render = null; renderOverlays();
}
$('page-select').addEventListener('change', async () => {
  setBusy(true);
  try { await renderEditor(); } catch (e) { say(friendlyError(e), true); } finally { setBusy(false); }
});
function renderOverlays() {
  $('overlays').replaceChildren();
  const pageIndex = Number($('page-select').value), vp = state.viewports.get(pageIndex); if (!vp) return;
  for (const item of state.annotations.filter(a => a.page === pageIndex)) {
    const el = document.createElement('div'); el.className = 'pdf-overlay';
    el.style.left = `${item.x * 100}%`; el.style.top = `${item.y * 100}%`;
    if (item.type === 'text') {
      el.textContent = item.text; el.style.fontSize = `${item.size * vp.scale}px`; el.style.color = item.color; el.style.transform = 'translateY(-80%)';
    } else {
      el.style.width = `${item.width * 100}%`; el.style.height = `${item.width * vp.width * item.aspect}px`;
      const img = document.createElement('img'); img.src = item.data; img.alt = 'Your signature'; img.draggable = false; el.append(img);

    }
    enableAnnotationMovement(el, item, vp);
    $('overlays').append(el);
  }
}
// Move the existing annotation; exporting uses the same updated coordinates.
function enableAnnotationResize(el, item, vp) {
  const handle = document.createElement('button');
  handle.type = 'button'; handle.className = 'pdf-resize-handle';
  const label = item.type === 'text' ? 'text' : 'signature';
  handle.setAttribute('aria-label', `Resize ${label}. Drag corner, or use arrow keys to grow or shrink.`);
  handle.title = 'Drag to resize';
  el.append(handle);
  let resizing = null;
  function dimensions() {
    return item.type === 'text'
      ? { width: state.previewFont.widthOfTextAtSize(item.text, item.size) * vp.scale, height: item.size * vp.scale }
      : { width: item.width * vp.width, height: item.width * vp.width * item.aspect };
  }
  function resize(factor, startSize, top) {
    if (item.type === 'text') {
      const widthPerPoint = state.previewFont.widthOfTextAtSize(item.text, 1) * vp.scale;
      const maximum = Math.min(144, (1 - item.x) * vp.width / widthPerPoint, (1 - top) * vp.height / vp.scale);
      item.size = Math.max(Math.min(6, maximum), Math.min(maximum, startSize * factor));
      // Keep the top-left of the text box fixed while its baseline changes.
      item.y = top + .8 * item.size * vp.scale / vp.height;
      el.style.fontSize = `${item.size * vp.scale}px`;
      el.style.top = `${item.y * 100}%`;
    } else {
      const maximum = Math.min(1 - item.x, (1 - item.y) * vp.height / (vp.width * item.aspect));
      item.width = Math.max(Math.min(.03, maximum), Math.min(maximum, startSize * factor));
      el.style.width = `${item.width * 100}%`;
      el.style.height = `${item.width * vp.width * item.aspect}px`;
    }
    discardDownloads();
  }
  handle.addEventListener('click', e => e.stopPropagation());
  handle.addEventListener('pointerdown', e => {
    e.stopPropagation();
    if (state.busy || e.button !== 0 || resizing) return;
    e.preventDefault(); handle.focus({ preventScroll: true });
    const rect = $('page-preview').getBoundingClientRect();
    const dims = dimensions();
    resizing = { id: e.pointerId, x: e.clientX, y: e.clientY, width: dims.width, height: dims.height,
      scaleX: vp.width / rect.width, scaleY: vp.height / rect.height,
      size: item.type === 'text' ? item.size : item.width,
      top: item.type === 'text' ? item.y - .8 * item.size * vp.scale / vp.height : item.y };
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', e => {
    if (!resizing || resizing.id !== e.pointerId || state.busy) return;
    e.preventDefault(); e.stopPropagation();
    const d = resizing;
    const dx = (e.clientX - d.x) * d.scaleX, dy = (e.clientY - d.y) * d.scaleY;
    const factor = 1 + (dx * d.width + dy * d.height) / (d.width ** 2 + d.height ** 2);
    resize(factor, d.size, d.top);
  });
  function finish(e) {
    e.stopPropagation();
    if (!resizing || resizing.id !== e.pointerId) return;
    resizing = null; say(`${label === 'text' ? 'Text' : 'Signature'} size updated. Download your PDF when ready.`);
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(event, finish);
  handle.addEventListener('keydown', e => {
    e.stopPropagation();
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || state.busy) return;
    e.preventDefault();
    const direction = ['ArrowRight', 'ArrowUp'].includes(e.key) ? 1 : -1;
    const factor = 1 + direction * (e.shiftKey ? .2 : .05);
    resize(factor, item.type === 'text' ? item.size : item.width, item.type === 'text' ? item.y - .8 * item.size * vp.scale / vp.height : item.y);
    say('Size updated.');
  });
}

function enableAnnotationMovement(el, item, vp) {
  enableAnnotationResize(el, item, vp);
  el.classList.add('pdf-annotation-movable');
  const label = item.type === 'text' ? 'Text' : 'Signature';
  el.tabIndex = 0;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', `${label}. Drag to move, or use arrow keys. Hold Shift for larger steps.`);
  let drag = null;
  function moveTo(x, y) {
    const isText = item.type === 'text';
    const width = isText ? state.previewFont.widthOfTextAtSize(item.text, item.size) * vp.scale / vp.width : item.width;
    const height = isText ? item.size * vp.scale / vp.height : item.width * vp.width * item.aspect / vp.height;
    item.x = Math.max(0, Math.min(x, 1 - width));
    item.y = isText
      ? Math.max(height, Math.min(y, 1 - height * .2))
      : Math.max(0, Math.min(y, 1 - height));
    el.style.left = `${item.x * 100}%`;
    el.style.top = `${item.y * 100}%`;
    discardDownloads();
  }
  // Stop placement clicks from adding an extra annotation after a drag or tap.
  el.addEventListener('click', e => { e.stopPropagation(); });
  el.addEventListener('pointerdown', e => {
    e.stopPropagation();
    if (state.busy || e.button !== 0 || drag) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
    const rect = $('page-preview').getBoundingClientRect();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: item.x, startY: item.y, width: rect.width, height: rect.height };
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
  });
  el.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id || state.busy) return;
    e.preventDefault();
    moveTo(drag.startX + (e.clientX - drag.x) / drag.width, drag.startY + (e.clientY - drag.y) / drag.height);
  });
  function finish(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    el.classList.remove('is-dragging');
    say(`${label} position updated. Drag again to adjust, or download your PDF.`);
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(event, finish);
  el.addEventListener('keydown', e => {
    e.stopPropagation();
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!directions[e.key] || state.busy) return;
    e.preventDefault();
    const [dx, dy] = directions[e.key], step = e.shiftKey ? 10 : 2;
    moveTo(item.x + dx * step / vp.width, item.y + dy * step / vp.height);
    say(`${label} position updated.`);
  });
}
function place(x, y) {
  if (state.busy || !state.files.length) return;
  try {
    const page = Number($('page-select').value), vp = state.viewports.get(page);
    if (mode === 'edit') {
      const text = $('annotation-text').value.trim(), size = Number($('font-size').value);
      if (!text) throw new Error('Enter some text first.');
      if (!Number.isFinite(size) || size < 8 || size > 72) throw new Error('Choose a font size from 8 to 72 pt.');
      // Validate supported characters before saving, and keep new text inside the page.
      const font = state.previewFont;
      const width = font.widthOfTextAtSize(text, size) * vp.scale;
      if (width > vp.width) throw new Error('This text is too wide. Use a smaller size or shorter text.');
      x = Math.max(0, Math.min(x, 1 - width / vp.width)); y = Math.max(size * vp.scale / vp.height, Math.min(y, .99));
      state.annotations.push({ type: 'text', page, x, y, text, size, color: $('text-color').value });
    } else {
      if (!state.signatureDrawn) throw new Error('Draw your signature first.');
      const width = Number($('signature-width').value) / 100, aspect = 200 / 700;
      x = Math.max(0, Math.min(x, 1 - width)); y = Math.max(0, Math.min(y, 1 - width * vp.width * aspect / vp.height));
      state.annotations.push({ type: 'signature', page, x, y, width, aspect, data: $('signature-pad').toDataURL('image/png') });
    }
    discardDownloads(); renderOverlays(); say('Added to the page. Add more, undo, or download your PDF.');
  } catch (e) { say(/WinAnsi/.test(e.message) ? 'This text contains unsupported characters. Please use standard Latin characters.' : friendlyError(e), true); }
}
$('page-preview').addEventListener('click', e => { const r = $('page-preview').getBoundingClientRect(); place((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); });
$('page-preview').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); place(.25, .5); } });
$('undo').addEventListener('click', () => { const page = Number($('page-select').value); const index = state.annotations.findLastIndex(a => a.page === page); if (index >= 0) state.annotations.splice(index, 1); discardDownloads(); renderOverlays(); });
const pad = $('signature-pad'), ctx = pad.getContext('2d'); let drawing = false;
function clearSignature() { drawing = false; ctx.clearRect(0, 0, pad.width, pad.height); state.signatureDrawn = false; }
function padPoint(e) { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; }
pad.addEventListener('pointerdown', e => { if (state.busy) return; e.preventDefault(); drawing = true; pad.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#172033'; const [x,y] = padPoint(e); ctx.moveTo(x,y); ctx.lineTo(x + .1,y + .1); ctx.stroke(); state.signatureDrawn = true; });
pad.addEventListener('pointermove', e => { if (!drawing) return; ctx.lineTo(...padPoint(e)); ctx.stroke(); });
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(event, () => { drawing = false; });
$('clear-signature').addEventListener('click', clearSignature);
$('reset').addEventListener('click', reset);
function downloadLink(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); state.urls.push(url);
  const a = document.createElement('a'); a.href = url; a.download = name; a.textContent = `Download ${name}`; $('downloads').append(a); return a;
}
$('export').addEventListener('click', async () => {
  setBusy(true); discardDownloads(); say('Preparing your PDF locally…');
  try {
    const source = state.files[0]; let results = [];
    if (mode === 'merge') {
      if (state.files.length < 2) throw new Error('Choose at least two PDF files to merge.');
      const out = await combineDocuments(lib, state.files.map(f => f.doc)); results.push([await out.save(), 'csbh-merged.pdf']);
    } else if (mode === 'split') {
      const groups = parseRanges($('ranges').value, source.doc.getPageCount(), $('each-page').checked);
      if (groups.length > 250) throw new Error('Please create at most 250 output files at once.');
      for (let i = 0; i < groups.length; i++) {
        const out = await selectPages(lib, source.doc, groups[i].map(index => ({ index })));
        results.push([await out.save(), `csbh-split-${i + 1}.pdf`]);
      }
    } else if (mode === 'organize') {
      const out = await selectPages(lib, source.doc, state.pages.filter(p => p.keep)); results.push([await out.save(), 'csbh-organized.pdf']);
    } else {
      if (!state.annotations.length) throw new Error(mode === 'sign' ? 'Place a signature on the page first.' : 'Place some text on the page first.');
      const out = await lib.PDFDocument.load(source.bytes.slice());
      await applyAnnotations(lib, out, state.annotations, state.viewports); results.push([await out.save(), `csbh-${mode === 'sign' ? 'signed' : 'annotated'}.pdf`]);
    }
    const links = results.map(([bytes, name]) => downloadLink(bytes, name));
    if (links.length === 1) links[0].click();
    say(links.length === 1 ? 'Your PDF is ready. If the download did not start, use the download link below.' : `${links.length} PDFs ready. Use the links below to download each file.`);
  } catch (e) { say(friendlyError(e), true); }
  finally { setBusy(false); }
});
for (const id of ['ranges','each-page']) $(id).addEventListener('input', discardDownloads);
for (const a of document.querySelectorAll('.pdf-nav a')) if (a.getAttribute('href') === location.pathname.replace(/\.html$/, '')) a.setAttribute('aria-current', 'page');
// A tiny in-memory font object lets us reject unsupported input before placement.
try { const doc = await lib.PDFDocument.create(); state.previewFont = await doc.embedFont(lib.StandardFonts.Helvetica); }
catch { say('The local PDF library could not load. Refresh this page.', true); $('pdf-files').disabled = true; }
window.addEventListener('pagehide', () => { for (const url of state.urls) URL.revokeObjectURL(url); });
