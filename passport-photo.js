import {PRESETS,SHEETS,mmToPx,sheetLayout,setJpegDpi,clampPlacement} from './passport-core.js';
const $=id=>document.getElementById(id),controls=$('tool-controls'),results=$('tool-results');
const DPI=600,SHEET_DPI=300,MAX_FILE=50*1024*1024;
let source=null,rotated=null,file=null,zoom=1,ox=0,oy=0,urls=[],drag=null;
function say(s,error=false){$('tool-status').textContent=s;$('tool-status').toggleAttribute('data-error',error);}
const sizeText=b=>b<1024*1024?`${Math.max(1,Math.round(b/1024))} KB`:`${(b/1024/1024).toFixed(2)} MB`;
function clearResults(){for(const u of urls)URL.revokeObjectURL(u);urls=[];results.replaceChildren();}
controls.innerHTML=`<label for="pp-file">Choose a photo (JPG, PNG or WebP)<input id="pp-file" type="file" accept="image/jpeg,image/png,image/webp"></label>
<div class="suite-fields"><label for="pp-size">Photo size<select id="pp-size">${Object.entries(PRESETS).map(([k,p])=>`<option value="${k}">${p.label}</option>`).join('')}<option value="custom">Custom size (mm)</option></select></label>
 <label for="pp-w" class="pp-custom" hidden>Width (mm)<input id="pp-w" type="number" min="15" max="100" step="0.5" value="35"></label><label for="pp-h" class="pp-custom" hidden>Height (mm)<input id="pp-h" type="number" min="15" max="100" step="0.5" value="45"></label></div>
<div id="pp-editor" hidden><div class="pp-layout"><div class="crop-stage"><canvas id="pp-canvas" aria-label="Photo preview. Drag to move the photo; use the arrow keys to nudge."></canvas></div>
 <div class="pp-side"><label for="pp-zoom">Zoom<input id="pp-zoom" type="range" min="1" max="4" step="0.01" value="1"></label><label for="pp-rotate">Straighten: <output id="pp-rot-val">0°</output><input id="pp-rotate" type="range" min="-15" max="15" step="0.5" value="0"></label>
 <label class="suite-check" for="pp-guides"><input id="pp-guides" type="checkbox" checked>Show head-size guides</label>
 <p class="suite-help" id="pp-guide-help"></p></div></div>
 <div class="suite-fields"><label for="pp-sheet">Print sheet<select id="pp-sheet">${Object.entries(SHEETS).map(([k,s])=>`<option value="${k}">${s.label}</option>`).join('')}</select></label></div>
 <div class="suite-actions"><button type="button" class="suite-primary" id="pp-save">Save photo</button><button type="button" id="pp-save-sheet">Save print sheet</button><button type="button" id="pp-reset">Reset position</button><button type="button" id="pp-clear">Clear</button></div></div>
<p class="suite-help">Use a recent photo with a plain light background, even lighting, a neutral expression and both eyes open. Requirements differ by country and change over time; check the official rules before you apply.</p>`;
const canvas=$('pp-canvas');
function preset(){if($('pp-size').value!=='custom')return PRESETS[$('pp-size').value];const w=Number($('pp-w').value),h=Number($('pp-h').value);if(!(w>=15&&w<=100&&h>=15&&h<=100))throw new Error('Custom size must be 15–100 mm.');return {w,h,head:[h*.62,h*.74]};}
const frame=()=>{const p=preset();return {w:mmToPx(p.w,DPI),h:mmToPx(p.h,DPI),p};};
// Rotate the source once per angle change into an offscreen canvas that the frame then covers.
function rotate(){if(!source)return;const a=Number($('pp-rotate').value)*Math.PI/180,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));
 if(rotated&&rotated!==source){rotated.width=1;rotated.height=1;}
 if(!a){rotated=source;return;}
 // Crop to the largest upright rectangle inside the rotated image so no blank corners appear.
 const W=source.width,H=source.height,cw=Math.floor((W*c-H*s)/(c*c-s*s)),ch=Math.floor((H*c-W*s)/(c*c-s*s));
 const out=document.createElement('canvas');out.width=Math.max(1,cw);out.height=Math.max(1,ch);const x=out.getContext('2d');x.translate(out.width/2,out.height/2);x.rotate(a);x.drawImage(source,-W/2,-H/2);rotated=out;}
function place(){const f=frame(),pl=clampPlacement({w:rotated.width,h:rotated.height},f,zoom,ox,oy);ox=pl.x;oy=pl.y;return {f,pl};}
function drawPhoto(ctx,f,pl,k=1){ctx.fillStyle='#fff';ctx.fillRect(0,0,f.w*k,f.h*k);ctx.imageSmoothingQuality='high';ctx.drawImage(rotated,pl.x*k,pl.y*k,pl.w*k,pl.h*k);}
function render(){if(!rotated)return;try{
 const {f,pl}=place(),maxW=Math.min(($('pp-editor').clientWidth||600)-20,420),k=Math.min(maxW/f.w,520/f.h);canvas.width=Math.round(f.w*k);canvas.height=Math.round(f.h*k);
 const ctx=canvas.getContext('2d');drawPhoto(ctx,f,pl,k);
 if($('pp-guides').checked){const p=f.p,mm=canvas.height/p.h,head=(p.head[0]+p.head[1])/2,top=(p.h-head)*.42,cx=canvas.width/2;
  ctx.save();ctx.strokeStyle='rgba(184,50,69,.9)';ctx.lineWidth=2;ctx.setLineDash([6,5]);
  ctx.beginPath();ctx.ellipse(cx,(top+head/2)*mm,head*.37*mm,head/2*mm,0,0,Math.PI*2);ctx.stroke();
  ctx.setLineDash([]);ctx.strokeStyle='rgba(30,120,60,.9)';for(const y of [top,top+head]){ctx.beginPath();ctx.moveTo(cx-head*.55*mm,y*mm);ctx.lineTo(cx+head*.55*mm,y*mm);ctx.stroke();}ctx.restore();
  $('pp-guide-help').textContent=`Fit the face in the oval: top of the head on the upper green line and chin on the lower one (head about ${p.head[0]}–${p.head[1]} mm tall).`;}
 else $('pp-guide-help').textContent='';
}catch(e){say(e.message,true);}}
const relayout=()=>render();window.addEventListener('resize',relayout);
canvas.onpointerdown=e=>{if(!rotated)return;try{canvas.setPointerCapture(e.pointerId);}catch{}drag={x:e.clientX,y:e.clientY,ox,oy};};
canvas.onpointermove=e=>{if(!drag)return;const f=frame(),k=canvas.getBoundingClientRect().width/f.w;ox=drag.ox+(e.clientX-drag.x)/k;oy=drag.oy+(e.clientY-drag.y)/k;clearResults();render();};
canvas.onpointerup=canvas.onpointercancel=()=>{drag=null;};
canvas.tabIndex=0;canvas.onkeydown=e=>{const step=e.shiftKey?40:8,m={ArrowLeft:[step,0],ArrowRight:[-step,0],ArrowUp:[0,step],ArrowDown:[0,-step]}[e.key];if(!m||!rotated)return;e.preventDefault();ox+=m[0];oy+=m[1];clearResults();render();};
canvas.addEventListener('wheel',e=>{if(!rotated)return;e.preventDefault();setZoom(zoom*(e.deltaY<0?1.05:1/1.05));},{passive:false});
function setZoom(z){const f=frame(),old=clampPlacement({w:rotated.width,h:rotated.height},f,zoom,ox,oy);zoom=Math.min(4,Math.max(1,z));$('pp-zoom').value=zoom;
 // zoom around the frame centre
 const nu=clampPlacement({w:rotated.width,h:rotated.height},f,zoom,0,0),r=nu.scale/old.scale;ox=f.w/2-(f.w/2-old.x)*r;oy=f.h/2-(f.h/2-old.y)*r;clearResults();render();}
$('pp-zoom').oninput=()=>setZoom(Number($('pp-zoom').value));
$('pp-rotate').oninput=()=>{$('pp-rot-val').textContent=`${$('pp-rotate').value}°`;rotate();clearResults();render();};
$('pp-guides').onchange=render;
$('pp-size').onchange=()=>{for(const el of document.querySelectorAll('.pp-custom'))el.hidden=$('pp-size').value!=='custom';zoom=1;$('pp-zoom').value=1;centre();clearResults();render();};
for(const id of ['pp-w','pp-h'])$(id).oninput=()=>{clearResults();render();};
function centre(){if(!rotated)return;try{const f=frame(),pl=clampPlacement({w:rotated.width,h:rotated.height},f,zoom,0,0);ox=(f.w-pl.w)/2;oy=(f.h-pl.h)/2;}catch{}}
$('pp-reset').onclick=()=>{zoom=1;$('pp-zoom').value=1;$('pp-rotate').value=0;$('pp-rot-val').textContent='0°';rotate();centre();clearResults();render();};
function reset(){if(source)source.close?.();if(rotated&&rotated!==source){rotated.width=1;rotated.height=1;}source=rotated=file=null;$('pp-editor').hidden=true;$('pp-file').value='';clearResults();}
$('pp-clear').onclick=()=>{reset();say('Photo and results cleared.');};
$('pp-file').onchange=async()=>{const f=$('pp-file').files[0];clearResults();if(!f)return;
 try{if(f.size>MAX_FILE)throw new Error('Choose a photo up to 50 MB.');const bm=await createImageBitmap(f,{imageOrientation:'from-image'});if(bm.width*bm.height>40e6){bm.close();throw new Error('Choose a photo up to 40 million pixels.');}
  if(source)source.close?.();source=bm;file=f;$('pp-rotate').value=0;$('pp-rot-val').textContent='0°';zoom=1;$('pp-zoom').value=1;rotate();$('pp-editor').hidden=false;centre();render();
  if(Math.min(bm.width,bm.height)<600)say('This photo has a low resolution, so the print may look soft. A sharper photo will print better.',true);else say('Photo loaded on this device. Drag to position it, then save.');}
 catch(e){reset();say(e.message||'Could not open this photo.',true);}};
async function jpeg(c,dpi){const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.95));if(!blob)throw new Error('The browser could not create the image.');return new Blob([setJpegDpi(new Uint8Array(await blob.arrayBuffer()),dpi)],{type:'image/jpeg'});}
function offer(blob,name,note){const url=URL.createObjectURL(blob);urls.push(url);const a=document.createElement('a');a.href=url;a.download=name;a.textContent=`Download ${name} (${sizeText(blob.size)})`;const p=document.createElement('p');p.className='suite-help';p.textContent=note;results.className='suite-downloads';results.append(a,p);}
function photoCanvas(){const {f,pl}=place(),c=document.createElement('canvas');c.width=f.w;c.height=f.h;drawPhoto(c.getContext('2d'),f,pl);return {c,f};}
const tag=()=>{const p=preset();return `${p.w}x${p.h}mm`.replace(/\.0+/g,'');};
$('pp-save').onclick=async()=>{if(!rotated)return;try{clearResults();const {c,f}=photoCanvas();const blob=await jpeg(c,DPI);c.width=1;c.height=1;offer(blob,`photo-${tag()}.jpg`,`${f.w} × ${f.h} pixels at ${DPI} DPI — prints at exactly ${preset().w} × ${preset().h} mm. Photo shops: print at 100% (actual size), not "fit to page".`);say('Ready. Your photo never left this device.');}catch(e){say(e.message,true);}};
$('pp-save-sheet').onclick=async()=>{if(!rotated)return;try{clearResults();const p=preset(),sheet=SHEETS[$('pp-sheet').value],L=sheetLayout(p,sheet),{c:one}=photoCanvas();
 const s=document.createElement('canvas');s.width=mmToPx(L.width,SHEET_DPI);s.height=mmToPx(L.height,SHEET_DPI);const ctx=s.getContext('2d'),k=SHEET_DPI/25.4;ctx.fillStyle='#fff';ctx.fillRect(0,0,s.width,s.height);ctx.imageSmoothingQuality='high';
 for(const cell of L.cells)ctx.drawImage(one,Math.round(cell.x*k),Math.round(cell.y*k),Math.round(p.w*k),Math.round(p.h*k));
 ctx.strokeStyle='#bdbdbd';ctx.lineWidth=1;for(const cell of L.cells)ctx.strokeRect(Math.round(cell.x*k)+.5,Math.round(cell.y*k)+.5,Math.round(p.w*k)-1,Math.round(p.h*k)-1);
 one.width=1;one.height=1;const blob=await jpeg(s,SHEET_DPI);s.width=1;s.height=1;
 offer(blob,`photo-sheet-${$('pp-sheet').value}-${L.count}x.jpg`,`${L.count} photos on ${sheet.label}, with thin grey cutting lines. Print at 100% (actual size) on ${sheet.label}.`);say('Ready. Your photo never left this device.');}catch(e){say(e.message,true);}};
window.addEventListener('pagehide',()=>{for(const u of urls)URL.revokeObjectURL(u);});
