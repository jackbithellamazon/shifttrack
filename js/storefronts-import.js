/* ── SARAH'S IMPORT PAGE ────────────────────────────────────────────────────
   One page. One big box per active queue. A Submit button. Nothing else.
   She never sees Keepa, never picks an assignee, never touches a status. */
/* This app shows views with a CLASS only — `.view{display:none}` / `.view.active{display:block}`.
   I originally also set inline `style.display='none'` on every view here, and an inline style
   BEATS the class: after visiting this page, clicking Shift/Jack/Leads added `.active` but the
   inline none kept everything hidden, so every nav button went dead and there was no way back.
   Never set inline display on a `.view` — toggle `.active` and nothing else. */
function sbShowImport(){
  // ACCESS: intentionally open for now — Jack asked to settle Sarah's login later.
  // To lock it, gate this the same way unlockManager() gates Jack's dashboard.
  var v=document.getElementById('view-import'); if(!v) return;
  window._sbPrevView=(document.querySelector('.view.active')||{}).id||'';
  sbClearInlineViewDisplay();
  document.querySelectorAll('.view').forEach(function(x){ x.classList.remove('active'); });
  v.classList.add('active');
  var ls=document.getElementById('login-screen'); if(ls) ls.style.display='none';
  sbOpenImport();
}
/* strips any inline display left on a view — also self-heals anyone already stuck */
function sbClearInlineViewDisplay(){
  document.querySelectorAll('.view').forEach(function(x){ x.style.removeProperty('display'); });
}
function sbHideImport(){
  var v=document.getElementById('view-import');
  // If the import view isn't actually open, DO NOTHING. Every nav button calls this
  // defensively, and the old version still ran its "go back to _sbPrevView" tail even
  // when there was nothing to close — so Sarah's page → Jack → Shift restored a stale
  // _sbPrevView on top of the view the nav had just opened, and left NOTHING with
  // .active. Black screen. Closing something that isn't open must be a no-op.
  if(!v || !v.classList.contains('active')) return;
  v.classList.remove('active'); v.style.removeProperty('display');
  sbClearInlineViewDisplay();
  try{ history.replaceState({},'',location.pathname); }catch(e){}
  // return to wherever they came from rather than reloading the whole app
  var back=window._sbPrevView;
  if(back==='view-manager' && window._mgrUnlocked){ try{ _openManager(); return; }catch(e){} }
  if(back==='view-leads' && window._mgrUnlocked){ try{ _openLeads(); return; }catch(e){} }
  try{ showVAView(); }catch(e){ location.reload(); }
}
/* WATCHDOG — a blank screen must be impossible, whatever the cause.
   This app has now produced one twice (v157 nesting, v177 sbHideImport's stale restore).
   Both times the symptom was identical: no `.view` carrying `.active`, no error in the
   console, and no way out but a reload. Rather than only fixing each cause, check the
   invariant directly — if nothing is on screen and we aren't on the login screen, put
   the user back somewhere real. */
function viewWatchdog(){
  try{
    if(document.querySelector('.view.active')) return;
    var ls=document.getElementById('login-screen');
    if(ls && ls.style.display!=='none' && ls.offsetParent!==null) return;   // login is meant to be up
    sbClearInlineViewDisplay();
    if(window._mgrUnlocked && window._sbPrevView==='view-manager'){ try{ _openManager(); return; }catch(e){} }
    try{ showVAView(); }catch(e){}
  }catch(e){}
}
setInterval(viewWatchdog, 1200);
/* Belt and braces: any nav click closes the import view first, and on load we clear
   stale inline display so a reload always rescues a stuck tab. */
(function(){
  function wire(){
    if(!document.querySelector('.view')) return setTimeout(wire,300);
    sbClearInlineViewDisplay();
    ['navMgrToggle','showVAView','showLeadsView','_openManager','_openLeads'].forEach(function(fn){
      var orig=window[fn];
      if(typeof orig!=='function') return;
      window[fn]=function(){
        var v=document.getElementById('view-import');
        if(v && v.classList.contains('active')){ v.classList.remove('active'); }
        sbClearInlineViewDisplay();
        return orig.apply(this, arguments);
      };
    });
  }
  wire();
})();
/* ?import=1 opens straight into Sarah's page — she can bookmark it */
(function(){
  function chk(){
    try{
      if(!/[?&]import=1/.test(location.search)) return;
      if(typeof sbLoadQueues!=='function') return setTimeout(chk,300);
      setTimeout(sbShowImport, 400);
    }catch(e){}
  }
  chk();
})();
/* ── which tag she's on, and the search filter over the tag list ─────────────
   The first build put one big textarea per queue in a grid. That was fine for six
   queues; Jack's real tag list is two dozen, and twenty-four identical boxes is a
   wall, not a page. One box, one tag at a time, everything else out of the way. */
var SB_PICKED=null, SB_QFILTER='', SB_FLASH=null;
function sbPick(qid){
  SB_PICKED=(SB_PICKED===qid)?null:qid; SB_FLASH=null;
  sbRenderImport();
  if(SB_PICKED) setTimeout(function(){ var t=document.getElementById('sbi-ta'); if(t) t.focus(); },30);
}
/* repaint ONLY the chips — re-rendering the page would steal focus mid-word */
function sbFilterTags(v){
  SB_QFILTER=v||'';
  var el=document.getElementById('sbi-chips');
  if(el) el.innerHTML=sbChipsHTML();
}
/* Recently used tags. With 25 chips the real cost is HUNTING for the one you want, and
   in practice a handful get used every day and the rest rarely. Keeping the sheet order
   intact (Jack asked for it) but surfacing the last few used on top fixes that without
   moving anything around under her. */
function sbRecent(){
  try{ var a=JSON.parse(lsGet('bdl_sb_recent')||'[]'); return Array.isArray(a)?a:[]; }
  catch(e){ return []; }
}
function sbPushRecent(qid){
  try{
    var a=sbRecent().filter(function(x){ return x!==qid; });
    a.unshift(qid);
    lsPut('bdl_sb_recent', JSON.stringify(a.slice(0,6)));
  }catch(e){}
}
function sbRecentHTML(){
  var live={}; sbActiveQueues().forEach(function(q){ live[q.id]=q; });
  var rec=sbRecent().map(function(id){ return live[id]; }).filter(Boolean);
  if(rec.length<2) return '';                       // one chip isn't a shortcut, it's clutter
  return '<div class="sbi-recent"><span class="sbi-recent-l">Recent</span>'
    +rec.map(function(q){
        return '<button class="sbi-chip sm'+(SB_PICKED===q.id?' on':'')+'" onclick="sbPick(\''+q.id+'\')">'
          +escHtml(q.name)+'</button>';
      }).join('')
    +'</div>';
}
/* Where a tag routes = its colour. 25 identical grey pills told Sarah nothing;
   now Mera tags are purple, Suz yellow, review tags amber — the same identity
   colours the whole app already uses, so the meaning comes for free. */
function sbDestCls(q){
  if(q.manual_review) return 'dest-review';
  var a=q.default_assignee||'Jack';
  return 'dest-'+sbRouteCls(a);
}
function sbDestName(q){
  if(q.manual_review) return 'Jack (routes it)';
  var a=q.default_assignee||'Jack';
  return sbRouteLabel(a);
}
function sbChipsHTML(){
  var f=String(SB_QFILTER||'').trim().toLowerCase();
  var qs=sbActiveQueues().filter(function(q){
    return !f || String(q.name||'').toLowerCase().indexOf(f)>=0;
  });
  if(!qs.length) return '<div class="sbi-nochip">No tag matches “'+escHtml(SB_QFILTER)+'”.</div>';
  return qs.map(function(q){
    var slot=sbOpenBatch(q.id);
    var n=slot.batch?(slot.batch.asin_count||0):0;
    var started=(!slot.batch && slot.nextNumber>1);
    return '<button class="sbi-chip '+sbDestCls(q)+(SB_PICKED===q.id?' on':'')+(slot.batch?' has':'')+(started?' started':'')+'"'
      +' onclick="sbPick(\''+q.id+'\')" title="'+escHtml(q.name)+' → '+escHtml(sbDestName(q))
      +(String(q.notes||'').trim()?'\u000A'+escHtml(q.notes):'')+'">'
      +'<i class="sbi-dot"></i>'+escHtml(q.name)
      +(n?'<span class="sbi-chip-n">'+n+'</span>':(started?'<span class="sbi-chip-tick">✓</span>':''))
      +'</button>';
  }).join('')
  // the colours mean something — say what, once, under the chips
  +'<div class="sbi-key"><span class="k-m">● Mera</span><span class="k-s">● Suz</span><span class="k-j">● Jack routes it</span></div>';
}
/* A mis-paste used to be permanent: the batch stays OPEN by design (Jack's spec — locking
   happens on Start, never before) so the next paste appends to it, and there was no undo.
   Only ever allowed before a VA has started it, and it takes the ASINs with it. */
/* Replaces window.confirm for destructive actions. The browser one announces the local
   file path, can't be styled, and puts the destructive choice where "OK" normally sits.
   Returns a promise so callers read the same as before. */
function askConfirm(o){
  return new Promise(function(resolve){
    var m=document.createElement('div');
    m.className='sbq-modal';
    m.innerHTML='<div class="sbq-box ask'+(o.danger?' danger':'')+'">'
      +'<div class="sbq-box-h">'+(o.title||'Are you sure?')+'</div>'
      +(o.body?'<div class="ask-b">'+o.body+'</div>':'')
      +(o.detail?'<div class="ask-d">'+o.detail+'</div>':'')
      +'<div class="sbq-box-a">'
        +'<button class="btn '+(o.danger?'btn-danger':'btn-primary')+'" data-yes>'+(o.yes||'Yes')+'</button>'
        +'<button class="btn btn-ghost" data-no>'+(o.no||'Cancel')+'</button>'
      +'</div></div>';
    function done(v){ try{ m.remove(); }catch(e){} document.removeEventListener('keydown',key); resolve(v); }
    function key(e){ if(e.key==='Escape') done(false); }
    m.addEventListener('click',function(e){
      if(e.target===m) return done(false);
      if(e.target.hasAttribute('data-yes')) return done(true);
      if(e.target.hasAttribute('data-no'))  return done(false);
    });
    document.addEventListener('keydown',key);
    document.body.appendChild(m);
    setTimeout(function(){ var b=m.querySelector('[data-no]'); if(b) b.focus(); },40);
  });
}
/* Collapse every on-screen copy of a batch before the board repaints. One batch can be
   drawn more than once (Needs routing, Yours to work, the card grid), so this works off
   data-bid rather than one element. Resolves when the animation has finished. */
/* ── FLIP: stop the board snapping when a tile leaves ───────────────────────────
   Binning collapses the tile smoothly, then sbPaintJack() rebuilds the whole board from
   scratch — and every remaining tile is DROPPED into its new grid slot with no transition
   at all. The tile you removed glided away; the twenty behind it jumped. That is the
   "not smooth" part.
   So: measure where each tile is BEFORE the repaint, let the repaint happen, then put
   each one back where it was with a transform and let it travel to its real position.
   Transform-only, so it can never affect layout, and it no-ops when nothing moved. */
function sbFlipCapture(){
  var m={};
  try{
    [].slice.call(document.querySelectorAll('.sbr[data-bid]')).forEach(function(el){
      var r=el.getBoundingClientRect();
      if(r.width) m[el.getAttribute('data-bid')]={x:r.left,y:r.top};
    });
  }catch(e){}
  return m;
}
function sbFlipPlay(prev){
  if(!prev) return;
  try{ if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; }catch(e){}
  try{
    var moved=[];
    [].slice.call(document.querySelectorAll('.sbr[data-bid]')).forEach(function(el){
      var was=prev[el.getAttribute('data-bid')]; if(!was) return;
      var r=el.getBoundingClientRect();
      var dx=was.x-r.left, dy=was.y-r.top;
      if(Math.abs(dx)<1 && Math.abs(dy)<1) return;    // did not move — leave it alone
      el.style.transition='none';
      el.style.transform='translate('+dx+'px,'+dy+'px)';
      moved.push(el);
    });
    if(!moved.length) return;
    void moved[0].offsetHeight;                        // flush the start position first
    moved.forEach(function(el){
      el.style.transition='transform .3s cubic-bezier(.22,.7,.3,1)';
      el.style.transform='';
      setTimeout(function(){ el.style.transition=''; el.style.transform=''; },340);
    });
  }catch(e){}
}
function sbCollapseTiles(batchId){
  var els;
  try{ els=[].slice.call(document.querySelectorAll('[data-bid="'+String(batchId).replace(/["\\]/g,'')+'"]')); }
  catch(e){ els=[]; }
  if(!els.length) return Promise.resolve();
  var reduce=false;
  try{ reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){}
  if(reduce){ els.forEach(function(el){ el.style.display='none'; }); return Promise.resolve(); }
  els.forEach(function(el){ el.style.maxHeight=el.offsetHeight+'px'; });  // a start value to animate FROM
  void els[0].offsetHeight;                                              // force the reflow before the class lands
  els.forEach(function(el){ el.classList.add('sb-going'); });
  return new Promise(function(res){ setTimeout(res,250); });
}
/* Binning left the tile sitting on screen through FOUR network round-trips (read batch,
   read items, delete items, delete batch) plus a full refetch, and only then flash-
   repainted the whole board underneath it: click, nothing, nothing, everything jumps.
   Now the tile animates away immediately off local state and the deleting happens behind
   it. Undo awaits the same job promise, so it can never race the DELETE and restore a row
   that the in-flight delete then removes again. */
async function sbScrapBatch(batchId){
  var b=(SB_BATCHES||[]).filter(function(x){ return x.id===batchId; })[0];
  if(!b) return;
  if(b.status==='Started'||b.status==='Completed'){
    showToast('Too late \u2014 '+vaDisp(b.started_by||b.assigned_to||'a VA')+' has already started this one',true); return;
  }
  if(IS_PREVIEW){ showToast('Preview mode \u2014 not scrapped',true); return; }
  var h={apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY};
  var base=SUPABASE_URL+'/rest/v1/', eid=encodeURIComponent(batchId);

  // the whole read-then-delete as ONE promise, started here so it runs DURING the animation
  var job=(async function(){
    var keptBatch=null, keptItems=[];
    try{
      var br=await fetchT(base+'storefront_batches?id=eq.'+eid+'&select=*',{headers:h});
      if(br.ok) keptBatch=(await br.json())[0]||null;
      var ir=await fetchT(base+'storefront_batch_items?batch_id=eq.'+eid+'&select=*',{headers:h});
      if(ir.ok) keptItems=(await ir.json())||[];
      /* SOFT BIN. This used to DELETE the batch and every ASIN in it, which erased
         the fact Sarah ever pasted — a tag pasted into days ago reported "4 weeks
         ago". Marking it scrapped takes it off the board exactly the same way, but
         the paste stays on the record and Undo is a one-field flip. Falls back to
         the old delete if SCRAPPED-BATCHES-run-in-supabase.sql has not been run. */
      var pr=await fetchT(base+'storefront_batches?id=eq.'+eid,{method:'PATCH',
        headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
                 'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify({scrapped:true, scrapped_at:new Date().toISOString(), scrapped_by:'Jack'})});
      if(pr.ok) return {ok:true, soft:true, batch:keptBatch, items:keptItems};
      await fetchT(base+'storefront_batch_items?batch_id=eq.'+eid,{method:'DELETE',headers:h});
      var r=await fetchT(base+'storefront_batches?id=eq.'+eid,{method:'DELETE',headers:h});
      if(!r.ok) return {ok:false};
    }catch(e){ return {ok:false}; }
    return {ok:true, batch:keptBatch, items:keptItems};
  })();

  // optimistic: out of local state, Undo offered at once, animate away, repaint from memory
  var snapshot=(SB_BATCHES||[]).slice();
  var i=SB_BATCHES.indexOf(b); if(i>=0) SB_BATCHES.splice(i,1);
  window._sbBinUndo={job:job};
  sbBinToast((b.storefront_name||'Batch'),(b.asin_count||0));
  SB_FLASH=null;
  await sbCollapseTiles(batchId);
  var _flip=sbFlipCapture();                 // where everything sits BEFORE the rebuild
  try{ sbPaintJack(); }catch(e){}
  try{ sbRenderImport(); }catch(e){}
  sbFlipPlay(_flip);                         // …and glide them into their new slots

  var res=await job;
  if(!res.ok){
    // a row still sitting in Supabase must not stay hidden on his board
    SB_BATCHES.length=0; snapshot.forEach(function(x){ SB_BATCHES.push(x); });
    window._sbBinUndo=null;
    var t=document.getElementById('sb-bin-toast'); if(t) t.remove();
    try{ sbPaintJack(); sbRenderImport(); }catch(e){}
    showToast('Couldn\'t scrap it \u2014 check your connection. Nothing was deleted.',true);
  }
}
/* A toast that can put it back. Nothing else in the app deletes rows, so this is
   the only place that needs it — hence a purpose-built one rather than a system. */
function sbBinToast(name,n){
  var old=document.getElementById('sb-bin-toast'); if(old) old.remove();
  var d=document.createElement('div');
  d.id='sb-bin-toast'; d.className='sb-bin-toast';
  d.innerHTML='<span>Binned <b>'+escHtml(name)+'</b> \u00b7 '+n+' ASIN'+(n===1?'':'s')+'</span>'
    +'<button onclick="sbBinUndo()">\u21ba Undo</button>';
  document.body.appendChild(d);
  clearTimeout(window._sbBinT);
  window._sbBinT=setTimeout(function(){ var x=document.getElementById('sb-bin-toast'); if(x) x.remove(); window._sbBinUndo=null; },12000);
}
async function sbBinUndo(){
  var u=window._sbBinUndo; if(!u){ showToast('Too late to undo that one',true); return; }
  window._sbBinUndo=null;
  var x=document.getElementById('sb-bin-toast'); if(x) x.remove();
  /* Undo can now be pressed while the DELETE is still in flight, because the toast
     appears the instant the tile leaves. Awaiting the same job promise serialises the
     two: the restore only ever runs AFTER the delete has finished, so it cannot post a
     row back and have the in-flight delete take it away again. */
  showToast('Putting it back…');
  var res=null;
  try{ res=await u.job; }catch(e){ res=null; }
  if(res&&res.ok&&res.soft){
    // soft bin → put it back by clearing the flag, no re-insert needed
    var uid=encodeURIComponent((res.batch&&res.batch.id)||'');
    var ur=await fetchT(SUPABASE_URL+'/rest/v1/storefront_batches?id=eq.'+uid,{method:'PATCH',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
               'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({scrapped:false, scrapped_at:null, scrapped_by:null})});
    if(!ur.ok){ showToast('Couldn\'t put it back — try again',true); return; }
    SB_BATCHES=null; SB_BATCHES_ALL=null;
    try{ await sbLoadBatches(true); }catch(e){}
    try{ sbPaintJack(); sbRenderImport(); }catch(e){}
    showToast('Put back \u2713');
    return;
  }
  if(!res||!res.ok||!res.batch){ showToast('Couldn\'t put it back — the copy never came back from the server',true); return; }
  var items=res.items||[];
  var h={apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates'};
  try{
    var r=await fetchT(SUPABASE_URL+'/rest/v1/storefront_batches',{method:'POST',headers:h,body:JSON.stringify([res.batch])});
    if(!r.ok){ showToast('Couldn\'t put it back — check your connection',true); return; }
    if(items.length){
      await fetchT(SUPABASE_URL+'/rest/v1/storefront_batch_items',{method:'POST',headers:h,body:JSON.stringify(items)});
    }
  }catch(e){ showToast('Couldn\'t put it back — check your connection',true); return; }
  var _flipU=sbFlipCapture();                // same trick coming back as going away
  await sbLoadBatches(true);
  sbRenderImport();
  try{ sbRefreshJack(); }catch(e){}
  sbFlipPlay(_flipU);
  /* Land it the same way a new batch lands, so his eye is taken straight to the tile
     that came back rather than left hunting the board for it. */
  try{ SB_LANDED=res.batch.id; setTimeout(function(){ SB_LANDED=null; },1400); }catch(e){}
  showToast('Put back ✓ — '+(items.length||res.batch.asin_count||0)+' ASINs restored');
}
function sbImportHTML(){
  var qs=sbActiveQueues();
  if(!qs.length){
    // SB_TABLES_MISSING is set when the API 404s — telling her to "add a queue" in that
    // state sends her to a button that would fail too.
    if(window.SB_TABLES_MISSING){
      return '<div class="sbi-wrap"><div class="sbi-empty">Not switched on yet.'
        +'<span>Jack still needs to run the storefront setup once in Supabase. '
        +'Nothing you do here will save until then \u2014 give him a nudge.</span></div></div>';
    }
    return '<div class="sbi-wrap"><div class="sbi-empty">No queues set up yet.'
      +'<span>Jack: open the <b>Storefronts</b> tab and add one.</span></div></div>';
  }
  var wd=sbWorkDate(), back=sbIsBackdated();

  // ── the day being imported for ────────────────────────────────────────────
  // The date input opens Chrome's own calendar, which can't be styled and is far more
  // machinery than this needs — backdating is almost always "yesterday" or "the day
  // before". Quick-pick the last few days; the calendar stays for anything older.
  var quick='';
  for(var qd=0; qd<5; qd++){
    var dd=new Date(); dd.setDate(dd.getDate()-qd);
    var uk=dd.toLocaleDateString('en-GB',{timeZone:'Europe/London'});
    var lbl=qd===0?'Today':qd===1?'Yesterday':dd.toLocaleDateString('en-GB',{weekday:'short',day:'numeric'});
    quick+='<button class="sbi-day'+(wd===uk?' on':'')+'" onclick="sbSetImportDate(\''+sbToISO(uk)+'\')">'+escHtml(lbl)+'</button>';
  }
  var dayBar='<div class="sbi-daybar'+(back?' back':'')+'">'
    +'<span class="sbi-daylab">Importing for</span>'
    +'<div class="sbi-days">'+quick+'</div>'
    +(back?'<span class="sbi-backflag">'+escHtml(sbDayLabel(wd))+'</span>':'<span class="sbi-todayflag">Today</span>')
    +'<button class="sbi-refresh" onclick="sbForceRefresh(this)" title="Re-read everything from the server">&#8635; Refresh</button>'
    +'<label class="sbi-older" title="Pick any other date">'
      +'<span>Older…</span>'
      +'<input type="date" class="sbi-dateinput" id="sbi-date" value="'+sbToISO(wd)+'"'
        +' max="'+sbToISO(sbToday())+'" onchange="sbSetImportDate(this.value)">'
    +'</label>'
    +'</div>';

  // ── step 2: the one paste box, for whichever tag is selected ──────────────
  var paste;
  var q=SB_PICKED?sbQueueById(SB_PICKED):null;
  if(!q){
    SB_PICKED=null;
    paste='<div class="sbi-pick-hint"><b>Pick a tag above to start.</b>'
      +'<span>The box appears here once you do — one tag at a time, so nothing lands in the wrong place.</span></div>';
  } else {
    var slot=sbOpenBatch(q.id);
    var state = slot.batch
      ? '<span class="sbi-state open" title="Still unlocked — more pastes today join this same batch until the VA presses Start">'
        +'Batch '+(slot.batch.batch_number||1)+' open · '+(slot.batch.asin_count||0)+' ASINs so far</span>'
      : (slot.nextNumber>1
          ? '<span class="sbi-state locked">Batch '+(slot.nextNumber-1)+' already started — this opens <b>Batch '+slot.nextNumber+'</b></span>'
          : '<span class="sbi-state fresh">Nothing yet '+(back?'on this day':'today')+'</span>');
    // Sarah (and Jack) could never see WHERE a submit would land — the routing lives
    // in a table on a different page. Say it right on the paste panel.
    var dest = q.manual_review
      ? '<span class="sbi-dest review">→ lands with <b>Jack</b> to route to a VA (Storefronts tab)</span>'
      : '<span class="sbi-dest">→ goes straight to <b>'+escHtml(sbDestName(q))+'</b> as a shift task</span>';
    paste='<div class="sbi-paste">'
      +'<div class="sbi-step"><span class="sbi-num">2</span>'
        +'<span class="sbi-step-t">Paste the ASINs for <b>'+escHtml(q.name)+'</b></span>'+state+'</div>'
      +(String(q.notes||'').trim()
         ? '<div class="sbi-note">\u270E '+escHtml(q.notes)+'</div>' : '')
      +'<div class="sbi-dest-row">'+dest
        +(slot.batch
            ? '<div class="sbi-open-note">Anything you paste now <b>joins Batch '+(slot.batch.batch_number||1)+'</b>'
              +' — it stays open until '+escHtml(vaDisp(slot.batch.assigned_to||'the VA'))+' presses Start, so you can keep adding.'
              +' <button class="sbi-undo" onclick="sbScrapBatch(\''+slot.batch.id+'\')">Wrong tag? Scrap it</button></div>'
            : '')
      +'</div>'
      +'<textarea class="sbi-ta" id="sbi-ta" rows="8" spellcheck="false"'
        +' placeholder="One per line&#10;B0XXXXXXXX&#10;B0XXXXXXXX" oninput="sbImportCount()"></textarea>'
      +'<div class="sbi-q-foot">'
        +'<span class="sbi-count" id="sbi-count"></span>'
        +'<button class="sbi-submit" id="sbi-btn" onclick="sbImportSubmit()">Submit to '+escHtml(q.name)+'</button>'
      +'</div>'
      +'<div class="sbi-result'+(SB_FLASH?' ok':'')+'" id="sbi-res">'+(SB_FLASH||'')+'</div>'
      +'</div>';
  }

  // ── what's already gone in for this day ───────────────────────────────────
  var byDate=function(a,b){ return String(b.created_at||'').localeCompare(String(a.created_at||'')); };
  var done=(SB_BATCHES||[]).filter(function(b){ return b.date===wd; }).sort(byDate);
  // A batch backdated to the 28th vanished the moment the picker went back to today —
  // so Sarah couldn't see the thing she'd just filed. Show the selected day, then the
  // other recent days underneath, each labelled, so nothing she imported disappears.
  var recentCut=Date.now()-7*86400000;
  var others=(SB_BATCHES||[]).filter(function(b){
    if(b.date===wd) return false;
    var iso=sbToISO(b.date); if(!iso) return false;
    return new Date(iso+'T12:00:00').getTime()>=recentCut;
  }).sort(byDate);
  function rowHTML(b, showDay){
    var to=(b.status==='Draft') ? '<i>waiting for Jack</i>' : escHtml(vaDisp(b.assigned_to||'—'));
    var st=(b.status==='Completed')?'<span class="sbi-done-st ok">done</span>'
          :(b.status==='Started')?'<span class="sbi-done-st go">being worked</span>':'';
    return '<div class="sbi-done-row">'
      +'<b>'+escHtml(b.storefront_name||'—')+'</b>'
      +(showDay?'<span class="sbi-done-day">'+escHtml(sbDayLabel(b.date))+'</span>':'')
      +'<span class="sbi-done-n">Batch '+(b.batch_number||1)+' · '+(b.asin_count||0)+' ASINs</span>'
      +st+'<span class="sbi-done-to">'+to+'</span></div>';
  }
  var doneHTML='';
  if(done.length||others.length){
    var tot=done.reduce(function(s,b){ return s+(b.asin_count||0); },0);
    doneHTML='<div class="sbi-done">'
      +'<div class="sbi-done-head">Already in for '+escHtml(sbDayLabel(wd))
        +'<span>'+(done.length?done.length+' batch'+(done.length===1?'':'es')+' · '+tot+' ASIN'+(tot===1?'':'s'):'nothing yet')+'</span></div>'
      +(done.length?done.map(function(b){ return rowHTML(b,false); }).join('')
                   :'<div class="sbi-done-row"><span class="sbi-done-n">No imports filed under this day.</span></div>')
      +(others.length
          ? '<div class="sbi-done-head sub">Other days this week<span>'+others.length+' batch'+(others.length===1?'':'es')+'</span></div>'
            +others.map(function(b){ return rowHTML(b,true); }).join('')
          : '')
      +'</div>';
  }

  // No page title here — the bar above already says "Storefront import", and saying it
  // twice only pushed the one thing that matters (which DAY) further down the page.
  return '<div class="sbi-wrap">'
    +'<div class="sbi-sub">Pick the tag, paste the ASINs, hit Submit. That’s it — the Keepa link and the VA’s task are made for you.</div>'
    +dayBar
    +'<div class="sbi-picker">'
      +'<div class="sbi-step"><span class="sbi-num">1</span><span class="sbi-step-t">Which tag?</span>'
        +'<input class="sbi-search" id="sbi-search" placeholder="Type to filter…" value="'+escHtml(SB_QFILTER)+'"'
          +' oninput="sbFilterTags(this.value)" spellcheck="false">'
      +'</div>'
      +sbRecentHTML()
      +'<div class="sbi-chips" id="sbi-chips">'+sbChipsHTML()+'</div>'
    +'</div>'
    +paste
    +doneHTML
    +'</div>';
}
/* live count as she pastes — so she can sanity-check before submitting */
function sbImportCount(){
  var ta=document.getElementById('sbi-ta'), out=document.getElementById('sbi-count');
  if(!ta||!out) return;
  var p=sbParseAsins(ta.value);
  if(!ta.value.trim()){ out.textContent=''; out.className='sbi-count'; return; }
  var bits=[p.asins.length+' ASIN'+(p.asins.length===1?'':'s')];
  if(p.dupes) bits.push(p.dupes+' duplicate'+(p.dupes===1?'':'s')+' will be removed');
  if(p.bad.length) bits.push(p.bad.length+' not recognised');
  out.className='sbi-count'+(p.asins.length?'':' bad');
  out.textContent=bits.join('  ·  ');
}
var SB_LAST_PASTE={};
async function sbImportSubmit(){
  var qid=SB_PICKED; if(!qid) return;
  var ta=document.getElementById('sbi-ta');
  var res=document.getElementById('sbi-res');
  var btn=document.getElementById('sbi-btn');
  if(!ta) return;
  var raw=ta.value;
  if(!raw.trim()){ showToast('Paste some ASINs first',true); ta.focus(); return; }

  // A backdated import is a deliberate act, so make her confirm it once. In-app, not
  // window.confirm — the native dialog renders at the TOP of the window ("This page
  // says…"), nowhere near the button she pressed, and can't say where the work goes.
  if(sbIsBackdated() && !window._sbBackOk){
    var res0=document.getElementById('sbi-res');
    if(res0){
      res0.className='sbi-result back';
      res0.innerHTML='<b>This is a backdated import.</b> It files under <b>'+sbDayLabel(sbWorkDate())
        +'</b> ('+sbWorkDate()+') — it will show on Jack’s board and in history under that day, not today.'
        +'<div class="sbi-back-acts">'
        +'<button class="sbi-mini ok" onclick="window._sbBackOk=true;sbImportSubmit()">Yes — file it under '+sbDayLabel(sbWorkDate())+'</button>'
        +'<button class="sbi-mini" onclick="sbResetImportDate()">No — switch to today</button>'
        +'</div>';
      return;
    }
    window._sbBackOk=true;   // no result element to ask in — fall through rather than block
  }

  // double-submission guard: same list, same queue, within 5 minutes
  var sig=sbParseAsins(raw).asins.join(',');
  var prev=SB_LAST_PASTE[qid];
  if(prev && prev.sig===sig && (Date.now()-prev.at)<5*60000){
    if(!confirm('This looks like the same list you just submitted.\n\n'
      +sbParseAsins(raw).asins.length+' ASINs, identical to '+Math.round((Date.now()-prev.at)/1000)+'s ago.\n\n'
      +'Append it anyway?')) return;
  }

  btn.disabled=true; btn.textContent='Submitting…';
  var r=await sbSubmit(qid, raw, {by:'Sarah'});
  btn.disabled=false;

  if(!r.ok){ res.className='sbi-result bad'; res.textContent=r.msg; btn.textContent='Submit'; return; }
  SB_LAST_PASTE[qid]={sig:sig, at:Date.now()};
  sbPushRecent(qid);

  var lines=['Imported: <b>'+r.added+'</b> ASIN'+(r.added===1?'':'s')];
  if(r.dupes) lines.push('Duplicates removed: <b>'+r.dupes+'</b>');
  if(r.bad)   lines.push('Not recognised: <b>'+r.bad+'</b>');
  if(r.preview){
    // He hit this FOUR times before telling me "why is nothing being sent — wtf".
    // A quiet grey footnote is not an answer when the user's intent was to send —
    // the result must be the warning, and the fix must be on the same line.
    btn.textContent='Submit to '+r.queue;
    res.className='sbi-result bad';
    res.innerHTML='<b>NOT sent — saving is switched off in this copy.</b><br>'
      +'Your '+r.added+' ASIN'+(r.added===1?'':'s')+' are still in the box above. '
      +'Turn saving on, then press Submit again and it will go for real.'
      +'<div class="sbi-back-acts">'
      +(typeof enableLiveWrites==='function'
          ? '<button class="sbi-mini ok" onclick="enableLiveWrites()">🔓 Switch saving on & reload</button>':'')
      +'<a class="sbi-mini" href="https://jackbithellamazon.github.io/shifttrack/" target="_blank">Open the live app ↗</a>'
      +'</div>';
    return;
  }
  lines.push('Batch size now: <b>'+r.total+'</b>');
  lines.push(r.manual ? 'Waiting for Jack to assign it'
    : (r.splitInto ? ('Split into <b>'+r.splitInto+' batches</b> — one each for <b>'+escHtml(String(r.assignedTo).replace('Jack','you'))+'</b>')
                   : ('Sent to <b>'+vaDisp(r.assignedTo)+'</b>')));
  if(sbIsBackdated()) lines.push('Filed under <b>'+sbDayLabel(sbWorkDate())+'</b>');
  SB_FLASH='<b>✓ '+escHtml(r.queue||'')+'</b> — '+lines.join('<br>');
  // reload so the chip counts and the "already in" list are true, then repaint
  try{ await sbLoadBatches(true); }catch(e){}
  sbRenderImport();
}
function sbRenderImport(){
  var el=document.getElementById('sb-import-content'); if(!el) return;
  el.innerHTML=sbImportHTML();
}
function sbOpenImport(){
  sbLoadQueues().then(function(){ return sbLoadBatches(true); }).then(function(){
    try{ sbRenderImport(); }catch(e){}
  });
}
