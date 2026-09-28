/* ── SHIFT AUDIT ────────────────────────────────────────────────────────────
   Temporary tab. Jack wants to sit with one shift and go line by line: what the VA
   logged against each task, versus the leads that actually reached the sheet that
   day, with the sheet ROW NUMBERS so he can open the sheet and check. Two sources
   that have never been shown side by side. Delete this tab when he's done. */
var AUD_VA='Mera', AUD_DATE=null;
function audDates(va){
  var seen={}, out=[];
  (mgr_getLog()||[]).forEach(function(r){
    if(r.va!==va || !r.date) return;
    if(!seen[r.date]){ seen[r.date]=1; out.push(r.date); }
  });
  return out.sort(function(a,b){
    var A=a.split('/'), B=b.split('/');
    return (B[2]+B[1]+B[0]).localeCompare(A[2]+A[1]+A[0]);
  });
}
function audShift(va,date){
  return (mgr_getLog()||[]).filter(function(r){ return r.va===va && r.date===date; })[0]||null;
}
function audSheetLeads(va,date){
  var code=(typeof vaCode==='function')?vaCode(va):(va==='Mera'?'VA M':'VA S');
  return (window.leads||[]).filter(function(l){
    return l && l.va===code && String(l.date||'').slice(0,10)===date;
  }).sort(function(a,b){ return (a.sheetRow||0)-(b.sheetRow||0); });
}
function audSet(k,v){ if(k==='va'){ AUD_VA=v; AUD_DATE=null; } else AUD_DATE=v; mgr_renderAudit(); }
function audHTML(){
  var dates=audDates(AUD_VA);
  if(!AUD_DATE) AUD_DATE=dates[0]||null;
  var head='<div class="aud-bar">'
    +['Mera','Suz'].map(function(v){
        return '<button class="aud-t'+(AUD_VA===v?' on '+v.toLowerCase():'')+'" onclick="audSet(\'va\',\''+v+'\')">'+escHtml(vaDisp(v))+'</button>';
      }).join('')
    +'<select class="aud-date" onchange="audSet(\'date\',this.value)">'
      +(dates.length?dates.map(function(d){ return '<option'+(d===AUD_DATE?' selected':'')+'>'+d+'</option>'; }).join('')
                    :'<option>no shifts found</option>')
    +'</select>'
    +'<span class="aud-note">Temporary — for going through a shift line by line</span>'
    +'</div>';
  if(!AUD_DATE) return head+'<div class="sb-empty">No shifts logged for '+escHtml(vaDisp(AUD_VA))+' yet.</div>';

  var rec=audShift(AUD_VA,AUD_DATE);
  var sheet=audSheetLeads(AUD_VA,AUD_DATE);
  if(!rec) return head+'<div class="sb-empty">No shift found for that date.</div>';

  var tasks=(rec.tasks||[]).filter(function(t){ return t && !t.tickOnly; });
  var claimed=tasks.reduce(function(a,t){ var n=parseInt(t.leads); return a+(isNaN(n)?0:n); },0);
  var mins=tasks.reduce(function(a,t){ return a+((typeof sbTaskMins==='function')?sbTaskMins(t):0); },0);
  var diff=claimed-sheet.length;

  var summary='<div class="aud-sum">'
    +'<div class="aud-s"><em>Logged on tasks</em><b>'+claimed+'</b><span>leads</span></div>'
    +'<div class="aud-s"><em>On the sheet</em><b>'+sheet.length+'</b><span>rows dated '+escHtml(AUD_DATE)+'</span></div>'
    +'<div class="aud-s'+(diff===0?' ok':' bad')+'"><em>Difference</em><b>'+(diff>0?'+':'')+diff+'</b>'
      +'<span>'+(diff===0?'they match':(diff>0?'logged but not on the sheet':'on the sheet but not logged'))+'</span></div>'
    +'<div class="aud-s"><em>Time logged</em><b>'+(mins?(mins/60).toFixed(1)+'h':'—')+'</b>'
      +'<span>'+tasks.filter(function(t){ return (typeof sbTaskMins==='function')&&sbTaskMins(t)>0; }).length+' of '+tasks.length+' tasks timed</span></div>'
    +'</div>';
  summary+=audWorkHTML();

  /* ── HOW THE DAY WAS ACTUALLY WORKED ──────────────────────────────────────
     Jack: "i wanna know did they press the start and stop — more data and insight —
     it's our app we can get it all, so why aren't we". Everything below is computed
     from what the shift already saved; no new fields, nothing for the VAs to do. */
  function audWorkHTML(){
    var timed=0, typed=0, none=0;
    tasks.forEach(function(t){
      var m=(typeof sbTaskMins==='function')?sbTaskMins(t):0;
      if(t.timeSource==='timer') timed++;
      else if(m>0) typed++;
      else none++;
    });
    var pct=tasks.length?Math.round(timed/tasks.length*100):0;
    var shiftH=parseFloat(rec.hoursWorked)||0;
    var acc=mins/60;
    var accPct=shiftH>0?Math.round(acc/shiftH*100):0;
    var lph=(acc>0.05)?(claimed/acc).toFixed(1):null;

    // ticks across the day → where the quiet stretches were
    /* Every time on this card must sit on ONE unwrapped line, or an overnight shift
       compares 04:17 against 19:21 and reports nonsense. shiftAt() does that; the old
       local toMin() also silently dropped the am/pm off "07:21 pm", which is why an
       evening start used to produce a twelve-hour "warm-up". */
    var _ev=shiftEvidence(rec);
    var span=_ev.span;
    var ticks=tasks.map(function(t){ return {m:shiftAt(t.tickedAt,span), n:t.name, at:t.tickedAt||''}; })
                   .filter(function(x){ return x.m!=null; })
                   .sort(function(a2,b2){ return a2.m-b2.m; });
    var gap=null, gapAfter='';
    for(var i=1;i<ticks.length;i++){
      var d=ticks[i].m-ticks[i-1].m;
      if(gap===null||d>gap){ gap=d; gapAfter=ticks[i-1].n; }
    }
    var firstTick=ticks.length?ticks[0]:null, lastTick=ticks.length?ticks[ticks.length-1]:null;
    var startM=span.start, endM=span.end;
    /* Both of these measure against the RECORDED start/end. On a day where those were
       rebuilt from the timer they are fiction — Mera 13/08 would report a 15h 24m
       warm-up. shiftEvidence() knows; suppress rather than mislead. */
    var warmUp=(_ev.trusted&&startM!=null&&firstTick)?(firstTick.m-startM):null;
    var windDown=(_ev.trusted&&endM!=null&&lastTick)?(endM-lastTick.m):null;
    function hm(v){ if(v==null) return '—'; return v>=60?(Math.floor(v/60)+'h '+(v%60)+'m'):(v+'m'); }
    /* fmt24to12() lives in another <script> block and is not visible here — it threw the
       whole audit away. Format it locally rather than reach across blocks. */
    function clock(hhmm){
      var m3=String(hhmm||'').match(/^(\d{1,2}):(\d{2})/); if(!m3) return '—';
      var h=+m3[1], ap=h>=12?'pm':'am', h12=(h%12)||12;
      return h12+':'+m3[2]+ap;
    }
    function tone(ok,warn,v){ return v>=ok?'good':v>=warn?'warn':'bad'; }

    return '<div class="aud-work">'
      +'<div class="aud-work-h">How the day was worked</div>'
      +'<div class="aud-work-g">'
        +'<div class="awc '+tone(70,40,pct)+'"><em>Start/Stop used</em><b>'+timed+' of '+tasks.length+'</b>'
          +'<span>'+pct+'% timed'+(typed?' · '+typed+' typed by hand':'')+(none?' · '+none+' no time at all':'')+'</span></div>'
        +'<div class="awc '+tone(70,40,accPct)+'"><em>Time against tasks</em><b>'+acc.toFixed(1)+'h</b>'
          +'<span>of '+shiftH.toFixed(1)+'h on shift'+(shiftH>acc?' · '+(shiftH-acc).toFixed(1)+'h not accounted for':'')+'</span></div>'
        +'<div class="awc"><em>Leads per hour</em><b>'+(lph||'—')+'</b>'
          +'<span>'+(lph?claimed+' leads across '+acc.toFixed(1)+'h of logged work':'no timed work to measure')+'</span></div>'
        +'<div class="awc '+(gap==null?'':(gap>=90?'bad':gap>=45?'warn':'good'))+'"><em>Longest quiet stretch</em><b>'+hm(gap)+'</b>'
          +'<span>'+(gap==null?'not enough ticks to tell':'nothing ticked after &ldquo;'+escHtml(String(gapAfter).slice(0,34))+'&rdquo;')+'</span></div>'
        +'<div class="awc"><em>First tick</em><b>'+(firstTick?escHtml(clock(firstTick.at)):'—')+'</b>'
          +'<span>'+(warmUp==null?(_ev.trusted?'\u2014':'start time not reliable on this day')
                                     :hm(warmUp)+' after starting the shift')+'</span></div>'
        +'<div class="awc"><em>Last tick</em><b>'+(lastTick?escHtml(clock(lastTick.at)):'—')+'</b>'
          +'<span>'+(windDown==null?(_ev.trusted?'\u2014':'end time not reliable on this day')
                                       :hm(windDown)+' before ending it')+'</span></div>'
      +'</div>'
      +(none?'<div class="aud-work-n">'+none+' task'+(none===1?'':'s')+' finished with no time recorded at all \u2014 those are invisible in every hours figure you look at.</div>':'')
      +'</div>';
  }

  /* Everything recorded about a task, not just the headline: what Jack sent with it,
     every named link and what each produced, how long each link was open, when it was
     ticked, how the time was entered, and anything she wrote back. This is the tab for
     sitting down and going through a shift properly. */
  function audTask(t){
    var n=parseInt(t.leads), m=(typeof sbTaskMins==='function')?sbTaskMins(t):0;
    var src=(t.timeSource==='timer')?'<i class="aud-tm" title="Timed with Start/Stop">\u23f1</i>'
          :(t.timeSource==='manual')?'<i class="aud-tm typed" title="Typed by hand">\u270e</i>'
          :'<i class="aud-tm none" title="No time recorded">\u2014</i>';
    var names=t.linkNames||[], links=t.links||[], ll=t.linkLeads||[], ls=t.linkSecs||[];
    var sub='';
    for(var i=0;i<Math.max(names.length,links.length);i++){
      var nm=names[i]||'', ur=links[i]||'';
      if(!nm && !ur) continue;
      var lead=(ll[i]===''||ll[i]==null)?null:parseInt(ll[i]);
      var secs=parseInt(ls[i])||0;
      sub+='<div class="aud-sub">'
        +'<span class="aud-sn">'+escHtml(nm||String(ur).replace(/^https?:\/\//,'').slice(0,34))+'</span>'
        +(secs?'<span class="aud-v">'+(secs>=60?Math.round(secs/60)+'m':secs+'s')+'</span>':'')
        +'<span class="aud-v'+(lead?' lead':'')+'">'+(lead==null?'not logged':lead+' lead'+(lead===1?'':'s'))+'</span>'
        +(ur?'<a class="aud-open" href="'+String(ur).replace(/"/g,'&quot;')+'" target="_blank">open \u2197</a>':'')
        +'</div>';
    }
    var meta=[];
    if(t.tickedAt) meta.push('ticked '+escHtml(t.tickedAt));
    if(t.timerSec) meta.push('timer ran '+Math.round(t.timerSec/60)+'m');
    if(t.skipped) meta.push('SKIPPED'+(t.skipReason?': '+escHtml(t.skipReason):''));
    var note=t.context?'<div class="aud-note-r">\u201c'+escHtml(t.context)+'\u201d</div>':'';
    return '<div class="aud-task'+(t.done?'':' skip')+'">'
      +'<div class="aud-r">'
        +'<span class="aud-n">'+escHtml(String(t.name||''))+'</span>'
        +'<span class="aud-v">'+(m?fmtDur(Math.floor(m/60),m%60):'\u2014')+src+'</span>'
        +'<span class="aud-v lead">'+(isNaN(n)?'\u2014':n)+'</span>'
      +'</div>'
      +(meta.length?'<div class="aud-meta">'+meta.join(' \u00b7 ')+'</div>':'')
      +sub+note
      +'</div>';
  }
  // what Jack sent that day — separated out, because "did they action what I sent?"
  // is a different question from "how did the standing tasks go?"
  var sent=tasks.filter(function(t){ return /^(jbitem-|sbatch-)/.test(String(t.id||'')); });
  var standing=tasks.filter(function(t){ return !/^(jbitem-|sbatch-)/.test(String(t.id||'')); });
  var sentDone=sent.filter(function(t){ return t.done; }).length;

  var left='<div class="aud-col">'
    +(sent.length
      ? '<div class="aud-h">What you sent<span>'+sentDone+' of '+sent.length+' actioned</span></div>'
        +sent.map(audTask).join('')
      : '')
    +'<div class="aud-h">Their standing tasks</div>'
    +(standing.length?standing.map(audTask).join(''):'<div class="aud-empty">No tasks recorded.</div>')
    +'</div>';

  var right='<div class="aud-col"><div class="aud-h">What reached the sheet'
      +(sheet.length&&sheet[0].sheetTab?'<span> tab '+escHtml(sheet[0].sheetTab)+'</span>':'')+'</div>'
    + (sheet.length?sheet.map(function(l){
        return '<div class="aud-r">'
          +'<span class="aud-row">'+(l.sheetRow?('row '+l.sheetRow):'—')+'</span>'
          +'<span class="aud-n">'+escHtml(String(l.title||'(untitled)').slice(0,40))+'</span>'
          +'<span class="aud-v">'+escHtml(l.asin||'')+'</span>'
          +'</div>';
      }).join(''):'<div class="aud-empty">Nothing on the sheet for this date.</div>')
    +'</div>';

  return head+summary+'<div class="aud-2">'+left+right+'</div>';
}
function mgr_renderAudit(){
  var el=document.getElementById('mgr-audit-content'); if(!el) return;
  /* Same fault the Storefronts tab had: a throw inside the repaint was swallowed and
     "Loading leads…" never cleared. Paint always lands, and names the fault. */
  function paint(){
    try{ el.innerHTML=audHTML(); }
    catch(e){
      console.error('Audit render failed', e);
      el.innerHTML='<div class="sb-empty">Audit couldn\u2019t draw.'
        +'<span>'+escHtml(String((e&&e.message)||e))+'</span>'
        +'<span><button class="sbp-t" onclick="mgr_renderAudit()">Try again</button></span></div>';
    }
  }
  if(!(window.leads||[]).length && typeof loadLeadsFromDB==='function'){
    el.innerHTML='<div class="sk-note">Loading leads…</div>';
    loadLeadsFromDB().then(paint).catch(function(e){
      console.error('Audit load failed', e);
      el.innerHTML='<div class="sb-empty">Couldn\u2019t load leads.'
        +'<span>'+escHtml(String((e&&e.message)||e))+'</span>'
        +'<span><button class="sbp-t" onclick="mgr_renderAudit()">Try again</button></span></div>';
    });
    return;
  }
  paint();
}
/* Every repaint of the Storefronts board goes through here — the tab render AND the
   seven action buttons (priority, reorder, add queue…). A throw inside sbJackHTML()
   used to be swallowed as an unhandled rejection: the skeleton sat there forever, or
   a click wiped the board to nothing, with no clue why. Now the board always shows
   something, and names the fault. */
function sbPaintSafe(host){
  if(!host) return;
  try{ host.innerHTML=sbJackHTML(); }
  catch(e){
    console.error('Storefronts render failed', e);
    host.innerHTML='<div class="sb-empty">Storefronts couldn\u2019t draw.'
      +'<span>'+escHtml(String((e&&e.message)||e))+'</span>'
      +'<span><button class="sbp-t" onclick="mgr_renderStorefronts()">Try again</button></span></div>';
  }
}
function mgr_renderStorefronts(){
  // the filter league needs filter_usage; pull it once, then repaint when it lands
  /* one attempt per page load, whatever the outcome — a "load then repaint" that keys off
     a value the loader might leave empty is how the 28/09 freeze happened (see sbLoadSrcLists) */
  try{ if(!window._fuCloud && !window._sbFuTried && typeof fuLoadCloud==='function'){ window._sbFuTried=true;
    fuLoadCloud().then(function(){ if(mgr_currentTab==='storefronts') mgr_renderStorefronts(); });
  } }catch(e){}
  try{ if(!SB_SRC_LISTS && !window._sbSrcTried && typeof sbLoadSrcLists==='function'){ window._sbSrcTried=true;
    sbLoadSrcLists().then(function(){ if(mgr_currentTab==='storefronts') mgr_renderStorefronts(); });
  } }catch(e){}
  var el=document.getElementById('mgr-storefronts-content'); if(!el) return;
  /* Every paint goes through sbSafePaint. Before, a throw inside sbJackHTML() was
     swallowed as an unhandled rejection and the skeleton sat there forever with no
     clue why. Now the tab always ends up showing something, and it names the fault. */
  function sbSafePaint(){ sbPaintSafe(el); }
  if(!SB_QUEUES||!SB_BATCHES){
    el.innerHTML='<div class="sk-note">Loading batches…</div>'+skTiles(3,3);
    Promise.all([sbLoadQueues(), sbLoadBatches(true)]).then(sbSafePaint).catch(function(e){
      console.error('Storefronts load failed', e);
      el.innerHTML='<div class="sb-empty">Couldn\u2019t load batches.'
        +'<span>'+escHtml(String((e&&e.message)||e))+'</span>'
        +'<span><button class="sbp-t" onclick="mgr_renderStorefronts()">Try again</button></span></div>';
    });
    return;
  }
  sbSafePaint();
  sbLoadBatches(true).then(sbSafePaint).catch(function(e){ console.error('Storefronts refresh failed', e); });
}

