/* ═══════════ LEAD INTELLIGENCE ═══════════
   The money + flow layer: where leads come from, which sources actually earn,
   how fast decisions get made, and — said plainly — what is NOT working.
   Everything here is computed from the live sheet; nothing is ever auto-binned. */
function liMoney(n){ n=Math.round(n||0); return (n<0?'-':'')+'£'+Math.abs(n).toLocaleString(); }
function liDate(l){
  var s=String(l.date||''); var m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return new Date(+m[1],+m[2]-1,+m[3]);
  var p=s.split('/'); if(p.length===3) return new Date(+p[2],+p[1]-1,+p[0]); return null;
}
function liIsBuy(l){ return l.status==='bought'||l.status==='atbq'||l.status==='atba2a'; }
/* ROI arrives as a fraction on some rows (0.1256) and a percentage on others (12.56) */
function liRoi(l){ var r=+l.roi||0; return r>0&&r<=3?r*100:r; }
function liQty(l){ try{ var m=(typeof ldMeta==='function')?ldMeta(l):null; if(m&&!m.na&&m.qty!=null) return Math.max(1,parseInt(m.qty)||1); }catch(e){} return 1; }
function mgr_leadIntelHTML(){
  var all=(window.leads||[]);
  if(!all.length) return '';
  var decided=all.filter(function(l){return l.islead!==null||l.status;});
  var marked =all.filter(function(l){return l.islead===true;});
  var buys   =all.filter(liIsBuy);
  var pending=all.filter(function(l){return l.islead===null&&!l.status;});

  // ── money on the buys ──
  var spend=0, profit=0, roiSum=0, roiN=0, units=0, best=null;
  buys.forEach(function(l){
    var q=liQty(l); units+=q;
    spend+=(+l.buy||0)*q; profit+=(+l.profit||0)*q;
    var rr=liRoi(l); if(rr){ roiSum+=rr; roiN++; }
    if(!best||((+l.profit||0)*q)>((+best.profit||0)*liQty(best))) best=l;
  });
  var avgRoi=roiN?Math.round(roiSum/roiN):0;
  var missed=pending.reduce(function(a,l){return a+(+l.profit||0);},0);

  // ── funnel ──
  function fstage(label,n,of,col,sub){
    var pct=of?Math.round(n/of*100):0;
    return '<div class="li-fstage"><div class="li-fbar"><i style="width:'+Math.max(2,pct)+'%;background:'+col+';"></i></div>'
      +'<div class="li-fmeta"><span class="li-flabel">'+label+'</span>'
      +'<span class="li-fval" style="color:'+col+'">'+n.toLocaleString()+'</span>'
      +'<span class="li-fpct">'+pct+'%</span></div>'
      +(sub?'<div class="li-fsub">'+sub+'</div>':'')+'</div>';
  }
  var funnel='<div class="li-funnel">'
    +fstage('Leads found',all.length,all.length,'#7c5cff',pending.length?'<b>'+pending.length+'</b> still waiting on you':'all reviewed ✓')
    +fstage('You reviewed',decided.length,all.length,'#4fc3f7',(all.length-decided.length)+' not looked at yet')
    +fstage('Worth a lead',marked.length,all.length,'#f5b544',decided.length?Math.round(marked.length/decided.length*100)+'% of what you reviewed':'')
    +fstage('You bought',buys.length,all.length,'#10d99a',units>buys.length?units+' units total':'')
    +'</div>';

  // ── source / retailer performance with MONEY, not just counts ──
  function perf(keyFn,label,minN){
    var g={};
    all.forEach(function(l){
      var k=(keyFn(l)||'').trim()||'—';
      var o=g[k]||(g[k]={k:k,n:0,d:0,b:0,profit:0,roi:0,roiN:0,units:0});
      o.n++;
      if(l.islead!==null||l.status) o.d++;
      if(liIsBuy(l)){ var q=liQty(l); o.b++; o.units+=q; o.profit+=(+l.profit||0)*q; var rr2=liRoi(l); if(rr2){o.roi+=rr2;o.roiN++;} }
    });
    var arr=Object.keys(g).map(function(k){return g[k];}).filter(function(o){return o.k!=='—'&&o.n>=(minN||1);});
    if(!arr.length) return {rows:'',winners:[],wasters:[]};
    arr.forEach(function(o){ o.rate=o.d?o.b/o.d:0; o.avgRoi=o.roiN?Math.round(o.roi/o.roiN):0; o.per=o.n?o.profit/o.n:0; });
    arr.sort(function(a,b){ return b.profit-a.profit || b.b-a.b || b.n-a.n; });
    var maxP=Math.max.apply(null,arr.map(function(x){return x.profit;}).concat([1]));
    var rows=arr.slice(0,10).map(function(o){
      var rp=Math.round(o.rate*100);
      var col=o.b===0?'#f5455f':rp>=25?'#10d99a':'#f5b544';
      return '<div class="li-prow">'
        +'<span class="li-pname" title="'+escHtml(o.k)+'">'+escHtml(o.k)+'</span>'
        +'<span class="li-pbar"><i style="width:'+Math.round(Math.max(0,o.profit)/maxP*100)+'%;background:'+col+';"></i></span>'
        +'<span class="li-pmoney" style="color:'+col+'">'+liMoney(o.profit)+'</span>'
        +'<span class="li-pmeta">'+o.n+' leads · <b style="color:'+col+'">'+o.b+'</b> bought · '+rp+'%'+(o.avgRoi?' · '+o.avgRoi+'% ROI':'')+'</span>'
        +'</div>';
    }).join('');
    return {rows:rows,
      winners:arr.filter(function(o){return o.b>0;}).slice(0,3),
      wasters:arr.filter(function(o){return o.d>=8&&o.b===0;}).sort(function(a,b){return b.n-a.n;}).slice(0,6)};
  }
  var bySrc=perf(function(l){return l.src;},'source',1);
  var byStore=perf(function(l){return l.store;},'retailer',1);

  // ── decision speed: how long leads wait on you ──
  var waits=[];
  all.forEach(function(l){
    if(!(l.islead!==null||l.status)) return;
    var d=liDate(l), dec=l.decided_at?new Date(l.decided_at):null;
    if(!d||!dec||isNaN(dec.getTime())) return;
    var hrs=(dec.getTime()-d.getTime())/3600000;
    if(hrs>=0&&hrs<24*60) waits.push(hrs);
  });
  waits.sort(function(a,b){return a-b;});
  var medWait=waits.length?waits[Math.floor(waits.length/2)]:0;
  var sameDay=waits.filter(function(h){return h<24;}).length;
  var now=Date.now();
  var oldest=0;
  pending.forEach(function(l){ var d=liDate(l); if(d){ var days=(now-d.getTime())/86400000; if(days>oldest) oldest=days; } });

  // ── 14-day flow: found vs bought ──
  var days=[], byDay={};
  for(var i=13;i>=0;i--){ var dd=new Date(now-i*86400000); var k=dd.getFullYear()+'-'+('0'+(dd.getMonth()+1)).slice(-2)+'-'+('0'+dd.getDate()).slice(-2);
    days.push({k:k,lab:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dd.getDay()][0]+' '+dd.getDate(),n:0,b:0}); byDay[k]=days[days.length-1]; }
  all.forEach(function(l){ var d=liDate(l); if(!d) return;
    var k=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
    var o=byDay[k]; if(!o) return; o.n++; if(liIsBuy(l)) o.b++; });
  var maxD=Math.max.apply(null,days.map(function(x){return x.n;}).concat([1]));
  var flow=days.map(function(x){
    var h=Math.round(x.n/maxD*100), bh=x.n?Math.round(x.b/x.n*100):0;
    return '<div class="li-fcol" title="'+x.lab+': '+x.n+' leads, '+x.b+' bought">'
      +'<div class="li-fstack"><i class="li-fall" style="height:'+Math.max(2,h)+'%"><b style="height:'+bh+'%"></b></i></div>'
      +'<span class="li-flab">'+x.lab.split(' ')[1]+'</span></div>';
  }).join('');

  // ── plain-English verdicts ──
  var verdicts='';
  if(bySrc.winners.length){
    var w=bySrc.winners[0];
    verdicts+='<div class="li-vd good"><b>'+escHtml(w.k)+'</b> is your best source — '+w.b+' buy'+(w.b===1?'':'s')+' from '+w.n+' leads ('+Math.round(w.rate*100)+'%), '+liMoney(w.profit)+' profit.</div>';
  }
  if(byStore.winners.length){
    var sw=byStore.winners[0];
    verdicts+='<div class="li-vd good"><b>'+escHtml(sw.k)+'</b> is your best retailer — '+liMoney(sw.profit)+' from '+sw.b+' buy'+(sw.b===1?'':'s')+'.</div>';
  }
  var allWaste=bySrc.wasters.concat(byStore.wasters).slice(0,5);
  if(allWaste.length){
    verdicts+='<div class="li-vd bad"><b>Not converting:</b> '+allWaste.map(function(o){return escHtml(o.k)+' ('+o.n+' leads, 0 buys)';}).join(' · ')
      +' — worth a conversation with your VAs. Nothing is binned automatically.</div>';
  }
  if(oldest>=3) verdicts+='<div class="li-vd warn">Your oldest undecided lead has been waiting <b>'+Math.floor(oldest)+' days</b>. '+pending.length+' in the queue'+(missed>0?' worth '+liMoney(missed)+' in potential profit':'')+'.</div>';
  if(waits.length>5) verdicts+='<div class="li-vd">You decide '+Math.round(sameDay/waits.length*100)+'% of leads within a day · typical turnaround <b>'+(medWait<24?Math.round(medWait)+'h':Math.round(medWait/24)+'d')+'</b>.</div>';

  return '<div class="mgr-sec2"><div><div class="s-ttl">Lead intelligence</div>'
      +'<div class="s-sub">Where your leads come from, which ones actually earn, and what isn\'t working — across all '+all.length.toLocaleString()+' leads.</div></div></div>'
    +'<div class="kpi-row" style="margin-bottom:12px;">'
      +mgr_kpi({icon:'cart',label:'Bought',value:buys.length,tone:'green',badge:{t:units+' units',tone:'green'},sub:'from <b>'+decided.length+'</b> reviewed'})
      +mgr_kpi({icon:'layers',label:'Profit on buys',value:liMoney(profit),tone:'cyan',badge:{t:avgRoi+'% ROI',tone:avgRoi>=30?'green':'amber'},sub:liMoney(spend)+' committed'})
      +mgr_kpi({icon:'inbox',label:'Waiting on you',value:pending.length,tone:pending.length?'amber':'green',badge:pending.length?{t:Math.floor(oldest)+'d oldest',tone:oldest>=3?'red':'amber'}:{t:'clear',tone:'green'},sub:missed>0?liMoney(missed)+' of potential profit sat in the queue':'nothing waiting'})
      +mgr_kpi({icon:'clock',label:'Your turnaround',value:(waits.length?(medWait<24?Math.round(medWait)+'h':Math.round(medWait/24)+'d'):'—'),tone:'purple',badge:{t:(waits.length?Math.round(sameDay/waits.length*100)+'% same day':'no data'),tone:'purple'},sub:'median time from lead logged to your decision'})
    +'</div>'
    +(verdicts?'<div class="li-verdicts">'+verdicts+'</div>':'')
    +'<div class="li-two">'
      +'<div class="li-card"><div class="li-h">Your funnel</div>'+funnel+'</div>'
      +'<div class="li-card"><div class="li-h">Last 14 days <span class="li-key"><i class="k-all"></i>found <i class="k-buy"></i>bought</span></div><div class="li-flow">'+flow+'</div></div>'
    +'</div>'
    +'<div class="li-two">'
      +'<div class="li-card"><div class="li-h">Sourcing methods — by profit</div>'+(bySrc.rows||'<div class="li-none">No source data on your leads yet.</div>')+'</div>'
      +'<div class="li-card"><div class="li-h">Retailers — by profit</div>'+(byStore.rows||'<div class="li-none">No retailer data yet.</div>')+'</div>'
    +'</div>';
}
/* ══════════ REPEAT BEHAVIOUR — "the same filter over and over" ══════════════
   Jack: "if a VA is doing the same filter over and over again — I wanna know —
   ESPECIALLY if they are getting results." Two verdicts, per VA, last 14 days:
     🔥 runs it repeatedly AND it keeps producing  → her instinct is right, feed it
     🕳 runs it repeatedly and it gives NOTHING     → habit, not judgement — redirect
   A repeat = 3+ separate days on the same filter inside the window. Everything is
   read from what the VAs already log (opens + leads per filter) — nothing new for
   them to do. */
function filterRepeatPanel(){
  var usage=(window._fuCloud&&window._fuCloud.length)?window._fuCloud:(typeof fuLocal==='function'?fuLocal():[]);
  if(!usage.length) return '';
  function dnum(ds){ var p=String(ds||'').split('/'); return p.length===3?new Date(+p[2],+p[1]-1,+p[0]).getTime():0; }
  var cut=Date.now()-14*86400000;
  var g={};
  usage.forEach(function(u){
    var t=dnum(u.date); if(!t||t<cut) return;
    var id=(u.filter_id||u.title); if(!id) return;
    var k=id+'|'+(u.va||'?');
    if(!g[k]) g[k]={title:u.title||'Filter', va:u.va||'?', days:{}, runs:0, leads:0, last:0};
    var o=g[k];
    o.runs+=(parseInt(u.opens)||1);
    o.leads+=(parseInt(u.leads)||0);
    o.days[u.date]=1;
    if(t>o.last){ o.last=t; if(u.title) o.title=u.title; }
  });
  var rows=Object.keys(g).map(function(k){ var o=g[k]; o.dayN=Object.keys(o.days).length; return o; })
    .filter(function(o){ return o.dayN>=3; });                     // the "over and over" bar
  if(!rows.length) return '';
  var hot=rows.filter(function(o){ return o.leads>=o.dayN; })      // producing at least ~1/day it runs
    .sort(function(a,b){ return b.leads-a.leads; }).slice(0,6);
  var cold=rows.filter(function(o){ return o.leads===0; })
    .sort(function(a,b){ return b.dayN-a.dayN; }).slice(0,6);
  function vaCol2(v){ return (v==='Mera'||v==='VA M')?'#c07bff':'#f2c200'; }
  function line(o,colr){
    return '<div class="fr-r"><span class="fr-va" style="color:'+vaCol2(o.va)+'">'+escHtml(vaDisp(o.va)||o.va)+'</span>'
      +'<span class="fr-t" title="'+escHtml(o.title)+'">'+escHtml(o.title)+'</span>'
      +'<b style="color:'+colr+'">'+o.dayN+' of 14 days</b>'
      +'<span class="fr-n">'+o.leads+' lead'+(o.leads===1?'':'s')+' · '+o.runs+' runs</span></div>';
  }
  var out='<div class="mgr-section">Repeat behaviour — last 14 days'
    +'<span style="margin-left:auto;font-size:10.5px;font-weight:600;color:var(--muted-2);">same filter on 3+ days</span></div>'
    +'<div class="fr-wrap">';
  out+='<div class="fr-col"><div class="fr-h hot">🔥 Repeating it AND it produces — feed these</div>'
    +(hot.length?hot.map(function(o){return line(o,'#10d99a');}).join('')
      :'<div class="fr-none">Nothing yet — needs a filter run on 3+ days that also produced leads.</div>')+'</div>';
  out+='<div class="fr-col"><div class="fr-h cold">🕳 Repeating it for NOTHING — worth a word</div>'
    +(cold.length?cold.map(function(o){return line(o,'#ff7a8f');}).join('')
      :'<div class="fr-none">Nobody is grinding a dead filter. Good.</div>')+'</div>';
  out+='</div>';
  return out;
}
/* Filter performance — shared by the Filters tab and the Insights tab.
   Exact: opens + leads the VA logged. Estimated: that VA-day's buys shared out in
   proportion to each filter's logged leads (leads carry no filter id, so it IS an
   estimate and is labelled as one). Nothing here ever bins or archives anything. */
function filterPerfPanel(where){
  var usage=(window._fuCloud&&window._fuCloud.length)?window._fuCloud:(typeof fuLocal==='function'?fuLocal():[]);
  if(!usage.length) return '<div class="mgr-section">Filter performance<span style="margin-left:auto;font-size:10.5px;font-weight:600;color:var(--muted-2);">nothing logged yet</span></div>'
    +'<div style="background:var(--panel);border:1px solid var(--line-2);border-radius:14px;padding:14px 18px;margin-bottom:8px;font-size:12.5px;color:var(--muted-2);line-height:1.6;">'
    +'This fills up as your VAs open filters from their shift panel and tap in how many leads each one gave them. Nothing is ever archived automatically — you\'ll just see the numbers here and decide yourself.</div>';
  var leadsArr=(window.leads||[]);
  function isBuy(l){ return l.status==='bought'||l.status==='atbq'||l.status==='atba2a'; }
  function ldDate(l){ var s=String(l.date||''); var m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return new Date(+m[1],+m[2]-1,+m[3]);
    var p=s.split('/'); if(p.length===3) return new Date(+p[2],+p[1]-1,+p[0]); return null; }
  var buysByDay={};
  leadsArr.forEach(function(l){ if(!isBuy(l)) return; var d=ldDate(l); if(!d) return;
    var k=(l.va||'')+'|'+('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear();
    buysByDay[k]=(buysByDay[k]||0)+1; });
  var dayLeads={};
  usage.forEach(function(u){ var k=(u.va||'')+'|'+u.date; dayLeads[k]=(dayLeads[k]||0)+(parseInt(u.leads)||0); });
  var g={};
  usage.forEach(function(u){
    var id=u.filter_id||u.title; if(!id) return;
    if(!g[id]) g[id]={title:u.title||'Filter',tag:u.tag||'',uses:0,leads:0,est:0,last:''};
    var o=g[id];
    o.uses+=(parseInt(u.opens)||1);
    var lds=parseInt(u.leads)||0; o.leads+=lds;
    var k=(u.va||'')+'|'+u.date, tot=dayLeads[k]||0;
    if(tot>0&&buysByDay[k]) o.est+=(buysByDay[k]*lds/tot);
    if(u.date>o.last) o.last=u.date;
    if(u.title) o.title=u.title;
  });
  var arr=Object.keys(g).map(function(k){return g[k];});
  arr.sort(function(a,b){ return b.leads-a.leads || b.uses-a.uses; });
  var top=arr.slice(0,12);
  var maxL=Math.max.apply(null,top.map(function(x){return x.leads;}).concat([1]));
  var rows=top.map(function(x){
    var per=x.uses?(x.leads/x.uses).toFixed(1):'0.0';
    var col=x.leads===0?'#f5455f':(x.leads/x.uses)>=1?'#10d99a':'#f5a524';
    var est=x.est>=0.5?'~'+Math.round(x.est)+' buy'+(Math.round(x.est)===1?'':'s'):'no buys yet';
    return '<div style="display:grid;grid-template-columns:170px 1fr 168px;gap:12px;align-items:center;padding:8px 0;border-top:1px solid var(--line);">'
      +'<span style="font-size:12.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="'+escHtml(x.title)+'">'+escHtml(x.title)+'</span>'
      +'<div style="height:9px;border-radius:5px;background:rgba(255,255,255,.07);overflow:hidden;"><i style="display:block;height:100%;width:'+Math.round(x.leads/maxL*100)+'%;border-radius:5px;background:'+col+';"></i></div>'
      +'<span style="font-family:var(--font-mono);font-size:11.5px;text-align:right;white-space:nowrap;"><b style="color:'+col+';">'+x.leads+'</b> <span style="color:var(--muted-2);">leads · '+x.uses+' opens · '+per+'/open · '+est+'</span></span>'
      +'</div>';
  }).join('');
  var cold=arr.filter(function(x){return x.uses>=3&&x.leads===0;}).length;
  return '<div class="mgr-section">Filter performance<span style="margin-left:auto;font-size:10.5px;font-weight:600;color:var(--muted-2);">top '+top.length+' of '+arr.length+' used</span></div>'
    +'<div style="background:var(--panel);border:1px solid var(--line-2);border-radius:14px;padding:6px 18px 14px;margin-bottom:8px;">'
    +'<div style="display:grid;grid-template-columns:170px 1fr 168px;gap:12px;font-size:9px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--muted-2);padding:8px 0 2px;"><span>Filter</span><span>Leads produced</span><span style="text-align:right;">Leads · opens · ~buys</span></div>'
    +rows
    +'<div style="margin-top:11px;font-size:11px;color:var(--muted-2);line-height:1.6;">Leads &amp; opens are exact (logged by the VA on shift). <b>~buys</b> is an estimate — a day\'s buys shared out across the filters that produced that day\'s leads.'
    +(cold?' <span style="color:var(--amber,#f2c200);font-weight:700;">'+cold+' filter'+(cold===1?' has':'s have')+' been opened 3+ times with no leads</span> — your call whether to archive any'+(where==='filters'?' (the ⊘ button on each row above)':' (Filters tab)')+'. Nothing is ever binned automatically.':'')
    +'</div></div>';
}
