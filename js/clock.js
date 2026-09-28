/* ── WORKED TIME, ONE DEFINITION ────────────────────────────────────────────
   Audited against Jack's live Suz shift (12/08/2026): the draft had onBreak:true and
   totalBreakMs:0 — because break time is only ADDED when a break ends. Every elapsed
   calculation in the app subtracted totalBreakMs and nothing else, so a break that is
   still running counted as WORKED time: on the shift clock, in the autosaved draft,
   and in the hours submitted at EOD. Her draft was showing 108 minutes while she sat
   on a break. One function now owns this, and it counts the break in progress. */
/* ══════════ THE CLOCK — ONE DEFINITION, TWO USERS ══════════════════════════
   THE BUG (14/08/2026, Suz: "lost my shift huhu"):
   Two places did this arithmetic and they disagreed about ONE term.
     the live timer:   worked = now − shiftStart − (banked breaks + break running now)
     the restore base: shiftStart = now − worked − (banked breaks)     ← no live break
   Restore therefore handed the timer a base that was short by exactly the length of
   the break she was still on, and the timer then subtracted that break AGAIN.
   She worked 2h35m19s, broke for 2h, came back to 00:35:19. To the second.

   HOW IT GOT IN: an earlier fix changed restore to KEEP onBreak=true (before, it
   silently ended her break and paid it as work). That was right — but it introduced
   a live-break term on one side of the equation and nobody updated the other side.
   A shared invariant was edited from one end.

   THE FIX THAT MATTERS is not the missing term, it is that there is now only ONE
   function. `restoreBase` is `workedFrom` solved for shiftStart. They are inverses
   by construction, so they cannot drift apart again — and timerSelfTest() proves it
   on every build. Do not inline this arithmetic anywhere else. */
function breakTotalAt(totalBreakMs,onBreak,breakStart,now){
  var t=totalBreakMs||0;
  if(onBreak&&breakStart){ var live=now-breakStart; if(live>0) t+=live; }
  return t;
}
function workedFrom(shiftStart,totalBreakMs,onBreak,breakStart,now){
  var ms=now-shiftStart-breakTotalAt(totalBreakMs,onBreak,breakStart,now);
  return ms>0?ms:0;
}
function restoreBase(elapsedMs,totalBreakMs,onBreak,breakStart,now){
  return now-(elapsedMs||0)-breakTotalAt(totalBreakMs,onBreak,breakStart,now);
}
/* Round-trip: restore what we saved, get back what we saved. Run by the ship gate. */
function timerSelfTest(){
  var H=3600000, now=1700000000000, fails=[];
  [
    ['plain shift, no breaks',            3*H,        0,      false, 0],
    ['worked with breaks banked, working', 3*H+10*60000, 45*60000, false, 0],
    ["SUZ 14/08 — on a 2h break",         2*H+35*60000+19000, 0, true,  2*H],
    ['on a short break, breaks banked',   5*H,        30*60000, true,  12*60000],
    ['break longer than the work',        20*60000,   0,      true,  3*H],
    ['zero worked, on break',             0,          0,      true,  H],
    ['long shift, many breaks',           7*H+45*60000, 2*H+15*60000, false, 0]
  ].forEach(function(c){
    var name=c[0], elapsed=c[1], banked=c[2], onBreak=c[3], liveLen=c[4];
    var breakStart=onBreak?(now-liveLen):null;
    var base=restoreBase(elapsed,banked,onBreak,breakStart,now);
    var got=workedFrom(base,banked,onBreak,breakStart,now);
    if(Math.abs(got-elapsed)>1000)
      fails.push(name+': saved '+Math.round(elapsed/1000)+'s, restored '+Math.round(got/1000)+'s');
  });
  return fails;
}
/* ══════════ SHIFT EVENT LOG ══════════════════════════════════════════════════
   The clock used to be ONE NUMBER, rewritten every 60 seconds. Anything that wrote
   a bad value destroyed the truth and the next autosave cemented it — 18/08/2026
   that cost Suz 3h15m and Mera 1h27m before either of them noticed.

   Hours are now DERIVED from an append-only log of what actually happened
   (clocked in, break started, break ended, clocked out) and are stored NOWHERE.
   There is no number left to overwrite: to lose an hour something would have to
   DELETE an event, and the anon role has no delete grant on the table.

   This is also why the two-tab blocker could be deleted. Tabs no longer own
   anything — they all append to the same log and all compute the same answer —
   so a second tab, a shut laptop, a crash and a reopen are all the same thing.

   Degrades silently: if the table isn't there yet (SQL not run), SE_OK goes false
   and every call becomes a no-op. The app then behaves exactly as v44.4. */
var SE_OK   = null;                      // null = untested · false = table absent
var SE_TAB  = Math.random().toString(36).slice(2) + Date.now().toString(36);
/* ── TWO TABS, ONE SHIFT (v51.5) ─────────────────────────────────────────────
   28/09: Suz had the same shift open in two tabs; each saved over the other and the second
   one brought back an older copy of her day (a task ticked twice, two Discord pings). Every
   tab announces itself on a BroadcastChannel every 4s; a tab that hears another tab running
   the same VA's shift shows a plain warning. Nothing is blocked — the old two-tab blocker
   cost hours once — it just says what is happening. */
var TAB_CH=null, TAB_OTHERS={};
function tabWatchPaint(){
  try{
    var va=(window.state&&state.currentVA)||'', running=!!(window.state&&state.shiftStart&&!state.submitted);
    var clash=running && Object.keys(TAB_OTHERS).some(function(t){ return TAB_OTHERS[t].va===va; });
    var b=document.getElementById('tab-clash');
    if(!clash){ if(b) b.remove(); return; }
    if(b) return;
    var host=document.getElementById('shift-bar')||document.getElementById('mandatory-tasks'); if(!host||!host.parentNode) return;
    b=document.createElement('div'); b.id='tab-clash'; b.className='save-warn';
    b.innerHTML='<span>&#9888;</span><div><b>This shift is open in another tab too.</b>'
      +'<span>Use one tab only \u2014 two tabs save over each other, and the other one can bring back an older copy of your day.</span></div>';
    host.parentNode.insertBefore(b,host);
  }catch(e){}
}
function tabWatchStart(){
  try{
    if(!('BroadcastChannel' in window) || TAB_CH) return;
    TAB_CH=new BroadcastChannel('bdl-shifttrack-tabs');
    TAB_CH.onmessage=function(e){
      var msg=(e&&e.data)||{}; if(!msg.tab || msg.tab===SE_TAB) return;
      if(msg.va && msg.running) TAB_OTHERS[msg.tab]={va:msg.va,at:Date.now()}; else delete TAB_OTHERS[msg.tab];
      tabWatchPaint();
    };
    setInterval(function(){
      try{ TAB_CH.postMessage({tab:SE_TAB, va:(window.state&&state.currentVA)||'', running:!!(window.state&&state.shiftStart&&!state.submitted)}); }catch(e){}
      var cut=Date.now()-12000; Object.keys(TAB_OTHERS).forEach(function(t){ if(TAB_OTHERS[t].at<cut) delete TAB_OTHERS[t]; });
      tabWatchPaint();
    },4000);
  }catch(e){}
}
try{ setTimeout(tabWatchStart,3000); }catch(e){}
var SE_BEAT_MS = 60000;
var SE_ALERTED = {};                     // one Discord ping per shift per kind

function seEnabled(){
  try{
    return SE_OK!==false && !IS_PREVIEW && DB_ENABLED
           && typeof SUPABASE_URL!=='undefined' && !!SUPABASE_URL;
  }catch(e){ return false; }
}
function seLog(kind, meta){
  try{
    if(!seEnabled()) return Promise.resolve(false);
    if(!window.state || !state.currentVA || state.currentVA==='Test') return Promise.resolve(false);
    var row={ va:state.currentVA, day:shiftDayKey(), kind:kind,
              client_ms:Date.now(), tab:SE_TAB, meta:meta||{} };
    return fetch(SUPABASE_URL+'/rest/v1/shift_events',{method:'POST',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
               'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify([row])})
    .then(function(r){
      /* 404 = table not created yet, 401/403 = no grant. Either way stop trying;
         a shift must never be blocked because the log is unavailable. */
      if(r.status===404||r.status===401||r.status===403){ SE_OK=false; return false; }
      if(r.ok){ SE_OK=true; return true; }
      return false;
    }).catch(function(){ return false; });
  }catch(e){ return Promise.resolve(false); }
}
function seFetch(va, day){
  try{
    if(!seEnabled()) return Promise.resolve([]);
    return fetch(SUPABASE_URL+'/rest/v1/shift_events?va=eq.'+encodeURIComponent(va)
        +'&day=eq.'+encodeURIComponent(day)+'&select=*&order=client_ms.asc&limit=5000',
        {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}})
    .then(function(r){ if(r.status===404){ SE_OK=false; return []; } return r.ok?r.json():[]; })
    .catch(function(){ return []; });
  }catch(e){ return Promise.resolve([]); }
}

/* THE WHOLE POINT: worked time is calculated here, from events, every time it is
   asked for. Nothing writes it down, so nothing can corrupt it.
     clocked = (clock_out or now) - clock_in - breaks     <- what she is paid for
     active  = distinct minutes we actually saw a beat    <- when the app was open
   They normally match. A gap means the app was shut (fine, but visible) or the
   clock slipped (not fine — and now you are told rather than finding out at 5pm). */
function seCompute(events, nowMs){
  var now = nowMs || Date.now();
  var out = { clockIn:null, clockOut:null, breakMs:0, openBreakAt:null, clockedMs:0,
              activeMs:0, beats:0, correctionMins:null, correctionNote:'',
              lastBeatElapsedMs:null, anomalies:0 };
  if(!events || !events.length) return out;
  var openB=null, beatMin={};
  for(var i=0;i<events.length;i++){
    var e=events[i], t=+e.client_ms||0, k=e.kind;
    if(k==='clock_in'){ if(out.clockIn===null||t<out.clockIn) out.clockIn=t; }
    else if(k==='break_start'){ if(openB===null) openB=t; }
    else if(k==='break_end'){ if(openB!==null){ out.breakMs+=Math.max(0,t-openB); openB=null; } }
    else if(k==='clock_out'){ if(out.clockOut===null||t>out.clockOut) out.clockOut=t; }
    else if(k==='beat'){ out.beats++; beatMin[Math.floor(t/60000)]=1;
      try{ if(e.meta&&e.meta.elapsedMs!=null) out.lastBeatElapsedMs=+e.meta.elapsedMs; }catch(_){} }
    else if(k==='anomaly'){ out.anomalies++; }
    else if(k==='correction'){
      try{ var m=parseInt(e.meta&&e.meta.minutes,10);
           if(isFinite(m)&&m>=0){ out.correctionMins=m; out.correctionNote=String((e.meta&&e.meta.note)||''); } }catch(_){}
    }
  }
  out.openBreakAt=openB;
  /* A break still running at the end of the log is still running NOW — the old code
     forgot the live break and paid it as worked time. */
  if(openB!==null) out.breakMs += Math.max(0,(out.clockOut||now)-openB);
  if(out.clockIn!==null) out.clockedMs = Math.max(0,(out.clockOut||now)-out.clockIn-out.breakMs);
  out.activeMs = Object.keys(beatMin).length*60000;
  /* Jack's correction is the final word — it is the last event, and it wins. */
  if(out.correctionMins!=null) out.clockedMs = out.correctionMins*60000;
  return out;
}
/* ── #5 ONE BUTTON INSTEAD OF A CONVERSATION ─────────────────────────────────
   Suz did everything right on 18/08 — screenshot, Discord, an explanation — and it
   still took a while to work out that "the next time I get my 2nd filter I back me
   to start" meant a second tab. One press now sends the exact state instead, and
   files it in the log where it can be read back later. */
function shiftReportWrong(){
  try{
    if(!state||!state.currentVA){ showToast('Start your shift first',true); return; }
    var ts=state._trueStart||state.shiftStart;
    var wall=ts?(Date.now()-ts-breakSoFarMs()):0;
    var timer=workedMs();
    var snap={ reported:true, timerMs:timer, wallMs:wall, gapMs:Math.max(0,wall-timer),
               trueStart:ts||null, base:state.shiftStart||null,
               totalBreakMs:state.totalBreakMs||0, onBreak:!!state.onBreak,
               breaks:(state.breaks||[]).length, repaired:(window._shiftClockRepaired||0),
               tasksDone:(state.tasks||[]).filter(function(t){return t.done;}).length,
               ua:(navigator.userAgent||'').slice(0,120), tab:SE_TAB, ver:APP_VERSION };
    seLog('anomaly',snap);
    SE_ALERTED.reported=false;                       // a VA report always goes through
    delete SE_ALERTED.reported;
    var body=vaDisp(state.currentVA)+' pressed "Timer wrong?".\n'
      +'Timer says **'+seFmt(timer)+'**, wall clock since clock-in says **'+seFmt(wall)+'**'
      +(snap.gapMs>60000?' — gap of **'+seFmt(snap.gapMs)+'**':' (they agree)')+'.\n'
      +'Clocked in '+(ts?new Date(ts).toLocaleTimeString('en-GB',{timeZone:'Europe/London',
          hour:'2-digit',minute:'2-digit',hour12:true}):'?')
      +' · breaks '+snap.breaks+' · '+APP_VERSION;
    var url=''; try{ url=(getAppSettings().whShift||getAppSettings().whJack||'').trim(); }catch(e){}
    if(url && !IS_PREVIEW){
      fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({content:'\u{1F6A8} **Timer reported wrong**\n'+body})}).catch(function(){});
    }
    showToast('Sent to Jack ✓ — carry on, your work is safe');
  }catch(e){ try{ showToast('Could not send — message Jack on Discord',true); }catch(_){} }
}
function seFmt(ms){
  ms=Math.max(0,+ms||0);
  var h=Math.floor(ms/3600000), m=Math.round((ms%3600000)/60000);
  if(m===60){ h++; m=0; }
  return h+'h '+(m<10?'0':'')+m+'m';
}

/* ── #1 TELL JACK THE HOUR IT HAPPENS, NOT AT 5PM ──────────────────────────────
   Today the VA noticed, four hours in. The app knew at 09:35 and said nothing.
   It does not need to know WHY the numbers stopped agreeing to be worth sending. */
function seAlert(kind, title, body){
  try{
    if(SE_ALERTED[kind]) return;                 // once per shift per kind
    SE_ALERTED[kind]=true;
    seLog('anomaly',{alert:kind, title:title, body:body});
    var url=''; try{ url=(getAppSettings().whShift||getAppSettings().whJack||'').trim(); }catch(e){}
    if(!url || IS_PREVIEW) return;
    fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({content:'⚠️ **'+title+'**\n'+body})}).catch(function(){});
  }catch(e){}
}
function breakSoFarMs(){
  return breakTotalAt((state&&state.totalBreakMs)||0,
                      state&&state.onBreak, state&&state.breakStart, Date.now());
}
function workedMs(){
  if(!state||!state.shiftStart) return 0;
  return workedFrom(state.shiftStart,(state&&state.totalBreakMs)||0,
                    state&&state.onBreak, state&&state.breakStart, Date.now());
}
function paintShiftTimer() {
  if (!state.shiftStart) return;
  var el = document.getElementById('shift-timer'); if (!el) return;
  var ms = workedMs();
  if (ms < 0) ms = 0;
  var h = Math.floor(ms/3600000).toString().padStart(2,'0');
  var m = Math.floor((ms%3600000)/60000).toString().padStart(2,'0');
  var s = Math.floor((ms%60000)/1000).toString().padStart(2,'0');
  el.textContent = h+':'+m+':'+s;
  try{ updateStats(); }catch(e){}
}
function startTimer() {
  clearInterval(state.timerInterval);
  clearInterval(state.liveInterval);
  state.timerInterval = setInterval(paintShiftTimer, 1000);
  // Push live status to Supabase every 60 seconds
  // Auto-save draft every 2 minutes
  db_pushLiveStatus();
  saveShiftDraft(false);
  state.liveInterval = setInterval(function() {
    db_pushLiveStatus();
    saveShiftDraft(false); // autosave every 60s — laptop crash loses at most a minute
  }, 60000);
  if (!window._shiftWakeBound) {
    window._shiftWakeBound = true;
    document.addEventListener('visibilitychange', function(){
      if (document.hidden || !state.shiftStart) return;
      paintShiftTimer();                       // catch the clock up instantly
      try{ db_pushLiveStatus(); }catch(e){}    // tell Jack's board she is still here
      try{ saveShiftDraft(false); }catch(e){}  // close the autosave gap the sleep opened
    });
    window.addEventListener('focus', function(){
      if (!state.shiftStart) return;
      paintShiftTimer();
    });
  }
}

/* ══════════ THE BREAK UI IS DRAWN FROM state.onBreak, NEVER ASSUMED ══════════
   toggleBreak() was the only thing that ever showed the overlay or changed the
   button. Restoring a draft sets state.onBreak=true and touched neither — so
   reopening the tab mid-break gave her a completely normal-looking app with the
   shift clock silently frozen, and a button reading "Take a Break" that would
   END the break she didn't know she was on. Measured in the harness: 8 real
   seconds elapsed, 0 counted; a 7-hour shift recorded as 0.8 hours.
   One painter, called from both places, so the two can never disagree again. */
function paintBreakUI(){
  var btn=document.getElementById('break-btn');
  var overlay=document.getElementById('break-overlay');
  if(!btn||!overlay) return;
  if(state.onBreak){
    btn.innerHTML='&#9208; On Break...';
    btn.style.background='rgba(255,184,48,0.3)';
    btn.style.color='var(--amber)';
    btn.style.borderColor='rgba(255,184,48,0.6)';
    overlay.style.display='flex';
    clearInterval(state._breakTickInt);
    state._breakTickInt=setInterval(breakTick,1000);
    breakTick();
  } else {
    btn.innerHTML=breakLabel();
    btn.style.background='rgba(255,184,48,0.15)';
    btn.style.color='var(--amber)';
    btn.style.borderColor='rgba(255,184,48,0.4)';
    overlay.style.display='none';
    clearInterval(state._breakTickInt);
  }
}
/* 105 of 181 recorded breaks (58%) ran over an hour, 59 over two, and one over
   FIFTEEN — 09/08, 08:23 pm to 11:33 am. Nothing ever told her the clock was
   still stopped. It does now, and it gets harder to ignore the longer it runs. */
function breakTick(){
  var el=document.getElementById('break-timer');
  if(!el||!state.onBreak||!state.breakStart) return;
  var s=Math.floor((Date.now()-state.breakStart)/1000);
  var mins=Math.floor(s/60);
  el.textContent=String(mins).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
  var nag=document.getElementById('break-nag');
  if(!nag) return;
  if(mins>=90){
    nag.className='break-nag loud';
    nag.innerHTML='&#9888; <b>You have been on break for '+(mins>=120?Math.floor(mins/60)+'h '+(mins%60)+'m':mins+' minutes')+'.</b>'
      +'<span>Your shift clock is stopped &mdash; none of this is counting as worked time. If you are actually back, end the break now.</span>';
  } else if(mins>=45){
    nag.className='break-nag';
    nag.innerHTML='&#9203; <b>'+mins+' minutes on break.</b><span>Still paused &mdash; end the break when you are back.</span>';
  } else nag.className='break-nag off';
}
function toggleBreak() {
  var btn=document.getElementById('break-btn');
  var overlay=document.getElementById('break-overlay');
  if (!state.onBreak) {
    state.breakStart=Date.now(); state.onBreak=true;
    var startTime=new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:true});
    state._currentBreakStartTime=startTime;
    var bt=document.getElementById('break-timer'); if(bt) bt.textContent='00:00';
    paintBreakUI();
    try{ seLog('break_start',{}); }catch(e){}
    db_pushLiveStatus(); saveShiftDraft(false);
    discord_break_notify(true);
  } else if (state.breakStart && Date.now()-state.breakStart < 3000) {
    /* A double-tap, not a break. It used to log a 0-minute break AND ping Jack's
       Discord twice — 16 of those are sitting in the real data, two of them on
       Suz's 13/08 shift. Worse, the overlay flashed and vanished, so she believed
       she was on break and every minute away was paid as worked time. */
    state.onBreak=false; state.breakStart=null; state._currentBreakStartTime='';
    paintBreakUI();
    showToast('That was a double-tap &mdash; you are not on break. Tap once to start one.', true);
    return;
  } else {
    var endMs=Date.now();
    var endTime=new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:true});
    state.breaks.push({
      startMs:state.breakStart,
      endMs:endMs,
      startTime:state._currentBreakStartTime||'',
      endTime:endTime,
      durationMins:Math.round((endMs-state.breakStart)/60000)
    });
    var breakDurMins = Math.round((endMs-state.breakStart)/60000);
    state.totalBreakMs+=endMs-state.breakStart; state.onBreak=false;
    state._currentBreakStartTime='';
    paintBreakUI();
    showToast('Break ended - back to it!');
    try{ seLog('break_end',{mins:breakDurMins}); }catch(e){}
    db_pushLiveStatus(); saveShiftDraft(false);
    discord_break_notify(false, breakDurMins);
  }
}

// Live count of this VA's sourced leads for today, straight from the synced sheet (null if not loaded)
