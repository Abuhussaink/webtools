import * as core from './utility-core.js';
import words from './passphrase-words.js';
const $=id=>document.getElementById(id), controls=$('tool-controls'), results=$('tool-results');
const tool=document.body.dataset.tool;
let cleanup=()=>{};
function say(message,error=false){$('tool-status').textContent=message;$('tool-status').toggleAttribute('data-error',error);}
function attempt(fn){return ()=>{try{fn();say('Done. Your inputs stayed on this device.');}catch(e){if($('output'))$('output').textContent='';say(e.message,true);}};} // never leave an old result next to an error
function output(text){$('output').textContent=String(text);}
function field(id,label,type='number',value='',extra=''){return `<label for="${id}">${label}<input id="${id}" type="${type}" value="${value}" ${extra} autocomplete="off"></label>`;}
const dateToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
function standard(actions='Calculate'){return `<div class="suite-actions"><button type="button" class="suite-primary" id="run">${actions}</button><button type="button" id="clear">Clear</button><button type="button" id="copy">Copy result</button></div><pre id="output" class="suite-output" aria-live="polite"></pre>`;}
function bind(run,clear){$('run').onclick=attempt(run);$('clear').onclick=()=>{clear();output('');say('Inputs and results cleared.');};$('copy').onclick=async()=>{try{if(!$('output').textContent)throw new Error('Generate a result first.');await navigator.clipboard.writeText($('output').textContent);say('Copied. The result is now on your device clipboard.');}catch(e){say('Copy unavailable. Select the result and copy it manually.',true);}};}
function tabs(items,render){
 controls.innerHTML='<div class="suite-tabs" role="group" aria-label="Choose a tool">'+items.map(([id,label])=>`<button type="button" data-mode="${id}" aria-pressed="false">${label}</button>`).join('')+'</div><div id="active-tool"></div>';
 function activate(id){cleanup();cleanup=()=>{};results.replaceChildren();say('');for(const b of controls.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===id));render(id,$('active-tool'));}
 for(const b of controls.querySelectorAll('[data-mode]'))b.onclick=()=>activate(b.dataset.mode);
 activate(items[0][0]);
}
const format=n=>{if(!Number.isFinite(n))throw new Error('The result is too large. Use smaller values.');return new Intl.NumberFormat(undefined,{maximumFractionDigits:8}).format(n);};
if(tool==='security-tools')tabs([['password','Password'],['passphrase','Passphrase']],(mode,panel)=>{
 panel.innerHTML=mode==='password'?`<div class="suite-fields">${field('length','Password length','number','20','min="8" max="128"')}</div><div>${[['lower','Lowercase'],['upper','Uppercase'],['digits','Digits'],['symbols','Symbols']].map(([id,label])=>`<label class="suite-check"><input type="checkbox" id="${id}" checked>${label}</label>`).join('')}</div>`:`<div class="suite-fields">${field('count','Number of words','number','6','min="4" max="12"')}<label for="separator">Separator<select id="separator"><option value="-">Hyphen</option><option value=" ">Space</option><option value="_">Underscore</option></select></label></div><p class="suite-help">Uses EFF’s 7,776-word list bundled on this site. Six independently random words provide about 77 bits of randomness. <a href="https://www.eff.org/dice" target="_blank" rel="noopener noreferrer">Word-list source</a>.</p>`;
 panel.innerHTML+='<p class="suite-help">Randomness comes from your browser’s cryptographic random generator. Results are not saved or transmitted. Save a chosen secret in your password manager. Clear it here when finished.</p>'+standard('Generate');
 bind(()=>{if(mode==='password'){const groups=[['lower','abcdefghijklmnopqrstuvwxyz'],['upper','ABCDEFGHIJKLMNOPQRSTUVWXYZ'],['digits','0123456789'],['symbols','!@#$%^&*()-_=+[]{}:,.?']].filter(([id])=>$(id).checked).map(([,g])=>g);output(core.password(core.number($('length').value),groups));}else output(core.passphrase(words,core.number($('count').value),$('separator').value));},()=>{if(mode==='password')$('length').value='20';else $('count').value='6';});
});
const money=(n,d=2)=>{if(!Number.isFinite(n))throw new Error('The result is too large. Use smaller values.');return new Intl.NumberFormat(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);};
const optional=(id,label)=>{const v=$(id).value.trim();return v===''?0:core.number(v,label);};
const EXTRA_CALCS={
 hijri:{html:`<div class="suite-fields"><label for="hijri-dir">Convert<select id="hijri-dir"><option value="to">Gregorian → Hijri</option><option value="from">Hijri → Gregorian</option></select></label></div><div id="hijri-to" class="suite-fields">${field('greg-date','Gregorian date','date',dateToday())}</div><div id="hijri-from" class="suite-fields" hidden>${field('h-day','Day','number','1','min="1" max="30"')}<label for="h-month">Month<select id="h-month">${core.HIJRI_MONTHS.map((m,i)=>`<option value="${i+1}">${i+1}. ${m}</option>`).join('')}</select></label>${field('h-year','Year (AH)','number','1448','min="1318" max="1500"')}</div><p class="suite-help">Uses the Umm al-Qura calendar built into your browser (1900–2076). Religious dates announced after moon sighting can differ by a day in some countries.</p>`,
  setup(){const s=()=>{$('hijri-to').hidden=$('hijri-dir').value!=='to';$('hijri-from').hidden=$('hijri-dir').value!=='from';};$('hijri-dir').onchange=s;s();},
  run(){const long=(d,loc,cal)=>new Intl.DateTimeFormat(loc+(cal?'-u-ca-islamic-umalqura':''),{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(d);
   if($('hijri-dir').value==='to'){const g=$('greg-date').value,h=core.toHijri(g),d=new Date(g+'T00:00:00Z');return `${h.day} ${h.monthName} ${h.year} AH\n${long(d,'ar',true)}\n${long(d,'en-GB')}`;}
   const iso=core.fromHijri(core.number($('h-year').value,'Year'),Number($('h-month').value),core.number($('h-day').value,'Day')),d=new Date(iso+'T00:00:00Z');return `${long(d,'en-GB')}\n${iso}\n${long(d,'ar',true)}`;}},
 gratuity:{html:`<div class="suite-fields"><label for="g-country">Country<select id="g-country"><option value="bahrain">Bahrain</option><option value="saudi">Saudi Arabia</option><option value="uae">United Arab Emirates</option></select></label>${field('g-start','First working day','date')}${field('g-end','Last working day','date',dateToday())}${field('g-wage','Monthly wage for gratuity','number','','min="0" step="any"')}<label for="g-reason" id="g-reason-wrap">Contract ended by<select id="g-reason"><option value="termination">Employer / end of contract</option><option value="resignation">Employee resignation</option></select></label></div><p class="suite-help" id="g-rule"></p><p class="suite-help">An estimate of the legal minimum for private-sector employees. Which pay counts (basic only, or with allowances), unpaid leave and your contract can change the amount, so check with your employer or the labour ministry. Bahrain pays expatriates’ gratuity through SIO contributions; the entitlement shown is the legal formula.</p>`,
  setup(){const s=()=>{$('g-rule').textContent=core.GRATUITY_RULES[$('g-country').value];$('g-reason-wrap').hidden=$('g-country').value!=='saudi';};$('g-country').onchange=s;s();},
  run(){const country=$('g-country').value,r=core.gratuity({country,start:$('g-start').value,end:$('g-end').value,wage:core.number($('g-wage').value,'Monthly wage'),reason:$('g-reason').value}),d=country==='bahrain'?3:2;
   return `Estimated gratuity: ${money(r.amount,d)}\nService: ${format(r.days)} days (${r.years.toFixed(2)} years)\nEquivalent to ${r.months.toFixed(2)} months’ wages${r.note?`\n${r.note}`:''}`;}},
 loan:{html:`<div class="suite-fields">${field('l-amount','Loan amount','number','','min="0" step="any"')}${field('l-rate','Interest rate per year (%)','number','5','min="0" max="100" step="any"')}${field('l-years','Years','number','5','min="0" max="50"')}${field('l-months','+ Months','number','0','min="0" max="11"')}<label for="l-method">Interest type<select id="l-method"><option value="reducing">Reducing balance (mortgages, most bank loans)</option><option value="flat">Flat rate (many car and personal loans)</option></select></label></div><p class="suite-help">Flat-rate loans charge interest on the original amount for the whole term, so their real cost is higher than the advertised rate. The result shows the equivalent reducing-balance rate (APR) to compare offers fairly. Fees and insurance are not included.</p>`,
  run(){const months=core.number($('l-years').value||'0','Years')*12+core.number($('l-months').value||'0','Months'),r=core.loan({principal:core.number($('l-amount').value,'Loan amount'),annualRate:core.number($('l-rate').value,'Interest rate'),months,method:$('l-method').value});
   let text=`Monthly payment: ${money(r.payment)}\nTotal repaid: ${money(r.total)}\nTotal interest: ${money(r.interest)}`;if($('l-method').value==='flat')text+=`\nEquivalent reducing-balance rate (APR): ${r.apr.toFixed(2)}%`;
   if(r.schedule){text+='\n\nYear   Interest paid   Principal paid   Balance left';for(const y of r.schedule)text+=`\n${String(y.year).padEnd(5)}  ${money(y.interest).padStart(13)}   ${money(y.principal).padStart(14)}   ${money(y.balance).padStart(12)}`;}return text;}},
 zakat:{html:`<p class="suite-help">Enter what you own today in one currency. Leave anything that does not apply blank.</p><div class="suite-fields">${field('z-cash','Cash and bank balances','number','','min="0" step="any"')}${field('z-gold','Value of gold kept for saving','number','','min="0" step="any"')}${field('z-silver','Value of silver','number','','min="0" step="any"')}${field('z-invest','Shares and investments','number','','min="0" step="any"')}${field('z-business','Business stock for sale','number','','min="0" step="any"')}${field('z-owed','Money owed to you (expected back)','number','','min="0" step="any"')}${field('z-debts','Debts due now','number','','min="0" step="any"')}</div><div class="suite-fields"><label for="z-basis">Nisab based on<select id="z-basis"><option value="gold">Gold — 85 g</option><option value="silver">Silver — 595 g</option></select></label>${field('z-price','Today’s price per gram','number','','min="0" step="any"')}</div><p class="suite-help">Zakat is 2.5% of your net zakatable wealth if it has stayed above the nisab for one lunar year. Enter the price of 24-karat gold (or pure silver) per gram from your local market. Scholars differ on details such as jewellery in use and long-term debts; ask a trusted scholar if unsure.</p>`,
  run(){const r=core.zakat({cash:optional('z-cash','Cash'),gold:optional('z-gold','Gold'),silver:optional('z-silver','Silver'),investments:optional('z-invest','Investments'),business:optional('z-business','Business stock'),receivables:optional('z-owed','Money owed to you'),debts:optional('z-debts','Debts'),nisabBasis:$('z-basis').value,goldPrice:$('z-basis').value==='gold'?optional('z-price','Price'):0,silverPrice:$('z-basis').value==='silver'?optional('z-price','Price'):0});
   return `${r.due?`Zakat due: ${money(r.zakat)}`:'No zakat due: your wealth is below the nisab.'}\nNet zakatable wealth: ${money(r.net)}\nNisab: ${money(r.nisab)}`;}},
};
if(tool==='calculators')tabs([['percentage','Percentage'],['discount','Discount'],['vat','VAT'],['age','Age'],['dates','Date difference'],['loan','Loan'],['gratuity','End of service'],['zakat','Zakat'],['hijri','Hijri date']],(mode,panel)=>{
 if(EXTRA_CALCS[mode]){const c=EXTRA_CALCS[mode];panel.innerHTML=c.html+standard();if(c.setup)c.setup();bind(()=>output(c.run()),()=>{for(const el of panel.querySelectorAll('input[type=number]'))el.value='';});return;}
 const definitions={percentage:`<div class="suite-fields"><label for="percent-mode">Calculation<select id="percent-mode"><option value="of">What is A% of B?</option><option value="share">A is what % of B?</option><option value="change">Percentage change from A to B</option></select></label>${field('part','A')}${field('total','B')}</div>`,discount:`<div class="suite-fields">${field('price','Original price','number','','min="0" step="any"')}${field('rate','Discount (%)','number','10','min="0" max="100" step="any"')}</div>`,vat:`<div class="suite-fields">${field('amount','Amount','number','','min="0" step="any"')}${field('rate','VAT rate (%)','number','10','min="0" step="any"')}<label for="vat-mode">Amount includes VAT?<select id="vat-mode"><option value="no">No — add VAT</option><option value="yes">Yes — extract VAT</option></select></label></div><p class="suite-help">Enter the applicable rate yourself; the 10% starting value is editable. Amounts use your chosen currency.</p>`,age:`<div class="suite-fields">${field('birth','Date of birth','date')}${field('asof','Age on date','date',dateToday())}</div><p class="suite-help">Reports completed years. A February 29 birthday advances on March 1 in non-leap years.</p>`,dates:`<div class="suite-fields">${field('start','Start date','date',dateToday())}${field('end','End date','date')}</div><p class="suite-help">Calendar days between dates, excluding the starting day. Earlier end dates produce a negative result.</p>`};
 panel.innerHTML=definitions[mode]+standard();
 bind(()=>{
  if(mode==='percentage'){const a=core.number($('part').value),b=core.number($('total').value),operation=$('percent-mode').value;output(operation==='of'?format(a/100*b):`${format(operation==='share'?core.percentage(a,b):core.percentage(b-a,a))}%`);}
  if(mode==='discount'){const r=core.discount(core.number($('price').value),core.number($('rate').value));output(`Discount: ${format(r.saving)}\nFinal price: ${format(r.total)}`);}
  if(mode==='vat'){const r=core.vat(core.number($('amount').value),core.number($('rate').value),$('vat-mode').value==='yes');output(`Net amount: ${format(r.net)}\nVAT: ${format(r.tax)}\nTotal including VAT: ${format(r.gross)}`);}
  if(mode==='age')output(`${core.age($('birth').value,$('asof').value)} completed years`);
  if(mode==='dates')output(`${core.dateDifference($('start').value,$('end').value)} days`);
 },()=>{for(const el of panel.querySelectorAll('input'))el.value='';});
});
function compareTool(panel){
 panel.innerHTML='<div class="suite-fields compare-fields"><label for="cmp-a" style="flex:1 1 280px">Original text<textarea id="cmp-a" spellcheck="false" autocomplete="off" placeholder="Paste the first version"></textarea></label><label for="cmp-b" style="flex:1 1 280px">Changed text<textarea id="cmp-b" spellcheck="false" autocomplete="off" placeholder="Paste the second version"></textarea></label></div>'
  +'<label class="suite-check" for="cmp-case"><input id="cmp-case" type="checkbox">Ignore capital letters</label><label class="suite-check" for="cmp-space"><input id="cmp-space" type="checkbox">Ignore extra spaces</label><label class="suite-check" for="cmp-only"><input id="cmp-only" type="checkbox" checked>Show only changes (with 2 lines around each)</label>'
  +'<p class="suite-help">Compares line by line and highlights changed words. Useful for contracts, letters and edited documents. Up to 50,000 lines per side.</p><div class="suite-actions"><button type="button" class="suite-primary" id="cmp-run">Compare</button><button type="button" id="cmp-swap">Swap sides</button><button type="button" id="cmp-clear">Clear</button></div><p id="cmp-stats" class="suite-big" aria-live="polite"></p><div id="cmp-view" class="diff-view" hidden></div>';
 const view=$('cmp-view'),span=(cls,text)=>{const s=document.createElement('span');if(cls)s.className=cls;s.textContent=text;return s;};
 const line=(cls,prefix,content)=>{const d=document.createElement('span');d.className='line'+(cls?' '+cls:'');d.append(prefix);if(typeof content==='string')d.append(content||' ');else d.append(...content);return d;};
 function run(){try{
  const r=core.compareTexts($('cmp-a').value,$('cmp-b').value,{ignoreCase:$('cmp-case').checked,ignoreSpace:$('cmp-space').checked});
  const total=r.added+r.removed+r.changed;$('cmp-stats').textContent=total?`${r.changed} changed · ${r.added} added · ${r.removed} removed`:'✓ The texts are identical';
  view.replaceChildren();view.hidden=!total;if(!total){say('No differences found. Your text stayed on this device.');return;}
  const only=$('cmp-only').checked,keep=new Set();r.rows.forEach((row,i)=>{if(row.type!=='eq')for(let j=i-2;j<=i+2;j++)keep.add(j);});let skipped=0;
  const flush=()=>{if(skipped){view.append(line('','',`   … ${skipped} unchanged line${skipped>1?'s':''} …`));skipped=0;}};
  r.rows.forEach((row,i)=>{
   if(row.type==='eq'){if(only&&!keep.has(i)){skipped++;return;}flush();view.append(line('','  ',row.text));return;}
   flush();
   if(row.type==='del')view.append(line('del','− ',row.text));
   else if(row.type==='ins')view.append(line('ins','+ ',row.text));
   else if(row.parts){view.append(line('del','− ',row.parts.filter(p=>p.type!=='ins').map(p=>span(p.type==='del'?'del':'',p.value))),line('ins','+ ',row.parts.filter(p=>p.type!=='del').map(p=>span(p.type==='ins'?'ins':'',p.value))));}
   else view.append(line('del','− ',row.from),line('ins','+ ',row.to));
  });flush();say('Compared on this device. Nothing was uploaded.');
 }catch(e){view.replaceChildren();view.hidden=true;$('cmp-stats').textContent='';say(e.message,true);}}
 $('cmp-run').onclick=run;$('cmp-swap').onclick=()=>{[$('cmp-a').value,$('cmp-b').value]=[$('cmp-b').value,$('cmp-a').value];if(!view.hidden)run();};
 $('cmp-clear').onclick=()=>{$('cmp-a').value=$('cmp-b').value='';view.replaceChildren();view.hidden=true;$('cmp-stats').textContent='';say('Texts cleared.');};
 for(const id of ['cmp-case','cmp-space','cmp-only'])$(id).onchange=()=>{if($('cmp-stats').textContent)run();};
}
if(tool==='text-tools')tabs([['count','Word counter'],['case','Case converter'],['deduplicate','Remove duplicate lines'],['replace','Find and replace'],['compare','Compare texts']],(mode,panel)=>{
 if(mode==='compare'){compareTool(panel);return;}
 panel.innerHTML='<label for="text-input">Your text<textarea id="text-input" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" placeholder="Type or paste text here"></textarea></label>';
 if(mode==='case')panel.innerHTML+='<div class="suite-fields"><label for="case-mode">Convert to<select id="case-mode"><option value="upper">UPPERCASE</option><option value="lower">lowercase</option><option value="title">Title Case</option><option value="sentence">Sentence case</option></select></label></div>';
 if(mode==='replace')panel.innerHTML+=`<div class="suite-fields">${field('find','Find (literal text)','text')}${field('replacement','Replace with','text')}</div>`;
 if(['replace','deduplicate'].includes(mode))panel.innerHTML+='<label class="suite-check"><input type="checkbox" id="ignore-case">Ignore case</label>';
 panel.innerHTML+='<p class="suite-help">Text is processed locally. No regular expressions are executed from your input. Very large text is limited to 1 million characters.</p>'+standard(mode==='count'?'Count':'Transform');
 const run=()=>{const text=$('text-input').value;if(text.length>1000000)throw new Error('Use up to 1 million characters at a time.');
  if(mode==='count'){const r=core.wordCount(text);output(`Words: ${r.words}\nCharacters (including spaces): ${r.characters}\nLines: ${r.lines}`);}
  if(mode==='deduplicate')output(core.removeDuplicates(text,$('ignore-case').checked));
  if(mode==='replace')output(core.replaceLiteral(text,$('find').value,$('replacement').value,$('ignore-case').checked));
  if(mode==='case'){const c=$('case-mode').value;output(c==='upper'?text.toLocaleUpperCase():c==='lower'?text.toLocaleLowerCase():c==='title'?text.toLocaleLowerCase().replace(/(^|[^\p{L}\p{N}])(\p{L})/gu,(_,p,l)=>p+l.toLocaleUpperCase()):text.toLocaleLowerCase().replace(/(^|[.!?]\s+)(\p{L})/gu,(_,p,l)=>p+l.toLocaleUpperCase()));}
 };
 bind(run,()=>{for(const el of panel.querySelectorAll('input,textarea'))if(el.type!=='checkbox')el.value='';});
});
if(tool==='everyday-tools')tabs([['units','Unit converter'],['stopwatch','Stopwatch'],['countdown','Countdown timer'],['random','Random picker']],(mode,panel)=>{
 if(mode==='units'){
  panel.innerHTML='<div class="suite-fields"><label for="category">Category<select id="category">'+Object.keys(core.units).map(x=>`<option>${x}</option>`).join('')+`</select></label>${field('value','Value','number','1','step="any"')}<label for="from">From<select id="from"></select></label><label for="to">To<select id="to"></select></label></div>`+standard('Convert');
  function load(){for(const id of ['from','to'])$(id).replaceChildren(...Object.keys(core.units[$('category').value]).map(x=>new Option(x,x)));$('to').selectedIndex=1;output('');}
  $('category').onchange=load;load();bind(()=>output(`${format(core.convert(core.number($('value').value),$('category').value,$('from').value,$('to').value))} ${$('to').value}`),()=>{$('value').value='';});
 }
 if(mode==='random'){
  panel.innerHTML='<label for="entries">Entries (one per line)<textarea id="entries" spellcheck="false" autocomplete="off" placeholder="Alice\nBob\nCharlie"></textarea></label>'
   +'<label for="picker-file">Or load a .txt or .csv file (for large lists, such as giveaway comments)<input id="picker-file" type="file" accept=".txt,.csv,text/plain,text/csv"></label>'
   +'<div id="picker-file-row" class="suite-file-row" hidden><span id="picker-file-name"></span><button type="button" id="picker-file-remove">Remove file</button></div>'
   +'<div id="picker-csv" class="suite-fields" hidden><label for="picker-column">Column with names<select id="picker-column"></select></label><label class="suite-check" for="picker-header"><input id="picker-header" type="checkbox" checked>First row is a header</label></div>'
   +`<div class="suite-fields">${field('winners','Number of winners','number','1','min="1" max="1000"')}${field('first-n','Use only the first … entries (blank = all)','number','','min="1" max="200000" placeholder="e.g. 50000"')}</div>`
   +'<label class="suite-check" for="reverse"><input id="reverse" type="checkbox">List is newest first — reverse it so “first” means earliest</label>'
   +'<label class="suite-check" for="unique"><input id="unique" type="checkbox" checked>Remove duplicate entries (each person can win once)</label>'
   +'<label class="suite-check" for="loose"><input id="loose" type="checkbox" checked>Treat names as the same regardless of capitals or a leading @</label>'
   +'<p id="picker-stats" class="suite-help" aria-live="polite"></p>'
   +`<p class="suite-help">Picks without replacement using cryptographic randomness; every remaining entry has an equal chance. Up to ${core.PICKER_LIMITS.lines.toLocaleString('en')} lines or 10 MB, drawing from up to ${core.PICKER_LIMITS.entries.toLocaleString('en')} entries, and up to 1,000 winners. “First” follows the order of your list. Your list never leaves this device.</p>`+standard('Pick winners');
  let fileRows=null,fileLines=null; // loaded file contents (kept in memory only, never uploaded)
  function columnEntries(){const col=Number($('picker-column').value)||0;return fileRows.slice($('picker-header').checked?1:0).map(r=>(r[col]||'').trim()).filter(Boolean);}
  function sourceEntries(){let e=fileRows?columnEntries():fileLines?fileLines:core.textEntries($('entries').value);if($('reverse').checked)e=e.slice().reverse();return e;}
  function options(){const v=$('first-n').value.trim();return {firstN:v?core.number(v,'"Use only the first"'):0,unique:$('unique').checked,loose:$('loose').checked};}
  const n=x=>x.toLocaleString('en');
  function stats(){try{const p=core.prepareEntries(sourceEntries(),options());$('picker-stats').textContent=p.total?`${n(p.total)} entries${p.used<p.total?` → first ${n(p.used)} used`:''}${$('unique').checked?` → ${n(p.unique)} unique`:''} in the draw.`:'';$('picker-stats').removeAttribute('data-error');return p;}catch(e){$('picker-stats').textContent=e.message;return null;}}
  let timer=0;const later=()=>{clearTimeout(timer);timer=setTimeout(stats,300);};
  for(const id of ['entries','first-n'])$(id).addEventListener('input',later);
  for(const id of ['reverse','unique','loose','picker-column','picker-header'])$(id).addEventListener('change',stats);
  function removeFile(){fileRows=fileLines=null;$('picker-file').value='';$('picker-file-row').hidden=true;$('picker-csv').hidden=true;$('entries').disabled=false;stats();}
  $('picker-file-remove').onclick=()=>{removeFile();say('File removed.');};
  $('picker-file').onchange=async()=>{const f=$('picker-file').files[0];fileRows=fileLines=null;if(!f){removeFile();return;}
   try{if(f.size>10*1024*1024)throw new Error('Choose a file up to 10 MB.');const text=await f.text();
    if(/\.csv$/i.test(f.name)||f.type==='text/csv'){const rows=core.parseCsv(text);if(!rows.length)throw new Error('This file is empty.');const head=rows[0];
     $('picker-column').replaceChildren(...head.map((h,i)=>new Option(h.trim()?`${i+1}: ${h.trim().slice(0,40)}`:`Column ${i+1}`,String(i))));
     const guess=head.findIndex(h=>/user|name|handle|account/i.test(h));$('picker-column').value=String(guess>=0?guess:0);fileRows=rows;$('picker-csv').hidden=false;}
    else{fileLines=core.textEntries(text);$('picker-csv').hidden=true;}
    $('picker-file-name').textContent=`${f.name} — loaded on this device`;$('picker-file-row').hidden=false;$('entries').disabled=true;stats();say('File loaded locally. Nothing has been uploaded.');}
   catch(e){removeFile();say(e.message,true);}};
  bind(()=>{const p=core.prepareEntries(sourceEntries(),options());if(!p.list.length)throw new Error('Add entries, one per line, or load a file.');const w=core.drawWinners(p.list,core.number($('winners').value,'Number of winners'));stats();
   output(w.map((x,i)=>`${i+1}. ${x}`).join('\n')+`\n\nDrawn from ${n(p.unique)} entries on ${new Date().toLocaleString()}.`);},()=>{$('entries').value='';$('winners').value='1';$('first-n').value='';removeFile();});
  stats();
 }
 if(mode==='stopwatch'||mode==='countdown'){
  const countdown=mode==='countdown';let running=false,base=0,started=0,remaining=0,deadline=0;
  panel.innerHTML=(countdown?`<div class="suite-fields">${field('hours','Hours','number','0','min="0" max="168"')}${field('minutes','Minutes','number','5','min="0" max="59"')}${field('seconds','Seconds','number','0','min="0" max="59"')}</div>`:'')+'<div id="clock" class="suite-timer" role="timer" aria-label="Elapsed time">00:00:00</div><div class="suite-actions"><button id="start-timer" class="suite-primary" type="button">Start</button><button id="pause-timer" type="button" disabled>Pause</button><button id="reset-timer" type="button">Reset</button></div><p class="suite-help">Keep this tab open. Uses elapsed time rather than counting screen updates. No background notifications or sound are requested.</p>';
  function draw(){let ms=countdown?(running?Math.max(0,deadline-performance.now()):remaining):(base+(running?performance.now()-started:0));if(countdown&&running&&ms<=0){remaining=0;running=false;say('Time is up.');}const sec=Math.floor(ms/1000);$('clock').textContent=`${String(Math.floor(sec/3600)).padStart(2,'0')}:${String(Math.floor(sec/60)%60).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;$('pause-timer').disabled=!running;$('start-timer').disabled=running;}
  $('start-timer').onclick=()=>{try{if(countdown){if(!remaining){const h=core.nonnegative($('hours').value,'Hours'),m=core.nonnegative($('minutes').value,'Minutes'),s=core.nonnegative($('seconds').value,'Seconds');if(![h,m,s].every(Number.isInteger)||h>168||m>59||s>59)throw new Error('Use whole hours from 0–168 and minutes/seconds from 0–59.');remaining=(h*3600+m*60+s)*1000;if(!remaining)throw new Error('Choose a duration greater than zero.');}deadline=performance.now()+remaining;}else started=performance.now();running=true;say('Timer running.');draw();}catch(e){say(e.message,true);}};
  $('pause-timer').onclick=()=>{if(!running)return;if(countdown)remaining=Math.max(0,deadline-performance.now());else base+=performance.now()-started;running=false;say('Paused.');draw();};
  $('reset-timer').onclick=()=>{running=false;base=0;remaining=0;say('Timer reset.');draw();};
  const timer=setInterval(draw,100);cleanup=()=>clearInterval(timer);draw();
 }
});
window.addEventListener('pagehide',()=>{const out=$('output');if(out)out.textContent='';for(const input of controls.querySelectorAll('textarea,input[type=text],input[type=date]'))input.value='';});
