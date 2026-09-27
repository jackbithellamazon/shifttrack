/* ── THE LEADS PAGE ──────────────────────────────────────────────────────────
   Jack: "we got any good page in dashboard for leads — that is a vital part of the
   operation isn't it?" It is, and there wasn't one. The Overview strip answers "what
   is waiting for me"; nothing answered "where do the leads I actually BUY come from",
   which is the question that decides what he tells the VAs to do next week.
   Every number below is counted from the leads already in memory — no new fetch, no
   new field, nothing for anyone to fill in. */
function ldDashRows(){ return (window.leads||[]); }
function ldIsBought(l){ return l&&l.status==='bought'; }
function ldIsOpen(l){ return l&&['atbq','atba2a','waiting'].indexOf(l.status)>-1; }
function ldIsDecided(l){ return l&&(l.islead!==null||!!l.status); }
function ldDashPct(n,d){ return d>0?Math.round(n/d*100):0; }
/* Group by any key and report the numbers that matter: how many came in, how many Jack
   approved, how many he bought, and the money. Sorted by BUYS, not volume — a source
   that sends 400 leads and sells none is not the best source. */
function ldDashGroup(rows,keyFn,labelFn){
  var by={};
  rows.forEach(function(l){
    var k=keyFn(l); if(!k) return;
    var g=by[k]||(by[k]={k:k,label:labelFn?labelFn(l):k,n:0,lead:0,bought:0,open:0,spend:0,profit:0,scoreSum:0});
    g.n++;
    if(l.islead===true) g.lead++;
    if(ldIsBought(l)){ g.bought++; g.spend+=(parseFloat(l.buy)||0); g.profit+=(parseFloat(l.profit)||0); }
    if(ldIsOpen(l)) g.open++;
    g.scoreSum+=((l._sc&&l._sc.total)||0);
  });
  return Object.keys(by).map(function(k){ return by[k]; })
    .sort(function(a,b){ return (b.bought-a.bought)||(b.n-a.n); });
}
function ldDashBar(pct,col){
  return '<div class="ldd-bar"><div style="width:'+Math.max(0,Math.min(100,pct))+'%;background:'+col+'"></div></div>';
}
function ldDashTable(groups,title,note,limit){
  if(!groups.length) return '';
  var top=groups.slice(0,limit||8);
  var maxBought=Math.max.apply(null,top.map(function(g){return g.bought;}).concat([1]));
  return '<div class="ldd-card"><div class="ldd-h">'+escHtml(title)+'</div>'
    +(note?'<div class="ldd-sub">'+note+'</div>':'')
    +'<div class="ldd-tbl">'
      +'<div class="ldd-tr ldd-head"><span>Name</span><span>Leads</span><span>Bought</span><span>Buy rate</span><span>Spent</span></div>'
      +top.map(function(g){
        var br=ldDashPct(g.bought,g.n);
        return '<div class="ldd-tr">'
          +'<span class="ldd-name" title="'+escHtml(g.label)+'">'+escHtml(g.label)+'</span>'
          +'<span class="ldd-n">'+g.n+'</span>'
          +'<span class="ldd-n ldd-buy">'+g.bought+'</span>'
          +'<span class="ldd-rate">'+br+'%'+ldDashBar(g.bought/maxBought*100,br>=15?'#3ac478':br>0?'#f5a524':'#4a5468')+'</span>'
          +'<span class="ldd-n">£'+Math.round(g.spend).toLocaleString()+'</span>'
          +'</div>';
      }).join('')
    +'</div>'
    +(groups.length>top.length?'<div class="ldd-more">+'+(groups.length-top.length)+' more</div>':'')
    +'</div>';
}
/* All-time numbers hide what is happening NOW: a source method that carried the board
   in June and has sent nothing since looks identical to one working this week. */
var LDD_PERIOD=window.LDD_PERIOD||'all';
function ldDashSetPeriod(p){ window.LDD_PERIOD=LDD_PERIOD=p; mgr_renderLeadsDash(); }
function ldDashInPeriod(l){
  if(LDD_PERIOD==='all') return true;
  var p=String(l&&l.date||'').split('/'); if(p.length!==3) return false;
  var d=new Date(+p[2],+p[1]-1,+p[0]); if(isNaN(d.getTime())) return false;
  var now=new Date(), t0=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  var days=Math.round((t0-d)/86400000);
  if(LDD_PERIOD==='30d') return days>=0&&days<=30;
  if(LDD_PERIOD==='7d')  return days>=0&&days<=7;
  if(LDD_PERIOD==='month') return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  return true;
}
function ldDashPeriodBar(n){
  var opts=[['7d','Last 7 days'],['30d','Last 30 days'],['month','This month'],['all','All time']];
  return '<div class="ldd-period"><span class="ldd-period-l">Showing</span>'
    +opts.map(function(o){
      return '<button class="ldd-pb'+(LDD_PERIOD===o[0]?' on':'')+'" onclick="ldDashSetPeriod(\''+o[0]+'\')">'
        +o[1]+'</button>'; }).join('')
    +'<span class="ldd-period-n">'+n.toLocaleString()+' lead'+(n===1?'':'s')+'</span></div>';
}
function mgr_renderLeadsDash(){
  var host=document.getElementById('mgr-leadsdash-content'); if(!host) return;
  var rows=ldDashRows().filter(ldDashInPeriod);
  if(!rows.length){
    var loading=!ldDashRows().length;
    host.innerHTML=(loading?'':ldDashPeriodBar(0))
      +'<div class="ldd-card"><div class="ldd-h">Leads</div><div class="ldd-sub">'
      +(loading?'Loading from the sheets…'
              :'No leads in this period. Try a wider one above.')
      +'</div></div>';
    // don't make him come back — repaint on our own once the data lands
    if(loading) setTimeout(function(){ try{ if(mgr_currentTab==='leadsdash') mgr_renderLeadsDash(); }catch(e){} },1500);
    return;
  }
  var decided=rows.filter(ldIsDecided);
  var approved=rows.filter(function(l){ return l.islead===true; });
  var bought=rows.filter(ldIsBought);
  var open=rows.filter(ldIsOpen);
  var undec=rows.filter(function(l){ return !ldIsDecided(l); });
  var spend=bought.reduce(function(a,l){ return a+(parseFloat(l.buy)||0); },0);
  var profit=bought.reduce(function(a,l){ return a+(parseFloat(l.profit)||0); },0);
  var openSpend=open.reduce(function(a,l){ return a+(parseFloat(l.buy)||0); },0);

  // ── the funnel, in one line each ──
  var funnel='<div class="ldd-card"><div class="ldd-h">The funnel</div>'
    +'<div class="ldd-sub">Every lead your VAs have sent, and what happened to it.</div>'
    +'<div class="ldd-fun">'
      +[['Sourced',rows.length,'#8c94a8',null],
        ['Approved as a lead',approved.length,'#7c6cff',rows.length],
        ['Bought',bought.length,'#3ac478',rows.length]]
        .map(function(f){
          var pct=f[3]?ldDashPct(f[1],f[3]):100;
          return '<div class="ldd-fr"><span class="ldd-fl">'+f[0]+'</span>'
            +'<span class="ldd-fv">'+f[1].toLocaleString()+(f[3]?' <em>'+pct+'% of sourced</em>':'')+'</span>'
            +ldDashBar(pct,f[2])+'</div>';
        }).join('')
    +'</div>'
    +'<div class="ldd-kpis">'
      +'<span><em>Still undecided</em><b>'+undec.length.toLocaleString()+'</b></span>'
      +'<span><em>Buy rate of decided</em><b>'+ldDashPct(bought.length,decided.length)+'%</b></span>'
      +'<span><em>Spent on buys</em><b>£'+Math.round(spend).toLocaleString()+'</b></span>'
      +'<span><em>Profit on those</em><b>£'+Math.round(profit).toLocaleString()+'</b></span>'
    +'</div></div>';

  // ── open orders by supplier — the postage point, at board level ──
  var openBySup={};
  open.forEach(function(l){ var k=buyFromKey(l); if(!k) return;
    var g=openBySup[k]||(openBySup[k]={k:k,n:0,spend:0});
    g.n++; g.spend+=(parseFloat(l.buy)||0); });
  var supList=Object.keys(openBySup).map(function(k){return openBySup[k];})
    .sort(function(a,b){ return b.n-a.n; }).slice(0,8);
  var supCard=supList.length
    ? '<div class="ldd-card"><div class="ldd-h">Boxes worth filling</div>'
      +'<div class="ldd-sub">ATB and waiting leads grouped by supplier — one postage per order, so these are the orders already forming.</div>'
      +'<div class="ldd-tbl">'
        +'<div class="ldd-tr ldd-head"><span>Supplier</span><span>Waiting</span><span colspan="2"></span><span>To spend</span></div>'
        +supList.map(function(g){
          return '<div class="ldd-tr ldd-tr-click" onclick="ldSupplierView(\''+String(g.k).replace(/[^a-z0-9.\-]/g,'')+'\')">'
            +'<span class="ldd-name">'+escHtml(g.k)+'</span>'
            +'<span class="ldd-n ldd-buy">'+g.n+'</span><span></span><span></span>'
            +'<span class="ldd-n">£'+Math.round(g.spend).toLocaleString()+'</span></div>';
        }).join('')
      +'</div>'
      +'<div class="ldd-more">£'+Math.round(openSpend).toLocaleString()+' committed across '+open.length+' leads in total</div>'
      +'</div>'
    : '';

  // ── where the buys come from ──
  var bySource=ldDashTable(ldDashGroup(rows,function(l){ return _lfKey(l.src); },function(l){ return l.src; }),
    'Where your buys come from', 'By source method. Sorted by buys, not volume — a method that sends hundreds and sells none is not your best one.');
  var byStore=ldDashTable(ldDashGroup(rows,function(l){ return buyFromKey(l); },function(l){ return buyFromKey(l); }),
    'Which suppliers you actually buy from', 'Supplier link where there is one, store name where there is not.');
  var byVA=ldDashTable(ldDashGroup(rows,function(l){ return l.va; },function(l){ return vaDisp(l.va); }),
    'Mera vs Suz', 'Same measure for both: how many they sent, and how many you bought.', 4);

  // ── why leads die ──
  /* First version of this card used reasonOf(), which only reads a CONFIRMED [why:]
     tag — so it reported "31 rejections, no reason recorded" when most of them say the
     reason in plain English. reasonAny() adds the keyword reading the app already does
     everywhere else, and a guess is always labelled as a guess. */
  var why={};
  rows.filter(function(l){ return l.islead===false||l.status==='passed'; }).forEach(function(l){
    var a=(typeof reasonAny==='function')?reasonAny(l.notes):null;
    var k=a?(a.r.l+(a.guessed?' *':'')):'no reason recorded';
    why[k]=(why[k]||0)+1;
  });
  var whyList=Object.keys(why).map(function(k){ return {k:k,n:why[k]}; }).sort(function(a,b){ return b.n-a.n; });
  var whyTotal=whyList.reduce(function(a,x){ return a+x.n; },0);
  /* ── HOW MUCH OF THIS NEVER NEEDED TO REACH HIM ─────────────────────────────
     The card already lists WHY leads die. What it never said is that a big slice of
     them are not judgement calls at all: gated, out of stock, or stock he already
     holds. Measured on his live board, 22 of 82 rejects — better than a quarter —
     and at ~101 seconds a lead that is real time spent saying no to things a VA
     could have filtered. The reason kind is already computed ('world' = nothing to
     do with the numbers), so this is a count, not a new judgement. */
  var preventable=0;
  try{
    /* same set the card counts above: islead===false or status 'passed' */
    rows.filter(function(l){ return l.islead===false||l.status==='passed'; }).forEach(function(l){
      var a=(typeof reasonAny==='function')?reasonAny(l.notes):null;
      if(a && a.r && a.r.k==='world') preventable++;
    });
  }catch(e){}
  var preventLine=(whyTotal>0 && preventable>0)
    ? '<div class="ldd-prevent"><b>'+preventable+' of '+whyTotal+'</b> ('+ldDashPct(preventable,whyTotal)+'%) '
      +'were gated, out of stock, or stock you already hold \u2014 not judgement calls. '
      +'Your VAs could catch most of these before they reach you.</div>'
    : '';
  var whyCard=whyList.length
    ? '<div class="ldd-card"><div class="ldd-h">Why leads die</div>'
      +'<div class="ldd-sub">Across '+whyTotal.toLocaleString()+' rejected leads. Anything big here is worth telling both VAs. '
        +'<b>*</b> = read from the words you wrote, not a reason you pressed.</div>'
      +preventLine
      +'<div class="ldd-tbl">'+whyList.slice(0,8).map(function(x){
          return '<div class="ldd-tr"><span class="ldd-name">'+escHtml(x.k)+'</span>'
            +'<span class="ldd-n">'+x.n+'</span><span></span>'
            +'<span class="ldd-rate">'+ldDashPct(x.n,whyTotal)+'%'
            +ldDashBar(ldDashPct(x.n,whyTotal),'#f2647f')+'</span><span></span></div>';
        }).join('')+'</div></div>'
    : '';

  host.innerHTML=ldDashPeriodBar(rows.length)
    +'<div class="ldd-grid">'+funnel+supCard+bySource+byStore+byVA+whyCard+'</div>';
}
function leadsSnapshotHTML(){
  try{
    // leads arrive from their own fetch — until it lands, show the loading state rather
    // than four confident-looking zeros (Jack: "it still has 0 when i opened it")
    if(!leads || !leads.length){
      var skc='<div style="background:var(--panel,#12141d);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:15px 16px;">'
        +'<div class="sk" style="width:45%;height:10px;margin-bottom:13px;"></div>'
        +'<div class="sk" style="width:55%;height:26px;margin-bottom:12px;"></div>'
        +'<div class="sk" style="width:100%;height:7px;"></div></div>';
      return '<div class="mgr-sec2 leads-eyes"><div><div class="s-ttl">Leads — needs your eyes</div>'
        +'<div class="s-sub" style="display:flex;align-items:center;gap:8px;"><span class="mgr-spin"></span>Loading your leads&hellip;</div></div></div>'
        +'<div class="kpi-row">'+skc+skc+skc+skc+'</div>';
    }
    /* LAST 30 DAYS ONLY (Jack, 31/08). All-time these tiles read 842 waiting and
       842 stale — a number that includes leads from months back he is never going
       to work, so it is a guilt counter, not a worklist. Windowed to 30 days it is
       437, which is a real week's work. Buy rate is windowed too, so it measures how
       he is buying NOW instead of an average dragged flat by July.
       The window uses the same day-diff maths as the list's own "Last 30 days"
       filter, and every click hands off to that filter — so the number on the tile
       and the number of rows he lands on are always the same figure. */
    var LD_WIN=30;
    var _t0=(function(){ var nw=new Date(); return new Date(nw.getFullYear(),nw.getMonth(),nw.getDate()); })();
    function inWin(l){
      var q=String(l.date||'').split('/'); if(q.length!==3) return false;
      var dd=Math.round((_t0-new Date(+q[2],+q[1]-1,+q[0]))/86400000);
      return dd>=0 && dd<LD_WIN;
    }
    var recent=leads.filter(inWin);
    var pendingAll=leads.filter(function(l){return l.islead===null&&!l.status;});
    var pending=pendingAll.filter(inWin);
    var older=pendingAll.length-pending.length;   // shown, never silently dropped
    var un=pending.length;
    var unseen=pending.filter(function(l){return !l.seen;}).length;
    /* "Going stale" was isStale() = 36h+. Inside a 30-day window that is now EVERY
       pending lead — the freshest in the queue is 58h old, because a lead is already
       a day or two old by the time the sheet sync brings it in — so the tile showed
       437 next to a Waiting tile also showing 437. Two tiles, one number, no
       information. The rotting slice is the week-plus one, carrying the profit that
       is sat in it: that is the figure that should make him open the list. */
    var STALE_D=7;
    var staleL=pending.filter(function(l){return l.hrs>=STALE_D*24;});
    var stale=staleL.length;
    var staleP=staleL.reduce(function(a,b){return a+(+b.profit||0);},0);
    var basket=recent.filter(function(l){return ['atbq','atba2a','waiting'].indexOf(l.status)>-1;}).length;
    var bought=recent.filter(function(l){return l.status==='bought';});
    var bp=bought.reduce(function(a,b){return a+(+b.profit||0);},0);
    var dec=recent.filter(function(l){return l.islead!==null;}).length;
    var br=dec?Math.round(bought.length/dec*100):0;
    /* the previous 30 days, so buy rate carries a direction instead of floating alone */
    function inPrev(l){
      var q=String(l.date||'').split('/'); if(q.length!==3) return false;
      var dd=Math.round((_t0-new Date(+q[2],+q[1]-1,+q[0]))/86400000);
      return dd>=LD_WIN && dd<LD_WIN*2;
    }
    var prev=leads.filter(inPrev);
    var pDec=prev.filter(function(l){return l.islead!==null;}).length;
    var pBr=pDec?Math.round(prev.filter(function(l){return l.status==='bought';}).length/pDec*100):null;
    var brDelta=(pBr===null)?null:(br-pBr);
    var newCard=mgr_kpi({icon:'inbox',label:'Waiting on you',value:un,tone:un>0?'purple':'off',
      badge:un>0?{t:'30 days',tone:'purple'}:{t:'All clear',tone:'green'},
      sub:un>0?('<b>'+unseen+'</b> never opened &#183; <b>'+(un-unseen)+'</b> opened'
        +(older>0?' &#183; <span style="opacity:.55">'+older+' older than 30d not counted</span>':'')):'nothing waiting',
      act:un>0?'Review '+un+' leads':null, onclick:"showLeadsWindow()"});
    var staleCard=mgr_kpi({icon:'clock',label:'Going stale',value:stale,tone:stale>0?'red':'off',
      badge:stale>0?{t:'7 days+',tone:'red'}:{t:'All clear',tone:'green'},
      sub:stale>0?('<b>£'+Math.round(staleP).toLocaleString()+'</b> of profit sat '+STALE_D+'+ days &#183; '+Math.round(stale/un*100)+'% of the queue'):'nothing over '+STALE_D+' days',
      act:stale>0?'Clear the backlog':null, onclick:"showLeadsWindow()"});
    var basketCard=mgr_kpi({icon:'cart',label:'ATB / waiting',value:basket,tone:basket>0?'amber':'off',
      badge:basket>0?{t:'Pending',tone:'amber'}:{t:'Empty',tone:'off'},
      sub:basket>0?'<b>£'+Math.round(bp).toLocaleString()+'</b> queued to buy':'nothing waiting to buy',
      onclick:"showLeadsWindow()"});
    var buyCard=mgr_kpi({icon:'target',label:'Buy rate',value:br,unit:'%',tone:'cyan',
      badge:brDelta===null?{t:'30 days',tone:'cyan'}:{t:(brDelta>0?'&#9650; ':brDelta<0?'&#9660; ':'')+(brDelta===0?'level':Math.abs(brDelta)+'pt'),tone:brDelta>=0?'green':'amber'},
      sub:'<b>'+bought.length+'</b> of <b>'+dec+'</b> decisions ended in a buy'
        +(pBr===null?'':' &#183; <span style="opacity:.55">prev 30d '+pBr+'%</span>')});
    return '<div class="mgr-sec2 leads-eyes"><div><div class="s-ttl">Leads — needs your eyes</div><div class="s-sub">'+(un>0?un+' lead'+(un===1?'':'s')+' waiting for review &#183; last 30 days':'nothing waiting — you\'re on top of it')+'</div></div>'
      +'<div class="s-right"><a class="s-act" onclick="showLeadsWindow()">Open leads →</a></div></div>'
      +'<div class="kpi-row">'+newCard+staleCard+basketCard+buyCard+'</div>';
  }catch(e){return '';}
}
/* every dashboard repaint — live tick, cloud sync, tab switch — restores what
   Jack had expanded (see mgr_restoreOpen above) */
(function(){
  function wrapOne(fn){
    var _f=window[fn];
    if(typeof _f!=='function'||_f._restoresOpen) return;
    var w=function(){
      var r=_f.apply(this,arguments);
      try{ mgr_restoreOpen(); }catch(e){}
      setTimeout(function(){ try{ mgr_restoreOpen(); }catch(e){} },300);   // async fills
      return r;
    };
    w._restoresOpen=true;
    window[fn]=w;
  }
  /* installSwitchTab (the Trends/Audit installer) REPLACES mgr_switchTab outright
     rather than wrapping it — its own comment says so — which silently killed the
     first version of this hook. Re-check on a slow heartbeat and re-wrap whatever
     is current, so the restore survives no matter who replaces what at startup. */
  function assert_(){
    if(typeof window.mgr_restoreOpen==='function'){
      wrapOne('mgr_renderOverview'); wrapOne('mgr_switchTab');
    }
    setTimeout(assert_,1500);
  }
  assert_();
})();
(function(){
  function hook(){
    if(typeof window.mgr_renderOverview!=='function')return setTimeout(hook,400);
    var _ro=window.mgr_renderOverview;
    window.mgr_renderOverview=function(){
      _ro.apply(this,arguments);
      try{
        var el=document.getElementById('mgr-overview-content');
        if(el&&!el.querySelector('#leads-snapshot')) el.insertAdjacentHTML('afterbegin', '<div id="leads-snapshot">'+leadsSnapshotHTML()+'</div>');
      }catch(e){}
    };
    // repaint just the leads strip when the leads fetch lands, so the loading
    // state swaps to real numbers instead of sitting there
    window.refreshLeadsSnapshot=function(){
      try{ var h=document.getElementById('leads-snapshot'); if(h) h.innerHTML=leadsSnapshotHTML(); }catch(e){}
    };
  }
  hook();
})();
/* VA side: render the From Jack card on the shift screen */
function applyVaExperience(){
  var st=getAppSettings();
  var add=document.querySelector('.add-task-btn'); if(add) add.style.display=(st.vaCanAddTasks===0)?'none':'';
  var brk=document.getElementById('break-btn'); if(brk) brk.style.display=(st.vaShowBreak===0)?'none':'';
  var streak=document.querySelector('.stat-card[data-kpi="streak"]'); if(streak) streak.style.display=(st.vaShowStreak===0)?'none':'';
  var mom=document.getElementById('shift-momentum'); if(mom) mom.style.display=(st.vaShowMomentum===0)?'none':'';
}
function renderFromJack(va){
  var host=document.getElementById('from-jack');if(!host)return;
  var b=jb_get(va);
  var o=jb_open(va);
  var wk=(jb_getWeek(va).note||'').trim();
  var items=(o.items||[]).filter(function(it){return !it.done;});
  var tasks=(o.tasks||[]).filter(function(t){return !t.done;});
  var hasPoa=b.poa&&b.poa.trim(), hasTasks=tasks.length>0, hasItems=items.length>0;
  if(!hasPoa&&!hasTasks&&!wk&&!hasItems){host.innerHTML='';return;}
  var wkHtml=wk?'<div style="font-size:12px;color:var(--cyan);font-weight:600;margin-bottom:'+((hasPoa||hasTasks||hasItems)?'8px':'0')+';">This week: '+wk.replace(/</g,'&lt;')+'</div>':'';
  var poaHtml=hasPoa?'<div class="fromjack-poa">'+String(b.poa).replace(/</g,'&lt;').replace(/(https?:\/\/[^\s]+)/g,'<a href="$1" target="_blank">$1</a>')+'</div>':'';
  var itemsHtml='';
  if(hasItems){
    // items are REAL tasks below (own row, Open button, Start/Stop timer that fills time, leads box)
    // — so up here we just summarise the counts instead of repeating them
    var counts={sf:0,kpf:0,eu:0,euasin:0,asin:0,msg:0}, carried=0;
    items.forEach(function(it){ counts[it.t]=(counts[it.t]||0)+1; if(jb_isCarried(it.addedOn)) carried++; });
    var bits=[];
    if(counts.sf)  bits.push('<b>'+counts.sf+'</b> storefront'+(counts.sf===1?'':'s')+' \u{1F3EC}');
    if(counts.kpf) bits.push('<b>'+counts.kpf+'</b> filter'+(counts.kpf===1?'':'s')+' \u{1F3AF}');
    if(counts.eu)  bits.push('<b>'+counts.eu+'</b> EU sheet'+(counts.eu===1?'':'s')+' \u{1F1EA}\u{1F1FA}');
    if(counts.euasin)bits.push('<b>'+counts.euasin+'</b> EU ASIN list'+(counts.euasin===1?'':'s')+' \u{1F1EA}\u{1F1FA}');
    if(counts.asin)bits.push('<b>'+counts.asin+'</b> ASIN'+(counts.asin===1?'':'s')+' #');
    if(counts.msg) bits.push('<b>'+counts.msg+'</b> message'+(counts.msg===1?'':'s')+' \u{1F4AC}');
    itemsHtml='<div class="fj-count-bar">\u{1F4E3} <b>'+items.length+'</b> from Jack — '+bits.join(' · ')+' <span class="fj-csub">(in your tasks below)</span>'
      +(carried?' <span class="jb-carry-badge">&#8635; '+carried+' carried</span>':'')+'</div>';
  }
  var taskNote=hasTasks?'<div class="fj-count-bar" style="margin-top:'+(hasItems?'7px':'0')+';">\u{1F4DD} <b>'+tasks.length+'</b> task'+(tasks.length===1?'':'s')+' from Jack <span class="fj-csub">(in your tasks below)</span></div>':'';
  // only items/tasks (no POA note, no week note) → slim bar, no big card wrapper
  if(!hasPoa && !wk){ host.innerHTML='<div class="fromjack-slim">'+itemsHtml+taskNote+'</div>'; return; }
  host.innerHTML='<div class="fromjack-card"><div class="fromjack-head"><b>From Jack</b><span class="fromjack-badge">Live</span></div>'+wkHtml+poaHtml+itemsHtml+taskNote+'</div>';
}
function jbItemToggle(i,on){ state._jbDone=state._jbDone||{}; if(on)state._jbDone[i]=1; else delete state._jbDone[i]; try{renderFromJack(state._previewAs||state.currentVA);}catch(e){} try{saveShiftDraft(false);}catch(e){} }
function sfTrackFromPoa(i,name){
  state.storefronts=state.storefronts||[];
  var nm=String(name||'Storefront from Jack').slice(0,80);
  if(!state.storefronts.some(function(s){return s.name===nm;})){ state.storefronts.push({id:'sf'+Date.now(),name:nm,seconds:0,running:false,startAt:null,leads:''}); }
  try{renderStorefronts();}catch(e){}
  try{saveShiftDraft(false);}catch(e){}
  var sec=document.getElementById('storefront-section'); if(sec) sec.scrollIntoView({behavior:'smooth',block:'center'});
  showToast('Added to your storefront tracker — hit Start when you begin ✓');
}
