/* ── CLEAR THE OBVIOUS NO'S ─────────────────────────────────────────────────
   He has 836 undecided leads and gets through ~12 a session. 201 of them are
   near-certain passes — nothing selling, or under £3 a unit — and they sit
   between him and the 65 genuinely strong ones. Deciding those one at a time is
   hours of clicking for a foregone conclusion.
   This marks them in one pass, with a REASON attached so the analysis still
   explains itself, and a single Undo that puts every one of them back. */
/* ── FOCUS QUEUE ────────────────────────────────────────────────────────────
   Jack: "600+ leads is overwhelming icl". The list has never been the problem —
   the COUNT is. 639 undecided is not a to-do list, it is a wall, and a wall gets
   avoided. So: hand him a finite, ranked handful, tell him how long it will take,
   and show it emptying. Everything else stays exactly where it is; this only
   narrows what getF() returns while it is running. */
var FOCUS_N=20, FOCUS_SECS=28;                 // 28s/lead ≈ his measured pace
window._focus=null;
/* `leads` is a script-scoped let; window.leads is only a mirror synced at load, so
   reading the mirror here would count a stale set after any refresh. Prefer the live one. */
function allLeads(){ try{ return leads||[]; }catch(e){ return window.leads||[]; } }
function focusUndecided(){
  return allLeads().filter(function(l){ return !l.status&&l.islead===null; });
}
/* pick the ones actually worth his attention: skip anything the bulk rules would
   kill anyway (that is a one-tap job, not a 28-second job), best score first,
   freshest as the tiebreak so the queue is stable. */
function focusPick(n){
  var pool=(typeof getFNoFocus==='function')?getFNoFocus():focusUndecided();
  pool=pool.filter(function(l){ return !l.status&&l.islead===null; });
  var obvious=pool.filter(function(l){ return BULK_RULES.some(function(r){ return r.test(l); }); });
  var worth=pool.filter(function(l){ return obvious.indexOf(l)<0; });
  var src=worth.length>=Math.min(5,n)?worth:pool;
  src=src.slice().sort(function(a,b){
    var sa=(a._sc&&a._sc.total)||0, sb=(b._sc&&b._sc.total)||0;
    if(sb!==sa) return sb-sa;
    var da=sbToISO?(sbToISO(a.date)||''):'', db=sbToISO?(sbToISO(b.date)||''):'';
    if(da!==db) return db<da?-1:1;
    return 0;
  });
  return src.slice(0,n);
}
function focusStart(n){
  n=n||FOCUS_N;
  var picked=focusPick(n);
  if(!picked.length){ ldToast('Nothing undecided to focus on'); return; }
  var set={}; picked.forEach(function(l){ set[l.id]=1; });
  window._focus={set:set, ids:picked.map(function(l){ return l.id; }), total:picked.length, done:0};
  window._ldPainted=false;                     // let it open the first one
  renderList();
  try{ document.getElementById('list-scroll').scrollTop=0; }catch(e){}
  ldToast('Focus: '+picked.length+' leads · about '+focusMins(picked.length));
}
function focusStop(){ window._focus=null; renderList(); }
function focusMins(n){
  var m=Math.round(n*FOCUS_SECS/60);
  return m<1?'a minute':(m+' min');
}
function focusLeft(){
  if(!window._focus) return 0;
  return allLeads().filter(function(l){
    return window._focus.set[l.id] && !l.status && l.islead===null; }).length;
}
function focusEntryHTML(){
  var f=window._focus;
  if(f){
    var left=focusLeft(), done=f.total-left, pct=f.total?Math.round(done/f.total*100):0;
    if(!left) return '<div class="fq fq-done">'
      +'<div class="fq-t">✅ That’s '+f.total+' done'+(done?' — about '+focusMins(done)+' of work':'')+'.</div>'
      +'<div class="fq-b"><button class="fq-go" onclick="focusStart('+FOCUS_N+')">Next '+FOCUS_N+'</button>'
      +'<button class="fq-x" onclick="focusStop()">Back to everything</button></div></div>';
    return '<div class="fq">'
      +'<div class="fq-t">Focus &middot; <b>'+left+'</b> left of '+f.total
      +' <span class="fq-sub">about '+focusMins(left)+' &mdash; the rest can wait</span></div>'
      +'<div class="fq-bar"><i style="width:'+pct+'%"></i></div>'
      +'<div class="fq-b"><button class="fq-x" onclick="focusStop()">Show everything again</button></div></div>';
  }
  var und=focusUndecided().length;
  if(und<FOCUS_N+10) return '';
  return '<button class="fq-entry" onclick="focusStart('+FOCUS_N+')" '
    +'title="Hides everything except the '+FOCUS_N+' highest-scoring undecided leads">'
    +'🎯 Best <b>'+FOCUS_N+'</b> of '+und+' <span>&middot; '+focusMins(FOCUS_N)+'</span></button>';
}
var BULK_RULES=[
  {k:'dead',   label:'Nothing selling',        sub:'under 10 sales a month',  why:'demand',
   test:function(l){ return spmNum(l.spm)<10; }},
  {k:'thin',   label:'Under £3 profit',        sub:'not worth the handling',  why:'profit',
   test:function(l){ return (+l.profit||0)<3; }},
  {k:'lowroi', label:'ROI under 10%',          sub:'below your floor',        why:'roi',
   test:function(l){ return (+l.roi||0)<10; }}
];
function spmNum(v){ var m=String(v==null?'':v).match(/\d+/); return m?parseInt(m[0],10):0; }
var BULK_ON={dead:true,thin:true,lowroi:false};
function bulkToggle(k){ BULK_ON[k]=!BULK_ON[k]; bulkPaint(); }
function bulkMatches(){
  var on=BULK_RULES.filter(function(r){ return BULK_ON[r.k]; });
  if(!on.length) return [];
  return (window.leads||[]).filter(function(l){
    if(l.status||l.islead!==null) return false;              // never touch a decided lead
    return on.some(function(r){ return r.test(l); });
  });
}
function bulkWhyFor(l){
  var on=BULK_RULES.filter(function(r){ return BULK_ON[r.k] && r.test(l); });
  return on.length?on[0].why:'demand';
}
function bulkPaint(){
  var host=document.getElementById('bulk-panel'); if(!host) return;
  host.innerHTML=bulkHTML();
}
function bulkHTML(){
  var m=bulkMatches();
  var byVa={}; m.forEach(function(l){ var v=vaDisp(l.va)||l.va; byVa[v]=(byVa[v]||0)+1; });
  var undecided=(window.leads||[]).filter(function(l){ return !l.status&&l.islead===null; }).length;
  return '<div class="bk">'
    +'<div class="bk-h"><b>Clear the obvious no’s</b>'
      +'<span>'+undecided+' undecided · this would clear <b>'+m.length+'</b></span>'
      +'<button class="bk-x" onclick="bulkClose()">✕</button></div>'
    +'<div class="bk-rules">'
      + BULK_RULES.map(function(r){
          var n=(window.leads||[]).filter(function(l){ return !l.status&&l.islead===null&&r.test(l); }).length;
          return '<button class="bk-rule'+(BULK_ON[r.k]?' on':'')+'" onclick="bulkToggle(\''+r.k+'\')">'
            +'<b>'+escHtml(r.label)+'</b><em>'+escHtml(r.sub)+'</em><u>'+n+'</u></button>';
        }).join('')
    +'</div>'
    +(m.length
      ? '<div class="bk-who">'+Object.keys(byVa).map(function(v){ return escHtml(v)+' '+byVa[v]; }).join(' · ')
          +' — each gets marked <b>NOT a lead</b> with the reason, written to their sheet.</div>'
        +'<button class="bk-go" onclick="bulkApply()">Mark all '+m.length+' as NOT ➜</button>'
      : '<div class="bk-who">Nothing matches those rules right now.</div>')
    +'<div class="bk-note">You can undo this in one click straight after.</div>'
  +'</div>';
}
function bulkOpen(){
  var host=document.getElementById('bulk-panel');
  if(!host){ host=document.createElement('div'); host.id='bulk-panel';
    var lv=document.getElementById('view-leads'); (lv||document.body).appendChild(host); }
  host.style.display='block'; bulkPaint();
}
function bulkClose(){ var h=document.getElementById('bulk-panel'); if(h) h.style.display='none'; }
var _bulkUndo=null;
async function bulkApply(){
  var m=bulkMatches();
  if(!m.length) return;
  if(IS_PREVIEW){ ldToast('Preview mode — nothing was marked',true); return; }
  _bulkUndo=m.map(function(l){ return {id:l.id,_sid:l._sid,status:l.status,islead:l.islead,notes:l.notes}; });
  var payload=m.map(function(l){
    var r=reasonBy(bulkWhyFor(l));
    l.status='passed'; l.islead=false; l.seen=true;
    l.notes='[why:'+r.c+'] '+r.l;
    return {id:l._sid, status:'NOT', islead:'NOT LEAD', jack_comment:l.notes,
            writeback_pending:true, decided_at:new Date().toISOString()};
  });
  try{
    var res=await fetchT(SUPABASE_URL+'/rest/v1/leads',{method:'POST',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
        'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(payload)});
    if(!res.ok){ ldToast('Couldn’t save that — nothing was changed',true); bulkRestore(); return; }
  }catch(e){ ldToast('Couldn’t save that — nothing was changed',true); bulkRestore(); return; }
  m.forEach(function(l){ try{ logDecision(l); }catch(e){} });
  bulkClose(); renderList();
  ldToast(m.length+' marked NOT — writing to the sheets');
  try{ if(typeof wbFlushPending==='function') wbFlushPending(true); }catch(e){}
  bulkUndoToast(m.length);
}
function bulkRestore(){
  if(!_bulkUndo) return;
  _bulkUndo.forEach(function(u){
    var l=(window.leads||[]).find(function(x){ return x.id===u.id; });
    if(l){ l.status=u.status; l.islead=u.islead; l.notes=u.notes; }
  });
  renderList();
}
function bulkUndoToast(n){
  var old=document.getElementById('bk-undo'); if(old) old.remove();
  var d=document.createElement('div'); d.id='bk-undo'; d.className='sb-bin-toast';
  d.innerHTML='<span>Marked <b>'+n+'</b> as NOT</span><button onclick="bulkUndo()">↺ Undo all</button>';
  document.body.appendChild(d);
  clearTimeout(window._bkT);
  window._bkT=setTimeout(function(){ var x=document.getElementById('bk-undo'); if(x) x.remove(); _bulkUndo=null; },15000);
}
async function bulkUndo(){
  if(!_bulkUndo||!_bulkUndo.length){ ldToast('Too late to undo that',true); return; }
  var back=_bulkUndo.slice(); _bulkUndo=null;
  var x=document.getElementById('bk-undo'); if(x) x.remove();
  var payload=back.map(function(u){ return {id:u._sid,status:null,islead:null,
    jack_comment:u.notes||'',writeback_pending:true}; });
  try{
    await fetchT(SUPABASE_URL+'/rest/v1/leads',{method:'POST',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
        'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(payload)});
  }catch(e){}
  bulkRestore();
  ldToast(back.length+' put back ✓');
  try{ if(typeof wbFlushPending==='function') wbFlushPending(true); }catch(e){}
}
function litemH(l){
  const s=l._sc,col=scCol(s.total);
  const _wy=(typeof reasonOf==='function')?reasonOf(l.notes):null;
  const vc=l.va==='VA M'?'va-m':'va-s';
  /* --mera (#b23bff) measures 4.42:1 at 10px on 86 rows — just under AA. Lightened
     here only; the identity purple used everywhere else stays as it is. */
  const vcol=l.va==='VA M'?'#cf9bff':'var(--suz)';
  const [stxt,scls]=statusInfo(l);
  const stale=isStale(l),fresh=isFresh(l)&&l.islead===null&&!l.status;
  /* Sorting by score renders a flat list with no date headings — so without this the
     row said nothing about WHEN the lead arrived. Short date always, badge alongside. */
  const _short=(function(){
    var p=String(l.date||'').split('/');
    if(p.length!==3) return ageTxt(l.hrs);
    var d=new Date(+p[2],+p[1]-1,+p[0]);
    if(isNaN(d.getTime())) return ageTxt(l.hrs);
    var t; try{ t=ukNow(); }catch(e){ t=new Date(); }
    var dd=Math.round((new Date(t.getFullYear(),t.getMonth(),t.getDate())-d)/86400000);
    if(dd===0) return 'today';
    if(dd===1) return 'yesterday';
    if(dd<7) return dd+'d ago';
    return p[0]+'/'+p[1];
  })();
  const flag=`<span class="litem-when">${_short}</span>`
    +(stale?`<span class="litem-stale-flag">⚠ stale</span>`
      :fresh?`<span class="litem-fresh-flag">● fresh</span>`:``);
  // when the twin row has been merged away, say so on the survivor
  const _twinCross=(l._twinN>0)&&(l._twinVAs||[]).some(function(v){ return v!==l.va; });
  /* "BOTH VAs" made Jack go hunting for a second copy he could not see. Name the
     people instead \u2014 "Mera + Suz \u00b7 1 row" is checkable, "BOTH VAs" is a claim. */
  const twinChip=(l._twinN>0)
    ? (_twinCross
        ? '<span class="dup-tag dup-cross" title="Both sent this ASIN with the same supplier and the same buy price \u2014 shown once. Deciding it decides all of them. The card below lists each copy with its date.">'
          +(function(){ var names={}; names[vaDisp(l.va)]=1; (l._twinVAs||[]).forEach(function(v){ names[vaDisp(v)]=1; }); return escHtml(Object.keys(names).join(' + ')); })()+' \u00b7 1 row</span>'
        : '<span class="dup-tag dup-same" title="'+escHtml(vaDisp(l.va))+' sent this ASIN '+(l._twinN+1)+' times with the same supplier and buy price \u2014 shown once. Deciding it decides all of them.">'
          +escHtml(vaDisp(l.va))+' \u00d7'+(l._twinN+1)+' \u00b7 1 row</span>')
    : '';
  const dupChip=(l._twinN>0)?twinChip:dupeBadge(l);
  const quick=(l.islead===null&&!l.status)
    ?`<div class="litem-quick">
        <button class="lq-btn lq-yes" title="Mark as Lead (L)" onclick="event.stopPropagation();setL(${l.id},true)">✓</button>
        <button class="lq-btn lq-no" title="Not a Lead (N)" onclick="event.stopPropagation();setL(${l.id},false)">✕</button>
      </div>`:'';
  const dup=dupeOf(l);
  const dupCls=dup?(dup.sameVA?' dup-row-same':' dup-row-cross'):'';
  return`<div class="litem ${vc}${l.id===selId?' sel':''}${stale?' stale':''}${(l.status||l.islead!==null)?' decided':''}${dupCls}" data-lid="${l.id}" onclick="selectLead(${l.id},true)">
    ${leadThumb(leadUseAsin(l),'litem-thumb',leadAsinConflict(l)?'':l.image)}
    <div class="litem-body">
    <div class="litem-top">
      <span class="litem-score" style="background:${col}">${s.total.toFixed(1)}</span>
      <span class="litem-va" style="color:${vcol}">●${vaShort(l)}</span>
      ${flag}${dupChip}
      <span class="litem-status ${scls}" style="margin-left:auto">${stxt}</span>
    </div>
    <div class="litem-title">${l.title}</div>
    <div class="litem-foot">
      <span class="litem-store" style="color:${storeCol(l.store)}">${l.store}</span>
      <span class="litem-stat ${roiC(l.roi)}"><span>ROI</span>${l.roi}%</span>
      <span class="litem-stat ${profC(l.profit)}"><span>£</span>${f2(l.profit)}</span>
      <span class="litem-stat ${spmC(l.spm)}"><span>SPM</span>${spml(l.spm)}</span>
    </div>
    <div class="litem-method">
      <span class="litem-method-pill">${l.src}</span>
      ${(typeof leadBandChip==='function')?leadBandChip(l):''}
      <span class="litem-stat ${fbaC(l.fba)}" style="font-size:9.5px;color:var(--t3)"><span>Sellers</span>${l.fba}</span>
      ${noteChipHTML(l)}
      ${_wy?`<span class="litem-why k-${_wy.k}" title="${_wy.k==='score'?'the score could catch this':_wy.k==='data'?'the lead info was wrong':'nothing to do with the score'}">${_wy.l}</span>`:''}
    </div>
    </div>
    ${quick}
  </div>`;
}
function selectLead(id,scroll){
  var _same=(selId===id);
  var _pane0=document.getElementById('detail-pane');
  var _keepScroll=_same&&_pane0?_pane0.scrollTop:0;
  // moving to a different lead is the signal that he's finished with the decided one
  try{ if(_pendingLeave!=null && _pendingLeave!==id){ var _p=_pendingLeave; _pendingLeave=null;
       var _l=(window.leads||[]).find(function(x){ return x.id===_p; });
       if(_l && !leadStillBelongs(_l)) setTimeout(function(){ try{ showDecisionUndo(_l); }catch(e){} },30); } }catch(e){}
  selId=id;
  document.querySelectorAll('#view-leads .litem').forEach(x=>x.classList.toggle('sel',+x.dataset.lid===id));
  const l=leads.find(x=>x.id===id);if(!l)return;
  if(!l.seen){l.seen=true;markSeen(l._sid);updateCounts();}
  applyVA(l);
  var _pane=document.getElementById('detail-pane');
  _pane.innerHTML=detailH(l);
  // moving to a NEW lead starts at the top; restyling the one you're on keeps your place
  _pane.scrollTop=_same?_keepScroll:0;
  if(scroll && window.innerWidth<=760) document.getElementById('view-leads').classList.add('show-detail');
}
function ldBack(){ document.getElementById('view-leads').classList.remove('show-detail'); }
function emptyDetail(){return`<div class="detail-empty">${ICO.inbox}<div style="font-size:15px;font-weight:600">Select a lead to view details</div></div>`;}
/* Gyazo (and Imgur) hand out PAGE urls; the direct image needs a different host or
   an extension, otherwise an <img> silently fails. */
/* ── LIGHTSHOT ──────────────────────────────────────────────────────────────
   Gyazo works because gyazo.com/<id> -> i.gyazo.com/<id>.png is a straight swap.
   Lightshot is not: prnt.sc/btFKr1mSyAhL holds its image at
   img.lightshot.app/WqdhqgnRToCRUDVbFwrWyA.png — a DIFFERENT hash that only exists in
   the page's og:image tag, and the browser cannot read that page (CORS).
   Measured on Jack's board: 319 of 775 screenshots are prnt.sc, so 41% never previewed.
   The direct file itself is fine to embed — checked: HTTP 200, image/png, cached a
   year, no referrer check. Only the lookup needs a server, and Jack already runs one
   (the Apps Script that writes decisions back to the sheets).
   Resolved links are cached in app_flags, so each screenshot costs one lookup ever,
   for everyone. With no endpoint configured nothing breaks — the row keeps the same
   "preview unavailable, opens in a new tab" state it has today. */
var SHOT_CACHE=(function(){ try{ return JSON.parse(lsGet('bdl_shotmap')||'{}'); }catch(e){ return {}; } })();
function shotCode(u){
  var m=String(u||'').match(/^https?:\/\/(?:www\.)?prnt\.sc\/([A-Za-z0-9_-]+)/i);
  return m?m[1]:'';
}
function shotImg(u){
  u=String(u||'').trim();
  var g=u.match(/^https?:\/\/(?:www\.)?gyazo\.com\/([a-f0-9]{16,})/i);
  if(g) return 'https://i.gyazo.com/'+g[1]+'.png';
  /* Found by testing every shape a VA can produce: imgur.com/a/<id> is an ALBUM
     page, not a picture, and the old single-segment regex let it through to an <img>
     that could only fail. Albums and galleries get the same honest "opens in a new
     tab" as prnt.sc; single images still swap to the direct file. */
  if(/^https?:\/\/(?:www\.)?imgur\.com\/(a|gallery|t)\//i.test(u)) return '';
  var im=u.match(/^https?:\/\/(?:www\.)?imgur\.com\/([A-Za-z0-9]{5,})$/i);
  if(im) return 'https://i.imgur.com/'+im[1]+'.png';
  /* ImgBB gives TWO shapes: i.ibb.co/<id>/<name>.png is the picture and previews as
     it stands, while ibb.co/<id> is a web page and can only ever fail in an <img>.
     There is no swap that turns the page into the picture, so say so plainly rather
     than firing a doomed request on every scroll — the same trap prnt.sc set. */
  if(/^https?:\/\/(?:www\.)?ibb\.co\//i.test(u)) return '';
  var c=shotCode(u);
  if(c && SHOT_CACHE[c]) return SHOT_CACHE[c];      // already resolved once
  /* NEVER hand an unresolved prnt.sc link to an <img>. It is an HTML page, not an
     image, so the request can only ever fail — but it is still a REQUEST, fired
     from Jack's own browser, once per unresolved screenshot, every time he scrolls
     the leads board. 57 of those on repeat is what a bot filter is built to stop,
     and on 13/08 Cloudflare banned his home IP outright (error 1006). Return ''
     and let the caller draw the "opens in a new tab" state without asking. */
  if(c) return '';
  return u;
}
function shotCachePut(code,url){
  if(!code||!url) return;
  SHOT_CACHE[code]=url;
  try{ lsPut('bdl_shotmap',JSON.stringify(SHOT_CACHE)); }catch(e){}
  try{
    fetch(SUPABASE_URL+'/rest/v1/app_flags',{method:'POST',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
               'Content-Type':'application/json',Prefer:'resolution=merge-duplicates'},
      body:JSON.stringify({k:'shot:'+code,v:url})}).catch(function(){});
  }catch(e){}
}
/* Pull every already-resolved link in one request at startup, so a screenshot resolved
   on Jack's laptop is instant on his phone. */
async function shotCacheLoad(){
  try{
    var r=await fetchT(SUPABASE_URL+'/rest/v1/app_flags?k=like.shot:*&select=k,v',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
    if(!r.ok) return;
    (await r.json()||[]).forEach(function(row){
      if(row&&row.k) SHOT_CACHE[String(row.k).slice(5)]=row.v;
    });
    try{ lsPut('bdl_shotmap',JSON.stringify(SHOT_CACHE)); }catch(e){}
  }catch(e){}
}
/* One lookup through the Apps Script. Returns the direct URL, or '' if it cannot. */
async function shotResolve(u){
  var code=shotCode(u); if(!code) return '';
  if(SHOT_CACHE[code]) return SHOT_CACHE[code];
  var c=(typeof wbCfg==='function')?wbCfg():null;
  if(!c||!c.url||!c.token) return '';
  if(window._shotBusy&&window._shotBusy[code]) return '';
  window._shotBusy=window._shotBusy||{}; window._shotBusy[code]=1;
  try{
    var res=await fetch(c.url,{method:'POST',redirect:'follow',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({token:c.token,action:'shot',url:'https://prnt.sc/'+code})});
    if(!res.ok) return '';
    var j=await res.json();
    if(j&&j.ok&&j.image){ shotCachePut(code,j.image); return j.image; }
  }catch(e){}
  finally{ delete window._shotBusy[code]; }
  return '';
}
/* Called when an <img> fails: try to resolve it, and swap it in if we can. */
function shotFix(img,u){
  try{
    var el=img&&img.closest?img.closest('.d-shot'):null;
    if(el) el.classList.add('d-shot-fail');
    if(!shotCode(u)) return;
    shotResolve(u).then(function(direct){
      if(!direct||!img) return;
      img.onerror=null; img.src=direct;
      if(el) el.classList.remove('d-shot-fail');
    });
  }catch(e){}
}

/* ── SCREENSHOT VIEWER ─────────────────────────────────────────────────────
   Jack: "ideally want it fully in my webapp". Opening a new tab loses the lead, the
   filters and his place in the queue every single time. This shows the whole shot over
   the app: click to zoom to full size and drag to pan, Esc or click the backdrop to
   come back to exactly where he was. */
function shotOpen(url,title){
  url=shotImg(url); if(!url) return;
  var old=document.getElementById('shot-viewer'); if(old) old.remove();
  var v=document.createElement('div');
  v.id='shot-viewer'; v.className='shotv';
  v.innerHTML='<div class="shotv-bar">'
      +'<span class="shotv-t">'+escHtml(title||'VA screenshot')+'</span>'
      +'<span class="shotv-hint">click the image to zoom · drag to move · Esc to close</span>'
      +'<a class="shotv-ext" href="'+String(url).replace(/"/g,'&quot;')+'" target="_blank" rel="noopener">Open original ↗</a>'
      +'<button class="shotv-x" title="Close (Esc)">✕</button>'
    +'</div>'
    +'<div class="shotv-body"><img alt="VA screenshot" src="'+String(url).replace(/"/g,'&quot;')+'"></div>';
  document.body.appendChild(v);
  var body=v.querySelector('.shotv-body'), img=v.querySelector('img');
  function close(){ try{ v.remove(); }catch(e){} document.removeEventListener('keydown',onKey); }
  function onKey(e){ if(e.key==='Escape'){ e.preventDefault(); close(); } }
  document.addEventListener('keydown',onKey);
  v.querySelector('.shotv-x').onclick=close;
  v.onclick=function(e){ if(e.target===v||e.target===body) close(); };
  img.onclick=function(e){
    e.stopPropagation();
    var zoomed=img.classList.toggle('zoom');
    if(zoomed){
      // keep the point clicked under the cursor when it blows up
      var r=img.getBoundingClientRect();
      var fx=(e.clientX-r.left)/r.width, fy=(e.clientY-r.top)/r.height;
      body.scrollLeft=fx*img.offsetWidth-body.clientWidth/2;
      body.scrollTop =fy*img.offsetHeight-body.clientHeight/2;
    }
  };
  // drag to pan while zoomed
  var down=false,sx=0,sy=0,sl=0,st=0;
  body.addEventListener('mousedown',function(e){ if(!img.classList.contains('zoom'))return;
    down=true; sx=e.clientX; sy=e.clientY; sl=body.scrollLeft; st=body.scrollTop; e.preventDefault(); });
  window.addEventListener('mousemove',function(e){ if(!down)return;
    body.scrollLeft=sl-(e.clientX-sx); body.scrollTop=st-(e.clientY-sy); });
  window.addEventListener('mouseup',function(){ down=false; });
  img.onerror=function(){
    body.innerHTML='<div class="shotv-fail">That screenshot didn’t load.<br>'
      +'<a href="'+String(url).replace(/"/g,'&quot;')+'" target="_blank" rel="noopener">Try opening it directly ↗</a></div>';
  };
}
/* afterDecision/selectLead both wanted this and it was never defined — every call
   threw and fell back to a whole-list repaint, which is the flicker Jack sees. */
/* Deciding a lead repaints this whole pane — title, thumbnail, the full-size VA
   screenshot, the score breakdown, everything — so pressing BOUGHT threw Jack back to
   the top of the lead and re-decoded the screenshot on the way. That is the "glitchy"
   he keeps hitting: the decision buttons are ~800px down, and the thing he pressed
   jumped off screen the instant he pressed it.
   The pane keeps its scroll position now, and the screenshot is carried over as a live
   node instead of being rebuilt from markup, so it never flashes. */
function renderDetail(){
  var host=document.getElementById('detail-pane'); if(!host) return;
  var l=(window.leads||[]).find(function(x){ return x.id===selId; });
  var sameLead=(host.dataset.lid && l && String(host.dataset.lid)===String(l.id));
  var scroller=host, top=0;
  if(sameLead){
    // the scrollable element is the pane or an ancestor, depending on the layout
    var n=host;
    while(n && n!==document.body && n.scrollHeight<=n.clientHeight+2) n=n.parentElement;
    scroller=(n&&n!==document.body)?n:host;
    top=scroller.scrollTop||0;
  }
  var oldImg=sameLead?host.querySelector('.d-shot img'):null;
  /* Jack: "I was in the middle of typing a note". This pane is rebuilt with innerHTML
     by decisions, the row refresh and anything else that repaints — and that throws away
     whatever is in the note box along with the caret and the focus. renderList() already
     refuses to repaint while leadsEditing(); the DETAIL pane never had the same guard.
     Carry the text across instead of blocking the repaint, so nothing typed is ever lost. */
  var keep=null;
  ['nb-in','mn'].forEach(function(id){
    var t=host.querySelector('#'+id);
    if(t && !keep) keep={id:id, val:t.value, s:t.selectionStart, e:t.selectionEnd,
                         had:(document.activeElement===t)};
  });
  host.innerHTML = l ? detailH(l) : emptyDetail();
  host.dataset.lid = l ? l.id : '';
  try{ ldPaintNotices(); }catch(e){}   // fold/unfold the notices strip for this selection
  if(keep){
    var t2=host.querySelector('#'+keep.id);
    // only restore into the SAME lead's box — never paste one lead's note onto another
    if(t2 && sameLead && t2.value!==keep.val){
      t2.value=keep.val;
      try{ t2.setSelectionRange(keep.s,keep.e); }catch(e){}
      if(typeof nbGrow==='function'){ try{ nbGrow(t2); }catch(e){} }
    }
    if(t2 && sameLead && keep.had){ try{ t2.focus(); t2.setSelectionRange(keep.s,keep.e); }catch(e){} }
  }
  if(sameLead){
    var newImg=host.querySelector('.d-shot img');
    // same URL and already decoded — swap the loaded node in so there is no re-fetch flash
    if(oldImg&&newImg&&oldImg.src===newImg.src&&oldImg.complete) newImg.replaceWith(oldImg);
    if(top>0) scroller.scrollTop=top;
  }
}
function detailH(l){
  const s=l._sc,col=scCol(s.total);
  const [stxt,scls]=statusInfo(l);
  /* This panel used to zip s.bd against a HARDCODED four-item reasonList left over from
     the old weighted-sum score. The matrix emits [Sales, Profit, Volume, ROI]; the list
     was still [ROI, Profit, Demand, Margin] — so "Sales per month" was captioned
     "Decent ROI" and "ROI 14.3%" was captioned "Slim margin". It also drew four bars
     that all read 10/10, two of them the same number twice, because the matrix score is
     ONE lookup and not four independent components. Explain the lookup instead. */
  const bars=(function(){
    if(s.unscored){
      return `<div class="d-mx-none">Not scored yet — needs both sales per month and profit per unit.</div>`;
    }
    const pTier=s.tier==='high'?'£9+':s.tier==='mid'?'£3–£9':'under £3';
    const spmTxt=(l.spm===null||l.spm===undefined||l.spm==='')?'—':(typeof l.spm==='number'?l.spm.toLocaleString():String(l.spm));
    const step=(n,val,chip,why)=>`<div class="d-mx-step"><div class="d-mx-l">${n}</div>`
      +`<div class="d-mx-v">${val}</div><div class="d-mx-c">${chip}</div>`
      +(why?`<div class="d-mx-w">${why}</div>`:'')+`</div>`;
    let out=step('Sales / month', spmTxt, `band <b>${s.band}</b>`, s.bandLabel||'')
          + step('Profit / unit', '£'+(parseFloat(l.profit)||0).toFixed(2),
                 `<b>${s.tierLabel||s.tier}</b> (${pTier})`, '');
    const barCol=s.base>=8?'var(--green)':s.base>=5?'var(--amber)':'var(--red)';
    out+=`<div class="d-mx-cell"><div class="d-mx-cell-top"><span><b>${s.band}</b> × <b>${s.tierLabel||s.tier}</b></span>`
       +`<span class="d-mx-pts">${s.base}/10</span></div>`
       +`<div class="d-sbar-track"><div class="d-sbar-fill" style="width:${s.base*10}%;background:${barCol}"></div></div></div>`;
    // ROI only ever ADJUSTS the cell — say what it did, including when it did nothing
    let roiTxt, roiCol;
    if(s.roiBlank){ roiTxt='not entered — the 10% check hasn’t run'; roiCol='var(--muted-2)'; }
    else if(s.roiExempt){ roiTxt=s.note||'below 10% but let off'; roiCol='var(--amber)'; }
    else if(s.roiPenalty){ roiTxt=s.note||'below 10% — docked'; roiCol='var(--red)'; }
    else { roiTxt='above 10% — no adjustment'; roiCol='var(--green)'; }
    out+=step('ROI', (s.roiBlank?'—':(Math.round((parseFloat(l.roi)||0)*10)/10)+'%'),
              `<span style="color:${roiCol}">${s.total===s.base?'no change':s.base+' → '+s.total}</span>`, '')
       + `<div class="d-mx-w" style="color:${roiCol};margin:-4px 0 10px;">${roiTxt}</div>`;
    if(s.verdict) out+=`<div class="d-mx-verdict">${s.verdict}</div>`;
    // what would move it — the question the panel never answered
    const lift=(typeof scoreLift==='function')?scoreLift(l,s):null;
    if(lift){
      const bits=[];
      if(lift.spm) bits.push(`<b>${lift.spm.need.toLocaleString()}</b> sales/month`
        +` <span class="d-lift-x">(+${lift.spm.extra.toLocaleString()})</span> \u2192 <b>${lift.spm.gain}/10</b>`);
      if(lift.profit) bits.push(`<b>\u00a3${lift.profit.need.toFixed(2)}</b> profit/unit`
        +` <span class="d-lift-x">(+\u00a3${lift.profit.extra.toFixed(2)})</span> \u2192 <b>${lift.profit.gain}/10</b>`);
      out+=bits.length
        ? `<div class="d-lift"><em>What would score higher</em>${bits.map(b=>`<div>${b}</div>`).join('')}</div>`
        : (lift.topped
            ? `<div class="d-lift top"><em>Top of the matrix</em><div>Nothing scores higher than ${s.total}/10.</div></div>`
            : `<div class="d-lift"><em>What would score higher</em><div>Nothing in reach \u2014 the next band up scores the same.</div></div>`);
    }
    return out;
  })();
  let decH='';
  if(l.islead===null){
    decH=`<div class="d-dec-row d-dec-stack"><button class="d-dec-btn dec-lead" onclick="setL(${l.id},true)">✓ Approve Lead</button><button class="d-dec-btn dec-notlead" onclick="setL(${l.id},false)">✕ Reject Lead</button></div>`;
  }else if(l.islead===true){
    const vaNm=l.va==='VA M'?vaDisp('Mera'):vaDisp('Suz');
    const _fast=(typeof wbReady==='function')&&wbReady();
    const _when=_fast?'written straight into':'queued for';
    const _tail=_fast?'':' — lands next time her sheet syncs';
    const _why=(typeof reasonOf==='function')?reasonOf(l.notes):null;
    const _rs=(typeof reasonsFor==='function')?reasonsFor(l):[];
    const _tone=l.status==='bought'?'buy':(l.status==='passed'?'no':'wait');
    const _qty=(typeof ldQty==='function')?ldQty(l):null;
    const syncNote=l.status?`
      <div class="d-actioned ${_tone}">
        <div class="d-act-top">
          <span class="d-act-badge">${stxt}</span>
          <span class="d-act-txt">${_qty&&_qty!=='na'?`<b>${_qty}</b> unit${_qty==1?'':'s'} · `:''}${_when} ${vaNm}'s sheet${_tail}</span>
          <button class="d-next" onclick="ldNextUndecided(${l.id})">Next undecided &rarr;</button>
        </div>
        ${_why
          ? `<div class="d-why set k-${_why.k}"><em>Why</em><b>${_why.l}</b>
               <span class="d-why-kind">${_why.k==='score'?'the score could catch this'
                 :_why.k==='data'?'the lead info was wrong'
                 :'nothing to do with the score'}</span>
               <button class="d-why-x" onclick="reasonSet(${l.id},'')" title="Change it">change</button></div>`
          : `<div class="d-why"><em>Why?</em>${_rs.map((r,ri)=>
               `<button class="d-why-b k-${r.k}" onclick="reasonSet(${l.id},'${r.c}')">${ri<9?`<u>${ri+1}</u>`:''}${r.l}</button>`).join('')}</div>`}
      </div>`
      :`<div class="d-sync-note ok">✓ Approved as <b>LEAD</b> — ${_when} ${vaNm}'s sheet. Now pick what happened:</div>`;
    /* Before: the six big buttons stayed at full size after a decision, directly under
       a green card already saying BOUGHT — the answer stated twice, then a third time
       by the qty box below. Three stacked panels, ~800px of them, for one keystroke.
       After a decision the row demotes to a quiet "change to" strip of the OTHER five,
       and moves BELOW the note box so the flow reads: what happened -> how many ->
       note -> next. Undecided leads are unchanged: six big buttons, nothing hidden. */
    const _opts=[['bought','BOUGHT','dec-buy'],['atbq','ATB (Q)','dec-basket'],
                 ['atba2a','ATB (A2A)','dec-basket'],['waiting','Waiting','dec-basket'],
                 ['passed','NOT','dec-pass']];
    if(l.status){
      const others=_opts.filter(o=>o[0]!==l.status)
        .map(o=>`<button class="d-chg-btn ${o[2]}" onclick="setSt(${l.id},'${o[0]}')">${o[1]}</button>`).join('');
      decH=syncNote;
      window._decChangeRow=`<div class="d-chg"><span class="d-chg-l">Change to</span>${others}`
        +`<button class="d-chg-btn dec-undo" onclick="undoA(${l.id})">↩ Undo</button></div>`;
    } else {
      window._decChangeRow='';
      decH=syncNote+`<div class="d-dec-row" style="flex-wrap:wrap">`
        +_opts.map(o=>`<button class="d-dec-btn ${o[2]}" onclick="setSt(${l.id},'${o[0]}')">${o[1]}</button>`).join('')
        +`<button class="d-dec-btn dec-undo" onclick="undoA(${l.id})">↩ Undo</button></div>`;
    }
  }else{
    const vaNm2=l.va==='VA M'?vaDisp('Mera'):vaDisp('Suz');
    const _why2=(typeof reasonOf==='function')?reasonOf(l.notes):null;
    const _rs2=LEAD_REASONS.filter(function(r){ return r.for==='no'; });
    decH=`<div class="d-actioned no">
        <div class="d-act-top">
          <span class="d-act-badge">Not a lead</span>
          <span class="d-act-txt">both columns written to ${vaNm2}'s sheet</span>
          <button class="d-next" onclick="ldNextUndecided(${l.id})">Next undecided &rarr;</button>
        </div>
        ${_why2
          ? `<div class="d-why set k-${_why2.k}"><em>Why</em><b>${_why2.l}</b>
               <span class="d-why-kind">${_why2.k==='score'?'the score could catch this'
                 :_why2.k==='data'?'the lead info was wrong — not a scoring miss'
                 :'nothing to do with the score'}</span>
               <button class="d-why-x" onclick="reasonSet(${l.id},'')">change</button></div>`
          : `<div class="d-why"><em>Why?</em>${_rs2.map((r,ri)=>
               `<button class="d-why-b k-${r.k}" onclick="reasonSet(${l.id},'${r.c}')">${ri<9?`<u>${ri+1}</u>`:''}${r.l}</button>`).join('')}</div>`}
      </div>`;
    window._decChangeRow=`<div class="d-chg"><span class="d-chg-l">Change to</span>`
      +`<button class="d-chg-btn dec-undo" onclick="undoA(${l.id})">\u21a9 Reassess this lead</button></div>`;
  }
  // note bar: appears right under the decision the moment one is clicked — write the
  // why/note here (goes to the sheet's Jack Comment column), then Next jumps on
  if(window._noteFor&&window._noteFor.id===l.id){
    const isNo=(l.islead===false||l.status==='passed');
    const isBuy=(l.status==='bought'||l.status==='atbq'||l.status==='atba2a');
    /* There were TWO reason systems stacked on a reject: the numbered why-picker on
       the card (writes structured [why:code]) AND this second strip of free-text
       chips in the note box. Different vocabularies, ~80px, and Jack saw the same
       question asked twice. One reason system: the numbered chips. The note box is
       for the free-text detail only. */
    const nbChips='';
    const mq=ldMeta(l); const qv=mq.na?'':(mq.qty!=null?mq.qty:'');
    const qtyRow=isBuy?`<div class="nb-qty">
        <span class="nb-qty-lbl">How many did you buy?</span>
        <button type="button" class="qty-btn" onclick="qtyStep(${l.id},-1)">−</button>
        <input id="qty-in" type="number" min="0" placeholder="qty" value="${qv}" oninput="setQtyLive(${l.id},this.value)">
        <button type="button" class="qty-btn plus" onclick="qtyStep(${l.id},1)">+</button>
        <button type="button" class="qty-na${mq.na?' on':''}" onclick="qtyNA(${l.id})">N/A</button>
      </div>`:'';
    decH+=`<div class="nb-wrap${isNo?' nb-no':isBuy?' nb-buy':''}">
      ${qtyRow}
      <div class="nb-lbl">${isNo?'Why is it a no? — saved to the sheet':'Note (optional) — goes to the sheet’s Jack Comment column'}</div>
      ${nbChips?`<div class="nb-chips">${nbChips}</div>`:''}
      <!-- reasonStrip: the raw note starts "[why:oos] …" and showing that tag in the
           box meant select-all-and-retype silently deleted the reason. The tag stays
           in l.notes; the box shows only the readable part; nbSave re-attaches it. -->
      <textarea id="nb-in" rows="2" placeholder="type a note… (Enter saves, Shift+Enter for a new line)"
        oninput="nbGrow(this)"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();nbSave();}">${reasonStrip(String(l.notes||'')).replace(/</g,'&lt;')}</textarea>
      <!-- These said "Save · next ➜" and "skip · next ➜" but advanceAfter() deliberately
           keeps you on the same lead (that was the whole point of the earlier fix — Jack
           kept losing his place). So the buttons were promising something the app does
           not do. Renamed to what actually happens; "Next undecided →" on the card above
           is the real way to move on. -->
      <div class="nb-row"><button class="nb-save" onclick="nbSave()">Save note</button><button class="nb-skip" onclick="nbSkip()">No note</button></div>
    </div>`;
  }
  // the change-decision strip goes last, under the note — see the comment above
  if(window._decChangeRow){ decH+=window._decChangeRow; window._decChangeRow=''; }
  const QR=['Low ROI','Low Profit','High Competition','Low Demand','Poor Listing','Other Reason'];
  const qrChips=QR.map(r=>`<button class="qr-chip" onclick="qReject(${l.id},${JSON.stringify(r)})">${r}</button>`).join('');
  const avgAll=(function(){try{var a=leads.filter(x=>x&&x._sc);return a.length?a.reduce((z,x)=>z+x._sc.total,0)/a.length:s.total;}catch(e){return s.total;}})();
  const cmp=s.total>=avgAll+0.3?['Above average','var(--green)','▲']:s.total<=avgAll-0.3?['Lower than average','var(--red)','▼']:['About average','var(--muted)','■'];
  return`<div class="detail">
    <button class="d-back" onclick="ldBack()">&#8592; Back to list</button>
    <div class="d-hero-bar"></div>
    <div class="d-workspace">
    <div class="d-main">
      <div class="d-eyebrow">
        <span class="d-va-badge">${vaShort(l)}</span>
        <span class="d-va-name">${vaName(l)}</span>
        <span class="d-eyebrow-sep">·</span>
        <span class="d-eyebrow-txt">${l._id} · added ${l.date}</span>${l.sheetRow?` <span class="d-rowref" title="Where this sits on the Google Sheet">row ${l.sheetRow}${l.sheetTab?' · '+l.sheetTab:''}</span>`:''}
        <span class="d-age-badge${isStale(l)?' stale':''}" style="margin-left:auto">${isStale(l)?'⚠ ':''}${ageTxt(l.hrs)}</span>
        <span class="d-status-tag ${scls}">${stxt}</span>
      </div>
      <!-- leadUseAsin, NOT l.asin: on 410 of 764 leads the sheet's ASIN column and the
           Amazon link name different products (chunks of the column are offset a row).
           SAS/Keepa/Amazon links were fixed to follow the link in v40.2 — but the
           thumbnail kept drawing the COLUMN's product (Jack: "image wrong", LD-0137
           showing a brush on a HIGH5 tablets lead), and the copy chip kept handing him
           the column's ASIN, which is the one provably NOT on screen. On a conflicted
           lead the stored image is dropped too — it was fetched for the wrong ASIN. -->
      <div class="d-title-row">${leadThumb(leadUseAsin(l),'d-thumb-lg',leadAsinConflict(l)?'':l.image)}<div class="d-title">${l.title}</div></div>
      <div class="d-asin-row d-asin-top">
        <button class="d-asin" onclick="cpA('${leadUseAsin(l)}',event)">${ICO.copy} ${leadUseAsin(l)}</button>
        <span class="d-asin-hint">${leadAsinConflict(l)?'Click to copy — from the link; the column says '+leadAsinConflict(l).col:'Click to copy ASIN'}</span>
      </div>
      <div class="d-tags">
        <span class="d-tag ${priCls(l)}">${priority(l)} priority</span>
        ${l.src&&l.src.trim()?`<span class="d-tag tag-src" title="${sourceType(l)} = where you buy it (${escHtml(String(l.store||'?').trim())}). ${escHtml(String(l.src))} = how it was found.">🔎 ${sourceType(l)} · found via ${l.src}</span>`:'<span class="d-tag tag-src tag-empty">🔎 source not set</span>'}
        ${l.sup&&l.sup!=='#'?`<a class="d-tag tag-sup" href="${String(l.sup).replace(/"/g,'&quot;')}" target="_blank">🏭 ${supHost(l.sup)} ↗</a>`:''}
        ${l.store&&l.store.trim()?`<span class="d-tag tag-store">${l.store}</span>`:''}
        ${l.cat&&l.cat.trim()?`<span class="d-tag tag-cat">${l.cat}</span>`:''}
        ${discountChipHTML(l)}
      </div>
      ${sigChips(l)}
      ${asinConflictHTML(l)}
      <div class="d-tags" style="display:none">
      </div>
      ${(function(){var b=leadBadges(l);return b.length?'<div class="d-badges">'+b.map(function(x){return '<span class="d-badge">⚠ '+x+'</span>';}).join('')+'</div>':'';})()}
      ${dupeNote(l)}
      <div class="d-sec d-links-sec">
        <div class="d-links">
          <a class="d-link" href="${l.amz&&l.amz!=='#'?l.amz:('https://www.amazon.co.uk/dp/'+encodeURIComponent(leadUseAsin(l)))}" target="_blank">${ICO.ext} Amazon</a>
          <a class="d-link" href="https://sas.selleramp.com/sas/lookup?asin=${leadUseAsin(l)}" target="_blank">${ICO.ext} SAS</a>
          <a class="d-link" href="https://keepa.com/#!product/2-${leadUseAsin(l)}" target="_blank">${ICO.ext} Keepa</a>
          ${l.sup&&l.sup!=='#'?`<a class="d-link" href="${l.sup}" target="_blank">${ICO.ext} Supplier</a>`:`<span class="d-link d-link-off" title="No supplier link on the sheet for this lead">${ICO.ext} No supplier link</span>`}
          ${l.screenshot?`<a class="d-link d-link-shot" href="${String(l.screenshot).replace(/"/g,'&quot;')}" target="_blank">${ICO.ext} 📸 Screenshot</a>`
                        :`<span class="d-link d-link-off" title="The VA didn't put a screenshot on this row">${ICO.ext} No screenshot</span>`}
        </div>
      </div>
      ${l.vanote?`<div class="d-sec"><div class="d-vanote"><span class="d-vanote-ico">${ICO.msg}</span><div class="d-vanote-txt"><b>${vaName(l)} noted:</b> ${l.vanote}</div></div></div>`:''}
      <!-- Key figures ABOVE the screenshot. Measured: the screenshot is a 292px block and
           pushed buy price, profit, ROI and SPM to 666px — below the fold on a 900px
           screen. The numbers ARE the decision; the screenshot is the evidence you check
           after. Having to scroll past a picture to see the profit was backwards. -->
      <div class="d-sec">
        <div class="d-sec-lbl">Key figures</div>
        <div class="d-nums">
          <div class="d-num"><div class="d-num-l">Buy Price</div><div class="d-num-v vn">£${l.buy}</div></div>
          <div class="d-num"><div class="d-num-l">Sell price</div><div class="d-num-v vn">£${l.sell}</div></div>
          <div class="d-num"><div class="d-num-l">Net Profit</div><div class="d-num-v ${profC(l.profit)}">£${f2(l.profit)}</div></div>
          <div class="d-num"><div class="d-num-l">ROI</div><div class="d-num-v ${roiC(l.roi)}">${l.roi}%</div></div>
          <div class="d-num"><div class="d-num-l">Margin</div><div class="d-num-v ${marC(l.margin)}">${l.margin}%</div></div>
          <div class="d-num"><div class="d-num-l">SPM (sales/mo)</div><div class="d-num-v ${spmC(l.spm)}">${spml(l.spm)}</div></div>
          <div class="d-num"><div class="d-num-l">FBA Sellers</div><div class="d-num-v ${fbaC(l.fba)}">${l.fba}</div></div>
        </div>
      </div>
      ${l.screenshot?(function(){
          var _src=shotImg(l.screenshot);
          // No usable image address = draw the fallback state and make NO request.
          /* 03/09: "preview unavailable" said nothing. Name the host and what to do —
             prnt.sc in particular is blocked on Jack's connection, so it is the VA's
             tool that needs changing, not the app. */
          var _host=(String(l.screenshot).match(/^https?:\/\/(?:www\.)?([^\/]+)/i)||[])[1]||'';
          var _why=_src ? '📸 VA screenshot — click to view it full size here'
            : (/prnt\.sc/i.test(_host)
                ? '📸 On prnt.sc — your connection can’t load it here. Opens in a new tab · ask '+vaName(l)+' to use Gyazo'
                : '📸 On '+_host+' — can’t be previewed here, opens in a new tab');
          return `<a class="d-shot${_src?'':' d-shot-fail d-shot-why'}" href="${String(l.screenshot).replace(/"/g,'&quot;')}" title="Click to view it full size, without leaving the app" onclick="event.preventDefault();shotOpen('${String(l.screenshot).replace(/'/g,'')}','${String(l.title||'').replace(/[`'\\"<>]/g,'').slice(0,60)}')">
            ${_src?`<img src="${_src}" alt="VA screenshot" loading="lazy"
                 onerror="shotFix(this,'${String(l.screenshot).replace(/'/g,'')}')">`:''}
            <span>${_why}</span></a>`;
        })():''}
      ${buyTogetherHTML(l)}
      <div class="d-sec">
        <div class="d-sec-lbl">Why this score — ${s.total.toFixed(1)}/10${s.smart?' <span class="smart-badge">🧠 learned</span>':''}</div>
        ${recallHTML(l,s)}
        ${s.smart?smartWhy(l,s):''}
        <div class="d-score-rubric">${bars}</div>
      </div>
      <!-- 03/09: the second note box lived here. It and the rail's note box both wrote
           the SAME column (jack_comment) — Jack typed in one, saw the other empty, and
           could not tell whether it had saved. One box now: the rail's, which opens under
           the decision. The row reference moved up to the eyebrow so it is not lost. -->
    </div>
    <div class="d-rail">
      <div class="rail-card rail-score">
        <div class="rail-lbl">${s.smart?'Match to your buys':'Overall score'}</div>
        <div class="rail-score-top"><div class="rail-score-num" style="color:${col}">${s.total.toFixed(1)}<span class="rail-score-denom">/ 10</span></div><span class="d-score-grade rail-grade ${scHealth(s.total)}">${scGrade(s.total)}</span></div>
        <div class="rail-score-bar"><i style="width:${Math.round(s.total*10)}%;background:${col}"></i></div>
        <div class="rail-cmp" style="color:${cmp[1]}">${cmp[2]} ${cmp[0]}</div>
        ${(function(){
          /* In learned mode this number is NOT deal quality — it's how closely the lead
             resembles things Jack has bought before. Those are different questions, and
             showing only the first as a big "/10" is how a £6.48-profit, 9.4%-ROI lead
             ended up displaying 7.7 with three red warnings beside it. Show BOTH, and put
             the warnings where the score is so they can't be read separately. */
          var out='';
          if(s.smart){
            try{
              var q=calcScore(l,true);
              out+='<div class="rail-alt">Deal quality <b style="color:'+scCol(q.total)+'">'+q.total.toFixed(1)+'</b>/10'
                 +'<span>on ROI, profit, demand &amp; margin</span></div>';
            }catch(e){}
          }
          var b=[]; try{ b=leadBadges(l); }catch(e){}
          if(b.length) out+='<div class="rail-warn">⚠ '+b.length+' warning'+(b.length===1?'':'s')+'<span>'+b.join(' · ')+'</span></div>';
          return out;
        })()}
      </div>
      <div class="rail-card rail-dec">
        <div class="rail-lbl">Decision</div>
        <div class="d-decision">${decH}</div>
        ${(window._noteFor&&window._noteFor.id===l.id)?'':`<button class="rail-note" onclick="openNote(${l.id})">✎ ${l.notes&&l.notes.trim()?'Edit note':'Add a note'}${l.notes&&l.notes.trim()?` <span class="rail-note-dot">●</span>`:''}</button>`}
      </div>
      ${l.islead===null?`<div class="rail-card"><div class="rail-lbl">Quick reject <span class="rail-opt">optional</span></div><div class="qr-chips">${qrChips}</div></div>`:''}
      <button class="rail-copy" onclick="cpDiscord(${l.id})">${ICO.msg} Copy for Discord</button>
    </div>
    </div>
  </div>`;
}
/* ── WHY, NOT JUST WHAT ─────────────────────────────────────────────────────
   Jack: "if things are a lead but i didn't buy as it's OOS then thats why — if i
   buy 100 of a lead why — if i say no as it's the wrong item but it's a 10/10 lead
   then that explains it".
   Counting words in free text was a fudge. A decision needs a REASON, and the
   reason has a KIND, because that decides who has to act:
     score → the numbers could have caught it        → change the matrix
     data  → the lead information was wrong          → VA / sourcing problem
     world → nothing to do with the numbers          → not a scoring failure at all
   Stored as "[why:code] free text" in the note, so it survives into the sheet and
   into lead_decisions with no schema change. */
var LEAD_REASONS=[
  // why you BOUGHT
  {c:'margin', l:'Great margin',        k:'score', for:'buy'},
  {c:'fast',   l:'Sells fast',          k:'score', for:'buy'},
  {c:'bulk',   l:'Bulk / stock deal',   k:'world', for:'buy'},
  {c:'replen', l:'Replen',              k:'world', for:'buy'},
  {c:'brand',  l:'Brand I trust',       k:'world', for:'buy'},
  {c:'test',   l:'Testing 1–2 units',   k:'world', for:'buy'},
  // why you DIDN'T
  {c:'oos',    l:'Out of stock',        k:'world', for:'no'},
  {c:'wrong',  l:'Wrong item / no match',k:'data', for:'no'},
  {c:'tanked', l:'Price tanked',        k:'data',  for:'no'},
  {c:'badprice',l:'Price doesn’t match',k:'data',  for:'no'},
  {c:'gated',  l:'Gated / restricted',  k:'world', for:'no'},
  {c:'hazmat', l:'Hazmat / can’t ship', k:'world', for:'no'},
  {c:'cash',   l:'Cash tied up',        k:'world', for:'no'},
  {c:'roi',    l:'Low ROI',             k:'score', for:'no'},
  {c:'profit', l:'Low profit',          k:'score', for:'no'},
  {c:'comp',   l:'Too much competition',k:'score', for:'no'},
  {c:'demand', l:'Too slow to sell',    k:'score', for:'no'},
  {c:'listing',l:'Poor listing',        k:'data',  for:'no'},
  // holding
  {c:'waitprice',l:'Waiting on price',  k:'world', for:'wait'},
  {c:'waitstock',l:'Waiting on stock',  k:'world', for:'wait'}
];
function reasonBy(code){ for(var i=0;i<LEAD_REASONS.length;i++) if(LEAD_REASONS[i].c===code) return LEAD_REASONS[i]; return null; }
function reasonOf(note){ var m=String(note||'').match(/^\[why:([a-z]+)\]/); return m?reasonBy(m[1]):null; }
/* ── READING THE NOTES YOU ALREADY WROTE ────────────────────────────────────
   Reason codes shipped in v33.2, so nothing before that is tagged — but the notes
   already SAY it: "Banger but OOS", "Gated", "Down more than up", "Not prof enough".
   Measured on live data, 49% of existing comments name a reason in plain English.
   This reads them, so the whole recall/training system works on real history instead
   of starting from zero. A guessed reason is always shown as guessed, never silently
   treated as something Jack confirmed. */
var REASON_KW=[
  ['oos',     ['oos','out of stock','no stock','sold out','none left','stock gone']],
  ['gated',   ['gated','restricted','ungate','not approved']],
  ['hazmat',  ['hazmat','battery','flammable','aerosol']],
  ['tanked',  ['down more than up','tanked','price dropped','price drop','will drop','drop lower','crashed']],
  ['badprice',['where did you get that price','unsure where you got that price','price doesn\'t match','price does not match','wrong price']],
  ['wrong',   ['wrong item','not the same','no match','different item','wrong asin']],
  ['listing', ['listing','no buy box','suppressed','buybox']],
  ['profit',  ['not prof','low profit','profit too','not enough profit','thin margin']],
  ['roi',     ['low roi','roi too','roi is low']],
  ['comp',    ['too many sellers','competition','amazon on the listing','amazon is on']],
  ['demand',  ['too slow','no sales','doesn\'t sell','does not sell','slow seller','fast enough sales']],
  ['test',    ['trying 1','only bought 1','only tried','test buy','tester','trying a few']],
  ['bulk',    ['bulk','case of','pallet','loads of stock','loads left','got some left','plenty of stock']],
  ['margin',  ['banger','great margin','lovely margin','strong margin']],
  ['fast',    ['sells fast','fast seller','flies','quick seller']],
  /* ── 03/09: phrases taken from the 19 reject notes the reader could not place.
     Jack: "sometimes it should read my note on why i rejected it". These are his
     actual words off the board, not invented examples — each one was sitting in a
     note that was teaching the matrix nothing. */
  ['badprice',['can\'t sell at that price','cant sell at that price','sell price is','sell rice is',
               'needs to drop','needs to drop lower','dropped lower before','was cheaper',
               'find it cheaper','no prof','not worth at that price']],
  ['demand',  ['not selling','no movement','not moving','barely sells']],
  ['comp',    ['fba sellers are there','too much comp','sellers on it']],
  ['bulk',    ['moq','minimum order','can only buy']],
  ['gated',   ['restriced','restrcited']],                       // his usual typos
  ['wrong',   ['dup','duplicate']]
];
function reasonGuess(note){
  var s=String(note||'').toLowerCase(); if(!s.trim()) return null;
  if(/^\[why:/.test(s)) return null;
  for(var i=0;i<REASON_KW.length;i++){
    var c=REASON_KW[i][0], ws=REASON_KW[i][1];
    for(var j=0;j<ws.length;j++) if(s.indexOf(ws[j])>-1) return reasonBy(c);
  }
  return null;
}
/* the reason to USE anywhere: confirmed first, otherwise the one the words imply */
function reasonAny(note){
  var r=reasonOf(note); if(r) return {r:r,guessed:false};
  var g=reasonGuess(note); return g?{r:g,guessed:true}:null;
}
function reasonStrip(note){ return String(note||'').replace(/^\[why:[a-z]+\]\s*/,''); }
/* ── REASON RECALL ──────────────────────────────────────────────────────────
   Jack: "it needs to read notes to see why i passed on a 10/10 lead".
   A logistic model with ~46 rows genuinely cannot learn that — but a LOOKUP can,
   instantly and with no training data at all. Every reason he has ever recorded is
   matched against the lead in front of him (same ASIN, same storefront) and stated
   BEFORE he decides — plus, on a lead already decided, whether a high score he
   rejected was actually a scoring miss or nothing to do with the score. */
function recallDom(u){ try{ return String(u||'').replace(/^https?:\/\//,'').split('/')[0].replace(/^www\./,'').toLowerCase(); }catch(e){ return ''; } }
function recallRows(){
  var out=[];
  (window._decisionCache||[]).forEach(function(r){ if(r.decision && reasonAny(r.note)) out.push(r); });
  // decisions made straight in the VA's sheet never reach lead_decisions — read those too
  (window.leads||[]).forEach(function(l){
    if(l.islead===null && !l.status) return;
    if(!reasonAny(l.notes)) return;
    var k=l._sid||l.id;
    if(out.some(function(r){ return r.id===k; })) return;
    out.push({id:k, decision:l.status||(l.islead?'lead':'passed'),
      is_buy:(l.status==='bought'||l.status==='atbq'||l.status==='atba2a'),
      asin:asinKey(l), store:l.store, note:l.notes, qty:null, updated_at:l.date||''});
  });
  return out;
}
function reasonRecall(l,score){
  if(!l) return [];
  var out=[], rows=recallRows();
  var _m=reasonAny(l.notes), mine=_m&&_m.r, sc=(score&&score.total!=null)?score.total:null;
  if(mine&&sc!=null&&sc>=7.5&&l.islead===false){
    out.push(mine.k==='world'
      ? {lvl:'self',ico:'✅',kind:'world',txt:'Scored <b>'+sc.toFixed(1)+'</b> and you passed &mdash; but for <b>'+escHtml(mine.l)+'</b>. That is not a scoring miss, so it is left out of training.'}
      : mine.k==='data'
      ? {lvl:'self',ico:'&#9888;',kind:'data',txt:'Scored <b>'+sc.toFixed(1)+'</b> on <b>bad lead data</b> ('+escHtml(mine.l)+'). The score was fed the wrong numbers &mdash; a sourcing fix, not a scoring one.'}
      : {lvl:'self',ico:'&#127919;',kind:'score',txt:'Scored <b>'+sc.toFixed(1)+'</b> and you passed for <b>'+escHtml(mine.l)+'</b> &mdash; the numbers could have caught that. A real scoring miss.'});
  }
  if(!rows.length) return out;
  var asin=asinKey(l);
  if(asin){
    var same=rows.filter(function(r){ return rowAsinKey(r)===asin && r.id!==l._sid; });
    same.sort(function(a,b){ return String(b.updated_at||'')<String(a.updated_at||'')?-1:1; });
    if(same.length){
      var r0=same[0], _a0=reasonAny(r0.note), w0=_a0&&_a0.r;
      if(w0) out.push({lvl:'hit',ico:'&#8617;',kind:w0.k,
        txt:'You have decided this ASIN before &mdash; <b>'+escHtml(w0.l)+'</b>'
           +(r0.is_buy?' (bought'+(r0.qty?' '+r0.qty:'')+')':' (passed)')+'.'
           +(_a0.guessed?' <i class="rc-g">(read from your note)</i>':'')});
    }
  }
  function pattern(label,match){
    if(!label) return;
    var hits={},best=null;
    rows.forEach(function(r){ if(!match(r)) return; var a=reasonAny(r.note), w=a&&a.r;
      if(!w||w.for==='buy') return;
      (hits[w.c]||(hits[w.c]={w:w,n:0})).n++; });
    Object.keys(hits).forEach(function(k){ if(!best||hits[k].n>best.n) best=hits[k]; });
    if(best&&best.n>=2) out.push({lvl:'pat',ico:'&#8634;',kind:best.w.k,
      txt:'<b>'+best.n+'</b> leads from <b>'+escHtml(label)+'</b> died on the same thing &mdash; <b>'+escHtml(best.w.l)+'</b>.'});
  }
  var store=String(l.store||'').trim().toLowerCase();
  pattern(l.store, function(r){ return !!store && String(r.store||'').trim().toLowerCase()===store; });
  return out;
}
function recallHTML(l,score){
  var hits=reasonRecall(l,score); if(!hits.length) return '';
  return '<div class="rc-wrap">'+hits.map(function(h){
    return '<div class="rc-r rc-'+h.kind+'"><span class="rc-i">'+h.ico+'</span><span>'+h.txt+'</span></div>';
  }).join('')+'</div>';
}
function reasonSet(id,code){
  var l=(window.leads||[]).find(function(x){ return x.id===id; }); if(!l) return;
  var rest=reasonStrip(l.notes||'');
  var r=reasonBy(code);
  l.notes = r ? ('[why:'+code+'] '+r.l+(rest?' · '+rest:'')) : rest;
  try{ db_leadPatch(l,{jack_comment:l.notes}); }catch(e){}
  try{ logDecision(l); }catch(e){}
  var tw=noteMirror(l);
  ldToast(r?('Why: '+r.l+' ✓'+(tw?' · also on '+vaDisp(tw.va)+'’s copy':'')):'Reason cleared');
  try{ selectLead(id,true); }catch(e){ renderList(); }
}
/* which reasons make sense for what he just pressed */
function reasonsFor(l){
  if(!l) return [];
  var isBuy=(l.status==='bought');
  var wait=(l.status==='atbq'||l.status==='atba2a'||l.status==='waiting');
  var want=isBuy?'buy':(wait?'wait':'no');
  return LEAD_REASONS.filter(function(r){ return r.for===want; });
}
/* The Quick Reject chips wrote "Rejected: Low ROI" as prose and no [why:] tag, so the
   recall panel, the auto-tune and the Leads page could not read a single one of them —
   the reason was there in the text and invisible to every system meant to learn from it.
   The chips map onto the SAME codes the Why buttons use. */
var QR_TO_REASON={'low roi':'roi','low profit':'profit','high competition':'comp',
  'low demand':'demand','poor listing':'listing','sell price unrealistic':'badprice',
  'out of stock':'oos','gated':'gated'};
function qReject(id,reason){
  const l=leads.find(x=>x.id===id);
  if(l){
    l.islead=false; l.status='passed'; l.seen=true;
    var code=QR_TO_REASON[String(reason||'').trim().toLowerCase()];
    var rest=(typeof reasonStrip==='function')?reasonStrip(l.notes||'').trim():String(l.notes||'').trim();
    l.notes = code
      ? '[why:'+code+'] '+reason+(rest?' · '+rest:'')
      : (rest?rest+' · ':'')+'Rejected: '+reason;
    markSeen(l._sid);
    db_leadPatch(l,{islead:'NOT LEAD',status:'NOT',jack_comment:l.notes});
    try{ logDecision(l); }catch(e){}   // same learning signal a pressed Why button gives
  }
  ldToast('Rejected — '+reason+' · both sheet dropdowns set');
  advanceAfter(id);
}
/* NO decisions ask for a comment right here — the app replaces the sheet as the place
   Jack writes them (comment lands in the sheet's Jack Comment column WITH the decision). */
var NOT_QR=['Low ROI','Low Profit','High Competition','Low Demand','Poor Listing','Sell price unrealistic'];
function askNotComment(id,kind){
  window._pendingNot={id:id,kind:kind};
  var l=leads.find(function(x){return x.id===id;});
  var old=document.getElementById('not-cmt'); if(old) old.remove();
  var d=document.createElement('div'); d.id='not-cmt';
  d.innerHTML='<div class="nc-back" onclick="ncClose()"></div>'
    +'<div class="nc-card"><div class="nc-title">Why is this a NO?</div>'
    +'<div class="nc-sub">Saved to the sheet’s Jack Comment column together with the decision — no need to open the sheet.</div>'
    +'<div class="nc-chips">'+NOT_QR.map(function(r){return '<button type="button" class="qr-chip" onclick="ncChip(this)">'+r+'</button>';}).join('')+'</div>'
    +'<textarea id="nc-text" placeholder="e.g. the sell price isn’t realistic…  (Enter = save · Esc = cancel)" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();ncConfirm();}else if(event.key===\'Escape\'){ncClose();}">'+String((l&&l.notes)||'').replace(/</g,'&lt;')+'</textarea>'
    +'<div class="nc-row"><button class="nc-save" onclick="ncConfirm()">Save &amp; mark NOT</button>'
    +'<button class="nc-skip" onclick="ncConfirm(true)">skip comment</button></div></div>';
  document.body.appendChild(d);
  setTimeout(function(){ var t=document.getElementById('nc-text'); if(t){ t.focus(); t.selectionStart=t.value.length; } },60);
}
function ncChip(el){ var t=document.getElementById('nc-text'); if(!t) return; t.value=(t.value.trim()?t.value.trim()+' · ':'')+el.textContent; t.focus(); }
function ncClose(){ var d=document.getElementById('not-cmt'); if(d) d.remove(); window._pendingNot=null; }
function ncConfirm(skip){
  var p=window._pendingNot; if(!p) return;
  var t=document.getElementById('nc-text'); var txt=t?t.value.trim():'';
  if(!skip && !txt){ ldToast('Write a quick reason (or hit skip)',true); if(t) t.focus(); return; }
  var l=leads.find(function(x){return x.id===p.id;});
  if(l&&txt) l.notes=txt;
  ncClose();
  if(p.kind==='lead') setL(p.id,false,true); else setSt(p.id,'passed',true);
}
/* ── Jack's per-lead meta (bought quantity + N/A) — stored locally, keyed by lead sheet id.
   Powers his Insights + Auto-tune. Cloud-synced too when the bought_qty column exists. ── */
function ldMetaAll(){ try{return JSON.parse(lsGet('bdl_lead_meta')||'{}');}catch(e){return{};} }
function ldMeta(l){ if(!l||!l._sid) return {}; return ldMetaAll()[l._sid]||{}; }
function ldMetaSet(l,patch){ if(!l||!l._sid) return; var a=ldMetaAll(); a[l._sid]=Object.assign({},a[l._sid]||{},patch); lsPut('bdl_lead_meta',JSON.stringify(a)); }
function ldQty(l){ var m=ldMeta(l); return m.na?'na':(m.qty!=null?m.qty:null); }
function setQty(id,q){ var l=leads.find(function(x){return x.id===id;}); if(!l)return; ldMetaSet(l,{qty:Math.max(0,parseInt(q)||0),na:false}); try{logDecision(l);}catch(e){} selectLead(id,true); }
function setQtyLive(id,q){ var l=leads.find(function(x){return x.id===id;}); if(!l)return; ldMetaSet(l,{qty:Math.max(0,parseInt(q)||0),na:false}); }   // store while typing, no re-render
function qtyStep(id,d){ var l=leads.find(function(x){return x.id===id;}); if(!l)return; var m=ldMeta(l); var n=Math.max(0,(m.na?0:(parseInt(m.qty)||0))+d); ldMetaSet(l,{qty:n,na:false}); var el=document.getElementById('qty-in'); if(el)el.value=n; }
function qtyNA(id){ var l=leads.find(function(x){return x.id===id;}); if(!l)return; ldMetaSet(l,{na:true}); try{logDecision(l);}catch(e){} selectLead(id,true); ldToast('Marked N/A — excluded from spend/analysis'); }
// open the note box on ANY lead, any time (not tied to a decision) — Jack can comment whenever
function openNote(id){ window._noteFor={id:id,manual:true}; try{selectLead(id,true);}catch(e){renderList();} nbFocus(); }
