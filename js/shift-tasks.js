/* ── STOREFRONT BATCHES: ONE CARD ──────────────────────────────────────────
   Each row: what it is → open it → time it → Keepa yes/no → leads → done.
   Every control is the SAME handler the old full rows used (ttToggle, sbBatchKeepa,
   sbBatchLead, markDone), so nothing about the data changes — only the amount of
   screen it takes to show it. */
function sbVaStartedBy(task){
  var b=(SB_BATCHES||[]).find(function(x){ return x.id===task.sbBatchId; });
  return (b&&b.status==='Started')?(b.started_by||''):'';
}
function sbVaRowHTML(r){
  var t=r.t, i=r.i, ex=r.extra?1:0, bx=(r.extra?'e':'t')+i;
  var b=(SB_BATCHES||[]).find(function(x){ return x.id===t.sbBatchId; })||{};
  var n=b.asin_count||0, age=sbAgeDays(b.date), running=!!t.timerRun;
  var elapsed=(typeof ttElapsedT==='function')?ttElapsedT(t):0;
  var kp=t.keepaTracks||'';
  var lc=(t.leads===''||t.leads==null)?0:(+t.leads||0);
  var me=vaDisp(state.currentVA||'');
  var by=sbVaStartedBy(t);
  /* Jack: "some stuff goes to both VAs to do — not locked when Mera has it". A batch
     assigned to Both/All is EVERYONE'S work: the other VA starting it is information,
     never a lock. Only a batch owned by one person locks for anyone else. */
  var shared=(sbPeople(b.assigned_to).length>1);
  var otherBy=(by && by!==state.currentVA && by!==me && by!=='')?by:null;
  var other=(!shared && otherBy)?otherBy:null;
  var alsoOn=(shared && otherBy)?otherBy:null;
  var waiting=shared?sbWaitingOn(b).filter(function(w){ return w!==state.currentVA; }):[];
  var ageChip = (age==null)?'' : age<=0?'<span class="sbv-age">today</span>'
    : age===1?'<span class="sbv-age">yesterday</span>'
    : '<span class="sbv-age'+(age>=2?' late':'')+'">'+age+' days</span>';
  return '<div class="sbv-row'+(running?' run':'')+(other?' held':'')+'" data-lid="'+t.sbBatchId+'">'
    +'<div class="sbv-main">'
      +'<b class="sbv-name" title="'+escHtml(t.sbNote||'')+'">'+escHtml(b.storefront_name||'Queue')
        +(b.batch_number>1?' <i>#'+b.batch_number+'</i>':'')+'</b>'
      +'<span class="sbv-n">'+n+' ASINs</span>'
      +ageChip
      +((b.priority==='High')?'<span class="sbv-hi">HIGH</span>':'')
      +(other?'<span class="sbv-held" title="Started by '+escHtml(vaDisp(other))+' — leave it with them">'+escHtml(vaDisp(other))+' has it</span>':'')
      /* Jack, 19/09: "why do VAs need to know who else is doing it". They don't. The
         "BOTH · Suz still to do" and "Suz on it now" pills came from the old shared-row
         design; since v49.9 every VA gets a batch of her own anyway. Her Done still
         records her own pass on older shared rows — only the display is gone. Jack's
         board keeps showing who holds what. The "has it" lock above stays: that one
         stops her working a batch someone else owns. */
      +(running?'<span class="sbv-live">● timing</span>':'')
    +'</div>'
    +'<div class="sbv-ctl">'
      /* Jack: "if they open a Keepa link that auto starts the timer too" — same rule the
         task-card Open links already follow. Opening the work IS starting the work; held
         batches keep no timer button, so no auto-start there either. */
      +(t.jbUrl?'<a class="sbv-open" href="'+String(t.jbUrl).replace(/"/g,'&quot;')+'" target="_blank" title="Open all '+n+' ASINs in one Keepa list — starts the timer"'
        +(other?'':' onclick="event.stopPropagation();try{ttEnsureRunning('+i+','+ex+');renderTasks();saveShiftDraft(false);}catch(e){}"')+'>Keepa &#8599;</a>':'')
      +(other?'' :
        '<button type="button" class="sbv-t'+(running?' on':'')+'" onclick="ttToggle('+i+','+ex+')">'
          +'<span id="bp-el-'+bx+'">'+sfFmt(elapsed)+'</span> '+(running?'&#9632;':'&#9654;')+'</button>'
        +'<span class="sbv-kp" title="Did you add these ASINs to the Keepa tracker?"><em>Trackers?</em>'
          +'<button type="button" class="'+(kp==='yes'?'yes':'')+'" onclick="sbBatchKeepa('+i+','+ex+',\'yes\')">Yes</button>'
          +'<button type="button" class="'+(kp==='no'?'no':'')+'" onclick="sbBatchKeepa('+i+','+ex+',\'no\')">No</button></span>'
        +'<span class="sbv-lead"><button type="button" onclick="sbBatchLead('+i+','+ex+',-1)">&minus;</button>'
          +'<b id="bl-n-'+bx+'">'+lc+'</b>'
          +'<button type="button" class="plus" onclick="sbBatchLead('+i+','+ex+',1)">+</button></span>'
        +'<button type="button" class="sbv-done" onclick="markDone('+i+','+ex+')">&#10003; Done</button>')
    +'</div>'
    +'</div>';
}
function sbVaGroupEl(rows){
  var sec=document.createElement('div');
  sec.className='tk-sec sbv-sec';
  var totA=0, oldest=0;
  rows.forEach(function(r){
    var b=(SB_BATCHES||[]).find(function(x){ return x.id===r.t.sbBatchId; })||{};
    totA+=(b.asin_count||0);
    var a=sbAgeDays(b.date); if(a!=null&&a>oldest) oldest=a;
  });
  /* oldest first inside the card — the "clear this one first" rule enforced by ORDER,
     not by repeating a warning sentence on every row. High priority still tops it. */
  /* Jack's order (03/09): High → Medium → Low, and newest first inside each band.
     See sbOrderCmp. Was oldest-first; the 5-day auto-remove now handles staleness. */
  var ordered=rows.slice().sort(function(x,y){
    function bat(t){ return (SB_BATCHES||[]).find(function(b){ return b.id===t.sbBatchId; })||{}; }
    var bx=bat(x.t), by=bat(y.t);
    return sbOrderCmp({priority:x.t.sbPriority||bx.priority, date:bx.date, storefront_name:bx.storefront_name},
                      {priority:y.t.sbPriority||by.priority, date:by.date, storefront_name:by.storefront_name});
  });
  sec.innerHTML='<div class="tk-sec-h sbv-h">\u{1F3EC} Storefront batches'
    +'<span class="sbv-sum"><b>'+rows.length+'</b> to work · <b>'+totA+'</b> ASINs'
    +(oldest>=2?' · <em class="late">oldest waiting '+oldest+' days</em>':'')+'</span></div>'
    +'<div class="sbv-how">'+escHtml(sbHowText())+'</div>'
    +'<div class="tk-sec-b">'+ordered.map(sbVaRowHTML).join('')+'</div>';
  var first=sec.querySelector('.sbv-row:not(.held)');
  if(first) first.classList.add('next');
  return sec;
}
/* a slim always-visible bar: how far through, what's next, leads so far */
function renderShiftBar(){
  var host=document.getElementById('shift-bar');
  if(!host){
    var anchor=document.getElementById('mandatory-tasks');
    if(!anchor||!anchor.parentNode) return;
    host=document.createElement('div'); host.id='shift-bar';
    anchor.parentNode.insertBefore(host,anchor);
  }
  var all=state.tasks.concat(state.extraTasks);
  var req=all.filter(function(t){return t.mandatory!==false;});
  var done=req.filter(function(t){return t.done;}).length;
  var pct=req.length?Math.round(done/req.length*100):0;
  var leads=all.reduce(function(a,t){return a+(parseInt(t.leads)||0);},0);
  var goal=(function(){ try{ return vaGoal(state.currentVA)||12; }catch(e){ return 12; } })();
  var next=all.filter(function(t){return !t.done&&!t.skipped;})[0];
  var carried=all.filter(function(t){return !t.done&&!t.skipped&&t.jbCarried;}).length;
  /* anything Jack lands mid-shift — a new task or a reopened card — pins a bright
     chip in the FROZEN bar until dealt with, so it cannot scroll out of sight */
  var freshJ=all.filter(function(t){return !t.done&&!t.skipped&&(t._reopenedAt||t._jbNewMid);}).length;
  host.innerHTML='<div class="sb-wrap">'
    +'<div class="sb-l"><div class="sb-nums"><b>'+done+'</b><span>/'+req.length+' tasks</span>'
      +'<b class="sb-leads">'+leads+'</b><span>/'+goal+' leads</span>'
      +(carried?'<span class="sb-carry">⚠️ '+carried+' carried</span>':'')
      +(freshJ?'<span class="sb-new" onclick="sbGoFreshJack()">\u{1F4E3} '+freshJ+' new from Jack</span>':'')+'</div>'
      +'<div class="sb-bar"><i style="width:'+pct+'%"></i></div></div>'
    +'<div class="sb-next">'+(next?'<span>Next up</span><b>'+escHtml(next.jbLabel||next.name||'')+'</b>':'<b class="sb-clear">🎉 Everything ticked</b>')+'</div>'
    +'</div>';
}
/* the frozen-bar chip jumps to the first thing Jack landed mid-shift */
function sbGoFreshJack(){
  try{
    var t=(state.tasks.concat(state.extraTasks)).find(function(x){return !x.done&&!x.skipped&&(x._reopenedAt||x._jbNewMid);});
    if(!t) return;
    var rows=document.querySelectorAll('.task-item');
    for(var z=0;z<rows.length;z++){
      if(rows[z].textContent.indexOf(t.name)>=0){ rows[z].scrollIntoView({behavior:'smooth',block:'center'}); return; }
    }
  }catch(e){}
}
// flag the first task still to do, so a VA glancing at the list always knows where they are
function markNextUpTask(){
  try{
    document.querySelectorAll('.task-item.next-up').forEach(function(el){ el.classList.remove('next-up'); });
    document.querySelectorAll('.tk-nextchip').forEach(function(el){ el.remove(); });
    var rows=document.querySelectorAll('#mandatory-tasks .task-item, #extra-tasks .task-item');
    for(var i=0;i<rows.length;i++){
      var r=rows[i];
      if(r.classList.contains('done')||r.classList.contains('skipped')) continue;
      r.classList.add('next-up');
      /* a faint border was the only cue \u2014 easy to miss in a list of 19. Say it. */
      try{
        if(!r.querySelector('.tk-nextchip')){
          var c=document.createElement('span');
          c.className='tk-nextchip'; c.textContent='DO THIS NEXT';
          var h=r.querySelector('.task-title')||r.querySelector('.tk-title')||r.firstElementChild;
          if(h) h.appendChild(c);
        }
      }catch(e){}
      return;
    }
  }catch(e){}
}

function updateTaskProgress() {
  var mand = state.tasks.filter(function(t){ return t.mandatory !== false; });
  var done = mand.filter(function(t){ return t.done; }).length;
  var pct  = mand.length ? Math.round(done / mand.length * 100) : 0;
  var mc = document.getElementById('mand-count'); if (mc) mc.innerHTML = '<b>'+done+'</b> / '+mand.length+' done';
  var mp = document.getElementById('mand-prog'); if (mp) mp.style.width = pct + '%';
  var mw = document.getElementById('mand-progwrap'); if (mw) mw.classList.toggle('complete', pct >= 100 && mand.length > 0);
  var ec = document.getElementById('extra-count'); if (ec) ec.innerHTML = '<b>'+state.extraTasks.length+'</b> added';
}

var TICKONLY_IDS = ['test-1','leadsheet','ht-filters','telegram-eod','suz-leadsheet','suz-telegram-eod','leadsheet-eod','suz-leadsheet-eod'];
function taskIsTickOnly(t){
  if(!t) return false;
  if(t.tickOnly===true) return true;
  if(TICKONLY_IDS.indexOf(t.id) >= 0) return true;
  // A one-off Jack sent WITHOUT asking for a timer or a lead count is just "do it, tick it".
  // Demanding hours + leads on those only ever got made-up numbers typed in.
  if(t.jbIid && !t.jbTimer && !t.jbLeads && !t.hasLinks) return true;
  return false;
}
function taskLeadCount(t){
  if (t.leads!=='' && t.leads!=null && !isNaN(+t.leads)) return +t.leads;
  if (t.hasLinks && t.linkLeads) return t.linkLeads.reduce(function(a,b){ return a + (+b||0); }, 0);
  return 0;
}
function taskHasProgress(t){ return (+t.timeHrs||0)>0 || (+t.timeMins||0)>0 || (t.leads!=='' && t.leads!=null && t.leads!==undefined) || (t.context && String(t.context).trim()); }
function fmtDur(h,m){ h=+h||0; m=+m||0; if(h&&m) return h+'h '+m+'m'; if(h) return h+'h'; if(m) return m+'m'; return ''; }
/* Jack: "1 min 25 not 1 min :)" — Math.round(85/60) threw the 25 seconds away.
   The timer already holds the exact seconds, so show them. */
function fmtSecs(sec){
  sec=Math.max(0,Math.round(+sec||0));
  var h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  if(h) return h+'h '+m+'m';
  if(m) return m+'m '+(s?s+'s':'00s');
  return s+'s';
}
/* This printed the same sentence on nearly every row ("Log time spent & leads found"),
   so it read as decoration rather than information. It now only speaks when the row is
   unusual — tick-only, or carrying sources — and says nothing on the ordinary case,
   where the Start button and the +log chip already say it. */
function taskTypeLabel(t){
  if(taskIsTickOnly(t)) return 'Tick to confirm \u2014 no time or leads needed';
  if(t.hasLinks) return 'Sources below \u2014 log the leads each one gave you';
  return '';
}
function taskLoggedSummary(t){ var dur=fmtDur(t.timeHrs,t.timeMins); var lc=taskLeadCount(t); var parts=[]; if(dur) parts.push(dur); if(!taskIsTickOnly(t)) parts.push(lc+' lead'+(lc===1?'':'s')); return parts.join(' &#183; '); }
var SUB_ICON_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
var SUB_ICON_LINK  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15l6-6"/><path d="M11 6l1-1a4 4 0 015 5l-1 1"/><path d="M13 18l-1 1a4 4 0 01-5-5l1-1"/></svg>';
var SUB_ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>';

// friendly label for a from-Jack item (never dump a raw URL as the title)
function jb_cleanHost(u){
  try{ var h=((String(u).match(/^https?:\/\/(www\.)?([^\/]+)/i)||[])[2]||'').toLowerCase();
    if(h.indexOf('keepa')>=0) return 'Keepa storefront';
    if(h.indexOf('selleramp')>=0) return 'SellerAmp link';
    if(h.indexOf('sas')>=0&&h.indexOf('selleramp')>=0) return 'SellerAmp link';
    if(h.indexOf('amazon')>=0) return 'Amazon storefront';
    if(h.indexOf('selleramp')>=0) return 'SellerAmp';
    return h||String(u); }catch(e){ return String(u); }
}
function jbAsinsIn(v){
  var m=String(v||'').toUpperCase().match(/\bB0[A-Z0-9]{8}\b/g)||[];
  var seen={},out=[]; m.forEach(function(a){ if(!seen[a]){seen[a]=1;out.push(a);} });
  return out;
}
function jb_cleanLabel(it){
  if(it.n&&String(it.n).trim()) return String(it.n).trim();
  if(it.t==='asin') return String(it.v).trim().toUpperCase();
  /* Jack sends these in bulk ("i just send a load of EU ASINs in a KPF"), so the
     useful label is HOW MANY, not the first one or the host. */
  if(it.t==='euasin'){
    var a=jbAsinsIn(it.v);
    if(a.length>1) return a.length+' EU ASINs';
    if(a.length===1) return 'EU ASIN · '+a[0];
    if(/^https?:\/\//i.test(it.v)) return 'EU ASINs · '+jb_cleanHost(it.v);
    return 'EU ASINs';
  }
  if(/^https?:\/\//i.test(it.v)){
    // Unnamed Keepa links all collapsed to the same word ("Keepa storefront"), so a VA
    // sent eight of them saw eight identical rows. Pull the ASIN out of the link so each
    // one is telling apart at a glance.
    try{
      var dec=decodeURIComponent(String(it.v));
      /* Sourcing app links: "#run=bialetti" reads as "Run · Bialetti", "#due" as the due list.
         Without this the card said "jackbithellamazon.github.io", which tells the VA nothing. */
      var sr=dec.match(/BDL-Sourcing-Suite\/?#run=([a-z0-9-]+)/i);
      if(sr) return 'Run \u00b7 '+sr[1].split('-').map(function(w){ return w? w[0].toUpperCase()+w.slice(1) : ''; }).join(' ');
      if(/BDL-Sourcing-Suite\/?#due/i.test(dec)) return 'Sourcing app \u2014 what\u2019s due today';
      var m=dec.match(/\b(B0[A-Z0-9]{8})\b/i);
      if(m) return jb_cleanHost(it.v)+' · '+m[1].toUpperCase();
    }catch(e){}
    return jb_cleanHost(it.v);
  }
  return String(it.v).slice(0,90);
}
var JB_ICON_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 3 7v6c0 5 4 8 9 9 5-1 9-4 9-9V7z"/></svg>';
// distinct card for items Jack sends into the VA to-do list
function buildJackTaskEl(task, i, isExtra){
  var META={sf:['\u{1F3EC}','Storefront','var(--accent-2)'],kpf:['\u{1F3AF}','KPF filter','#18c8f0'],eu:['\u{1F1EA}\u{1F1FA}','EU sheet','#4c8dff'],euasin:['\u{1F1EA}\u{1F1FA}','EU ASINs','#7c5cff'],asin:['#','ASIN','#f5a524'],msg:['\u{1F4AC}','Do this','#10d99a']};
  var m=META[task.jbType]||META.msg;
  var inProg = !task.done && !task.skipped && taskHasProgress(task);
  var cls='task-item jbcard';
  if(task.mandatory && !isExtra) cls+=' mandatory';
  if(task.done) cls+=' done'; else if(inProg) cls+=' inprogress';
  if(task.skipped) cls+=' skipped';
  if(task.done && state._justDoneKey===(isExtra?'e':'t')+i) cls+=' just-done';
  var d=document.createElement('div'); d.className=cls; d.style.setProperty('--jbc', m[2]);

  var bodyId='body-'+(isExtra?'e':'t')+i;
  var checkCls=task.done?'task-check done-check':'task-check';
  var checkTick=task.done?'&#10003;':'';
  var checkClick=task.done?'lockedClick()':'markDone('+i+','+isExtra+')';
  var title=task.jbLabel||task.name||'From Jack';

  // meta line: what still needs doing / progress / completed summary
  var meta, metaCls='jbcard-meta';
  if(task.done){ var sm=taskLoggedSummary(task); meta='&#10003; '+(sm||'Completed'); }
  else if(inProg){ var pd=fmtDur(task.timeHrs,task.timeMins); meta='In progress'+(pd?' &#183; '+pd+' logged':' &#183; started'); }
  else if(task.jbReason){ meta='&#128172; '+String(task.jbReason).replace(/</g,'&lt;'); metaCls+=' jbcard-meta-reason'; }
  else {
    var need=[]; if(task.jbTimer) need.push('Time it'); if(task.jbLeads) need.push('log leads');
    meta = need.length ? ('&#9888; '+need.join(' &amp; ')) : (task.jbUrl?'Open &amp; action':'Action this');
  }

  var timerHtml='';
  // timer on EVERY task that logs time, not just the From-Jack ones. Tick-only tasks
  // (confirm-and-move-on) still don't get one — there's no time to log.
  if(!task.skipped && (task.jbTimer || !taskIsTickOnly(task))){
    if(task.done){ timerHtml=task.timerSec?'<span class="tt-chip fin"><b>'+sfFmt(task.timerSec)+'</b></span>':''; }
    else timerHtml='<span class="tt-chip'+(task.timerRun?' run':'')+'" onclick="event.stopPropagation();ttToggle('+i+','+isExtra+')"><b id="tt-'+(isExtra?'e':'t')+i+'">'+sfFmt(ttElapsedT(task))+'</b><span>'+(task.timerRun?'&#9632; Stop':'&#9654; Start')+'</span></span>';
  }
  // one-click Open right on the row — no need to expand the card
  var openMini='';
  if(task.jbUrl && !task.done) openMini='<a class="jb-open-mini" href="'+String(task.jbUrl).replace(/"/g,'&quot;')+'" target="_blank" onclick="event.stopPropagation()">Open &#8599;</a>';

  // big action row inside the body
  var actionRow='';
  // "Open storefront" told the VA nothing about what would open. A batch opens ALL its
  // ASINs in one Keepa Product Viewer list, so say that — it's the whole point of the module.
  if(task.jbUrl) actionRow+='<a class="jb-open" href="'+String(task.jbUrl).replace(/"/g,'&quot;')+'" target="_blank" onclick="event.stopPropagation()">'
    +(task.jbUrlLabel ? '&#128200; '+String(task.jbUrlLabel).replace(/</g,'&lt;')+' &#8599;'
                      : m[0]+' Open '+m[1].toLowerCase()+' &#8599;')+'</a>';
  // "Track in Storefronts" duplicated the manual logger for a batch that already tracks
  // itself — the row has its own timer and lead stepper. Only offer it on non-batch work.
  if(task.jbType==='sf' && !task.sbBatchId && !task.done) actionRow+='<span class="jb-asin" onclick="event.stopPropagation();sfTrackFromPoa(0,\''+String(task.jbLabel||'Storefront').replace(/[\\\'"<>]/g,'')+'\')">&#9201; Track in Storefronts</span>';
  if(task.jbAsin){
    var cleanA=String(task.jbAsin).replace(/[^0-9A-Za-z]/g,'');
    actionRow+='<span class="jb-asin" onclick="event.stopPropagation();navigator.clipboard.writeText(\''+cleanA+'\');showToast(\'ASIN copied &#10003;\')">'+String(task.jbAsin).replace(/</g,'&lt;')+' &#128203;</span>'
      +'<a class="jb-open" href="https://www.amazon.co.uk/dp/'+encodeURIComponent(task.jbAsin)+'" target="_blank" onclick="event.stopPropagation()">Open on Amazon &#8599;</a>';
  }
  if(actionRow) actionRow='<div class="jb-openrow">'+actionRow+'</div>';

  // The collapsed row already shows jbReason as its meta line. Repeating it verbatim
  // inside the open panel as "Jack's note" was pure duplication — and on a storefront
  // batch it isn't a note from Jack at all, it's how the thing works. Storefront batches
  // therefore carry `sbHow` instead, styled as instructions, and never double up.
  var reasonHtml = (task.jbReason && task.jbType!=='sf')
    ? '<div class="jb-reason"><span class="jb-reason-tag">'+JB_ICON_SVG+' Jack&rsquo;s note</span><span>'+String(task.jbReason).replace(/</g,'&lt;')+'</span></div>' : '';
  var hintHtml=task.hint?'<div class="task-hint">'+task.hint+'</div>':'';
  var fieldsHtml=buildFields(task,i,isExtra);
  var actHtml;
  if(task.done){ actHtml='<span style="color:var(--green);font-size:13px;font-weight:600;">&#10003; Completed &amp; locked</span>'; }
  else { actHtml='<button class="btn btn-success" onclick="markDone('+i+','+isExtra+')">&#10003; Mark Complete</button>'; }
  var skipTag=task.skipped?' <span style="color:var(--red);font-size:11px;">[SKIPPED]</span>':'';

  d.innerHTML=
    // same shape as every other task row — icon, title, one meta line — so the list reads
    // consistently; the From-Jack badges ride alongside the title instead of above it
    '<div class="task-header jbcard-head" onclick="toggleBody(\''+bodyId+'\')">'
    + '<div class="'+checkCls+'" onclick="event.stopPropagation();'+checkClick+'">'+checkTick+'</div>'
    + '<div class="task-icon jbcard-icon" style="--tc:'+m[2]+'">'+m[0]+'</div>'
    + '<div class="task-main jbcard-main">'
      + '<div class="task-name jbcard-title">'+title+skipTag
        + '<span class="jbcard-from" title="Sent by Jack">'+JB_ICON_SVG+'Jack</span>'
        + '<span class="jbcard-type">'+m[1]+'</span>'
        + (task.sbPriority==='High' ? '<span class="jbcard-pri" title="Jack marked this high priority — do it first">\u25B2 HIGH</span>' : '')
        + (task.sbOwn ? '<span class="jbcard-own" title="Your own storefront list">YOURS</span>' : '')
        + ((task.jbCarried&&!task.done)?'<span class="jbcard-carry'+(task.jbCarryDays>=3?' overdue':'')+'" title="Sent '+(task.jbAddedOn||'earlier')+' — still open">'+(task.jbCarryDays>=3?'&#9888; '+task.jbCarryDays+'d':'&#8635; '+(task.jbCarryDays?task.jbCarryDays+'d':'carried'))+'</span>':'')
        + ((task._reopenedAt&&!task.done)?'<span class="jbcard-reopen" title="You ticked this'+(task._reopenPrevTick?' at '+task._reopenPrevTick:'')+' — Jack then sent '+(task._reopenN||1)+' more into it. Your logged time and leads are kept; press Start to resume, tick again when the new bits are done.">&#10227; REOPENED '+task._reopenedAt+' &#183; Jack sent '+(task._reopenN||1)+' more</span>':'')
        + '</div>'
      + '<div class="'+metaCls+' task-sub"><span>'+meta+'</span></div>'
      /* This had it backwards: the +15m / +30m / leads strip appeared only AFTER she had
         already logged something, and before that she got a 21px dashed button that had to
         be tapped first. So the moment she needed the controls was the one moment they
         were hidden, behind the smallest target on the screen (measured: 21px tall).
         The strip is now simply there on any task that takes time or leads. */
      + ((taskIsTickOnly(task)||task.done||task.skipped) ? ''
          : quickLogHTML(task,i,isExtra))
    + '</div>'
    + openMini + timerHtml
    + ((task.done && task.tickedAt) ? '<div class="task-done-time">&#10003; '+task.tickedAt+'</div>' : '')
    + '<button class="task-expand-btn">&#9662;</button>'
    + '</div>'
    + zeroReasonHTML(task,i,isExtra)
    + '<div class="task-body" id="'+bodyId+'">'
      + reasonHtml + actionRow + hintHtml + fieldsHtml
      + '<div class="task-actions">'+actHtml+'</div>'
    + '</div>';
  return d;
}
// category icon + accent colour for a task row, matched on its id/name
function taskMeta(task){
  var s=((task.id||'')+' '+(task.name||'')).toLowerCase();
  function has(){ for(var k=0;k<arguments.length;k++){ if(s.indexOf(arguments[k])>=0) return true; } return false; }
  if(has('lead sheet','leadsheet')) return ['\u{1F4CB}','#9d8bff'];
  if(has('telegram')) return ['✈️','#38bdf8'];
  if(has('newsletter','email')) return ['\u{1F4F0}','#f5a524'];
  if(has('kpf','filter')) return ['\u{1F3AF}','#18c8f0'];
  if(has('sourcing','source','product finder','hunt')) return ['\u{1F50D}','#10d99a'];
  if(has('poa','missed')) return ['\u{1F4CC}','#ff6b83'];
  if(has('break')) return ['☕','#f5a524'];
  if(has('storefront')) return ['\u{1F3EC}','#9d8bff'];
  if(has('review','check')) return ['\u{1F441}️','#38bdf8'];
  if(has('a2a','arbitrage')) return ['\u{1F501}','#f5a524'];
  if(has('deal','watch','drop')) return ['\u{1F4C9}','#18c8f0'];
  if(has('eu ','eu sheet')) return ['\u{1F1EA}\u{1F1FA}','#4c8dff'];
  // NEVER a green tick here — it sits next to the real (empty) checkbox and reads as "already done"
  return ['\u{25CF}','#7c8598'];
}
function buildTaskEl(task, i, isExtra) {
  if(task.jbType) return buildJackTaskEl(task, i, isExtra);
  var d = document.createElement('div');
  var inProg = !task.done && !task.skipped && taskHasProgress(task);
  var cls = 'task-item';
  if (task.mandatory && !isExtra) cls += ' mandatory';
  if (task.done)    cls += ' done';
  else if (inProg)  cls += ' inprogress';
  if (task.skipped) cls += ' skipped';
  if (task.done && state._justDoneKey === (isExtra?'e':'t')+i) cls += ' just-done';
  d.className = cls;

  var bodyId    = 'body-' + (isExtra ? 'e':'t') + i;
  var checkCls  = task.done ? 'task-check done-check' : 'task-check';
  var checkTick = task.done ? '&#10003;' : '';
  var checkClick = task.done ? 'lockedClick()' : 'markDone('+i+','+isExtra+')';
  var openHint  = task.done ? '' : '<span class="task-open-hint">Open &#8250;</span>';
  var mandTag   = '';
  var skipTag   = task.skipped ? ' <span style="color:var(--red);font-size:11px;">[SKIPPED]</span>' : '';
  var hintHtml  = task.hint ? '<div class="task-hint">'+task.hint+'</div>' : '';

  // subtitle line: type when idle, logged summary when done, progress when in-progress
  var subIcon, subText;
  if (task.skipped) { subIcon = SUB_ICON_CHECK; subText = 'Skipped'+(task.skipReason?' &#183; '+task.skipReason:''); }
  else if (task.done) { subIcon = SUB_ICON_CHECK; var sm = taskLoggedSummary(task); subText = sm || 'Completed'; }
  else if (inProg) { subIcon = SUB_ICON_CLOCK; var pd = fmtDur(task.timeHrs,task.timeMins); subText = 'In progress' + (pd ? ' &#183; '+pd+' logged' : ' &#183; started'); }
  else { subText = taskTypeLabel(task);
         subIcon = subText ? (taskIsTickOnly(task) ? SUB_ICON_CHECK : SUB_ICON_LINK) : ''; }
  // anything that needs time + leads logged gets the controls here instead of a
  // sentence telling them to go and find the controls
  /* Ordinary task rows use THIS path (the From-Jack cards use the other one), and it had
     the same backwards logic: controls only after something was logged, otherwise a 21px
     dashed button to reveal them. The strip is now always on a row that needs time or
     leads; tick-only and finished rows keep their plain sub-line. */
  var subHtml = (taskIsTickOnly(task)||task.done||task.skipped)
        ? (subText ? '<div class="task-sub">'+subIcon+'<span>'+subText+'</span></div>' : '')
        : quickLogHTML(task,i,isExtra);

  var actHtml;
  if (task.done) {
    actHtml = '<span style="color:var(--green);font-size:13px;font-weight:600;">&#10003; Completed &amp; locked</span>';
  } else {
    actHtml = '<button class="btn btn-success" onclick="markDone('+i+','+isExtra+')">&#10003; Mark Complete</button>';
    if (isEuTask(task)) {
      actHtml += '<button class="btn btn-ghost eu-none" onclick="euNone('+i+','+isExtra+')" '
        +'title="Nothing to do on this one today \u2014 it reopens by itself if Jack sends EU sheets later">'
        +'\u2014 There aren\u2019t any today</button>';
    }
    if (task.mandatory && !isExtra) {
      actHtml += '<button class="btn btn-danger" onclick="openSkipModal('+i+')">Skip Task</button>';
    } else {
      actHtml += '<button class="btn btn-ghost" onclick="removeExtra('+i+')">Remove</button>';
    }
  }
  var skipBox = task.skipped ? '<div class="skip-reason-box">Reason: '+task.skipReason+'</div>' : '';
  var fieldsHtml = buildFields(task, i, isExtra);

  // category icon tile + at-a-glance status chip
  var tm = taskMeta(task);
  var iconTile = '<div class="task-icon" style="--tc:'+tm[1]+'">'+tm[0]+'</div>';
  var statusChip;
  if (task.done)        statusChip = '<span class="task-status done">&#10003; '+(task.tickedAt||'Done')+'</span>';
  else if (task.skipped)statusChip = '<span class="task-status skip">Skipped</span>';
  else if (inProg)      statusChip = '<span class="task-status prog">In progress</span>';
  /* "To do" appeared on every unticked row — which is all of them. It said nothing and
     cost a chip's worth of width on each. The states that DO differ (done, skipped, in
     progress) still show; "not started yet" is now simply the absence of a chip. */
  else                  statusChip = '';
  // carried-over one-off tasks show a rollover badge (escalates to red overdue at 3+ days)
  if (task.jbCarried && !task.done) statusChip = (typeof jb_carryBadge==='function'? jb_carryBadge(task.jbAddedOn):'') + statusChip;
  // Jack sent more into a card she had already ticked — the reopen badge explains
  // why her tick came off, and that nothing she logged was lost
  if (task._reopenedAt && !task.done) statusChip = '<span class="jbcard-reopen" title="You ticked this'+(task._reopenPrevTick?' at '+task._reopenPrevTick:'')+' — Jack then sent '+(task._reopenN||1)+' more into it. Your logged time and leads are kept; press Start to resume, tick again when the new bits are done.">&#10227; REOPENED '+task._reopenedAt+' &#183; Jack sent '+(task._reopenN||1)+' more</span>' + statusChip;
  /* Sourcing Period has a 30 min/day floor (Jack, 31/08: "they should be doing their
     own sourcing most of the time... 30 mins per day"). The chip shows live progress
     against it — amber until the floor is met, green from there. */
  if ((task.id==='sourcing'||task.id==='suz-sourcing') && !task.skipped) {
    var _srcSec=(typeof ttElapsedT==='function'?ttElapsedT(task):(task.timerSec||0));
    var _srcM=Math.max(Math.round(_srcSec/60),(parseInt(task.timeHrs)||0)*60+(parseInt(task.timeMins)||0));
    var _hit=_srcM>=30;
    statusChip = '<span class="src-floor'+(_hit?' hit':'')+'" title="Jack\'s minimum: 30 minutes of your own sourcing every day. Timer or typed time both count.">'+_srcM+'m / 30m day min'+(_hit?' \u2713':'')+'</span>' + statusChip;
  }

  // Jack-sent items: Start/Stop timer chip on the row + link/ASIN buttons in the body
  var timerHtml='';
  // timer on EVERY task that logs time, not just the From-Jack ones. Tick-only tasks
  // (confirm-and-move-on) still don't get one — there's no time to log.
  if (!task.skipped && (task.jbTimer || !taskIsTickOnly(task))) {
    if (task.done) { timerHtml = task.timerSec ? '<span class="tt-chip fin"><b>'+sfFmt(task.timerSec)+'</b></span>' : ''; }
    else timerHtml='<span class="tt-chip'+(task.timerRun?' run':'')+'" onclick="event.stopPropagation();ttToggle('+i+','+isExtra+')"><b id="tt-'+(isExtra?'e':'t')+i+'">'+sfFmt(ttElapsedT(task))+'</b><span>'+(task.timerRun?'&#9632; Stop':'&#9654; Start')+'</span></span>';
  }
  var jbExtra='';
  if (task.jbUrl)  jbExtra+='<a class="tt-open" href="'+String(task.jbUrl).replace(/"/g,'&quot;')+'" target="_blank" onclick="event.stopPropagation()">Open link &#8599;</a>';
  if (task.jbAsin) jbExtra+='<code class="tt-asin" onclick="event.stopPropagation();navigator.clipboard.writeText(\''+String(task.jbAsin).replace(/[^0-9A-Za-z]/g,'')+'\');showToast(\'ASIN copied ✓\')">'+String(task.jbAsin).replace(/</g,'&lt;')+'</code><a class="tt-open" href="https://www.amazon.co.uk/dp/'+encodeURIComponent(task.jbAsin)+'" target="_blank" onclick="event.stopPropagation()">Amazon &#8599;</a>';
  if (jbExtra) jbExtra='<div class="tt-extra">'+jbExtra+'</div>';

  d.innerHTML =
    '<div class="task-header" onclick="toggleBody(\''+bodyId+'\')">'
    + '<div class="'+checkCls+'" onclick="event.stopPropagation();'+checkClick+'">'+checkTick+'</div>'
    + iconTile
    + '<div class="task-main"><div class="task-name">'+task.name+skipTag
      // Routed From-Jack items are INVISIBLE until the task is opened — Jack looked at
      // Mera's 13 outstanding items, then at her task list, and reasonably concluded
      // they weren't there. If a host task is carrying his items, say so on the row.
      +((task.jbIids&&task.jbIids.length)?'<span class="jb-carry">📌 '+task.jbIids.length+' from Jack</span>':'')
      +'</div>'+subHtml+'</div>'
    + mandTag + timerHtml + statusChip
    + '<button class="task-expand-btn">&#9662;</button>'
    + '</div>'
    + zeroReasonHTML(task,i,isExtra)
    + '<div class="task-body" id="'+bodyId+'">'
    + jbExtra + hintHtml + fieldsHtml
    + '<div class="task-actions">'+actHtml+'</div>'
    + skipBox
    + '</div>';
  return d;
}

function buildFields(task, i, isExtra) {
  if (taskIsTickOnly(task)) {
    /* Mera, 15/09: "hello sir I cant see any Asin". Two or more ASINs become ONE group card,
       and the group is tick-only — but this branch returned before any list was drawn, and
       a group has jbIids not jbIid, so it fell through to the lead-sheet sentence. Every
       multi-ASIN send since the group went tick-only showed the VA nothing to check.
       Draw each ASIN with the same copy + Open on Amazon controls a single ASIN gets. */
    if (task.jbGroup && task.jbType==='asin') {
      var _names=task.linkNames||[];
      var _as=(task.jbAsins&&task.jbAsins.length) ? task.jbAsins
        : _names.map(function(n){ var m=String(n||'').toUpperCase().match(/\b[A-Z0-9]{10}\b/); return m?m[0]:''; });
      var _rows='';
      _as.forEach(function(a,k){
        var c=String(a||'').replace(/[^0-9A-Za-z]/g,'');
        if(!c) return;
        var why=String(_names[k]||'').split(' — ').slice(1).join(' — ');
        _rows+='<div class="jb-openrow">'
          +'<span class="jb-asin" onclick="event.stopPropagation();navigator.clipboard.writeText(\''+c+'\');showToast(\'ASIN copied &#10003;\')">'+c+' &#128203;</span>'
          +'<a class="jb-open" href="https://www.amazon.co.uk/dp/'+encodeURIComponent(c)+'" target="_blank" onclick="event.stopPropagation()">Open on Amazon &#8599;</a>'
          +(why?'<span class="task-hint" style="margin:0 0 0 6px">'+escHtml(why)+'</span>':'')
          +'</div>';
      });
      if(!_rows) _rows='<div class="tk-note" style="color:var(--amber)">Couldn’t read the ASINs on this card — message Jack and he’ll resend them.</div>';
      return _rows
        + '<div class="tk-note"><div class="field-label">Anything to tell Jack? (optional)</div>'
        + '<input class="field-input" type="text" placeholder="e.g. done, nothing worth adding" value="'+String(task.context||'').replace(/"/g,'&quot;')+'" oninput="updateField('+i+','+isExtra+',\'context\',this.value)"></div>';
    }
    // a From-Jack one-off with nothing to measure — give them a way to answer him back
    if (task.jbIid || task.jbOneoffIid) {
      return '<div class="tk-note"><div class="field-label">Anything to tell Jack? (optional)</div>'
        + '<input class="field-input" type="text" placeholder="e.g. done, nothing worth adding" value="'+String(task.context||'').replace(/"/g,'&quot;')+'" oninput="updateField('+i+','+isExtra+',\'context\',this.value)"></div>';
    }
    var msg = (task.id === 'ht-filters')
      ? '&#9203; High Ticket & A2A Filters coming soon. Jack will add these. Just tick off for now.'
      : (task.id === 'telegram-eod' || task.id === 'suz-telegram-eod')
      ? '&#10003; Quick Telegram check before finishing. There should be at least 2 leads added to your lead sheet from this. Tick off when done.'
      : '&#10003; ' + (task.id === 'leadsheet-eod' || task.id === 'suz-leadsheet-eod'
          ? 'Final lead sheet check — action any new comments Jack has left. Tick off when done.'
          : 'Check Jack\'s comments on the lead sheet and action everything. Tick off when done.');
    var bg  = task.id === 'ht-filters' ? 'rgba(255,184,48,0.06)' : 'rgba(155,143,255,0.08)';
    var bdr = task.id === 'ht-filters' ? 'rgba(255,184,48,0.2)'  : 'rgba(155,143,255,0.25)';
    var col = task.id === 'ht-filters' ? 'var(--amber)'           : 'var(--text)';
    return '<div style="margin-top:14px;padding:14px 16px;background:'+bg+';border:1px solid '+bdr+';border-radius:10px;font-size:12px;color:'+col+';">'+msg+'</div>';
  }

  /* ── STOREFRONT BATCH PANEL ────────────────────────────────────────────────
     Jack: "make these only start and stop before they mark as complete -- did they
     get keepa tracks in yes or no a dropdown -- then they get their leads somewhere
     -- remember a2a uk - a2a eu + take everything to oa -- quick speed speed speed".
     So: no manual time chips (the timer is the truth), one Keepa yes/no, and leads
     split the three ways he actually sells — A2A UK, A2A EU, OA. Everything on one
     row, every control a single tap. */
  if(task.sbBatchId && !taskIsTickOnly(task)){
    var bx=(isExtra?'e':'t')+i;
    var lc=(task.leads===''||task.leads==null)?0:(+task.leads||0);
    var elapsed=(typeof ttElapsedT==='function')?ttElapsedT(task):0;
    var running=!!task.timerRun;
    var kp=task.keepaTracks||'';
    return '<div class="bpanel">'
      +'<div class="bp-row">'
        +'<a class="bp-keepa" href="'+String(task.jbUrl||'#').replace(/"/g,'&quot;')+'" target="_blank">'
          +'\u{1F4C8} Open all in Keepa &#8599;</a>'
        +'<div class="bp-timer'+(running?' on':'')+'">'
          +'<span class="bp-el" id="bp-el-'+bx+'">'+sfFmt(elapsed)+'</span>'
          +'<button type="button" class="bp-t" onclick="ttToggle('+i+','+isExtra+')">'
            +(running?'&#9632; Stop':'&#9654; Start')+'</button>'
        +'</div>'
      +'</div>'
      +'<div class="bp-how">'+escHtml(sbHowText())+'</div>'
      +'<div class="bp-row2">'
        +'<div class="bp-kp"><em>Keepa tracks in?</em>'
          +'<button type="button" class="bp-yn'+(kp==='yes'?' yes':'')+'" onclick="sbBatchKeepa('+i+','+isExtra+',\'yes\')">Yes</button>'
          +'<button type="button" class="bp-yn'+(kp==='no'?' no':'')+'" onclick="sbBatchKeepa('+i+','+isExtra+',\'no\')">No</button>'
        +'</div>'
        +'<div class="bp-leads"><em>Leads found</em>'
          +'<button type="button" class="bl-b" onclick="sbBatchLead('+i+','+isExtra+',-1)">&minus;</button>'
          +'<b id="bl-n-'+bx+'">'+lc+'</b>'
          +'<button type="button" class="bl-b plus" onclick="sbBatchLead('+i+','+isExtra+',1)">+</button>'
        +'</div>'
      +'</div>'
    /* Measured over 25 real shifts: this box was filled on 11 of 492 tasks (2%). It cost
       every task row vertical space and collected almost nothing. Asked once at wrap-up
       instead \u2014 one question they will actually answer beats a box they never touch. */
      +'<button type="button" class="bp-done" onclick="markDone('+i+','+isExtra+')">&#10003; Mark Complete</button>'
    +'</div>';
  }
  var sfx=(isExtra?'e':'t')+i;
  // The row already carries the time chips, the Start/Stop timer (which fills Time
  // Spent by itself when stopped) and the leads stepper. Repeating all three here
  // gave THREE ways to type the same number, 200px apart. The panel now holds only
  // what the row can't: an exact figure if they want one, and the note.
  var loggedTxt = fmtDur(task.timeHrs,task.timeMins) || 'nothing yet';
  var fromTimer = task._timeFromTimer ? ' <i>from the timer</i>' : '';
  var lc = taskLeadCount(task);
  var leadTxt = (task.leads===''||task.leads==null) ? 'not set' : (lc+' lead'+(lc===1?'':'s'));
  var _hasTime=!!(task.timeHrs||task.timeMins);
  var _hasLeads=!(task.leads===''||task.leads==null)&&lc>0;
  var tf = '<div class="task-fields tf-slim">'
    + '<div class="tf-recap">'
      + '<span class="tf-r'+(_hasTime?' has':'')+'"><em>Time</em><b>'+loggedTxt+'</b>'+fromTimer+'</span>'
      + '<span class="tf-r'+(_hasLeads?' has':'')+'"><em>Leads</em><b>'+leadTxt+'</b></span>'
      + '<button type="button" class="tf-exact" onclick="tfExact(\'' + sfx + '\')">Set exact time</button>'
    + '</div>'
    + '<div class="tf-exactrow" id="tfx-'+sfx+'" style="display:none;">'
      + '<input class="field-input" id="th-'+sfx+'" type="number" placeholder="hrs" min="0" value="'+(task.timeHrs||'')+'" oninput="updateTimeField('+i+','+isExtra+',\'timeHrs\',this.value)">'
      + '<span>h</span>'
      + '<input class="field-input" id="tm-'+sfx+'" type="number" placeholder="min" min="0" max="59" value="'+(task.timeMins||'')+'" oninput="updateTimeField('+i+','+isExtra+',\'timeMins\',this.value)">'
      + '<span>m</span>'
      + '<button type="button" class="qt-chip" onclick="qtAdd('+i+','+isExtra+',120)">+2h</button>'
      + '<button type="button" class="qt-chip" onclick="qtAdd('+i+','+isExtra+',-15)">&#8722;15m</button>'
    + '</div>'
    + (task.hasLinks ? '' :
        '<input class="field-input tf-note" id="lf-'+sfx+'" type="hidden" value="'+(task.leads||'')+'">')
    /* per-task note removed \u2014 see the note above; one question at wrap-up instead */
    + '</div>';

  if (task.hasLinks) {
    var linkLabel = task.id === 'jack-poa' ? 'Links / Filters Jack Sent'
      : 'Links Used / Sources Found <span class="pf-hint">every row is labelled \u2014 blank ones are yours to fill</span>';
    var cId   = 'lc-'+i+'-'+(isExtra?'e':'t');
    var totId = 'lt-'+i+'-'+(isExtra?'e':'t');
    var lv = task.links     || ['','',''];
    var ll = task.linkLeads || [0,0,0];
    var linkRows = '';
    var lnames = task.linkNames || [];
    for (var li = 0; li < lv.length; li++) {
      // a link that came from a saved filter gets its name + a one-click Open
      if(lnames[li]){
        var _lset=(ll[li]!==''&&ll[li]!=null&&ll[li]!==undefined);
        var _run=!!(task.linkRun&&task.linkRun[li]);
        var _secs=(task.linkSecs&&task.linkSecs[li])||0;
        linkRows += '<div class="pf-link'+(_lset?' pf-logged':'')+(_run?' pf-running':'')+'" id="pfr-'+sfx+'-'+li+'">'
          + '<span class="pf-n">'+(li+1)+'</span>'
          /* Jack, on this exact panel: "where has this come from — is this a storefront?"
             A named row is something HE sent; an empty slot is hers to fill. Neither said
             so, and both sat in the same list under one heading. They do now.
             (linkFilterIds marks the ones that came from a saved filter rather than a
             one-off From-Jack item, so the two are told apart properly.) */
          + '<span class="pf-name" title="'+String(lnames[li]).replace(/"/g,'&quot;')+'">'+lnames[li]
            + '<em class="pf-src">'
            + (((task.linkFilterIds||[])[li]) ? 'saved filter' : 'from Jack')
            + '</em></span>'
          + (lv[li]?'<a class="pf-open" href="'+String(lv[li]).replace(/"/g,'&quot;')+'" target="_blank" onclick="event.stopPropagation();pfTimerStart('+i+','+isExtra+','+li+')">Open &#8599;</a>':'')
          // per-link Start/Stop — Jack: "start stop should be each one". One running at a
          // time per task; starting link B banks link A's time automatically.
          + '<button type="button" class="pf-timer'+(_run?' run':'')+'" id="pft-'+sfx+'-'+li+'"'
            +' onclick="event.stopPropagation();pfTimerToggle('+i+','+isExtra+','+li+')">'
            +(_run?'&#9632; ':'&#9654; ')+pfFmtSecs(_secs)+'</button>'
          // one tap per lead instead of click-select-type-tab, so per-link data actually gets filled in
          + '<span class="pf-step">'
            + '<button type="button" title="Down (tap once for zero)" onclick="event.stopPropagation();pfStep('+i+','+isExtra+','+li+',-1)">&#8722;</button>'
            + '<span class="pf-n-val'+(_lset?' set':'')+'" id="pfv-'+sfx+'-'+li+'">'+(_lset?ll[li]:'&#8211;')+'</span>'
            + '<button type="button" class="plus" title="Up" onclick="event.stopPropagation();pfStep('+i+','+isExtra+','+li+',1)">+</button>'
          + '</span>'
          + '</div>';
        continue;
      }
      linkRows += '<div class="pf-own" style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
        + '<span style="font-size:10px;color:var(--muted);min-width:18px;text-align:right;font-family:var(--font-mono);">'+(li+1)+'</span>'
        + (lv[li]?'<em class="pf-src own" title="You pasted this one in \u2014 it did not come from Jack">yours</em>':'')
        + '<input class="field-input" type="text" placeholder="Paste link here..." value="'+(lv[li]||'')+'" style="flex:1;" data-ti="'+i+'" data-li="'+li+'" data-ie="'+(isExtra?1:0)+'" oninput="handleLinkInput(this)">'
        + '<input class="field-input" type="number" placeholder="0" min="0" value="'+(ll[li]||'')+'" style="width:60px;flex-shrink:0;text-align:center;" data-ti="'+i+'" data-li="'+li+'" data-ie="'+(isExtra?1:0)+'" data-tot="'+totId+'" oninput="handleLeadInput(this)">'
        + '</div>';
    }
    var _named=lnames.filter(function(n){return !!n;}).length;
    var _logged=0;
    for(var _z=0;_z<lv.length;_z++){ if(lnames[_z]&&ll[_z]!==''&&ll[_z]!=null&&ll[_z]!==undefined) _logged++; }
    /* Was a bare uppercase label over a stack of near-identical boxes, so a VA could not
       tell at a glance what was hers to do, what she had already done, or what was left.
       Now: one line that states the job and how far through she is, with the count going
       green only when every named source has a number against it. */
    tf += '<div class="pf-wrap">'
      + '<div class="pf-head">'
        + '<span class="pf-h-t">'+linkLabel+'</span>'
        + (_named
            ? '<span class="pf-prog'+(_logged>=_named?' all':'')+'" id="pfp-'+sfx+'">'
              +(_logged>=_named?'\u2713 all '+_named+' logged':_logged+' of '+_named+' logged')+'</span>'
            : '<span class="pf-h-s">paste a link, tap the leads it gave you</span>')
      + '</div>'
      + '<div id="'+cId+'" class="pf-rows">'+linkRows+'</div>'
      + '<button class="pf-add" data-cid="'+cId+'" data-ti="'+i+'" data-ie="'+(isExtra?1:0)+'" data-tot="'+totId+'" onclick="handleAddLink(this)">+ Add another link</button>'
      + '</div>';
  }
  return tf;
}

/* precise time is a rare need — it stays folded away until asked for */
function tfExact(sfx){
  var r=document.getElementById('tfx-'+sfx); if(!r) return;
  var open=r.style.display!=='none';
  r.style.display=open?'none':'flex';
  if(!open){ var h=document.getElementById('th-'+sfx); if(h) h.focus(); }
}
/* Jack, running through the KPF links: "when clicking it shouldn't auto close it —
   keep the section open, I wanna run through the links". Whether a card was expanded
   lived ONLY in the DOM, and every link ▶/Open click calls renderTasks(), which
   rebuilds the DOM — so the card he was working inside collapsed on every single
   click. Snapshot which bodies are open before each render and re-open them after. */
(function(){
  function wrap(){
    if(typeof window.renderTasks!=='function'){ return setTimeout(wrap,400); }
    var _rt=window.renderTasks;
    if(_rt._keepsOpen) return;
    window.renderTasks=function(){
      var open=[];
      try{ document.querySelectorAll('.task-body.open').forEach(function(el){ if(el.id) open.push(el.id); }); }catch(e){}
      var r=_rt.apply(this,arguments);
      try{ open.forEach(function(id){
        var el=document.getElementById(id);
        if(el&&!el.classList.contains('open')){
          el.classList.add('open');
          var h=el.previousElementSibling;
          if(h&&h.classList.contains('task-header')) h.classList.add('open-head');
        }
      }); }catch(e){}
      return r;
    };
    window.renderTasks._keepsOpen=true;
  }
  wrap();
})();
function toggleBody(id) { var el=document.getElementById(id); if(!el) return; el.classList.toggle('open'); var h=el.previousElementSibling; if(h&&h.classList.contains('task-header')) h.classList.toggle('open-head', el.classList.contains('open')); }
function lockedClick() { showToast('Task locked once completed. Contact Jack to amend.', true); }

function updateField(i, isExtra, field, val) {
  var arr = isExtra ? state.extraTasks : state.tasks;
  if (arr[i]) arr[i][field] = val;
  qlSync(i, isExtra, true);
}
/* ── inline quick-log ────────────────────────────────────────────────────────
   Logging used to cost 3+ clicks per task (expand → type hours → type leads).
   The row's subtitle was dead instruction text, so it now carries the controls
   instead: same row height, zero expanding. */
var QL_OPEN={};   /* task ids the VA has manually opened — NOT on the task object,
                     which renderTasks rebuilds */
function qlNeeds(t){
  if(!t || t.done || t.skipped || taskIsTickOnly(t)) return false;
  // only once it is in play — started, timing, already logged, or opened by hand
  return !!(t.timerRun || t.timerSec || taskHasProgress(t) || QL_OPEN[t.id]);
}
function qlReveal(i,isExtra){
  var t=isExtra?state.extraTasks[i]:state.tasks[i]; if(!t) return;
  QL_OPEN[t.id]=1; renderTasks();
}
function quickLogHTML(task,i,isExtra){
  var sfx=(isExtra?'e':'t')+i, st='event.stopPropagation();';
  /* Storefront batches log through their own panel — timer, Keepa yes/no and the
     three-way lead split. Showing the generic chips here as well would be a second,
     conflicting way to enter the same numbers. */
  if(task.sbBatchId){
    var tot=(task.leads===''||task.leads==null)?0:(+task.leads||0);
    var el=(typeof ttElapsedT==='function')?ttElapsedT(task):0;
    return '<div class="ql'+(tot||el?' has':'')+'" id="ql-'+sfx+'" onclick="event.stopPropagation()">'
      +'<span class="ql-lab">Time</span><span class="ql-val" id="qlt-'+sfx+'">'
        +(el?fmtSecs(el):(fmtDur(task.timeHrs,task.timeMins)||'not started'))+'</span>'
      +'<span class="ql-sep"></span><span class="ql-lab">Leads</span>'
      +'<span class="ql-auto'+(tot?'':' zero')+'" id="qll-'+sfx+'">'+tot+'</span>'

      +(task.keepaTracks?'<span class="ql-kp '+task.keepaTracks+'">keepa '+task.keepaTracks+'</span>':'')
      +'<button type="button" class="ql-chip" onclick="'+st+'qlReveal('+i+','+isExtra+')">Open &#8250;</button>'
    +'</div>';
  }
  var h='<div class="ql'+(taskHasProgress(task)?' has':'')+'" id="ql-'+sfx+'" onclick="event.stopPropagation()">'
    + '<span class="ql-lab">Time</span>'
    + [15,30,60].map(function(m){
        return '<button type="button" class="ql-chip" title="Add '+(m<60?m+' minutes':'1 hour')+'" onclick="'+st+'qtAdd('+i+','+isExtra+','+m+')">+'+(m<60?m+'m':'1h')+'</button>';
      }).join('')
    + '<span class="ql-val" id="qlt-'+sfx+'">'+(fmtDur(task.timeHrs,task.timeMins)||'0m')+'</span>'
    + '<span class="ql-sep"></span><span class="ql-lab">Leads</span>';
  if(task.hasLinks){
    // per-link counts live in the panel — show the running total and one tap to get there
    h+='<span class="ql-auto'+(taskLeadCount(task)?'':' zero')+'" id="qll-'+sfx+'">'+taskLeadCount(task)+'</span>'
      +'<button type="button" class="ql-chip" onclick="'+st+'qlOpen(\''+sfx+'\')">'
        +((task.links&&task.links.length)?task.links.length+' link'+(task.links.length===1?'':'s'):'Links')+' &#8250;</button>';
  } else {
    var set=!(task.leads===''||task.leads===null||task.leads===undefined);
    h+='<span class="ql-step">'
      +'<button type="button" title="Down (tap once for zero)" onclick="'+st+'ldStep('+i+','+isExtra+',-1)">&#8722;</button>'
      +'<span class="ql-n'+(set?' set':'')+'" id="qll-'+sfx+'">'+(set?task.leads:'&#8211;')+'</span>'
      +'<button type="button" class="plus" title="Up" onclick="'+st+'ldStep('+i+','+isExtra+',1)">+</button>'
      +'</span>';
  }
  return h+'</div>';
}
/* ── per-link timers — "start stop should be each one" ──────────────────────
   One per link row, one running at a time per task: starting link B banks link A's
   elapsed time first (nobody works two filters at once, and forgetting to stop is
   the normal case, not the exception). Opening a link starts its timer too. Time
   accumulates in t.linkSecs[li]; the TASK timer keeps running independently. */
function pfFmtSecs(s){
  s=Math.max(0,Math.round(+s||0));
  if(s<60) return s+'s';
  var m=Math.floor(s/60);
  return m>=60 ? Math.floor(m/60)+'h '+(m%60)+'m' : m+'m';
}
function pfTimerToggle(i,isExtra,li){
  var arr=isExtra?state.extraTasks:state.tasks, t=arr[i]; if(!t||t.done) return;
  t.linkRun=t.linkRun||[]; t.linkSecs=t.linkSecs||[];
  if(t.linkRun[li]) pfTimerStop(t,li);
  else pfTimerStart(i,isExtra,li);
  renderTasks(); try{ saveShiftDraft(false); }catch(e){}
}
function pfTimerStart(i,isExtra,li){
  var arr=isExtra?state.extraTasks:state.tasks, t=arr[i]; if(!t||t.done) return;
  t.linkRun=t.linkRun||[]; t.linkSecs=t.linkSecs||[];
  if(t.linkRun[li]) return;                      // already running (e.g. Open clicked twice)
  for(var z=0;z<t.linkRun.length;z++) if(t.linkRun[z]) pfTimerStop(t,z);   // bank the other one
  t.linkRun[li]=Date.now();
  try{ ttEnsureRunning(i,isExtra); }catch(e){}   // the task timer captures the total
  renderTasks(); try{ saveShiftDraft(false); }catch(e){}
}
function pfTimerStop(t,li){
  if(!t.linkRun||!t.linkRun[li]) return;
  var add=Math.round((Date.now()-t.linkRun[li])/1000);
  t.linkSecs=t.linkSecs||[];
  t.linkSecs[li]=(+t.linkSecs[li]||0)+Math.max(0,add);
  t.linkRun[li]=null;
}
/* live tick for whichever link timer is running */
setInterval(function(){
  try{
    [['t',state.tasks],['e',state.extraTasks]].forEach(function(pair){
      (pair[1]||[]).forEach(function(t,i){
        if(!t||!t.linkRun) return;
        t.linkRun.forEach(function(st,li){
          if(!st) return;
          var el=document.getElementById('pft-'+pair[0]+i+'-'+li);
          if(el) el.innerHTML='&#9632; '+pfFmtSecs((((t.linkSecs||[])[li])||0)+Math.round((Date.now()-st)/1000));
        });
      });
    });
  }catch(e){}
},1000);
/* per-link leads stepper — one tap. This is the ONLY route to knowing which
   individual storefront or filter actually produced anything. */
function pfStep(i,isExtra,li,d){
  var arr=isExtra?state.extraTasks:state.tasks, t=arr[i]; if(!t||t.done) return;
  taskLinksEnsure(t,li);
  var cur=parseInt(t.linkLeads[li])||0;
  t.linkLeads[li]=String(Math.max(0,cur+d));
  t.leads=t.linkLeads.reduce(function(a,b){return a+(parseInt(b)||0);},0);
  var sfx=(isExtra?'e':'t')+i, el;
  if((el=document.getElementById('pfv-'+sfx+'-'+li))){ el.textContent=t.linkLeads[li]; el.classList.add('set'); }
  if((el=document.getElementById('pfr-'+sfx+'-'+li))) el.classList.add('pf-logged');
  if((el=document.getElementById('lt-'+i+'-'+(isExtra?'e':'t')))) el.textContent=t.leads;
  // "3 of 11 logged" — so they can see how far through the list they are
  var names=t.linkNames||[], named=0, logged=0;
  for(var z=0;z<names.length;z++){ if(names[z]){ named++; if(t.linkLeads[z]!==''&&t.linkLeads[z]!=null) logged++; } }
  if((el=document.getElementById('pfp-'+sfx))){ el.textContent=logged+' of '+named+' logged'; el.classList.toggle('all',logged>=named); }
  qlSync(i,isExtra,true);
}
/* opening a link from a task starts that task's timer if it isn't already running —
   real elapsed time, captured for free, instead of a rounded guess at the end */
function ttEnsureRunning(i,isExtra){
  try{
    var t=isExtra?state.extraTasks[i]:state.tasks[i];
    if(!t||t.done||t.skipped||t.timerRun) return;
    if((parseInt(t.timeHrs)||0)||(parseInt(t.timeMins)||0)) return;   // they've already typed their own figure
    ttToggle(i,isExtra);
    showToast('⏱ Timer started for this task');
  }catch(e){}
}
/* one tap to say WHY a run found nothing. 63% of Telegram runs and 47% of EU-sheet runs
   come back zero — without a reason those are just holes in the data. */
var ZERO_REASONS=['Nothing new','All too pricey','Already had them','Ran out of time','Site/tool down'];
function zrSet(i,isExtra,n){
  var arr=isExtra?state.extraTasks:state.tasks, t=arr[i]; if(!t) return;
  t.zeroReason=ZERO_REASONS[n]||'';
  renderTasks();
  try{ saveShiftDraft(false); }catch(e){}
  try{ db_pushLiveStatus(); }catch(e){}
  showToast('Noted &#8212; thanks, that helps Jack &#10003;');
}
function zeroReasonHTML(task,i,isExtra){
  if(!task.done||taskIsTickOnly(task)) return '';
  if(taskLeadCount(task)!==0) return '';
  if(task.leads===''||task.leads==null) return '';
  if(task.zeroReason) return '<div class="zr zr-done">\u{1F4AC} No leads &#183; <b>'+escHtml(task.zeroReason)+'</b></div>';
  return '<div class="zr"><span class="zr-q">No leads &#8212; why?</span>'
    + ZERO_REASONS.map(function(r,n){ return '<button type="button" class="zr-b" onclick="event.stopPropagation();zrSet('+i+','+isExtra+','+n+')">'+r+'</button>'; }).join('')
    + '</div>';
}
function qlOpen(sfx){ var el=document.getElementById('body-'+sfx); if(el&&!el.classList.contains('open')) toggleBody('body-'+sfx); }
function qlFlash(sfx){ var el=document.getElementById('ql-'+sfx); if(!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
// keep the row strip, the expanded inputs and the shift bar in step — without a
// re-render, which would slam any open panel shut mid-edit
function qlSync(i,isExtra,skipInputs){
  var arr=isExtra?state.extraTasks:state.tasks, t=arr[i]; if(!t) return;
  var sfx=(isExtra?'e':'t')+i, el;
  if(!skipInputs){   // skipped when the change CAME from those inputs, so typing isn't fought
    if((el=document.getElementById('th-'+sfx))) el.value=t.timeHrs||'';
    if((el=document.getElementById('tm-'+sfx))) el.value=t.timeMins||'';
    if((el=document.getElementById('lf-'+sfx))) el.value=(t.leads===''||t.leads==null)?'':t.leads;
  }
  if((el=document.getElementById('qlt-'+sfx))) el.textContent=fmtDur(t.timeHrs,t.timeMins)||'0m';
  if((el=document.getElementById('qll-'+sfx))){
    if(t.hasLinks){ el.textContent=taskLeadCount(t); el.classList.toggle('zero',!taskLeadCount(t)); }
    else { var set=!(t.leads===''||t.leads==null); el.innerHTML=set?t.leads:'&#8211;'; el.classList.toggle('set',set); }
  }
  if((el=document.getElementById('ql-'+sfx))) el.classList.toggle('has',taskHasProgress(t));
  var body=document.getElementById('body-'+sfx), item=body&&body.parentNode;
  if(item&&item.classList&&item.classList.contains('task-item')&&!t.done&&!t.skipped) item.classList.toggle('inprogress',taskHasProgress(t));
  updateStats(); try{renderShiftBar();}catch(e){} try{saveShiftDraft(false);}catch(e){}
}
// one-tap time chips: +15m/+30m/+1h/+2h onto the task's logged time (updates inputs in place, no re-render)
function qtAdd(i,isExtra,mins){
  var arr=isExtra?state.extraTasks:state.tasks; var t=arr[i]; if(!t||t.done) return;
  var tot=Math.max(0,(parseInt(t.timeHrs)||0)*60+(parseInt(t.timeMins)||0)+mins);
  t.timeHrs=Math.floor(tot/60); t.timeMins=tot%60;
  t.time=(t.timeHrs>0?t.timeHrs+'h ':'')+(t.timeMins>0?t.timeMins+'m':(t.timeHrs?'':'0m'));
  qlSync(i,isExtra);
}
// leads − / + stepper (never below 0). One tap on − from blank commits an honest zero.
function ldStep(i,isExtra,d){
  var arr=isExtra?state.extraTasks:state.tasks; var t=arr[i]; if(!t||t.done) return;
  t.leads=String(Math.max(0,(parseInt(t.leads)||0)+d));
  qlSync(i,isExtra);
}
/* `parseInt(val) || 0` let "-5" straight through: -5 is truthy, so the guard never
   fired. The row then DISPLAYED "0m" (the formatter only prints h>0 / m>0) while
   -5 sat in the record — stored wrong, shown right, which is the worst pairing.
   "999" was accepted too. min/max on a number input do nothing while typing. */
function updateTimeField(i, isExtra, field, val) {
  var arr = isExtra ? state.extraTasks : state.tasks;
  if (!arr[i]) return;
  var n = parseInt(val); if (!isFinite(n)) n = 0;
  arr[i][field] = Math.max(0, Math.min(field === 'timeMins' ? 59 : 24, n));
  var h = parseInt(arr[i].timeHrs) || 0;
  var m = parseInt(arr[i].timeMins) || 0;
  arr[i].time = (h > 0 ? h + 'h ' : '') + (m > 0 ? m + 'm' : '') || '0m';
  qlSync(i, isExtra, true);
}

function markDone(i, isExtra) {
  var arr  = isExtra ? state.extraTasks : state.tasks;
  var task = arr[i];
  if (!task) return;
  if (state.submitted) { lockedClick(); return; }
  if (task.done) { lockedClick(); return; }
  var tickOnly = taskIsTickOnly(task);
  if (tickOnly) {
    task.done = true; task.skipped = false;
    task.tickedAt = new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false});
    state._justDoneKey=(isExtra?'e':'t')+i; renderTasks(); setTimeout(function(){state._justDoneKey=null;},500);
    showToast('Task marked complete &#10003;');
    jb_taskTicked(task); discord_task_notify(task); db_pushLiveStatus(); saveShiftDraft(false);
    return;
  }
  // the controls are on the row now, so point at them rather than forcing the panel open
  var sfxD = (isExtra?'e':'t')+i;
  /* A batch's time IS its timer — the row has no +15m chips, so demanding them made Done
     impossible. Pressing Done banks whatever the timer holds (stopping it if running),
     exactly like stopping it by hand would. No timer ever started → she is told to Start,
     not sent hunting for chips that are not there. */
  var _stoppedTimer=false;
  if (task.sbBatchId) {
    var bankSec = (typeof ttElapsedT==='function') ? ttElapsedT(task) : (task.timerSec||0);
    if (task.timerRun) { task.timerRun=false; task.timerStart=null; task.timerSec=bankSec; _stoppedTimer=true; }
    if (!task.timeHrs && !task.timeMins && bankSec>0) {
      var bm=Math.max(1,Math.round(bankSec/60));
      task.timeHrs=Math.floor(bm/60); task.timeMins=bm%60;
      task.time=fmtDur(task.timeHrs,task.timeMins); task._timeFromTimer=true;
    }
    if (!task.timeHrs && !task.timeMins) {
      showToast('Press &#9654; Start and work the batch first &#8212; the timer is the time log', true); return;
    }
  } else {
    /* "Faster logging" \u2014 they time the task, then Done refused because the timer was
       still running and no chips had been tapped. Done now banks whatever the timer holds,
       exactly as stopping it by hand would. Only asks for chips if no timer ever ran. */
    if (task.timerRun || task.timerSec) {
      var _sec=(typeof ttElapsedT==='function')?ttElapsedT(task):(task.timerSec||0);
      if (task.timerRun){ task.timerRun=false; task.timerStart=null; task.timerSec=_sec; _stoppedTimer=true; }
      if (!task.timeHrs && !task.timeMins && _sec>0){
        var _m=Math.max(1,Math.round(_sec/60));
        task.timeHrs=Math.floor(_m/60); task.timeMins=_m%60;
        task.time=fmtDur(task.timeHrs,task.timeMins); task._timeFromTimer=true;
      }
    }
    if (!task.timeHrs && !task.timeMins) {
      qlFlash(sfxD);
      showToast('Log the time first &#8212; press &#9654; Start, or tap +15m / +30m / +1h', true); return;
    }
  }
  /* Jack: "should be able to press Done if I find 0 leads — sometimes I find 0 leads".
     The batch row's counter literally displays 0 before anyone touches it, so on a
     batch, Done blocking with "set leads" is the app refusing the number it is showing
     him. On batches the visible 0 IS the answer. Ordinary shift tasks keep the
     explicit-tap rule — their quick-log shows a dash until tapped, so blank and zero
     genuinely differ there. */
  if (task.sbBatchId && (task.leads===''||task.leads===null||task.leads===undefined)) task.leads=0;
  if (task.leads === '' || task.leads === null || task.leads === undefined) {
    /* Done banked and stopped the timer above, then this guard returned without a
       repaint — so the row carried on LOOKING like it was timing ("pressing done
       should stop the timer too haha"). Show the stop before pointing at the leads. */
    if(_stoppedTimer){ try{ renderTasks(); }catch(e){} }
    qlFlash(sfxD);
    showToast('Set leads found &#8212; tap + on the row (or &#8722; once for zero)', true); return;
  }
  // bank any link timer still running — forgetting to stop is the normal case
  try{ (task.linkRun||[]).forEach(function(st,z){ if(st) pfTimerStop(task,z); }); }catch(e){}
  task.done = true; task.skipped = false;
  task.tickedAt = new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:false});
  state._justDoneKey=(isExtra?'e':'t')+i; renderTasks(); setTimeout(function(){state._justDoneKey=null;},500);
  showToast('Task marked complete &#10003;');
  // jb_taskTicked was ONLY on the tick-only path above — but every From-Jack item and
  // one-off task takes THIS path, so none of them were ever marked done in the rolling
  // cloud bucket. That's why they kept coming back the next day as "carried / overdue".
  if(task.sbBatchId){
    try{
      var _b=(SB_BATCHES||[]).find(function(x){ return x.id===task.sbBatchId; });
      if(_b && sbIsShared(_b)){
        var last=sbMarkDoneBy(task.sbBatchId, state.currentVA);
        if(last){ sbComplete(task.sbBatchId); }          // everyone's in — close it
        else {
          var left=sbWaitingOn(_b).map(vaDisp).join(' and ');
          showToast('Your pass is logged \u2014 still waiting on '+left);
        }
      } else { sbComplete(task.sbBatchId); }
    }catch(e){}
  }
  jb_taskTicked(task); sfltPoaTicked(task); sfltPoaLinksTicked(task); discord_task_notify(task); db_pushLiveStatus(); saveShiftDraft(false);
}

// A rolling From-Jack task was ticked → mark it done in the open bucket so it stops rolling over.
// Only writes for a real live VA shift (never during a Test/preview, to protect the real cloud bucket).
function jb_taskTicked(task){
  try{
    if(!task||(!task.jbIid&&!task.jbOneoffIid&&!task.jbGroup)) return;   // bundles carry jbIids instead
    var va=state.currentVA;
    if((va!=='Mera'&&va!=='Suz')||state._previewAs) return;
    var results={
      leads:(task.leads===''||task.leads===null||task.leads===undefined)?null:(parseInt(task.leads)||0),
      mins:((parseInt(task.timeHrs)||0)*60+(parseInt(task.timeMins)||0))||null,
      sec:Math.round(task.timerSec||0)||null,
      note:(task.context||'').trim()||null
    };
    if(task.jbGroup && task.jbIids && task.jbIids.length){
      var mins=results.mins, per=mins?Math.round(mins/task.jbIids.length):null;
      task.jbIids.forEach(function(iid,n){
        var ld=parseInt((task.linkLeads||[])[n]);
        jb_markDoneItem(va,iid,false,{ leads:isNaN(ld)?null:ld, mins:per, sec:null,
          note:(task.context||'').trim()||null });
      });
    }
    if(task.jbIid) jb_markDoneItem(va,task.jbIid,false,results);
    if(task.jbOneoffIid) jb_markDoneItem(va,task.jbOneoffIid,true,results);
    // Jack-sent storefronts count toward the storefront league too
    if(task.jbGroup && task.jbType==='sf' && typeof db_insert==='function'){
      (task.jbIids||[]).forEach(function(iid,n){
        var ld=parseInt((task.linkLeads||[])[n])||0;
        var nm=String((task.linkNames||[])[n]||'Storefront').split(' — ')[0];
        if(!ld) return;
        db_insert('storefront_sessions',{ va:va, name:nm.slice(0,120), date:ukDateShort(),
          seconds:0, leads:ld, source:'jack' }).catch(function(){});
      });
    }
    if(task.jbType==='sf' && !task.jbGroup && typeof db_insert==='function'){
      var secs=results.sec||((results.mins||0)*60);
      if((results.leads||0)>0 || secs>0){
        db_insert('storefront_sessions',{ va:va, name:String(task.jbLabel||'Storefront').slice(0,120), date:ukDateShort(),
          seconds:Math.round(secs), leads:results.leads||0, source:'jack' }).catch(function(){});
      }
    }
  }catch(e){}
}
function removeExtra(i) { state.extraTasks.splice(i,1); renderTasks(); }
function addExtraTask() {
  var m=document.getElementById('addtask-modal'); if(!m) return;
  var i=document.getElementById('addtask-name'); if(i) i.value='';
  m.classList.add('open');
  setTimeout(function(){ if(i) i.focus(); },60);
}
function closeAddTask(){ var m=document.getElementById('addtask-modal'); if(m) m.classList.remove('open'); }
function confirmAddTask(){
  var i=document.getElementById('addtask-name');
  var name=i?i.value.trim():'';
  if(!name){ showToast('Type a task name first', true); return; }
  state.extraTasks.push({id:'e'+Date.now(),name:name,mandatory:false,hint:'',hasLinks:false,done:false,skipped:false,skipReason:'',time:'',timeHrs:0,timeMins:0,leads:'',context:'',links:[]});
  renderTasks(); closeAddTask(); showToast('Task added \u2713');
  saveShiftDraft(false);
}
// ── STOREFRONT TRACKER ───────────────────────────────────
function sfFmt(sec){ sec=Math.max(0,Math.round(sec)); var h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60; return (h>0?h+':':'')+('0'+m).slice(-2)+':'+('0'+s).slice(-2); }
function sfElapsed(sf){ var e=sf.seconds||0; if(sf.running&&sf.startAt) e+=(Date.now()-sf.startAt)/1000; return e; }
function sfAdd(){ state.storefronts=state.storefronts||[]; state.storefronts.push({id:'sf'+Date.now(),name:'',seconds:0,running:false,startAt:null,leads:''}); renderStorefronts(); saveShiftDraft(false); setTimeout(function(){var els=document.querySelectorAll('.sf-name');if(els.length)els[els.length-1].focus();},50); }
function sfRemove(id){ state.storefronts=(state.storefronts||[]).filter(function(s){return s.id!==id;}); renderStorefronts(); saveShiftDraft(false); }
function sfSetName(id,v){ var sf=(state.storefronts||[]).find(function(s){return s.id===id;}); if(sf){ sf.name=v; saveShiftDraft(false); } }
function sfSetLeads(id,v){ var sf=(state.storefronts||[]).find(function(s){return s.id===id;}); if(sf){ sf.leads=v.replace(/[^0-9]/g,''); renderStorefronts(); saveShiftDraft(false); } }
function sfToggle(id){
  var sf=(state.storefronts||[]).find(function(s){return s.id===id;}); if(!sf) return;
  if(sf.running){ sf.seconds=sfElapsed(sf); sf.running=false; sf.startAt=null; }
  else { sf.running=true; sf.startAt=Date.now(); if(!window._sfTick){ window._sfTick=setInterval(sfTickRunning,1000); } }
  renderStorefronts(); saveShiftDraft(false);
}
function sfTickRunning(){
  var any=false;
  (state.storefronts||[]).forEach(function(sf){ if(sf.running){ any=true; var el=document.querySelector('.sf-timer[data-id="'+sf.id+'"]'); if(el) el.textContent=sfFmt(sfElapsed(sf)); var lph=document.querySelector('.sf-lph[data-id="'+sf.id+'"]'); if(lph){ var h=sfElapsed(sf)/3600, n=parseInt(sf.leads)||0; lph.textContent=(h>0.01&&n>0)?(n/h).toFixed(1)+' /hr':'— /hr'; } } });
  if(!any && window._sfTick){ clearInterval(window._sfTick); window._sfTick=null; }
}
function renderStorefronts(){
  var host=document.getElementById('storefront-list'); if(!host) return;
  var list=state.storefronts||[];
  /* Jack, pointing at this exact box under a card of 7 real batches: "fuck is this".
     It's the old self-logging module from before batches existed. While real batches
     are on the shift and she hasn't logged anything in here, it is pure noise. It
     comes back the moment the batches are gone or it holds her own entries. */
  try{
    var sec=document.getElementById('storefront-section');
    if(sec){
      var hasBatches=(state.tasks||[]).some(function(t){ return t.sbBatchId && !t.done && !t.skipped; });
      sec.style.display=(hasBatches && !list.length)?'none':'';
    }
  }catch(e){}
  if(!list.length){ host.innerHTML='<div class="sf-empty">No storefronts yet. Hit &ldquo;Add storefront&rdquo; when you start scanning one.</div>'; return; }
  host.innerHTML=list.map(function(sf){
    var el=sfElapsed(sf), h=el/3600, n=parseInt(sf.leads)||0, lph=(h>0.01&&n>0)?(n/h).toFixed(1)+' /hr':'— /hr';
    return '<div class="sf-row'+(sf.running?' live':'')+'">'
      +'<div class="sf-ico">&#127978;</div>'
      +'<input class="sf-name" value="'+String(sf.name||'').replace(/"/g,'&quot;')+'" placeholder="Storefront name / URL" oninput="sfSetName(\''+sf.id+'\',this.value)">'
      +'<div class="sf-timechip" onclick="sfToggle(\''+sf.id+'\')"><b class="sf-timer" data-id="'+sf.id+'">'+sfFmt(el)+'</b><span class="sf-act">'+(sf.running?'&#9632; Stop':'&#9654; Start')+'</span></div>'
      +'<div class="sf-leads"><input class="sf-leadsin" type="text" inputmode="numeric" value="'+(sf.leads||'')+'" placeholder="0" oninput="sfSetLeads(\''+sf.id+'\',this.value)"><span>leads</span></div>'
      +'<span class="sf-lph" data-id="'+sf.id+'">'+lph+'</span>'
      +'<button class="sf-del" title="Remove" onclick="sfRemove(\''+sf.id+'\')">&times;</button>'
      +'</div>';
  }).join('');
}
function sfSummary(){
  var list=(state.storefronts||[]).filter(function(s){return (s.name||'').trim()||s.leads||s.seconds;});
  var totLeads=list.reduce(function(a,s){return a+(parseInt(s.leads)||0);},0);
  var totSec=list.reduce(function(a,s){return a+sfElapsed(s);},0);
  return { count:list.length, leads:totLeads, mins:Math.round(totSec/60), list:list.map(function(s){return {name:s.name,leads:parseInt(s.leads)||0,mins:Math.round(sfElapsed(s)/60)};}) };
}
// ── JACK'S SENT ITEMS → REAL TASKS (with Start/Stop timer + leads) ─────────
/* One row for a batch of same-type items from Jack, with each link inside it so the VA
   can work down them and log leads per link. Ticking the row completes all of them. */
/* ── From-Jack routing ────────────────────────────────────────────────────────
   What Jack sends lands WITH the work it belongs to: storefronts inside the
   Storefronts task, filters inside the filters task. Shared by shift start AND
   the mid-shift cloud pull — they used to disagree, which is how every item
   ended up on screen twice (once bundled, once as its own card). */
/* Jack, 21/09: "from jack should be in from jack pos shouldn't it, and anything not
   done from yesterday — that's why it's missed yesterday". So everything he sends lands
   in ONE place, the Missed Yesterday + Jack POA task, instead of being scattered into
   whichever task happened to match its type. That task is already where carried-over
   work lives, which is exactly what he is describing. */
var JB_POA_IDS=['jack-poa','suz-jack-poa'];
var JB_ROUTE={ sf:JB_POA_IDS, kpf:JB_POA_IDS, eu:JB_POA_IDS,
               asin:JB_POA_IDS, euasin:JB_POA_IDS, msg:JB_POA_IDS };
function jb_findHost(tasks,ty){
  var ids=JB_ROUTE[ty]; if(!ids) return null;
  for(var i=0;i<ids.length;i++){
    for(var j=0;j<tasks.length;j++){ if(tasks[j].id===ids[i]) return tasks[j]; }
  }
  return null;
}
/* is this item already on screen — either as its own card OR bundled into a host? */
function jb_hasItem(tasks,iid){
  if(!iid) return false;
  for(var i=0;i<tasks.length;i++){
    var t=tasks[i];
    if(t.id==='jbitem-'+iid) return true;
    if(t.jbIids && t.jbIids.indexOf(iid)>=0) return true;
    if(t.jbIid===iid) return true;
  }
  return false;
}
function jb_attachToHost(host,items){
  host.hasLinks=true;
  host.links=host.links||[]; host.linkLeads=host.linkLeads||[];
  host.linkNames=host.linkNames||[]; host.linkFilterIds=host.linkFilterIds||[];
  host.jbIids=host.jbIids||[]; host.jbGroup=true;
  /* These four arrays are read BY INDEX — links[n] is named by linkNames[n]. A recurring
     task starts life with links:['','',''] but linkNames:[], so pushing an item put its
     NAME at index 0 and its URL at index 3. Traced on Jack's live Suz shift: the item
     "19 and 19 - a2a" showed as a named row with nothing to open (row 1) AND as a raw
     1,587-character Keepa URL in a blank slot (row 4) — one item, split in half, looking
     like two unrelated things. Level them up before pushing so an item stays whole. */
  var _n=Math.max(host.links.length,host.linkNames.length,host.linkLeads.length,host.linkFilterIds.length);
  while(host.links.length<_n)         host.links.push('');
  while(host.linkNames.length<_n)     host.linkNames.push('');
  while(host.linkLeads.length<_n)     host.linkLeads.push('');
  while(host.linkFilterIds.length<_n) host.linkFilterIds.push('');
  /* Aligning them fixed the split but pushed Jack's item to the BOTTOM, under three
     empty slots — "why is this here at the bottom then?". Work he actually sent should
     be the first thing she sees, so it goes IN FRONT of her blank rows. Reversed so
     several items keep the order they were sent in. */
  items.slice().reverse().forEach(function(it){
    var isUrl=/^https?:\/\//i.test(it.v);
    host.links.unshift(isUrl?it.v:'');
    host.linkNames.unshift(jb_cleanLabel(it)+(it.r?' — '+String(it.r).slice(0,40):''));
    host.linkLeads.unshift('');         // '' = untouched; a real 0 has to be tapped in
    host.linkFilterIds.unshift('');
    host.jbIids.unshift(it.iid||'');
  });
  host._fromJack=(host._fromJack||0)+items.length;
  host.jbFromJackCount=host._fromJack;
  return host;
}
function jb_groupTask(ty,items){
  var TY={sf:['\u{1F3EC}','Storefronts'],kpf:['\u{1F3AF}','KPF filters'],eu:['\u{1F1EA}\u{1F1FA}','EU sheets'],euasin:['\u{1F1EA}\u{1F1FA}','EU ASIN lists'],
          asin:['#','ASINs'],msg:['\u{1F4AC}','From Jack']};
  var t=TY[ty]||TY.msg;
  var carried=items.filter(function(it){ return jb_isCarried(it.addedOn); }).length;
  var oldest=0; items.forEach(function(it){ if(jb_isCarried(it.addedOn)){ var d=jb_carryDays(it.addedOn); if(d>oldest) oldest=d; } });
  var links=[], names=[], leads=[], iids=[];
  items.forEach(function(it,n){
    var isUrl=/^https?:\/\//i.test(it.v);
    links.push(isUrl?it.v:'');
    names.push(jb_cleanLabel(it)+(it.r?' — '+String(it.r).slice(0,40):''));
    leads.push('');
    iids.push(it.iid||('x'+n));
  });
  return { id:'jbgrp-'+ty, jbGroup:true, jbIids:iids, jbType:ty,
    jbAsins:(ty==='asin'?items.map(function(it){ return String(it.v||'').trim().toUpperCase(); }):[]),
    name:'From Jack · '+items.length+' '+t[1].toLowerCase(),
    jbLabel:items.length+' '+t[1].toLowerCase(),
    jbReason:'', jbCarried:carried>0, jbCarryDays:oldest, mandatory:true,
    /* Same call as a single ASIN: nobody times a stopwatch for three of them. The GROUP
       was still demanding time + leads, which is why "3 asins" wore "Time it & log leads". */
    tickOnly:(ty==='asin'),
    hint:(ty==='asin'
      ? 'Jack sent '+items.length+' ASINs. Copy or open each one, check it, then tick this off. No timer needed.'
      : 'Jack sent '+items.length+' '+t[1].toLowerCase()+'. Work down the list below, log the leads each one gave you, then tick this off.')
      +(carried?' '+carried+' carried over from a previous day.':''),
    hasLinks:true, links:links, linkNames:names, linkLeads:leads,
    done:false, skipped:false, skipReason:'', time:'', timeHrs:0, timeMins:0, leads:'', context:'',
    jbUrl:'', jbAsin:'', jbTimer:(ty!=='asin'), jbLeads:(ty!=='asin'),
    timerSec:0, timerRun:false, timerStart:null };
}
function jb_itemTask(it,i){
  var TY={sf:['\u{1F3EC}','Storefront'],kpf:['\u{1F3AF}','KPF filter'],eu:['\u{1F1EA}\u{1F1FA}','EU sheet'],euasin:['\u{1F1EA}\u{1F1FA}','EU ASINs'],asin:['#','ASIN'],msg:['\u{1F4AC}','From Jack']};
  var ty=TY[it.t]||TY.msg;
  var isUrl=/^https?:\/\//i.test(it.v);
  var nm=jb_cleanLabel(it);
  var iid=it.iid||('x'+(i||0));
  var carried=jb_isCarried(it.addedOn); var cd=carried?jb_carryDays(it.addedOn):0;
  return { id:'jbitem-'+iid, jbIid:iid, name:ty[1]+' · '+nm, jbLabel:nm, jbReason:(it.r||'').trim(),
    jbAddedOn:it.addedOn||'', jbCarried:carried, jbCarryDays:cd, jbPri:(it.pri||'Medium'), mandatory:true,
    hint:(it.t==='asin'
      ? ((carried?'Carried over from '+it.addedOn+'. ':'')+'Copy it or open it on Amazon, check it, then tick it off. No timer needed.')
      : (carried?'Carried over from '+it.addedOn+' — still needs doing.':'Sent by Jack today.')
        +(it.leads?' Log how many leads this gave you.':'')+(it.timer?' Use Start/Stop on the row to time it.':'')),
    hasLinks:false, done:false, skipped:false, skipReason:'', time:'', timeHrs:0, timeMins:0, leads:'', context:'', links:[],
    /* Jack: "asins like that just get the button on here so they don't have to open it —
       they won't start and stop for one asin, it will be a quick 30 second job." So a lone
       ASIN never demands a timer or a lead count: copy it, open it, tick it. */
    tickOnly:(it.t==='asin'),
    jbType:it.t, jbUrl:isUrl?it.v:'', jbAsin:(it.t==='asin'?String(it.v).trim():''),
    jbTimer:(it.t==='asin'?false:!!it.timer), jbLeads:(it.t==='asin'?false:!!it.leads),
    timerSec:0, timerRun:false, timerStart:null };
}
/* Leads split the way Jack actually sells: A2A UK, A2A EU, everything else OA.
   task.leads stays the TOTAL so every existing report, KPI and sheet write keeps
   working untouched — the breakdown rides alongside it. */
function sbBatchLead(i,isExtra,delta){
  var t=isExtra?state.extraTasks[i]:state.tasks[i]; if(!t) return;
  var cur=(t.leads===''||t.leads==null)?0:(+t.leads||0);
  t.leads=Math.max(0,cur+delta);
  var el=document.getElementById('bl-n-'+((isExtra?'e':'t')+i)); if(el) el.textContent=t.leads;
  try{ updateStats(); }catch(e){}
  saveShiftDraft(false);
}
/* Jack's standing instruction to the VAs on how to work a batch. Editable in
   Settings so he can reword it without a new build. */
function sbHowText(){
  try{ var v=String(getAppSettings().sbHowText||'').trim(); if(v) return v; }catch(e){}
  return 'A2A UK first, then A2A EU — take everything else to OA.';
}
function sbBatchKeepa(i,isExtra,val){
  var t=isExtra?state.extraTasks[i]:state.tasks[i]; if(!t) return;
  t.keepaTracks=(t.keepaTracks===val)?'':val;
  renderTasks(); saveShiftDraft(false);
}
function ttElapsedT(t){ var s=t.timerSec||0; if(t.timerRun&&t.timerStart) s+=(Date.now()-t.timerStart)/1000; return s; }
function ttToggle(i,isExtra){
  var t=isExtra?state.extraTasks[i]:state.tasks[i]; if(!t) return;
  if(t.timerRun){
    t.timerSec=ttElapsedT(t); t.timerRun=false; t.timerStart=null;
    /* Jack, 31/08: started THC, stopped after 9 seconds because there was nothing
       new in the discord to look at, then could not tick it off. Math.round(9/60)
       is 0, 0m reads everywhere as "no time logged", and Done refused him. The only
       way forward was to tap +15m — so a guard meant to stop fake time was the thing
       CREATING it. A timer that ran is real work: it never rounds down to nothing. */
    var mins=t.timerSec>0?Math.max(1,Math.round(t.timerSec/60)):0;
    var typed=(parseInt(t.timeHrs)||0)*60+(parseInt(t.timeMins)||0);
    // only auto-fill Time Spent if they haven't typed their own figure over it
    if(!typed || t._timeFromTimer){
      t.timeHrs=Math.floor(mins/60); t.timeMins=mins%60; t._timeFromTimer=true;
      try{ t.time=fmtDur(t.timeHrs,t.timeMins); }catch(e){ t.time=t.timeHrs+'h '+t.timeMins+'m'; }
      if(t.timerSec>0) showToast('Timer stopped \u2014 '+fmtSecs(t.timerSec)
        +(t.timerSec<60?' logged as 1m \u2713':' logged \u2713'));
    } else if(mins>0){
      showToast('Timer stopped \u2014 '+mins+'m timed, kept your '+typed+'m');
    }
  } else {
    t.timerRun=true; t.timerStart=Date.now();
    if(!window._ttTick) window._ttTick=setInterval(ttTickAll,1000);
    // starting the timer on a storefront batch IS pressing Start on it
    if(t.sbBatchId && t.sbStatus!=='Started'){
      t.sbStatus='Started';
      try{ sbStart(t.sbBatchId); }catch(e){}
    }
  }
  renderTasks(); try{saveShiftDraft(false);}catch(e){}
}
function ttTickAll(){
  // the panel shows its own live clock — keep it moving without a re-render
  try{
    (state.tasks||[]).concat(state.extraTasks||[]).forEach(function(t,n){});
    ['t','e'].forEach(function(pfx){
      var arr=pfx==='t'?(state.tasks||[]):(state.extraTasks||[]);
      arr.forEach(function(t,idx){
        if(!t||!t.sbBatchId) return;
        var el=document.getElementById('bp-el-'+pfx+idx);
        if(el) el.textContent=sfFmt(ttElapsedT(t));
      });
    });
  }catch(e){}
  var any=false;
  function upd(t,i,ex){ if(t&&t.timerRun){ any=true; var el=document.getElementById('tt-'+(ex?'e':'t')+i); if(el) el.textContent=sfFmt(ttElapsedT(t)); } }
  (state.tasks||[]).forEach(function(t,i){upd(t,i,false);});
  (state.extraTasks||[]).forEach(function(t,i){upd(t,i,true);});
  if(!any&&window._ttTick){ clearInterval(window._ttTick); window._ttTick=null; }
}
// banner: "Jack added N POA items and M storefronts today"
/* Jack: "anything we can add for a super time-sensitive high-important task which
   has a banner on their shift." Sending at Urgent puts a red bar at the very top of
   that VA's shift, above everything, naming each item — and it stays until they tick
   it off. Deliberately loud, and deliberately only for Urgent, so it keeps meaning
   something (the same trap the red priority tiles fell into on the storefront board). */
/* Jack: "thoughts on an urgent banner on screen at all times until completed?"
   Yes — urgent that scrolls away isn't urgent. The banner is sticky below the app
   header until every item is ticked, and it already removes itself on the last
   Done. Loud on purpose; it only ever holds things Jack marked Urgent. */
function jb_urgentBanner(va){
  var host=document.getElementById('jack-urgent'); if(!host) return;
  var o=null; try{ o=jb_open(va); }catch(e){}
  if(!o){ host.innerHTML=''; return; }
  var items=(o.items||[]).filter(function(x){ return !x.done && x.pri==='Urgent'; });
  var tasks=(o.tasks||[]).filter(function(x){ return !x.done && x.pri==='Urgent'; });
  var all=items.concat(tasks);
  if(!all.length){ host.innerHTML=''; return; }
  host.innerHTML='<div class="jbu">'
    +'<div class="jbu-h"><span class="jbu-dot"></span>'
      +(all.length===1?'Urgent from Jack — do this first':'Urgent from Jack — '+all.length+' to do first')+'</div>'
    +all.map(function(it){
        var nm=(typeof jb_cleanLabel==='function')?jb_cleanLabel(it):(it.v||it.name||'Task');
        var why=String(it.r||'').trim();
        /* Jack: "i thought we were going to make the urgent actionable". A bare ASIN
           in a red bar left her to select it by hand and go hunting. Now: an ASIN gets
           copy + Amazon + Keepa buttons; a URL gets an open button; and every item has
           "✓ Done" right there — same tick as the task list, so it leaves the banner
           the moment it is done instead of nagging her about finished work. */
        var raw=String(it.v||it.name||'').trim();
        var isAsin=/^B0[A-Z0-9]{8}$/i.test(raw);
        var isUrl=/^https?:\/\//i.test(raw);
        var acts='';
        if(isAsin){
          var A=raw.toUpperCase();
          acts='<button class="jbu-b" onclick="event.stopPropagation();navigator.clipboard.writeText(this.dataset.a);showToast(\'ASIN copied ✓\')" data-a="'+A+'">⧉ Copy</button>'
            +'<a class="jbu-b" target="_blank" rel="noopener" href="https://www.amazon.co.uk/dp/'+A+'">Amazon ↗</a>'
            +'<a class="jbu-b" target="_blank" rel="noopener" href="https://keepa.com/#!product/2-'+A+'">Keepa ↗</a>';
        } else if(isUrl){
          acts='<a class="jbu-b" target="_blank" rel="noopener" href="'+escHtml(raw)+'">Open ↗</a>';
        }
        acts+='<button class="jbu-b jbu-done" onclick="event.stopPropagation();jbUrgentDone(\''+escHtml(va)+'\',\''+escHtml(String(it.iid||''))+'\','+(tasks.indexOf(it)>=0?'true':'false')+')">✓ Done</button>';
        return '<div class="jbu-i"><b>'+escHtml(String(nm).slice(0,90))+'</b>'
          +(why?'<span>'+escHtml(why.slice(0,140))+'</span>':'')
          +(jb_isCarried(it.addedOn)?'<i>still open from '+escHtml(it.addedOn)+'</i>':'')
          +'<span class="jbu-acts">'+acts+'</span>'
          +'</div>';
      }).join('')
    +'</div>';
}
/* Ticking from the banner is the SAME tick as everywhere else — through
   jb_markDoneItem so it syncs to the cloud bucket and Jack sees it done. */
function jbUrgentDone(va,iid,isTask){
  if(!iid) return;
  try{ jb_markDoneItem(va,iid,isTask); }catch(e){}
  try{ jb_urgentBanner(va); jb_addsBanner(va); }catch(e){}
  try{ renderFromJack(va); }catch(e){}
  try{ saveShiftDraft(false); }catch(e){}
  showToast('Done ✓ — Jack can see it is handled');
}
function jb_addsBanner(va){
  var host=document.getElementById('jack-adds'); if(!host) return;
  var o=null; try{ o=jb_open(va); }catch(e){}
  if(!o){ host.innerHTML=''; return; }
  var items=(o.items||[]).filter(function(x){return !x.done;}), sf=items.filter(function(x){return x.t==='sf';}).length;
  var tasks=(o.tasks||[]).filter(function(x){return !x.done;});
  var poaCt=(items.length-sf)+tasks.length;
  if(!poaCt&&!sf){ host.innerHTML=''; return; }
  var all=items.concat(tasks);
  var carried=all.filter(function(x){return jb_isCarried(x.addedOn);}).length;
  var oldest=0; all.forEach(function(x){ var d=jb_carryDays(x.addedOn); if(d>oldest) oldest=d; });
  var overdue=oldest>=3;
  var bits=[]; if(poaCt) bits.push('<b>'+poaCt+'</b> POA item'+(poaCt===1?'':'s')); if(sf) bits.push('<b>'+sf+'</b> storefront'+(sf===1?'':'s'));
  // only the OVERDUE alert lives here now — the normal count sits in the From-Jack card below
  // (kills the duplicate banner). Nothing overdue → this bar renders nothing.
  if(overdue){
    host.innerHTML='<div class="jack-adds-bar overdue">⚠️ <b>'+carried+'</b> item'+(carried===1?'':'s')+' from Jack '+(carried===1?'has':'have')+' been waiting <b>'+oldest+' days</b> — please action '+(carried===1?'it':'them')+' this shift.</div>';
  } else {
    host.innerHTML='';
  }
}
function exportSettings(){
  try{
    var st=getAppSettings();
    navigator.clipboard.writeText(JSON.stringify(st)).then(function(){ showToast('Settings copied \u2014 paste into Import on another device \u2713'); });
  }catch(e){ showToast('Copy failed', true); }
}
function openImportSettings(){
  var m=document.getElementById('import-modal'); if(!m) return;
  document.getElementById('import-blob').value='';
  m.classList.add('open');
  setTimeout(function(){document.getElementById('import-blob').focus();},60);
}
function confirmImportSettings(){
  try{
    var blob=document.getElementById('import-blob').value.trim();
    if(!blob){ showToast('Paste the settings blob first', true); return; }
    var incoming=JSON.parse(blob);
    var st=getAppSettings();
    Object.keys(incoming).forEach(function(k){ st[k]=incoming[k]; });
    saveAppSettings(st);
    applyWebhookSettings(); try{applyVaColours();}catch(e){} try{applyVaLabels();}catch(e){}
    document.getElementById('import-modal').classList.remove('open');
    try{ mgr_renderSettings(); }catch(e){}
    showToast('Settings imported \u2713');
  }catch(e){ showToast('That blob is not valid \u2014 copy it again', true); }
}
function stConfirm(msg,onOk){
  var m=document.getElementById('confirm-modal'); if(!m){ if(confirm(msg)) onOk(); return; }
  document.getElementById('confirm-msg').textContent=msg;
  var ok=document.getElementById('confirm-ok');
  ok.onclick=function(){ m.classList.remove('open'); try{onOk();}catch(e){} };
  m.classList.add('open');
}
function pinAutoCheck(input){
  try{ var pin=String(getAppSettings().managerPin||''); if(pin && input.value.length===pin.length && input.value===pin) attemptManagerUnlock(); }catch(e){}
}

function openSkipModal(i) { state.pendingSkipTask=i; document.getElementById('skip-reason').value=''; document.getElementById('skip-modal').classList.add('open'); }
function closeSkipModal() { document.getElementById('skip-modal').classList.remove('open'); state.pendingSkipTask=null; }
function confirmSkip() {
  var reason = document.getElementById('skip-reason').value.trim();
  if (!reason) { showToast('Please provide a reason', true); return; }
  state.tasks[state.pendingSkipTask].skipped = true;
  state.tasks[state.pendingSkipTask].done    = false;
  state.tasks[state.pendingSkipTask].skipReason = reason;
  closeSkipModal(); renderTasks();
  showToast('Skipped - Jack will be notified');
}

/* Suz: "my time keep on stoping sir". The clock is not losing her time — every figure
   that gets RECORDED is computed as Date.now() - shiftStart - breaks, so it is right even
   if nothing has repainted for an hour. What stops is the repaint: browsers throttle, and
   eventually suspend, timers in a tab that is not in front. Her screenshot proves it —
   the 60s autosave last ran at 10:05 and she messaged at 10:10, so the whole page had been
   asleep for five minutes, taking the live status ping with it.
   Two consequences that DO matter: Jack's board shows her stale, and a crash loses more
   than the promised minute. So on returning to the tab, repaint and re-sync immediately
   instead of waiting for the next tick. */
