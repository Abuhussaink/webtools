import {METHODS,SHIA_METHODS,CITIES,prayerTimes,formatTime,qibla,distanceToMakkah} from './prayer-core.js';
import {toHijri} from './utility-core.js';
const $=id=>document.getElementById(id),controls=$('tool-controls'),results=$('tool-results');
const NAMES={fajr:'Fajr',sunrise:'Sunrise',dhuhr:'Dhuhr',asr:'Asr',maghrib:'Maghrib',isha:'Isha'},KEYS=Object.keys(NAMES);
const browserTz=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
function say(s,error=false){$('tool-status').textContent=s;$('tool-status').toggleAttribute('data-error',error);}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const zones=(()=>{try{return Intl.supportedValuesOf('timeZone');}catch{return [...new Set(CITIES.map(c=>c.tz).concat(browserTz))];}})();
const defaultCity=Math.max(0,CITIES.findIndex(c=>c.tz===browserTz));
const opts=list=>Object.entries(list).map(([k,m])=>`<option value="${k}">${esc(m.name)}</option>`).join('');

controls.innerHTML=`<div class="suite-fields"><label for="place">Place<select id="place">${CITIES.map((c,i)=>`<option value="${i}">${esc(c.name)}</option>`).join('')}<option value="custom">Other place — enter coordinates</option></select></label>
 <label for="date">Date<input id="date" type="date"></label></div>
<div id="custom-fields" class="suite-fields" hidden><label for="lat">Latitude<input id="lat" type="number" step="any" min="-90" max="90" placeholder="26.2285"></label><label for="lon">Longitude<input id="lon" type="number" step="any" min="-180" max="180" placeholder="50.5860"></label>
 <label for="tz">Time zone<select id="tz">${zones.map(z=>`<option${z===browserTz?' selected':''}>${esc(z)}</option>`).join('')}</select></label></div>
<div class="suite-actions"><button type="button" id="locate">Use my location</button></div>
<div class="suite-fields"><label for="method">Sunni method<select id="method">${opts(METHODS)}</select></label>
 <label for="asr">Asr (Sunni)<select id="asr"><option value="standard">Standard (Shafi, Maliki, Hanbali)</option><option value="hanafi">Hanafi</option></select></label>
 <label for="shia-method" id="shia-method-wrap">Shia method<select id="shia-method">${opts(SHIA_METHODS)}</select></label>
 <label for="clock">Clock<select id="clock"><option value="24">24-hour</option><option value="12">12-hour</option></select></label></div>
<label class="suite-check" for="show-shia"><input id="show-shia" type="checkbox" checked>Show Shia (Ja’fari) times beside Sunni times</label>
<details><summary>Adjust minutes to match your local mosque</summary><p class="suite-help">Applied to both columns.</p><div class="suite-fields">${KEYS.map(k=>`<label for="adj-${k}">${NAMES[k]}<input id="adj-${k}" type="number" value="0" min="-60" max="60" step="1"></label>`).join('')}</div></details>
<div class="suite-actions"><button type="button" id="month">Show the whole month</button></div>`;
results.innerHTML='<div id="today-view"></div><div id="month-view"></div>';
$('date').value=today();$('place').value=String(defaultCity);

function place(){
 const v=$('place').value;
 if(v!=='custom'){const c=CITIES[+v];return {lat:c.lat,lon:c.lon,tz:c.tz,name:c.name};}
 const lat=Number($('lat').value),lon=Number($('lon').value);
 if($('lat').value.trim()===''||$('lon').value.trim()===''||!Number.isFinite(lat)||!Number.isFinite(lon))throw new Error('Enter latitude and longitude, or choose a place from the list.');
 if(Math.abs(lat)>90||Math.abs(lon)>180)throw new Error('Latitude must be −90 to 90 and longitude −180 to 180.');
 return {lat,lon,tz:$('tz').value,name:`${lat.toFixed(4)}, ${lon.toFixed(4)}`};
}
function adjustments(){const a={};for(const k of KEYS){const n=Number($(`adj-${k}`).value||0);if(!Number.isInteger(n)||Math.abs(n)>60)throw new Error('Minute adjustments must be whole numbers from −60 to 60.');a[k]=n/60;}return a;}
const showShia=()=>$('show-shia').checked;
function compute(dateStr,loc,method,asr){
 const [y,m,d]=dateStr.split('-').map(Number);let ramadan=false;try{ramadan=toHijri(dateStr).month===9;}catch{}
 const r=prayerTimes({year:y,month:m,day:d,lat:loc.lat,lon:loc.lon,tz:loc.tz,method,asr,ramadan}),adj=adjustments();
 for(const k of KEYS)r.times[k]+=adj[k];return {...r,ramadan};
}
const both=(ds,loc)=>({sunni:compute(ds,loc,$('method').value,$('asr').value),shia:showShia()?compute(ds,loc,$('shia-method').value,'standard'):null});
function nowInZone(tz){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,hours:+p.hour+ +p.minute/60};}
const nextOf=(times,now)=>KEYS.filter(k=>k!=='sunrise').find(k=>Number.isFinite(times[k])&&times[k]>now);
function render(){
 $('month-view').replaceChildren();$('shia-method-wrap').hidden=!showShia();
 try{
  if(!/^\d{4}-\d{2}-\d{2}$/.test($('date').value))throw new Error('Choose a date.');
  const loc=place(),r=both($('date').value,loc),use24=$('clock').value==='24',now=nowInZone(loc.tz),isToday=now.date===$('date').value;
  const nextS=isToday?nextOf(r.sunni.times,now.hours):null,nextH=isToday&&r.shia?nextOf(r.shia.times,now.hours):null;
  const missing=[r.sunni,r.shia].filter(Boolean).some(x=>KEYS.some(k=>!Number.isFinite(x.times[k])));
  const hijri=(()=>{try{const h=toHijri($('date').value);return `${h.day} ${h.monthName} ${h.year} AH`;}catch{return '';}})();
  const q=qibla(loc.lat,loc.lon),dist=distanceToMakkah(loc.lat,loc.lon),dir=['N','NE','E','SE','S','SW','W','NW'][Math.round(q/45)%8];
  const sign=r.sunni.offset>=0?'+':'−',oh=Math.abs(r.sunni.offset),zone=`UTC${sign}${Math.floor(oh)}${oh%1?':'+String(Math.round(oh%1*60)).padStart(2,'0'):''}`;
  const cell=(x,k,next)=>`<td${k===next?' class="is-next"':''}>${formatTime(x.times[k],use24)}${k===next?' <strong>— next</strong>':''}</td>`;
  const head=r.shia?`<tr><th>Prayer</th><th>Sunni<br><small>${esc(METHODS[$('method').value].name)}</small></th><th>Shia<br><small>${esc(SHIA_METHODS[$('shia-method').value].name)}</small></th></tr>`:'<tr><th>Prayer</th><th>Time</th></tr>';
  const rows=KEYS.map(k=>`<tr><td>${NAMES[k]}</td>${cell(r.sunni,k,nextS)}${r.shia?cell(r.shia,k,nextH):''}</tr>`).join('')+(r.shia?`<tr><td>Midnight <small>(Shia: halfway from sunset to Fajr)</small></td><td>—</td><td>${formatTime(r.shia.times.midnight,use24)}</td></tr>`:'');
  $('today-view').innerHTML=`<h2>${esc(loc.name)}</h2><p class="suite-help">${esc(new Date($('date').value+'T12:00:00Z').toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}))}${hijri?' · '+esc(hijri):''} · ${esc(loc.tz)} (${zone})</p>
  <div class="suite-table-wrap"><table class="suite-table prayer-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
  ${r.shia?'<p class="suite-help">Shia Maghrib is when the redness in the eastern sky has passed (the sun about 4° below the horizon), so it is later than Sunni Maghrib. Dhuhr, Asr and sunrise are the same.</p>':''}
  ${missing?'<p class="suite-warning">On this date the sun does not rise or set far enough here for some prayers to be calculated. Follow your local mosque or the nearest normal day.</p>':''}
  ${r.sunni.ramadan&&$('method').value==='makkah'?'<p class="suite-help">Ramadan: Isha is 120 minutes after Maghrib with the Umm al-Qura method.</p>':''}
  <p class="suite-big">Qibla ${q.toFixed(1)}° ${dir}</p><p class="suite-help">Direction to the Kaaba measured clockwise from true north, ${Math.round(dist).toLocaleString()} km away. Phone compasses point to magnetic north and can be several degrees off near metal or electronics.</p>`;
  say(`Calculated on this device. Mosque timetables may differ by a few minutes.`);
 }catch(e){$('today-view').replaceChildren();say(e.message,true);}
}
// One model for the month table, printing and the PDF: Gregorian + Hijri date, and Sunni then Shia columns
// for every prayer whose time differs between them (Fajr, Maghrib, Isha; Asr too with Hanafi).
function monthData(){
 const loc=place(),use24=$('clock').value==='24',[y,m]=$('date').value.split('-').map(Number),days=new Date(Date.UTC(y,m,0)).getUTCDate(),shia=showShia(),list=[];
 for(let d=1;d<=days;d++){const ds=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,r=both(ds,loc),date=new Date(ds+'T12:00:00Z');
  let h=null;try{h=toHijri(ds);}catch{}
  list.push({ds,day:d,weekday:date.toLocaleDateString('en-GB',{weekday:'short',timeZone:'UTC'}),friday:date.getUTCDay()===5,hijri:h,
   t:Object.fromEntries(KEYS.map(k=>[k,[formatTime(r.sunni.times[k],use24),shia?formatTime(r.shia.times[k],use24):null]]))});}
 const split=Object.fromEntries(KEYS.map(k=>[k,shia&&list.some(x=>x.t[k][0]!==x.t[k][1])]));
 const hm=[...new Set(list.filter(x=>x.hijri).map(x=>`${x.hijri.monthName} ${x.hijri.year}`))];
 const r0=both(list[0].ds,loc),oh=Math.abs(r0.sunni.offset),zone=`UTC${r0.sunni.offset>=0?'+':'−'}${Math.floor(oh)}${oh%1?':'+String(Math.round(oh%1*60)).padStart(2,'0'):''}`;
 return {loc,list,split,shia,zone,month:new Date(Date.UTC(y,m-1,1)).toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}),hijriRange:hm.join(' – ')+(hm.length?' AH':''),
  sunniMethod:METHODS[$('method').value].name+($('asr').value==='hanafi'?', Hanafi Asr':''),shiaMethod:shia?SHIA_METHODS[$('shia-method').value].name:'',file:`prayer-times-${loc.name.split(',')[0].trim().replace(/[^A-Za-z0-9]+/g,'-').toLowerCase()||'place'}-${y}-${String(m).padStart(2,'0')}.pdf`};
}
const hijriLabel=h=>h?`${h.day} ${h.monthName}`:'—';
$('month').onclick=()=>{
 try{const M=monthData();
  const head1=`<tr><th rowspan="${M.shia?2:1}">Date</th><th rowspan="${M.shia?2:1}">Hijri</th>${KEYS.map(k=>M.split[k]?`<th colspan="2" class="pt-group">${NAMES[k]}</th>`:`<th rowspan="${M.shia?2:1}">${NAMES[k]}</th>`).join('')}</tr>`;
  const head2=M.shia?`<tr>${KEYS.filter(k=>M.split[k]).map(()=>'<th class="pt-sub">Sunni</th><th class="pt-sub">Shia</th>').join('')}</tr>`:'';
  const rows=M.list.map(x=>`<tr class="${[x.ds===$('date').value?'is-next':'',x.friday?'is-friday':''].join(' ').trim()}"><td>${x.weekday} ${x.day}</td><td>${esc(hijriLabel(x.hijri))}</td>${KEYS.map(k=>M.split[k]?`<td>${x.t[k][0]}</td><td class="pt-shia">${x.t[k][1]}</td>`:`<td>${x.t[k][0]}</td>`).join('')}</tr>`).join('');
  $('month-view').innerHTML=`<div class="pt-month-head"><h2>${esc(M.loc.name)} — ${esc(M.month)}</h2><p class="suite-help">${esc(M.hijriRange)} · ${esc(M.loc.tz)} (${M.zone}) · Sunni: ${esc(M.sunniMethod)}${M.shia?` · Shia: ${esc(M.shiaMethod)}`:''}</p></div>
  <div class="suite-table-wrap"><table class="suite-table pt-month"><thead>${head1}${head2}</thead><tbody>${rows}</tbody></table></div>
  <div class="suite-actions"><button type="button" class="suite-primary" id="pdf">Download PDF (A4, one page)</button><button type="button" id="print">Print this month</button></div>`;
  $('print').onclick=()=>window.print();$('pdf').onclick=()=>downloadPdf(M);
  $('month-view').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){say(e.message,true);}
};
// A4 portrait PDF with the whole month on one page, drawn with pdf-lib (served from this site).
let pdfUrl=null;
async function downloadPdf(M){
 try{
  const L=window.PDFLib;if(!L)throw new Error('The PDF engine did not load. Refresh the page and try again.');
  const doc=await L.PDFDocument.create(),page=doc.addPage([595.28,841.89]),font=await doc.embedFont(L.StandardFonts.Helvetica),bold=await doc.embedFont(L.StandardFonts.HelveticaBold);
  doc.setTitle(`Prayer times — ${M.loc.name} — ${M.month}`);doc.setProducer('CSBH Tools');doc.setCreator('csbh.uk');
  const safe=(f,s)=>{let out='';for(const ch of String(s)){try{f.encodeText(ch);out+=ch;}catch{out+='?';}}return out;};
  const rose=L.rgb(.722,.196,.271),ink=L.rgb(.16,.13,.16),grey=L.rgb(.45,.36,.39),W=595.28,H=841.89,mx=26;let y=H-34;
  const text=(s,x,yy,size,f=font,color=ink)=>page.drawText(safe(f,s),{x,y:yy,size,font:f,color});
  const fit=(s,f,size,max)=>{s=safe(f,s);while(s.length>1&&f.widthOfTextAtSize(s,size)>max)s=s.slice(0,-1);return s;};
  text(`Prayer times — ${M.loc.name}`,mx,y,15,bold,rose);y-=16;
  text(`${M.month}${M.hijriRange?'  ·  '+M.hijriRange:''}`,mx,y,10.5,bold);y-=13;
  text(fit(`Time zone ${M.loc.tz} (${M.zone})  ·  Sunni: ${M.sunniMethod}${M.shia?`  ·  Shia: ${M.shiaMethod}`:''}`,font,8,W-2*mx),mx,y,8,font,grey);y-=14;
  // Columns: Date, Hijri, then one or two columns per prayer.
  const longest=Math.max(...M.list.map(r=>font.widthOfTextAtSize(safe(font,hijriLabel(r.hijri)),9)));
  const cols=[{key:'date',label:'Date',w:42},{key:'hijri',label:'Hijri',w:Math.min(130,Math.max(70,longest+12))}];
  for(const k of KEYS){if(M.split[k]){cols.push({key:k,i:0,group:NAMES[k],label:'Sunni'},{key:k,i:1,group:NAMES[k],label:'Shia'});}else cols.push({key:k,i:0,label:NAMES[k]});}
  const fixed=cols.reduce((n,c)=>n+(c.w||0),0),flex=cols.filter(c=>!c.w).length,fw=(W-2*mx-fixed)/flex;cols.forEach(c=>{c.w=c.w||fw;});
  const rowsN=M.list.length,headH=M.shia?28:16,footer=22,rowH=Math.min(20,(y-headH-footer-26)/rowsN),size=Math.min(9,rowH*.5);
  // header
  page.drawRectangle({x:mx,y:y-headH,width:W-2*mx,height:headH,color:rose});
  let x=mx;for(let i=0;i<cols.length;i++){const c=cols[i];
   if(c.group&&c.i===0){const gw=c.w+cols[i+1].w,g=c.group;text(g,x+(gw-bold.widthOfTextAtSize(g,8.5))/2,y-11,8.5,bold,L.rgb(1,1,1));for(const [off,lab] of [[0,c.label],[c.w,cols[i+1].label]])text(lab,x+off+(c.w-font.widthOfTextAtSize(lab,7.5))/2,y-headH+5,7.5,font,L.rgb(1,1,1));}
   else if(!c.group){const lab=c.label,f=bold;text(lab,c.key==='date'||c.key==='hijri'?x+4:x+(c.w-f.widthOfTextAtSize(lab,8.5))/2,y-(headH+8.5)/2+2,8.5,f,L.rgb(1,1,1));}
   x+=c.w;}
  y-=headH;
  // rows
  M.list.forEach((r,n)=>{const top=y-n*rowH;
   if(r.friday)page.drawRectangle({x:mx,y:top-rowH,width:W-2*mx,height:rowH,color:L.rgb(1,.906,.922)});else if(n%2)page.drawRectangle({x:mx,y:top-rowH,width:W-2*mx,height:rowH,color:L.rgb(.985,.965,.97)});
   let cx=mx;const base=top-rowH/2-size*.35;
   for(const c of cols){let v=c.key==='date'?`${r.weekday} ${r.day}`:c.key==='hijri'?hijriLabel(r.hijri):r.t[c.key][c.i];const f=c.key==='date'&&r.friday?bold:font;v=fit(v,f,size,c.w-6);
    const color=c.i===1?rose:ink;text(v,c.key==='date'||c.key==='hijri'?cx+4:cx+(c.w-f.widthOfTextAtSize(v,size))/2,base,size,f,color);cx+=c.w;}
   page.drawLine({start:{x:mx,y:top-rowH},end:{x:W-mx,y:top-rowH},thickness:.4,color:L.rgb(.94,.83,.85)});});
  // vertical separators between prayer groups
  let vx=mx;for(let i=0;i<cols.length-1;i++){vx+=cols[i].w;if(!(cols[i].group&&cols[i].i===0))page.drawLine({start:{x:vx,y:y},end:{x:vx,y:y-rowsN*rowH},thickness:.4,color:L.rgb(.94,.83,.85)});}
  text(fit(`Fridays shaded. Calculated astronomically by csbh.uk; local mosque timetables may differ by a few minutes.${M.shia?' Shia times in red.':''}`,font,7,W-2*mx),mx,22,7,font,grey);
  const bytes=await doc.save();if(pdfUrl)URL.revokeObjectURL(pdfUrl);pdfUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  const a=document.createElement('a');a.href=pdfUrl;a.download=M.file;document.body.append(a);a.click();a.remove();
  say(`PDF ready: ${M.file} (A4, one page). Created on this device.`);
 }catch(e){say(e.message||'Could not create the PDF.',true);}
}
$('place').onchange=()=>{const custom=$('place').value==='custom';$('custom-fields').hidden=!custom;if(!custom)$('method').value=CITIES[+$('place').value].method;render();};
$('locate').onclick=()=>{
 if(!navigator.geolocation){say('Location is not available in this browser. Enter coordinates instead.',true);return;}
 say('Asking your browser for your location… It is used only on this page and never sent anywhere.');
 navigator.geolocation.getCurrentPosition(p=>{$('place').value='custom';$('custom-fields').hidden=false;$('lat').value=p.coords.latitude.toFixed(4);$('lon').value=p.coords.longitude.toFixed(4);$('tz').value=browserTz;render();},
  e=>say(e.code===1?'Location permission was not given. Choose a place or enter coordinates.':'Could not get your location. Choose a place or enter coordinates.',true),{enableHighAccuracy:false,timeout:15000,maximumAge:600000});
};
for(const id of ['date','method','asr','clock','lat','lon','tz','shia-method','show-shia',...KEYS.map(k=>`adj-${k}`)])$(id).addEventListener('change',render);
for(const id of ['lat','lon'])$(id).addEventListener('input',()=>{if($('lat').value&&$('lon').value)render();});
$('method').value=CITIES[defaultCity].method;render();
