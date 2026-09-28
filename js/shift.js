// ── NAVIGATION ───────────────────────────────────────────
/* ══ SHE MUST NEVER BE DUMPED BACK ON THE LOGIN SCREEN ══════════════════════
   31/08, Suz: "sir back to start again 😭 ... i wanted to go to my next filter
   then IT bring me back to shift start again."
   The event log settles what happened: NINE separate page loads in one shift
   (each load stamps a fresh tab id) — 00:39, 01:41, 02:47, 03:07, 03:27, 03:39,
   06:31, 07:40, 07:58. Her browser is reloading the tab (Chrome discards a
   background tab under memory pressure; a 1.8MB page in a laptop full of Keepa
   tabs is a prime candidate). Her shift was never ended and never lost — the
   timer picks straight up each time (52m → 52m → 62m …). But every reload put
   her on "Who's starting their shift?", which reads as "my whole shift is gone",
   and she had to find her own way back. The gaps between loads add up to ~1h 47m
   of her day spent off the clock.
   So: if this device is holding a live shift, restore it WITHOUT showing the
   login screen at all. Only End Shift ends a shift. */
function liveLocalShift(){
  try{
    var best=null;
    ['Mera','Suz'].forEach(function(va){
      var d=null; try{ d=localDraft(va); }catch(e){}
      if(!d || d.submitted) return;
      if(!(d.elapsedMs>0) && !d.shiftStart) return;
      var age=Date.now()-(d.savedAt||0);
      if(age>DRAFT_MAX_AGE_MS) return;
      if(!best || (d.savedAt||0)>(best.savedAt||0)) best={va:va,draft:d,savedAt:d.savedAt||0};
    });
    return best;
  }catch(e){ return null; }
}
/* the login screen must offer the way back too — belt and braces if the
   auto-restore above ever cannot run (Jack: "if they press login again they can
   restore her shift as she didn't mean to end it as it was a bug") */
function loginRestoreBanner(){
  try{
    var live=liveLocalShift();
    var old=document.getElementById('login-restore'); if(old) old.remove();
    if(!live) return;
    var m=Math.max(1,Math.round((live.draft.elapsedMs||0)/60000));
    var t=(m>=60?(Math.floor(m/60)+'h '+(m%60)+'m'):(m+' min'));
    var host=document.getElementById('login-screen'); if(!host) return;
    var d=document.createElement('div');
    d.id='login-restore'; d.className='login-restore';
    d.innerHTML='<b>'+escHtml(vaDisp(live.va))+", you're still on shift \u2014 "+t+' logged.</b>'
      +'<span>You were signed out by the page reloading, not by ending your shift. Nothing is lost.</span>'
      +'<button onclick="selectVA(\''+live.va+'\')">\u21ba Back into my shift</button>';
    host.insertBefore(d,host.firstChild);
  }catch(e){}
}
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  try{ loginRestoreBanner(); }catch(e){}
  document.getElementById('mera-setup').style.display = 'none';
  document.getElementById('suz-setup').style.display = 'none';
  document.getElementById('shift-screen').style.display = 'none';
  document.getElementById('view-va').classList.remove('setup-active');
}
function showVAView() {
  document.getElementById('view-manager').classList.remove('active');
  var lv=document.getElementById('view-leads'); if(lv) lv.classList.remove('active');
  document.getElementById('view-va').classList.add('active');
  // THE v178 BLACK SCREEN, ROOT CAUSE: Sarah's page hides #login-screen with an inline
  // display:none, and for anyone who hasn't picked a VA yet the login screen IS the VA
  // view's only content. Coming back from the import page made view-va active — an
  // active but completely EMPTY view, which the "is any .view active?" watchdog
  // rightly ignored. If no shift is running and no setup form is open, the login
  // screen must come back.
  try{
    var ls=document.getElementById('login-screen');
    var setupOpen=['mera-setup','suz-setup'].some(function(id){
      var el=document.getElementById(id); return el && el.style.display==='block';
    });
    var shiftUp=!!(window.state && state.shiftStart);
    // …but it must be EXCLUSIVE with the shift screen. This only ever set the login
    // screen visible and never hid #shift-screen, so a running shift could end up
    // rendered directly beneath "Who's starting their shift?" — both on screen at once.
    var ss=document.getElementById('shift-screen');
    if(shiftUp||setupOpen){
      if(ls) ls.style.display='none';
    }else{
      if(ls) ls.style.display='flex';
      if(ss) ss.style.display='none';
    }
  }catch(e){}
  updateNavBtn();
}
function _openManager(){
  document.getElementById('view-va').classList.remove('active');
  var lv=document.getElementById('view-leads'); if(lv) lv.classList.remove('active');
  document.getElementById('view-manager').classList.add('active');
  document.getElementById('dash-date').textContent = ukDateString();
  updateNavBtn();
  renderManagerLog();
}
function _openLeads(){
  try{ loadLeadsFromDB(); }catch(e){}
  document.getElementById('view-va').classList.remove('active');
  document.getElementById('view-manager').classList.remove('active');
  var lv=document.getElementById('view-leads'); if(lv) lv.classList.add('active');
  updateNavBtn();
  try{ if(typeof renderList==='function') renderList(); }catch(e){}
}
/* Open the leads list on the SAME 30 days the dashboard tiles counted. A tile that
   says 437 and then drops him into a list of 842 is the mismatch that makes him
   distrust both numbers. */
function showLeadsWindow(){
  showLeadsView();
  var tries=0;
  (function apply(){
    var sel=document.getElementById('f-date');
    var lv=document.getElementById('view-leads');
    if(!sel||!lv||!lv.classList.contains('active')){ if(++tries<30) setTimeout(apply,120); return; }
    if(sel.value!=='30d'){ sel.value='30d'; try{ fDateChange(); }catch(e){} }
  })();
}
function showLeadsView(){
  var lv=document.getElementById('view-leads');
  if(lv&&lv.classList.contains('active')) return;
  if(window._mgrUnlocked){ _openLeads(); }
  else { window._pinTarget='leads'; unlockManager(); }
}
/* Autosave chip. It used to stamp green synchronously, BEFORE the request had
   even been sent — so it reported success during a total outage. It now waits for
   the real verdict and goes red, with the time of the last save that actually
   landed, when the cloud can't be reached. */
(function(){
  function hook(){
    var _s=window.saveShiftDraft;
    if(typeof _s!=='function'){ return setTimeout(hook,500); }
    window.saveShiftDraft=function(manual){
      var r=_s.apply(this,arguments);
      function stamp(ok){
        try{
          var c=document.getElementById('autosave-chip');
          if(!(c&&window.state&&state.currentVA&&state.currentVA!=='Test'&&!state.submitted)) return;
          var now=new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'});
          c.style.display='inline-flex';
          if(ok){
            window._lastGoodSave=now;
            c.classList.remove('as-bad');
            c.innerHTML='&#10003; '+(manual?'Saved':'Auto-saved')+' '+now;
          } else {
            c.classList.add('as-bad');
            c.innerHTML='&#9888; Not saved'+(window._lastGoodSave?' since '+window._lastGoodSave:'');
          }
        }catch(e){}
      }
      if(r&&typeof r.then==='function'){
        r.then(function(ok){ if(ok===null) return; stamp(!!ok); })
         .catch(function(){ stamp(false); });
      }
      return r;
    };
  }
  hook();
})();
function setLayoutPref(v){
  lsPut('st_layout',v);
  applyLayoutPref();
  document.querySelectorAll('#cz-layout button').forEach(function(b){b.classList.toggle('on',b.dataset.v===v);});
  showToast(v==='mobile'?'\uD83D\uDCF1 Mobile layout on':'\uD83D\uDCBB Auto layout (fits your screen)');
}
function applyLayoutPref(){
  var v=lsGet('st_layout')||'auto';
  document.documentElement.classList.toggle('force-mobile',v==='mobile');
  document.querySelectorAll('#cz-layout button').forEach(function(b){b.classList.toggle('on',b.dataset.v===v);});
}
setTimeout(applyLayoutPref,200);
function updateRoleUI(){
  var on=!!window._mgrUnlocked;
  var t=document.getElementById('va-card-test'); if(t) t.style.display=on?'flex':'none';
  var l=document.getElementById('jack-lock'); if(l) l.style.display=on?'flex':'none';
  var lb=document.getElementById('side-leads-badge'); if(lb&&!on) lb.style.display='none';   // VAs never see the leads backlog count
  var lbtn=document.getElementById('side-leads'); if(lbtn) lbtn.style.display=on?'':'none';   // Leads review is Jack-only — hide the whole button for VAs
}
function lockJackMode(){
  window._mgrUnlocked=false; window._pinTarget=null;
  try{ lsDrop('bdl_jack_unlocked'); }catch(e){}   // forget the login
  updateRoleUI(); showVAView(); showToast('Jack mode locked \u2713');
}
// stay-logged-in: restore Jack mode on load if he unlocked before and never locked
try{ if(lsGet('bdl_jack_unlocked')==='1'){ window._mgrUnlocked=true; } }catch(e){}
/* Monday summary: first app open on/after Monday sends last week's recap to Discord */
// weekly VA-A/VA-S spend for a GB date range \u2014 same sheet/columns/logic as the Spend Dashboard
async function spendForRangeGB(fromGB,toGB){
  try{
    function pGB(s){var p=String(s).split('/');return new Date(+p[2],+p[1]-1,+p[0]);}
    var f=pGB(fromGB), t=pGB(toGB);
    // A Mon–Sun week can straddle a quarter (29 Sep–5 Oct, 31 Dec–1 Jan, 31 Mar–1 Apr,
    // 30 Jun–1 Jul). Reading only the START quarter's tab silently dropped the days that
    // landed in the next one, understating that week's spend.
    var qF=Math.floor(f.getMonth()/3)+1, qT=Math.floor(t.getMonth()/3)+1;
    var tabs=[]; for(var qq=qF;qq<=qT;qq++) tabs.push('Q'+qq+' AMZ - OA');
    if(qT<qF) tabs=['Q'+qF+' AMZ - OA'];                 // range crosses a year — keep it simple
    var ck=fromGB+'|'+toGB;
    if(window._wkSpendCache&&window._wkSpendCache.k===ck) return window._wkSpendCache.v;
    var vals=[];
    for(var ti=0;ti<tabs.length;ti++){
      var r=await fetchT('https://sheets.googleapis.com/v4/spreadsheets/'+SPEND_SHEET_ID+'/values/'+encodeURIComponent(tabs[ti]+'!A2:O2000')+'?key='+SPEND_API_KEY);
      if(!r.ok){ if(ti===0) return null; continue; }     // a later quarter's tab may not exist yet
      vals=vals.concat((await r.json()).values||[]);
    }
    var st; try{st=getAppSettings();}catch(e){st={};}
    function plist(v,d){return String(v||d).split(',').map(function(x){return x.trim().toLowerCase();}).filter(Boolean);}
    var lowA=plist(st.spendProvA,'VA-A'), lowS=plist(st.spendProvS,'VA-S');
    var A={spend:0,units:0}, S={spend:0,units:0};
    vals.forEach(function(row){
      if(!row||row.length<=14) return;
      var ds=String(row[0]||'').trim(), prov=String(row[12]||'').trim().toLowerCase();
      var sp=parseFloat(String(row[14]||'').replace(/[\u00a3,\s]/g,'')); var qty=parseInt(String(row[6]||'').replace(/[,\s]/g,''))||1;
      if(!ds||!prov||isNaN(sp)||sp<=0) return;
      var p=ds.split('/'); if(p.length!==3) return; var d=new Date(+p[2],+p[1]-1,+p[0]);
      if(isNaN(d.getTime())||d<f||d>t) return;
      if(lowA.indexOf(prov)>=0){A.spend+=sp;A.units+=qty;}
      if(lowS.indexOf(prov)>=0){S.spend+=sp;S.units+=qty;}
    });
    var v={A:A,S:S,total:A.spend+S.spend};
    window._wkSpendCache={k:ck,v:v};
    return v;
  }catch(e){ return null; }
}
// \u2500\u2500 WEEKLY REVIEW \u2014 fuller field-based embeds, one message per VA + overview \u2500\u2500
async function buildWeeklyEmbeds(monX,sunX,log,opts){
  opts=opts||{};
  var settings=getAppSettings();
  var target=settings.weeklyHoursTarget||40;
  var today=mgr_ukToday();
  var money=function(n){return '\u00a3'+Math.round(n).toLocaleString();};
  function hexInt(h){ try{return parseInt(String(h).replace('#',''),16);}catch(e){return 9133311;} }
  function vaStats(recs){
    var hrs=recs.reduce(function(x,r){return x+(parseFloat(r.hoursWorked)||0);},0);
    var lds=recs.reduce(function(x,r){return x+(parseInt(r.totalLeads)||0);},0);
    var byDay={}; recs.forEach(function(r){ byDay[r.date]=(byDay[r.date]||0)+(parseInt(r.totalLeads)||0); });
    var bestD=null,bestN=-1; Object.keys(byDay).forEach(function(d){ if(byDay[d]>bestN){bestN=byDay[d];bestD=d;} });
    return {recs:recs,hrs:hrs,lds:lds,shifts:recs.length,bestD:bestD,bestN:bestN,
      todayRec:recs.filter(function(r){return r.date===today;})[0]||null};
  }
  var M=vaStats(log.filter(function(r){return r.va==='Mera';}));
  var S=vaStats(log.filter(function(r){return r.va==='Suz';}));
  // previous week for deltas
  var pMon=mgr_addDays(monX,-7), pSun=mgr_addDays(monX,-1);
  var pLog=mgr_getLog().filter(function(r){return r.va!=='Test'&&mgr_dateInRange(r.date,pMon,pSun);});
  function sumL(rs){return rs.reduce(function(x,r){return x+(parseInt(r.totalLeads)||0);},0);}
  var pM=sumL(pLog.filter(function(r){return r.va==='Mera';})), pS=sumL(pLog.filter(function(r){return r.va==='Suz';})), pT=pM+pS;
  function delta(cur,prev){ if(!prev) return 'no last-wk data'; var d=Math.round((cur-prev)/prev*100); return (d>=0?'\u2191 +':'\u2193 ')+d+'% vs last wk'; }
  // buy-rate from the leads DB (if loaded) \u2014 leads dated within the week
  function buyStats(vaCode){
    try{
      var ls=(window.leads||[]).filter(function(l){ if(vaCode&&l.va!==vaCode) return false; var p=(l.date||'').split('/'); if(p.length!==3) return false; return mgr_dateInRange(l.date,monX,sunX); });
      var dec=ls.filter(function(l){return l.islead!==null;}), b=ls.filter(function(l){return l.status==='bought';});
      return dec.length?{rate:Math.round(b.length/dec.length*100),b:b.length,d:dec.length}:null;
    }catch(e){ return null; }
  }
  var wkSpend=await spendForRangeGB(monX,sunX);
  var totH=M.hrs+S.hrs, totL=M.lds+S.lds, totShifts=M.shifts+S.shifts;
  var combShort=(target*2)-totH;
  var bestAll=(M.bestN>=S.bestN)?M:S;
  var issues=[];
  ['Mera','Suz'].forEach(function(va){ var st=va==='Mera'?M:S;
    if(opts.current){ if(!st.todayRec) issues.push(vaDisp(va)+' not submitted yet'); }
    else { if(st.shifts===0) issues.push(vaDisp(va)+' logged no shifts'); } });
  var cBuy=buyStats(null);
  var mainFields=[
    {name:'\u{1F4C8} Leads', value:'**'+totL+'**\n'+delta(totL,pT), inline:true},
    {name:'\u23f1 Hours', value:'**'+totH.toFixed(1)+'h** / '+(target*2)+'h\n'+(combShort<=0?'\u2705 target hit':combShort.toFixed(1)+'h behind'), inline:true},
    {name:'\u26a1 Rate', value:'**'+(totH>0?(totL/totH).toFixed(1):'0')+'** leads/hr\n'+(totShifts?(totL/totShifts).toFixed(1):'0')+' per shift', inline:true}
  ];
  if(wkSpend) mainFields.push({name:'\u{1F4B7} Spend this week', value:'**'+money(wkSpend.total)+'**\n'+vaDisp('Mera')+' '+money(wkSpend.A.spend)+' \u00b7 '+vaDisp('Suz')+' '+money(wkSpend.S.spend), inline:true});
  if(bestAll.bestD) mainFields.push({name:'\u{1F3C6} Best day', value:'**'+bestAll.bestD.slice(0,5)+'** \u2014 '+bestAll.bestN+' leads ('+(bestAll===M?vaDisp('Mera'):vaDisp('Suz'))+')', inline:true});
  if(cBuy) mainFields.push({name:'\u{1F3AF} Buy rate', value:'**'+cBuy.rate+'%** \u2014 '+cBuy.b+' of '+cBuy.d+' decided', inline:true});
  // headline the thing that matters, then show the shape of the week at a glance
  var hoursTarget=target*2, onTrack=combShort<=0;
  var lead=onTrack
    ? '\u2705 **'+totL+' leads** this week \u2014 hours target hit'
    : '\u{1F7E0} **'+totL+' leads** this week \u2014 **'+combShort.toFixed(1)+'h** behind on hours';
  // Mon→Sun lead totals for the sparkline, both VAs combined
  var dayTot=(function(){
    var out=[];
    for(var i=0;i<7;i++){
      var d=mgr_addDays(monX,i);
      out.push(log.filter(function(r){ return r.date===d; })
                  .reduce(function(a,r){ return a+(parseInt(r.totalLeads)||0); },0));
    }
    return out;
  })();
  var mDay=Math.max.apply(null,dayTot.concat([1]));
  var spark=dayTot.map(function(n){ var lv=Math.round((n/mDay)*7); return '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588'.charAt(Math.max(0,Math.min(7,lv))); }).join('');
  /* Same verdict as the EOD embed (Jack, on the bars: "looks like it's broken") — the
     dcBar lines rendered as broken grey rectangles AND duplicated mainFields, which were
     built above and then never attached to the message at all. The description keeps the
     story (headline, shape of the week, split, problems); numbers live in real fields. */
  var mainDesc=lead
    +'   '+delta(totL,pT)
    +(spark?'\n\n`'+spark+'`  Mon \u2192 Sun':'')
    +'\n\n'+(vaDisp('Mera')+': **'+M.lds+'**  \u00b7  '+vaDisp('Suz')+': **'+S.lds+'**')
    +(issues.length?'\n\n\u26a0\ufe0f **'+issues.join(' \u00b7 ')+'**':'');
  var main={
    author:{name:(opts.label||'Weekly VA Review')},
    title:'\u{1F4CA} '+monX+' \u2192 '+sunX+(opts.test?'  \u00b7 TEST':''),
    color: onTrack?3066993:9133311,
    description:mainDesc,
    fields:mainFields,
    footer:{text:'BDL VA HQ \u00b7 weekly review'},
    timestamp:new Date().toISOString()
  };
  function vaMsg(vaName,st,prevL,spendLine){
    var col=hexInt(vaColour(vaName));
    var short=target-st.hrs;
    var goalWk=(function(){ try{ return (vaGoal(vaName)||12)*5; }catch(e){ return 60; } })();
    var vb=buyStats(vaName==='Mera'?'VA M':'VA S');
    var fields=[
      {name:'\u{1F4C8} Leads', value:'**'+st.lds+'**\n'+delta(st.lds,prevL), inline:true},
      {name:'\u23f1 Hours', value:'**'+st.hrs.toFixed(1)+'h** / '+target+'h\n'+(short<=0?'\u2705 target hit':short.toFixed(1)+'h behind'), inline:true},
      {name:'\u{1F4CB} Shifts', value:'**'+st.shifts+'**\n'+(st.shifts?Math.round(st.lds/st.shifts)+' leads/shift \u00b7 '+(st.hrs>0?(st.lds/st.hrs).toFixed(1):'0')+'/hr':'\u2014'), inline:true}
    ];
    if(st.bestD) fields.push({name:'\u{1F3C6} Best day', value:'**'+st.bestD.slice(0,5)+'** \u2014 '+st.bestN+' leads', inline:true});
    if(spendLine) fields.push(spendLine);
    if(vb) fields.push({name:'\u{1F3AF} Buy rate', value:'**'+vb.rate+'%** \u2014 '+vb.b+' of '+vb.d, inline:true});
    var statusTxt = opts.current ? (st.todayRec?'\u2705 Submitted '+(st.todayRec.submittedAt||'today'):'\u274c Not submitted yet')
                                 : (st.shifts===0?'\u274c No shifts logged this week':(short<=0?'\u2705 Hours target hit':'\u{1F7E1} '+short.toFixed(1)+'h short of target'));
    var goalTxt=(st.lds>=goalWk?'\u2705 hit the '+goalWk+'-lead week':((goalWk-st.lds)+' short of the '+goalWk+'-lead week'));
    var vaDesc=statusTxt+'\n'+goalTxt+'   '+delta(st.lds,prevL);
    return { embeds:[{ author:{name:vaDisp(vaName)+' \u00b7 week in review'},
      title:(vaName==='Mera'?'\u{1F7E3} ':'\u{1F7E1} ')+vaDisp(vaName)+' \u2014 '+st.lds+' leads',
      color:col, description:vaDesc, fields:fields.filter(Boolean), footer:{text:'w/c '+monX}, timestamp:new Date().toISOString() }] };
  }
  var mainMsg={embeds:[main]};
  if(settings.discordUserId) mainMsg.content='<@'+settings.discordUserId+'>';
  return [ mainMsg,
    vaMsg('Mera',M,pM, wkSpend?{name:'\u{1F4B7} Spend this week', value:'**'+money(wkSpend.A.spend)+'**'+(wkSpend.A.units?' \u00b7 '+wkSpend.A.units+' units':''), inline:true}:null),
    vaMsg('Suz',S,pS, wkSpend?{name:'\u{1F4B7} Spend this week', value:'**'+money(wkSpend.S.spend)+'**'+(wkSpend.S.units?' \u00b7 '+wkSpend.S.units+' units':''), inline:true}:null) ];
}
// post the 3 weekly messages in order (overview \u2192 Mera \u2192 Suz)
async function postWeeklyMessages(hook,msgs){
  if(IS_PREVIEW) return;
  var last=null;
  for(var i=0;i<msgs.length;i++){
    last=await fetch(hook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(msgs[i])});
    await new Promise(function(res){setTimeout(res,450);});
  }
  return last;
}
function buildWeeklySummaryPayload(monX,sunX,log,isTest){
  return buildWeeklyEmbeds(monX,sunX,log,{label:'Weekly VA Review',current:false,test:!!isTest});
}
// pull BOTH VAs' shifts for a date range straight from the cloud, whichever device we're on
function weeklyTeamLog(fromGB,toGB){
  if(!DB_ENABLED) return Promise.resolve(null);
  return db_loadAll().then(function(rows){
    if(!rows||!rows.length) return null;
    return rows.filter(function(r){ return r&&r.va!=='Test'&&mgr_dateInRange(r.date,fromGB,toGB); });
  }).catch(function(){ return null; });
}
function maybeSendWeeklySummary(){
  try{
    if(typeof IS_PREVIEW!=='undefined' && IS_PREVIEW) return;   // v51.2: a preview must never write the "sent" flag or post
    if(typeof DISCORD_WEEKLY_WEBHOOK==='undefined'||!DISCORD_WEEKLY_WEBHOOK) return;
    var monThis=mgr_weekStart();
    if(lsGet('st_weekly_summary_sent')===monThis) return;
    var monLast=mgr_addDays(monThis,-7), sunLast=mgr_addDays(monThis,-1);
    var log=mgr_getLog().filter(function(r){return r.va!=='Test'&&mgr_dateInRange(r.date,monLast,sunLast);});
    if(!log.length){
      /* v50.9: the history is memory-only now and may not be in yet 12s after load (a VA
         who hasn't logged in, Jack's sync still running). Look again every minute for
         half an hour instead of giving up — the cross-device flag below still means only
         one device ever sends. */
      if((window._wsTries=(window._wsTries||0)+1)<=30) setTimeout(maybeSendWeeklySummary,60000);
      return;
    }
    lsPut('st_weekly_summary_sent',monThis);
    // cross-device dedupe: only the device that wins the flag insert sends
    fetch(SUPABASE_URL+'/rest/v1/app_flags',{method:'POST',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=representation'},
      body:JSON.stringify({k:'weekly_'+monThis.replace(/\//g,'-'),v:'sent'})})
      .then(function(r){ return r.json(); })
      .then(function(rows){
        if(Array.isArray(rows)&&rows.length===0) return; // another device already sent
        // Always build from the FULL team dataset. A VA's device only has its OWN shifts in
        // localStorage (only Jack's mgr_syncFromDB replaces it), and a VA usually opens the
        // app first on a Monday — so it was winning the flag and sending a review that
        // showed the other VA as 0 shifts / 0 leads.
        weeklyTeamLog(monLast,sunLast).then(function(fullLog){
          buildWeeklySummaryPayload(monLast,sunLast,fullLog&&fullLog.length?fullLog:log,false)
            .then(function(msgs){ postWeeklyMessages(DISCORD_WEEKLY_WEBHOOK,msgs); });
        });
      })
      .catch(function(){ // Supabase unreachable → fall back to local-only guard
        buildWeeklySummaryPayload(monLast,sunLast,log,false).then(function(msgs){ postWeeklyMessages(DISCORD_WEEKLY_WEBHOOK,msgs); });
      });
  }catch(e){}
}
function sendWeeklySummaryTest(){
  try{
    if(!DISCORD_WEEKLY_WEBHOOK){ showToast('Weekly webhook is off / not set', true); return; }
    var monThis=mgr_weekStart();
    var monLast=mgr_addDays(monThis,-7), sunLast=mgr_addDays(monThis,-1);
    var log=mgr_getLog().filter(function(r){return r.va!=='Test'&&mgr_dateInRange(r.date,monLast,sunLast);});
    var monX=monLast, sunX=sunLast;
    if(!log.length){ // fall back to this week so far so the test always shows something
      monX=monThis; sunX=mgr_addDays(monThis,6);
      log=mgr_getLog().filter(function(r){return r.va!=='Test'&&mgr_dateInRange(r.date,monX,sunX);});
    }
    if(!log.length){ showToast('No shift data to summarise yet', true); return; }
    showToast('Building weekly review\u2026');
    buildWeeklySummaryPayload(monX,sunX,log,true)
      .then(function(msgs){ return postWeeklyMessages(DISCORD_WEEKLY_WEBHOOK,msgs); })
      .then(function(r){ showToast(r&&r.ok?'Test review sent (3 messages) \u2713 check Discord':'Discord rejected it', !(r&&r.ok)); });
  }catch(e){}
}
setTimeout(function(){ try{ updateRoleUI(); }catch(e){} }, 300);
// remembered Jack login → open straight into Jack view (no PIN), unless a shift is already running
setTimeout(function(){ try{ if(window._mgrUnlocked && (!window.state||!state.shiftStart) && typeof _openManager==='function'){ _openManager(); } }catch(e){} }, 350);
setTimeout(maybeSendWeeklySummary, 12000);
function openTestPicker(){ var m=document.getElementById('test-modal'); if(m) m.classList.add('open'); }
/* Jack pokes at a Test shift to see what his VAs see — and had no way out except
   finishing or submitting it, neither of which he wants. A preview must be leavable.
   Nothing is written: the Test VA never syncs, so dropping it costs nothing. */
function exitTestPreview(){
  try{
    if(!confirm('Leave the preview and go back to your dashboard?\n\nNothing from this test shift is kept.')) return;
    try{ if(window._sfTick){ clearInterval(window._sfTick); window._sfTick=null; } }catch(e){}
    try{ lsDrop('shifttrack_draft_Test'); }catch(e){}
    state.shiftStart=null; state._trueStart=null; state.currentVA=null; state.tasks=[]; state.extraTasks=[];
    state.storefronts=[]; state._previewAs=null; state.submitted=false;
    var b=document.getElementById('preview-exit'); if(b) b.style.display='none';
    var ls=document.getElementById('login-screen'); if(ls) ls.style.display='flex';
    ['mera-setup','suz-setup'].forEach(function(id){ var e=document.getElementById(id); if(e) e.style.display='none'; });
    try{ document.getElementById('view-va').classList.remove('setup-active'); }catch(e){}
    if(window._mgrUnlocked){ try{ _openManager(); }catch(e){} } else { try{ showVAView(); }catch(e){} }
    showToast('Preview closed \u2014 nothing was saved');
  }catch(e){ location.reload(); }
}
function startTestPreview(previewVA){
  var m=document.getElementById('test-modal'); if(m) m.classList.remove('open');
  startShift('Test', false, previewVA);
}
function toggleSidebar(){
  var sh=document.querySelector('.app-shell');
  sh.classList.toggle('side-min');
  try{ lsPut('st_sidemin', sh.classList.contains('side-min')?'1':'0'); }catch(e){}
}
(function(){ try{ document.querySelector('.app-shell').classList.remove('side-min'); lsDrop('st_sidemin'); }catch(e){} })();
function openJackSettings(){
  try{ closeCustomise(); }catch(e){}
  if(window._mgrUnlocked){ _openManager(); mgr_switchTab('settings'); }
  else { window._pinTarget='settings'; unlockManager(); }
}
function unlockManager() {
  var modal=document.getElementById('manager-pin-modal');
  var input=document.getElementById('manager-pin-input');
  if(input) input.value='';
  if(modal) modal.classList.add('open');
  setTimeout(function(){ if(input) input.focus(); },50);
}
function closeManagerPinModal(){
  var modal=document.getElementById('manager-pin-modal');
  if(modal) modal.classList.remove('open');
}
function attemptManagerUnlock(){
  var input=document.getElementById('manager-pin-input');
  var pin=input?input.value.trim():'';
  if (pin === getAppSettings().managerPin) {
    window._mgrUnlocked=true;
    try{ lsPut('bdl_jack_unlocked','1'); }catch(e){}   // stay logged in as Jack (until he taps lock)
    try{ updateRoleUI(); }catch(e){}
    closeManagerPinModal();
    if(window._pinTarget==='leads'){ window._pinTarget=null; _openLeads(); return; }
    if(window._pinTarget==='settings'){ window._pinTarget=null; _openManager(); mgr_switchTab('settings'); return; }
    _openManager();
  } else {
    showToast('Incorrect PIN', true);
    if(input) { input.value=''; input.focus(); input.classList.add('shake'); setTimeout(function(){input.classList.remove('shake');},450); }
  }
}
/* We couldn't tell whether this VA has work saved. Never guess — ask. */
function draftCheckFailed(va){
  var d=document.createElement('div');
  d.id='draft-fail';
  d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;z-index:1000;padding:22px;';
  d.innerHTML='<div style="max-width:460px;background:var(--panel);border:1px solid var(--line-2);border-left:4px solid var(--red);border-radius:16px;padding:24px 26px;">'
    +'<div style="font-family:var(--font-head);font-size:21px;font-weight:800;color:var(--text);margin-bottom:8px;">Can\'t reach the server</div>'
    +'<div style="font-size:13.5px;color:var(--muted);line-height:1.6;margin-bottom:18px;">We couldn\'t check whether you have a shift already in progress. '
      +'<b style="color:var(--text)">If you started work earlier today, do not start a fresh shift</b> &mdash; it would replace what you already logged. '
      +'Get back online and press Retry.</div>'
    +'<div style="display:flex;gap:9px;flex-wrap:wrap;">'
      +'<button class="btn btn-success" onclick="draftRetry(\''+va+'\')">Retry</button>'
      +'<button class="btn btn-ghost" onclick="draftBackToLogin()">Back</button>'
      +'<button class="btn btn-ghost" style="color:var(--red);border-color:color-mix(in srgb,var(--red) 40%,transparent);" onclick="draftStartFresh(\''+va+'\')">Start fresh anyway</button>'
    +'</div></div>';
  document.body.appendChild(d);
}
function draftRetry(va){ var d=document.getElementById('draft-fail'); if(d) d.remove(); selectVA(va); }
function draftBackToLogin(){
  var d=document.getElementById('draft-fail'); if(d) d.remove();
  var l=document.getElementById('login-screen'); if(l) l.style.display='';
}
function draftStartFresh(va){
  if(!confirm('Start a brand-new shift for '+va+'?\n\nIf there was work saved earlier today it may be replaced. Only do this if you are sure you haven\'t started yet.')) return;
  var d=document.getElementById('draft-fail'); if(d) d.remove();
  window._draftForceFresh=true;
  var l=document.getElementById('login-screen'); if(l) l.style.display='none';
  var setup=document.getElementById(va==='Suz'?'suz-setup':'mera-setup'); if(setup) setup.style.display='block';
  try{ document.getElementById('view-va').classList.add('setup-active'); }catch(e){}
}
/* ── YESTERDAY HAS TO BE CLOSED BEFORE TODAY OPENS ──────────────────────────
   Jack, 03/09: "on her next day tho if she didn't press submit that's what she
   should be doing before starting a new shift."
   It happened for real on 02/09: Mera worked 7h18m, put 16 leads on her sheet and
   simply shut the app — no clock_out, no submit. Nobody knew until he asked why her
   tab looked empty, and her week is a full day short. Nothing stopped her opening a
   fresh shift the next morning on top of it.
   The event log already holds the answer, so this asks for nothing she has to
   remember: it finds the most recent day she clocked in, never submitted, and shows
   what the log says she worked. She confirms, it submits, then today starts. */
function seDayKeysBack(days){
  var out=[];
  for(var i=1;i<=days;i++){
    var d=new Date(); d.setDate(d.getDate()-i);
    out.push(String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear());
  }
  return out;
}
/* the newest earlier day with a clock-in and no submitted shift record */
function findUnclosedShift(va){
  /* v50.9: the "already submitted" dates come from Supabase now, not a browser copy */
  return vaHistLoad(va).then(function(){ return _findUnclosedShift(va); }, function(){ return _findUnclosedShift(va); });
}
function _findUnclosedShift(va){
  try{
    if(!seEnabled || !seEnabled()) return Promise.resolve(null);
    var days=seDayKeysBack(5);
    var submitted={};
    try{ (mgr_getLog()||[]).forEach(function(r){ if(r&&r.va===va) submitted[r.date]=1; }); }catch(e){}
    var todo=days.filter(function(d){ return !submitted[d]; });
    if(!todo.length) return Promise.resolve(null);
    var i=0;
    function step(){
      if(i>=todo.length) return Promise.resolve(null);
      var day=todo[i++];
      return seFetch(va,day).then(function(evts){
        if(!evts||!evts.length) return step();
        /* seCompute runs the clock to NOW when there is no clock_out — right for a
           shift happening this second, badly wrong for a past day: Mera's 02/09 came
           back as 2,086 minutes (34h) because it counted every hour since. For a day
           already gone, the last event IS the end of the shift. */
        var lastMs=0;
        evts.forEach(function(e){ var t=+e.client_ms||0; if(t>lastMs) lastMs=t; });
        var c=seCompute(evts, lastMs||Date.now());
        if(c.clockIn===null) return step();
        if(c.clockedMs < 20*60000) return step();          // a couple of minutes is not a shift
        if(c.clockedMs > 16*3600000) return step();        // nonsense — don't ask her about it
        return { day:day, clockedMs:c.clockedMs, breakMs:c.breakMs, clockIn:c.clockIn, clockOut:c.clockOut||lastMs };
      });
    }
    return step();
  }catch(e){ return Promise.resolve(null); }
}
function selectVA(va) {
  /* The two-tab blocker that used to live here is GONE, deliberately. It asked the
     other tabs for permission, and when the VA pressed its "Close this tab" button
     window.close() silently failed and dropped her on the start screen holding a
     live shift — which is exactly how 18/08 cost Suz 3h15m and Mera 1h27m.
     Blocking is no longer needed: hours are derived from the append-only event log
     (seCompute), so every tab computes the same answer and none of them owns
     anything. Two tabs, a shut laptop, a crash and a reopen are now the same thing.
     The safest code here is no code. */
  renderNewsletterSchedulePanels();
  /* Before anything else: did she leave an earlier shift open? If so she closes that
     first — see findUnclosedShift. Only ever asks about a day with real logged time,
     and a "not me / skip" answer is remembered so it cannot nag her every morning. */
  if ((va === 'Mera' || va === 'Suz') && DB_ENABLED && !window._skipUnclosed) {
    try{
      findUnclosedShift(va).then(function(u){
        if(!u){ window._skipUnclosed=1; selectVA(va); return; }
        var skipKey='bdl_unclosed_skip_'+va+'_'+u.day;
        var skipped=false; try{ skipped=lsGet(skipKey)==='1'; }catch(e){}
        if(skipped){ window._skipUnclosed=1; selectVA(va); return; }
        var m=Math.round(u.clockedMs/60000), bm=Math.round(u.breakMs/60000);
        var hh=Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m';
        var msg='You never submitted your shift for '+u.day+'.\n\n'
          +'From your own clock that day: '+hh+' worked'+(bm?' and '+bm+' minutes of break':'')+'.\n\n'
          +'Press OK to open that day and submit it now — nothing is lost and your hours get counted.\n'
          +'Press Cancel to skip it and start today instead.';
        if(confirm(msg)){
          window._skipUnclosed=1;
          try{ showToast('Opening '+u.day+' — check it over and submit'); }catch(e){}
          try{ lsPut('bdl_closeday_'+va, JSON.stringify(u)); }catch(e){}
        } else {
          try{ lsPut(skipKey,'1'); }catch(e){}
          window._skipUnclosed=1;
        }
        selectVA(va);
      }).catch(function(){ window._skipUnclosed=1; selectVA(va); });
    }catch(e){ window._skipUnclosed=1; }
    return;
  }
  // Check Supabase for an in-progress draft first
  if ((va === 'Mera' || va === 'Suz') && DB_ENABLED) {
    document.getElementById('login-screen').style.display = 'none';
    // Show a brief loading state
    var loadDiv = document.createElement('div');
    loadDiv.id = 'draft-check-loading';
    loadDiv.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:999;flex-direction:column;gap:14px;';
    loadDiv.innerHTML = '<div style="font-family:var(--font-head);font-size:22px;color:#9b8fff;">Checking for saved shift...</div>'
      + '<div style="font-size:12px;color:#555;">Restoring your progress if found</div>';
    document.body.appendChild(loadDiv);

    checkAndRestoreDraft(va).then(function(restored) {
      var ld = document.getElementById('draft-check-loading');
      if (ld) ld.remove();

      // 'error' is NOT 'no saved work'. Showing the fresh-start screen here is what
      // lets the first autosave of a brand-new shift merge over a real one.
      if (restored === 'error') { draftCheckFailed(va); return; }

      if (restored === 'restored') {
        // Draft found — go straight into shift, skip setup
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('mera-setup').style.display = 'none';
        document.getElementById('suz-setup').style.display = 'none';
        document.getElementById('shift-screen').style.display = 'block';
        document.getElementById('view-va').classList.remove('setup-active');
        document.getElementById('report-btn').style.display = 'block';
        document.getElementById('shift-va-name').textContent = (va==='Test'&&previewVA) ? ('Preview \u2014 '+vaDisp(previewVA)+"'s Shift") : (vaDisp(va) + "'s Shift");
        try{ var _pb=document.getElementById('preview-exit'); if(_pb) _pb.style.display=(va==='Test')?'inline-block':'none'; }catch(e){}
        document.getElementById('shift-date').textContent = ukDateString();
        document.getElementById('eod-form').style.display = 'block'; try{ eodRenderLeadCheck(); }catch(e){}
        document.getElementById('eod-report').classList.remove('show');
        renderTasks();
        try{ renderStorefronts(); if((state.storefronts||[]).some(function(s){return s.running;})){ if(!window._sfTick) window._sfTick=setInterval(sfTickRunning,1000); } }catch(e){}
        try{ jb_addsBanner(va); }catch(e){}
        /* She may have been on a break when the tab closed. Draw the break UI from
           state instead of leaving the old screen up: without this she came back to
           a normal-looking app with the clock stopped. */
        try{ paintBreakUI(); }catch(e){}
        startTimer();
        if(state._forceEnd){
          showToast('Jack has asked you to close this shift — check it over and submit');
          setTimeout(function(){
            try{
              var host=document.getElementById('eod-form');
              if(host){
                var b=document.createElement('div');
                b.className='eu-bar'; b.id='force-end-bar';
                b.innerHTML='⚠️ <b>Jack asked you to close this shift.</b> Your tasks, time and leads are all still here — check them over and submit below.';
                host.parentNode.insertBefore(b,host);
                host.scrollIntoView({behavior:'smooth',block:'start'});
              }
            }catch(e){}
          },600);
        } else {
          var _ds=window._draftSrc||{}, _when='';
          try{ if(_ds.savedAt) _when=' (copy saved '+new Date(_ds.savedAt).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'})+(_ds.from==='device'?', from this device':'')+')'; }catch(e){}
          var _g=Math.round((window._gapCounted||0)/60000);
          showToast('✓ Shift restored — picked up where you left off!'+_when+(_g?' · +'+_g+' min while the tab was closed counted':''));
          if(_g){ try{ seLog('gap_counted',{mins:_g}); }catch(e){} }
        }
      } else {
        /* LAST LINE OF DEFENCE. "No draft" from the cloud is not proof there is no work —
           this device may still be holding it. Suz reported closing the tab and being put
           back on the start screen; whatever path gets her there, she must never be shown
           a blank shift while a saved one exists on her machine. Ask, don't assume. */
        try{
          var _ld = (!window._draftForceFresh) ? localDraft(va) : null;
          if (_ld) {
            var _mins = Math.max(1, Math.round((_ld.elapsedMs||0)/60000));
            if (confirm('There is saved work on this device for '+vaDisp(va)+' \u2014 about '
                +(_mins>=60?(Math.floor(_mins/60)+'h '+(_mins%60)+'m'):(_mins+' min'))
                +' of shift.\n\nPick up where you left off?\n\n(Cancel starts a brand-new shift.)')) {
              state.currentVA = va;
              state.totalBreakMs = _ld.totalBreakMs || 0;
              state.onBreak = !!_ld.onBreak;
              state.breakStart = _ld.onBreak ? (_ld.breakStart || Date.now()) : null;
              state._currentBreakStartTime = _ld.onBreak ? (_ld.breakStartTime||'') : '';
              /* Was `now - elapsed - totalBreakMs` — the SAME missing live-break term
                 that cost Suz two hours, sitting in a second copy of the sum. Found by
                 auditing for copies after the first fix; now on the shared clock. */
              window._gapCounted = gapToCount(_ld.savedAt, _ld.onBreak);   // v51.6
              state.shiftStart = restoreBase((_ld.elapsedMs||0)+window._gapCounted, state.totalBreakMs,
                                             state.onBreak, state.breakStart, Date.now());
              state.breaks = _ld.breaks || [];
              state.tasks = _ld.tasks || [];
              state.extraTasks = _ld.extraTasks || [];
              state.storefronts = _ld.storefronts || [];
              state._jbDone = _ld.jbDone || {};
              state._newsletterDay = _ld.newsletterDay || false;
              state.submitted = false;
              document.getElementById('login-screen').style.display = 'none';
              document.getElementById('mera-setup').style.display = 'none';
              document.getElementById('suz-setup').style.display = 'none';
              document.getElementById('shift-screen').style.display = 'block';
              document.getElementById('view-va').classList.remove('setup-active');
              document.getElementById('report-btn').style.display = 'block';
              document.getElementById('shift-va-name').textContent = vaDisp(va) + "'s Shift";
              document.getElementById('shift-date').textContent = ukDateString();
              document.getElementById('eod-form').style.display = 'block';
              try{ eodRenderLeadCheck(); }catch(e){}
              document.getElementById('eod-report').classList.remove('show');
              renderTasks();
              try{ renderStorefronts(); }catch(e){}
              try{ jb_addsBanner(va); }catch(e){}
              startTimer();
              var _g2=Math.round((window._gapCounted||0)/60000);
              showToast('\u2713 Restored from this device \u2014 nothing lost'+(_g2?' \u00b7 +'+_g2+' min while the tab was closed counted':''));
              if(_g2){ try{ seLog('gap_counted',{mins:_g2}); }catch(e){} }
              return;
            }
          }
        }catch(e){}
        // No draft — show normal setup screen
        document.getElementById('login-screen').style.display = 'none';
        if (va === 'Mera') {
          document.getElementById('mera-setup').style.display = 'flex';
          document.getElementById('suz-setup').style.display = 'none';
        } else {
          document.getElementById('suz-setup').style.display = 'flex';
          document.getElementById('mera-setup').style.display = 'none';
        }
        document.getElementById('view-va').classList.add('setup-active');
      }
    });
  } else if (va === 'Mera') {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('mera-setup').style.display = 'flex';
    document.getElementById('suz-setup').style.display = 'none';
    document.getElementById('view-va').classList.add('setup-active');
  } else if (va === 'Suz') {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('suz-setup').style.display = 'flex';
    document.getElementById('mera-setup').style.display = 'none';
    document.getElementById('view-va').classList.add('setup-active');
  } else {
    startShift(va, false);
  }
}

// ── START SHIFT ──────────────────────────────────────────
/* The cross-tab ownership protocol (BroadcastChannel + "your shift is open in
   another tab" modal) lived here and has been REMOVED. It was built to prevent lost
   time and caused it: its escape button called window.close(), which browsers refuse
   for any tab the page did not open, and the code then fell through to the login
   screen with the shift still live in memory. Starting from there ran a second clock
   from zero while the real clock-in time stayed put, and the 60-second autosave made
   the loss permanent — 3h15m of Suz's day and 1h27m of Mera's on 18/08/2026.
   Nothing replaces it, because nothing needs to: hours come from the event log now,
   so extra tabs are harmless by construction rather than by policing. */
function startShift(va, newsletterDay, previewVA) {
  var tmplVA = (va === 'Test' && previewVA) ? previewVA : va;
  if (newsletterDay === undefined && (tmplVA === 'Mera' || tmplVA === 'Suz')) newsletterDay = isNewsletterDayFor(tmplVA);
  state.currentVA = va;
  state._previewAs = (va === 'Test' && previewVA) ? previewVA : null;
  state.shiftStart = new Date();
  /* state.shiftStart is REWRITTEN by the draft restore to keep the counter running
     (see fakeShiftStart) — it is a timer base, not a clock time. _trueStart is the
     real moment the shift began and nothing is allowed to move it. */
  state._trueStart = state.shiftStart.getTime();
  /* A brand-new shift starts honestly at zero — drop any high-water mark left by
     an earlier shift today, or the backwards-clock guard would inflate it. */
  try{ lsDrop('bdl_maxel_'+va+'_'+shiftDayKey()); }catch(e){}
  /* The first event of the day. Every hour she is paid for is derived from this
     timestamp — nothing downstream stores a duration any more. */
  try{ seLog('clock_in',{newsletterDay:!!newsletterDay}); }catch(e){}
  state.totalBreakMs = 0;
  state.onBreak = false;
  state._newsletterDay = newsletterDay;
  state._goalCelebrated = false; state._tasksCelebrated = false;

  /* an archived task is parked, not deleted — it must not reach the VA's shift */
  var base  = getTaskTemplateSource(tmplVA).filter(function(t){ return !t.archived; });
  var tasks = base.map(function(t) {
    return { id:t.id, name:t.name, mandatory:t.mandatory, tickOnly:t.tickOnly===true, hint:t.hint||'', hasLinks:t.hasLinks||false,
             done:false, skipped:false, skipReason:'', time:'', timeHrs:0, timeMins:0, leads:'', context:'', links:t.hasLinks?['','','']:[] };
  });
  tasks = enrichTasksWithPOA(tmplVA,tasks);

  if ((tmplVA === 'Mera' || tmplVA === 'Suz') && newsletterDay) {
    var nlTask = { id:'newsletter', name:'Newsletter Check', mandatory:true,
      hint:'Check email for back in stock / extra discounts / flash promos. Find something strong - dig deeper.',
      hasLinks:false, done:false, skipped:false, skipReason:'', time:'', timeHrs:0, timeMins:0, leads:'', context:'', links:[] };

    // Slot A: right after Telegram (index 1 = Telegram for both VAs)
    tasks.splice(2, 0, Object.assign({}, nlTask, { id:'newsletter-a', name:'Newsletter Check (After Discord)' }));

    // Slot B: after sourcing
    var srcId = tmplVA === 'Suz' ? 'suz-sourcing' : 'sourcing';
    var srcIdx = tasks.findIndex(function(t){ return t.id === srcId; });
    if (srcIdx >= 0) {
      tasks.splice(srcIdx + 1, 0, Object.assign({}, nlTask, { id:'newsletter-b', name:'Newsletter Check (Sourcing Block)' }));
    }
  }

  /* v51.2: the Tuesday laptops/hoovers and Thursday filter tasks are gone — both are daily
     sources in the Sourcing Suite now (mera-highticket, mera-150plus) and would double-nag. */

  // Inject Jack's rolling items + one-off tasks — they persist day-to-day until ticked off.
  // Slot them RIGHT AFTER the "Jack POA" task so everything from Jack sits together.
  try {
    var _op = (typeof jb_open==='function') ? jb_open(tmplVA) : null;
    var _jbTasks=[];
    if (_op && _op.tasks && _op.tasks.length) {
      _op.tasks.filter(function(t){return !t.done;}).sort(jb_byAge).forEach(function(t){
        var carried=jb_isCarried(t.addedOn);
        _jbTasks.push({id:'oneoff-'+t.iid, jbOneoffIid:t.iid, name:'Task · '+t.name, jbCarried:carried, jbAddedOn:t.addedOn,
          mandatory:true, hint:(carried?'Carried over from '+t.addedOn+' — still needs doing.':'Task from Jack.'), hasLinks:false, done:false, skipped:false, skipReason:'', time:'', timeHrs:0, timeMins:0, leads:'', context:'', links:[]});
      });
    }
    var _openItems = (_op && _op.items) ? _op.items.filter(function(it){return !it.done;}).sort(function(a,b){
      // High first, then oldest first — importance beats age
      var R={Urgent:-1,High:0,Medium:1,Low:2};
      var d=(R[a.pri||'Medium'])-(R[b.pri||'Medium']);
      return d!==0?d:jb_byAge(a,b);
    }) : [];
    // Send eight storefronts and the VA used to get eight near-identical rows. Bundle each
    // type into ONE row with the individual links inside it; a lone item stays a normal card.
    // Jack's rule: what he sends lands with the work it belongs to — storefronts inside
    // the Storefronts task, filters inside the filters task — and anything without a
    // natural home goes under Missed Yesterday + Jack POA.
    (function(){
      var TYPE_ORDER=['sf','kpf','eu','asin','msg'], groups={};
      _openItems.forEach(function(it){ (groups[it.t]=groups[it.t]||[]).push(it); });
      TYPE_ORDER.forEach(function(ty){
        var g=groups[ty]; if(!g||!g.length) return;
        var host=jb_findHost(tasks,ty);
        if(host){
          jb_attachToHost(host,g);
          host.hint=(host.hint||'')+' Jack sent '+g.length+' to add — they\'re listed below.';
          return;
        }
        if(g.length===1){ _jbTasks.push(jb_itemTask(g[0])); return; }
        _jbTasks.push(jb_groupTask(ty,g));
      });
      Object.keys(groups).forEach(function(ty){
        if(TYPE_ORDER.indexOf(ty)>=0) return;                 // anything unexpected still shows
        groups[ty].forEach(function(it){ _jbTasks.push(jb_itemTask(it)); });
      });

    })();
    state._jbItemCount=_openItems.length;
    // storefront batches assigned to this VA arrive as ordinary tasks (High first)
    try{
      if(SB_BATCHES){ try{ sbLoadDoneFlags().then(function(){ try{ if(state.currentVA) renderTasks(); }catch(e){} }); }catch(e){}
        sbInjectBatchTasks(tmplVA, tasks); }
      else if(typeof sbLoadBatches==='function') sbLoadBatches().then(function(){
        try{ if(state.currentVA===va && sbInjectBatchTasks(tmplVA, state.tasks)) renderTasks(); }catch(e){}
      });
    }catch(e){}
    // saved filters Jack linked to this VA's POA slots get attached INTO the matching
    // POA task (kpf-daily / kpf-tue / kpf-thu), so they inherit that task's frequency
    // and don't duplicate it with a second row.
    /* her Sourcing Suite sources, pulled once and attached when they arrive */
    try{
      if(typeof oaLoad==='function'){
        if(OA_SRC && OA_RUNS){ oaAttachSources(tasks,va); }
        else oaLoad().then(function(ok){
          try{ if(ok && state.currentVA===va && oaAttachSources(state.tasks,va)) renderTasks(); }catch(e){}
        });
      }
    }catch(e){}
    try{
      var _attached=sfltAttachToPoa(tasks,va);
      // e.g. a Suz filter set to "Tuesdays" — Suz has no Tuesday POA task, so it would
      // vanish. Give those their own row rather than silently dropping them.
      sfltForVA(va).forEach(function(f){
        if(!sfltRunsToday(f)) return;            // no days set = her library only, never a task
        if(typeof SFLT_VA_RETIRED!=='undefined' && SFLT_VA_RETIRED) return;   // 27/09: no saved filters on a VA's shift — the Suite is the list
        if(_attached.indexOf(f.id)<0) _jbTasks.push(sfltPoaTask(f));
      });
    }catch(e){}
    if(_jbTasks.length){
      var poaIdx=tasks.findIndex(function(t){return t.id==='jack-poa'||t.id==='suz-jack-poa';});
      if(poaIdx>=0) tasks.splice.apply(tasks,[poaIdx+1,0].concat(_jbTasks));   // right after the POA task
      else tasks=tasks.concat(_jbTasks);                                        // no POA task → append
    }
  } catch(e){}

  // unfinished from last shift → tagged so they can see how long it's been hanging
  try{
    var _c=JSON.parse(lsGet('bdl_carry_'+va)||'[]');
    if(_c.length){
      var _seen={};
      _c.forEach(function(c){
        if(_seen[c.id]) return; _seen[c.id]=1;
        var t=tasks.filter(function(x){return x.id===c.id;})[0];
        if(t){ t._carryDays=c.days; t._carrySince=c.since; t.jbCarried=true; t.jbCarryDays=c.days;
               t.hint=(t.hint||'')+' ↻ Not finished on your last shift'+(c.days>1?' — '+c.days+' shifts running':'')+'.'; }
      });
      state._carriedCount=_c.length;
    }
  }catch(e){}
  state.tasks = tasks;
  state.extraTasks = [];
  state.storefronts = [];
  state._jbDone = {};

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('mera-setup').style.display = 'none';
  document.getElementById('suz-setup').style.display = 'none';
  document.getElementById('shift-screen').style.display = 'block';
  document.getElementById('view-va').classList.remove('setup-active');
  document.getElementById('report-btn').style.display = 'block';
  document.getElementById('shift-va-name').textContent = (va==='Test'&&previewVA) ? ('Preview \u2014 '+previewVA+"'s Shift") : (va + "'s Shift");
  try{ var _pb=document.getElementById('preview-exit'); if(_pb) _pb.style.display=(va==='Test')?'inline-block':'none'; }catch(e){}
  document.getElementById('shift-date').textContent = ukDateString();
  document.getElementById('eod-form').style.display = 'block'; try{ eodRenderLeadCheck(); }catch(e){}
  document.getElementById('eod-report').classList.remove('show');

  renderTasks();
  try{ renderStorefronts(); }catch(e){}
  try{ jb_addsBanner(tmplVA); }catch(e){}
  try{ jb_urgentBanner(tmplVA); }catch(e){}
  try{ if(typeof renderFromJack==='function') renderFromJack(tmplVA); }catch(e){}
  try{ if(typeof renderSavedFiltersVA==='function') renderSavedFiltersVA(); }catch(e){}
  try{ if(typeof refreshSavedFiltersFromCloud==='function') refreshSavedFiltersFromCloud(); }catch(e){}   // fetch newest filters
  try{ applyVaExperience(); }catch(e){}
  try{ if(typeof jb_cloudPull==='function') jb_cloudPull(tmplVA); }catch(e){}
  startTimer();
  showWelcome(va);
  // Load previous Keepa total for this VA
  if (va !== 'Test') keepaLoadPrevTotal(va);
  if (va !== 'Test') discord_shift_start_notify(va);
}

// ── RENDER TASKS ─────────────────────────────────────────
/* The list is 22 tasks long. Rather than one flat wall, it's split into what's left,
   what Jack sent, what they added themselves, and a collapsed pile of what's done —
   so the screen shrinks as the shift goes on instead of growing. */
function taskSectionEl(title,count,extraCls,collapsibleId,openByDefault,doneN,totalN){
  var d=document.createElement('div');
  d.className='tk-sec '+(extraCls||'');
  var open=collapsibleId?(window['_tkOpen_'+collapsibleId]!==undefined?window['_tkOpen_'+collapsibleId]:!!openByDefault):true;
  /* the redesign: every section can carry its own progress bar, tinted with the
     section's accent (--ph). Sections that pass done/total get one; others don't. */
  var pct=(totalN>0)?Math.round((doneN||0)/totalN*100):null;
  d.innerHTML='<div class="tk-sec-h'+(collapsibleId?' clickable':'')+'"'
    +(collapsibleId?' onclick="tkSecToggle(\''+collapsibleId+'\')"':'')+'>'
    +(collapsibleId?'<span class="tk-caret">'+(open?'▾':'▸')+'</span>':'')
    +'<span class="tk-sec-t">'+title+'</span>'
    +'<span class="tk-sec-n'+(pct===100?' all-done':'')+'">'+(pct===100?'✓ ':'')+count+'</span></div>'
    +(pct!=null?'<div class="tk-sec-bar"><i style="width:'+pct+'%"></i></div>':'')
    +'<div class="tk-sec-b'+(collapsibleId&&!open?' hid':'')+'" id="'+(collapsibleId?'tksec-'+collapsibleId:'')+'"></div>';
  return d;
}
function tkSecToggle(id){
  window['_tkOpen_'+id]=!(window['_tkOpen_'+id]!==undefined?window['_tkOpen_'+id]:false);
  renderTasks();
}

/* ── EU SHEETS: "there might not be any" ────────────────────────────────────
   Jack: "if there isn't any, a button to say there isn't any — but then if EU sheets
   come later on in the shift, a banner at the top and this becomes unlocked."
   The task was mandatory with no honest way to say "nothing to do", so a VA either
   skipped it (which reads as a miss) or invented a time. Pressing "None today" records
   WHICH EU items existed at that moment; anything Jack sends afterwards is new, and new
   work reopens the task and announces itself. */
var EU_TASK_IDS=['eu-sheets','suz-eu'];
function isEuTask(t){ return !!t && EU_TASK_IDS.indexOf(t.id)>=0; }
function euItemIds(va){
  var out=[];
  try{
    var o=jb_open(va||state.currentVA); if(!o) return out;
    (o.items||[]).forEach(function(x){
      if(x.done) return;
      if(x.t==='eu'||x.t==='euasin') out.push(String(x.id||x.iid||''));
    });
  }catch(e){}
  return out.filter(Boolean);
}
function euNone(i,isExtra){
  var t=(isExtra?state.extraTasks:state.tasks)[i]; if(!t) return;
  t._euNone=Date.now();
  t._euSeen=euItemIds();                 // the EU work that existed when he said "none"
  t.done=true; t.skipped=false; t.timeHrs=0; t.timeMins=0; t.time=''; t.leads='';
  t.context=(t.context||'').replace(/^No EU sheets today\.?\s*/,'');
  t.context='No EU sheets today.'+(t.context?' '+t.context:'');
  renderTasks(); try{ updateStats(); }catch(e){}
  try{ saveShiftDraft(false); }catch(e){}
  try{ showToast('Logged: no EU sheets today — it reopens by itself if Jack sends any'); }catch(e){}
}
/* new EU work that arrived AFTER "none today" was pressed */
function euNewItems(){
  var res={n:0, task:null, idx:-1};
  (state.tasks||[]).forEach(function(t,i){
    if(!isEuTask(t)||!t._euNone) return;
    var seen=t._euSeen||[];
    var fresh=euItemIds().filter(function(id){ return seen.indexOf(id)<0; });
    if(fresh.length){ res.n=fresh.length; res.task=t; res.idx=i; }
  });
  return res;
}
/* Reopen the task the moment new EU work lands, and say so at the top of the shift. */
function euReopenCheck(){
  var host=document.getElementById('eu-banner');
  var f=euNewItems();
  if(!f.n){ if(host) host.innerHTML=''; return false; }
  var t=f.task;
  if(t.done && t._euNone){                       // unlock it — there IS something now
    t.done=false; t._euNone=null; t._euSeen=null;
    t.context=(t.context||'').replace(/^No EU sheets today\.?\s*/,'');
    try{ saveShiftDraft(false); }catch(e){}
  }
  if(host) host.innerHTML='<div class="eu-bar">\u{1F1EA}\u{1F1FA} <b>'+f.n+' EU sheet'+(f.n===1?'':'s')+'</b> '
    +(f.n===1?'has':'have')+' come in since you said there were none — '
    +'<b>EU Sheets is open again</b>, have a look when you can.'
    +'<button class="eu-bar-x" onclick="euDismissBanner()">Got it</button></div>';
  return true;
}
function euDismissBanner(){ var h=document.getElementById('eu-banner'); if(h) h.innerHTML=''; }


/* ── PARALLEL LINK ARRAYS: ONE INVARIANT, ENFORCED ─────────────────────────
   links / linkNames / linkLeads / linkFilterIds are read BY INDEX, so they are only
   meaningful while they are the same length. Nothing enforced that, and a task created
   with links:['','',''] but linkNames:[] silently split a From-Jack item in half —
   its name on row 1, its URL on row 4, looking like two unrelated things.
   Two functions now hold the line:
     taskLinksNormalise() — structural: every row exists in all four arrays
     taskLinksRepair()    — corrective: a named From-Jack row gets its URL back from
                            the brief itself (the source of truth), and the orphaned
                            copy of that URL is removed. This repairs drafts already
                            saved in the broken shape, not just new ones. */
/* Growing to row `li` must happen in all four arrays at once. Four call sites used to
   grow whichever array they happened to need, which is the same drift that split the
   From-Jack item in half — just triggered by typing instead of by a send. */
function taskLinksEnsure(t,li){
  if(!t) return;
  t.links=t.links||[]; t.linkNames=t.linkNames||[];
  t.linkLeads=t.linkLeads||[]; t.linkFilterIds=t.linkFilterIds||[];
  var n=Math.max(li+1,t.links.length,t.linkNames.length,t.linkLeads.length,t.linkFilterIds.length);
  while(t.links.length<n)         t.links.push('');
  while(t.linkNames.length<n)     t.linkNames.push('');
  while(t.linkLeads.length<n)     t.linkLeads.push('');
  while(t.linkFilterIds.length<n) t.linkFilterIds.push('');
}
/* Drafts saved before that fix still hold the seeded 0s. A filter row that has a 0 but
   was never opened (no timer, no time) was never really logged — clear it back to ''. */
function taskLinksHealSeeded(t){
  if(!t||!t.hasLinks) return false;
  var ids=t.linkFilterIds||[], led=t.linkLeads||[], secs=t.linkSecs||[], fixed=false;
  for(var i=0;i<led.length;i++){
    if(!ids[i]) continue;                       // only saved-filter rows were seeded
    if(led[i]===0 && !(secs[i]>0)){ led[i]=''; fixed=true; }
  }
  return fixed;
}
function taskLinksNormalise(t){
  if(!t||!t.hasLinks) return false;
  t.links=t.links||[]; t.linkNames=t.linkNames||[];
  t.linkLeads=t.linkLeads||[]; t.linkFilterIds=t.linkFilterIds||[];
  var n=Math.max(t.links.length,t.linkNames.length,t.linkLeads.length,t.linkFilterIds.length);
  var changed=false;
  while(t.links.length<n){ t.links.push(''); changed=true; }
  while(t.linkNames.length<n){ t.linkNames.push(''); changed=true; }
  while(t.linkLeads.length<n){ t.linkLeads.push(''); changed=true; }
  while(t.linkFilterIds.length<n){ t.linkFilterIds.push(''); changed=true; }
  return changed;
}
function taskLinksRepair(t,va){
  if(!taskLinksNormalise(t)&&!(t.jbIids&&t.jbIids.length)) return false;
  if(!t.jbIids||!t.jbIids.length) return false;
  var items=[];
  try{ var o=jb_open(va||state.currentVA); items=(o&&o.items)||[]; }catch(e){ return false; }
  var byIid={}; items.forEach(function(it){ if(it&&it.iid) byIid[it.iid]=it; });
  var fixed=false;
  t.jbIids.forEach(function(iid,k){
    if(!iid) return;
    var it=byIid[iid]; if(!it) return;
    var url=/^https?:\/\//i.test(it.v||'')?it.v:'';
    if(!url) return;
    // where does this item's NAME sit?
    var ni=-1;
    for(var i=0;i<t.linkNames.length;i++){
      if(t.linkNames[i] && String(t.linkNames[i]).indexOf(jb_cleanLabel(it))===0){ ni=i; break; }
    }
    if(ni<0) return;
    if(t.links[ni]===url) return;                       // already whole
    // is the URL sitting on its own somewhere else, with no name?
    var oi=-1;
    for(var j=0;j<t.links.length;j++){
      if(j!==ni && t.links[j]===url && !t.linkNames[j]){ oi=j; break; }
    }
    if(!t.links[ni]){ t.links[ni]=url; fixed=true; }
    if(oi>=0){                                          // drop the orphan half
      t.links.splice(oi,1); t.linkNames.splice(oi,1);
      t.linkLeads.splice(oi,1); t.linkFilterIds.splice(oi,1);
      fixed=true;
    }
  });
  return fixed;
}
function taskLinksRepairAll(){
  var any=false;
  ['tasks','extraTasks'].forEach(function(key){
    (state[key]||[]).forEach(function(t){
      if(taskLinksNormalise(t)) any=true;
      try{ if(taskLinksHealSeeded(t)) any=true; }catch(e){}
      try{ if(taskLinksRepair(t)) any=true; }catch(e){}
    });
  });
  if(any){ try{ saveShiftDraft(false); }catch(e){} }
  return any;
}

function renderTasks() {
  try{ vaPerfPaint(); }catch(e){}
  try{ taskLinksRepairAll(); }catch(e){}
  try{ euReopenCheck(); }catch(e){}
  var mandEl = document.getElementById('mandatory-tasks');
  var extEl  = document.getElementById('extra-tasks');
  mandEl.innerHTML = ''; extEl.innerHTML = '';

  var mand=[], fromJack=[], doneList=[];
  state.tasks.forEach(function(t,i){
    var rec={t:t,i:i,extra:false};
    if(t.done||t.skipped) doneList.push(rec);
    // a recurring task that merely RECEIVED some of Jack's items stays in "Still to do";
    // only genuine one-off sends get their own section
    else if(t.jbIid||t.jbOneoffIid||(t.jbGroup&&String(t.id).indexOf('jbgrp-')===0)) fromJack.push(rec);
    else if(t.mandatory!==false) mand.push(rec);
    else fromJack.push(rec);
  });
  var own=[];
  state.extraTasks.forEach(function(t,i){
    var rec={t:t,i:i,extra:true};
    (t.done||t.skipped) ? doneList.push(rec) : own.push(rec);
  });

  function fill(sec,list){
    var body=sec.querySelector('.tk-sec-b');
    /* Storefront batches stay AT THEIR PLACE in the POA order (they're spliced in right
       after the Storefronts host task), but render as ONE compact card, not N full rows.
       Jack, on the first cut which dumped them at the bottom: "surely storefront should
       go with and around where storefronts is on their POA". */
    var sbRecs=list.filter(function(r){ return r.t && r.t.sbBatchId; });
    var sbPlaced=false, sbCard=null, hostEl=null;
    list.forEach(function(r){
      if(r.t && r.t.sbBatchId){
        if(!sbPlaced){
          sbPlaced=true;
          try{ sbCard=sbVaGroupEl(sbRecs); body.appendChild(sbCard); }
          catch(e){ sbRecs.forEach(function(x){ body.appendChild(buildTaskEl(x.t,x.i,x.extra)); }); }
        }
        return;
      }
      var el=buildTaskEl(r.t,r.i,r.extra);
      if(r.t && JB_ROUTE && JB_ROUTE.sf && JB_ROUTE.sf.indexOf(r.t.id)>=0) hostEl=el;
      body.appendChild(el);
    });
    /* Jack: "shouldn't that be merged?" — the Storefronts task and the batch card were two
       separate cards for one job, stacked on top of each other. When the host survives
       (because Jack sent something into it) it now becomes the HEAD of the batch card
       rather than a card of its own: one bordered block, one heading, everything about
       storefronts inside it. */
    if(sbCard && hostEl && hostEl.parentNode===body){
      sbCard.classList.add('sbv-merged');
      sbCard.insertBefore(hostEl, sbCard.firstChild);
      body.insertBefore(sbCard, body.firstChild===hostEl?body.firstChild:sbCard);
    }
    return sec;
  }
  if(fromJack.length){
    var PR={Urgent:0,High:1,Medium:2,Low:3};
    fromJack.sort(function(a,b){
      var pa=PR[(a.t&&a.t.jbPri)||'Medium'], pb=PR[(b.t&&b.t.jbPri)||'Medium'];
      if(pa!==pb) return pa-pb;
      return a.i-b.i;
    });
    var urgent=fromJack.filter(function(r){ return (r.t&&r.t.jbPri)==='Urgent'; }).length;
    mandEl.appendChild(fill(taskSectionEl('📣 From Jack — today only'+(urgent?' · '+urgent+' urgent':''),
      fromJack.length,'tk-sec-jack'+(urgent?' has-urgent':'')),fromJack));
  }
  /* Storefront batches were full task rows — six of them swamped the ticklist and the
     recurring shift structure disappeared under a wall of identical purple (Jack: "still
     got major issues here... it needs a whole redesign"). They are ONE kind of work, so
     they get ONE card: compact rows inside a single section, oldest debt flagged first,
     done ones collapsing to a line. The task objects underneath are unchanged — timers,
     drafts, EOD and Jack's board all keep reading the same state. */
  /* ── PHASES ─────────────────────────────────────────────────────────────
     19 near-identical rows in one list gave no sense of shape. Three phases match how
     the shift actually runs. Jack's caveat, in his words: "they might not be able to get
     all the main work done — if that makes sense." So MAIN WORK is explicitly open-ended:
     it shows how much got through, never a red "incomplete", because not finishing it is
     normal. Only the checks at each end are things that must be ticked. */
  if(mand.length){
    /* v51.2: the Sourcing Suite task is her main sourcing block, not a "quick check" — it
       opens Main work now, ahead of Jack's POA and the storefront batches. */
    var PHASE_START=['leadsheet','telegram','pp-main',
                     'suz-leadsheet','suz-telegram','suz-pp','newsletter-a'];
    var PHASE_END=['pp-light','telegram-eod','oos-sheet','leadsheet-eod',
                   'suz-pp-light','suz-telegram-eod','suz-oos-sheet','suz-leadsheet-eod'];
    function phaseOf(t){
      var id=String(t.id||'');
      if(PHASE_START.indexOf(id)>=0) return 0;
      if(PHASE_END.indexOf(id)>=0)   return 2;
      return 1;                                   // sourcing, EU, storefronts, POA, batches
    }
    var ph=[[],[],[]];
    mand.forEach(function(r){ ph[phaseOf(r.t)].push(r); });
    /* A ticked task moves to the Done section, so counting only the rows still HERE
       froze every progress bar at 0% for the whole shift. Count the phase against
       everything that belongs to it — done included — and only draw what's left. */
    var phDone=[0,0,0], phTotal=[0,0,0];
    state.tasks.forEach(function(t){
      if(t.mandatory===false||t.jbIid||t.jbOneoffIid||(t.jbGroup&&String(t.id).indexOf('jbgrp-')===0)) return;
      var g=phaseOf(t); phTotal[g]++; if(t.done||t.skipped) phDone[g]++;
    });
    var META=[
      {t:'\u2600\ufe0f Start of shift', cls:'tk-ph-start', sub:'quick checks before you get going'},
      {t:'\u26cf\ufe0f Main work',      cls:'tk-ph-main',  sub:'get through what you can \u2014 finishing every one is not expected'},
      {t:'\u{1F319} Before you log off', cls:'tk-ph-end',   sub:'these do need ticking'}
    ];
    var anyPhase=ph.filter(function(g){ return g.length; }).length>1;
    if(anyPhase){
      ph.forEach(function(group,gi){
        if(!group.length&&!phDone[gi]) return;
        var doneN=phDone[gi], totN=phTotal[gi]||group.length;
        var sec=taskSectionEl(META[gi].t+'<span class="tk-ph-sub">'+META[gi].sub+'</span>',
                              (gi===1? (doneN+' of '+totN+' so far') : (doneN+'/'+totN)),
                              META[gi].cls,null,false,doneN,totN);
        if(group.length) mandEl.appendChild(fill(sec,group));
        else mandEl.appendChild(sec);              // all done — header + full bar stays as the win
      });
    } else {
      mandEl.appendChild(fill(taskSectionEl('Still to do',mand.length),mand));
    }
  }
  if(own.length){
    extEl.appendChild(fill(taskSectionEl('Their own work',own.length,'tk-sec-own'),own));
  }
  if(doneList.length){
    extEl.appendChild(fill(taskSectionEl('✓ Done',doneList.length,'tk-sec-done','done',false),doneList));
  }

  try{ renderVaResults(); }catch(e){}
  markNextUpTask();
  updateTaskProgress();
  updateStats();
  try{ renderShiftBar(); }catch(e){}
}

