import { modelAssets, MODEL_CACHE } from './transcription-assets.js';
import { assertAssetRequest, normalizeSegments } from './transcription-core.js';
const nativeFetch=globalThis.fetch.bind(globalThis);
let model=null,remember=false,cache=null,active=false;
const origin=self.location.origin;
function notify(type,data={}){self.postMessage({type,...data});}
async function checkHash(bytes,expected){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==expected)throw new Error('A model download was incomplete or changed. Clear the cached model and try again.');}
async function readAsset(url,options={},onProgress=()=>{}){
 const response=await nativeFetch(url,{...options,credentials:'omit',cache:remember?'default':'no-store'});
 if(!response.ok)throw new Error(`Could not download a speech asset (HTTP ${response.status}). Check the site upload and try again.`);
 const total=Number(response.headers.get('Content-Length'))||0;
 if(!response.body)return new Uint8Array(await response.arrayBuffer());
 const reader=response.body.getReader(),parts=[];let loaded=0;
 for(;;){const {done,value}=await reader.read();if(done)break;parts.push(value);loaded+=value.length;onProgress(loaded,total);}
 const out=new Uint8Array(loaded);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;
}
// The inference runtime can only GET/HEAD fixed local asset directories.
// Audio samples and transcript text never enter any network request or cache.
globalThis.fetch=async(input,init={})=>{
 const {url,method}=assertAssetRequest(input,init,origin);
 const asset=modelAssets[url.pathname];
 if(remember&&cache){const hit=await cache.match(url.href);if(hit){notify('asset',{name:url.pathname.split('/').at(-1),cached:true});return method==='HEAD'?new Response(null,{status:200,headers:hit.headers}):hit;}}
 if(asset){
  const headers={'Content-Length':String(asset.size),'Content-Type':'application/octet-stream'};
  if(method==='HEAD')return new Response(null,{status:200,headers});
  const out=new Uint8Array(asset.size);let offset=0;
  for(const part of asset.parts){
   const bytes=await readAsset(new URL(part.url,origin),{},loaded=>notify('asset',{name:url.pathname.split('/').at(-1),loaded:offset+loaded,total:asset.size}));
   if(bytes.length!==part.size)throw new Error('Incomplete speech model download. Please retry.');
   await checkHash(bytes,part.sha256);out.set(bytes,offset);offset+=bytes.length;
  }
  await checkHash(out,asset.sha256);
  const response=new Response(out,{status:200,headers});
  if(remember&&cache)try{await cache.put(url.href,response.clone());}catch{notify('cache-warning');}
  return response;
 }
 if(method==='HEAD')return nativeFetch(url,{method:'HEAD',credentials:'omit'});
 const bytes=await readAsset(url,{},(loaded,total)=>notify('asset',{name:url.pathname.split('/').at(-1),loaded,total}));
 const type=url.pathname.endsWith('.json')?'application/json':url.pathname.endsWith('.wasm')?'application/wasm':'application/octet-stream';
 const response=new Response(bytes,{status:200,headers:{'Content-Type':type,'Content-Length':String(bytes.length)}});
 if(remember&&cache)try{await cache.put(url.href,response.clone());}catch{notify('cache-warning');}
 return response;
};
self.onmessage=async({data})=>{
 if(active||data.type!=='transcribe')return;active=true;
 try{
  remember=Boolean(data.remember);
  if(remember&&'caches'in globalThis)try{cache=await caches.open(MODEL_CACHE);}catch{notify('cache-warning');}
  if(!model){
   notify('phase',{phase:'loading'});
   const {pipeline,env}=await import('./vendor/transcription/transformers.min.js');
   env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath='/models/';env.useBrowserCache=false;env.useFSCache=false;env.useFS=false;
   env.backends.onnx.wasm.wasmPaths=origin+'/vendor/transcription/';
   env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
   model=await pipeline('automatic-speech-recognition','whisper-tiny',{dtype:'q8',device:'wasm',local_files_only:true});
  }
  notify('phase',{phase:'transcribing'});
  const options={return_timestamps:true,chunk_length_s:30,stride_length_s:5,task:'transcribe'};
  // English is the only supported language until other languages are validated.
  options.language='english';
  const audio=new Float32Array(data.audio);
  const result=await model(audio,options);
  const segments=normalizeSegments(result,data.duration);
  notify('complete',{segments,duration:data.duration});
 }catch(error){notify('error',{message:error?.message||'Transcription failed on this device.'});}
 finally{active=false;}
};
