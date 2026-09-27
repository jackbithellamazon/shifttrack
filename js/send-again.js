/* ── 2. REPEAT ──────────────────────────────────────────────────────────────
   Items already roll over until ticked. A repeating one comes BACK after it is
   ticked: jb_markDoneItem stamps nextOn, and jb_open re-opens it on the day. */
function jbRepRead(va){
  var k=(document.getElementById('jb-rep-'+va)||{}).value||'once';
  var n=parseInt((document.getElementById('jb-repn-'+va)||{}).value)||1;
  if(k==='once') return null;
  return {k:k, n:Math.max(1,Math.min(60,n))};
}
function jbRepWrite(va,rep){
  var sel=document.getElementById('jb-rep-'+va), nEl=document.getElementById('jb-repn-'+va);
  if(sel) sel.value=(rep&&rep.k)||'once';
  if(nEl) nEl.value=(rep&&rep.n)||1;
  jbRepSync(va);
}
function jbRepSync(va){
  var sel=document.getElementById('jb-rep-'+va), wrap=document.getElementById('jb-repwrap-'+va);
  if(wrap) wrap.style.display=(sel&&sel.value!=='once')?'inline-flex':'none';
}
function jbRepLabel(rep){
  if(!rep||rep.k==='once') return '';
  if(rep.k==='days')  return 'every '+(rep.n===1?'day':rep.n+' days');
  if(rep.k==='weeks') return 'every '+(rep.n===1?'week':rep.n+' weeks');
  return '';
}
/* next due date, as DD/MM/YYYY to match everything else the app stores */
function jbRepNext(rep,fromUK){
  if(!rep||rep.k==='once') return '';
  var p=String(fromUK||ukDateShort()).split('/');
  var d=new Date(+p[2],+p[1]-1,+p[0]);
  d.setDate(d.getDate() + (rep.k==='weeks' ? rep.n*7 : rep.n));
  return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear();
}
function jbDateLTE(a,b){                       // both DD/MM/YYYY
  function k(x){ var q=String(x).split('/'); return q.length===3?(q[2]+q[1]+q[0]):''; }
  var ka=k(a),kb=k(b); return ka&&kb&&ka<=kb;
}
/* re-open anything whose repeat has come round */
function jbRepSweep(o){
  var today=ukDateShort(), woke=0;
  ['items','tasks'].forEach(function(kind){
    (o[kind]||[]).forEach(function(e){
      if(e.done && e.rep && e.nextOn && jbDateLTE(e.nextOn,today)){
        e.done=false; e.addedOn=today; e.nextOn=''; e.doneOn='';
        // clear LAST cycle's results — the real field names, not a `results` object that
        // never existed. Otherwise a repeat shows up already carrying its previous run's
        // leads and time, and Jack reads a stale number as this round's.
        e.resLeads=null; e.resMins=null; e.resSec=null; e.resNote=null;
        woke++;
      }
    });
  });
  return woke;
}

/* ── 3. STOREFRONT MEMORY ───────────────────────────────────────────────────
   He has a storefront system already (storefront_sessions). When he sends a
   storefront he was retyping the name blind — with no idea that one had been
   run six times for nothing. This surfaces what he's sent before, with results. */
var SF_MEM=null;
function sfMemLoad(){
  if(SF_MEM || IS_PREVIEW || !DB_ENABLED) return Promise.resolve(SF_MEM||{});
  return fetchT(SUPABASE_URL+'/rest/v1/storefront_sessions?select=name,leads,seconds&order=created_at.desc&limit=1200',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}})
    .then(function(r){ return r.ok?r.json():[]; })
    .then(function(rows){
      var m={};
      (rows||[]).forEach(function(r){
        var nm=String(r.name||'').trim(); if(!nm) return;
        var k=nm.toLowerCase();
        var e=m[k]||(m[k]={name:nm,runs:0,leads:0,secs:0});
        e.runs++; e.leads+=parseInt(r.leads)||0; e.secs+=parseInt(r.seconds)||0;
      });
      SF_MEM=m; return m;
    }).catch(function(){ SF_MEM={}; return SF_MEM; });
}
function sfMemList(){
  var m=SF_MEM||{};
  return Object.keys(m).map(function(k){return m[k];})
    .sort(function(a,b){ return b.leads-a.leads || b.runs-a.runs; });
}
function sfMemHTML(va){
  var list=sfMemList(); if(!list.length) return '';
  var top=list.slice(0,14);
  var chips=top.map(function(e){
    var hrs=e.secs/3600;
    var per=hrs>0.05?(e.leads/hrs).toFixed(1)+'/hr':(e.leads+' lead'+(e.leads===1?'':'s'));
    var cold=e.runs>=3&&e.leads===0;
    return '<button type="button" class="sfm-chip'+(cold?' cold':'')+'" title="'+escHtml(e.name)+' — '+e.runs+' run'+(e.runs===1?'':'s')+', '+e.leads+' leads"'
      +' onclick="sfMemPick(\''+va+'\',this.dataset.n)" data-n="'+escHtml(e.name)+'">'
      +escHtml(e.name.slice(0,22))+'<i>'+(cold?'0 from '+e.runs:per)+'</i></button>';
  }).join('');
  return '<div class="sfm-wrap" id="sfm-'+va+'">'
    +'<div class="sfm-head">\u{1F3EC} Storefronts you’ve sent before<span>tap to reuse the name · greyed = 3+ runs, no leads</span></div>'
    +'<div class="sfm-chips">'+chips+'</div></div>';
}
function sfMemPick(va,name){
  var nEl=document.getElementById('jb-iname-'+va); if(nEl) nEl.value=name;
  var hid=document.getElementById('jb-itype-'+va); if(hid&&hid.value!=='sf'){
    hid.value='sf';
    var pills=document.querySelectorAll('#jb-editor-'+va+' .jb-typepill');
    pills.forEach(function(b){b.classList.remove('active');});
    if(pills[0]) pills[0].classList.add('active');
  }
  var vEl=document.getElementById('jb-ival-'+va); if(vEl) vEl.focus();
}
/* ── Importance ─────────────────────────────────────────────────────────────
   Replaces the repeat dropdown in the composer row. Medium is the default so the
   common case needs no thought; the VA's list sorts High to the top.
   (Repeat still exists — it lives on PRESETS, where a recurring filter belongs,
   rather than cluttering every one-off send.) */
var JB_PRI=['Urgent','High','Medium','Low'];
function jbPri(va){ try{ return jb_pref(va).pri||'Medium'; }catch(e){ return 'Medium'; } }
function jbPriPickHTML(va){
  var cur=jbPri(va);
  return '<span class="jb-pri-pick" id="jb-pri-'+va+'">'
    + JB_PRI.map(function(p){
        return '<button type="button" class="jbp-b jbp-'+p.toLowerCase()+(cur===p?' on':'')+'" '
          +'onclick="jbPriSet(\''+va+'\',\''+p+'\')">'+p+'</button>';
      }).join('')
    + '</span>';
}
function jbPriSet(va,p){
  try{ var pr=jb_pref(va); pr.pri=p; jb_prefSet(va,pr); }catch(e){}
  var host=document.getElementById('jb-pri-'+va);
  if(host) host.outerHTML=jbPriPickHTML(va);
}
/* ── Auto-naming ────────────────────────────────────────────────────────────
   He shouldn't have to type "Superdrug" when the link already says what it is.
   Blank name → derive it from the link (existing jb_cleanLabel handles Keepa /
   SellerAmp / Amazon and pulls the ASIN out), so the VA still sees something
   readable instead of a raw URL. */
function jbAutoName(t, v){
  try{ return jb_cleanLabel({t:t, v:v, n:''}); }catch(e){ return ''; }
}
/* ── Note snippets ──────────────────────────────────────────────────────────
   "sometimes i write eu + uk multiple times" — one tap to drop a phrase in. */
function jbNoteSnips(){
  try{ var a=getAppSettings().jbNoteSnips; if(Array.isArray(a)) return a; }catch(e){}
  return ['EU + UK','UK only','EU only','High ticket only','Check variations','Skip own-brand','Prime only'];
}
function jbNoteSnipsSet(a){
  try{ var st=getAppSettings(); st.jbNoteSnips=a.slice(0,30); saveAppSettings(st); try{pushSettingsCloud(st);}catch(e){} }catch(e){}
}
function jbNoteSnipsHTML(va){
  var snips=jbNoteSnips();
  return '<div class="jbn-wrap"><div class="jbn-head">✍️ Notes you use a lot<span>tap to add · hold-free, they just append</span></div>'
    +'<div class="jbn-chips">'
    + snips.map(function(x,i){
        return '<span class="jbn-chip" onclick="jbNoteAdd(\''+va+'\','+i+')">'+escHtml(x)
          +'<button class="jbn-x" onclick="event.stopPropagation();jbNoteSnipDel('+i+',\''+va+'\')" title="Remove">✕</button></span>';
      }).join('')
    + '<button class="jbn-add" onclick="jbNoteSnipAdd(\''+va+'\')">+ add</button>'
    +'</div></div>';
}
function jbNoteAdd(va,i){
  var el=document.getElementById('jb-inote-'+va); if(!el) return;
  var snip=jbNoteSnips()[i]; if(!snip) return;
  var cur=(el.value||'').trim();
  el.value = cur ? (cur.replace(/[\s,]+$/,'')+', '+snip) : snip;
  el.focus();
}
function jbNoteSnipAdd(va){
  var v=prompt('Add a note you type a lot:','');
  if(v===null) return;
  v=String(v).trim().slice(0,60); if(!v) return;
  var a=jbNoteSnips().slice(); if(a.indexOf(v)<0) a.unshift(v);
  jbNoteSnipsSet(a); jb_rerender(va);
}
function jbNoteSnipDel(i,va){
  var a=jbNoteSnips().slice(); a.splice(i,1); jbNoteSnipsSet(a); jb_rerender(va);
}
function jbPresetsHTML(va){
  var arr=jbPresets();
  if(!arr.length) return '<div class="jbp-wrap jbp-empty">\u{1F4A1} Fill the box above and hit <b>Save preset</b> \u2014 storefronts, filters and the notes you keep retyping become one tap.</div>';
  var chips=arr.map(function(pr){
    var ICON={sf:'\u{1F3EC}',kpf:'\u{1F3AF}',eu:'\u{1F1EA}\u{1F1FA}',asin:'#',msg:'\u{1F4AC}'};
    var rl=jbRepLabel(pr.rep);
    return '<span class="jbp-chip" onclick="jbPresetApply(\''+va+'\',\''+pr.id+'\')" title="'+escHtml((pr.v||'')+(pr.r?' \u2014 '+pr.r:''))+'">'
      +'<i class="jbp-i">'+(ICON[pr.t]||'\u{1F4AC}')+'</i>'
      +'<b>'+escHtml(pr.label)+'</b>'
      +(rl?'<em>'+rl+'</em>':'')
      +'<button class="jbp-x" onclick="event.stopPropagation();jbPresetDel(\''+va+'\',\''+pr.id+'\')" title="Delete preset">\u2715</button>'
      +'</span>';
  }).join('');
  return '<div class="jbp-wrap"><div class="jbp-head">\u26A1 Presets<span>tap one to load it into the box</span></div>'
    +'<div class="jbp-chips">'+chips+'</div></div>';
}
function jb_editorHTML(va){
  var b=jb_get(va);
  var o=jb_open(va);
  var openTasks=(o.tasks||[]).filter(function(t){return !t.done;}).sort(jb_byAge);
  var openItems=(o.items||[]).filter(function(it){return !it.done;}).sort(jb_byAge);
  var oldestDays=0; openTasks.concat(openItems).forEach(function(x){ var d=jb_carryDays(x.addedOn); if(d>oldestDays) oldestDays=d; });
  var doneCount=(o.tasks||[]).filter(function(t){return t.done;}).length+(o.items||[]).filter(function(it){return it.done;}).length;
  var carryCount=openTasks.filter(function(t){return jb_isCarried(t.addedOn);}).length+openItems.filter(function(it){return jb_isCarried(it.addedOn);}).length;
  var taskRows=openTasks.map(function(t){
    return '<div class="jb-orow"><div class="jb-orow-top">'
      +'<span class="jb-ichip" style="color:#10d99a;">&#128221; Task</span>'
      +'<b class="jb-oname">'+String(t.name).replace(/</g,'&lt;')+'</b>'
      +jb_carryBadge(t.addedOn)
      +'<button class="jb-task-x" onclick="jb_delTask(\''+va+'\',\''+t.iid+'\')">✕</button>'
      +'</div></div>';
  }).join('');
  var outstanding=taskRows+jb_itemsRows(va);
  if(!openTasks.length && !openItems.length) outstanding='<div class="jb-empty">Nothing outstanding — everything you\'ve sent has been ticked off. ✓</div>';
  return '<div class="jb-editor" id="jb-editor-'+va+'">'
    +'<h4>&#9993;&#65039; From Jack &rarr; '+vaDisp(va)+'</h4>'
    +'<div class="jb-sub">Send storefronts, filters, ASINs and tasks below — <b>each one stays on '+vaDisp(va)+'\'s list every day until they tick it off</b>, and their results (leads + time) come back here.</div>'
    +'<div class="jb-composer">'
    +jb_secLabel('&#10133; Send '+vaDisp(va)+' a mini task','margin:0 0 9px;')
    +(function(){
      var pref=jb_pref(va);
      function pill(t,label){ return '<button type="button" class="jb-typepill'+(pref.t===t?' active':'')+'" onclick="jb_pickType(\''+va+'\',\''+t+'\',this)">'+label+'</button>'; }
      return '<input type="hidden" id="jb-itype-'+va+'" value="'+pref.t+'">'
      +'<div class="jb-typepills">'
        +pill('sf','&#127978; Storefront')
        +pill('kpf','&#127919; KPF filter')
        +pill('eu','\u{1F1EA}\u{1F1FA} EU sheet')
        +pill('euasin','\u{1F1EA}\u{1F1FA} EU ASINs')
        +pill('asin','# ASIN')
        +pill('msg','&#128172; Message')
      +'</div>'
      +'<input id="jb-ival-'+va+'" class="jb-bigfield" placeholder="'+jb_placeholder(pref.t)+'" onkeydown="if(event.key===\'Enter\')jb_addItem(\''+va+'\')">'
      +'<div class="jb-add-row jb-item-add2">'
      +'<input id="jb-iname-'+va+'" class="jb-iname" placeholder="&#127991;&#65039; Name (optional &mdash; named from the link if blank)" onkeydown="if(event.key===\'Enter\')jb_addItem(\''+va+'\')">'
      +'<input id="jb-inote-'+va+'" class="jb-ireason" placeholder="&#128172; Why / what to focus on (optional)" onkeydown="if(event.key===\'Enter\')jb_addItem(\''+va+'\')">'
      +'</div>'
      +'<div class="jb-item-opts"><label class="jb-toggle"><input type="checkbox" id="jb-itimer-'+va+'" '+(pref.timer?'checked':'')+' onchange="jb_prefTgl(\''+va+'\')"> &#9201; Time it</label>'
      +'<label class="jb-toggle"><input type="checkbox" id="jb-ileads-'+va+'" '+(pref.leads?'checked':'')+' onchange="jb_prefTgl(\''+va+'\')"> &#128200; Must log leads</label>'
      +jbPriPickHTML(va)
      +'<button class="jb-preset-save" onclick="jbPresetSave(\''+va+'\')" title="Save this as a reusable preset">&#128190; Save preset</button>'
      +'<button class="jb-send-both" title="Adds the same task to both VAs\u2019 lists \u2014 they each get their own copy to tick off" '
        +'onclick="jb_addItem(\''+va+'\',true)">&#10148; Both</button>'
      +'<button class="jb-send-btn" onclick="jb_addItem(\''+va+'\')">&#10148; Send to '+vaDisp(va)+'</button></div>'
      +jbNoteSnipsHTML(va)
      +jbPresetsHTML(va)
      +(pref.t==='sf'?sfMemHTML(va):'')
      +jbFilterPickHTML(va);
    })()
    +'</div>'
    +jb_secLabel('&#128203; Outstanding &mdash; rolls over until ticked'
        +(carryCount?' <span class="jb-seccount '+(oldestDays>=3?'overdue':'carry')+'">'+(oldestDays>=3?'&#9888; ':'&#8635; ')+carryCount+' carried'+(oldestDays?' · oldest '+oldestDays+'d':'')+'</span>':''),'margin-top:16px;')
    +'<div class="jb-outstanding">'+outstanding+'</div>'
    +jb_doneRows(va)
    +jb_secLabel('&#128221; Quick one-off task (plain text, no link)','margin-top:16px;')
    +'<div class="jb-add-row"><input id="jb-task-'+va+'" placeholder="e.g. Check the new Ninja brand promo" onkeydown="if(event.key===\'Enter\')jb_addTask(\''+va+'\')"><button class="jb-add-btn" onclick="jb_addTask(\''+va+'\')">+ Add</button></div>'
    +jb_secLabel('&#128204; Notes &mdash; week ahead (shows all week)','margin-top:16px;')
    +'<textarea id="jb-week-'+va+'" style="min-height:48px;margin-bottom:12px;" placeholder="e.g. Focus retailer this week: Argos clearance. Newsletter Tue/Thu.">'+String((jb_getWeek(va).note||'')).replace(/</g,'&lt;')+'</textarea>'
    +jb_secLabel('&#128204; Today\'s POA note &mdash; plain text only (send links via the mini-task box above)'
        +'<button class="jb-clear-btn" onclick="jb_clearPoa(\''+va+'\')">✕ Clear</button>')
    +'<textarea id="jb-poa-'+va+'" placeholder="e.g. Run Shark on Product Finder. Check the Argos promo.">'+String(b.poa||'').replace(/</g,'&lt;')+'</textarea>'
    +'<button class="jb-save-btn" onclick="jb_savePoa(\''+va+'\')">Save brief ✓</button>'
    +'</div>';
}
// "How it went" — completed items with the VA's logged results (leads / time / note)
function jb_fmtMins(m){ if(!m) return null; var h=Math.floor(m/60), mm=m%60; return (h?h+'h ':'')+(mm?mm+'m':(h?'':'0m')); }
function jb_doneRows(va){
  var o=jb_open(va);
  var done=(o.items||[]).concat(o.tasks||[]).filter(function(x){return x.done;});
  if(!done.length) return '';
  done.sort(function(a,b){ return jb_ageNum(b.doneOn||b.addedOn)-jb_ageNum(a.doneOn||a.addedOn); });
  var rows=done.slice(0,6).map(function(x){
    var ty=JB_ITYPES[x.t]||(x.name?{0:'\u{1F4DD}',1:'Task',2:'#10d99a'}:JB_ITYPES.msg);
    var lbl=x.name||jb_cleanLabel(x);
    var res=[];
    if(x.resLeads!==null&&x.resLeads!==undefined) res.push('<span class="jb-res leads">&#128200; '+x.resLeads+' lead'+(x.resLeads===1?'':'s')+'</span>');
    var t=jb_fmtMins(x.resMins)||(x.resSec?sfFmt(x.resSec):null);
    if(t) res.push('<span class="jb-res">&#9201; '+t+'</span>');
    if(x.resNote) res.push('<span class="jb-res note">&#128172; '+String(x.resNote).replace(/</g,'&lt;').slice(0,90)+'</span>');
    if(!res.length) res.push('<span class="jb-res">ticked off</span>');
    return '<div class="jb-orow done"><div class="jb-orow-top">'
      +'<span class="jb-ichip" style="color:'+ty[2]+';">'+ty[0]+' '+ty[1]+'</span>'
      +'<b class="jb-oname">'+String(lbl).replace(/</g,'&lt;')+'</b>'
      +'<span class="jb-done-on">&#10003; '+(x.doneOn||'')+'</span>'
      +'</div><div class="jb-resrow">'+res.join('')+'</div></div>';
  }).join('');
  return jb_secLabel('&#128202; Results &mdash; how each one went','margin-top:16px;')
    +'<div class="jb-outstanding jb-done-list">'+rows+'</div>';
}
var JB_ITYPES={sf:['\u{1F3EC}','Storefront','var(--accent-2)'],kpf:['\u{1F3AF}','KPF filter','#18c8f0'],eu:['\u{1F1EA}\u{1F1FA}','EU sheet','#4c8dff'],euasin:['\u{1F1EA}\u{1F1FA}','EU ASINs','#7c5cff'],asin:['#','ASIN','#f5a524'],msg:['\u{1F4AC}','Do this','#10d99a']};
function jb_itemsRows(va){
  var items=(jb_open(va).items||[]).filter(function(it){return !it.done;}).sort(jb_byAge);
  if(!items.length) return '';
  return items.map(function(it){
    var ty=JB_ITYPES[it.t]||JB_ITYPES.msg;
    var flags=(it.timer?'<span class="jb-iflag" title="Timed">&#9201;</span>':'')+(it.leads?'<span class="jb-iflag" title="Must log leads">&#128200;</span>':'');
    var lbl=jb_cleanLabel(it);
    var reason=it.r?'<div class="jb-oreason">&#128172; '+String(it.r).replace(/</g,'&lt;')+'</div>':'';
    return '<div class="jb-orow"><div class="jb-orow-top">'
      +'<span class="jb-ichip" style="color:'+ty[2]+';">'+ty[0]+' '+ty[1]+'</span>'
      +'<b class="jb-oname">'+String(lbl).replace(/</g,'&lt;')+'</b>'
      +jb_carryBadge(it.addedOn)
      +'<span class="jb-oflags">'+flags+'</span>'
      +'<button class="jb-task-x" onclick="jb_delItem(\''+va+'\',\''+it.iid+'\')">✕</button>'
      +'</div>'+reason+'</div>';
  }).join('');
}
/* Sticky send preferences — the chosen type + toggles SURVIVE each send (bulk sending!)
   and only reset to defaults when Jack leaves the VA tab (mgr_switchTab clears them). */
function jb_pref(va){
  window._jbSendPrefs=window._jbSendPrefs||{};
  if(!window._jbSendPrefs[va]) window._jbSendPrefs[va]={t:'sf',timer:true,leads:true};
  return window._jbSendPrefs[va];
}
function jb_placeholder(t){
  return t==='sf'?'Paste the storefront link…'
    : t==='kpf'?'Paste the KPF / SellerAmp filter link…'
    : t==='eu'?'Paste the EU sheet link / type the brand…'
    : t==='euasin'?'Paste the KPF link, or a whole list of EU ASINs (B0… B0… B0…)'
    : t==='asin'?'Paste or type the ASIN (B0…)'
    : 'Type the message / instruction…';
}
function jb_prefTgl(va){
  var p=jb_pref(va);
  var tm=document.getElementById('jb-itimer-'+va), ld=document.getElementById('jb-ileads-'+va);
  if(tm) p.timer=tm.checked; if(ld) p.leads=ld.checked;
}
function jb_typeDefaults(va){
  var p=jb_pref(va);
  var tm=document.getElementById('jb-itimer-'+va), ld=document.getElementById('jb-ileads-'+va);
  if(tm) tm.checked=p.timer;
  if(ld) ld.checked=p.leads;
}
// pick a mini-task type: remember it (sticky), highlight the pill, tune the placeholder — toggles stay as set
function jb_pickType(va,t,el){
  jb_pref(va).t=t;
  var h=document.getElementById('jb-itype-'+va); if(h) h.value=t;
  try{ el.parentElement.querySelectorAll('.jb-typepill').forEach(function(b){ b.classList.toggle('active',b===el); }); }catch(e){}
  var iv=document.getElementById('jb-ival-'+va);
  if(iv) iv.placeholder=jb_placeholder(t);
}
/* Pick one of your saved filters straight into the composer — no copy-pasting a
   Keepa link out of the Filters tab every time you set a POA. */
function jbFilterPickHTML(va){
  var all=[];
  try{ all=getSavedFilters().filter(function(f){return !f.archived && f.url;}); }catch(e){}
  if(!all.length) return '';
  var q=(window._jbFq&&window._jbFq[va])||'';
  var ql=q.toLowerCase();
  var hits=q?all.filter(function(f){ return ((f.title||'')+' '+(f.tag||'')+' '+(f.note||'')).toLowerCase().indexOf(ql)>=0; }):all;
  var show=hits.slice(0,6);
  var opts=show.map(function(f){
    return '<button class="jbf-opt" onclick="jbFilterPick(\''+va+'\',\''+f.id+'\')">'
      +'<span class="jbf-tag t-'+(f.tag||'KPF')+'">'+(f.tag||'KPF')+'</span>'
      +'<span class="jbf-name">'+escHtml(f.title||'Untitled')+'</span></button>';
  }).join('');
  var open=!!(window._jbFopen&&window._jbFopen[va]);
  return '<div class="jbf-wrap'+(open?' open':'')+'">'
    +'<button type="button" class="jbf-toggle" onclick="jbFilterToggle(\''+va+'\')">'
      +'<span class="jbf-caret">'+(open?'▾':'▸')+'</span> 🔎 or pick from your <b>'+all.length+'</b> saved filters</button>'
    +(open?('<div class="jbf-body">'
      +'<input class="jbf-search" id="jbf-q-'+va+'" value="'+escHtml(q)+'" placeholder="Search your filters…" oninput="jbFilterSearch(\''+va+'\',this.value)">'
      +'<div class="jbf-opts">'+(opts||'<span class="jbf-none">nothing matches</span>')
        +(hits.length>show.length?'<span class="jbf-more">+'+(hits.length-show.length)+' more — keep typing</span>':'')+'</div>'
      +'</div>'):'')
    +'</div>';
}
function jbFilterToggle(va){
  window._jbFopen=window._jbFopen||{};
  window._jbFopen[va]=!window._jbFopen[va];
  var w=document.querySelector('.jbf-wrap'); if(!w) return;
  w.outerHTML=jbFilterPickHTML(va);
  var i=document.getElementById('jbf-q-'+va); if(i) i.focus();
}
function jbFilterSearch(va,v){
  window._jbFq=window._jbFq||{}; window._jbFq[va]=v;
  var host=document.querySelector('.jbf-wrap'); // re-render just this block, keep focus
  var wrap=document.getElementById('jbf-q-'+va);
  if(!wrap) return;
  var parent=wrap.closest('.jbf-wrap'); if(!parent) return;
  parent.outerHTML=jbFilterPickHTML(va);
  var again=document.getElementById('jbf-q-'+va);
  if(again){ again.focus(); again.setSelectionRange(again.value.length,again.value.length); }
}
function jbFilterPick(va,id){
  var f=null;
  try{ f=getSavedFilters().filter(function(x){return x.id===id;})[0]; }catch(e){}
  if(!f) return;
  var kind=(f.tag==='Storefront')?'sf':'kpf';
  // drive the real type pill so its handler updates state + placeholder too
  var pillWrap=document.querySelector('.jb-typepills');
  if(pillWrap){
    var btn=[].filter.call(pillWrap.querySelectorAll('.jb-typepill'),function(b){
      return String(b.getAttribute('onclick')||'').indexOf("'"+kind+"'")>=0; })[0];
    if(btn) btn.click();
  }
  var t=document.getElementById('jb-itype-'+va); if(t) t.value=kind;
  var val=document.getElementById('jb-ival-'+va); if(val) val.value=f.url||'';
  var nm=document.getElementById('jb-iname-'+va); if(nm && !nm.value.trim()) nm.value=f.title||'';
  var nt=document.getElementById('jb-inote-'+va); if(nt && !nt.value.trim() && f.note) nt.value=f.note;
  try{ window._jbFopen=window._jbFopen||{}; window._jbFopen[va]=false;
       var w=document.querySelector('.jbf-wrap'); if(w) w.outerHTML=jbFilterPickHTML(va); }catch(e){}
  showToast('“'+(f.title||'Filter')+'” loaded — hit Send to '+vaDisp(va));
}
function jb_addItem(va,alsoTo){
  var tEl=document.getElementById('jb-itype-'+va), vEl=document.getElementById('jb-ival-'+va), nEl=document.getElementById('jb-iname-'+va), rEl=document.getElementById('jb-inote-'+va);
  var v=(vEl&&vEl.value||'').trim(); if(!v){ showToast('Paste a link / ASIN / message first',true); return; }
  var t=tEl?tEl.value:'msg';
  if(t!=='euasin' && /^B0[0-9A-Z]{8}$/i.test(v)) t='asin';    // auto-detect a pasted ASIN whatever the dropdown says
                                                              // (but never override a deliberate EU ASINs pick)
  var timer=!!(document.getElementById('jb-itimer-'+va)||{}).checked;
  var wantLeads=!!(document.getElementById('jb-ileads-'+va)||{}).checked;
  var poaEl=document.getElementById('jb-poa-'+va); if(poaEl){ var b=jb_get(va); b.poa=poaEl.value; jb_set(va,b); }
  var typed=(nEl&&nEl.value||'').trim();
  var name=typed||jbAutoName(t,v);          // blank name → derive it from the link
  var pri=jbPri(va);
  var note=(rEl&&rEl.value||'').trim();
  /* Each VA gets a SEPARATE copy — own iid, own done/timer/leads. Sharing one item
     would mean whoever ticks it first clears it off the other's list too. */
  var targets=[va];
  if(alsoTo) ['Mera','Suz'].forEach(function(x){ if(x!==va) targets.push(x); });
  targets.forEach(function(tv){
    var o=jb_open(tv); o.items.push({iid:jb_uid(),t:t,v:v,n:name,r:note,
      timer:timer?1:0,leads:wantLeads?1:0,pri:pri,done:false,addedOn:ukDateShort(),rep:null,nextOn:''});
    jb_setOpen(tv,o);
  });
  jb_rerender(va);
  var who=targets.length>1 ? targets.map(function(x){ return vaDisp(x); }).join(' and ') : vaDisp(va);
  showToast('Sent to '+who+' \u2713'+(pri==='High'?' \u2014 flagged HIGH':'')
    +(pri==='Urgent'?' \u2014 URGENT banner on their shift':'')
    +(typed?'':' \u2014 named \u201c'+String(name).slice(0,28)+'\u201d'));
}
function jb_delItem(va,iid){
  var o=jb_open(va);
  var it=(o.items||[]).filter(function(x){return x.iid===iid;})[0];
  var nm=it?(it.n||jb_cleanLabel(it)):'this item';
  if(!confirm('Remove "'+String(nm).slice(0,60)+'" from '+vaDisp(va)+'’s list?')) return;
  o.items=o.items.filter(function(x){return x.iid!==iid;}); jb_setOpen(va,o,iid); jb_rerender(va);
}
function jb_rerender(va){var y=window.pageYOffset||document.documentElement.scrollTop||0;var host=document.getElementById('jb-editor-'+va);if(host)host.outerHTML=jb_editorHTML(va);var r=function(){window.scrollTo(0,y);};requestAnimationFrame(r);setTimeout(r,60);}
function jb_addTask(va){
  var inp=document.getElementById('jb-task-'+va);if(!inp)return;
  var name=inp.value.trim();if(!name){showToast('Type a task first',true);return;}
  var poaEl=document.getElementById('jb-poa-'+va);
  if(poaEl){ var b=jb_get(va); b.poa=poaEl.value; jb_set(va,b); }
  var pri=jbPri(va);
  var o=jb_open(va); o.tasks.push({iid:jb_uid(),name:name,pri:pri,done:false,addedOn:ukDateShort(),rep:null,nextOn:''});
  jb_setOpen(va,o);jb_rerender(va);
  showToast('Task added for '+vaDisp(va)+' \u2713'+(pri==='High'?' \u2014 flagged HIGH':''));
}
function jb_delTask(va,iid){
  var o=jb_open(va);
  var t=(o.tasks||[]).filter(function(x){return x.iid===iid;})[0];
  if(!confirm('Remove task "'+String(t?t.name:'this task').slice(0,60)+'" from '+vaDisp(va)+'’s list?')) return;
  o.tasks=o.tasks.filter(function(x){return x.iid!==iid;});jb_setOpen(va,o,iid);jb_rerender(va);
}
function jb_clearPoa(va){
  var b=jb_get(va); b.poa=''; jb_set(va,b);
  var el=document.getElementById('jb-poa-'+va); if(el) el.value='';
  showToast('POA note cleared ✓');
}
function jb_savePoa(va){
  var poaEl=document.getElementById('jb-poa-'+va);
  var b=jb_get(va); if(poaEl) b.poa=poaEl.value;
  jb_set(va,b);
  var wkEl=document.getElementById('jb-week-'+va);
  if(wkEl) jb_setWeek(va,wkEl.value);
  // catch link/filter blobs pasted into the plain-text note
  if(/%22|%7B|%3A%22/.test(b.poa||'')||/https?:\/\/\S{60,}/.test(b.poa||'')){
    showToast('⚠️ That looks like a link/filter — send those via the mini-task box so '+vaDisp(va)+' gets a proper task with a timer', true);
  } else {
    showToast('Brief saved — '+vaDisp(va)+' will see it on shift ✓');
  }
}
/* Jack's editor appears at the top of the Mera/Suz tabs */
(function(){
  function hook(){
    if(typeof window.mgr_renderVA!=='function')return setTimeout(hook,400);
    var _rv=window.mgr_renderVA;
    window.mgr_renderVA=function(vaName,cid){
      _rv(vaName,cid);
      try{
        if(vaName==='Mera'||vaName==='Suz'){
          var el=document.getElementById(cid);
          if(el) el.insertAdjacentHTML('afterbegin', jb_editorHTML(vaName));
        }
      }catch(e){}
    };
  }
  hook();
})();
/* Overview tie-in: leads snapshot strip (click → Leads view) */
