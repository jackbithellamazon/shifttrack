/* ── HISTORY (spec §24) ─────────────────────────────────────────────────────
   Every batch stores who created/started/completed it and when. An audit trail
   nobody can see is worthless, so it's on screen. Reads `storefront_name` from
   the batch, never the queue row — which is why deleting a queue is safe. */
function sbTimeShort(iso){
  if(!iso) return '';
  try{ return new Date(iso).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit'}); }
  catch(e){ return ''; }
}
function sbHistoryHTML(){
  var t=sbToday();
  var past=(SB_BATCHES||[]).filter(function(b){ return b.date!==t; });
  if(!past.length) return '';
  var byDate={};
  past.forEach(function(b){ (byDate[b.date]=byDate[b.date]||[]).push(b); });
  var dates=Object.keys(byDate).sort(function(a,b){
    function k(x){ var q=String(x).split('/'); return q.length===3?(q[2]+q[1]+q[0]):''; }
    return k(b).localeCompare(k(a));
  }).slice(0, window._sbHistAll ? 60 : 1);
  var rows=dates.map(function(d){
    var items=byDate[d].slice().sort(function(a,b){ return String(a.storefront_name||'').localeCompare(String(b.storefront_name||'')); });
    return '<div class="sbh-day"><div class="sbh-date">'+escHtml(d)+'</div>'
      +items.map(function(b){
        var trail=[];
        if(b.created_by)   trail.push('imported by '+escHtml(b.created_by)+(sbTimeShort(b.created_at)?' '+sbTimeShort(b.created_at):''));
        if(b.started_by)   trail.push('started by '+escHtml(vaDisp(b.started_by))+(sbTimeShort(b.started_at)?' '+sbTimeShort(b.started_at):''));
        if(b.completed_by) trail.push('done by '+escHtml(vaDisp(b.completed_by))+(sbTimeShort(b.completed_at)?' '+sbTimeShort(b.completed_at):''));
        return '<div class="sbh-row">'
          +'<span class="sbh-q">'+escHtml(b.storefront_name||'—')+(b.batch_number>1?' <i>#'+b.batch_number+'</i>':'')+'</span>'
          +'<span class="sbh-n">'+(b.asin_count||0)+' ASINs</span>'
          +sbBadge(b.status)
          +'<span class="sbh-trail">'+(trail.length?trail.join('  ·  '):'—')+'</span>'
          +(b.keepa_url?'<a class="sbh-k" href="'+String(b.keepa_url).replace(/"/g,'&quot;')+'" target="_blank">Keepa &#8599;</a>':'')
          +'</div>';
      }).join('')
      +'</div>';
  }).join('');
  var moreDays=Object.keys(byDate).length-dates.length;
  return '<details class="sbh-fold"><summary class="mgr-section" style="cursor:pointer;">Earlier batches<span style="margin-left:auto;font-size:10.5px;font-weight:600;color:var(--muted-2);">who imported it, who ran it, when · click to open</span></summary>'
    +'<div class="sbh-wrap">'+rows
    +(moreDays>0?'<button class="btn btn-ghost" style="margin-top:10px;" onclick="window._sbHistAll=1;sbPaintJack()">Show '+moreDays+' earlier day'+(moreDays===1?'':'s')+'</button>':'')
    +'</div></details>';
}
/* ── WHAT'S ACTUALLY PRODUCING ─────────────────────────────────────────────
   The module captured everything and analysed nothing. A batch becomes a task
   on the VA's shift list with id `sbatch-<batchId>`; the VA logs time and leads
   against it; that task is saved verbatim inside the EOD record. So the join
   is: every batch  ->  the shift task that carries its id. Nothing else in the
   app was reading that back, so "which storefront is worth running" was
   unanswerable even though the data was all there.

   Deliberately shows ASINs-per-lead as well as leads/hour: a tag that needs 200
   ASINs to yield one lead is expensive even when the hourly rate looks fine. */
/* Minutes off a task — and it MUST read `time` last, because `time` is the only one
   that survives a save. Checked against the live DB: across 686 tasks in 40 shifts,
   timeHrs / timeMins / timerSec appear ZERO times — the shift record keeps only the
   formatted string ("1h", "30m", "1h 30m"). Reading the numeric fields alone would have
   left Hours and Leads/hr permanently blank in the panel, on every historical shift and
   every future one. The numeric fields are still tried first because they're live in the
   VA's browser before submit. */
function sbTaskMins(t){
  if(!t) return 0;
  var mins=(parseInt(t.timeHrs)||0)*60+(parseInt(t.timeMins)||0);
  if(mins) return mins;
  if(t.timerSec) return Math.round(t.timerSec/60);
  var str=String(t.time||'').trim(); if(!str) return 0;
  var h=str.match(/(\d+(?:\.\d+)?)\s*h/i), m=str.match(/(\d+)\s*m/i);
  mins=(h?parseFloat(h[1])*60:0)+(m?parseInt(m[1]):0);
  if(!mins && /^\d+$/.test(str)) mins=parseInt(str);   // bare number = minutes
  return Math.round(mins);
}
function sbTaskIndex(log){
  var idx={};
  try{
    (log||mgr_getLog()||[]).forEach(function(rec){
      (rec.tasks||[]).forEach(function(t){
        if(!t || String(t.id||'').indexOf('sbatch-')!==0) return;
        var bid=String(t.id).slice(7);
        idx[bid]={ leads:parseInt(t.leads)||0, mins:sbTaskMins(t), va:rec.va, date:rec.date, done:!!t.done };
      });
    });
  }catch(e){}
  return idx;
}
/* The shift screen ALSO has a manual "Add storefront" logger (name + timer + leads,
   saved as rec.storefronts[]). Nobody has ever used it — 0 of 118 shifts — but it is
   still on the page, so anything typed there must count too, otherwise the panel would
   quietly ignore real work. Keyed by NAME, matched case-insensitively to the tag. */
function sbManualIndex(log, cutMs){
  var by={};
  try{
    (log||mgr_getLog()||[]).forEach(function(rec){
      var iso=sbToISO(rec.date); 
      if(iso && cutMs && new Date(iso+'T12:00:00').getTime()<cutMs) return;
      (rec.storefronts||[]).forEach(function(sf){
        var name=String(sf&&sf.name||'').trim(); if(!name) return;
        var k=name.toLowerCase();
        var r=by[k]||(by[k]={name:name,leads:0,mins:0,runs:0});
        r.runs++;
        r.leads+=parseInt(sf.leads)||0;
        r.mins+=(parseInt(sf.seconds)||0)?Math.round(parseInt(sf.seconds)/60):sbTaskMins(sf);
      });
    });
  }catch(e){}
  return by;
}
function sbPerf(days, log){
  days=days||30;
  var cut=Date.now()-days*86400000;
  var idx=sbTaskIndex(log), by={};
  (SB_BATCHES||[]).forEach(function(b){
    var iso=sbToISO(b.date); if(!iso) return;
    if(new Date(iso+'T12:00:00').getTime()<cut) return;
    var k=String(b.storefront_name||'—');
    var r=by[k]||(by[k]={name:k,batches:0,asins:0,leads:0,mins:0,worked:0,done:0});
    r.batches++; r.asins+=(b.asin_count||0);
    if(b.status==='Completed') r.done++;
    /* who actually works this storefront, and when it was last touched — Jack:
       "more stuff on the storefront thing as these are all storefront" */
    var who=b.completed_by||b.started_by||b.assigned_to||'';
    if(who){ r.by=r.by||{}; r.by[who]=r.by[who]||{leads:0,mins:0,batches:0}; r.by[who].batches++; }
    if(b.status==='Completed'&&iso){ if(!r.lastISO||iso>r.lastISO) r.lastISO=iso; }
    var t=idx[b.id];
    if(t){
      r.leads+=t.leads; r.mins+=t.mins; r.worked++;
      if(who){ r.by[who].leads+=t.leads; r.by[who].mins+=t.mins; }
    }
    // the raw batch line, so "why is this tag doing badly" is answerable on screen
    (r.list=r.list||[]).push({id:b.id,iso:iso,date:b.date,asins:b.asin_count||0,status:b.status,
      who:who,leads:t?t.leads:null,mins:t?t.mins:null});
  });
  // fold in anything logged by hand on the shift screen, under the same tag name
  var man=sbManualIndex(log, cut);
  Object.keys(man).forEach(function(k){
    var m=man[k];
    var hit=Object.keys(by).filter(function(n){ return n.toLowerCase()===k; })[0];
    var r = hit ? by[hit] : (by[m.name]={name:m.name,batches:0,asins:0,leads:0,mins:0,worked:0,done:0});
    r.leads+=m.leads; r.mins+=m.mins; r.worked+=m.runs; r.manual=(r.manual||0)+m.runs;
  });
  return Object.keys(by).map(function(k){
    var r=by[k];
    r.hrs=r.mins/60;
    r.lph=r.hrs>0?(r.leads/r.hrs):null;
    r.apl=r.leads>0?(r.asins/r.leads):null;
    /* Jack: "how long it took to find a lead on average ... more in-depth".
       minsPerLead is the one that makes a tag feel expensive or cheap in HIS time.
       hitRate is the same story from the ASIN side: how many of what we send converts. */
    r.minsPerLead = (r.leads>0 && r.mins>0) ? (r.mins/r.leads) : null;
    r.hitRate     = (r.asins>0 && r.leads>0) ? (r.leads/r.asins*100) : null;
    r.minsPerBatch= (r.worked>0 && r.mins>0) ? (r.mins/r.worked) : null;
    r.leadsPerBatch=(r.worked>0) ? (r.leads/r.worked) : null;   // "how long does 1 take with how many leads"
    r.asinsPerHour = (r.hrs>0) ? (r.asins/r.hrs) : null;        // how fast they chew through a list
    var wl=(r.list||[]).filter(function(x){ return x.leads!=null; }).map(function(x){ return x.leads; });
    r.bestBatch  = wl.length?Math.max.apply(null,wl):null;
    r.worstBatch = wl.length?Math.min.apply(null,wl):null;
    r.asinsPerBatch=r.batches>0?(r.asins/r.batches):null;
    // who gets the most out of it — only meaningful once someone has logged time AND leads
    var best=null;
    Object.keys(r.by||{}).forEach(function(v){
      var x=r.by[v]; if(!(x.mins>0&&x.leads>0)) return;
      var lph=x.leads/(x.mins/60);
      if(!best||lph>best.lph) best={va:v,lph:lph,leads:x.leads};
    });
    r.bestVa=best;
    r.daysSince = r.lastISO ? Math.max(0,Math.round((Date.now()-new Date(r.lastISO+'T12:00:00').getTime())/86400000)) : null;
    return r;
  }).sort(function(a,b){
    if((b.leads||0)!==(a.leads||0)) return (b.leads||0)-(a.leads||0);
    return (b.asins||0)-(a.asins||0);
  });
}
function sbMins(m){
  if(m==null||!isFinite(m)) return '—';
  if(m<1) return '<1m';
  if(m<90) return Math.round(m)+'m';
  return (m/60).toFixed(1)+'h';
}
var SB_PERF_DAYS=30;
function sbPerfSet(d){ SB_PERF_DAYS=d; try{ sbPaintJack(); }catch(e){} }
/* Jack: "how many leads per filter ect ect". filter_usage logs one row per VA
   opening a filter, with the leads they got from it, so leads-per-open is the
   filter equivalent of the tags' leads-per-hour. A filter opened 7 times for 2
   leads is costing two VAs' attention for very little. */
function sbFilterLeague(days){
  var rows=(window._fuCloud||fuLocal()||[]);
  var cut=Date.now()-(days||30)*86400000;
  var by={};
  rows.forEach(function(u){
    var t=u.opened_at?new Date(u.opened_at).getTime():null;
    if(t && t<cut) return;
    var k=u.filter_id||u.title||'?';
    var r=by[k]||(by[k]={title:u.title||'(untitled filter)',tag:u.tag||'',opens:0,leads:0,vas:{}});
    r.opens++; r.leads+=parseInt(u.leads)||0;
    if(u.va) r.vas[u.va]=(r.vas[u.va]||0)+1;
  });
  return Object.keys(by).map(function(k){
    var r=by[k];
    r.per=r.opens>0?(r.leads/r.opens):0;
    r.who=Object.keys(r.vas).map(function(v){ return vaDisp(v); }).join(' + ');
    return r;
  }).sort(function(a,b){
    if(b.leads!==a.leads) return b.leads-a.leads;
    return b.opens-a.opens;                       // then the biggest time sink
  });
}
function sbFilterLeagueHTML(){
  var rows=sbFilterLeague(SB_PERF_DAYS);
  if(!rows.length) return '';
  var opens=rows.reduce(function(a,r){return a+r.opens;},0);
  var leads=rows.reduce(function(a,r){return a+r.leads;},0);
  var dead=rows.filter(function(r){ return r.opens>=3 && r.leads===0; });
  var best=rows[0];
  return '<div class="mgr-section">Filters &mdash; what&rsquo;s producing'
      +'<span style="margin-left:auto;font-size:10.5px;font-weight:600;color:var(--muted-2);">'
      +rows.length+' opened · '+opens+' opens · '+leads+' lead'+(leads===1?'':'s')
      +' · last '+SB_PERF_DAYS+'d</span></div>'
    +(dead.length?'<div class="sfl-warn"><b>'+dead.length+' filter'+(dead.length===1?'':'s')
      +' opened 3+ times for nothing.</b> '+escHtml(dead.slice(0,3).map(function(r){return r.title;}).join(' · '))
      +(dead.length>3?' and '+(dead.length-3)+' more':'')+' — worth retiring or retuning.</div>':'')
    +'<div class="sfl-tbl">'
      +'<div class="sfl-hd"><span>Filter</span><span>Opens</span><span>Leads</span><span>Per open</span><span>Who ran it</span></div>'
      + rows.slice(0,25).map(function(r){
          var tone=r.leads===0?' none':(r.per>=0.5?' good':'');
          return '<div class="sfl-r'+tone+'">'
            +'<span class="sfl-n">'+escHtml(String(r.title).slice(0,58))
              +(r.tag?'<i>'+escHtml(r.tag)+'</i>':'')+'</span>'
            +'<span class="sfl-v">'+r.opens+'</span>'
            +'<span class="sfl-v'+(r.leads?' lead':'')+'">'+r.leads+'</span>'
            +'<span class="sfl-v">'+(r.opens?r.per.toFixed(2):'—')+'</span>'
            +'<span class="sfl-who">'+escHtml(r.who||'—')+'</span>'
          +'</div>';
        }).join('')
      +'</div>'
    +(rows.length>25?'<div class="sfl-more">Showing the top 25 of '+rows.length+'.</div>':'');
}
/* Jack: "so i know if it's doing well or not". A number alone doesn't answer that —
   2.4 leads/hr means nothing until you know the board runs at 1.7. So each storefront
   is graded against JACK'S TARGET (sbTargetLph), not the board — grading against
   the board's own median flattered everything: when the whole board runs at 1.5/hr,
   1.4/hr reads "about average" while actually missing target by 25%. */
/* The bar is Jack's own target, not the board average. 15 leads across an 8h shift
   = 1.9 leads/hour. Set in Settings; falls back to the daily lead goal ÷ hours. */
function sbTargetLph(){
  try{
    var st=getAppSettings();
    var explicit=parseFloat(st.sfLeadsPerHr);
    if(explicit>0) return explicit;
    var leads=parseInt(st.sfLeadsPerDay)||15;
    var hrs=parseFloat(st.dailyHoursTarget)||8;
    if(leads>0&&hrs>0) return leads/hrs;
  }catch(e){}
  return 15/8;
}
function sbGrade(r,tgt){
  tgt=tgt||sbTargetLph();
  var t1=tgt.toFixed(1);
  if(!(r.worked>0)) return {k:'unproven',label:'not worked yet',tone:'off',
    why:'No batch has been worked in this window, so there is nothing to judge.'};
  if(!r.leads) return {k:'dead',label:'returning nothing',tone:'bad',
    why:r.asins.toLocaleString()+' ASINs and '+(r.hrs>0?r.hrs.toFixed(1)+'h':'time')+' spent for zero leads. Target is '+t1+'/hr.'};
  if(!r.lph) return {k:'ok',label:'producing',tone:'ok',why:'Producing leads.'};
  var rel=r.lph/tgt;
  if(rel>=1) return {k:'over',label:'beating target',tone:'good',
    why:r.lph.toFixed(1)+' leads/hr against a '+t1+'/hr target — '+Math.round((rel-1)*100)+'% above.'};
  if(rel>=0.8) return {k:'near',label:'about on target',tone:'warn',
    why:r.lph.toFixed(1)+' leads/hr against a '+t1+'/hr target — just under.'};
  return {k:'under',label:'under target',tone:'bad',
    why:r.lph.toFixed(1)+' leads/hr against a '+t1+'/hr target — '+Math.round((1-rel)*100)+'% short. '
      +(r.minsPerLead!=null?sbMins(r.minsPerLead)+' of a VA\u2019s day per lead.':'')};
}
/* leads per week across the window — the shape matters more than any single number */
function sbSpark(r,days){
  var list=(r.list||[]).filter(function(x){ return x.iso && x.leads!=null; });
  if(!list.length) return '';
  var weeks=Math.max(2,Math.min(12,Math.ceil(days/7)));
  var now=Date.now(), buckets=new Array(weeks).fill(0), any=false;
  list.forEach(function(x){
    var ageD=(now-new Date(x.iso+'T12:00:00').getTime())/86400000;
    var i=weeks-1-Math.floor(ageD/7);
    if(i>=0&&i<weeks){ buckets[i]+=x.leads; if(x.leads) any=true; }
  });
  if(!any) return '';
  var max=Math.max.apply(null,buckets)||1;
  return '<span class="spk" title="Leads per week, oldest to newest">'
    + buckets.map(function(v){
        return '<i style="height:'+Math.max(8,Math.round(v/max*100))+'%" title="'+v+' lead'+(v===1?'':'s')+'"></i>';
      }).join('') + '</span>';
}
var SB_OPEN_TAG=null;
function sbTagToggle(name){
  SB_OPEN_TAG = (SB_OPEN_TAG===name) ? null : name;
  try{ sbPaintJack(); }catch(e){}
}
/* Every batch on this storefront, so a bad number has a visible cause. */
function sbTagDetailHTML(r){
  var list=(r.list||[]).slice().sort(function(a,b){ return (b.iso||'')<(a.iso||'')?-1:1; });
  if(!list.length) return '';
  var vas=Object.keys(r.by||{});
  return '<div class="spd">'
    +(vas.length?'<div class="spd-vas">'
      + vas.map(function(v){
          var x=r.by[v], lph=(x.mins>0&&x.leads>0)?(x.leads/(x.mins/60)):null;
          return '<span class="spd-va"><b>'+escHtml(vaDisp(v))+'</b>'
            +x.batches+' batch'+(x.batches===1?'':'es')
            +(x.leads?' · '+x.leads+' leads':' · no leads')
            +(lph?' · '+lph.toFixed(1)+'/hr':'')+'</span>';
        }).join('')
      +'</div>':'')
    +'<div class="spd-tbl"><div class="spd-hd"><span>Date</span><span>ASINs</span><span>Worked by</span><span>Leads</span><span>Time</span><span>Per lead</span></div>'
    + list.map(function(x){
        var per=(x.leads&&x.mins)?sbMins(x.mins/x.leads):'—';
        var cls=x.leads===0?' zero':(x.leads?'':' pend');
        return '<div class="spd-r'+cls+'">'
          +'<span>'+escHtml(x.date||'—')+'</span>'
          +'<span class="spd-n">'+x.asins+'</span>'
          +'<span>'+escHtml(x.who?vaDisp(x.who):'—')+'</span>'
          +'<span class="spd-n">'+(x.leads==null?'<i>not worked</i>':x.leads)+'</span>'
          +'<span class="spd-n">'+(x.mins?sbMins(x.mins):'—')+'</span>'
          +'<span class="spd-n">'+per+'</span>'
        +'</div>';
      }).join('')
    +'</div></div>';
}
/* Jack: "does those leads produce in a buy". Leads are only worth what you buy off
   them, so this reads lead_decisions — every decision he has made, with is_buy, qty
   and the profit per unit — and reports conversion by SOURCE METHOD (JKPF, Storefront,
   THC…), which is the closest link the data has back to where a lead came from.
   Honest about its own gaps: profit only counts buys where he entered a quantity. */
function sbBuyStats(days){
  var rows=(window._decisionCache||[]);
  var cut=Date.now()-(days||30)*86400000;
  var by={}, tot={n:0,buy:0,units:0,profit:0,noQty:0};
  rows.forEach(function(r){
    var t=r.updated_at?new Date(r.updated_at).getTime():null;
    if(t && t<cut) return;
    if(!r.decision) return;
    var k=String(r.src||'').trim()||'not recorded';
    var a=by[k]||(by[k]={src:k,n:0,buy:0,units:0,profit:0,noQty:0});
    a.n++; tot.n++;
    if(r.is_buy){
      a.buy++; tot.buy++;
      var q=parseInt(r.qty)||0;
      if(q>0){ a.units+=q; tot.units+=q; var pf=(parseFloat(r.profit)||0)*q; a.profit+=pf; tot.profit+=pf; }
      else { a.noQty++; tot.noQty++; }
    }
  });
  var list=Object.keys(by).map(function(k){
    var a=by[k]; a.rate=a.n?(a.buy/a.n*100):0; return a;
  }).sort(function(x,y){ return y.n-x.n; });
  tot.rate=tot.n?(tot.buy/tot.n*100):0;
  return {list:list, tot:tot};
}
/* ── END OF DAY: IS THEIR TIME WORTH IT? ────────────────────────────────────
   Jack: "at the end of the day i need to know on average how many leads per filter
   sent to them and how many minutes/hours it takes to find a lead — to see if their
   time is better spent elsewhere — but also am i buying their leads".
   Two halves that live in different places:
     • TIME and LEADS come from the app (worked batches).
     • BUYS and PROFIT come from HIS decisions, tagged by the sheet's Sourcing Method.
   They join on the source label, so this is only as good as that column — which is
   why the mismatch warning below matters. Everything here is stated per HOUR of VA
   time, because that is the thing he is actually spending. */
var SB_CHANNELS=[
  {k:'storefront', label:'Storefront work',
   src:['storefront','kpf storefront','a2a storefront','storefront anaylsis sheet','storefront analysis sheet']},
  {k:'filters',    label:'Keepa filters (KPF/JKPF)',
   src:['jkpf','kpf brand','kpf category','keepa tracker']},
  {k:'other',      label:'Everything else',
   src:['pp pings','arbi','eu sheet','manual','newsletter','promotion','replens sheet','asins','profit path wa','thc','discord']}
];
function sbChannelOf(src){
  var v=String(src||'').trim().toLowerCase();
  if(!v) return null;
  for(var i=0;i<SB_CHANNELS.length;i++) if(SB_CHANNELS[i].src.indexOf(v)>=0) return SB_CHANNELS[i].k;
  return 'other';
}
function sbWorth(days){
  var dec=(window._decisionCache||[]), cut=Date.now()-(days||30)*86400000;
  var by={}; SB_CHANNELS.forEach(function(c){ by[c.k]={k:c.k,label:c.label,leads:0,buys:0,units:0,profit:0,noQty:0,hrs:0}; });
  var untagged=0;
  dec.forEach(function(r){
    var t=r.updated_at?new Date(r.updated_at).getTime():null;
    if(t&&t<cut) return;
    if(!r.decision) return;
    var ch=sbChannelOf(r.src);
    if(!ch){ untagged++; return; }
    var a=by[ch]; a.leads++;
    if(r.is_buy){ a.buys++; var q=parseInt(r.qty)||0;
      if(q>0){ a.units+=q; a.profit+=(parseFloat(r.profit)||0)*q; } else a.noQty++; }
  });
  // hours: only the storefront channel is measured by the app
  try{ sbPerf(days).forEach(function(r){ by.storefront.hrs+=(r.hrs||0); }); }catch(e){}
  var list=SB_CHANNELS.map(function(c){
    var a=by[c.k];
    a.rate=a.leads?(a.buys/a.leads*100):0;
    a.perHr=a.hrs>0?(a.profit/a.hrs):null;
    a.minsPerLead=(a.hrs>0&&a.leads>0)?(a.hrs*60/a.leads):null;
    return a;
  });
  return {list:list, untagged:untagged};
}
/* The join above is only as good as the sheet's Sourcing Method column — and the two
   sheets don't offer the same options. Checked 11/08/2026: Mera can pick JKPF /
   Storefront / THC and Suz cannot; Suz can pick "discord" and Mera cannot. Mera has
   used JKPF 82 times — work Suz literally cannot label the same way, so the two are
   not comparable. This reads the LIVE validation off both sheets and says so. */
var SB_SRC_LISTS=null;
async function sbLoadSrcLists(){
  if(SB_SRC_LISTS) return SB_SRC_LISTS;
  var key=(typeof SPEND_API_KEY!=='undefined')?SPEND_API_KEY:'';
  if(!key||typeof SHEET_NAMES==='undefined') return null;
  var out={};
  for(var sid in SHEET_NAMES){
    try{
      var tabs=await fetchT(SUPABASE_URL+'/rest/v1/sheet_tabs?select=tab,included&sheet_id=eq.'+encodeURIComponent(sid),
        {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
      var t=(tabs.ok?(await tabs.json()):[]).filter(function(x){return x.included;})[0];
      if(!t) continue;
      var u='https://sheets.googleapis.com/v4/spreadsheets/'+sid+'?key='+key+'&includeGridData=true&ranges='
        +encodeURIComponent(t.tab+'!L3:L3')+'&fields=sheets(data(rowData(values(dataValidation))))';
      var r=await fetchT(u); if(!r.ok) continue;
      var j=await r.json();
      var dv=j.sheets[0].data[0].rowData[0].values[0].dataValidation;
      out[SHEET_NAMES[sid]]=(dv&&dv.condition&&dv.condition.values||[]).map(function(v){ return v.userEnteredValue; });
    }catch(e){}
  }
  SB_SRC_LISTS=out; return out;
}
function sbSrcFixHTML(){
  var L=SB_SRC_LISTS; if(!L) return '';
  var names=Object.keys(L); if(names.length<2) return '';
  var a=L[names[0]]||[], b=L[names[1]]||[];
  var onlyA=a.filter(function(x){ return b.indexOf(x)<0; });
  var onlyB=b.filter(function(x){ return a.indexOf(x)<0; });
  if(!onlyA.length && !onlyB.length) return '';
  var merged=a.concat(b).filter(function(x,i,arr){ return arr.indexOf(x)===i; }).sort();
  return '<div class="swx-fix">'
    +'<b>⚠ The two sheets offer different Sourcing Methods, so their work can’t be compared.</b>'
    +'<div class="swx-f2">'+escHtml(names[0])+' only: <i>'+escHtml(onlyA.join(', ')||'—')+'</i>'
      +' &nbsp;·&nbsp; '+escHtml(names[1])+' only: <i>'+escHtml(onlyB.join(', ')||'—')+'</i></div>'
    +'<div class="swx-f2">Paste this same list into <b>Data → Data validation</b> on column L of BOTH sheets:</div>'
    +'<textarea class="swx-list" readonly onclick="this.select()">'+escHtml(merged.join(','))+'</textarea>'
    +'</div>';
}
function sbWorthHTML(){
  var w=sbWorth(SB_PERF_DAYS);
  var any=w.list.some(function(a){ return a.leads>0; });
  if(!any && !w.untagged) return '';
  var sf=w.list[0];
  return '<div class="mgr-section">Is their time worth it?'
      +'<span style="margin-left:auto;font-size:10.5px;font-weight:600;color:var(--muted-2);">'
      +'last '+SB_PERF_DAYS+'d · time from the app, buys from your decisions</span></div>'
    +(sf.hrs>0?'<div class="swx-head">'
      +'<div class="swx-h"><b>'+sf.hrs.toFixed(1)+'h</b><em>storefront time</em></div>'
      +'<div class="swx-h"><b>'+sf.leads+'</b><em>leads</em></div>'
      +'<div class="swx-h"><b>'+(sf.minsPerLead!=null?sbMins(sf.minsPerLead):'—')+'</b><em>per lead</em></div>'
      +'<div class="swx-h'+(sf.buys?' good':'')+'"><b>'+sf.buys+'</b><em>you bought</em></div>'
      +'<div class="swx-h'+(sf.profit>0?' good':'')+'"><b>'+(sf.profit>0?'£'+Math.round(sf.profit):'—')+'</b><em>profit</em></div>'
      +'<div class="swx-h'+(sf.perHr>0?' good':'')+'"><b>'+(sf.perHr!=null?'£'+sf.perHr.toFixed(0):'—')+'</b><em>per hour of their time</em></div>'
    +'</div>':'')
    +'<div class="sbb-tbl"><div class="sbb-hd"><span>Channel</span><span>Leads</span><span>Bought</span><span>Buy rate</span><span>Profit</span><span>Time</span></div>'
    + w.list.filter(function(a){ return a.leads||a.hrs; }).map(function(a){
        var tone=a.leads&&!a.buys?' none':(a.rate>=40?' good':'');
        return '<div class="sbb-r'+tone+'">'
          +'<span class="sbb-n">'+escHtml(a.label)+'</span>'
          +'<span class="sbb-v">'+a.leads+'</span>'
          +'<span class="sbb-v'+(a.buys?' lead':'')+'">'+a.buys+'</span>'
          +'<span class="sbb-v">'+(a.leads?a.rate.toFixed(0)+'%':'—')+'</span>'
          +'<span class="sbb-v">'+(a.profit>0?'£'+Math.round(a.profit):'—')+'</span>'
          +'<span class="sbb-v">'+(a.hrs>0?a.hrs.toFixed(1)+'h':'<i>not timed</i>')+'</span>'
        +'</div>';
      }).join('')
    +'</div>'
    +sbSrcFixHTML()
    +(w.untagged?'<div class="swx-warn"><b>'+w.untagged+' decided lead'+(w.untagged===1?'':'s')+' had no Sourcing Method</b>'
      +' — those can’t be credited to anything, so the numbers above understate whichever channel really produced them.'
      +' The column is a dropdown on both sheets; it just wasn’t picked.</div>':'')
    +'<div class="swx-note">Only storefront work is timed by the app — filters are opened from the VA panel, '
      +'which records opens and leads but not minutes. Filter time would need a timer on the filter panel.</div>';
}
function sbBuyHTML(){
  var b=sbBuyStats(SB_PERF_DAYS);
  if(!b.tot.n) return '';
  var t=b.tot;
  return '<div class="mgr-section">Do the leads turn into buys?'
      +'<span style="margin-left:auto;font-size:10.5px;font-weight:600;color:var(--muted-2);">'
      +'decisions you’ve made in the last '+SB_PERF_DAYS+'d</span></div>'
    +'<div class="sbb-top">'
      +'<div class="sbb-t"><b>'+t.n+'</b><em>leads decided</em></div>'
      +'<div class="sbb-t'+(t.buy?' good':'')+'"><b>'+t.buy+'</b><em>bought</em></div>'
      +'<div class="sbb-t'+(t.rate>=25?' good':'')+'"><b>'+t.rate.toFixed(0)+'%</b><em>buy rate</em></div>'
      +'<div class="sbb-t"><b>'+(t.units||'—')+'</b><em>units</em></div>'
      +'<div class="sbb-t'+(t.profit>0?' good':'')+'"><b>'+(t.profit>0?'£'+Math.round(t.profit).toLocaleString():'—')+'</b><em>profit on those units</em></div>'
    +'</div>'
    +(t.noQty?'<div class="sbb-note">'+t.noQty+' buy'+(t.noQty===1?'':'s')+' had no quantity entered, so the profit above is understated. '
      +'The quantity box is on the lead once you mark it bought.</div>':'')
    +'<div class="sbb-tbl"><div class="sbb-hd"><span>Where it came from</span><span>Leads</span><span>Bought</span><span>Buy rate</span><span>Units</span><span>Profit</span></div>'
    + b.list.map(function(a){
        var tone=a.buy===0?' none':(a.rate>=40?' good':'');
        return '<div class="sbb-r'+tone+'">'
          +'<span class="sbb-n">'+escHtml(a.src)+'</span>'
          +'<span class="sbb-v">'+a.n+'</span>'
          +'<span class="sbb-v'+(a.buy?' lead':'')+'">'+a.buy+'</span>'
          +'<span class="sbb-v">'+a.rate.toFixed(0)+'%</span>'
          +'<span class="sbb-v">'+(a.units||'—')+'</span>'
          +'<span class="sbb-v">'+(a.profit>0?'£'+Math.round(a.profit).toLocaleString():'—')+'</span>'
        +'</div>';
      }).join('')
    +'</div>';
}
function sbPerfHTML(){
  var rows=sbPerf(SB_PERF_DAYS);
  var _allLeads=rows.reduce(function(a,r){ return a+(r.leads||0); },0);
  rows.forEach(function(r){ r.share=_allLeads?(r.leads/_allLeads*100):0; });
  var med=sbTargetLph();          // the bar is Jack's target, not the board — see sbGrade()
  /* Is a storefront getting better or worse? Same metric over the PREVIOUS window
     of equal length, so "3.0 leads/hr" reads as rising or fading rather than as a
     number with no history behind it. */
  var prev={};
  try{
    var older=sbPerf(SB_PERF_DAYS*2);
    older.forEach(function(o){
      var now=rows.filter(function(r){ return r.name===o.name; })[0];
      var pl=(o.leads||0)-((now&&now.leads)||0);
      var pm=(o.mins||0)-((now&&now.mins)||0);
      prev[o.name]={leads:pl, lph:(pm>0&&pl>0)?(pl/(pm/60)):null};
    });
  }catch(e){}
  var head='<div class="mgr-section">What’s producing'
    +'<span class="spx-tgt" title="Set in Settings — Storefront target">target <b>'+sbTargetLph().toFixed(1)+'</b> leads/hr</span>'
    +'<span style="margin-left:auto;display:flex;gap:6px;">'
    +[7,30,90].map(function(d){
        return '<button class="sbp-t'+(SB_PERF_DAYS===d?' on':'')+'" onclick="sbPerfSet('+d+')">'+d+'d</button>';
      }).join('')
    +'</span></div>';
  if(!rows.length){
    return head+'<div class="sb-empty">Nothing to measure yet.'
      +'<span>Once Sarah imports and a VA works a batch, each tag’s leads, hours and ASINs-per-lead appear here.</span></div>';
  }

  /* Rebuilt from a bare table. A tag has a LIFE — ASINs go out, a VA works them, leads
     come back — and a flat grid of numbers showed none of that. Each tag is now a card
     with the pipeline drawn on it, and the two numbers that decide whether to keep
     running it (leads/hour, ASINs-per-lead) sized like they matter. Cards with results
     rank first; the rest are still visible but visibly quieter. */
  var worked =rows.filter(function(r){ return r.worked>0 && r.leads>0; });
  var pending=rows.filter(function(r){ return !(r.worked>0 && r.leads>0); });
  var bestLph=worked.length?Math.max.apply(null,worked.map(function(r){return r.lph||0;})):0;
  var bestApl=worked.length?Math.min.apply(null,worked.filter(function(r){return r.apl;}).map(function(r){return r.apl;})):0;
  var totA=rows.reduce(function(a,r){return a+r.asins;},0);
  var totL=rows.reduce(function(a,r){return a+r.leads;},0);
  var totH=rows.reduce(function(a,r){return a+r.hrs;},0);
  var totB=rows.reduce(function(a,r){return a+r.batches;},0);

  function dest(name){
    var q=(SB_QUEUES||[]).filter(function(x){ return String(x.name||'').toLowerCase()===String(name).toLowerCase(); })[0];
    if(!q) return '';
    var to=q.manual_review?'you':(q.default_assignee||'you');
    var cls=q.manual_review?'jack':String(to).toLowerCase();
    return '<span class="spx-to '+cls+'">'+escHtml(q.manual_review?'routes via you':vaDisp(to))+'</span>';
  }
  function card(r){
    var doneP=r.batches?Math.round(r.done/r.batches*100):0;
    var openN=r.batches-r.done;
    var hasR=(r.worked>0 && r.leads>0);
    /* Leads came back, but no shift hours are attached to this tag, so there IS no
       rate to show. hasR stays true — the card must still say it produced a lead —
       and only the leads/hour figure goes dark. Reading hasR as "has a rate" is what
       threw on r.lph.toFixed and took the whole tab down. */
    var hasRate=hasR && typeof r.lph==='number' && isFinite(r.lph);
    var lphW=Math.min(100,Math.round((r.lph||0)/(med||1)*100));   // 100% = hitting target
    var topLph=hasR && bestLph && r.lph>=bestLph-0.001;
    var topApl=hasR && bestApl && r.apl && r.apl<=bestApl+0.001;
    var gr=sbGrade(r,med);
    var open=(SB_OPEN_TAG===r.name);
    return '<div class="spx g-'+gr.tone+(hasR?'':' quiet')+(topLph?' best':'')+(open?' open':'')+'">'
      +'<div class="spx-h">'
        +'<span class="spx-name">'+escHtml(r.name)+'</span>'
        +dest(r.name)
        +(topLph?'<span class="spx-flag">best rate</span>':'')
        +(topApl&&!topLph?'<span class="spx-flag cheap">fewest ASINs per lead</span>':'')
        +'<span class="spx-grade '+gr.tone+'" title="'+escHtml(gr.why)+'">'+escHtml(gr.label)+'</span>'
      +'</div>'
      +'<div class="spx-why"><span>'+escHtml(gr.why)+'</span>'
        +(hasR&&r.share>0?'<span class="spx-share" title="Share of every lead that came back in this window">'
            +'<i style="width:'+Math.min(100,Math.round(r.share))+'%"></i><b>'+r.share.toFixed(0)+'%</b>'
            +'<em>of all leads</em></span>':'')
      +'</div>'
      +(function(){ var sp=sbSpark(r,SB_PERF_DAYS); return sp?'<div class="spx-spark"><em>leads by week</em>'+sp+'</div>':''; })()
      // the pipeline, drawn: what went out, how much has been worked
      +'<div class="spx-pipe">'
        +'<span class="spx-p"><b>'+r.batches+'</b> batch'+(r.batches===1?'':'es')+'</span>'
        +'<span class="spx-arrow">→</span>'
        +'<span class="spx-p"><b>'+r.asins.toLocaleString()+'</b> ASINs sent</span>'
        +'<span class="spx-arrow">→</span>'
        +'<span class="spx-p'+(hasR?' good':'')+'"><b>'+(hasR?r.leads:'—')+'</b> leads back</span>'
      +'</div>'
      +'<div class="spx-bar" title="'+r.done+' of '+r.batches+' batches worked">'
        +'<i style="width:'+doneP+'%"></i></div>'
      +'<div class="spx-sub">'+(openN
          ? '<span class="spx-open">'+openN+' still waiting to be worked</span>'
          : '<span class="spx-all">all worked</span>')
        +(r.hrs>0?'<span>'+r.hrs.toFixed(1)+'h spent</span>':'')
        +(r.manual?'<span class="spx-hand">'+r.manual+' hand-logged</span>':'')+'</div>'
      +'<div class="spx-kpi">'
        +'<div class="spx-k'+(hasRate?'':' off')+'"><b>'+(hasRate?r.lph.toFixed(1):'—')+'</b><em>leads / hour</em>'
          +(hasRate?'<span class="spx-mini"><i style="width:'+lphW+'%"></i></span>':'')+'</div>'
        +'<div class="spx-k'+(hasR&&r.apl?'':' off')+'"><b>'+(hasR&&r.apl?Math.round(r.apl):'—')+'</b><em>ASINs per lead</em>'
          +'<span class="spx-note">'+(hasR&&r.apl?(r.apl<=15?'cheap to run':r.apl<=40?'reasonable':'expensive'):'needs a worked batch')+'</span></div>'
      +'</div>'
      /* the deeper row — only drawn once a tag has actually produced something,
         so an unworked tag doesn't fill up with dashes */
      +(hasR?(function(){
          var p=prev[r.name]||{}, tr='';
          if(p.lph!=null && r.lph!=null && p.lph>0){
            var ch=Math.round((r.lph-p.lph)/p.lph*100);
            if(Math.abs(ch)>=10) tr='<span class="spx-tr '+(ch>0?'up':'down')+'" title="vs the previous '+SB_PERF_DAYS+' days">'
              +(ch>0?'▲':'▼')+' '+Math.abs(ch)+'% leads/hr</span>';
          }
          return '<div class="spx-extra">'
            +(r.bestVa?'<span class="spx-bva" title="Best leads/hour on this storefront">'
                +escHtml(vaDisp(r.bestVa.va))+' gets most from it &middot; <b>'+r.bestVa.lph.toFixed(1)+'</b>/hr</span>':'')
            +tr
            +(r.daysSince!=null?'<span class="spx-last">last worked '
                +(r.daysSince===0?'today':r.daysSince===1?'yesterday':r.daysSince+'d ago')+'</span>':'')
          +'</div>';
        })():'')
      +(hasR?(function(){
          /* colour every number that has a right answer: time per lead against the
             minutes the target implies, hit rate against the board, best/worst spread. */
          var tgtMins=60/med;                       // minutes per lead if hitting target
          var tpl = r.minsPerLead==null?'':(r.minsPerLead<=tgtMins?' class="good"':(r.minsPerLead<=tgtMins*1.5?' class="warn"':' class="bad"'));
          var hrAll=(totA>0&&totL)?(totL/totA*100):0;
          var hit = r.hitRate==null?'':(r.hitRate>=hrAll*1.25?' class="good"':(r.hitRate>=hrAll*0.75?'':' class="bad"'));
          var spread = (r.bestBatch==null)?'':(r.worstBatch>0?' class="good"':' class="warn"');
          return '<div class="spx-deep">'
        +'<span title="Average time spent before one lead came out. Target pace is '+sbMins(tgtMins)+'"><em>time per lead</em><b'+tpl+'>'
          +sbMins(r.minsPerLead)+'</b></span>'
        +'<span title="Leads as a % of ASINs sent. Board average is '+hrAll.toFixed(1)+'%"><em>hit rate</em><b'+hit+'>'
          +(r.hitRate!=null?r.hitRate.toFixed(1)+'%':'—')+'</b></span>'
        +'<span title="Average time to work one batch, and what it yields"><em>per batch</em><b>'
          +sbMins(r.minsPerBatch)+(r.leadsPerBatch!=null?' <i>&rarr; '+(Math.round(r.leadsPerBatch*10)/10)+' leads</i>':'')+'</b></span>'
        +'<span title="Average size of a batch on this tag"><em>batch size</em><b>'
          +(r.asinsPerBatch!=null?Math.round(r.asinsPerBatch):'—')+'</b></span>'
        +'<span title="How many ASINs get checked in an hour on this storefront"><em>asins / hr</em><b>'
          +(r.asinsPerHour!=null?Math.round(r.asinsPerHour):'—')+'</b></span>'
        +'<span title="Best and worst single batch, by leads — a 0 worst means it is inconsistent"><em>best / worst batch</em><b'+spread+'>'
          +(r.bestBatch!=null?r.bestBatch+' / '+r.worstBatch:'—')+'</b></span>'
      +'</div>'; })():'')
      +((r.list&&r.list.length)
        ? '<button class="spx-open-b" onclick="sbTagToggle('+JSON.stringify(r.name).replace(/"/g,'&quot;')+')">'
            +(open?'Hide the '+r.list.length+' batches ▴':'Show all '+r.list.length+' batch'+(r.list.length===1?'':'es')+' ▾')+'</button>'
        : '')
      +(open?sbTagDetailHTML(r):'')
      +'</div>';
  }

  var summary='<div class="spx-top">'
    +'<div class="spx-t"><b>'+totB+'</b><em>batches</em></div>'
    +'<div class="spx-t"><b>'+totA.toLocaleString()+'</b><em>ASINs sent</em></div>'
    +'<div class="spx-t'+(totL?' good':'')+'"><b>'+(totL||'—')+'</b><em>leads back</em></div>'
    +'<div class="spx-t"><b>'+(totH>0?totH.toFixed(1)+'h':'—')+'</b><em>time spent</em></div>'
    +'<div class="spx-t'+(totH>0&&totL?' good':'')+'"><b>'+(totH>0&&totL?(totL/totH).toFixed(1):'—')+'</b><em>leads / hour overall</em></div>'
    +'<div class="spx-t"><b>'+(totH>0&&totL?sbMins(totH*60/totL):'—')+'</b><em>avg time per lead</em></div>'
    +'<div class="spx-t"><b>'+(totA>0&&totL?(totL/totA*100).toFixed(1)+'%':'—')+'</b><em>hit rate</em></div>'
    +'</div>';

  var verdict='';
  /* A tag can have leads back but NO hours against it — a batch worked in a shift
     that was never logged. sbPerf then sets lph=null, that row sorted straight into
     `low`, and low.lph.toFixed(1) threw. One tag (TFTJ: 1 lead, 0h) took the entire
     Storefronts tab down to a permanent spinner. Rank on tags that actually have a
     rate; the rest still appear as cards below. */
  var rated=worked.filter(function(r){ return typeof r.lph==='number' && isFinite(r.lph); });
  if(rated.length>=2){
    var top=rated.slice().sort(function(a,b){return b.lph-a.lph;})[0];
    var low=rated.slice().sort(function(a,b){return a.lph-b.lph;})[0];
    /* The three questions a storefront board should answer without being asked:
       what's best, what's costing me, and what am I still sending ASINs into for
       nothing. The last one is where the money leaks. */
    var dear=worked.slice().filter(function(r){ return r.minsPerLead!=null; })
                   .sort(function(a,b){ return b.minsPerLead-a.minsPerLead; })[0];
    var dead=rows.filter(function(r){ return r.worked>0 && r.leads===0; });
    var deadA=dead.reduce(function(a,r){ return a+r.asins; },0);
    var never=rows.filter(function(r){ return r.worked===0 && r.batches>0; });
    verdict='<div class="spx-verdict"><b>'+escHtml(top.name)+'</b> is your best hour-for-hour at <b>'
      +top.lph.toFixed(1)+' leads/hr</b>'
      +(low && low.name!==top.name ? ' — <span class="dim">'+escHtml(low.name)+' is the slowest at '+low.lph.toFixed(1)+'/hr.</span>' : '')
      +(dear&&dear.minsPerLead>=20 ? '<div class="spx-v2">'+escHtml(dear.name)+' costs the most time per lead — <b>'
          +sbMins(dear.minsPerLead)+'</b> of someone\u2019s day for each one.</div>' : '')
      +(dead.length ? '<div class="spx-v2 bad"><b>'+dead.length+' storefront'+(dead.length===1?'':'s')
          +' worked and returned nothing</b> — '+escHtml(dead.slice(0,3).map(function(r){return r.name;}).join(', '))
          +(dead.length>3?' +'+(dead.length-3)+' more':'')+', '+deadA.toLocaleString()+' ASINs spent.</div>' : '')
      +(never.length ? '<div class="spx-v2 dim2">'+never.length+' sent but never worked: '
          +escHtml(never.slice(0,4).map(function(r){return r.name;}).join(', '))
          +(never.length>4?' +'+(never.length-4)+' more':'')+'.</div>' : '')
      +'</div>';
  } else if(!worked.length){
    verdict='<div class="spx-verdict wait"><b>Nothing worked yet.</b> '
      +'<span class="dim">Leads, hours and the two rates fill in per tag the moment a VA ticks a batch off.</span></div>';
  }

  return head+summary+verdict
    +'<div class="spx-grid">'+worked.concat(pending).map(card).join('')+'</div>'
    +sbWorthHTML();                 // stays: it IS the storefront time question
    // the filter league lives on Filters, the buy breakdown on Insights — see there
}
function sbJackHTML(){
  if(window.SB_TABLES_MISSING){
    return '<div class="sb-setup"><div class="sb-setup-t">\u26A0\uFE0F Storefront module isn\u2019t switched on yet</div>'
      +'<div class="sb-setup-b">The three tables it needs don\u2019t exist in Supabase yet. '
      +'<b>Copy the SQL</b> below, paste it into the Supabase SQL editor and hit Run \u2014 it only creates things, '
      +'nothing existing is touched, and running it twice is harmless. Then hit <b>Check again</b>.</div>'
      +'<div class="sb-setup-acts">'
        +'<button class="btn btn-success" onclick="sbCopySQL(this)">&#128203; Copy the SQL</button>'
        +'<a class="btn btn-ghost" href="https://supabase.com/dashboard/project/ffbdazepqrsyurhouxif/sql/new" target="_blank">Open Supabase SQL editor &#8599;</a>'
        +'<button class="btn btn-ghost" onclick="sbToggleSQL()">Show it</button>'
        +'<button class="btn btn-ghost" onclick="window.SB_TABLES_MISSING=false;SB_QUEUES=null;SB_BATCHES=null;SB_BATCHES_ALL=null;mgr_renderStorefronts()">Check again</button>'
      +'</div>'
      +'<div id="sb-sql-box" style="display:none;"><textarea readonly spellcheck="false" onclick="this.select()">'
        +escHtml(sbSetupSQL())+'</textarea></div>'
      +'</div>';
  }
  return sbTodayHTML()+sbPerfHTML()+sbHistoryHTML()+sbQueuesHTML()+sbKeepaSettingHTML();
}
