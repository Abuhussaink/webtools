// Video trimmer with the same layout and controls as the audio trimmer: drag handles, mm:ss.ss fields,
// keep/delete selection, fades, output length and a preview of the result. The track shows video thumbnails.
import {formatTime,parseTime,moveBoundary} from './audio-trimmer-core.js';
import {keptRanges,totalLength,fadeGain,outputToSource,sourceToOutput} from './video-core.js';
export function mountVideoTrimmer(row,clip,{video,overlay,thumbnails,onChange,onError}){
 const make=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text)el.textContent=text;return el;};
 const root=make('div','audio-trimmer'),layout=make('div','trim-layout'),visual=make('div','trim-visual'),padding=make('div','wave-padding'),wave=make('div','wave-track'),canvas=make('canvas','wave-canvas'),selection=make('div','wave-selection'),cursor=make('div','wave-cursor'),ruler=make('div','wave-ruler'),controls=make('div','trim-controls');
 canvas.setAttribute('aria-hidden','true');selection.setAttribute('aria-hidden','true');cursor.hidden=true;
 wave.append(canvas,selection,cursor);padding.append(wave,ruler);visual.append(padding);layout.append(visual,controls);root.append(layout);row.append(root);
 const duration=clip.duration;let thumbs=[],disposed=false,locked=false,drag=null,playing=false,frame=0,position=0,lastSource=0;
 const startInput=make('input'),endInput=make('input'),mode=make('select'),summary=make('p','trim-summary'),play=make('button','trim-play','▶ Preview result'),clock=make('span','trim-clock');play.type='button';
 for(const [value,label]of [['keep','Keep selected'],['delete','Delete selected']]){const option=make('option','',label);option.value=value;mode.append(option);}mode.value=clip.mode||'keep';clip.mode=mode.value;
 const label=(text,input)=>{const l=make('label','',text);l.append(input);controls.append(l);};label('Selection action',mode);
 for(const [text,input,key]of [['Start',startInput,'start'],['End',endInput,'end']]){input.type='text';input.inputMode='decimal';input.value=formatTime(clip[key]);input.setAttribute('aria-label',`${text} time for ${clip.name}`);label(`${text} (mm:ss.ss)`,input);
  input.onchange=()=>{try{const next=parseTime(input.value),a=key==='start'?next:clip.start,b=key==='end'?next:clip.end;if(a<0||b>duration||b-a<Math.min(.01,duration))throw Error('Start must be before end and both must be within the video.');clip.start=a;clip.end=b;changed();seek(clip[key]);input.setCustomValidity('');}catch(e){input.setCustomValidity(e.message);input.reportValidity();}};
  input.addEventListener('blur',()=>{input.onchange();input.value=formatTime(clip[key]);input.setCustomValidity('');});}
 for(const [key,text]of [['fadeIn','Fade in'],['fadeOut','Fade out']]){const l=make('label','trim-check'),input=make('input');input.type='checkbox';input.checked=Boolean(clip[key]);input.onchange=()=>{clip[key]=input.checked;changed();};l.append(input,document.createTextNode(text));controls.append(l);}
 controls.append(summary);root.append(make('p','suite-help','Drag the red handles, or focus a handle and use arrow keys. Shift + arrow moves one second. Tap the strip to see that moment. Preview plays the result of your selection and fades.'));
 const transport=make('div','trim-transport');transport.append(play,clock);visual.append(transport);
 const handles={};
 for(const edge of ['start','end']){const h=make('button',`wave-handle wave-handle-${edge}`,'Ⅱ');h.type='button';h.setAttribute('role','slider');h.setAttribute('aria-label',`${edge==='start'?'Start':'End'} trim handle for ${clip.name}`);h.setAttribute('aria-orientation','horizontal');wave.append(h);handles[edge]=h;
  h.onpointerdown=e=>{if(locked||e.button!==0)return;e.preventDefault();e.stopPropagation();h.focus();drag={edge,id:e.pointerId};try{h.setPointerCapture(e.pointerId);}catch{}};
  h.onpointermove=e=>{if(!drag||drag.edge!==edge||drag.id!==e.pointerId||locked)return;const rect=wave.getBoundingClientRect();const time=Math.round((e.clientX-rect.left)/rect.width*duration*100)/100;[clip.start,clip.end]=moveBoundary(clip.start,clip.end,duration,edge,time);changed();seek(clip[edge]);};
  const release=e=>{if(drag?.id!==e.pointerId)return;drag=null;try{if(h.hasPointerCapture(e.pointerId))h.releasePointerCapture(e.pointerId);}catch{}};h.onpointerup=release;h.onpointercancel=release;h.onlostpointercapture=()=>drag=null;
  h.onkeydown=e=>{if(locked)return;let value=clip[edge];if(e.key==='ArrowLeft'||e.key==='ArrowDown')value-=e.shiftKey?1:.1;else if(e.key==='ArrowRight'||e.key==='ArrowUp')value+=e.shiftKey?1:.1;else if(e.key==='Home')value=0;else if(e.key==='End')value=duration;else return;e.preventDefault();[clip.start,clip.end]=moveBoundary(clip.start,clip.end,duration,edge,value);changed();seek(clip[edge]);};}
 // Tap the strip to show that frame in the player.
 wave.addEventListener('pointerdown',e=>{if(locked||e.target.closest('.wave-handle'))return;const rect=wave.getBoundingClientRect();stop();seek(Math.max(0,Math.min(duration,(e.clientX-rect.left)/rect.width*duration)));cursor.style.left=`${lastSource/duration*100}%`;cursor.hidden=false;});
 function seek(t){lastSource=t;try{video.currentTime=Math.min(Math.max(0,t),Math.max(0,duration-.01));}catch{}}
 function draw(){if(disposed)return;const width=wave.clientWidth||600,height=176,dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=height*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.fillStyle='#2a2328';ctx.fillRect(0,0,width,height);
  if(thumbs.length){const w=width/thumbs.length;thumbs.forEach((t,i)=>{if(!t)return;const s=Math.max(w/t.width,height/t.height),dw=t.width*s,dh=t.height*s;ctx.save();ctx.beginPath();ctx.rect(i*w,0,w+.5,height);ctx.clip();ctx.drawImage(t,i*w+(w-dw)/2,(height-dh)/2,dw,dh);ctx.restore();});}
  // Dim what will be removed, like the grey waveform outside the selection in the audio tool.
  ctx.fillStyle='rgba(255,240,243,.72)';const x=v=>width*v/duration;
  if(clip.mode==='delete')ctx.fillRect(x(clip.start),0,x(clip.end)-x(clip.start),height);else{ctx.fillRect(0,0,x(clip.start),height);ctx.fillRect(x(clip.end),0,width-x(clip.end),height);}}
 function update(){const left=clip.start/duration*100,right=clip.end/duration*100;selection.style.left=`${left}%`;selection.style.width=`${right-left}%`;selection.classList.toggle('is-delete',clip.mode==='delete');
  for(const edge of ['start','end']){const h=handles[edge];h.style.left=`${clip[edge]/duration*100}%`;h.setAttribute('aria-valuemin',String(edge==='start'?0:clip.start+Math.min(.01,duration)));h.setAttribute('aria-valuemax',String(edge==='end'?duration:clip.end-Math.min(.01,duration)));h.setAttribute('aria-valuenow',String(clip[edge]));h.setAttribute('aria-valuetext',formatTime(clip[edge]));}
  startInput.value=formatTime(clip.start);endInput.value=formatTime(clip.end);const length=totalLength(keptRanges(clip,duration));summary.textContent=`Output: ${formatTime(length)}`;clock.textContent=`${formatTime(position)} / ${formatTime(length)}`;play.disabled=locked||!length;draw();}
 function stop(){cancelAnimationFrame(frame);frame=0;if(playing){video.pause();}playing=false;position=0;overlay.style.opacity='0';video.volume=1;play.textContent='▶ Preview result';if(!disposed)update();}
 function changed(){stop();onChange();update();}
 mode.onchange=()=>{clip.mode=mode.value;changed();};
 // Preview: play the kept ranges in order, jumping over removed parts, with fades shown as fade-to-black and volume.
 function tick(){if(!playing||disposed)return;const ranges=keptRanges(clip,duration),length=totalLength(ranges),t=video.currentTime;
  let out=sourceToOutput(t,ranges);
  if(out===null){const next=ranges.find(([a])=>a>t-0.05);if(!next){stop();return;}try{video.currentTime=next[0];}catch{}frame=requestAnimationFrame(tick);return;}
  const inRange=ranges.find(([a,b])=>t>=a&&t<=b);if(inRange&&t>=inRange[1]-0.03){const next=ranges[ranges.indexOf(inRange)+1];if(!next){stop();return;}try{video.currentTime=next[0];}catch{}}
  position=Math.min(out,length);if(position>=length-0.03||video.ended){stop();return;}
  const g=fadeGain(position,length,clip.fadeIn,clip.fadeOut);overlay.style.opacity=String(1-g);video.volume=Math.max(0,Math.min(1,g));
  cursor.style.left=`${t/duration*100}%`;cursor.hidden=false;clock.textContent=`${formatTime(position)} / ${formatTime(length)}`;frame=requestAnimationFrame(tick);}
 play.onclick=async()=>{if(locked)return;if(playing){stop();return;}const ranges=keptRanges(clip,duration);if(!ranges.length)return;try{video.currentTime=ranges[0][0];playing=true;play.textContent='■ Stop preview';await video.play();tick();}catch{stop();onError('Preview could not play in this browser. You can still create the video.');}};
 video.addEventListener('pause',()=>{if(playing&&!video.seeking){/* user paused via other means */}});
 function resize(){ruler.replaceChildren();const ticks=wave.clientWidth<480?4:6;for(let i=0;i<=ticks;i++)ruler.append(make('span','',formatTime(duration*i/ticks).slice(0,-3)));draw();}
 const observer=new ResizeObserver(resize);observer.observe(wave);update();resize();
 // Thumbnails arrive asynchronously so the trimmer is usable immediately.
 thumbnails(wave.clientWidth<480?8:14).then(list=>{if(disposed)return;thumbs=list;draw();}).catch(()=>{});
 return {stop,setBusy(value){locked=value;if(value)stop();for(const el of root.querySelectorAll('button,input,select'))el.disabled=value;update();},dispose(){disposed=true;stop();observer.disconnect();for(const t of thumbs)if(t){t.width=1;t.height=1;}}};
}
