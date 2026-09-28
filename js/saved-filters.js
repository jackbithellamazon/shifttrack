/* ══════════ SAVED FILTERS — Jack's KPF/Keepa filter library (replaces the Discord channel) ══════════
   Jack adds/renames them in Settings; VAs open them from a searchable panel on their shift.
   Storage: own `saved_filters` Supabase table (scales to 1000s), cached locally so the panel
   opens instantly offline. Falls back to the old app_settings blob until the SQL is run. */
var SFLT_TABLE_OK=null;                                  // null = unknown, true/false once probed
function sfltCacheGet(){ try{ var a=JSON.parse(lsGet('bdl_saved_filters')||'null'); return Array.isArray(a)?a:null; }catch(e){ return null; } }
function sfltCacheSet(arr){ try{ lsPut('bdl_saved_filters',JSON.stringify(arr||[])); }catch(e){} }
function sfltHeaders(extra){ var h={'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY}; if(extra) for(var k in extra) h[k]=extra[k]; return h; }

/* ONE-TIME RESET: testing wrote filters into the shared settings row, which then
   synced out to every device. The cloud has been cleared and Jack had no real filters
   of his own yet, so each device wipes its local filter cache ONCE and then trusts the
   cloud from there. The flag makes sure this can never touch filters he adds later. */
(function(){
  try{
    if(!lsGet('bdl_sflt_reset_1')){
      lsPut('bdl_sflt_reset_1','1');
      try{ lsDrop('bdl_saved_filters'); }catch(e){}
      try{ var st=JSON.parse(lsGet('shifttrack_app_settings_v2')||'{}');
           if(st && st.savedFilters){ st.savedFilters=[]; lsPut('shifttrack_app_settings_v2',JSON.stringify(st)); } }catch(e){}
    }
  }catch(e){}
})();
(function(){
  function purge(){
    try{
      var isTest=function(f){ return /^Filter number \d+$/.test(String((f&&f.title)||'')); };
      var c=(typeof sfltCacheGet==='function')?sfltCacheGet():null;
      if(c&&c.length&&c.some(isTest)){ var k=c.filter(function(f){return !isTest(f);}); sfltCacheSet(k); }
      var st=JSON.parse(lsGet('shifttrack_app_settings_v2')||'{}');
      if(Array.isArray(st.savedFilters)&&st.savedFilters.some(isTest)){
        st.savedFilters=st.savedFilters.filter(function(f){return !isTest(f);});
        lsPut('shifttrack_app_settings_v2',JSON.stringify(st));
      }
    }catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){setTimeout(purge,400);});
  else setTimeout(purge,400);
})();
/* ── Filters linked to a VA's POA ──────────────────────────────────────────
   A filter can be assigned to Mera, Suz or both. Assigned filters become real
   tasks on that VA's shift (Open + timer + log leads), sitting with the Jack POA
   block, and ticking one logs it against the filter so the Filters tab fills in. */
/* The POA task a filter belongs to already carries the frequency — daily filter
   POAs run every shift, the Tue/Thu ones only appear on those days. So a filter
   assigned to a slot inherits that rhythm for free. */
var SFLT_SLOTS=[
  {k:'daily', label:'Every day', task:{Mera:'kpf-daily', Suz:'suz-kpf-daily'}},
  {k:'tue',   label:'Tuesdays',  task:{Mera:'kpf-tue'}},
  {k:'thu',   label:'Thursdays', task:{Mera:'kpf-thu'}}
];
/* The five working days. VAs work Mon-Fri, so there is no Sat/Sun. */
var SFLT_DAYS=[
  {k:'mon',label:'Mon',full:'Mondays',dow:1},
  {k:'tue',label:'Tue',full:'Tuesdays',dow:2},
  {k:'wed',label:'Wed',full:'Wednesdays',dow:3},
  {k:'thu',label:'Thu',full:'Thursdays',dow:4},
  {k:'fri',label:'Fri',full:'Fridays',dow:5}
];
var SFLT_ALLDAYS=['mon','tue','wed','thu','fri'];
/* Read shim: new filters carry days[]; ones saved before this carry the old
   slot/slots keys, which map cleanly onto weekdays. Nothing is migrated on disk,
   so a failed write can never lose a filter. */
function sfltDays(f){
  // an EXPLICIT empty array means "library only" — never fall through to legacy
  if(f && Array.isArray(f.days)) return f.days.slice();
  var legacy=[];
  if(f && Array.isArray(f.slots) && f.slots.length) legacy=f.slots.slice();
  else if(f && f.slot) legacy=[f.slot];
  if(!legacy.length) return SFLT_ALLDAYS.slice();
  if(legacy.indexOf('daily')>=0) return SFLT_ALLDAYS.slice();
  var out=legacy.filter(function(k){ return SFLT_ALLDAYS.indexOf(k)>=0; });
  return out.length?out:SFLT_ALLDAYS.slice();
}
function sfltHasDay(f,k){ return sfltDays(f).indexOf(k)>=0; }
function sfltRunsToday(f){
  var t=sfltTodayKey();
  return !!t && sfltDays(f).indexOf(t)>=0;
}
function sfltOnPoa(f){ return sfltDays(f).length>0; }
function sfltDaysLabel(f){
  var d=sfltDays(f);
  if(!d.length) return 'saved filters only — not on a POA';
  if(d.length===5) return 'Every day';
  var lbls=SFLT_DAYS.filter(function(x){ return d.indexOf(x.k)>=0; }).map(function(x){ return x.label; });
  return lbls.join(', ');
}
function sfltToggleDay(id,k){
  var arr=getSavedFilters(); var f=arr.filter(function(x){return x.id===id;})[0]; if(!f) return;
  var d=sfltDays(f), i=d.indexOf(k);
  if(i>=0) d.splice(i,1); else d.push(k);
  // clearing every day is ALLOWED and means "just keep it in her saved filters"
  d=SFLT_ALLDAYS.filter(function(x){ return d.indexOf(x)>=0; });   // Mon..Fri order
  f.days=d; delete f.slot; delete f.slots;
  saveSavedFilters(arr); sfltMgrRepaint();
  showToast('"'+(f.title||'Filter')+'" runs '+sfltDaysLabel(f));
}
function sfltSetAllDays(id,on){
  var arr=getSavedFilters(); var f=arr.filter(function(x){return x.id===id;})[0]; if(!f) return;
  f.days=on?SFLT_ALLDAYS.slice():[]; delete f.slot; delete f.slots;
  saveSavedFilters(arr); sfltMgrRepaint();
  showToast('"'+(f.title||'Filter')+'" runs '+sfltDaysLabel(f));
}
/* five day buttons + an all/none shortcut */
function sfltDayChipsHTML(sel,onclickTpl,allTpl){
  var all=sel.length===5;
  return '<span class="sflt-days">'
    +(allTpl?'<button type="button" class="sflt-day sflt-all'+(all?' on':'')+'" title="'
        +(all?'Clear back to one day':'Run it every working day')+'" onclick="'+allTpl.replace('{ON}',all?'false':'true')+'">Mon–Fri</button>':'')
    +SFLT_DAYS.map(function(d){
      var on=sel.indexOf(d.k)>=0;
      return '<button type="button" class="sflt-day'+(on?' on':'')+'" data-day="'+d.k+'"'
        +' title="'+d.full+'" onclick="'+onclickTpl.replace('{K}',d.k)+'">'+d.label+'</button>';
    }).join('')+'</span>';
}
/* Which POA task hosts this VA's filters TODAY: prefer a day-specific KPF task if
   their ticklist has one, else the daily KPF task. */
function sfltHostTaskIds(va){
  var ids=[];
  SFLT_SLOTS.forEach(function(sl){ if(sl.task[va]) ids.push(sl.task[va]); });
  return ids;
}
function sfltTodayKey(){
  var now=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
  var m=SFLT_DAYS.filter(function(d){ return d.dow===now.getDay(); })[0];
  if(m) return m.k;
  return 'mon';        // Sat/Sun: no shift is scheduled, so preview the coming Monday
}
function sfltIsWeekend(){
  var d=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'})).getDay();
  return d===0||d===6;
}
function sfltSlotKeys(f){
  if(f && Array.isArray(f.slots) && f.slots.length) return f.slots.slice();
  if(f && f.slot) return [f.slot];
  return ['daily'];
}
function sfltHasSlot(f,k){ return sfltSlotKeys(f).indexOf(k)>=0; }
function sfltSlot(f){ var k=sfltSlotKeys(f)[0]; return SFLT_SLOTS.filter(function(s){return s.k===k;})[0]||SFLT_SLOTS[0]; }
function sfltSlotLabel(f){
  var ks=sfltSlotKeys(f);
  var lbls=SFLT_SLOTS.filter(function(s){ return ks.indexOf(s.k)>=0; }).map(function(s){ return s.label; });
  if(!lbls.length) return SFLT_SLOTS[0].label;
  if(lbls.length===1) return lbls[0];
  return lbls.slice(0,-1).join(', ')+' and '+lbls[lbls.length-1];
}
function sfltToggleSlot(id,k){
  var arr=getSavedFilters(); var f=arr.filter(function(x){return x.id===id;})[0]; if(!f) return;
  var ks=sfltSlotKeys(f), i=ks.indexOf(k);
  if(i>=0){ ks.splice(i,1); if(!ks.length) ks=['daily']; }      // never leave it on no day at all
  else if(k==='daily') ks=['daily'];                            // daily replaces the named days
  else { ks=ks.filter(function(x){return x!=='daily';}); ks.push(k); }
  ks=SFLT_SLOTS.map(function(s){return s.k;}).filter(function(x){ return ks.indexOf(x)>=0; });  // keep order
  f.slots=ks; delete f.slot;
  saveSavedFilters(arr); sfltMgrRepaint();
  showToast('"'+(f.title||'Filter')+'" now runs '+sfltDaysLabel(f));
}
/* the day chips, shared by the manager row and the add form */
function sfltSlotChipsHTML(sel,onclickTpl){
  return '<span class="sflt-days">'+SFLT_SLOTS.map(function(sl){
    var on=sel.indexOf(sl.k)>=0;
    return '<button type="button" class="sflt-day'+(on?' on':'')+'" data-slot="'+sl.k+'"'
      +' title="'+sl.label+'" onclick="'+onclickTpl.replace('{K}',sl.k)+'">'
      +(sl.k==='daily'?'Every day':sl.label.replace(/s$/,''))+'</button>';
  }).join('')+'</span>';
}
/* every filter this VA should run on the POA task with this id, today */
function sfltTaskIds(f){ return Array.isArray(f&&f.taskIds)?f.taskIds:[]; }
/* HOW a filter shows up on the VA's list:
     'in'  -> nested inside the task it is pinned to (a link on that task)
     'own' -> its own task row, sitting directly after the task it is pinned to
   Jack: "put these into where I want them on their task list". */
function sfltMode(f){ return (f&&f.mode==='own')?'own':'in'; }
function sfltWhereLabel(f){
  var ids=sfltTaskIds(f);
  if(!ids.length) return 'by day';
  var nm=null;
  ['Mera','Suz'].forEach(function(va){
    try{ (getTaskTemplateSource(va)||[]).forEach(function(t){ if(!nm && t.id===ids[0]) nm=t.name; }); }catch(e){}
  });
  var base=nm?String(nm).replace(/\s*[-–(].*$/,'').trim().slice(0,20):(ids.length+' tasks');
  return (sfltMode(f)==='own'?'after ':'in ')+base+(ids.length>1?' +'+(ids.length-1):'');
}
function sfltSetMode(id,m){
  var arr=getSavedFilters(); var f=arr.filter(function(x){return x.id===id;})[0]; if(!f) return;
  f.mode=(m==='own')?'own':'in'; saveSavedFilters(arr);
  try{ sfltTaskPickBody(); }catch(e){}
}
function sfltForTask(va,taskId){
  return getSavedFilters().filter(function(f){
    if(f.archived||!f.url) return false;
    // explicit link to this exact task wins — survives renaming/reordering the ticklist
    if(sfltTaskIds(f).indexOf(taskId)>=0) return sfltMode(f)!=='own';
    // legacy: assigned to the VA with a day-slot that maps to this task
    if(!sfltHasVA(f,va)) return false;
    // does it run TODAY, and is this the task that hosts this VA's filters today?
    if(!sfltRunsToday(f)) return false;
    var today=sfltTodayKey();
    var hosts=sfltHostTaskIds(va);
    if(hosts.indexOf(taskId)<0) return false;
    // a day-specific KPF task wins over the daily one when both are in the ticklist
    var dayTask=(SFLT_SLOTS.filter(function(x){return x.k===today;})[0]||{}).task;
    var pref=dayTask&&dayTask[va];
    if(pref && hosts.indexOf(pref)>=0) return taskId===pref;
    return taskId===(SFLT_SLOTS[0].task[va]);
  }).sort(function(a,b){ return (a.pos||0)-(b.pos||0); });
}
/* link/unlink a filter to a specific ticklist task */
function sfltLinkTask(filterId,taskId){
  var arr=getSavedFilters(); var f=arr.filter(function(x){return x.id===filterId;})[0];
  if(!f||!taskId) return;
  var ids=sfltTaskIds(f).slice();
  if(ids.indexOf(taskId)<0) ids.push(taskId);
  f.taskIds=ids; saveSavedFilters(arr);
}
function sfltUnlinkTask(filterId,taskId){
  var arr=getSavedFilters(); var f=arr.filter(function(x){return x.id===filterId;})[0];
  if(!f) return;
  f.taskIds=sfltTaskIds(f).filter(function(t){return t!==taskId;});
  saveSavedFilters(arr);
  mgr_repaintTicklist();
}
function sfltFiltersForTaskId(taskId){
  return getSavedFilters().filter(function(f){ return sfltTaskIds(f).indexOf(taskId)>=0; });
}
/* the "saved filters on this task" strip inside a ticklist editor row */
function sfltTaskStripHTML(taskId,i){
  var linked=sfltFiltersForTaskId(taskId);
  var pool=getSavedFilters().filter(function(f){ return !f.archived && f.url; }).length;
  var chips=linked.map(function(f){
    var own=sfltMode(f)==='own';
    return '<span class="tf-chip"><span class="tf-tag t-'+(f.tag||'KPF')+'">'+(f.tag||'KPF')+'</span>'
      +'<span class="tf-name">'+escHtml(f.title||'Filter')+'</span>'
      +'<button class="tf-mode'+(own?' own':'')+'" title="'
        +(own?'Its own task row, straight after this one — click to nest it inside instead'
             :'A link inside this task — click to make it its own task row instead')+'" '
      +'onclick="sfltSetMode(\''+f.id+'\',\''+(own?'in':'own')+'\');mgr_repaintTicklist();">'
      +(own?'own row':'inside')+'</button>'
      +'<button class="tf-x" title="Unlink" onclick="sfltUnlinkTask(\''+f.id+'\',\''+taskId+'\')">&#10005;</button></span>';
  }).join('');
  return '<div class="tf-strip">'
    +'<div class="tf-head">&#127919; Saved filters on this task'+(linked.length?' <b>'+linked.length+'</b>':'')
      +'<i class="tf-legend">inside = a link on this task · own row = its own task right after</i></div>'
    +(chips?'<div class="tf-chips">'+chips+'</div>':'<div class="tf-none">None yet &mdash; the VA just gets the task on its own.</div>')
    +(pool
      ? '<div class="tf-add"><button class="tf-btn tf-btn-big" onclick="sfltPickOpen(\''+taskId+'\')">+ Attach filters</button>'
        + (linked.length?'<button class="tf-btn tf-btn-ghost" onclick="sfltUnlinkAll(\''+taskId+'\')">Clear all</button>':'')
        + '<span class="tf-hint">Pick as many as you like &mdash; search, tick, done.</span></div>'
      : '<div class="tf-none">Add filters on the Filters tab first.</div>')
    +'</div>';
}
function sfltUnlinkAll(taskId){
  var linked=sfltFiltersForTaskId(taskId);
  if(!linked.length) return;
  if(!confirm('Unlink all '+linked.length+' filter(s) from this task?\n\nThe filters themselves are kept — this only removes them from this task.')) return;
  var arr=getSavedFilters();
  arr.forEach(function(f){ if(sfltTaskIds(f).indexOf(taskId)>=0) f.taskIds=sfltTaskIds(f).filter(function(t){return t!==taskId;}); });
  saveSavedFilters(arr);
  showToast(linked.length+' filter(s) unlinked');
  mgr_repaintTicklist();
}

/* ── multi-attach picker ──────────────────────────────────────────────────────
   Attaching used to be one filter at a time through a datalist box. With 100s of
   filters that's unusable, so this is a searchable tick-list: filter, tick as many
   as you want, attach the lot in one go. */
/* From a FILTER, pick the tasks it should sit on. Lists each VA's real ticklist,
   so Jack picks by the name he sees on their shift rather than an internal id. */
var SFLT_TPICK={id:'',va:'Mera'};
function sfltTaskPickOpen(id){
  var f=getSavedFilters().filter(function(x){return x.id===id;})[0]; if(!f) return;
  var vas=sfltVAs(f);
  SFLT_TPICK={id:id, va:(vas[0]||'Mera')};
  var m=document.createElement('div');
  m.className='sbq-modal'; m.id='sflt-tpick';
  m.innerHTML='<div class="sbq-box" style="max-width:520px;">'
    +'<div class="sbq-t">Put “'+escHtml(f.title||'Filter')+'” on a task</div>'
    +'<div class="sbq-b">Pinning it to a task puts it on that task every time the task appears — '
      +'the day chips are ignored for a pinned filter. Leave nothing pinned to use the days instead.</div>'
    +'<div id="sflt-tpick-body"></div>'
    +'<div class="sbq-row"><button class="btn btn-ghost" onclick="sfltTaskPickClose()">Done</button></div>'
  +'</div>';
  document.body.appendChild(m);
  m.addEventListener('click',function(e){ if(e.target===m) sfltTaskPickClose(); });
  sfltTaskPickBody();
}
function sfltTaskPickClose(){
  var m=document.getElementById('sflt-tpick'); if(m) m.remove();
  try{ sfltMgrRepaint(); }catch(e){}
}
function sfltTaskPickVA(va){ SFLT_TPICK.va=va; sfltTaskPickBody(); }
function sfltTaskPickBody(){
  var host=document.getElementById('sflt-tpick-body'); if(!host) return;
  var f=getSavedFilters().filter(function(x){return x.id===SFLT_TPICK.id;})[0]; if(!f) return;
  var ids=sfltTaskIds(f);
  var tabs=['Mera','Suz'].map(function(v){
    return '<button class="sflt-tp-va'+(SFLT_TPICK.va===v?' on':'')+'" onclick="sfltTaskPickVA(\''+v+'\')">'+escHtml(vaDisp(v))+'</button>';
  }).join('');
  var mode=sfltMode(f);
  var modeSw='<div class="sflt-tp-mode">'
    +'<button class="'+(mode==='in'?'on':'')+'" onclick="sfltSetMode(\''+f.id+'\',\'in\')">Inside the task<span>a link on that task</span></button>'
    +'<button class="'+(mode==='own'?'on':'')+'" onclick="sfltSetMode(\''+f.id+'\',\'own\')">Its own task<span>a new row right after it</span></button>'
    +'</div>';
  var tasks=[];
  try{ tasks=getTaskTemplateSource(SFLT_TPICK.va)||[]; }catch(e){}
  var rows=tasks.filter(function(t){ return t && t.id && t.name; }).map(function(t){
    var on=ids.indexOf(t.id)>=0;
    return '<div class="sflt-tp-row'+(on?' on':'')+'" onclick="sfltTaskPickToggle(\''+t.id+'\')">'
      +'<span class="sflt-tp-cb">'+(on?'&#10003;':'')+'</span>'
      +'<span class="sflt-tp-nm">'+escHtml(t.name)+'</span>'
      +(t.mandatory?'<span class="sflt-tp-m">every shift</span>':'')
      +'</div>';
  }).join('');
  host.innerHTML=modeSw
    +'<div class="sflt-tp-vas">'+tabs+'</div>'
    +'<div class="sflt-tp-list">'+(rows||'<div class="sp-empty">No tasks on this list yet.</div>')+'</div>'
    +(ids.length?'<div class="sflt-tp-foot">Pinned to '+ids.length+' task'+(ids.length===1?'':'s')
        +' · <button class="sflt-ico" onclick="sfltTaskPickClear()">unpin all</button></div>':'');
}
function sfltTaskPickToggle(taskId){
  var arr=getSavedFilters(); var f=arr.filter(function(x){return x.id===SFLT_TPICK.id;})[0]; if(!f) return;
  var ids=sfltTaskIds(f).slice(), i=ids.indexOf(taskId);
  if(i>=0) ids.splice(i,1); else ids.push(taskId);
  f.taskIds=ids; saveSavedFilters(arr); sfltTaskPickBody();
}
function sfltTaskPickClear(){
  var arr=getSavedFilters(); var f=arr.filter(function(x){return x.id===SFLT_TPICK.id;})[0]; if(!f) return;
  f.taskIds=[]; saveSavedFilters(arr); sfltTaskPickBody();
}
var SFLT_PICK={task:'',q:'',tag:'all',sel:{}};
function sfltPickOpen(taskId){
  SFLT_PICK={task:taskId,q:'',tag:'all',sel:{}};
  var m=document.getElementById('sflt-pick');
  if(!m){
    m=document.createElement('div'); m.id='sflt-pick'; m.className='sp-back';
    m.onclick=function(e){ if(e.target===m) sfltPickClose(); };
    document.body.appendChild(m);
  }
  m.style.display='flex';
  document.body.style.overflow='hidden';
  sfltPickPaint();
}
function sfltPickClose(){
  var m=document.getElementById('sflt-pick'); if(m) m.style.display='none';
  document.body.style.overflow='';
}
function sfltPickSearch(v){ SFLT_PICK.q=String(v||''); sfltPickList(); }
function sfltPickTag(t){ SFLT_PICK.tag=t; sfltPickPaint(); }
function sfltPickToggle(id){
  if(SFLT_PICK.sel[id]) delete SFLT_PICK.sel[id]; else SFLT_PICK.sel[id]=1;
  sfltPickList();
}
function sfltPickMatches(){
  var q=SFLT_PICK.q.trim().toLowerCase(), tag=SFLT_PICK.tag;
  return getSavedFilters().filter(function(f){
    if(f.archived||!f.url) return false;
    if(tag!=='all'&&(f.tag||'KPF')!==tag) return false;
    if(!q) return true;
    return String(f.title||'').toLowerCase().indexOf(q)>=0
        || String(f.note||'').toLowerCase().indexOf(q)>=0
        || String(f.url||'').toLowerCase().indexOf(q)>=0;
  }).sort(function(a,b){ return (a.pos||0)-(b.pos||0); });
}
function sfltPickPaint(){
  var m=document.getElementById('sflt-pick'); if(!m) return;
  var all=getSavedFilters().filter(function(f){ return !f.archived && f.url; });
  var tags={}; all.forEach(function(f){ tags[f.tag||'KPF']=(tags[f.tag||'KPF']||0)+1; });
  var tagBar=['all'].concat(Object.keys(tags).sort()).map(function(t){
    return '<button class="sp-tag'+(SFLT_PICK.tag===t?' on':'')+'" onclick="sfltPickTag(\''+t+'\')">'
      +(t==='all'?'All':escHtml(t))+' <b>'+(t==='all'?all.length:tags[t])+'</b></button>';
  }).join('');
  m.innerHTML='<div class="sp-box">'
    +'<div class="sp-head"><div><div class="sp-t">Attach saved filters</div>'
      +'<div class="sp-s">Tick everything this task should run. They arrive on the VA\'s shift as named, one-click link rows.</div></div>'
      +'<button class="sp-x" onclick="sfltPickClose()">&#10005;</button></div>'
    +'<div class="sp-tools">'
      +'<input class="sp-search" id="sp-q" placeholder="Search by name, note or URL…" oninput="sfltPickSearch(this.value)" value="'+escHtml(SFLT_PICK.q)+'">'
      +'<div class="sp-tags">'+tagBar+'</div>'
    +'</div>'
    +'<div class="sp-list" id="sp-list"></div>'
    +'<div class="sp-foot">'
      +'<button class="btn btn-ghost" onclick="sfltPickAllShown(1)">Tick all shown</button>'
      +'<button class="btn btn-ghost" onclick="sfltPickAllShown(0)">Untick all</button>'
      +'<span class="sp-count" id="sp-count"></span>'
      +'<button class="btn btn-success" id="sp-go" onclick="sfltPickApply()">Attach</button>'
    +'</div>'
  +'</div>';
  sfltPickList();
  setTimeout(function(){ var q=document.getElementById('sp-q'); if(q) q.focus(); },40);
}
function sfltPickAllShown(on){
  sfltPickMatches().forEach(function(f){
    if(sfltTaskIds(f).indexOf(SFLT_PICK.task)>=0) return;   // already on the task
    if(on) SFLT_PICK.sel[f.id]=1; else delete SFLT_PICK.sel[f.id];
  });
  sfltPickList();
}
function sfltPickList(){
  var host=document.getElementById('sp-list'); if(!host) return;
  var rows=sfltPickMatches();
  if(!rows.length){ host.innerHTML='<div class="sp-empty">Nothing matches that.</div>'; }
  else host.innerHTML=rows.map(function(f){
    var on=sfltTaskIds(f).indexOf(SFLT_PICK.task)>=0;
    var sel=!!SFLT_PICK.sel[f.id];
    return '<div class="sp-row'+(on?' done':'')+(sel?' sel':'')+'"'+(on?'':' onclick="sfltPickToggle(\''+f.id+'\')"')+'>'
      +'<span class="sp-cb">'+(on?'&#10003;':(sel?'&#10003;':''))+'</span>'
      +'<span class="tf-tag t-'+(f.tag||'KPF')+'">'+escHtml(f.tag||'KPF')+'</span>'
      +'<span class="sp-name">'+escHtml(f.title||'Filter')+(f.note?'<i>'+escHtml(String(f.note).slice(0,70))+'</i>':'')+'</span>'
      +(on?'<span class="sp-on">already on</span>':'')
      +'</div>';
  }).join('');
  var n=Object.keys(SFLT_PICK.sel).length;
  var c=document.getElementById('sp-count'); if(c) c.textContent=n?n+' selected':'';
  var g=document.getElementById('sp-go'); if(g){ g.textContent=n?('Attach '+n+' filter'+(n===1?'':'s')):'Attach'; g.disabled=!n; g.style.opacity=n?1:.45; }
}
function sfltPickApply(){
  var ids=Object.keys(SFLT_PICK.sel); if(!ids.length){ showToast('Tick at least one filter',true); return; }
  var arr=getSavedFilters(), n=0;
  ids.forEach(function(id){
    var f=arr.filter(function(x){return x.id===id;})[0]; if(!f) return;
    var t=sfltTaskIds(f).slice();
    if(t.indexOf(SFLT_PICK.task)<0){ t.push(SFLT_PICK.task); f.taskIds=t; n++; }
  });
  saveSavedFilters(arr);
  sfltPickClose();
  showToast(n+' filter'+(n===1?'':'s')+' attached to this task &#10003;');
  mgr_repaintTicklist();
}
function sfltVAs(f){ return Array.isArray(f&&f.vas)?f.vas:[]; }
function sfltHasVA(f,va){ return sfltVAs(f).indexOf(va)>=0; }
function sfltForVA(va){
  return getSavedFilters().filter(function(f){ return !f.archived && f.url && sfltHasVA(f,va); })
    .sort(function(a,b){ return (a.pos||0)-(b.pos||0); });
}
function sfltToggleVA(id,va){
  var arr=getSavedFilters();
  var f=arr.filter(function(x){return x.id===id;})[0]; if(!f) return;
  var cur=sfltVAs(f).slice();
  var i=cur.indexOf(va);
  if(i>=0) cur.splice(i,1); else cur.push(va);
  f.vas=cur;
  saveSavedFilters(arr);
  sfltMgrRepaint();
  showToast(cur.length
    ? '"'+(f.title||'Filter')+'" is on '+cur.map(function(v){return vaDisp(v);}).join(' + ')+"'s POA ✓"
    : '"'+(f.title||'Filter')+'" removed from all POAs');
}
/* Fill a POA task's link rows with the filters assigned to that slot. Each filter
   becomes a pre-filled link with its own leads box, so the VA just runs it and types
   the number — and we can attribute leads back to the exact filter. */
/* Insert 'own task' filters as their own row directly after the task they are
   pinned to — walking backwards so earlier splices don't shift later indexes. */
/* 27/09: the VAs' saved filters are retired — the Sourcing Suite is their list (see
   TEMPLATE_RETIRED in core.js). Jack's library stays for Jack; nothing attaches to a VA's
   shift from it any more. Flip this off and everything below works exactly as before. */
var SFLT_VA_RETIRED=true;
function sfltInsertOwnRows(tasks,va){
  var added=[];
  if(SFLT_VA_RETIRED && (va==='Mera'||va==='Suz')) return added;
  if(!tasks||!tasks.length) return added;
  for(var i=tasks.length-1;i>=0;i--){
    var tid=tasks[i]&&tasks[i].id; if(!tid) continue;
    var here=getSavedFilters().filter(function(f){
      if(f.archived||!f.url) return false;
      if(sfltMode(f)!=='own') return false;
      if(sfltTaskIds(f).indexOf(tid)<0) return false;
      return tasks.every(function(t){ return t.id!=='pfilt-'+f.id; });
    });
    if(!here.length) continue;
    tasks.splice.apply(tasks,[i+1,0].concat(here.map(sfltPoaTask)));
    here.forEach(function(f){ added.push(f.id); });
  }
  return added;
}
function sfltAttachToPoa(tasks,va){
  var attached=sfltInsertOwnRows(tasks,va);
  if(!tasks||!tasks.length) return attached;
  tasks.forEach(function(t){
    /* The everyday task always carries the Sourcing app's "due today" link FIRST — before
       any pinned filters, and regardless of whether there are any. Once Suz's "20+" and
       "7-40" are archived, this task has no pins at all; the old code returned right here
       with no link and the Discord hint. Any filter still pinned (Mera's "200+") follows it. */
    if((t.id==='kpf-daily'||t.id==='suz-kpf-daily') && typeof SOURCING_DUE_URL==='string'){
      t.hasLinks=true;
      t.links=t.links||[]; t.linkLeads=t.linkLeads||[]; t.linkFilterIds=t.linkFilterIds||[]; t.linkNames=t.linkNames||[];
      if(t.linkFilterIds.indexOf('sourcing-due')<0){
        var _n=Math.max(t.links.length,t.linkNames.length,t.linkLeads.length,t.linkFilterIds.length);
        while(t.links.length<_n) t.links.push(''); while(t.linkNames.length<_n) t.linkNames.push('');
        while(t.linkLeads.length<_n) t.linkLeads.push(''); while(t.linkFilterIds.length<_n) t.linkFilterIds.push('');
        /* Jack, 21/09: "i meant this should be done for mera — i'm on mera's". The link
           carries the VA's name (#due&who=Mera) so the Sourcing app opens as her and the
           who-are-you gate never appears. */
        t.links.unshift(SOURCING_DUE_URL+((va==='Mera'||va==='Suz')?('&who='+encodeURIComponent(va)):''));
        t.linkNames.unshift('Sourcing app \u2014 what\u2019s due today');
        t.linkLeads.unshift(''); t.linkFilterIds.unshift('sourcing-due');
      }
      t._poaFilters=true;
    }
    if(SFLT_VA_RETIRED && (va==='Mera'||va==='Suz')) return;      // no pinned saved filters on a VA's task
    var mine=sfltForTask(va,t.id).filter(function(f){ return sfltMode(f)!=='own'; });
    if(!mine.length) return;
    t.hasLinks=true;
    t.links=t.links||[]; t.linkLeads=t.linkLeads||[]; t.linkFilterIds=t.linkFilterIds||[]; t.linkNames=t.linkNames||[];
    mine.forEach(function(f){
      if(t.linkFilterIds.indexOf(f.id)>=0) return;
      /* '' means UNTOUCHED; a real 0 means "I ran it and got nothing" and has to be tapped
         in. Seeding 0 here made every filter read as already logged — Jack's screenshot
         says "3 of 3 logged" on three rows nobody had opened. */
      t.links.push(f.url||''); t.linkLeads.push(''); t.linkFilterIds.push(f.id); t.linkNames.push(f.title||'Filter');
      attached.push(f.id);
    });
    // drop the "check Discord" hint — the library replaces that channel
    if(/Discord/i.test(t.hint||'') && t.id!=='kpf-daily' && t.id!=='suz-kpf-daily') t.hint='Your saved filters are listed below — run each one and log the leads it gave you.';
    t._poaFilters=true;
  });
  return attached;
}
/* ticking a POA task logs each attached filter + the leads it produced */
function sfltPoaLinksTicked(task){
  try{
    if(!task||!task.linkFilterIds||!task.linkFilterIds.length) return;
    if(typeof fuLog!=='function') return;
    task.linkFilterIds.forEach(function(fid,i){
      if(!fid) return;
      fuLog(fid);
      var n=parseInt((task.linkLeads||[])[i]);
      if(!isNaN(n)&&n>0&&typeof fuSetLeads==='function') fuSetLeads(fid,n);
    });
  }catch(e){}
}
/* a linked filter, as a task on the VA's shift — same shape as a From-Jack item
   so it gets the Open button, Start/Stop timer and "log leads found" treatment */
/* ticking a linked-filter task logs an open + the leads it produced, so the
   Filters tab's performance table fills itself with no extra typing */
function sfltPoaTicked(task){
  try{
    if(!task||!task.isPoaFilter||!task.sfltId) return;
    if(typeof fuLog!=='function') return;
    fuLog(task.sfltId);
    var n=parseInt(task.leads);
    if(!isNaN(n)&&n>0&&typeof fuSetLeads==='function') fuSetLeads(task.sfltId,n);
  }catch(e){}
}
/* superseded by sfltAttachToPoa (filters now nest inside the matching POA task);
   kept only for filters whose slot has no POA task for that VA */
function sfltPoaTask(f){
  return { id:'pfilt-'+f.id, sfltId:f.id, name:'🎯 '+(f.title||'Filter'),
    jbLabel:f.title||'Filter', jbReason:(f.note||'').trim(), mandatory:true,
    hint:'One of your saved filters — open it, time it, and log how many leads it gave you.',
    hasLinks:false, done:false, skipped:false, skipReason:'', time:'', timeHrs:0, timeMins:0,
    leads:'', context:'', links:[],
    jbType:(f.tag==='Storefront'?'sf':'kpf'), jbUrl:f.url||'', jbAsin:'',
    jbTimer:true, jbLeads:true, isPoaFilter:true,
    timerSec:0, timerRun:false, timerStart:null };
}
/* Exact URLs used while building/testing this app. They are fabricated and appear in
   no real Keepa/SellerAmp filter, so matching on them can never remove one of Jack's. */
var SFLT_JUNK_URLS=['keepa.com/#!deals/dyson','keepa.com/#!deals/real','argos.co.uk/clr',
  'keepa.com/#!deals/lego','keepa.com/#!deals/mine','keepa.com/#!deals/7d','keepa.com/#!deals/mon',
  'keepa.com/#!deals/x','keepa.com/#!deals/orph','keepa.com/#!deals/lap','keepa.com/#!deals/bare',
  'keepa.com/#!deals/asus','keepa.com/#!deals/ht','keepa.com/#!product/sam','keepa.com/#!product/samsung',
  'keepa.com/#!product/2-b08xyz','sas.selleramp.com/ht','sas.selleramp.com/x','superdrug.com/clearance',
  'superdrug.com/clr','www.superdrug.com/clearance','x.com/old','x.com/1','k.com/1','k.com/2'];
function sfltIsTestRow(f){
  if(!f) return false;
  if(/^Filter number \d+$/.test(String(f.title||''))) return true;
  // seeded ids from testing were short ("f1","g12","t400"); a real sfltUid is
  // 'f'+base36 timestamp+random, so it can never match this
  if(/^[a-z]\d{1,3}$/.test(String(f.id||''))) return true;
  // and anything carrying one of the fabricated test URLs
  try{
    var u=String(f.url||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
    if(u && SFLT_JUNK_URLS.indexOf(u)>=0) return true;
    if(/^keepa\.com\/#!deals\/\d+$/.test(u)) return true;   // seeded "deals/0..799"
  }catch(e){}
  return false;
}
function getSavedFilters(){
  var out=null;
  var c=sfltCacheGet();
  if(c) out=c;
  else { try{ var s=getAppSettings().savedFilters; out=Array.isArray(s)?s:[]; }catch(e){ out=[]; } }
  // Filter out the "Filter number N" rows a test import once wrote into the shared
  // settings row. Done on every read so no stale cache anywhere can resurrect them.
  if(out.some(sfltIsTestRow)){
    out=out.filter(function(f){ return !sfltIsTestRow(f); });
    try{ sfltCacheSet(out); }catch(e){}
    try{ var st=getAppSettings(); if(Array.isArray(st.savedFilters)&&st.savedFilters.some(sfltIsTestRow)){
      st.savedFilters=out; saveAppSettings(st); } }catch(e){}
  }
  return out;
}
// legacy writer — still keeps the settings blob in step so nothing can be lost
function saveSavedFilters(arr){
  sfltCacheSet(arr);
  var s=getAppSettings(); s.savedFilters=arr; saveAppSettings(s); try{ pushSettingsCloud(s); }catch(e){}
}

// ── table layer ────────────────────────────────────────────────────────────
function sfltRowOut(f,i){ return {id:f.id,title:String(f.title||'').slice(0,160),url:f.url||'',note:String(f.note||'').slice(0,300),tag:f.tag||'KPF',pos:(f.pos!=null?f.pos:i)||0,archived:!!f.archived,updated_at:new Date().toISOString()}; }
function sfltUpsert(f,i){
  if(IS_PREVIEW) return;
  if(!DB_ENABLED||SFLT_TABLE_OK===false) return Promise.resolve();
  return dbWrite('A saved filter', SUPABASE_URL+'/rest/v1/saved_filters',{method:'POST',headers:sfltHeaders({'Prefer':'resolution=merge-duplicates'}),body:JSON.stringify(sfltRowOut(f,i))})
    .then(function(r){ if(!r.ok&&r.status===404) SFLT_TABLE_OK=false; }).catch(function(){});
}
function sfltRemote(id){
  if(!DB_ENABLED||SFLT_TABLE_OK===false) return Promise.resolve();
  return fetch(SUPABASE_URL+'/rest/v1/saved_filters?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:sfltHeaders()}).catch(function(){});
}
// load the library from the table; migrates the old blob across on first run
function sfltLoadCloud(){
  if(!DB_ENABLED) return Promise.resolve(getSavedFilters());
  return fetchT(SUPABASE_URL+'/rest/v1/saved_filters?select=*&order=pos.asc&limit=5000',{headers:sfltHeaders()})
    .then(function(r){ if(!r.ok){ SFLT_TABLE_OK=false; return null; } SFLT_TABLE_OK=true; return r.json(); })
    .then(function(rows){
      if(!rows) return getSavedFilters();
      var legacy=[]; try{ var s=getAppSettings().savedFilters; if(Array.isArray(s)) legacy=s; }catch(e){}
      if(!rows.length && legacy.length){                     // one-time migration, blob is left intact
        return Promise.all(legacy.map(function(f,i){ return sfltUpsert(f,i); })).then(function(){
          var mig=legacy.map(function(f,i){ return Object.assign({},f,{pos:i,archived:!!f.archived}); });
          sfltCacheSet(mig);
          try{ showToast('Saved filters moved to their own table ✓ ('+mig.length+')'); }catch(e){}
          return mig;
        });
      }
      // table rows carry the filter itself; the blob carries WHO it is for and WHEN.
      // Merge, or every assignment is lost on the next load.
      var byId={};
      (legacy||[]).forEach(function(f){ if(f&&f.id) byId[f.id]=f; });
      try{ var cached=sfltCacheGet()||[]; cached.forEach(function(f){ if(f&&f.id&&!byId[f.id]) byId[f.id]=f; }); }catch(e){}
      var merged=rows.map(function(r){
        var keep=byId[r.id];
        if(!keep) return r;
        var out=Object.assign({},r);
        if(Array.isArray(keep.vas))     out.vas=keep.vas;
        if(Array.isArray(keep.days))    out.days=keep.days;
        else if(keep.slots||keep.slot){ out.slots=keep.slots; out.slot=keep.slot; }
        if(Array.isArray(keep.taskIds)) out.taskIds=keep.taskIds;
        return out;
      });
      sfltCacheSet(merged);
      return merged;
    })
    .catch(function(){ return getSavedFilters(); });
}
function sfltUid(){ return 'f'+Date.now().toString(36)+Math.floor(Math.random()*4096).toString(36); }
/* Attach to a POA as you add — so a new filter can go straight onto Mera's or
   Suz's plan without having to find it in the list afterwards. */
function sfltPoaPickerHTML(which){
  var vaBtns=['Mera','Suz'].map(function(v){
    return '<button type="button" class="sflt-va sflt-newva" data-va="'+v+'" data-w="'+which+'" onclick="sfltNewVaTgl(this)" title="Put it on '+vaDisp(v)+"'s POA"+'">'+vaDisp(v).charAt(0)+'</button>';
  }).join('');
  return '<div class="sflt-newpoa">'
    +'<span class="sflt-newlbl">Add to a POA</span>'
    +'<span class="sflt-poa">'+vaBtns+'</span>'
    +sfltDayChipsHTML([],"sfltNewDayTgl(this,'{K}')","sfltNewAllDays(this,{ON})")
    +'<span class="sflt-newhint">pick a VA to put it in their saved filters · pick days to also put it on their POA</span>'
    +'</div>';
}
function sfltNewDayTgl(btn,k){
  btn.classList.toggle('on');
  var wrap=btn.parentNode;
  var on=wrap.querySelectorAll('.sflt-day[data-day].on').length;   // none is a valid choice
  var all=wrap.querySelector('.sflt-all'); if(all) all.classList.toggle('on', on===5);
}
function sfltNewAllDays(btn){
  // The {ON} in the onclick is baked at RENDER time, and the add form never
  // re-renders — so a baked value made this a one-way switch (it could turn all
  // days on, never off). Read the live DOM instead of trusting the argument.
  var wrap=btn.parentNode;
  var days=[].slice.call(wrap.querySelectorAll('.sflt-day[data-day]'));
  var on=days.filter(function(b2){return b2.classList.contains('on');}).length!==days.length;
  days.forEach(function(b2){ b2.classList.toggle('on', on); });
  btn.classList.toggle('on', on);
}
function sfltNewSlotTgl(btn,which,k){
  var wrap=btn.parentNode;
  var all=[].slice.call(wrap.querySelectorAll('.sflt-day'));
  var on=btn.classList.contains('on');
  if(k==='daily'){ all.forEach(function(b){ b.classList.toggle('on', b===btn ? !on : false); }); }
  else{
    btn.classList.toggle('on');
    var d=wrap.querySelector('.sflt-day[data-slot="daily"]'); if(d) d.classList.remove('on');
  }
  if(!wrap.querySelector('.sflt-day.on')){                       // never end on nothing
    var dd=wrap.querySelector('.sflt-day[data-slot="daily"]'); if(dd) dd.classList.add('on');
  }
}
function sfltNewVaTgl(btn){
  var v=btn.getAttribute('data-va');
  btn.classList.toggle('on'); btn.classList.toggle('v-'+v);
}
function sfltNewPoa(which){
  var vas=[].filter.call(document.querySelectorAll('.sflt-newva[data-w="'+which+'"].on'),function(b){return true;})
             .map(function(b){ return b.getAttribute('data-va'); });
  var host=document.querySelector('.sflt-newva[data-w="'+which+'"]');
  var wrap=host?host.closest('.sflt-newpoa'):null;
  var ds=wrap?[].map.call(wrap.querySelectorAll('.sflt-day[data-day].on'),function(b){return b.getAttribute('data-day');}):[];
  return {vas:vas, days:ds};      // [] is meaningful: her library, not her plan
}
function sfltAdd(){
  var t=(document.getElementById('sflt-title')||{}).value||''; var u=(document.getElementById('sflt-url')||{}).value||''; var n=(document.getElementById('sflt-note')||{}).value||'';
  t=t.trim(); u=u.trim(); if(!t||!u){ showToast('Add a title and a link',true); return; }
  var arr=getSavedFilters();
  var poa=sfltNewPoa('add');
  var f={id:sfltUid(),title:t.slice(0,160),url:u,note:n.trim().slice(0,300),tag:(document.getElementById('sflt-tag')||{}).value||'KPF',pos:arr.length,archived:false,
         vas:poa.vas,days:poa.days};
  arr.push(f);
  saveSavedFilters(arr); sfltUpsert(f,arr.length-1);
  if(typeof mgr_currentTab!=='undefined'&&mgr_currentTab==='filters') mgr_renderFilters(); else mgr_renderSettings();
  showToast(poa.vas.length
    ? 'Saved ✓ — on '+poa.vas.map(function(v){return vaDisp(v);}).join(' + ')+"'s POA, "+sfltDaysLabel(f)
    : 'Filter saved ✓ — in your library, not on a POA yet');
}
function sfltDel(id){
  if(!confirm('Delete this saved filter?\n\nThis removes it for good. To just hide it from your VAs, use Archive instead.')) return;
  saveSavedFilters(getSavedFilters().filter(function(f){return f.id!==id;})); sfltRemote(id); mgr_renderSettings();
}
function sfltArchive(id,on){
  var arr=getSavedFilters(); var f=arr.filter(function(x){return x.id===id;})[0]; if(!f) return;
  f.archived=!!on; saveSavedFilters(arr); sfltUpsert(f,arr.indexOf(f)); mgr_renderSettings();
  showToast(on?'Archived — hidden from VAs, nothing deleted':'Back in the VA panel ✓');
}
function sfltEdit(id,field,val){
  var arr=getSavedFilters(); var f=arr.filter(function(x){return x.id===id;})[0]; if(!f) return;
  f[field]=val; saveSavedFilters(arr);
  clearTimeout(window['_sfltT_'+id]);                       // debounce so typing doesn't hammer the table
  window['_sfltT_'+id]=setTimeout(function(){ sfltUpsert(f,arr.indexOf(f)); },600);
}
function sfltMove(id,dir){
  var arr=getSavedFilters(); var i=arr.findIndex(function(f){return f.id===id;}); var j=i+dir; if(i<0||j<0||j>=arr.length)return;
  var t=arr[i];arr[i]=arr[j];arr[j]=t;
  arr[i].pos=i; arr[j].pos=j;
  saveSavedFilters(arr); sfltUpsert(arr[i],i); sfltUpsert(arr[j],j); mgr_renderSettings();
}
var sfltMgrQuery='', sfltMgrPage=0, sfltMgrTag='', sfltMgrSort='pos', sfltMgrArch=false, sfltMgrEdit='', sfltMgrPoa='';
var SFLT_PER_PAGE=25;
var SFLT_TAGS=['KPF','Keepa','A2A','Storefront','Other'];
function sfltMgrSearch(v){ sfltMgrQuery=String(v||'').toLowerCase().trim(); sfltMgrPage=0; sfltMgrRepaint(); }
function sfltMgrSetTag(t){ sfltMgrTag=(sfltMgrTag===t?'':t); sfltMgrPage=0; sfltMgrRepaint(); }
function sfltMgrSetSort(v){ sfltMgrSort=v; sfltMgrPage=0; sfltMgrRepaint(); }
function sfltMgrToggleArch(){ sfltMgrArch=!sfltMgrArch; sfltMgrPage=0; sfltMgrRepaint(); }
function sfltMgrSetPoa(v){ sfltMgrPoa=(sfltMgrPoa===v?'':v); sfltMgrPage=0; sfltMgrRepaint(); }
function sfltMgrGo(p){ sfltMgrPage=p; sfltMgrRepaint(); var h=document.getElementById('sflt-list-host'); if(h) h.scrollIntoView({block:'start',behavior:'smooth'}); }
function sfltMgrEditRow(id){ sfltMgrEdit=(sfltMgrEdit===id?'':id); sfltMgrRepaint(); }
/* Proof it lands, without waiting for the day to come round. */
/* Which filters actually produce. Jack: "wanna get insight and stats from there on
   how they are used and how much and success rate — unsure where it goes."
   Two places: the leads-per-open figure on every row (so it is there while he works),
   and this ranked block at the top of the Filters tab for the overview. */
function sfltPerfHTML(){
  var stats=(typeof fuStatsAll==='function')?fuStatsAll():{};
  var all=getSavedFilters().filter(function(f){ return !f.archived && f.url; });
  if(!all.length) return '';
  var rows=all.map(function(f){
    var st=stats[f.id]||{uses:0,leads:0,last:''};
    return {f:f, uses:st.uses, leads:st.leads, last:st.last, rate:st.uses?st.leads/st.uses:0};
  });
  var used=rows.filter(function(r){ return r.uses>0; });
  var never=rows.filter(function(r){ return !r.uses; });
  var totOpens=used.reduce(function(a,r){return a+r.uses;},0);
  var totLeads=used.reduce(function(a,r){return a+r.leads;},0);
  var dead=used.filter(function(r){ return r.leads===0; });
  if(!totOpens){
    return '<div class="sfp"><div class="sfp-h">Filter performance</div>'
      +'<div class="sfp-empty">No filter has been opened yet. The moment a VA opens one from their shift panel, '
      +'opens and leads start collecting here — and each row shows its leads per open.</div></div>';
  }
  var best=used.slice().sort(function(a,b){ return b.rate-a.rate || b.leads-a.leads; }).slice(0,3);
  var worst=dead.slice().sort(function(a,b){ return b.uses-a.uses; }).slice(0,3);
  function line(r,tone){
    return '<div class="sfp-r"><span class="sfp-n">'+escHtml(String(r.f.title||'Filter').slice(0,46))+'</span>'
      +'<span class="sfp-v '+tone+'">'+(Math.round(r.rate*10)/10)+'</span>'
      +'<span class="sfp-s">'+r.leads+' leads · '+r.uses+' opens</span></div>';
  }
  return '<div class="sfp">'
    +'<div class="sfp-h">Filter performance<i>'+used.length+' of '+all.length+' ever opened</i></div>'
    +'<div class="sfp-kpis">'
      +'<span class="sfp-k"><b>'+totOpens+'</b>opens</span>'
      +'<span class="sfp-k"><b>'+totLeads+'</b>leads</span>'
      +'<span class="sfp-k"><b style="color:#10d99a">'+(Math.round(totLeads/totOpens*10)/10)+'</b>leads per open</span>'
      +(dead.length?'<span class="sfp-k"><b style="color:#ff6b7f">'+dead.length+'</b>opened, never produced</span>':'')
      +(never.length?'<span class="sfp-k"><b style="color:#7c8598">'+never.length+'</b>never opened</span>':'')
    +'</div>'
    +'<div class="sfp-cols">'
      +'<div><div class="sfp-t">Best performing</div>'+(best.map(function(r){return line(r,'good');}).join('')||'<div class="sfp-none">—</div>')+'</div>'
      +'<div><div class="sfp-t">Opened but never produced</div>'
        +(worst.length?worst.map(function(r){return line(r,'bad');}).join('')
          :'<div class="sfp-none">none — every opened filter has produced at least one lead</div>')+'</div>'
    +'</div></div>';
}
function sfltRunsPreviewHTML(){
  var today=sfltTodayKey(), wknd=sfltIsWeekend();
  var lbl=(SFLT_DAYS.filter(function(d){return d.k===today;})[0]||{}).full||'today';
  var body=['Mera','Suz'].map(function(va){
    var names={}, tasks=[];
    try{ tasks=getTaskTemplateSource(va)||[]; }catch(e){}
    tasks.forEach(function(t){ names[t.id]=t.name; });
    var lines=[], seen={};
    getSavedFilters().forEach(function(f){          // pinned ride their task any day
      if(f.archived||!f.url) return;
      sfltTaskIds(f).forEach(function(tid){
        if(names[tid]){ lines.push({t:names[tid],f:f.title,pin:true,own:sfltMode(f)==='own'}); seen[f.id+'|'+tid]=1; }
      });
    });
    sfltHostTaskIds(va).forEach(function(tid){
      if(!names[tid]) return;
      sfltForTask(va,tid).forEach(function(f){
        if(seen[f.id+'|'+tid]) return;
        lines.push({t:names[tid],f:f.title,pin:false});
      });
    });
    return '<div class="sflt-rp-va"><b>'+escHtml(vaDisp(va))+'</b>'
      +(lines.length
        ? lines.map(function(l){ return '<div class="sflt-rp-l">'+(l.pin?'<i>&#128204;</i>':'<i>&#8226;</i>')
            +escHtml(l.f)+'<span>'+(l.own?'own task after':'inside')+' “'+escHtml(String(l.t).slice(0,40))+'”</span></div>'; }).join('')
        : '<div class="sflt-rp-none">nothing lands on their list</div>')
      +'</div>';
  }).join('');
  return '<div class="sflt-rp"><div class="sflt-rp-h">What lands on their task list '
    +(wknd?'<em>on Monday</em> — it’s the weekend, so there is no shift today'
          :'<em>'+escHtml(String(lbl).toLowerCase())+'</em>')
    +'</div>'+body+'</div>';
}
function sfltMgrRepaint(){
  var host=document.getElementById('sflt-list-host'); if(host) host.innerHTML=sfltRowsHTML();
  var bar=document.getElementById('sflt-toolbar'); if(bar) bar.innerHTML=sfltToolbarHTML();
  var s=document.getElementById('sflt-search'); if(s&&document.activeElement!==s){ s.value=sfltMgrQuery; }
}
function sfltMatch(f,q){
  if(!q) return true;
  return ((f.title||'')+' '+(f.note||'')+' '+(f.tag||'')+' '+(f.url||'')).toLowerCase().indexOf(q)>=0;
}
/* the filtered+sorted set the list is currently showing */
function sfltMgrSet(){
  var all=getSavedFilters();
  var stats=(typeof fuStatsAll==='function')?fuStatsAll():{};
  var out=all.filter(function(f){
    if(!sfltMgrArch && f.archived) return false;
    if(sfltMgrPoa && !sfltHasVA(f,sfltMgrPoa)) return false;
    if(sfltMgrTag && (f.tag||'KPF')!==sfltMgrTag) return false;
    return sfltMatch(f,sfltMgrQuery);
  });
  var key=sfltMgrSort;
  out.sort(function(a,b){
    var sa=stats[a.id]||{uses:0,leads:0}, sb=stats[b.id]||{uses:0,leads:0};
    if(key==='az')    return String(a.title||'').localeCompare(String(b.title||''));
    if(key==='leads') return (sb.leads||0)-(sa.leads||0) || (sb.uses||0)-(sa.uses||0);
    if(key==='uses')  return (sb.uses||0)-(sa.uses||0);
    if(key==='cold')  return (sa.leads||0)-(sb.leads||0) || (sb.uses||0)-(sa.uses||0);
    return (a.pos||0)-(b.pos||0);
  });
  return out;
}
function sfltToolbarHTML(){
  var all=getSavedFilters();
  var set=sfltMgrSet();
  var arch=all.filter(function(f){return f.archived;}).length;
  var counts={}; all.forEach(function(f){ if(!f.archived){ var t=f.tag||'KPF'; counts[t]=(counts[t]||0)+1; } });
  var chips=SFLT_TAGS.map(function(t){
    if(!counts[t]&&sfltMgrTag!==t) return '';
    return '<button class="sflt-chip'+(sfltMgrTag===t?' on':'')+'" onclick="sfltMgrSetTag(\''+t+'\')">'+t+' <b>'+(counts[t]||0)+'</b></button>';
  }).join('');
  var poaCount={Mera:0,Suz:0};
  all.forEach(function(f){ if(f.archived) return; sfltVAs(f).forEach(function(v){ if(poaCount[v]!=null) poaCount[v]++; }); });
  var poaChips=['Mera','Suz'].map(function(v){
    return '<button class="sflt-chip poa'+(sfltMgrPoa===v?' on v-'+v:'')+'" onclick="sfltMgrSetPoa(\''+v+'\')">'
      +(sfltMgrPoa===v?'✓ ':'')+vaDisp(v)+"'s POA <b>"+poaCount[v]+'</b></button>';
  }).join('');
  return '<div class="sflt-tools">'
    +'<input class="sflt-search2" id="sflt-search" placeholder="Search '+all.length+' filters by name, tag, note or link…" value="'+escHtml(sfltMgrQuery)+'" oninput="sfltMgrSearch(this.value)">'
    +'<select class="sflt-sort" onchange="sfltMgrSetSort(this.value)">'
      +'<option value="pos"'+(sfltMgrSort==='pos'?' selected':'')+'>My order</option>'
      +'<option value="az"'+(sfltMgrSort==='az'?' selected':'')+'>A–Z</option>'
      +'<option value="leads"'+(sfltMgrSort==='leads'?' selected':'')+'>Most leads</option>'
      +'<option value="uses"'+(sfltMgrSort==='uses'?' selected':'')+'>Most used</option>'
      +'<option value="cold"'+(sfltMgrSort==='cold'?' selected':'')+'>Worst performing</option>'
    +'</select>'
    +'</div>'
    +'<div class="sflt-chips">'+poaChips+(sfltMgrTag?'<button class="sflt-chip on" onclick="sfltMgrSetTag(\''+sfltMgrTag+'\')">✕ '+sfltMgrTag+'</button>':'')+chips
      +(arch?'<button class="sflt-chip arch'+(sfltMgrArch?' on':'')+'" onclick="sfltMgrToggleArch()">'+(sfltMgrArch?'✓ ':'')+'Archived <b>'+arch+'</b></button>':'')
      +'<span class="sflt-count">'+set.length+(sfltMgrQuery||sfltMgrTag?' match'+(set.length===1?'':'es'):' filter'+(set.length===1?'':'s'))+'</span>'
    +'</div>';
}
function sfltPagerHTML(total,page,pages){
  if(pages<=1) return '';
  var btn=function(p,label,dis){ return '<button class="sflt-pg'+(dis?' dis':'')+'"'+(dis?' disabled':'')+' onclick="sfltMgrGo('+p+')">'+label+'</button>'; };
  var nums='';
  var from=Math.max(0,Math.min(page-2,pages-5)), to=Math.min(pages,from+5);
  for(var i=from;i<to;i++) nums+='<button class="sflt-pg num'+(i===page?' on':'')+'" onclick="sfltMgrGo('+i+')">'+(i+1)+'</button>';
  return '<div class="sflt-pager">'
    +btn(0,'« First',page===0)+btn(Math.max(0,page-1),'‹ Prev',page===0)
    +nums
    +btn(Math.min(pages-1,page+1),'Next ›',page>=pages-1)+btn(pages-1,'Last »',page>=pages-1)
    +'<span class="sflt-pgi">'+(page*SFLT_PER_PAGE+1)+'–'+Math.min(total,(page+1)*SFLT_PER_PAGE)+' of '+total+'</span>'
    +'</div>';
}
function sfltRowsHTML(){
  var all=getSavedFilters();
  if(!all.length) return '<div class="sflt-empty">No saved filters yet. Paste your Discord channel into the bulk box below — they replace the channel entirely.</div>';
  var set=sfltMgrSet();
  if(!set.length) return '<div class="sflt-empty">Nothing matches'+(sfltMgrQuery?' “'+escHtml(sfltMgrQuery)+'”':'')+(sfltMgrTag?' in '+sfltMgrTag:'')+'.</div>';
  var pages=Math.ceil(set.length/SFLT_PER_PAGE);
  if(sfltMgrPage>=pages) sfltMgrPage=pages-1;
  var page=sfltMgrPage;
  var slice=set.slice(page*SFLT_PER_PAGE,(page+1)*SFLT_PER_PAGE);
  var stats=(typeof fuStatsAll==='function')?fuStatsAll():{};
  var rows=slice.map(function(f,n){
    var st=stats[f.id]||{uses:0,leads:0};
    var rate=st.uses?(st.leads/st.uses):0;
    var perf=st.uses
      ? '<span class="sflt-pill'+(st.leads===0?' cold':(rate>=1?' hot':' warm'))+'" title="'
          +st.leads+' leads from '+st.uses+' opens'+(st.last?' · last used '+st.last:'')+'">'
        +'<b>'+(Math.round(rate*10)/10)+'</b> per open <i>'+st.leads+'L / '+st.uses+'&#8599;</i></span>'
      : '<span class="sflt-pill none">never opened</span>';
    var open=sfltMgrEdit===f.id;
    var host=''; try{ host=(String(f.url||'').match(/^https?:\/\/(www\.)?([^\/]+)/i)||[])[2]||''; }catch(e){}
    var assigned=sfltVAs(f).length>0;
    var poaBtns='<span class="sflt-poa">'
      +['Mera','Suz'].map(function(v){
        var on=sfltHasVA(f,v);
        return '<button class="sflt-va'+(on?' on v-'+v:'')+'" title="'+(on?'On ':'Add to ')+vaDisp(v)+"'s POA"+'" onclick="event.stopPropagation();sfltToggleVA(\''+f.id+'\',\''+v+'\')">'+vaDisp(v).charAt(0)+'</button>';
      }).join('')
      +(assigned?'<span class="sflt-dlbl" title="'
          +(sfltOnPoa(f)?'Runs '+sfltDaysLabel(f):'No days picked — it stays in their saved filters and never lands on the plan')+'">'
          +(sfltOnPoa(f)?'runs':'library only')+'</span>'
        +sfltDayChipsHTML(sfltDays(f),
          "event.stopPropagation();sfltToggleDay('"+f.id+"','{K}')",
          "event.stopPropagation();sfltSetAllDays('"+f.id+"',{ON})"):'')
      +'</span>';
    var head='<div class="sflt-line'+(assigned?'':' unassigned')+'" onclick="sfltMgrEditRow(\''+f.id+'\')">'
      +'<div class="sflt-r1">'
        +'<span class="sflt-num">'+(page*SFLT_PER_PAGE+n+1)+'</span>'
        +'<span class="sflt-tagp t-'+(f.tag||'KPF')+'">'+(f.tag||'KPF')+'</span>'
        +'<span class="sflt-name">'+escHtml(f.title||'Untitled')+(f.archived?'<span class="sflt-archtag">archived</span>':'')+'</span>'
        +perf
        +'<a class="sflt-ico open" href="'+String(f.url||'#').replace(/"/g,'&quot;')+'" target="_blank" title="'+escHtml(host||'Open filter')+'" onclick="event.stopPropagation()">Open ↗</a>'
      +'</div>'
      +(f.note?'<div class="sflt-note2">'+escHtml(f.note)+'</div>':'')
      +'<div class="sflt-r2">'
      +poaBtns
      +'<span class="sflt-acts">'
        +(function(){
            var n=sfltTaskIds(f).length, where=sfltWhereLabel(f);
            return '<button class="sflt-where'+(n?' set':'')+'" title="Choose which task on their list this sits on, and whether it sits inside that task or becomes its own task" '
              +'onclick="event.stopPropagation();sfltTaskPickOpen(\''+f.id+'\')">Where&nbsp;&#9656; <b>'+escHtml(where)+'</b></button>';
          })()
        +'<button class="sflt-ico" title="Edit" onclick="event.stopPropagation();sfltMgrEditRow(\''+f.id+'\')">'+(open?'▴':'✎')+'</button>'
        +'<button class="sflt-ico" title="'+(f.archived?'Show to VAs again':'Hide from VAs (keeps it)')+'" onclick="event.stopPropagation();sfltArchive(\''+f.id+'\','+(f.archived?'false':'true')+')">'+(f.archived?'⊕':'⊘')+'</button>'
      +'</span></div></div>';
    var edit=open?('<div class="sflt-edit">'
      +'<div class="sflt-er1"><input class="settings-input" value="'+escHtml(f.title||'')+'" placeholder="Filter name" oninput="sfltEdit(\''+f.id+'\',\'title\',this.value)">'
        +'<select class="sflt-tag" onchange="sfltEdit(\''+f.id+'\',\'tag\',this.value)">'+SFLT_TAGS.map(function(t){return '<option'+((f.tag||'KPF')===t?' selected':'')+'>'+t+'</option>';}).join('')+'</select></div>'
      +'<input class="settings-input" value="'+escHtml(f.url||'')+'" placeholder="Filter link" oninput="sfltEdit(\''+f.id+'\',\'url\',this.value)">'
      +'<input class="settings-input" value="'+escHtml(f.note||'')+'" placeholder="Note for the VA (optional)" oninput="sfltEdit(\''+f.id+'\',\'note\',this.value)">'
      +'<div class="sflt-erow"><button class="sflt-ico" onclick="sfltMove(\''+f.id+'\',-1)">↑ Move up</button>'
        +'<button class="sflt-ico" onclick="sfltMove(\''+f.id+'\',1)">↓ Move down</button>'
        +'<button class="sflt-ico danger" onclick="sfltDel(\''+f.id+'\')">Delete</button>'
        +'<button class="sflt-ico" style="margin-left:auto;" onclick="sfltMgrEditRow(\'\')">Done</button></div>'
      +'</div>'):'';
    return '<div class="sflt-row2'+(f.archived?' is-arch':'')+(open?' open':'')+'">'+head+edit+'</div>';
  }).join('');
  return sfltPagerHTML(set.length,page,pages)+'<div class="sflt-rows">'+rows+'</div>'+sfltPagerHTML(set.length,page,pages);
}
/* ══════════ BULK IMPORT — paste the whole Discord channel in one go ══════════
   Adding 1000s of filters one form at a time isn't realistic, so this takes a
   paste of any shape and works out the name + link + note per line. */
function sfltParseBulk(text){
  var out=[], seen={};
  String(text||'').split(/[\r\n]+/).forEach(function(line){
    var raw=line.trim();
    if(!raw) return;
    // strip a leading list marker ONLY when followed by a space, so names like
    // "7-day drop £50+" keep their leading "7-"
    raw=raw.replace(/^\s*(?:[-*•>]+|\d+[.)])\s+/,'').trim();
    var name='', url='', note='';
    var parts=raw.split('|');
    if(parts.length>=2 && /https?:\/\//i.test(parts[1])){    // Name | url | note
      name=parts[0].trim(); url=(parts[1].match(/https?:\/\/\S+/i)||[''])[0]; note=(parts[2]||'').trim();
    } else {
      var m=raw.match(/https?:\/\/\S+/i);
      if(!m) return;                                          // no link on this line → skip it
      url=m[0].replace(/[)>,.\]]+$/,'');                       // trailing punctuation from chat pastes
      var before=raw.slice(0,m.index).trim().replace(/[-–—:•]+$/,'').trim();
      var after=raw.slice(m.index+m[0].length).trim().replace(/^[-–—:•]+/,'').trim();
      name=before; note=after;
      if(!name && after){ name=after; note=''; }
    }
    if(!url) return;
    if(!name){                                                // derive a name from the link
      try{ var h=(url.match(/^https?:\/\/(www\.)?([^\/]+)/i)||[])[2]||'filter';
        name=h.replace(/\.(com|co\.uk|io|net|org)$/i,'')+' filter'; }catch(e){ name='filter'; }
    }
    var key=url.toLowerCase();
    if(seen[key]) return; seen[key]=1;
    out.push({title:name.slice(0,160),url:url,note:note.slice(0,300)});
  });
  return out;
}
function sfltBulkPreview(){
  var t=(document.getElementById('sflt-bulk')||{}).value||'';
  var parsed=sfltParseBulk(t);
  var have={}; getSavedFilters().forEach(function(f){ have[String(f.url||'').toLowerCase()]=1; });
  var fresh=parsed.filter(function(p){ return !have[p.url.toLowerCase()]; });
  var el=document.getElementById('sflt-bulk-info'); if(!el) return;
  if(!t.trim()){ el.innerHTML='Paste as many as you like — one per line. Any of these work: <b>Name | link | note</b>, <b>Name - link</b>, or just the link on its own.'; el.className='sflt-bulk-info'; return; }
  var dupes=parsed.length-fresh.length;
  el.innerHTML='<b>'+fresh.length+'</b> filter'+(fresh.length===1?'':'s')+' ready to add'
    +(dupes?' · <span class="sflt-dupe">'+dupes+' already saved (skipped)</span>':'')
    +(parsed.length?'':' — no links found in that paste');
  el.className='sflt-bulk-info'+(fresh.length?' ok':'');
}
async function sfltBulkAdd(){
  var t=(document.getElementById('sflt-bulk')||{}).value||'';
  var tag=(document.getElementById('sflt-bulk-tag')||{}).value||'KPF';
  var parsed=sfltParseBulk(t);
  if(!parsed.length){ showToast('No links found in that paste',true); return; }
  var arr=getSavedFilters();
  var have={}; arr.forEach(function(f){ have[String(f.url||'').toLowerCase()]=1; });
  var fresh=parsed.filter(function(p){ return !have[p.url.toLowerCase()]; });
  if(!fresh.length){ showToast('All of those are already saved',true); return; }
  var btn=document.getElementById('sflt-bulk-btn');
  if(btn){ btn.disabled=true; btn.textContent='Adding '+fresh.length+'…'; }
  var bpoa=sfltNewPoa('bulk');
  var added=fresh.map(function(p,i){ return {id:sfltUid()+i.toString(36),title:p.title,url:p.url,note:p.note,tag:tag,pos:arr.length+i,archived:false,
                                             vas:bpoa.vas.slice(),slot:bpoa.slot}; });
  var merged=arr.concat(added);
  saveSavedFilters(merged);
  // push to the table in batches so a big paste doesn't fire 1000 separate requests
  if(DB_ENABLED&&SFLT_TABLE_OK!==false){
    for(var s=0;s<added.length;s+=200){
      var batch=added.slice(s,s+200).map(function(f,k){ return sfltRowOut(f,arr.length+s+k); });
      try{ await fetch(SUPABASE_URL+'/rest/v1/saved_filters',{method:'POST',headers:sfltHeaders({'Prefer':'resolution=merge-duplicates'}),body:JSON.stringify(batch)}); }catch(e){}
    }
  }
  var bx=document.getElementById('sflt-bulk'); if(bx) bx.value='';
  if(typeof mgr_currentTab!=='undefined'&&mgr_currentTab==='filters') mgr_renderFilters(); else mgr_renderSettings();
  showToast('Added '+added.length+' filter'+(added.length===1?'':'s')+' ✓'
    +(bpoa.vas.length?' — all on '+bpoa.vas.map(function(v){return vaDisp(v);}).join(' + ')+"'s POA":' — in your library'));
}
function sfltManageHTML(){
  var all=getSavedFilters();
  var live=all.filter(function(f){return !f.archived;}).length;
  return '<div class="settings-card" data-sg="leads">'
    +'<div class="settings-title">🔎 Saved Filters <span class="sflt-total">'+all.length+'</span></div>'
    +'<div class="settings-sub">Your KPF / Keepa filter library — VAs open these from a searchable panel on their shift, and you can reference one in a POA ("run the 7-day drop filter"). '+live+' live for VAs. Every open is logged so you can see which ones actually produce leads. Nothing is ever binned automatically.</div>'
    +'<div id="sflt-toolbar">'+sfltToolbarHTML()+'</div>'
    +'<div class="sflt-list" id="sflt-list-host">'+sfltRowsHTML()+'</div>'
    +'<div class="sflt-add">'
      +'<div class="sflt-r1"><input class="settings-input" id="sflt-title" placeholder="Filter name — e.g. 7-day drop £50+">'
        +'<select class="sflt-tag" id="sflt-tag">'+SFLT_TAGS.map(function(t){return '<option>'+t+'</option>';}).join('')+'</select></div>'
      +'<input class="settings-input" id="sflt-url" placeholder="Paste the filter link (Keepa / SellerAmp / KPF)">'
      +'<input class="settings-input" id="sflt-note" placeholder="Note for the VA (optional)">'
      +sfltPoaPickerHTML('add')
      +'<button class="btn btn-success" style="margin-top:10px;" onclick="sfltAdd()">+ Add filter</button>'
    +'</div>'
    +'<div class="sflt-bulk-wrap">'
      +'<div class="sflt-bulk-h">📥 Bulk add — paste your whole Discord channel</div>'
      +'<textarea class="settings-input sflt-bulk-ta" id="sflt-bulk" rows="5" placeholder="Paste many at once, one per line:&#10;7-day drop £50+ | https://keepa.com/... | all great sellers&#10;Samsung storefront - https://keepa.com/...&#10;https://keepa.com/..." oninput="sfltBulkPreview()"></textarea>'
      +'<div class="sflt-bulk-info" id="sflt-bulk-info">Paste as many as you like — one per line. Any of these work: <b>Name | link | note</b>, <b>Name - link</b>, or just the link on its own.</div>'
      +sfltPoaPickerHTML('bulk')
      +'<div class="sflt-bulk-row"><select class="sflt-tag" id="sflt-bulk-tag">'+SFLT_TAGS.map(function(t){return '<option>'+t+'</option>';}).join('')+'</select>'
      +'<button class="btn btn-success" id="sflt-bulk-btn" onclick="sfltBulkAdd()">Add them all</button></div>'
    +'</div>'
    +'</div>';
}
// pull the freshest saved filters from the cloud (so VAs get renames/additions mid-shift)
function refreshSavedFiltersFromCloud(){
  if(typeof SUPABASE_URL==='undefined'||!DB_ENABLED) return Promise.resolve();
  return sfltLoadCloud().then(function(){ try{ renderSavedFiltersVA(); }catch(e){} }).catch(function(){});
}

/* ══════════ FILTER USAGE — which filters actually produce leads ══════════
   A row is logged every time a VA opens one. The VA then taps the leads
   stepper on the "used today" strip. Jack sees the numbers; NOTHING is ever
   auto-archived or binned off the back of them — that stays his call. */
function fuToday(){ try{ return (typeof mgr_ukToday==='function')?mgr_ukToday():new Date().toLocaleDateString('en-GB'); }catch(e){ return new Date().toLocaleDateString('en-GB'); } }
function fuLocal(){ try{ var a=JSON.parse(lsGet('bdl_filter_usage')||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function fuLocalSet(a){ try{ lsPut('bdl_filter_usage',JSON.stringify(a.slice(-400))); }catch(e){} }
function fuLog(id){
  if(IS_PREVIEW) return;
  var f=getSavedFilters().filter(function(x){return x.id===id;})[0]; if(!f) return;
  var va=(window.state&&state.currentVA)||'Jack';
  var day=fuToday();
  var all=fuLocal();
  var row=all.filter(function(u){return u.filter_id===id&&u.date===day&&u.va===va;})[0];
  if(!row){
    row={filter_id:id,title:f.title||'',tag:f.tag||'KPF',va:va,date:day,leads:0,opens:1,_new:true};
    all.push(row);
  } else { row.opens=(row.opens||1)+1; }
  fuLocalSet(all);
  if(DB_ENABLED&&row._new){
    row._new=false; fuLocalSet(all);
    fetch(SUPABASE_URL+'/rest/v1/filter_usage',{method:'POST',headers:sfltHeaders(),body:JSON.stringify({filter_id:id,title:row.title,tag:row.tag,va:va,date:day,leads:0})}).catch(function(){});
  }
  setTimeout(function(){ try{ renderSavedFiltersVA(); }catch(e){} },250);
}
function fuSetLeads(id,d){
  if(IS_PREVIEW) return;
  var day=fuToday(), va=(window.state&&state.currentVA)||'Jack';
  var all=fuLocal();
  var row=all.filter(function(u){return u.filter_id===id&&u.date===day&&u.va===va;})[0]; if(!row) return;
  row.leads=Math.max(0,(parseInt(row.leads)||0)+d);
  fuLocalSet(all);
  if(DB_ENABLED){
    fetch(SUPABASE_URL+'/rest/v1/filter_usage?filter_id=eq.'+encodeURIComponent(id)+'&date=eq.'+encodeURIComponent(day)+'&va=eq.'+encodeURIComponent(va),
      {method:'PATCH',headers:sfltHeaders(),body:JSON.stringify({leads:row.leads})}).catch(function(){});
  }
  try{ renderSavedFiltersVA(); }catch(e){}
}
// rolled-up stats per filter, for Jack's settings rows + insights (local + whatever we've pulled)
function fuStatsAll(){
  var out={};
  var src=(window._fuCloud&&window._fuCloud.length)?window._fuCloud:fuLocal();
  src.forEach(function(u){
    var k=u.filter_id; if(!k) return;
    if(!out[k]) out[k]={uses:0,leads:0,last:''};
    out[k].uses+=(parseInt(u.opens)||1);
    out[k].leads+=(parseInt(u.leads)||0);
    if(u.date>out[k].last) out[k].last=u.date;
  });
  return out;
}
function fuLoadCloud(){
  if(!DB_ENABLED) return Promise.resolve([]);
  return fetchT(SUPABASE_URL+'/rest/v1/filter_usage?select=*&order=opened_at.desc&limit=4000',{headers:sfltHeaders()})
    .then(function(r){ return r.ok?r.json():[]; })
    .then(function(rows){ window._fuCloud=rows||[]; return window._fuCloud; })
    .catch(function(){ return []; });
}

// VA-side panel on the shift — searchable + paged so 1000s stay usable
var vafQuery='', vafShow=25, vafTag='';
function vafSearch(v){ vafQuery=String(v||'').toLowerCase().trim(); vafShow=25; renderSavedFiltersVA(true); }
function vafMore(){ vafShow+=50; renderSavedFiltersVA(true); }
function vafSetTag(t){ vafTag=(vafTag===t?'':t); vafShow=25; renderSavedFiltersVA(true); }
function renderSavedFiltersVA(keepOpen){
  var host=document.getElementById('va-filters'); if(!host) return;
  if(SFLT_VA_RETIRED){ host.innerHTML=''; return; }                // the Suite is the list now
  var all=getSavedFilters().filter(function(f){ return !f.archived; });
  if(!all.length){ host.innerHTML=''; return; }
  var TAGC={KPF:'#18c8f0',Keepa:'#8b5cff','A2A':'#f5a524',Storefront:'#10d99a',Other:'#7c8598'};
  var wasOpen=keepOpen||(host.querySelector('details')&&host.querySelector('details').open);

  var matched=all.filter(function(f){
    if(vafTag&&(f.tag||'KPF')!==vafTag) return false;
    if(!vafQuery) return true;
    return ((f.title||'')+' '+(f.note||'')+' '+(f.tag||'')).toLowerCase().indexOf(vafQuery)>=0;
  });
  var shown=matched.slice(0,vafShow);

  // "used today" strip — where the VA logs how many leads each filter gave them
  var day=fuToday(), va=(window.state&&state.currentVA)||'Jack';
  var todays=fuLocal().filter(function(u){return u.date===day&&u.va===va;});
  var usedHtml='';
  if(todays.length){
    usedHtml='<div class="vaf-used"><div class="vaf-used-h">Used today — how many leads did each one give you?</div>'
      +todays.map(function(u){
        return '<div class="vaf-used-row"><span class="vaf-used-name">'+escHtml(u.title||'Filter')+'</span>'
          +'<span class="vaf-step"><button onclick="fuSetLeads(\''+u.filter_id+'\',-1)">−</button>'
          +'<b>'+(parseInt(u.leads)||0)+'</b>'
          +'<button onclick="fuSetLeads(\''+u.filter_id+'\',1)">+</button></span></div>';
      }).join('')+'</div>';
  }

  var tags=['KPF','Keepa','A2A','Storefront','Other'].filter(function(t){ return all.some(function(f){return (f.tag||'KPF')===t;}); });
  host.innerHTML='<details class="vaf-wrap"'+(wasOpen?' open':'')+'><summary class="vaf-head">🔎 Saved Filters <span class="vaf-count">'+all.length+'</span><span class="vaf-hint">Jack\'s KPF / Keepa filters — search and tap to open</span></summary>'
    +'<div class="vaf-tools">'
      +'<input class="vaf-search" id="vaf-search" placeholder="Search filters…" value="'+escHtml(vafQuery)+'" oninput="vafSearch(this.value)">'
      +'<div class="vaf-tags">'+tags.map(function(t){ return '<button class="vaf-tagbtn'+(vafTag===t?' on':'')+'" style="--c:'+(TAGC[t]||'#18c8f0')+'" onclick="vafSetTag(\''+t+'\')">'+t+'</button>'; }).join('')+'</div>'
    +'</div>'
    +usedHtml
    +'<div class="vaf-list">'+(shown.length?shown.map(function(f){
      var c=TAGC[f.tag||'KPF']||'#18c8f0';
      return '<a class="vaf-row" href="'+String(f.url||'#').replace(/"/g,'&quot;')+'" target="_blank" onclick="fuLog(\''+f.id+'\')">'
        +'<span class="vaf-tag" style="--c:'+c+'">'+(f.tag||'KPF')+'</span>'
        +'<span class="vaf-name">'+escHtml(f.title||'Filter')+(f.note?'<span class="vaf-note">'+escHtml(f.note)+'</span>':'')+'</span>'
        +'<span class="vaf-open">Open ↗</span></a>';
    }).join(''):'<div class="vaf-empty">Nothing matches that search.</div>')
    +(matched.length>shown.length?'<button class="vaf-more" onclick="vafMore()">Show more · '+(matched.length-shown.length)+' left</button>':'')
    +'</div></details>';
  if(keepOpen){ var s=document.getElementById('vaf-search'); if(s){ s.focus(); s.selectionStart=s.value.length; } }
}
function nbChip(el){
  var i=document.getElementById('nb-in'); if(!i) return;
  i.value=(i.value.trim()?i.value.trim()+' · ':'')+el.textContent;
  nbGrow(i); i.focus(); try{ i.selectionStart=i.selectionEnd=i.value.length; }catch(e){}
}
function nbSave(){
  var p=window._noteFor; if(!p) return;
  var l=leads.find(function(x){return x.id===p.id;});
  var i=document.getElementById('nb-in'); var txt=i?i.value.trim():'';
  if(l){
    /* The box shows the note WITHOUT its [why:code] tag (the tag in the box meant
       retyping the note silently deleted the reason). So the tag must be put back
       here. Removing the reason is the "change" button's job, never a side effect
       of editing text. */
    var _tag=(String(l.notes||'').match(/^\[why:[a-z]+\]/)||[])[0]||'';
    var _lbl=_tag?((reasonOf(l.notes)||{}).l||''):'';
    var final;
    if(_tag){
      if(!txt) final=_tag+(_lbl?' '+_lbl:'');                         // text cleared — reason stays
      else if(_lbl && txt.indexOf(_lbl)===0) final=_tag+' '+txt;      // he kept the label prefix
      else final=_tag+' '+(_lbl?_lbl+' · ':'')+txt;                   // new text — keep label for the sheet
    } else final=txt;
    l.notes=final; db_leadPatch(l,{jack_comment:final});
    var tw=noteMirror(l);
    ldToast(txt?('Note saved — writing to sheet'+(tw?' · and to '+vaDisp(tw.va)+'’s copy':'')):'Note cleared');
  }
  /* Unmounting the box here yanked 283px out of the rail the instant he pressed
     Save — the third of four layout lurches in one decision. The box stays, holding
     the saved text; it only leaves when he moves to another lead or skips it. */
  if(p.manual){ try{selectLead(p.id,true);}catch(e){renderList();} }   // manual: save & stay on this lead
  else advanceAfter(p.id);                                             // after a decision: save & stay put
}
function nbSkip(){ var p=window._noteFor; window._noteFor=null; if(!p) return; if(p.manual){ try{selectLead(p.id,true);}catch(e){renderList();} } else advanceAfter(p.id); }
/* Grow to fit what's been typed, up to a sane ceiling, then scroll. Called on input
   and once on open so an existing long note is fully visible the moment it appears. */
function nbGrow(el){
  if(!el) return;
  el.style.height='auto';
  el.style.height=Math.min(el.scrollHeight, 220)+'px';
}
/* Measured: pressing BOUGHT scrolled the detail pane 323px in one jump, because
   focusing the note box makes the browser scroll it into view — taking the price, the
   profit and the screenshot off screen at the exact moment he decided. preventScroll
   keeps the page still; block:'nearest' then nudges only if the box is actually out of
   sight, and only by the smallest amount. */
function nbFocus(){ setTimeout(function(){
  var i=document.getElementById('nb-in');
  if(!i) return;
  nbGrow(i);
  try{ i.focus({preventScroll:true}); }catch(e){ i.focus(); }
  try{ i.selectionStart=i.selectionEnd=i.value.length; }catch(e){}
  try{
    var r=i.getBoundingClientRect();
    if(r.top<0||r.bottom>window.innerHeight) i.scrollIntoView({block:'nearest'});
  }catch(e){}
},90); }
function setL(id,v){
  const l=leads.find(x=>x.id===id);
  if(l){l.islead=v;l.seen=true;markSeen(l._sid);
    if(v){db_leadPatch(l,{islead:'LEAD'});}
    else{l.status='passed';var patch={islead:'NOT LEAD',status:'NOT'};if(l.notes&&l.notes.trim())patch.jack_comment=l.notes.trim();db_leadPatch(l,patch);}}
  var _twL=l?(v ? twinApply(l,{islead:'LEAD'},{islead:true})
                : twinApply(l,{islead:'NOT LEAD',status:'NOT'},{islead:false,status:'passed'})):0;
  try{ if(l) logDecision(l); }catch(e){}   // log at DECISION time — advanceAfter only fires if he finishes the note step
  ldToast((v?'LEAD ✓ — writing to sheet':'NOT LEAD + NOT BOUGHT ✕ — both written to sheet')+twinToast(_twL));
  // NOT-a-lead is a finished decision → let it leave the list; LEAD stays open so
  // he can pick BOUGHT/ATB next without losing his place.
  if(v){ try{selectLead(id,true);}catch(e){renderList();} }
  else { window._noteFor={id:id}; try{selectLead(id,true);}catch(e){renderList();} nbFocus(); afterDecision(id); }
}
/* ── KEEPING THE PROMISE THE MERGED ROW MAKES ─────────────────────────────────
   ldMergeTwins() hides N-1 identical copies behind one row and the panel states
   "Deciding it here decides all N." It did not. setSt/setL only ever wrote the
   VISIBLE lead, so the hidden copies stayed undecided — and because the merge
   aborts as soon as ANY copy is decided, they popped straight back out as separate
   undecided rows. The feature that exists to remove duplicates was manufacturing
   them. Live proof: B0DP56SQH4, three identical Argos copies at £37.59 — Suz's went
   BOUGHT, Mera's two are still sitting there as New.
   Twins are same ASIN + same supplier + same buy price, so one decision is the right
   answer for all of them. Never overwrite a copy that already has its own decision. */
function twinApply(l, patch, fields){
  try{
    var ids=(l&&l._twinIds)||[]; if(!ids.length) return 0;
    var done=0;
    ids.forEach(function(id){
      var t=(window.leads||[]).find(function(x){ return x.id===id; });
      if(!t || t===l) return;
      if(t.status || t.islead!==null) return;            // already decided on its own — leave it
      for(var k in fields) t[k]=fields[k];
      t.seen=true;
      try{ markSeen(t._sid); }catch(e){}
      try{ db_leadPatch(t, patch); }catch(e){}
      try{ logDecision(t); }catch(e){}
      done++;
    });
    if(done) try{ dupeMapDirty(); }catch(e){}
    return done;
  }catch(e){ return 0; }
}
function twinToast(nDone){
  if(!nDone) return '';
  return ' · applied to '+nDone+' identical cop'+(nDone===1?'y':'ies');
}
function setSt(id,st){
  const l=leads.find(x=>x.id===id);
  if(l){l.status=st;l.seen=true;l.islead=true;markSeen(l._sid);
  var patch={status:sheetStatusOut(st),islead:'LEAD'};
  if(st==='passed'&&l.notes&&l.notes.trim())patch.jack_comment=l.notes.trim();
  db_leadPatch(l,patch);
  // score-mismatch = teaching signal: bought a low score / rejected a high score → Auto-tune learns from it
  if(st==='bought'&&l._sc&&l._sc.total<5){ setTimeout(function(){ldToast('You bought a '+l._sc.total+'/10 — the score under-rated it. Auto-tune (Settings → Leads) learns from this');},900); }
  if(st==='passed'&&l._sc&&l._sc.total>=8){ setTimeout(function(){ldToast('You passed on a '+l._sc.total+'/10 — Auto-tune can learn from this too');},900); }
  try{ logDecision(l); }catch(e){}   // log at DECISION time — advanceAfter only fires if he finishes the note step
  try{ dupeMirror(id,st); }catch(e){}   // if he armed "both", the other VA's copy follows
  var _tw=twinApply(l,{status:sheetStatusOut(st),islead:'LEAD'},{status:st,islead:true});
  dupeMapDirty();               // a decision can change who counts as a duplicate
  window._noteFor={id:id};      // set BEFORE painting so the qty/note panel is there first time
  _pendingLeave=id;             // hold it on screen until he moves to another lead
  try{ afterDecision(id); }catch(e){ try{ renderList(); }catch(_){} }
}
ldToast((st==='bought'?'BOUGHT ✓':st==='passed'?'Marked NOT':st==='waiting'?'Marked WAITING':'ATB ✓')+' — writing to sheet'+twinToast(typeof _tw!=='undefined'?_tw:0));
try{ nbFocus(); }catch(e){}}
function undoA(id){window._noteFor=null;const l=leads.find(x=>x.id===id);if(l){l.status=null;l.islead=null;l.seen=true;db_leadPatch(l,{status:null,islead:null});}renderList();}
function saveN(id){
  const l=leads.find(x=>x.id===id),ta=document.getElementById('mn');
  if(l&&ta){
    l.notes=ta.value; db_leadPatch(l,{jack_comment:ta.value});
    var tw=noteMirror(l);
    ldToast('Note saved — writing to sheet'+(tw?' · and to '+vaDisp(tw.va)+'’s copy':''));
  }
}
function cpDiscord(id){
  const l=leads.find(x=>x.id===id);if(!l)return;
  const txt='**'+l.title+'**\n'
    +'ASIN: `'+l.asin+'` · '+l.store+' · via '+l.src+'\n'
    +'Buy £'+l.buy+' → Sell £'+l.sell+' · Profit **£'+f2(l.profit)+'** · ROI **'+l.roi+'%** · SPM '+spml(l.spm)+' · '+l.fba+' FBA sellers\n'
    +'Score: '+(((l._sc&&l._sc.total)||0)).toFixed(1)+'/10 ('+scGrade((l._sc&&l._sc.total)||0)+')\n'
    +l.amz+'\n'+l.sup;
  navigator.clipboard?.writeText(txt).catch(()=>{});
  ldToast('Lead copied — paste straight into Discord ✓');
}
function cpA(a,e){navigator.clipboard?.writeText(a).catch(()=>{});ldToast('Copied ASIN: '+a);const btn=e&&e.currentTarget||document.querySelector('#view-leads .d-asin');if(btn){const orig=btn.innerHTML;btn.classList.add('copied');btn.innerHTML=ICO.check+' Copied!';setTimeout(()=>{btn.classList.remove('copied');btn.innerHTML=orig;},1400);}}
function setView(b,v){view=v;selId=null;document.querySelectorAll('#view-leads [data-view]').forEach(x=>x.classList.remove('on'));b.classList.add('on');const t={new:'New Leads',all:'All Leads',lead:'Leads',bought:'Bought',basket:'In Basket',passed:'Passed',notlead:'Not a Lead'};document.getElementById('view-title').textContent=t[v]||v;renderList()}
// clickable stat ribbon → jump to a view / toggle the stale-only filter
/* Switch to All and drop every filter that could still hide the match — the date
   filter especially, since Jack's default is "whatever months I've ticked" and an older
   lead would vanish again the moment the view changed. The search box is left alone. */
function ldSearchEverywhere(){
  window._staleFilter=false;
  try{ if(typeof focusStop==='function' && window.FOCUS_ON) focusStop(); }catch(e){}
  ['f-store','f-cat','f-source','f-sup','f-roi','f-profit','f-fba'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value='all'; });
  var fd=document.getElementById('f-date'); if(fd) fd.value='all';
  var b=document.querySelector('#view-leads [data-view="all"]');
  if(b) setView(b,'all'); else renderList();
}
function gotoView(v){ window._staleFilter=false; var b=document.querySelector('#view-leads [data-view="'+v+'"]'); if(b) setView(b,v); else renderList(); }
function toggleStale(){ window._staleFilter=!window._staleFilter; if(window._staleFilter){ var nb=document.querySelector('#view-leads [data-view="new"]'); if(nb&&view!=='new'&&view!=='all') setView(nb,'new'); } renderList(); }
function setVA(b,v){va=v;selId=null;document.querySelectorAll('#view-leads [data-va]').forEach(x=>x.classList.remove('on'));b.classList.add('on');renderList()}
function setScore(b,m){scoreMin=m;selId=null;document.querySelectorAll('#view-leads [data-sc]').forEach(x=>x.classList.remove('on'));b.classList.add('on');renderList()}
function setSort(b,s){sortBy=s;document.querySelectorAll('#view-leads [data-sort]').forEach(x=>x.classList.remove('on'));b.classList.add('on');
  try{ lsPut('bdl_sort',s); }catch(e){}
  renderList()}
/* restore the saved sort once the buttons exist — same per-machine rule as bdl_fdate */
function sortRestore(){
  try{
    var v=lsGet('bdl_sort'); if(!v) return;
    var b=document.querySelector('#view-leads [data-sort="'+v+'"]'); if(!b) return;
    sortBy=v;
    document.querySelectorAll('#view-leads [data-sort]').forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
  }catch(e){}
}
// "Pick a day…" reveals a native date input; choosing a date filters to that exact day
/* Jack: "this should be local save — I might just wanna see this month's leads."
   The pick survives a reload; per-machine, never synced. */
function fDateSave(){ try{ var s=document.getElementById('f-date');
  lsPut('bdl_fdate', JSON.stringify({v:s?s.value:'sheet', d:window._fDay||null})); }catch(e){} }
function fDateRestore(){
  try{
    var saved=JSON.parse(lsGet('bdl_fdate')||'null'); if(!saved) return;
    var s=document.getElementById('f-date'); if(!s) return;
    if(![].some.call(s.options,function(o){ return o.value===saved.v; })) return;
    s.value=saved.v;
    var dp=document.getElementById('f-day');
    if(saved.v==='day'&&saved.d){ window._fDay=saved.d; if(dp){ dp.value=saved.d; dp.style.display=''; } }
  }catch(e){}
}
function fDateChange(){ var s=document.getElementById('f-date'), dp=document.getElementById('f-day');
  if(s.value==='day'){ if(dp){ dp.style.display=''; if(!dp.value){ dp.value=new Date().toISOString().slice(0,10); } window._fDay=dp.value; dp.focus(); } }
  else { if(dp) dp.style.display='none'; window._fDay=null; }
  fDateSave();
  renderList();
}
function fDaySet(v){ window._fDay=v; var s=document.getElementById('f-date'); if(s&&v) s.value='day'; fDateSave(); renderList(); }
function clearFilters(){['f-store','f-cat','f-source','f-sup','f-roi','f-profit','f-fba'].forEach(function(id){var e=document.getElementById(id);if(e)e.value='all';});document.getElementById('search').value='';var s=document.getElementById('f-date');if(s)s.value='month';var dp=document.getElementById('f-day');if(dp)dp.style.display='none';window._fDay=null;window._staleFilter=false;fDateSave();renderList()}
let _ldtt;function ldToast(msg){const el=document.getElementById('ld-toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(_ldtt);_ldtt=setTimeout(()=>el.classList.remove('show'),2400)}
function moveSel(dir){
  const fl=getF();if(!fl.length)return;
  let idx=fl.findIndex(l=>l.id===selId);
  idx=Math.max(0,Math.min(fl.length-1,idx+dir));
  selectLead(fl[idx].id,true);
  const row=document.querySelector('#view-leads .litem.sel');if(row)row.scrollIntoView({block:'nearest'});
}
/* after every decision: bump the session counter, re-render, and AUTO-ADVANCE to the
   next undecided lead in the current view — Jack grinds the pile without touching the mouse */
/* The next undecided lead, on demand. Wraps around, and says so when there are none. */
function ldNextUndecided(fromId){
  try{
    var fl=getF(); var i=fl.findIndex(function(l){ return l.id===fromId; });
    var nxt=null;
    for(var k=i+1;k<fl.length;k++){ if(fl[k].islead===null&&!fl[k].status){ nxt=fl[k]; break; } }
    if(!nxt) for(var k2=0;k2<fl.length;k2++){ if(k2!==i&&fl[k2].islead===null&&!fl[k2].status){ nxt=fl[k2]; break; } }
    if(!nxt){ ldToast('Nothing else undecided in this view ✓'); return; }
    selectLead(nxt.id,true);
    var row=document.querySelector('#view-leads .litem.sel'); if(row) row.scrollIntoView({block:'nearest'});
  }catch(e){}
}
function advanceAfter(id){
  if(!window._sessStart) window._sessStart=Date.now();
  window._sessDecided=(window._sessDecided||0)+1;
  try{ var _dl=leads.find(function(x){return x.id===id;}); if(_dl) logDecision(_dl); }catch(e){}   // log to cloud history
  // CONTINUOUS LEARNING: in smart mode, every decision retrains the model + rescores,
  // so it keeps up with how your criteria shift lead to lead.
  try{ if(getAppSettings().scoreMode==='smart'){ var m=trainSmartModel();
    if(m&&!m.err){ leads.forEach(function(l){ l._sc=calcScore({roi:l.roi,profit:l.profit,spm:l.spm,fba:l.fba,margin:l.margin}); }); } } }catch(e){}
  if(!ldRowRefresh(id)) renderList();      // same reason — touch one row
  try{
    /* deliberately NOT jumping to the next lead — see ldNextUndecided() */
    selectLead(id,true);
  }catch(e){}
  try{ var sc=document.getElementById('sess-count'); if(sc) sc.textContent='🔥 '+window._sessDecided+' decided this session'; }catch(e){}
}
document.addEventListener('keydown',e=>{
  const lv=document.getElementById('view-leads');
  if(!lv||!lv.classList.contains('active'))return;
  // Cmd/Ctrl/Alt combos belong to the browser — copy, paste, select-all, find.
  // Without this, Cmd+C was read as the bare "c" shortcut path and the keystroke
  // never reached the clipboard, so double-click-then-copy did nothing.
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  const typing=/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)||document.activeElement.isContentEditable;
  if(e.key==='/'&&!typing){e.preventDefault();document.getElementById('search').focus();return;}
  /* He decides with one key (B/N/L/A/W); the reason should cost one more, not a
     mouse trip across the panel. 1-9 map to the reasons offered for THAT decision. */
  if(!typing && /^[1-9]$/.test(e.key)){
    var _l=(window.leads||[]).find(function(x){ return x.id===selId; });
    if(_l && (_l.status||_l.islead===false)){
      var _opts=(_l.islead===false && !_l.status) ? LEAD_REASONS.filter(function(r){return r.for==='no';}) : reasonsFor(_l);
      var _pick=_opts[parseInt(e.key,10)-1];
      if(_pick){ e.preventDefault(); reasonSet(_l.id,_pick.c); return; }
    }
  }
  if(e.key==='Escape'&&typing){document.activeElement.blur();return;}
  if(typing)return;
  if(e.key==='ArrowDown'){e.preventDefault();moveSel(1);}
  else if(e.key==='ArrowUp'){e.preventDefault();moveSel(-1);}
  else if(e.key==='l'||e.key==='L'){const l=leads.find(x=>x.id===selId);if(l&&l.islead===null)setL(selId,true);}
  else if(e.key==='n'||e.key==='N'){const l=leads.find(x=>x.id===selId);if(l&&l.islead===null)setL(selId,false);}
  // one-keystroke full decisions (approve + status in a single sheet write)
  else if(e.key==='b'||e.key==='B'){const l=leads.find(x=>x.id===selId);if(l&&l.status!=='bought')setSt(selId,'bought');}
  else if(e.key==='a'){const l=leads.find(x=>x.id===selId);if(l)setSt(selId,'atbq');}
  else if(e.key==='A'){const l=leads.find(x=>x.id===selId);if(l)setSt(selId,'atba2a');}
  else if(e.key==='w'||e.key==='W'){const l=leads.find(x=>x.id===selId);if(l)setSt(selId,'waiting');}
  else if(e.key==='u'||e.key==='U'){const l=leads.find(x=>x.id===selId);if(l&&(l.status||l.islead!==null))undoA(selId);}
});
try{renderList();}catch(e){}

