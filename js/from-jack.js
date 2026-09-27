/* ══════════ FROM JACK — per-VA daily brief (POA + one-off tasks) ══════════ */
function jb_key(va){return va+'|'+ukDateShort();}
function jb_all(){try{return JSON.parse(lsGet('st_jack_briefs')||'{}')}catch(e){return{}}}
function jb_saveAll(a){lsPut('st_jack_briefs',JSON.stringify(a));}
function jb_get(va){return jb_all()[jb_key(va)]||{poa:'',tasks:[]};}
function jb_weekKey(va){ return va+'|WEEK|'+mgr_weekStart(); }
function jb_getWeek(va){ return jb_all()[jb_weekKey(va)]||{note:''}; }
function jb_setWeek(va,note){ var a=jb_all(); a[jb_weekKey(va)]={note:note}; jb_saveAll(a); jb_cloudPut(jb_weekKey(va),{note:note}); }
function jb_set(va,brief){var a=jb_all();a[jb_key(va)]=brief;jb_saveAll(a);jb_cloudPut(jb_key(va),brief);}
/* ── Rolling "open items" bucket: items + one-off tasks Jack sends persist day-to-day
      until the VA ticks them off. Not keyed by date (unlike the POA note). ── */
function jb_openKey(va){ return va+'|OPEN'; }
function jb_uid(){ return 'i'+Date.now().toString(36)+Math.floor(Math.random()*46656).toString(36); }
function jb_normItem(it){ it=it||{}; if(!it.iid) it.iid=jb_uid(); if(!it.addedOn) it.addedOn=ukDateShort(); if(typeof it.done==='undefined') it.done=false; return it; }
function jb_normTask(t){ if(typeof t==='string') t={name:t}; t=t||{}; if(!t.iid) t.iid=jb_uid(); if(!t.addedOn) t.addedOn=ukDateShort(); if(typeof t.done==='undefined') t.done=false; return t; }
function jb_open(va){
  var a=jb_all(); var o=a[jb_openKey(va)];
  if(!o){ // one-time migration: seed the rolling bucket from today's dated brief so nothing already sent is lost
    var d=a[jb_key(va)]||{};
    o={items:(d.items||[]).map(jb_normItem), tasks:(d.tasks||[]).map(jb_normTask)};
    a[jb_openKey(va)]=o; jb_saveAll(a);
  }
  o.items=(o.items||[]).map(jb_normItem).filter(function(e){return !jb_expired(e);});
  o.tasks=(o.tasks||[]).map(jb_normTask).filter(function(e){return !jb_expired(e);});
  // a repeating item comes back on its day — done + nextOn<=today means it's due again
  try{ if(jbRepSweep(o)){ var all=jb_all(); all[jb_openKey(va)]=o; jb_saveAll(all); } }catch(e){}
  return o;
}
function jb_setOpen(va,o,delIid){ o=o||{items:[],tasks:[]}; var a=jb_all(); a[jb_openKey(va)]=o; jb_saveAll(a); jb_mergePush(va,delIid); }
/* DONE-WINS MERGE PUSH — a stale device can never resurrect ticked items.
   Before pushing the bucket, pull the cloud copy and: (a) if the cloud says an entry is
   done, it STAYS done (with its results); (b) entries that exist only in the cloud are
   kept (another device added them) unless they're the one being deleted right now. */
async function jb_mergePush(va,delIid){
  var key=jb_openKey(va);
  try{
    var local=jb_all()[key]||{items:[],tasks:[]};
    var r=await fetchT(SUPABASE_URL+'/rest/v1/jack_briefs?k=eq.'+encodeURIComponent(key)+'&select=data',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
    if(r.ok){
      var rows=await r.json(); var cloud=(rows[0]&&rows[0].data)||null;
      if(cloud){
        ['items','tasks'].forEach(function(kk){
          var lmap={}; (local[kk]=local[kk]||[]).forEach(function(e){ if(e&&e.iid) lmap[e.iid]=e; });
          (cloud[kk]||[]).forEach(function(ce){
            if(!ce||!ce.iid) return;
            var le=lmap[ce.iid];
            if(le){
              if(ce.done&&!le.done){ le.done=true; le.doneOn=ce.doneOn; le.doneBy=ce.doneBy;
                le.resLeads=ce.resLeads; le.resMins=ce.resMins; le.resSec=ce.resSec; le.resNote=ce.resNote; }
            } else if(ce.iid!==delIid && !jb_expired(ce)){ local[kk].push(ce); }
          });
          local[kk]=local[kk].filter(function(e){return !jb_expired(e);});
        });
        var a2=jb_all(); a2[key]=local; jb_saveAll(a2);
      }
    }
    jb_cloudPut(key,jb_all()[key]);
  }catch(e){ try{ jb_cloudPut(key,jb_all()[key]); }catch(_){} }
}
function jb_isCarried(addedOn){ return !!addedOn && addedOn!==ukDateShort(); }
// done items stay visible in Results for ~3 days after completion, then expire out of the
// bucket (their data lives on in the EOD logs + storefront league)
function jb_expired(e){
  if(!e||!e.done||!e.doneOn) return false;
  try{ var p=String(e.doneOn).split('/'); if(p.length!==3) return false;
    var d=new Date(+p[2],+p[1]-1,+p[0]);
    return (new Date(ukDateShort().split('/').reverse().join('-')) - d)/86400000 >= 4;
  }catch(err){ return false; }
}
function jb_carryDays(addedOn){ try{ var p=(addedOn||'').split('/'); if(p.length!==3) return 0; var then=new Date(+p[2],+p[1]-1,+p[0]); var now=new Date(ukDateShort().split('/').reverse().join('-')); return Math.max(0,Math.round((now-then)/86400000)); }catch(e){ return 0; } }
// mark a rolling item/task done (called when the VA ticks its shift task) — writes back to cloud,
// including the VA's logged RESULTS (leads found, time spent, note) so Jack sees how it went
function jb_markDoneItem(va,iid,isTask,results){
  try{ var o=jb_open(va); var arr=isTask?o.tasks:o.items; var e=(arr||[]).filter(function(x){return x.iid===iid;})[0];
    if(e){ e.done=true; e.doneOn=ukDateShort(); e.doneBy=va;
      if(results){ e.resLeads=results.leads; e.resMins=results.mins; e.resSec=results.sec; e.resNote=results.note; }
      // a repeating job doesn't finish when it's ticked — it books its next appearance
      if(e.rep){ e.nextOn=jbRepNext(e.rep, e.doneOn); }
      jb_setOpen(va,o); } }catch(e){}
}
function jb_cloudPut(k,data){
  try{
    if(typeof SUPABASE_URL==='undefined'||!DB_ENABLED) return;
    dbWrite('What you sent your VAs', SUPABASE_URL+'/rest/v1/jack_briefs',{method:'POST',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({k:k,data:data,updated_at:new Date().toISOString()})}).catch(function(){});   // reported by dbWrite
  }catch(e){}
}
async function jb_cloudPull(va){
  try{
    if(typeof SUPABASE_URL==='undefined'||!DB_ENABLED) return;
    var keys=[jb_key(va),jb_weekKey(va),jb_openKey(va)].map(encodeURIComponent).join(',');
    var res=await fetchT(SUPABASE_URL+'/rest/v1/jack_briefs?k=in.('+keys+')&select=k,data',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
    if(!res.ok) return;
    var rows=await res.json();
    if(!rows.length) return;
    var a=jb_all();
    var pushBack=false;
    rows.forEach(function(r){
      if(r.k===jb_openKey(va)){
        // OPEN bucket: cloud decides WHICH entries exist (Jack adds/deletes),
        // but done-WINS from either side — a tick can never be lost by a pull
        var cloud=r.data||{items:[],tasks:[]};
        var localB=a[r.k]||{items:[],tasks:[]};
        ['items','tasks'].forEach(function(kk){
          var lmap={}; (localB[kk]||[]).forEach(function(e){ if(e&&e.iid) lmap[e.iid]=e; });
          (cloud[kk]=cloud[kk]||[]).forEach(function(ce){
            var le=ce&&ce.iid?lmap[ce.iid]:null;
            if(le&&le.done&&!ce.done){ ce.done=true; ce.doneOn=le.doneOn; ce.doneBy=le.doneBy;
              ce.resLeads=le.resLeads; ce.resMins=le.resMins; ce.resSec=le.resSec; ce.resNote=le.resNote; pushBack=true; }
          });
          cloud[kk]=cloud[kk].filter(function(e){return !jb_expired(e);});
        });
        a[r.k]=cloud;
      } else { a[r.k]=r.data; }
    });
    jb_saveAll(a);
    if(pushBack){ try{ jb_cloudPut(jb_openKey(va), a[jb_openKey(va)]); }catch(e){} }
    try{ renderFromJack(va); }catch(e){}
    // re-inject any rolling items / one-off tasks that arrived from the cloud after shift start
    try{
      var o=jb_open(va);
      var live=(state.currentVA===va)||(state._previewAs===va);
      if(o&&live){
        var added=0;
        var _poaAt=function(){ return state.tasks.findIndex(function(x){return x.id==='jack-poa'||x.id==='suz-jack-poa';}); };
        (o.tasks||[]).filter(function(t){return !t.done;}).forEach(function(t){
          var id='oneoff-'+t.iid;
          if(!state.tasks.some(function(x){return x.id===id;})){
            var carried=jb_isCarried(t.addedOn);
            var nt={id:id,jbOneoffIid:t.iid,name:'Task · '+t.name,jbCarried:carried,jbAddedOn:t.addedOn,mandatory:true,hint:(carried?'Carried over from '+t.addedOn+' — still needs doing.':'Task from Jack.'),hasLinks:false,done:false,skipped:false,skipReason:'',time:'',timeHrs:0,timeMins:0,leads:'',context:'',links:[],_jbNewMid:1};
            // land WITH Jack's other stuff, right under the POA card — same rule as
            // shift start, not dumped at the bottom of the list
            var pi=_poaAt(); if(pi>=0) state.tasks.splice(pi+1,0,nt); else state.tasks.push(nt);
            added++;
          }
        });
        // Route new arrivals the SAME way shift start does, and treat an item already
        // bundled inside a host task as present. Checking only for a standalone card
        // meant every routed item was re-added as a duplicate on every cloud pull.
        var _fresh=(o.items||[]).filter(function(it){ return !it.done && !jb_hasItem(state.tasks,it.iid); });
        if(_fresh.length){
          var _byType={};
          _fresh.forEach(function(it){ (_byType[it.t]=_byType[it.t]||[]).push(it); });
          var _reopened=0;
          Object.keys(_byType).forEach(function(ty){
            var g=_byType[ty], host=jb_findHost(state.tasks,ty);
            if(host){
              jb_attachToHost(host,g); added+=g.length;
              // sent into a card she already ticked → the card comes back open, time kept
              if(jb_reopenTask(host,g.length)) _reopened++;
              // sent into a card still open → no reopen needed, but the frozen-bar
              // chip must still point at it until she deals with it
              else host._jbNewMid=1;
              return;
            }
            g.forEach(function(it){
              var nt=jb_itemTask(it); nt._jbNewMid=1;
              var pi=_poaAt(); if(pi>=0) state.tasks.splice(pi+1,0,nt); else state.tasks.push(nt);
              added++;
            });
          });
          state._jbReopened=_reopened;
        }
        if(added){
          /* Jack added stuff after the VA already ticked POA → the SAME card reopens
             with its banked time ("goes back open with a resume"). Replaces the old
             "Jack POA — new additions" card that appeared at the bottom of the list,
             disconnected from everything it was about. */
          var poaT=state.tasks.find(function(x){return x.id==='jack-poa'||x.id==='suz-jack-poa';});
          var rN=(state._jbReopened||0)+(poaT&&jb_reopenTask(poaT,added)?1:0);
          state._jbReopened=0;
          state._jbItemCount=(o.items||[]).filter(function(it){return !it.done;}).length;
          renderTasks();
          try{ jb_addsBanner(va); }catch(e){}
          try{ showToast('\u{1F4E3} Jack sent '+added+' new item'+(added===1?'':'s')+(rN?' — a ticked task has reopened, your logged time is kept':' — added to your tasks')); }catch(e){}
        } else { renderTasks(); }
      }
    }catch(e){}
  }catch(e){}
}
/* Jack's rule (asked twice, 31/08): "if I add a task mid shift once they have
   completed it — it goes back open with a resume." One card, one running total:
   banked time and leads stay, the tick comes off, a badge says why, and the next
   Done closes it again. Applies to the POA card AND host tasks (storefronts sent
   into a ticked Storefronts card reopen it the same way) — otherwise a mid-shift
   send can land inside a completed card nobody would ever look at again. */
function jb_reopenTask(t,addedN){
  if(!t||!t.done) return false;
  t.done=false; t.skipped=false;
  t._reopenedAt=new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false});
  t._reopenN=(t._reopenN||0)+(addedN||1);
  t._reopenPrevTick=t.tickedAt||null;   // audit trail: done 11:30 · reopened 16:04 · done 16:21
  return true;
}
function jb_secLabel(txt,extra){ return '<div class="jb-seclabel"'+(extra?' style="'+extra+'"':'')+'>'+txt+'</div>'; }
function jb_ageNum(addedOn){ var p=(addedOn||'').split('/'); if(p.length!==3) return 99999999; return (+p[2])*10000+(+p[1])*100+(+p[0]); }
function jb_byAge(a,b){ return jb_ageNum(a.addedOn)-jb_ageNum(b.addedOn); }   // oldest first
function jb_carryBadge(addedOn){
  if(!jb_isCarried(addedOn)) return '';
  var d=jb_carryDays(addedOn); var overdue=d>=3;
  return '<span class="jb-carry-badge'+(overdue?' overdue':'')+'" title="Sent '+addedOn+' — still not ticked off">'
    +(overdue?'&#9888; '+d+'d overdue':'&#8635; carried '+d+'d')+'</span>';
}
/* ═══════ SEND-AGAIN: presets, storefront memory, and repeat schedules ═══════
   Three things Jack was doing by hand every time: retyping the same storefront
   names, retyping the same note against them, and re-sending the same job every
   few days. All three are the same underlying idea — remember what I sent before. */

/* ── 1. PRESETS ─────────────────────────────────────────────────────────────
   A saved mini-task: type + link + name + note + the timer/leads flags + how
   often it should come back. One tap re-sends it. */
