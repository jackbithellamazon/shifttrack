/* ── VA SIDE: their batches, on their shift screen ─────────────────────────*/
/* A batch becomes a NORMAL task on the VA's list — Jack's choice, so there is
   nothing new for them to learn. The controls they already use drive the batch:
     start the row's timer  →  the batch Starts (and locks)
     tick the row           →  the batch is Complete
   The Keepa link rides along as the row's Open button. */
/* A batch assigned to Both — or to everyone — must reach EACH person it names.
   `b.assigned_to===va` only ever matched a single name, so every "Both" batch since the
   module shipped landed on nobody's task list and sat on Jack's board looking assigned.
   Jack asked six times for an all-three option; this is why adding it wasn't enough. */
/* One place that answers "who actually holds this batch", so a tile, a menu and a
   filter can never disagree about it again. */
/* Jack, 17/09: "open for just me and mera and me and suz". Two new values. The enum now
   lives in ONE table — sbPeople, sbGoesTo, sbNeededBy, the labels, the classes and the
   menus all read it, so a value can never again be understood in one place and not
   another. Stored verbatim in storefront_batches.assigned_to (plain text, no constraint).
   Pairs follow the 'All' model: ONE row that reaches two people, with a per-VA done flag
   — not the old 'Both' split. */
var SB_ROUTES=[
  {v:'Mera',     people:['Mera'],              cls:'mera'},
  {v:'Suz',      people:['Suz'],               cls:'suz'},
  {v:'Both',     people:['Mera','Suz'],        cls:'both', label:'Both VAs',   short:'B'},
  {v:'JackMera', people:['Jack','Mera'],       cls:'both', label:'Me + Mera',  short:'Me+M'},
  {v:'JackSuz',  people:['Jack','Suz'],        cls:'both', label:'Me + Suz',   short:'Me+S'},
  {v:'All',      people:['Mera','Suz','Jack'], cls:'all',  label:'All 3 of us',short:'A3'},
  /* no label: falls back to vaDisp('Jack') so existing tag chips read exactly as they
     did before this change. The menus say "Just me" in their own words. */
  {v:'Jack',     people:['Jack'],              cls:'jack',                     short:'Me'}
];
function sbRoute(v){
  var a=String(v||'');
  for(var i=0;i<SB_ROUTES.length;i++) if(SB_ROUTES[i].v===a) return SB_ROUTES[i];
  return null;
}
function sbRouteLabel(v){
  var r=sbRoute(v); if(!r) return vaDisp(v);
  if(r.label) return r.label.replace('Mera',vaDisp('Mera')).replace('Suz',vaDisp('Suz'));
  return vaDisp(r.v);
}
/* toast voice: "sent to you and Mera", never "sent to JackMera" */
function sbRouteToast(v){
  var r=sbRoute(v); if(!r) return vaDisp(v);
  if(r.v==='All') return 'all 3 of you';
  if(r.v==='Both') return 'both VAs';
  if(r.v==='Jack') return 'you';
  return r.people.map(function(x){ return x==='Jack'?'you':vaDisp(x); }).join(' and ');
}
function sbRouteCls(v){ var r=sbRoute(v); return r?r.cls:'none'; }
function sbPeople(assigned){
  var r=sbRoute(assigned);
  return r?r.people.slice():[];
}
function sbHolders(b){
  var p=sbPeople(b&&b.assigned_to);
  if(!p.length) return 'nobody yet';
  return p.map(function(x){ return x==='Jack'?'you':vaDisp(x); }).join(' + ');
}
function sbHoldersShort(b){
  var p=sbPeople(b&&b.assigned_to);
  if(p.length===3) return 'ALL 3';
  return p.map(function(x){ return x==='Jack'?'YOU':String(vaDisp(x)).toUpperCase(); }).join(' + ');
}
function sbGoesTo(b, va){
  return sbPeople(b&&b.assigned_to).indexOf(va)>=0;
}

/* ── SHARED BATCHES: BOTH MEANS BOTH ───────────────────────────────────────
   Jack: "both means both VA's need to do it ffs". Until now the first Done closed the
   batch for everyone, so routing to Both really meant "whoever gets there first" — the
   opposite of the intent. A shared batch now records a completion PER VA and only turns
   Completed once every VA it was sent to has finished her own pass.
   Stored in app_flags (a plain key/value table that already exists) — no schema change,
   nothing to run, and it survives across devices and shifts. */
function sbNeededBy(b){
  return sbPeople(b&&b.assigned_to);
}
function sbIsShared(b){ return sbNeededBy(b).length>1; }
function sbDoneKey(batchId,va){ return 'sbdone:'+batchId+':'+va; }
window._sbDoneBy=window._sbDoneBy||{};        // batchId -> {va:true}
function sbDoneByLocal(batchId){ return window._sbDoneBy[batchId]||{}; }
function sbHasDone(batchId,va){ return !!sbDoneByLocal(batchId)[va]; }
/* pull every per-VA completion for the batches on screen, so both sides agree */
function sbLoadDoneFlags(){
  if(typeof SUPABASE_URL==='undefined'||!DB_ENABLED) return Promise.resolve();
  var ids=(SB_BATCHES||[]).filter(sbIsShared).map(function(b){ return b.id; });
  if(!ids.length) return Promise.resolve();
  return fetchT(SUPABASE_URL+'/rest/v1/app_flags?k=like.sbdone:*&select=k',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}})
    .then(function(r){ return r.ok?r.json():[]; })
    .then(function(rows){
      var m={};
      (rows||[]).forEach(function(x){
        var p=String(x.k||'').split(':');
        if(p.length===3){ (m[p[1]]||(m[p[1]]={}))[p[2]]=true; }
      });
      window._sbDoneBy=m;
      return m;
    }).catch(function(){});
}
/* Record THIS VA's pass. Returns true when that was the last one needed. */
function sbMarkDoneBy(batchId,va){
  var b=(SB_BATCHES||[]).find(function(x){ return x.id===batchId; });
  var need=sbNeededBy(b);
  (window._sbDoneBy[batchId]=window._sbDoneBy[batchId]||{})[va]=true;
  if(!IS_PREVIEW && typeof SUPABASE_URL!=='undefined' && DB_ENABLED){
    try{
      fetch(SUPABASE_URL+'/rest/v1/app_flags',{method:'POST',
        headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
                 'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},
        body:JSON.stringify({k:sbDoneKey(batchId,va),v:'done'})}).catch(function(){});
    }catch(e){}
  }
  var doneBy=sbDoneByLocal(batchId);
  return need.every(function(who){ return doneBy[who]; });
}
/* who on a shared batch still hasn't done their pass */
function sbWaitingOn(b){
  if(!sbIsShared(b)) return [];
  var doneBy=sbDoneByLocal(b.id);
  return sbNeededBy(b).filter(function(who){ return !doneBy[who]; });
}

function sbBatchTask(b){
  var n=b.asin_count||0;
  var pri=(b.priority==='High')?' — HIGH PRIORITY':'';
  var age=sbAgeDays(b.date);
  var when=sbDayLabel(b.date)||b.date||'';
  /* age is the whole point — "8 days old" is what makes someone pick it up */
  var agePart = (age===null||age===undefined) ? ''
    : age<=0 ? ' \u00b7 added today'
    : age===1 ? ' \u00b7 added yesterday'
    : ' \u00b7 added '+when+' ('+age+' days ago)';
  var lateNote = (age>=2)
    ? '\u26a0\ufe0f Waiting '+age+' days \u2014 please clear this one first. '
    : '';
  return {
    id:'sbatch-'+b.id, sbBatchId:b.id, sbStatus:b.status, sbPriority:b.priority||'Normal',
    sbOwn:false, sbNote:'',
    // The tag name alone read as a person ("Mera · 8 ASINs" looked like a task FOR Mera).
    // Lead with what it is, then the tag, then the size.
    name:'Storefront · '+(b.storefront_name||'Queue')+(b.batch_number>1?' (Batch '+b.batch_number+')':'')+' — '+n+' ASIN'+(n===1?'':'s')+pri,
    jbLabel:'Storefront: '+(b.storefront_name||'Queue')+' \u00b7 '+n+' ASINs'+agePart,
    sbAge:age,
    mandatory:true, hasLinks:false,
    jbUrl:b.keepa_url||'', jbUrlLabel:'Open all '+n+' in Keepa', jbType:'sf', jbTimer:true, jbLeads:true,
    /* "Locked — you started this" showed on batches JACK had started, which to the VA
       read as an accusation about something she never did. Name who actually has it. */
    jbReason:lateNote+(b.status==='Started'
        ? ('In progress'+(b.started_by?' — started by '+vaDisp(b.started_by):'')+'. The list is locked so nothing changes mid-run.')
        : 'Press Start when you begin — that locks the list so nothing changes under you.'),
    hint:'Open the '+n+' ASINs in Keepa, work through them, then log your time and how many leads you got. Ticking this marks the batch done for Jack.',
    done:false, skipped:false, skipReason:'', time:'', timeHrs:0, timeMins:0, leads:'', context:'', links:[],
    timerSec:0, timerRun:false, timerStart:null
  };
}
/* inject any Assigned/Started batches for this VA into their task list */
function sbInjectBatchTasks(va, tasks){
  var mine=(SB_BATCHES||[]).filter(function(b){
    if(!sbGoesTo(b,va)) return false;
    if(b.status!=='Assigned' && b.status!=='Started') return false;
    // a shared batch she has already done stays gone for HER, while the other VA finishes
    if(sbIsShared(b) && sbHasDone(b.id,va)) return false;
    return true;
  });
  if(!mine.length) return 0;
  /* Jack's rule, in his words: "anything high priority beats rest of storefronts —
     then hers — then whatever else I sent. Hers auto goes above anything else I've
     sent unless it's high priority." So: priority first, then her OWN tag (the queue
     named after her), then the rest, newest first inside each band. */
  var order={High:0,Normal:1,Low:2};
  function ownRank(b){ return String(b.storefront_name||'').toLowerCase()===String(va||'').toLowerCase()?0:1; }
  mine.sort(function(a,b){
    var pa=order[a.priority||'Normal'], pb=order[b.priority||'Normal'];
    if(pa!==pb) return pa-pb;                                  // High beats everything
    var oa=ownRank(a), ob=ownRank(b);
    if(oa!==ob) return oa-ob;                                  // then her own storefronts
    var da=sbToISO(a.date)||'', db2=sbToISO(b.date)||'';
    if(da!==db2) return db2<da?-1:1;                           // then newest first
    return String(a.storefront_name||'').localeCompare(String(b.storefront_name||''));
  });
  // Batches used to be appended to the END of the shift list, which put them miles away
  // from the "Storefronts" task in Jack's recurring ticklist — so a VA saw storefront work
  // in two unrelated places. Slot them in directly AFTER that host task instead: one
  // storefront section, batches first (they carry the ASINs), then the manual link boxes
  // for anything the VA finds on their own. Falls back to appending if the host isn't
  // in this VA's ticklist.
  /* v51.2 BUG FIX — Jack, 27/09: "where's Jack's POA?" The host used to be looked up through
     JB_ROUTE.sf, and since v50.2 routed every From-Jack type to the POA task that resolved to
     "Missed Yesterday + Jack POA": the batches slid in under it and the POA task was then
     deleted below as the "duplicate manual Storefronts task". The host is the manual
     Storefronts task, by id, or nothing. (Never live — v50.2–v51.1 were not pushed.) */
  var SB_HOST_IDS=['storefronts','suz-storefronts'];
  var hostAt=-1;
  for(var h=0;h<tasks.length;h++){
    if(SB_HOST_IDS.indexOf(tasks[h].id)>=0){ hostAt=h; break; }
  }
  var fresh=mine.filter(function(b){
    return !tasks.some(function(t){ return t.id==='sbatch-'+b.id; });
  }).map(function(b){
    var t=sbBatchTask(b);
    t.sbOwn=(ownRank(b)===0);
    var q=(SB_QUEUES||[]).filter(function(x){ return x.id===b.storefront_id; })[0];
    t.sbNote=String((q&&q.notes)||'').trim();
    if(t.sbNote) t.hint=t.sbNote+' \u2014 '+t.hint;
    return t;
  });
  if(!fresh.length) return mine.length;
  if(hostAt>=0){
    // keep them together under the host, in the priority order set above
    var at=hostAt+1;
    while(at<tasks.length && tasks[at] && tasks[at].sbBatchId) at++;
    tasks.splice.apply(tasks, [at,0].concat(fresh));
    // Jack: "the storefronts I sent replace the storefront in the POA — it's the same
    // thing". So once real batches exist for this VA, the manual "Storefronts" task with
    // its three blank link boxes is duplicate work sitting directly above them. Drop it —
    // UNLESS the VA has already put something in it, in which case removing it would
    // destroy logged work. With no batches, the manual task stays as the fallback.
    var host=tasks[hostAt];
    var touched = host && (host.done || host.skipped || host.timeHrs || host.timeMins ||
                  (host.leads!=='' && host.leads!=null) ||
                  (host.links||[]).some(function(l){ return l && String(l).trim(); }) ||
                  (host.linkNames||[]).some(function(n){ return n && String(n).trim(); }));
    if(!touched) tasks.splice(hostAt,1);
  } else {
    /* no manual Storefronts task any more (retired 27/09) — batches sit after Jack's POA,
       or after the Sourcing Suite task, so Main work reads: filters → Jack's items → batches */
    var at2=-1, anchors=['jack-poa','suz-jack-poa','kpf-daily','suz-kpf-daily'];
    for(var a=0;a<anchors.length&&at2<0;a++){
      for(var k=0;k<tasks.length;k++){ if(tasks[k].id===anchors[a]){ at2=k+1; break; } }
    }
    if(at2<0){ fresh.forEach(function(t){ tasks.push(t); }); }
    else{ while(at2<tasks.length && tasks[at2] && tasks[at2].sbBatchId) at2++; tasks.splice.apply(tasks,[at2,0].concat(fresh)); }
  }
  return mine.length;
}
/* NOT RENDERED ANYWHERE — and deliberately so. Batches reach the VA as task ROWS
   via sbInjectBatchTasks(), which is the surface Jack actually uses. This card grid
   is an older second surface; wiring it up shows every batch twice. Kept only
   because sbRefreshVA() still references it. */
function sbVAHTML(va){
  var mine=(SB_BATCHES||[]).filter(function(b){
    return sbGoesTo(b,va) && b.status!=='Completed' && b.status!=='Draft';
  });
  if(!mine.length) return '';
  /* Jack's order (03/09): High → Medium → Low, newest first inside each band.
     The old rule was oldest-first, to stop anything rotting; that job now belongs
     to the 5-day auto-remove, so today's priority work leads. */
  mine.sort(sbOrderCmp);
  var stale=mine.filter(function(b){ return (sbAgeDays(b.date)||0)>=2; }).length;
  var oldest=0; mine.forEach(function(b){ var d=sbAgeDays(b.date)||0; if(d>oldest) oldest=d; });
  return '<div class="sf-section"><div class="sf-head">'
    +'<span class="sf-title">\u{1F3EA} Storefront batches</span>'
    +'<span class="sf-sub">Press Start when you begin \u2014 that locks the list so nothing changes under you.</span></div>'
    +(stale?'<div class="sbva-old"><b>'+stale+' of these '+(stale===1?'has':'have')+' been waiting'
        +(oldest>=2?' \u2014 the oldest is '+oldest+' days old':'')+'.</b> Please clear these before anything new.</div>':'')
    +'<div class="sb-grid">'+mine.map(function(b){ return sbCardHTML(b,true); }).join('')+'</div></div>';
}
function sbRefreshVA(){
  var va=(state&&(state._previewAs||state.currentVA)); if(!va) return;
  if(!document.getElementById('sb-va-batches')) return;
  sbLoadBatches(true).then(function(){
    var h=document.getElementById('sb-va-batches');
    if(h) h.innerHTML=sbVAHTML(va);
  }).catch(function(){});
}
function jbPresets(){ try{ var a=getAppSettings().jbPresets; return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function jbPresetsSet(a){ try{ var s=getAppSettings(); s.jbPresets=a.slice(0,60); saveAppSettings(s); try{pushSettingsCloud(s);}catch(e){} }catch(e){} }
function jbPresetSave(va){
  var t=(document.getElementById('jb-itype-'+va)||{}).value||'msg';
  var v=((document.getElementById('jb-ival-'+va)||{}).value||'').trim();
  var n=((document.getElementById('jb-iname-'+va)||{}).value||'').trim();
  var r=((document.getElementById('jb-inote-'+va)||{}).value||'').trim();
  if(!v && !r){ showToast('Fill the box in first, then save it as a preset',true); return; }
  var label=(n||r||v).slice(0,44);
  var lbl=prompt('Save this as a preset.\n\nName it so you recognise it later:',label);
  if(lbl===null) return;
  lbl=String(lbl).trim().slice(0,44); if(!lbl){ showToast('Give it a name',true); return; }
  var arr=jbPresets();
  arr.unshift({ id:'p'+jb_uid(), label:lbl, t:t, v:v, n:n, r:r,
    timer:!!(document.getElementById('jb-itimer-'+va)||{}).checked,
    leads:!!(document.getElementById('jb-ileads-'+va)||{}).checked,
    rep:null });
  jbPresetsSet(arr);
  showToast('Preset saved — one tap to send it again ✓');
  jb_rerender(va);
}
function jbPresetApply(va,id){
  var pr=jbPresets().filter(function(x){return x.id===id;})[0]; if(!pr) return;
  var set=function(elId,val){ var e=document.getElementById(elId); if(e) e.value=val||''; };
  var hid=document.getElementById('jb-itype-'+va); if(hid) hid.value=pr.t||'msg';
  document.querySelectorAll('#jb-editor-'+va+' .jb-typepill').forEach(function(b){ b.classList.remove('active'); });
  var pills=document.querySelectorAll('#jb-editor-'+va+' .jb-typepill');
  var order=['sf','kpf','eu','asin','msg'], ix=order.indexOf(pr.t||'msg');
  if(pills[ix]) pills[ix].classList.add('active');
  set('jb-ival-'+va,pr.v); set('jb-iname-'+va,pr.n); set('jb-inote-'+va,pr.r);
  var tm=document.getElementById('jb-itimer-'+va); if(tm) tm.checked=!!pr.timer;
  var ld=document.getElementById('jb-ileads-'+va); if(ld) ld.checked=!!pr.leads;
  var vEl=document.getElementById('jb-ival-'+va); if(vEl) vEl.focus();
  showToast('Loaded "'+pr.label+'" — check it and hit Send');
}
function jbPresetDel(va,id){
  var pr=jbPresets().filter(function(x){return x.id===id;})[0];
  if(!pr) return;
  if(!confirm('Delete the preset "'+pr.label+'"?\n\nThis only removes the shortcut — anything already sent stays on the list.')) return;
  jbPresetsSet(jbPresets().filter(function(x){return x.id!==id;}));
  jb_rerender(va);
}

