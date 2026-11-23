// Image to text (OCR) with Tesseract.js, fully self-hosted: engine, worker and language data come from this site.
const $=id=>document.getElementById(id),controls=$('tool-controls'),results=$('tool-results');
const MAX_FILE=30*1024*1024,MAX_FILES=10;
let files=[],worker=null,workerLangs='',busy=false,cancel=false,url=null;
function say(s,error=false){$('tool-status').textContent=s;$('tool-status').toggleAttribute('data-error',error);}
controls.innerHTML=`<label for="ocr-files">Choose images or screenshots (JPG, PNG, WebP, up to ${MAX_FILES})<input id="ocr-files" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
<p class="suite-help">Or paste a screenshot with Ctrl+V (⌘+V on Mac) anywhere on this page.</p><div id="ocr-list"></div>
<div class="suite-fields"><label for="ocr-lang">Text language<select id="ocr-lang"><option value="eng">English</option><option value="ara">Arabic</option><option value="ara+eng">Arabic + English</option></select></label></div>
<label class="suite-check" for="ocr-enhance"><input id="ocr-enhance" type="checkbox" checked>Improve photos of documents (grey, higher contrast, enlarge small text)</label>
<div class="suite-actions"><button type="button" class="suite-primary" id="ocr-run" disabled>Extract text</button><button type="button" id="ocr-stop" hidden>Stop</button><button type="button" id="ocr-clear">Clear</button></div>
<progress id="ocr-progress" max="100" value="0" hidden aria-label="Text recognition progress"></progress>
<p class="suite-help">For Arabic, use clear printed text. Arabic-Indic digits (٠١٢٣…) are often misread, so always check numbers.</p><p class="suite-help">The first time, your browser downloads the text-recognition engine and language data from this website (about 7 MB for English, 6 MB for Arabic). Images never leave your device.</p>`;
results.innerHTML=`<div id="ocr-out" hidden><label for="ocr-text">Extracted text — check and correct it before use<textarea id="ocr-text" class="ocr-text" dir="auto" spellcheck="false"></textarea></label><p id="ocr-conf" class="suite-help"></p><div class="suite-actions"><button type="button" id="ocr-copy">Copy text</button><button type="button" id="ocr-download">Download .txt</button></div></div>`;
function setBusy(v){busy=v;for(const el of controls.querySelectorAll('input,select,button'))el.disabled=v;$('ocr-run').disabled=v||!files.length;$('ocr-stop').hidden=!v;$('ocr-stop').disabled=!v;$('ocr-progress').hidden=!v;}
function list(){const box=$('ocr-list');box.replaceChildren();files.forEach((f,i)=>{const row=document.createElement('div');row.className='suite-file-row';const s=document.createElement('span');s.textContent=`${i+1}. ${f.name||'Pasted image'} — ${Math.max(1,Math.round(f.size/1024))} KB`;const b=document.createElement('button');b.type='button';b.textContent='Remove';b.onclick=()=>{if(busy)return;files.splice(i,1);list();};row.append(s,b);box.append(row);});$('ocr-run').disabled=busy||!files.length;}
function add(incoming){const ok=[];for(const f of incoming){if(!/^image\/(jpeg|png|webp)$/.test(f.type)){say('Choose JPG, PNG or WebP images.',true);continue;}if(f.size>MAX_FILE){say('Each image must be up to 30 MB.',true);continue;}ok.push(f);}
 files=files.concat(ok).slice(0,MAX_FILES);list();if(ok.length)say(`${files.length} image(s) ready. Nothing has been uploaded.`);}
$('ocr-files').onchange=()=>{add([...$('ocr-files').files]);$('ocr-files').value='';};
document.addEventListener('paste',e=>{if(busy)return;const imgs=[...(e.clipboardData?.items||[])].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);if(!imgs.length)return;e.preventDefault();add(imgs.map((f,i)=>new File([f],`pasted-${Date.now()}-${i+1}.png`,{type:f.type})));});
// Optional clean-up that helps with phone photos of paper: greyscale, contrast stretch, and enlarge small images.
async function prepare(file){
 const bm=await createImageBitmap(file,{imageOrientation:'from-image'});
 try{if(bm.width*bm.height>40e6)throw new Error('An image is larger than 40 million pixels. Use a smaller image.');
  if(!$('ocr-enhance').checked)return file;
  const up=Math.max(bm.width,bm.height)<1400?2:1,c=document.createElement('canvas');c.width=bm.width*up;c.height=bm.height*up;const x=c.getContext('2d',{willReadFrequently:true});x.imageSmoothingQuality='high';x.drawImage(bm,0,0,c.width,c.height);
  const img=x.getImageData(0,0,c.width,c.height),d=img.data,hist=new Uint32Array(256);
  for(let i=0;i<d.length;i+=4){const g=(d[i]*299+d[i+1]*587+d[i+2]*114)/1000|0;d[i]=g;hist[g]++;}
  const n=d.length/4;let lo=0,hi=255,acc=0;while(lo<255&&(acc+=hist[lo])<n*.01)lo++;acc=0;while(hi>0&&(acc+=hist[hi])<n*.01)hi--;const span=Math.max(1,hi-lo);
  for(let i=0;i<d.length;i+=4){const v=Math.max(0,Math.min(255,(d[i]-lo)*255/span));d[i]=d[i+1]=d[i+2]=v;}
  x.putImageData(img,0,0);const blob=await new Promise(r=>c.toBlob(r,'image/png'));c.width=1;c.height=1;if(!blob)throw new Error('Could not prepare the image.');return blob;
 }finally{bm.close();}
}
let stage='',fileIndex=0;
// Remove invisible direction marks and stray spaces the engine adds around right-to-left lines.
const tidy=t=>t.replace(/[\u200e\u200f\u202a-\u202e]/g,'').split('\n').map(l=>l.trim()).join('\n').replace(/\n{3,}/g,'\n\n').trim();
async function getWorker(langs){
 if(worker&&workerLangs===langs)return worker;
 if(worker){await worker.terminate();worker=null;}
 if(!window.Tesseract)throw new Error('The text-recognition engine did not load. Refresh the page and try again.');
 worker=await window.Tesseract.createWorker(langs,1,{workerPath:'/vendor/ocr/worker.min.js',corePath:'/vendor/ocr/core',langPath:'/vendor/ocr/lang',workerBlobURL:false,cacheMethod:'none',gzip:true,
  logger:m=>{if(typeof m.progress!=='number')return;const share=100/Math.max(1,files.length);if(m.status==='recognizing text'){$('ocr-progress').value=fileIndex*share+m.progress*share;}else{stage=m.status;$('ocr-progress').value=m.progress*100;say(`Preparing (first use downloads data from this site): ${m.status} ${Math.round(m.progress*100)}%`);}}});
 workerLangs=langs;return worker;
}
$('ocr-run').onclick=async()=>{
 if(busy||!files.length)return;cancel=false;setBusy(true);$('ocr-progress').value=0;
 try{
  const langs=$('ocr-lang').value,w=await getWorker(langs);
  const parts=[],confs=[];
  for(fileIndex=0;fileIndex<files.length;fileIndex++){if(cancel)throw new Error('Stopped.');say(`Reading image ${fileIndex+1} of ${files.length}…`);
   const input=await prepare(files[fileIndex]);const {data}=await w.recognize(input);if(cancel)throw new Error('Stopped.');
   parts.push((files.length>1?`--- ${files[fileIndex].name||'Image '+(fileIndex+1)} ---\n`:'')+tidy(data.text));confs.push(data.confidence);}
  const text=parts.join('\n\n').trim();$('ocr-out').hidden=false;$('ocr-text').value=text;$('ocr-progress').value=100;
  const avg=confs.reduce((a,b)=>a+b,0)/confs.length;
  $('ocr-conf').textContent=text?`Recognition confidence: ${Math.round(avg)}%. ${avg<60?'Low — try a sharper, straighter, well-lit photo, or the other language setting.':'Always check names and numbers.'}`:'';
  say(text?'Done. Your images never left this device.':'No text was found. Try a clearer image or another language setting.',!text);
 }catch(e){if(cancel&&worker){await worker.terminate().catch(()=>{});worker=null;workerLangs='';}say(e.message||'Could not read the image.',true);}
 finally{setBusy(false);}
};
$('ocr-stop').onclick=()=>{cancel=true;say('Stopping…');if(worker){worker.terminate().catch(()=>{});worker=null;workerLangs='';}};
$('ocr-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('ocr-text').value);say('Copied to your clipboard.');}catch{$('ocr-text').select();say('Copy blocked by the browser. The text is selected; press Ctrl+C.',true);}};
$('ocr-download').onclick=()=>{if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(new Blob(['﻿'+$('ocr-text').value],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='extracted-text.txt';a.click();};
$('ocr-clear').onclick=async()=>{if(busy)return;files=[];list();$('ocr-text').value='';$('ocr-out').hidden=true;$('ocr-conf').textContent='';if(worker){await worker.terminate();worker=null;workerLangs='';}say('Images and text cleared.');};
window.addEventListener('pagehide',()=>{if(worker)worker.terminate();if(url)URL.revokeObjectURL(url);});
