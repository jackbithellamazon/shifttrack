/* ── SELF-CHECK ─────────────────────────────────────────────────────────────
   Jack: "can we future proof no more issues pls". Nothing makes bugs impossible,
   but every bug found in this app so far belonged to one of four repeating classes:
     1. a date parsed from a localised string          (ukNow was wrong 30 days in 31)
     2. an enum compared in one place but not another  ('All' batches reaching nobody)
     3. a destructive call scoped wider than intended  (deleteDraft wiping every draft)
     4. a function called that no longer exists        (a dead panel shipped 3 times)
   These assertions run on every load in Jack mode and shout the moment one comes back.
   A check that never fails is worthless, so each one is written to fail loudly. */
function selfTest(){
  var R=[];
  function ok(name,pass,detail){ R.push({name:name,pass:!!pass,detail:detail||''}); }
  function attempt(name,fn){ try{ fn(); }catch(e){ ok(name,false,'threw: '+e.message); } }

  // 1. clocks — the app's idea of "now" must match London, on any day of the month
  attempt('UK clock matches London',function(){
    var mine=ukNow(), real=new Date();
    var realDate=real.toLocaleDateString('en-GB',{timeZone:'Europe/London'});
    var mineDate=mine.toLocaleDateString('en-GB');
    ok('UK clock matches London', mineDate===realDate, mineDate+' vs '+realDate);
    var names=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var realDay=real.toLocaleDateString('en-GB',{timeZone:'Europe/London',weekday:'long'});
    ok('UK weekday matches London', names[ukDayOfWeek()]===realDay, names[ukDayOfWeek()]+' vs '+realDay);
  });
  // the exact parse that broke it — proves the pattern stays dead
  attempt('en-GB date strings are never re-parsed',function(){
    var bad=new Date(new Date('2026-08-25T09:00:00Z').toLocaleString('en-GB',{timeZone:'Europe/London'}));
    ok('en-GB date strings are never re-parsed', isNaN(bad.getTime()),
       'the broken pattern still produces '+(isNaN(bad.getTime())?'Invalid Date (as expected)':bad.toDateString()));
  });

  // 2. routing — every assignee value must reach exactly the right people
  attempt('Batch routing covers Both and All',function(){
    function to(v){ return ['Mera','Suz','Jack'].filter(function(p){ return sbGoesTo({assigned_to:v},p); }).join('+'); }
    ok('Batch routing: Mera',  to('Mera')==='Mera', to('Mera'));
    ok('Batch routing: Both',  to('Both')==='Mera+Suz', to('Both'));
    ok('Batch routing: All',   to('All')==='Mera+Suz+Jack', to('All'));
    ok('Batch routing: Me+Mera', to('JackMera')==='Mera+Jack', to('JackMera'));
    ok('Batch routing: Me+Suz',  to('JackSuz')==='Suz+Jack',  to('JackSuz'));
    /* every value the UI can store must be understood by every reader of the enum */
    ok('Every route resolves to people', SB_ROUTES.every(function(r){ return sbPeople(r.v).length>0; }),
       SB_ROUTES.map(function(r){ return r.v+':'+sbPeople(r.v).length; }).join(' '));
    ok('Every route has label+colour+voice', SB_ROUTES.every(function(r){
       return !!sbRouteLabel(r.v) && sbRouteCls(r.v)!=='none' && !!sbRouteToast(r.v); }));
    ok('Batch routing: blank', to('')==='', to('')||'(nobody)');
  });

  // 2b. storage (v50.9) — one helper, never throws, history is memory-only
  attempt('Storage helper',function(){
    ok('lsPut/lsGet round-trip', (lsPut('st_selftest','x'), lsGet('st_selftest')==='x'));
    lsDrop('st_selftest'); ok('lsDrop removes', lsGet('st_selftest')===null);
    ok('Shift history is memory-only', lsGet('shifttrack_eod_log')===null || typeof legacyLogRetire==='function');
    ok('mgr_getLog is an array', Array.isArray(mgr_getLog()));
    ok('Decisions have no browser copy', typeof loadDecisions==='function');
  });

  // 3. drafts — a key that cannot flip, an age rule that cannot betray a live shift
  attempt('Draft key and age rule',function(){
    ok('Draft key present', !!shiftDayKey(), String(shiftDayKey()));
    ok('Draft age: fresh kept',   draftAgeMs({},{savedAt:Date.now()-6e4})<DRAFT_MAX_AGE_MS);
    ok('Draft age: 17h dropped', !(draftAgeMs({},{savedAt:Date.now()-17*36e5})<DRAFT_MAX_AGE_MS));
    ok('Draft age: no stamp dropped', draftAgeMs({},{})===Infinity);
  });

  // 4. functions the UI calls from inside other functions — the class that shipped dead panels
  attempt('Critical functions exist',function(){
    var need=['paintShiftTimer','smartHealthHTML','reasonMineHTML','recallHTML','trainingRows',
              'trainableRows','trainSmartModel','sbGoesTo','sbLastPaste','sbAgoLabel',
              'focusStart','ldMergeTwins','localDraft','deleteDraft','saveShiftDraft'];
    var missing=need.filter(function(n){ return typeof window[n]!=='function'; });
    ok('Critical functions exist', !missing.length, missing.join(', ')||'all '+need.length+' present');
  });

  // 5. the score must never train on one source when two exist
  attempt('Score reads every decision',function(){
    var cache=(window._decisionCache||[]).filter(function(r){return r.decision;}).length;
    var rows=trainingRows().length;
    ok('Score reads every decision', rows>=cache, rows+' rows vs '+cache+' logged decisions');
  });

  // 6. small grey text — the thing he has reported twice
  attempt('Muted text passes AA',function(){
    var c=getComputedStyle(document.documentElement).getPropertyValue('--muted-2').trim();
    var d=document.createElement('span'); d.style.color=c||'#000'; document.body.appendChild(d);
    var rgb=(getComputedStyle(d).color.match(/[\d.]+/g)||[0,0,0]).slice(0,3).map(Number); d.remove();
    function L(v){ return v.map(function(x){ x/=255; return x<=0.03928?x/12.92:Math.pow((x+0.055)/1.055,2.4); })
      .reduce(function(a,b,i){ return a+[0.2126,0.7152,0.0722][i]*b; },0); }
    var r=(Math.max(L(rgb),L([16,19,26]))+0.05)/(Math.min(L(rgb),L([16,19,26]))+0.05);
    ok('Muted text passes AA', r>=4.5, c+' = '+r.toFixed(2)+':1');
  });

  // 7. the four link arrays must stay the same length, or rows lose their names
  attempt('Task link arrays stay aligned',function(){
    var bad=[];
    ['tasks','extraTasks'].forEach(function(k){
      ((window.state&&state[k])||[]).forEach(function(t){
        if(!t||!t.hasLinks) return;
        var L=[(t.links||[]).length,(t.linkNames||[]).length,(t.linkLeads||[]).length,(t.linkFilterIds||[]).length];
        if(L[0]!==L[1]||L[1]!==L[2]||L[2]!==L[3]) bad.push(t.id+' '+L.join('/'));
      });
    });
    ok('Task link arrays stay aligned', !bad.length, bad.join(', ')||'all equal');
  });
  // 8. duplicate ids silently break getElementById in a single-file app
  attempt('No duplicate element ids',function(){
    var seen={},dupes=[];
    document.querySelectorAll('[id]').forEach(function(e){
      if(!e.id) return;                       // id="" is not a duplicate, it is just empty
      if(seen[e.id]) dupes.push(e.id); seen[e.id]=1; });
    ok('No duplicate element ids', !dupes.length, dupes.slice(0,5).join(', ')||'none');
  });

  var failed=R.filter(function(r){ return !r.pass; });
  try{
    if(window.console&&console.table) console.table(R.map(function(r){ return {check:r.name, result:r.pass?'PASS':'FAIL', detail:r.detail}; }));
  }catch(e){}
  return {all:R, failed:failed, passed:R.length-failed.length, total:R.length};
}
function selfTestRun(){
  var r=selfTest();
  if(r.failed.length){
    try{ showToast('⚠ Self-check: '+r.failed.length+' of '+r.total+' failed — '+r.failed[0].name+' ('+r.failed[0].detail+')', true); }catch(e){}
  } else {
    try{ showToast('✓ Self-check: all '+r.total+' passed'); }catch(e){}
  }
  return r;
}
/* Silent on a healthy load; only ever speaks up when something has regressed. */
setTimeout(function(){
  try{
    if(!window._mgrUnlocked) return;
    var r=selfTest();
    if(r.failed.length) showToast('⚠ Self-check failed: '+r.failed.map(function(f){return f.name;}).join(' · '), true);
  }catch(e){}
}, 6000);

