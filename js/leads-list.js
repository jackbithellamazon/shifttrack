/* ══════════ OA vs A2A IS DECIDED BY WHERE YOU BUY, NOT HOW IT WAS FOUND ══════
   Jack, on a lead bought from Amazon showing "OA · discord": "if the supplier is
   a2a amazon - how is this a oa - or is that how it was found?" Exactly that. This
   read the SOURCE text and called anything without "a2a"/"reverse"/"arbi" in it OA
   — so a JKPF or discord find bought from Amazon.UK was labelled OA. Measured on
   his live board: 565 of 772 leads (73%) were labelled wrongly, 180 of them the
   single pattern "store Amazon.UK, src JKPF".

   leadIsA2A() already answers this correctly from the buy-from host, and the OA
   KPI on the VA dashboard uses it — so the chip and the KPI were contradicting each
   other. One classifier now serves both. sourceType() keeps its name and signature
   because other callers pass a bare source string; given a lead it does the right
   thing, given only a string it falls back to the old text sniff. */
function sourceType(srcOrLead){
  if(srcOrLead && typeof srcOrLead==='object'){
    try{ return leadIsA2A(srcOrLead)?'A2A':'OA'; }catch(e){}
    srcOrLead=srcOrLead.src;
  }
  var s=String(srcOrLead||'').toLowerCase();
  return (s.indexOf('a2a')>=0||s.indexOf('reverse')>=0||s.indexOf('arbi')>=0)?'A2A':'OA';
}
function supHost(u){ try{ var h=(String(u).match(/^https?:\/\/(www\.)?([^\/]+)/i)||[])[2]||String(u); return h.replace(/\.(com|co\.uk|net|org|de|fr)$/i,'').slice(0,22); }catch(e){ return 'Supplier'; } }
/* The discount column is not always a discount code. Of the 98 leads that have anything
   in it: 70 are prnt.sc URLs (the VAs use it as a second screenshot slot), 27 are real
   tokens — WELCOME10, 12MIFARMA, "20% s&s", "3 for 2" — and one reads "I have
   problmem with my screenshot". A 50-character URL rendered as a copyable code looks
   broken, so the three are told apart. The value goes in a data attribute rather than
   into the onclick string: codes contain apostrophes and ampersands, and the old button
   ran .replace(/'/g,'') on it, silently copying a DIFFERENT code to the clipboard. */
/* "if i write a note on it — little pill saying that". Jack's own note lives in
   l.notes and was invisible from the list, so a lead he had already thought about
   looked identical to one he had never touched.
   A reason code is stored in the SAME field as a "[why:xxx]" prefix and already has
   its own pill (.litem-why), so only the free text he actually typed counts here —
   otherwise every quick-rejected lead would sprout a second pill saying nothing. */
function leadNoteText(l){
  var n=String((l&&l.notes)||'');
  n=n.replace(/^\[why:[a-z]+\]\s*/i,'').trim();
  return n;
}
function noteChipHTML(l){
  var n=leadNoteText(l);
  if(!n) return '';
  var one=n.replace(/\s+/g,' ');
  return '<span class="litem-note" title="Your note: '+escHtml(one)+'">'
    +'✎ '+escHtml(one.length>26?one.slice(0,25)+'…':one)+'</span>';
}
/* Jack: "buying them together I save on postage — especially on EU Amazon as we only
   have to pay 1 shipping price". So the real unit of a BUY decision is the SUPPLIER,
   not the lead, and the app only ever showed one lead at a time. On his live board 906
   of 946 undecided-or-live leads sit with a supplier that has more than one, and 251
   are on the four EU Amazon marketplaces (de 130, fr 63, it 37, es 21). */
function buyFromKey(l){
  var h=(typeof leadSupKey==='function')?leadSupKey(l):'';
  return h || _lfKey(l&&l.store);       // no supplier URL on the row → fall back to the store
}
function buyMates(l){
  var k=buyFromKey(l); if(!k) return [];
  return (window.leads||[]).filter(function(x){
    return x && x.id!==l.id && buyFromKey(x)===k
        && x.islead!==false && x.status!=='passed';   // a rejected lead is not going in the order
  });
}
function ldSupplierView(k){
  var sup=document.getElementById('f-sup'), st=document.getElementById('f-store');
  if(sup&&[].slice.call(sup.options).some(function(o){return o.value===k;})){ sup.value=k; if(st) st.value='all'; }
  else if(st){ st.value=k; if(sup) sup.value='all'; }
  ['f-cat','f-source'].forEach(function(id){ var e=document.getElementById(id); if(e) e.value='all'; });
  var fd=document.getElementById('f-date'); if(fd) fd.value='all';
  var sb=document.getElementById('search'); if(sb) sb.value='';
  window._staleFilter=false;
  var b=document.querySelector('#view-leads [data-view="all"]');
  if(b) setView(b,'all'); else renderList();
}
function buyTogetherHTML(l){
  var mates=buyMates(l); if(!mates.length) return '';
  var k=buyFromKey(l);
  var COMMITTED={bought:1,atbq:1,atba2a:1,waiting:1};
  var inOrder=mates.filter(function(x){ return COMMITTED[x.status]; });
  /* First cut of this showed all 111 amazon.de leads and a £8,212 "if you took every
     one" total. Neither is a decision. What matters when postage is per ORDER is what
     is ALREADY going, what this lead adds, and the best few candidates worth throwing
     in while the box is open — so that is all it shows. */
  var undec=mates.filter(function(x){ return !COMMITTED[x.status]; })
                 .sort(function(a,b){ return ((b._sc&&b._sc.total)||0)-((a._sc&&a._sc.total)||0); });
  var orderTotal=inOrder.reduce(function(t,x){ return t+(parseFloat(x.buy)||0); },0);
  var thisBuy=parseFloat(l.buy)||0;
  function row(x,cls){
    var st=statusInfo(x);
    return '<button class="bt-row'+(cls||'')+'" onclick="selectLead('+x.id+',true)" title="'+escHtml(x.title||'')+'">'
      +'<span class="bt-sc">'+(((x._sc&&x._sc.total)||0).toFixed(1))+'</span>'
      +'<span class="bt-t">'+escHtml(String(x.title||'').slice(0,58))+'</span>'
      +'<span class="bt-b">£'+(parseFloat(x.buy)||0).toFixed(2)+'</span>'
      +'<span class="bt-st">'+escHtml(st[0])+'</span>'
      +'</button>';
  }
  var head = inOrder.length
    ? '<b style="color:#7ef2c4">'+inOrder.length+'</b> already going in this order · '
      +'one postage covers this one too'
    : 'Nothing committed from <b>'+escHtml(k)+'</b> yet — '
      +'<b>'+mates.length+'</b> live lead'+(mates.length===1?'':'s')+' here if you want to fill a box';
  var out='<div class="d-sec"><div class="d-sec-lbl">Same order — '+escHtml(k)+'</div>'
    +'<div class="bt-head">'+head+'</div>';
  if(inOrder.length){
    out+='<div class="bt-sums">'
      +'<span><em>In the order already</em><b>£'+orderTotal.toFixed(2)+'</b></span>'
      +'<span><em>This lead adds</em><b>£'+thisBuy.toFixed(2)+'</b></span>'
      +'<span><em>Order total</em><b>£'+(orderTotal+thisBuy).toFixed(2)+'</b></span>'
      +'</div>';
  }
  var _fold='';
  if(inOrder.length) _fold+='<div class="bt-list">'+inOrder.slice(0,5).map(function(x){ return row(x,' in-order'); }).join('')+'</div>'
      +(inOrder.length>5?'<div class="bt-more">+'+(inOrder.length-5)+' more already in</div>':'');
  if(undec.length) _fold+='<div class="bt-sub">Best undecided from the same supplier</div>'
      +'<div class="bt-list">'+undec.slice(0,3).map(function(x){ return row(x,''); }).join('')+'</div>';
  if(_fold) out+='<details class="bt-fold"><summary>'
      +(inOrder.length?inOrder.length+' item'+(inOrder.length===1?'':'s')+' in the order':'')
      +(inOrder.length&&undec.length?' · ':'')
      +(undec.length?undec.length+' more from this supplier':'')
      +'</summary>'+_fold+'</details>';
  out+='<button class="bt-all" onclick="ldSupplierView(\''+String(k).replace(/[^a-z0-9.\-]/g,'')+'\')">'
    +'See all '+(mates.length+1)+' from '+escHtml(k)+' →</button>'
    +'</div>';
  return out;
}
function discountChipHTML(l){
  var raw=String((l&&l.discount)||'').trim();
  if(!raw) return '';
  if(/^https?:\/\//i.test(raw)){
    return '<a class="d-tag tag-disc-link" href="'+escHtml(raw)+'" target="_blank" rel="noopener"'
      +' title="The VA put a link in the discount column — usually a second screenshot">'
      +'🔗 extra link ↗</a>';
  }
  var show=raw.length<=30?raw:raw.slice(0,28)+'…';
  return '<button class="d-tag tag-disc" data-code="'+escHtml(raw)+'"'
    +' onclick="cpCode(this.dataset.code,event)"'
    +' title="'+escHtml(raw)+' — click to copy">🏷️ '+escHtml(show)+'</button>';
}
function cpCode(c,e){
  try{ navigator.clipboard&&navigator.clipboard.writeText(c).catch(function(){}); }catch(_){}
  try{ ldToast('Copied: '+c); }catch(_){}
  var btn=e&&e.currentTarget; if(!btn) return;
  var o=btn.innerHTML; btn.classList.add('copied'); btn.innerHTML=ICO.check+' Copied!';
  setTimeout(function(){ btn.classList.remove('copied'); btn.innerHTML=o; },1400);
}
function priority(l){return l.roi>=20&&l.profit>=30?'High':l.roi>=12?'Mid':'Low'}
function priCls(l){const p=priority(l);return p==='High'?'tag-pri-high':p==='Mid'?'tag-pri-mid':'tag-pri-low'}
function vaShort(l){return vaInitial(l.va)}
function vaName(l){return vaDisp(l.va)}
function statusInfo(l){
  if(l.islead===false)return['Not a Lead','st-notlead'];
  if(l.islead===true&&l.status==='bought')return['Bought','st-bought'];
  if(l.islead===true&&l.status==='atbq')return['ATB (Q)','st-basket'];
  if(l.islead===true&&l.status==='atba2a')return['ATB (A2A)','st-basket'];
  if(l.islead===true&&(l.status==='waiting'||l.status==='basket'))return['Waiting','st-basket'];
  if(l.islead===true&&l.status==='passed')return['Not bought','st-passed'];
  if(l.islead===true)return['Lead','st-lead'];
  if(!l.seen)return['New','st-new'];
  return['Seen','st-seen'];
}
function isBasketish(l){return l.status==='basket'||l.status==='atbq'||l.status==='atba2a'||l.status==='waiting';}
function applyVA(l){
  const root=document.getElementById('view-leads').style;
  if(l.va==='VA M'){root.setProperty('--va','var(--mera)');root.setProperty('--va-d','rgba(178,59,255,.14)');root.setProperty('--va-b','rgba(178,59,255,.36)');root.setProperty('--va-dk','#1a0a2e');}
  else{root.setProperty('--va','var(--suz)');root.setProperty('--va-d','rgba(242,194,0,.13)');root.setProperty('--va-b','rgba(242,194,0,.4)');root.setProperty('--va-dk','#2a2205');}
}
/* Store / category / source / supplier, built from the leads that actually exist.
   Case is merged first: the sheet holds "Amazon.UK" 360 times and "amazon.uk" another
   157, and picking one silently hid the other. The option VALUE is lowercase and the
   filters compare lowercase, so both spellings come back together; the label shows the
   spelling used most, with the count beside it. */
/* The ONE definition of "which bucket does this value belong to". The dropdown builder
   and both filter twins call it, so a value can never be listed under a key the filter
   then fails to match. It was two separate expressions for about ten minutes and the
   sheet's trailing spaces immediately put 157 leads out of reach. */
function _lfKey(v){ return String(v||'').trim().toLowerCase(); }
function populateLeadFilters(){
  function fill(id, get, allLabel){
    var sel=document.getElementById(id); if(!sel) return;
    var keep=sel.value;
    var byKey={};
    (leads||[]).forEach(function(l){
      var raw=String(get(l)||'').trim(); if(!raw) return;
      var k=_lfKey(raw);
      var e=byKey[k]||(byKey[k]={n:0,arch:0,forms:{}});
      /* The count must mean "leads you will actually see". The default list hides
         archived leads (undecided, 30+ days), so counting them here produced options
         like "SUPERDRUG (1)" that showed an empty list when picked. Those values stay
         selectable — losing them would put the lead beyond reach entirely — but they
         say so. */
      if(typeof ldArchived==='function' && ldArchived(l)) e.arch++; else e.n++;
      e.forms[raw]=(e.forms[raw]||0)+1;
    });
    // live ones first, biggest first; archived-only values sink to the bottom
    var keys=Object.keys(byKey).sort(function(a,b){
      var d=byKey[b].n-byKey[a].n; return d||a.localeCompare(b); });
    sel.innerHTML='<option value="all">'+allLabel+'</option>'
      +keys.map(function(k){
          var f=byKey[k].forms;
          var label=Object.keys(f).sort(function(a,b){return f[b]-f[a];})[0];
          var e=byKey[k];
          var tail=e.n?' ('+e.n+')':' (\u2014 '+e.arch+' archived)';
          return '<option value="'+escHtml(k)+'">'+escHtml(label)+tail+'</option>';
        }).join('');
    // a selection that no longer exists must fall back to "all", not silently show nothing
    sel.value=keep;
    if(sel.selectedIndex<0) sel.value='all';
  }
  fill('f-store', function(l){ return l.store; }, 'All stores');
  fill('f-cat',   function(l){ return l.cat;   }, 'All categories');
  fill('f-source',function(l){ return l.src;   }, 'All sources');
  fill('f-sup',   function(l){ return leadSupKey(l); }, 'All suppliers');
}
/* One supplier identity per lead: the host, without www or the protocol. "#" and blanks
   are not a supplier and must not become an option. */
function leadSupKey(l){
  var u=String((l&&l.sup)||'').trim();
  if(!u||u==='#') return '';
  var m=u.match(/^https?:\/\/(www\.)?([^\/?#]+)/i);
  return _lfKey(m?m[2]:u);
}
// fill the date dropdown with every month that actually has leads (newest first) — Jack picks any month
function populateMonthFilter(){
  var sel=document.getElementById('f-date'); if(!sel) return;
  var keep=sel.value;
  var now=new Date(), curKey=now.getFullYear()+'-'+('0'+(now.getMonth()+1)).slice(-2);
  var MN=['January','February','March','April','May','June','July','August','September','October','November','December'];
  var seen={}; leads.forEach(function(l){ var p=(l.date||'').split('/'); if(p.length===3){ var k=p[2]+'-'+p[1]; if(k!==curKey) seen[k]=1; } });
  var months=Object.keys(seen).sort().reverse();
  sel.innerHTML='<option value="sheet">Whatever months I’ve ticked</option>'
    +'<option value="month">This calendar month</option>'
    +months.map(function(k){ var y=k.split('-')[0], m=+k.split('-')[1]; return '<option value="m:'+k+'">'+MN[m-1]+' '+y+'</option>'; }).join('')
    +'<option value="today">Today</option><option value="yesterday">Yesterday</option><option value="thisweek">This week (Mon–now)</option><option value="lastweek">Last week (Mon–Sun)</option><option value="48h">Last 48h</option><option value="7d">Last 7 days</option><option value="14d">Last 14 days</option><option value="30d">Last 30 days</option><option value="day">Pick a day…</option><option value="all">All dates</option>';
  sel.value=[].some.call(sel.options,function(o){return o.value===keep;})?keep:'sheet';
}
function getF(){
  var res=getFNoFocus();
  var f=window._focus;
  if(!f) return res;
  // while the queue is running, only its leads are on screen — but a lead he has just
  // decided stays put until he clicks off it, same as everywhere else.
  return res.filter(function(l){ return f.set[l.id]; });
}
/* ── ARCHIVE ────────────────────────────────────────────────────────────────
   Jack's spec, as answered: leads older than 30 days drop off the board, it happens
   automatically with nothing to press, NOTHING is ever written to the VA's Google
   Sheet, and a search still finds them. The sheet stays the permanent record — this
   only decides what the working board shows. Decided leads are untouched. */
var LEAD_ARCHIVE_DAYS=30;
function ldAgeDays(l){
  try{
    var d=liDate(l); if(!d||isNaN(d.getTime())) return null;
    var t=ukNow(); t.setHours(0,0,0,0); d.setHours(0,0,0,0);
    return Math.round((t-d)/86400000);
  }catch(e){ return null; }
}
function ldArchived(l){
  if(!l) return false;
  if(l.status||l.islead!==null) return false;         // a decision keeps it out of the archive
  var a=ldAgeDays(l);
  return a!=null && a>LEAD_ARCHIVE_DAYS;
}
function ldArchivedCount(){
  return (window.leads||[]).filter(ldArchived).length;
}
/* "Show them" on the older-leads line. A session-only flag that loadLeadsFromDB reads —
   his SETTING is never written to. An earlier version cleared the setting and restored it
   on a timer; if anything failed in between, his start date was gone. A flag cannot do
   that: close the tab and it is back to normal. Jack asked for them hidden by default,
   so this is the escape hatch, not a new default. */
function ldShowOlder(){
  window._ldStartOverride=true;
  try{ ldToast('Showing the older leads too — reloading…'); }catch(e){}
  try{ loadLeadsFromDB(); }catch(e){}
}
function ldHideOlder(){
  window._ldStartOverride=false;
  try{ loadLeadsFromDB(); }catch(e){}
}
/* Days from the Monday that starts the week containing `d`. Jack's weeks start on
   Monday, so Sunday belongs to the week BEFORE — which getDay()===0 does not give you.
   0..6 = this week, -7..-1 = last week. */
function ldWeekOffset(d,ref){
  var t=new Date(ref.getFullYear(),ref.getMonth(),ref.getDate());
  var dow=(t.getDay()+6)%7;                       // Mon=0 … Sun=6
  var mon=new Date(t); mon.setDate(t.getDate()-dow);
  var dd=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  return Math.round((dd-mon)/86400000);
}
/* ONE predicate for the numeric filters, used by BOTH matchers below — the audit
   rule says _leadCtx and getFNoFocus must never drift, so the new dimensions are
   shared by construction rather than by discipline. */
function _lfNumPass(l){
  var fr=document.getElementById('f-roi'), fp=document.getElementById('f-profit'), ff=document.getElementById('f-fba');
  var vr=fr?fr.value:'all', vp=fp?fp.value:'all', vf=ff?ff.value:'all';
  if(vr!=='all' && !((parseFloat(l.roi)||0)>=+vr)) return false;
  if(vp!=='all' && !((parseFloat(l.profit)||0)>=+vp)) return false;
  if(vf!=='all' && !((parseInt(l.fba)||0)<=+vf)) return false;
  return true;
}
/* Search must match the ASIN Jack actually researches with. On 410 conflicted rows
   the column holds the WRONG product's ASIN — pasting the real one from Amazon found
   nothing, which reads as "my VA never sent this" when she did. */
function _lfAsinMatch(l,q){
  if(String(l.asin||'').toLowerCase().includes(q)) return true;
  try{ var u=leadUseAsin(l); if(u&&u.toLowerCase().includes(q)) return true; }catch(e){}
  return false;
}
function getFNoFocus(){
  const fs=document.getElementById('f-store')?.value||'all';
  const fc=document.getElementById('f-cat')?.value||'all';
  const fsrc=document.getElementById('f-source')?.value||'all';
  const fsup=document.getElementById('f-sup')?.value||'all';
  const q=(document.getElementById('search')?.value||'').trim().toLowerCase();
  let fd=document.getElementById('f-date')?.value||'all'; if(fd==='day') fd=window._fDay?('d:'+window._fDay):'all';
  function _pGB(s){var p=String(s||'').split('/');return p.length===3?new Date(+p[2],+p[1]-1,+p[0]):null;}
  const _now=new Date(), _t0=new Date(_now.getFullYear(),_now.getMonth(),_now.getDate());
  return leads.filter(l=>{
    if(view==='new'&&(l.status||l.islead!==null)&&l.id!==_pendingLeave)return false;   // New = undecided; a just-decided lead is HELD until he clicks off it
    if(window._staleFilter&&(view==='new'||view==='all')&&!isStale(l))return false;   // "Going stale" ribbon filter
    if(fd!=='all'){ var _d=_pGB(l.date); if(!_d)return false; var _dd=Math.round((_t0-_d)/86400000);
      /* THE SEARCH BUG. `return true` here means "keep this lead" and jumps out of the
         whole predicate — so with the date filter on "Whatever months I've ticked"
         (Jack's default) every filter BELOW this line was skipped, the search included.
         Confirmed from his live session: box said "nespresso", getF returned 629, while
         the chips — which use _leadCtx, where this same bug was fixed long ago — said 18.
         The ticked tabs decide the months; they must not decide anything else. */
      if(fd!=='sheet'){
      if(fd==='month'&&(_d.getMonth()!==_now.getMonth()||_d.getFullYear()!==_now.getFullYear()))return false;
      if(fd.slice(0,2)==='m:'){ var _ym=fd.slice(2).split('-'); if(_d.getFullYear()!==+_ym[0]||(_d.getMonth()+1)!==+_ym[1])return false; }
      if(fd.slice(0,2)==='d:'){ var _iso=_d.getFullYear()+'-'+('0'+(_d.getMonth()+1)).slice(-2)+'-'+('0'+_d.getDate()).slice(-2); if(_iso!==fd.slice(2))return false; }
      if(fd==='today'&&_dd!==0)return false;
      if(fd==='yesterday'&&_dd!==1)return false;
      if(fd==='48h'&&(_dd<0||_dd>1))return false;
      if(fd==='7d'&&(_dd<0||_dd>6))return false;
      if(fd==='14d'&&(_dd<0||_dd>13))return false;
      if(fd==='30d'&&(_dd<0||_dd>29))return false;
      if(fd==='thisweek'){ var _w=ldWeekOffset(_d,_now); if(_w<0||_w>6)return false; }
      if(fd==='lastweek'){ var _w2=ldWeekOffset(_d,_now); if(_w2<-7||_w2>-1)return false; } } }
    if(view==='lead'&&l.islead!==true)return false;
    if(view==='bought'&&l.status!=='bought')return false;
    if(view==='basket'&&!isBasketish(l))return false;
    if(view==='passed'&&l.status!=='passed')return false;
    if(view==='notlead'&&l.islead!==false)return false;
    if(va!=='all'&&l.va!==va)return false;
    /* lowercase both sides: the option values are lowercase keys now, and the sheet
       spells the same store both ways ("Amazon.UK" 360, "amazon.uk" 157). A strict
       !== against a hand-typed label is what made two category options match nothing. */
    if(fs!=='all'&&_lfKey(l.store)!==fs)return false;
    if(fc!=='all'&&_lfKey(l.cat)!==fc)return false;
    if(fsrc!=='all'&&_lfKey(l.src)!==fsrc)return false;
    if(fsup!=='all'&&leadSupKey(l)!==fsup)return false;
    if(!_lfNumPass(l))return false;
    if(scoreMin>0&&l._sc.total<scoreMin)return false;
    if(q&&!(l.title.toLowerCase().includes(q)||_lfAsinMatch(l,q)))return false;
    // past the cut-off and never decided: off the board — but a search reaches straight
    // through, because "did we ever find this?" is the whole reason he keeps the history.
    if(!q&&ldArchived(l))return false;
    if(!q&&!(l.status||l.islead!==null)&&ldDupUnexplained(l))return false;  // held until she notes or deletes
    return true;
  }).sort((a,b)=>{
    /* A single lead without a score threw here and took the whole render with it. Because
       updateCounts() runs FIRST, the chips updated (18 matches) while the list and the
       "608 leads" header kept their previous values — which is exactly what a broken
       search looks like. Nothing in a sort comparator is worth an exception. */
    const sc=x=>(x&&x._sc&&typeof x._sc.total==='number')?x._sc.total:0;
    const num=x=>{ const n=parseFloat(x); return isNaN(n)?0:n; };
    if(sortBy==='score')return sc(b)-sc(a);
    if(sortBy==='roi')return num(b.roi)-num(a.roi);
    if(sortBy==='profit')return num(b.profit)-num(a.profit);
    if(sortBy==='spm')return num(b.spm)-num(a.spm);
    const p=d=>String(d||'').split('/').reverse().join('');
    return p(b.date).localeCompare(p(a.date));
  });
}
// does a lead pass the active CONTEXT filters (date/store/cat/source/score/search)? optionally also view/va
function _leadCtx(l, useView, useVa){
  const fs=document.getElementById('f-store')?.value||'all';
  const fc=document.getElementById('f-cat')?.value||'all';
  const fsrc=document.getElementById('f-source')?.value||'all';
  const fsup=document.getElementById('f-sup')?.value||'all';
  const q=(document.getElementById('search')?.value||'').trim().toLowerCase();
  let fd=document.getElementById('f-date')?.value||'all'; if(fd==='day') fd=window._fDay?('d:'+window._fDay):'all';
  if(fd!=='all'){ var p=String(l.date||'').split('/'); var d=p.length===3?new Date(+p[2],+p[1]-1,+p[0]):null; if(!d)return false;
    var now=new Date(), t0=new Date(now.getFullYear(),now.getMonth(),now.getDate()); var dd=Math.round((t0-d)/86400000);
    if(fd==='sheet') { /* no date restriction — his tab ticks decide. MUST NOT return
       true here: that skipped search + every other filter. */ }
    else {
    if(fd==='month'&&(d.getMonth()!==now.getMonth()||d.getFullYear()!==now.getFullYear()))return false;
    if(fd.slice(0,2)==='m:'){ var ym=fd.slice(2).split('-'); if(d.getFullYear()!==+ym[0]||(d.getMonth()+1)!==+ym[1])return false; }
    if(fd.slice(0,2)==='d:'){ var iso=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); if(iso!==fd.slice(2))return false; }
    if(fd==='today'&&dd!==0)return false; if(fd==='yesterday'&&dd!==1)return false; if(fd==='48h'&&(dd<0||dd>1))return false; if(fd==='7d'&&(dd<0||dd>6))return false;
    if(fd==='14d'&&(dd<0||dd>13))return false;
    if(fd==='30d'&&(dd<0||dd>29))return false;
    // identical to getFNoFocus() — the audit rule checks these two never drift
    if(fd==='thisweek'){ var w=ldWeekOffset(d,now); if(w<0||w>6)return false; }
    if(fd==='lastweek'){ var w2=ldWeekOffset(d,now); if(w2<-7||w2>-1)return false; }
    } }
  // identical to getFNoFocus() — these two must never drift, see the audit rule
  if(fs!=='all'&&_lfKey(l.store)!==fs)return false;
  if(fc!=='all'&&_lfKey(l.cat)!==fc)return false;
  if(fsrc!=='all'&&_lfKey(l.src)!==fsrc)return false;
  if(fsup!=='all'&&leadSupKey(l)!==fsup)return false;
  if(!_lfNumPass(l))return false;
  if(scoreMin>0&&l._sc.total<scoreMin)return false;
  if(q&&!(l.title.toLowerCase().includes(q)||_lfAsinMatch(l,q)))return false;
  /* The list applies these two; the counts did not — so the chips counted leads that were
     not on screen (archived, or hidden by the Going-stale ribbon). Same drift that let the
     search bug hide for months: two filters that must agree, kept in two places. */
  if(window._staleFilter&&(view==='new'||view==='all')&&typeof isStale==='function'&&!isStale(l))return false;
  if(!q&&typeof ldArchived==='function'&&ldArchived(l))return false;
  if(!q&&!(l.status||l.islead!==null)&&typeof ldDupUnexplained==='function'&&ldDupUnexplained(l))return false;
  if(useVa&&va!=='all'&&l.va!==va)return false;
  if(useView){
    if(view==='new'&&(l.status||l.islead!==null))return false;
    if(view==='lead'&&l.islead!==true)return false;
    if(view==='bought'&&l.status!=='bought')return false;
    if(view==='basket'&&!isBasketish(l))return false;
    if(view==='passed'&&l.status!=='passed')return false;
    if(view==='notlead'&&l.islead!==false)return false;
  }
  return true;
}
/* ── SESSION TILE ───────────────────────────────────────────────────────────
   This slot used to hold "626 GOING STALE". Jack sees it every time he opens Leads
   and it cannot be acted on — it is a debt counter, and it was the biggest number
   on the screen. Replaced with the one number that MOVES when he works. */
function sessMins(){
  if(!window._sessStart) return 0;
  return Math.max(0,(Date.now()-window._sessStart)/60000);
}
/* Decisions made today, counted from the DECISION LOG rather than from memory.
   Jack: "i've decided more than 2 today btw". He had \u2014 45 of them. This tile said
   "Decided today" but rendered window._sessDecided, which is a per-page-load
   counter: it starts at 0 on every refresh, so it was really "decided since you
   last reloaded" wearing the wrong label. Every lead_decisions row carries
   updated_at, the whole table is already cached client-side, so count the real
   thing. The session figure is genuinely useful for pace, so it stays \u2014 but as
   the subtitle, where it is clearly a different number. */
function decidedTodayCount(){
  try{
    var today=new Date().toLocaleDateString('en-GB',{timeZone:'Europe/London'});
    /* An undone decision must stop counting. The log row is deliberately NOT deleted
       — "decided, then changed his mind" is real history the learning uses — so the
       count checks the lead's CURRENT state instead. Nothing is thrown away. */
    var live={};
    (window.leads||[]).forEach(function(l){ if(l&&l._sid!=null) live[l._sid]=(l.status||l.islead!==null); });
    var seen={};
    (window._decisionCache||[]).forEach(function(r){
      if(!r||!r.decision||!r.updated_at) return;
      var d=new Date(r.updated_at); if(isNaN(d.getTime())) return;
      if(d.toLocaleDateString('en-GB',{timeZone:'Europe/London'})!==today) return;
      if(live[r.id]===false) return;      // undone since
      seen[r.id]=1;                       // a re-decided lead is still one lead
    });
    return Object.keys(seen).length;
  }catch(e){ return window._sessDecided||0; }
}
function sessTileHTML(){
  var n=decidedTodayCount();
  var sn=window._sessDecided||0;
  if(!n) return '<div class="rc rc-off"><div class="rv">0</div><div class="rl">Decided today</div>'
    +'<div class="rsub">about 14 min a day keeps you level</div></div>';
  var mins=sessMins(), rate=(mins>1&&sn)?Math.round(sn/(mins/60)):0;
  var sub=sn
    ? (sn+' this sitting'+(mins>=1?' \u00b7 '+Math.round(mins)+' min':'')+(rate?' \u00b7 '+rate+'/hr':''))
    : 'earlier today';
  return '<div class="rc rc-green"><div class="rv">'+n+'</div><div class="rl">Decided today</div>'
    +'<div class="rsub">'+sub+'</div></div>';
}
/* ── MERGE THE TWIN ROW ─────────────────────────────────────────────────────
   Both VAs finding the same ASIN shows as two rows even though deciding one decides
   both. Jack's conditions, exactly: only merge when NEITHER is decided yet, and only
   when it is genuinely the same deal — same supplier AND same buy price. A different
   supplier or a different price is a different opportunity and stays its own row.
   Nothing is deleted; the twin is simply not drawn, and the surviving row says so. */
function ldSameDeal(a,b){
  var sa=String(a.sup||'').trim().toLowerCase().replace(/\/+$/,'');
  var sb=String(b.sup||'').trim().toLowerCase().replace(/\/+$/,'');
  if(!sa||!sb||sa!==sb) return false;
  return Math.abs((+a.buy||0)-(+b.buy||0))<0.01;
}
function ldMergeTwins(list){
  var byAsin={};
  list.forEach(function(l){
    var k=asinKey(l); if(!k) return;                  // resolved, NOT the column — see asinKey()
    (byAsin[k]||(byAsin[k]=[])).push(l);
  });
  var hide={};
  list.forEach(function(l){ l._twinN=0; l._twinVAs=null; l._twinIds=null; });
  Object.keys(byAsin).forEach(function(k){
    var g=byAsin[k]; if(g.length<2) return;
    if(g.some(function(l){ return l.status||l.islead!==null; })) return;   // any decided → leave alone
    var keep=g.find(function(l){ return l.id===selId; })||g[0];            // never hide his open lead
    g.forEach(function(l){
      if(l===keep) return;
      if(!ldSameDeal(keep,l)) return;                                      // different deal → own row
      /* Only counting them made the row claim "BOTH VAs" whenever ANY twin was merged
         — including LD-0095, where both copies are Suz's. Keep the ids and the VAs so
         the chip can tell "both of them found it" from "she sent it twice". */
      hide[l.id]=1;
      keep._twinN=(keep._twinN||0)+1;
      (keep._twinVAs||(keep._twinVAs=[])).push(l.va);
      (keep._twinIds||(keep._twinIds=[])).push(l.id);
    });
  });
  return list.filter(function(l){ return !hide[l.id]; });
}
function updateCounts(){
  const ctx=leads.filter(l=>_leadCtx(l,false,false));  // context only, both VAs — for ribbon
  const fSt=leads.filter(l=>_leadCtx(l,false,true));    // context + active VA — for status badges
  const fVa=leads.filter(l=>_leadCtx(l,true,false));    // context + active view — for VA badges
  document.getElementById('b-new').textContent=fSt.filter(l=>l.islead===null&&!l.status).length;
  document.getElementById('b-all').textContent=fSt.length;
  document.getElementById('b-lead').textContent=fSt.filter(l=>l.islead===true).length;
  document.getElementById('b-bought').textContent=fSt.filter(l=>l.status==='bought').length;
  document.getElementById('b-basket').textContent=fSt.filter(isBasketish).length;
  document.getElementById('b-passed').textContent=fSt.filter(l=>l.status==='passed').length;
  document.getElementById('b-notlead').textContent=fSt.filter(l=>l.islead===false).length;
  const vm=document.getElementById('b-va-m'); if(vm) vm.textContent=fVa.filter(l=>l.va==='VA M').length;
  const vs=document.getElementById('b-va-s'); if(vs) vs.textContent=fVa.filter(l=>l.va==='VA S').length;
  // ribbon — reflects the context filters (both VAs)
  const bought=ctx.filter(l=>l.status==='bought');
  const bk=ctx.filter(isBasketish).length;
  const decided=ctx.filter(l=>l.islead!==null).length;
  const buyRate=decided?Math.round(bought.length/decided*100):0;
  const unAll=ctx.filter(l=>!l.seen&&l.islead===null&&!l.status);
  const unM=unAll.filter(l=>l.va==='VA M').length, unS=unAll.length-unM;
  const bM=bought.filter(l=>l.va==='VA M').length, bS=bought.length-bM;
  const bkVal=ctx.filter(isBasketish).reduce((a,b)=>a+(+b.buy||0),0);
  /* ── Jack: "I love data and trends and insights." Three upgrades, all measured
     from what is already loaded (no new fetches in this hot path):
     · Unseen carries HOW LONG the oldest has waited — a queue with an age is a
       different thing from a bare count.
     · Bought carries this-week vs last-week with a direction arrow (lead dates —
       decision dates live in a cache this sync function cannot rely on).
     · Avg Score was the average of EVERYTHING, undecided included — a number with
       no question attached. Replaced with the score he BUYS at vs the score he
       PASSES at: if the gap collapses, scores have stopped predicting decisions,
       which is the only thing this tile can usefully warn about. */
  const _now=(function(){ try{ return ukNow(); }catch(e){ return new Date(); } })();
  function _wk(l){ var p=String(l.date||'').split('/');
    if(p.length!==3) return null;
    return ldWeekOffset(new Date(+p[2],+p[1]-1,+p[0]),_now); }
  let oldestUn=0;
  unAll.forEach(l=>{ const p=String(l.date||'').split('/');
    if(p.length!==3) return;
    const d=Math.round((_now-new Date(+p[2],+p[1]-1,+p[0]))/86400000);
    if(d>oldestUn) oldestUn=d; });
  const bThisWk=bought.filter(l=>{const w=_wk(l);return w!==null&&w>=0&&w<=6;}).length;
  const bLastWk=bought.filter(l=>{const w=_wk(l);return w!==null&&w>=-7&&w<=-1;}).length;
  const bArrow=bThisWk>bLastWk?'▲':bThisWk<bLastWk?'▼':'—';
  const bCol=bThisWk>=bLastWk?'#3ac478':'#ffb830';
  function _avgOf(list){ return list.length?(list.reduce((a,b)=>a+((b._sc&&b._sc.total)||0),0)/list.length):null; }
  const buyAvg=_avgOf(ctx.filter(l=>l.status==='bought'||l.status==='atbq'||l.status==='atba2a'));
  const passAvg=_avgOf(ctx.filter(l=>l.status==='passed'||l.islead===false));
  const gap=(buyAvg!=null&&passAvg!=null)?(buyAvg-passAvg):null;
  const scoreWorks=gap!=null&&gap>=0.8;
  document.getElementById('ribbon').innerHTML=`
    <div class="rc rc-click ${unAll.length?'rc-purple':'rc-off'}" onclick="gotoView('new')" title="Show new / undecided leads. Oldest has waited ${oldestUn} day${oldestUn===1?'':'s'}."><div class="rv">${unAll.length}</div><div class="rl">Unseen</div><div class="rsub">M ${unM} · S ${unS}${oldestUn>=3?` · <b style="color:#ffb830">oldest ${oldestUn}d</b>`:''}</div></div>
    ${sessTileHTML()}
    <div class="rc rc-click rc-green" onclick="gotoView('bought')" title="Bought this week vs last week (by the lead's date)"><div class="rv">${bought.length}</div><div class="rl">Bought</div><div class="rsub">wk <b style="color:${bCol}">${bThisWk} ${bArrow}</b> vs ${bLastWk} · M ${bM} · S ${bS}</div></div>
    <div class="rc rc-click ${bk?'rc-amber':'rc-off'}" onclick="gotoView('basket')" title="Show ATB / waiting leads"><div class="rv">${bk}</div><div class="rl">ATB / Waiting</div><div class="rsub">${bk?'£'+bkVal.toFixed(0)+' to spend':'nothing waiting'}</div></div>
    <div class="rc rc-cyan" title="Of everything decided, how much ended in a buy"><div class="rv">${buyRate}%</div><div class="rl">Buy rate</div><div class="rsub">${bought.length} of ${decided} decided</div></div>
    <div class="rc ${scoreWorks?'rc-cyan':'rc-amber'}" title="Average score of what you BUY vs what you PASS. A healthy gap means the score is predicting your decisions; if it collapses, the scoring needs a retune."><div class="rv">${buyAvg!=null?buyAvg.toFixed(1):'-'}<span style="font-size:12px;color:var(--muted-2)"> vs ${passAvg!=null?passAvg.toFixed(1):'-'}</span></div><div class="rl">Buy vs pass score</div><div class="rsub">${gap!=null?(scoreWorks?'gap '+gap.toFixed(1)+' — score is earning its keep':'<b>gap only '+gap.toFixed(1)+'</b> — score barely separates them'):'not enough decided'}</div></div>`;
  /* Jack, pointing at the red 614: "this number stressing me out btw". A debt
     counter he cannot clear today is pressure, not information — same reason the
     "GOING STALE" tile went. The badge now shows what arrived in the LAST 48H
     (the pile that is actually today's job), in a calm colour; the full backlog
     lives in the tooltip. */
  var sb=document.getElementById('side-leads-badge');
  if(sb){
    var und=leads.filter(l=>l.islead===null&&!l.status);
    var fresh=und.filter(function(l){ return (parseFloat(l.hrs)||999)<=48; }).length;
    sb.textContent=fresh;
    sb.title=fresh+' new in the last 48h · '+und.length+' undecided in total';
    sb.classList.add('calm');
    sb.style.display=(fresh>0&&window._mgrUnlocked)?'inline-block':'none';
  }
}
/* ── A DECIDED LEAD LEAVES THE LIST STRAIGHT AWAY ───────────────────────────
   Deciding a lead in the "New" view left it sitting there until the next 60s
   refresh, so Jack couldn't tell what he'd already done — his words: "it only
   disappears once it refreshes which is a min bug". Now the row animates out
   the moment it no longer belongs in the current view, with an undo. */
function leadStillBelongs(l){
  try{ return getF().some(function(x){ return x.id===l.id; }); }catch(e){ return true; }
}
/* A decided lead used to slide out 260ms later, taking the open detail pane with it —
   so pressing BOUGHT closed the very panel holding the note field and the quantity box,
   and Jack couldn't record what he'd just decided. It now STAYS until he moves on: the
   row is marked decided, the list keeps it, and it only leaves when he selects a
   different lead. Nothing is lost between deciding and writing it up. */
var _pendingLeave=null;
/* Repaint a single row in place. The list only needs a full rebuild when the SET of
   rows changes (filter, sort, search, reload) — a decision changes one lead. */
function ldRowRefresh(id){
  try{
    var l=(window.leads||[]).find(function(x){ return x.id===id; });
    var row=document.querySelector('#view-leads .litem[data-lid="'+id+'"]');
    if(!l||!row) return false;
    var wasSel=row.classList.contains('sel');
    var tmp=document.createElement('div');
    tmp.innerHTML=litemH(l);
    var fresh=tmp.firstElementChild;
    if(!fresh) return false;
    if(wasSel) fresh.classList.add('sel');
    row.replaceWith(fresh);
    try{ updateCounts(); }catch(e){}
    return true;
  }catch(e){ return false; }
}
function afterDecision(id){
  try{
    var l=(window.leads||[]).find(function(x){ return x.id===id; });
    if(!l) return;
    if(leadStillBelongs(l)){
      // one row, not 655 — a full renderList() here measured 175ms on his real load
      if(!ldRowRefresh(id)) renderList();
      var row0=document.querySelector('.litem[data-lid="'+id+'"]');
      if(row0) row0.classList.add('litem-decided');
      /* Jack: "the how many i bought isn't popping up until a while". setSt() sets
         _noteFor and expects the DETAIL pane to repaint — but the row-only fast path
         added for speed never repainted it, so the qty box only turned up whenever
         something else happened to redraw the pane (a refresh, clicking another lead,
         the 60s pull). Repaint the pane too when this is the lead on screen; it is one
         element, so the 175ms full-list rebuild is still avoided. */
      if(selId===id){ try{ renderDetail(); }catch(e){} }
      return;
    }
    // hold it on screen while it's the one being looked at
    if(selId===l.id){
      _pendingLeave=l.id;
      var row=document.querySelector('.litem[data-lid="'+id+'"]');
      if(row) row.classList.add('litem-decided');
      try{ renderDetail(); }catch(e){ try{ renderList(); }catch(_){} }
      return;
    }
    var row2=document.querySelector('.litem[data-lid="'+id+'"]');
    if(!row2){ renderList(); return; }
    row2.classList.add('litem-leaving');
    setTimeout(function(){
      try{ renderList(); }catch(e){}
      showDecisionUndo(l);
    }, 260);
  }catch(e){ try{ renderList(); }catch(_){} }
}
/* called when the selection changes — now the held row can go */
function flushPendingLeave(){
  if(_pendingLeave==null) return;
  var id=_pendingLeave; _pendingLeave=null;
  var l=(window.leads||[]).find(function(x){ return x.id===id; });
  try{ renderList(); }catch(e){}
  if(l && !leadStillBelongs(l)) showDecisionUndo(l);
}
function decisionLabel(l){
  if(l.status==='bought') return 'Bought';
  if(l.status==='atbq')   return 'ATB (Q)';
  if(l.status==='atba2a') return 'ATB (A2A)';
  if(l.status==='waiting')return 'Waiting';
  if(l.islead===false)    return 'Not a lead';
  if(l.islead===true)     return 'Lead';
  return 'Decided';
}
function showDecisionUndo(l){
  var host=document.getElementById('view-leads'); if(!host) return;
  var bar=document.getElementById('lead-undo-bar');
  if(!bar){ bar=document.createElement('div'); bar.id='lead-undo-bar'; host.appendChild(bar); }
  bar.innerHTML='<span class="lu-t">'+escHtml(decisionLabel(l))+'</span>'
    +'<span class="lu-n">'+escHtml(String(l.title||l.asin||'').slice(0,52))+'</span>'
    +'<button onclick="undoDecision('+l.id+')">Undo</button>';
  bar.classList.add('show');
  clearTimeout(window._luT);
  window._luT=setTimeout(function(){ if(bar) bar.classList.remove('show'); }, 6000);
}
function undoDecision(id){
  try{ undoA(id); }catch(e){}
  var bar=document.getElementById('lead-undo-bar'); if(bar) bar.classList.remove('show');
  try{ renderList(); selectLead(id,true); }catch(e){}
}
/* Measured on Jack's real 735 leads: one renderList() is 116ms with 678 rows on screen,
   so typing "nespresso" fired nine of them — 354ms of blocked main thread, and the list
   he was looking at belonged to an earlier keystroke. That is the "search is super
   glitchy" and the "search doesn't filter" report: both the same stall.
   Type freely; the list catches up once, when he stops. */
var _ldSearchT=null, _ldSearchRAF=null, _ldSearchLast=null, _ldSearchShown=null;
/* A debounce alone was not safe. Browsers throttle (and in a background tab, suspend)
   setTimeout, so the trailing render could simply never arrive — measured live: the box
   read "nespress", the pending flag was still true seconds later, and the list still had
   all 678 rows. Calling renderList() by hand produced the right 18 in 26ms. So the timer
   is now only ONE of the ways the render can happen:
     · setTimeout  — the normal path while typing
     · rAF         — fires whenever the page actually paints
     · flush       — on keyup/change/blur, and on coming back to the tab
   plus ldSearchGuard(), which repaints if what is on screen doesn't match the box. */
function ldSearchFlush(){
  if(_ldSearchT){ clearTimeout(_ldSearchT); _ldSearchT=null; }
  if(_ldSearchRAF){ cancelAnimationFrame(_ldSearchRAF); _ldSearchRAF=null; }
  var el=document.getElementById('search');
  _ldSearchShown=el?el.value:'';
  renderList();
}
function ldSearchInput(){
  var el=document.getElementById('search');
  var q=el?el.value:'';
  if(q===_ldSearchLast) return;                 // repeat keystroke, same text: nothing to do
  _ldSearchLast=q;
  if(_ldSearchT) clearTimeout(_ldSearchT);
  if(_ldSearchRAF) cancelAnimationFrame(_ldSearchRAF);
  _ldSearchT=setTimeout(ldSearchFlush,140);
  _ldSearchRAF=requestAnimationFrame(function(){
    _ldSearchRAF=null;
    setTimeout(function(){ if(_ldSearchT) ldSearchFlush(); },140);
  });
}
/* last line of defence: if the list on screen was built for a different query than the
   box holds, repaint. Cheap (a string compare) and runs on the interactions a stuck
   search would otherwise survive. */
function ldSearchGuard(){
  var el=document.getElementById('search'); if(!el) return;
  if(el.value===_ldSearchShown) return;
  ldSearchFlush();
}
if(!window._ldSearchBound){
  window._ldSearchBound=true;
  document.addEventListener('visibilitychange',function(){ if(!document.hidden) ldSearchGuard(); });
  window.addEventListener('focus',ldSearchGuard);
  document.addEventListener('keyup',function(e){
    if(e&&e.target&&e.target.id==='search') ldSearchGuard();
  },true);
  document.addEventListener('change',function(e){
    if(e&&e.target&&e.target.id==='search') ldSearchGuard();
  },true);
  document.addEventListener('click',ldSearchGuard,true);
}
var LD_PAGE=70;                 // rows built on the first pass — about two screens
/* Append the rest in chunks: once on the next frame (so a short list completes instantly)
   and again whenever she scrolls near the bottom. Never blocks typing. */
/* Measure one real row and hand the number to contain-intrinsic-size, so the
   browser's guess for off-screen rows matches what it will actually find. Without
   this the page height keeps correcting itself while you scroll. */
function ldSyncRowH(){
  try{
    var el=document.getElementById('list-scroll'); if(!el) return;
    /* MEASURE A ROW THE BROWSER IS ACTUALLY LAYING OUT.
       First attempt at this read a row that content-visibility was SKIPPING, so
       getBoundingClientRect handed back the placeholder — i.e. the very number we
       had just written. Each render then fed its own output back in and the value
       ratcheted 127 -> 144 -> 161 -> 178px. Force one row to render, measure that,
       put it back. Median of a few, in case one row is atypical. */
    var rs=[].slice.call(el.querySelectorAll('.litem')).slice(0,6);
    if(!rs.length) return;
    var hs=[];
    rs.forEach(function(x){
      var prev=x.style.contentVisibility;
      x.style.contentVisibility='visible';               // opt this row out of skipping
      var v=Math.round(x.getBoundingClientRect().height);
      x.style.contentVisibility=prev||'';
      if(v>40 && v<400) hs.push(v);
    });
    if(!hs.length) return;
    hs.sort(function(a,b){ return a-b; });
    var h=hs[Math.floor(hs.length/2)];
    if(!h || h<40 || h>400) return;                       // nonsense guard
    if(window._ldRowH===h) return;                        // unchanged, don't touch the DOM
    window._ldRowH=h;
    document.documentElement.style.setProperty('--ld-row-h', h+'px');
  }catch(e){}
}
function ldFillMore(){ /* retired 31/08 — the list renders in full now; the queue
  approach appended rows AFTER the date headings and orphaned everything past ~70. */ }
if(!window._ldScrollBound){
  window._ldScrollBound=true;
  document.addEventListener('scroll',function(e){
    var el=e&&e.target; if(!el||el.id!=='list-scroll') return;
    if(el.scrollTop+el.clientHeight > el.scrollHeight-600) ldFillMore();
  },true);
}
/* The search box called renderList() on EVERY keystroke, and renderList rebuilds the
   whole board from scratch. Measured on Jack's real data (772 leads): ~500ms a call,
   so typing a 10-character ASIN cost 1,268ms of blocked main thread — the page simply
   stops responding while you type. Filters and sort still redraw instantly; only
   typing waits, and only until you pause. Enter forces it through immediately. */
function searchTyped(){
  clearTimeout(window._searchT);
  window._searchT=setTimeout(function(){ try{ renderList(); }catch(e){} },140);
}
function searchNow(){ clearTimeout(window._searchT); try{ renderList(); }catch(e){} }
/* The notices strip (archived / older hidden / ASIN mismatches / dups held) used to
   be painted inline by renderList only. Selecting a lead repaints the DETAIL, not
   the list — so the 'fold while a lead is open' rule (03/09) never fired on the
   click that opened the lead, only on the next list repaint. Own function, called
   from both places, so the strip always reflects whether a lead is open. */
function ldPaintNotices(){
    var _ae=document.getElementById('archive-line');
    if(_ae){
      var _n=ldArchivedCount();
      var _q=(document.getElementById('search')?.value||'').trim();
      var _cM=0,_cS=0;
      try{(window.leads||[]).forEach(function(l){ if(leadAsinConflict(l)){ if(l.va==='VA M')_cM++; else if(l.va==='VA S')_cS++; } });}catch(e){}
      /* The app routes around the bad column, but the SHEET is still wrong and every
         tool that reads it raw inherits the fault. One click builds the row-by-row
         repair list for that VA \u2014 Jack pastes it into Discord, she fixes her sheet,
         and the number here falls to zero. Fix the source, not just the symptom. */
      var _cx=(_cM+_cS)
        ? '<span class="ld-arch" title="Rows where the ASIN column and the Amazon link name different products. The app follows the link; the sheet still needs fixing.">'
          +'\u26a0 <b>'+(_cM+_cS)+'</b> ASIN mismatches \u2014 copy fix-list:'
          +(_cM?' <button class="ld-arch-b" onclick="asinFixCopy(\'VA M\')">'+vaDisp('Mera')+' ('+_cM+')</button>':'')
          +(_cS?' <button class="ld-arch-b" onclick="asinFixCopy(\'VA S\')">'+vaDisp('Suz')+' ('+_cS+')</button>':'')
          +'</span>'
        : '';
      /* The start-date cutoff is Jack's own setting, so it stays \u2014 but it is no longer
         allowed to be silent. Nothing is deleted; these are older than the day he began
         using the app. One click to see them if he ever wants. */
      var _hs=(+window._ldHiddenByStart||0);
      var _hsHtml=window._ldStartOverride
        ? '<span class="ld-arch" title="Showing everything, including leads from before you '
          +'started using the app. This lasts until you reload.">\u{1F4C5} showing <b>all</b> leads'
          +' <button class="ld-arch-b" onclick="ldHideOlder()">Back to normal</button></span>'
        : (_hs
        ? '<span class="ld-arch" title="Older than '+escHtml(window._ldStartDate||'your start date')
          +' \u2014 the day you started using the app. Nothing is deleted; they are still in the '
          +'database and still in the VAs\u2019 sheets.">\u{1F4C5} <b>'+_hs+'</b> older leads hidden'
          +' <button class="ld-arch-b" onclick="ldShowOlder()">Show them</button></span>'
        : '');
      var _dh=0; try{ (window.leads||[]).forEach(function(l){
        if(!(l.status||l.islead!==null)&&ldDupUnexplained(l)) _dh++; }); }catch(e){}
      var _dhHtml=_dh
        ? '<span class="ld-arch" title="Same ASIN, same supplier, same price, same month, '
          +'no VA note. Held off your board and out of every KPI until the VA adds a reason '
          +'or deletes the row. Search still finds them.">&#9851; <b>'+_dh+'</b> dup'
          +(_dh===1?'':'s')+' held back</span>'
        : '';
      var _arch=(_n
        ? '<span class="ld-arch" title="They are only hidden from this list. Search still '
          +'finds them and nothing is removed from the sheet.">\u{1F5C4} <b>'+_n+'</b> archived'
          +(_q?' (shown \u2014 you\u2019re searching)':'')+'</span>'
        : '');
      /* 03/09: while he is inside a lead these four chips are noise over the work.
         Fold them to a single count; one click brings them back. */
      var _parts=[_dhHtml,_arch,_hsHtml,_cx].filter(Boolean);
      /* "a lead is open" is read from the detail pane itself (renderDetail stamps
         data-lid), not from selId — that binding is not dependable at every point
         this runs, and the fold button vanished on the phone because of it. */
      var _dp=document.getElementById('detail-pane');
      /* selectLead() paints the pane directly and never stamps data-lid (only
         renderDetail does), so the stamp alone missed the very click that opens a
         lead. A rendered .detail inside the pane is the truth in both layouts. */
      var _leadOpen=(selId!==null&&selId!==undefined) || !!(_dp && ((_dp.dataset&&_dp.dataset.lid) || _dp.querySelector('.detail')));
      if(_leadOpen && !window._ldChipsOpen && _parts.length){
        _ae.innerHTML='<span class="ld-arch ld-arch-sum" title="Folded while a lead is open \u2014 click to see them" '
          +'onclick="window._ldChipsOpen=true;renderList()">&#9873; <b>'+_parts.length+'</b> notice'+(_parts.length===1?'':'s')+' &#9656;</span>';
      } else {
        _ae.innerHTML=_parts.join('')
          +((_leadOpen&&_parts.length)?' <button class="ld-arch-b" onclick="window._ldChipsOpen=false;renderList()">fold</button>':'');
      }
    }
  }
/* The notices strip must follow the DETAIL PANE, whatever repainted it. selectLead()
   writes the pane directly (it does not go through renderDetail), so a strip
   repaint hung off renderList/renderDetail alone missed the tap that opens a lead.
   Watch the pane; repaint the strip once per frame when it changes. The painter
   only touches #archive-line, so this cannot feed back into itself. */
(function(){
  var armed=false;
  function arm(){
    var dp=document.getElementById('detail-pane');
    if(!dp){ return setTimeout(arm,300); }
    if(armed) return; armed=true;
    var queued=false;
    new MutationObserver(function(){
      if(queued) return; queued=true;
      requestAnimationFrame(function(){ queued=false; try{ ldPaintNotices(); }catch(e){} });
    }).observe(dp,{childList:true});
  }
  arm();
})();
function renderList(){
  if(!document.getElementById('list-scroll'))return;
  /* buildDupeMap() walked all 735 leads on EVERY render, including every keystroke.
     It only changes when the lead set does, so key it on that. */
  try{
    var _sig=(window.leads||[]).length+':'+((window.leads||[])[0]||{})._sid;
    if(window._dupeSig!==_sig){ buildDupeMap(); window._dupeSig=_sig; }
  }catch(e){ try{ buildDupeMap(); }catch(_){} }
  /* The list is built BEFORE the counts now. It used to be the other way round, so a
     throw while filtering left fresh chips above a stale list — the user-visible symptom
     of "search doesn't work". If it throws now, nothing has been updated yet and the
     error is shown rather than swallowed. */
  var fl;
  try{
    var _sb=document.getElementById('search'); _ldSearchShown=_sb?_sb.value:'';
    fl=ldMergeTwins(getF());
  }catch(e){
    try{ console.error('[renderList] filter failed:',e); }catch(_){}
    try{ document.getElementById('list-scroll').innerHTML=
      '<div style="padding:26px 18px;color:#ff9d9d;font-size:13px;line-height:1.6">'
      +'Couldn\u2019t build the list \u2014 <b>'+String(e&&e.message||e).replace(/</g,'&lt;')+'</b>'
      +'<br><span style="color:#a9b3c7">Tell Jack exactly what you typed. Clearing the search box will bring it back.</span></div>'; }catch(_){}
    return;
  }
  updateCounts();
  document.getElementById('tt-count').textContent=fl.length+(fl.length===1?' lead':' leads');
  const el=document.getElementById('list-scroll');
  if(!fl.length){
    const q=(document.getElementById('search')?.value||'').trim();
    if(window._focus){
      el.innerHTML='<div class="fq-empty">✅ Queue clear — all '+window._focus.total+' decided.'
        +'<div><button class="fq-go" onclick="focusStart('+FOCUS_N+')">Next '+FOCUS_N+'</button>'
        +'<button class="fq-x" onclick="focusStop()">Back to everything</button></div></div>';
      document.getElementById('detail-pane').innerHTML=emptyDetail();
      try{ document.getElementById('focus-entry').innerHTML=focusEntryHTML(); }catch(e){}
      return;
    }
    const msg=q?`No leads match “${q}”.`:{new:'No new leads right now — all caught up.<br><span style="font-size:11px;color:var(--muted-2);">Auto-refreshes every 60s from the VA sheets.</span>',lead:'No confirmed leads yet.',bought:'Nothing bought yet.',basket:'Your basket is empty.',passed:'Nothing passed yet.',notlead:'Nothing marked “not a lead”.',all:'No leads match your filters.'}[view]||'No leads match your filters.';
    /* Jack, searching the ASIN of a lead he had just approved: "where has it gone?"
       Nowhere — it left THIS view. Search runs inside the current view and its filters,
       so the moment a lead is decided it drops out of New Leads and searching for it
       says "No leads match", which reads as lost. Look across everything and offer the
       jump; never silently change the view under him. */
    let extra='';
    if(q){
      const ql=q.toLowerCase();
      const anywhere=leads.filter(x=>x&&((x.title||'').toLowerCase().includes(ql)
                                       ||(x.asin||'').toLowerCase().includes(ql)));
      if(anywhere.length){
        const where={};
        anywhere.forEach(x=>{ const k=statusInfo(x)[0]||'Undecided'; where[k]=(where[k]||0)+1; });
        const lbl=Object.keys(where).map(k=>where[k]+' '+k).join(' · ');
        extra=`<div style="margin-top:14px;font-size:12px;color:var(--muted);line-height:1.6;">`
          +`It is not lost \u2014 <b style="color:var(--text)">${anywhere.length}</b> match`
          +`${anywhere.length===1?'':'es'} outside this view.<br>`
          +`<span style="font-size:11px;color:var(--muted-2)">${lbl}</span><br>`
          +`<button class="fq-go" style="margin-top:9px" onclick="ldSearchEverywhere()">Search all leads</button></div>`;
      }
    }
    /* Jack, twice, on the panel-says-3-copies / list-says-no-match combo: "what does
       this mean" / "is this buggy". Both lines were true and together they read as a
       contradiction. When the ASIN panel above is already showing every copy, the
       empty state defers to it instead of contradicting it. */
    var _ac=asinCheckHTML();
    var _msg=msg, _extra=extra;
    if(_ac && /^b0[a-z0-9]{8}$/i.test(q||'')){
      _msg='Every copy is in the panel above — including ones this view’s filters would hide.';
      _extra='';
    }
    el.innerHTML=_ac+`<div style="padding:50px 20px;text-align:center;color:var(--t4);font-size:13px">${_msg}${_extra}</div>`;
    document.getElementById('detail-pane').innerHTML=emptyDetail();return;
  }
  /* Jack: "this isn't sorting by score is it — it's sorting it by score AND day".
     Correct. getF() sorted the whole list properly and then this re-grouped it under
     date headings, so the best lead on the board was buried under whichever day it
     came from. Grouping by day only makes sense when the sort IS the day; every other
     sort now renders one flat list, top to bottom. The date is still on every row. */
  const byDate=(sortBy==='date');
  const bd={}; const ord=[];
  if(byDate){
    fl.forEach(l=>{(bd[l.date]=bd[l.date]||[]).push(l)});
    Object.keys(bd).sort((a,b)=>{const p=d=>d.split('/').reverse().join('');return p(b).localeCompare(p(a))})
      .forEach(d=>ord.push(d));
  } else {
    bd['']=fl; ord.push('');
  }
  /* "Today" was hardcoded to 04/06/2026 and "Yesterday" to 03/06/2026 — the dates the
     code was written. It is 13/08/2026, so no row has said Today for months. */
  const _todayStr=(function(){ try{ return ukDateShort(); }catch(e){ return ''; } })();
  const _yestStr=(function(){
    try{ var d=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
         d.setDate(d.getDate()-1);
         return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear();
    }catch(e){ return ''; }
  })();
  /* Every keystroke used to rebuild all ~680 rows: 116ms of blocked main thread each time.
     Debouncing that turned out worse — a throttled timer meant the render could simply
     never arrive and the list sat stale. So: render on EVERY input, synchronously, but
     only build what fits on screen (plus a screenful of slack) and append the rest as she
     scrolls. Always correct, and cheap enough that correctness costs nothing. */
  /* Jack, staring at a wall of date headings with no rows and stray leads dumped
     at the bottom: "why can't I access these leads — major major bug". The old
     windowed render built EVERY heading up front but queued rows past ~70, and
     ldFillMore appended those rows with insertAdjacentHTML('beforeend') — AFTER
     all the headings, orphaned from their dates. The leads were never gone; they
     were in the wrong place, which is worse.
     Everything renders in one pass now. content-visibility:auto on the rows means
     the browser skips layout for what's off screen, so the full-list cost is a
     one-off ~100ms on filter change, not a scroll-time reflow — and nothing moves
     under her while scrolling, because nothing is appended later. */
  let h=''; const shown=[];
  ord.forEach(date=>{
    if(date!==''){
      const lb=date===_todayStr?'Today':date===_yestStr?'Yesterday':date;
      h+=`<div class="ld-date">${lb}<span>${bd[date].length}</span></div>`;
    }
    bd[date].forEach(l=>{ shown.push(l); h+=litemH(l); });
  });
  el.innerHTML=asinCheckHTML()+h;
  window._ldQueue=null;
  try{ ldSyncRowH(); setTimeout(ldSyncRowH,350); }catch(e){}   // again once fonts/images settle
  try{
    var _fe=document.getElementById('focus-entry');
    if(_fe) _fe.innerHTML=focusEntryHTML();
  }catch(e){}
  try{ ldPaintNotices(); }catch(e){}
  try{
    var _be=document.getElementById('bulk-entry');
    if(_be){
      var _und=(window.leads||[]).filter(function(l){ return !l.status&&l.islead===null; }).length;
      var _obv=(window.leads||[]).filter(function(l){ return !l.status&&l.islead===null&&(spmNum(l.spm)<10||(+l.profit||0)<3); }).length;
      _be.innerHTML=(!window._focus&&_und>=40&&_obv>=15)
        ? '<button class="bk-entry" onclick="bulkOpen()" '
            +'title="Under 10 sales a month, or under £3 profit — review them together before anything is marked">'
            +'⚡ Clear <b>'+_obv+'</b> near-certain no\u2019s</button>'
        : '';
    }
  }catch(e){}
  const stillThere=selId!==null&&fl.find(l=>l.id===selId);
  if(stillThere){ selectLead(selId,false); }
  else if(!window._ldPainted){                   // FIRST paint only — open the top one
    window._ldPainted=true;
    selId=(shown[0]||fl[0]).id;                  // top of the screen, not top of the sort
    selectLead(selId,false);
  } else {
    /* His selection is gone (decided, filtered out, or a refresh). Do NOT grab a
       different lead — Jack: "wait for me to click off leads". Leave the pane. */
    selId=null; try{ renderDetail(); }catch(e){}
  }
  /* Paint the notices strip LAST, after the selection above has been restored or
     cleared — painted earlier in this function it read the pane mid-rebuild and
     decided no lead was open, so the fold never showed on the phone. */
  try{ ldPaintNotices(); }catch(e){}
}
/* ══════════ THE ROW THUMBNAIL — WHY THIS IS SO PLAIN NOW ════════════════════
   Measured on Jack's board: a lead row was 2,490 bytes of HTML, and ~940 of them
   were THIS function — a `data-q` JSON array of three full Amazon CDN URLs, an
   inline `onload`, an inline `onerror`, and a copy of the placeholder SVG. All
   four are identical on every row, so 295 rows carried 295 copies. Building that
   string is what made a redraw cost ~355ms on "this month".

   Everything is recoverable without storing it per row:
     · the URL chain is a pure function of the ASIN  -> keep an index, not a list
     · the fallback logic is the same for every img  -> one delegated listener
     · the placeholder is the same drawing every time-> one CSS mask
   Same behaviour, same look, roughly 40% less markup. */
function leadThumb(asin,cls,imgUrl){
  var ph='<span class="lt-ph"></span>';
  if(!asin && !imgUrl) return '<div class="'+cls+'">'+ph+'</div>';
  function usable(u){ return typeof u==='string' && /^https?:\/\/\S+$/i.test(u.trim()); }
  // A blank, whitespace or junk stored URL made `src` resolve to the PAGE ITSELF —
  // on file:// that throws "Unsafe attempt to load URL … unique security origins",
  // and on https it silently downloads the whole app into an <img>. Only ever put a
  // real absolute URL in src.
  var stored = usable(imgUrl) ? imgUrl.trim() : '';
  var cdn = asin ? imgCdnChain(asin) : [];
  // start on the stored image if we have one, else the first CDN guess.
  // data-i = which CDN candidate to try NEXT, so the list itself never ships.
  var start = stored || cdn[0] || '';
  if(!start) return '<div class="'+cls+'">'+ph+'</div>';
  var next  = stored ? 0 : 1;
  return '<div class="'+cls+'">'+ph+'<img class="lt-img" alt="" loading="lazy" data-asin="'+(asin||'')+'" data-i="'+next+'" src="'+start+'"></div>';
}
/* One listener for every thumbnail on the page, present and future. load/error do
   not bubble, so this listens in the CAPTURE phase — that is the whole trick. */
(function(){
  function step(img){
    var asin=img.getAttribute('data-asin')||'';
    var chain=asin?imgCdnChain(asin):[];
    var i=parseInt(img.getAttribute('data-i'),10); if(!isFinite(i)) i=0;
    if(i<chain.length){ img.setAttribute('data-i', i+1); img.src=chain[i]; return; }
    imgFail(img);
  }
  function onEvt(e){
    var t=e.target;
    if(!t || t.tagName!=='IMG' || !t.classList.contains('lt-img')) return;
    // a 1px response is Amazon's "no image for this ASIN" answer, not a real picture
    if(e.type==='load' && t.naturalWidth>1) return;
    step(t);
  }
  if(document.addEventListener){
    document.addEventListener('load', onEvt, true);
    document.addEventListener('error', onEvt, true);
  }
})();
// image candidate URLs for an ASIN — UK/EU first (leads pull from amazon.co.uk), then US
function imgCdnChain(asin){
  var P=function(host,v){return 'https://'+host+'/images/P/'+asin+'.'+v+'._SL160_.jpg';};
  return [P('images-eu.ssl-images-amazon.com','02'),P('images-na.ssl-images-amazon.com','01'),P('images-na.ssl-images-amazon.com','02'),P('images-eu.ssl-images-amazon.com','01')];
}
function imgFail(img){ try{ var a=img.getAttribute('data-asin'); if(a){ window._imgFails=window._imgFails||{}; window._imgFails[a]=(window._imgFails[a]||0)+1; } img.remove(); }catch(e){} }
/* ── DUPLICATE LEADS ─────────────────────────────────────────────────────────
   Two different situations that deserve different treatment:
     SAME VA twice inside a month  → wasted effort. Grey it down, it's noise.
     BOTH VAs found it             → NOT waste in the same way. Two people landing
                                     on the same product independently is weak
                                     evidence it's genuinely attractive, so greying
                                     it would hide something useful. Keep the VA
                                     identity colour, tint the row, flag it.
   The EARLIER lead is the original; the later one carries the badge. */
var DUPE_WINDOW_DAYS = 30;
var _dupeMap = null;
function dupeKeyDate(l){
  try{ var d=liDate(l); return d?d.getTime():0; }catch(e){ return 0; }
}
function dupeMapDirty(){ try{ window._dupeSig=null; }catch(e){} }
function buildDupeMap(){
  _sidAsinIdx=null;                                   // lead set changed — rebuild the row index too
  var map={}, byAsin={};
  (window.leads||[]).forEach(function(l){
    var a=asinKey(l); if(!a) return;                  // resolved, NOT the column — see asinKey()
    (byAsin[a]=byAsin[a]||[]).push(l);
  });
  Object.keys(byAsin).forEach(function(a){
    var arr=byAsin[a];
    if(arr.length<2) return;
    arr.sort(function(x,y){ return dupeKeyDate(x)-dupeKeyDate(y); });   // oldest first
    for(var i=1;i<arr.length;i++){
      var cur=arr[i];
      for(var j=i-1;j>=0;j--){
        var prev=arr[j];
        var dt=dupeKeyDate(cur)-dupeKeyDate(prev);
        if(!dupeKeyDate(cur)||!dupeKeyDate(prev)) continue;
        if(dt > DUPE_WINDOW_DAYS*86400000) continue;
        var days=Math.round(dt/86400000);
        map[cur.id]={ sameVA: cur.va===prev.va, days: days,
                      otherVA: prev.va, otherId: prev.id };
        break;                                                          // nearest earlier match wins
      }
    }
  });
  _dupeMap=map;
  return map;
}
function dupeOf(l){
  if(!_dupeMap) buildDupeMap();
  return _dupeMap[l.id]||null;
}
/* ── WAS THERE A REASON TO SEND IT AGAIN? ─────────────────────────────────────
   Jack's rule: a repeat is only allowed if something changed — back on offer, or
   cheaper than last time. Same supplier at the same price again should never be
   sent. The badge used to say only "DUPE", which flattened a justified re-send
   (price dropped £57) and pure waste (identical, 23 days later) into one word.
   Measured across the board: of 306 repeats, 81 were genuinely cheaper and 225
   had no reason at all. Now the badge says which, so a glance is enough. */
function dupePriceMove(l){
  var d=dupeOf(l); if(!d) return null;
  var prev=(window.leads||[]).find(function(x){ return x.id===d.otherId; });
  if(!prev) return null;
  var pb=parseFloat(prev.buy)||0, cb=parseFloat(l.buy)||0;
  if(!pb||!cb) return null;
  var diff=cb-pb, pct=diff/pb;
  return { prev:pb, now:cb, diff:diff, pct:pct,
           cheaper:pct<=-0.02, same:Math.abs(pct)<0.02, dearer:pct>=0.02 };
}
/* ── THE DROPDOWNS ──────────────────────────────────────────────────────────
   Jack, 03/09: "improve popup/dropdown thingy". The filter bar uses native
   <select>, and while the CLOSED control is styled to match the app, the OPEN menu
   is drawn by macOS — grey, system font, its own blue highlight, nothing to do with
   the app around it. There is no CSS that can reach inside it.
   So: keep every <select> exactly as it is (it stays the source of truth, keyboard
   and mobile behaviour untouched, every existing onchange still fires) and overlay
   a styled menu on top when it is clicked. If anything here fails the native menu
   is simply what happens — this can degrade, it cannot break.
   Phones keep the native wheel, which is the better control there. */
var _ddOpen=null;
function ddClose(){
  if(!_ddOpen) return;
  try{ _ddOpen.menu.remove(); }catch(e){}
  try{ _ddOpen.sel.classList.remove('dd-active'); }catch(e){}
  _ddOpen=null;
  document.removeEventListener('keydown',ddKey,true);
}
function ddKey(e){
  if(!_ddOpen) return;
  var items=[].slice.call(_ddOpen.menu.querySelectorAll('.dd-opt'));
  var cur=items.findIndex(function(x){ return x.classList.contains('on'); });
  if(e.key==='Escape'){ e.preventDefault(); ddClose(); return; }
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    var nx=Math.max(0,Math.min(items.length-1,cur+(e.key==='ArrowDown'?1:-1)));
    items.forEach(function(x){ x.classList.remove('on'); });
    items[nx].classList.add('on'); items[nx].scrollIntoView({block:'nearest'});
    return;
  }
  if(e.key==='Enter'){ e.preventDefault(); if(items[cur]) items[cur].click(); }
}
function ddOpen(sel){
  if(_ddOpen && _ddOpen.sel===sel){ ddClose(); return; }
  ddClose();
  var r=sel.getBoundingClientRect();
  var m=document.createElement('div');
  m.className='dd-menu';
  var opts=[].slice.call(sel.options);
  m.innerHTML=opts.map(function(o,i){
    return '<div class="dd-opt'+(o.selected?' on sel':'')+'" data-i="'+i+'">'
      +(o.selected?'<span class="dd-tick">\u2713</span>':'<span class="dd-tick"></span>')
      +'<span>'+escHtml(o.text)+'</span></div>';
  }).join('');
  document.body.appendChild(m);
  // place it under the control, flipping up if there is no room below
  var mh=Math.min(m.scrollHeight, Math.round(innerHeight*0.6));
  m.style.maxHeight=mh+'px';
  var below=innerHeight-r.bottom;
  m.style.left=Math.max(8,Math.min(r.left, innerWidth-m.offsetWidth-8))+'px';
  m.style.minWidth=Math.max(r.width,190)+'px';
  if(below<mh+12 && r.top>mh+12) m.style.top=(r.top-mh-6)+'px';
  else m.style.top=(r.bottom+6)+'px';
  sel.classList.add('dd-active');
  m.addEventListener('click',function(e){
    var o=e.target.closest('.dd-opt'); if(!o) return;
    var i=+o.dataset.i;
    if(sel.selectedIndex!==i){
      sel.selectedIndex=i;
      sel.dispatchEvent(new Event('change',{bubbles:true}));   // whatever it already does, still happens
    }
    ddClose();
  });
  var onSel=m.querySelector('.dd-opt.sel'); if(onSel) onSel.scrollIntoView({block:'nearest'});
  _ddOpen={sel:sel,menu:m};
  document.addEventListener('keydown',ddKey,true);
}
(function(){
  /* innerWidth reports 0 in a hidden or backgrounded tab, which made "<760" true and
     silently switched the styled menu off. Width only counts when it is a real
     measurement; a coarse pointer is the reliable phone signal. */
  function isPhone(){
    var w=innerWidth||document.documentElement.clientWidth||0;
    if(matchMedia('(pointer:coarse)').matches) return true;
    return w>0 && w<760;
  }
  document.addEventListener('mousedown',function(e){
    if(_ddOpen && !e.target.closest('.dd-menu') && e.target!==_ddOpen.sel) ddClose();
  },true);
  document.addEventListener('mousedown',function(e){
    if(isPhone()) return;                                  // native wheel is better on a phone
    var sel=e.target.closest('#view-leads select, #filters select');
    if(!sel || sel.disabled || sel.multiple) return;
    e.preventDefault();                                    // stop the OS menu
    ddOpen(sel);
  },true);
  addEventListener('resize',ddClose);
  addEventListener('scroll',function(){ if(_ddOpen) ddClose(); },true);
})();
/* ── SIGNALS: THE "£2.27 CHEAPER" IDEA, GENERALISED ──────────────────────────
   Jack, 03/09: "love this! more of these!". What made that badge work is that it
   is not a fact, it is a VERDICT WITH THE NUMBER IN IT — he does not have to hold
   the old price in his head to know the re-send was fair.
   Four more, all computed from decisions he has already made (163 bought, 260
   decided), and all measured against his own behaviour rather than a rule I made up:
     · cheapest this ASIN has ever been on his board       (61 qualify today)
     · profit vs the median he actually buys at, £9.55     (his real median)
     · how often he buys from THIS source method           (KPF Brand 88% v Storefront 47%)
     · how often he buys in THIS category                  (Home&Garden 78% v Computers 52%)
   Each one is SILENT unless it is notable — a chip on every lead is wallpaper, and
   he has already told me twice that noise is the thing he hates. */
var _sigCache=null, _sigSig='';
function sigStats(){
  var sig=(window.leads||[]).length+'|'+(window._sessDecided||0);
  if(_sigCache && _sigSig===sig) return _sigCache;
  var src={}, cat={}, prof=[];
  (window.leads||[]).forEach(function(l){
    var decided=(l.status||l.islead!==null);
    if(!decided) return;
    var isBuy=(l.status==='bought'||l.status==='atbq'||l.status==='atba2a');
    var sm=String(l.src||'').trim(); if(sm){ src[sm]=src[sm]||[0,0]; src[sm][0]++; if(isBuy) src[sm][1]++; }
    var ct=String(l.cat||'').trim(); if(ct){ cat[ct]=cat[ct]||[0,0]; cat[ct][0]++; if(isBuy) cat[ct][1]++; }
    if(isBuy){ var pv=parseFloat(l.profit); if(!isNaN(pv)) prof.push(pv); }
  });
  prof.sort(function(a,b){ return a-b; });
  /* Percentiles of his OWN buys, not a multiple of the median. First cut used
     "50% off the median" and fired on 781 of 1145 leads — wallpaper. The 10th/90th
     of what he actually pays for is the honest definition of unusual: £2.37 and
     £55.81 on today's 146 buys. */
  function pc(q){ return prof.length?prof[Math.max(0,Math.min(prof.length-1,Math.floor(prof.length*q)))]:null; }
  _sigCache={ src:src, cat:cat, nBuys:prof.length,
              medProfit:pc(0.5), loProfit:pc(0.10), hiProfit:pc(0.90) };
  _sigSig=sig;
  return _sigCache;
}
/* lowest buy price this ASIN has ever carried on his board */
function sigCheapestEver(l){
  try{
    var a=asinKey(l); if(!a) return null;
    var cur=parseFloat(l.buy); if(!cur) return null;
    var prev=null;
    (window.leads||[]).forEach(function(x){
      if(x.id===l.id) return;
      if(asinKey(x)!==a) return;
      var b=parseFloat(x.buy); if(!b) return;
      if(prev===null||b<prev) prev=b;
    });
    if(prev===null) return null;
    /* 2% alone let "CHEAPEST YET \u00b7 \u00a30.33 under" through on a cheap item — true,
       and not worth a chip. Needs to be both a real percentage AND real money. */
    if(cur >= prev*0.98) return null;
    if(prev-cur < 1) return null;
    return { saving:prev-cur, prev:prev, seen:true };
  }catch(e){ return null; }
}
function sigChips(l){
  try{
    var out=[], st=sigStats();
    // 1 — cheapest it has ever been (stronger than "cheaper than last time")
    var ce=sigCheapestEver(l);
    if(ce) out.push('<span class="sig sig-good" title="Lowest buy price this ASIN has ever had on your board — previous best was \u00a3'
      +ce.prev.toFixed(2)+'.">\u2b07 CHEAPEST YET \u00b7 \u00a3'+ce.saving.toFixed(2)+' under</span>');
    // 2 — profit against the profit he actually buys at
    var pv=parseFloat(l.profit);
    if(st.hiProfit!==null && st.nBuys>=20 && !isNaN(pv) && pv>0){
      if(pv>=st.hiProfit) out.push('<span class="sig sig-good" title="Top 10% of the '+st.nBuys
        +' leads you have bought \u2014 those start at \u00a3'+st.hiProfit.toFixed(2)+' profit (your median is \u00a3'
        +st.medProfit.toFixed(2)+').">\u2b06 \u00a3'+pv.toFixed(2)+' \u00b7 TOP 10% OF YOUR BUYS</span>');
      else if(pv<=st.loProfit) out.push('<span class="sig sig-warn" title="Bottom 10% of the '+st.nBuys
        +' leads you have bought \u2014 those end at \u00a3'+st.loProfit.toFixed(2)+' profit (your median is \u00a3'
        +st.medProfit.toFixed(2)+').">\u2b07 \u00a3'+pv.toFixed(2)+' \u00b7 THINNER THAN 90% OF YOUR BUYS</span>');
    }
    // 3 — his own hit rate on this source method
    var sm=String(l.src||'').trim(), sr=sm&&st.src[sm];
    if(sr && sr[0]>=15){
      var pct=Math.round(sr[1]/sr[0]*100);
      if(pct>=80) out.push('<span class="sig sig-good" title="You have bought '+sr[1]+' of the '+sr[0]
        +' leads you decided from '+escHtml(sm)+'.">\u{1F3AF} '+escHtml(sm)+' \u00b7 you buy '+pct+'%</span>');
      else if(pct<=30) out.push('<span class="sig sig-warn" title="You have bought only '+sr[1]+' of the '+sr[0]
        +' leads you decided from '+escHtml(sm)+'.">\u{1F3AF} '+escHtml(sm)+' \u00b7 you buy just '+pct+'%</span>');
    }
    /* A category chip was here. Measured on his real board the spread is only
       52% (Computers) to 81% (Home & Garden) — not enough to change a decision —
       and it would have printed on 216 leads in one category alone. A chip that
       appears on every lead in a category is not a signal, it is a label. Cut. */
    return out.length?'<div class="sig-row">'+out.join('')+'</div>':'';
  }catch(e){ return ''; }
}
function dupeBadge(l){
  var d=dupeOf(l); if(!d) return '';
  var ago = d.days===0 ? 'the same day' : (d.days===1 ? 'yesterday' : d.days+' days earlier');
  var m=dupePriceMove(l);
  var who=d.sameVA?escHtml(vaDisp(l.va)):escHtml(vaDisp(d.otherVA));
  if(m&&m.cheaper){
    /* a real reason — say so in the badge's own colour so it stops reading as a telling-off */
    return '<span class="dup-tag dup-ok" title="'+who+' sent this '+ago+' at £'+m.prev.toFixed(2)
      +'. It is £'+Math.abs(m.diff).toFixed(2)+' cheaper now — that is a valid re-send.">'
      +'↓ £'+Math.abs(m.diff).toFixed(2)+' CHEAPER</span>';
  }
  var why = m ? (m.dearer ? ' and it is £'+m.diff.toFixed(2)+' DEARER now — no reason to re-send'
                          : ' at the same price — no reason to re-send')
              : '';
  if(d.sameVA){
    return '<span class="dup-tag dup-same" title="'+who+' already sent this '+ago+why+'">'
      +(m&&!m.cheaper?'DUPE · no reason':'DUPE')+'</span>';
  }
  return '<span class="dup-tag dup-cross" title="'+who+' sent this '+ago+why+'">BOTH VAs</span>';
}
function dupeOther(l){
  if(!l) return null;
  var d=dupeOf(l);
  if(d&&d.otherId!=null){
    return (window.leads||[]).find(function(x){ return x.id===d.otherId; })||null;
  }
  // reverse: the map keys the LATER copy, so the earlier one has no entry of its own
  try{
    if(!_dupeMap) buildDupeMap();
    var backId=null;
    Object.keys(_dupeMap).forEach(function(k){
      if(backId==null && _dupeMap[k] && _dupeMap[k].otherId===l.id) backId=+k;
    });
    if(backId!=null) return (window.leads||[]).find(function(x){ return x.id===backId; })||null;
  }catch(e){}
  return null;
}
function dupeUndecided(x){ return !!x && !x.status && x.islead===null; }
/* the VA's reason for re-sending, shown where the question is actually asked */
function dupeWhy(l){
  var why=String(l.vanote||'').trim();
  if(why) return '<div class="dup-why"><b>'+escHtml(vaDisp(l.va))+'&rsquo;s reason:</b> '+escHtml(why.slice(0,220))+'</div>';
  return '<div class="dup-why none">No reason given &mdash; ask them to put one in the VA Note column when they re-send an ASIN.</div>';
}
/* Jack, on the repeat notice: "we need to do something about this". It said the ASIN
   was a repeat and then nagged the VAs about filling in a note — nothing he could act
   on. But if the same ASIN has been through here before, the useful fact is WHAT HE
   DECIDED LAST TIME. On his live board that is 24 undecided leads: 11 he bought, 10 he
   rejected, 3 he approved. Those are one click each, not a fresh judgement each.
   Deliberately NOT limited to the dupe window — a lead he bought 40 days ago is still
   the answer to whether he wants it again. */
/* Jack: "sometimes I like searching for leads to see if my VA found it too as well as
   me". Searching an ASIN answers that, but only inside whatever view and filters happen
   to be on — so a lead Suz already rejected simply is not there while he is in New
   Leads. This box ignores the view, the filters, the date range and the archive
   completely: type an ASIN, see every copy of it that exists, who sent it and what was
   decided. It only appears for something that actually looks like an ASIN. */
/* The row-by-row repair list for one VA's sheet, ready to paste into Discord.
   Sorted by sheet row so she works top to bottom. */
function asinFixCopy(va){
  var rows=(window.leads||[]).filter(function(l){ return l.va===va && leadAsinConflict(l); })
    .sort(function(a,b){ return (parseInt(a.sheetRow)||0)-(parseInt(b.sheetRow)||0); });
  if(!rows.length){ showToast('Nothing to fix — clean sheet'); return; }
  var name=vaDisp(va);
  var out=['Hey '+name+' — '+rows.length+' rows in your lead sheet have the wrong value in the ASIN column '
    +'(it doesn’t match the Amazon link on the same row — looks like the column slipped a row somewhere). '
    +'Please fix the ASIN column to match the link:',''];
  rows.forEach(function(l){
    var c=leadAsinConflict(l);
    out.push('Row '+(l.sheetRow||'?')+(l.sheetTab?' ('+l.sheetTab+')':'')
      +': ASIN column says '+c.col+' → should be '+c.link
      +'  — '+String(l.title||'').slice(0,50));
  });
  out.push('','Thanks! The app is showing the right product either way, but the sheet needs to be right too.');
  var txt=out.join('\n');
  try{ navigator.clipboard.writeText(txt); showToast('Fix-list for '+name+' copied — '+rows.length+' rows ✓'); }
  catch(e){ try{ window.prompt('Copy this:',txt); }catch(e2){} }
}
function asinCheckHTML(){
  var q=(document.getElementById('search')?document.getElementById('search').value:'').trim().toUpperCase();
  if(!/^B0[A-Z0-9]{8}$/.test(q)) return '';
  /* Match the link's ASIN too. "Neither of them has ever sent this one" was a lie on
     conflicted rows — the VA HAD sent it, with the wrong value in the ASIN column. */
  var hits=(window.leads||[]).filter(function(l){
    if(String(l.asin||'').trim().toUpperCase()===q) return true;
    try{ return leadUseAsin(l)===q; }catch(e){ return false; }
  });
  if(!hits.length){
    return '<div class="ac-box ac-none"><div class="ac-h">'+escHtml(q)+'</div>'
      +'<div class="ac-sub">Neither of them has ever sent this one. It is new.</div></div>';
  }
  hits=hits.slice().sort(function(a,b){ return (dupeKeyDate(b)||0)-(dupeKeyDate(a)||0); });
  var mera=hits.filter(function(l){ return l.va==='VA M'; }).length;
  var suz =hits.filter(function(l){ return l.va==='VA S'; }).length;
  var who=[]; if(mera) who.push(vaDisp('Mera')+' ×'+mera); if(suz) who.push(vaDisp('Suz')+' ×'+suz);
  var rows=hits.slice(0,6).map(function(l){
    var st=statusInfo(l);
    var note=(typeof reasonStrip==='function')?reasonStrip(l.notes||'').trim():'';
    return '<button class="ac-r" onclick="selectLead('+l.id+',true)">'
      +'<span class="ac-va" style="color:'+(l.va==='VA M'?'#c07bff':'#f2c200')+'">'+escHtml(vaDisp(l.va))+'</span>'
      +'<span class="ac-d">'+escHtml(l.date||'')+'</span>'
      +'<span class="ac-st">'+escHtml(st[0])+'</span>'
      +'<span class="ac-b">£'+(parseFloat(l.buy)||0).toFixed(2)+'</span>'
      +(note?'<span class="ac-n" title="'+escHtml(note)+'">'+escHtml(note.slice(0,30))+'</span>':'<span class="ac-n"></span>')
      +'</button>';
  }).join('');
  return '<div class="ac-box"><div class="ac-h">'+escHtml(q)
      +'<span class="ac-c">'+hits.length+' cop'+(hits.length===1?'y':'ies')+'</span></div>'
    +'<div class="ac-sub">'+escHtml(who.join(' · '))+' — every copy, whatever view or filters are on.</div>'
    +'<div class="ac-list">'+rows+'</div>'
    +(hits.length>6?'<div class="ac-more">+'+(hits.length-6)+' more</div>':'')
    +'</div>';
}
/* ── THE ASIN COLUMN IS OFTEN NOT THE ASIN ──────────────────────────────────
   Jack asked whether a search returning three unrelated products was a VA bug or an
   app bug. It is a VA bug, and a big one. Measured on all 988 leads: 128 ASINs sit on
   genuinely different products, covering 340 rows — Mera 193, Suz 147. B0DTB7GSNW is
   on two different toothbrushes, a pair of binoculars and a hair dryer brush.
   It is not an A2A marketplace difference: 410 of the 411 mismatched rows have a
   .co.uk link, so it is the same marketplace, just the wrong code pasted.
   The Amazon URL carries the RIGHT one — three different products had three different,
   correct ASINs in their links. That matters because the ASIN drives the SAS and Keepa
   buttons: with a wrong one he is researching a different product entirely, and the
   duplicate detection invents matches that are not real. */
function leadLinkAsin(l){
  var m=String((l&&l.amz)||'').match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  return m?m[1].toUpperCase():'';
}
function leadAsinConflict(l){
  var col=String((l&&l.asin)||'').trim().toUpperCase();
  var lnk=leadLinkAsin(l);
  if(!col||!lnk||col===lnk) return null;
  return {col:col, link:lnk};
}
/* The one to research WITH. The link wins, because the product title on the row is the
   link's product — that is exactly how the mismatch was proved. */
function leadUseAsin(l){
  var c=leadAsinConflict(l);
  return c?c.link:String((l&&l.asin)||'').trim().toUpperCase();
}
/* ── THE KEY FOR "IS THIS THE SAME PRODUCT?" ──────────────────────────────────
   Every grouping question must ask it through here: dupes, twins, "you decided this
   before", the model's training set. Grouping on l.asin instead groups by a value that
   is WRONG on 410 rows, so it answers a different question entirely — "which rows share
   a typo".
   Measured on the live board before this existed: 153 of the 235 DUPE / BOTH VAs badges
   named a different product (an NZXT cooler told to be a Char-Broil BBQ, which was told
   to be a L'Oreal beard trimmer), while the three genuine copies of that same cooler
   carried no badge at all. Jack, on the search that exposed it: "mini bug". It was not.
   NOT the same as asinConflictHTML(), which groups on the raw column ON PURPOSE to ask
   how many different products share one typed value. That one is correct as it is. */
function asinKey(l){
  try{ return leadUseAsin(l)||''; }catch(e){}
  return String((l&&l.asin)||'').trim().toUpperCase();
}
/* ── UNEXPLAINED SAME-MONTH DUPLICATE ─────────────────────────────────────────
   Jack's final rule, 30/08/2026: the SAME ASIN appearing again in the SAME month
   is a potential duplicate. It is valid if the supplier changed, the price
   changed (either direction — a rise can mean back-in-stock repricing), or the
   VA typed a reason in VA NOTE. Same ASIN + same supplier + same price + no
   note = meaningless: it must not count toward ANY KPI and must not sit on
   Jack's board as a new lead. Cross-month repeats are always fine — each month
   tab is its own world.
   Measured before this existed (August): Mera 35 of 277 counted rows were
   meaningless dups (13%), Suz 6 of 327 (2%). One product counted four times. */
var _duxSig=null,_duxMap=null;
function buildDupUnexplainedMap(){
  var map={}, by={};
  (window.leads||[]).forEach(function(l){
    var a=''; try{ a=asinKey(l); }catch(e){}
    if(!a) return;
    var p=String(l.date||'').split('/');
    if(p.length!==3) return;
    var k=l.va+'|'+p[2]+'-'+p[1]+'|'+a;                  // VA + month + product
    (by[k]=by[k]||[]).push(l);
  });
  function dnum(l){ var p=String(l.date||'').split('/');
    return (+p[2])*10000+(+p[1])*100+(+p[0]); }
  Object.keys(by).forEach(function(k){
    var g=by[k]; if(g.length<2) return;
    g.sort(function(a,b){ return dnum(a)-dnum(b) || (a.sheetRow||0)-(b.sheetRow||0); });
    for(var i=1;i<g.length;i++){
      var cur=g[i], prev=g[i-1];
      /* Jack, 31/08: "fresh from 1st September" — the rule starts clean rather than
         handing Mera a 60-row August archaeology job on day one. Earlier months keep
         counting exactly as they always did. */
      if(dnum(cur)<20260901) continue;
      if(String(cur.vanote||'').trim()) continue;         // she gave a reason — valid
      var sa=String(prev.sup||'').trim().toLowerCase().replace(/\/+$/,'');
      var sb=String(cur.sup||'').trim().toLowerCase().replace(/\/+$/,'');
      if(sa!==sb) continue;                               // different supplier — valid
      var pb=parseFloat(prev.buy)||0, cb=parseFloat(cur.buy)||0;
      if(pb&&cb&&Math.abs(cb-pb)/pb>=0.02) continue;      // price moved — valid
      map[cur.id]=1;
    }
  });
  _duxMap=map;
  return map;
}
function ldDupUnexplained(l){
  if(!l) return false;
  try{
    var sig=(window.leads||[]).length+':'+((window.leads||[])[0]||{})._sid;
    if(_duxSig!==sig){ buildDupUnexplainedMap(); _duxSig=sig; }
    return !!_duxMap[l.id];
  }catch(e){ return false; }
}
/* Decision rows — both the DB cache and the ones read straight out of the sheet — stored
   whatever was in the ASIN column at the time, so they inherit the same offset. Resolve
   each one back through its lead before comparing. Indexed because reasonRecall() runs
   on every lead detail render and the naive version is O(rows x leads). */
var _sidAsinIdx=null;
function sidAsinIndex(){
  if(_sidAsinIdx) return _sidAsinIdx;
  var m={};
  (window.leads||[]).forEach(function(l){ var k=(l&&(l._sid||l.id)); if(k!=null) m[k]=asinKey(l); });
  _sidAsinIdx=m; return m;
}
function rowAsinKey(r){
  if(!r) return '';
  var m=sidAsinIndex(), k=r.id;
  if(k!=null && m[k]) return m[k];
  return String(r.asin||'').trim().toUpperCase();
}
/* Measured after shipping the banner: it fires on 410 of 764 leads. A full-width amber
   warning on more than half the board is wallpaper, not a warning — and the leads page
   already shows 3-5 panels on a typical lead. So it is a one-line chip by default and
   opens to the full explanation on click. Same information, 54% less shouting.
   The 191 whose ASIN is shared by SEVERAL different products are the provably-wrong
   ones, so those stay loud; the rest are quiet until asked. */
function asinConflictHTML(l){
  var c=leadAsinConflict(l); if(!c) return '';
  var shared=false;
  try{
    var a=String(l.asin||'').toUpperCase();
    var norm=function(t){ return String(t||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').slice(0,45); };
    var t={}; (window.leads||[]).forEach(function(x){
      if(String(x.asin||'').toUpperCase()===a) t[norm(x.title)]=1; });
    shared=Object.keys(t).length>1;
  }catch(e){}
  var body='The column says <code>'+escHtml(c.col)+'</code>, the link is for <code>'
    +escHtml(c.link)+'</code>. The title matches the link, so SAS and Keepa use <b>'
    +escHtml(c.link)+'</b> — otherwise you’d be researching a different product.'
    +'<span class="asin-warn-f">Fix in '+escHtml(vaDisp(l.va))+'’s sheet'
    +(l.sheetRow?' (row '+l.sheetRow+(l.sheetTab?' · '+escHtml(l.sheetTab):'')+')':'')+'.</span>';
  if(shared){
    return '<div class="asin-warn"><b>⚠ This ASIN is on several different products.</b> '+body+'</div>';
  }
  return '<details class="asin-warn asin-warn-q"><summary>⚠ ASIN column doesn’t match the '
    +'Amazon link — using <b>'+escHtml(c.link)+'</b></summary><div>'+body+'</div></details>';
}
function dupePrior(l){
  if(!l) return null;
  var a=asinKey(l); if(!a) return null;               // resolved, NOT the column — see asinKey()
  var mine=dupeKeyDate(l);
  var best=null;
  (window.leads||[]).forEach(function(x){
    if(!x||x.id===l.id) return;
    if(asinKey(x)!==a) return;
    if(!(x.islead!==null||x.status)) return;          // only ones he actually decided
    var d=dupeKeyDate(x);
    if(mine&&d&&d>mine) return;                        // must be EARLIER than this one
    if(!best||d>dupeKeyDate(best)) best=x;
  });
  return best;
}
function dupePriorHTML(l){
  var p=dupePrior(l); if(!p) return '';
  if(l.islead!==null||l.status) return '';             // already decided — nothing to repeat
  var lab=decisionLabel(p);
  var note=(typeof reasonStrip==='function')?reasonStrip(p.notes||'').trim():String(p.notes||'').trim();
  var act='';
  if(p.status){
    act='<button class="dup-b dup-again" onclick="event.stopPropagation();setSt('+l.id+',\''+p.status+'\')">'
      +'Same again → '+escHtml(lab)+'</button>';
  } else if(p.islead===true){
    act='<button class="dup-b dup-again" onclick="event.stopPropagation();setL('+l.id+',true)">Same again → Lead</button>';
  } else if(p.islead===false){
    act='<button class="dup-b dup-again" onclick="event.stopPropagation();setL('+l.id+',false)">Same again → Not a lead</button>';
  }
  return '<div class="dup-prior">'
    +'<span class="dup-prior-l">You already decided this ASIN</span>'
    +'<b>'+escHtml(lab)+'</b>'
    +'<span class="dup-prior-w">'+escHtml(vaDisp(p.va))+'’s copy · '+escHtml(p.date||'')+'</span>'
    +(note?'<span class="dup-prior-n">“'+escHtml(note.slice(0,70))+(note.length>70?'…':'')+'”</span>':'')
    +act
    +'<button class="dup-b ghost" onclick="event.stopPropagation();selectLead('+p.id+',true)">Open that one</button>'
    +'</div>';
}
function dupeNote(l){
  /* A merged twin is invisible to dupeOf() — it was removed from the list — so the row
     shouted "BOTH VAs · 1 row" and the lead itself said nothing at all. That gap is
     what Jack spotted: "where is both va thing gone?" */
  if(l&&l._twinN>0){
    var vas=(l._twinVAs||[]);
    var cross=vas.some(function(v){ return v!==l.va; });
    /* Jack, on a chip claiming both VAs: "how is that both va's? i can't see it."
       Fair \u2014 the merged copies are invisible by design, and naming only the VA left
       him taking the chip's word for it. Name each hidden copy WITH its date, so the
       claim is checkable at a glance instead of an act of faith. */
    var copies=(l._twinIds||[]).map(function(id,ix){
      var t=(window.leads||[]).find(function(x){ return x.id===id; });
      var who=vaDisp(vas[ix]||l.va);
      return t?(who+' \u2014 '+escHtml(String(t.date||'?'))):who;
    });
    return '<div class="dup-note '+(cross?'cross':'same')+'">'
      +(cross?'\u{1F465} <b>Both of them found this</b>':'\u21bb <b>'+escHtml(vaDisp(l.va))+' sent this '+(l._twinN+1)+' times</b>')
      +' \u2014 same ASIN, same supplier, same buy price, so it is shown once.'
      +' <b>Deciding it here decides all '+(l._twinN+1)+'.</b>'
      +(copies.length?'<div class="dup-both done">Also sent by: '+copies.join(' \u00b7 ')+'</div>':'')
      +dupePriorHTML(l)+'</div>';
  }
  var d=dupeOf(l);
  if(!d){
    // 49 of his repeat pairs are 15-33 days apart, past the window — the prior decision
    // is just as useful there, so it is not gated on the window.
    var solo=dupePriorHTML(l);
    return solo?'<div class="dup-note same">'+solo+'</div>':'';
  }
  var ago = d.days===0 ? 'earlier the same day' : (d.days===1 ? 'yesterday' : d.days+' days before');
  var other=dupeOther(l);
  if(d.sameVA){
    return '<div class="dup-note same">&#8635; <b>'+escHtml(vaDisp(l.va))+' already sent this</b> '+ago
      +' &mdash; same ASIN, so this one is a repeat.'+dupeWhy(l)+dupePriorHTML(l)+'</div>';
  }
  var both='';
  if(dupeUndecided(other)){
    both='<div class="dup-both">'+escHtml(vaDisp(d.otherVA))+'&rsquo;s copy is still undecided'
      +(other.sheetRow?' (row '+other.sheetRow+')':'')+'. '
      +'<button class="dup-b" onclick="event.stopPropagation();dupeDecideBoth('+l.id+')">Apply my decision to both</button>'
      +'<button class="dup-b ghost" onclick="event.stopPropagation();selectLead('+other.id+',true)">Open theirs</button>'
      +'</div>';
  }else if(other){
    both='<div class="dup-both done">'+escHtml(vaDisp(d.otherVA))+'&rsquo;s copy: <b>'+escHtml(decisionLabel(other))+'</b></div>';
  }
  /* 03/09: this used dupeWhy(), which nags for a VA Note — the SAME-VA re-send rule.
     Two VAs landing on one product independently is a different fact and needs no
     reason. Say that, and put the one useful control first. */
  var crossNote=String(l.vanote||'').trim()
    ? '<div class="dup-why"><b>'+escHtml(vaDisp(l.va))+'&rsquo;s note:</b> '+escHtml(String(l.vanote).trim().slice(0,220))+'</div>' : '';
  return '<div class="dup-note cross">&#128101; <b>'+escHtml(vaDisp(d.otherVA))+' found this too</b>, '+ago
    +' &mdash; two independent finds, not a re-send, so no reason is needed. One decision can cover both.'
    +both+crossNote+dupePriorHTML(l)+'</div>';
}
/* Decide this lead and the other VA's copy in one go. Arms a flag that setSt reads,
   so both go through the SAME code path (sheet write-back, logging, learning) —
   no second implementation to drift out of step. */
var _decideBoth=null;
function dupeDecideBoth(id){
  var other=dupeOther((window.leads||[]).find(function(x){ return x.id===id; }));
  if(!dupeUndecided(other)){ ldToast('Their copy has already been decided'); return; }
  _decideBoth=id;
  ldToast('Pick a decision — it will apply to both copies');
  try{ var box=document.querySelector('#detail-pane .d-dec-row'); if(box) box.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){}
  try{ renderDetail(); }catch(e){}
}
function dupeMirror(id,st){
  if(_decideBoth!==id) return;
  _decideBoth=null;
  var src=(window.leads||[]).find(function(x){ return x.id===id; });
  var other=dupeOther(src);
  if(!dupeUndecided(other)) return;
  other.status=st; other.islead=true; other.seen=true;
  try{ markSeen(other._sid); }catch(e){}
  try{ db_leadPatch(other,{status:sheetStatusOut(st),islead:'LEAD'}); }catch(e){}
  try{ logDecision(other); }catch(e){}
  ldToast('Applied to '+vaDisp(other.va)+'&rsquo;s copy too &mdash; both written to the sheets');
}
/* Copy a note/reason onto the other VA's copy of the same ASIN — but only when they
   were genuinely decided the same way, so an unrelated pending copy is never touched. */
function noteMirror(l){
  try{
    if(!l||!l.notes) return null;
    if(!_dupeMap) buildDupeMap();
    var other=dupeOther(l);
    if(!other) return null;
    if(other.status!==l.status || other.islead!==l.islead) return null;   // not decided together
    if(String(other.notes||'')===String(l.notes||'')) return null;        // already matches
    other.notes=l.notes;
    db_leadPatch(other,{jack_comment:l.notes});
    try{ logDecision(other); }catch(e){}
    try{ ldRowRefresh(other.id); }catch(e){}
    return other;
  }catch(e){ return null; }
}
