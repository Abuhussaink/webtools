import { serializeTranscript, validateRecordingDuration, validateMediaURL, downloadMediaURL } from './transcription-core.js';
import { MODEL_CACHE } from './transcription-assets.js';
const $=id=>document.getElementById(id);
let file=null,worker=null,context=null,busy=false,version=0,duration=0,segments=[],urls=[],ticker=null,started=0,phase='',downloadController=null;
$('tool-controls').innerHTML=`<div class="suite-fields"><label for="source-mode">Recording source<select id="source-mode"><option value="file">File from my device</option><option value="url">Direct HTTPS media URL</option></select></label></div><div id="local-source"><label for="recording">Choose an audio or video file<input id="recording" type="file" accept="audio/*,video/*,.wav,.mp3,.m4a,.mp4,.webm,.ogg,.flac"></label></div><div id="url-source" hidden><label for="media-url">Direct audio/video URL<input id="media-url" type="url" placeholder="https://example.com/recording.mp3" autocomplete="off" spellcheck="false"></label><p class="transcription-warning">URL mode contacts the file host to download the recording; that host can see your IP address and requested URL. Transcription stays on your device. Links must permit CORS downloads. YouTube pages and streaming playlists are not supported. Local-file mode makes no request to the recording’s original host.</p></div><p id="recording-info" class="transcription-file-info">No recording selected.</p><div class="suite-fields"><label for="language">Spoken language<select id="language"><option value="english">English only</option></select></label></div><label class="suite-check"><input id="remember-model" type="checkbox" checked>Remember only the speech model on this device for faster future use</label><p class="suite-help">The model loads only after you press Transcribe. Your recording and transcript are never added to the model cache. Browser storage limits may require a new model download later.</p><div class="suite-actions"><button id="start" class="suite-primary" type="button" disabled>Load model &amp; transcribe</button><button id="cancel" type="button" disabled>Cancel</button><button id="clear" type="button">Clear recording &amp; transcript</button><button id="clear-cache" type="button">Remove downloaded model</button></div><progress id="progress" class="transcription-progress" max="100" hidden aria-label="Download and transcription progress"></progress><p id="progress-detail" class="transcription-step" aria-live="polite"></p><p id="cache-warning" class="transcription-warning" hidden>The model could not be saved in your browser. Transcription can continue, but a future visit may need another download.</p>`;
$('tool-results').innerHTML='<section id="transcript-section" hidden><h2>Review your transcript</h2><p class="suite-help">Edit each segment below. Start/end times are in seconds. TXT exports text only; SRT and VTT use these timestamps. Speech recognition can make mistakes.</p><div id="segments" class="transcription-segments"></div><div class="suite-actions"><button id="prepare" type="button">Prepare TXT / SRT / VTT downloads</button></div><div id="downloads" class="transcription-downloads"></div></section>';
function status(text,error=false){$('tool-status').textContent=text;$('tool-status').toggleAttribute('data-error',error);}
function downloadsClear(){for(const url of urls)URL.revokeObjectURL(url);urls=[];$('downloads').replaceChildren();}
function transcriptClear(){downloadsClear();segments=[];duration=0;$('segments').replaceChildren();$('transcript-section').hidden=true;}
function lock(value){busy=value;for(const id of ['recording','source-mode','media-url','language','remember-model','clear-cache'])$(id).disabled=value;$('start').disabled=value||!hasSource();$('cancel').disabled=!value;}
function hasSource(){return $('source-mode').value==='url'?Boolean($('media-url').value.trim()):Boolean(file);}
function stop(){version++;downloadController?.abort();downloadController=null;worker?.terminate();worker=null;if(context){context.close().catch(()=>{});context=null;}if(ticker)clearInterval(ticker);ticker=null;$('progress').hidden=true;$('progress-detail').textContent='';lock(false);}
function clear(){stop();file=null;$('recording').value='';$('media-url').value='';$('recording-info').textContent='No recording selected.';transcriptClear();lock(false);status('Recording, transcript and downloads cleared. The model cache is separate.');}
$('source-mode').onchange=()=>{stop();transcriptClear();file=null;$('recording').value='';const isURL=$('source-mode').value==='url';$('url-source').hidden=!isURL;$('local-source').hidden=isURL;$('recording-info').textContent='No recording selected.';lock(false);status(isURL?'Paste a direct HTTPS audio/video link. The download starts only when you press Transcribe.':'Choose a recording from your device.');};
$('media-url').addEventListener('input',()=>{file=null;transcriptClear();lock(false);$('recording-info').textContent='URL not downloaded yet.';});
$('recording').onchange=()=>{stop();transcriptClear();file=$('recording').files[0]||null;
 if(file&&file.size>100*1024*1024){file=null;$('recording').value='';status('Choose a recording up to 100 MB.',true);}else status(file?'Recording selected locally. Press Transcribe when ready.':'Choose a recording to begin.');
 $('recording-info').textContent=file?`${file.name} · ${(file.size/1024/1024).toFixed(1)} MB`:'No recording selected.';lock(false);
};
$('cancel').onclick=()=>{stop();transcriptClear();status('Cancelled. No recording or transcript was uploaded. You can retry or clear the recording.');};
$('clear').onclick=clear;
$('clear-cache').onclick=async()=>{stop();try{if('caches'in globalThis)await caches.delete(MODEL_CACHE);status('Downloaded model cache removed. Your browser may still have temporary standard HTTP cache entries.');}catch{status('Could not remove the model cache. Use your browser’s site-storage settings.',true);}};
async function checkDuration(recording){
 const url=URL.createObjectURL(recording);
 const media=document.createElement(recording.type.startsWith('video/')?'video':'audio');
 media.preload='metadata';
 try{return await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{media.onloadedmetadata=null;media.onerror=null;reject(new Error('Could not read the recording duration. Try a WAV or MP3 file.'));},15000);
  media.onloadedmetadata=()=>{clearTimeout(timer);const seconds=media.duration;try{resolve(validateRecordingDuration(seconds));}catch(error){reject(error);}};
  media.onerror=()=>{clearTimeout(timer);reject(new Error('This browser cannot read this media format. Try WAV, MP3 or an audio-only version.'));};
  media.src=url;media.load();
 });}finally{media.onloadedmetadata=null;media.onerror=null;media.removeAttribute('src');media.load();URL.revokeObjectURL(url);}
}
async function decodeAudio(recording,token){
 const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
 if(!Audio||!globalThis.OfflineAudioContext)throw new Error('This browser does not support local audio decoding. Try a recent desktop Chrome, Edge, Firefox or Safari.');
 context=new Audio();
 const decoder=context;
 let decoded;
 try{decoded=await decoder.decodeAudioData(await recording.arrayBuffer());}
 catch{throw new Error('This browser could not decode that audio/video codec. Try a WAV or MP3 file, or an audio-only version of the video.');}
 finally{await decoder.close().catch(()=>{});if(context===decoder)context=null;}
 if(token!==version)return null;
 validateRecordingDuration(decoded.duration);
 let peak=0;for(let channel=0;channel<decoded.numberOfChannels;channel++){for(const sample of decoded.getChannelData(channel)){if(Math.abs(sample)>peak)peak=Math.abs(sample);if(peak>1e-6)break;}if(peak>1e-6)break;}
 if(peak<=1e-6)throw new Error('This recording is silent. Choose a recording with audible speech.');
 const length=Math.ceil(decoded.duration*16000);
 const offline=new OfflineAudioContext(1,length,16000),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
 const converted=await offline.startRendering();if(token!==version)return null;
 return {samples:converted.getChannelData(0).slice(),duration:decoded.duration};
}
function renderTranscript(){
 $('segments').replaceChildren();$('transcript-section').hidden=false;
 segments.forEach((segment,i)=>{
  const box=document.createElement('div');box.className='transcription-segment';
  const fields=document.createElement('div');fields.className='suite-fields';
  for(const key of ['start','end']){const label=document.createElement('label');label.textContent=`${key==='start'?'Start':'End'} (seconds), segment ${i+1}`;const input=document.createElement('input');input.type='number';input.min='0';input.max=String(duration);input.step='.01';input.value=segment[key].toFixed(2);input.addEventListener('input',()=>{segment[key]=input.value.trim()?Number(input.value):NaN;downloadsClear();});label.append(input);fields.append(label);}
  const label=document.createElement('label');label.textContent=`Transcript, segment ${i+1}`;const text=document.createElement('textarea');text.value=segment.text;text.autocomplete='off';text.spellcheck=false;text.setAttribute('dir','auto');text.addEventListener('input',()=>{segment.text=text.value;downloadsClear();});label.append(text);box.append(fields,label);$('segments').append(box);
 });
}
$('start').onclick=async()=>{
 if(!hasSource()||busy)return;stop();transcriptClear();lock(true);const token=version;started=performance.now();phase='decoding';$('cache-warning').hidden=true;$('progress').hidden=false;$('progress').removeAttribute('value');status('Decoding your recording locally…');
 ticker=setInterval(()=>{if(phase==='transcribing')$('progress-detail').textContent=`Transcribing on your device… ${Math.floor((performance.now()-started)/1000)} seconds elapsed. This can take longer than the recording.`;},1000);
 try{
  if($('source-mode').value==='url'){
   const url=validateMediaURL($('media-url').value);phase='downloading';status('Downloading the recording directly from its host…');downloadController=new AbortController();
   const blob=await downloadMediaURL(url.href,{signal:downloadController.signal,onProgress:(loaded,total)=>{if(token!==version)return;if(total){$('progress').value=loaded/total*100;$('progress-detail').textContent=`Downloading recording: ${(loaded/1e6).toFixed(1)} / ${(total/1e6).toFixed(1)} MB`;}else{$('progress').removeAttribute('value');$('progress-detail').textContent=`Downloading recording: ${(loaded/1e6).toFixed(1)} MB`;}}});
   if(token!==version)return;downloadController=null;file=new File([blob],'linked-recording',{type:blob.type});$('recording-info').textContent=`Downloaded from ${url.hostname} · ${(blob.size/1e6).toFixed(1)} MB · held only in this tab`;
  }
  phase='decoding';status('Decoding your recording locally…');$('progress').removeAttribute('value');
  await checkDuration(file);if(token!==version)return;
  const audio=await decodeAudio(file,token);if(!audio||token!==version)return;duration=audio.duration;
  worker=new Worker('/transcription-worker.js',{type:'module'});
  worker.onerror=()=>{if(token!==version)return;stop();status('The speech worker could not start or ran out of memory. Try a shorter recording on a desktop browser.',true);};
  worker.onmessage=({data})=>{
   if(token!==version)return;
   if(data.type==='phase'){phase=data.phase;$('progress').removeAttribute('value');status(phase==='loading'?'Loading the private speech model. First use may take a few minutes…':'Transcribing locally. Your recording stays on your device.');if(phase==='transcribing'){started=performance.now();$('progress-detail').textContent='Speech recognition is running on your device.';}}
   if(data.type==='asset'){if(data.cached){$('progress-detail').textContent=`Using remembered model: ${data.name}`;}else{if(data.total){$('progress').value=data.loaded/data.total*100;$('progress-detail').textContent=`Downloading ${data.name}: ${(data.loaded/1e6).toFixed(1)} / ${(data.total/1e6).toFixed(1)} MB`;}else{$('progress').removeAttribute('value');$('progress-detail').textContent=`Downloading ${data.name}…`;}}}
   if(data.type==='cache-warning')$('cache-warning').hidden=false;
   if(data.type==='complete'){segments=data.segments;duration=data.duration;stop();if(!segments.length){status('No speech was recognised. Try a clearer English recording.',true);return;}renderTranscript();status('Transcript ready. Review the text and timings before downloading. Nothing was uploaded.');}
   if(data.type==='error'){const message=data.message;stop();status(`Transcription could not finish: ${message}`,true);}
  };
  worker.postMessage({type:'transcribe',audio:audio.samples.buffer,duration:audio.duration,language:'english',remember:$('remember-model').checked},[audio.samples.buffer]);
 }catch(error){if(token!==version)return;stop();status(error.message||'Could not decode this recording.',true);}
};
$('prepare').onclick=()=>{
 downloadsClear();
 try{
  // Build every format first so invalid subtitle times do not leave partial downloads.
  const exports=['txt','srt','vtt'].map(format=>({format,text:serializeTranscript(segments,format,duration)}));
  for(const {format,text}of exports){const blob=new Blob([text],{type:format==='vtt'?'text/vtt;charset=utf-8':'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);urls.push(url);const a=document.createElement('a');a.href=url;a.download=`csbh-transcript.${format}`;a.textContent=`Download ${format.toUpperCase()}`;$('downloads').append(a);}
  status('Downloads prepared from your edited transcript.');
 }catch(error){status(error.message,true);}
};
window.addEventListener('pagehide',()=>{stop();file=null;$('recording').value='';$('media-url').value='';transcriptClear();});
