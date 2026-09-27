// ╔══════════════════════════════════════════════════════════╗
// ║  SHIFTTRACK CONFIG — paste your values below            ║
// ╚══════════════════════════════════════════════════════════╝
// A copy served from localhost is a PREVIEW/dev copy — it may read the live data but it
// must never WRITE to it. The real app runs from a file:// or a hosted domain, so this
// only ever silences a dev server. (Test writes from a preview have polluted the shared
// settings row before; this makes that structurally impossible.)
// Anything that isn't the real hosted app is a sandbox: no cloud writes, no Discord.
// file:// counts — a copy opened straight off the disk was how test rows leaked into
// live_status/draft_shifts before. The real app is always served over http(s).
/* ── fetch with a deadline ────────────────────────────────────────────────────
   Every one of this app's ~60 fetches was unbounded. On the VAs' Philippine
   connection or Jack's hotel wifi a request can hang indefinitely — the socket
   never errors, the promise never settles, and the panel sits on "Fetching…"
   until the tab is closed. That is the "super slow or just doesn't load" bug.
   A deadline turns an invisible hang into an ordinary, catchable failure. */
/* ── loading skeletons ────────────────────────────────────────────────────────
   A grey "Fetching…" line tells you nothing about what is coming and, worse, an
   empty panel showing 0s looks like real data. These mirror the SHAPE of the
   content that is about to land, so the layout doesn't jump when it arrives. */
function skLine(w,h){ return '<div class="sk" style="width:'+(w||'100%')+';height:'+(h||13)+'px;"></div>'; }
function skCard(inner,pad){
  return '<div class="sk-card" style="padding:'+(pad||'15px 16px')+';">'+inner+'</div>';
}
function skTiles(n,cols){
  var out='';
  for(var i=0;i<(n||4);i++){
    out+=skCard(skLine('45%',10)+'<div style="height:11px"></div>'+skLine('58%',26)+'<div style="height:10px"></div>'+skLine('100%',6));
  }
  return '<div class="sk-grid" style="--skc:'+(cols||n||4)+'">'+out+'</div>';
}
function skRows(n,pad){
  var out='';
  for(var i=0;i<(n||4);i++){
    out+=skCard('<div style="display:flex;align-items:center;gap:12px;">'
      +'<div class="sk" style="width:32px;height:32px;border-radius:9px;flex:0 0 auto;"></div>'
      +'<div style="flex:1;min-width:0;">'+skLine((55+((i*13)%30))+'%',12)+'<div style="height:7px"></div>'+skLine('34%',10)+'</div>'
      +'<div class="sk" style="width:58px;height:22px;border-radius:999px;flex:0 0 auto;"></div>'
      +'</div>', pad);
  }
  return out;
}
/* two VA cards, the shape the Live tab always resolves to */
function skLive(){
  function card(){
    return skCard(skLine('30%',17)+'<div style="height:13px"></div>'
      +skLine('72%',12)+'<div style="height:14px"></div>'
      +'<div class="sk-grid" style="--skc:4;gap:8px;">'
        +skLine('100%',34)+skLine('100%',34)+skLine('100%',34)+skLine('100%',34)
      +'</div>'
      +'<div style="height:12px"></div>'+skLine('100%',6),'14px 16px');
  }
  return '<div class="sk-note">Checking who&rsquo;s on shift&hellip;</div>'
    +'<div class="sk-grid" style="--skc:2;">'+card()+card()+'</div>';
}
/* ── PREVIEW-MODE BANNER ─────────────────────────────────────────────────────
   IS_PREVIEW blocks every cloud + Discord write. That is correct for a sandbox,
   but it was INVISIBLE: opening the file straight off disk (file://) put the app
   in preview, and real lead decisions were discarded while the UI said
   "written to sheet ✓". Nothing that silently drops your work may be silent. */
function previewBanner(){
  try{
    if(!IS_PREVIEW) return;
    if(document.getElementById('preview-bar')) return;
    var isFile=(location.protocol==='file:');
    var b=document.createElement('div');
    b.id='preview-bar';
    b.innerHTML='<span class="pv-dot"></span>'
      +'<div><b>Nothing you do here is being saved.</b>'
      +'<span>'+(isFile
        ? 'This copy was opened straight from your computer, so decisions, ticks and notes are <u>discarded</u>. Switch saving on if this is really you.'
        : 'Running on a local test server, so cloud writes are off.')+'</span></div>'
      +(isFile?'<button class="pv-go" onclick="enableLiveWrites()">Switch saving on</button>'
              +'<a class="pv-alt" href="https://jackbithellamazon.github.io/shifttrack/">or open the live app &#8594;</a>':'');
    document.body.appendChild(b);
    document.body.classList.add('has-preview-bar');
  }catch(e){}
}
function liveFromFileBanner(){
  try{
    if(IS_PREVIEW || location.hostname) return;          // only the unlocked file:// case
    if(document.getElementById('livefile-bar')) return;
    /* Jack: "get rid of this banner". It told him something he already knows and took a
       permanent strip off the bottom of every screen. Now a small dot in the corner:
       still visible that writes are live, still one click to turn off, no lost space. */
    var b=document.createElement('div'); b.id='livefile-bar'; b.className='lf-dot';
    b.title='Saving is ON — everything here writes to the real data. Click to turn off.';
    b.innerHTML='<i></i><span>saving on</span>'
      +'<button onclick="disableLiveWrites()" title="Stop writing to the real data">off</button>';
    document.body.appendChild(b);   // no has-preview-bar: the page keeps its full height
  }catch(e){}
}
/* ── STALE-BUILD NUDGE ────────────────────────────────────────────────────────
   Three times in one day Jack reported bugs that were already fixed — his header
   said v38.0 while v41.x sat in Downloads. A stale copy looks identical to a
   current one, so nothing ever told him. The shipped version number lives in
   app_flags (written at ship time); every copy checks it on boot and owns up when
   it is behind. Dismiss remembers PER VERSION, so it comes back only when he falls
   behind again. Preview copies stay silent — they are meant to be whatever they are. */
function staleBuildNudge(){
  try{
    if(IS_PREVIEW||!DB_ENABLED) return;
    fetchT(SUPABASE_URL+'/rest/v1/app_flags?k=eq.latest_build&select=v',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(rows){
      var latest=rows&&rows[0]&&String(rows[0].v||'').trim(); if(!latest) return;
      function vn(s){ var m=String(s).match(/^v?(\d+)(?:\.(\d+))?/); return m?(+m[1]*1000+(+m[2]||0)):0; }
      if(vn(latest)<=vn(APP_VERSION)) return;
      try{ if(lsGet('bdl_vnudge')===latest) return; }catch(e){}
      var b=document.createElement('div'); b.id='vnudge';
      b.innerHTML='&#9888; <b>This copy is '+escHtml(APP_VERSION)+' &mdash; '+escHtml(latest)
        +' is the newest.</b> <span>Bugs fixed since then will still show here. '
        +'Open the latest file from Downloads, or hard-refresh the live app (Ctrl+Shift+R).</span>'
        +'<button onclick="try{lsPut(\'bdl_vnudge\',this.dataset.v)}catch(e){};this.parentNode.remove()" data-v="'+escHtml(latest)+'">Got it</button>';
      document.body.appendChild(b);
    }).catch(function(){});
  }catch(e){}
}
/* On load: if this device holds a live shift, go straight back into it. Runs
   before anything can render the login screen. See liveLocalShift() above. */
(function(){
  function autoResume(){
    try{
      if(typeof IS_PREVIEW!=='undefined'&&IS_PREVIEW) return;
      if(typeof liveLocalShift!=='function'||typeof selectVA!=='function'){ return setTimeout(autoResume,250); }
      if(window.state&&state.shiftStart) return;              // already in a shift
      if(/[?&]import=1/.test(location.search)) return;         // Sarah's page
      var live=liveLocalShift(); if(!live) return;
      window._autoResumed=live.va;
      selectVA(live.va);
      setTimeout(function(){
        try{ showToast('\u21ba Shift restored automatically \u2014 the page had reloaded'); }catch(e){}
      },1400);
    }catch(e){}
  }
  if(document.readyState!=='loading') setTimeout(autoResume,260);
  else document.addEventListener('DOMContentLoaded',function(){ setTimeout(autoResume,260); });
})();
if(document.readyState!=='loading') setTimeout(function(){ previewBanner(); liveFromFileBanner(); staleBuildNudge(); },300);
else document.addEventListener('DOMContentLoaded',function(){ setTimeout(function(){ previewBanner(); liveFromFileBanner(); staleBuildNudge(); },300); });
