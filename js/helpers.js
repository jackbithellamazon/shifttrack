// ── MOTD ─────────────────────────────────────────────────
var MOTD_MESSAGES = [
  "New day, new leads. 🌅","Where's the banger today? 🔍","Nasaan ang panalo today? 🏆",
  "You know your target — hit it. 🎯","Speed beats everything. ⚡","Hanap banger — go. 💨",
  "Targets don't hit themselves. 📊","Bilisan — leads are waiting. ⏰","Find one — change everything. 💥",
  "Walang lead, walang win. 🚫","Execute fast. ▶️","One banger — sapat na. 💎",
  "Focus — then fire. 🔥","Ikaw bahala — deliver today. 💪","No delays — just action. ⚡",
  "Leads = wins = bonus. 💰","Stay sharp — move fast. 🏹","Kahit isa — malaking win. 🌟",
  "Go find it. 🕵️","Results today — not tomorrow. Think of your bonus. 💵",
  "Isipin mo ang bonus mo. 🤑","Teamwork = dreamwork. 🤝","You are the boss today. 👑",
  "Ikaw ang boss — deliver. 💼","Own your targets. 🎯","Aksyon agad — no delay. ⚡",
  "Bonus is earned today. 💰","Walang action, walang bonus. 🚫","Move fast — win faster. 🏃",
  "Lead hunt mode: ON. 🟢","Hanap. Execute. Repeat. 🔄","Control the day. 👊",
  "Ikaw bahala — make it happen. 💪","Pressure builds winners. 🏋️","Work smart, move fast. 🧠",
  "Today = opportunity. 🚪","Bonus is waiting. 💵","Stay hungry — find it. 🔍",
  "Results come from action. 🏆","Every filter run could be the big one. 🎰",
  "The best leads go to the ones who look hardest. 🔦",
  "Jack's dashboard is watching — make it green. 💚",
  "Somewhere in those filters is a banger. Go find it. 💥",
  "You're not just a VA — you're a lead machine. 🤖",
  "One strong lead can pay for a whole week. Find it. 💎",
  "Think like a hunter. Move like one too. 🏹",
  "Your shift, your results, your bonus. 💰",
  "Small effort today = zero tomorrow. Big effort today = 🔥",
  "The lead sheet won't fill itself. Let's go. 📋",
  "Be the reason today's numbers look great. 📈",
  "Momentum starts with the first task. Tick it off. ✅",
  "Stay sharp — the best sourcer finds what others miss. 🕵️",
  "Today's effort is next week's result. Plant seeds. 🌱",
  "Hustle hard now, rest easy later. 💤",
  "Jack believes in you — now believe in yourself. ⭐",
  "Every tick is progress. Keep moving. ✔️",
  "Find it before anyone else does. 🏁","Make this shift count. 💫",
  "The leads are out there — go hunt them down. 🎯",
  "Consistent work builds consistent wins. 🔄",
  "Digging deep is what separates good VAs from great ones. ⛏️",
  "What gets logged gets noticed. Do great work. 📝",
  "Your name is on this shift — own it. 🏷️",
  "No excuses. Just results. 🎯","Champions show up even when it's tough. 🏅",
  "Gawin mo ngayon — wag bukas. 🗓️",
  "Eyes on the prize, hands on the keyboard. ⌨️",
  "You've done this before. You'll nail it again. ✅",
  "Trust the process. Work the filters. Win. 🔑"
];

function getDailyMotd(va) {
  var dateKey=ukDateShort().replace(/\//g,'-');
  var vaKey=(va||'unknown').toLowerCase();
  var histKey='shifttrack_motd_'+vaKey;
  try {
    var hist=JSON.parse(lsGet(histKey)||'{}');
    var cutoff=new Date(ukNow().getTime()-7*24*60*60*1000);
    // keys are DD-MM-YYYY; new Date('24/07/2026') is Invalid Date, so nothing was ever
    // pruned and the "no repeat within 7 days" window never actually worked
    Object.keys(hist).forEach(function(k){
      var dp=String(k).split('_')[0].split('-');
      if(dp.length!==3) return;
      var d=new Date(+dp[2],+dp[1]-1,+dp[0]);
      if(!isNaN(d.getTime()) && d<cutoff) delete hist[k];
    });
    var used=Object.values(hist).map(function(m){return MOTD_MESSAGES.indexOf(m);}).filter(function(x){return x>=0;});
    var avail=MOTD_MESSAGES.filter(function(_,i){return used.indexOf(i)<0;});
    if(!avail.length) avail=MOTD_MESSAGES.slice();
    var chosen=avail[Math.floor(Math.random()*avail.length)];
    var sessionKey=dateKey+'_'+Date.now();
    hist[sessionKey]=chosen;
    lsPut(histKey,JSON.stringify(hist));
    return chosen;
  } catch(e){ return MOTD_MESSAGES[Math.floor(Math.random()*MOTD_MESSAGES.length)]; }
}

// ── KEEPA TRACKER ────────────────────────────────────────
var _keepaPrevTotal = null; // the total from the VA's LAST SHIFT (not literally yesterday —
                            // they work Mon-Fri, so Monday compares back to Friday)
var _keepaIsFirst = false;  // true if no previous record found

async function keepaLoadPrevTotal(va) {
  _keepaPrevTotal = null;
  _keepaIsFirst = false;
  if (!DB_ENABLED) return;
  try {
    var res = await fetchT(SUPABASE_URL+'/rest/v1/shifts?va=eq.'+va+'&keepa_total=gt.0&order=submitted_at.desc&limit=1&select=keepa_total', {
      headers:{'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY}
    });
    var rows = await res.json();
    if (rows && rows.length && rows[0].keepa_total > 0) {
      _keepaPrevTotal = rows[0].keepa_total;
    } else {
      _keepaIsFirst = true;
      var hint = document.getElementById('keepa-hint');
      if (hint) hint.textContent = 'First time entering — type your current Keepa total and it becomes the baseline for your next shift.';
    }
    updateKeepaTotal();
  } catch(e) { console.error('Keepa load error:', e); }
}

/* A drop of more than a quarter of the tracker in one shift is nearly always a
   mis-typed total, not 500 ASINs actually removed. Warn in plain words; never
   block — sometimes she really has cleared it out. */
function keepaWarn(diff, typed, prev){
  var w = document.getElementById('keepa-warn'); if(!w) return;
  var bigDrop = (diff < 0) && (Math.abs(diff) > Math.max(50, prev*0.25));
  /* Big RISES warn too. Mera 18/08 typed 111 for ~1173 — the DROP warned (ignored),
     but next day's +1073 "added" sailed through silently and poisoned the weekly KPI.
     A rise past 120/shift is either a typo or last shift's baseline was wrong. */
  var bigRise = (diff > 120);
  if(!bigDrop && !bigRise){ w.style.display='none'; w.innerHTML=''; return; }
  w.style.display='block';
  w.innerHTML = bigDrop
    ? ('&#9888; <b>That is '+Math.abs(diff).toLocaleString()+' fewer than last shift</b> ('
      + prev.toLocaleString()+' &rarr; '+typed.toLocaleString()+').'
      + '<span>Jack&rsquo;s tracker KPI records the change, so this would go down as '+diff+'. '
      + 'If you missed a digit, fix it now. If you really did clear them out, carry on.</span>')
    : ('&#9888; <b>That is '+diff.toLocaleString()+' more than last shift</b> ('
      + prev.toLocaleString()+' &rarr; '+typed.toLocaleString()+').'
      + '<span>If your last total was mistyped, don&rsquo;t worry &mdash; submit will ask you and '
      + 'record today as a corrected baseline instead of '+diff.toLocaleString()+' added.</span>');
}
function updateKeepaTotal() {
  var input = document.getElementById('keepa-today');
  var totalEl = document.getElementById('keepa-total-val');
  var displayEl = document.getElementById('keepa-total-display');
  if (!totalEl) return;
  var currentVal = input ? parseInt(input.value) : NaN;
  if (isNaN(currentVal) || input.value === '') {
    totalEl.textContent = '—';
    if (displayEl) { displayEl.style.borderColor='rgba(45,212,163,0.25)'; displayEl.style.color='#10d99a'; }
    keepaWarn(0,0,0);
    return;
  }
  if (_keepaIsFirst) {
    // First entry — no comparison possible, just show the total they typed
    totalEl.textContent = currentVal.toLocaleString()+' (baseline)';
    if (displayEl) { displayEl.style.color='#9b8fff'; }
  } else if (_keepaPrevTotal !== null) {
    var diff = currentVal - _keepaPrevTotal;
    var sign = diff >= 0 ? '+' : '';
    totalEl.textContent = sign + diff;
    // Colour: green = added, red = removed, grey = no change
    var col = diff > 0 ? '#10d99a' : diff < 0 ? '#f2647f' : '#888';
    if (displayEl) { displayEl.style.color = col; displayEl.style.borderColor = col+'44'; }
    keepaWarn(diff, currentVal, _keepaPrevTotal);
  } else {
    // No previous total to compare against — printing today's raw number under a
    // "vs yesterday" label read as a +10 change when nothing had changed at all.
    totalEl.textContent = 'no prior day';
    if (displayEl) { displayEl.style.color='#8a90a2'; displayEl.style.borderColor='rgba(255,255,255,.12)'; }
  }
}

function keepaGetValues() {
  var input = document.getElementById('keepa-today');
  var currentVal = input ? parseInt(input.value) : 0;
  if (isNaN(currentVal)) currentVal = 0;
  var diff;
  if (_keepaIsFirst || _keepaPrevTotal === null) {
    diff = 0; // no previous — count is 0 change, total is what they typed
  } else {
    diff = currentVal - _keepaPrevTotal;
  }
  // keepa_count = daily diff (how many added/removed today)
  // keepa_total = current total (what they typed)
  return { count: diff, total: currentVal };
}

function showWelcome(va) {
  window._vaGreetOverride=(getAppSettings().vaGreeting||'').trim();
  // "Good morning, Test!" — preview greets the VA being previewed, not the mode
  try{ if(va==='Test'&&window.state&&state._previewAs) va=state._previewAs; }catch(e){}
  var phHr=phHour();
  var greeting=phHr<12?'Good morning':phHr<17?'Good afternoon':'Good evening';
  var emoji=phHr<12?'&#x1F305;':phHr<17?'&#x2600;&#xFE0F;':'&#x1F319;';
  // Show PH day/date for the VA, UK time for Jack's reference
  var phDateStr=new Date().toLocaleDateString('en-GB',{timeZone:'Asia/Manila',weekday:'long',day:'numeric',month:'long'});
  var phTime=format12hr(new Date(),'Asia/Manila');
  var ukTime=ukTimeString();
  document.getElementById('welcome-emoji').innerHTML=emoji;
  document.getElementById('welcome-name').textContent=greeting+', '+va+'!';
  document.getElementById('welcome-time').innerHTML='🇵🇭 '+phDateStr+' · '+phTime+'<br><span style="font-size:11px;color:rgba(255,255,255,0.4);">🇬🇧 '+new Date().toLocaleDateString('en-GB',{timeZone:'Europe/London',weekday:'long',day:'numeric',month:'long'})+' · '+ukTime+'</span>';
  document.getElementById('welcome-msg').textContent=getDailyMotd(va);
  document.getElementById('welcome-modal').classList.add('open');
  vaBriefFill(va);
}
/* The numbers arrive AFTER the modal opens (leads and hours are both async), so the
   brief starts as a quiet placeholder and fills in when they land. If either fetch
   fails she just gets the greeting she always had — never an error in her face. */
function vaBriefFill(va){
  var host=document.getElementById('welcome-brief'); if(!host) return;
  var whoRaw=(va==='Test'&&window.state&&state._previewAs)?state._previewAs:va;
  if(whoRaw!=='Mera'&&whoRaw!=='Suz'){ host.innerHTML=''; return; }
  /* "takes ages to load" — the numbers need two fetches, so the LAST brief this
     machine saw paints instantly and the fresh one replaces it when it lands. */
  var cached=null; try{ cached=lsGet('bdl_brief_'+whoRaw); }catch(e){}
  host.innerHTML=cached||'<div class="wb-wait">Fetching your numbers…</div>';
  var paint=function(){
    try{
      if(!(window.leads||[]).length){ host.innerHTML=''; return; }
      var p=vaPerf(whoRaw), h=window._vaHours||null;
      var _T0=vaTargets(whoRaw);
      var onTrack=h?(h.total/(_T0.hours||40)):null;
      var line=onTrack==null?'' :onTrack>=1?'Hours target met — brilliant.'
        :onTrack>=0.6?'You’re on track this week.':'A push on hours needed this week.';
      var lineCls=onTrack==null?'':onTrack>=0.6?'':' warn';
      /* Jack: "super super brief — more colours". Three lines, every number in its
         KPI colour (green leads, cyan bought, purple spend, amber hours), OA and
         the pending count trimmed out — they live in the full breakdown. */
      var T=vaTargets(whoRaw);
      function seg(v,col,lbl){ return '<span class="wb-seg"><b style="color:'+col+'">'+v+'</b><i>'+lbl+'</i></span>'; }
      /* Jack: "more KPI like — colours for if on target". Every headline now carries
         its own target, its own colour and its own bar, per VA. */
      function kpi(label,shown,pct,targetTxt,extra){
        var c=vaKpiCol(pct);
        return '<div class="wb-k"><span class="wb-k-l">'+label+'</span>'
          +'<b class="wb-k-v" style="color:'+c+'">'+shown+'</b>'
          +'<span class="wb-k-t">'+targetTxt+'</span>'
          +'<span class="wb-k-bar"><i style="width:'+Math.min(100,Math.round(pct))+'%;background:'+c+'"></i></span>'
          +(extra?'<span class="wb-k-x">'+extra+'</span>':'')+'</div>';
      }
      var out='';
      if(line) out+='<div class="wb-line'+lineCls+'">'+line+'</div>';
      out+='<div class="wb-sec">This week</div>';
      var ls=window._vaLastShift;
      if(h){
        var hT=T.hours;
        out+=kpi('Hours', vaHM(h.total), (h.total/hT)*100, 'of '+hT+'h this week',
          ((hT-h.total)>0?vaHM(Math.max(0,hT-h.total))+' left':'done ✓')
          +(ls?' · last shift '+escHtml(String(ls.date).slice(0,5))+' ('+ls.hrs+'h)':''));
      }
      var oaWeekTarget=T.oaDay*5;
      out+=kpi('Leads', p.week.uniq, (p.week.uniq/T.leadsWeek)*100, 'of '+T.leadsWeek+' this week');
      var _kAdd=((h&&h.keepaAdded)||0)
        +((window.state&&!state.submitted&&typeof keepaGetValues==='function')?(keepaGetValues().count||0):0);
      out+=kpi('Trackers added', _kAdd, (_kAdd/T.keepaAddWk)*100, 'of '+T.keepaAddWk+' this week');
      out+=kpi('Keepa leads', p.week.keepa, (p.week.keepa/T.keepaWk)*100, 'of '+T.keepaWk+' this week',
               p.mtd.keepa?('month '+p.mtd.keepa+(p.mtd.keepaBought?' · '+p.mtd.keepaBought+' bought':'')):'');
      out+=kpi('THC discord', p.week.thc, (p.week.thc/T.thcWk)*100, 'of '+T.thcWk+' this week',
               p.mtd.thc?('month '+p.mtd.thc):'');
      out+=kpi('Normal OA', p.week.oa, (p.week.oa/oaWeekTarget)*100, 'of '+oaWeekTarget+' this week',
               (p.mtd.oa||p.lastMonth.oa)?('month '+p.mtd.oa+(p.lastMonth.oa?' vs '+p.lastMonth.oa+' in '+p.lastMonthName.slice(0,3)+(p.mtd.oa<p.lastMonth.oa?' ▼':' ▲'):'')):'');
      /* The three ticket targets are MONTHLY and were sitting in the middle of the
         weekly ones, so the list alternated "this week / this month" and neither
         read as a set. Own section, at the end, where the month is the question. */
      /* Jack, 21/09: "needs to be prorated". A whole-month quota shown against a
         part-month count reads as failing every day until the last one — on the 21st
         it said "0 of 3 hit" while he was near pace on two of them. The bar and the
         verdict now measure against the target SO FAR; the month-end number is still
         named, because that is the number that has to be met. Pace counts Mon-Fri
         only, because that is when leads can be found. */
      var _mp=moPace();
      var _pt=function(t){ return Math.max(1,Math.round((+t||0)*_mp.frac)); };
      var _t100=_pt(T.over100Mo), _tPre=_pt(T.premiumMo), _tFla=_pt(T.flagshipMo);
      var _moDone=(p.mtd.over100>=_t100?1:0)+(p.mtd.premium>=_tPre?1:0)+(p.mtd.flagship>=_tFla?1:0);
      out+='<div class="wb-sec">'+escHtml(p.monthName)+' so far &mdash; '+_moDone+' of 3 on pace'
        +' <i style="font-weight:500;color:var(--muted-2)">(working day '+_mp.done+' of '+_mp.total+')</i></div>';
      out+=kpi('£100+', p.mtd.over100, (p.mtd.over100/_t100)*100,
               'of '+_t100+' by today &middot; '+T.over100Mo+' by month end');
      out+=kpi('Premium', p.mtd.premium, (p.mtd.premium/_tPre)*100,
               'of '+_tPre+' by today &middot; '+T.premiumMo+' by month end &middot; £200-500');
      out+=kpi('Flagship', p.mtd.flagship, (p.mtd.flagship/_tFla)*100,
               'of '+_tFla+' by today &middot; '+T.flagshipMo+' by month end &middot; £500+');
      out+='<div class="wb-r"><span>Bought</span>'
        +seg(p.week.bought,'#38bdf8','this week')
        +(p.week.spend>0?seg('£'+Math.round(p.week.spend).toLocaleString(),'#c084fc','lead buys'):'')
        +'<em>'+p.monthName.slice(0,3)+': '+p.mtd.uniq+' leads · '+p.mtd.bought+' bought'
        +(p.mtd.spend>0?' · £'+Math.round(p.mtd.spend).toLocaleString():'')+'</em></div>';
      if(p.dayOfMonth<=4&&p.lastMonth.n>0)
        out+='<div class="wb-r"><span>'+p.lastMonthName.slice(0,3)+' ended</span>'
          +seg(p.lastMonth.n,'#10d99a','leads')+seg(p.lastMonth.bought,'#38bdf8','bought')
          +seg('£'+Math.round(p.lastMonth.spend).toLocaleString(),'#c084fc','')+'</div>';
      /* Jack: "stuff the VA needs to action on the Google sheet should replace this
         bit" — a dup row needing a note is concrete and hers; a mined phrase is
         only a nudge. Sheet work wins the slot whenever any exists. */
      var _dups=[]; try{ _dups=eodDupList(whoRaw)||[]; }catch(e){}
      if(_dups.length){
        out+='<div class="wb-focus">📋 <b>'+_dups.length+' row'+(_dups.length===1?'':'s')
          +' on your sheet need'+(_dups.length===1?'s':'')+' a VA NOTE or deleting</b> — '
          +'row'+(_dups.length===1?'':'s')+' '
          +_dups.slice(0,5).map(function(x){ return x.row||'?'; }).join(', ')
          +(_dups.length>5?'…':'')+'. They don\u2019t count until fixed.</div>';
      } else {
        var focus=vaFocus(p.notes);
        if(focus.length) out+='<div class="wb-focus">🎯 '+escHtml(focus[0].label)+' <b>— Jack has said this ×'+focus[0].n+'</b></div>';
      }
      /* Jack: "do we need Full breakdown here? if we click it we can't get off it".
         No — gone. The panel's one home is the Details toggle on the shift screen,
         which opens AND closes it (plus the ✕ on the panel itself). The morning
         brief is now complete in itself: numbers, focus, Let's Go. */
      host.innerHTML=out;
      try{ lsPut('bdl_brief_'+whoRaw,out); }catch(e){}
    }catch(e){ host.innerHTML=''; }
  };
  var jobs=[];
  if(!(window.leads||[]).length&&typeof loadLeadsFromDB==='function') jobs.push(loadLeadsFromDB().catch(function(){}));
  jobs.push(vaWeekHours(whoRaw).then(function(h){ window._vaHours=h; }).catch(function(){}));
  // the newest counted shift, shown under Hours as proof the number is live
  jobs.push(fetchT(SUPABASE_URL+'/rest/v1/shifts?va=eq.'+encodeURIComponent(whoRaw)
      +'&select=date,data&order=submitted_at.desc&limit=1',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(rows){ var r0=rows&&rows[0];
      window._vaLastShift=r0?{date:r0.date,hrs:parseFloat(r0.data&&r0.data.hoursWorked)||0}:null; })
    .catch(function(){ window._vaLastShift=null; }));
  Promise.all(jobs).then(paint);
  setTimeout(paint,6000);                        // belt and braces if a fetch hangs
}
function closeWelcome() { document.getElementById('welcome-modal').classList.remove('open'); }

// ── REPORT ───────────────────────────────────────────────
var reportLog=[];
function openReportModal() { document.getElementById('report-text').value=''; document.getElementById('report-type').value='broken-link'; document.getElementById('report-modal').classList.add('open'); }
function closeReportModal() { document.getElementById('report-modal').classList.remove('open'); }
function submitReport() {
  var text=document.getElementById('report-text').value.trim();
  if(!text){showToast('Please describe the issue',true);return;}
  var rec={id:Date.now(),va:state.currentVA||'Unknown',type:document.getElementById('report-type').value,text:text,time:ukTimeString()+' UK',resolved:false};
  reportLog.push(rec);
  try{lsPut('shifttrack_reports',JSON.stringify(reportLog));}catch(e){}
  // A VA runs this on THEIR machine — localStorage alone meant Jack never saw a single
  // report. Send it to him for real: Discord straight away + the shared reports table.
  try{
    if(!IS_PREVIEW && typeof DISCORD_WEBHOOK!=='undefined' && DISCORD_WEBHOOK && rec.va!=='Test'){
      fetch(DISCORD_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({content:(getAppSettings().discordUserId?'<@'+getAppSettings().discordUserId+'> ':''),
          embeds:[{title:'⚠️ Issue reported — '+rec.va,color:15881515,
            description:String(rec.text).slice(0,1500),
            fields:[{name:'Type',value:String(rec.type||'—'),inline:true},{name:'When',value:rec.time,inline:true}],
            footer:{text:'BDL VA HQ · VA issue report'},timestamp:new Date().toISOString()}]})}).catch(function(){});
    }
  }catch(e){}
  try{
    if(DB_ENABLED && rec.va!=='Test'){
      fetch(SUPABASE_URL+'/rest/v1/reports',{method:'POST',
        headers:{'Content-Type':'application/json',apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,Prefer:'return=minimal'},
        body:JSON.stringify({id:rec.id,va:rec.va,type:rec.type,text:rec.text,time:rec.time,resolved:false})}).catch(function(){});
    }
  }catch(e){}
  closeReportModal(); showToast('Report sent to Jack ✓');
}
// Jack's Issues tab: pull what the VAs actually reported (their reports live on their machines)
function mgr_syncReports(){
  if(!DB_ENABLED) return Promise.resolve();
  return fetchT(SUPABASE_URL+'/rest/v1/reports?select=*&order=id.desc&limit=200',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(rows){
      if(!rows) return;                                   // table not created yet — stay local
      var local=mgr_getReports(), byId={};
      local.forEach(function(x){ byId[x.id]=x; });
      rows.forEach(function(x){ byId[x.id]=Object.assign({},byId[x.id]||{},x); });
      var merged=Object.keys(byId).map(function(k){ return byId[k]; }).sort(function(a,b){ return b.id-a.id; });
      try{ lsPut('shifttrack_reports',JSON.stringify(merged)); }catch(e){}
      if(typeof mgr_currentTab!=='undefined' && mgr_currentTab==='issues' && typeof mgr_renderIssues==='function') mgr_renderIssues();
    }).catch(function(){});
}
try{var sr=lsGet('shifttrack_reports');if(sr) reportLog=JSON.parse(sr);}catch(e){}

// ── LINK / LEAD HELPERS ──────────────────────────────────
function handleLinkInput(el) {
  var i=parseInt(el.dataset.ti),li=parseInt(el.dataset.li),isExtra=el.dataset.ie==='1';
  var arr=isExtra?state.extraTasks:state.tasks;
  if(!arr[i]) return;
  taskLinksEnsure(arr[i],li);
  arr[i].links[li]=el.value;
}
function handleLeadInput(el) {
  var i=parseInt(el.dataset.ti),li=parseInt(el.dataset.li),isExtra=el.dataset.ie==='1';
  var totId=el.dataset.tot;
  var arr=isExtra?state.extraTasks:state.tasks;
  if(!arr[i]) return;
  taskLinksEnsure(arr[i],li);
  var _n=parseInt(el.value); if(!isFinite(_n)) _n=0;
  arr[i].linkLeads[li]=Math.max(0,Math.min(999,_n));      // "-9" was stored as -9 and subtracted from her total
  var total=arr[i].linkLeads.reduce(function(s,v){return s+(parseInt(v)||0);},0);
  arr[i].leads=total;
  var totEl=document.getElementById(totId);
  if(totEl) totEl.textContent=total;
  qlSync(i,isExtra,true);
}
function handleAddLink(btn) {
  var cId=btn.dataset.cid,totId=btn.dataset.tot;
  var i=parseInt(btn.dataset.ti),isExtra=btn.dataset.ie==='1';
  var arr=isExtra?state.extraTasks:state.tasks;
  if(!arr[i]) return;
  if(!arr[i].links) arr[i].links=[];
  var newIdx=Math.max((arr[i].links||[]).length,(arr[i].linkNames||[]).length);
  taskLinksEnsure(arr[i],newIdx);
  var container=document.getElementById(cId);
  if(!container) return;
  var row=document.createElement('div');
  row.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:8px;';
  row.innerHTML='<span style="font-size:10px;color:var(--muted);min-width:18px;text-align:right;font-family:var(--font-mono);">'+(newIdx+1)+'</span>'
    +'<input class="field-input" type="text" placeholder="Paste link here..." style="flex:1;" data-ti="'+i+'" data-li="'+newIdx+'" data-ie="'+(isExtra?1:0)+'" oninput="handleLinkInput(this)">'
    +'<input class="field-input" type="number" placeholder="0" min="0" style="width:60px;flex-shrink:0;text-align:center;" data-ti="'+i+'" data-li="'+newIdx+'" data-ie="'+(isExtra?1:0)+'" data-tot="'+totId+'" oninput="handleLeadInput(this)">';
  container.appendChild(row);
  row.querySelector('input').focus();
}

// ── CLOCKS ───────────────────────────────────────────────
function format12hr(date, tz) { return date.toLocaleTimeString('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:true}); }
function formatShortDate(tz) {
  var now=new Date();
  var day=now.toLocaleDateString('en-GB',{timeZone:tz,weekday:'short'});
  var d=now.toLocaleDateString('en-GB',{timeZone:tz,day:'numeric'});
  return day+' '+d;
}
function phHour() {
  return parseInt(new Date().toLocaleString('en-US',{timeZone:'Asia/Manila',hour:'numeric',hour12:false}));
}
function breakEmoji() {
  var h=phHour();
  // Morning (before noon PH) = coffee, after noon = adobo (Philippine national dish)
  return h<12 ? '☕' : '🍖';
}
function breakLabel() {
  return breakEmoji()+' Take a Break';
}
function updateClocks() {
  var now=new Date();
  var u=document.getElementById('uk-clock'); if(u) u.textContent=format12hr(now,'Europe/London');
  var p=document.getElementById('ph-clock'); if(p) p.textContent=format12hr(now,'Asia/Manila');
  var ud=document.getElementById('uk-date'); if(ud) ud.textContent=formatShortDate('Europe/London');
  var pd=document.getElementById('ph-date'); if(pd) pd.textContent=formatShortDate('Asia/Manila');
  // Update break button emoji based on PH time
  var btn=document.getElementById('break-btn');
  if(btn&&!document.getElementById('break-overlay').style.display.includes('flex')) {
    btn.innerHTML=breakLabel();
  }
}
updateClocks();
renderNewsletterSchedulePanels();
setInterval(updateClocks,1000);

// ── NAV TOGGLE ────────────────────────────────────────────
function navMgrToggle() {
  var isManager=document.getElementById('view-manager').classList.contains('active');
  if(isManager) { showVAView(); }
  else if(window._mgrUnlocked) { _openManager(); }
  else { window._pinTarget='manager'; unlockManager(); }
}
function updateNavBtn() {
  var btn=document.getElementById('nav-mgr-btn');
  if(!btn) return;
  var isManager=document.getElementById('view-manager').classList.contains('active');
  if(isManager) {
    btn.innerHTML='&#8592; VA View';
    btn.style.background='rgba(45,212,163,0.1)';
    btn.style.borderColor='rgba(45,212,163,0.3)';
    btn.style.color='var(--green)';
  } else {
    btn.innerHTML='Jack View';
    btn.style.background='rgba(155,143,255,0.1)';
    btn.style.borderColor='rgba(155,143,255,0.3)';
    btn.style.color='var(--accent)';
  }
}

// ── TOAST ────────────────────────────────────────────────
function showToast(msg,isError) {
  var t=document.getElementById('toast');
  t.innerHTML=msg;
  t.className='toast'+(isError?' error':'')+' show';
  // Each call used to start its own 3s timer without cancelling the previous one, so
  // the FIRST timer closed the SECOND message early — a VA ticking tasks quickly saw
  // confirmations flash away after half a second. Errors also get longer to read.
  clearTimeout(window._toastT);
  window._toastT=setTimeout(function(){ t.className='toast'+(isError?' error':''); }, isError?5000:3000);
}

