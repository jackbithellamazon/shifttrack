/* ── FILTERS TAB — the whole saved-filter library in one place ──────────────
   Was a card buried in Settings → Leads, which doesn't work once there are
   thousands of them. Library + bulk import + what each one actually produces. */
/* ── OA SOURCING, SEEN FROM HERE ─────────────────────────────────────────────
   Jack, 20/09: "you just concentrate on seeing the OA sourcing through ShiftTrack —
   I will design and fix OA sourcing myself". So this is a WINDOW, never a copy:
     · it READS src_sources and src_runs and shows counts and links, nothing else
     · no sell price, VAT, velocity or demand maths is repeated here — that lives in
       the Sourcing app and must only ever live there
     · it spends no Keepa tokens; a run costs tokens only inside the Sourcing app
     · it removes nothing. The saved-filter library, the VA logging and the leads page
       all stay exactly as they are (Jack, 20/09: "don't ever remove anything").
   Due dates use the Sourcing app's own rule (cadence days after the last run, overdue
   once that day has passed) so the two screens never disagree. */
var OA_SRC=null, OA_RUNS=null, OA_AT=0, OA_LOADING=false, OA_ERR='';
var OA_CADENCE_DAYS={daily:1,'2 days':2,'3 days':3,weekly:7,adhoc:0};
function oaAppUrl(){ return (typeof SOURCING_APP_URL==='string'&&SOURCING_APP_URL)||'https://jackbithellamazon.github.io/BDL-Sourcing-Suite/'; }
/* #run=<key>&who=<Name> opens that run screen with the name already set, so the
   who-are-you gate never appears. The Sourcing app matches who= anywhere in the hash. */
function oaRunLink(key,who){ return oaAppUrl()+'#run='+encodeURIComponent(key)+(who?'&who='+encodeURIComponent(who):''); }
function oaDueLink(who){ return oaAppUrl()+'#due'+(who?'&who='+encodeURIComponent(who):''); }
function oaTodayISO(){ try{ return sbToISO(sbToday()); }catch(e){ return new Date().toISOString().slice(0,10); } }
function oaLoad(force){
  if(!force && OA_SRC && OA_RUNS && (Date.now()-OA_AT)<120000) return Promise.resolve(true);
  if(typeof SUPABASE_URL==='undefined' || typeof DB_ENABLED==='undefined' || !DB_ENABLED) return Promise.resolve(false);
  if(OA_LOADING) return Promise.resolve(false);
  OA_LOADING=true; OA_ERR='';
  var h={apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY};
  var since=new Date(Date.now()-60*86400000).toISOString().slice(0,10);
  return Promise.all([
    fetchT(SUPABASE_URL+'/rest/v1/src_sources?select=key,data',{headers:h}).then(function(r){ return r.ok?r.json():[]; }),
    fetchT(SUPABASE_URL+'/rest/v1/src_runs?select=source_key,day,at,who,data&day=gte.'+since+'&order=at.desc',{headers:h}).then(function(r){ return r.ok?r.json():[]; })
  ]).then(function(a){ OA_SRC=a[0]||[]; OA_RUNS=a[1]||[]; OA_AT=Date.now(); OA_LOADING=false; return true; })
   .catch(function(e){ OA_ERR=String((e&&e.message)||e); OA_LOADING=false; return false; });
}
function oaLastRun(key){
  var rs=(OA_RUNS||[]).filter(function(r){ return r.source_key===key; });   // already newest-first
  return rs.length?rs[0]:null;
}
/* the Sourcing app's own dueState(), mirrored */
function oaDue(src){
  var d=(src&&src.data)||{}, t=oaTodayISO();
  if(d.status==='paused') return {label:'Paused', due:false, rank:9000, tone:'off'};
  var last=oaLastRun(src.key), days=OA_CADENCE_DAYS[String(d.cadence||'')]||0;
  if(!last) return {label:'Never run', due:true, rank:1, tone:'amber', sub:'no run recorded'};
  var lastDay=String(last.day||last.at||'').slice(0,10);
  if(lastDay===t) return {label:'Done today', due:false, rank:8000, tone:'green', sub:'by '+(String(last.who||'').trim()||'not recorded')};
  if(!days) return {label:'One-off', due:false, rank:5000, tone:'off'};
  var nx=new Date(String(last.at)); nx.setDate(nx.getDate()+days);
  var nxDay=nx.toISOString().slice(0,10);
  if(nxDay<t){ var od=Math.round((new Date(t)-new Date(nxDay))/864e5);
    return {label:'Overdue · '+od+'d', due:true, rank:0, tone:'red', sub:'last run '+lastDay}; }
  if(nxDay===t) return {label:'Due today', due:true, rank:1, tone:'amber', sub:'last run '+lastDay};
  var inD=Math.round((new Date(nxDay)-new Date(t))/864e5);
  return {label:'in '+inD+'d', due:false, rank:100+inD, tone:'off', sub:'last run '+lastDay};
}
function oaNum(v){ return (v===0||v)?v:'—'; }
/* ── WHO IS ALLOWED TO SEE A SOURCE ──────────────────────────────────────────
   Sourcing Suite, 21/09, quoting Jack: "put all brands onto n/a so I can choose — I
   don't want VAs seeing all of the stuff yet" and "Mera shouldn't see Suz's and Suz
   shouldn't see Mera's". So an UNOWNED source is NOT a shared pool anyone can pick
   up — it is Jack's until he hands it out. Owner is the key:
       owner Suz  → Jack + Suz     owner Mera → Jack + Mera
       owner VAs  → everyone       owner none → Jack only
   Anything VA-facing in ShiftTrack must go through this. */
function oaOwner(src){ var o=String(((src&&src.data)||{}).owner||'').trim(); return (o==='—'||o==='-')?'':o; }
function oaCanSee(src,person){
  if(person==='Jack') return true;
  var o=oaOwner(src);
  if(!o) return false;                 // unassigned = Jack's, never a VA's
  if(o==='VAs') return true;
  return o===person;
}
function oaVisible(list,person){ return (list||[]).filter(function(x){ return oaCanSee(x,person); }); }
/* ── THE VA's OWN SOURCES, ON HER EVERYDAY TASK ──────────────────────────────
   Her sources ride on the task that already opens the Sourcing app, rather than a
   second surface — so they inherit the row she knows: Open, a timer, and a lead
   count per link. Everything goes through oaCanSee, so she only ever sees her own:
   never Suz's, never Mera's, and never an unassigned brand run.
   Jack is deliberately holding the unowned ones, so a short list is the right list. */
function oaAttachSources(tasks,va){
  if(va!=='Mera'&&va!=='Suz') return 0;
  if(!OA_SRC||!OA_RUNS) return 0;
  var t=null;
  for(var i=0;i<tasks.length;i++){ if(tasks[i].id==='kpf-daily'||tasks[i].id==='suz-kpf-daily'){ t=tasks[i]; break; } }
  if(!t) return 0;
  var due=oaVisible(OA_SRC,va)
    .filter(function(x){ return ((x.data||{}).status||'active')!=='paused'; })
    .map(function(x){ return {src:x, due:oaDue(x)}; })
    .filter(function(r){ return r.due.due; })
    .sort(function(a,b){ return a.due.rank-b.due.rank; })
    .slice(0,6);                       // her day, not a backlog wall
  if(!due.length) return 0;
  t.hasLinks=true;
  t.links=t.links||[]; t.linkLeads=t.linkLeads||[]; t.linkFilterIds=t.linkFilterIds||[]; t.linkNames=t.linkNames||[];
  var n=0;
  due.forEach(function(r){
    var id='oa:'+r.src.key;
    if(t.linkFilterIds.indexOf(id)>=0) return;                 // never twice
    var _n=Math.max(t.links.length,t.linkNames.length,t.linkLeads.length,t.linkFilterIds.length);
    while(t.links.length<_n) t.links.push(''); while(t.linkNames.length<_n) t.linkNames.push('');
    while(t.linkLeads.length<_n) t.linkLeads.push(''); while(t.linkFilterIds.length<_n) t.linkFilterIds.push('');
    t.links.push(oaRunLink(r.src.key,va));
    t.linkNames.push('Run · '+String((r.src.data||{}).name||r.src.key)+' — '+r.due.label);
    t.linkLeads.push(''); t.linkFilterIds.push(id);
    n++;
  });
  return n;
}
/* One line on the Overview: where OA sourcing stands, and a way in. Same reader as the
   full panel, so the two can never disagree. Overdue is stated plainly — Jack, via the
   Sourcing Suite, 21/09: "well if she needs to do it as it's overdue, she needs to do it."
   Nothing here softens or hides a late source. */
function oaOverviewLineHTML(){
  if(!OA_SRC||!OA_RUNS) return '';
  var live=(OA_SRC||[]).filter(function(x){ return ((x.data||{}).status||'active')!=='paused'; });
  var owned=live.filter(function(x){ return !!oaOwner(x); });
  var unowned=live.length-owned.length;
  var due=owned.map(oaDue).filter(function(d){ return d.due; });
  var overdue=due.filter(function(d){ return /Overdue/.test(d.label); }).length;
  var t=oaTodayISO();
  var ran=(OA_RUNS||[]).filter(function(r){ return String(r.day||'').slice(0,10)===t; });
  var leads=ran.reduce(function(a,r){ return a+(+((r.data||{}).leads)||0); },0);
  return '<div class="oa-ov" onclick="mgr_switchTab(\'filters\')" title="Open the Filters tab">'
    +'<b>\u{1F50E} OA sourcing</b>'
    +'<span class="oa-ov-n'+(due.length?' hot':'')+'">'+due.length+'</span><em>due now</em>'
    +(overdue?'<span class="oa-ov-bad">'+overdue+' overdue</span>':'')
    +'<span class="oa-ov-n">'+ran.length+'</span><em>run today</em>'
    +'<span class="oa-ov-n'+(leads?' good':'')+'">'+leads+'</span><em>leads from them</em>'
    +(unowned?'<span class="oa-ov-un">'+unowned+' unassigned</span>':'')
    +'<span class="oa-ov-go">Open \u203a</span></div>';
}
function oaPanelHTML(){
  var OPEN='<a class="oa-open" target="_blank" rel="noopener" href="'+oaDueLink('Jack')+'">Open the Sourcing app ↗</a>';
  if(!OA_SRC||!OA_RUNS){
    return '<div class="oa-wrap"><div class="oa-head"><b>\u{1F50E} OA sourcing</b>'
      +'<span>'+(OA_ERR?('couldn’t read it — '+escHtml(OA_ERR)):'reading the Sourcing app’s runs…')+'</span>'+OPEN+'</div></div>';
  }
  var t=oaTodayISO();
  var live=(OA_SRC||[]).filter(function(x){ return ((x.data||{}).status||'active')!=='paused'; });
  var paused=(OA_SRC||[]).length-live.length;
  var today=(OA_RUNS||[]).filter(function(r){ return String(r.day||'').slice(0,10)===t; });
  var tLeads=0,tNew=0;
  today.forEach(function(r){ var d=r.data||{}; tLeads+=(+d.leads||0); tNew+=(+d.new||0); });
  /* "No owner means overdue is meaningless — one line beats 22 red rows." Unassigned
     sources are counted, not ranked, until Jack hands them out. */
  var unowned=live.filter(function(x){ return !oaOwner(x); });
  var owned  =live.filter(function(x){ return !!oaOwner(x); });
  var rows=owned.map(function(x){ return {src:x, due:oaDue(x)}; }).sort(function(a,b){ return a.due.rank-b.due.rank; });
  var dueRows=rows.filter(function(r){ return r.due.due; });
  var doneRows=rows.filter(function(r){ return r.due.label==='Done today'; });
  /* Who ran what is the question this panel exists to answer, so it is the headline —
     and it must stay honest when the answer is "nobody has told us". */
  var whoTally={};
  today.forEach(function(r){ var w=String(r.who||'').trim()||'not recorded'; whoTally[w]=(whoTally[w]||0)+1; });
  var whoLine=Object.keys(whoTally).length
    ? Object.keys(whoTally).map(function(w){ return '<b>'+escHtml(w)+'</b> '+whoTally[w]; }).join(' · ')
    : '<i>nobody yet today</i>';
  var head='<div class="oa-head"><b>\u{1F50E} OA sourcing</b>'
    +'<span>'+live.length+' live source'+(live.length===1?'':'s')+(paused?(' · '+paused+' paused'):'')+'</span>'+OPEN+'</div>';
  var strip='<div class="oa-kpis">'
    +'<div class="oa-k'+(dueRows.length?' hot':'')+'"><b>'+dueRows.length+'</b><em>due now</em></div>'
    +'<div class="oa-k"><b>'+doneRows.length+'</b><em>run today</em></div>'
    +'<div class="oa-k'+(tLeads?' good':'')+'"><b>'+tLeads+'</b><em>leads from today’s runs</em></div>'
    +'<div class="oa-k"><b>'+tNew+'</b><em>new vs last run</em></div>'
    +'<div class="oa-who">Ran by '+whoLine+'</div>'
    +'</div>';
  function line(r){
    var d=r.src.data||{}, du=r.due, last=oaLastRun(r.src.key), ld=last?(last.data||{}):{};
    var who=(d.owner&&['Jack','Mera','Suz'].indexOf(d.owner)>=0)?d.owner:'';
    return '<div class="oa-row">'
      +'<b class="oa-name">'+escHtml(d.name||r.src.key)+'</b>'
      +'<span class="oa-own'+(who?'':' pool')+'">'+escHtml(d.owner||'—')+'</span>'
      +'<span class="oa-cad">'+escHtml(d.cadence||'—')+'</span>'
      +'<span class="oa-due '+du.tone+'">'+escHtml(du.label)+(du.sub?'<i> · '+escHtml(du.sub)+'</i>':'')+'</span>'
      +'<span class="oa-nums">'+(last?('<b>'+oaNum(ld.leads)+'</b> leads last run'+(ld.new?(' · '+ld.new+' new'):'')):'—')+'</span>'
      +'<a class="oa-go" target="_blank" rel="noopener" href="'+oaRunLink(r.src.key,who||'Jack')+'">Run ↗</a>'
      +'</div>';
  }
  var body='';
  if(dueRows.length){
    body+='<div class="oa-sec">Due now — '+dueRows.length+'</div>'
       +dueRows.slice(0,14).map(line).join('')
       +(dueRows.length>14?'<div class="oa-more">+'+(dueRows.length-14)+' more in the app</div>':'');
  } else {
    body+='<div class="oa-sec">Due now</div><div class="oa-none">Nothing due — everything is on cadence.</div>';
  }
  if(unowned.length){
    body+='<div class="oa-none" style="border-top:1px solid rgba(255,255,255,.05);margin-top:8px;padding-top:9px;">'
      +'<b>'+unowned.length+' brand run'+(unowned.length===1?'':'s')+' waiting for you to assign</b>'
      +' — nobody owns '+(unowned.length===1?'it':'them')+' yet, so '+(unowned.length===1?'it is':'they are')
      +' not in anyone’s day and no VA can see '+(unowned.length===1?'it':'them')+'. '
      +'<a class="oa-open" style="margin:0" target="_blank" rel="noopener" href="'+oaDueLink('Jack')+'">Assign them ↗</a></div>';
  }
  if(today.length){
    body+='<div class="oa-sec">Run today — '+today.length+'</div>'
      +today.slice(0,10).map(function(r){
        var d=r.data||{};
        return '<div class="oa-row done">'
          +'<b class="oa-name">'+escHtml(d.name||r.source_key)+'</b>'
          +'<span class="oa-own">'+escHtml(String(r.who||'').trim()||'not recorded')+'</span>'
          +'<span class="oa-cad">'+escHtml(String(r.at||'').slice(11,16))+'</span>'
          +'<span class="oa-nums wide"><b>'+oaNum(d.rowsIn)+'</b> rows in → <b>'+oaNum(d.leads)+'</b> leads'
            +(d.new?(' · '+d.new+' new'):'')+(d.better?(' · '+d.better+' better'):'')+(d.gone?(' · '+d.gone+' gone'):'')+'</span>'
          +'<a class="oa-go ghost" target="_blank" rel="noopener" href="'+oaRunLink(r.source_key,String(r.who||'').trim()||'Jack')+'">Open ↗</a>'
          +'</div>'; }).join('');
  }
  return '<div class="oa-wrap">'+head+strip+body
    +'<div class="oa-foot">Read straight from the Sourcing app — nothing here is typed in by anyone, and opening a link costs no Keepa tokens.</div>'
    +'</div>';
}
function mgr_renderFilters(){
  var host=document.getElementById('mgr-filters-content'); if(!host) return;
  var all=getSavedFilters();
  var live=all.filter(function(f){return !f.archived;}).length;
  var arch=all.length-live;
  var stats=(typeof fuStatsAll==='function')?fuStatsAll():{};
  var used=0, leadsTot=0;
  Object.keys(stats).forEach(function(k){ used++; leadsTot+=(stats[k].leads||0); });

  var html='<div class="mgr-sec2"><div><div class="s-ttl">Saved filters</div>'
    +'<div class="s-sub">Your KPF / Keepa library. Your VAs get this as a searchable panel at the top of their shift — nothing here is ever binned automatically.</div></div>'
    +'<div class="s-right"><a class="s-act" onclick="mgr_switchTab(\'trends\')">Full lead insights →</a></div></div>';
  try{ html=oaPanelHTML()+html; }catch(e){}
  try{ html+=sfltRunsPreviewHTML(); }catch(e){}
  try{ html+=sfltPerfHTML(); }catch(e){}
  html+='<div class="kpi-row" style="margin-bottom:14px;">'
    +mgr_kpi({icon:'layers',label:'In your library',value:all.length,tone:all.length?'purple':'off',
       badge:{t:live+' live',tone:live?'green':'off'}, sub:arch?('<b>'+arch+'</b> archived (hidden from VAs)'):'all visible to your VAs'})
    +mgr_kpi({icon:'inbox',label:'Actually used',value:used,tone:used?'cyan':'off',
       badge:used?{t:'tracked',tone:'cyan'}:{t:'no data',tone:'off'},
       sub:used?'<b>'+leadsTot+'</b> leads logged from them':'opens get logged once your VAs use the panel'})
    +mgr_kpi({icon:'clock',label:'Never opened',value:Math.max(0,live-used),tone:(live-used)>0?'amber':'green',
       badge:(live-used)>0?{t:'review',tone:'amber'}:{t:'all used',tone:'green'},
       sub:(live-used)>0?'sitting in the list, never run':'every live filter has been used'})
    +'</div>';
  html+='<div class="filters-shell">'+sfltManageHTML()+'</div>';
  html+='<div id="filters-perf">'+filterRepeatPanel()+filterPerfPanel('filters')+'</div>';
  try{ html+=sbFilterLeagueHTML(); }catch(e){}     // leads per filter — belongs here, not on Storefronts
  host.innerHTML=html;
  // usage numbers live in their own table — pull once, then repaint
  try{ if(!window._fuCloud && typeof fuLoadCloud==='function'){ fuLoadCloud().then(function(){ if(mgr_currentTab==='filters') mgr_renderFilters(); }); } }catch(e){}
  try{ if(!OA_SRC && typeof oaLoad==='function'){ oaLoad().then(function(ok){ if(ok && mgr_currentTab==='filters') mgr_renderFilters(); }); } }catch(e){}
}
function mgr_renderSpend(){
  var el=document.getElementById('mgr-spend-content'); if(!el) return;
  var mn=['January','February','March','April','May','June','July','August','September','October','November','December'][new Date().getMonth()];
  var head='<div class="mgr-sec2"><div><div class="s-ttl">VA spend — '+mn+'</div><div class="s-sub">The two VA buying lines only. The full business dashboard (team, providers, targets) opens in a new tab.</div></div>'
      +'<div class="s-right"><a class="s-act" onclick="mgr_switchTab(\'settings\');setTimeout(function(){setSettingsGroup(\'vas\');},60)">⚙ Spend settings</a>'
      +'<a class="s-act" href="'+SPEND_DASH_URL+'" target="_blank">Open full dashboard ↗</a></div></div>';
  if(!_spendCache){ el.innerHTML=head+spendSkeleton(false); try{ loadSpend(); }catch(e){} return; }
  var c=_spendCache, A=c.vaA, S=c.vaS;
  var comb=(A.spend||0)+(S.spend||0), ctgt=(A.target||0)+(S.target||0);
  var now=new Date(), dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(), day=now.getDate();
  var pace=ctgt*(day/dim), variance=comb-pace, pct=ctgt>0?Math.round(comb/ctgt*100):0;
  var units=(A.units||0)+(S.units||0), orders=(A.orders||0)+(S.orders||0), daysLeft=Math.max(0,dim-day);
  var behind=variance<0;
  function money(n){ return '£'+Math.round(n).toLocaleString(); }
  var perDay=daysLeft>0?Math.max(0,(ctgt-comb)/daysLeft):0;
  var summary='<div class="kpi-row">'
    +mgr_kpi({icon:'pound',label:'Combined VA spend',value:money(comb),tone:'purple',
        badge:ctgt>0?{t:pct+'% of target',tone:behind?'red':'green'}:null,
        sub:ctgt>0?'of <b>'+money(ctgt)+'</b> · '+mn+' target':'no VA target set',
        bar:ctgt>0?{pct:pct,mark:Math.round(day/dim*100),tone:behind?'red':'green'}:null})
    +mgr_kpi({icon:'target',label:'Expected by today',value:money(pace),tone:'cyan',sub:'day <b>'+day+'</b> of '+dim})
    +mgr_kpi({icon:'alert',label:behind?'Behind pace':'Ahead of pace',value:money(Math.abs(variance)),tone:behind?'red':'green',valTone:behind?'red':'green',
        sub:ctgt>0?('need <b>'+money(perDay)+'</b>/day to hit target'):'set a target to track pace'})
    +mgr_kpi({icon:'layers',label:'Bought so far',value:units,unit:units===1?' unit':' units',tone:'off',sub:'<b>'+orders+'</b> orders · '+daysLeft+' days left'})
    +'</div>';
  el.innerHTML=head+summary+spendCardInner()
    +'<div style="max-width:760px;font-size:11.5px;color:var(--muted-2);line-height:1.5;margin-top:4px;">Names, targets, colours and which sheet <b>Provider</b> rolls into each line are set under <b>Spend settings</b> (Settings → VAs). Figures match your Spend Dashboard exactly — same tab (<b>'+escHtml(c.tab||'')+'</b>) and Provider split.</div>';
}
async function mgr_renderLive(){
  var el=document.getElementById('mgr-live-content');
  if(!el) return;
  clearInterval(window._liveRefreshInterval);
  window._liveRefreshInterval=setInterval(function(){
    if(mgr_currentTab==='live') mgr_renderLive();
    else clearInterval(window._liveRefreshInterval);
  },60000);

  // Only show the placeholder on a FIRST paint. The 60s auto-refresh used to wipe the
  // whole panel to a grey "Fetching live status..." line and rebuild it, so Jack watching
  // the Live tab saw both VAs vanish once a minute. A refresh now leaves the current
  // cards up and swaps them when the new data lands.
  if(!el.dataset.painted){ el.innerHTML=skLive(); }

  if(!DB_ENABLED){
    el.innerHTML='<div style="color:#555;font-size:13px;padding:20px 0;">⚠ Supabase not configured.</div>';
    return;
  }

  // A failed read used to become rows=[], which the card builder reads as "nobody is
  // working" — so a wifi blip told Jack both VAs hadn't started, next to a freshly
  // stamped "Last fetched" time. Unknown is now its own state.
  var rows=null, liveErr=null;
  try{
    var res=await fetchT(SUPABASE_URL+'/rest/v1/live_status?select=*',{
      headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY}
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    rows=await res.json();
    if(!Array.isArray(rows)) throw new Error('bad payload');
    window._liveLastOk=new Date();
  }catch(e){ liveErr=e; rows=null; }
  var liveTimedOut = !!(liveErr && liveErr.timeout);

  if(liveErr){
    var lastOk=window._liveLastOk
      ? window._liveLastOk.toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'})
      : null;
    el.dataset.painted='1';
    el.innerHTML='<div class="live-err">'
      +'<div class="live-err-i">&#9888;</div>'
      +'<div><b>'+(liveTimedOut?'The server didn&rsquo;t answer in time':'Can&rsquo;t reach the server')+' &mdash; live status unknown.</b>'
      +'<span>This does <u>not</u> mean Mera and Suz aren&rsquo;t working; it means this dashboard couldn&rsquo;t check.'
      +(lastOk?' Last successful check: <b>'+lastOk+'</b> UK.':'')+'</span></div>'
      +'<button onclick="mgr_renderLive()">Retry</button></div>';
    return;
  }

  var vas=['Mera','Suz'];
  var byVA={};
  var rowByVA={};
  (rows||[]).forEach(function(r){ byVA[r.va]=r.data; rowByVA[r.va]=r; });
  var today=mgr_ukToday();
  var now=new Date();

  function buildCard(va){
    var s=byVA[va];
    var row=rowByVA[va]||null;
    var isMera=va==='Mera';
    var accentCol=isMera?'#b23bff':SUZ_COL;
    var borderCol=isMera?'#9b40ff':SUZ_COL;

    // Show grey card if no data, submitted, or stale (not updated in 3+ hours).
    // "Finished for the day" is decided by mgr_shiftState() — an EOD row alone is not
    // enough, because a VA can submit one and then start a second shift the same day.
    var shiftSt=mgr_shiftState(va, row, null);
    var isSubmitted=shiftSt.isSubmitted;
    // Stale = the app stopped talking to us. 6h was far too generous — a VA who just
    // closed the tab read as "Active" all evening. Also anything last touched on a
    // previous UK day is over, whatever the clock says.
    var isStale=false;
    if(s&&row&&row.updated_at){
      var upd=new Date(row.updated_at);
      var ageMs=Date.now()-upd.getTime();
      var updUK='';
      try{ updUK=upd.toLocaleDateString('en-GB',{timeZone:'Europe/London'}); }catch(e){}
      isStale = ageMs>3*60*60*1000 || (updUK && updUK!==today);
    }
    if(!s||isSubmitted||isStale){
      var subMsg = isSubmitted ? va+' has submitted their EOD — shift complete.' : va+' is not currently on shift.';
      return '<div style="border-radius:10px;border:1px solid #262c3d;border-top:3px solid #3a4258;background:#10121b;padding:12px 14px;">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">'
        +'<div style="font-family:var(--font-head);font-size:18px;font-weight:800;color:#5a6378;">'+va+'</div>'
        +'<div style="background:rgba(100,100,100,0.1);border:1px solid #2c3345;border-radius:14px;padding:4px 11px;font-size:10.5px;color:#8b93a8;font-weight:600;">⬤ '+(isSubmitted?'Shift submitted':'No active shift')+'</div>'
        +'</div>'
        +'<div style="font-size:11.5px;color:#4a5468;margin-top:4px;">'+subMsg+'</div>'
        +'</div>';
    }
    /* ── CLOCK DISAGREEMENT, IN FRONT OF HIM, WHILE SHE IS STILL WORKING ────────
       18/08: Suz clocked in 06:17 and her timer read 47m at 10:19. Nothing on this
       card said so, and nobody knew until she noticed herself. Both figures are now
       carried in live_status, so the card can simply show them disagreeing.
       Not auto-corrected: a shut laptop makes a real gap too, and quietly paying for
       it would be worse than showing it. Jack decides, one click. */
    var _gapM=parseInt(s.clockGapMins||0,10)||0;
    var _clockedM=parseInt(s.clockedMins||0,10)||0;
    var _timerM=parseInt(s.timerMins||0,10)||0;
    var gapWarn = (_gapM>=20 && _clockedM>0)
      ? '<div style="margin-top:9px;background:rgba(255,120,60,.12);border:1px solid rgba(255,140,70,.45);'
        +'border-radius:9px;padding:9px 11px;font-size:11.5px;color:#ffb98a;line-height:1.55;">'
        +'&#9888; <b>Clock does not add up.</b> Clocked in for <b>'+Math.floor(_clockedM/60)+'h '
        +(_clockedM%60)+'m</b>, timer counted <b>'+Math.floor(_timerM/60)+'h '+(_timerM%60)+'m</b> '
        +'&mdash; <b>'+Math.floor(_gapM/60)+'h '+(_gapM%60)+'m</b> apart.'
        +'<div style="margin-top:7px;color:#c9d1e3;font-size:11px;">Laptop shut for a while, or the '
        +'timer slipped. Ask her before EOD.</div>'
        +'<button onclick="jackFixHours('+JSON.stringify(va).replace(/"/g,'&quot;')+','+_clockedM+','+_timerM+')" '
        +'style="margin-top:9px;background:rgba(255,255,255,.07);border:1px solid rgba(255,160,90,.5);'
        +'color:#ffd0ad;font-family:inherit;font-size:11px;font-weight:700;padding:7px 12px;'
        +'border-radius:8px;cursor:pointer;">Set her hours &rarr;</button>'
        +'</div>'
      : '';
    var isOnBreak=s.onBreak;
    var statusCol=isOnBreak?'#f2c200':'#10d99a';
    var statusBg=isOnBreak?'rgba(242,193,78,0.1)':'rgba(45,212,163,0.1)';
    var statusTxt=isOnBreak?'☕ On break':'● Active';
    /* They are live AND there is already an EOD in for today — a second shift. Worth
       saying out loud: without it the card looks like an ordinary day and the numbers
       below it are only this stint's, not the day's total. */
    var againChip=shiftSt.restarted
      ? '<div title="An EOD was already submitted for '+va+' today — this is a second shift, so the figures below cover this stint only" '
        +'style="background:rgba(124,108,255,0.16);border:1px solid rgba(124,108,255,0.45);border-radius:14px;'
        +'padding:4px 10px;font-size:10.5px;color:#b3a8ff;font-weight:700;white-space:nowrap;">↺ 2nd shift today</div>'
      : '';
    var taskPct=s.totalTasks>0?Math.round(s.tasksDone/s.totalTasks*100):0;
    var lph=parseFloat(s.hoursWorked)>0?(s.totalLeads/parseFloat(s.hoursWorked)).toFixed(1):'-';
    var hrsCol=parseFloat(s.hoursWorked)>=getAppSettings().dailyHoursTarget?'#10d99a':'#f2647f';

    // idle detection: active but no task ticked for 60+ mins
    var idleHtml='';
    try{
      if(!isOnBreak&&!s.submitted){
        var nowUK=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
        var nowM=nowUK.getHours()*60+nowUK.getMinutes();
        var lastM=null;
        if(s.completedTasks&&s.completedTasks.length){
          var lt=s.completedTasks[s.completedTasks.length-1].tickedAt;
          if(lt&&lt.indexOf(':')>0){var pp=lt.split(':');lastM=parseInt(pp[0])*60+parseInt(pp[1]);}
        } else if(s.shiftStart){
          var m=s.shiftStart.match(/(\d+):(\d+)\s*(am|pm)/i);
          if(m){var hh=parseInt(m[1])%12;if(m[3].toLowerCase()==='pm')hh+=12;lastM=hh*60+parseInt(m[2]);}
        }
        if(lastM!==null){
          var gap=nowM-lastM; if(gap<0) gap+=1440;
          var idleThresh=(getAppSettings().idleMins||90); if(gap>=idleThresh) idleHtml='<div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;background:color-mix(in srgb,var(--amber) 14%,#0b0c12);border:1px solid color-mix(in srgb,var(--amber) 40%,transparent);border-radius:9px;padding:8px 12px;font-size:11.5px;font-weight:700;color:var(--amber);">\u26A0\uFE0F No task ticked in '+Math.floor(gap/60)+'h '+(gap%60)+'m \u2014 worth asking why?</div>';
        }
      }
    }catch(e){}
    // Task breakdown list
    var taskList='';
    if(s.completedTasks&&s.completedTasks.length){
      taskList='<div style="margin-top:10px;">'
        +'<div style="font-size:9px;color:#8b93a8;text-transform:uppercase;letter-spacing:1.1px;font-weight:700;margin-bottom:6px;">Completed tasks</div>';
      s.completedTasks.forEach(function(t){
        taskList+='<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-top:1px solid rgba(255,255,255,0.06);font-size:11.5px;">'
          +'<div style="display:flex;align-items:center;gap:5px;">'
          +'<span style="color:#10d99a;font-size:9px;">✓</span>'
          +'<span style="color:#c6ccdb;">'+t.name+'</span>'
          +'</div>'
          +'<div style="display:flex;gap:8px;color:#8b93a8;font-size:10.5px;">'
          +(t.tickedAt?'<span>'+t.tickedAt+'</span>':'')
          +(parseInt(t.leads)>0?'<span style="color:#10d99a;">'+t.leads+' leads</span>':'')
          +'</div>'
          +'</div>';
      });
      taskList+='</div>';
    }

    return '<div style="border-radius:10px;overflow:hidden;background:'+(isMera?'#2a0f4d':'#2e2500')+';border:1px solid rgba(255,255,255,0.07);border-top:3px solid '+borderCol+';">'
      +'<div style="padding:12px 14px;">'
      // Header
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;">'
      +'<div style="font-family:var(--font-head);font-size:18px;font-weight:800;color:'+accentCol+';">'+va+'</div>'
      +'<div style="display:flex;align-items:center;gap:6px;">'+againChip
      +'<div style="background:'+statusBg+';border:1px solid '+statusCol+'44;border-radius:14px;padding:4px 11px;font-size:10.5px;color:'+statusCol+';font-weight:700;">'+statusTxt+'</div>'
      +'</div>'
      +'</div>'
      // Current task box
      +'<div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:9px 11px;margin-bottom:10px;border-left:3px solid '+borderCol+';">'
      +'<div style="font-size:9px;color:#8b93a8;text-transform:uppercase;letter-spacing:1.1px;font-weight:700;margin-bottom:4px;">'+(isOnBreak?'☕ On break':'Current task')+'</div>'
      +'<div style="font-size:14px;color:#fff;font-weight:700;">'+s.currentTask+'</div>'
      +(s.lastCompletedTask&&s.lastCompletedTask!=='—'?'<div style="font-size:10.5px;color:#7a8296;margin-top:4px;">Last: '+s.lastCompletedTask+(s.lastTickedAt?' · '+s.lastTickedAt:'')+'</div>':'')
      +'</div>'
      +idleHtml
      // Stats
      +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px;">'
      +[
        {l:'Hours',v:s.hoursWorked+'h',c:hrsCol},
        {l:'Leads',v:String(s.totalLeads),c:'#10d99a'},
        {l:'L/Hr',v:lph,c:'#9b8fff'},
        {l:'Break',v:(s.totalBreakMins||0)+'m',c:'#f2c200'}
      ].map(function(x){
        return '<div style="background:rgba(0,0,0,0.3);border-radius:7px;padding:6px;text-align:center;">'
          +'<div style="font-size:10px;color:#8b93a8;text-transform:uppercase;letter-spacing:0.7px;font-weight:700;margin-bottom:3px;">'+x.l+'</div>'
          +'<div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:'+x.c+';">'+x.v+'</div>'
          +'</div>';
      }).join('')+'</div>'
      // Progress bar
      +'<div style="display:flex;justify-content:space-between;font-size:10.5px;color:#8b93a8;font-weight:600;margin-bottom:5px;"><span>Tasks '+s.tasksDone+'/'+s.totalTasks+'</span><span>'+taskPct+'%</span></div>'
      +'<div style="height:7px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">'
      +'<div style="height:100%;width:'+taskPct+'%;background:'+borderCol+';border-radius:3px;"></div>'
      +'</div>'
      // Task breakdown
      +taskList
      // Footer
      +'<div style="font-size:10px;color:#5a6378;margin-top:9px;">Started '+s.shiftStart+' · Updated '+s.lastUpdated+' UK</div>'
      +gapWarn
      +'</div></div>';
  }

  var html='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
    +'<div style="font-size:10.5px;color:#8b93a8;letter-spacing:0.5px;font-weight:600;">Updates every 60s · Last fetched: '+now.toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:true})+' UK</div>'
    +'<div style="display:flex;gap:8px;">'
    +'<button onclick="mgr_renderLive()" style="background:rgba(45,212,163,0.1);border:1px solid rgba(45,212,163,0.3);color:#10d99a;font-family:var(--font-mono);font-size:10px;padding:5px 11px;border-radius:7px;cursor:pointer;">↻ Refresh</button>'
    +'<button onclick="mgr_popoutLive()" style="background:rgba(155,143,255,0.1);border:1px solid rgba(155,143,255,0.3);color:#9b8fff;font-family:var(--font-mono);font-size:10px;padding:5px 11px;border-radius:7px;cursor:pointer;">⧉ Pop out</button>'
    +'</div></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
    +buildCard('Mera')+buildCard('Suz')
    +'</div>';

  el.dataset.painted='1';
  el.innerHTML=html;
}

