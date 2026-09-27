// ── TAB RENDERERS ──
// status → tile class: >=100% pace green, >=85% amber, below red, no data grey
function paceTile(val,target){
  if(!target||target<=0) return 'tile-off';
  if(val<=0) return 'tile-off';
  var p=val/target;
  return p>=1?'tile-green':p>=0.85?'tile-amber':'tile-red';
}
function perfShow(which){
  ['today','week','mtd'].forEach(function(t){
    var c=document.getElementById('mgr-'+t+'-content'); if(c) c.style.display=t===which?'block':'none';
  });
  document.querySelectorAll('#perf-seg button').forEach(function(b){b.classList.toggle('on',b.dataset.p===which);});
  try{ if(which==='today') mgr_renderToday(); else if(which==='week') mgr_renderWeek(); else mgr_renderMTD(); }catch(e){}
  window._perfWhich=which;
}
function mgr_daysElapsedThisWeek(){
  var now=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
  var dow=now.getDay();
  return (dow===0||dow===6)?5:Math.max(1,dow);
}
function mgr_trendStrip(){
  var log=mgr_getLog(), today=mgr_ukToday();
  var days=[]; for(var i=13;i>=0;i--) days.push(mgr_addDays(today,-i));
  function leadsOn(day,va){ return log.filter(function(r){return r.date===day && r.va===va;}).reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0); }
  var data=days.map(function(d){var m=leadsOn(d,'Mera'),s=leadsOn(d,'Suz');return {d:d,m:m,s:s,t:m+s};});
  var maxv=Math.max.apply(null,data.map(function(x){return x.t;}).concat([1]));
  var H=84;
  var bars=data.map(function(x){
    var mh=Math.round(x.m/maxv*H), sh=Math.round(x.s/maxv*H), empty=x.t===0;
    var p=x.d.split('/'); var dt=new Date(+p[2],+p[1]-1,+p[0]); var dow=['S','M','T','W','T','F','S'][dt.getDay()];
    var isToday=x.d===today;
    return '<div class="trend-col'+(isToday?' now':'')+'" title="'+x.d+' — '+x.t+' leads (Mera '+x.m+' · Suz '+x.s+')">'
      +'<div class="trend-val'+(empty?' z':'')+'">'+(empty?'·':x.t)+'</div>'
      +'<div class="trend-track" style="height:'+H+'px;">'
        +(sh>0?'<span style="height:'+sh+'px;background:var(--suz);"></span>':'')+(mh>0?'<span style="height:'+mh+'px;background:var(--mera);"></span>':'')
      +'</div>'
      +'<div class="trend-dow">'+dow+'</div>'
      +'</div>';
  }).join('');
  var tot=data.reduce(function(a,x){return a+x.t;},0);
  var best=data.reduce(function(a,x){return x.t>a.t?x:a;},{t:0});
  var active=data.filter(function(x){return x.t>0;}).length;
  var avg=active?Math.round(tot/active):0;
  return '<div class="mgr-sec2"><div><div class="s-ttl">Momentum</div><div class="s-sub">Leads per day · last 14 days</div></div>'
      +'<div class="s-right" style="font-size:11px;color:var(--muted-2);font-weight:600;"><span style="color:var(--mera);">●</span> Mera&nbsp;&nbsp;<span style="color:var(--suz);">●</span> Suz&nbsp;·&nbsp;<b style="color:var(--text)">'+tot+'</b> leads · avg <b style="color:var(--text)">'+avg+'</b>/day'+(best.t>0?' · best <b style="color:var(--text)">'+best.t+'</b>':'')+'</div></div>'
    +'<div class="trend-wrap">'+bars+'</div>';
}
// ── SPEND (reads the same Google Sheet as Jack's Spend Dashboard) ──
var SPEND_SHEET_ID='1vK0RICVAYyE4sDDwlGfuBlBNU6xNzdO8u4aoaTCzrrI';
var SPEND_API_KEY='AIzaSyB3oGNbQ27XUlBWPEMxm0B9_Ilsd5wq0EE';
var SPEND_DASH_URL='https://jackbithellamazon.github.io/Spend-Dashboard/';
var _spendCache=null;
// Mirrors the Spend Dashboard EXACTLY: same quarter tab ('Q{q} AMZ - OA'), same columns
// (date=A, qty=G, provider=M, spend=O col-14), same VA-A/VA-S provider split, same Targets tab.
async function loadSpend(force){
  try{
    // hydrate from localStorage so the tile shows instantly (no "Loading…" flicker on every reload)
    if(!_spendCache){ try{ var _c=JSON.parse(lsGet('spend_cache_v1')||'null'); if(_c&&_c.vaA){ _spendCache=_c; renderSpendTile(); try{mgr_renderSpend();}catch(e){} } }catch(e){} }
    if(_spendCache && !force && (Date.now()-_spendCache.t < 600000)){ renderSpendTile(); return; }
    var base='https://sheets.googleapis.com/v4/spreadsheets/'+SPEND_SHEET_ID;
    var now=new Date(), mm=now.getMonth(), yy=now.getFullYear(), monNum=mm+1;
    var q=Math.floor(mm/3)+1;
    var quarterTab='Q'+q+' AMZ - OA';   // the exact tab the dashboard reads for this quarter
    var ranges=['ranges='+encodeURIComponent(quarterTab+'!A2:O2000'),
                'ranges='+encodeURIComponent('Targets!A1:R40')];
    var bg=await (await fetchT(base+'/values:batchGet?'+ranges.join('&')+'&key='+SPEND_API_KEY)).json();
    var vr=bg.valueRanges||[];
    var rows=(vr[0]&&vr[0].values)||[];
    // spend-settings: which providers roll into each VA line, display names, target overrides
    var S; try{S=getAppSettings();}catch(e){S={};}
    function plist(v,def){ return String(v||def).split(',').map(function(x){return x.trim().toLowerCase();}).filter(Boolean); }
    var lowA=plist(S.spendProvA,'VA-A'), lowS=plist(S.spendProvS,'VA-S');
    var tot={spend:0,units:0,orders:0}, a={spend:0,units:0,orders:0}, s2={spend:0,units:0,orders:0};
    rows.forEach(function(r){
      if(!r||r.length<=14) return;                       // must reach the spend column (O)
      var dateStr=String(r[0]||'').trim(), provider=String(r[12]||'').trim();
      var spend=parseFloat(String(r[14]||'').replace(/[£,\s]/g,''));  // col O = dashboard's spend
      var qty=parseInt(String(r[6]||'').replace(/[,\s]/g,''))||1;
      if(!dateStr||!provider||isNaN(spend)||spend<=0) return;
      var p=dateStr.split('/'); var d; if(p.length===3) d=new Date(+p[2],+p[1]-1,+p[0]); else d=new Date(dateStr);
      if(!d||isNaN(d.getTime())) return;
      if(d.getMonth()!==mm || d.getFullYear()!==yy) return;   // current month only
      tot.spend+=spend; tot.units+=qty; tot.orders++;
      var pl=provider.toLowerCase();
      if(lowA.indexOf(pl)>=0){ a.spend+=spend; a.units+=qty; a.orders++; }
      if(lowS.indexOf(pl)>=0){ s2.spend+=spend; s2.units+=qty; s2.orders++; }
    });
    // Targets tab — same buildTargets logic: header row = month names, col0 = provider name
    var tvals=(vr[1]&&vr[1].values)||[]; var hdr=tvals[0]||[];
    var MMAP={jan:1,feb:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
    var monCol=-1; for(var c=1;c<hdr.length;c++){ if(MMAP[String(hdr[c]||'').trim().toLowerCase()]===monNum){ monCol=c; break; } }
    function tgt(prov){ if(monCol<0) return 0; var row=tvals.filter(function(r){return String(r[0]||'').trim().toLowerCase()===prov;})[0]; if(!row||row[monCol]==null) return 0; return parseFloat(String(row[monCol]).replace(/[£,\s]/g,''))||0; }
    function sumTgt(list){ return list.reduce(function(t,p){return t+tgt(p);},0); }
    var ovT=parseFloat(String(S.spendTgtA||'').replace(/[£,\s]/g,'')); if(isNaN(ovT)||ovT<=0) ovT=sumTgt(lowA);
    var ovTS=parseFloat(String(S.spendTgtS||'').replace(/[£,\s]/g,'')); if(isNaN(ovTS)||ovTS<=0) ovTS=sumTgt(lowS);
    _spendCache={ t:Date.now(), tab:quarterTab, showCombined:S.spendShowCombined!==0,
      team:{spend:tot.spend,units:tot.units,orders:tot.orders,target:tgt('overall')},
      vaA:{spend:a.spend,units:a.units,orders:a.orders,target:ovT,name:(S.spendNameA&&S.spendNameA.trim())||'VA-A'},
      vaS:{spend:s2.spend,units:s2.units,orders:s2.orders,target:ovTS,name:(S.spendNameS&&S.spendNameS.trim())||'VA-S'} };
    try{ lsPut('spend_cache_v1', JSON.stringify(_spendCache)); }catch(e){}
    renderSpendTile(); try{ mgr_renderSpend(); }catch(e){}
  }catch(e){}
}
var VA_A_COL='#8b5cf6', VA_S_COL='#eab308';   // dashboard's VA palette (purple / yellow)
// Shared VA-spend card body — used by the overview tile AND the Spend tab.
// Each row spells out: actual / target / expected-pace (labelled) / variance / % / units / orders.
function spendCardInner(){
  if(!_spendCache) return '';
  var st; try{st=getAppSettings();}catch(e){st={};}
  var colA=st.spendColA||VA_A_COL, colS=st.spendColS||VA_S_COL, showPace=st.spendShowPace!==0;
  var now=new Date(), dim=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(), day=now.getDate(), dayFrac=day/dim;
  function money(n){ return '£'+Math.round(n).toLocaleString(); }
  // threshold status — NOT aggressive red at £0 early in the month
  function status(s,t){
    if(t<=0) return {c:'#6b7280',ns:true};
    if(s===0 && day<=3) return {c:'#6b7280',ns:true};   // not started yet
    var exp=t*dayFrac, r=exp>0?s/exp:1;
    if(r>=0.95) return {c:'#2fe0ad'};
    if(r>=0.85) return {c:'#f5c518'};
    if(r>=0.70) return {c:'#f5a524'};
    return {c:'#ff5c75'};
  }
  function row(d,col,extraCls){
    var s=d.spend, t=d.target, exp=t*dayFrac, variance=s-exp, pct=t>0?Math.round(s/t*100):0;
    var stt=status(s,t);
    var varTxt=t<=0?'—':(variance>=0?money(variance)+' ahead':money(-variance)+' behind');
    var varCol=(t<=0||stt.ns)?'var(--muted-2)':(variance>=0?'#2fe0ad':stt.c);
    var barCol=(!showPace||stt.ns)?col:stt.c;
    return '<div class="sv-row'+(extraCls||'')+'">'
      +'<div class="sv-id"><span class="sv-dot" style="background:'+col+'"></span><div class="sv-idtxt"><div class="sv-name">'+escHtml(d.name||'')+'</div><div class="sv-of">of '+money(t)+'</div></div></div>'
      +'<div class="sv-c money"><b>'+money(s)+'</b></div>'
      +'<div class="sv-c money">'+(t>0?money(exp):'—')+'</div>'
      +'<div class="sv-c money" style="color:'+varCol+'">'+varTxt+'</div>'
      +'<div class="sv-c">'+(t>0?pct+'%':'—')+'</div>'
      +'<div class="sv-c">'+(d.orders||0)+'</div>'
      +'<div class="sv-c">'+(d.units||0)+'</div>'
      +'<div class="sv-barcell"><div class="sv-bar"><i style="width:'+Math.min(100,pct)+'%;background:'+barCol+'"></i>'+(t>0&&showPace?'<span class="mk" style="left:'+Math.min(100,Math.round(dayFrac*100))+'%"></span>':'')+'</div></div>'
      +'</div>';
  }
  var A=_spendCache.vaA, S=_spendCache.vaS;
  var ctgt=(A.target||0)+(S.target||0), comb=A.spend+S.spend, cexp=ctgt*dayFrac, cvar=comb-cexp, cpct=ctgt>0?Math.round(comb/ctgt*100):0;
  var head='<div class="sv-row sv-head"><div class="sv-id">VA line</div><div class="sv-c money">Spend</div><div class="sv-c money">Expected</div><div class="sv-c money">Variance</div><div class="sv-c">Budget</div><div class="sv-c">Orders</div><div class="sv-c">Units</div><div class="sv-barcell">Pace →</div></div>';
  var combRow=_spendCache.showCombined
    ? row({spend:comb,target:ctgt,units:(A.units||0)+(S.units||0),orders:(A.orders||0)+(S.orders||0),name:'Combined'},'var(--muted)',' sv-comb')
    : '';
  var key=showPace
    ? '<div class="sv-key"><span class="sv-keybar"><i></i><span class="mk"></span></span> filled bar = actual spend · marker = expected pace today · figures &amp; logic match your Spend Dashboard (<b>'+escHtml(_spendCache.tab||'')+'</b>)</div>'
    : '<div class="sv-key">Source: your Spend Dashboard · <b>'+escHtml(_spendCache.tab||'')+'</b></div>';
  return '<div class="svwrap"><div class="svtable">'+head+row(A,colA)+row(S,colS)+combRow+'</div></div>'+key;
}
// shimmer placeholder shown while spend loads the first time (before any cache)
function spendSkeleton(withHeader){
  var mn=['January','February','March','April','May','June','July','August','September','October','November','December'][new Date().getMonth()];
  var rows='';
  for(var i=0;i<3;i++){ rows+='<div class="sv-row"><div class="sv-id"><span class="sk sk-dot"></span><span class="sk sk-w90"></span></div><div class="sk sk-w60"></div><div class="sk sk-w60"></div><div class="sk sk-w80"></div><div class="sk sk-w40"></div><div class="sk sk-w40"></div><div class="sk sk-w40"></div><div class="sk sk-bar"></div></div>'; }
  var head=withHeader?'<div class="mgr-sec2"><div><div class="s-ttl">VA spend — '+mn+'</div><div class="s-sub">Loading the two VA buying lines&hellip;</div></div></div>':'';
  return head+'<div class="svwrap">'+rows+'</div>';
}
function renderSpendTile(){
  var el=document.getElementById('spend-tile'); if(!el||!_spendCache) return;
  var mn=['January','February','March','April','May','June','July','August','September','October','November','December'][new Date().getMonth()];
  el.innerHTML='<div class="mgr-sec2"><div><div class="s-ttl">VA spend — '+mn+'</div><div class="s-sub">The two VA buying lines, pulled the same way as your Spend Dashboard</div></div>'
      +'<div class="s-right"><a class="s-act" onclick="mgr_switchTab(\'spend\')">Spend detail →</a></div></div>'
    +spendCardInner();
}
function mgr_overviewSkeleton(){
  function bar(w,h,mb){ return '<div class="sk" style="width:'+w+';height:'+h+'px;'+(mb?'margin-bottom:'+mb+'px;':'')+'"></div>'; }
  function tile(){ return '<div style="background:var(--panel,#12141d);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:15px 16px;">'
    +bar('45%',10,13)+bar('62%',26,12)+bar('100%',7,0)+'</div>'; }
  function vaCard(col){ return '<div style="background:var(--panel,#12141d);border:1px solid rgba(255,255,255,0.06);border-top:3px solid '+col+';border-radius:14px;padding:15px 16px;">'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;"><span class="sk" style="width:9px;height:9px;border-radius:50%;"></span><span class="sk" style="width:70px;height:14px;"></span></div>'
    +bar('80%',22,10)+bar('55%',11,8)+bar('68%',11,0)+'</div>'; }
  return '<div style="display:flex;align-items:center;gap:9px;margin:2px 0 16px;color:var(--muted-2,#8b93a8);font-size:12.5px;font-weight:600;">'
    +'<span class="mgr-spin"></span>Loading your dashboard&hellip;</div>'
    +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:11px;margin-bottom:16px;">'+tile()+tile()+tile()+'</div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:11px;">'+vaCard('#b23bff')+vaCard('#f2c200')+'</div>';
}
function mgr_renderOverview(){
  var log=mgr_getLog(),today=mgr_ukToday();
  // Show the skeleton until THIS page-load's first cloud sync lands — not just when the
  // cache is empty. Jack always has cached shifts, so a cache-only check never fired and
  // he saw stale/zero numbers "flick" to the real ones. mgr_syncFromDB flips the flag.
  if(DB_ENABLED && !window._mgrSyncedOnce){
    var host0=document.getElementById('mgr-overview-content');
    if(host0) host0.innerHTML=mgr_overviewSkeleton();
    // safety: if the sync never calls back, drop the skeleton after 7s and show whatever we have
    if(!window._mgrSkelSafety){ window._mgrSkelSafety=setTimeout(function(){ window._mgrSyncedOnce=true; if(mgr_currentTab==='overview') mgr_renderOverview(); },7000); }
    return;
  }
  var settings=getAppSettings();
  var tr=log.filter(function(r){return r.date===today;});
  var tl=tr.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var tskip=tr.reduce(function(s,r){return s+(parseInt(r.tasksSkipped)||0);},0);
  var monStr=mgr_weekStart();var sunStr=mgr_addDays(monStr,6);
  var wr=log.filter(function(r){return mgr_dateInRange(r.date,monStr,sunStr);});
  var wl=wr.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var wh=wr.reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);
  var issues=mgr_getReports().length;
  var isWeekend=mgr_isWeekend();
  var mWk=wr.filter(function(r){return r.va==='Mera';});
  var sWk=wr.filter(function(r){return r.va==='Suz';});
  var mL=mWk.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var sL=sWk.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var mH=mWk.reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);
  var sH=sWk.reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);
  var todayCls=tl>0?'tile-green':isWeekend?'tile-grey':'tile-red';

  var daysEl=Math.max(1,mgr_daysElapsedThisWeek());
  function shortD(s){var p=String(s).split('/');return p.length>=2?p[0]+'/'+p[1]:s;}
  var wkNav='<div class="wknav"><button onclick="mgr_changeWeek(-1)">‹ Prev</button>'
    +'<span class="wk-range">'+shortD(monStr)+' – '+shortD(sunStr)+'</span>'
    +'<button onclick="mgr_changeWeek(1)"'+(mgr_weekOffset>=0?' disabled':'')+'>Next ›</button>'
    +(mgr_weekOffset!==0?'<button onclick="mgr_weekOffset=0;mgr_changeWeek(0)">This week</button>':'')+'</div>';

  var html=tabBannerHTML()+syncStaleBannerHTML()+hoursBannerHTML()+payBannerHTML();
  html+='<div id="oa-ov-line">'+(typeof oaOverviewLineHTML==='function'?oaOverviewLineHTML():'')+'</div>';
  html+='<div id="spend-tile">'+(_spendCache?'':spendSkeleton(true))+'</div>';

  // ── Weekly performance (neutral cards, colour = status, direct actions) ──
  var pMon=mgr_addDays(monStr,-7), pSun=mgr_addDays(monStr,-1);
  var pwl=log.filter(function(r){return mgr_dateInRange(r.date,pMon,pSun);}).reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var wlDelta=wl-pwl;
  var wkGoal=((settings.goalMera||12)+(settings.goalSuz||12))*5, wkPace=wkGoal*(Math.min(daysEl,5)/5);
  var lBehind=Math.max(0,Math.round(wkPace-wl)), lTone=wl>=wkPace?'green':wl>=wkPace*0.7?'amber':'red';
  var THW=(settings.weeklyHoursTarget||20)*2, hPace=THW*(Math.min(daysEl,5)/5);
  var hTone=wh>=hPace?'green':wh>=hPace*0.7?'amber':'red';
  html+='<div class="mgr-sec2"><div><div class="s-ttl">Weekly performance</div><div class="s-sub">'+(mgr_weekOffset===0?'This week so far':'Selected week')+'</div></div><div class="s-right">'+wkNav+'</div></div>';
  html+='<div class="kpi-row">'
    +mgr_kpi({icon:'layers',label:'Leads this week',value:wl,tone:lTone,badge:{t:Math.round(wl/wkGoal*100)+'% of goal',tone:lTone},sub:(lBehind>0?'<b>'+lBehind+'</b> behind pace':'on / ahead of pace')+(pwl>0?' · '+(wlDelta>=0?'+':'')+wlDelta+' vs last week':''),bar:{pct:wl/wkGoal*100,mark:wkPace/wkGoal*100,tone:lTone}})
    +mgr_kpi({icon:'calendar',label:'Leads today',value:tl,tone:tl>0?'green':(isWeekend?'off':'amber'),badge:tl>0?{t:'Active',tone:'green'}:(isWeekend?{t:'Day off',tone:'off'}:{t:'None yet',tone:'amber'}),sub:isWeekend?'weekend — no shifts expected':(tl>0?'both VAs sourcing today':'no leads logged yet')})
    +mgr_kpi({icon:'clock',label:'Hours this week',value:wh.toFixed(1),unit:'h',tone:hTone,badge:{t:'Target '+THW+'h',tone:'off'},sub:wh>=THW?'target met ✓':'<b>'+(THW-wh).toFixed(1)+'h</b> to target',bar:{pct:wh/THW*100,mark:hPace/THW*100,tone:hTone}})
    +mgr_kpi({icon:'alert',label:'Open issues',value:issues,tone:issues>0?'red':'off',badge:issues>0?{t:'Attention',tone:'red'}:{t:'All clear',tone:'green'},sub:issues>0?'<b>'+issues+'</b> unresolved — needs a look':'nothing unresolved',act:issues>0?'View issues':null,onclick:issues>0?"mgr_switchTab('issues')":null})
    +'</div>';

  // ── ROW 2/3: per-VA scorecards, side by side ──
  var daysEl=Math.max(1,mgr_daysElapsedThisWeek());
  var hrsTgt=settings.weeklyHoursTarget||40;
  function vaCells(leads,hrs,wk,dayGoal,weekMin){
    // weekly leads pace measured against the weekly MINIMUM, pro-rated over 5 workdays
    var wkPace = weekMin>0 ? weekMin*(Math.min(daysEl,5)/5) : dayGoal*daysEl;
    var avg=wk.length?Math.round(leads/wk.length):0;
    return [
      {v:leads,l:weekMin>0?('min '+weekMin+'/wk'):'Week leads',pct:wkPace>0?leads/wkPace*100:null,tone:paceHex(leads,wkPace)},
      {v:hrs.toFixed(1)+'h',l:'Hours',pct:hrs/hrsTgt*100,tone:paceHex(hrs,hrsTgt)},
      {v:avg,l:'Avg / shift',pct:wk.length?avg/dayGoal*100:null,tone:paceHex(avg,dayGoal)},
      {v:wk.length,l:wk.length===1?'Shift':'Shifts',pct:wk.length?wk.length/daysEl*100:null,tone:paceHex(wk.length,daysEl)}
    ];
  }
  function vaStatus(recs,wk){
    if(recs.length) return {t:'Submitted today · '+wk.length+(wk.length===1?' shift':' shifts')+' this week',ok:true};
    if(isWeekend) return {t:'Weekend — day off',ok:false};
    return {t:'Not submitted today · '+wk.length+' this week',ok:false};
  }
  var mSt=vaStatus(tr.filter(function(r){return r.va==='Mera';}),mWk);
  var sSt=vaStatus(tr.filter(function(r){return r.va==='Suz';}),sWk);
  html+=mgr_section('This week by VA');
  html+='<div class="va-score-row">'
    +mgr_vaScore(vaDisp('Mera'),vaColour('Mera'),mSt.t,mSt.ok,vaCells(mL,mH,mWk,settings.goalMera||12,settings.minLeadsMera!==undefined?settings.minLeadsMera:60))
    +mgr_vaScore(vaDisp('Suz'),vaColour('Suz'),sSt.t,sSt.ok,vaCells(sL,sH,sWk,settings.goalSuz||12,settings.minLeadsSuz!==undefined?settings.minLeadsSuz:60))
    +'</div>';
  html+='<div id="ov-outstanding"></div>';
  html+='<div id="ov-storerank"></div>';

  var realNotes=tr.filter(function(r){return mgr_isRealNote(r.notes);});
  if(realNotes.length){
    html+=mgr_section('Notes for Jack — Today');
    var vc={Mera:'#b23bff',Suz:'#FFEB3B',Test:'#10d99a'};
    html+=mgr_collapsibleNotes(realNotes,vc);
  }
  try{
    if(typeof oaLoad==='function'){
      if(!OA_SRC) oaLoad().then(function(ok){
        try{ var el=document.getElementById('oa-ov-line');
             if(ok&&el) el.innerHTML=oaOverviewLineHTML(); }catch(e){}
      });
    }
  }catch(e){}
  html+=mgr_trendStrip();
  html+=mgr_section('Week at a Glance — '+monStr+' → '+sunStr);
  html+=mgr_weekTable(wr,monStr,sunStr);
  document.getElementById('mgr-overview-content').innerHTML=html;
  try{ loadSpend(); }catch(e){}
  try{ mgr_renderOutstanding(); }catch(e){}
  try{ mgr_renderStoreRank(); }catch(e){}
}
/* ── Storefront league — which storefronts actually produce (leads/hr over time) ── */
async function mgr_renderStoreRank(){
  var host=document.getElementById('ov-storerank'); if(!host) return;
  var r;
  try{
    r=await fetchT(SUPABASE_URL+'/rest/v1/storefront_sessions?select=va,name,seconds,leads&order=created_at.desc&limit=2000',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
  }catch(e){ return; }
  host=document.getElementById('ov-storerank'); if(!host) return;
  if(!r.ok){ // table not created yet
    host.innerHTML=mgr_section('Storefront league')
      +'<div class="srk-hint">Run <b>&ldquo;BDL VA HQ - ADD storefront sessions.sql&rdquo;</b> (in your Downloads) once in the Supabase SQL editor to switch this on — every storefront session then builds a leads/hr league here.</div>';
    return;
  }
  var rows=await r.json();
  if(!rows.length){
    host.innerHTML=mgr_section('Storefront league')
      +'<div class="srk-hint">No storefront sessions logged yet — they\'ll appear here as the VAs run storefronts (tracker or your sends).</div>';
    return;
  }
  var by={};
  rows.forEach(function(x){
    var k=String(x.name||'').trim().toLowerCase(); if(!k) return;
    var e=by[k]||(by[k]={name:String(x.name).trim(),sessions:0,leads:0,sec:0,vas:{}});
    e.sessions++; e.leads+=(parseInt(x.leads)||0); e.sec+=(parseInt(x.seconds)||0);
    if(x.va) e.vas[x.va]=(e.vas[x.va]||0)+1;
  });
  var list=Object.keys(by).map(function(k){ var e=by[k];
    e.hrs=e.sec/3600; e.lph=(e.sec>=900&&e.leads>0)?(e.leads/e.hrs):null; return e; });
  list.sort(function(a,b){ if(a.lph===null&&b.lph===null) return b.leads-a.leads; if(a.lph===null) return 1; if(b.lph===null) return -1; return b.lph-a.lph; });
  var medals=['\u{1F947}','\u{1F948}','\u{1F949}'];
  var html=mgr_section('Storefront league — leads per hour, all time');
  html+='<div class="srk-wrap"><div class="srk-row srk-head"><span>#</span><span>Storefront</span><span>Leads</span><span>Hours</span><span>Leads/hr</span><span>Who</span></div>';
  list.slice(0,8).forEach(function(e,i){
    var who=Object.keys(e.vas).map(function(v){ return '<i style="color:'+vaColour(v)+'">'+vaDisp(v).slice(0,1)+'</i>'; }).join(' ');
    html+='<div class="srk-row'+(i===0&&e.lph?' top':'')+'">'
      +'<span>'+(medals[i]||(i+1))+'</span>'
      +'<span class="srk-name">'+String(e.name).replace(/</g,'&lt;')+'</span>'
      +'<span>'+e.leads+'</span>'
      +'<span>'+(e.hrs>=0.1?e.hrs.toFixed(1)+'h':Math.round(e.sec/60)+'m')+'</span>'
      +'<span class="srk-lph'+(e.lph?'':' dim')+'">'+(e.lph?e.lph.toFixed(1):'—')+'</span>'
      +'<span>'+who+'</span></div>';
  });
  if(list.length>8) html+='<div class="srk-more">+'+(list.length-8)+' more storefronts tracked</div>';
  html+='</div>';
  host.innerHTML=html;
}
/* ── Cross-VA "Outstanding from Jack" tracker (Overview) + 3-day overdue Discord ping ── */
async function mgr_fetchOpenBuckets(){
  try{
    var keys=['Mera|OPEN','Suz|OPEN'].map(encodeURIComponent).join(',');
    var r=await fetchT(SUPABASE_URL+'/rest/v1/jack_briefs?k=in.('+keys+')&select=k,data',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
    if(r.ok){ var rows=await r.json(); var a=jb_all(); rows.forEach(function(x){ a[x.k]=x.data; }); jb_saveAll(a); }
  }catch(e){}
}
function mgr_openSummary(va){
  var o=jb_open(va);
  var open=(o.items||[]).filter(function(x){return !x.done;}).concat((o.tasks||[]).filter(function(x){return !x.done;})).sort(jb_byAge);
  var doneTodayArr=(o.items||[]).concat(o.tasks||[]).filter(function(x){return x.done&&x.doneOn===ukDateShort();});
  var doneLeads=doneTodayArr.reduce(function(s,x){return s+(parseInt(x.resLeads)||0);},0);
  var oldest=0; open.forEach(function(x){ var d=jb_carryDays(x.addedOn); if(d>oldest) oldest=d; });
  return {va:va,open:open,doneToday:doneTodayArr.length,doneLeads:doneLeads,oldest:oldest,
    overdue:open.filter(function(x){return jb_carryDays(x.addedOn)>=3;})};
}
/* SELF-HEAL from EOD submissions — works even if a VA runs an OLD app version whose
   tick-write is broken: their submitted shifts contain every task with done + results,
   so any From-Jack item completed in a submitted shift gets marked done in the bucket. */
async function jb_reconcileFromShifts(){
  try{
    var r=await fetchT(SUPABASE_URL+'/rest/v1/shifts?select=va,date,data&order=submitted_at.desc&limit=80',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
    if(!r.ok) return 0;
    var recs=await r.json(), healed=0;
    ['Mera','Suz'].forEach(function(va){
      var doneMap={};   // iid → {doneOn, res…} from this VA's submitted shifts
      recs.filter(function(x){return x.va===va&&x.data&&x.data.tasks;}).forEach(function(x){
        (x.data.tasks||[]).forEach(function(t){
          if(!t.done||!t.id) return;
          var m=String(t.id).match(/^(?:jbitem|oneoff)-(.+)$/); if(!m) return;
          if(!doneMap[m[1]]) doneMap[m[1]]={doneOn:x.data.dateUK||x.date,
            leads:(t.leads===''||t.leads==null)?null:(parseInt(t.leads)||0),
            mins:(function(){ var mm=String(t.time||'').match(/(?:(\d+)h)?\s*(?:(\d+)m)?/); var v=(parseInt(mm&&mm[1])||0)*60+(parseInt(mm&&mm[2])||0); return v||null; })(),
            note:(t.context||'').trim()||null};
        });
      });
      if(!Object.keys(doneMap).length) return;
      var o=jb_open(va), changed=false;
      [(o.items||[]),(o.tasks||[])].forEach(function(arr){
        arr.forEach(function(e){
          var d=e&&e.iid&&!e.done?doneMap[e.iid]:null;
          if(d){ e.done=true; e.doneOn=d.doneOn; e.doneBy=va;
            if(d.leads!=null) e.resLeads=d.leads; if(d.mins) e.resMins=d.mins; if(d.note) e.resNote=d.note;
            changed=true; healed++; }
        });
      });
      if(changed) jb_setOpen(va,o);
    });
    return healed;
  }catch(e){ return 0; }
}
async function mgr_renderOutstanding(){
  var host=document.getElementById('ov-outstanding'); if(!host) return;
  await mgr_fetchOpenBuckets();
  try{ var _healed=await jb_reconcileFromShifts(); if(_healed) console.log('jb reconcile: healed '+_healed+' items from EOD records'); }catch(e){}
  host=document.getElementById('ov-outstanding'); if(!host) return;   // overview may have re-rendered
  var Ms=mgr_openSummary('Mera'), Ss=mgr_openSummary('Suz');
  var html=mgr_section('Outstanding from Jack — rolls over until ticked');
  if(!Ms.open.length&&!Ss.open.length){
    html+='<div class="ov-out-clear">✓ All clear — everything you\'ve sent has been ticked off.</div>';
  } else {
    html+='<div class="ov-out-row">'+[Ms,Ss].map(function(s){
      var col=vaColour(s.va);
      var tone=s.oldest>=3?'red':s.open.length?'amber':'green';
      var rows=s.open.slice(0,4).map(function(x){
        var d=jb_carryDays(x.addedOn);
        var lbl=x.name||jb_cleanLabel(x);
        var age=d>=3?'<span class="ov-age red">'+d+'d</span>':d>0?'<span class="ov-age amb">'+d+'d</span>':'<span class="ov-age">today</span>';
        return '<div class="ov-out-item"><span class="ov-out-name">'+String(lbl).replace(/</g,'&lt;')+'</span>'+age+'</div>';
      }).join('');
      if(s.open.length>4) rows+='<div class="ov-out-more">+'+(s.open.length-4)+' more…</div>';
      if(!s.open.length) rows='<div class="ov-out-more">Nothing open ✓</div>';
      return '<div class="ov-out-card tone-'+tone+'" style="--vc:'+col+'" onclick="mgr_switchTab(\''+s.va.toLowerCase()+'\')">'
        +'<div class="ov-out-head"><b>'+vaDisp(s.va)+'</b>'
        +'<span class="ov-out-badge'+(s.oldest>=3?' red':'')+'">'+s.open.length+' open'+(s.oldest?' · oldest '+s.oldest+'d':'')+'</span></div>'
        +rows
        +(s.doneToday?'<div class="ov-out-done">✓ '+s.doneToday+' ticked off today'+(s.doneLeads?' · '+s.doneLeads+' lead'+(s.doneLeads===1?'':'s'):'')+'</div>':'')
        +'</div>';
    }).join('')+'</div>';
  }
  host.innerHTML=html;
  try{ mgr_overduePing([Ms,Ss]); }catch(e){}
}
// once per day, cross-device deduped: ping Discord when anything is 3+ days overdue
function mgr_overduePing(sums){
  var over=sums.filter(function(s){return s.overdue.length;});
  if(!over.length) return;
  var hook=DISCORD_TASKS_WEBHOOK||DISCORD_WEBHOOK; if(!hook) return;
  var day=ukDateShort().replace(/\//g,'-');
  if(lsGet('overdue_ping_'+day)) return;
  lsPut('overdue_ping_'+day,'1');
  fetch(SUPABASE_URL+'/rest/v1/app_flags',{method:'POST',
    headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=representation'},
    body:JSON.stringify({k:'overdueping_'+day,v:'sent'})})
    .then(function(r){return r.json();})
    .then(function(rows){
      if(Array.isArray(rows)&&rows.length===0) return;  // another device already pinged today
      var fields=over.map(function(s){
        return {name:vaDisp(s.va)+' — '+s.overdue.length+' overdue', inline:false,
          value:s.overdue.slice(0,6).map(function(x){ return '• '+String(x.name||jb_cleanLabel(x)).slice(0,60)+' — **'+jb_carryDays(x.addedOn)+'d** (sent '+x.addedOn+')'; }).join('\n')};
      });
      var payload={embeds:[{title:'⚠️ From-Jack items going stale',color:15879747,
        description:'These have been sitting unticked for 3+ days:',fields:fields,
        footer:{text:'BDL VA HQ · overdue watch'},timestamp:new Date().toISOString()}]};
      var s=getAppSettings(); if(s.discordUserId) payload.content='<@'+s.discordUserId+'>';
      fetch(hook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    }).catch(function(){
      // Supabase unreachable → still send, guarded by the local once-a-day flag (same fallback as the weekly summary)
      try{
        var fields=over.map(function(s2){
          return {name:vaDisp(s2.va)+' — '+s2.overdue.length+' overdue', inline:false,
            value:s2.overdue.slice(0,6).map(function(x){ return '• '+String(x.name||jb_cleanLabel(x)).slice(0,60)+' — **'+jb_carryDays(x.addedOn)+'d** (sent '+x.addedOn+')'; }).join('\n')};
        });
        var payload={embeds:[{title:'⚠️ From-Jack items going stale',color:15879747,
          description:'These have been sitting unticked for 3+ days:',fields:fields,
          footer:{text:'BDL VA HQ · overdue watch'},timestamp:new Date().toISOString()}]};
        var s3=getAppSettings(); if(s3.discordUserId) payload.content='<@'+s3.discordUserId+'>';
        fetch(hook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      }catch(e){}
    });
}

function mgr_renderToday(){
  var log=mgr_getLog(),today=mgr_ukToday();
  var recs=log.filter(function(r){return r.date===today;});
  var tl=recs.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var th=recs.reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);
  var tskip=recs.reduce(function(s,r){return s+(parseInt(r.tasksSkipped)||0);},0);
  var settings=getAppSettings();
  var mL=recs.filter(function(r){return r.va==='Mera';}).reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var sL=recs.filter(function(r){return r.va==='Suz';}).reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var dayGoal=(settings.goalMera||12)+(settings.goalSuz||12);
  var gTone=tl>=dayGoal?'green':(tl>=dayGoal*0.7?'amber':'off');
  var html='<div style="font-size:12px;color:var(--muted-2);margin-bottom:14px;">'+ukDateString()+'</div>';
  html+=mgr_pills(recs);
  html+='<div class="kpi-row perf-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:18px;">'
    +mgr_kpi({label:'Total leads',value:tl,tone:'cyan',grad:true,badge:{t:Math.round(tl/dayGoal*100)+'% of goal',tone:gTone},sub:'<b>'+recs.length+'</b> shift'+(recs.length===1?'':'s')+' · goal '+dayGoal})
    +mgr_kpi({label:'Mera leads',value:mL,tone:'purple',grad:true,sub:'<b>'+(tl?Math.round(mL/tl*100):0)+'%</b> of today'})
    +mgr_kpi({label:'Suz leads',value:sL,tone:'amber',grad:true,sub:'<b>'+(tl?Math.round(sL/tl*100):0)+'%</b> of today'})
    +mgr_kpi({label:'Hours',value:th.toFixed(1),unit:'h',tone:'green',grad:true,badge:tskip>0?{t:tskip+' skipped',tone:'red'}:null,sub:'combined today'})
    +'</div>';
  var realNotes=recs.filter(function(r){return mgr_isRealNote(r.notes);});
  var notesHtml='';
  if(realNotes.length){ notesHtml=mgr_section('💬 Notes for Jack')+mgr_collapsibleNotes(realNotes,{Mera:'#b23bff',Suz:'#FFEB3B'}); }
  html+='<div class="perf-2col">'
    +'<div class="perf-main"><div class="mc2-h" style="margin-bottom:10px;">Sourcing — today</div>'+mgr_sourcing(recs,'')+notesHtml+'</div>'
    +'<div class="perf-side">'+mgr_leadsSplitDonut(mL,sL)+'</div>'
  +'</div>';
  html+=mgr_section('Shifts');
  html+=recs.length?recs.map(function(r){return mgr_shiftCard(r,true);}).join(''):'<div style="color:var(--muted-2);font-size:13px;padding:20px 0;">No shifts submitted today yet.</div>';
  document.getElementById('mgr-today-content').innerHTML=html;
}

function mgr_renderVA(va,containerId){
  var log=mgr_getLog(),recs=log.filter(function(r){return r.va===va;});
  var settings=getAppSettings();
  var col=va==='Mera'?'#b23bff':'#f2c200';
  var today=mgr_ukToday();
  var todayRec=recs.filter(function(r){return r.date===today;});
  var tl=recs.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var th=recs.reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);
  var tskip=recs.reduce(function(s,r){return s+(parseInt(r.tasksSkipped)||0);},0);
  var avg=recs.length?Math.round(tl/recs.length):0;
  var tileCls=va==='Mera'?'tile-mera':'tile-suz';

  // Week hours tracking
  var monStr=mgr_weekStart(),sunStr=mgr_addDays(monStr,6);
  var weekRecs=recs.filter(function(r){return mgr_dateInRange(r.date,monStr,sunStr);});
  var weekHrs=weekRecs.reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);
  var weekBreakMins=weekRecs.reduce(function(s,r){return s+(parseInt(r.breakMins)||0);},0);
  var weekLeads=weekRecs.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var weekShifts=weekRecs.length;
  var targetHrs=settings.weeklyHoursTarget;
  var hrsRemaining=Math.max(0,targetHrs-weekHrs);
  var hrsPct=Math.min(100,Math.round(weekHrs/targetHrs*100));
  var hrsColour=mgr_hoursColour(weekHrs,weekShifts);

  var html='';
  var isWeekend=mgr_isWeekend();
  // Today pinned at top
  html+=mgr_section(va+' — Today');
  if(todayRec.length){html+=mgr_shiftCard(todayRec[0],true);}
  else if(isWeekend){html+='<div class="mgr-alert" style="background:var(--panel-2);border:1px solid var(--line-2);color:var(--muted);">🌴 <span>Weekend — no shift expected today</span></div>';}
  else{html+='<div class="mgr-alert red"><span class="dot"></span> <span>'+va+' has not submitted today</span></div>';}

  // This week hours tracker — Option C design
  var vaAccent=va==='Mera'?'#b23bff':'#f2c200';
  var vaBg=va==='Mera'?'#14101e':'#161206';
  var vaBorder=va==='Mera'?'rgba(167,139,250,0.3)':'rgba(242,193,78,0.3)';
  var now2=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
  var dayOfWeek=now2.getDay();
  var daysElapsed=dayOfWeek===0?5:dayOfWeek===6?5:Math.max(0,dayOfWeek-1);
  var proRataTarget=daysElapsed*settings.dailyHoursTarget;
  var hrsColourProRata=proRataTarget<=0?'#444':weekHrs>=proRataTarget?'#10d99a':weekHrs>=proRataTarget*0.925?'#f2c200':'#f2647f';
  var markerPct=Math.min(100,Math.round(proRataTarget/targetHrs*100));
  var weekTasksDone=weekRecs.reduce(function(s,r){return s+(parseInt(r.tasksDone)||0);},0);
  var avgTasksDay=weekShifts?Math.round(weekTasksDone/weekShifts):0;
  var weekLph=weekHrs>0?(weekLeads/weekHrs).toFixed(1):'-';
  var statusTxt=weekHrs>=targetHrs?'✓ '+targetHrs+'hr HIT':weekHrs>=proRataTarget?'✓ ON TRACK':weekHrs>=proRataTarget*0.925?'~ CLOSE':'✗ BEHIND';
  var statusCol=weekHrs>=targetHrs?'#10d99a':weekHrs>=proRataTarget?'#10d99a':weekHrs>=proRataTarget*0.925?'#f2c200':'#f2647f';
  var statusBg=weekHrs>=targetHrs?'rgba(45,212,163,0.15)':weekHrs>=proRataTarget?'rgba(45,212,163,0.1)':weekHrs>=proRataTarget*0.925?'rgba(242,193,78,0.1)':'rgba(242,100,127,0.1)';

  html+=mgr_section('⏱ This Week — Hours & Time');
  html+='<div style="border-radius:9px;overflow:hidden;border:1px solid '+vaBorder+';background:'+vaBg+';margin-bottom:10px;">';
  html+='<div style="display:grid;grid-template-columns:170px 1fr auto;align-items:center;gap:10px;padding:9px 11px;border-left:3px solid '+vaAccent+';">';
  html+='<div style="background:rgba(0,0,0,0.28);border:1px solid '+vaAccent+'2e;border-radius:8px;padding:8px 10px;">';
  html+='<div style="font-size:10px;color:'+vaAccent+';font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px;">'+va+' · Week Hours</div>';
  html+='<div style="font-family:var(--font-mono);font-size:30px;font-weight:800;color:'+vaAccent+';line-height:1;">'+weekHrs.toFixed(1)+'<span style="font-size:13px;opacity:.6;margin-left:2px;">h</span></div>';
  html+='<div style="font-size:11px;color:var(--muted);margin-top:3px;">target <b style="color:var(--text);">'+targetHrs+'h</b> · '+hrsPct+'%</div>';
  html+='</div>';
  html+='<div style="display:grid;grid-template-columns:repeat(3,minmax(58px,1fr));gap:6px;align-items:center;">';
  function whCell(lbl,val,col){ return '<div style="text-align:center;background:rgba(0,0,0,0.22);border-radius:8px;padding:8px 8px;">'
    +'<div style="font-size:10px;color:var(--muted-2);font-weight:700;letter-spacing:.8px;margin-bottom:2px;">'+lbl+'</div>'
    +'<div style="font-family:var(--font-mono);font-size:21px;font-weight:800;color:'+col+';">'+val+'</div></div>'; }
  html+=whCell('LEADS',weekLeads,'#10d99a');
  html+=whCell('L/HR',weekLph,'#38bdf8');
  html+=whCell('SHIFTS',weekShifts,vaAccent);
  html+='</div>';
  html+='<div style="background:'+statusBg+';border:1px solid '+statusCol+';border-radius:9px;padding:8px 12px;text-align:center;min-width:96px;"><div style="font-size:12px;color:'+statusCol+';font-weight:800;">'+statusTxt+'</div>'+(hrsRemaining>0?'<div style="font-size:10.5px;color:'+statusCol+';opacity:.85;margin-top:2px;">'+hrsRemaining.toFixed(1)+'h to go</div>':'')+'</div>';
  html+='</div>';
  html+='<div style="padding:0 11px 5px;">';
  html+='<div style="height:7px;background:rgba(255,255,255,0.05);border-radius:5px;position:relative;overflow:visible;">';
  html+='<div style="height:100%;width:'+hrsPct+'%;background:'+hrsColourProRata+';transition:width 0.8s ease;"></div>';
  // Pro-rata marker line
  if(proRataTarget>0&&proRataTarget<targetHrs){
    html+='<div style="position:absolute;top:0;left:'+markerPct+'%;width:2px;height:100%;background:rgba(255,255,255,0.5);"></div>';
    html+='<div style="position:absolute;top:-14px;left:'+markerPct+'%;transform:translateX(-50%);font-size:9.5px;color:var(--muted);font-weight:700;white-space:nowrap;">pace</div>';
  }
  html+='</div>';
  html+='<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted-2);padding-top:3px;"><span>0h</span><span style="color:'+hrsColourProRata+';font-weight:800;">'+hrsPct+'%</span><span>'+targetHrs+'h</span></div>';
  html+='</div>';
  html+='</div>';
  // ── NEW DAY BY DAY (approved design) ────────────────────
  html+=mgr_dayByDay(weekRecs,va,monStr);
  // Pro-rata hours: weekly target across workdays, colour by Mon-Fri elapsed
  var now2=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
  var dayOfWeek=now2.getDay();
  var daysElapsed=dayOfWeek===0?5:dayOfWeek===6?5:Math.max(0,dayOfWeek-1);
  var proRataTarget=daysElapsed*settings.dailyHoursTarget;
  var hrsColourProRata=proRataTarget<=0?'#444':weekHrs>=proRataTarget?'#10d99a':weekHrs>=proRataTarget*0.925?'#f2c200':'#f2647f';
  var todayLeads=todayRec.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);

  html+='<div class="mgr-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:8px;">'
    +mgr_tile('Week Leads',weekLeads,'this week',tileCls)
    +'<div class="mgr-tile tile-amber" style="border-color:'+hrsColourProRata+' !important;color:'+hrsColourProRata+' !important;box-shadow:0 0 0 1px '+hrsColourProRata+'22,0 8px 48px '+hrsColourProRata+'33 !important;">'
      +'<div class="mgr-tile-label">Week Hours</div>'
      +'<div class="mgr-tile-val">'+weekHrs.toFixed(1)+'<span style="font-size:12px;opacity:0.4;">h</span></div>'
      +'<div class="mgr-tile-sub">~'+proRataTarget+'h expected by now</div>'
    +'</div>'
    +(function(){
    var cls=todayLeads>0?'tile-green':isWeekend?'tile-grey':'tile-red';
    return mgr_tile("Today's Leads",todayLeads,isWeekend&&!todayLeads?'weekend — day off':'today',cls);
  }())
    +'</div>';
  html+='<div class="mgr-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:12px;">'
    +mgr_tile('Avg / Shift',avg,'leads per shift','tile-pink')
    +mgr_tile('Skips',tskip,'mandatory tasks',tskip>0?'tile-red':'tile-purple')
    +mgr_tile('Shifts Done',weekShifts,'this week','tile-lime')
    +'</div>';

  if(tskip>0){
    var sm={};recs.forEach(function(r){(r.tasks||[]).filter(function(t){return t.skipped;}).forEach(function(t){sm[t.name]=(sm[t.name]||0)+1;});});
    var se=Object.entries(sm).sort(function(a,b){return b[1]-a[1];});
    if(se.length){
      html+=mgr_section('⚑ Skipped Task Patterns');
      html+='<div style="background:rgba(242,100,127,0.05);border:1px solid rgba(242,100,127,0.15);border-radius:12px;padding:14px 18px;">';
      se.forEach(function(e){html+='<div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid rgba(242,100,127,0.08);font-size:12px;"><span style="color:#888;">'+e[0]+'</span><span style="color:#f2647f;font-weight:700;">'+e[1]+'×</span></div>';});
      html+='</div>';
    }
  }

  html+='<div class="mgr-sec2"><div><div class="s-ttl">📈 Sourcing — '+mgr_srcLabel()+'</div>'
    +'<div class="s-sub">Which tasks actually produce leads, and how many each run is worth.</div></div>'
    +'<div class="s-right">'+mgr_srcToggleHTML()+'</div></div>';
  html+=mgr_sourcing(recs,va,true);

  html+=mgr_section('All Shifts ('+recs.length+')');
  html+=mgr_shiftGroup(recs,va);

  var notes=recs.filter(function(r){return mgr_isRealNote(r.notes);});
  if(notes.length){
    var vc={Mera:'#b23bff',Suz:SUZ_COL};
    html+=mgr_section('💬 All Notes');
    html+=mgr_collapsibleNotes(notes,vc);
  }
  document.getElementById(containerId).innerHTML=html;
}

function mgr_renderIssues(){
  var reports=mgr_getReports();
  var tl={'broken-link':'Broken Link','task-unclear':'Task Unclear','technical':'Technical','missing-info':'Missing Info','other':'Other'};
  /* Was the last tab on the launch-era palette — #444 text on #0d0d1a cards, and
     "Clear ALL shift logs" sitting as a bare button on a page Jack opens most days.
     House tokens now, and the destructive dev tools live behind a fold. */
  var html='<div class="mgr-sec2" style="margin-bottom:14px;"><div>'
    +'<div class="s-ttl">Reported issues'+(reports.length?' <span style="color:var(--red)">('+reports.length+')</span>':'')+'</div>'
    +'<div class="s-sub">What the VAs flagged from their shift screens — newest first</div></div>'
    +(reports.length?'<button class="wb-btn" style="color:var(--red);border-color:rgba(242,100,127,.35)" onclick="mgr_clearIssues()">Clear all</button>':'')
    +'</div>';
  if(!reports.length){
    html+='<div style="background:var(--panel);border:1px solid var(--line);border-radius:14px;'
      +'padding:26px 20px;text-align:center;color:var(--muted);font-size:13px;">'
      +'✅ Nothing reported.<br><span style="font-size:11.5px;color:var(--muted-2)">'
      +'VAs raise these from the ⚠ buttons on their shift screen — they land here the moment they do.</span></div>';
  }
  else{
    reports.slice().reverse().forEach(function(r,i){
      var ri=reports.length-1-i;
      var vaCol=(r.va==='Mera')?'var(--mera)':(r.va==='Suz')?'var(--suz)':'var(--muted)';
      html+='<div class="issue-card" style="border-left:3px solid var(--red);">'
        +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:7px;">'
        +'<div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap;">'
        +'<span style="font-size:10px;color:var(--red);text-transform:uppercase;letter-spacing:1.2px;font-weight:800;'
        +'background:rgba(242,100,127,.1);border:1px solid rgba(242,100,127,.28);padding:3px 9px;border-radius:20px;">'+(tl[r.type]||r.type)+'</span>'
        +'<span style="font-size:11.5px;font-weight:700;color:'+vaCol+';">●&nbsp;'+escHtml(r.va||'?')+'</span>'
        +'<span style="font-size:11px;color:var(--muted-2);">'+escHtml(r.time||'')+'</span></div>'
        +'<button class="wb-btn" style="color:var(--red);border-color:rgba(242,100,127,.3);flex-shrink:0" onclick="mgr_delIssue('+ri+')">Delete</button>'
        +'</div><div style="font-size:13px;color:var(--text);line-height:1.6;">'+escHtml(r.text||'')+'</div></div>';
    });
  }
  // ── DEV TOOLS — folded: two of these delete data, they must not sit one stray
  //    click from the Delete buttons above
  html+='<details class="dev-fold"><summary>&#9881; Developer tools — resets and debug, careful in here</summary>';
  html+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:12px;">';

  function testBtn(label,fn,desc){
    return '<div style="background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:13px 15px;">'
      +'<div style="font-size:11px;color:var(--muted-2);margin-bottom:8px;line-height:1.5;">'+desc+'</div>'
      +'<button onclick="'+fn+'" style="background:rgba(155,143,255,0.1);border:1px solid rgba(155,143,255,0.3);color:#9b8fff;font-family:var(--font-mono);font-size:11px;padding:8px 14px;border-radius:7px;cursor:pointer;width:100%;">'+label+'</button>'
      +'</div>';
  }

  html+=testBtn('Reload shift history','window._shiftLog=[];window._shiftLogFull=false;mgr_syncFromDB();showToast(\'Pulling from Supabase\u2026\');','Throw away this session\'s copy of the shift history and pull it again from Supabase. Nothing is deleted anywhere.');
  html+=testBtn('Clear issues log','mgr_clearIssues()','Remove all reported issues from the issues list.');
  html+=testBtn('Force re-render','mgr_switchTab(mgr_currentTab);showToast(\'Re-rendered\');','Re-render current tab. Useful after manual localStorage edits.');
  html+=testBtn('Dump logs to console','console.log(mgr_getLog());showToast(\'Logged to console (F12)\');','Print this session\'s shift history to the browser console for inspection.');
  html+=testBtn('Test flag banner','mgr_flagBanner([]);showToast(\'Banner cleared\');','Clear the action-needed banner at top of Jack view.');

  html+='</div></details>';
  document.getElementById('mgr-issues-content').innerHTML=html;
}
function mgr_delIssue(idx){if(!confirm('Delete?'))return;try{var r=mgr_getReports();r.splice(idx,1);lsPut('shifttrack_reports',JSON.stringify(r));reportLog=r;mgr_renderIssues();showToast('Deleted');}catch(e){showToast('Error',true);}}
function mgr_clearIssues(){if(!confirm('Clear all issues?'))return;try{lsPut('shifttrack_reports','[]');reportLog=[];mgr_renderIssues();showToast('Cleared');}catch(e){showToast('Error',true);}}

function mgr_renderWeek(){
  var log=mgr_getLog(),monStr=mgr_weekStart(),sunStr=mgr_addDays(monStr,6);
  var settings=getAppSettings();
  var recs=log.filter(function(r){return mgr_dateInRange(r.date,monStr,sunStr);});
  var mRecs=recs.filter(function(r){return r.va==='Mera';});
  var sRecs=recs.filter(function(r){return r.va==='Suz';});
  var tl=recs.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var th=recs.reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);
  var mL=mRecs.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var sL=sRecs.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var mH=mRecs.reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);
  var sH=sRecs.reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);
  var html=mgr_weekNavHTML()+'<div style="font-size:10px;color:var(--muted-2);margin-bottom:12px;letter-spacing:1px;">'+monStr+' — '+sunStr+'</div>';
  // previous week for "vs last week" comparisons
  var pMon=mgr_addDays(monStr,-7), pSun=mgr_addDays(monStr,-1);
  var pRecs=log.filter(function(r){return mgr_dateInRange(r.date,pMon,pSun);});
  function _sL(rs){return rs.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);}
  function _sH(rs){return rs.reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);}
  var pL=_sL(pRecs), pmL=_sL(pRecs.filter(function(r){return r.va==='Mera';})), psL=_sL(pRecs.filter(function(r){return r.va==='Suz';})), pH=_sH(pRecs);
  function pctBadge(cur,prev){ if(!prev) return {t:'no last-wk data',tone:'off'}; var d=Math.round((cur-prev)/prev*100); return {t:(d>=0?'+':'')+d+'% vs last wk',tone:d>=0?'green':'red'}; }
  function hCmp(cur,prev){ if(!prev) return {t:'no last-wk data',tone:'off'}; var d=cur-prev; return {t:(d>=0?'+':'')+d.toFixed(1)+'h vs last wk',tone:d>=0?'green':'red'}; }
  var daysEl=Math.max(1,mgr_daysElapsedThisWeek()), dailyT=settings.dailyHoursTarget||8, wkT=settings.weeklyHoursTarget||40, nShifts=recs.length;
  // hours judged vs EXPECTED-BY-TODAY (pace), not the final weekly target — no red just for an incomplete week
  function hoursCard(label,tone,hrs){
    var expected=daysEl*dailyT, variance=hrs-expected, ratio=expected>0?hrs/expected:1;
    var badgeTone = variance>=0?'green':(ratio>=0.85?'amber':(ratio>=0.70?'amber':'red'));
    return mgr_kpi({label:label,value:hrs.toFixed(1),unit:'h',tone:tone,grad:true,
      badge:{t:(variance>=0?'+':'')+variance.toFixed(1)+'h vs pace',tone:badgeTone},
      sub:'exp <b>'+expected.toFixed(1)+'h</b> · '+Math.round(hrs/wkT*100)+'% target'});
  }
  html+='<div class="kpi-row perf-kpis" style="grid-template-columns:repeat(6,minmax(0,1fr));margin-bottom:18px;">'
    +mgr_kpi({label:'Combined leads',value:tl,tone:'cyan',grad:true,badge:pctBadge(tl,pL),sub:'<b>'+(nShifts?(tl/nShifts).toFixed(1):'0')+'</b> avg / shift'})
    +mgr_kpi({label:'Mera leads',value:mL,tone:'purple',grad:true,badge:pctBadge(mL,pmL),sub:'<b>'+(tl?Math.round(mL/tl*100):0)+'%</b> of total'})
    +mgr_kpi({label:'Suz leads',value:sL,tone:'amber',grad:true,badge:pctBadge(sL,psL),sub:'<b>'+(tl?Math.round(sL/tl*100):0)+'%</b> of total'})
    +mgr_kpi({label:'Combined hours',value:th.toFixed(1),unit:'h',tone:'cyan',grad:true,badge:hCmp(th,pH),sub:'<b>'+(nShifts?(th/nShifts).toFixed(1):'0')+'h</b> avg shift'})
    +hoursCard('Mera hours','purple',mH)
    +hoursCard('Suz hours','amber',sH)
    +'</div>';
  // top band: the day-by-day table next to the split + summary, which are about the same
  // height. The sourcing columns used to sit in the LEFT column here, so the right side ran
  // out and left a big empty gap — they're full width below now.
  html+='<div class="perf-2col">'
    +'<div class="perf-main">'+mgr_weekTable(recs,monStr,sunStr)+'</div>'
    +'<div class="perf-side">'+mgr_leadsSplitDonut(mL,sL)+mgr_weekSummary(recs)+'</div>'
  +'</div>';
  html+=mgr_section('Shifts — Mon to Fri');
  html+=mgr_weekGrid(recs,monStr);
  html+='<div class="mgr-sec2"><div><div class="s-ttl">Sourcing this week</div>'
    +'<div class="s-sub">Where each of them actually found leads, and what a run is worth.</div></div></div>';
  html+='<div class="va-split">'
    +'<div class="va-col"><div class="va-col-head" style="color:var(--mera);">'+vaDisp('Mera')+'</div>'+mgr_sourcing(recs,'Mera')+'</div>'
    +'<div class="va-col"><div class="va-col-head" style="color:var(--suz);">'+vaDisp('Suz')+'</div>'+mgr_sourcing(recs,'Suz')+'</div>'
  +'</div>';
  var realNotes=recs.filter(function(r){return mgr_isRealNote(r.notes);});
  if(realNotes.length){
    html+=mgr_section('💬 Notes This Week');
    var vc={Mera:'#b23bff',Suz:'#FFEB3B'};
    html+=mgr_collapsibleNotes(realNotes,vc);
  }
  document.getElementById('mgr-week-content').innerHTML=html;
}

function mgr_renderMTD(){
  var log=mgr_getLog(),monStr=mgr_monthStart(),today=mgr_ukToday();
  var recs=log.filter(function(r){return mgr_dateInRange(r.date,monStr,today);});
  var mr=recs.filter(function(r){return r.va==='Mera';}),sr=recs.filter(function(r){return r.va==='Suz';});
  var tl=recs.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var th=recs.reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);
  var mL=mr.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var sL=sr.reduce(function(s,r){return s+(parseInt(r.totalLeads)||0);},0);
  var mH=mr.reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);
  var sH=sr.reduce(function(s,r){return s+(parseFloat(r.hoursWorked)||0);},0);
  var mSkip=mr.reduce(function(s,r){return s+(parseInt(r.tasksSkipped)||0);},0);
  var sSkip=sr.reduce(function(s,r){return s+(parseInt(r.tasksSkipped)||0);},0);
  var mn=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
  var mname=mn.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  var html='<div style="font-size:10px;color:var(--muted-2);margin-bottom:12px;letter-spacing:1px;">'+mname+' &middot; '+monStr+' → '+today+'</div>';
  var nS=recs.length;
  function _hC(label,tone,hrs,shifts){ return mgr_kpi({label:label,value:hrs.toFixed(1),unit:'h',tone:tone,grad:true,sub:'<b>'+(shifts?(hrs/shifts).toFixed(1):'0')+'h</b> avg · '+shifts+' shifts'}); }
  html+='<div class="kpi-row perf-kpis" style="grid-template-columns:repeat(6,minmax(0,1fr));margin-bottom:18px;">'
    +mgr_kpi({label:'Month leads',value:tl,tone:'cyan',grad:true,badge:((mSkip+sSkip)>0?{t:(mSkip+sSkip)+' skips',tone:'red'}:{t:'0 skips',tone:'green'}),sub:'<b>'+(nS?(tl/nS).toFixed(1):'0')+'</b> avg / shift'})
    +mgr_kpi({label:'Mera leads',value:mL,tone:'purple',grad:true,sub:'<b>'+(tl?Math.round(mL/tl*100):0)+'%</b> of total · '+mr.length+' shifts'})
    +mgr_kpi({label:'Suz leads',value:sL,tone:'amber',grad:true,sub:'<b>'+(tl?Math.round(sL/tl*100):0)+'%</b> of total · '+sr.length+' shifts'})
    +_hC('Combined hours','cyan',th,nS)
    +_hC('Mera hours','purple',mH,mr.length)
    +_hC('Suz hours','amber',sH,sr.length)
    +'</div>';
  html+='<div class="perf-2col">'
    +'<div class="perf-main"><div class="va-split">'
      +'<div class="va-col"><div class="va-col-head" style="color:var(--mera);">'+vaDisp('Mera')+' — Sourcing</div>'+mgr_sourcing(recs,'Mera')+'</div>'
      +'<div class="va-col"><div class="va-col-head" style="color:var(--suz);">'+vaDisp('Suz')+' — Sourcing</div>'+mgr_sourcing(recs,'Suz')+'</div>'
      +'</div>'
      +'<div class="mc2-h" style="margin:16px 0 10px;">Combined — all methods</div>'+mgr_sourcing(recs,'')
    +'</div>'
    +'<div class="perf-side">'+mgr_leadsSplitDonut(mL,sL)+mgr_weekSummary(recs)+'</div>'
  +'</div>';
  var realNotes=recs.filter(function(r){return mgr_isRealNote(r.notes);});
  if(realNotes.length){
    html+=mgr_section('💬 All Notes This Month');
    var vc={Mera:'#b23bff',Suz:'#FFEB3B'};
    html+=mgr_collapsibleNotes(realNotes,vc);
  }
  html+=mgr_section('All Shifts This Month ('+recs.length+')');
  html+=mgr_shiftGroup(recs);
  document.getElementById('mgr-mtd-content').innerHTML=html;
}

var mgr_currentTab='overview';
function mgr_switchTab(tab){
  mgr_currentTab=tab;
  window._jbSendPrefs={};   // leaving a VA tab resets the mini-task composer to defaults (sticky within the tab)
  ['overview','today','mera','suz','test','issues','week','mtd','live','keepa','spend','settings','perf','filters','ticklist','storefronts','leadsdash'].forEach(function(t){
    var el=document.getElementById('mgr-tab-'+t);if(el) el.style.display='none';
    var b=document.getElementById('tab-'+t);if(b) b.classList.remove('active-tab');
  });
  var el=document.getElementById('mgr-tab-'+tab);if(el) el.style.display='block';
  var ab=document.getElementById('tab-'+tab);if(ab) ab.classList.add('active-tab');
  if(tab==='overview') mgr_renderOverview();
  if(tab==='perf')     perfShow(window._perfWhich||'week');
  if(tab==='today')    mgr_renderToday();
  if(tab==='mera')     mgr_renderVA('Mera','mgr-mera-content');
  if(tab==='suz')      mgr_renderVA('Suz','mgr-suz-content');
  if(tab==='test')     mgr_renderTest();
  if(tab==='issues')   mgr_renderIssues();
  if(tab==='week')     mgr_renderWeek();
  if(tab==='mtd')      mgr_renderMTD();
  if(tab==='live')     mgr_renderLive();
  if(tab==='keepa')    mgr_renderKeepa();
  if(tab==='spend')    mgr_renderSpend();
  if(tab==='filters')  mgr_renderFilters();
  if(tab==='leadsdash') mgr_renderLeadsDash();
  try{ tabScrollIntoView(tab); }catch(e){}
  if(tab==='ticklist') mgr_renderTicklist();
  if(tab==='storefronts') mgr_renderStorefronts();
  if(tab==='settings') mgr_renderSettings();
}
/* The recurring ticklist was buried at the bottom of Settings — it's the thing that
   decides what both VAs do every single day, so it gets its own tab. */
/* The fade edges must reflect the ACTUAL scroll position, or they're just decoration. */
/* The mobile nav wraps to a different number of rows depending on width and on which
   buttons are shown, so its height can't be a constant. Measure it and publish it as
   --navh for the sticky offsets to use. */
function stickyOffset(){
  try{
    var nav=document.querySelector('.sidebar');
    if(!nav) return;
    var h=Math.round(nav.getBoundingClientRect().height);
    if(getComputedStyle(nav).position!=='sticky' || h<=0 || h>320) h=0;
    document.documentElement.style.setProperty('--navh', h?h+'px':'0px');
  }catch(e){}
}
(function(){
  function wire(){
    if(!document.querySelector('.sidebar')) return setTimeout(wire,400);
    stickyOffset();
    window.addEventListener('resize', stickyOffset);
    setTimeout(stickyOffset,600); setTimeout(stickyOffset,1500);
  }
  wire();
})();
function tabFades(){
  try{
    var w=document.getElementById('mgr-tabs-wrap'); if(!w) return;
    var t=w.querySelector('.mgr-tabs'); if(!t) return;
    var max=t.scrollWidth-t.clientWidth;
    w.classList.toggle('more-right', max>4 && t.scrollLeft < max-4);
    w.classList.toggle('more-left',  max>4 && t.scrollLeft > 4);
  }catch(e){}
}
/* Centre the active tab in the strip. scrollIntoView loses to the container's
   scroll-snap, so position it directly. */
function tabScrollIntoView(tab){
  try{
    var b=document.getElementById('tab-'+tab); if(!b) return;
    var t=b.parentNode; if(!t||!t.classList.contains('mgr-tabs')) return;
    var max=t.scrollWidth-t.clientWidth; if(max<=4) return;
    var target=b.offsetLeft-(t.clientWidth/2)+(b.offsetWidth/2);
    target=Math.max(0,Math.min(max,target));
    if(Math.abs(target-t.scrollLeft)<6){ tabFades(); return; }
    // scrollTo({behavior:'smooth'}) silently no-ops in some engines; a plain
    // assignment always works and CSS scroll-behavior gives us the animation.
    t.scrollLeft=target;
    setTimeout(tabFades,60); setTimeout(tabFades,420);
  }catch(e){}
}
(function(){
  function wire(){
    var w=document.getElementById('mgr-tabs-wrap');
    if(!w){ return setTimeout(wire,400); }
    var t=w.querySelector('.mgr-tabs');
    if(t) t.addEventListener('scroll', tabFades, {passive:true});
    window.addEventListener('resize', tabFades);
    tabFades(); setTimeout(tabFades,400);
  }
  wire();
})();
function mgr_renderTicklist(){
  var el=document.getElementById('mgr-ticklist-content'); if(!el) return;
  var y=(document.getElementById('mgr-tab-ticklist')||{}).style&&document.getElementById('mgr-tab-ticklist').style.display!=='none'
        ?(window.pageYOffset||0):0;
  el.innerHTML='<div class="tkl-intro">'
    +'<div class="tkl-h">🗂️ Recurring Ticklist</div>'
    +'<div class="tkl-p">The permanent tasks Mera &amp; Suz get at the start of <b>every</b> shift, in this order. '
      +'Attach saved filters to a task and they arrive pre-loaded as named link rows the VA just opens and logs against.<br>'
      +'One-off / today-only work goes in the <b>From Jack</b> box on the Mera &amp; Suz tabs instead.</div>'
    +'</div>'
    + mgr_taskSettingsHTML(getAppSettings(),true);
  if(y) requestAnimationFrame(function(){ window.scrollTo(0,y); });
}
