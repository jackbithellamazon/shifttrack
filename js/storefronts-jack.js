/* ── JACK: TODAY'S BATCHES ──────────────────────────────────────────────────
   One card per batch, every action one click, no popups. Opening Keepa never
   changes a status — he inspects before deciding. */
function sbBadge(status){
  var m={Draft:'draft',Assigned:'assigned',Started:'started',Completed:'done'};
  return '<span class="sb-badge sb-'+(m[status]||'draft')+'">'+status+'</span>';
}
/* Normal priority rendered a bare "\u00b7" on every tile — a floating dot with no meaning
   that reads as a rendering fault. The fix after that hid the middle rank entirely until
   hover, which cannot be scanned and on a touch screen cannot be seen at all; with LOW in
   the same grey as every other bit of chrome, a board read as "some of them have a red
   thing on" rather than as three ranks.
   Now: all three always on, each in its own colour. One click cycles Low > Medium > High.
   The STORED value stays 'Normal' - it is the Postgres column default and what every
   existing row holds. 'Medium' is a LABEL only, so nothing is migrated, nothing drifts,
   and a row written by an older copy of the app still lands in the right rank. */
var SB_PRI_LABEL={Low:'Low',Normal:'Medium',High:'High'};
function sbPriLabel(p){ return SB_PRI_LABEL[p||'Normal']||p||'Medium'; }
function sbPriPill(b){
  var p=b.priority||'Normal', lab=sbPriLabel(p);
  return '<button class="sb-pri sb-pri-'+p.toLowerCase()+'" onclick="sbCyclePriority(\''+b.id+'\')" '
    +'title="Priority: '+lab+' \u2014 click to cycle Low \u2192 Medium \u2192 High">'+lab+'</button>';
}
/* Jack, 21/09: "if this is already with both VA's it should highlight who's it with —
   on Jack's page only." A batch with two people on it was printing its raw stored value
   ("Both"), which names nobody. Every Jack-side surface now names the actual people, in
   their own colours, so a shared batch reads at a glance. The VA side is untouched —
   she has no business seeing who else is on it (Jack, 19/09). */
function sbWhoChipsHTML(b){
  var p=sbPeople(b&&b.assigned_to);
  if(!p.length) return '<span class="sb-who none">unassigned</span>';
  return '<span class="sb-whoset" title="'+escHtml(sbHolders(b))+(p.length>1?' \u2014 all of them have it':'')+'">'
    +p.map(function(x){
        return '<span class="sb-whoc '+(x==='Jack'?'jack':x.toLowerCase())+'">'
          +escHtml(x==='Jack'?'YOU':String(vaDisp(x)).toUpperCase())+'</span>'; }).join('')
    +'</span>';
}
function sbCardHTML(b, forVA){
  // dimmed = "not actionable by you". Jack's OWN in-progress batch is very much
  // actionable, so it must not wear the same greyed-out treatment as a VA's.
  /* same class the worklist had: an 'All' batch is his too, so it must not be dimmed
     as "someone else's" or lose its Start / Done here either. */
  var _jackOn=(b.status==='Started' && (b.started_by==='Jack'||sbGoesTo(b,'Jack')));
  var locked=((b.status==='Started'&&!_jackOn)||b.status==='Completed');
  var keepa = b.keepa_url
    ? '<a class="sb-btn sb-keepa" href="'+String(b.keepa_url).replace(/"/g,'&quot;')+'" target="_blank" onclick="event.stopPropagation()">Open Keepa &#8599;</a>'
    : '';
  var copy = '<button class="sb-btn sb-ghost" onclick="sbCopyAsins(\''+b.id+'\')" title="Copy the ASIN list to your clipboard">&#128203; Copy ASINs</button>';
  var acts='';
  if(!forVA){
    if(b.status==='Draft'||b.status==='Assigned'){
      acts='<div class="sb-acts'+(b.status==='Assigned'?' quiet':'')+'">'
        +(b.status==='Assigned'?'<span class="sb-reroute-l">Reroute</span>':'')
        +'<button class="sb-btn sb-send'+(b.assigned_to==='Mera'?' on':'')+'" onclick="sbAssign(\''+b.id+'\',\'Mera\')">'+vaDisp('Mera')+'</button>'
        +'<button class="sb-btn sb-send'+(b.assigned_to==='Suz'?' on':'')+'" onclick="sbAssign(\''+b.id+'\',\'Suz\')">'+vaDisp('Suz')+'</button>'
        +'<button class="sb-btn sb-send'+(b.assigned_to==='Both'?' on':'')+'" onclick="sbAssign(\''+b.id+'\',\'Both\')">Both</button>'
        /* the pair routes belong on the reroute row too — this card is the third place
           routing is offered, and a value missing from one of them is bug class 2 again. */
        +'<button class="sb-btn sb-send'+(b.assigned_to==='JackMera'?' on':'')+'" onclick="sbAssign(\''+b.id+'\',\'JackMera\')" title="Open for you and '+escHtml(vaDisp('Mera'))+'">Me+'+escHtml(String(vaDisp('Mera')).charAt(0))+'</button>'
        +'<button class="sb-btn sb-send'+(b.assigned_to==='JackSuz'?' on':'')+'" onclick="sbAssign(\''+b.id+'\',\'JackSuz\')" title="Open for you and '+escHtml(vaDisp('Suz'))+'">Me+'+escHtml(String(vaDisp('Suz')).charAt(0))+'</button>'
        +'<button class="sb-btn sb-send'+(b.assigned_to==='Jack'?' on':'')+'" onclick="sbAssign(\''+b.id+'\',\'Jack\')" '
          +'title="Move this batch onto your own board">'
          +((b.assigned_to && b.assigned_to!=='Jack') ? '&#8592; Back to me' : 'Keep')+'</button>'
        // A batch Jack KEEPS is his to work — without these it sat "Assigned" for ever,
        // because Start/Complete only ever existed on the VA side of the card. Jack has
        // no shift, so his lifecycle lives here on the board instead.
        +(sbGoesTo(b,'Jack')
            ? '<button class="sb-btn sb-start" onclick="sbJackStart(\''+b.id+'\')">&#9654; Start</button>'
            : '')
        +'</div>';
    } else if(b.status==='Started' && (b.started_by==='Jack'||sbGoesTo(b,'Jack'))){
      acts='<div class="sb-acts"><span class="sb-mine">&#9654; You\'re on this</span>'
        +'<button class="sb-btn sb-done" onclick="sbJackComplete(\''+b.id+'\')">&#10003; Done</button></div>';
    } else {
      acts='<div class="sb-acts"><span class="sb-locked">&#128274; '+(b.status==='Started'?'Being worked on by ':'Completed by ')
        +escHtml(vaDisp(b.started_by||b.assigned_to||''))+' — locked</span></div>';
    }
  } else {
    if(b.status==='Assigned') acts='<div class="sb-acts"><button class="sb-btn sb-start" onclick="sbStart(\''+b.id+'\')">&#9654; Start</button></div>';
    else if(b.status==='Started') acts='<div class="sb-acts"><button class="sb-btn sb-done" onclick="sbComplete(\''+b.id+'\')">&#10003; Mark complete</button></div>';
    else if(b.status==='Completed') acts='<div class="sb-acts"><span class="sb-locked">&#10003; Completed</span></div>';
  }
  /* `who` was computed here and never rendered — the card shows its "With" tile below
     instead. Left out rather than left dead. */
  // identity colour carries across the app — a board of ten cards should read
  // who-has-what at a glance, not per-card
  // amber edge means "nobody has this yet, act on it". A batch Jack deliberately kept
  // is owned, so it gets its own indigo — otherwise his own work sat in the board's
  // to-do colour for ever and read as unrouted.
  var vaCls = b.assigned_to ? (' sb-va-'+(sbRouteCls(b.assigned_to)==='all'?'both':sbRouteCls(b.assigned_to))) : ' sb-va-none';
  var priCls = (b.priority==='High' && b.status!=='Completed')?' sb-hi':'';
  /* data-bid lets sbCollapseTiles() find every on-screen copy of one batch and
     animate it away before the board repaints — see sbScrapBatch(). */
  return '<div class="sb-card'+(locked?' locked':'')+vaCls+priCls+'" data-bid="'+escHtml(b.id)+'">'
    +'<div class="sb-top">'
      +'<div class="sb-name">'+escHtml(b.storefront_name||'Queue')
        +'<span class="sb-name-day'+(b.date===sbToday()?'':' old')+'">'
          +escHtml(b.date===sbToday()?'Today':sbDayLabel(b.date))+'</span>'
        +(b.batch_number>1?'<i>Batch '+b.batch_number+'</i>':'')+'</div>'
      +sbBadge(b.status)+(forVA?'':sbPriPill(b))
    +'</div>'
    +'<div class="sb-tiles">'
      +'<span class="sb-tile"><em>ASINs</em><b>'+(b.asin_count||0)+'</b></span>'
      +(b.status==='Draft'
          ? '<span class="sb-tile none"><em>Status</em><b>Route it</b></span>'
          : '<span class="sb-tile who"><em>With</em>'
            +(!forVA && sbPeople(b.assigned_to).length>1
                ? sbWhoChipsHTML(b)                                   /* name them, don't say "Both" */
                : '<b>'+escHtml(vaDisp(b.assigned_to||'nobody'))+'</b>')+'</span>')

    +'</div>'
    +'<div class="sb-row">'+keepa+copy+'</div>'
    +acts
    +'</div>';
}
/* ── THE BOARD, REBUILT AS ROWS ────────────────────────────────────────────
   Cards were the wrong shape. Every batch carried its own tile row, two link
   buttons, four routing buttons and a lifecycle button — roughly seven controls
   apiece — so six batches filled two screens and four of them read as identical
   blocks. A batch is a LINE ITEM: a tag, a day, a size, an owner, a state. Rows
   say all of that in one scannable line, and only surface the controls the row's
   state actually needs. Routing is the whole job on an unrouted batch, so those
   rows carry it inline; everything else keeps it behind one button. */
/* ── BULK ROUTING ───────────────────────────────────────────────────────────
   Jack expects ~30 batches needing routing a day. One row each with five route
   buttons is 150+ clicks, and that's if he does it daily. So: tick the ones going
   the same way, route them in one action. Tag-level shortcuts too, because in
   practice everything under one tag usually goes to the same person. */
var SB_ROUTE_SEL={};
function sbRSel(id,on){ SB_ROUTE_SEL[id]=!!on; sbPaintJack(); }
function sbRSelAll(on,ids){
  (ids||[]).forEach(function(i){ SB_ROUTE_SEL[i]=!!on; });
  sbPaintJack();                        // selection is local — never hit the network for it
}
function sbRSelTag(tag,ids){ sbRSelAll(true,ids); }
function sbRSelClear(){ SB_ROUTE_SEL={}; sbPaintJack(); }
function sbRSelIds(){ var a=[]; for(var k in SB_ROUTE_SEL) if(SB_ROUTE_SEL[k]) a.push(k); return a; }
async function sbRouteBulk(who){
  var ids=sbRSelIds(); if(!ids.length) return;
  if(who==='bin'){
    var ok=await askConfirm({
      title:'Bin '+ids.length+' batch'+(ids.length===1?'':'es')+'?',
      body:'Their ASINs are deleted and nobody will be asked to work them.',
      yes:'Bin them', no:'Keep them', danger:true });
    if(!ok) return;
    for(var i=0;i<ids.length;i++){ try{ await sbScrapBatchSilent(ids[i]); }catch(e){} }
    SB_ROUTE_SEL={};
    sbRefreshJack();                    // rows were deleted server-side — one refetch
    showToast(ids.length+' binned \u2713'); return;
  }
  var done=0;
  for(var j=0;j<ids.length;j++){
    try{ await sbAssign(ids[j], who, true); done++; }catch(e){}
  }
  SB_ROUTE_SEL={};
  sbPaintJack();                        // each sbAssign already applied locally
  sbSyncSoon();
  showToast(done+' batch'+(done===1?'':'es')+' sent to '+sbRouteToast(who)+' \u2713');
}
/* same delete as sbScrapBatch but without its own confirm — the bulk one already asked */
async function sbScrapBatchSilent(batchId){
  var h={apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY};
  var eid=encodeURIComponent(batchId);
  // soft bin first — same reasoning as sbScrapBatch; delete only if the column isn't there
  var pr=await fetchT(SUPABASE_URL+'/rest/v1/storefront_batches?id=eq.'+eid,{method:'PATCH',
    headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
             'Content-Type':'application/json',Prefer:'return=minimal'},
    body:JSON.stringify({scrapped:true, scrapped_at:new Date().toISOString(), scrapped_by:'Jack'})});
  if(pr.ok) return pr;
  await fetchT(SUPABASE_URL+'/rest/v1/storefront_batch_items?batch_id=eq.'+eid,{method:'DELETE',headers:h});
  return fetchT(SUPABASE_URL+'/rest/v1/storefront_batches?id=eq.'+eid,{method:'DELETE',headers:h});
}
function sbRouteBarHTML(drafts){
  var ids=drafts.map(function(b){ return b.id; });
  var n=sbRSelIds().filter(function(i){ return ids.indexOf(i)>=0; }).length;
  // one chip per tag so "send every FFB to Suz" is two clicks regardless of how many
  var byTag={};
  drafts.forEach(function(b){ var t=b.storefront_name||'—'; (byTag[t]=byTag[t]||[]).push(b.id); });
  var tags=Object.keys(byTag).sort();
  if(!n){
    return '<div class="sbrt idle">'
      +'<span class="sbrt-l">Tick rows, or grab a whole tag:</span>'
      +tags.map(function(t){
          return '<button class="sbrt-tag" onclick=\'sbRSelAll(true,'+JSON.stringify(byTag[t])+')\'>'
            +escHtml(t)+' <b>'+byTag[t].length+'</b></button>'; }).join('')
      +'<button class="sbrt-tag all" onclick=\'sbRSelAll(true,'+JSON.stringify(ids)+')\'>Select all '+ids.length+'</button>'
      +'</div>';
  }
  return '<div class="sbrt on">'
    +'<b>'+n+' selected</b>'
    +['Mera','Suz','Both','All'].map(function(v){
        var lbl=v==='All'?'All 3':v==='Both'?'Both VAs':vaDisp(v);
        return '<button class="sbrt-b" data-w="'+v+'" onclick="sbRouteBulk(\''+v+'\')">&#8594; '+escHtml(lbl)+'</button>';
      }).join('')
    +'<button class="sbrt-b" data-w="Jack" onclick="sbRouteBulk(\'Jack\')">&#8594; Me</button>'
    +'<button class="sbrt-b bin" onclick="sbRouteBulk(\'bin\')">&#10005; Bin</button>'
    +'<button class="sbrt-b clear" onclick="sbRSelClear()">Clear</button>'
    +'</div>';
}
// Groups are capped so a 300-batch day is a page, not a wall. Nothing is hidden
// permanently — the count in the button is the honest total.
var SB_GRP_ALL={};
function sbGrpAll(k){ SB_GRP_ALL[k]=true; sbPaintJack(); }
var SB_GRP_CAP=24;
function sbGrpBody(rows,key,cls){
  var show=rows, more=0;
  if(rows.length>SB_GRP_CAP && !SB_GRP_ALL[key]){ show=rows.slice(0,SB_GRP_CAP); more=rows.length-SB_GRP_CAP; }
  return '<div class="'+cls+'">'+show.map(sbRowHTML).join('')+'</div>'
    +(more?'<button class="sbr-more" onclick="sbGrpAll(\''+key+'\')">Show all '+rows.length
      +' &mdash; '+more+' more hidden &#8595;</button>':'');
}
/* ── NEEDS ROUTING: one card per TAG ─────────────────────────────────────────*/
var SB_TAG_OPEN={};
function sbTagToggle(k){ SB_TAG_OPEN[k]=!SB_TAG_OPEN[k]; sbPaintJack(); }
async function sbRouteTag(tag, who){
  var ids=(SB_BATCHES||[]).filter(function(b){ return b.status==='Draft' && (b.storefront_name||'—')===tag; })
                          .map(function(b){ return b.id; });
  if(!ids.length) return;
  if(who==='bin'){
    var ok=await askConfirm({title:'Bin all '+ids.length+' '+tag+' batch'+(ids.length===1?'':'es')+'?',
      body:'Their ASINs go too — nobody gets asked to work them.', yes:'Bin them', danger:true});
    if(!ok) return;
    for(var i=0;i<ids.length;i++){ try{ await sbScrapBatchSilent(ids[i]); }catch(e){} }
    sbRefreshJack(); showToast(ids.length+' binned ✓'); return;
  }
  var done=0;
  for(var j=0;j<ids.length;j++){ try{ await sbAssign(ids[j], who, true); done++; }catch(e){} }
  sbLand(ids[0]); sbPaintJack(); sbSyncSoon();
  showToast(done+' × '+tag+' → '+sbRouteToast(who)+' ✓');
}
function sbTagCardsHTML(drafts){
  /* Jack on v1 of these cards: "where can I copy asins and view keepa" (they were
     hidden behind Split), "what is the order" (I sorted by newest batch but DISPLAYED
     the oldest age, so the order read as random), "so much wasted space", and the
     per-row route buttons overflowed the card edge. So:
     - every batch row is ALWAYS visible with its own Keepa + Copy + date
     - Split only reveals the per-row route buttons (the rare case), on their own line
     - the age shown is the NEWEST batch (what the sort uses); oldest shown beside it
     - the note is its own line, never squeezed out */
  var seen=[], by={};
  drafts.forEach(function(b){ var k=b.storefront_name||'—';
    if(!by[k]){ by[k]=[]; seen.push(k); } by[k].push(b); });
  return '<div class="sbtc-grid">'+seen.map(function(k){
    var rows=by[k];
    var tot=rows.reduce(function(a,b){ return a+(b.asin_count||0); },0);
    var hi=rows.some(function(b){ return b.priority==='High'; });
    var ages=rows.map(function(b){ return sbAgeDays(b.date)||0; });
    var newest=Math.min.apply(null,ages), oldest=Math.max.apply(null,ages);
    var ageTxt=(newest<=0?'Today':newest===1?'Yesterday':newest+'d old')
             +(oldest>newest?' <i>· oldest '+oldest+'d</i>':'');
    var q=(SB_BATCHES&&rows[0])?(SB_QUEUES||[]).filter(function(x){ return x.id===rows[0].storefront_id; })[0]:null;
    var note=String((q&&q.notes)||'').trim();
    var kid=k.replace(/[^a-z0-9]/gi,'_');
    var open=!!SB_TAG_OPEN[kid];
    var esc=escHtml(k).replace(/'/g,'\\\'');

    var head='<div class="sbtc-hd">'
      +(hi?'<span class="sbtc-hi" title="High priority tag">▲</span>':'')
      +'<span class="sbtc-tag" title="'+escHtml(k)+'">'+escHtml(k)+'</span>'
      +'<span class="sbtc-n"><b>'+tot+'</b> ASINs'+(rows.length>1?' · '+rows.length+' batches':'')+'</span>'
      +'<span class="sbtc-age'+(oldest>=6?' stale':'')+'">'+ageTxt+'</span>'
      +'</div>'
      +(note?'<div class="sbtc-note" title="'+escHtml(note)+'">✎ '+escHtml(note)+'</div>':'');

    var single=(rows.length===1);
    var inner=single
      ? '<div class="sbtc-tools">'
          +(rows[0].keepa_url?'<a class="sbtc-k big" href="'+String(rows[0].keepa_url).replace(/"/g,'&quot;')+'" target="_blank">\u{1F4C8} Keepa <b>'+(rows[0].asin_count||0)+'</b> ↗</a>':'')
          +'<button class="sbtc-cp big" onclick="sbCopyAsins(\''+rows[0].id+'\')">\u{1F4CB} Copy</button>'
        +'</div>'
      : rows.map(function(b){
      return '<div class="sbtc-r'+(SB_LANDED===b.id?' landed':'')+'">'
        +'<span class="sbtc-rn"><b>'+(b.asin_count||0)+'</b></span>'
        +'<span class="sbtc-ra" title="'+escHtml(sbDayLabel(b.date))+'">'+escHtml(sbAgeLabel(b.date))+'</span>'
        +(b.keepa_url?'<a class="sbtc-k" href="'+String(b.keepa_url).replace(/"/g,'&quot;')+'" target="_blank" title="Open '+(b.asin_count||0)+' in Keepa">Keepa ↗</a>':'<span></span>')
        +'<button class="sbtc-cp" onclick="sbCopyAsins(\''+b.id+'\')">Copy</button>'
        +(open
          ?'<span class="sbtc-rr">'
            +[['Mera','M'],['Suz','S'],['Both','B'],['JackMera','Me+M'],['JackSuz','Me+S'],['All','A3'],['Jack','Me']].map(function(v){
                return '<button class="sbr-b sm" data-w="'+v[0]+'" title="Just this batch → '+v[0]+'" '
                  +'onclick="sbAssign(\''+b.id+'\',\''+v[0]+'\')">'+v[1]+'</button>'; }).join('')
            +'<button class="sbr-b sm bin" title="Bin just this batch" onclick="sbScrapBatch(\''+b.id+'\')">✕</button>'
            +'</span>'
          :'')
        +'</div>';
    }).join('');

    var route='<div class="sbtc-route">'
      +[['Mera',''],['Suz',''],['Both','Both'],['All','All 3'],['Jack','Me']].map(function(v){
          var who=v[0];
          return '<button class="sbr-b" data-w="'+who+'" title="Send '+(rows.length===1?'it':'all '+rows.length)+' to '
            +escHtml(sbRouteToast(who))
            +'" onclick="sbRouteTag(\''+esc+'\',\''+who+'\')">'+escHtml(v[1]||vaDisp(who))+'</button>';
        }).join('')
      +'<button class="sbr-b bin" title="Bin the whole tag" onclick="sbRouteTag(\''+esc+'\',\'bin\')">✕</button>'
      +'</div>';

    var split=rows.length>1
      ? '<button class="sbtc-x" onclick="sbTagToggle(\''+kid+'\')">'
          +(open?'Done splitting ▴':'Split · route batches separately ▾')+'</button>'
      : '';

    return '<div class="sbtc'+(hi?' hi':'')+'">'+head
      +(single?inner:'<div class="sbtc-rows">'+inner+'</div>')
      +route+split+'</div>';
  }).join('')+'</div>';
}
/* ── YOURS TO WORK: the same tile, led by a big Start ────────────────────────*/
function sbWorkRowHTML(b){
  var started=(b.status==='Started');
  var q=(SB_QUEUES||[]).filter(function(x){ return x.id===b.storefront_id; })[0];
  var note=String((q&&q.notes)||'').trim();
  var n=(b.asin_count||0);
  var age=sbAgeDays(b.date)||0;
  return '<div data-bid="'+escHtml(b.id)+'" class="sbr sbr-jack sbwt'+(b.priority==='High'?' pri-hi':'')+(started?' running':'')
      +(SB_LANDED===b.id?' landed':'')+'">'
    +'<div class="sbr-hd">'
      +'<span class="sbr-tag">'+escHtml(b.storefront_name||'—')
        +(b._tagSize>1?'<u>'+b._tagIdx+'/'+b._tagSize+'</u>':'')+'</span>'
      +'<span class="sbr-day'+(age>=6?' stale':'')+'" title="'+escHtml(sbDayLabel(b.date))+'">'
        +escHtml(sbAgeLabel(b.date))+'</span>'
      /* "Yours to work" no longer means "only yours" — an All batch is on the VAs' lists
         at the same time, and Jack could not see that anywhere. */
      +(sbPeople(b.assigned_to).length>1
        ? '<span class="sbwt-who" title="This batch is on '+escHtml(sbHolders(b))+'\u2019s list'
          +' \u2014 it is not yours alone">'+escHtml(sbHoldersShort(b))+'</span>' : '')
      +'<details class="sbw-more"><summary title="More">⋯</summary><div class="sbw-menu">'
        +'<div class="sbw-cur">Currently with <b>'+escHtml(sbHolders(b))+'</b></div>'
        /* Jack: "the dropdown shouldn't let me send it if it's already with them".
           Re-sending an All batch to Mera is not a send at all — she already has it —
           so the menu now says what each option would actually DO. */
        +[['Mera','→ '+escHtml(vaDisp('Mera'))],['Suz','→ '+escHtml(vaDisp('Suz'))],
          ['Both','→ Both VAs'],['JackMera','→ Me + '+escHtml(vaDisp('Mera'))],
          ['JackSuz','→ Me + '+escHtml(vaDisp('Suz'))],['All','→ All 3 of us']].map(function(v){
            var cur=String(b.assigned_to||'');
            if(cur===v[0]) return '<button class="is-cur" disabled title="This is already where it is">'
              +v[1]+' <i>current</i></button>';
            var now=sbPeople(cur), next=sbPeople(v[0]);
            var adds=next.filter(function(x){ return now.indexOf(x)<0; });
            if(!adds.length) return '<button class="is-narrow" onclick="sbAssign(\''+b.id+'\',\''+v[0]+'\')" '
              +'title="'+escHtml(next.map(function(x){ return x==='Jack'?'you':vaDisp(x); }).join(' and '))+' already has this \u2014 '
              +'this would TAKE IT OFF '+escHtml(now.filter(function(x){return next.indexOf(x)<0;}).map(function(x){ return x==='Jack'?'you':vaDisp(x); }).join(' and '))+'">'
              +v[1]+' <i>has it \u00b7 narrows</i></button>';
            return '<button onclick="sbAssign(\''+b.id+'\',\''+v[0]+'\')" title="Adds '
              +escHtml(adds.map(vaDisp).join(' and '))+'">'+v[1]+'</button>'; }).join('')
        +(started?'<button onclick="sbJackUnstart(\''+b.id+'\')">↺ Not started after all</button>':'')
        +'<button class="danger" onclick="sbScrapBatch(\''+b.id+'\')">✕ Bin this batch</button>'
      +'</div></details>'
    +'</div>'
    +(note?'<div class="sbr-note" title="'+escHtml(note)+'">'+escHtml(note)+'</div>':'')
    /* count + the two links on ONE line — they were three stacked rows */
    +'<div class="sbwt-row">'
      +'<span class="sbwt-n"><b>'+n+'</b> ASINs</span>'
      +(b.keepa_url?'<a class="sbwt-lk" href="'+String(b.keepa_url).replace(/"/g,'&quot;')+'" target="_blank" '
        +'title="Open all '+n+' in Keepa">\u{1F4C8} Keepa ↗</a>':'')
      +'<button class="sbwt-lk" title="Copy the ASINs" onclick="sbCopyAsins(\''+b.id+'\')">\u{1F4CB} Copy</button>'
      +(started?'<span class="sbwt-run">● working</span>':'')
    +'</div>'
    /* the whole point: Done is always one tap, never behind a menu */
    +'<div class="sbwt-act">'
      +(started?'' : '<button class="sbwt-start" title="Time how long this takes" '
          +'onclick="sbJackStart(\''+b.id+'\')">▶ Start</button>')
      +'<button class="sbwt-done'+(started?' solo':'')+'" title="Mark this batch finished" '
        +'onclick="sbJackComplete(\''+b.id+'\')">✓ Done</button>'
    +'</div>'
    +'</div>';
}
/* Started something by mistake — put it back rather than being forced to finish it. */
/* Take a batch back off whoever holds it — for a shift abandoned mid-way, or a test
   session that locked it. Non-destructive: it returns to Assigned with its ASINs and
   routing intact, so it simply reappears on their list. */
async function sbRelease(batchId){
  var b=(SB_BATCHES||[]).filter(function(x){ return x.id===batchId; })[0];
  var prev=b?{s:b.status,by:b.started_by}:null;
  if(b){ b.status='Assigned'; b.started_by=null; sbPaintJack(); }
  var ok=await sbPatch(batchId,{status:'Assigned', started_by:null, started_at:null}, true);
  if(!ok){
    if(b&&prev){ b.status=prev.s; b.started_by=prev.by; sbPaintJack(); }
    showToast('Couldn\'t release it — check your connection',true); return;
  }
  showToast('Released \u2014 back on '+vaDisp((prev&&prev.by)||'their')+'\u2019s list \u2713');
  sbSyncSoon();
}
async function sbJackUnstart(batchId){
  var b=(SB_BATCHES||[]).filter(function(x){return x.id===batchId;})[0];
  var prev=b?{s:b.status,by:b.started_by}:null;
  if(b){ b.status='Routed'; b.started_by=null; sbPaintJack(); }
  var ok=await sbPatch(batchId,{status:'Routed', started_by:null, started_at:null}, true);
  if(!ok){ if(b&&prev){ b.status=prev.s; b.started_by=prev.by; sbPaintJack(); }
    showToast('Couldn\'t undo that — check your connection',true); return; }
  sbSyncSoon();
}
function sbRowHTML(b){
  var t=sbToday();
  /* same bug one level down: this is what draws Start / Done, so an 'All' batch rendered
     with no way to act on it at all — the tile in Jack's screenshot with Keepa and Copy
     but no buttons. */
  var mine=sbGoesTo(b,'Jack');
  var isDraft=(b.status==='Draft');
  var started=(b.status==='Started');
  var doneB=(b.status==='Completed');
  var jackOn=started&&(b.started_by==='Jack'||mine);
  var vaCls = b.assigned_to ? sbRouteCls(b.assigned_to) : (mine?'jack':'none');
  var keepa=b.keepa_url
    ? '<a class="sbr-key" href="'+String(b.keepa_url).replace(/"/g,'&quot;')+'" target="_blank" '
      +'title="Opens all '+(b.asin_count||0)+' ASINs in one Keepa list">&#128200; Keepa <b>'+(b.asin_count||0)+'</b> &#8599;</a>'
    : '<span class="sbr-key off" title="No Keepa link on this batch yet">&#128200; No link</span>';
  var copy='<button class="sbr-copy" title="Copy the ASIN list to your clipboard" onclick="sbCopyAsins(\''+b.id+'\')">&#128203; Copy</button>';

  // A "NEEDS ROUTING" pill on every tile inside a section headed "Needs routing" is
  // the loudest thing on the tile and says nothing. Same for a "JACK" pill under the
  // heading "Yours to work". Only badge what the heading does not already tell him.
  var state = doneB ? ''
            : started ? '<span class="sbr-st going">'+(jackOn?'You&rsquo;re on it':escHtml(vaDisp(b.started_by||b.assigned_to||''))+' working')+'</span>'
            : isDraft ? ''
            : (sbPeople(b.assigned_to).length>1
                 ? '<span class="sbr-st with">'+sbWhoChipsHTML(b)+'</span>'
                 : '<span class="sbr-st with">'+escHtml(vaDisp(b.assigned_to||'—'))+'</span>');

  var actions='';
  if(isDraft||(!started&&!doneB)){
    // Routing isn't the only verdict on a Draft — "checked it, it's rubbish" is just as
    // valid. Bin completes the 2x3 grid, styled destructive.
    var binBtn=(isDraft||!started)
      ? '<button class="sbr-b bin" title="Delete this batch and its ASINs — nobody gets asked to work it" '
        +'onclick="sbScrapBatch(\''+b.id+'\')">&#10005; Bin</button>' : '';
    /* Keeping one for himself was buried in the ⋯ menu while Mera and Suz sat on the
       tile — three equal destinations, one of them two clicks further away. "Me" is now
       a first-class button beside them, labelled the same as the bulk bar already does. */
    actions='<div class="sbr-route2">'
      +[['Mera',vaDisp('Mera')],['Suz',vaDisp('Suz')],['Jack','Me']].map(function(p){
          var who=p[0];
          return '<button class="sbr-go2'+(b.assigned_to===who?' on':'')+'" data-w="'+who+'" title="'
            +(who==='Jack'?'Keep this one for yourself':'Send it to '+escHtml(vaDisp(who)))
            +'" onclick="sbAssign(\''+b.id+'\',\''+who+'\')">&#8594; '+escHtml(p[1])+'</button>';
        }).join('')
      +'<details class="sbr-more"><summary title="Everything else">&#8943;</summary><div class="sbw-menu">'
        +'<button onclick="sbAssign(\''+b.id+'\',\'Both\')">&#8594; Both VAs</button>'
        +'<button onclick="sbAssign(\''+b.id+'\',\'JackMera\')">&#8594; Me + '+escHtml(vaDisp('Mera'))+'</button>'
        +'<button onclick="sbAssign(\''+b.id+'\',\'JackSuz\')">&#8594; Me + '+escHtml(vaDisp('Suz'))+'</button>'
        +'<button onclick="sbAssign(\''+b.id+'\',\'All\')">&#8594; All 3 of us</button>'
        +(mine?'<button onclick="sbJackStart(\''+b.id+'\')">&#9654; Start it now</button>'
              +'<button onclick="sbJackComplete(\''+b.id+'\')">&#10003; Mark done</button>':'')
        +'<button class="danger" onclick="sbScrapBatch(\''+b.id+'\')">&#10005; Bin this batch</button>'
      +'</div></details>'
      +'</div>';
  } else if(jackOn){
    actions='<div class="sbr-act one"><button class="sbr-b go" onclick="sbJackComplete(\''+b.id+'\')">&#10003; Done</button></div>';
  } else if(started){
    actions='<div class="sbr-lock">&#128274; '+escHtml(vaDisp(b.started_by||'someone'))+' has it'
      +'<button class="sbr-rel" title="Put it back on their list so anyone can pick it up" '
      +'onclick="sbRelease(\''+b.id+'\')">Release</button></div>';
  }

  var nm=b.storefront_name||'—';
  var hi=(b.priority==='High' && !doneB)?' pri-hi':'';
  if(SB_LANDED===b.id) hi+=' landed';
  return '<div data-bid="'+escHtml(b.id)+'" class="sbr sbr-'+vaCls+hi+(doneB?' is-done':'')+(isDraft?' is-draft':'')+(isDraft&&SB_ROUTE_SEL[b.id]?' picked':'')+'">'
    +'<div class="sbr-hd">'
      +(isDraft?'<label class="sbr-pick"><input type="checkbox"'+(SB_ROUTE_SEL[b.id]?' checked':'')
        +' onchange="sbRSel(\''+b.id+'\',this.checked)"><i></i></label>':'')
      +'<span class="sbr-tag" title="'+escHtml(nm)+'">'+escHtml(nm)
        +(b._tagSize>1?'<u title="'+b._tagSize+' batches on this tag">'+b._tagIdx+'/'+b._tagSize+'</u>':'')
        +(b.batch_number>1?'<i>#'+b.batch_number+'</i>':'')+'</span>'
      +'<span class="sbr-day'+sbAgeCls(sbAgeDays(b.date))+'" title="'+escHtml(sbDayLabel(b.date))+'">'
        +escHtml(sbAgeLabel(b.date))+'</span>'
    +'</div>'
    +(function(){ var q=(SB_QUEUES||[]).filter(function(x){ return x.id===b.storefront_id; })[0];
        var nt=String((q&&q.notes)||'').trim();
        return nt?'<div class="sbr-note" title="'+escHtml(nt)+'">'+escHtml(nt)+'</div>':''; })()
    +'<div class="sbr-meta">'
      +'<span class="sbr-n"><b>'+(b.asin_count||0)+'</b> ASINs</span>'
      +(doneB?'':sbPriPill(b))
      +((state.indexOf('sbr-st with')>=0 && String(nm).toLowerCase()===String(b.assigned_to||'').toLowerCase())
          ? '' : state)   // "Jack · Jack" — don't say the same name twice
    +'</div>'
    +'<div class="sbr-tools">'+keepa+copy+'</div>'
    +actions
    +'</div>';
}
function sbTodayHTML(){
  var t=sbToday();
  var live=(SB_BATCHES||[]).filter(function(b){ return b.date===t || b.status!=='Completed'; });
  var doneToday=(SB_BATCHES||[]).filter(function(b){ return b.date===t && b.status==='Completed'; });
  if(!live.length && !doneToday.length){
    return '<div class="sb-empty">Nothing imported today yet.<span>When Sarah pastes a list it appears here straight away.</span></div>';
  }
  var order={High:0,Normal:1,Low:2};
  /* ── GROUP BY TAG ────────────────────────────────────────────────────────────
     Jack: "not a massive fan of how they are grouped... super messy."
     He was right, and the board was contradicting itself. The bulk bar groups by
     TAG ("10's 3 | HH 2 | Process 2 3") because a tag is how he actually decides -
     "all the Process 2 ones go to Suz". But the tiles underneath were sorted purely
     by priority then date, so three Process 2 batches scattered across three
     different rows with 10's and HH interleaved between them.
     Now the tiles cluster by tag, and the TAGS are ordered by urgency: a tag holding
     a High batch comes first, then the tag with the freshest work. Inside a tag it is
     still High first, then newest. So the grid reads the same way the bar does. */
  function tagOf(b){ return String(b.storefront_name||'—'); }
  function priOf(b){ return order[b.priority||'Normal']; }
  var sortFn=function(rows){
    var g={};
    (rows||[]).forEach(function(b){ var k=tagOf(b); (g[k]=g[k]||[]).push(b); });
    Object.keys(g).forEach(function(k){
      g[k].sort(function(a,b){
        if(priOf(a)!==priOf(b)) return priOf(a)-priOf(b);
        var da=sbToISO(a.date)||'', db=sbToISO(b.date)||'';
        if(da!==db) return db<da?-1:1;
        return (a.batch_number||0)-(b.batch_number||0);
      });
    });
    /* ── ORDER, EXACTLY AS JACK ASKED ─────────────────────────────────────────
     "high medium low -- but then to sort high out it's freshest first to oldest
      of high - then same for medium and same for low -- most of them will be the
      same day so just do it in order of these"  ("these" = the tag order he sets
      with the arrows in Storefronts admin, i.e. storefronts.pos).
     So: PRIORITY → DATE (newest first) → his admin order → batch number.
     Every key belongs to the BATCH ITSELF. Nothing is derived from what else is
     still on the board, which is what made it reshuffle after every click — a tag
     used to be ranked by its own remaining batches, so routing one moved the rest. */
    var qpos={};
    (SB_QUEUES||[]).forEach(function(q){
      qpos[String(q.name||'').toLowerCase()]=(q.pos==null?9999:q.pos);
    });
    function posOf(b){
      var v=qpos[String(b.storefront_name||'').toLowerCase()];
      return v==null?9999:v;
    }
    var flat=[];
    Object.keys(g).forEach(function(k){ g[k].forEach(function(b){ flat.push(b); }); });
    flat.sort(function(a,b){
      if(priOf(a)!==priOf(b)) return priOf(a)-priOf(b);          // High → Normal → Low
      var da=sbToISO(a.date)||'', db=sbToISO(b.date)||'';
      if(da!==db) return db<da?-1:1;                             // freshest first
      if(posOf(a)!==posOf(b)) return posOf(a)-posOf(b);          // then his admin order
      var ta=String(a.storefront_name||''), tb=String(b.storefront_name||'');
      if(ta!==tb) return ta.localeCompare(tb);
      return (a.batch_number||0)-(b.batch_number||0);
    });
    // keep the n/m chips meaningful: they count batches sharing a tag
    var sizes={},idxs={};
    flat.forEach(function(b){ var k=tagOf(b); sizes[k]=(sizes[k]||0)+1; });
    flat.forEach(function(b){ var k=tagOf(b); idxs[k]=(idxs[k]||0)+1;
      b._tagFirst=(idxs[k]===1); b._tagSize=sizes[k]; b._tagIdx=idxs[k]; });
    return flat;
  };

  var toRoute=sortFn(live.filter(function(b){ return b.status==='Draft'; }));
  var going  =sortFn(live.filter(function(b){ return b.status==='Started'; }));
  // Jack's own batches were interleaved with the VAs' — five "Jack" rows sitting among
  // Mera/Suz, so his own queue was the hardest thing on his own board to find.
  /* sbGoesTo() was written for the VA side to fix exactly this, and Jack's own board was
     never switched over to it. `assigned_to==='Jack'` is false for 'All' and 'Both', so a
     batch he sent to all three of us showed the ALL badge, sat under "Out with the VAs",
     and never reached his own worklist. It is his AND theirs — it belongs in both places,
     and the ALL badge on the tile already says the VAs have it too. */
  var mineQ  =sortFn(live.filter(function(b){ return b.status==='Assigned' && sbGoesTo(b,'Jack'); }));
  var out2   =sortFn(live.filter(function(b){ return b.status==='Assigned' && !sbGoesTo(b,'Jack'); }));
  var older  =live.filter(function(b){ return b.date!==t; }).length;
  var totA   =live.reduce(function(a,b){ return a+(b.asin_count||0); },0);

  var out='<div class="sb-sum">'
    +(toRoute.length?'<span class="sb-sum-c amber"><b>'+toRoute.length+'</b> to route</span>':'')
    +(going.length?'<span class="sb-sum-c blue"><b>'+going.length+'</b> being worked</span>':'')
    +(doneToday.length?'<span class="sb-sum-c green"><b>'+doneToday.length+'</b> done today</span>':'')
    +'<span class="sb-sum-c"><b>'+totA+'</b> ASINs in play</span>'
    +(older?'<span class="sb-sum-c amber">'+older+' carried over</span>':'')
    +'</div>';

  function group(title,rows,note,tiles){
    if(!rows.length) return '';
    return '<div class="mgr-section">'+title
      +(note?'<span style="margin-left:auto;font-size:10.5px;font-weight:600;color:var(--muted-2);">'+note+'</span>':'')
      +'</div>'+sbGrpBody(rows,title.replace(/[^a-z]/gi,'').toLowerCase(),
          tiles==='calm'?'sbr-tiles calm':(tiles?'sbr-tiles':'sbr-list'));
  }
  var mineA=mineQ.reduce(function(a,b){ return a+(b.asin_count||0); },0);
  if(toRoute.length){
    var tagCt={}; toRoute.forEach(function(b){ tagCt[b.storefront_name||'—']=1; });
    out+='<div class="mgr-section">Needs routing<span style="margin-left:auto;font-size:10.5px;font-weight:600;color:var(--muted-2);">'
      +Object.keys(tagCt).length+' tag'+(Object.keys(tagCt).length===1?'':'s')+' \u00b7 '+toRoute.length+' batch'+(toRoute.length===1?'':'es')+' \u00b7 high first, then newest</span></div>'
      +sbRouteBarHTML(toRoute)
      +sbGrpBody(toRoute,'needsrouting','sbr-tiles');
  }
  out+=group('Being worked',  going,   '');
  // his own queue is a WORKLIST: big Start, everything else tucked away
  if(mineQ.length){
    var mineFlat=mineQ.slice().sort(sbOrderCmp);
    out+='<div class="mgr-section">\u{1F535} Yours to work<span style="margin-left:auto;font-size:10.5px;font-weight:600;color:var(--muted-2);">'
      +mineA.toLocaleString()+' ASINs across '+mineQ.length+' batch'+(mineQ.length===1?'':'es')+' \u00b7 high first, then newest</span></div>'
      +'<div class="sbr-tiles">'+mineFlat.map(sbWorkRowHTML).join('')+'</div>';
  }
  // the VAs' batches are reference, not action — tiles fit far more per row
  out+=group('Out with the VAs', out2, older?older+' carried over from an earlier day':'', 'calm');
  out+=group('Finished today', doneToday, '', 'calm');
  return out;
}
async function sbCopyAsins(batchId){
  var list=await sbBatchAsins(batchId);
  if(!list.length){ showToast('No ASINs on that batch',true); return; }
  try{ await navigator.clipboard.writeText(list.join('\n'));
       showToast(list.length+' ASINs copied — paste straight into Keepa ✓'); }
  catch(e){ showToast('Couldn\'t reach the clipboard',true); }
}
/* `quiet` is for the bulk router — 30 individual toasts and 30 re-renders would be
   worse than the clicking it replaces. The caller reports once at the end. */
async function sbAssign(batchId, who, quiet){
  var b=(SB_BATCHES||[]).filter(function(x){return x.id===batchId;})[0];
  if(!b) return;
  if(b.status==='Started'||b.status==='Completed'){
    if(!quiet) showToast('That batch is locked — it\'s already been started',true);
    return;
  }
  var _grp=sbPeople(who);
  if(_grp.length>1){
    /* one batch each — "each va should be doing it". This row becomes the first
       person's; the rest get their own copy with the same ASINs. */
    var asins=await sbBatchAsins(batchId);
    var ok=await sbPatch(batchId,{assigned_to:_grp[0],status:'Assigned'});
    await sbFanOut({ storefront_id:b.storefront_id, storefront_name:b.storefront_name, date:b.date,
                     batch_number:b.batch_number, priority:b.priority, keepa_url:b.keepa_url,
                     created_by:b.created_by }, _grp, asins);
    SB_BATCHES=null; SB_BATCHES_ALL=null;
    if(!quiet) showToast(_grp.length+' batches — one each for '
      +_grp.map(function(x){ return x==='Jack'?'you':vaDisp(x); }).join(' and ')+' ✓');
    sbRefreshJack();                       // NEW rows exist server-side — must refetch
    return;
  } else {
    // paint first: the tile moving to its new section IS the confirmation, so there is
    // no toast on a single route either. A popup per click, thirty times a day, is noise.
    var prevWho=b.assigned_to, prevSt=b.status;
    b.assigned_to=who; b.status='Assigned';
    delete SB_ROUTE_SEL[batchId];
    if(!quiet){ sbLand(batchId); sbPaintJack(); }
    var ok2=await sbPatch(batchId,{assigned_to:who, status:'Assigned'}, true);
    if(!ok2){
      b.assigned_to=prevWho; b.status=prevSt;      // put it back exactly as it was
      if(!quiet){ sbPaintJack(); showToast('Couldn\'t save that route — put it back',true); }
      return;
    }
    sbSyncSoon();
  }
}
async function sbCyclePriority(batchId){
  var b=(SB_BATCHES||[]).filter(function(x){return x.id===batchId;})[0]; if(!b) return;
  var i=SB_PRIORITY.indexOf(b.priority||'Normal');
  var next=SB_PRIORITY[(i+1)%SB_PRIORITY.length];
  b.priority=next;                              // optimistic — it's one field, instantly reversible
  var host=document.getElementById('mgr-storefronts-content');
  sbPaintSafe(host);
  await sbPatch(batchId,{priority:next}, true);
  sbSyncSoon();
}
/* Jack's own lifecycle. The VA versions stamp state.currentVA, which Jack never has
   (he doesn't start a shift), and they refresh the VA panel rather than his board. */
async function sbJackStart(batchId){
  var b=(SB_BATCHES||[]).filter(function(x){return x.id===batchId;})[0];
  var prev=b?{s:b.status,by:b.started_by}:null;
  if(b){ b.status='Started'; b.started_by='Jack'; sbLand(batchId); sbPaintJack(); }
  var ok=await sbPatch(batchId,{status:'Started', started_by:'Jack', started_at:new Date().toISOString()}, true);
  if(!ok){
    if(b&&prev){ b.status=prev.s; b.started_by=prev.by; sbPaintJack(); }
    showToast('Couldn\'t start it — check your connection',true); return;
  }
  sbSyncSoon();
}
async function sbJackComplete(batchId){
  var b=(SB_BATCHES||[]).filter(function(x){return x.id===batchId;})[0];
  var prev=b?{s:b.status,by:b.completed_by}:null;
  if(b){ b.status='Completed'; b.completed_by='Jack'; sbLand(batchId); sbPaintJack(); }
  var ok=await sbPatch(batchId,{status:'Completed', completed_by:'Jack', completed_at:new Date().toISOString()}, true);
  if(!ok){
    if(b&&prev){ b.status=prev.s; b.completed_by=prev.by; sbPaintJack(); }
    showToast('Couldn\'t save that — check your connection',true); return;
  }
  sbSyncSoon();
}
async function sbStart(batchId){
  var who=String((state&&state.currentVA)||'VA');
  // A test/preview session must never lock a real batch — Jack hit exactly this and
  // the tile then read "locked" with no way to release it.
  if(IS_PREVIEW || /^(test|preview|demo)$/i.test(who)){
    showToast('Test mode — not locking a real batch',true); return;
  }
  var ok=await sbPatch(batchId,{status:'Started', started_by:who, started_at:new Date().toISOString()});
  if(!ok){ showToast('Couldn\'t start it — check your connection',true); return; }
  showToast('Started — this batch is now locked ✓');
  try{ sbRefreshVA(); }catch(e){}
}
async function sbComplete(batchId){
  var whoC=String((state&&state.currentVA)||'VA');
  if(IS_PREVIEW || /^(test|preview|demo)$/i.test(whoC)){
    showToast('Test mode — not completing a real batch',true); return;
  }
  var ok=await sbPatch(batchId,{status:'Completed', completed_by:whoC, completed_at:new Date().toISOString()});
  if(!ok){ showToast('Couldn\'t save that — check your connection',true); return; }
  showToast('Batch complete ✓');
  try{ sbRefreshVA(); }catch(e){}
}
/* ── ROUTING FELT LAGGY, AND IT GENUINELY WAS ────────────────────────────────
   Jack: "when I route things it's a bit laggy, like popups and moving."
   Every click ran: PATCH (network) -> SB_BATCHES=null -> GET the whole list again
   (network) -> rebuild the entire board. Two sequential round-trips before ANYTHING
   moved on screen, then a toast on top. Ticking a bulk-select checkbox did the same:
   one full refetch PER TICK, so selecting 30 rows meant 30 network fetches.
   Now: mutate locally, paint instantly, save in the background, and put it back if
   the save fails. The DB stops being in the click path. */
function sbPaintJack(){                              // instant, local state only
  var host=document.getElementById('mgr-storefronts-content');
  sbPaintSafe(host);
}
function sbRefreshJack(){                            // refetch THEN paint — for the
  sbLoadBatches(true).then(sbPaintJack);             // cases that really changed server-side
}
/* One reconcile after a burst of edits rather than one per click. */
var _sbSyncT=null;
function sbSyncSoon(){
  clearTimeout(_sbSyncT);
  _sbSyncT=setTimeout(function(){
    try{ sbLoadBatches(true).then(sbPaintJack); }catch(e){}
  }, 5000);
}
/* Which tile just moved, so it can announce itself in its new section instead of
   silently teleporting — that was the other half of "moving". */
var SB_LANDED=null;
function sbLand(id){
  SB_LANDED=id;
  setTimeout(function(){ if(SB_LANDED===id){ SB_LANDED=null; } }, 1400);
}
/* ── QUEUE ADMIN (replaces the master Google Sheet) ─────────────────────────*/
/* ── LAST PASTE PER TAG ─────────────────────────────────────────────────────
   Jack: "add a column for the last day sarah pasted info". No new table needed —
   every paste creates a storefront_batch stamped with its date, so the newest batch
   date for a tag IS the last time Sarah pasted into it. A tag that has gone quiet is
   the thing worth spotting: it either stopped being built or stopped being sent. */
/* Jack: "remember this is when Sarah does this."
   b.date is the day a batch is FOR, and the import screen lets Sarah backdate it
   (Today / Yesterday / Mon 10 / a date picker). Live data proves the gap: a batch
   dated 10/08 was actually pasted on 11/08. created_at is when the row was written,
   which is the only field that means "Sarah pasted". */
function sbPasteISO(b){
  if(b&&b.created_at){
    var d=new Date(b.created_at);
    if(!isNaN(d.getTime())){
      try{
        var g={};
        new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'})
          .formatToParts(d).forEach(function(p){ g[p.type]=p.value; });
        if(g.year&&g.month&&g.day) return g.year+'-'+g.month+'-'+g.day;
      }catch(e){}
    }
  }
  return (typeof sbToISO==='function'?sbToISO(b&&b.date):'')||String((b&&b.date)||'').slice(0,10);
}
function sbLastPaste(qid){
  var newest='', forDate='', wasBinned=false, binned=0;
  /* the FULL log, binned included — Jack bins what is no good, but she still pasted it */
  (SB_BATCHES_ALL||SB_BATCHES||[]).forEach(function(b){
    if(b.storefront_id!==qid) return;
    if(b.scrapped) binned++;
    var iso=sbPasteISO(b);
    if(iso&&iso>newest){ newest=iso; forDate=b.date||''; wasBinned=!!b.scrapped; }
  });
  sbLastPaste._for=forDate;
  sbLastPaste._binned=binned;
  sbLastPaste._lastWasBinned=wasBinned;
  return newest;
}
function sbAgoLabel(iso){
  if(!iso) return {txt:'never', cls:'never', d:null};
  var t=ukNow(); t.setHours(0,0,0,0);
  var p=String(iso).split('-');
  var d=new Date(+p[0],(+p[1])-1,+p[2]); d.setHours(0,0,0,0);
  var days=Math.round((t-d)/86400000);
  if(days<0)  return {txt:'today', cls:'fresh', d:0};      // clock skew, not the future
  if(days===0) return {txt:'today', cls:'fresh', d:0};
  if(days===1) return {txt:'yesterday', cls:'fresh', d:1};
  if(days<=3)  return {txt:days+' days ago', cls:'ok', d:days};
  if(days<=7)  return {txt:days+' days ago', cls:'warn', d:days};
  /* was: days up to 27 then "4 weeks ago" — so 27 and 28 days looked a category
     apart. Days all the way to 60 keeps neighbouring rows comparable at a glance. */
  if(days<60) return {txt:days+' days ago', cls:'cold', d:days};
  return {txt:Math.floor(days/30)+' months ago', cls:'cold', d:days};
}
function sbQueueRowHTML(q){
  /* lbl() lets the option READ differently from the value it stores — the priority
     column shows "Medium" while Postgres keeps 'Normal'. Without it the board said
     MEDIUM and this table said Normal for the same tag. */
  function sel(id,val,opts,lbl){
    var cls=(id==='default_assignee')?(' sb-goes-'+String(val||'jack').toLowerCase()):'';
    return '<select class="sb-inp'+cls+'" onchange="sbQueueSet(\''+q.id+'\',\''+id+'\',this.value)">'
      +opts.map(function(o){ return '<option value="'+o+'"'+(String(val)===o?' selected':'')+'>'
        +escHtml(lbl?lbl(o):o)+'</option>'; }).join('')
      +'</select>';
  }
  var cls=[]; if(q.active===false) cls.push('sbq-off'); if(SB_SEL[q.id]) cls.push('sbq-sel');
  // one control, one decision: where does a paste on this tag END UP?
  var dest = q.manual_review ? 'review' : (q.default_assignee||'Jack');
  if(!q.manual_review && !sbRoute(dest)) dest='Jack';
  var destSel='<select class="sb-inp sb-dest sb-dest-'+String(dest).toLowerCase()+'" '
    +'onchange="sbQueueDest(\''+q.id+'\',this.value)">'
    +[['Mera','\u2192 Mera'],['Suz','\u2192 Suz'],['Both','\u2192 Both VAs (Mera + Suz)'],
      ['JackMera','\u2192 Me + Mera'],['JackSuz','\u2192 Me + Suz'],
      ['All','\u2192 All 3 of us (Mera + Suz + me)'],
      ['Jack','\u2192 Just me (straight through)'],['review','\u23f8 Me to route first']]
      .map(function(o){ return '<option value="'+o[0]+'"'+(dest===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('')
    +'</select>';
  return '<tr'+(cls.length?' class="'+cls.join(' ')+'"':'')+'>'
    +'<td class="sb-ctr"><label class="sb-chk"><input type="checkbox"'+(SB_SEL[q.id]?' checked':'')
      +' onchange="sbSelToggle(\''+q.id+'\',this.checked)"><i></i></label></td>'
    +'<td class="sb-ctr"><div class="sbq-move">'
      +'<button title="Move up — Sarah sees the chips in this order" onclick="sbQueueMove(\''+q.id+'\',-1)">&#9650;</button>'
      +'<button title="Move down" onclick="sbQueueMove(\''+q.id+'\',1)">&#9660;</button>'
    +'</div></td>'
    +'<td><input class="sb-inp sb-inp-name" value="'+escHtml(q.name||'')+'" onchange="sbQueueSet(\''+q.id+'\',\'name\',this.value)"></td>'
    +'<td>'+destSel+'</td>'
    +'<td>'+sel('priority', q.priority||'Normal', SB_PRIORITY, sbPriLabel)+'</td>'
    +'<td><input class="sb-inp sb-inp-note" value="'+escHtml(q.notes||'')
      +'" placeholder="e.g. household brands \u00b7 Sarah builds it Mondays" '
      +'onchange="sbQueueSet(\''+q.id+'\',\'notes\',this.value)"></td>'
    +(function(){ var iso=sbLastPaste(q.id), fd=sbLastPaste._for, a=sbAgoLabel(iso);
        var binned=sbLastPaste._binned||0, lastBin=sbLastPaste._lastWasBinned;
        /* Two dates, because they legitimately differ: WHEN she pasted (what this
           column measures) and the day the batch was FOR (she can backdate). Showing
           only the first made a backdated paste look like a wrong number. */
        var differs = fd && typeof sbToISO==='function' && sbToISO(fd)!==iso;
        var tip = (a.d==null) ? 'Sarah has never pasted into this tag'
          : ('Sarah pasted this '+(a.d===0?'today':a.d+' day'+(a.d===1?'':'s')+' ago')
             + (differs ? ' \u2014 she dated that batch '+fd+', which is why the two differ' : '')
             + (lastBin ? ' \u2014 you binned that one, but it still counts as a paste' : '')
             + (binned ? ' \u00b7 '+binned+' batch'+(binned===1?'':'es')+' from this tag binned in total' : ''));
        return '<td class="sb-ctr"><span class="sbq-ago '+a.cls+'" title="'+escHtml(tip)+'">'+a.txt
          +(lastBin?'<em class="sbq-binned" title="You binned this batch \u2014 the paste still counts">binned</em>':'')
          +(differs?'<em class="sbq-for">for '+escHtml(String(fd))+'</em>':'')
          +'</span></td>'; })()
    +(SB_SHOW_DETAILS
       ? '<td><input class="sb-inp" value="'+escHtml(q.frequency||'')+'" placeholder="Daily" onchange="sbQueueSet(\''+q.id+'\',\'frequency\',this.value)"></td>'
       : '')
    +'<td class="sb-ctr"><label class="sb-chk"><input type="checkbox"'+(q.active!==false?' checked':'')
      +' onchange="sbQueueSet(\''+q.id+'\',\'active\',this.checked)"><i></i></label></td>'
    +'<td class="sb-ctr"><button class="sbq-del" title="Remove this queue" onclick="sbQueueDel(\''+q.id+'\')">&#10005;</button></td>'
    +'</tr>';
}
/* ── BULK EDIT ──────────────────────────────────────────────────────────────
   With 25 tags and 22 of them set to "review", routing every batch by hand is a
   daily tax. Setting 22 dropdowns one at a time is worse. Tick the rows, set them
   all at once. Frequency and Notes are hidden by default because they are identical
   ("Daily" / "—") on every row and were eating half the table's width. */
var SB_SEL={}, SB_SHOW_DETAILS=false;
function sbSelCount(){ var n=0; for(var k in SB_SEL) if(SB_SEL[k]) n++; return n; }
function sbSelIds(){ var a=[]; for(var k in SB_SEL) if(SB_SEL[k]) a.push(k); return a; }
function sbAllShownSelected(){
  var rows=sbAdminRows();
  return rows.length>0 && rows.every(function(q){ return !!SB_SEL[q.id]; });
}
function sbSelToggle(id,on){ SB_SEL[id]=!!on; sbAdminRepaint(); }
function sbSelAll(on){
  sbAdminRows().forEach(function(q){ SB_SEL[q.id]=!!on; });
  sbAdminRepaint();
}
function sbSelClear(){ SB_SEL={}; sbAdminRepaint(); }
function sbAdminRepaint(){
  var host=document.getElementById('mgr-storefronts-content');
  sbPaintSafe(host);
}
function sbToggleDetails(){ SB_SHOW_DETAILS=!SB_SHOW_DETAILS; sbAdminRepaint(); }
async function sbBulkSet(field, val){
  var ids=sbSelIds(); if(!ids.length) return;
  if(field==='manual_review'||field==='active') val=(val==='true'||val===true);
  ids.forEach(function(id){ var q=sbQueueById(id); if(q) q[field]=val; });
  sbAdminRepaint();
  if(IS_PREVIEW) return;
  var fails=0;
  await Promise.all(ids.map(async function(id){
    try{
      var patch={updated_at:new Date().toISOString()}; patch[field]=val;
      var r=await fetchT(SUPABASE_URL+'/rest/v1/storefronts?id=eq.'+encodeURIComponent(id),{method:'PATCH',
        headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
                 'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify(patch)});
      if(!r.ok) fails++;
    }catch(e){ fails++; }
  }));
  showToast(fails? (fails+' of '+ids.length+' didn\'t save — check your connection')
                 : (ids.length+' queue'+(ids.length===1?'':'s')+' updated ✓'), !!fails);
}
function sbBulkBarHTML(){
  var n=sbSelCount();
  if(!n) return '<div class="sbq-bulk idle">'
    +'<span>Tick rows to change several at once</span>'
    +'<button class="sbq-mini" onclick="sbToggleDetails()">'
      +(SB_SHOW_DETAILS?'Hide frequency &amp; notes':'Show frequency &amp; notes')+'</button>'
    +'</div>';
  return '<div class="sbq-bulk on">'
    +'<b>'+n+' selected</b>'
    +'<span class="sbq-bl">Goes to</span>'
    +'<select class="sbq-mini-sel" onchange="if(this.value)sbBulkSet(\'default_assignee\',this.value);this.value=\'\';">'
      +'<option value="">—</option><option>Mera</option><option>Suz</option><option>Jack</option></select>'
    +'<button class="sbq-mini" onclick="sbBulkSet(\'manual_review\',true)">\u23f8 Route via me</button>'
    +'<span class="sbq-bl">Active</span>'
    +'<button class="sbq-mini" onclick="sbBulkSet(\'active\',true)">On</button>'
    +'<button class="sbq-mini" onclick="sbBulkSet(\'active\',false)">Off</button>'
    +'<button class="sbq-mini clear" onclick="sbSelClear()">Clear</button>'
    +'</div>';
}
/* Search over the admin table. At 7 rows this was pointless; at 25 (Jack's full
   sheet list) hunting for "Process 6" by eye is the slow bit. */
var SB_ADMIN_FILTER='';
function sbAdminFilter(v){
  SB_ADMIN_FILTER=v||'';
  var b=document.getElementById('sbq-body');
  if(b) b.innerHTML=sbQueueRowsHTML();
  var c=document.getElementById('sbq-shown');
  if(c) c.textContent=sbAdminRows().length+' shown';
}
function sbAdminRows(){
  var f=String(SB_ADMIN_FILTER||'').trim().toLowerCase();
  return (SB_QUEUES||[]).filter(function(q){
    return !f || String(q.name||'').toLowerCase().indexOf(f)>=0
              || String(q.default_assignee||'').toLowerCase().indexOf(f)>=0;
  });
}
function sbQueueRowsHTML(){
  var rows=sbAdminRows();
  if(!rows.length) return '<tr><td colspan="'+(SB_SHOW_DETAILS?10:8)+'" class="sb-none">'
    +(SB_QUEUES&&SB_QUEUES.length?'No queue matches “'+escHtml(SB_ADMIN_FILTER)+'”.':'No queues yet.')+'</td></tr>';
  return rows.map(sbQueueRowHTML).join('');
}
/* Order matters now: Sarah's tag chips appear in `pos` order, so the ones she uses
   every day should be movable to the front rather than stuck wherever they were added. */
async function sbQueueMove(id, dir){
  var all=(SB_QUEUES||[]).slice().sort(function(a,b){ return (a.pos||0)-(b.pos||0); });
  var i=all.findIndex(function(q){ return q.id===id; });
  var j=i+dir;
  if(i<0||j<0||j>=all.length) return;
  var a=all[i], b=all[j];
  var pa=a.pos||(i+1), pb=b.pos||(j+1);
  if(pa===pb){ pa=i+1; pb=j+1; }             // never seen, but a tie would make the swap a no-op
  a.pos=pb; b.pos=pa;
  SB_QUEUES.sort(function(x,y){ return (x.pos||0)-(y.pos||0); });
  var host=document.getElementById('mgr-storefronts-content'); sbPaintSafe(host);
  // A silent preview no-op here looks EXACTLY like a save: the row moves, nothing
  // complains, and the order snaps back on refresh. Say it every time.
  if(IS_PREVIEW){ showToast('Order changed here only — saving is OFF in this copy, so it will reset on refresh. Use the live app (or Switch saving on).', true); return; }
  try{
    await Promise.all([a,b].map(function(q){
      return fetchT(SUPABASE_URL+'/rest/v1/storefronts?id=eq.'+encodeURIComponent(q.id),{method:'PATCH',
        headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
                 'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify({pos:q.pos, updated_at:new Date().toISOString()})});
    }));
  }catch(e){ showToast('Couldn\'t save the new order',true); }
}
function sbQueuesHTML(){
  var qs=(SB_QUEUES||[]);
  var active=qs.filter(function(q){ return q.active!==false; }).length;
  var review=qs.filter(function(q){ return !!q.manual_review; }).length;
  var missing=(typeof SB_SHEET_TAGS!=='undefined')
    ? SB_SHEET_TAGS.filter(function(n){
        return !qs.some(function(q){ return String(q.name||'').trim().toLowerCase()===n.toLowerCase(); }); }).length
    : 0;
  return '<div class="mgr-section">Queues<span style="margin-left:auto;font-size:10.5px;font-weight:600;color:var(--muted-2);">'
      +'this replaces the master sheet — Sarah picks from one tag chip per active row</span></div>'
    // The one number that was missing: how many tags exist vs how many Sarah can
    // actually reach, and whether the sheet list is fully in yet.
    +'<div class="sbq-bar">'
      +'<span class="sbq-stat"><b>'+qs.length+'</b> tags</span>'
      +'<span class="sbq-stat ok"><b>'+active+'</b> live for Sarah</span>'
      +'<span class="sbq-stat"><b>'+review+'</b> land with you</span>'
      +(missing?'<span class="sbq-stat warn">'+missing+' from your sheet not added yet</span>':'')
      +'<span class="sbq-stat mute" id="sbq-shown">'+sbAdminRows().length+' shown</span>'
      +'<input class="sbq-search" type="search" name="tag-find" autocomplete="off" data-lpignore="true" data-1p-ignore placeholder="Find a tag…" value="'+escHtml(SB_ADMIN_FILTER)+'"'
        +' oninput="sbAdminFilter(this.value)" spellcheck="false">'
    +'</div>'
    +sbBulkBarHTML()
    +'<div class="sbq-wrap"><table class="sbq-tbl'+(SB_SHOW_DETAILS?'':' lean')+'">'
    +'<thead><tr>'
      +'<th class="sb-ctr"><label class="sb-chk" title="Select all shown"><input type="checkbox"'
        +(sbAllShownSelected()?' checked':'')+' onchange="sbSelAll(this.checked)"><i></i></label></th>'
      +'<th title="Sarah’s tag chips appear in this order">#</th>'
      +'<th>Tag</th><th>Where a paste ends up</th>'
      +'<th>Priority</th>'
      +'<th title="What is actually in this tag — brands, who is in it, how it is built">What&rsquo;s in it</th>'
      +'<th title="When Sarah last pasted into this tag \u2014 the moment the batch was created, not the day she dated it for">Last paste</th>'
      +(SB_SHOW_DETAILS?'<th>Frequency</th>':'')
      +'<th>Active</th><th></th></tr></thead>'
    +'<tbody id="sbq-body">'+sbQueueRowsHTML()+'</tbody>'
    +'</table>'
    // when the sheet list isn't fully in, this is the button he wants — say so and make
    // it the obvious one, rather than a second ghost button he has to notice
    +'<div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-top:11px;">'
      +'<button class="btn btn-ghost" onclick="sbQueueAdd()">+ Add queue</button>'
      +'<button class="btn '+(missing?'btn-primary':'btn-ghost')+'" onclick="sbAddSheetTags()" '
        +'title="Adds every tag from your master sheet’s dropdown that isn’t here yet">'
        +(missing?'↻ Add the '+missing+' missing sheet tag'+(missing===1?'':'s'):'↻ Add my sheet tags')+'</button>'
      +(missing?'<span style="font-size:11.5px;color:var(--muted-2);">'
        +'they all land with you for review until you set where each one goes</span>':'')
    +'</div></div>';
}
/* One dropdown replaces the Goes-to + Review pair. They were two controls for a single
   decision and could contradict each other — "Goes to Mera" with Review ticked still
   landed with Jack, so the table read as a lie 22 rows deep. */
async function sbQueueDest(id, val){
  var review=(val==='review');
  var who=review?'Jack':val;
  var q=sbQueueById(id); if(q){ q.manual_review=review; q.default_assignee=who; }
  sbAdminRepaint();
  if(IS_PREVIEW) return;
  try{
    var r=await fetchT(SUPABASE_URL+'/rest/v1/storefronts?id=eq.'+encodeURIComponent(id),{method:'PATCH',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
               'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({manual_review:review, default_assignee:who, updated_at:new Date().toISOString()})});
    showToast(r.ok?'Saved \u2713':'Couldn\'t save that \u2014 check your connection', !r.ok);
  }catch(e){ showToast('Couldn\'t save that \u2014 check your connection',true); }
}
async function sbQueueSet(id, field, val){
  var q=sbQueueById(id); if(!q) return;
  q[field]=val;
  if(IS_PREVIEW){ showToast('Changed here only — saving is OFF in this copy. Use the live app to keep it.', true); return; }
  var patch={}; patch[field]=val; patch.updated_at=new Date().toISOString();
  var ok=await (async function(){
    try{
      var r=await fetchT(SUPABASE_URL+'/rest/v1/storefronts?id=eq.'+encodeURIComponent(id),{method:'PATCH',
        headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
                 'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify(patch)});
      return r.ok;
    }catch(e){ return false; }
  })();
  showToast(ok?'Saved ✓':'Couldn\'t save that — check your connection', !ok);
}
/* Delete a queue outright. An earlier version refused when the queue had batches,
   on the assumption that history would be orphaned — that assumption was WRONG:
   every batch stores its own `storefront_name` at creation, and the history view
   reads that copy, never the queue row. So past batches stay perfectly readable.
   Deleting only stops the queue appearing on Sarah's page in future. Say exactly
   that, then do what he asked. */
async function sbQueueDel(id){
  var q=sbQueueById(id); if(!q) return;
  var used=(SB_BATCHES||[]).filter(function(b){ return b.storefront_id===id; }).length;
  if(!used && !IS_PREVIEW){
    try{
      var r=await fetchT(SUPABASE_URL+'/rest/v1/storefront_batches?storefront_id=eq.'+encodeURIComponent(id)+'&select=id',
        {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,Prefer:'count=exact'}});
      if(r.ok){ var rows=await r.json(); used=(rows||[]).length; }
    }catch(e){}
  }
  var msg = used
    ? ('Delete the queue "'+q.name+'"?\n\n'
       +'Its '+used+' past batch'+(used===1?' stays':'es stay')+' in your history under the name "'+q.name+'" — '
       +'nothing is lost. It just stops appearing as a paste box on Sarah’s page.')
    : ('Delete the queue "'+q.name+'"?\n\nIt has never been used, so nothing is lost.');
  if(!confirm(msg)) return;
  if(!IS_PREVIEW){
    try{
      var d=await dbWrite('Removing a queue', SUPABASE_URL+'/rest/v1/storefronts?id=eq.'+encodeURIComponent(id),
        {method:'DELETE',headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
      if(!d || !d.ok){ showToast('Couldn’t remove it — check your connection',true); return; }
    }catch(e){ showToast('Couldn’t remove it — check your connection',true); return; }
  }
  SB_QUEUES=null;
  await sbLoadQueues(true);
  var host=document.getElementById('mgr-storefronts-content'); sbPaintSafe(host);
  showToast('"'+q.name+'" removed ✓'+(used?' — its '+used+' past batch'+(used===1?' is':'es are')+' still in your history':''));
}
/* A browser prompt() can only ask one question, so a new tag always landed as
   "route via me" and had to be fixed afterwards in the table. Ask for the destination
   and priority at the same time — and it looks like the rest of the app. */
function sbQueueAdd(){
  var m=document.createElement('div');
  m.className='sbq-modal'; m.id='sbq-modal';
  m.innerHTML='<div class="sbq-box">'
    +'<div class="sbq-box-h">Add a tag</div>'
    +'<div class="sbq-box-s">It appears as a chip on Sarah\u2019s import page straight away.</div>'
    +'<label class="sbq-l">Name</label>'
    +'<input id="sbq-nm" class="sbq-in" placeholder="e.g. Process 10, HTA, JTH" autocomplete="off">'
    +'<label class="sbq-l">Where a paste ends up</label>'
    +'<select id="sbq-dest" class="sbq-in">'
      +'<option value="review">\u23f8 Me to route</option>'
      +'<option value="Mera">\u2192 Mera</option>'
      +'<option value="Suz">\u2192 Suz</option>'
      +'<option value="Both">\u2192 Both VAs (Mera + Suz)</option>'
      +'<option value="JackMera">\u2192 Me + Mera</option>'
      +'<option value="JackSuz">\u2192 Me + Suz</option>'
      +'<option value="All">\u2192 All 3 of us (Mera + Suz + me)</option>'
      +'<option value="Jack">\u2192 Me (straight through)</option>'
    +'</select>'
    +'<label class="sbq-l">Priority</label>'
    /* value stays 'Normal' (the column default); the label is what Jack calls it */
    +'<select id="sbq-pri" class="sbq-in">'
      +'<option value="High">High</option>'
      +'<option value="Normal" selected>Medium</option>'
      +'<option value="Low">Low</option>'
    +'</select>'
    +'<label class="sbq-l">Note <span>optional \u2014 who\u2019s in it, what it covers</span></label>'
    +'<input id="sbq-note" class="sbq-in" placeholder="e.g. Mera + Suz rotate this one" autocomplete="off">'
    +'<div class="sbq-box-a">'
      +'<button class="btn btn-ghost" onclick="sbQueueAddClose()">Cancel</button>'
      +'<button class="btn btn-primary" onclick="sbQueueAddSave()">Add tag</button>'
    +'</div></div>';
  document.body.appendChild(m);
  m.addEventListener('click',function(e){ if(e.target===m) sbQueueAddClose(); });
  setTimeout(function(){ var i=document.getElementById('sbq-nm'); if(i) i.focus(); },40);
  document.getElementById('sbq-nm').addEventListener('keydown',function(e){ if(e.key==='Enter') sbQueueAddSave(); });
}
function sbQueueAddClose(){ var m=document.getElementById('sbq-modal'); if(m) m.remove(); }
async function sbQueueAddSave(){
  var name=(document.getElementById('sbq-nm')||{}).value||'';
  name=String(name).trim();
  if(!name){ showToast('Give it a name',true); var i=document.getElementById('sbq-nm'); if(i) i.focus(); return; }
  if((SB_QUEUES||[]).some(function(q){ return String(q.name||'').trim().toLowerCase()===name.toLowerCase(); })){
    showToast('You already have a tag called \u201c'+name+'\u201d',true); return;
  }
  var dv=(document.getElementById('sbq-dest')||{}).value||'review';
  var review=(dv==='review');
  var row={ id:'sf_'+sbUid(), name:name,
            default_assignee: review?'Jack':dv, manual_review: review,
            priority:(document.getElementById('sbq-pri')||{}).value||'Normal',
            notes:((document.getElementById('sbq-note')||{}).value||'').trim(),
            frequency:'Daily', active:true, pos:(SB_QUEUES||[]).length+1 };
  sbQueueAddClose();
  if(!IS_PREVIEW){
    try{
      var r=await fetchT(SUPABASE_URL+'/rest/v1/storefronts',{method:'POST',
        headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
                 'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify(row)});
      if(!r.ok){ showToast('Couldn\'t add that queue',true); return; }
    }catch(e){ showToast('Couldn\'t add that queue',true); return; }
  }
  await sbLoadQueues(true);
  var host=document.getElementById('mgr-storefronts-content'); sbPaintSafe(host);
  showToast('"'+name+'" added — it goes to you for review until you change it ✓');
}
/* ── Jack's real tag list, straight off the master sheet's dropdown ──────────
   In the order it appears there, so the paste-page chips read the same way round
   as the sheet he's been using for years. Anything already set up is skipped, so
   this is safe to press twice. */
/* The tab names on Jack's master sheet, in sheet order. Was seeded from an older
   dropdown that still had Any / Other / Competitors — pressing the button would have
   re-added the three he deleted on 31/07. */
var SB_SHEET_TAGS=['Mera','Suz','Jack','TFTJ','Comp','HH','HTA',"10's",
  'Process 1','Process 2','Process 3','Process 4','Process 5','Process 6','Process 7',
  'Process 8','Process 9','SUBS','FFB','JTH','UB','PL'];
async function sbAddSheetTags(){
  var have={};
  (SB_QUEUES||[]).forEach(function(q){ have[String(q.name||'').trim().toLowerCase()]=true; });
  var missing=SB_SHEET_TAGS.filter(function(n){ return !have[n.toLowerCase()]; });
  if(!missing.length){ showToast('Every tag from your sheet is already set up ✓'); return; }
  var note = (have['competitors'] && missing.indexOf('Comp')>=0)
    ? '\n\nNote: you already have a queue called "Competitors". "Comp" will be added alongside it — '
      +'delete or rename whichever you don\'t want.' : '';
  if(!confirm('Add '+missing.length+' tag'+(missing.length===1?'':'s')+' from your sheet?\n\n'
    +missing.join(' · ')+'\n\nThey all land with you for review until you set where each one goes.'+note)) return;

  var base=(SB_QUEUES||[]).length;
  var rows=missing.map(function(n,i){
    return { id:'sf_'+sbUid(), name:n, default_assignee:'Jack', manual_review:true,
             priority:'Normal', frequency:'Daily', active:true,
             pos: base + SB_SHEET_TAGS.indexOf(n) + 1 };
  });
  if(!IS_PREVIEW){
    try{
      var r=await fetchT(SUPABASE_URL+'/rest/v1/storefronts',{method:'POST',
        headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
                 'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify(rows)});
      if(!r.ok){ showToast('Couldn\'t add those — check your connection',true); return; }
    }catch(e){ showToast('Couldn\'t add those — check your connection',true); return; }
  }
  await sbLoadQueues(true);
  var host=document.getElementById('mgr-storefronts-content'); sbPaintSafe(host);
  showToast(missing.length+' tag'+(missing.length===1?'':'s')+' added ✓ — set where each goes in the table');
}
/* the Keepa template lives here so it can be corrected without a code change */
function sbKeepaSettingHTML(){
  var d=sbKeepaDomain();
  var NAMES={'1':'amazon.com','2':'amazon.co.uk','3':'amazon.de','4':'amazon.fr','8':'amazon.it','9':'amazon.es'};
  var opts=Object.keys(NAMES).map(function(k){
    return '<option value="'+k+'"'+(k===d?' selected':'')+'>'+NAMES[k]+'</option>';
  }).join('');
  var sample=sbKeepaUrl(['B07BCP4B35','B07CQQG66F']);
  return '<div class="mgr-section">Keepa link</div>'
    +'<div class="sbk-wrap">'
    +'<div class="sbk-note"><b>&#10003; Confirmed.</b> Batch links are built the way Keepa builds them, '
      +'so every batch gets a working Product Viewer link automatically. Nothing to paste.</div>'
    +'<label class="settings-label">Marketplace</label>'
    +'<select class="settings-input" style="max-width:240px;" onchange="sbKeepaDomainSet(this.value)">'+opts+'</select>'
    +'<div class="sbk-hint">Example with two ASINs:<br><code>'+escHtml(sample.slice(0,110))+'&hellip;</code></div>'
    +'<div class="pay-actions" style="margin-top:9px;">'
      +'<button class="btn btn-ghost" onclick="window.open(sbKeepaUrl([\'B07BCP4B35\',\'B07CQQG66F\',\'B07BCPNGDJ\']),\'_blank\')">Open a test link &#8599;</button>'
    +'</div></div>';
}
function sbKeepaDomainSet(v){
  try{ var st=getAppSettings(); st.keepaDomain=String(v); saveAppSettings(st); pushSettingsCloud(st); }catch(e){}
  showToast('Keepa marketplace set ✓');
  try{ mgr_renderStorefronts(); }catch(e){}
}
