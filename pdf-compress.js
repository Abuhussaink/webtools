import * as pdfjs from '/vendor/pdf.min.mjs';
import {MEASURE_DPIS,MEASURE_QUALITIES,expandMeasurements,formatBytes,parseTarget,suggestTarget,samplePages,estimateSizes,choosePlan,savingsText} from './pdf-compress-core.js';
pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.min.mjs';
const lib=window.PDFLib,$=id=>document.getElementById(id);
const MAX_BYTES=75*1024*1024,MAX_PAGES=300,MAX_PIXELS=12000000;
let file=null,urls=[],busy=false,cancelled=false;
const controls=$('tool-controls'),results=$('tool-results');
controls.innerHTML=`<label for="files">Choose a PDF<input type="file" id="files" accept=".pdf,application/pdf"></label><div id="files-list"></div>
<div class="suite-fields"><label for="method">Compression<select id="method">
<option value="target" selected>Target file size (recommended)</option>
<option value="custom">Custom quality</option>
<option value="light">Light clean-up (keeps text selectable)</option></select></label></div>
<div id="target-fields" class="suite-fields"><label for="target">Target size<input id="target" type="number" min="0.02" step="any" value="1" inputmode="decimal"></label>
<label for="unit">Unit<select id="unit"><option value="MB" selected>MB</option><option value="KB">KB</option></select></label></div>
<div id="custom-fields" class="suite-fields" hidden><label for="dpi">Resolution<select id="dpi"><option value="150">150 DPI — sharp</option><option value="120">120 DPI</option><option value="96" selected>96 DPI — balanced</option><option value="72">72 DPI — small</option><option value="50">50 DPI — smallest</option></select></label>
<label for="quality">Image quality: <output id="quality-value" for="quality">70%</output><input id="quality" type="range" min="10" max="95" step="5" value="70"></label></div>
<label class="suite-check" id="gray-wrap" for="gray"><input type="checkbox" id="gray">Convert to black and white (smaller)</label>
<p class="suite-help" id="method-help"></p>
<div class="suite-actions"><button type="button" id="run" class="suite-primary" disabled>Compress PDF</button><button type="button" id="stop" hidden>Stop</button><button type="button" id="clear">Clear file</button></div>
<progress id="progress" max="100" value="0" hidden aria-label="Compression progress"></progress>`;
results.className='suite-downloads';
const HELP={
 target:'Pages are converted to compressed images, choosing the sharpest settings that fit your target. Text will no longer be selectable or searchable, and links and form fields are removed.',
 custom:'Pages are converted to images at the resolution and quality you choose. Text will no longer be selectable or searchable, and links and form fields are removed.',
 light:'Rebuilds the file structure without changing page content. Text, links and images stay as they are. Savings are usually small; use a target size for bigger reductions.'};
function say(s,error=false){$('tool-status').textContent=s;$('tool-status').toggleAttribute('data-error',error);}
function clearDownloads(){for(const u of urls)URL.revokeObjectURL(u);urls=[];results.replaceChildren();}
function syncMethod(){const m=$('method').value;$('target-fields').hidden=m!=='target';$('custom-fields').hidden=m!=='custom';$('gray-wrap').hidden=m==='light';$('method-help').textContent=HELP[m];}
function setBusy(value){busy=value;for(const el of controls.querySelectorAll('input,select,button'))el.disabled=value;$('run').disabled=value||!file;$('stop').hidden=!value;$('stop').disabled=!value;$('progress').hidden=!value;}
function clear(){file=null;$('files').value='';$('files-list').replaceChildren();clearDownloads();$('progress').value=0;setBusy(false);say('File and results cleared.');}
function showFile(){const row=document.createElement('div');row.className='suite-file-row';const name=document.createElement('span');name.textContent=`${file.name} — ${formatBytes(file.size)}`;row.append(name);$('files-list').replaceChildren(row);}
$('files').onchange=()=>{const f=$('files').files[0];clearDownloads();file=null;$('files-list').replaceChildren();
 try{if(!f){say('Choose a PDF to begin.');return;}if(f.size>MAX_BYTES)throw new Error('Choose a PDF up to 75 MB.');if(f.type&&f.type!=='application/pdf'&&!/\.pdf$/i.test(f.name))throw new Error('Choose a PDF file.');
 file=f;showFile();const s=suggestTarget(f.size);$('target').value=s.value;$('unit').value=s.unit;say('PDF ready. No files have been uploaded.');}
 catch(e){$('files').value='';say(e.message,true);}finally{setBusy(false);}};
$('clear').onclick=clear;$('stop').onclick=()=>{cancelled=true;say('Stopping…');};
$('method').addEventListener('change',syncMethod);
$('quality').addEventListener('input',()=>{$('quality-value').textContent=`${$('quality').value}%`;});
for(const el of controls.querySelectorAll('input:not([type=file]),select'))el.addEventListener('input',clearDownloads);
syncMethod();
function checkStop(){if(cancelled)throw new Error('Compression stopped.');}
function toBlob(canvas,quality){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('The browser could not create an image. Try a lower resolution.')),'image/jpeg',quality));}
// Render one page at `dpi` onto a white canvas, optionally in greyscale.
async function renderPage(page,dpi,gray){
 let scale=dpi/72;const base=page.getViewport({scale});if(base.width*base.height>MAX_PIXELS)scale*=Math.sqrt(MAX_PIXELS/(base.width*base.height));
 const vp=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(vp.width));canvas.height=Math.max(1,Math.round(vp.height));
 const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 await page.render({canvasContext:ctx,viewport:vp,background:'white'}).promise;
 if(gray){const g=document.createElement('canvas');g.width=canvas.width;g.height=canvas.height;const gc=g.getContext('2d',{alpha:false});gc.filter='grayscale(1)';gc.drawImage(canvas,0,0);canvas.width=1;canvas.height=1;return g;}
 return canvas;
}
function resize(source,factor){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(source.width*factor));c.height=Math.max(1,Math.round(source.height*factor));const ctx=c.getContext('2d',{alpha:false});ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,c.width,c.height);return c;}
// Estimate output size for every DPI × quality step from a sample of pages.
async function measure(preview,gray,onProgress){
 const idx=samplePages(preview.numPages,6),sparse=MEASURE_DPIS.map(()=>MEASURE_QUALITIES.map(()=>0));
 for(let i=0;i<idx.length;i++){checkStop();const page=await preview.getPage(idx[i]+1);const top=await renderPage(page,MEASURE_DPIS[0],gray);
  for(let d=0;d<MEASURE_DPIS.length;d++){const c=d?resize(top,MEASURE_DPIS[d]/MEASURE_DPIS[0]):top;for(let q=0;q<MEASURE_QUALITIES.length;q++)sparse[d][q]+=(await toBlob(c,MEASURE_QUALITIES[q])).size;if(d){c.width=1;c.height=1;}}
  top.width=1;top.height=1;page.cleanup();onProgress((i+1)/idx.length);}
 return estimateSizes(expandMeasurements(sparse),idx.length,preview.numPages);
}
async function build(preview,dpi,quality,gray,onProgress){
 const out=await lib.PDFDocument.create();
 for(let i=1;i<=preview.numPages;i++){checkStop();const page=await preview.getPage(i);const size=page.getViewport({scale:1});const canvas=await renderPage(page,dpi,gray);
  const jpg=await out.embedJpg(new Uint8Array(await (await toBlob(canvas,quality)).arrayBuffer()));canvas.width=1;canvas.height=1;page.cleanup();
  const p=out.addPage([size.width,size.height]);p.drawImage(jpg,{x:0,y:0,width:size.width,height:size.height});onProgress(i/preview.numPages);}
 out.setProducer('CSBH Tools');out.setCreator('CSBH PDF Compressor');
 return out.save({useObjectStreams:true});
}
async function lightClean(bytes){const doc=await lib.PDFDocument.load(bytes,{updateMetadata:false});return doc.save({useObjectStreams:true});}
function offer(bytes,name,summary){const blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob);urls.push(url);
 const p=document.createElement('p');p.className='suite-help';p.textContent=summary;const a=document.createElement('a');a.href=url;a.download=name;a.textContent=`Download ${name} (${formatBytes(blob.size)})`;results.append(p,a);}
function outName(){return file.name.replace(/\.pdf$/i,'')+'-compressed.pdf';}
$('run').onclick=async()=>{
 if(busy||!file)return;cancelled=false;setBusy(true);clearDownloads();let preview=null;const progress=$('progress');progress.value=0;
 try{
  const method=$('method').value,gray=$('gray').checked,bytes=new Uint8Array(await file.arrayBuffer());
  if(method==='light'){say('Rebuilding the PDF locally…');const out=await lightClean(bytes);progress.value=100;
   if(out.length>=file.size){say(`No saving was possible with a light clean-up (${formatBytes(out.length)}). Try a target size instead. Your file stayed on this device.`,true);return;}
   offer(out,outName(),savingsText(file.size,out.length)+' · text and links kept');say('Ready. Your file stayed on this device.');return;}
  const target=method==='target'?parseTarget($('target').value,$('unit').value):0;
  preview=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false,useSystemFonts:true}).promise;
  if(preview.numPages>MAX_PAGES)throw new Error(`Choose a PDF with up to ${MAX_PAGES} pages, or split it first.`);
  let dpi,quality,result,note='';
  if(method==='custom'){dpi=Number($('dpi').value);quality=Number($('quality').value)/100;say(`Compressing ${preview.numPages} page(s) locally…`);
   result=await build(preview,dpi,quality,gray,f=>{progress.value=f*100;});}
  else{
   if(file.size<=target)note='The original is already under your target; this version is smaller still. ';
   say('Measuring pages to find the best settings…');const estimates=await measure(preview,gray,f=>{progress.value=f*25;});
   const tried=new Set();let goal=target;
   for(let attempt=0;attempt<3;attempt++){
    const plan=choosePlan(estimates,goal,tried);if(!plan)break;tried.add(plan.key);({dpi,quality}=plan);
    say(`Compressing ${preview.numPages} page(s) at ${dpi} DPI, ${Math.round(quality*100)}% quality${attempt?` (attempt ${attempt+1})`:''}…`);
    const base=25+attempt*25;result=await build(preview,dpi,quality,gray,f=>{progress.value=Math.min(99,base+f*(attempt<2?25:50));});
    if(result.length<=target||!plan.fits)break;
    goal=goal*target/result.length; // re-aim using the real size
   }
   if(result.length>target)note+=`This is the smallest result possible here; it is above your ${formatBytes(target)} target. Try black and white, or split the PDF. `;
  }
  progress.value=100;
  if(result.length>=file.size){say(`The compressed version (${formatBytes(result.length)}) is not smaller than the original. Keep your original file, or choose a smaller target.`,true);return;}
  offer(result,outName(),`${savingsText(file.size,result.length)} · ${dpi} DPI, ${Math.round(quality*100)}% quality${gray?', black and white':''}`);
  say(note+'Ready. Check the result before sharing. Your file stayed on this device.',Boolean(note&&result.length>target));
 }catch(e){clearDownloads();say(/encrypt|password/i.test(e.message)||e.name==='PasswordException'?'Password-protected PDFs are not supported. Choose an unprotected copy.':e.message||'Could not process this file.',true);}
 finally{if(preview)await preview.destroy();setBusy(false);}
};
window.addEventListener('pagehide',()=>{for(const url of urls)URL.revokeObjectURL(url);});
