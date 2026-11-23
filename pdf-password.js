// Add or remove a PDF password with qpdf (WebAssembly), served from this site and run on this device.
const $=id=>document.getElementById(id),controls=$('tool-controls'),results=$('tool-results');
const MAX=75*1024*1024;let file=null,bytes=null,mode='lock',busy=false,url=null;
function say(s,error=false){$('tool-status').textContent=s;$('tool-status').toggleAttribute('data-error',error);}
const sizeText=b=>b<1024*1024?`${Math.max(1,Math.round(b/1024))} KB`:`${(b/1024/1024).toFixed(2)} MB`;
// Run qpdf in a fresh instance. Returns {code, out, err, result}. Exit codes: 0 ok, 2 error, 3 warnings.
async function qpdf(args,input){
 if(typeof window.Module!=='function')throw new Error('The PDF engine did not load. Refresh the page and try again.');
 let out='',err='';const q=await window.Module({noInitialRun:true,locateFile:()=>'/vendor/qpdf/qpdf.wasm',print:t=>{out+=t+'\n';},printErr:t=>{err+=t+'\n';}});
 q.FS.writeFile('/in.pdf',input);let code;try{code=q.callMain(args);}catch(e){code=typeof e?.status==='number'?e.status:2;if(!err)err=String(e?.message||e);}
 let result=null;try{result=q.FS.readFile('/out.pdf');}catch{}
 try{q.FS.unlink('/in.pdf');}catch{}try{q.FS.unlink('/out.pdf');}catch{}
 return {code,out,err,result};
}
// True if the file's trailer (or cross-reference stream dictionary) names an /Encrypt dictionary.
function hasEncryptEntry(b){const text=new TextDecoder('latin1').decode(b.length>4e6?b.subarray(b.length-4e6):b);return /\/Encrypt\s*(\d+\s+\d+\s+R|<<)/.test(text);}
function randomPassword(){const a=new Uint8Array(24);crypto.getRandomValues(a);return Array.from(a,b=>'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[b%56]).join('');}
controls.innerHTML=`<div class="suite-tabs" role="group" aria-label="Choose an action"><button type="button" data-mode="lock" aria-pressed="true">Add password</button><button type="button" data-mode="unlock" aria-pressed="false">Remove password</button></div>
<label for="pw-file">Choose a PDF<input id="pw-file" type="file" accept=".pdf,application/pdf"></label><p id="pw-info" class="suite-help"></p>
<div id="lock-panel"><div class="suite-fields"><label for="pw-new">Password to open the PDF<input id="pw-new" type="password" autocomplete="new-password" minlength="4" maxlength="127"></label><label for="pw-confirm">Type it again<input id="pw-confirm" type="password" autocomplete="new-password" maxlength="127"></label></div>
 <label class="suite-check" for="pw-show"><input id="pw-show" type="checkbox">Show passwords</label>
 <label class="suite-check" for="pw-restrict"><input id="pw-restrict" type="checkbox">Also block printing, copying and editing (for people who open it)</label>
 <p class="suite-help">Uses AES-256 encryption, supported by Adobe Reader, Chrome, Edge, Safari/Preview and most PDF apps. <strong>Keep your password safe: it cannot be recovered.</strong> Restrictions are respected by most PDF apps, but some can ignore them.</p></div>
<div id="unlock-panel" hidden><div class="suite-fields"><label for="pw-old">Current password<input id="pw-old" type="password" autocomplete="current-password" maxlength="127"></label></div><p class="suite-help">Saves an unprotected copy. You need to know the password; this tool does not guess or crack passwords.</p></div>
<div class="suite-actions"><button type="button" class="suite-primary" id="pw-run" disabled>Add password</button><button type="button" id="pw-clear">Clear</button></div>`;
results.className='suite-downloads';
function setMode(m){mode=m;for(const b of controls.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===m));$('lock-panel').hidden=m!=='lock';$('unlock-panel').hidden=m!=='unlock';$('pw-run').textContent=m==='lock'?'Add password':'Remove password';clearResult();}
for(const b of controls.querySelectorAll('[data-mode]'))b.onclick=()=>setMode(b.dataset.mode);
function clearResult(){if(url)URL.revokeObjectURL(url);url=null;results.replaceChildren();}
function setBusy(v){busy=v;for(const el of controls.querySelectorAll('input,button'))el.disabled=v;$('pw-run').disabled=v||!bytes;}
$('pw-show').onchange=()=>{for(const id of ['pw-new','pw-confirm'])$(id).type=$('pw-show').checked?'text':'password';};
$('pw-file').onchange=async()=>{const f=$('pw-file').files[0];clearResult();file=bytes=null;$('pw-info').textContent='';setBusy(false);if(!f)return;
 try{if(f.size>MAX)throw new Error('Choose a PDF up to 75 MB.');const b=new Uint8Array(await f.arrayBuffer());if(String.fromCharCode(...b.subarray(0,5))!=='%PDF-'&&!String.fromCharCode(...b.subarray(0,1024)).includes('%PDF-'))throw new Error('This file is not a PDF.');
  setBusy(true);say('Checking the PDF on this device…');
  // qpdf: 0 = needs password, 3 = encrypted but opens without one, 2 = not encrypted OR could not open.
  // This WebAssembly build returns 2 for password-locked files too, so we also look for the /Encrypt entry every encrypted PDF declares.
  const r=await qpdf(['--requires-password','/in.pdf'],b),declared=hasEncryptEntry(b);
  file=f;bytes=b;
  if(r.code===0||(r.code===2&&declared)){$('pw-info').textContent=`🔒 ${f.name} (${sizeText(f.size)}) is password-protected.`;setMode('unlock');}
  else if(r.code===3){$('pw-info').textContent=`${f.name} (${sizeText(f.size)}) has editing or printing restrictions but no open password.`;setMode('unlock');}
  else {$('pw-info').textContent=`${f.name} (${sizeText(f.size)}) is not password-protected.`;setMode('lock');}
  say('PDF ready. Nothing has been uploaded.');
 }catch(e){file=bytes=null;$('pw-file').value='';say(e.message,true);}finally{setBusy(false);}};
$('pw-run').onclick=async()=>{if(busy||!bytes)return;clearResult();
 try{
  let args,name;
  if(mode==='lock'){const p=$('pw-new').value,c=$('pw-confirm').value;
   if(p.length<4)throw new Error('Use a password of at least 4 characters (longer is safer).');if(p!==c)throw new Error('The two passwords do not match.');
   if(/[^\x20-\x7e]/.test(p))throw new Error('Use letters, numbers and standard symbols in the password, so every PDF app can open it.');
   const owner=randomPassword(),restrict=$('pw-restrict').checked?['--print=none','--modify=none','--extract=n','--annotate=n','--form=n']:[];
   args=['--encrypt',`--user-password=${p}`,`--owner-password=${owner}`,'--bits=256',...restrict,'--','/in.pdf','/out.pdf'];name=file.name.replace(/\.pdf$/i,'')+'-protected.pdf';}
  else{const p=$('pw-old').value;args=[`--password=${p}`,'--decrypt','/in.pdf','/out.pdf'];name=file.name.replace(/\.pdf$/i,'')+'-unlocked.pdf';}
  setBusy(true);say('Working on this device…');await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
  const r=await qpdf(args,bytes);
  if(r.code===2||!r.result){if(/invalid password/i.test(r.err)||(mode==='unlock'&&hasEncryptEntry(bytes)))throw new Error('That password is not correct. Check capital letters and try again.');throw new Error('Could not process this PDF'+(r.err?`: ${r.err.split('\n').find(l=>l.trim())?.replace(/^.*?:\s*/,'').slice(0,140)}`:'.'));}
  url=URL.createObjectURL(new Blob([r.result],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download=name;a.textContent=`Download ${name} (${sizeText(r.result.length)})`;results.append(a);
  if(mode==='lock'){$('pw-new').value=$('pw-confirm').value='';}else $('pw-old').value='';
  say(mode==='lock'?'Done. Open the file once to check the password works. Your PDF and password never left this device.':'Done. The copy opens without a password. Your PDF and password never left this device.');
 }catch(e){say(e.message,true);}finally{setBusy(false);}
};
$('pw-clear').onclick=()=>{file=bytes=null;$('pw-file').value='';for(const id of ['pw-new','pw-confirm','pw-old'])$(id).value='';$('pw-info').textContent='';clearResult();setBusy(false);say('File and passwords cleared.');};
window.addEventListener('pagehide',()=>{if(url)URL.revokeObjectURL(url);});
