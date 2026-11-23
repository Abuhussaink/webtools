import {readMetadata,stripMetadata,formatCoordinates} from './photo-privacy-core.js';
const $=id=>document.getElementById(id),controls=$('tool-controls'),results=$('tool-results');
let urls=[],cleanup=()=>{};
const MAX_FILE=50*1024*1024,MAX_FILES=20,MAX_PIXELS=40_000_000;
const sizeText=b=>b<1024*1024?`${Math.max(1,Math.round(b/1024))} KB`:`${(b/1024/1024).toFixed(2)} MB`;
const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
function say(s,error=false){$('tool-status').textContent=s;$('tool-status').toggleAttribute('data-error',error);}
function clearResults(){for(const u of urls)URL.revokeObjectURL(u);urls=[];results.replaceChildren();}
function download(blob,name,label){const url=URL.createObjectURL(blob);urls.push(url);const a=make('a','',label||`Download ${name} (${sizeText(blob.size)})`);a.href=url;a.download=name;return a;}
const baseName=n=>n.replace(/\.[^.]+$/,'');
const ORIENT={1:'Normal',2:'Mirrored',3:'Upside down',4:'Mirrored, upside down',5:'Mirrored, rotated',6:'Rotated 90°',7:'Mirrored, rotated',8:'Rotated 270°'};

controls.innerHTML='<div class="suite-tabs" role="group" aria-label="Choose a tool"><button type="button" data-mode="metadata" aria-pressed="true">Remove hidden data</button><button type="button" data-mode="redact" aria-pressed="false">Blur or hide areas</button></div><div id="active-tool"></div>';
for(const b of controls.querySelectorAll('[data-mode]'))b.onclick=()=>activate(b.dataset.mode);
function activate(mode){cleanup();cleanup=()=>{};clearResults();say('');for(const b of controls.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));(mode==='metadata'?metadataTool:redactTool)($('active-tool'));}

// ---------- Remove hidden data ----------
function metadataTool(panel){
 panel.innerHTML=`<label for="meta-files">Choose JPG, PNG or WebP photos (up to ${MAX_FILES})<input id="meta-files" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
 <p class="suite-help">See what your photos reveal, such as GPS location, phone model, serial number and the date taken, then save clean copies. The picture itself is not re-compressed, so quality stays exactly the same. The orientation tag is kept so photos stay the right way up.</p>
 <div class="suite-actions"><button type="button" class="suite-primary" id="meta-run" disabled>Remove hidden data</button><button type="button" id="meta-clear">Clear</button></div>
 <div id="meta-report"></div>`;
 let items=[];
 $('meta-clear').onclick=()=>{items=[];$('meta-files').value='';$('meta-report').replaceChildren();$('meta-run').disabled=true;clearResults();say('Photos and results cleared.');};
 $('meta-files').onchange=async()=>{
  const files=[...$('meta-files').files];items=[];$('meta-report').replaceChildren();clearResults();$('meta-run').disabled=true;
  if(!files.length)return;
  if(files.length>MAX_FILES){say(`Choose up to ${MAX_FILES} photos at a time.`,true);return;}
  let withGps=0,withData=0;
  for(const file of files){
   const card=make('div','suite-file-card');card.append(make('strong','',`${file.name} — ${sizeText(file.size)}`));
   try{
    if(file.size>MAX_FILE)throw new Error('Larger than 50 MB.');
    const bytes=new Uint8Array(await file.arrayBuffer()),r=readMetadata(bytes);items.push({file,bytes});
    const found=Object.keys(r.tags).length+(r.gps?1:0);if(r.gps)withGps++;if(found||r.blocks.length)withData++;
    if(r.gps){card.append(make('p','suite-warning',`⚠ Location found: ${formatCoordinates(r.gps)}. Anyone with this photo can see where it was taken.`));}
    if(found){const dl=make('dl','suite-meta-list');for(const [k,v] of Object.entries(r.tags)){dl.append(make('dt','',k),make('dd','',Array.isArray(v)?v.join(', '):String(v)));}if(r.orientation!==1)dl.append(make('dt','','Orientation (kept)'),make('dd','',ORIENT[r.orientation]||String(r.orientation)));card.append(dl);}
    if(r.blocks.length)card.append(make('p','suite-help','Hidden sections: '+[...new Set(r.blocks.map(b=>b.label))].join(', ')+'.'));
    if(!found&&!r.blocks.length)card.append(make('p','suite-help','✓ No hidden data found in this photo.'));
   }catch(e){card.append(make('p','suite-warning',e.message));}
   $('meta-report').append(card);
  }
  $('meta-run').disabled=!items.length;
  say(items.length?`Checked ${items.length} photo(s) on this device: ${withGps} with location, ${withData} with hidden data. Nothing was uploaded.`:'No supported photos were chosen.',!items.length);
 };
 $('meta-run').onclick=()=>{
  clearResults();let removed=0;results.className='suite-downloads';
  for(const {file,bytes} of items){try{const s=stripMetadata(bytes);removed+=bytes.length-s.bytes.length;const ext={jpeg:'jpg',png:'png',webp:'webp'}[s.format];results.append(download(new Blob([s.bytes],{type:file.type||`image/${s.format}`}),`${baseName(file.name)}-clean.${ext}`));}catch(e){results.append(make('p','suite-warning',`${file.name}: ${e.message}`));}}
  say(`Ready. Removed ${sizeText(removed)} of hidden data. Download your clean copies below; your photos never left this device.`);
 };
}

// ---------- Blur or hide areas ----------
const EFFECTS={pixelate:'Pixelate',blur:'Blur',black:'Black box',white:'White box'};
const STRENGTH={medium:0.018,strong:0.03,max:0.05};
// Apply one effect to rect (image pixels) on ctx, reading from the canvas itself. Works without ctx.filter (Safari).
export function applyEffect(ctx,rect,effect,strength){
 const x=Math.max(0,Math.floor(rect.x)),y=Math.max(0,Math.floor(rect.y)),w=Math.min(ctx.canvas.width-x,Math.ceil(rect.w)),h=Math.min(ctx.canvas.height-y,Math.ceil(rect.h));
 if(w<1||h<1)return;
 if(effect==='black'||effect==='white'){ctx.fillStyle=effect==='black'?'#000':'#fff';ctx.fillRect(x,y,w,h);return;}
 const block=Math.max(6,Math.round(Math.max(ctx.canvas.width,ctx.canvas.height)*STRENGTH[strength]*(effect==='blur'?1.4:1)));
 const sw=Math.max(1,Math.ceil(w/block)),sh=Math.max(1,Math.ceil(h/block)),small=document.createElement('canvas');small.width=sw;small.height=sh;
 const sc=small.getContext('2d');sc.imageSmoothingEnabled=true;sc.imageSmoothingQuality='high';sc.drawImage(ctx.canvas,x,y,w,h,0,0,sw,sh);
 ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
 if(effect==='pixelate'){ctx.imageSmoothingEnabled=false;ctx.drawImage(small,0,0,sw,sh,x,y,sw*block,sh*block);}
 else{ // blur: upscale the tiny copy smoothly, twice, for a soft look with no recoverable detail
  const mid=document.createElement('canvas');mid.width=Math.max(1,sw*4);mid.height=Math.max(1,sh*4);const mc=mid.getContext('2d');mc.imageSmoothingEnabled=true;mc.imageSmoothingQuality='high';mc.drawImage(small,0,0,mid.width,mid.height);
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(mid,0,0,mid.width,mid.height,x,y,w,h);mid.width=1;mid.height=1;}
 ctx.restore();small.width=1;small.height=1;
}
function redactTool(panel){
 panel.innerHTML=`<label for="redact-file">Choose a JPG, PNG or WebP image<input id="redact-file" type="file" accept="image/jpeg,image/png,image/webp"></label>
 <div class="suite-fields"><label for="effect">Effect<select id="effect">${Object.entries(EFFECTS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
 <label for="strength" id="strength-wrap">Strength<select id="strength"><option value="medium">Medium</option><option value="strong" selected>Strong</option><option value="max">Very strong</option></select></label></div>
 <p class="suite-help">Drag on the picture to cover faces, car plates, names or addresses. Each area uses the effect selected when you draw it. For passwords, ID or card numbers, use <strong>Black box</strong>: blurred text can sometimes be guessed. The saved image contains no hidden data.</p>
 <div id="redact-stage" class="redact-stage" hidden><canvas id="redact-canvas" aria-label="Image preview. Drag to add an area to hide."></canvas><div id="redact-draft" class="redact-draft" hidden></div></div>
 <p id="redact-count" class="suite-help"></p>
 <div class="suite-actions"><button type="button" id="redact-undo" disabled>Undo last area</button><button type="button" id="redact-reset" disabled>Remove all areas</button><button type="button" class="suite-primary" id="redact-save" disabled>Save image</button><button type="button" id="redact-clear">Clear</button></div>`;
 let bitmap=null,file=null,areas=[],scale=1,drag=null;
 const canvas=$('redact-canvas'),stage=$('redact-stage'),draft=$('redact-draft');
 const sync=()=>{$('strength-wrap').hidden=['black','white'].includes($('effect').value);};$('effect').onchange=sync;sync();
 function render(){if(!bitmap)return;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);for(const a of areas)applyEffect(ctx,{x:a.x*scale,y:a.y*scale,w:a.w*scale,h:a.h*scale},a.effect,a.strength,true);
  $('redact-count').textContent=areas.length?`${areas.length} area(s) hidden.`:'No areas yet. Drag on the picture to add one.';$('redact-undo').disabled=$('redact-reset').disabled=!areas.length;$('redact-save').disabled=!areas.length;}
 function layout(){if(!bitmap)return;const max=Math.min(stage.clientWidth||800,1600);scale=Math.min(1,max/bitmap.width);canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));render();}
 const onResize=()=>layout();window.addEventListener('resize',onResize);
 function point(e){const r=canvas.getBoundingClientRect();return {x:Math.min(Math.max(0,(e.clientX-r.left)*canvas.width/r.width),canvas.width),y:Math.min(Math.max(0,(e.clientY-r.top)*canvas.height/r.height),canvas.height),r};}
 canvas.onpointerdown=e=>{if(!bitmap)return;try{canvas.setPointerCapture(e.pointerId);}catch{}drag=point(e);draft.hidden=false;move(e);};
 function move(e){if(!drag)return;const p=point(e),r=p.r,k=r.width/canvas.width;const x=Math.min(drag.x,p.x),y=Math.min(drag.y,p.y),w=Math.abs(p.x-drag.x),h=Math.abs(p.y-drag.y);
  Object.assign(draft.style,{left:`${x*k+canvas.offsetLeft}px`,top:`${y*k+canvas.offsetTop}px`,width:`${w*k}px`,height:`${h*k}px`});drag.last={x,y,w,h};}
 canvas.onpointermove=move;
 canvas.onpointerup=canvas.onpointercancel=e=>{if(!drag)return;const d=drag.last;drag=null;draft.hidden=true;
  if(d&&d.w>=4&&d.h>=4){areas.push({x:d.x/scale,y:d.y/scale,w:d.w/scale,h:d.h/scale,effect:$('effect').value,strength:$('strength').value});clearResults();render();say('Area added. Add more, or save the image.');}};
 // Keyboard alternative: add a centred area with Enter when the canvas is focused.
 canvas.tabIndex=0;canvas.onkeydown=e=>{if(!bitmap||e.key!=='Enter')return;areas.push({x:bitmap.width*.35,y:bitmap.height*.35,w:bitmap.width*.3,h:bitmap.height*.3,effect:$('effect').value,strength:$('strength').value});render();};
 $('redact-undo').onclick=()=>{areas.pop();clearResults();render();};
 $('redact-reset').onclick=()=>{areas=[];clearResults();render();};
 function reset(){if(bitmap)bitmap.close();bitmap=null;file=null;areas=[];stage.hidden=true;$('redact-file').value='';$('redact-count').textContent='';for(const id of ['redact-undo','redact-reset','redact-save'])$(id).disabled=true;clearResults();}
 $('redact-clear').onclick=()=>{reset();say('Image and results cleared.');};
 $('redact-file').onchange=async()=>{const f=$('redact-file').files[0];const keep=$('redact-file').files;reset();if(!f)return;
  try{if(f.size>MAX_FILE)throw new Error('Choose an image up to 50 MB.');bitmap=await createImageBitmap(f,{imageOrientation:'from-image'});if(bitmap.width*bitmap.height>MAX_PIXELS)throw new Error('Choose an image up to 40 million pixels.');file=f;try{$('redact-file').files=keep;}catch{}stage.hidden=false;layout();say('Image loaded on this device. Drag on it to hide areas.');}
  catch(e){reset();say(e.message||'Could not open this image.',true);}};
 $('redact-save').onclick=async()=>{if(!bitmap||!areas.length)return;$('redact-save').disabled=true;say('Saving…');
  try{const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);for(const a of areas)applyEffect(ctx,a,a.effect,a.strength);
   const type=['image/png','image/webp'].includes(file.type)?file.type:'image/jpeg',ext={'image/png':'png','image/webp':'webp','image/jpeg':'jpg'}[type];
   const blob=await new Promise(r=>c.toBlob(r,type,type==='image/png'?undefined:.92));c.width=1;c.height=1;if(!blob)throw new Error('The browser could not save this image.');
   clearResults();results.className='suite-downloads';results.append(download(blob,`${baseName(file.name)}-hidden.${ext}`));say('Ready. Check the result before sharing. Your image never left this device.');}
  catch(e){say(e.message,true);}finally{$('redact-save').disabled=!areas.length;}};
 cleanup=()=>{window.removeEventListener('resize',onResize);if(bitmap)bitmap.close();};
}
activate('metadata');
window.addEventListener('pagehide',()=>{for(const u of urls)URL.revokeObjectURL(u);});
