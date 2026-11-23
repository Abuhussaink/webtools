export function normalizeSegments(result,duration) {
 if(!Number.isFinite(duration)||duration<=0)throw new Error('The recording has no usable duration.');
 const chunks=Array.isArray(result?.chunks)&&result.chunks.length?result.chunks:[{text:result?.text||'',timestamp:[0,duration]}];
 const segments=[];
 for(let i=0;i<chunks.length;i++){
  const text=String(chunks[i].text||'').trim();if(!text)continue;
  const times=chunks[i].timestamp||[];
  const start=Number.isFinite(times[0])?Math.max(0,Math.min(times[0],duration)):segments.at(-1)?.end||0;
  const next=chunks[i+1]?.timestamp?.[0];
  const end=Number.isFinite(times[1])?Math.min(duration,times[1]):Number.isFinite(next)?Math.min(duration,next):duration;
  if(end>start)segments.push({start,end,text});
 }
 return segments;
}
export function timestamp(seconds,vtt=false){
 if(!Number.isFinite(seconds)||seconds<0)throw new Error('Subtitle times must be nonnegative.');
 const ms=Math.round(seconds*1000),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;
 return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${vtt?'.':','}${String(ms%1000).padStart(3,'0')}`;
}
export function serializeTranscript(segments,format,duration){
 const cleaned=segments.filter(s=>String(s.text).trim()).map(s=>({start:Number(s.start),end:Number(s.end),text:String(s.text).trim()}));
 if(!cleaned.length)throw new Error('There is no transcript to download.');
 if(format==='txt')return cleaned.map(s=>s.text).join('\n')+'\n';
 let previous=-1;
 for(const s of cleaned){if(!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<0||s.end<=s.start||s.end>duration+.01||s.start<previous)throw new Error('Check subtitle times: use ascending starts and end times within the recording.');previous=s.start;}
 const escaped=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r\n?/g,'\n');
 const vtt=format==='vtt';
 return (vtt?'WEBVTT\n\n':'')+cleaned.map((s,i)=>`${i+1}\n${timestamp(s.start,vtt)} --> ${timestamp(s.end,vtt)}\n${escaped(s.text)}\n`).join('\n');
}
export function assertAssetRequest(input,init,origin){
 const raw=input instanceof Request?input.url:String(input);
 const url=new URL(raw,origin),method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
 const allowed = /^\/models\/whisper-tiny\/(?:config|tokenizer|tokenizer_config|preprocessor_config|generation_config|processor_config|special_tokens_map|added_tokens)\.json$/.test(url.pathname) || /^\/models\/whisper-tiny\/onnx\/(?:encoder_model|decoder_model_merged)_quantized\.onnx$/.test(url.pathname) || /^\/vendor\/transcription\/ort-wasm-simd-threaded\.jsep\.(?:wasm|mjs)$/.test(url.pathname);
 if(url.origin!==origin||url.search||!allowed||!['GET','HEAD'].includes(method)||init?.body||(input instanceof Request&&input.body))throw new Error('Only local model/runtime downloads are allowed. Recordings cannot be sent by this worker.');
 return {url,method};
}

export const MAX_RECORDING_SECONDS = 30 * 60;
export const MAX_RECORDING_BYTES = 100 * 1024 * 1024;
export function validateRecordingDuration(seconds) {
 if(!Number.isFinite(seconds)||seconds<=0)throw new Error('Could not read a usable recording duration. Try an audio-only MP3 or WAV file.');
 if(seconds>MAX_RECORDING_SECONDS){const minutes=Math.floor(seconds/60),remainder=Math.floor(seconds%60);throw new Error(`This recording is ${minutes}m ${String(remainder).padStart(2,'0')}s. The limit is 30 minutes; choose a shorter section or split the recording.`);}
 return seconds;
}
export function validateMediaURL(value) {
 let url;try{url=new URL(String(value).trim());}catch{throw new Error('Enter a valid direct HTTPS audio or video URL.');}
 if(url.protocol!=='https:'||url.username||url.password)throw new Error('Use an HTTPS media URL without a username or password.');
 const host=url.hostname.toLowerCase();
 if(host==='youtu.be'||host==='youtube.com'||host.endsWith('.youtube.com')||host==='youtube-nocookie.com'||host.endsWith('.youtube-nocookie.com'))throw new Error('YouTube page links are not direct media files. Choose a local file or a direct MP3/WAV/MP4 URL.');
 url.hash='';return url;
}
export async function downloadMediaURL(value,{signal,onProgress=()=>{},fetcher=globalThis.fetch,maxBytes=MAX_RECORDING_BYTES}={}){
 const url=validateMediaURL(value);
 let response;
 try{response=await fetcher(url.href,{method:'GET',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',signal});}
 catch(error){if(error.name==='AbortError')throw error;throw new Error('The browser could not download this link. The host must allow CORS downloads. Save the file to your device and choose it locally instead.');}
 if(!response.ok)throw new Error(`The media host returned HTTP ${response.status}. Use a publicly accessible direct media link.`);
 if(response.url&&new URL(response.url).protocol!=='https:')throw new Error('The link redirected to an insecure address. Use a direct HTTPS URL.');
 const rawType=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
 if(rawType.startsWith('text/')||rawType.includes('json')||rawType.includes('mpegurl')||rawType.includes('dash+xml')){await response.body?.cancel().catch(()=>{});throw new Error('That link returns a web page or streaming playlist. Use a direct audio/video file URL.');}
 const byExtension={mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',mp4:'video/mp4',webm:'video/webm',ogg:'audio/ogg',flac:'audio/flac',aac:'audio/aac'};
 const ext=url.pathname.split('.').at(-1).toLowerCase();
 const type=rawType.startsWith('audio/')||rawType.startsWith('video/')?rawType:byExtension[ext];
 if(!type){await response.body?.cancel().catch(()=>{});throw new Error('Use a direct audio/video file URL with a recognised media type or file extension.');}
 const total=Number(response.headers.get('Content-Length'))||0;
 if(total>maxBytes){await response.body?.cancel().catch(()=>{});throw new Error('The linked recording exceeds the 100 MB download limit.');}
 if(!response.body)throw new Error('This browser could not stream the download. Choose the file locally instead.');
 const reader=response.body.getReader(),parts=[];let loaded=0;
 try{
  for(;;){signal?.throwIfAborted();const {done,value:chunk}=await reader.read();if(done)break;loaded+=chunk.byteLength;if(loaded>maxBytes)throw new Error('The linked recording exceeds the 100 MB download limit.');parts.push(chunk);onProgress(loaded,total);}
 }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 if(!loaded)throw new Error('The linked recording is empty.');
 return new Blob(parts,{type});
}
