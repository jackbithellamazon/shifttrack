// ── MANAGER DASHBOARD ENGINE v2 ───────────────────────────
/* v50.9: the shift history lives in memory for this session and comes from Supabase
   every time — Jack's dashboard pulls the last 120 full reports (mgr_syncFromDB), a
   VA's screen pulls her own last 60 as date/leads/hours only (vaHistLoad). There is
   no browser copy any more; the 1.85M-character one is retired by legacyLogRetire. */
function mgr_getLog(){
  return Array.isArray(window._shiftLog)?window._shiftLog:[];
}
// Load from Supabase into memory, then re-render
/* ── THE MONTH ROLLS OVER AND THE APP GOES BLIND ─────────────────────────────
   `sheet_tabs.included` is what the Apps Script reads to decide which tabs to push.
   Proof it matters: the two July tabs synced to 31 Jul, while every tab switched off
   on 10 Jul has been frozen at 10 Jul ever since. So on the 1st of a new month, with
   no new tab included, leads simply stop arriving — silently — and the end-of-day
   reconciliation then reports every lead a VA logged as missing from the sheet.
   Jack asked for this automated, so it heals itself and only shouts when it can't. */
var TAB_STATE=null;
var TAB_MONTHS=['january','february','march','april','may','june','july','august',
                'september','october','november','december'];
function tabIsBaseMonth(name,mi){
  var low=String(name||'').toLowerCase();
  if(low.indexOf('a2a')>=0 || /\bpp\b/.test(low)) return false;   // variants stay as Jack set them
  var m=TAB_MONTHS[mi];
  return low.indexOf(m)>=0 || new RegExp('\\b'+m.slice(0,3)).test(low);
}
async function sheetTabsAutoSync(){
  if(!DB_ENABLED || IS_PREVIEW) return null;
  var mi=new Date().getMonth(), mName=TAB_MONTHS[mi];
  try{
    var res=await fetchT(SUPABASE_URL+'/rest/v1/sheet_tabs?select=sheet_id,tab,included',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
    if(!res.ok) return null;
    var rows=await res.json(); if(!Array.isArray(rows)) return null;

    /* ── DISCOVER TABS THAT HAVE NEVER BEEN REGISTERED ────────────────────────────
       This used to switch ON tabs it already knew about, and nothing else. A tab that
       was never in sheet_tabs was simply invisible — there was nothing to switch on.
       Suz's "May PP" sat unregistered and unsynced for months that way, and Jack now
       creates a NEW TAB EVERY MONTH, so September would have gone the same way: a small
       banner, and the leads silently never arriving.
       So ask Google what tabs actually exist and register anything new — switched OFF,
       because discovering a tab is not the same as being told to sync it. The month pass
       below can then find it like any other. */
    var added=[];
    var _notLeads=/login|keepa|notification|viewer|template|instruction|archive/i;
    if(typeof LEAD_PULL_KEY!=='undefined' && LEAD_PULL_KEY){
      var _sids=Object.keys(SHEET_NAMES);
      for(var _i=0;_i<_sids.length;_i++){
        var _sid=_sids[_i];
        try{
          var _gr=await fetchT('https://sheets.googleapis.com/v4/spreadsheets/'+_sid
                 +'?key='+LEAD_PULL_KEY+'&fields=sheets.properties.title');
          if(!_gr.ok) continue;
          var _real=((await _gr.json()).sheets||[]).map(function(s){ return s.properties.title; });
          var _known={}; rows.forEach(function(t){ if(t.sheet_id===_sid) _known[t.tab]=1; });
          var _fresh=_real.filter(function(t){ return !_known[t] && !_notLeads.test(t); });
          if(!_fresh.length) continue;
          var _ins=await fetchT(SUPABASE_URL+'/rest/v1/sheet_tabs',{method:'POST',
            headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
              'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},
            body:JSON.stringify(_fresh.map(function(t){ return {sheet_id:_sid,tab:t,included:false}; }))});
          if(_ins.ok){
            (function(sid2){ _fresh.forEach(function(t){
              rows.push({sheet_id:sid2,tab:t,included:false});
              added.push(SHEET_NAMES[sid2]+' → '+t); }); })(_sid);
          }
        }catch(e){}
      }
    }

    var turnedOn=[], missing=[];
    Object.keys(SHEET_NAMES).forEach(function(sid){
      var mine=rows.filter(function(t){ return t.sheet_id===sid && tabIsBaseMonth(t.tab,mi); });
      if(!mine.length){ missing.push(SHEET_NAMES[sid]); return; }
      mine.forEach(function(t){
        if(t.included) return;
        turnedOn.push(SHEET_NAMES[sid]+' → '+t.tab);
        fetchT(SUPABASE_URL+'/rest/v1/sheet_tabs?sheet_id=eq.'+encodeURIComponent(sid)
               +'&tab=eq.'+encodeURIComponent(t.tab),
          {method:'PATCH',headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
           'Content-Type':'application/json',Prefer:'return=minimal'},
           body:JSON.stringify({included:true,updated_at:new Date().toISOString()})}).catch(function(){});
      });
    });
    TAB_STATE={month:mName, turnedOn:turnedOn, missing:missing, added:added};
    if(turnedOn.length) showToast('New month — switched on '+turnedOn.length+' '+mName+' tab'
      +(turnedOn.length===1?'':'s')+' so leads keep syncing ✓');
    /* A newly-found tab whose name does not read as this month is NOT guessed at — the
       tabs are named every which way ("JULY 2026", "AUGUST ", "May PP", "Feb PP A2A"),
       so a wrong guess would sync the wrong month silently. Name it and let Jack decide. */
    if(added.length) showToast('Found '+added.length+' new sheet tab'+(added.length===1?'':'s')
      +' — check Settings → Sheet tabs to switch '+(added.length===1?'it':'them')+' on', true);
    return TAB_STATE;
  }catch(e){ return null; }
}
function tabBannerHTML(){
  if(!TAB_STATE) return '';
  var m=TAB_STATE.month.charAt(0).toUpperCase()+TAB_STATE.month.slice(1);
  var out='';
  if(TAB_STATE.missing.length){
    out+='<div class="tab-bar bad">⚠️<div>No <b>'+m+'</b> tab has reached the app for <b>'
      +TAB_STATE.missing.join('</b> and <b>')+'</b>.<br>'
      +'Until that tab exists in the sheet and the sheet script has run once, '+m
      +' leads will not appear here — and the end-of-day check will report every lead as missing.</div></div>';
  }
  if(TAB_STATE.turnedOn.length){
    out+='<div class="tab-bar fixed">✅ New month — switched on automatically so nothing stops syncing: <b>'
      +TAB_STATE.turnedOn.join('</b>, <b>')+'</b></div>';
  }
  return out;
}
/* Jack: "popup if by start of Monday morning a VA is under hours — it's important
   I know, I'll need to speak to the VA." The week closes Friday night (VAs work
   Mon–Fri), so from Saturday through Monday the Overview carries a red bar naming
   anyone whose LAST week came in under the weekly target. Same numbers as the
   Hours & Time strip: sum of hoursWorked across that Mon–Fri, vs weeklyHoursTarget. */
/* Leads stop arriving for two reasons and they look identical from here:
   the sheet's script stopped, or the rows are being REJECTED on their way in.
   Mera hit the second: her DATE column is UK d/m/y, she types US m/d/y, so
   "8/3/2026" became 8 March, fell before the script's 1-July backfill cutoff and
   all 19 August leads were dropped in silence. Same slip the other way puts a
   lead in the future — 88 of hers are dated Sep-Dec. So flag BOTH symptoms and
   never assert a cause the app cannot actually see. */
function futureDatedLeads(){
  var out={};
  /* The VAs work in the Philippines — 8h ahead of the UK. When it is Wednesday
     evening here it is already Thursday for them, so a lead they log today
     carries TOMORROW's UK date and is perfectly legitimate. Judge against the
     date where the work actually happened, or this cries wolf every evening. */
  var phToday;
  try{
    var f=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});   // yyyy-mm-dd
    var q=f.split('-'); phToday=(+q[0])*10000+(+q[1])*100+(+q[2]);
  }catch(e){
    var n=new Date(); phToday=n.getFullYear()*10000+(n.getMonth()+1)*100+n.getDate();
  }
  (window.leads||[]).forEach(function(l){
    var p=String(l.date||'').split('/');            // dd/mm/yyyy — NOT a Date() string
    if(p.length!==3) return;
    var dd=+p[0], mm=+p[1], yy=+p[2];
    if(!dd||!mm||!yy) return;
    if(yy*10000+mm*100+dd <= phToday) return;
    var v=vaDisp(l.va)||l.va; (out[v]=out[v]||[]).push(l);
  });
  return out;
}
function syncStaleBannerHTML(){
  try{
    var all=window.leads||[]; if(all.length<5) return '';
    var out='';
    var fut=futureDatedLeads();
    Object.keys(fut).forEach(function(v){
      var n=fut[v].length; if(n<2) return;
      var soon=fut[v].map(function(l){ return l.date; }).slice(0,3).join(', ');
      out+='<div class="lead-warn"><b>&#9888; '+escHtml(v)+' has '+n+' lead'+(n===1?'':'s')+' dated in the future</b>'
        +'<span>'+escHtml(soon)+(n>3?' and '+(n-3)+' more':'')
        +' &mdash; check the DATE column on her sheet is being typed the way the column reads.</span></div>';
    });
    var newest={};
    ['Mera','Suz'].forEach(function(va){
      var code=(typeof vaCode==='function')?vaCode(va):(va==='Mera'?'VA M':'VA S');
      var mine=all.filter(function(l){ return l.va===code && typeof l.hrs==='number'; });
      newest[va]=mine.length?Math.min.apply(null,mine.map(function(l){ return l.hrs; })):null;
    });
    ['Mera','Suz'].forEach(function(va){
      var mine=newest[va], other=newest[va==='Mera'?'Suz':'Mera'];
      if(mine==null || mine<36) return;
      if(other==null || other>24) return;
      var days=Math.round(mine/24), them=vaDisp(va==='Mera'?'Suz':'Mera');
      out+='<div class="pay-bar due late"><b>⚠ Nothing has arrived from '+escHtml(vaDisp(va))+' for '+days+' day'+(days===1?'':'s')+'</b>'
        +' — but '+escHtml(them)+'&rsquo;s came through today, so this is her sheet, not her effort. Two things to check,'
        +' in this order: <b>1.</b> open her sheet&rsquo;s current-month tab and look at the DATE column —'
        +' if the dates are not really this month, every row is being rejected on the way in.'
        +' <b>2.</b> if the dates are right, <b>Extensions → Apps Script → Executions</b> for a failing run.</div>';
    });
    return out;
  }catch(e){ return ''; }
}
function hoursBannerHTML(){
  try{
    var now=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
    var dow=now.getDay();                       // Sat 6 · Sun 0 · Mon 1
    if(dow!==6 && dow!==0 && dow!==1) return '';
    // Monday of LAST week
    var backToMon=(dow===6)?5:(dow===0)?6:7;
    var mon=new Date(now.getFullYear(),now.getMonth(),now.getDate()-backToMon);
    var days={};
    for(var i=0;i<5;i++){ var d=new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+i);
      days[('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear()]=1; }
    var target=(getAppSettings().weeklyHoursTarget)||40;
    var log=mgr_getLog();
    var out='';
    ['Mera','Suz'].forEach(function(va){
      var hrs=log.filter(function(r){ return r.va===va && days[r.date]; })
                 .reduce(function(s,r){ return s+(parseFloat(r.hoursWorked)||0); },0);
      if(hrs>=target) return;
      var lbl=(dow===1?'last week':'this past week');
      out+='<div class="pay-bar due late"><b>⚠ '+escHtml(vaDisp(va))+' finished '+lbl+' under hours</b>'
        +' — <b>'+hrs.toFixed(1)+'h</b> of '+target+'h ('+Math.round(hrs/target*100)+'%), '
        +(target-hrs).toFixed(1)+'h short. Worth a chat before the week gets going.'
        +'<span style="margin-left:auto;"><button class="btn btn-ghost" style="font-size:11px;padding:4px 10px;" '
        +'onclick="mgr_switchTab(\''+(va==='Mera'?'mera':'suz')+'\')">See her week →</button></span></div>';
    });
    return out;
  }catch(e){ return ''; }
}
async function mgr_syncFromDB(){
  if(!DB_ENABLED){ window._mgrSyncedOnce=true; return; }
  try{ await sheetTabsAutoSync(); }catch(e){}
  var rows=await db_loadAll();
  window._mgrSyncedOnce=true;                                   // first cloud sync done — skeleton can go
  clearTimeout(window._mgrSkelSafety); window._mgrSkelSafety=0;
  if(!rows){ if(mgr_currentTab==='overview') mgr_renderOverview(); return; }
  // Supabase is source of truth — replace localStorage with exactly what's in the DB
  rows.sort(function(a,b){return b.id-a.id;});
  window._shiftLog=rows; window._shiftLogFull=true;              // memory only — Supabase is the copy
  mgr_flagBanner(rows);
  mgr_switchTab(mgr_currentTab);
  // pull live status so the banner can show "on shift · Xh" instead of "hasn't submitted"
  try{
    var lr=await fetchT(SUPABASE_URL+'/rest/v1/live_status?select=*',{headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
    if(lr.ok){ var lrows=await lr.json(); window._liveCache={}; (lrows||[]).forEach(function(r){ window._liveCache[r.va]=r; }); window._liveCacheAt=Date.now(); mgr_flagBanner(rows); }
  }catch(e){}
}
/* Refresh just the live status (small table) and repaint the banner. Runs while
   Jack has the dashboard open, on ANY tab — the banner sits above the tabs. */
async function mgr_liveTick(){
  if(!DB_ENABLED) return;
  try{
    var lr=await fetchT(SUPABASE_URL+'/rest/v1/live_status?select=*',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
    if(!lr.ok) return;
    var lrows=await lr.json();
    window._liveCache={}; (lrows||[]).forEach(function(r){ window._liveCache[r.va]=r; });
    window._liveCacheAt=Date.now();
    mgr_flagBanner(mgr_getLog());
    if(mgr_currentTab==='overview'){ try{ mgr_renderOverview(); }catch(e){} }
  }catch(e){}
}
function mgr_startLiveTick(){
  if(window._mgrLiveTick) return;
  var beat=0;
  window._mgrLiveTick=setInterval(function(){
    var mgr=document.getElementById('view-manager');
    if(!mgr||!mgr.classList.contains('active')) return;   // not looking at it — don't poll
    if(document.hidden) return;                            // tab in the background
    beat++;
    // the banner sits on Overview, so refresh that fast and everything else lazily
    if(mgr_currentTab==='overview' || beat%3===0) mgr_liveTick();
  },20000);
  // coming back to the tab should show the truth immediately, not in 20s
  document.addEventListener('visibilitychange',function(){
    if(document.hidden) return;
    var mgr=document.getElementById('view-manager');
    if(mgr&&mgr.classList.contains('active')) mgr_liveTick();
  });
}
/* ── END A STUCK SHIFT FROM JACK'S SIDE ────────────────────────────────────
   Writes a flag into the VA's own draft. Nothing is deleted and no hours are changed —
   when she next opens the app the shift restores exactly as it was, with a banner and the
   wrap-up screen already open, so she can submit it or start a fresh one. */
async function mgr_endVaShift(va){
  if(!confirm('Ask '+vaDisp(va)+' to close this shift?\n\nNothing is deleted. Her tasks, time and leads stay exactly as they are — next time she opens the app she lands on the wrap-up screen to submit it.')) return;
  try{
    var r=await fetchT(SUPABASE_URL+'/rest/v1/draft_shifts?va=eq.'+encodeURIComponent(va)+'&select=*&order=updated_at.desc',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
    var rows=r.ok?await r.json():[];
    if(!rows.length){ showToast('No open shift found for '+vaDisp(va),true); return; }
    var row=rows[0], data=row.data||{};
    data.forceEnd={by:'Jack', at:new Date().toISOString()};
    var up=await fetchT(SUPABASE_URL+'/rest/v1/draft_shifts?va=eq.'+encodeURIComponent(va)
        +'&date=eq.'+encodeURIComponent(row.date),
      {method:'PATCH',headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
        'Content-Type':'application/json',Prefer:'return=minimal'},
       body:JSON.stringify({data:data, updated_at:new Date().toISOString()})});
    if(up.ok) showToast(vaDisp(va)+' will be taken to the wrap-up screen next time she opens the app ✓');
    else showToast("Couldn't flag that shift — check your connection",true);
  }catch(e){ showToast("Couldn't flag that shift",true); }
}
function mgr_getReports(){try{return JSON.parse(lsGet('shifttrack_reports')||'[]');}catch(e){return[];}}
function mgr_ukToday(){return new Date().toLocaleDateString('en-GB',{timeZone:'Europe/London'});}
function mgr_monthStart(){
  var now=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
  var dd='01',mm=String(now.getMonth()+1).padStart(2,'0'),yyyy=now.getFullYear();
  return dd+'/'+mm+'/'+yyyy;
}
function mgr_daysAgo(n){
  var now=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
  now.setDate(now.getDate()-n);
  var dd=String(now.getDate()).padStart(2,'0'),mm=String(now.getMonth()+1).padStart(2,'0');
  return dd+'/'+mm+'/'+now.getFullYear();
}function mgr_weekStart(offset){
  offset=offset||mgr_weekOffset||0;
  var now=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
  var d=now.getDay(),diff=d===0?-6:1-d;
  var mon=new Date(now);mon.setDate(now.getDate()+diff+(offset*7));mon.setHours(0,0,0,0);
  var dd=String(mon.getDate()).padStart(2,'0');
  var mm=String(mon.getMonth()+1).padStart(2,'0');
  var yyyy=mon.getFullYear();
  return dd+'/'+mm+'/'+yyyy;
}
function mgr_addDays(dateStr,n){
  var p=dateStr.split('/');
  if(p.length!==3) return dateStr;
  var d=new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0]));
  d.setDate(d.getDate()+n);
  var dd=String(d.getDate()).padStart(2,'0');
  var mm=String(d.getMonth()+1).padStart(2,'0');
  return dd+'/'+mm+'/'+d.getFullYear();
}
function mgr_dateInRange(ds,from,to){
  function parse(s){var p=s.split('/');return p.length===3?new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0])):new Date(s);}
  var d=parse(ds),f=parse(from),t=parse(to);
  d.setHours(0,0,0,0);f.setHours(0,0,0,0);t.setHours(0,0,0,0);
  return d>=f&&d<=t;
}
function mgr_isRealNote(s){return s&&s.trim().length>2&&s.trim()!=='-'&&s.trim()!=='–'&&s.trim()!=='—';}

// ── HELPERS ──
function mgr_tile(label,val,sub,cls,size){
  size=size||'lg';
  return '<div class="mgr-tile '+cls+'">'
    +'<div class="mgr-tile-label">'+label+'</div>'
    +'<div class="mgr-tile-val val-'+size+'">'+val+'</div>'
    +(sub?'<div class="mgr-tile-sub">'+sub+'</div>':'')
    +'</div>';
}
// ── redesigned KPI card: compact, neutral, colour = meaning ──
var KPI_TONE={red:'#f5455f',amber:'#f5a524',green:'#10d99a',purple:'#8b5cff',cyan:'#18c8f0',blue:'#4a86ff',off:'#6b7280'};
var KPI_ICON={
  inbox:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  cart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 2-1.58l1.65-7.42H5.12"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
  layers:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/></svg>',
  calendar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  pound:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 7c0-2.2-1.8-4-4-4S10 4.8 10 7v3H7m0 0h8m-8 0v5c0 1.5-.8 2.6-2 3h13"/></svg>'
};
// o: {icon,label,value,unit,tone,badge:{t,tone},sub,bar:{pct,mark,tone},act,onclick,valTone}
function mgr_kpi(o){
  var k=KPI_TONE[o.tone]||KPI_TONE.off;
  var ico=o.icon?'<span class="kpi-ico" style="--k:'+k+'">'+(KPI_ICON[o.icon]||'')+'</span>':'';
  var badge=o.badge?'<span class="kpi-badge b-'+(o.badge.tone||'off')+'">'+o.badge.t+'</span>':'';
  var val='<div class="kpi-val"'+(o.valTone?' style="color:'+(KPI_TONE[o.valTone]||'')+'"':'')+'>'+o.value+(o.unit?'<span class="u">'+o.unit+'</span>':'')+'</div>';
  var bar='';
  if(o.bar){ var bk=KPI_TONE[o.bar.tone]||k; var w=Math.max(0,Math.min(100,o.bar.pct||0));
    bar='<div class="kpi-bar"><i style="width:'+w+'%;background:'+bk+'"></i>'+(o.bar.mark!=null?'<span class="mk" style="left:'+Math.max(0,Math.min(100,o.bar.mark))+'%"></span>':'')+'</div>'; }
  return '<div class="kpi'+(o.onclick?' click':'')+(o.grad?' grad':'')+'" style="--k:'+k+'"'+(o.onclick?' onclick="'+o.onclick+'"':'')+'>'
    +'<div class="kpi-top">'+ico+'<span class="kpi-label">'+o.label+'</span>'+badge+'</div>'
    +val
    +(o.sub?'<div class="kpi-sub">'+o.sub+'</div>':'')
    +bar
    +(o.foot?'<div class="kpi-foot">'+o.foot+'</div>':'')
    +(o.act?'<div class="kpi-act">'+o.act+' &rarr;</div>':'')
    +'</div>';
}
// SVG donut for the Mera/Suz leads split
function mgr_leadsSplitDonut(mL,sL){
  var mera=vaColour('Mera'), suz=vaColour('Suz'), tot=mL+sL;
  var r=52, C=2*Math.PI*r, fM=tot?mL/tot:0, fS=tot?sL/tot:0;
  var mDash=fM*C, sDash=fS*C, pM=tot?Math.round(fM*100):0, pS=tot?Math.round(fS*100):0;
  var lead=mL>=sL?'Mera':'Suz', diff=Math.abs(mL-sL);
  var svg=tot?('<svg viewBox="0 0 140 140" width="128" height="128" style="flex-shrink:0;">'
    +'<circle cx="70" cy="70" r="'+r+'" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="15"/>'
    +'<circle cx="70" cy="70" r="'+r+'" fill="none" stroke="'+suz+'" stroke-width="15" stroke-dasharray="'+sDash.toFixed(1)+' '+(C-sDash).toFixed(1)+'" transform="rotate(-90 70 70)"/>'
    +'<circle cx="70" cy="70" r="'+r+'" fill="none" stroke="'+mera+'" stroke-width="15" stroke-dasharray="'+mDash.toFixed(1)+' '+(C-mDash).toFixed(1)+'" stroke-dashoffset="'+(-sDash).toFixed(1)+'" transform="rotate(-90 70 70)"/>'
    +'<text x="70" y="67" text-anchor="middle" font-size="27" font-weight="800" fill="#f1f3f9">'+tot+'</text>'
    +'<text x="70" y="85" text-anchor="middle" font-size="8.5" fill="#798298" letter-spacing="1.2">TOTAL LEADS</text>'
    +'</svg>'):'<div style="width:128px;height:128px;border-radius:50%;border:15px solid rgba(255,255,255,.06);flex-shrink:0;"></div>';
  return '<div class="mgr-card2"><div class="mc2-h">Leads split</div>'
    +'<div class="donut-wrap">'+svg
    +'<div class="donut-legend">'
      +'<div class="dl-row"><span class="dl-dot" style="background:'+mera+'"></span><span class="dl-nm">'+vaDisp('Mera')+'</span><span class="dl-v">'+mL+' <span>('+pM+'%)</span></span></div>'
      +'<div class="dl-row"><span class="dl-dot" style="background:'+suz+'"></span><span class="dl-nm">'+vaDisp('Suz')+'</span><span class="dl-v">'+sL+' <span>('+pS+'%)</span></span></div>'
    +'</div></div>'
    +(tot&&diff>0?'<div class="donut-insight">'+vaDisp(lead)+' generating <b>'+diff+' more</b> leads than '+vaDisp(lead==='Mera'?'Suz':'Mera')+' this week</div>':'')
    +'</div>';
}
// Week-summary panel (best day / most leads / most hours / averages)
function mgr_weekSummary(recs){
  var DN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var byDate={};
  recs.forEach(function(r){ var d=r.date; if(!byDate[d]) byDate[d]={leads:0,hrs:0}; byDate[d].leads+=parseInt(r.totalLeads)||0; byDate[d].hrs+=parseFloat(r.hoursWorked)||0; });
  var days=Object.keys(byDate), active=days.filter(function(d){return byDate[d].leads>0||byDate[d].hrs>0;});
  var tl=recs.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var th=recs.reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);
  var bestDay=null,bestLeads=-1; days.forEach(function(d){ if(byDate[d].leads>bestLeads){bestLeads=byDate[d].leads;bestDay=d;} });
  var mostHrs=days.length?Math.max.apply(null,days.map(function(d){return byDate[d].hrs;})):0;
  var avgL=active.length?(tl/active.length).toFixed(1):'0', avgH=active.length?(th/active.length).toFixed(1):'0';
  var bestDow=bestDay?DN[new Date(bestDay.split('/').reverse().join('-')).getDay()]:'—';
  function rowS(l,v){ return '<div class="ws-row"><span class="ws-check">&#10003;</span><span class="ws-l">'+l+'</span><span class="ws-v">'+v+'</span></div>'; }
  return '<div class="mgr-card2"><div class="mc2-h">Week summary</div>'
    +rowS('Best day',bestDow)+rowS('Most leads',bestLeads>=0?bestLeads:'—')+rowS('Most hours',mostHrs.toFixed(1)+'h')
    +rowS('Avg leads / day',avgL)+rowS('Avg hours / day',avgH+'h')
    +'<div class="ws-foot">'+recs.length+' shifts &middot; <b>'+th.toFixed(1)+'h</b> total &middot; <b>'+tl+'</b> leads</div>'
    +'</div>';
}
// Dynamic tile — colour changes based on value vs target
function mgr_tile_dynamic(label,val,sub,colourFn,size){
  return mgr_tile(label,val,sub,colourFn(val),size);
}
// pace colour as a hex (green on/above pace, amber close, red behind)
function paceHex(v,t){
  if(!t||t<=0) return '#6b7280';
  var p=v/t;
  return p>=1?'#10d99a':p>=0.85?'#f5a524':'#f5455f';
}
// VA scorecard — compact per-VA week stats with pace bars
function mgr_vaScore(name,col,statusText,statusOk,cells){
  var inner=cells.map(function(s){
    var bar='';
    if(s.pct!=null){
      var w=Math.max(4,Math.min(100,s.pct));
      bar='<div class="vsm-bar"><i style="width:'+w+'%;background:'+(s.tone||col)+'"></i></div>';
    }
    return '<div class="vsm"><div class="vsm-v">'+s.v+'</div><div class="vsm-l">'+s.l+'</div>'+bar+'</div>';
  }).join('');
  return '<div class="va-score" style="--k:'+col+'">'
    +'<div class="va-score-head"><span class="va-score-name">'+name+'</span>'
    +'<span class="va-score-status'+(statusOk?' sub-ok':'')+'">'+statusText+'</span></div>'
    +'<div class="va-score-grid">'+inner+'</div></div>';
}
// Hours tile — green/amber/red based on pro-rata pace
function mgr_hours_tile(label,hrs,shifts,sub,size){
  var settings=getAppSettings();
  var now=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
  var dow=now.getDay(),days=dow===0?5:dow===6?5:Math.max(0,dow-1);
  var target=days*settings.dailyHoursTarget,pct=target>0?(parseFloat(hrs)/target):1;
  var cls=!shifts?'tile-grey':pct>=1?'tile-green':pct>=0.925?'tile-amber':'tile-red';
  return mgr_tile(label,hrs,sub,cls,size||'lg');
}
function mgr_section(t){return '<div class="mgr-section">'+t+'</div>';}
function mgr_collapsibleNotes(allRecs,vc){
  // allRecs = ALL shift records for this period (not filtered). We show green if note, red if not.
  if(!allRecs.length) return '<div style="color:var(--muted-2);font-size:12px;padding:8px 0;">No shifts this period.</div>';
  var SHOW=15;
  var gid='ng'+Math.random().toString(36).slice(2,6);
  var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function noteTile(r){
    var hasNote=mgr_isRealNote(r.notes);
    var nid='nt-'+r.id;
    var accentCol=vc[r.va]||'#aaa';
    var p=r.date.split('/');
    var d=new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0]));
    var dayLabel=dayNames[d.getDay()]+' '+p[0]+'/'+p[1];
    var tileBg=hasNote?'#0d3320':'#2a0a0a';
    var tileBorder=hasNote?'#10d99a':'#f2647f';
    var dotCol=hasNote?'#10d99a':'#f2647f';

    var inner='<div style="display:flex;flex-direction:column;padding:8px 10px;cursor:'+(hasNote?'pointer':'default')+';min-height:52px;box-sizing:border-box;justify-content:space-between;">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;">'
      +'<div style="width:7px;height:7px;border-radius:50%;background:'+dotCol+';flex-shrink:0;"></div>'
      +(hasNote?'<span style="font-size:9.5px;color:'+dotCol+'88;">▾</span>':'')
      +'</div>'
      +'<span style="font-family:var(--font-head);font-size:11px;font-weight:800;color:'+accentCol+';">'+r.va+'</span>'
      +'<span style="font-size:9px;color:'+(hasNote?'#aaa':'#444')+';">'+dayLabel+'</span>'
      +'</div>';

    if(hasNote){
      return '<div style="border-radius:7px;overflow:hidden;border:1px solid '+tileBorder+'44;background:'+tileBg+';border-top:3px solid '+tileBorder+';" onclick="var e=document.getElementById(\''+nid+'\');var open=e.style.display!==\'none\';e.style.display=open?\'none\':\'block\';this.querySelector(\'span.na\').textContent=open?\'▾\':\'▴\';">'
        +'<div style="display:flex;flex-direction:column;padding:8px 10px;cursor:pointer;min-height:52px;box-sizing:border-box;justify-content:space-between;">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;">'
        +'<div style="width:7px;height:7px;border-radius:50%;background:'+dotCol+';"></div>'
        +'<span class="na" style="font-size:9.5px;color:#2a4a3a;">▾</span>'
        +'</div>'
        +'<span style="font-family:var(--font-head);font-size:11px;font-weight:800;color:'+accentCol+';">'+r.va+'</span>'
        +'<span style="font-size:9px;color:#aaa;">'+dayLabel+'</span>'
        +'</div>'
        +'<div id="'+nid+'" style="display:none;padding:7px 9px;border-top:1px solid '+tileBorder+'22;font-size:11px;color:#bbb;line-height:1.6;">'+r.notes+'</div>'
        +'</div>';
    } else {
      return '<div style="border-radius:7px;overflow:hidden;border:1px solid '+tileBorder+'33;background:'+tileBg+';border-top:3px solid '+tileBorder+';">'
        +'<div style="display:flex;flex-direction:column;padding:8px 10px;min-height:52px;box-sizing:border-box;justify-content:space-between;">'
        +'<div style="width:7px;height:7px;border-radius:50%;background:'+dotCol+';"></div>'
        +'<span style="font-family:var(--font-head);font-size:11px;font-weight:800;color:'+accentCol+';">'+r.va+'</span>'
        +'<span style="font-size:9px;color:#444;">'+dayLabel+'</span>'
        +'</div>'
        +'</div>';
    }
  }

  var visible=allRecs.slice(0,SHOW),hidden=allRecs.slice(SHOW);
  function gridOf(items){
    return '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:5px;">'+items.map(noteTile).join('')+'</div>';
  }
  var html=gridOf(visible);
  if(hidden.length){
    html+='<div id="'+gid+'" style="display:none;">'+gridOf(hidden)+'</div>';
    html+='<button onclick="var e=document.getElementById(\''+gid+'\');var open=e.style.display!==\'none\';e.style.display=open?\'none\':\'block\';this.textContent=open?\'+ '+hidden.length+' more ▾\':\'Show less ▴\';" style="background:transparent;border:1px solid rgba(255,255,255,0.07);color:#444;font-family:var(--font-mono);font-size:10px;padding:5px 14px;border-radius:6px;cursor:pointer;width:100%;margin-top:2px;">+ '+hidden.length+' more ▾</button>';
  }
  return html;
}
function mgr_weekNavHTML(){
  var label=mgr_weekOffset===0?'This Week':mgr_weekOffset===-1?'Last Week':Math.abs(mgr_weekOffset)+' weeks ago';
  return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">'
    +'<button onclick="mgr_changeWeek(-1)" style="background:#111;border:1px solid #222;color:#555;font-family:var(--font-mono);font-size:12px;padding:6px 14px;border-radius:8px;cursor:pointer;">&larr; Prev</button>'
    +'<div style="background:#111;border:1px solid #222;border-radius:8px;padding:6px 16px;font-size:11px;color:#666;min-width:100px;text-align:center;">'+label+'</div>'
    +(mgr_weekOffset<0?'<button onclick="mgr_changeWeek(1)" style="background:#111;border:1px solid #222;color:#555;font-family:var(--font-mono);font-size:12px;padding:6px 14px;border-radius:8px;cursor:pointer;">Next &rarr;</button>':'<div style="width:80px;"></div>')
    +(mgr_weekOffset!==0?'<button onclick="mgr_weekOffset=0;mgr_changeWeek(0);" style="background:rgba(155,143,255,0.1);border:1px solid rgba(155,143,255,0.3);color:#9b8fff;font-family:var(--font-mono);font-size:11px;padding:6px 14px;border-radius:8px;cursor:pointer;">&#8634; Current Week</button>':'')
    +'</div>';
}
function mgr_changeWeek(dir){
  mgr_weekOffset=Math.min(0,mgr_weekOffset+dir);
  if(mgr_currentTab==='week') mgr_renderWeek();
  else if(mgr_currentTab==='overview') mgr_renderOverview();
}
function mgr_deleteBtn(id){return '<button onclick="event.stopPropagation();mgr_del('+id+')" style="background:rgba(242,100,127,0.1);border:1px solid rgba(242,100,127,0.25);color:#f2647f;font-family:var(--font-mono);font-size:10px;padding:4px 10px;border-radius:6px;cursor:pointer;flex-shrink:0;">Delete</button>';}

function mgr_del(id){
  if(!confirm('Delete this shift?\n\nThis cannot be undone.')) return;
  var l=mgr_getLog().filter(function(r){return r.id!==id;});
  window._shiftLog=l;
  if(DB_ENABLED) db_delete('shifts', id);
  showToast('Shift deleted');
  mgr_switchTab(mgr_currentTab);
}

// ── SHIFT CARD ──
function mgr_shiftCard(r,expanded){
  var isMera=r.va==='Mera';
  var bg=isMera?'#5a1a99':r.va==='Suz'?'#7a5a00':'#004a30';
  var accent=isMera?'#b23bff':r.va==='Suz'?'#FFEB3B':'#10d99a';
  var leadsCol=parseInt(r.totalLeads)>0?'#fff':'#ff8888';
  var flags='';
  if(r.tasksSkipped>0) flags+='<span style="background:rgba(242,100,127,0.3);border-radius:4px;padding:1px 6px;font-size:9px;color:#ff9999;margin-left:6px;">skipped</span>';
  var adminTaskIds=['leadsheet','suz-leadsheet','leadsheet-eod','suz-leadsheet-eod','telegram-eod','suz-telegram-eod','ht-filters'];
  var taskRows='';
  (r.tasks||[]).filter(function(t){return t.done||t.skipped;}).forEach(function(t){
    var isAdmin=adminTaskIds.indexOf(t.id)>=0;
    var ts=t.skipped?'<span style="color:#ff6666;font-size:11px;">SKIPPED</span>'
      :isAdmin?'<span style="color:#10d99a;font-size:11px;">✓ done</span>'
      :'<span style="color:#10d99a;font-size:11px;">✓ '+(t.leads||0)+' leads'+(t.time?' · '+t.time:'')+'</span>';
    taskRows+='<div style="display:flex;justify-content:space-between;padding:2.5px 0;border-top:1px solid rgba(255,255,255,0.07);font-size:10.5px;gap:8px;"><span style="color:#b8b8c8;flex:1;">'+t.name+'</span>'+ts+'</div>';
  });
  var bodyId='scb-'+r.id;
  var hasNote=mgr_isRealNote(r.notes);
  return '<div style="border-radius:14px;margin-bottom:10px;overflow:hidden;background:'+bg+';transition:filter 0.15s;cursor:pointer;" class="va-shift-block" onclick="mgr_toggleCard(\''+bodyId+'\')">'
    +'<div style="height:3px;background:'+accent+';"></div>'
    +'<div style="padding:11px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">'
    +'<div>'
    +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:7px;">'
    +'<span style="font-family:var(--font-head);font-size:17px;font-weight:800;color:'+accent+';">'+r.va+'</span>'
    +'<span style="font-size:11px;color:rgba(255,255,255,0.4);">'+r.date+'</span>'
    +'<span style="font-size:11px;color:rgba(255,255,255,0.3);">sub '+r.submittedAt+'</span>'
    +flags+'</div>'
    +'<div style="display:flex;gap:7px;flex-wrap:wrap;">'
    +(r.shiftStart?'<div style="background:rgba(255,255,255,0.12);border-radius:6px;padding:4px 10px;font-size:11px;font-family:var(--font-mono);color:rgba(255,255,255,0.7);">'+shiftWindowHTML(r)+'</div>':'')
    +(r.breakMins?'<div style="background:rgba(255,255,255,0.1);border-radius:6px;padding:4px 10px;font-size:11px;font-family:var(--font-mono);color:rgba(255,255,255,0.6);">☕ '+r.breakMins+'min</div>':'')
    +'<div style="background:rgba(255,255,255,0.12);border-radius:6px;padding:4px 10px;font-size:11px;font-family:var(--font-mono);color:rgba(255,255,255,0.7);">⏱ '+r.hoursWorked+'h</div>'
    +'</div></div>'
    +'<div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">'
    +'<div style="text-align:right;">'
    +'<div style="font-family:var(--font-mono);font-size:30px;font-weight:700;color:'+leadsCol+';line-height:1;">'+r.totalLeads+'</div>'
    +'<div style="font-size:10px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:1px;">leads</div>'
    +'</div>'
    +mgr_deleteBtn(r.id)
    +'</div></div>'
    +'<div class="shift-card-body'+(expanded?' open':'')+'" id="'+bodyId+'" style="border-top:1px solid rgba(255,255,255,0.12);padding:0 16px 10px;" onclick="event.stopPropagation()">'
    +(hasNote?'<div style="background:rgba(255,255,255,0.08);border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.6;color:rgba(255,255,255,0.75);margin-top:10px;"><div style="font-size:10px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Notes</div>'+r.notes+'</div>':'')
    +(function(){ var sf=r.storefronts; if(!sf||!sf.list||!sf.list.length) return '';
        var rows=sf.list.map(function(s){ var hrs=(s.mins||0)/60, lph=(hrs>0.02&&s.leads>0)?(s.leads/hrs).toFixed(1):'—';
          return '<div style="display:flex;justify-content:space-between;gap:8px;padding:2.5px 0;border-top:1px solid rgba(255,255,255,0.07);font-size:10.5px;"><span style="color:#b8b8c8;flex:1;">'+String(s.name||'(unnamed)').replace(/</g,'&lt;')+'</span><span style="color:#8b93a8;">'+(s.mins||0)+'m</span><span style="color:#10d99a;font-weight:700;">'+(s.leads||0)+' leads</span><span style="color:#18c8f0;min-width:52px;text-align:right;">'+lph+'/hr</span></div>'; }).join('');
        return '<div style="font-size:10px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:1px;margin:8px 0 3px;">&#127978; Storefronts · '+sf.leads+' leads · '+sf.mins+'m</div>'+rows; })()
    +(taskRows?'<div style="font-size:10px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:1px;margin:8px 0 3px;">Tasks</div>'+taskRows:'')
    +'</div></div>';
}
/* Same disease as the VA task cards (fixed v47.4): open/closed lived only in the
   DOM, and the dashboard REPAINTS ITSELF on a timer (mgr_liveTick) and on every
   cloud sync — so a card Jack expanded collapsed under him within seconds. The
   open set lives in a window map now, and mgr_restoreOpen() re-applies it after
   every dashboard render. */
window._mgrOpen=window._mgrOpen||{};
function mgr_toggleCard(id){
  var el=document.getElementById(id); if(!el) return;
  window._mgrOpen[id]=el.classList.toggle('open');
}
function mgr_restoreOpen(){
  try{
    Object.keys(window._mgrOpen||{}).forEach(function(id){
      if(!window._mgrOpen[id]) return;
      var el=document.getElementById(id);
      if(el&&!el.classList.contains('open')){
        el.classList.add('open');
        // source rows carry a caret that mirrors the state — keep it honest
        var head=document.querySelector('[onclick*="\''+id+'\'"] .src-caret');
        if(head) head.textContent='▾';
      }
    });
    if(window._mgrOpen['src-rest']){
      var r=document.getElementById('src-rest');
      if(r){ r.style.display='block';
        var b=r.nextElementSibling;
        if(b&&b.classList.contains('src-more')) b.textContent='Show less ▴'; }
    }
  }catch(e){}
}

// ── GROUPED SHIFT RENDERER — horizontal grid ────────────────
function mgr_shiftGroup(recs,vaFilter){
  if(!recs||!recs.length) return '<div style="color:var(--muted-2);font-size:13px;padding:20px 0;">No shifts yet.</div>';
  var sorted=recs.slice().sort(function(a,b){
    var pa=a.date.split('/'),pb=b.date.split('/');
    var da=new Date(parseInt(pa[2]),parseInt(pa[1])-1,parseInt(pa[0]));
    var db=new Date(parseInt(pb[2]),parseInt(pb[1])-1,parseInt(pb[0]));
    return db-da||b.id-a.id;
  });
  if(vaFilter) sorted=sorted.filter(function(r){return r.va===vaFilter;});
  var COLS=5,PER_PAGE=25;
  var gid='sg'+Math.random().toString(36).slice(2,6);
  var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function miniCard(r){
    var isMera=r.va==='Mera',isSuz=r.va==='Suz';
    var accentCol=isMera?'#c98bff':isSuz?'#f5d33a':'#4fe0a0';
    var cardBg='color-mix(in srgb,'+(isMera?'#b23bff':isSuz?'#FFEB3B':'#10d99a')+' 12%,#0d0f15)';   // dark tint, not a colour flood
    var borderCol=isMera?'#9b40ff':isSuz?'#e6c200':'#10d99a';
    var leadsCol=parseInt(r.totalLeads)>0?'#fff':'#ff8888';
    var p=r.date.split('/');
    var dateStr=dayNames[new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0])).getDay()]+' '+p[0]+' '+months[parseInt(p[1])-1];
    var flags=r.tasksSkipped>0?'<span style="background:rgba(242,100,127,0.4);border-radius:3px;padding:1px 5px;font-size:9.5px;color:#ffbbbb;margin-left:4px;">skipped</span>':'';;
    var bodyId='scb-'+r.id;
    var taskRows='';
    (r.tasks||[]).filter(function(t){return t.done||t.skipped;}).forEach(function(t){
      var ts=t.skipped?'<span style="color:#ff8888;font-size:10px;">SKIPPED</span>':'<span style="color:#10d99a;font-size:10px;">✓'+(t.leads>0?' '+t.leads:'')+'</span>';
      taskRows+='<div style="display:flex;justify-content:space-between;padding:3px 0;border-top:1px solid rgba(255,255,255,0.06);font-size:10px;gap:6px;"><span style="color:#bbb;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+t.name+'</span>'+ts+'</div>';
    });
    var hasNote=mgr_isRealNote(r.notes);
    var delBtn='<button onclick="event.stopPropagation();mgr_del('+r.id+');" style="background:#c0392b;border:2px solid #e74c3c;color:#fff;font-family:var(--font-mono);font-size:9px;font-weight:700;padding:3px 9px;border-radius:5px;cursor:pointer;flex-shrink:0;">✕ DEL</button>';
    return '<div class="shcard" style="--sc:'+accentCol+';" onclick="mgr_toggleCard(\''+ bodyId +'\')">'
      +'<div class="shcard-top">'
        +'<div class="shcard-when"><b>'+dateStr.split(' ')[0]+'</b><span>'+dateStr.split(' ')[1]+' '+dateStr.split(' ').slice(2).join(' ')+'</span></div>'
        +'<span class="shcard-va">'+r.va+'</span>'
        +'<button class="shcard-del" title="Delete this shift" onclick="event.stopPropagation();mgr_del('+r.id+');">✕</button>'
      +'</div>'
      +'<div class="shcard-hero"><b style="color:'+leadsCol+'">'+r.totalLeads+'</b><span>leads</span>'+flags+'</div>'
      +'<div class="shcard-stats">'
        +'<span title="Hours worked">⏱ <b>'+r.hoursWorked+'h</b></span>'
        +(r.tasksDone?'<span title="Tasks completed">✓ <b>'+r.tasksDone+'</b></span>':'')
        +(r.breakMins?'<span title="Break">☕ <b>'+r.breakMins+'m</b></span>':'')
        +(parseFloat(r.hoursWorked)>0?'<span title="Leads per hour">⚡ <b>'+(r.totalLeads/parseFloat(r.hoursWorked)).toFixed(1)+'</b></span>':'')
      +'</div>'
      +(r.shiftStart?'<div class="shcard-time">'+shiftWindowHTML(r)+'</div>':'')
      +'<div class="shift-card-body" id="'+bodyId+'" onclick="event.stopPropagation();">'
      +(taskRows?'<div class="shcard-sec">Tasks</div>'+taskRows:'')
      +(hasNote?'<div class="shcard-note">'+r.notes+'</div>':'')
      +'</div></div>';
  }

  var visible=sorted.slice(0,PER_PAGE),hidden=sorted.slice(PER_PAGE);
  var sgHidId=gid+'-more';
  function gridOf(items){
    return '<div style="display:grid;grid-template-columns:repeat('+COLS+',1fr);gap:10px;margin-bottom:10px;">'+items.map(miniCard).join('')+'</div>';
  }
  var html=gridOf(visible);
  if(hidden.length){
    html+='<div id="'+sgHidId+'" style="display:none;">'+gridOf(hidden)+'</div>';
    html+='<button onclick="var e=document.getElementById(\''+ sgHidId +'\');var open=e.style.display!==\'none\';e.style.display=open?\'none\':\'block\';this.textContent=open?\'Show '+hidden.length+' more ▾\':\'Show less ▴\';" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#555;font-family:var(--font-mono);font-size:11px;padding:8px 18px;border-radius:8px;cursor:pointer;width:100%;margin-bottom:10px;">Show '+hidden.length+' more ▾</button>';
  }
  return html;
}
// ── SUBMISSION PILLS ──
function mgr_pills(todayRecs){
  var isWeekend=mgr_isWeekend();
  function pill(va,col,submitted,detail){
    var ok=submitted;
    var statusText=ok?'✓ Submitted':isWeekend?'Weekend — day off':'○ Not submitted yet';
    var pillClass=ok?'sub-pill-ok':isWeekend?'sub-pill-wknd':'sub-pill-no';
    return '<div class="sub-pill '+pillClass+'">'
      +'<div class="sub-pill-icon">'+(ok?'✓':isWeekend?'🌴':'○')+'</div>'
      +'<div><div class="sub-pill-name" style="color:'+col+';">'+va+'</div>'
      +'<div class="sub-pill-status">'+statusText+'</div>'
      +(detail?'<div class="sub-pill-detail">'+detail+'</div>':'')
      +'</div></div>';
  }
  var mr=todayRecs.filter(function(r){return r.va==='Mera';});
  var sr=todayRecs.filter(function(r){return r.va==='Suz';});
  var mDetail=mr.length?mr[0].totalLeads+' leads · submitted '+mr[0].submittedAt:'';
  var sDetail=sr.length?sr[0].totalLeads+' leads · submitted '+sr[0].submittedAt:'';
  return '<div class="sub-pills">'+pill('Mera','#b23bff',mr.length>0,mDetail)+pill('Suz','#FFEB3B',sr.length>0,sDetail)+'</div>';
}

// ── FLAG BANNER ──
function mgr_isWeekend(){
  var now=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
  var d=now.getDay();
  return d===0||d===6;
}
/* ── "HAS THIS VA FINISHED FOR THE DAY?" — ONE ANSWER, TWO CALLERS ───────────
   The Live cards and the flag banner both asked this, and both answered it with
   "is there an EOD row dated today?". That is wrong the moment a VA submits and
   then works again the same day — a test shift, a split day, a re-open after a
   correction. Proof, 13/08/2026: Mera submitted 04:17 UK and restarted 04:20,
   Suz submitted 05:35 and restarted 06:35. Both pushed live_status every minute
   for hours afterwards with submitted:false, and the board still showed two grey
   "shift complete" cards — while the banner skipped them entirely, so they did
   not even appear as on shift. Jack had two people working and an empty Live tab.
   The rule: live_status is the newer fact. An EOD ends the day only if nothing
   has been pushed since it. Kept as one function precisely so the two callers
   cannot drift apart again — that drift is what hid this for weeks. */
function mgr_shiftState(va, liveRow, log){
  var today=mgr_ukToday();
  var s=(liveRow&&liveRow.data)||null;
  var eodMs=0;
  try{
    (log||mgr_getLog()||[]).forEach(function(r){
      if(!r||r.va!==va) return;
      // rec.date is the MANILA shift day and rec.dateUK the London one — a shift that
      // crosses London midnight writes two different strings for the same working day
      if(r.date!==today && r.dateUK!==today) return;
      var t=+r.id||0;                     // rec.id is Date.now() at the moment of submit
      if(t>eodMs) eodMs=t;
    });
  }catch(e){}
  var liveMs=(liveRow&&liveRow.updated_at)?(Date.parse(liveRow.updated_at)||0):0;
  // Submitting an EOD fires one more live push straight after it, so ignore anything
  // inside two minutes of the EOD — that push is the ending, not a restart.
  var restarted=!!(eodMs && liveMs>eodMs+120000 && s && s.submitted!==true);
  return { eodToday:eodMs>0, eodMs:eodMs, liveMs:liveMs, restarted:restarted,
           isSubmitted: !!((s && s.submitted===true) || (eodMs>0 && !restarted)) };
}
function mgr_flagBanner(log){
  var today=mgr_ukToday(),flags=[],onShift=[];
  var _seenAt=window._liveCacheAt?new Date(window._liveCacheAt).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'}):'';
  var isWeekend=mgr_isWeekend();
  var live=window._liveCache||{};
  var tgt=getAppSettings().dailyHoursTarget||8;
  // This banner used to run BEFORE the live status had been fetched, so _liveCache was
  // empty and both VAs fell straight through to "hasn't submitted today" — shouting
  // ACTION NEEDED at Jack about someone who was actively on shift. Absence of data is
  // not evidence: if we don't know yet, say nothing.
  var liveKnown = !!window._liveCacheAt;
  if(!isWeekend && liveKnown){
    ['Mera','Suz'].forEach(function(va){
      // "submitted → all good" — but only if they haven't started a second shift since.
      // See mgr_shiftState(); a bare date match used to silence this VA for the rest
      // of the day, live shift or not.
      if(mgr_shiftState(va, live[va], log).isSubmitted) return;
      var r=live[va];
      if(r&&r.data&&r.data.submitted!==true){
        var upd=r.updated_at?new Date(r.updated_at):null;
        var freshMin=upd?((Date.now()-upd.getTime())/60000):999;
        var updUK=''; try{ if(upd) updUK=upd.toLocaleDateString('en-GB',{timeZone:'Europe/London'}); }catch(e){}
        var d=r.data;
        if(freshMin<45){            // updated within 45 min = genuinely on shift now
          var hw=parseFloat(d.hoursWorked)||0;
          var runaway=hw>(tgt+3);   // nobody works 3h past an 8h target — the tab was left open
          onShift.push('<b>'+vaDisp(va)+'</b> is on shift'+(d.onBreak?' <span style="color:#f5a524">(on break \u2615)</span>':'')
            +' \u2014 '+(runaway
                ? '<b style="color:#ffb84d">'+hw.toFixed(1)+'h</b> <span style="color:#ffb84d">(counter left running overnight \u2014 not real hours)</span>'
                : '<b>'+(d.hoursWorked||'0')+'h</b> of '+tgt+'h')
            +' \u00b7 '+(d.tasksDone||0)+'/'+(d.totalTasks||0)+' tasks \u00b7 '+(d.totalLeads||0)+' leads');
          return;
        }
        if(updUK===today){          // started today, just gone quiet — that is NOT "hasn't submitted"
          /* A shift stuck open (a closed tab, a dead timer) sat there for hours with no way
             for Jack to clear it from his side. This asks the VA to wrap up: her work is
             untouched, and next time she opens the app she is taken straight to the EOD. */
          onShift.push('<b>'+vaDisp(va)+'</b> is on shift but has gone quiet \u2014 nothing logged for <b>'
            +Math.round(freshMin)+'m</b> \u00b7 '+(d.hoursWorked||'0')+'h \u00b7 '+(d.totalLeads||0)+' leads'
            +' <button class="mgr-endshift" onclick="mgr_endVaShift(\''+va+'\')" '
            +'title="Ask '+escHtml(vaDisp(va))+' to close this shift \u2014 nothing is deleted, she just lands on the wrap-up screen">'
            +'End their shift</button>');
          return;
        }
      }
      flags.push(vaDisp(va)+" hasn't submitted today");
    });
  }
  var tr=log.filter(function(r){return r.date===today;});
  if(tr.some(function(r){return !parseInt(r.totalLeads);})) flags.push('Zero leads on a shift today');
  if(tr.some(function(r){return r.tasksSkipped>0;})) flags.push('Mandatory task skipped today');
  var issues=mgr_getReports().filter(function(r){return r.time&&r.time.indexOf(today)>=0;});
  if(issues.length>1) flags.push(issues.length+' issues reported today');

  // OOS Sheet weekly hours warning
  var oosTarget=getAppSettings().oosHoursTarget;
  var weekStart=mgr_weekStart();
  function oosHrsThisWeek(va){
    var hrs=0;
    log.filter(function(r){return r.va===va&&r.date>=weekStart;}).forEach(function(r){
      (r.tasks||[]).forEach(function(t){
        if((t.id==='oos-sheet'||t.id==='suz-oos-sheet')&&t.done){
          hrs+=(parseFloat(t.timeHrs)||0)+(parseFloat(t.timeMins)||0)/60;
        }
      });
    });
    return hrs;
  }
  var mOOS=oosHrsThisWeek('Mera'), sOOS=oosHrsThisWeek('Suz');
  if(mOOS<oosTarget&&mOOS>0) flags.push('Mera — OOS Sheet under target this week ('+mOOS.toFixed(1)+'h / '+oosTarget+'h)');
  if(sOOS<oosTarget&&sOOS>0) flags.push('Suz — OOS Sheet under target this week ('+sOOS.toFixed(1)+'h / '+oosTarget+'h)');

  var b=document.getElementById('mgr-flag-banner');if(!b) return;
  var html='';
  if(onShift.length){
    html+='<div class="onshift-banner"><span style="font-size:17px;flex-shrink:0;">🟢</span><div>'
      +'<div style="font-size:10px;color:#10d99a;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin-bottom:5px;">On shift now</div>'
      +onShift.map(function(f){return '<div style="font-size:13px;color:#dfe4ee;padding:1px 0;">› '+f+'</div>';}).join('')
      +'</div></div>';
  }
  if(flags.length){
    html+='<div class="flag-banner"><span style="font-size:18px;flex-shrink:0;">⚠</span><div>'
      +'<div style="font-size:10px;color:#f2647f;text-transform:uppercase;letter-spacing:2px;font-weight:700;margin-bottom:5px;">Action needed</div>'
      +flags.map(function(f){return '<div style="font-size:13px;color:#ccc;padding:1px 0;">› '+f+'</div>';}).join('')
      +'</div></div>';
  }
  b.innerHTML=html;
}

// ── HOURS COLOUR LOGIC ──
// Green = daily target met (8h/day × shifts done), Amber = within 5-7.5% under, Red = below, Grey = weekend
function mgr_hoursColour(weekHrs, weekShifts){
  if(!weekShifts) return '#444';
  var settings=getAppSettings();
  var now=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
  var dow=now.getDay();
  var daysElapsed=dow===0||dow===6?5:Math.max(0,dow-1);
  var proRata=daysElapsed*settings.dailyHoursTarget;
  if(weekHrs>=settings.weeklyHoursTarget) return '#10d99a';
  if(weekHrs>=proRata) return '#10d99a';
  if(weekHrs>=proRata*0.925) return '#f2c200';
  return '#f2647f';
}

// ── SOURCING BREAKDOWN ──
// Shows leads by task type — sourcing dominates by design (it's the main job)
// Use this to spot WHICH tasks within sourcing are underperforming
var SRC_RANGES=[{k:'30d',label:'Last 30 days',days:30},{k:'90d',label:'Last 90 days',days:90},{k:'all',label:'All time',days:0}];
var mgr_srcRange='30d';
function mgr_setSrcRange(k){ mgr_srcRange=k; try{ mgr_switchTab(mgr_currentTab); }catch(e){} }
function mgr_srcToggleHTML(){
  return '<div class="src-range">'+SRC_RANGES.map(function(r){
    return '<button class="'+(mgr_srcRange===r.k?'on':'')+'" onclick="mgr_setSrcRange(\''+r.k+'\')">'+r.label+'</button>';
  }).join('')+'</div>';
}
function mgr_srcLabel(){ var r=SRC_RANGES.filter(function(x){return x.k===mgr_srcRange;})[0]; return r?r.label:'All time'; }
function mgr_srcFilter(recs){
  var r=SRC_RANGES.filter(function(x){return x.k===mgr_srcRange;})[0];
  if(!r||!r.days) return recs;
  var cut=new Date(); cut.setDate(cut.getDate()-r.days);
  return recs.filter(function(x){
    var p=String(x.date||'').split('/'); if(p.length!==3) return true;
    return new Date(+p[2],+p[1]-1,+p[0])>=cut;
  });
}
function mgr_sourcing(recs,va,useRange){
  if(useRange) recs=mgr_srcFilter(recs);
  // Map task IDs to display names — lead sheet / telegram-eod excluded (they never produce leads)
  var tm={
    'sourcing':'Own Sourcing (Manual/Brand)',
    'suz-sourcing':'Own Sourcing (Manual/Brand)',
    'kpf-daily':'KPF Filters — 7 Day Drops',
    'suz-kpf-daily':'KPF Filters — Daily',
    'kpf-tue':'KPF Filters — Tuesday (Laptops & Hoovers)',
    'kpf-thu':'KPF Filters — Thursday',
    'jack-poa':'Jack POA / Filters',
    'suz-jack-poa':'Jack POA / Filters',
    'pp-main':'PP Main Run',
    'suz-pp':'PP Main Run',
    'storefronts':'Storefronts',
    'suz-storefronts':'Storefronts',
    'newsletter-a':'Newsletter Check (Morning)',
    'newsletter-b':'Newsletter Check (Sourcing Block)',
    'pp-light':'PP Light Check',
    'suz-pp-light':'PP Light Check',
    'telegram':'Telegram / Keepa Check',
    'suz-telegram':'Telegram / Keepa Check',
    'suz-eu':'EU Sheets',
    'oos-sheet':'OOS Sheet',
    'suz-oos-sheet':'OOS Sheet'
  };
  // Tasks that are pure admin — never count in sourcing breakdown
  var excludeIds=['leadsheet','suz-leadsheet','leadsheet-eod','suz-leadsheet-eod','telegram-eod','suz-telegram-eod','ht-filters'];
  // Everything Jack sends one-off used to get its own row here, so this list grew forever
  // ("KPF filter · GoPro", "KPF filter · jbl", "Storefront · 21st"…). One-offs now roll up
  // into a parent per type that you can open to see the individual ones.
  var ONEOFF={ 'KPF filter':{k:'oneoff-kpf', label:'Jack one-offs · KPF filters', icon:'🎯'},
               'Storefront':{k:'oneoff-sf',  label:'Jack one-offs · Storefronts',  icon:'🏬'},
               'From Jack': {k:'oneoff-msg', label:'Jack one-offs · Other',        icon:'💬'},
               'ASIN':      {k:'oneoff-asin',label:'Jack one-offs · ASINs',        icon:'#'},
               'EU sheet':  {k:'oneoff-eu',  label:'Jack one-offs · EU sheets',    icon:'🇪🇺'},
               'EU ASINs':  {k:'oneoff-euasin',label:'Jack one-offs · EU ASIN lists',icon:'🇪🇺'} };
  function bucketFor(t){
    if(tm[t.id]) return {k:t.id, label:tm[t.id], child:null};
    var nm=String(t.name||'');
    var pre=nm.split(' · ')[0].trim();
    var o=ONEOFF[pre];
    if(o) return {k:o.k, label:o.label, icon:o.icon, child:nm.slice(pre.length+3)||nm};
    if(/^From Jack/i.test(nm)) return {k:'oneoff-msg', label:ONEOFF['From Jack'].label, icon:'💬', child:nm.replace(/^From Jack\s*·?\s*/i,'')||nm};
    return {k:'t:'+nm, label:(nm.length>34?nm.slice(0,34)+'…':nm), child:null};
  }
  var bd={};
  (va?recs.filter(function(r){return r.va===va;}):recs).forEach(function(r){
    (r.tasks||[]).forEach(function(t){
      var l=parseInt(t.leads)||0; if(!l) return;
      if(excludeIds.indexOf(t.id)>=0) return;
      var b=bucketFor(t);
      var o=bd[b.k]||(bd[b.k]={label:b.label,icon:b.icon||'',leads:0,m:0,s:0,runs:0,kids:{}});
      o.leads+=l; o.runs++;
      if(r.va==='Mera') o.m+=l; else o.s+=l;
      if(b.child){ var c=o.kids[b.child]||(o.kids[b.child]={leads:0,runs:0}); c.leads+=l; c.runs++; }
    });
  });
  var entries=Object.keys(bd).map(function(k){ return bd[k]; }).sort(function(a,b){return b.leads-a.leads;});
  if(!entries.length) return '<div class="src-empty">No task-level data yet — it fills in as your VAs log leads against each task.</div>';
  var total=entries.reduce(function(s,e){return s+e.leads;},0);
  var top=entries.slice(0,10), rest=entries.slice(10);
  var restLeads=rest.reduce(function(s,e){return s+e.leads;},0);
  var barCol=va==='Mera'?'#b23bff':va==='Suz'?'#f2c200':'#10d99a';

  function row(e,i){
    var pct=total?Math.round(e.leads/total*100):0;
    var kidKeys=Object.keys(e.kids).sort(function(a,b){ return e.kids[b].leads-e.kids[a].leads; });
    var rid='src'+i+'-'+Math.abs(String(e.label).split('').reduce(function(a,c){return a+c.charCodeAt(0);},0));
    var kidHtml=kidKeys.length?('<div class="src-kids" id="'+rid+'">'
      +kidKeys.map(function(k){
          var c=e.kids[k];
          return '<div class="src-kid"><span class="src-kid-n">'+escHtml(k)+'</span>'
            +'<span class="src-kid-v">'+c.leads+'<span>leads</span></span>'
            +'<span class="src-kid-r">'+c.runs+'×</span></div>';
        }).join('')+'</div>'):'';
    var perRun=e.runs?(e.leads/e.runs).toFixed(1):'0';
    return '<div class="src-row'+(kidKeys.length?' has-kids':'')+'"'+(kidKeys.length?' onclick="srcToggle(\''+rid+'\',this)"':'')+'>'
      +'<div class="src-head">'
        +'<span class="src-name">'+(e.icon?'<span class="src-ic">'+e.icon+'</span>':'')+escHtml(e.label)
          +(kidKeys.length?'<span class="src-count">'+kidKeys.length+'</span><span class="src-caret">▸</span>':'')+'</span>'
        +'<span class="src-meta">'+e.runs+' runs · '+perRun+'/run'
          +(!va&&(e.m||e.s)?'  <b class="src-m">M '+e.m+'</b> <b class="src-s">S '+e.s+'</b>':'')+'</span>'
        +'<span class="src-val">'+e.leads+'<i>'+pct+'%</i></span>'
      +'</div>'
      +'<div class="src-bar"><i style="width:'+Math.max(1,pct)+'%;background:'+barCol+';"></i></div>'
      +kidHtml+'</div>';
  }
  var html='<div class="src-wrap">'+top.map(row).join('');
  if(rest.length){
    html+='<div class="src-rest" id="src-rest" style="display:none;">'+rest.map(function(e,i){return row(e,100+i);}).join('')+'</div>'
      +'<button class="src-more" onclick="var e=document.getElementById(\'src-rest\');var o=e.style.display===\'none\';e.style.display=o?\'block\':\'none\';window._mgrOpen[\'src-rest\']=o;this.textContent=o?\'Show less ▴\':\'Show '+rest.length+' more sources · '+restLeads+' leads ▾\';">Show '+rest.length+' more sources · '+restLeads+' leads ▾</button>';
  }
  return html+'</div>';
}
function srcToggle(id,el){
  var k=document.getElementById(id); if(!k) return;
  var open=k.classList.toggle('open');
  window._mgrOpen[id]=open;
  var c=el.querySelector('.src-caret'); if(c) c.textContent=open?'▾':'▸';
}

/* Mon→Fri across, Mera on the top row and Suz beneath — same day always lines up in the
   same column, so comparing the two of them is just reading down. */
function mgr_weekGrid(recs,monStr){
  var DAYS=['Mon','Tue','Wed','Thu','Fri'];
  var byKey={};
  recs.forEach(function(r){ byKey[r.va+'|'+r.date]=r; });
  var today=mgr_ukToday();
  function cell(va,di){
    var date=mgr_addDays(monStr,di);
    var r=byKey[va+'|'+date];
    var col=va==='Mera'?'#b23bff':'#f2c200';
    var isToday=date===today;
    if(!r){
      return '<div class="wg-cell empty'+(isToday?' today':'')+'">'
        +'<span class="wg-none">'+(isToday?'in progress':'no shift')+'</span></div>';
    }
    var hrs=parseFloat(r.hoursWorked)||0, lds=parseInt(r.totalLeads)||0;
    var lph=hrs>0?(lds/hrs):0;
    var minsPer=lds>0?Math.round(hrs*60/lds):0;
    return '<div class="wg-cell'+(isToday?' today':'')+'" style="--wc:'+col+';" onclick="mgr_toggleCard(\'wg-'+r.id+'\')">'
      +'<div class="wg-hero"><b>'+lds+'</b><span>leads</span>'
        +(r.tasksSkipped>0?'<i class="wg-skip" title="'+r.tasksSkipped+' skipped">!</i>':'')+'</div>'
      +'<div class="wg-chips">'
        +'<span>⏱ <b>'+r.hoursWorked+'h</b></span>'
        +'<span>⚡ <b>'+lph.toFixed(1)+'</b>/hr</span>'
        +(minsPer?'<span title="Time per lead">🕐 <b>'+minsPer+'m</b>/lead</span>':'')
        +(r.tasksDone?'<span>✓ <b>'+r.tasksDone+'</b></span>':'')
        +(r.breakMins?'<span>☕ <b>'+r.breakMins+'m</b></span>':'')
      +'</div>'
      +'<div class="wg-time">'+shiftWindowHTML(r)+'</div>'
      +'<div class="shift-card-body wg-body" id="wg-'+r.id+'" onclick="event.stopPropagation();">'
        +(mgr_isRealNote(r.notes)?'<div class="wg-note">'+r.notes+'</div>':'<div class="wg-note dim">No note left.</div>')
      +'</div></div>';
  }
  function totalsRow(va){
    var lds=0,hrs=0,n=0;
    for(var i=0;i<5;i++){ var r=byKey[va+'|'+mgr_addDays(monStr,i)]; if(!r) continue;
      lds+=parseInt(r.totalLeads)||0; hrs+=parseFloat(r.hoursWorked)||0; n++; }
    var lph=hrs>0?(lds/hrs).toFixed(1):'0.0';
    var mins=lds>0?Math.round(hrs*60/lds):0;
    return '<div class="wg-tot"><b>'+lds+'</b><span>leads</span>'
      +'<em>'+hrs.toFixed(1)+'h · '+lph+'/hr'+(mins?' · '+mins+'m/lead':'')+' · '+n+' shifts</em></div>';
  }
  var head='<div class="wg-row wg-head"><div class="wg-lbl"></div>'
    +DAYS.map(function(d,i){
        var date=mgr_addDays(monStr,i);
        return '<div class="wg-day'+(date===today?' today':'')+'"><b>'+d+'</b><span>'+date.slice(0,5)+'</span></div>';
      }).join('')+'<div class="wg-lbl wg-totlbl">Week</div></div>';
  var rows=['Mera','Suz'].map(function(va){
    var col=va==='Mera'?'#b23bff':'#f2c200';
    return '<div class="wg-row" style="--wc:'+col+';">'
      +'<div class="wg-lbl"><span class="wg-va">'+vaDisp(va)+'</span></div>'
      +[0,1,2,3,4].map(function(i){ return cell(va,i); }).join('')
      +totalsRow(va)+'</div>';
  }).join('');
  return '<div class="wg-wrap">'+head+rows+'</div>';
}
// ── WEEK TABLE ──
function mgr_weekTable(recs,from,to){
  var settings=getAppSettings();
  var dn=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var today=mgr_ukToday();
  var cur=new Date(from.split('/').reverse().join('-'));
  var end2=new Date(to.split('/').reverse().join('-'));
  var rows=[];
  while(cur<=end2){
    var ds=cur.toLocaleDateString('en-GB');
    var p=ds.split('/');
    var short=p[0]+'/'+p[1];
    var dr=recs.filter(function(r){return r.date===ds;});
    var ml=dr.filter(function(r){return r.va==='Mera';}).reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
    var sl=dr.filter(function(r){return r.va==='Suz';}).reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
    var mh=dr.filter(function(r){return r.va==='Mera';}).reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);
    var sh=dr.filter(function(r){return r.va==='Suz';}).reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);
    var tot=ml+sl,th=mh+sh;
    rows.push({day:dn[cur.getDay()],ds:ds,short:short,ml:ml,sl:sl,mh:mh.toFixed(1),sh:sh.toFixed(1),tot:tot,th:th.toFixed(1),hasDat:dr.length>0,isToday:ds===today});
    cur.setDate(cur.getDate()+1);
  }
  var wd=rows.filter(function(r){return r.hasDat;});
  var best=wd.length?Math.max.apply(null,wd.map(function(r){return r.tot;})):-1;
  var worst=wd.length&&wd.length>1?Math.min.apply(null,wd.map(function(r){return r.tot;})):-1;
  var html='<div style="overflow-x:auto;"><table class="mgr-week-table">'
    +'<thead><tr>'
    +'<th>Day &amp; Date</th>'
    +'<th style="color:#b23bff;">Mera Leads</th>'
    +'<th style="color:#b23bffaa;">Mera Hrs</th>'
    +'<th style="color:#FFEB3B;">Suz Leads</th>'
    +'<th style="color:#FFEB3B99;">Suz Hrs</th>'
    +'<th style="color:#10d99a;">Combined Leads</th>'
    +'<th>Combined Hrs</th>'
    +'<th style="text-align:right;">vs Target</th>'
    +'</tr></thead><tbody>';
  var dayTarget=(settings.goalMera||12)+(settings.goalSuz||12);
  function miniBlock(val,color,sub){
    return '<div style="display:inline-flex;flex-direction:column;align-items:center;background:'+color+'22;border:1px solid '+color+'44;border-radius:8px;padding:5px 10px;min-width:44px;">'
      +'<span style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:'+color+';line-height:1;">'+val+'</span>'
      +(sub?'<span style="font-size:9px;color:'+color+'88;margin-top:2px;">'+sub+'</span>':'')
      +'</div>';
  }
  rows.forEach(function(r){
    var isBest=r.hasDat&&r.tot===best&&best>0,isWorst=r.hasDat&&r.tot===worst&&worst>=0&&best!==worst;
    var todayBadge=r.isToday?'<span style="background:#9b8fff;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;margin-left:5px;vertical-align:middle;">TODAY</span>':'';
    var bestBadge=isBest?'<span style="font-size:9px;background:#10d99a33;color:#10d99a;border-radius:4px;padding:2px 6px;margin-left:5px;font-weight:700;">BEST</span>':'';
    var lowBadge=isWorst?'<span style="font-size:9px;background:#f2647f33;color:#f2647f;border-radius:4px;padding:2px 6px;margin-left:5px;font-weight:700;">LOW</span>':'';
    var rowBg=isBest?'rgba(45,212,163,0.04)':isWorst?'rgba(242,100,127,0.04)':'transparent';
    html+='<tr style="background:'+rowBg+';">'
      +'<td style="white-space:nowrap;padding:10px 14px 10px 0;"><span style="font-weight:700;color:#fff;font-size:14px;">'+r.day+'</span><span style="color:#444;font-size:12px;margin-left:5px;">'+r.short+'</span>'+todayBadge+'</td>'
      +'<td style="padding:8px 8px;">'+(r.hasDat?miniBlock(r.ml,'#b23bff'):'<span style="color:#222;font-size:16px;">—</span>')+'</td>'
      +'<td style="padding:8px 8px;">'+(r.hasDat?miniBlock(r.mh+'h',parseFloat(r.mh)>=settings.dailyHoursTarget?'#10d99a':'#f2647f'):'<span style="color:#222;">—</span>')+'</td>'
      +'<td style="padding:8px 8px;">'+(r.hasDat?miniBlock(r.sl,SUZ_COL):'<span style="color:#222;font-size:16px;">—</span>')+'</td>'
      +'<td style="padding:8px 8px;">'+(r.hasDat?miniBlock(r.sh+'h',parseFloat(r.sh)>=settings.dailyHoursTarget?'#10d99a':'#f2647f'):'<span style="color:#222;">—</span>')+'</td>'
      +'<td style="padding:8px 8px;">'+(r.hasDat?miniBlock(r.tot,'#10d99a')+(bestBadge||lowBadge):'<span style="color:#222;font-size:16px;">—</span>')+'</td>'
      +'<td style="padding:8px 8px;">'+(r.hasDat?miniBlock(r.th+'h','#00cc88'):'<span style="color:#222;">—</span>')+'</td>'
      +'<td style="padding:8px 8px;text-align:right;">'+(r.hasDat?(function(){var vs=r.tot-dayTarget;var c=vs>=0?'#10d99a':'#f2647f';return '<span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:'+c+';">'+(vs>=0?'↑ +'+vs:'↓ '+vs)+'</span>';})():'<span style="color:#222;">—</span>')+'</td>'
      +'</tr>';
  });
  return html+'</tbody></table></div>';
}

// ── AI INSIGHTS ──
var mgr_aiHistory=[];
function mgr_buildDataContext(log){
  var today=mgr_ukToday();
  var tr=log.filter(function(r){return r.date===today;});
  var monStr=mgr_weekStart();var sunDate=mgr_addDays(monStr,6);
  var wr=log.filter(function(r){return mgr_dateInRange(r.date,monStr,sunDate);});
  var last30=log.slice(0,60).filter(function(r){return mgr_dateInRange(r.date,mgr_daysAgo(29),today);});
  function sumRecs(recs){
    return{leads:recs.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0),hrs:recs.reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0).toFixed(1),skips:recs.reduce(function(s,r){return s+(parseInt(r.tasksSkipped)||0);},0),shifts:recs.length};
  }
  var ctx='ShiftTrack Jack View Data\nToday: '+today+'\n\n';
  ctx+='TODAY: Mera='+JSON.stringify(sumRecs(tr.filter(function(r){return r.va==='Mera';}))).replace(/[{}]/g,'')+' Suz='+JSON.stringify(sumRecs(tr.filter(function(r){return r.va==='Suz';}))).replace(/[{}]/g,'')+'\n';
  ctx+='THIS WEEK ('+monStr+'-'+sunDate+'): Combined='+JSON.stringify(sumRecs(wr)).replace(/[{}]/g,'')+'\n';
  ctx+='LAST 30 DAYS: Combined='+JSON.stringify(sumRecs(last30)).replace(/[{}]/g,'')+' Mera='+JSON.stringify(sumRecs(last30.filter(function(r){return r.va==='Mera';}))).replace(/[{}]/g,'')+' Suz='+JSON.stringify(sumRecs(last30.filter(function(r){return r.va==='Suz';}))).replace(/[{}]/g,'')+'\n\n';
  // Task performance
  var srcMap={};
  last30.forEach(function(r){(r.tasks||[]).forEach(function(t){var l=parseInt(t.leads)||0;if(!l) return;var k=(t.name||'').substring(0,24);srcMap[k]=(srcMap[k]||0)+l;});});
  var srcEntries=Object.entries(srcMap).sort(function(a,b){return b[1]-a[1];}).slice(0,6);
  ctx+='TOP SOURCING METHODS (30d): '+srcEntries.map(function(e){return e[0]+':'+e[1];}).join(', ')+'\n\n';
  // Recent notes
  var notes=last30.filter(function(r){return mgr_isRealNote(r.notes);}).slice(0,5);
  if(notes.length) ctx+='RECENT VA NOTES:\n'+notes.map(function(r){return r.va+' ('+r.date+'): '+r.notes;}).join('\n')+'\n\n';
  // Skip patterns
  var skipMap={};
  last30.forEach(function(r){(r.tasks||[]).filter(function(t){return t.skipped;}).forEach(function(t){skipMap[t.name]=(skipMap[t.name]||0)+1;});});
  var skipEntries=Object.entries(skipMap).sort(function(a,b){return b[1]-a[1];});
  if(skipEntries.length) ctx+='SKIP PATTERNS: '+skipEntries.map(function(e){return e[0]+':'+e[1]+'x';}).join(', ')+'\n';
  return ctx;
}
async function mgr_aiAsk(question,outputId){
  var log=mgr_getLog();
  var ctx=mgr_buildDataContext(log);
  var out=document.getElementById(outputId);
  if(!out) return;
  out.innerHTML='<span style="color:#9b8fff;font-size:12px;">Thinking...</span>';
  mgr_aiHistory.push({role:'user',content:question});
  var sysPrompt='You are a sharp, direct operations assistant for Jack, who runs a sourcing business with two virtual assistants (Mera and Suz). You have access to their shift data, lead counts, task performance, and notes. Give clear, actionable, plain-English insights. Be specific with numbers. Call out problems directly. Be concise — no fluff, no bullet-point overload. Max 200 words unless writing a full report.';
  var messages=[{role:'user',content:'Here is the current data context:\n\n'+ctx+'\n\nNow answer this: '+question}];
  if(mgr_aiHistory.length>2) messages=mgr_aiHistory.slice(-6);
  try{
    var resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,system:sysPrompt,messages:messages})});
    var data=await resp.json();
    var text=(data.content||[]).filter(function(c){return c.type==='text';}).map(function(c){return c.text;}).join('');
    mgr_aiHistory.push({role:'assistant',content:text});
    out.innerHTML=text.replace(/\n/g,'<br>');
  }catch(e){out.innerHTML='<div style="color:#555;font-size:12px;border:1px solid #222;border-radius:8px;padding:12px 16px;">⚠ AI insights require the dashboard to be hosted (e.g. GitHub Pages). Running locally? Host it and this will work. Data is ready — just needs hosting.</div>';}
}
/* Weekly Pulse — computed locally from the log (replaces AI Insights, which needed hosting) */
function mgr_aiPanel(){
  try{
    var settings=getAppSettings();
    var log=mgr_getLog();
    var monStr=mgr_weekStart(), sunStr=mgr_addDays(monStr,6);
    var wr=log.filter(function(r){return r.va!=='Test'&&mgr_dateInRange(r.date,monStr,sunStr);});
    // pro-rata target: how many workdays (Mon-Fri) have elapsed this week incl. today
    var now=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
    var dow=now.getDay(); var daysElapsed=(dow===0||dow===6)?5:Math.max(1,dow);
    var proRata=Math.min(settings.weeklyHoursTarget, daysElapsed*settings.dailyHoursTarget);
    function vaRow(va,col){
      var recs=wr.filter(function(r){return r.va===va;});
      var hrs=recs.reduce(function(a,r){return a+(parseFloat(r.hoursWorked)||0);},0);
      var lds=recs.reduce(function(a,r){return a+(parseInt(r.totalLeads)||0);},0);
      var skips=recs.reduce(function(a,r){return a+(parseInt(r.tasksSkipped)||0);},0);
      var behind=hrs<proRata-0.5;
      var pct=settings.weeklyHoursTarget>0?Math.min(100,Math.round(hrs/settings.weeklyHoursTarget*100)):0;
      var flag=behind
        ?'<span style="font-size:10px;font-weight:800;color:#fff;background:var(--red);padding:3px 9px;border-radius:999px;">BEHIND — '+ (settings.weeklyHoursTarget-hrs).toFixed(1)+'h to go</span>'
        :'<span style="font-size:10px;font-weight:800;color:#07160f;background:#10d99a;padding:3px 9px;border-radius:999px;">ON TRACK</span>';
      return '<div style="background:var(--panel-2);border:1px solid var(--line-2);border-left:4px solid '+col+';border-radius:12px;padding:13px 16px;">'
        +'<div style="display:flex;align-items:center;gap:9px;margin-bottom:8px;">'
        +'<b style="font-size:14px;color:'+col+';">'+va+'</b>'+flag
        +'<span style="margin-left:auto;font-size:11px;color:var(--muted);">'+recs.length+' shift'+(recs.length===1?'':'s')+(skips?' · <span style="color:var(--red);font-weight:700;">'+skips+' skipped</span>':'')+'</span></div>'
        +'<div style="display:flex;gap:18px;font-family:var(--font-mono);font-size:13px;margin-bottom:8px;">'
        +'<span><b style="color:#f5a524;font-size:16px;">'+hrs.toFixed(1)+'h</b> <span style="color:var(--muted-2);font-size:10px;">/ '+settings.weeklyHoursTarget+'h wk</span></span>'
        +'<span><b style="color:#10d99a;font-size:16px;">'+lds+'</b> <span style="color:var(--muted-2);font-size:10px;">leads</span></span>'
        +'<span><b style="color:#18c8f0;font-size:16px;">'+(hrs>0?(lds/hrs).toFixed(1):'-')+'</b> <span style="color:var(--muted-2);font-size:10px;">l/hr</span></span>'
        +'</div>'
        +'<div style="height:7px;border-radius:4px;background:rgba(255,255,255,.07);overflow:hidden;"><i style="display:block;height:100%;width:'+pct+'%;border-radius:4px;background:'+(behind?'var(--red)':'#10d99a')+';"></i></div>'
        +'</div>';
    }
    return '<div class="mgr-section">Weekly Pulse — hours vs target, live</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:6px;">'
      +vaRow('Mera','#b23bff')+vaRow('Suz','#f2c200')
      +'</div>'
      +'<div style="font-size:10.5px;color:var(--muted-2);margin-bottom:14px;">Pro-rata check: by '+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow]+' each VA should be at ~'+proRata.toFixed(1)+'h. Full weekly summary fires to Discord on Sundays (data pass).</div>';
  }catch(e){ return ''; }
}

/* ── SHIFT CLOCK MATHS — ONE PLACE, BECAUSE IT WAS WRONG IN TWO ──────────────
   Manila hours mean a shift routinely crosses LONDON midnight. Real rows for
   13/08/2026: Mera 07:21 pm → 04:17 am, Suz 06:48 pm → 05:35 am. Two separate bits
   of code did their own arithmetic on those strings and both broke:
     · Day by Day computed `endM>startM ? endM-startM : 0`, so an overnight shift got
       a length of ZERO — and the bar, the breaks, the task ticks and the axis are all
       gated behind `if(totalMins>0)`. Jack saw two empty Thursday rows.
     · The audit's "How the day was worked" matched /^(\d{1,2}):(\d{2})/ against
       "07:21 pm" and threw the meridiem away, reading an evening start as 07:21 am and
       reporting a twelve-hour warm-up.
   shiftMins() reads both the 12h ("07:21 pm") and 24h ("19:21") forms the app stores.
   shiftSpan() unwraps the midnight crossing; shiftAt() puts any other clock time onto
   the same unwrapped line so the two can be subtracted. */
/* ── DOES THIS SHIFT RECORD AGREE WITH ITSELF? ───────────────────────────────
   Until v38.4 the draft restore rewrote shiftStart to `now - elapsed - breaks` so the
   timer kept running. hoursWorked stayed right; the clock times became whatever time
   she happened to reload. On 6 of the last 14 shifts the recorded window disagrees
   with the VA's own ticks — Mera 13/08 recorded 07:21 pm → 04:17 am with all 15 ticks
   at 08:45–17:10 (NONE inside), Mera 09/08 recorded a 36-minute window against 8.2h.
   Rendering that as a tidy bar is worse than rendering nothing: it looks authoritative.
   So every row is checked against its own ticks and breaks first, and a row that fails
   says so. Records written from v38.4 on carry the real start and pass. */
/* "07:21 pm \u2192 04:17 am" is printed as plain fact in four other places besides the
   timeline — two shift cards, the weekly grid and the Discord summary the whole team
   reads. A number that shiftEvidence() has already judged unreliable must not appear
   anywhere without saying so. */
function shiftWindowHTML(r){
  if(!r||!r.shiftStart) return '';
  var txt=escHtml(String(r.shiftStart))+' \u2192 '+escHtml(String(r.shiftEnd||''));
  var ev; try{ ev=shiftEvidence(r); }catch(e){ return txt; }
  if(ev.trusted) return txt;
  return txt+' <span title="These times were rebuilt from the timer after a mid-shift reload '
    +'and are not reliable \u2014 the hours figure is unaffected" '
    +'style="color:#ffc766;font-weight:800;cursor:help;">\u26A0</span>';
}
function shiftEvidence(r){
  var span=shiftSpan(r&&r.shiftStart, r&&r.shiftEnd);
  var stamps=[];
  ((r&&r.tasks)||[]).forEach(function(t){
    if(t&&t.done&&t.tickedAt){ var m=shiftMins(t.tickedAt); if(m!=null) stamps.push(m); } });
  ((r&&r.breaks)||[]).forEach(function(b){
    if(b){ var m=shiftMins(b.startTime); if(m!=null) stamps.push(m); } });
  var outside=0;
  if(span.total>0){
    stamps.forEach(function(m){
      var v=(m<span.start)?m+1440:m;
      if(v<span.start||v>span.end) outside++;
    });
  }
  var lo=stamps.length?Math.min.apply(null,stamps):null;
  var hi=stamps.length?Math.max.apply(null,stamps):null;
  // TEST 1 — half or more of the evidence landing outside the window means the window
  // is wrong, not the evidence. One stray tick past the end is just a late tidy-up.
  var strayed=(stamps.length>0 && outside>=Math.ceil(stamps.length/2));
  /* TEST 2 — can the window even HOLD the hours it claims? Mera 09/08/2026 recorded
     02:24 pm → 03:00 pm against 8.2 hours: 36 minutes of window for 8h12m of work.
     Test 1 misses that one because her ticks were clustered inside those 36 minutes,
     so the two tests are deliberately different questions. The fabricated start always
     satisfies (end - start) exactly, so it can only ever be caught by test 1. */
  var claimed=(parseFloat(r&&r.hoursWorked)||0)*60+(parseInt(r&&r.breakMins)||0);
  var tooSmall=(claimed>0 && span.total>0 && span.total<claimed*0.75);
  var trusted=(span.total>0) && !strayed && !tooSmall;
  return {span:span, stamps:stamps.length, outside:outside, lo:lo, hi:hi,
          strayed:strayed, tooSmall:tooSmall, claimed:claimed, trusted:trusted};
}
function shiftMins(t){
  var s=String(t||'').trim(); if(!s) return null;
  var m=s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?/i); if(!m) return null;
  var h=parseInt(m[1],10), mn=parseInt(m[2],10), ap=m[3]?m[3].toLowerCase():'';
  if(ap==='pm'&&h!==12) h+=12;
  if(ap==='am'&&h===12) h=0;
  if(h>23||mn>59) return null;
  return h*60+mn;
}
function shiftSpan(startTxt,endTxt){
  var a=shiftMins(startTxt), b=shiftMins(endTxt);
  if(a==null||b==null) return {start:a,end:b,total:0};
  if(b<a) b+=1440;                                   // it ran past midnight
  return {start:a,end:b,total:b-a};
}
function shiftAt(t,span){
  var m=shiftMins(t); if(m==null) return null;
  if(!span||span.start==null) return m;              // no span to line up against
  if(m<span.start) m+=1440;
  return m;
}
// ── DAY BY DAY — Approved design ─────────────────────────
function mgr_dayByDay(weekRecs,va,monStr){
  var settings=getAppSettings();
  // delegates so there is exactly one definition of "what time is that" — see shiftMins()
  function toMins(t){ var m=shiftMins(t); return m==null?0:m; }
  function fmt24to12(s){
    if(!s) return '';
    var p=s.split(':');
    var h=parseInt(p[0]),mn=parseInt(p[1]||0);
    var h12=h%12||12;
    return h12+':'+(mn<10?'0':'')+mn;
  }
  var monDate=new Date(monStr.split('/').reverse().join('-'));
  var allDays=[];
  for(var di=0;di<7;di++){
    var dayD=new Date(monDate);dayD.setDate(monDate.getDate()+di);
    var dds=dayD.toLocaleDateString('en-GB');
    var rec=weekRecs.filter(function(r){return r.date===dds;})[0]||null;
    allDays.push({ds:dds,rec:rec,dow:dayD.getDay()});
  }
  var dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var activeDays=allDays.filter(function(d){return d.rec;});
  var bestL=activeDays.length?Math.max.apply(null,activeDays.map(function(d){return parseInt(d.rec.totalLeads)||0;})):-1;
  var worstL=activeDays.length>1?Math.min.apply(null,activeDays.map(function(d){return parseInt(d.rec.totalLeads)||0;})):-1;
  var vaCol=va==='Mera'?'#b23bff':'#f2c200';
  var pfx='dbd_'+va.toLowerCase()+'_'+Date.now();

  var html='<div style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.05);padding-top:10px;">';
  // Header + legend
  html+='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
    +'<div style="font-size:10px;color:#9b8fff;text-transform:uppercase;letter-spacing:3px;font-weight:600;">Day by Day</div>'
    +'<div style="display:flex;gap:10px;align-items:center;">'
    +'<div style="display:flex;align-items:center;gap:5px;font-size:9.5px;color:#8b93a8;font-weight:600;"><div style="width:9px;height:9px;border-radius:2px;background:#8b5cff;flex-shrink:0;"></div>Working</div>'
    +'<div style="display:flex;align-items:center;gap:5px;font-size:9.5px;color:#8b93a8;font-weight:600;"><div style="width:9px;height:9px;border-radius:2px;background:rgba(255,255,255,.4);flex-shrink:0;"></div>Break</div>'
    +'<div style="display:flex;align-items:center;gap:5px;font-size:9.5px;color:#8b93a8;font-weight:600;"><div style="width:3px;height:9px;border-radius:1px;background:#10d99a;flex-shrink:0;"></div>Task ticked</div>'
    +'</div></div>';

  allDays.forEach(function(d,idx){
    var r=d.rec;
    var dayName=dayNames[d.dow];
    var isWknd=d.dow===0||d.dow===6;
    var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var p=d.ds.split('/'),shortDate=p[0]+' '+months[parseInt(p[1])-1];
    var rowId=pfx+'_'+idx;

    if(!r){
      html+='<div style="margin-bottom:4px;border-radius:8px;border:1px solid rgba(255,255,255,0.03);overflow:hidden;opacity:'+(isWknd?'0.4':'0.55')+';">'
        +'<div style="display:flex;align-items:stretch;">'
        +'<div style="width:58px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 6px;background:#12141f;border-right:3px solid #262c3d;">'
        +'<div style="font-family:var(--font-head);font-size:13px;font-weight:800;color:#4a5468;line-height:1;">'+dayName+'</div>'
        +'<div style="font-size:9px;color:#39404f;">'+shortDate+'</div>'
        +'</div>'
        +'<div style="flex:1;background:#0d0f16;padding:8px 10px;display:flex;align-items:center;">'
        +'<span style="font-size:11px;color:#4a5468;font-style:italic;">'+(isWknd?'Weekend — day off':'No shift')+'</span>'
        +'</div></div></div>';
      return;
    }

    var lVal=parseInt(r.totalLeads)||0;
    var hVal=parseFloat(r.hoursWorked)||0;
    var isBest=lVal===bestL&&bestL>0;
    var isLow=lVal===worstL&&worstL>=0&&bestL!==worstL;

    var dayGrad=isBest?'#0f5c3a':isLow?'#5c1626':va==='Mera'?'#3d1273':'#4a3a00';
    var dayBorderCol=isBest?'#10d99a':isLow?'#f2647f':vaCol;
    var dayNameCol=isBest?'#10d99a':isLow?'#f2647f':vaCol;

    var closeDaily=settings.dailyHoursTarget*0.97;
    var hCol=hVal>=settings.dailyHoursTarget?'#10d99a':hVal>=closeDaily?'#f2c200':'#ff5028';
    var hBg=hVal>=settings.dailyHoursTarget?'#0e4a2e':hVal>=closeDaily?'#4a3300':'#4a160e';
    var hBord=hVal>=settings.dailyHoursTarget?'#10d99a':hVal>=closeDaily?'#f2c200':'#ff5028';
    var hRgba=hVal>=settings.dailyHoursTarget?'0,255,179':hVal>=closeDaily?'255,215,0':'255,80,40';

    var tasksArr=r.tasks||[];
    var tasksDoneN=parseInt(r.tasksDone)||0;
    var tasksTotal=tasksArr.length||tasksDoneN;
    var allDoneFlag=tasksTotal>0&&tasksDoneN>=tasksTotal&&(parseInt(r.tasksSkipped)||0)===0;
    var partialFlag=tasksTotal>0&&tasksDoneN>0&&!allDoneFlag;
    var tileTaskBg=allDoneFlag?'#0e4a2e':'#231a4d';
    var tileTaskBord=allDoneFlag?'#10d99a':'#7a6acc';
    var tileTaskCol=allDoneFlag?'#10d99a':'#9b8fff';
    var tileTaskRgba=allDoneFlag?'0,255,179':'155,143,255';
    var taskStr=tasksTotal>0?tasksDoneN+'/'+tasksTotal:(tasksDoneN+'');

    /* An overnight shift used to land here as totalMins:0 and every piece of this row
       — bar, breaks, ticks, axis — is gated on totalMins>0, so the whole timeline came
       out blank. shiftSpan() carries the end past 1440 instead. */
    var ev=shiftEvidence(r);
    var span=ev.span;
    var startM=(span.start==null?0:span.start), endM=(span.end==null?0:span.end);
    /* A record whose own ticks fall outside its own window cannot be drawn honestly.
       totalMins:0 keeps every bar/tick/axis branch switched off exactly as it already
       does for a shift with no times at all — the row then shows the warning instead. */
    var totalMins=ev.trusted?span.total:0;
    var breakMinsN=parseInt(r.breakMins)||0;

    // Bar segments
    var barSegments=[];
    if(totalMins>0){
      var breaksArr=r.breaks&&r.breaks.length?r.breaks:null;
      if(breaksArr&&breaksArr.length){
        var cursor=startM;
        breaksArr.forEach(function(b){
          var bStart=shiftAt(b.startTime,span),bEnd=shiftAt(b.endTime,span);
          if(bStart==null||bEnd==null) return;      // an unreadable break must not eat the bar
          if(bStart>cursor) barSegments.push({type:'work',pct:Math.round((bStart-cursor)/totalMins*100)});
          if(bEnd>bStart) barSegments.push({type:'break',pct:Math.round((bEnd-bStart)/totalMins*100)});
          cursor=bEnd;
        });
        if(endM>cursor) barSegments.push({type:'work',pct:Math.round((endM-cursor)/totalMins*100)});
      } else {
        var wrkPct=Math.round((totalMins-breakMinsN)/totalMins*100);
        var brkPct=100-wrkPct;
        if(breakMinsN>0){barSegments=[{type:'work',pct:Math.round(wrkPct*0.6)},{type:'break',pct:brkPct},{type:'work',pct:Math.round(wrkPct*0.4)}];}
        else{barSegments=[{type:'work',pct:100}];}
      }
    }
    /* Clamp before anything is drawn. Mera's real 13/08 row produced widths of
       204%, 2%, 24% and -130% — a bar wider than its own container with a negative
       segment in it. Nothing that reaches the DOM may be outside 0–100. */
    barSegments=barSegments.filter(function(seg){ return seg.pct>0; })
                           .map(function(seg){ return {type:seg.type,pct:Math.min(100,seg.pct)}; });
    if(barSegments.length){
      var sum=barSegments.reduce(function(s,seg){return s+seg.pct;},0);
      if(sum>0){
        var last=barSegments[barSegments.length-1];
        last.pct=Math.max(0,Math.min(100,last.pct+(100-sum)));
      }
    }

    // Tick marks from tasks with tickedAt
    var tickMarks=[];
    if(totalMins>0&&tasksArr.length){
      tasksArr.forEach(function(t){
        if(t.done&&t.tickedAt){
          var tMins=shiftAt(t.tickedAt,span);
          if(tMins==null) return;
          var pct=Math.round((tMins-startM)/totalMins*100);
          if(pct>=0&&pct<=100){
            tickMarks.push({pct:Math.min(98,Math.max(2,pct)),label:fmt24to12(t.tickedAt)+' · '+t.name.substring(0,22)+(t.name.length>22?'...':''),time:fmt24to12(t.tickedAt)});
          }
        }
      });
    }

    // Axis labels
    var axisLabels=[];
    if(totalMins>0){
      var axH=Math.ceil(startM/120)*120;
      while(axH<=endM){
        var axHour=Math.floor(axH/60)%24,axMin=axH%60;   // %24: an overnight axis runs past 24:00
        axisLabels.push({pct:Math.round((axH-startM)/totalMins*100),label:(axHour>12?axHour-12:axHour||12)+':'+(axMin<10?'0':'')+axMin});
        axH+=120;
      }
    }

    // Break chip
    var breakChipHtml='';
    if(breakMinsN>0){
      if(r.breaks&&r.breaks.length>1){
        var bkTip=r.breaks.map(function(b){return b.startTime+'–'+b.endTime+' ('+b.durationMins+'min)';}).join(' · ');
        breakChipHtml='<div style="position:relative;display:inline-block;" class="dbd-wrap">'
          +'<span style="border-radius:4px;padding:2px 7px;font-size:9px;cursor:default;white-space:nowrap;background:rgba(242,193,78,0.1);border:1px solid rgba(242,193,78,0.2);color:#f2c200;">☕ x'+r.breaks.length+' · '+breakMinsN+'min</span>'
          +'<span style="position:absolute;bottom:calc(100% + 5px);left:50%;transform:translateX(-50%);background:#1a1a1a;border:1px solid rgba(242,193,78,0.4);color:#f2c200;font-size:9px;padding:2px 7px;border-radius:4px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity 0.15s;z-index:20;" class="dbd-tt">'+bkTip+'</span>'
          +'</div>';
      } else if(r.breaks&&r.breaks.length===1){
        var bk=r.breaks[0];
        breakChipHtml='<span style="border-radius:4px;padding:2px 7px;font-size:9px;cursor:default;white-space:nowrap;background:rgba(242,193,78,0.1);border:1px solid rgba(242,193,78,0.2);color:#f2c200;">☕ '+breakMinsN+'min · '+bk.startTime+'–'+bk.endTime+'</span>';
      } else {
        breakChipHtml='<span style="border-radius:4px;padding:2px 7px;font-size:9px;white-space:nowrap;background:rgba(242,193,78,0.1);border:1px solid rgba(242,193,78,0.2);color:#f2c200;">☕ '+breakMinsN+'min</span>';
      }
    }

    var rowBorderCol=isBest?'rgba(45,212,163,0.15)':isLow?'rgba(242,100,127,0.15)':'rgba(255,255,255,0.06)';
    var glowRgb=isBest?'0,255,179':isLow?'255,68,102':'213,128,255';

    html+='<div style="margin-bottom:4px;border-radius:8px;border:1px solid '+rowBorderCol+';overflow:visible;">';
    // FACE
    html+='<div style="display:flex;align-items:stretch;cursor:pointer;border-radius:8px;overflow:hidden;" onclick="(function(){var e=document.getElementById(\''+rowId+'\');if(e){e.style.display=e.style.display===\'none\'?\'\':\'none\';}})();">';

    // Day gradient tile
    html+='<div style="width:58px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 6px;background:'+dayGrad+';border-right:3px solid '+dayBorderCol+';position:relative;">'
      +'<div style="position:absolute;inset:0;background:transparent;pointer-events:none;"></div>'
      +'<div style="font-family:var(--font-head);font-size:14px;font-weight:800;color:'+dayNameCol+';line-height:1;position:relative;z-index:1;">'+dayName+'</div>'
      +'<div style="font-size:9.5px;color:'+dayNameCol+'bb;position:relative;z-index:1;">'+shortDate+'</div>'
      +(isBest?'<div style="font-size:9.5px;border-radius:3px;padding:1px 5px;font-weight:700;margin-top:1px;position:relative;z-index:1;background:rgba(45,212,163,0.25);color:#10d99a;border:1px solid rgba(45,212,163,0.3);">BEST</div>'
        :isLow?'<div style="font-size:9.5px;border-radius:3px;padding:1px 5px;font-weight:700;margin-top:1px;position:relative;z-index:1;background:rgba(242,100,127,0.25);color:#f2647f;border:1px solid rgba(242,100,127,0.3);">LOW</div>':'')
      +'</div>';

    // Mid
    html+='<div style="flex:1;background:#12141f;padding:7px 11px;display:flex;flex-direction:column;gap:4px;">';
    // Top row
    html+='<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">';
    if(r.shiftStart){
      html+='<div style="position:relative;display:inline-block;" class="dbd-wrap">'
        +'<span style="font-size:12px;color:#a7aec2;border-bottom:1px dashed rgba(155,143,255,0.18);cursor:default;">'+r.shiftStart+' → '+r.shiftEnd+'</span>'
        +'<span style="position:absolute;bottom:calc(100% + 5px);left:50%;transform:translateX(-50%);background:#1a1a3a;border:1px solid rgba(155,143,255,0.4);color:#b23bff;font-size:9px;padding:2px 7px;border-radius:4px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity 0.15s;z-index:20;" class="dbd-tt">Start '+r.shiftStart+' · End '+r.shiftEnd+'</span>'
        +'</div>';
    }
    html+=breakChipHtml;
    html+='<span style="font-size:10px;color:#5a6378;margin-left:auto;">▾</span>';
    html+='</div>';

    // Thick bar
    if(totalMins>0){
      html+='<div style="position:relative;height:24px;overflow:visible;">';
      html+='<div style="position:absolute;inset:0;background:#0a0c14;border-radius:6px;overflow:hidden;display:flex;">';
      barSegments.forEach(function(seg){
        html+='<div style="height:100%;width:'+seg.pct+'%;background:'+(seg.type==='work'?vaCol:'rgba(255,255,255,.30)');
        
        html+=';"></div>';
      });
      html+='</div>';
      // Tick lines (full height green)
      tickMarks.forEach(function(tk){
        html+='<div style="position:absolute;top:0;height:24px;width:14px;transform:translateX(-7px);cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:5;left:'+tk.pct+'%;" class="dbd-wrap">'
          +'<div style="width:3px;height:100%;background:#10d99a;border-radius:1px;box-shadow:0 0 7px rgba(16,217,154,.55);"></div>'
          +'<span style="position:absolute;bottom:calc(100% + 3px);left:50%;transform:translateX(-50%);background:#0a2018;border:1px solid rgba(45,212,163,0.4);color:#10d99a;font-size:9px;padding:2px 7px;border-radius:4px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity 0.15s;z-index:20;" class="dbd-tt">'+tk.label+'</span>'
          +'</div>';
      });
      html+='</div>';
      // Timestamps under bar
      if(tickMarks.length){
        html+='<div style="position:relative;height:13px;">';
        tickMarks.forEach(function(tk){
          html+='<span style="position:absolute;font-size:9px;color:#10d99a99;transform:translateX(-50%);top:0;white-space:nowrap;left:'+tk.pct+'%;">'+tk.time+'</span>';
        });
        html+='</div>';
      }
      // Axis
      html+='<div style="display:flex;justify-content:space-between;font-size:9px;color:#525c73;margin-top:2px;font-weight:600;">';
      if(axisLabels.length){axisLabels.forEach(function(ax){html+='<span>'+ax.label+'</span>';});}
      else{html+='<span>'+(r.shiftStart||'')+'</span><span>'+(r.shiftEnd||'')+'</span>';}
      html+='</div>';
    }
    /* No bar, and the reason on the row. Jack's words on this screen were "wanna be
       exact" — a blank strip he has to guess at is not exact, and a plausible-looking
       bar built on a start time we know is fabricated is worse than either. */
    if(!ev.trusted && ev.stamps>0){
      function _ampm(mins){
        var h=Math.floor(mins/60)%24, mn=mins%60;
        return (h%12||12)+':'+(mn<10?'0':'')+mn+(h<12?'am':'pm');
      }
      var loT=_ampm(ev.lo), hiT=_ampm(ev.hi);
      html+='<div style="display:flex;align-items:flex-start;gap:8px;background:rgba(245,165,36,0.10);'
        +'border:1px solid rgba(245,165,36,0.35);border-radius:8px;padding:7px 10px;">'
        +'<span style="font-size:12px;line-height:1.2;">\u26A0\uFE0F</span>'
        +'<div style="font-size:10.5px;line-height:1.45;color:#ffc766;">'
        +'<b>Start/end times can\u2019t be trusted on this day.</b> '
        +(ev.tooSmall
          ? 'The recorded '+escHtml(String(r.shiftStart||'?'))+' \u2192 '+escHtml(String(r.shiftEnd||'?'))
            +' window is only '+Math.round(ev.span.total)+' minutes long, but '+r.hoursWorked
            +'h of work is logged against it. '
          : ev.outside+' of '+ev.stamps+' ticks and breaks fall outside the recorded '
            +escHtml(String(r.shiftStart||'?'))+' \u2192 '+escHtml(String(r.shiftEnd||'?'))+' window. ')
        +'The real work runs <b>'+loT+'\u2013'+hiT+'</b>. '
        +'<span style="color:#c9a35a;">She reloaded mid-shift and the old app rebuilt the start time from the timer '
        +'(fixed in v38.4). The hours, leads and task counts beside this are unaffected.</span>'
        +'</div></div>';
    }
    html+='</div>'; // end mid

    // Stat tiles
    html+='<div style="display:flex;flex-shrink:0;padding:6px 8px;background:#12141f;border-left:1px solid rgba(255,255,255,0.07);align-items:center;gap:4px;">';
    // Hours
    html+='<div style="border-radius:7px;padding:5px 9px;display:flex;flex-direction:column;align-items:center;gap:1px;min-width:52px;background:'+hBg+';border:1px solid rgba('+hRgba+',0.25);border-top:2px solid '+hBord+';">'
      +'<div style="font-size:9.5px;text-transform:uppercase;letter-spacing:1.1px;font-weight:600;color:'+hBord+'88;">Hours</div>'
      +'<div style="font-family:var(--font-head);font-size:17px;font-weight:800;line-height:1.1;color:'+hCol+';">'+r.hoursWorked+'h</div>'
      +'</div>';
    // Leads
    html+='<div style="border-radius:7px;padding:5px 9px;display:flex;flex-direction:column;align-items:center;gap:1px;min-width:54px;background:#0e4a2e;border:1px solid rgba(16,217,154,.35);border-top:2px solid #10d99a;">'
      +'<div style="font-size:9.5px;text-transform:uppercase;letter-spacing:1.1px;font-weight:600;color:#10d99a88;">Leads</div>'
      +'<div style="font-family:var(--font-head);font-size:17px;font-weight:800;line-height:1.1;color:#10d99a;">'+lVal+'</div>'
      +'</div>';
    // Tasks
    html+='<div style="border-radius:7px;padding:5px 9px;display:flex;flex-direction:column;align-items:center;gap:1px;min-width:52px;background:'+tileTaskBg+';border:1px solid rgba('+tileTaskRgba+',0.2);border-top:2px solid '+tileTaskBord+';">'
      +'<div style="font-size:9.5px;text-transform:uppercase;letter-spacing:1.1px;font-weight:600;color:'+tileTaskBord+'88;">Tasks</div>'
      +'<div style="font-family:var(--font-head);font-size:17px;font-weight:800;line-height:1.1;color:'+tileTaskCol+';">'+taskStr+'</div>'
      +'</div>';
    html+='</div>'; // end stats
    html+='</div>'; // end face

    // Expandable task list
    html+='<div id="'+rowId+'" style="display:none;border-top:1px solid rgba(255,255,255,0.05);padding:8px 12px 10px 70px;background:#0d0f16;border-radius:0 0 8px 8px;">';
    if(tasksArr.length){
      html+='<div style="display:flex;font-size:9px;color:#5a6378;text-transform:uppercase;letter-spacing:1.4px;font-weight:700;padding-bottom:5px;border-bottom:1px solid rgba(255,255,255,0.04);margin-bottom:3px;">'
        +'<span style="min-width:52px;">Ticked</span><span style="flex:1;">Task</span>'
        +'<span style="min-width:74px;text-align:right;" title="How long they spent \u2014 green when the Start/Stop timer produced it, amber when it was typed in by hand">Time</span>'
        +'<span style="min-width:40px;text-align:right;">Leads</span>'
        +'</div>';
      tasksArr.forEach(function(t){
        var isSk=t.skipped;
        var timeLabel=isSk?'—':t.tickedAt?fmt24to12(t.tickedAt):(t.done?'✓':'—');
        var timeCol=isSk?'#f2647f':'#10d99a';
        var nameStyle=isSk?'color:#f2647f99;text-decoration:line-through;':'color:#b6bccb;';
        var leadsVal=parseInt(t.leads)||0;
        var leadsHtml=leadsVal>0?'<span style="color:#f2c200;">'+leadsVal+'</span>':'<span style="color:#3a4258;">—</span>';
        /* Jack: "when i audit their day i wanna know how long they spent on each thing —
           i want them using start and stop, maybe a column to say if they did or didn't."
           Green = the timer produced it. Amber = typed in by hand. Grey dash = no time at
           all, which is the thing worth chasing. */
        var _sec=(t.timerSec!=null?+t.timerSec:0);
        var _mins=(parseInt(t.timeHrs)||0)*60+(parseInt(t.timeMins)||0);
        var _timed=(_sec>0)||!!t._timeFromTimer;
        var spentHtml;
        if(_mins>0||_sec>0){
          var _show=_mins>0?((_mins>=60?Math.floor(_mins/60)+'h ':'')+(_mins%60)+'m')
                           :(Math.round(_sec/60)+'m');
          spentHtml='<span style="color:'+(_timed?'#10d99a':'#f5a524')+';" title="'
            +(_timed?'timed with Start/Stop':'typed in by hand — no timer used')+'">'+_show
            +(_timed?' \u23f1':' \u270e')+'</span>';
        } else {
          spentHtml='<span style="color:#3a4258;" title="no time recorded at all">\u2014</span>';
        }
        // sourcing under the 30m/day floor is the one shortfall Jack wants flagged
        if((t.id==='sourcing'||t.id==='suz-sourcing') && !isSk){
          var _sm=Math.max(Math.round(_sec/60),_mins);
          if(_sm<30) spentHtml+=' <span style="color:#f2647f;font-weight:800;font-size:9.5px;" title="Jack\'s floor: 30 minutes of own sourcing per day">\u26a0 under 30m sourcing min</span>';
        }
        html+='<div style="display:flex;align-items:baseline;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.03);">'
          +'<span style="min-width:52px;color:'+timeCol+';font-size:10px;flex-shrink:0;">'+timeLabel+'</span>'
          +'<span style="flex:1;font-size:12px;'+nameStyle+'">'+t.name+'</span>'
          +'<span style="min-width:74px;text-align:right;font-size:10px;">'+spentHtml+'</span>'
          +'<span style="min-width:40px;text-align:right;font-size:10px;">'+leadsHtml+'</span>'
          +(isSk&&t.skipReason?'</div><div style="padding:1px 0 3px 52px;"><span style="font-size:9px;color:#f2647f55;font-style:italic;">'+t.skipReason+'</span>':'')
          +'</div>';
      });
    } else {
      html+='<div style="color:#5a6378;font-size:12px;padding:8px 0;">No task breakdown available.</div>';
    }
    html+='</div>'; // expandable
    html+='</div>'; // row
  });

  html+='</div>'; // wrapper
  return html;
}
function dbdTog(id){var e=document.getElementById(id);if(e){e.style.display=e.style.display==='block'?'none':'block';}}

