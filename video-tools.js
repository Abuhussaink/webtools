// Video compress and trim, using the browser's own video encoder (WebCodecs) through Mediabunny, served from this site.
import * as MB from '/vendor/mediabunny/mediabunny.min.mjs';
import {formatTime as shortTime,scaledSize,bitrateForTarget,resolutionForBitrate,keptRanges,totalLength,fadeGain} from './video-core.js';
import {formatTime} from './audio-trimmer-core.js';
import {mountVideoTrimmer} from './video-trimmer.js';
const $=id=>document.getElementById(id),controls=$('tool-controls'),results=$('tool-results');
const MAX_FILE=2*1024*1024*1024;
let file=null,info=null,clip=null,trimmer=null,previewUrl=null,outUrl=null,job=null,busy=false;
function say(s,error=false){$('tool-status').textContent=s;$('tool-status').toggleAttribute('data-error',error);}
const sizeText=b=>b<1024*1024?`${Math.max(1,Math.round(b/1024))} KB`:b<1024**3?`${(b/1024/1024).toFixed(1)} MB`:`${(b/1024**3).toFixed(2)} GB`;
controls.innerHTML=`<label for="v-file">Choose a video (MP4, MOV, WebM or MKV)<input id="v-file" type="file" accept="video/*,.mkv,.mov"></label>
<div id="v-editor" hidden><div class="media-row"><h2 class="audio-clip-title" id="v-title"></h2><p class="suite-help" id="v-info"></p>
 <div class="video-stage"><video id="v-preview" class="video-preview" playsinline preload="auto"></video><div id="v-fade" class="video-fade" aria-hidden="true"></div></div><div id="v-trimmer"></div></div>
 <h2>Compress</h2><div class="suite-fields"><label for="v-mode">Size<select id="v-mode"><option value="target">Fit a file size</option><option value="high">High quality</option><option value="medium" selected>Balanced</option><option value="low">Small file</option><option value="trim">Original quality (fastest)</option></select></label>
 <label for="v-target" id="v-target-wrap">Target size<select id="v-target"><option value="8">8 MB</option><option value="16" selected>16 MB (WhatsApp)</option><option value="25">25 MB (email)</option><option value="50">50 MB</option><option value="100">100 MB</option></select></label>
 <label for="v-res" id="v-res-wrap">Resolution<select id="v-res"><option value="auto">Automatic</option><option value="0">Keep original</option><option value="1080">1080p</option><option value="720">720p</option><option value="480">480p</option></select></label></div>
 <label class="suite-check" for="v-mute"><input id="v-mute" type="checkbox">Remove sound</label><p id="v-mode-help" class="suite-help"></p>
 <div class="suite-actions"><button type="button" class="suite-primary" id="v-run">Create video</button><button type="button" id="v-stop" hidden>Stop</button><button type="button" id="v-clear">Clear</button></div>
 <progress id="v-progress" max="100" value="0" hidden aria-label="Video progress"></progress></div>
<p class="suite-help">Uses your device's built-in video encoder, so speed depends on your device. Works best in up-to-date Chrome, Edge, Safari and Firefox. The result is an MP4 that plays almost everywhere.</p>`;
results.className='suite-downloads';
function setBusy(v){busy=v;for(const el of controls.querySelectorAll('#v-file,#v-mode,#v-target,#v-res,#v-mute,#v-run,#v-clear'))el.disabled=v;trimmer?.setBusy(v);$('v-stop').hidden=!v;$('v-stop').disabled=!v;$('v-progress').hidden=!v;}
function clearOut(){if(outUrl)URL.revokeObjectURL(outUrl);outUrl=null;results.replaceChildren();}
const needsFrames=()=>clip&&(clip.mode==='delete'||clip.fadeIn||clip.fadeOut);
function syncMode(){const m=$('v-mode').value;$('v-target-wrap').hidden=m!=='target';$('v-res-wrap').hidden=m==='trim';
 $('v-mode-help').textContent=m==='trim'?(needsFrames()?'Deleting a middle part or adding fades re-encodes the video at very high quality.':'Keeps the original picture and only cuts it: very fast, but the file can be larger than expected because cuts happen at the nearest key frame.'):'';}
$('v-mode').onchange=()=>{syncMode();clearOut();};
for(const id of ['v-target','v-res','v-mute'])$(id).addEventListener('change',clearOut);
function reset(){trimmer?.dispose();trimmer=null;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;clearOut();file=info=clip=null;$('v-preview').removeAttribute('src');$('v-preview').load();$('v-trimmer').replaceChildren();$('v-editor').hidden=true;$('v-file').value='';}
$('v-clear').onclick=()=>{if(busy)return;reset();say('Video cleared.');};
$('v-file').onchange=async()=>{const f=$('v-file').files[0];const keep=$('v-file').files;reset();if(!f)return;
 if(typeof VideoEncoder==='undefined'){say('This browser cannot encode video. Please use an up-to-date Chrome, Edge, Safari or Firefox.',true);return;}
 try{if(f.size>MAX_FILE)throw new Error('Choose a video up to 2 GB.');say('Reading the video on this device…');
  const input=new MB.Input({source:new MB.BlobSource(f),formats:MB.ALL_FORMATS});
  const [duration,video,audio]=await Promise.all([input.computeDuration(),input.getPrimaryVideoTrack(),input.getPrimaryAudioTrack()]);
  if(!video)throw new Error('No video track was found in this file.');if(!(duration>0))throw new Error('This video has no length.');
  info={duration,width:video.displayWidth,height:video.displayHeight,hasAudio:!!audio};file=f;try{$('v-file').files=keep;}catch{}
  previewUrl=URL.createObjectURL(f);$('v-preview').src=previewUrl;$('v-editor').hidden=false;
  $('v-title').textContent=`1. ${f.name}`;$('v-info').textContent=`Video length: ${duration.toFixed(2)} seconds · ${info.width}×${info.height} · ${sizeText(f.size)}${audio?'':' · no sound'}`;
  clip={name:f.name,duration,start:0,end:duration,mode:'keep',fadeIn:false,fadeOut:false};
  const thumbnails=async count=>{const sink=new MB.CanvasSink(video,{height:120,fit:'cover'}),times=Array.from({length:count},(_,i)=>(i+.5)*duration/count),out=[];for await(const w of sink.canvasesAtTimestamps(times))out.push(w?.canvas||null);return out;};
  trimmer=mountVideoTrimmer($('v-trimmer'),clip,{video:$('v-preview'),overlay:$('v-fade'),thumbnails,onChange:()=>{clearOut();syncMode();},onError:m=>say(m,true)});
  syncMode();say('Video ready. Nothing has been uploaded.');
 }catch(e){reset();say(/unsupported|format/i.test(e.message)?'This video format is not supported. Try an MP4 or MOV file.':e.message,true);}};
async function pickCodecs(width,height,bitrate,withAudio){
 const v=await MB.getFirstEncodableVideoCodec(['avc','hevc','vp9','av1'],{width,height,bitrate});
 if(!v)throw new Error('This browser cannot encode video at this size. Try a lower resolution or another browser.');
 let a=null;if(withAudio){a=(await MB.canEncodeAudio('aac'))?'aac':(await MB.canEncodeAudio('opus'))?'opus':null;}
 return {v,a};
}
// Settings shared by both paths: output size, bitrate and codecs.
async function plan(ranges){
 const seconds=totalLength(ranges),mode=$('v-mode').value,mute=$('v-mute').checked,withAudio=info.hasAudio&&!mute,audioBps=mode==='low'||mode==='target'?96_000:128_000;
 let bitrate=mode==='high'?MB.QUALITY_HIGH:mode==='low'?MB.QUALITY_LOW:mode==='trim'?MB.QUALITY_VERY_HIGH:MB.QUALITY_MEDIUM,maxShort=Number($('v-res').value);
 if(mode==='target'){const bps=bitrateForTarget(Number($('v-target').value)*1024*1024,seconds,withAudio?audioBps:0);bitrate=bps;if($('v-res').value==='auto')maxShort=resolutionForBitrate(bps);}
 else if(mode==='trim')maxShort=0;
 else if($('v-res').value==='auto')maxShort=mode==='low'?720:mode==='medium'?1080:0;
 const dims=scaledSize(info.width,info.height,maxShort||0),codecs=await pickCodecs(dims.width,dims.height,typeof bitrate==='number'?bitrate:2_000_000,withAudio);
 return {seconds,mode,mute,withAudio:withAudio&&!!codecs.a,audioBps,bitrate,dims,codecs};
}
// Fast path: one continuous range, no fades. Uses Mediabunny's Conversion (can copy without re-encoding).
async function convertSimple([start,end],p,onProgress){
 const output=new MB.Output({format:new MB.Mp4OutputFormat({fastStart:'in-memory'}),target:new MB.BufferTarget()});
 const input=new MB.Input({source:new MB.BlobSource(file),formats:MB.ALL_FORMATS}),copyOnly=p.mode==='trim';
 const video=copyOnly?{}:{codec:p.codecs.v,bitrate:p.bitrate,width:p.dims.width,height:p.dims.height,fit:'fill',forceTranscode:true};
 const audio=p.mute||!info.hasAudio?{discard:true}:copyOnly?{}:p.withAudio?{codec:p.codecs.a,bitrate:p.audioBps}:{discard:true};
 const conversion=await MB.Conversion.init({input,output,trim:{start,end},video,audio,showWarnings:false});
 if(!conversion.isValid)throw new Error('This video cannot be converted in this browser: '+(conversion.discardedTracks.map(d=>d.reason).join(', ')||'unsupported format')+'.');
 job={cancel:()=>conversion.cancel()};conversion.onProgress=onProgress;await conversion.execute();return output.target.buffer;
}
// Frame path: any set of ranges, joined end to end, with fade to black and volume fades. Always re-encodes.
async function convertFrames(ranges,p,onProgress){
 let cancelled=false;job={cancel:async()=>{cancelled=true;try{await output.cancel();}catch{}}};
 const input=new MB.Input({source:new MB.BlobSource(file),formats:MB.ALL_FORMATS}),[vTrack,aTrack]=await Promise.all([input.getPrimaryVideoTrack(),input.getPrimaryAudioTrack()]);
 const output=new MB.Output({format:new MB.Mp4OutputFormat({fastStart:'in-memory'}),target:new MB.BufferTarget()});
 const vSource=new MB.VideoSampleSource({codec:p.codecs.v,bitrate:p.bitrate,sizeChangeBehavior:'deny'});output.addVideoTrack(vSource);
 const useAudio=p.withAudio&&aTrack,aSource=useAudio?new MB.AudioSampleSource({codec:p.codecs.a,bitrate:p.audioBps}):null;if(aSource)output.addAudioTrack(aSource);
 await output.start();
 const total=totalLength(ranges),{width:W,height:H}=p.dims,canvas=new OffscreenCanvas(W,H),ctx=canvas.getContext('2d',{alpha:false});
 const videoLoop=async()=>{const sink=new MB.VideoSampleSink(vTrack);let offset=0,last=-1;
  for(const [a,b] of ranges){for await(const s of sink.samples(a,b)){try{if(cancelled)return;const end=s.timestamp+s.duration;if(end<=a+1e-6||s.timestamp>=b)continue;
    let t=offset+Math.max(0,s.timestamp-a);if(t<=last)t=last+1e-4;const dur=Math.max(1e-3,Math.min(end,b)-Math.max(s.timestamp,a));
    ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);s.drawWithFit(ctx,{fit:'contain'});const g=fadeGain(t,total,clip.fadeIn,clip.fadeOut);if(g<1){ctx.fillStyle=`rgba(0,0,0,${1-g})`;ctx.fillRect(0,0,W,H);}
    const out=new MB.VideoSample(canvas,{timestamp:t,duration:dur});await vSource.add(out);out.close();last=t;onProgress(Math.min(1,(t+dur)/total));}finally{s.close();}}
   offset+=b-a;}vSource.close();};
 const audioLoop=async()=>{if(!aSource)return;const sink=new MB.AudioSampleSink(aTrack);let offset=0;
  for(const [a,b] of ranges){for await(const s0 of sink.samples(a,b)){let s=s0;try{if(cancelled)return;const end=s.timestamp+s.duration;if(end<=a||s.timestamp>=b)continue;
    const sr=s.sampleRate,from=Math.max(0,Math.round((a-s.timestamp)*sr)),to=Math.min(s.numberOfFrames,Math.round((b-s.timestamp)*sr));if(to<=from)continue;
    const n=to-from,ch=s.numberOfChannels,data=new Float32Array(n*ch);for(let c=0;c<ch;c++)s.copyTo(data.subarray(c*n,(c+1)*n),{planeIndex:c,format:'f32-planar',frameOffset:from,frameCount:n});
    const t0=offset+Math.max(0,s.timestamp+from/sr-a);if(clip.fadeIn||clip.fadeOut)for(let i=0;i<n;i++){const g=fadeGain(t0+i/sr,total,clip.fadeIn,clip.fadeOut);if(g<1)for(let c=0;c<ch;c++)data[c*n+i]*=g;}
    const out=new MB.AudioSample({data,format:'f32-planar',numberOfChannels:ch,sampleRate:sr,timestamp:t0});await aSource.add(out);out.close();}finally{s.close();}}
   offset+=b-a;}aSource.close();};
 await Promise.all([videoLoop(),audioLoop()]);if(cancelled)throw new Error('cancelled');
 await output.finalize();return output.target.buffer;
}
$('v-run').onclick=async()=>{if(busy||!file)return;clearOut();trimmer?.stop();
 try{
  const ranges=keptRanges(clip,info.duration);if(!ranges.length)throw new Error('Nothing is left to keep. Change the selection.');
  const p=await plan(ranges),frames=needsFrames()||ranges.length>1;
  setBusy(true);$('v-progress').value=0;say(`Working on this device… ${shortTime(p.seconds)} of video.`);const t0=performance.now();
  const progress=x=>{$('v-progress').value=x*100;const el=(performance.now()-t0)/1000;if(x>0.03)say(`Working on this device… ${Math.round(x*100)}% (about ${Math.max(1,Math.round(el/x-el))} s left)`);};
  const buf=frames?await convertFrames(ranges,p,progress):await convertSimple(ranges[0],p,progress);job=null;
  if(!buf)throw new Error('The video could not be created.');
  const copy=p.mode==='trim'&&!frames,blob=new Blob([buf],{type:'video/mp4'}),name=file.name.replace(/\.[^.]+$/,'')+(copy?'-trimmed':'-edited')+'.mp4';
  outUrl=URL.createObjectURL(blob);const a=document.createElement('a');a.href=outUrl;a.download=name;a.textContent=`Download ${name} (${sizeText(blob.size)})`;
  const note=document.createElement('p');note.className='suite-help';note.textContent=`${sizeText(file.size)} → ${sizeText(blob.size)}${blob.size<file.size?` (${Math.round((1-blob.size/file.size)*100)}% smaller)`:''} · ${formatTime(p.seconds)}${copy?'':` · ${p.dims.width}×${p.dims.height}`}${p.mute||!info.hasAudio?' · no sound':''}`;
  results.append(a,note);
  const over=p.mode==='target'&&blob.size>Number($('v-target').value)*1024*1024;
  say(over?'Done, but the file is slightly above the target. Try the next size down or a lower resolution.':`Done in ${Math.max(1,Math.round((performance.now()-t0)/1000))} s. Your video never left this device.`,over);
 }catch(e){job=null;if(/cancel/i.test(e.message||''))say('Stopped. Nothing was saved.');else say(e.message||'The video could not be processed.',true);}
 finally{setBusy(false);}
};
$('v-stop').onclick=async()=>{if(job){say('Stopping…');try{await job.cancel();}catch{}}};
window.addEventListener('pagehide',()=>{trimmer?.dispose();if(previewUrl)URL.revokeObjectURL(previewUrl);if(outUrl)URL.revokeObjectURL(outUrl);});
