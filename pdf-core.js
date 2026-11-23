// Pure PDF operations shared by the browser UI and regression checks.
export function parseRanges(value, count, eachPage = false) {
  if (eachPage) return Array.from({ length: count }, (_, i) => [i]);
  if (!value.trim()) throw new Error('Enter page ranges, or choose one PDF per page.');
  const groups = value.split(';');
  if (groups.length > 250) throw new Error('Please create at most 250 output files at a time.');
  return groups.map(group => {
    const result = [];
    for (const token of group.split(',')) {
      const match = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) throw new Error('Use page numbers and ranges, for example 1-3; 4,6.');
      const start = Number(match[1]), end = Number(match[2] || match[1]);
      if (start < 1 || end > count || start > end) throw new Error(`Use ascending page numbers between 1 and ${count}.`);
      if (result.length + end - start + 1 > 2000) throw new Error('A single output is limited to 2,000 selected pages.');
      for (let n = start; n <= end; n++) result.push(n - 1);
    }
    return result;
  });
}
export async function combineDocuments(lib, docs) {
  const out = await lib.PDFDocument.create();
  for (const doc of docs) for (const page of await out.copyPages(doc, doc.getPageIndices())) out.addPage(page);
  return out;
}
export async function selectPages(lib, doc, selections) {
  if (!selections.length) throw new Error('Keep at least one page.');
  const out = await lib.PDFDocument.create();
  const pages = await out.copyPages(doc, selections.map(s => s.index));
  pages.forEach((page, i) => {
    page.setRotation(lib.degrees((page.getRotation().angle + (selections[i].rotation || 0)) % 360));
    out.addPage(page);
  });
  return out;
}
export async function applyAnnotations(lib, doc, items, viewports) {
  const font = await doc.embedFont(lib.StandardFonts.Helvetica);
  for (const item of items) {
    const page = doc.getPage(item.page), vp = viewports.get(item.page);
    if (!vp) throw new Error('Page preview is missing. Reopen this page before exporting.');
    const rotation = lib.degrees(vp.rotation);
    if (item.type === 'text') {
      const [x, y] = vp.convertToPdfPoint(item.x * vp.width, item.y * vp.height);
      const color = item.color.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16) / 255);
      page.drawText(item.text, { x, y, size: item.size, font, color: lib.rgb(...color), rotate: rotation });
    } else {
      const width = item.width * vp.width, height = width * item.aspect;
      const [x, y] = vp.convertToPdfPoint(item.x * vp.width, item.y * vp.height + height);
      const image = await doc.embedPng(item.data);
      page.drawImage(image, { x, y, width: width / vp.scale, height: height / vp.scale, rotate: rotation });
    }
  }
  return doc;
}
