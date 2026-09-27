/* ── DOES WHAT SHE LOGGED MATCH THE SHEET? ──────────────────────────────────
   Two independent numbers exist for a shift: the leads the VA types onto her tasks, and
   the rows that actually reached the lead sheet. Nothing has ever compared them, so a
   shift claiming 15 against 9 real rows looked perfect. Not an accusation — a miscount
   is usually a task counted twice or a row that hasn't synced — so it shows the EVIDENCE
   and still lets her submit. Jack sees the same numbers instead of finding it weeks on. */
function eodLeadCheck(va){
  try{
    var code=(typeof vaCode==='function')?vaCode(va):(va==='Mera'?'VA M':va==='Suz'?'VA S':null);
    if(!code) return null;
    /* Jack, 21/09: "this should only be todays / this shifts". Mera works Manila hours,
       so "dated today" is the wrong window twice over: rows she typed last shift can
       carry today's date, and rows she types THIS shift can carry yesterday's. Measured
       on her 21/09 shift (clocked in 07:24) — rows 161-164 were dated 20/09 and created
       19-20/09, yet were being counted and shown back to her as today's work.
       This shift = created since she clocked in. Falls back to the date when there is no
       shift running (Jack looking at it, or a resumed shift with no start time). */
    var today=ukDateShort();
    var startMs=(window.state&&state.shiftStart)?+state.shiftStart:0;
    var sinceH=startMs?(((Date.now()-startMs)/3600000)+1.5):null;   // +1.5h covers sheet-sync lag
    var sheet=(window.leads||[]).filter(function(l){
      if(!l||l.va!==code) return false;
      if(sinceH!=null) return (typeof l.hrs==='number') && l.hrs<=sinceH;
      return String(l.date||'').slice(0,10)===today;
    });
    var claimed=0;
    (state.tasks||[]).concat(state.extraTasks||[]).forEach(function(t){
      var n=parseInt(t&&t.leads); if(!isNaN(n)) claimed+=n;
    });
    return { claimed:claimed, onSheet:sheet.length, diff:claimed-sheet.length, rows:sheet };
  }catch(e){ return null; }
}
function eodLeadCheckHTML(va){
  var c=eodLeadCheck(va);
  if(!c) return '';
  if(!c.claimed && !c.onSheet) return '';
  if(c.diff===0){
    return '<div class="eod-lc ok">\u2713 <b>'+c.onSheet+' leads</b> logged and '+c.onSheet+' on your lead sheet \u2014 they match.</div>';
  }
  var more=c.diff>0;
  // Row numbers so she can go straight to the line on her sheet; <details> so five
  // rows don't become fifteen when the day is busy.
  function li(l){
    return '<li>'+(l.sheetRow?'<b class="eod-lc-row">row '+l.sheetRow+'</b>':'')
      +escHtml(String(l.title||'(untitled)').slice(0,54))+'</li>';
  }
  var first=c.rows.slice(0,5).map(li).join('');
  var rest =c.rows.slice(5).map(li).join('');
  // The </ul> inside <details> was missing, so the parser closed the list early and the
  // "hidden" rows spilled OUT of the toggle — they showed whether it was open or not.
  // Label says how many MORE there are; "view all 13" over 8 rows was wrong twice over.
  var titles=first+(rest
    ? '</ul><details class="eod-lc-more"><summary>show the other '+(c.rows.length-5)+'</summary>'
      +'<ul>'+rest+'</ul></details><ul style="display:none">'
    : '');
  return '<div class="eod-lc warn">'
    +'<div class="eod-lc-h">\u26a0\ufe0f Your leads don\u2019t match your sheet</div>'
    +'<div class="eod-lc-n"><b>'+c.claimed+'</b> logged on your tasks &nbsp;vs&nbsp; <b>'+c.onSheet+'</b> on the lead sheet today'
      +' <span>('+(more?('+'+c.diff+' more logged than found'):((-c.diff)+' more on the sheet than logged'))+')</span></div>'
    +'<div class="eod-lc-b">'+(more
        ? 'Usually a task counted twice, or a row that hasn\u2019t synced yet. Worth a check before you submit.'
        : 'Some leads on the sheet weren\u2019t counted against a task \u2014 your leads/hour will read low.')
    +'</div>'
    +(titles?'<div class="eod-lc-l">On the sheet today'
      +(c.rows[0]&&c.rows[0].sheetTab?' (tab '+escHtml(c.rows[0].sheetTab)+')':'')
      +':<ul>'+titles+'</ul></div>':'')
    +'<div class="eod-lc-f">You can still submit \u2014 Jack sees the same numbers.</div>'
    +'</div>';
}
/* Jack, 03/09: "before the VA finishes the shift they should have a message saying
   leads x x x are missing xxx". Today's rows on her sheet, checked for the fields
   Jack cannot decide without. Supplier link is not demanded on Amazon-store rows
   (the Amazon link IS the source there). A prnt.sc screenshot is called out by
   name: it exists, but Jack's connection cannot open it, so it is as good as missing. */
function eodMissingList(va){
  var c=eodLeadCheck(va); if(!c||!c.rows||!c.rows.length) return [];
  var out=[];
  c.rows.forEach(function(l){
    var miss=[];
    if(!String(l.src||'').trim())   miss.push('source method');
    if(!String(l.store||'').trim()) miss.push('store');
    var amazonStore=/amazon/i.test(String(l.store||''));
    if((!l.sup||l.sup==='#') && !amazonStore) miss.push('supplier link');
    var sh=String(l.screenshot||'').trim();
    /* Jack, 21/09: "prnt.sc is fine — so n/a these errors". He can open them now, so a
       prnt.sc link is a screenshot like any other. Only a MISSING one is worth saying. */
    if(!sh) miss.push('screenshot');
    if(miss.length) out.push({row:l.sheetRow, tab:l.sheetTab, title:String(l.title||'(untitled)').slice(0,46), miss:miss});
  });
  out.sort(function(a,b){ return (a.row||0)-(b.row||0); });
  return out;
}
function eodMissingHTML(va){
  var m=eodMissingList(va);
  if(!m.length) return '';
  var li=m.map(function(x){
    return '<li'+(eodIsAcked('miss:'+x.row)?' class="acked"':'')+'><b class="eod-lc-row">row '+(x.row||'?')+'</b>'+escHtml(x.title)
      +' <span class="eod-lc-miss">\u2014 missing: '+escHtml(x.miss.join(', '))+'</span> '
      +eodAckBtn('miss:'+x.row,'Row '+x.row+' missing '+x.miss.join(', '))+'</li>';
  });
  var first=li.slice(0,6).join(''), rest=li.slice(6).join('');
  var list=first+(rest
    ? '</ul><details class="eod-lc-more"><summary>show the other '+(li.length-6)+'</summary><ul>'+rest+'</ul></details><ul style="display:none">'
    : '');
  return '<div class="eod-lc warn">'
    +'<div class="eod-lc-h">\u26a0\ufe0f '+m.length+' of today\u2019s leads '+(m.length===1?'is':'are')+' missing details</div>'
    +'<div class="eod-lc-b">Jack can\u2019t decide a lead he can\u2019t see the source or screenshot for \u2014 fill these in on your sheet before you submit.</div>'
    +'<div class="eod-lc-l"><ul>'+list+'</ul></div>'
    +'</div>';
}
/* ── SHE MUST DEAL WITH IT BEFORE SHE CAN FINISH ─────────────────────────────
   Jack, 21/09: "the VAs must fix or press acknowledge button — they must solve it
   before they end shift". Warning, then letting a second tap through, made the fix
   optional — and optional meant skipped. Now every flagged row stays outstanding
   until she either FIXES it on the sheet (it disappears on the next re-read) or
   presses Acknowledge on that row and says why.
   Acknowledge is not a silent escape hatch: what she waves through is stamped into
   her shift record with her reason, so Jack sees exactly what was left and why.
   It is still never a hard trap — a sheet that will not sync must not strand her. */
function eodAckStore(){ if(!state._eodAck||typeof state._eodAck!=='object') state._eodAck={}; return state._eodAck; }
function eodIsAcked(id){ return !!eodAckStore()[id]; }
function eodAck(id,label){
  var why=prompt('Acknowledging: '+(label||id)+'\n\nOne line for Jack — why is this being left?','');
  if(why===null) return;
  eodAckStore()[id]={at:new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false}),
                     why:String(why||'').trim().slice(0,120), what:String(label||id).slice(0,90)};
  try{ saveShiftDraft(false); }catch(e){}
  try{ eodRenderLeadCheck(); }catch(e){}
  try{ showToast('Acknowledged \u2014 Jack will see it'); }catch(e){}
}
function eodUnack(id){ delete eodAckStore()[id]; try{ saveShiftDraft(false); }catch(e){} try{ eodRenderLeadCheck(); }catch(e){} }
/* every open issue in one place, so the panel and the Submit button cannot disagree */
/* Jack, 21/09: "shouldn't even have 1 — they need to say why before they finish their
   shift, otherwise get rid of the row."
   So a DUPLICATE is a hard issue: acknowledging it inside ShiftTrack fixes nothing,
   because the row is still red on the sheet and Jack still cannot see the lead. The
   only two real outcomes are a VA NOTE on the sheet, or the row deleted — and both are
   proved by re-reading the sheet, not by her ticking something here.
   Missing details and loss-makers keep the acknowledge route: those are judgement calls
   she can be accountable for. A duplicate is not.
   The one exception is an unreadable sheet — if the re-read itself fails she is not
   blocked, because "we couldn't check" must never read as "she didn't do it". */
function eodIssues(va){
  var out=[];
  try{ eodMissingList(va).forEach(function(m){ out.push({id:'miss:'+m.row, kind:'missing details', label:'Row '+m.row+' missing '+m.miss.join(', ')}); }); }catch(e){}
  try{ eodDupList(va).forEach(function(d){ out.push({id:'dup:'+d.row, kind:'duplicate', hard:true, label:'Row '+d.row+' duplicate'}); }); }catch(e){}
  try{ eodLossList(va).forEach(function(l){ out.push({id:'loss:'+l.row, kind:'loses money', label:'Row '+l.row+' loses money'}); }); }catch(e){}
  return out;
}
/* she fixed it on the sheet — go and look, rather than take her word for it */
var _eodRechecking=false;
function eodRecheck(){
  if(_eodRechecking) return;
  _eodRechecking=true;
  try{ showToast('Re-reading your sheet\u2026'); }catch(e){}
  var before=0; try{ before=eodOpenIssues(state.currentVA).length; }catch(e){}
  Promise.resolve()
    .then(function(){ return (typeof loadLeadsFromDB==='function')?loadLeadsFromDB():null; })
    .then(function(){
      window._eodSheetUnreadable=false;
      /* _duxSig is (rows : first id) — a note added to an existing row changes neither,
         so the cached duplicate map has to be rebuilt by hand or she stays blocked
         after doing exactly what she was asked. */
      try{ if(typeof buildDupUnexplainedMap==='function'){ buildDupUnexplainedMap(); _duxSig=null; } }catch(e){}
      var after=0; try{ after=eodOpenIssues(state.currentVA).length; }catch(e){}
      try{ eodRenderLeadCheck(); }catch(e){}
      if(after<before) showToast('\u2713 '+(before-after)+' sorted \u2014 '+(after?after+' left':'nothing left'));
      else if(!after)  showToast('\u2713 All clear');
      else             showToast('Still showing '+after+' \u2014 add the note on your sheet, or delete the row',true);
    })
    .catch(function(){
      /* could not read the sheet at all — that is our problem, not hers */
      window._eodSheetUnreadable=true;
      try{ eodRenderLeadCheck(); }catch(e){}
      showToast('Couldn\u2019t read your sheet \u2014 you can still submit',true);
    })
    .then(function(){ _eodRechecking=false; });
}
function eodOpenIssues(va){ return eodIssues(va).filter(function(x){ return !eodIsAcked(x.id); }); }
function eodAckBtn(id,label){
  var safe=String(label||'').replace(/['"\\]/g,'');
  return eodIsAcked(id)
    ? '<button class="eod-ack done" onclick="eodUnack(\''+id+'\')" title="'+escHtml(String((eodAckStore()[id]||{}).why||''))+'">\u2713 acknowledged \u2014 undo</button>'
    : '<button class="eod-ack" onclick="eodAck(\''+id+'\',\''+safe+'\')">Acknowledge</button>';
}
function eodGateHTML(va){
  var open=eodOpenIssues(va), acked=Object.keys(eodAckStore()).length;
  if(!open.length){
    return '<div class="eod-gate ok">\u2713 Nothing outstanding \u2014 you can finish.'
      +(acked?' <span>'+acked+' acknowledged</span>':'')+'</div>';
  }
  var by={}; open.forEach(function(x){ by[x.kind]=(by[x.kind]||0)+1; });
  var hard=open.filter(function(x){ return x.hard; }).length;
  return '<div class="eod-gate">\u26a0\ufe0f <b>'+open.length+' thing'+(open.length===1?'':'s')+' to sort before you finish</b>'
    +'<span>'+Object.keys(by).map(function(k){ return by[k]+' '+k; }).join(' \u00b7 ')+'</span>'
    +'<em>'+(hard
       ? '<b style="color:#f5a524">'+hard+' duplicate'+(hard===1?'':'s')+' must be sorted on your sheet</b> \u2014 a note saying why, or delete the row. The rest you can acknowledge.'
       : 'Fix it on your sheet, or press Acknowledge on the row and say why.')+'</em></div>';
}
function eodRenderLeadCheck(){
  var el=document.getElementById('eod-leadcheck');
  var va=(state.currentVA==='Test'?state._previewAs:state.currentVA);
  if(!el) return;
  var html=eodGateHTML(va)+eodLeadCheckHTML(va)+eodMissingHTML(va)+eodDupCheckHTML(va)+eodLossHTML(va);
  if(el._lcLast===html) return;
  el._lcLast=html; el.innerHTML=html;
}
/* Jack, 14/09: "number 2 should flag before she finishes a shift" — Nescafé Decaf went on
   Suz's sheet at -£1.11 profit, -11% ROI. A lead that loses money on the numbers she typed
   is either a typo or not a lead. Today's rows only: it is her day she is closing out. */
function eodLossList(va){
  var c=eodLeadCheck(va); if(!c||!c.rows||!c.rows.length) return [];
  var out=[];
  c.rows.forEach(function(l){
    var pr=parseFloat(l.profit);
    if(isNaN(pr) || pr>=0) return;
    out.push({ row:l.sheetRow, title:String(l.title||'(untitled)').slice(0,46), profit:pr, roi:parseFloat(l.roi)||0 });
  });
  out.sort(function(a,b){ return (a.row||0)-(b.row||0); });
  return out;
}
function eodLossHTML(va){
  var m=eodLossList(va);
  if(!m.length) return '';
  var li=m.map(function(x){
    return '<li'+(eodIsAcked('loss:'+x.row)?' class="acked"':'')+'><b class="eod-lc-row">row '+(x.row||'?')+'</b>'+escHtml(x.title)
      +' <span style="color:#ff6b81;font-weight:800;">−£'+Math.abs(x.profit).toFixed(2)
      +(x.roi?' · '+x.roi.toFixed(0)+'% ROI':'')+'</span> '
      +eodAckBtn('loss:'+x.row,'Row '+x.row+' loses money')+'</li>';
  }).join('');
  return '<div class="eod-lc warn">'
    +'<div class="eod-lc-h">💸 '+m.length+' of today’s leads '+(m.length===1?'loses':'lose')+' money</div>'
    +'<div class="eod-lc-l"><ul>'+li+'</ul></div>'
    +'<div class="eod-lc-b" style="margin-top:7px">Check the buy price, sell price and fees on your sheet. '
    +'If the numbers are right it isn’t a lead — <b>delete the row</b>. If one is a typo, fix it before you submit.</div>'
    +'</div>';
}
/* ── DUPS SHE STILL HAS TO DEAL WITH ──────────────────────────────────────────
   Jack's rule: a repeat is only allowed if there is a reason — different
   supplier, cheaper, or something typed in VA NOTE. Same supplier at the same
   or a higher price with no note is not a lead, it is a row to delete.
   Measured before this existed: 104 such rows across two months, 64 Mera and
   40 Suz, and six of them sent the SAME DAY within a few rows of each other.
   It is her job to clear them, so she gets the list at the end of her own
   shift with the row numbers — not Jack, at review, a week later. */
function eodDupList(va){
  /* Rewritten to Jack's final rule (30/08): SAME MONTH only — cross-month repeats
     are always fine — and exactly the predicate the KPIs and his board use, so
     what she is asked to fix is precisely what is being held back. */
  var code=(va==='Mera')?'VA M':(va==='Suz')?'VA S':null;
  if(!code) return [];
  var out=[];
  try{
    (window.leads||[]).forEach(function(l){
      if(l.va!==code) return;
      if(l.status||l.islead!==null) return;               // decided — Jack has seen it
      if(!ldDupUnexplained(l)) return;
      out.push({ row:l.sheetRow, tab:l.sheetTab,
                 title:String(l.title||'(untitled)').slice(0,46),
                 price:parseFloat(l.buy)||0 });
    });
  }catch(e){}
  out.sort(function(a,b){ return (b.row||0)-(a.row||0); });
  return out;
}
/* eodDupListOLD removed 31/08 — superseded by the same-month predicate above,
   kept dead for two builds by mistake. */
function eodDupCheckHTML(va){
  /* Jack, 31/08, on what this must actually say: "it needs to mention how row 122
     is RED - it needs a VA note or this lead won't be looked at to buy and is
     hidden until there is a note". So: name the row, name the colour she can see
     in her own sheet, and state the consequence plainly. The old wording led with
     "duplicate leads to sort", which is admin language for something that is
     actually costing her the lead. */
  var d=eodDupList(va);
  if(!d.length) return '';
  var rows=d.slice(0,8).map(function(x){
    return '<li'+(eodIsAcked('dup:'+x.row)?' class="acked"':'')+'><b class="eod-lc-row">row '+(x.row||'?')+'</b>'+escHtml(x.title)
      +' <span style="color:#ff6b81;font-weight:800;font-size:10.5px;">RED</span> '
      +'<button class="eod-ack" onclick="eodRecheck()">I\u2019ve fixed it \u2014 re-check</button></li>';
  }).join('');
  var more=d.length>8?'<div class="eod-lc-b" style="margin-top:6px">&hellip;and '+(d.length-8)+' more.</div>':'';
  return '<div class="eod-lc warn">'
    +'<div class="eod-lc-h">\u267b\ufe0f '+d.length+' lead'+(d.length===1?' is':'s are')
      +' <span style="color:#ff6b81">RED</span> on your sheet &mdash; fix before you finish</div>'
    +'<div class="eod-lc-l"><ul>'+rows+'</ul></div>'+more
    +'<div class="eod-lc-b" style="margin-top:9px">'
    +'You already sent '+(d.length===1?'this':'these')+' this month at the <b>same supplier and the same price</b>. '
    +'<b style="color:#ff6b81">Jack cannot see '+(d.length===1?'it':'them')+' and will not buy '
    +(d.length===1?'it':'them')+' &mdash; '+(d.length===1?'it is':'they are')+' hidden until you add a note.</b>'
    +'</div>'
    +'<div class="eod-lc-b" style="margin-top:7px">'
    +'\u2192 Put <b>why</b> in the <b>VA NOTE</b> column (back in stock, new promotion, better offer&hellip;). '
    +'The cell turns <b style="color:#e3c02b">YELLOW</b> and the lead counts again.<br>'
    +'\u2192 Or <b>delete the row</b> if there is no reason.<br>'
    +'<b style="color:#f5a524">You can\u2019t finish your shift with one of these unexplained</b> \u2014 '
    +'a note or a deleted row, nothing else will clear it.<br>'
    +'<span style="color:var(--muted-2)">(A <b style="color:#3ac478">GREEN</b> cell is already fine &mdash; '
    +'different supplier or the price changed. Nothing to do there.)</span>'
    +'</div></div>';
}
function payMoney(n){
  n=+n||0;
  return '\u00a3'+n.toFixed(2).replace(/\.00$/,'');
}
function payOtText(iso){
  var h=payOtHours(iso); if(!h) return '';
  return h+'h OT \u00d7 '+payOtRate()+' = '+payMoney(payOtAmount(iso));
}
function payRunBy(k){ return payRuns().filter(function(r){return r.k===k;})[0]||payRuns()[0]; }
/* plain-English summary of a run's schedule, for the settings card and the banner */
function payRunDesc(r){
  if(!r) return '';
  if(r.type==='monthly'){
    var d=(r.days||[]).slice().sort(function(a,b){return a-b;});
    if(!d.length) return 'no days set';
    var ord=function(n){ var sfx=(n%10===1&&n!==11)?'st':(n%10===2&&n!==12)?'nd':(n%10===3&&n!==13)?'rd':'th'; return n+sfx; };
    var has31=d.indexOf(31)>=0, has30=d.indexOf(30)>=0;
    return 'the '+d.map(ord).join(' & ')+' of each month'
      +((has31||has30)?' (shorter months use the last day)':'');
  }
  var n=parseInt(r.everyWeeks)||1;
  return (n===1?'every ':'every '+n+' ')+(n===1?'':'weeks on ')+PAY_WEEKDAYS[(r.weekday==null?5:r.weekday)]+(n===1?' (weekly)':'');
}
function payPeople(){
  var s=getAppSettings();
  if(Array.isArray(s.payPeople)&&s.payPeople.length) return s.payPeople;
  return [{name:'Mera',run:'sourcing'},{name:'Suz',run:'sourcing'}];   // until Jack edits it
}
function payPeopleSet(arr){
  var s=getAppSettings(); s.payPeople=arr; saveAppSettings(s);
  try{ pushSettingsCloud(s); }catch(e){}
}
function payPeopleFor(runK){ return payPeople().filter(function(p){ return (p.run||'sourcing')===runK; }); }
/* the due-date maths for whichever run */
function payRunCycle(runK,ref){
  ref=ref||payUKNow();
  var r=payRunBy(runK);
  var day=new Date(ref.getFullYear(),ref.getMonth(),ref.getDate());
  if(r && r.type==='monthly'){
    var days=(r.days||[]).slice().sort(function(a,b){return a-b;});
    if(!days.length) days=[15];
    function nth(y,m,d){ var last=new Date(y,m+1,0).getDate(); return new Date(y,m,Math.min(d,last)); }
    var cands=[];
    [-1,0,1].forEach(function(off){
      days.forEach(function(d){ cands.push(nth(day.getFullYear(),day.getMonth()+off,d)); });
    });
    cands.sort(function(a,b){ return a-b; });
    var last=cands[0], next=cands[cands.length-1];
    cands.forEach(function(c){ if(c<=day) last=c; });
    for(var i=0;i<cands.length;i++){ if(cands[i]>day){ next=cands[i]; break; } }
    return { last:payISO(last), next:payISO(next), isPayday:payISO(day)===payISO(last),
             daysToNext:Math.round((next-day)/86400000) };
  }
  // every N weeks on a given weekday, counted from the anchor
  var every=(parseInt(r&&r.everyWeeks)||2)*7;
  var a=String((r&&r.anchor)||PAY_ANCHOR).split('-');
  var anchor=new Date(+a[0],+a[1]-1,+a[2]);
  var diff=Math.floor((day-anchor)/86400000);
  var n=Math.floor(diff/every);
  var last=new Date(anchor); last.setDate(anchor.getDate()+n*every);
  var next=new Date(last);   next.setDate(last.getDate()+every);
  return { last:payISO(last), next:payISO(next), isPayday:payISO(day)===payISO(last),
           daysToNext:Math.round((next-day)/86400000) };
}
/* Reminder taper. Day 0-2: three a day. Day 3+: midday only. Day 10: one last message,
   then silence — an alert that never stops is an alert you stop reading. */
var PAY_TAPER_DAYS=3, PAY_GIVEUP_DAYS=10;
/* Jack, 31/08: the Discord reminder said "Every 2 weeks, Friday" for a run he had
   moved to the 15th & last day months ago. The label was TYPED IN — 'admin' got
   "15th & 30th", everything else got the fortnightly text — so it described a
   schedule that no longer existed while the DATES beside it were right. Say what
   the settings actually hold. */
function payScheduleText(run){
  try{
    if(run && run.type==='monthly'){
      var d=(run.days||[]).slice().sort(function(a,b){ return a-b; });
      if(!d.length) return 'monthly';
      var parts=d.map(function(x){
        if(x>=29) return 'last day';                        // 31 in a short month = its last day
        var sfx=(x%10===1&&x!==11)?'st':(x%10===2&&x!==12)?'nd':(x%10===3&&x!==13)?'rd':'th';
        return x+sfx;
      });
      return parts.join(' & ')+' of each month';
    }
    var wk=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][(run&&run.weekday)||5]||'Friday';
    var ev=parseInt(run&&run.everyWeeks)||2;
    return (ev===1?'Every week, ':'Every '+ev+' weeks, ')+wk;
  }catch(e){ return 'see settings'; }
}
function payFlagKey(iso){ return 'paid_'+iso; }
function payIsPaid(iso){
  try{ if(lsGet('bdl_'+payFlagKey(iso))==='1') return true; }catch(e){}
  return !!(window._payPaid&&window._payPaid[iso]);
}
/* pull the shared flag so the app agrees with whatever the Discord button did */
function payCheckCloud(){
  if(!DB_ENABLED) return Promise.resolve();
  var keys=payRuns().map(function(r){ return payFlagKey(r.k+'_'+payRunCycle(r.k).last); });
  return fetchT(SUPABASE_URL+'/rest/v1/app_flags?k=in.('+keys.map(encodeURIComponent).join(',')+')&select=k',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}})
    .then(function(r){ return r.ok?r.json():[]; })
    .then(function(rows){
      window._payPaid=window._payPaid||{};
      var inCloud={};
      (rows||[]).forEach(function(r){
        var iso=String(r.k).replace(/^paid_/,'');
        inCloud[iso]=true;
        window._payPaid[iso]=true;
        try{ lsPut('bdl_paid_'+iso,'1'); }catch(e){}
      });
      // ...and push UP anything this device believes is paid but the cloud has never
      // heard about. Without this a single failed write left the run unpaid forever as
      // far as the reminder job was concerned, while this browser showed it as done.
      payRuns().forEach(function(r){
        var key=r.k+'_'+payRunCycle(r.k).last;
        if(inCloud[key]) return;
        var localSays=false;
        try{ localSays=lsGet('bdl_'+payFlagKey(key))==='1'; }catch(e){}
        if(localSays) payWriteFlag(key);
      });
      try{ if(mgr_currentTab==='overview') mgr_renderOverview(); }catch(e){}
    }).catch(function(){});
}
/* Marking pay as paid MUST reach the cloud, because the GitHub Action that sends the
   reminders reads only Supabase — it cannot see this browser's localStorage. The old
   version wrote localStorage, fired the cloud POST with `.catch(function(){})` and then
   said "reminders stopped" regardless. When that write failed the banner vanished here
   while the Action carried on pinging every slot, forever, with no way to tell why.
   Nothing is treated as paid now until the database confirms it. */
async function payMarkPaid(runK){
  runK=runK||'sourcing';
  var run=payRunBy(runK);
  var cyc=payRunCycle(runK);
  var c={last:runK+'_'+cyc.last, next:cyc.next};
  if(payIsPaid(c.last)) return;

  if(IS_PREVIEW || !DB_ENABLED){
    window._payPaid=window._payPaid||{}; window._payPaid[c.last]=true;
    try{ showToast('Marked as paid \u2713 (preview \u2014 nothing sent)'); }catch(e){}
    try{ mgr_renderOverview(); }catch(e){}
    return;
  }

  var ok=await payWriteFlag(c.last);
  if(!ok){
    // do NOT record it locally — that is what hid the failure last time
    try{ showToast('Couldn\'t record that \u2014 you\'re still offline, so the reminders will keep coming. Try again in a moment.', true); }catch(e){}
    return;
  }
  window._payPaid=window._payPaid||{}; window._payPaid[c.last]=true;
  try{ lsPut('bdl_'+payFlagKey(c.last),'1'); }catch(e){}
  var hook=DISCORD_PAY_WEBHOOK||DISCORD_WEBHOOK;
  if(hook){
    fetch(hook,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({embeds:[{title:'\u2705 '+run.label+' pay \u2014 done',color:3066993,
        description:'**'+payPeopleFor(runK).map(function(p){return p.name;}).join(' & ')+'** paid for '+payFmt(cyc.last)+'.\nReminders for this run have stopped.',
        fields:[{name:'Next '+run.label.toLowerCase()+' pay',value:'**'+payFmt(cyc.next)+'**',inline:true}],
        footer:{text:'BDL VA HQ \u00b7 pay'},timestamp:new Date().toISOString()}]})}).catch(function(){});
  }
  try{ showToast('Marked as paid \u2713 \u2014 reminders stopped'); }catch(e){}
  try{ mgr_renderOverview(); }catch(e){}
}
/* Straight question to the database: has this run been marked paid?
   Returns 'paid' | 'unpaid' | 'unknown'.

   'unknown' (offline, timeout, HTTP error) is deliberately NOT treated as unpaid.
   A reminder fired because a network call blipped is worse than one that turns up
   four hours late — the GitHub Action covers the same slots either way. */
function payCloudPaid(key){
  if(!DB_ENABLED) return Promise.resolve('unknown');
  return fetchT(SUPABASE_URL+'/rest/v1/app_flags?k=eq.'+encodeURIComponent(payFlagKey(key))+'&select=k',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(rows){
      if(!Array.isArray(rows)) return 'unknown';
      if(!rows.length) return 'unpaid';
      // learned something — cache it so the banner agrees too
      window._payPaid=window._payPaid||{}; window._payPaid[key]=true;
      try{ lsPut('bdl_'+payFlagKey(key),'1'); }catch(e){}
      return 'paid';
    }).catch(function(){ return 'unknown'; });
}
/* one place that actually confirms the write landed */
async function payWriteFlag(key){
  try{
    var res=await fetch(SUPABASE_URL+'/rest/v1/app_flags',{method:'POST',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json',
               Prefer:'resolution=ignore-duplicates,return=minimal'},
      body:JSON.stringify({k:payFlagKey(key),v:'paid'})});
    return res.ok;
  }catch(e){ return false; }
}
/* Reminder pings — every 4h from 12pm UK on payday until it's marked paid.
   Runs whenever the app is open; an app_flags insert per time-slot means reloading the
   page or having it open on two machines can't double-ping. (For pings while the app is
   CLOSED, the optional Apps Script cron covers the same slots using the same flags.) */
function payPingCheck(){
  try{
    if(IS_PREVIEW||!DB_ENABLED) return;
    // Pay reminders are Jack's business, and this timer used to run in EVERY browser
    // with the app open — Mera's, Suz's, Sarah's. Their devices have no idea what has
    // been paid (see below), so they pinged him about pay he had already sent.
    if(!window._mgrUnlocked) return;
    var s=getAppSettings();
    if(s.nPay===0) return;
    var hook=(s.whPay||'').trim()||DISCORD_PAY_WEBHOOK||DISCORD_WEBHOOK;
    if(!hook) return;
    var now=payUKNow();
    var mins=now.getHours()*60+now.getMinutes();
    // 12pm / 4pm / 8pm UK only — no overnight pings
    if(mins<12*60||mins>=22*60) return;
    var today=payISO(new Date(now.getFullYear(),now.getMonth(),now.getDate()));
    // whichever run is due and unpaid — sourcing and admin are tracked separately
    /* Jack, 31/08: "but only sourcing not admin va - why not?" — this loop used to
       `break` on the first run that was due and unpaid. Sourcing sits first in the
       list, so while it was outstanding the admin run was never even looked at, and
       Sarah's pay went unreminded every single cycle. Every due run gets its own
       reminder now; they are separate people and separate money. */
    var due=[];
    var _runs=payRuns();
    for(var i=0;i<_runs.length;i++){
      var r=_runs[i];
      if(!payPeopleFor(r.k).length) continue;
      var cyc=payRunCycle(r.k);
      if(payIsPaid(r.k+'_'+cyc.last)) continue;
      if(today<cyc.last) continue;
      var d=Math.round((new Date(today)-new Date(cyc.last))/86400000);
      if(d===0 && mins<12*60) continue;
      due.push({run:r, c:cyc, daysOver:d});
    }
    if(!due.length) return;
    due.forEach(function(item){ payPingSend(item.run, item.c, item.daysOver, s, hook, mins); });
  }catch(e){}
}
/* one run's reminder — split out of payPingCheck so several can go in the same tick */
function payPingSend(run, c, daysOver, s, hook, mins){
  try{
    // Three pings a day, every day, for ever is how a reminder becomes noise you ignore.
    // Days 0-2: 12pm / 4pm / 8pm. Days 3-9: 12pm only. Day 10: one final message, then stop.
    var hourSlot=Math.floor((mins-12*60)/240);          // 0 = 12pm, 1 = 4pm, 2 = 8pm
    if(daysOver>=PAY_GIVEUP_DAYS+1) return;             // already said goodbye
    var finalNotice=(daysOver===PAY_GIVEUP_DAYS);
    if(daysOver>=PAY_TAPER_DAYS && hourSlot!==0) return; // past day 3 → midday only
    var slot=daysOver*3+hourSlot;
    var key='payping_'+run.k+'_'+c.last+'_'+slot;
    // ASK THE DATABASE, not this browser. payIsPaid() in the loop above reads only
    // localStorage plus an in-memory map that payCheckCloud() fills — and payCheckCloud
    // only ever ran inside Jack's manager init. Any device that hadn't run it believed
    // the pay was outstanding for ever, claimed the time-slot (which silenced the GitHub
    // Action, the one sender that WOULD have got it right) and posted anyway. That is why
    // 24/07's sourcing pay kept nagging on the 28th and 29th — it was marked paid on the
    // 27th, and the flag was sitting in Supabase the whole time.
    payCloudPaid(run.k+'_'+c.last).then(function(state){
    if(state!=='unpaid') return;               // paid, or we couldn't tell — either way, say nothing
    fetch(SUPABASE_URL+'/rest/v1/app_flags',{method:'POST',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json',
               Prefer:'resolution=ignore-duplicates,return=representation'},
      body:JSON.stringify({k:key,v:'sent'})})
      .then(function(r){ return r.json(); })
      .then(function(rows){
        if(!(Array.isArray(rows)&&rows.length)) return;   // another device/slot already sent
        var men=s.discordUserId?'<@'+s.discordUserId+'> ':'';
        var late=daysOver>=1;
        var cadence = finalNotice ? 'BDL VA HQ \u00b7 last reminder for this run'
                    : (daysOver>=PAY_TAPER_DAYS ? 'BDL VA HQ \u00b7 once a day at 12pm UK until marked paid'
                                                : 'BDL VA HQ \u00b7 12pm / 4pm / 8pm UK until marked paid');
        var names=payPeopleFor(run.k).map(function(p){return p.name;}).join(' & ');
        fetch(hook,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ content: men+(late?'**'+run.label+' pay is overdue**':'**'+run.label+' pay is due today**'),
            allowed_mentions: s.discordUserId?{parse:[],users:[String(s.discordUserId).trim()]}:undefined,
            embeds:[{ title:run.icon+'  '+run.label+' pay \u2014 '+payFmt(c.last),
              color: late?15881515:16750848,
              description:(finalNotice
                  ? '**'+daysOver+' days overdue.** This is my last reminder for this run \u2014 I\'ll stop after this one.\n\n'
                  : late?'**'+daysOver+' day'+(daysOver===1?'':'s')+' overdue.**\n\n':'')
                +(payAppUrl()
                    ? '### [\u2705\u2002Mark '+run.label.toLowerCase()+' as paid]('+payAppUrl()+'?paid='+encodeURIComponent(run.k+'_'+c.last)+')'
                      +'\n\u200b'
                    : 'Open **BDL VA HQ \u2192 Overview** and hit **Mark paid** to stop these reminders.\n\u200b'),
              fields:[
                {name:'Who',value:names,inline:true},
                {name:'Schedule',value:payScheduleText(run),inline:true},
                {name:'Next run',value:payFmt(c.next),inline:true}
              ],
              footer:{text:cadence},
              timestamp:new Date().toISOString() }]
          })}).catch(function(){});
      }).catch(function(){});
    });
  }catch(e){}
}
(function(){ setTimeout(payPingCheck,9000); setInterval(payPingCheck,15*60000); })();
/* the banner Jack sees on payday (and after, if he still hasn't paid) */
function paySettingsHTML(){
  var people=payPeople();
  var rows=people.map(function(p,i){
    return '<div class="payp-row">'
      +'<input class="settings-input payp-name" value="'+escHtml(p.name||'')+'" placeholder="Name" oninput="payPeopleEdit('+i+',\'name\',this.value)">'
      +'<select class="settings-input payp-run" onchange="payPeopleEdit('+i+',\'run\',this.value)">'
        +payRuns().map(function(r){ return '<option value="'+r.k+'"'+((p.run||payRuns()[0].k)===r.k?' selected':'')+'>'+(r.icon||'')+' '+escHtml(r.label)+'</option>'; }).join('')
      +'</select>'
      +'<button class="icon-btn" style="color:#ff6680" onclick="payPeopleDel('+i+')">Del</button>'
      /* A cycle NAME does not tell you when someone gets paid \u2014 "Sourcing" reads
         fine whether it pays monthly or twice a month. Spell out the days. */
      +(function(){ var r=payRuns().filter(function(x){ return x.k===(p.run||payRuns()[0].k); })[0];
          return r?'<div class="payp-when">paid '+escHtml(payRunDesc(r))+'</div>':''; })()
      +'</div>';
  }).join('');
  /* `if(!who.length) return ''` hid exactly the case worth shouting about: a cycle
     with nobody on it never fires a reminder, and looked identical to a working one.
     Jack had an Admin/31st cycle with no one assigned and both VAs on a 15th-only
     cycle, so nothing would ever have reminded him about the end-of-month run. */
  var next=payRuns().map(function(r){
    var who=payPeopleFor(r.k);
    var c=payRunCycle(r.k);
    if(!who.length){
      return '<div class="payp-next payp-none"><b>'+r.icon+' '+escHtml(r.label)+'</b> \u2014 '
        +'<b style="color:#ffc766;">nobody is on this cycle</b>, so it will never remind you. '
        +'Put someone on it below, or delete it.</div>';
    }
    return '<div class="payp-next"><b>'+r.icon+' '+escHtml(r.label)+'</b> \u2014 '+who.length+' '+(who.length===1?'person':'people')
      +' ('+who.map(function(x){ return escHtml(x.name||'unnamed'); }).join(', ')+')'
      +' \u00b7 '+payRunDesc(r)
      +' \u00b7 next <b>'+payFmt(c.next)+'</b> (in '+c.daysToNext+' day'+(c.daysToNext===1?'':'s')+')</div>';
  }).join('');
  return '<div class="settings-card" data-sg="shift">'
    +'<div class="settings-title">💷 Pay runs</div>'
    +'<div class="settings-sub">Set up as many pay cycles as you need, then put each person on one. You get a Discord reminder at <b>12pm, 4pm and 8pm UK</b> from the day it\'s due until you mark it paid on the Overview.</div>'
    +'<div class="payr-head">Pay cycles</div>'
    +'<div class="payr-list">'+payRunsEditorHTML()+'</div>'
    +'<button class="btn btn-ghost payr-add" onclick="payRunAdd()">+ Add a pay cycle</button>'
    +'<div class="payr-head" style="margin-top:16px;">Who\'s on each cycle</div>'
    +'<div class="payp-list">'+rows+'</div>'
    +'<button class="btn btn-ghost" style="margin-top:8px;" onclick="payPeopleAdd()">+ Add person</button>'
    +'<div class="settings-field" style="margin-top:14px;"><label class="settings-label">Public app link (for the Discord button)</label>'
      +'<input class="settings-input" id="setting-app-url" placeholder="https://yourname.github.io/your-repo/" value="'+escHtml(getAppSettings().appUrl||'')+'" oninput="payAppUrlSet(this.value)"></div>'
    +'<div class="settings-sub" style="margin-top:6px;">Your GitHub Pages address. With this set, every pay reminder carries a <b>✅ Mark as paid</b> button you can tap straight from Discord'
      +(payAppUrl()?' — <b style="color:#10d99a;">detected: '+escHtml(payAppUrl())+'</b>':'')+'.</div>'
    +'<div class="pay-actions">'
      +'<button class="btn btn-success" onclick="paySave()">💾 Save pay settings</button>'
      +'<button class="btn btn-ghost" onclick="payTestPing()">📨 Send test reminder</button>'
      +'<span class="pay-hint" id="pay-saved"></span>'
    +'</div>'
    +(next?'<div class="payp-nexts">'+next+'</div>':'')
    +'</div>';
}
/* explicit save — the fields already write as you type, but a button you can press
   (and a "Saved ✓" next to it) is worth more than me telling you it autosaves */
function paySave(){
  try{
    var s=getAppSettings();
    var u=document.getElementById('setting-app-url');
    if(u) s.appUrl=String(u.value||'').trim();
    var w=document.getElementById('setting-wh-pay');
    if(w && String(w.value||'').trim()) s.whPay=String(w.value).trim();
    var names=[].map.call(document.querySelectorAll('.payp-row'),function(row){
      return { name:(row.querySelector('.payp-name')||{}).value||'',
               run:(row.querySelector('.payp-run')||{}).value||'sourcing' };
    }).filter(function(p){ return p.name.trim(); });
    // same person twice is always a slip — keep the first, drop the repeat
    var seen={}, deduped=[];
    names.forEach(function(p){
      var k=p.name.trim().toLowerCase();
      if(seen[k]) return;
      seen[k]=1; deduped.push({name:p.name.trim(),run:p.run});
    });
    var dropped=names.length-deduped.length;
    if(deduped.length) s.payPeople=deduped;
    saveAppSettings(s);
    try{ pushSettingsCloud(s); }catch(e){}
    var tag=document.getElementById('pay-saved');
    if(tag){ tag.textContent='Saved ✓'; tag.className='pay-hint ok'; setTimeout(function(){ if(tag) tag.textContent=''; },2500); }
    showToast(dropped?('Pay settings saved ✓ — removed '+dropped+' duplicate'+(dropped===1?'':'s')):'Pay settings saved ✓');
    if(dropped) mgr_renderSettings();
  }catch(e){ showToast('Could not save — '+e.message,true); }
}
/* fire a real reminder now, so you can check the whole chain end to end:
   right channel · @mention · and the Mark-paid button actually working */
function payTestPing(hookOverride){
  var s=getAppSettings();
  var hook=String(hookOverride||'').trim()||(s.whPay||'').trim();
  if(!hook){ showToast('No pay channel set — paste the webhook into Notifications → 💷 Important — pay & admin, then Save',true); return; }
  if(IS_PREVIEW){ showToast('Preview copy — test blocked so it can\'t hit your real channel',true); return; }
  var _rs=payRuns(); var run=_rs[0], who=payPeopleFor(run.k);
  for(var i=0;i<_rs.length;i++){ if(payPeopleFor(_rs[i].k).length){ run=_rs[i]; who=payPeopleFor(run.k); break; } }
  var c=payRunCycle(run.k);
  var names=who.map(function(p){return p.name;}).join(' & ')||'(nobody set)';
  var url=payAppUrl();
  var body={ content:(s.discordUserId?'<@'+s.discordUserId+'> ':'')+'**TEST — this is what a pay reminder looks like**',
    allowed_mentions: s.discordUserId?{parse:[],users:[String(s.discordUserId).trim()]}:undefined,
    embeds:[{ title:run.icon+' '+run.label+' pay — '+names+' — '+payFmt(c.next),
      color:16750848,
      description:'**This is a preview** \u2014 nothing is actually due today.\n\n'
        +'When '+run.label.toLowerCase()+' pay falls due, this lands at **12pm, 4pm and 8pm UK** every day until you tap the link.\n\n'
        +(run.k==='admin'?'Admin pay run (15th & 30th)':'Sourcing pay run (every 2 weeks, Friday)')+' for **'+names+'**.'
        +'\n\nNext '+run.label.toLowerCase()+' pay: **'+payFmt(c.next)+'**'
        +(url?'\n\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'
              +'\n## [　✅　Mark '+run.label.toLowerCase()+' as paid　]('+url+'?paid='+encodeURIComponent(run.k+'_'+c.next)+')'
              +'\n────────────────────'
              +'\n⬆️ **Go on, tap it** — it opens your app, marks that date paid and posts a ✅ back here. Nothing breaks; you can undo it in the app.'
             :'\n\n⚠️ No **Public app link** set in Settings → 💷 Pay runs, so there\'s no link on this message.'),
      footer:{text:'BDL VA HQ · test reminder'}, timestamp:new Date().toISOString() }] };
  fetch(hook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(function(r){ showToast(r.ok?'Test sent ✓ to the pay channel (…'+hook.replace(/\/$/,'').slice(-6)+')':'Discord rejected it — check the webhook URL',!r.ok); })
    .catch(function(){ showToast('Could not reach Discord',true); });
}
function payAppUrlSet(v){ var s=getAppSettings(); s.appUrl=String(v||'').trim(); saveAppSettings(s); try{ pushSettingsCloud(s); }catch(e){} }
/* the editor for the cycles themselves */
function payRunsEditorHTML(){
  return payRuns().map(function(r,i){
    var isMonthly=r.type==='monthly';
    var sched = isMonthly
      ? '<span class="payr-lbl">on day(s)</span>'
        +'<input class="settings-input payr-days" value="'+escHtml((r.days||[]).join(', '))+'" placeholder="15, 31" title="More than one is fine \u2014 type them separated by a comma, e.g. 15, 31" oninput="payRunEdit('+i+',\'days\',this.value)">'
        +'<span class="payr-note">of each month</span>'
        /* Jack pays on the 15th AND the 31st. Nothing said the box takes more than one
           number, so he built it as two cycles and put both VAs on the 15th-only one \u2014
           the end-of-month run would never have reminded him. One tap now. */
        +'<span class="payr-presets">'
          +[['15, 31','15th &amp; last day'],['1, 15','1st &amp; 15th'],['31','last day only'],['15','15th only']]
            .map(function(pr){
              var on=(r.days||[]).join(', ')===pr[0];
              return '<button class="payr-preset'+(on?' on':'')+'" onclick="payRunPreset('+i+',\''+pr[0]+'\')">'+pr[1]+'</button>'; }).join('')
        +'</span>'
      : '<span class="payr-lbl">every</span>'
        +'<input class="settings-input payr-n" type="number" min="1" max="12" value="'+(parseInt(r.everyWeeks)||2)+'" oninput="payRunEdit('+i+',\'everyWeeks\',this.value)">'
        +'<span class="payr-lbl">week(s) on</span>'
        +'<select class="settings-input payr-wd" onchange="payRunEdit('+i+',\'weekday\',this.value)">'
          +PAY_WEEKDAYS.map(function(d,n){ return '<option value="'+n+'"'+(((r.weekday==null?5:r.weekday))===n?' selected':'')+'>'+d+'</option>'; }).join('')
        +'</select>'
        +'<span class="payr-lbl">from</span>'
        +'<input class="settings-input payr-anchor" type="date" value="'+escHtml(r.anchor||PAY_ANCHOR)+'" oninput="payRunEdit('+i+',\'anchor\',this.value)">';
    var c=payRunCycle(r.k);
    return '<div class="payr-row">'
      +'<div class="payr-top">'
        +'<select class="payr-icon" onchange="payRunEdit('+i+',\'icon\',this.value)">'
          +PAY_ICONS.map(function(ic){ return '<option'+((r.icon||PAY_ICONS[0])===ic?' selected':'')+'>'+ic+'</option>'; }).join('')
        +'</select>'
        +'<input class="settings-input payr-name" value="'+escHtml(r.label||'')+'" placeholder="Cycle name — e.g. Sourcing" oninput="payRunEdit('+i+',\'label\',this.value)">'
        +'<select class="settings-input payr-type" onchange="payRunEdit('+i+',\'type\',this.value)">'
          +'<option value="weeks"'+(!isMonthly?' selected':'')+'>Every N weeks</option>'
          +'<option value="monthly"'+(isMonthly?' selected':'')+'>Days of the month</option>'
        +'</select>'
        +(payRuns().length>1?'<button class="icon-btn" style="color:#ff6680" onclick="payRunDel('+i+')">Del</button>':'')
      +'</div>'
      +'<div class="payr-sched">'+sched+'</div>'
      +'<div class="payr-next">'+payRunDesc(r)+' — next <b>'+payFmt(c.next)+'</b> ('+(c.daysToNext===0?'today':'in '+c.daysToNext+' day'+(c.daysToNext===1?'':'s'))+')</div>'
      +'</div>';
  }).join('');
}
function payRunEdit(i,k,v){
  var arr=payRuns().map(function(r){ return JSON.parse(JSON.stringify(r)); });
  if(!arr[i]) return;
  if(k==='days'){
    arr[i].days=String(v).split(/[^0-9]+/).map(function(x){return parseInt(x);})
      .filter(function(n){ return n>=1&&n<=31; }).slice(0,6);
  } else if(k==='everyWeeks'||k==='weekday'){
    arr[i][k]=Math.max(k==='weekday'?0:1,parseInt(v)||0);
  } else if(k==='type'){
    arr[i].type=v;
    if(v==='monthly'&&!(arr[i].days||[]).length) arr[i].days=[15];
    if(v==='weeks'&&!arr[i].anchor) arr[i].anchor=PAY_ANCHOR;
  } else { arr[i][k]=v; }
  payRunsSet(arr);
  if(k==='type'||k==='icon'||k==='weekday') mgr_renderSettings();
  else { var box=document.querySelectorAll('.payr-row')[i]; var n=box&&box.querySelector('.payr-next');
         if(n){ var c=payRunCycle(arr[i].k); n.innerHTML=payRunDesc(arr[i])+' — next <b>'+payFmt(c.next)+'</b> ('+(c.daysToNext===0?'today':'in '+c.daysToNext+' day'+(c.daysToNext===1?'':'s'))+')'; } }
}
function payRunPreset(i,days){ payRunEdit(i,'days',days); mgr_renderSettings(); }
function payRunAdd(){
  var arr=payRuns().map(function(r){ return JSON.parse(JSON.stringify(r)); });
  arr.push({k:'run'+Date.now().toString(36),label:'New cycle',icon:PAY_ICONS[2],type:'weeks',everyWeeks:2,weekday:5,anchor:payISO(payUKNow())});
  payRunsSet(arr); mgr_renderSettings();
}
function payRunDel(i){
  var arr=payRuns().map(function(r){ return JSON.parse(JSON.stringify(r)); });
  if(arr.length<=1) return;
  var gone=arr[i].k; arr.splice(i,1);
  payRunsSet(arr);
  var ppl=payPeople().map(function(p){ return p.run===gone?{name:p.name,run:arr[0].k}:p; });
  payPeopleSet(ppl);
  mgr_renderSettings();
}
function payPeopleEdit(i,k,v){ var a=payPeople().slice(); if(!a[i]) return; a[i][k]=v; payPeopleSet(a); if(k==='run') mgr_renderSettings(); }
function payPeopleAdd(){ var a=payPeople().slice(); a.push({name:'',run:'sourcing'}); payPeopleSet(a); mgr_renderSettings(); }
function payPeopleDel(i){ var a=payPeople().slice(); a.splice(i,1); payPeopleSet(a); mgr_renderSettings(); }
/* ── Discord button lands here ──────────────────────────────────────────────
   The app is hosted (GitHub Pages), so it has a real URL — which means a Discord
   link button can just open it with ?paid=<run>_<date> and we record the payment
   on load. No third-party service in the middle. */
function payHandleDeepLink(){
  try{
    var q=new URLSearchParams(location.search||'');
    var tok=q.get('paid'); if(!tok) return;
    /* The run key was hard-coded to the two cycles that ship by default, so the
       \u2705 Mark as paid button in Discord silently did nothing for any cycle Jack
       added himself (those get keys like "run1x2y3z"). Accept any key, then require
       an EXACT match below \u2014 payRunBy() falls back to the first run, which would
       otherwise mark the wrong cycle paid. */
    var m=String(tok).match(/^([A-Za-z0-9]+)_(\d{4}-\d{2}-\d{2})$/);
    // strip it from the address bar either way so a refresh can't re-fire it
    try{ history.replaceState({},'',location.pathname+location.hash); }catch(e){}
    if(!m){ return; }
    var runK=m[1], iso=m[2];
    var run=payRuns().filter(function(r){ return r.k===runK; })[0];
    if(!run){ try{ showToast('That pay link is for a cycle that no longer exists',true); }catch(e){} return; }
    var key=runK+'_'+iso;
    if(payIsPaid(key)){ try{ showToast(run.label+' pay for '+payFmt(iso)+' was already marked ✓'); }catch(e){} return; }
    if(IS_PREVIEW || !DB_ENABLED){
      window._payPaid=window._payPaid||{}; window._payPaid[key]=true;
      try{ showToast('\u2705 '+run.label+' pay marked as paid'); }catch(e){}
      return;
    }
    // Tapping the Discord link is the ONLY signal we get, and the tab often closes
    // straight after — so confirm the write and say plainly if it didn't land.
    payWriteFlag(key).then(function(ok){
      if(!ok){
        try{ showToast('Couldn\'t reach the server \u2014 '+run.label+' pay is NOT marked yet. Open the app again when you have signal.', true); }catch(e){}
        return;
      }
      window._payPaid=window._payPaid||{}; window._payPaid[key]=true;
      try{ lsPut('bdl_'+payFlagKey(key),'1'); }catch(e){}
      var hook=DISCORD_PAY_WEBHOOK||DISCORD_WEBHOOK;
      if(hook) fetch(hook,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({embeds:[{title:'\u2705 '+run.label+' pay \u2014 done',color:3066993,
          description:'Marked paid from Discord for '+payFmt(iso)+'.\nReminders for this run have stopped.',
          footer:{text:'BDL VA HQ \u00b7 pay'},timestamp:new Date().toISOString()}]})}).catch(function(){});
      try{ showToast('\u2705 '+run.label+' pay marked as paid \u2014 reminders stopped'); }catch(e){}
      try{ if(typeof mgr_renderOverview==='function') mgr_renderOverview(); }catch(e){}
    });
  }catch(e){}
}
setTimeout(payHandleDeepLink,1200);
/* the public URL of this app, so reminders can build the button link */
function payAppUrl(){
  var s=getAppSettings();
  var u=(s.appUrl||'').trim();
  if(u) return u.replace(/[?#].*$/,'');
  try{ if(location.protocol==='http:'||location.protocol==='https:') return location.origin+location.pathname; }catch(e){}
  return '';
}
function payBannerHTML(){
  var now=payUKNow();
  var todayD=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  return payRuns().map(function(run){
    var who=payPeopleFor(run.k);
    if(!who.length) return '';                       // nobody on this run
    var c=payRunCycle(run.k);
    var names=who.map(function(p){ return p.name; }).join(' & ');
    if(payIsPaid(run.k+'_'+c.last)){
      if(c.daysToNext>3) return '';
      return '<div class="pay-bar done">✅ <b>'+run.label+' paid</b> — '+names+' for '+payFmt(c.last)
        +' · next <b>'+payFmt(c.next)+'</b> (in '+c.daysToNext+' day'+(c.daysToNext===1?'':'s')+')</div>';
    }
    var overdue=Math.round((todayD-new Date(c.last))/86400000);
    if(overdue<0) return '';
    var when=overdue===0?'today':overdue===1?'yesterday':overdue+' days ago';
    // overtime rides on the admin run — show it where the payment is actioned,
    // not buried in Settings, and let it be typed right there
    var otBox='';
    if(run.k==='admin'){
      var otT=payOtText(c.last);
      otBox='<span class="pay-ot">OT'
        +'<input type="number" min="0" step="0.5" value="'+(payOtHours(c.last)||'')+'" placeholder="0"'
          +' onchange="payOtSet(\''+c.last+'\',this.value)" onclick="event.stopPropagation()">'
        +'<span class="pay-ot-h">h</span>'
        +(otT?'<b>'+escHtml(otT)+'</b>':'<i>&#215; '+payOtRate()+'</i>')
        +'</span>';
    }
    return '<div class="pay-bar due'+(overdue>=1?' late':'')+'">'
      +'<span class="pay-ic">'+run.icon+'</span>'
      +'<span class="pay-txt"><b>'+run.label+' pay '+when+'</b> — '+names+' due for '+payFmt(c.last)
        +(overdue>=1?' · <b>still unpaid</b>':'')+'</span>'
      +otBox
      +'<button class="pay-btn" onclick="payMarkPaid(\''+run.k+'\')">✅ Mark paid</button>'
      +'</div>';
  }).join('');
}
/* New-lead Discord pings were REMOVED at Jack's request (27/07/2026): "new leads
   shouldn't go in here - there should be no new leads thing". Note for anyone
   re-adding it: leadPingChannel() fell back to the MAIN webhook whenever a VA had
   no dedicated lead channel, so clearing the two lead-webhook fields did NOT stop
   the pings — they just moved to the main channel. Removing the sender is the only
   thing that actually stops them. Lead activity still reaches Jack via the Leads
   tab and the end-of-day summary. */
