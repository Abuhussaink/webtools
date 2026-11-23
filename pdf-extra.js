import * as pdfjs from '/vendor/pdf.min.mjs';
import {number} from './utility-core.js';
import {fitImage,stampPage,combineLayout,fitPixels,chunkPages} from './pdf-extra-core.js';
pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.min.mjs';
const lib=window.PDFLib,$=id=>document.getElementById(id),mode=document.body.dataset.tool;
const images=mode==='images-to-pdf';let files=[],urls=[],busy=false;
const controls=$('tool-controls'),results=$('tool-results');
const field=(id,label,type,value,extra='')=>`<label for="${id}">${label}<input id="${id}" type="${type}" value="${value}" ${extra}></label>`;
controls.innerHTML=`<label for="files">${images?'Choose images':'Choose a PDF'}<input type="file" id="files" accept="${images?'image/jpeg,image/png,image/webp':'.pdf,application/pdf'}" ${images?'multiple':''}></label><div id="files-list"></div>`;
if(images)controls.innerHTML+='<div class="suite-fields"><label for="paper">Page size<select id="paper"><option value="a4">A4 — fit image</option><option value="letter">Letter — fit image</option><option value="image">Match image size (1 pixel = 1 PDF point)</option></select></label><label for="compression">Compression<select id="compression"><option value="none">None — original quality (largest file)</option><option value="high">High quality — JPG 85%</option><option value="balanced" selected>Balanced — JPG 70%, up to 2000 px</option><option value="small">Small — JPG 55%, up to 1400 px</option><option value="smallest">Smallest — JPG 40%, up to 1000 px</option></select></label></div><p class="suite-help">Use the arrows to arrange images. Up to 50 images and 50 MB total. Transparent images are placed on a white PDF page. Compression shrinks the images inside the PDF; page size and layout stay the same.</p>';
if(mode==='pdf-to-images')controls.innerHTML+='<div class="suite-fields"><label for="format">Image format<select id="format"><option value="png">PNG — lossless</option><option value="jpeg">JPG — smaller</option><option value="webp">WebP — smallest</option></select></label><label for="img-quality" id="quality-wrap" hidden>Compression<select id="img-quality"><option value="0.9">Light — 90% quality</option><option value="0.75" selected>Balanced — 75% quality</option><option value="0.6">Strong — 60% quality</option><option value="0.45">Maximum — 45% quality</option></select></label><label for="scale">Resolution<select id="scale"><option value="1">72 DPI</option><option value="1.5" selected>108 DPI</option><option value="2">144 DPI</option></select></label></div><div class="suite-fields"><label for="output">Output<select id="output"><option value="separate">One image per page</option><option value="vertical">Combine pages — stacked top to bottom</option><option value="horizontal">Combine pages — side by side</option><option value="grid">Combine pages — grid, 2 per row</option></select></label><label for="per-image" id="per-image-wrap" hidden>Pages in each image<select id="per-image"><option value="all" selected>All selected pages</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="6">6</option></select></label></div><label class="suite-check" id="gap-wrap" for="gap" hidden><input type="checkbox" id="gap" checked>Thin grey line between pages</label><p class="suite-warning" id="combine-warning" role="note" hidden></p>'+field('pages','Pages to convert (e.g. 1-3,5; blank = all)','text','')+'<p class="suite-help">Up to 50 pages per conversion. Download links appear for each image with its file size. Combined images larger than 16 million pixels are scaled down so every browser can save them. Pages exceeding 12 million pixels are reduced to fit this limit. For smaller files choose JPG or WebP, a stronger compression, or a lower resolution.</p>';
if(mode==='pdf-page-numbers')controls.innerHTML+='<div class="suite-fields">'+field('start','Starting number','number','1','min="0" max="999999"')+field('font-size','Font size (pt)','number','12','min="8" max="72"')+'<label for="position">Position<select id="position"><option value="bottom">Bottom centre</option><option value="top">Top centre</option></select></label>'+field('margin','Edge margin (pt)','number','24','min="4" max="200"')+'</div><p class="suite-help">Numbers are added to every page, preserving the original page orientation.</p>';
if(mode==='pdf-watermark')controls.innerHTML+='<div class="suite-fields">'+field('text','Watermark text','text','DRAFT','maxlength="100" autocomplete="off"')+field('font-size','Font size (pt)','number','48','min="8" max="200"')+field('opacity','Opacity (%)','number','20','min="1" max="100"')+field('angle','Angle (degrees)','number','45','min="-90" max="90"')+field('color','Color','color','#b83245')+'</div><p class="suite-help">Adds a centred text watermark to every page. Text is reduced to fit smaller pages. This is not secure redaction or copy protection.</p>';
controls.innerHTML+='<div class="suite-actions"><button type="button" id="run" class="suite-primary" disabled>Create download</button><button type="button" id="clear">Clear files</button></div><progress id="progress" max="100" value="0" hidden aria-label="Conversion progress"></progress>';
results.className='suite-downloads';
function say(s,error=false){$('tool-status').textContent=s;$('tool-status').toggleAttribute('data-error',error);}
function clearDownloads(){for(const u of urls)URL.revokeObjectURL(u);urls=[];results.replaceChildren();}
function setBusy(value){busy=value;for(const el of controls.querySelectorAll('input,select,button'))el.disabled=value;$('run').disabled=value||!files.length;$('progress').hidden=!value;}
function clear(){files=[];$('files').value='';$('files-list').replaceChildren();clearDownloads();$('progress').value=0;setBusy(false);say('Files and results cleared.');}
function list(){
 $('files-list').replaceChildren();
 files.forEach((f,i)=>{const row=document.createElement('div');row.className='suite-file-row';const name=document.createElement('span');name.textContent=`${i+1}. ${f.name}`;row.append(name);
 if(images){for(const [delta,label] of [[-1,'↑'],[1,'↓']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label',`Move image ${i+1} ${delta<0?'earlier':'later'}`);b.disabled=i+delta<0||i+delta>=files.length;b.onclick=()=>{if(busy||i+delta<0||i+delta>=files.length)return;[files[i],files[i+delta]]=[files[i+delta],files[i]];clearDownloads();list();};row.append(b);}}
 $('files-list').append(row);});
}
$('files').onchange=()=>{const selected=[...$('files').files];clearDownloads();files=[];
 try{if(images){if(selected.length>50||selected.reduce((n,f)=>n+f.size,0)>50*1024*1024)throw new Error('Choose up to 50 images and 50 MB in total.');if(selected.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)))throw new Error('Choose JPG, PNG or WebP images.');}else if(selected.some(f=>f.size>75*1024*1024))throw new Error('Choose a PDF up to 75 MB.');files=selected;list();say(files.length?`${files.length} file(s) ready. No files have been uploaded.`:'Choose files to begin.');}catch(e){$('files-list').replaceChildren();$('files').value='';say(e.message,true);}setBusy(false);
};
$('clear').onclick=clear;
for(const el of controls.querySelectorAll('input:not([type=file]),select'))el.addEventListener('input',clearDownloads);
const COMBINE_WARNING_LIMIT=3;let pdfPageCount=0;
// How many pages will go into the largest combined image (0 when unknown).
async function largestGroup(){
 if($('output').value==='separate')return 0;const per=$('per-image').value,requested=$('pages').value.trim();let selected=pdfPageCount;
 if(requested&&pdfPageCount){try{const {parseRanges}=await import('./pdf-core.js');selected=parseRanges(requested,pdfPageCount)[0].length;}catch{}}
 return per==='all'?selected:Math.min(Number(per),selected||Number(per));
}
async function updateCombineWarning(){
 const w=$('combine-warning');if(!w)return;const n=await largestGroup();
 w.hidden=!(n>COMBINE_WARNING_LIMIT);
 if(!w.hidden)w.textContent=`⚠ Quality warning: you are combining ${n} pages into one image. With more than ${COMBINE_WARNING_LIMIT} pages, each page is smaller and text can become blurry or unreadable. For readable text, choose 2 or 3 pages per image, or a higher resolution.`;
}
if(mode==='pdf-to-images'){const sync=()=>{$('quality-wrap').hidden=$('format').value==='png';const sep=$('output').value==='separate';$('per-image-wrap').hidden=sep;$('gap-wrap').hidden=sep;updateCombineWarning();};$('format').addEventListener('change',sync);$('output').addEventListener('change',sync);$('per-image').addEventListener('change',updateCombineWarning);$('pages').addEventListener('input',updateCombineWarning);sync();
 // Count pages locally as soon as a PDF is chosen, so the warning can show before converting.
 $('files').addEventListener('change',async()=>{pdfPageCount=0;const f=$('files').files[0];if(f&&f.size<=75*1024*1024){try{pdfPageCount=(await lib.PDFDocument.load(new Uint8Array(await f.arrayBuffer()),{updateMetadata:false})).getPageCount();}catch{}}updateCombineWarning();});
 $('clear').addEventListener('click',()=>{pdfPageCount=0;updateCombineWarning();});}
async function encodeCanvas(canvas){const [type,ext]=IMAGE_TYPES[$('format').value];const blob=await new Promise(resolve=>canvas.toBlob(resolve,type,type==='image/png'?undefined:Number($('img-quality').value)));if(!blob||blob.type!==type)throw new Error(type==='image/webp'?'This browser cannot create WebP images. Choose JPG instead.':'The browser could not create an image.');return [blob,ext];}
// Render a group of pages onto one canvas using the chosen arrangement.
async function combinedImage(preview,group,arrangement,gapOn,onPage){
 const scale=Number($('scale').value),pages=[];for(const i of group)pages.push(await preview.getPage(i+1));
 const sizes=pages.map(p=>{const v=p.getViewport({scale});return {width:Math.ceil(v.width),height:Math.ceil(v.height)};});
 const gap=gapOn?Math.max(2,Math.round(8*scale)):0,layout=combineLayout(sizes,arrangement,gap),factor=fitPixels(layout.width,layout.height);
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(layout.width*factor));canvas.height=Math.max(1,Math.round(layout.height*factor));
 const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle=gapOn?'#d4d4d4':'#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#ffffff';
 for(let k=0;k<pages.length;k++){const cell=layout.cells[k];ctx.fillRect(Math.round(cell.x*factor),Math.round(cell.y*factor),Math.round(cell.width*factor),Math.round(cell.height*factor));
  const vp=pages[k].getViewport({scale:scale*factor}),tmp=document.createElement('canvas');tmp.width=Math.max(1,Math.ceil(vp.width));tmp.height=Math.max(1,Math.ceil(vp.height));
  await pages[k].render({canvasContext:tmp.getContext('2d'),viewport:vp,background:'white'}).promise;ctx.drawImage(tmp,Math.round(cell.pageX*factor),Math.round(cell.pageY*factor));tmp.width=1;tmp.height=1;pages[k].cleanup();onPage();}
 const last=layout.cells.at(-1),endX=Math.round((last.x+last.width)*factor);if(endX<canvas.width){ctx.fillStyle='#ffffff';ctx.fillRect(endX,Math.round(last.y*factor),canvas.width-endX,canvas.height-Math.round(last.y*factor));} // blank, not grey, where a grid row is unfilled
 return {canvas,reduced:factor<1};
}
const sizeText=b=>b<1024*1024?`${Math.max(1,Math.round(b/1024))} KB`:`${(b/1024/1024).toFixed(2)} MB`;
const COMPRESSION={high:{quality:.85,max:Infinity},balanced:{quality:.7,max:2000},small:{quality:.55,max:1400},smallest:{quality:.4,max:1000}};
const IMAGE_TYPES={png:['image/png','png'],jpeg:['image/jpeg','jpg'],webp:['image/webp','webp']};
function link(blob,name){const url=URL.createObjectURL(blob);urls.push(url);const a=document.createElement('a');a.href=url;a.download=name;a.textContent=`Download ${name} (${sizeText(blob.size)})`;results.append(a);return a;}
function bounded(id,min,max,integer=false){const n=number($(id).value,id);if(n<min||n>max||(integer&&!Number.isInteger(n)))throw new Error(`${id} must be ${integer?'a whole number ':''}from ${min} to ${max}.`);return n;}
// Returns encoded bytes plus the ORIGINAL pixel size, so page layout is the same at every compression level.
async function imageBytes(file,level='none'){
 const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
 try{if(bitmap.width*bitmap.height>20000000)throw new Error('An image is too large. Use images up to 20 million pixels.');
 const c=COMPRESSION[level],factor=c?Math.min(1,c.max/Math.max(bitmap.width,bitmap.height)):1;
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*factor));canvas.height=Math.max(1,Math.round(bitmap.height*factor));
 const ctx=canvas.getContext('2d');if(c){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingQuality='high';}ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,c?'image/jpeg':'image/png',c?c.quality:undefined));canvas.width=1;canvas.height=1;if(!blob)throw new Error('Could not decode this image.');
 return {bytes:new Uint8Array(await blob.arrayBuffer()),jpeg:Boolean(c),width:bitmap.width,height:bitmap.height};}finally{bitmap.close();}
}
$('run').onclick=async()=>{
 if(busy||!files.length)return;setBusy(true);clearDownloads();say('Processing locally…');let preview=null;
 try{
 if(images){const out=await lib.PDFDocument.create(),level=$('compression').value;for(let i=0;i<files.length;i++){const image=await imageBytes(files[i],level);const embedded=image.jpeg?await out.embedJpg(image.bytes):await out.embedPng(image.bytes);const layout=fitImage(image.width,image.height,$('paper').value);const page=out.addPage(layout.size);page.drawImage(embedded,{x:layout.x,y:layout.y,width:layout.width,height:layout.height});$('progress').value=(i+1)/files.length*100;}
 const pdf=new Blob([await out.save({useObjectStreams:true})],{type:'application/pdf'}),total=files.reduce((n,f)=>n+f.size,0);const a=link(pdf,'csbh-images.pdf');a.click();
 const note=document.createElement('p');note.className='suite-help';note.textContent=`Images ${sizeText(total)} → PDF ${sizeText(pdf.size)}.${level==='none'&&pdf.size>total?' Choose a compression level for a smaller file.':''}`;results.prepend(note);
 }else{
 const bytes=new Uint8Array(await files[0].arrayBuffer());const doc=await lib.PDFDocument.load(bytes);if(!doc.getPageCount())throw new Error('This PDF has no pages.');
 if(mode==='pdf-to-images'){
  const {parseRanges}=await import('./pdf-core.js');const requested=$('pages').value.trim();const indices=requested?parseRanges(requested,doc.getPageCount())[0]:doc.getPageIndices();
  if(requested.includes(';'))throw new Error('Use commas or ranges here, for example 1-3,5.');
  if(indices.length>50)throw new Error('Choose up to 50 pages per conversion. Enter a smaller page range.');
  preview=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useSystemFonts:true}).promise;
  const arrangement=$('output').value;
  if(arrangement!=='separate'){let done=0,reduced=false;for(const group of chunkPages(indices,$('per-image').value)){const r=await combinedImage(preview,group,arrangement,$('gap').checked,()=>{$('progress').value=++done/indices.length*100;});const [blob,ext]=await encodeCanvas(r.canvas);r.canvas.width=1;r.canvas.height=1;reduced||=r.reduced;link(blob,group.length>1?`csbh-pages-${group[0]+1}-to-${group.at(-1)+1}.${ext}`:`csbh-page-${group[0]+1}.${ext}`);}
   if(reduced){const p=document.createElement('p');p.className='suite-help';p.textContent='A combined image was scaled down to stay within browser limits. For sharper results, put fewer pages in each image.';results.prepend(p);}
   const most=Math.max(...chunkPages(indices,$('per-image').value).map(g=>g.length));if(most>COMBINE_WARNING_LIMIT){const p=document.createElement('p');p.className='suite-warning';p.textContent=`⚠ ${most} pages were combined into one image, so text may be hard to read. Zoom in to check it before sharing, or choose 2 or 3 pages per image.`;results.prepend(p);}}
  else for(let i=0;i<indices.length;i++){const page=await preview.getPage(indices[i]+1);let scale=Number($('scale').value);const base=page.getViewport({scale});if(base.width*base.height>12000000)scale*=Math.sqrt(12000000/(base.width*base.height));const vp=page.getViewport({scale});const canvas=document.createElement('canvas');canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);await page.render({canvasContext:canvas.getContext('2d'),viewport:vp,background:'white'}).promise;const [blob,ext]=await encodeCanvas(canvas);link(blob,`csbh-page-${indices[i]+1}-${i+1}.${ext}`);canvas.width=1;canvas.height=1;page.cleanup();$('progress').value=(i+1)/indices.length*100;}
 }else{
 const font=await doc.embedFont(lib.StandardFonts.Helvetica);const size=bounded('font-size',8,mode==='pdf-watermark'?200:72);
 const start=mode==='pdf-page-numbers'?bounded('start',0,999999,true):0;
 const margin=mode==='pdf-page-numbers'?bounded('margin',4,200):0;
 const opacity=mode==='pdf-watermark'?bounded('opacity',1,100)/100:1;
 const angle=mode==='pdf-watermark'?bounded('angle',-90,90):0;
 const text=mode==='pdf-watermark'?$('text').value.trim():'';if(mode==='pdf-watermark'&&!text)throw new Error('Enter watermark text.');
 const color=mode==='pdf-watermark'?lib.rgb(...$('color').value.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16)/255)):lib.rgb(.2,.2,.2);
 // PDF.js supplies coordinate transforms for crop boxes and rotated pages.
 preview=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useSystemFonts:true}).promise;
 for(let i=0;i<doc.getPageCount();i++){
 const page=doc.getPage(i), display=await preview.getPage(i+1),vp=display.getViewport({scale:1});stampPage(lib,page,font,vp,{mode:mode==='pdf-watermark'?'watermark':'numbers',size,color,number:start+i,margin,position:mode==='pdf-page-numbers'?$('position').value:'bottom',text,angle,opacity});
 $('progress').value=(i+1)/doc.getPageCount()*100;
 }
 const a=link(new Blob([await doc.save()],{type:'application/pdf'}),mode==='pdf-watermark'?'csbh-watermarked.pdf':'csbh-numbered.pdf');a.click();
 }
 }
 say('Ready. Use the download link(s) below. Your files stayed on this device.');
 }catch(e){clearDownloads();say(/encrypt|password/i.test(e.message)?'Password-protected PDFs are not supported. Choose an unprotected copy.':/WinAnsi/.test(e.message)?'Use standard Latin characters for watermark text.':e.message||'Could not process this file.',true);}
 finally{if(preview)await preview.destroy();setBusy(false);}
};
window.addEventListener('pagehide',()=>{for(const url of urls)URL.revokeObjectURL(url);});
