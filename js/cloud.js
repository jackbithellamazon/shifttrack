/* ══════════ SAVE SAFETY NET ══════════════════════════════════════════════════
   Five separate times this app has told Jack something was saved when it wasn't:
   the autosave chip, the pay flag, the EOD submit, db_insert, and lead decisions.
   Every one was the same shape — fire a write, swallow the error, report success.
   Fixing them one at a time doesn't stop the sixth. So: one helper that every
   data-critical write goes through, which VERIFIES the response and makes any
   failure visible and retryable. Silence is not an option it offers. */
var SAVE_FAILS = {};
function dbWrite(label, url, opts, retry){
  return fetchT(url, opts).then(function(r){
    if(r && r.ok){ saveOk(label); return r; }
    saveFail(label, 'the server said no ('+(r?r.status:'?')+')', retry);
    return r;
  }).catch(function(e){
    saveFail(label, (e && e.timeout) ? 'it timed out' : 'you appear to be offline', retry);
    throw e;
  });
}
function saveOk(label){ if(SAVE_FAILS[label]){ delete SAVE_FAILS[label]; renderSaveBar(); } }
function saveFail(label, why, retry){
  SAVE_FAILS[label]={why:why, retry:retry||null, at:Date.now()};
  renderSaveBar();
  try{ errLog('save_fail',{msg:label+' \u2014 '+why}); }catch(e){}
}
/* ── ERRORS FROM THEIR MACHINES (v51.5) ────────────────────────────────────────
   Hundreds of try/catch blocks keep this app on its feet, and the price was that a broken
   screen on a VA's laptop was invisible until she messaged Jack. Every uncaught error, every
   unhandled promise and every failed cloud save is now written to shift_events (kind error /
   save_fail), once per distinct message per session, capped so a storm cannot flood the table.
   Jack's Issues tab reads them back ("From their machines"). Never in preview. */
var ERR_SENT={}, ERR_COUNT=0;
function errLog(kind, meta){
  try{
    if(typeof IS_PREVIEW!=='undefined' && IS_PREVIEW) return;
    if(typeof SUPABASE_URL==='undefined' || typeof DB_ENABLED==='undefined' || !DB_ENABLED) return;
    var key=kind+'|'+String((meta&&meta.msg)||'').slice(0,80);
    if(ERR_SENT[key]) return; ERR_SENT[key]=1;
    if(++ERR_COUNT>25) return;
    var va=(window.state&&state.currentVA&&state.currentVA!=='Test')?state.currentVA:'Jack';
    var day=''; try{ day=shiftDayKey(); }catch(e){ day=new Date().toLocaleDateString('en-GB'); }
    var row={va:va, day:day, kind:kind, client_ms:Date.now(), tab:(typeof SE_TAB!=='undefined'?SE_TAB:''),
      meta:Object.assign({ver:(typeof APP_VERSION!=='undefined'?APP_VERSION:''), where:(location.hash||'').slice(0,40)}, meta||{})};
    fetch(SUPABASE_URL+'/rest/v1/shift_events',{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify([row])}).catch(function(){});
  }catch(e){}
}
try{
  window.addEventListener('error',function(e){ errLog('error',{msg:String((e&&e.message)||'error').slice(0,200), src:String((e&&e.filename)||'').split('/').pop().split('?')[0].slice(0,50), line:(e&&e.lineno)||0}); });
  window.addEventListener('unhandledrejection',function(e){ var r=e&&e.reason; errLog('error',{msg:'unhandled: '+String((r&&(r.message||r))||'').slice(0,200), src:String((r&&r.stack)||'').split('\n')[1]||''}); });
}catch(e){}
function renderSaveBar(){
  var keys=Object.keys(SAVE_FAILS);
  var bar=document.getElementById('save-fail-bar');
  if(!keys.length){ if(bar) bar.remove(); document.body.classList.remove('has-save-bar'); return; }
  if(!bar){
    bar=document.createElement('div'); bar.id='save-fail-bar';
    document.body.appendChild(bar); document.body.classList.add('has-save-bar');
  }
  var first=SAVE_FAILS[keys[0]];
  bar.innerHTML='<span class="sf-i">&#9888;</span>'
    +'<div><b>'+keys.length+' thing'+(keys.length===1?'':'s')+" didn't save.</b>"
    +'<span>'+escHtml(keys.slice(0,3).join(', '))+(keys.length>3?' +'+(keys.length-3)+' more':'')
    +' &mdash; '+escHtml(first.why)+'</span></div>'
    +'<button onclick="retryAllSaves()">Retry</button>'
    +'<button class="sf-x" onclick="dismissSaveBar()" title="Hide">&#10005;</button>';
}
function retryAllSaves(){
  var keys=Object.keys(SAVE_FAILS);
  if(!keys.length) return;
  showToast('Retrying '+keys.length+'…');
  keys.forEach(function(k){
    var f=SAVE_FAILS[k];
    if(typeof f.retry==='function'){ try{ f.retry(); }catch(e){} }
    else { delete SAVE_FAILS[k]; }        // nothing to replay — clear so the bar is honest
  });
  setTimeout(renderSaveBar, 900);
}
function dismissSaveBar(){ SAVE_FAILS={}; renderSaveBar(); }
function fetchT(url, opts, ms){
  opts = opts || {}; ms = ms || 12000;
  var timer, settled = false;
  var ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var merged = {}; for (var k in opts) merged[k] = opts[k];
  if (ac) merged.signal = ac.signal;

  // RACE rather than relying on the abort alone. Aborting asks the request to stop,
  // but nothing guarantees the promise then settles — so the deadline is enforced on
  // our side too. Without this a request that ignores the signal still hangs for ever,
  // which is the whole failure we are fixing.
  var deadline = new Promise(function(_, reject){
    timer = setTimeout(function(){
      if (settled) return;
      if (ac) { try{ ac.abort(); }catch(e){} }
      var te = new Error('timeout'); te.timeout = true;
      reject(te);
    }, ms);
  });

  return Promise.race([fetch(url, merged), deadline]).then(
    function(r){ settled = true; clearTimeout(timer); return r; },
    function(e){
      settled = true; clearTimeout(timer);
      if (e && (e.timeout || e.name === 'AbortError')) { var te = new Error('timeout'); te.timeout = true; throw te; }
      throw e;
    }
  );
}
/* Sandbox detection. The point is to stop TEST runs writing to live data — but it was
   also blocking Jack, who genuinely works from the file on his disk, and his lead
   decisions were dropped for four days because of it. So a `file://` copy can now be
   unlocked in one click (`bdl_live_writes`); localhost stays hard-blocked because that
   is only ever an automated preview. */
var IS_PREVIEW = (function(){ try{
  var h=location.hostname;
  var isLocalServer = (h==='localhost'||h==='127.0.0.1'||h==='0.0.0.0');
  if(isLocalServer) return true;                       // never writable — this is the test harness
  if(location.protocol==='file:'){
    try{ if(lsGet('bdl_live_writes')==='1') return false; }catch(e){}
    return true;                                       // blocked until explicitly unlocked
  }
  return !h;
}catch(e){ return false; } })();
/* ── PREVIEW NEVER WRITES — enforced at the network, not by discipline (v51.5) ──────────
   28/09: the ship gate's smoke run submitted a test shift on a 127.0.0.1 copy and the app
   fired a real DELETE at Mera's cloud draft (eodSaved → deleteDraft was never gated). Dozens
   of writes are individually guarded with IS_PREVIEW; one that is not can wipe a VA's live
   day from a preview tab. So in preview every non-GET request to anywhere, and every Discord
   URL, is swallowed here and answered with an empty 200 — the caller believes it saved, which
   is exactly what a preview should do. Reads stay real, so the data on screen is real. */
if(IS_PREVIEW){ (function(){
  try{
    var real=window.fetch; window._previewBlocked=[];
    window.fetch=function(u,o){
      var m=((o&&o.method)||'GET').toUpperCase(), url=String(u);
      if(m!=='GET' || /discord\.com\/api\/webhooks/i.test(url)){
        try{ window._previewBlocked.push(m+' '+url.replace(/^https?:\/\/[^/]+/,'').split('?')[0]); console.warn('[preview] blocked '+m+' '+url.slice(0,100)); }catch(e){}
        return Promise.resolve(new Response('[]',{status:200,headers:{'Content-Type':'application/json'}}));
      }
      return real.apply(this,arguments);
    };
  }catch(e){}
})(); }
/* Turn saving on for this browser (file:// copies only). */
function enableLiveWrites(){
  try{
    if(location.hostname) { showToast('This copy already saves normally.'); return; }
    lsPut('bdl_live_writes','1');
  }catch(e){}
  showToast('Saving switched on \u2014 reloading\u2026');
  setTimeout(function(){ location.reload(); }, 700);
}
function disableLiveWrites(){
  try{ lsDrop('bdl_live_writes'); }catch(e){}
  location.reload();
}
var DISCORD_PAY_WEBHOOK = '';
var SUPABASE_URL      = 'https://ffbdazepqrsyurhouxif.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmYmRhemVwcXJzeXVyaG91eGlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4OTM5MjIsImV4cCI6MjA5MDQ2OTkyMn0.BAuodLUDGzO9A7IfoRRn0HZ1MgWOXNPeYKPDBNaNWeg';
var DISCORD_WEBHOOK   = ''; // set in Jack Settings → Notifications
var DISCORD_WEEKLY_WEBHOOK = '';
var DISCORD_TASKS_WEBHOOK = '';
var DISCORD_BREAK_WEBHOOK = '';
var DISCORD_SHIFT_START_WEBHOOK = '';

var DB_ENABLED = SUPABASE_URL !== 'YOUR_SUPABASE_URL';

// ── SUPABASE HELPERS ─────────────────────────────────────
async function db_insert(table, record) {
  if(IS_PREVIEW) return null;
  if (!DB_ENABLED) return null;
  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(record)
    });
    // It used to `return await res.json()` regardless — so a 4xx/5xx RESOLVED with the
    // error body, and callers' .then() ran as if the write had succeeded. That is how an
    // end-of-day Discord summary could go out for a shift that was never stored.
    if (!res.ok) {
      var body=''; try{ body=(await res.text()).slice(0,300); }catch(_){}
      console.error('DB insert failed:', table, res.status, body);
      throw new Error('insert failed: '+res.status);
    }
    return await res.json();
  } catch(e) { console.error('DB insert error:', e); throw e; }
}

async function db_fetch(table, filters) {
  if (!DB_ENABLED) return null;
  try {
    var qs = filters ? '?' + filters : '';
    var res = await fetchT(SUPABASE_URL + '/rest/v1/' + table + qs, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      }
    });
    return await res.json();
  } catch(e) { console.error('DB fetch error:', e); return null; }
}

async function db_delete(table, id) {
  if (!DB_ENABLED) return null;
  try {
    await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + id, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      }
    });
  } catch(e) { console.error('DB delete error:', e); }
}

async function db_loadAll() {
  if (!DB_ENABLED) return null;
  var rows = await db_fetch('shifts', 'order=submitted_at.desc&limit=120');
  if (!rows || !Array.isArray(rows)) return null;
  return rows.map(function(r) { return r.data; }).filter(function(d){ return d && !d.archived; });   // v51.5: archived stays in Supabase, off the dashboard
}

/* ── THE VA'S OWN HISTORY, FROM SUPABASE (v50.9) ──────────────────────────────
   Her machine used to keep her last 60 full shift reports in the browser (0.95M
   characters) so the streak, the sparkline and Discord's "vs last shift" had
   something to read. Those only ever need date, leads and hours. Pull exactly that
   — about 5k characters — at login and keep it in memory. Jack's full pull, if it
   has already happened in this browser, is never downgraded by it. */
function vaHistLoad(va){
  if(!(va==='Mera'||va==='Suz') || !DB_ENABLED) return Promise.resolve(mgr_getLog());
  return fetchT(SUPABASE_URL+'/rest/v1/shifts?select=id,va,date,submitted_at,totalLeads:data->>totalLeads,hoursWorked:data->>hoursWorked'
      +'&va=eq.'+encodeURIComponent(va)+'&data->>archived=neq.true&order=submitted_at.desc&limit=60',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(rows){
      if(!Array.isArray(rows) || window._shiftLogFull) return mgr_getLog();
      window._shiftLog=rows.map(function(r){ return {id:r.id, va:r.va, date:r.date, totalLeads:r.totalLeads, hoursWorked:r.hoursWorked, _summary:true}; });
      try{ if(typeof renderShiftKpiExtras==='function') renderShiftKpiExtras(); }catch(e){}
      return window._shiftLog;
    })
    .catch(function(){ return mgr_getLog(); });
}
/* the shift she has just submitted, so "vs last shift" is right without a refetch */
function vaHistRemember(rec){
  if(!rec||!rec.va) return;
  var log=mgr_getLog().filter(function(r){ return !(r.va===rec.va && r.date===rec.date); });
  log.unshift({id:rec.id, va:rec.va, date:rec.date, totalLeads:rec.totalLeads, hoursWorked:rec.hoursWorked, _summary:true});
  window._shiftLog=log;
}
/* ── RETIRE THE OLD BROWSER COPIES, WITHOUT LOSING A ROW (v50.9) ─────────────
   `shifttrack_eod_log` and `bdl_decisions` are no longer read by anything. Before
   deleting either, check every row it holds is in Supabase — a VA's copy could in
   theory hold a shift whose upload failed long ago. If every row is in the cloud
   the key goes and the pot gets its space back; if not, it stays and the console
   names the rows. Read-only on the cloud; runs once per load, only if a key exists. */
function legacyLogRetire(){
  if(!DB_ENABLED) return;
  var H={headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}};
  try{
    var raw=lsGet('shifttrack_eod_log');
    if(raw!=null){
      var local=[]; try{ local=JSON.parse(raw)||[]; }catch(e){ local=[]; }
      fetchT(SUPABASE_URL+'/rest/v1/shifts?select=va,date&limit=5000',H)
        .then(function(r){ return r.ok?r.json():null; })
        .then(function(rows){
          if(!Array.isArray(rows)) return;
          var have={}; rows.forEach(function(r){ have[r.va+'|'+r.date]=1; });
          var missing=(Array.isArray(local)?local:[]).filter(function(r){ return r && r.va && r.va!=='Test' && !have[r.va+'|'+r.date]; });
          if(missing.length){ console.warn('[storage] keeping the old shift copy: '+missing.length+' row(s) are not in Supabase',
                                           missing.map(function(r){ return r.va+' '+r.date; })); return; }
          lsDrop('shifttrack_eod_log');
          try{ console.log('[storage] old shift copy retired — every row is in Supabase'); }catch(e){}
        }).catch(function(){});
    }
    var rawD=lsGet('bdl_decisions');
    if(rawD!=null){
      var localD=[]; try{ localD=JSON.parse(rawD)||[]; }catch(e){ localD=[]; }
      fetchT(SUPABASE_URL+'/rest/v1/lead_decisions?select=id&limit=10000',H)
        .then(function(r){ return r.ok?r.json():null; })
        .then(function(rows){
          if(!Array.isArray(rows)) return;
          var have={}; rows.forEach(function(r){ have[r.id]=1; });
          var missing=(Array.isArray(localD)?localD:[]).filter(function(r){ return r && r.id!=null && !have[r.id]; });
          if(missing.length){ console.warn('[storage] keeping the old decisions copy: '+missing.length+' not in Supabase',
                                           missing.map(function(r){ return r.id; })); return; }
          lsDrop('bdl_decisions');
        }).catch(function(){});
    }
  }catch(e){}
}
try{ setTimeout(legacyLogRetire,4000); }catch(e){}

