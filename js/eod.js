/* ══════════ YOUR RESULTS — closing the loop for the VAs ═════════════════════
   Until now a VA only ever saw VOLUME: leads today, this week, this month. What
   Jack DECIDED never came back to the person who found it — so they were
   optimising for the only number they could see, and had no way to learn what a
   good lead looks like. Everything here already existed in the data; it just
   never travelled back. Rejection reasons are shown too: being told "low ROI"
   three times is worth more than any target. */
function vaCode(va){ return va==='Mera'?'VA M':va==='Suz'?'VA S':null; }
function vaYmd(s){
  s=String(s||'');
  var m=s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(m) return m[3]+('0'+m[2]).slice(-2)+('0'+m[1]).slice(-2);
  var i=s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(i) return i[1]+('0'+i[2]).slice(-2)+('0'+i[3]).slice(-2);
  return '';
}
function vaMyLeads(va, days){
  var code=vaCode(va); if(!code||!window.leads) return [];
  var cut='';
  if(days){
    var d=new Date(); d.setDate(d.getDate()-days);
    cut=d.getFullYear()+('0'+(d.getMonth()+1)).slice(-2)+('0'+d.getDate()).slice(-2);
  }
  return window.leads.filter(function(l){
    if(l.va!==code) return false;
    if(!cut) return true;
    var y=vaYmd(l.date); return y && y>=cut;
  });
}
/* ── A2A vs OA, worked out rather than asked for ─────────────────────────────
   Jack: "a2a is amazon to amazon so either a2a uk or a2a eu", and "it should be
   automated". The supplier LINK is the strongest evidence and wins outright: 35 of
   his leads have a blank store but an amazon.de/fr/it/es link, and 4 say Amazon.UK
   while linking to a retailer. Where there is no link, the store field decides —
   and a blank supplier link is exactly what A2A UK looks like, because the source
   IS the Amazon UK page. Evidence order: link, then store, then unknown. */
var A2A_EU_HOSTS=['amazon.de','amazon.fr','amazon.it','amazon.es','amazon.nl','amazon.se','amazon.pl','amazon.be'];
function leadHost(u){
  var m=String(u||'').match(/^https?:\/\/([^\/]+)/i);
  return m?m[1].toLowerCase().replace(/^www\./,''):'';
}
function leadSource(l){
  if(!l) return '';
  var h=leadHost(l.sup)||leadHost(l.sup2);   // a few leads only fill the second link
  if(A2A_EU_HOSTS.indexOf(h)>=0) return 'A2A EU';
  if(h==='amazon.co.uk') return 'A2A UK';
  if(h) return 'OA';                                  // a real retailer link
  var st=String(l.store||'').trim().toLowerCase();
  if(st.indexOf('amazon.')===0) return st.indexOf('uk')>=0?'A2A UK':'A2A EU';
  if(st) return 'OA';
  return '';                                          // nothing to go on
}
/* Things on the sheet a VA can actually fix, with the row to fix them on. */
function leadSheetIssues(rows){
  var out=[];
  (rows||[]).forEach(function(l){
    var why='';
    if(!/^B0[0-9A-Z]{8}$/i.test(String(l.asin||'').trim())) why='ASIN doesn’t look right';
    else if(!leadSource(l)) why='no store and no supplier link — can’t tell A2A from OA';
    if(why) out.push({row:l.sheetRow, tab:l.sheetTab, title:l.title, why:why});
  });
  return out;
}
function vaResultsHTML(va){
  var mine=vaMyLeads(va,30);
  if(!mine.length) return '';
  var decided=mine.filter(function(l){ return l.islead!==null || l.status; });
  var bought =mine.filter(function(l){ return l.status==='bought'; });
  var basket =mine.filter(function(l){ return ['atbq','atba2a','waiting'].indexOf(l.status)>-1; });
  var waiting=mine.length-decided.length;
  var rate   =decided.length ? Math.round(bought.length/decided.length*100) : null;

  // what got turned down, and why — the actual teaching signal
  var reasons={};
  mine.filter(function(l){ return l.islead===false; }).forEach(function(l){
    var n=String(l.notes||'').match(/Rejected:\s*([^\n.]+)/i);
    var why=n?n[1].trim():'No reason given';
    reasons[why]=(reasons[why]||0)+1;
  });
  var topReasons=Object.keys(reasons).sort(function(a,b){ return reasons[b]-reasons[a]; }).slice(0,3);

  var wins=bought.slice().sort(function(a,b){ return (vaYmd(b.date)||'').localeCompare(vaYmd(a.date)||''); }).slice(0,3);

  /* This panel had grown to a full screen before the VA could see a single task:
     four big KPI tiles, a reason block, four source tiles, three comment cards and
     five issue rows. It is CONTEXT, not the job. Now one dense summary line that is
     always visible, and everything else behind a click. */
  var srcC={'A2A UK':0,'A2A EU':0,'OA':0}, srcU=0;
  mine.forEach(function(l){ var k=leadSource(l); if(k) srcC[k]++; else srcU++; });
  var comments=mine.filter(function(l){ return String(l.notes||'').trim(); })
                   .sort(function(a,b){ return (vaYmd(b.date)||'').localeCompare(vaYmd(a.date)||''); });
  var issues=leadSheetIssues(mine);

  function st(v,l,c){ return '<span class="vr-s"><b'+(c?' style="color:'+c+'"':'')+'>'+v+'</b>'+l+'</span>'; }
  var head='<summary class="vr-head">'
    +'<span class="vr-t">&#127942; Your results</span>'
    +st(bought.length,'bought','#10d99a')
    +(rate===null?'':st(rate+'%','hit rate','#38bdf8'))
    +st(waiting,'to review','#f2c200')
    +(basket.length?st(basket.length,'in basket'):'')
    +'<span class="vr-sp"></span>'
    +(issues.length?'<span class="vr-flag">'+issues.length+' to fix on your sheet</span>':'')
    +'<span class="vr-cx">&#9662;</span></summary>';

  var body='<div class="vr-body">'
    +(topReasons.length
      ? '<div class="vr-sec"><b>Most common reason yours get turned down</b> '
        + topReasons.map(function(r){ return '<span class="vr-why">'+escHtml(r)+' <i>&times;'+reasons[r]+'</i></span>'; }).join('')
        +'</div>' : '')
    +'<div class="vr-sec"><b>Where yours came from</b> '
      +'<span class="vr-src" style="--c:#38bdf8">A2A UK <b>'+srcC['A2A UK']+'</b></span>'
      +'<span class="vr-src" style="--c:#10d99a">A2A EU <b>'+srcC['A2A EU']+'</b></span>'
      +'<span class="vr-src" style="--c:#f2c200">OA <b>'+srcC['OA']+'</b></span>'
      +(srcU?'<span class="vr-src" style="--c:#7c8598">can&rsquo;t tell <b>'+srcU+'</b></span>':'')
    +'</div>'
    +(comments.length
      ? '<div class="vr-sec"><b>What Jack said on yours</b>'
        + comments.slice(0,3).map(function(l){
            return '<div class="vr-c"><span>'+escHtml(String(l.title||'').slice(0,44))+'</span>'
              +(l.sheetRow?'<i>row '+l.sheetRow+'</i>':'')+' &mdash; '+escHtml(String(l.notes).slice(0,110))+'</div>';
          }).join('')
        +(comments.length>3?'<div class="vr-more">'+(comments.length-3)+' more</div>':'')
        +'</div>' : '')
    +(issues.length
      ? '<div class="vr-sec"><b>Needs fixing on your sheet</b>'
        + issues.slice(0,3).map(function(x){
            return '<div class="vr-c"><i>Row '+(x.row||'?')+'</i> '+escHtml(String(x.title||'').slice(0,40))+' &mdash; '+x.why+'</div>';
          }).join('')
        +(issues.length>3?'<div class="vr-more">'+(issues.length-3)+' more like this</div>':'')
        +'</div>' : '')
    +'</div>';

  return '<details class="vres">'+head+body+'</details>';
}
function renderVaResults(){
  try{
    var host=document.getElementById('va-results'); if(!host) return;
    var va=(window.state&&(state._previewAs||state.currentVA))||null;
    if(!va||va==='Test'){ host.innerHTML=''; return; }
    host.innerHTML=vaResultsHTML(va);
  }catch(e){}
}
function vaSheetLeadsToday(){
  try{
    var v=(window.state&&(state._previewAs||state.currentVA))||null;
    var code=v==='Mera'?'VA M':v==='Suz'?'VA S':null;
    if(!code||!window.leads||!window.leads.length) return null;
    function ymd(s){s=String(s||'');var m=s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);if(m)return m[3]+('0'+m[2]).slice(-2)+('0'+m[1]).slice(-2);var i=s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);if(i)return i[1]+('0'+i[2]).slice(-2)+('0'+i[3]).slice(-2);return '';}
    var t=ymd(new Date().toLocaleDateString('en-GB',{timeZone:'Europe/London'}));
    return window.leads.filter(function(l){return l.va===code && ymd(l.date)===t;}).length;
  }catch(e){ return null; }
}
// ── SHIFT CELEBRATIONS / MOMENTUM (make the VA side fun) ──
function fireConfetti(){
  try{
    var cv=document.getElementById('confetti-cv'); if(cv) cv.remove();
    cv=document.createElement('canvas'); cv.id='confetti-cv';
    cv.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:99999;';
    cv.width=window.innerWidth; cv.height=window.innerHeight;
    document.body.appendChild(cv);
    var ctx=cv.getContext('2d');
    var cols=['#b23bff','#f2c200','#10d99a','#18c8f0','#f5455f','#ffffff'];
    var P=[]; for(var i=0;i<150;i++){ P.push({x:cv.width*(0.15+Math.random()*0.7),y:cv.height*0.32,vx:(Math.random()-.5)*15,vy:Math.random()*-17-3,g:0.45+Math.random()*0.35,r:5+Math.random()*7,c:cols[i%cols.length],rot:Math.random()*6,vr:(Math.random()-.5)*0.4}); }
    var t0=null,dur=2700;
    function frame(ts){ if(t0===null)t0=ts; var el=ts-t0; ctx.clearRect(0,0,cv.width,cv.height);
      var a=Math.max(0,1-el/dur);
      P.forEach(function(p){ p.vy+=p.g; p.x+=p.vx; p.y+=p.vy; p.rot+=p.vr;
        ctx.save(); ctx.globalAlpha=a; ctx.translate(p.x,p.y); ctx.rotate(p.rot); ctx.fillStyle=p.c; ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r*0.62); ctx.restore(); });
      if(el<dur) requestAnimationFrame(frame); else cv.remove();
    }
    requestAnimationFrame(frame);
  }catch(e){}
}
function showBigCheer(title,sub){
  try{
    var old=document.getElementById('big-cheer'); if(old)old.remove();
    var d=document.createElement('div'); d.id='big-cheer';
    d.style.cssText='position:fixed;left:50%;top:20%;transform:translate(-50%,-12px) scale(.9);z-index:100000;background:linear-gradient(135deg,#1a1030,#0d0f16);border:1.5px solid var(--accent-line);border-radius:18px;padding:18px 26px;text-align:center;box-shadow:0 24px 70px -20px rgba(0,0,0,.85),0 0 55px -14px var(--accent);opacity:0;transition:all .32s cubic-bezier(.2,.9,.3,1.25);pointer-events:none;max-width:90vw;';
    d.innerHTML='<div style="font-size:15.5px;font-weight:800;color:#fff;letter-spacing:-.01em;">'+title+'</div><div style="font-size:12.5px;color:var(--muted);margin-top:5px;">'+sub+'</div>';
    document.body.appendChild(d);
    requestAnimationFrame(function(){ d.style.opacity='1'; d.style.transform='translate(-50%,0) scale(1)'; });
    setTimeout(function(){ d.style.opacity='0'; d.style.transform='translate(-50%,-12px) scale(.95)'; setTimeout(function(){ if(d)d.remove(); },360); },3600);
  }catch(e){}
}
/* Per-VA daily lead goal. This was CALLED in four places but never defined — and
   every caller wrapped it in try/catch with `||12`, so the throw was swallowed and
   both VAs silently got 12 no matter what was set in Settings. The goals had never
   actually applied. Named to match those callers. */
/* how many of today's leads should be OA (retailer sourcing), per VA */
function vaOaGoal(va){
  var s; try{ s=getAppSettings(); }catch(e){ return 0; }
  if(va==='Mera'||va==='VA M') return parseInt(s.oaGoalMera)||0;
  if(va==='Suz' ||va==='VA S') return parseInt(s.oaGoalSuz) ||0;
  return 0;
}
/* today's OA count for a VA, straight off the lead list — same classifier as
   everywhere else, so this can never disagree with the Insights split */
function vaOaToday(va){
  try{
    var code=(typeof vaCode==='function')?vaCode(va):(va==='Mera'?'VA M':va==='Suz'?'VA S':null);
    if(!code||!window.leads) return 0;
    var today=ukDateShort();
    return window.leads.filter(function(l){
      return l && l.va===code && String(l.date||'').slice(0,10)===today && leadSource(l)==='OA';
    }).length;
  }catch(e){ return 0; }
}
/* ── WHAT THE VA SEES ABOUT THEIR OWN WORK ──────────────────────────────────
   Jack: "I don't want ShiftTrack to purely be START SHIFT -> DO TASKS -> END SHIFT...
   they should be able to open it and immediately understand how they're doing."
   Everything here is counted from leads and shifts that already exist. Nothing new for
   anyone to fill in, and nothing invented — where the data cannot answer a question the
   panel leaves that part out rather than showing a confident zero. */

/* Buying FROM Amazon is A2A; buying from a retailer is OA. The old sourceType() decided
   this from the source-method text alone, which classed 220 of Mera's 220 August leads
   as OA and none as A2A — the KPI Jack wants to grow was reporting nonsense. The
   supplier domain is the real signal, and it lines up with what he described: argos,
   currys, ao.com, johnlewis, sharkninja, box, qogita are OA; amazon.* is A2A. */
function leadIsA2A(l){
  var k=(typeof buyFromKey==='function')?buyFromKey(l):'';
  if(/(^|\.)amazon\./.test(k)) return true;
  var s=String((l&&l.src)||'').toLowerCase();
  return s.indexOf('a2a')>=0||s.indexOf('reverse')>=0||s.indexOf('arbi')>=0;
}
/* The four outcomes Jack insists on keeping apart: "just because I haven't bought
   something doesn't mean it was a bad lead". A good lead he hasn't bought is a WIN,
   and must never be counted with the rejections. */
function leadOutcome(l){
  if(!l) return 'pending';
  if(l.status==='bought') return 'bought';
  if(l.islead===false||l.status==='passed') return 'rejected';
  if(l.islead===true) return 'good';          // approved: bought later, waiting, or just liked
  return 'pending';
}
function vaKey(va){ return (va==='Mera'||va==='VA M')?'VA M':'VA S'; }
function vaMonStart(ref){
  var t=new Date(ref.getFullYear(),ref.getMonth(),ref.getDate());
  t.setDate(t.getDate()-((t.getDay()+6)%7));    // Jack's weeks start Monday
  return t;
}
function vaLeadDate(l){
  var p=String((l&&l.date)||'').split('/');
  if(p.length!==3) return null;
  var d=new Date(+p[2],+p[1]-1,+p[0]);
  return isNaN(d.getTime())?null:d;
}
/* One tally for any slice of leads. */
/* ── SALE-PRICE BANDS ─────────────────────────────────────────────────────────
   Jack's split, on the AMAZON SALE price (not what she pays for it). His working
   names were "something ticket" and "super super high ticket" — renamed to things
   that fit on a chip and escalate in an obvious order. Edit the labels here; the
   thresholds are what the KPIs count, so change those with more care. */
var LEAD_BANDS=[
  {k:'low',  max:15,       label:'Low',      col:'#6b7488'},
  {k:'mid',  max:60,       label:'Mid',      col:'#7c9cff'},
  {k:'upper',max:100,      label:'Upper',    col:'#39d0ee'},
  {k:'high', max:200,      label:'High',     col:'#22d39a'},
  {k:'prem', max:500,      label:'Premium',  col:'#ffb02e'},
  {k:'flag', max:Infinity, label:'Flagship', col:'#a78bfa'}
];
function leadBand(l){
  var v=parseFloat(l&&l.sell)||0;
  for(var i=0;i<LEAD_BANDS.length;i++) if(v<LEAD_BANDS[i].max) return LEAD_BANDS[i];
  return LEAD_BANDS[LEAD_BANDS.length-1];
}
function leadBandChip(l){
  var v=parseFloat(l&&l.sell)||0; if(!v) return '';
  var b=leadBand(l);
  return '<span class="ld-band" style="--bc:'+b.col+'" title="Sells for £'+v.toFixed(2)
    +' — '+b.label+' ticket">'+b.label+'</span>';
}
function vaTally(list){
  /* n = rows on the sheet; uniq = distinct PRODUCTS. Jack twice challenged "138
     leads in 13 days" and he was right to: 34 of Mera's August rows were re-sends
     of an ASIN she had already sent that month (one of them four times). The
     headline the VA sees is uniq — you cannot find the same product twice. */
  /* Jack: "no note = doesn't count." Filter ONCE here and every number this
     tally feeds — leads, tickets, keepa, thc, spend — agrees by construction. */
  try{ if(typeof ldDupUnexplained==='function')
    list=list.filter(function(l){ return !ldDupUnexplained(l); }); }catch(e){}
  var t={n:list.length,uniq:0,bought:0,good:0,rejected:0,pending:0,spend:0,oa:0,keepa:0,keepaBought:0,thc:0,over100:0,over200:0,premium:0,flagship:0};
  var seen={};
  list.forEach(function(l){
    var a=''; try{ a=leadUseAsin(l); }catch(e){}
    a=a||String(l.asin||'').trim().toUpperCase();
    var k=a||('row'+(l.id!=null?l.id:t.uniq+Math.random()));
    if(!seen[k]){ seen[k]=1; t.uniq++; }
  });
  list.forEach(function(l){
    var o=leadOutcome(l); t[o]++;
    if(o==='bought'){
      /* buy price × units. Counting one unit made "spend generated" a nonsense —
         a 100-unit £10 buy scored the same as a single £10 test buy. Qty lives in
         the decision meta; when Jack marked it N/A or never set one, count 1. */
      var q=1;
      try{ var _q=(typeof ldQty==='function')?ldQty(l):null; if(_q!=null&&_q!=='na'&&isFinite(+_q)&&+_q>0) q=+_q; }catch(e){}
      t.spend+=(parseFloat(l.buy)||0)*q;
    }
    if(!leadIsA2A(l)) t.oa++;
    if(String(l.src||'').toLowerCase().indexOf('keepa')>=0){ t.keepa++; if(o==='bought') t.keepaBought++; }
    /* THC discord — the VAs spell it three ways in the sheet: Suz writes "discord"
       (59 rows) and lately "STHC" (all August), Mera writes "THC". Match all three;
       a lead lost to spelling would read as a missed target she actually hit. */
    var _sd=String(l.src||'').toLowerCase();
    if(_sd.indexOf('thc')>=0||_sd.indexOf('discord')>=0) t.thc++;
    /* CUMULATIVE by design — "over £100" means over £100, so a £250 find counts
       toward both. Counting them in exclusive slices would mean a great £250 lead
       failed the £100 target, which is not what anyone means by it. */
    var _sp=parseFloat(l.sell)||0;
    if(_sp>=100) t.over100++;
    if(_sp>=200) t.over200++;
    /* premium/flagship are EXCLUSIVE bands, not cumulative — Jack targets them
       separately (75 premium + 4 flagship a month), so a £600 find is a flagship
       and must not also fill the premium quota. */
    if(_sp>=200&&_sp<500) t.premium++;
    if(_sp>=500) t.flagship++;
  });
  return t;
}
function vaPerf(va){
  var k=vaKey(va);
  var all=(window.leads||[]).filter(function(l){ return l && l.va===k; });
  var now; try{ now=ukNow(); }catch(e){ now=new Date(); }
  var mStart=new Date(now.getFullYear(),now.getMonth(),1);
  var lmEnd=new Date(mStart.getTime()-86400000);
  var lmStart=new Date(lmEnd.getFullYear(),lmEnd.getMonth(),1);
  var wStart=vaMonStart(now);
  function slice(from,to){
    return all.filter(function(l){ var d=vaLeadDate(l); return d&&d>=from&&(!to||d<=to); });
  }
  return {
    va:va,
    dayOfMonth:now.getDate(),
    monthName:['January','February','March','April','May','June','July','August',
               'September','October','November','December'][now.getMonth()],
    lastMonthName:['January','February','March','April','May','June','July','August',
               'September','October','November','December'][lmStart.getMonth()],
    mtd:vaTally(slice(mStart,null)),
    lastMonth:vaTally(slice(lmStart,lmEnd)),
    week:vaTally(slice(wStart,null)),
    /* Jack: "make these notes smart — I only want recent notes and comments on leads
       I've actioned in the last 7 days". Feedback goes stale fast; a comment from
       three weeks ago is history, not coaching. DECIDED leads only, decided within
       7 days — falling back to the lead's own date where no decision stamp exists. */
    notes:(function(){
      var cut=Date.now()-7*86400000, dec={};
      try{ (window._decisionCache||[]).forEach(function(r){
        if(!r||!r.updated_at) return; var t=new Date(r.updated_at).getTime();
        if(isFinite(t)) dec[r.id]=t; }); }catch(e){}
      return all.filter(function(l){
        if(!((typeof leadNoteText==='function')&&leadNoteText(l))) return false;
        if(!(l.status||l.islead!==null)) return false;            // he hasn't actioned it
        var t=dec[l._sid];
        if(t==null){ var d=vaLeadDate(l); t=d?d.getTime():0; }    // no stamp — use the lead's date
        return t>=cut;
      }).sort(function(a,b){
        var ta=dec[a._sid]||(vaLeadDate(a)||0), tb=dec[b._sid]||(vaLeadDate(b)||0);
        return tb-ta;
      });
    })()
  };
}
/* Hours this week, from the VA's own submitted shifts plus the one running now.
   Fetched per VA rather than read from localStorage, because the shift log is only
   synced into localStorage in Jack mode — on Suz's laptop it would be empty. */
async function vaWeekHours(va){
  var out={done:0,live:0,total:0,target:40,ok:false};
  try{ out.target=parseFloat(getAppSettings().weeklyHoursTarget)||40; }catch(e){}
  try{
    var now; try{ now=ukNow(); }catch(e){ now=new Date(); }
    var wStart=vaMonStart(now);
    var r=await fetchT(SUPABASE_URL+'/rest/v1/shifts?select=va,date,data&va=eq.'
      +encodeURIComponent(va)+'&order=submitted_at.desc&limit=40',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
    if(r.ok){
      (await r.json()||[]).forEach(function(row){
        var p=String((row&&row.date)||'').split('/'); if(p.length!==3) return;
        var d=new Date(+p[2],+p[1]-1,+p[0]);
        if(isNaN(d.getTime())||d<wStart) return;
        out.done+=parseFloat((row.data&&row.data.hoursWorked)||0)||0;
        /* trackers ADDED that day — typed in the EOD Keepa box, saved as keepaCount.
           Not the same thing as leads FROM trackers; Jack targets both separately.
           GUARD: the count is derived from total-minus-previous-total, so one mistyped
           total poisons the next day — Mera 18/08 typed 111 for ~1173, and 19/08 then
           "added" 1073. Nobody hand-adds 120+ trackers in a day; treat bigger numbers
           as the data glitch they are rather than a smashed target. */
        var _kAdd=parseInt(row.data&&row.data.keepaCount)||0;
        if(_kAdd>0&&_kAdd<=120) out.keepaAdded=(out.keepaAdded||0)+_kAdd;
      });
      out.ok=true;
    }
  }catch(e){}
  // the shift running right now is not in the log yet, and it is the one they care about
  try{
    if(window.state&&state.shiftStart&&!state.submitted&&state.currentVA===va){
      out.live=(workedMs()/3600000);
    }
  }catch(e){}
  out.total=out.done+out.live;
  return out;
}
function vaHM(h){
  var m=Math.max(0,Math.round(h*60));
  return Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'m';
}
/* Repeated feedback. Jack: "if the system detects that I'm repeatedly leaving similar
   notes, surface that". Matched on the phrases he actually types — measured across his
   real notes, not invented: banger 11, oos 6, discount 4, cheaper 4, tanked 4. */
var VA_FOCUS=[
  ['Check for a discount code first', ['discount','voucher','code','promo']],
  ['Check the stock before sending',  ['oos','out of stock','no stock','sold out']],
  ['Look for a cheaper source',       ['cheaper','better price','source it cheaper']],
  ['Check the Keepa price history',   ['tanked','price drop','dropped','down more than up']],
  ['Check the seller count',          ['seller','sellers','competition','crowded']],
  /* 'Check it is not gated' removed 31/08 — gating is visible only on JACK's Amazon
     account, so the chip told the VA to do something she physically cannot. */
  ['Check the buy price is right',    ['wrong price','price doesn','doesnt match','price is wrong']]
];
function vaFocus(notes){
  var hits={};
  notes.forEach(function(l){
    var t=String(leadNoteText(l)||'').toLowerCase(); if(!t) return;
    VA_FOCUS.forEach(function(f){
      if(f[1].some(function(w){ return t.indexOf(w)>=0; })) hits[f[0]]=(hits[f[0]]||0)+1;
    });
  });
  var done=vaFocusDoneMap();
  return Object.keys(hits).map(function(k){ return {label:k,n:hits[k]}; })
    .filter(function(x){ return x.n>=2; })          // once is not a pattern
    .filter(function(x){ return !(done[x.label]>=x.n); })   // ticked off, and Jack has not said it again since
    .sort(function(a,b){ return b.n-a.n; });
}
/* ══════════ PER-VA TARGETS ═══════════════════════════════════════════════════
   Jack: "60 but editable in settings — they are split into different sourcing
   methods", and "2 OA leads a day ideally, up or down per VA in settings".
   Mera and Suz are genuinely different jobs — measured: Mera averages 64 unique
   leads/week at a 15% buy rate and £3.4k of spend, Suz 75/week at 25% and £2.1k —
   so one shared bar would flatter one and punish the other. Every target reads
   from Settings, per VA, with those defaults. */
function vaTargets(va){
  var s={}; try{ s=getAppSettings(); }catch(e){}
  var isM=(va==='Mera'||va==='VA M');
  function num(v,d){ var n=parseFloat(v); return (isFinite(n)&&n>0)?n:d; }
  return {
    hours: num(isM?s.hoursMera:s.hoursSuz, num(s.weeklyHoursTarget,40)),
    leadsWeek: num(isM?s.minLeadsMera:s.minLeadsSuz, 60),
    oaDay: num(isM?s.oaGoalMera:s.oaGoalSuz, 2),
    /* set 20/08/2026: 10 Keepa-tracker leads and 5 THC-discord leads a week, each VA */
    keepaWk: num(isM?s.keepaWkMera:s.keepaWkSuz, 10),
    keepaAddWk: num(isM?s.keepaAddWkMera:s.keepaAddWkSuz, 10),
    /* Jack set Mera 20/08: 40 x £100+ a week, 75 premium and 4 flagship a month.
       Suz's are her own measured median — she runs A2A on faster, lower-ticket
       stock, so the same numbers would be the wrong shape of target for her. */
    /* Set by Jack 24/08 off August actuals, for September. All three ticket bands
       are MONTHLY — £100+ moved from weekly at the same time, so it uses new keys
       (over100Mo*) rather than the old weekly ones: a stale 40 read back as a
       monthly target would show 168 as 420% and look like a smashed goal.
       Mera runs the higher-ticket book, Suz the faster A2A one, hence the split. */
    over100Mo:  num(isM?s.over100MoMera:s.over100MoSuz,   isM?150:50),
    premiumMo:  num(isM?s.premiumMoMera:s.premiumMoSuz,   isM?80:35),
    flagshipMo: num(isM?s.flagshipMoMera:s.flagshipMoSuz, isM?35:6),
    thcWk:  num(isM?s.thcWkMera:s.thcWkSuz, 5)
  };
}
/* green on target, amber within reach, red well short — one rule everywhere. */
function vaKpiCol(pct){ return pct>=100?'#3ac478':pct>=60?'#ffb830':'#ff7a8f'; }
function vaBuckets(t,cls){
  return '<div class="vp-buckets'+(cls?' '+cls:'')+'">'
    +'<span class="vp-b vp-bought"><em>Bought</em><b>'+t.bought+'</b></span>'
    +'<span class="vp-b vp-good"><em>Good lead, not bought</em><b>'+t.good+'</b></span>'
    +'<span class="vp-b vp-pend"><em>Waiting on Jack</em><b>'+t.pending+'</b></span>'
    +'<span class="vp-b vp-rej"><em>Rejected</em><b>'+t.rejected+'</b></span>'
    +'</div>';
}
/* ── WHICH BUYING LINE IS THIS VA? ───────────────────────────────────────────
   The ledger splits spend by PROVIDER — "VA-A" and "VA-S" in column M. Nothing in
   the data says which sourcing VA each line belongs to, so it is assumed here
   (Mera -> A, Suz -> S) and overridable in settings with spendVaMera / spendVaSuz.
   Getting this wrong would show one VA the other's spend, which is worse than
   showing none — so if Jack ever says the mapping is the other way round, it is a
   settings change, not a code change. */
function vaSpendLine(va){
  var s={}; try{ s=getAppSettings(); }catch(e){}
  var isM=(va==='Mera'||va==='VA M');
  var v=String((isM?s.spendVaMera:s.spendVaSuz)||'').trim().toUpperCase();
  return (v==='A'||v==='S') ? v : (isM?'A':'S');
}
/* Month-to-date spend for one VA, straight off the purchase ledger. Cached per
   VA+range; spendForRangeGB() caches the sheet read underneath it as well. */
function vaMonthSpendFetch(va){
  try{
    if(typeof spendForRangeGB!=='function') return Promise.resolve(null);
    var now; try{ now=ukNow(); }catch(e){ now=new Date(); }
    function gb(d){ return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear(); }
    var from=gb(new Date(now.getFullYear(),now.getMonth(),1)), to=gb(now);
    var key=va+'|'+from+'|'+to;
    if(window._vaSpendKey===key && window._vaSpendVal!==undefined)
      return Promise.resolve(window._vaSpendVal);
    return spendForRangeGB(from,to).then(function(r){
      var out=null;
      if(r){
        var line=vaSpendLine(va), side=(line==='A')?r.A:r.S;
        out={ spend:(side&&side.spend)||0, units:(side&&side.units)||0, line:line };
      }
      window._vaSpendKey=key; window._vaSpendVal=out;
      return out;
    }).catch(function(){ return null; });
  }catch(e){ return Promise.resolve(null); }
}
/* The one-line week/month answer that lives on the shift screen itself. */
function vaStripHTML(va){
  if(!(window.leads||[]).length) return '';
  var p=vaPerf(va), h=window._vaHours||null;
  function seg(v,col,lbl){ return '<span class="vs-seg"><b style="color:'+col+'">'+v+'</b><i>'+lbl+'</i></span>'; }
  var out='<span class="vs-cap">This week</span>'
    +seg(p.week.uniq,'#10d99a','leads')+seg(p.week.bought,'#38bdf8','bought')
    /* 'spent' clashed with the Spend tile, which reads the purchase ledger (actually
       paid). This figure is the sum of QUOTED buy prices on bought leads — say so. */
    +(p.week.spend>0?seg('£'+Math.round(p.week.spend).toLocaleString(),'#c084fc','lead buys'):'')
    +(h?seg(vaHM(h.total),(h.total/(h.target||1)>=1?'#3ac478':'#ffb830'),'of '+h.target+'h'):'')
    +'<span class="vs-div"></span><span class="vs-cap">'+p.monthName.slice(0,3)+'</span>'
    +seg(p.mtd.uniq,'#10d99a','')+seg(p.mtd.bought,'#38bdf8','')
    +(p.mtd.spend>0?seg('£'+Math.round(p.mtd.spend).toLocaleString(),'#c084fc',''):'')
    +'<button class="vs-more" id="vp-toggle" onclick="vaPerfToggle()" aria-expanded="false"><span class="vp-caret">&#9656;</span> Details</button>';
  return out;
}
/* "this needs to be actionable" — a focus item can be ticked off. Saved locally with
   the count it was ticked AT, so if Jack says it again the item comes back. */
function vaFocusDoneMap(){ try{ return JSON.parse(lsGet('bdl_focus_done')||'{}'); }catch(e){ return {}; } }
function vaFocusGotIt(label,n){
  var m=vaFocusDoneMap(); m[label]=n;
  try{ lsPut('bdl_focus_done',JSON.stringify(m)); }catch(e){}
  showToast('Noted ✓ — it comes back only if Jack says it again');
  try{ vaPerfPaint(); }catch(e){}
}
function vaPerfHTML(va){
  if(!(window.leads||[]).length) return '';         // no data yet — say nothing rather than all zeros
  var p=vaPerf(va), h=window._vaHours||null;
  var first=vaDisp(va).split(' ')[0];
  /* Jack: "no way to get it off screen now i've opened it" — the only collapse
     control lived up in the strip. The panel closes itself now. */
  var out='<div class="vp-wrap">'
    +'<button class="vp-close" onclick="try{lsPut(\'bdl_vaperf_open\',\'0\')}catch(e){};vaPerfApply();">✕ Hide</button>';

  // ── hours ──────────────────────────────────────────────────────────────
  if(h){
    var pct=h.target>0?Math.min(100,Math.round(h.total/h.target*100)):0;
    var left=Math.max(0,h.target-h.total);
    var col=pct>=100?'#3ac478':pct>=70?'#f5a524':'#ff8fa1';
    out+='<div class="vp-card vp-hours"><div class="vp-h">Hours this week</div>'
      +'<div class="vp-hrs"><b style="color:'+col+'">'+vaHM(h.total)+'</b>'
      +'<span>of '+h.target+'h</span></div>'
      +'<div class="vp-bar"><div style="width:'+pct+'%;background:'+col+'"></div></div>'
      +'<div class="vp-sub">'+(left>0?vaHM(left)+' left this week':'Target met — nice one')
      +(h.live>0?' · <span style="color:#3ac478">'+vaHM(h.live)+' from the shift you are on now</span>':'')+'</div>'
      /* Jack: "if there's been some kind of problem that means their hours haven't
         recorded properly, there needs to be an easy way to report it to me" — otherwise
         a tracker failure looks like someone who did not do their hours. */
      +'<button class="vp-issue" onclick="vaHoursIssue()">⚠ My hours look wrong — tell Jack</button>'
      +'</div>';
  }

  // ── this week ──────────────────────────────────────────────────────────
  out+='<div class="vp-card"><div class="vp-h">This week</div>'
    +'<div class="vp-big">'+p.week.uniq+'<span>leads found'+(p.week.n>p.week.uniq?' · '+p.week.n+' sent':'')+'</span></div>'
    +vaBuckets(p.week)
    +(p.week.spend>0?'<div class="vp-sub">£'+Math.round(p.week.spend).toLocaleString()+' of stock bought from your leads</div>':'')
    +'</div>';

  // ── month to date, with last month alongside for the first four days ──
  var showLast=(p.dayOfMonth<=4 && p.lastMonth.n>0);
  out+='<div class="vp-card"><div class="vp-h">'+escHtml(p.monthName)+' so far</div>'
    +'<div class="vp-big">'+p.mtd.uniq+'<span>leads found'+(p.mtd.n>p.mtd.uniq?' · '+p.mtd.n+' sent':'')+'</span></div>'
    +vaBuckets(p.mtd)
    +(p.mtd.spend>0?'<div class="vp-sub">£'+Math.round(p.mtd.spend).toLocaleString()+' of stock bought from your leads</div>':'')
    +(showLast
      ? '<div class="vp-last"><b>'+escHtml(p.lastMonthName)+' finished on</b> '
        +p.lastMonth.n+' leads · '+p.lastMonth.bought+' bought · £'
        +Math.round(p.lastMonth.spend).toLocaleString()+'</div>'
      : '')
    +'</div>';

  // ── the OA push ────────────────────────────────────────────────────────
  var d=p.mtd.oa-p.lastMonth.oa;
  var sameDayLast=p.lastMonth.n>0;
  out+='<div class="vp-card"><div class="vp-h">Normal OA leads</div>'
    +'<div class="vp-big">'+p.mtd.oa+'<span>this month</span></div>'
    +'<div class="vp-sub">Shop-bought, not Amazon — Jack wants more of these.'
    +(sameDayLast?'<br><b style="color:'+(d>=0?'#3ac478':'#ff8fa1')+'">'
      +(d>=0?'+':'')+d+'</b> vs all of '+escHtml(p.lastMonthName)+' ('+p.lastMonth.oa+')':'')
    +'</div></div>';

  // ── keepa tracker ──────────────────────────────────────────────────────
  if(p.mtd.keepa>0){
    out+='<div class="vp-card"><div class="vp-h">From your Keepa tracker</div>'
      +'<div class="vp-big">'+p.mtd.keepaBought+'<span>bought of '+p.mtd.keepa+' sent</span></div>'
      +'<div class="vp-sub">'+(p.mtd.keepaBought>0?'Tracker doing its job.':'None bought yet this month.')+'</div></div>';
  }

  // ── what Jack actually said ────────────────────────────────────────────
  var recent=p.notes.slice(0,5);
  if(recent.length){
    out+='<div class="vp-card vp-fb"><div class="vp-h">What Jack said — last 7 days</div>'
      +recent.map(function(l){
        var o=leadOutcome(l);
        return '<div class="vp-note"><span class="vp-n-o vp-'+o+'">'+
          (o==='bought'?'Bought':o==='rejected'?'Rejected':o==='good'?'Good lead':'Pending')+'</span>'
          +'<span class="vp-n-t">'+escHtml(String(l.title||'').slice(0,42))+'</span>'
          +'<span class="vp-n-c">“'+escHtml(leadNoteText(l).slice(0,90))+'”</span></div>';
      }).join('')+'</div>';
  }
  var focus=vaFocus(p.notes);
  if(focus.length){
    out+='<div class="vp-card vp-focus"><div class="vp-h">Worth focusing on</div>'
      +'<div class="vp-sub">Jack has said these more than once, so they are the quickest wins.</div>'
      +focus.slice(0,4).map(function(f){
        return '<div class="vp-f"><span>'+escHtml(f.label)+'</span><b>×'+f.n+'</b>'
          +'<button class="vp-f-ok" onclick="vaFocusGotIt(this.dataset.l,+this.dataset.n)" data-l="'+escHtml(f.label)+'" data-n="'+f.n+'">✓ Got it</button></div>';
      }).join('')+'</div>';
  }
  return out+'</div>';
}
/* Sends the hours problem straight to Jack as a From-VA issue, with the numbers
   attached so he can see what the tracker thinks it recorded. */
function vaHoursIssue(){
  var h=window._vaHours||{total:0,target:0};
  var msg=prompt('What went wrong with your hours? Jack will see this with your recorded '
    +'hours ('+vaHM(h.total)+' of '+h.target+'h) attached.');
  if(msg===null) return;
  msg=String(msg).trim(); if(!msg) return;
  try{
    fetch(SUPABASE_URL+'/rest/v1/app_flags',{method:'POST',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
               'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},
      body:JSON.stringify({k:'hoursissue:'+(state&&state.currentVA||'VA')+':'+Date.now(),
        v:JSON.stringify({va:(state&&state.currentVA)||'', msg:msg,
          recorded:h.total, target:h.target, at:new Date().toISOString()})})})
      .then(function(){ showToast('Sent to Jack ✓ he will see your recorded hours with it'); })
      .catch(function(){ showToast('Could not send it — tell Jack on Discord',true); });
  }catch(e){ showToast('Could not send it — tell Jack on Discord',true); }
}
/* Paint it, and go and get the two things it needs if they are not here yet. Leads
   already refresh every 60s during a shift; hours are fetched once per shift. */
/* Folded by default so the ticklist is the first thing on screen, but her choice
   sticks — open it once and it stays open on this machine. */
function vaPerfOpen(){ try{ return lsGet('bdl_vaperf_open')==='1'; }catch(e){ return false; } }
function vaPerfApply(){
  var host=document.getElementById('va-perf'), btn=document.getElementById('vp-toggle');
  if(!host) return;
  var open=vaPerfOpen();
  host.classList.toggle('vp-collapsed', !open);
  if(btn) btn.setAttribute('aria-expanded', open?'true':'false');
}
function vaPerfToggle(){
  try{ lsPut('bdl_vaperf_open', vaPerfOpen()?'0':'1'); }catch(e){}
  vaPerfApply();
  if(vaPerfOpen()){ try{ document.getElementById('va-perf').scrollIntoView({behavior:'smooth',block:'nearest'}); }catch(e){} }
}
function vaPerfPaint(){
  var host=document.getElementById('va-perf'); if(!host) return;
  vaPerfApply();
  try{
    var st=document.getElementById('va-strip');
    var v0=(window.state&&state.currentVA)||''; if(v0==='Test') v0=(state._previewAs||'');
    if(st&&v0) st.innerHTML=vaStripHTML(v0);
  }catch(e){}
  var va=(window.state&&state.currentVA)||'';
  if(va==='Test') va=(state._previewAs||'');
  if(!va||!(window.state&&state.shiftStart)){ host.innerHTML=''; return; }
  try{ host.innerHTML=vaPerfHTML(va); }catch(e){ host.innerHTML=''; }
  if(!window._vaHoursFor||window._vaHoursFor!==va){
    window._vaHoursFor=va;
    try{ vaWeekHours(va).then(function(h){ window._vaHours=h; try{ host.innerHTML=vaPerfHTML(va); }catch(e){} }); }catch(e){}
  }
  if(!(window.leads||[]).length && typeof loadLeadsFromDB==='function'){
    if(!window._vaPerfPulled){ window._vaPerfPulled=1;
      loadLeadsFromDB().then(function(){ try{ host.innerHTML=vaPerfHTML(va); }catch(e){} }).catch(function(){}); }
  }
}
function vaGoal(va){
  var s; try{ s=getAppSettings(); }catch(e){ return 12; }
  if(va==='Mera'||va==='VA M') return parseInt(s.goalMera)||12;
  if(va==='Suz' ||va==='VA S') return parseInt(s.goalSuz) ||12;
  return 12;
}
/* jbPriSet called this and it didn't exist. jb_pref returns a live object so the
   mutation already stuck, but the throw meant nothing after it ran. */
function jb_prefSet(va,pref){
  window._jbSendPrefs=window._jbSendPrefs||{};
  window._jbSendPrefs[va]=pref||{};
  return window._jbSendPrefs[va];
}
function shiftGoal(){
  var s=getAppSettings(); var va=(window.state&&(state._previewAs||state.currentVA))||'';
  return va==='Mera'?(s.goalMera||12):va==='Suz'?(s.goalSuz||12):12;
}
/* A small strip under the shift KPIs: OA today vs target. Only shown when Jack has
   actually set an OA target, so it never nags about a goal that doesn't exist. */
function renderOaGoal(){
  var host=document.getElementById('shift-oa'); if(!host) return;
  var va=(window.state&&(state._previewAs||state.currentVA))||'';
  var goal=vaOaGoal(va);
  if(!goal||!state.shiftStart){ host.innerHTML=''; return; }
  var got=vaOaToday(va);
  var pct=Math.min(100,Math.round(got/goal*100));
  var tone=got>=goal?'#10d99a':(got>=goal*0.5?'#f2c200':'#ff6b7f');
  host.innerHTML='<div class="oag'+(got>=goal?' done':'')+'">'
    +'<span class="oag-l">OA leads today</span>'
    +'<span class="oag-v" style="color:'+tone+'"><b>'+got+'</b> / '+goal+'</span>'
    +'<span class="oag-bar"><i style="width:'+pct+'%;background:'+tone+'"></i></span>'
    +'<span class="oag-h">'+(got>=goal?'target hit ✓':(goal-got)+' more OA to hit today’s target')+'</span>'
    +'</div>';
}
function updateMomentum(leads){
  try{ renderOaGoal(); }catch(e){}
  var el=document.getElementById('shift-momentum'); if(!el) return;
  if(!state.shiftStart){ el.innerHTML=''; return; }
  var s=getAppSettings(); var goal=shiftGoal();
  var pct=goal>0?Math.min(100,Math.round(leads/goal*100)):0;
  var emoji,msg,col;
  if(pct>=100){ emoji='🔥'; msg='Goal smashed — '+leads+' leads! Everything now is a bonus.'; col='#10d99a'; }
  else if(pct>=67){ emoji='💪'; msg='So close — just '+Math.max(0,goal-leads)+' more to hit your goal.'; col='#f5a524'; }
  else if(pct>=34){ emoji='📈'; msg='Nice momentum — over a third of the way there.'; col='#18c8f0'; }
  else if(leads>0){ emoji='👍'; msg='Off the mark — keep those leads coming.'; col='#8b5cff'; }
  else { emoji='☕'; msg=(s.vaGreeting&&s.vaGreeting.trim())?s.vaGreeting.trim():'Let\'s find some bangers today.'; col='#8b5cff'; }
  el.innerHTML='<div class="momentum-card mc-slim"><div class="momentum-emoji">'+emoji+'</div>'
    +'<div class="momentum-msg" style="flex:1;min-width:0;">'+msg+'</div></div>';
}
function checkShiftCelebrations(leads){
  try{
    if(!state.shiftStart||state.submitted) return;
    try{ if(getAppSettings().vaCelebrate===0) return; }catch(e){}
    var goal=shiftGoal();
    if(goal>0 && leads>=goal && leads>0 && !state._goalCelebrated){
      state._goalCelebrated=true; fireConfetti();
      showBigCheer('Daily goal smashed! 🎯 '+leads+' leads','You hit '+goal+' — everything from here is a bonus.');
    }
    var mand=state.tasks.filter(function(t){return t.mandatory!==false;});
    var mdone=mand.filter(function(t){return t.done;}).length;
    if(mand.length>0 && mdone===mand.length && !state._tasksCelebrated){
      state._tasksCelebrated=true; fireConfetti();
      showBigCheer('All tasks done! ✅','Every mandatory task complete — brilliant work.');
    }
  }catch(e){}
}
function updateStats() {
  var all=state.tasks.concat(state.extraTasks);
  var leads=0, done=0;
  all.forEach(function(t){ leads+=parseInt(t.leads)||0; if(t.done) done++; });
  var _sheet=vaSheetLeadsToday(); if(_sheet!=null) leads=Math.max(_sheet,leads);
  var ms  = workedMs();
  var hrs = ms/3600000;
  document.getElementById('stat-leads').textContent = leads;
  document.getElementById('stat-tasks').textContent = done;
  document.getElementById('stat-hrs').textContent   = hrs.toFixed(1);
  document.getElementById('stat-lph').textContent   = (hrs>0.05&&leads>0) ? (leads/hrs).toFixed(1) : '-';
  updateMomentum(leads);
  checkShiftCelebrations(leads);
  renderEodRecap();
}

// Live recap chips + incomplete-task warning inside the "Wrap up your shift" card
function renderEodRecap() {
  var recap = document.getElementById('eod-recap');
  if (!recap) return;
  var all = state.tasks.concat(state.extraTasks);
  var leads = 0; all.forEach(function(t){ leads += parseInt(t.leads)||0; });
  var _shR=vaSheetLeadsToday(); if(_shR!=null) leads=Math.max(_shR,leads);
  var ms = workedMs();
  var hrs = ms/3600000; if (hrs < 0) hrs = 0;
  var mand = state.tasks.filter(function(t){ return t.mandatory !== false; });
  var mdone = mand.filter(function(t){ return t.done; }).length;
  var mskip = mand.filter(function(t){ return t.skipped; }).length;
  // include a break still running, so the recap matches what gets submitted
  var brk = Math.round(breakTotalAt(state.totalBreakMs||0,state.onBreak,state.breakStart,Date.now())/60000);
  function chip(k,v,l){ return '<div class="rc" style="--k:'+k+'"><b>'+v+'</b><span>'+l+'</span></div>'; }
  recap.innerHTML = chip('#f5a524',hrs.toFixed(1),'Hours') + chip('#10d99a',leads,'Leads')
    + chip('#8b5cff',mdone+'/'+mand.length,'Tasks') + chip('#f5455f',brk,'Break m');
  var warn = document.getElementById('eod-warning');
  if (warn) {
    var left = mand.length - mdone - mskip;
    if (left > 0) {
      warn.style.display = 'flex';
      warn.innerHTML = '&#9888;&#65039; <span>'+left+' mandatory task'+(left===1?'':'s')+' still not done &#8212; you can submit, but finish them if you can.</span>';
    } else { warn.style.display = 'none'; }
  }
}

// Quick-tag buttons that prepend a labelled line into the notes box
function addIssueTag(label, kind) {
  var ta = document.getElementById('eod-notes');
  if (!ta) return;
  var mark = kind === 'win' ? '✅ ' : '⚠️ ';
  var v = ta.value.replace(/\s+$/,'');
  ta.value = (v ? v + '\n' : '') + mark + label + ': ';
  ta.focus();
  ta.selectionStart = ta.selectionEnd = ta.value.length;
}

async function submitEOD() {
  if (state._eodSubmitting) { showToast('Already submitting\u2026 hang on', true); return; }
  // The double-tap lock is taken AFTER validation, not before. Taking it first meant a
  // missing skip-reason or Keepa count jammed the Submit button for 12 seconds and
  // answered the next tap with "Already submitting…", which is simply untrue.
  /* "VAs can't end their shift." Measured: when submission is blocked, the field it is
     blocking on sits 972px ABOVE the viewport — she taps Submit at the bottom of the page,
     focus jumps to something she cannot see, the toast scrolls past, and to her the button
     is simply dead. A block she can't see is indistinguishable from a broken app.
     Bring the blocker to her, and make it obvious. */
  function eodBlock(el,msg){
    try{
      if(el){
        el.scrollIntoView({behavior:'smooth',block:'center'});
        el.classList.add('eod-blocked');
        setTimeout(function(){ try{ el.classList.remove('eod-blocked'); }catch(e){} },2600);
        setTimeout(function(){ try{ el.focus({preventScroll:true}); }catch(e){ el.focus(); } },320);
      }
    }catch(e){}
    showToast(msg,true);
  }
  var bad = state.tasks.filter(function(t){ return t.mandatory&&t.skipped&&!t.skipReason.trim(); });
  if (bad.length) {
    var bi=state.tasks.indexOf(bad[0]);
    eodBlock(document.querySelector('#mandatory-tasks .task-item:nth-of-type('+(bi+1)+')'),
      'Add a reason for the skipped task first — it is highlighted above');
    return;
  }

  // Keepa validation
  var keepaInput = document.getElementById('keepa-today');
  var keepaTodayVal = keepaInput ? keepaInput.value.trim() : '';
  if (state.currentVA !== 'Test' && keepaTodayVal === '') {
    eodBlock(keepaInput,'Enter your Keepa tracker count first — scrolled to it for you');
    return;
  }
  /* Last look before she closes the day. Fresh pull (the sheet may have changed in the last
     minute), repaint, and if there are duplicates or loss-making leads, bring the list to her
     and ask for a second tap. Not a hard block — a sync lag must never trap her on shift —
     but it can no longer be missed. Same counts on the second tap = she has seen it, let it go. */
  if (state.currentVA !== 'Test' && !state._eodWasEdit) {
    if (state._eodChecking) return;
    state._eodChecking = true;
    try{
      try{ await Promise.race([loadLeadsFromDB(), new Promise(function(r){ setTimeout(r,6000); })]); }catch(e){}
      try{ eodRenderLeadCheck(); }catch(e){}
      /* she must solve it, not out-wait it: a second tap is no longer a way past.
         The only ways past are the two real ones — fix it, or acknowledge it. */
      var _open=[];
      try{ _open=eodOpenIssues(state.currentVA); }catch(e){}
      var _hard=_open.filter(function(x){ return x.hard; });
      /* only excuse a hard issue when the sheet itself could not be read */
      if (window._eodSheetUnreadable){
        /* we could not read her sheet. "We couldn't check" must never be served to her
           as "you didn't do it" — drop the duplicates from the block entirely. */
        _hard=[];
        _open=_open.filter(function(x){ return !x.hard; });
      }
      if (_hard.length) {
        eodBlock(document.getElementById('eod-leadcheck'),
          '⚠️ '+_hard.length+' duplicate'+(_hard.length===1?'':'s')+' with no reason on your sheet. '
          +'Add a VA NOTE saying why, or delete the row — then press “I’ve fixed it”. '
          +'This one can’t be acknowledged away.');
        return;
      }
      if (_open.length) {
        var _by={}; _open.forEach(function(x){ _by[x.kind]=(_by[x.kind]||0)+1; });
        eodBlock(document.getElementById('eod-leadcheck'),
          '⚠️ '+_open.length+' thing'+(_open.length===1?'':'s')+' still to sort — '
          +Object.keys(_by).map(function(k){ return _by[k]+' '+k; }).join(', ')
          +'. Fix '+(_open.length===1?'it':'them')+' on your sheet, or press Acknowledge on the row.');
        return;
      }
    } finally { state._eodChecking = false; }
  }
  // validation passed — NOW lock out a second submission
  state._eodSubmitting = true;
  setTimeout(function(){ state._eodSubmitting = false; }, 12000);

  var keepaVals = keepaGetValues();

  /* ── THE 1,073 GUARD ─────────────────────────────────────────────────────────
     keepaCount is DERIVED (today's total minus last shift's), so one mistyped total
     poisons the next day: 18/08 Mera typed 111 for ~1173, and 19/08 recorded 1,073
     trackers "added". Nobody adds 120+ by hand in a shift. Ask, in her words, and
     offer the repair: if today's total is right, record a corrected baseline —
     0 added, chain fixed from tomorrow. Cancel lets her fix a mistyped today. */
  if (state.currentVA !== 'Test' && !_keepaIsFirst && Math.abs(keepaVals.count) > 120) {
    var _kMsg = keepaVals.count > 0
      ? ('Since your last shift the Keepa total went '+(_keepaPrevTotal||0).toLocaleString()
        +' \u2192 '+keepaVals.total.toLocaleString()+' \u2014 that would record '
        +keepaVals.count.toLocaleString()+' trackers ADDED today.\n\n'
        +'If TODAY\u2019S number is right (last shift\u2019s was probably mistyped), press OK \u2014 '
        +'it is saved as a corrected baseline, 0 added today.\n\n'
        +'If you mistyped TODAY\u2019S total, press Cancel and fix it.')
      : ('Since your last shift the Keepa total went '+(_keepaPrevTotal||0).toLocaleString()
        +' \u2192 '+keepaVals.total.toLocaleString()+' \u2014 that is '
        +Math.abs(keepaVals.count).toLocaleString()+' trackers REMOVED.\n\n'
        +'Press OK only if you really cleared them out. Press Cancel to fix the number.');
    if (!confirm(_kMsg)) {
      state._eodSubmitting = false;
      eodBlock(keepaInput, 'Fix your Keepa total, then submit again');
      return;
    }
    if (keepaVals.count > 0) keepaVals = { count: 0, total: keepaVals.total, rebase: true };
  }

  var notes = document.getElementById('eod-notes').value.trim();

  var all=state.tasks.concat(state.extraTasks);
  var leads=0; all.forEach(function(t){ leads+=parseInt(t.leads)||0; });
  var _shS=vaSheetLeadsToday(); if(_shS!=null) leads=Math.max(_shS,leads);
  var ms  = workedMs();
  var hrs = (ms/3600000).toFixed(1);
  var done = all.filter(function(t){return t.done;}).length;
  var skip = all.filter(function(t){return t.skipped;}).length;
  // Shift is attributed to the PH-time day it STARTED (VAs work split/odd hours)
  var today = ukDateShort();
  var phShiftDay = today;
  try{ if(state.shiftStart) phShiftDay = new Date(state.shiftStart).toLocaleDateString('en-GB',{timeZone:'Asia/Manila'}); }catch(e){}

  var lph = (leads>0 && parseFloat(hrs)>0) ? (leads/parseFloat(hrs)).toFixed(1) : '-';
  // From-Jack items still open (they roll to tomorrow)
  var jbOpenCount=0, jbOldest=0;
  try{ if((state.currentVA==='Mera'||state.currentVA==='Suz')&&typeof mgr_openSummary==='function'){ var _js=mgr_openSummary(state.currentVA); jbOpenCount=_js.open.length; jbOldest=_js.oldest; } }catch(e){}
  function rcard(k,v,l){ return '<div class="rcard" style="--k:'+k+'"><b>'+v+'</b><span>'+l+'</span></div>'; }
  var _es=getAppSettings();
  var _egoal=state.currentVA==='Mera'?(_es.goalMera||12):state.currentVA==='Suz'?(_es.goalSuz||12):12;
  var _ehtgt=_es.dailyHoursTarget||8;
  function _esc(p){ return p>=100?'#10d99a':p>=75?'#f5a524':'#f5455f'; }
  var html = '<div class="eod-recap-grid">'
    + rcard(_esc(_ehtgt>0?parseFloat(hrs)/_ehtgt*100:0),hrs,'Hours worked')
    + rcard(_esc(_egoal>0?leads/_egoal*100:0),leads,'Total leads')
    + rcard('#18c8f0',lph,'Leads / hr')
    + rcard(_esc(all.length>0?done/all.length*100:0),done+'/'+all.length,'Tasks done')
    + rcard('#10d99a',keepaVals.count,'Keepa added')
    + '</div>';

  var _tpct=all.length?Math.round(done/all.length*100):0;
  html += '<div class="eod-summary-box eod-bd">'
    + '<div class="eod-line"><span class="eod-line-label">VA</span><span class="eod-line-val">'+(typeof vaDisp==='function'?vaDisp(state.currentVA):state.currentVA)+'</span></div>'
    + '<div class="eod-line"><span class="eod-line-label">Date (UK)</span><span class="eod-line-val">'+today+'</span></div>'
    + '<div class="eod-line"><span class="eod-line-label">Keepa running total</span><span class="eod-line-val"><span class="ok">'+keepaVals.total.toLocaleString()+'</span></span></div>'
    + '<div class="eod-bd-title" style="display:flex;justify-content:space-between;align-items:center;">Task breakdown<span style="color:'+_esc(_tpct)+';letter-spacing:0;">'+done+'/'+all.length+' &middot; '+_tpct+'%'+(skip?' &middot; '+skip+' skipped':'')+'</span></div>'
    + '<div class="eod-taskbar"><i style="width:'+_tpct+'%;background:'+_esc(_tpct)+'"></i></div>';

  all.forEach(function(t){
    var linksInfo = '';
    if (t.links&&t.links.length) { var filled=t.links.filter(function(l){return l&&l.trim();}); if(filled.length) linksInfo=' &#183; '+filled.length+' link'+(filled.length>1?'s':''); }
    var tickOnly=t.tickOnly===true||(t.id==='test-1'||t.id==='leadsheet'||t.id==='ht-filters'||t.id==='telegram-eod'||t.id==='suz-leadsheet'||t.id==='suz-telegram-eod'||t.id==='leadsheet-eod'||t.id==='suz-leadsheet-eod');
    var mark=t.skipped?'<span class="eod-task-mark m-skip">&#10005;</span>':t.done?'<span class="eod-task-mark m-done">&#10003;</span>':'<span class="eod-task-mark m-none">&#8226;</span>';
    var status = t.skipped
      ? '<span class="sk">Skipped &#183; '+t.skipReason+'</span>'
      : t.done
        ? (tickOnly
            ? '<span class="ok">Done</span>'
            : '<span class="ok">'+(t.leads||0)+' leads &#183; '+(t.time||((t.timeHrs||0)+'h '+(t.timeMins||0)+'m'))+(t.context?' &#183; '+t.context:'')+linksInfo+'</span>')
        : '<span class="no">Not logged</span>';
    html += '<div class="eod-line'+(t.done?'':' eod-line-dim')+'"><span class="eod-line-label" style="font-size:12px;display:flex;align-items:center;gap:9px;">'+mark+t.name+'</span><span class="eod-line-val">'+status+'</span></div>';
  });
  html += '</div>';

  if (jbOpenCount>0) html += '<div class="eod-jb-open">&#128204; <b>'+jbOpenCount+'</b> From-Jack item'+(jbOpenCount===1?'':'s')+' still open'+(jbOldest>0?' (oldest '+jbOldest+'d)':'')+' — '+(jbOpenCount===1?'it rolls':'they roll')+' over to tomorrow\'s list.</div>';
  if (notes) html += '<div class="eod-notes-card"><div class="lbl">Notes for Jack</div>'+notes.replace(/</g,'&lt;')+'</div>';

  document.getElementById('eod-report-content').innerHTML = html;

  // Warm, personalised finish message
  try {
    var name = state.currentVA;
    var tyEmoji = document.querySelector('.thankyou-emoji');
    var tyH = document.querySelector('.thankyou-heading');
    var tyS = document.querySelector('.thankyou-sub');
    var tyG = document.querySelector('.thankyou-green');
    var big = leads >= 12, mid = leads >= 5;
    if (tyEmoji) tyEmoji.innerHTML = big ? '&#x1F525;' : (mid ? '&#x1F389;' : '&#x2705;');
    if (tyH) tyH.innerHTML = (big ? 'Brilliant shift,<br>' : 'Nice work,<br>') + name + '!';
    if (tyS) tyS.textContent = 'You logged ' + leads + ' lead' + (leads===1?'':'s') + ' and completed ' + done + ' task' + (done===1?'':'s') + ' in ' + hrs + 'h. Jack can see everything.';
    if (tyG) tyG.innerHTML = (big ? 'Outstanding &#8212; go enjoy your evening! ' : 'Rest up &#8212; see you tomorrow! ') + '&#x1F642;';
  } catch(_){}

  /* The closing event. From here the day's hours are fully determined by the log —
     clock_in to clock_out minus breaks — and no later save can move them. */
  try{ seLog('clock_out',{ hours:(workedMs()/3600000).toFixed(2),
                           breakMs:state.totalBreakMs||0,
                           tasksDone:(state.tasks||[]).filter(function(t){return t.done;}).length }); }catch(e){}

  state.submitted = true;
  // anything they didn't get to follows them into tomorrow, with a day count —
  // nothing quietly disappears at the end of a shift
  try{
    var _carry=(state.tasks.concat(state.extraTasks))
      .filter(function(t){ return !t.done && !t.skipped && t.mandatory!==false && !t.jbIid && !t.jbGroup && !t.jbOneoffIid; })
      .map(function(t){ return {id:t.id,name:t.jbLabel||t.name,since:(t._carrySince||phShiftDay),days:(parseInt(t._carryDays)||0)+1}; });
    lsPut('bdl_carry_'+state.currentVA, JSON.stringify(_carry.slice(0,20)));
  }catch(e){}
  try{ db_pushLiveStatus(); }catch(e){}   // flip live_status → submitted so the Live panel/pop-out stops showing "Active"
  // NOTE: the draft is deliberately NOT deleted here any more. It is the only copy of
  // the day's work, and it used to be thrown away before the save was even attempted.
  // It is removed further down, and only once the shift row is confirmed written.
  document.getElementById('eod-report').classList.add('show');
  document.getElementById('eod-form').style.display = 'none';
  clearInterval(state.timerInterval);
  try{ fireConfetti(); setTimeout(fireConfetti,400); }catch(e){}
  // 15-minute edit window
  state._eodEditUntil = Date.now() + 15*60000;
  var lb=document.querySelector('#eod-report .locked-bar');
  if(lb) lb.innerHTML='<span>&#128274;</span> Shift submitted &mdash; <button onclick="editEOD()" style="background:none;border:none;color:var(--cyan);font-family:var(--font);font-size:12px;font-weight:800;cursor:pointer;text-decoration:underline;">&#9998; Edit EOD</button> <span style="color:var(--muted-2);">(15 min window)</span>';

  try {
    // _trueStart, not shiftStart: the latter is a timer base the restore rewrites.
    var _startMs = state._trueStart || state.shiftStart;
    var shiftStartTime = _startMs ? new Date(_startMs).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:true}) : '-';
    var shiftEndTime   = ukTimeString();
    /* Found by auditing the same clock a second time: if she submits while STILL on
       a break, breakMins only counted BANKED breaks — a 3h break in progress went
       unrecorded. hoursWorked was right (workedMs already excludes it) but the shift
       row then failed its own evidence check, because hours+breaks no longer added
       up to the clock window. Close the open break into the record first. */
    if(state.onBreak && state.breakStart){
      var _endMs=Date.now(), _open=Math.max(0,_endMs-state.breakStart);
      state.breaks.push({ startMs:state.breakStart, endMs:_endMs,
        startTime:state._currentBreakStartTime||'', endTime:ukTimeString(),
        durationMins:Math.round(_open/60000) });
      state.totalBreakMs+=_open;
      state.onBreak=false; state.breakStart=null; state._currentBreakStartTime='';
      try{ paintBreakUI(); }catch(e){}
    }
    var breakMins      = Math.round(state.totalBreakMs/60000);
    var rec = { id:Date.now(), va:state.currentVA, date:phShiftDay, dateUK:today, submittedAt:ukTimeString(),
      shiftStart:shiftStartTime, shiftEnd:shiftEndTime, breakMins:breakMins,
      breaks:state.breaks.map(function(b){return {startTime:b.startTime,endTime:b.endTime,durationMins:b.durationMins,startMs:b.startMs,endMs:b.endMs};}),
      hoursWorked:hrs, totalLeads:leads, leadsPerHr:leads>0&&hrs>0?(leads/parseFloat(hrs)).toFixed(1):'-',
      tasksDone:done, tasksSkipped:skip, notes:notes,
      keepaCount: keepaVals.count, keepaTotal: keepaVals.total,
      keepaRebase: !!keepaVals.rebase,
      jbOutstanding: jbOpenCount, jbOldest: jbOldest,
      storefronts: (function(){ try{ return sfSummary(); }catch(e){ return null; } })(),
      // This whitelist is why timer usage was unanswerable: `time` survived but nothing
      // recorded HOW it got there, so a pressed Start/Stop and a typed number looked
      // identical in the database. timeSource fixes that; timerSec/linkLeads/linkSecs
      // carry the per-link detail the storefront analytics need.
      tasks:all.map(function(t){ return {id:t.id,name:t.name,done:t.done,skipped:t.skipped,skipReason:t.skipReason,
        leads:t.leads,time:t.time,context:t.context,links:t.links||[],tickedAt:t.tickedAt||'',
        timeSource:(t._timeFromTimer?'timer':(t.time?'manual':'')),
        timerSec:Math.round(t.timerSec||0),
        linkLeads:(t.linkLeads||[]).slice(),
        linkSecs:(t.linkSecs||[]).slice()}; })
    };
    /* v50.9: no browser copy of the shift — Supabase is the record, and the cloud
       write below is no longer queued behind a localStorage write that could throw.
       The in-memory summary keeps "vs last shift" and the streak right for the rest
       of this session; the next login pulls it fresh. */
    try{ vaHistRemember(rec); }catch(e){}
    // Save to Supabase + notify Discord (if configured)
    if(DB_ENABLED && rec.va !== 'Test'){
      // A stable id (VA + shift date) with merge-duplicates, so correcting an EOD
      // UPDATES the day instead of inserting a second one. Every re-submit used to
      // mint id:Date.now() and add another row — doubling that VA's leads and hours
      // on Jack's dashboard, and posting a second Discord summary.
      db_upsertShift({ id: shiftKeyId(rec.va, rec.date), va: rec.va, date: rec.date, submitted_at: new Date().toISOString(), data: rec, keepa_count: keepaVals.count, keepa_total: keepaVals.total })
        .then(function(){
          eodSaved(rec, !!state._eodWasEdit);
        })
        .catch(function(err){
          console.error('EOD insert failed:', err);
          eodSaveFailed();
        });
      // storefront league: log each storefront session (name + time + leads) for Jack's ranking
      try{
        ((rec.storefronts&&rec.storefronts.list)||[]).forEach(function(s){
          if(!(s.name||'').trim()) return;
          if(!(parseInt(s.leads)||0) && !(s.mins||0)) return;
          db_insert('storefront_sessions',{ va:rec.va, name:String(s.name).trim().slice(0,120), date:rec.dateUK,
            seconds:Math.round((s.mins||0)*60), leads:parseInt(s.leads)||0, source:'tracker' }).catch(function(){});
        });
      }catch(e){}
    }
  } catch(e){ console.error('EOD save error:',e); eodSaveFailed(); }
}
/* The shift row is CONFIRMED in the database — only now is it safe to bin the draft,
   celebrate, and tell Jack. */
function eodSaved(rec, wasEdit){
  state._eodSubmitting=false;
  try{ deleteDraft(rec.va); }catch(e){}
  try{ lsDrop('bdl_draft_'+rec.va); }catch(e){}
  try{ fireConfetti(); setTimeout(fireConfetti,400); }catch(e){}
  // don't send Jack a second end-of-day summary just because she fixed a typo
  if(!wasEdit){ try{ discord_notify(rec); }catch(e){} }
  state._eodWasEdit=false;
  showToast(wasEdit?'EOD updated \u2713':'EOD submitted! Great shift \u2713');
}
/* It did NOT save. Say so plainly, keep her on shift, keep every copy. */
function eodSaveFailed(){
  state._eodSubmitting=false;
  state.submitted=false;
  try{ document.getElementById('eod-report').classList.remove('show'); }catch(e){}
  try{ document.getElementById('eod-form').style.display='block'; try{ eodRenderLeadCheck(); }catch(e){} }catch(e){}
  try{ if(state.shiftStart && !state.timerInterval) startTimer(); }catch(e){}
  showToast('Submit failed \u2014 you are still on shift, nothing lost. Check your connection and tap Submit again.', true);
  try{ saveWarnBanner(true); }catch(e){}
}
/* Upsert on a stable VA+date key so a corrected EOD replaces the day rather than
   adding a second one. Falls back to a plain insert if the column isn't there yet. */
/* A DETERMINISTIC id from VA + date, so re-submitting an EOD UPDATES the day
   instead of inserting a second row. The previous version keyed on a `shift_key`
   column that does not exist in this database, so it silently fell back to
   `id: Date.now()` every time — meaning the double-count fix was never actually
   live. This needs no schema change: it reuses the existing bigint primary key. */
function shiftKeyId(va, date){
  var str=String(va||'')+'|'+String(date||'');
  var h=5381;
  for(var i=0;i<str.length;i++){ h=((h*33) ^ str.charCodeAt(i)) >>> 0; }
  // keep it well clear of the Date.now() range already in the table (~1.7e12)
  return 900000000 + (h % 900000000);
}
async function db_upsertShift(rec){
  if(IS_PREVIEW) return null;
  if(!DB_ENABLED) return null;
  var res = await dbWrite('A submitted shift', SUPABASE_URL + '/rest/v1/shifts', {
    method:'POST',
    headers:{ 'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,
      'Authorization':'Bearer '+SUPABASE_ANON_KEY,
      'Prefer':'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(rec)
  });
  if(res && res.ok) return await res.json();
  var txt=''; try{ txt=await res.text(); }catch(_){}
  throw new Error('shift save failed: '+(res?res.status:'?')+' '+txt.slice(0,200));
}

function editEOD(){
  if(!state._eodEditUntil || Date.now()>state._eodEditUntil){ showToast('Edit window closed \u2014 message Jack to amend', true); return; }
  state.submitted=false;
  state._eodWasEdit=true;      // re-submit UPDATES the day; don't post a second summary
  document.getElementById('eod-report').classList.remove('show');
  document.getElementById('eod-form').style.display='block'; try{ eodRenderLeadCheck(); }catch(e){}
  renderTasks(); startTimer();
  showToast('Editing \u2014 make your changes and submit again \u2713');
}
function resetShift() {
  var _rsVA=state.currentVA;
  Object.assign(state,{currentVA:null,shiftStart:null,_trueStart:null,onBreak:false,breakStart:null,totalBreakMs:0,pendingSkipTask:null,tasks:[],extraTasks:[],breaks:[],submitted:false,liveInterval:null});
  clearInterval(state.timerInterval);
  clearInterval(state.liveInterval);
  document.getElementById('eod-notes').value='';
  var ki = document.getElementById('keepa-today'); if(ki) ki.value='';
  var kt = document.getElementById('keepa-total-val'); if(kt) kt.textContent='—';
  _keepaPrevTotal = null; _keepaIsFirst = false;
  document.getElementById('shift-screen').style.display='none';
  document.getElementById('report-btn').style.display='none';
  document.getElementById('eod-report').classList.remove('show');
  document.getElementById('eod-form').style.display='block'; try{ eodRenderLeadCheck(); }catch(e){}
  document.getElementById('shift-timer').textContent='00:00:00';
  var btn=document.getElementById('break-btn'); btn.innerHTML=breakLabel(); btn.style.background='rgba(255,184,48,0.15)'; btn.style.color='var(--amber)'; btn.style.borderColor='rgba(255,184,48,0.4)';
  try{ if(_rsVA) lsDrop('bdl_maxel_'+_rsVA+'_'+shiftDayKey()); }catch(e){}
  showLogin();
}

