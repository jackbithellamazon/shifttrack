// ── DRAFT SHIFT SAVE / RESTORE ───────────────────────────
/* Returns a PROMISE that resolves true/false. It used to fire the request and
   return undefined, so the "Auto-saved HH:MM" chip stamped green before the
   request had even left the machine — it could not tell success from a dropped
   connection, and only ever reported failure when the VA pressed Save by hand. */
/* Suz: "when I close the tab it will lead me to the start shift".
   Drafts were keyed on the LONDON calendar date, but the VAs work Manila hours — Suz's
   morning is London's late night, so her shift routinely crosses London midnight WHILE
   SHE IS WORKING. The moment it did, row.date no longer equalled ukDateShort(), the
   restore treated a live draft as yesterday's, deleted it, and showed the fresh-start
   screen. The EOD record already attributes a shift to the MANILA day it started
   (phShiftDay); the draft simply never got the same treatment. It does now, and the
   real staleness test is the draft's age, not a date string that can change under it. */
function shiftDayKey(){
  try{
    var base = state.shiftStart ? new Date(state.shiftStart) : new Date();
    var k = base.toLocaleDateString('en-GB',{timeZone:'Asia/Manila'});
    if(k) return k;
  }catch(e){}
  return ukDateShort();
}
var DRAFT_MAX_AGE_MS = 16*60*60*1000;
function draftAgeMs(row, draft){
  var t = (draft&&draft.savedAt) || 0;
  if(!t && row && row.updated_at){ var d=new Date(row.updated_at); if(!isNaN(d)) t=d.getTime(); }
  return t ? (Date.now()-t) : Infinity;
}
function saveShiftDraft(manual) {
  if (IS_PREVIEW) return Promise.resolve(null);
  if (!DB_ENABLED || !state.currentVA || state.currentVA === 'Test' || !state.shiftStart) return Promise.resolve(null);
  if (state.submitted) return Promise.resolve(null); // Don't save drafts after EOD submitted

  // Capture exact elapsed ms so timer restores perfectly
  var elapsedMs = workedMs();

  /* ── THE CLOCK MUST NEVER GO BACKWARDS ──────────────────────────────────────
     18/08/2026. Suz clocked in at 06:17, ticked a task at 06:32, and at 10:14 her
     timer read 00:39:17 with no breaks taken. Mera was 1h27m short at the same
     moment. Their tasks, leads and true start times all survived intact — only the
     running base had moved. That is the whole reason it became permanent: every
     60-second autosave faithfully wrote the shrunken figure over the good one.
     Several things can move the base (a second tab, a restore that reads elapsed as
     0, re-entering through the login screen mid-shift) and chasing each one has not
     held. So enforce the property instead: inside one shift, worked time only ever
     goes UP. If this save would bank LESS than the most we have already seen today,
     the base is wrong — rebuild it from the known-good figure rather than record the
     loss. Two minutes of tolerance absorbs ordinary jitter; past that it is a reset.
     The high-water mark is cleared by startShift() and resetShift(), so a genuine
     new shift still starts honestly at zero. */
  var _elKey='bdl_maxel_'+state.currentVA+'_'+shiftDayKey();
  var _maxEl=0; try{ _maxEl=parseInt(lsGet(_elKey)||'0',10)||0; }catch(e){}
  if(_maxEl-elapsedMs > 120000){
    try{ console.warn('[shift] worked time went backwards ('+Math.round(elapsedMs/60000)
         +'m < '+Math.round(_maxEl/60000)+'m) — rebuilding the base'); }catch(e){}
    state.shiftStart=restoreBase(_maxEl,state.totalBreakMs,state.onBreak,state.breakStart,Date.now());
    elapsedMs=workedMs();
    window._shiftClockRepaired=(window._shiftClockRepaired||0)+1;
    try{ startTimer(); }catch(e){}
    try{ showToast('Your timer had slipped — put back to '
         +Math.floor(elapsedMs/3600000)+'h '+Math.round((elapsedMs%3600000)/60000)+'m \u2713'); }catch(e){}
  } else if(elapsedMs>_maxEl){
    try{ lsPut(_elKey,String(elapsedMs)); }catch(e){}
  }

  /* ── THE BEAT ────────────────────────────────────────────────────────────────
     One event a minute, carrying what this tab currently believes. Three jobs:
       · it is the heartbeat, so "active" time can be measured against clocked time
       · it is the write history (#2) — every save is now its own immutable row, so
         the next time a number moves I can see the exact minute it moved instead of
         reconstructing a morning from one overwritten field
       · it is where the numbers get checked against each other, once a minute */
  try{
    var _beatMeta={ elapsedMs:elapsedMs, breakMs:state.totalBreakMs||0,
                    onBreak:!!state.onBreak, repaired:(window._shiftClockRepaired||0),
                    tasksDone:(state.tasks||[]).filter(function(t){return t.done;}).length };
    if(Date.now()-(window._seLastBeat||0) >= SE_BEAT_MS){
      window._seLastBeat=Date.now();
      seLog('beat',_beatMeta);

      /* The check nobody was doing on 18/08: does the wall clock since she clocked
         in agree with what the timer counted? A shut laptop makes a small honest
         gap. Three hours does not. Jack hears about it the same hour either way. */
      var _ts=state._trueStart||state.shiftStart;
      if(_ts){
        var _wall=Date.now()-_ts-breakSoFarMs();
        var _gap=_wall-elapsedMs;
        if(_gap > 20*60000){
          seAlert('clockgap','Shift clock does not add up — '+vaDisp(state.currentVA),
            vaDisp(state.currentVA)+' clocked in at '+new Date(_ts).toLocaleTimeString('en-GB',
              {timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:true})
            +'.\nWall clock says **'+seFmt(_wall)+'** worked, her timer says **'+seFmt(elapsedMs)
            +'** — a gap of **'+seFmt(_gap)+'**.\nEither her laptop was shut, or the timer has '
            +'slipped. Worth a check before EOD.');
        }
      }
      if((window._shiftClockRepaired||0)>0 && !SE_ALERTED.repaired){
        seAlert('repaired','Timer slipped and was put back — '+vaDisp(state.currentVA),
          'The clock tried to go backwards and was rebuilt from the last good figure. '
          +'No time was lost, but it should not have happened — worth telling Claude.');
      }
    }
  }catch(e){}

  var draft = {
    va: state.currentVA,
    // _trueStart first: after one restore state.shiftStart is the fabricated timer
    // base, so saving that would launder the fake value back into the next restore.
    shiftStart: state._trueStart || state.shiftStart,
    totalBreakMs: state.totalBreakMs,     // total break ms accumulated
    elapsedMs: elapsedMs,                 // exact worked ms at save time
    savedAt: Date.now(),                  // when we saved (to recalculate on restore)
    onBreak: state.onBreak,
    breakStart: state.onBreak ? state.breakStart : null,   // a break in progress must survive a reload
    /* ...and so must the time it started. This lived only in memory, so a break
       that spanned a reload was filed with a blank start time and Jack's shift
       detail showed "  → 06:58 pm". */
    breakStartTime: state.onBreak ? (state._currentBreakStartTime||'') : '',
    breaks: state.breaks,
    newsletterDay: state._newsletterDay || false,
    tasks: state.tasks.map(function(t) { var c=JSON.parse(JSON.stringify(t)); if(c.timerRun){ c.timerSec=ttElapsedT(t); c.timerRun=false; c.timerStart=null; } return c; }),
    extraTasks: state.extraTasks.map(function(t) { var c=JSON.parse(JSON.stringify(t)); if(c.timerRun){ c.timerSec=ttElapsedT(t); c.timerRun=false; c.timerStart=null; } return c; }),
    storefronts: (state.storefronts||[]).map(function(s){ var c=JSON.parse(JSON.stringify(s)); if(c.running){ c.seconds=sfElapsed(s); c.running=false; c.startAt=null; } return c; }),
    jbDone: state._jbDone||{},
    eodAck: state._eodAck||{}
  };

  // Local mirror FIRST — the cloud can be unreachable, the disk can't. This is
  // what makes a dropped connection survivable instead of a lost day.
  try{ lsPut('bdl_draft_'+state.currentVA, JSON.stringify({date:shiftDayKey(),savedAt:Date.now(),data:draft})); }catch(e){}

  return fetch(SUPABASE_URL + '/rest/v1/draft_shifts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      va: state.currentVA,
      date: shiftDayKey(),
      updated_at: new Date().toISOString(),
      data: draft
    })
  }).then(function(response) {
    if (response.ok) {
      window._saveFails = 0;
      if (manual) {
        var btn = document.getElementById('save-btn');
        if (btn) {
          btn.textContent = '✓ Saved!';
          btn.style.background = 'rgba(45,212,163,0.25)';
          btn.style.borderColor = '#10d99a';
          setTimeout(function() {
            btn.textContent = '💾 Save';
            btn.style.background = 'rgba(45,212,163,0.1)';
            btn.style.borderColor = 'rgba(45,212,163,0.3)';
          }, 3000);
        }
        showToast('Shift saved to cloud ✓ Safe to restart');
      }
      return true;
    }
    saveFailed(manual, 'Save failed — try again');
    return false;
  }).catch(function(e) {
    console.error('Draft save error:', e);
    saveFailed(manual, 'Save failed — check your connection');
    return false;
  });
}
/* A silent automatic failure is EXACTLY the one the VA needs to hear about —
   it used to be reported only when she pressed Save by hand. */
function saveFailed(manual, msg){
  window._saveFails = (window._saveFails||0) + 1;
  if (manual || window._saveFails === 1) { try{ showToast(msg, true); }catch(e){} }
  if (window._saveFails >= 2) { try{ saveWarnBanner(true); }catch(e){} }
}
function saveWarnBanner(show){
  var b = document.getElementById('save-warn');
  if (!show) { if (b) b.remove(); return; }
  if (b) return;
  var host = document.getElementById('shift-bar') || document.getElementById('mandatory-tasks');
  if (!host || !host.parentNode) return;
  b = document.createElement('div'); b.id='save-warn'; b.className='save-warn';
  b.innerHTML = '<span>&#9888;</span><div><b>Your last '+(window._saveFails||2)+' saves didn\'t reach the cloud.</b>'
    + '<span>Your work is still safe on this device &mdash; keep this tab open and it will save itself once you\'re back online.</span></div>'
    + '<button onclick="retrySave()">Retry now</button>';
  host.parentNode.insertBefore(b, host);
}
function retrySave(){
  showToast('Trying again\u2026');
  saveShiftDraft(true).then(function(ok){ if(ok){ saveWarnBanner(false); showToast('Back online \u2014 shift saved \u2713'); } });
}

/* This deleted EVERY draft row for the VA, including a live one, whenever any single
   row failed a check. Combined with an unordered rows[0] read, one stale row was enough
   to take today's work with it. Scope the delete to the row actually being discarded. */
async function deleteDraft(va, date) {
  if (!DB_ENABLED) return;
  try {
    await fetch(SUPABASE_URL + '/rest/v1/draft_shifts?va=eq.' + va
        + (date ? '&date=eq.' + encodeURIComponent(date) : ''), {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      }
    });
  } catch(e) { console.error('Draft delete error:', e); }
}

/* Read the local mirror written by saveShiftDraft. This is the copy that survives
   an outage, and it is why a failed cloud read no longer has to mean a lost day. */
function localDraft(va){
  try{
    var raw=lsGet('bdl_draft_'+va); if(!raw) return null;
    var o=JSON.parse(raw);
    if(!o||!o.data) return null;
    // age is the only honest test — a date string can flip at midnight mid-shift
    if(Date.now()-(o.savedAt||0) > DRAFT_MAX_AGE_MS) return null;
    return o.data;
  }catch(e){ return null; }
}
/* Returns 'restored' | 'none' | 'error'. It used to return plain false for BOTH
   "no saved work" and "couldn't reach the server" — so a dropped connection showed
   the fresh-start screen, and the first autosave of the new shift then overwrote
   the real one (the POST merges on va+date). That is how a morning disappears. */
async function checkAndRestoreDraft(va) {
  if (!DB_ENABLED) return 'none';
  try {
    var res = await fetchT(SUPABASE_URL + '/rest/v1/draft_shifts?va=eq.' + va + '&select=*&order=updated_at.desc', {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      }
    });
    if (!res.ok) throw new Error('HTTP '+res.status);
    var rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('bad payload');     // a Supabase error body is an object
    if (!rows.length) {
      // cloud says nothing, but this device may still hold today's work
      var ld = localDraft(va);
      if (ld) { rows = [{ date: shiftDayKey(), data: ld }]; }
      else return 'none';
    }

    var row = rows[0];
    var draft = row.data;
    if (!draft) return 'none';

    /* Was: row.date !== ukDateShort() -> delete. That threw away a LIVE draft the
       instant London ticked past midnight, which for a Manila-hours VA is the middle
       of her shift. Age is the test that cannot betray her. */
    if (draftAgeMs(row, draft) > DRAFT_MAX_AGE_MS) {
      await deleteDraft(va, row.date);
      return 'none';
    }

    // Don't restore if already submitted today
    if (draft.submitted) {
      await deleteDraft(va, row.date);
      return 'none';
    }

    // Check if EOD already submitted to Supabase today for this VA
    try {
      /* The shift row is filed under the MANILA day it started (`date: phShiftDay`),
         but this looked it up by the LONDON date. Those differ for the seven hours
         either side of Manila midnight, where the guard would find nothing and hand
         her back a draft for a day she had already submitted. Ask for both. */
      var _dk=[ukDateShort(), shiftDayKey()].filter(function(d,z,a){ return d && a.indexOf(d)===z; })
        .map(function(d){ return '"'+d+'"'; }).join(',');
      var eodRes = await fetchT(SUPABASE_URL + '/rest/v1/shifts?va=eq.'+va+'&date=in.('+_dk+')&select=id&limit=1', {
        headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY}
      });
      var eodRows = await eodRes.json();
      if (eodRows && eodRows.length) {
        // Already submitted today — delete draft and don't restore
        await deleteDraft(va, row.date);
        return 'none';
      }
    } catch(e){}

    // Staleness check — if draft is more than 16 hours old, discard it
    var ageMs = Date.now() - (draft.savedAt || 0);
    if (ageMs > DRAFT_MAX_AGE_MS) {
      await deleteDraft(va, row.date);
      return 'none';
    }

    /* ── TIMER BASE — AND THE BREAK THAT WAS STILL RUNNING ────────────────────
       Set shiftStart so that workedMs() gives back exactly what she had worked.
       workedMs() = now - shiftStart - breakSoFarMs(), and breakSoFarMs() counts
       totalBreakMs PLUS the live break if one is still open. The old line only
       subtracted totalBreakMs, so the live break was deducted a second time and
       her clock lost the whole break.

       Suz, 14/08/2026, "lost my shift huhu": worked 2h35m19s, took a 2-hour break,
       came back to 00:35:19 on the timer. 2h35m19s − 2h = 35m19s, to the second.
       The v41.0 fix made the break VISIBLE on restore but left this arithmetic
       alone, so the hours kept vanishing. Include the live break in the base. */
    var restoredElapsed = draft.elapsedMs || 0;
    var restoredBreakMs = draft.totalBreakMs || 0;
    var fakeShiftStart = restoreBase(restoredElapsed, restoredBreakMs,
                                     draft.onBreak, draft.breakStart, Date.now());

    state.currentVA = va;
    state.shiftStart = fakeShiftStart;
    /* THE BUG THIS FIXES: fakeShiftStart keeps the timer honest and makes the CLOCK
       lie — it is `now - elapsed - breaks`, so the recorded "shift started at" became
       whatever time she happened to reload. The draft has carried the real epoch all
       along (`shiftStart: state.shiftStart` in saveDraft) and the restore threw it
       away. Evidence, 13/08/2026: Mera's EOD says 07:21 pm → 04:17 am while all 15 of
       her task ticks are 08:45–17:10; Mera 09/08 recorded a 36-MINUTE window against
       8.2 hours. hoursWorked was always right; the start and end times were fiction. */
    state._trueStart = draft.shiftStart || fakeShiftStart;
    state.totalBreakMs = restoredBreakMs;
    /* This forced onBreak=false and dropped breakStart, so reloading during a break
       ended it silently and paid every minute of it as worked time. */
    state.onBreak = !!draft.onBreak;
    state.breakStart = draft.onBreak ? (draft.breakStart || Date.now()) : null;
    state._currentBreakStartTime = draft.onBreak ? (draft.breakStartTime||'') : '';
    state.breaks = draft.breaks || [];
    state.tasks = draft.tasks || [];
    state.extraTasks = draft.extraTasks || [];
    state.storefronts = draft.storefronts || [];
    state._jbDone = draft.jbDone || {};
    state._eodAck = draft.eodAck || {};
    state._newsletterDay = draft.newsletterDay || false;
    state.submitted = false;
    state._forceEnd = draft.forceEnd || null;

    return 'restored';
  } catch(e) {
    console.error('Draft restore error:', e);
    // Last resort: this device's own copy. Only if that's missing do we admit defeat —
    // and 'error' must NEVER be treated as "no saved work".
    try{
      var ld = localDraft(va);
      if (ld) {
        var el = ld.elapsedMs || 0, bm = ld.totalBreakMs || 0;
        state.currentVA = va;
        // same one clock as everywhere else — never a second copy of the sum
        state.shiftStart = restoreBase(el, bm, false, null, Date.now());
        state._trueStart = ld.shiftStart || state.shiftStart;   // same rule as the cloud path
        state.totalBreakMs = bm;
        state.onBreak = false;
        state.breaks = ld.breaks || [];
        state.tasks = ld.tasks || [];
        state.extraTasks = ld.extraTasks || [];
        state.storefronts = ld.storefronts || [];
        state._jbDone = ld.jbDone || {};
        state._newsletterDay = ld.newsletterDay || false;
        state.submitted = false;
        try{ showToast('Restored from this device \u2014 couldn\'t reach the cloud'); }catch(_){}
        return 'restored';
      }
    }catch(_){}
    return 'error';
  }
}

/* toLocaleString('en-GB') gives "12/08/2026, 09:22:12" and new Date() reads that as
   US month/day — so this returned 8 December for 12 August. Measured across a 31-day
   month it was RIGHT on 1 day, silently WRONG on 11, and Invalid Date on 19 (any day
   past the 12th, where the "month" is out of range). It drives ukDayOfWeek(), which
   picks Mera's Tuesday/Thursday KPF filter tasks. Read the fields explicitly instead. */
function ukNow() {
  try{
    var g={};
    new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',
      day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})
      .formatToParts(new Date()).forEach(function(p){ g[p.type]=p.value; });
    var h=+g.hour; if(h===24) h=0;                      // some engines render midnight as 24
    var d=new Date(+g.year,(+g.month)-1,+g.day,h,+g.minute,+g.second);
    if(!isNaN(d.getTime())) return d;
  }catch(e){}
  return new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
}
// Suz colour — locked
var SUZ_COL='#FFEB3B';
function ukTimeString() { return new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:true}); }
function ukDateString() { return new Date().toLocaleDateString('en-GB',{timeZone:'Europe/London',weekday:'long',day:'numeric',month:'long',year:'numeric'}); }
function ukDateShort() { return new Date().toLocaleDateString('en-GB',{timeZone:'Europe/London'}); }
function ukDayOfWeek() { return ukNow().getDay(); }
function ukHour() { return ukNow().getHours(); }

