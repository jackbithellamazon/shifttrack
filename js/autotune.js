// ── One analysis engine feeding both the Auto-tune explainer and the Insights page ──
function computeBuyAnalysis(){
  var leadsAll=window.leads||[];
  var isBuy=function(l){return l.status==='bought'||l.status==='atbq'||l.status==='atba2a';};
  var decided=leadsAll.filter(function(l){return l.islead!==null;});
  var bought=decided.filter(isBuy);
  var passed=decided.filter(function(l){return !isBuy(l);});
  function mean(arr,f){ return arr.length?arr.reduce(function(a,l){return a+(+f(l)||0);},0)/arr.length:0; }
  var demand=function(l){return l.fba>0?l.spm/l.fba:l.spm;};
  var factors=[
    {k:'roi',   name:'ROI',    f:function(l){return l.roi;},    fmt:function(v){return v.toFixed(0)+'%';}},
    {k:'profit',name:'Profit', f:function(l){return l.profit;}, fmt:function(v){return '£'+v.toFixed(0);}},
    {k:'margin',name:'Margin', f:function(l){return l.margin;}, fmt:function(v){return v.toFixed(0)+'%';}},
    {k:'demand',name:'Demand', f:demand,                        fmt:function(v){return v.toFixed(1)+' spm/seller';}}
  ];
  var cmp=factors.map(function(fc){ var b=mean(bought,fc.f), p=mean(passed,fc.f)||0.0001;
    return {name:fc.name, bought:b, passed:p, lift:b/p, gapPct:Math.round((b/p-1)*100)}; });
  var topDisc=cmp.slice().sort(function(a,b){return Math.abs(b.gapPct)-Math.abs(a.gapPct);})[0];
  // group buy-rate by a field
  function byField(f){ var g={}; decided.forEach(function(l){ var k=(f(l)||'—').toString().trim()||'—'; (g[k]=g[k]||{n:0,b:0}); g[k].n++; if(isBuy(l))g[k].b++; });
    return Object.keys(g).map(function(k){return {k:k,n:g[k].n,b:g[k].b,rate:Math.round(g[k].b/g[k].n*100)};}).filter(function(x){return x.n>=2;}).sort(function(a,b){return b.rate-a.rate;}); }
  // units + spend from Jack's qty meta
  var units=0, spend=0;
  bought.forEach(function(l){ var m=ldMeta(l); var q=m.na?0:(parseInt(m.qty)||0); units+=q; spend+=q*(+l.buy||0); });
  return { decided:decided, bought:bought, passed:passed,
    buyRate:decided.length?Math.round(bought.length/decided.length*100):0,
    cmp:cmp, topDisc:topDisc, bySource:byField(function(l){return l.src;}), byStore:byField(function(l){return l.store;}),
    byCat:byField(function(l){return l.cat;}), units:units, spend:spend,
    avgBoughtScore:bought.length?(bought.reduce(function(a,l){return a+(l._sc?l._sc.total:0);},0)/bought.length):0 };
}
// live slider: update the coloured fill + value chip while dragging
function swSlide(el){
  var v=parseFloat(el.value); el.style.setProperty('--fill',(v/2*100)+'%');
  var out=document.getElementById('out-'+el.id.replace('setting-',''));
  if(out){ out.textContent=v.toFixed(1)+'×'; out.className='sw-val'+(v>1?' up':v<1?' down':''); }
}
function renderJackInsights(){
  var host=document.getElementById('jack-insights'); if(!host) return;
  var A=computeBuyAnalysis();
  if(A.decided.length<3){ host.innerHTML='<div style="font-size:12px;color:var(--muted-2);padding:8px 0;">Decide a few more leads (Bought / Not) and your buying insights build here automatically.</div>'; return; }
  function stat(v,l,k){ return '<div class="ji-stat" style="--k:'+(k||'#8b5cff')+'"><div class="ji-v">'+v+'</div><div class="ji-l">'+l+'</div></div>'; }
  var top=A.bought.length?'£'+A.spend.toLocaleString():'£0';
  var kpis='<div class="ji-stats">'
    +stat(A.decided.length,'decided','#8b5cff')
    +stat(A.bought.length,'bought','#10d99a')
    +stat(A.buyRate+'%','buy rate','#18c8f0')
    +stat(A.units||'—','units bought','#f5a524')
    +stat(top,'est. spend','#10d99a')
    +stat(A.avgBoughtScore?A.avgBoughtScore.toFixed(1):'—','avg buy score','#8b5cff')
    +'</div>';
  function rank(title,arr,icon){ if(!arr.length) return '';
    return '<div class="ji-rank"><div class="ji-rank-t">'+icon+' '+title+'</div>'
      +arr.slice(0,5).map(function(x){ var tone=x.rate>=50?'#10d99a':x.rate>=25?'#f5a524':'#f5455f';
        return '<div class="ji-rank-row"><span class="ji-rank-n">'+String(x.k).replace(/</g,'&lt;').slice(0,26)+'</span>'
          +'<span class="ji-rank-bar"><i style="width:'+x.rate+'%;background:'+tone+'"></i></span>'
          +'<span class="ji-rank-v" style="color:'+tone+'">'+x.rate+'% <small>('+x.b+'/'+x.n+')</small></span></div>'; }).join('')
      +'</div>'; }
  host.innerHTML=kpis
    +'<div class="ji-note">💡 <b>What your buys look like:</b> '+(A.topDisc?('driven most by <b>'+A.topDisc.name+'</b> — '+(A.topDisc.gapPct>=0?'+':'')+A.topDisc.gapPct+'% vs the ones you pass. '):'')
      +'Bought leads average ROI <b>'+A.cmp[0].bought.toFixed(0)+'%</b>, profit <b>£'+A.cmp[1].bought.toFixed(0)+'</b>, margin <b>'+A.cmp[2].bought.toFixed(0)+'%</b>.</div>'
    +rank('Best sources (by buy-rate)',A.bySource,'🔎')
    +rank('Best stores',A.byStore,'🏬')
    +rank('Best categories',A.byCat,'🗂️');
}
/* ── HOW THE MATRIX IS DOING ────────────────────────────────────────────────
   The old panel taught four WEIGHT SLIDERS and offered auto-tune. Those are dead:
   calcScore is now a lookup matrix and reads no weights at all, so anything that
   nudged sliders was moving a control wired to nothing. What still matters — and
   matters more — is whether each CELL of the matrix matches what Jack actually
   buys. Show the grid, mark where his buys landed, and let the cells that
   disagree with him speak for themselves. */
/* Reject reasons: the Quick Reject buttons write "Rejected: <reason>" into the note,
   and Jack also types free-text ones. Split them into what the matrix can act on and
   what it can never see — passing a 10/10 for a poor listing is not a scoring fault. */
var TEACH_ACTIONABLE={'Low ROI':1,'Low Profit':1,'High Competition':1,'Low Demand':1};
function teachReason(l){
  var m=String(l.notes||'').match(/Rejected:\s*([^·\n]+)/i);
  return m?m[1].trim():'';
}
function teachHighPassHTML(decided){
  var isBuy=function(l){ return l.status==='bought'||l.status==='atbq'||l.status==='atba2a'; };
  var highPass=decided.filter(function(l){
    return !isBuy(l) && l._sc && l._sc.total>=8;
  });
  if(!highPass.length){
    return '<div class="tm-rz none">No high scores passed yet &mdash; nothing to explain.</div>';
  }
  var groups={}, none=0;
  highPass.forEach(function(l){
    var r=teachReason(l);
    if(!r){ none++; return; }
    (groups[r]=groups[r]||[]).push(l);
  });
  var keys=Object.keys(groups).sort(function(a,b){ return groups[b].length-groups[a].length; });
  var act=keys.filter(function(k){ return TEACH_ACTIONABLE[k]; });
  var cant=keys.filter(function(k){ return !TEACH_ACTIONABLE[k]; });
  function line(k,cls){
    var g=groups[k];
    return '<div class="tm-rz-l '+cls+'"><b>'+g.length+'</b><span>'+escHtml(k)+'</span>'
      +'<i>'+g.slice(0,2).map(function(l){ return escHtml(String(l.title||'').slice(0,30)); }).join(' · ')+'</i></div>';
  }
  return '<div class="tm-rz">'
    +'<div class="tm-rz-h">Why you passed on '+highPass.length+' lead'+(highPass.length===1?'':'s')+' scoring 8+</div>'
    +(act.length
      ? '<div class="tm-rz-g"><b class="tm-rz-t warn">The matrix could act on these</b>'
        +act.map(function(k){ return line(k,'warn'); }).join('')
        +'<div class="tm-rz-n">These are things the score already measures, so a cell is probably rated too high. Worth changing the matrix.</div></div>'
      : '')
    +(cant.length
      ? '<div class="tm-rz-g"><b class="tm-rz-t">The score can never see these</b>'
        +cant.map(function(k){ return line(k,''); }).join('')
        +'<div class="tm-rz-n">Listing quality, gating, brand, your cash position &mdash; nothing to fix in the matrix. These passes are not a scoring failure.</div></div>'
      : '')
    +(none
      ? '<div class="tm-rz-g"><b class="tm-rz-t">'+none+' with no reason given</b>'
        +'<div class="tm-rz-n">Use the Quick Reject buttons, or start your note with &ldquo;Rejected: &hellip;&rdquo; &mdash; then they land in one of the groups above instead of being invisible here.</div></div>'
      : '')
    +'</div>';
}
/* ── WHAT YOUR NOTES SAY ────────────────────────────────────────────────────
   Jack: "is it reviewing all the notes too? it should be to help improve the
   scoring system". It wasn't — smartFeatVec() is seven numbers (ROI, profit,
   margin, velocity, two interactions, FBA count) and the note text never entered
   training at all. Rather than pretend to read them, this counts the words HE
   actually types and shows which ones sit on passes vs buys. A word that keeps
   appearing on PASSED high scorers is a blind spot: the matrix cannot see it,
   so no amount of tuning will fix it — it needs a rule or a VA instruction. */
var NOTE_STOP=('the a an and or of to in on for with is it its this that at by from as be are was'
  +' but not no you your i we they he she him her them if then than so too very just only also'
  +' out up down off over under more most less least good bad ok okay yes').split(' ');
function noteTerms(txt){
  return String(txt||'').toLowerCase()
    .replace(/rejected:\s*/g,' ')
    .replace(/[^a-z0-9£%\s-]/g,' ')
    .split(/\s+/)
    .filter(function(w){ return w.length>2 && NOTE_STOP.indexOf(w)<0 && !/^\d+$/.test(w); });
}
function reasonMine(){
  var rows=(typeof trainingRows==='function')?trainingRows().map(function(l){
      return {id:l._sid, decision:l.status||(l.islead===true?'lead':l.islead===false?'passed':null),
        is_buy:(l.status==='bought'||l.status==='atbq'||l.status==='atba2a'),
        note:l.notes, qty:l._decQty, store:l.store, roi:l.roi, profit:l.profit};
    }).filter(function(r){ return r.decision; })
    : (window._decisionCache||[]).filter(function(r){ return r.decision; });
  var by={}, tagged=0, guessed=0;
  rows.forEach(function(r){
    var a=reasonAny(r.note), w=a&&a.r; if(!w) return;
    tagged++; if(a.guessed) guessed++;
    var t=by[w.c]||(by[w.c]={c:w.c,l:w.l,k:w.k,n:0,hi:0,buys:0,units:0});
    t.n++;
    if(r.is_buy){ t.buys++; t.units+=(parseInt(r.qty)||0); }
    if((+r.score||0)>=8 || (+r.roi>=20&&+r.profit>=8)) t.hi++;   // was it a strong-looking lead?
  });
  var list=Object.keys(by).map(function(k){ return by[k]; }).sort(function(a,b){ return b.n-a.n; });
  return {rows:rows.length, tagged:tagged, guessed:guessed, list:list,
    score:list.filter(function(t){return t.k==='score';}),
    data:list.filter(function(t){return t.k==='data';}),
    world:list.filter(function(t){return t.k==='world';})};
}
function reasonMineHTML(){
  var m=reasonMine();
  var untagged=m.rows-m.tagged;
  if(!m.tagged) return '<div class="nm-wrap"><div class="nm-h">Why you decided</div>'
    +'<div class="nm-empty">No reasons recorded yet. After you mark a lead there are one-tap '
    +'reasons on the confirmation — that is what tells you whether a pass was the score’s fault, '
    +'bad lead data, or nothing to do with either.</div></div>';
  function block(title,arr,cls,blurb){
    if(!arr.length) return '';
    var tot=arr.reduce(function(a,t){return a+t.n;},0);
    return '<div class="rm-b '+cls+'"><div class="rm-bt">'+title+' <span>'+tot+'</span></div>'
      +'<div class="rm-blurb">'+blurb+'</div>'
      + arr.map(function(t){
          return '<div class="rm-r"><span class="rm-l">'+escHtml(t.l)+'</span>'
            +'<span class="rm-n">'+t.n+'</span>'
            +'<span class="rm-x">'+(t.buys?t.buys+' bought'+(t.units?' · '+t.units+' units':''):(t.hi?t.hi+' on strong-looking leads':''))+'</span></div>';
        }).join('')
      +'</div>';
  }
  return '<div class="nm-wrap">'
    +'<div class="nm-h">Why you decided <span>'+m.tagged+' of '+m.rows+' decisions have a reason'
      +(m.guessed?' &middot; '+m.guessed+' read from notes you already wrote':'')+'</span></div>'
    + block('The score could catch these', m.score, 'k-score',
        'The numbers already measure this, so a cell in your matrix is probably wrong. Worth changing.')
    + block('The lead information was wrong', m.data, 'k-data',
        'Nothing wrong with the score — the data it was given was off. This is a VA or sourcing fix.')
    + block('Nothing to do with the score', m.world, 'k-world',
        'Stock, gating, shipping, cash. No scoring change will ever catch these, so a 10/10 you passed for one of these is NOT a scoring failure.')
    +(untagged?'<div class="nm-note">'+untagged+' decision'+(untagged===1?'':'s')+' without a reason — those can’t be explained.</div>':'')
    +'</div>';
}
/* How much the learning score should be trusted — stated plainly, including what was
   deliberately left OUT of training. A decision only teaches the model something if it
   was ABOUT the numbers: passing a 10/10 because it was out of stock is not evidence
   the 10/10 profile is bad, and with ~37 decisions one poisoned row matters. */
function smartHealthHTML(){
  var m=(typeof getSmartModel==='function')?getSmartModel():null;
  var on=false; try{ on=getAppSettings().scoreMode==='smart'; }catch(e){}
  if(!on) return '<div class="sm-health off">Smart scoring is <b>off</b> — every score comes straight from your matrix.</div>';
  if(!m||m.acc==null) return '<div class="sm-health off">Smart scoring is on but hasn’t trained yet — it needs at least 6 buys and 6 passes.</div>';
  var base=m.baseline!=null?m.baseline:50, beats=(m.acc-base);
  var weak=(beats<5), thin=m.n<70;
  var ex=(m.skippedWorld||0)+(m.skippedData||0);
  return '<div class="sm-health'+(weak?' weak':'')+'">'
    +(weak
      ? '<b>Smart scoring is currently no better than guessing</b> ('+m.acc+'% vs '+base+'% for a plain guess, on '+m.n+' decisions) — so right now it adds noise, not signal. '
        +'<button class="btn btn-ghost sm-manual" onclick="scoreGoManual()">Switch to Manual now</button>'
      : '<b>Smart scoring is on</b> — '+m.acc+'% right on decisions it had never seen ('+(beats>0?beats+' points better than guessing':'no better than guessing')+', '+m.n+' decisions).')
    +'<details class="sm-more"><summary>How that was measured</summary>'
    +'<span class="sm-ex">Measured properly: fitted on 4/5 of your decisions, graded on the 1/5 held back, five times over. '
      +'Always guessing the more common answer would score <b>'+base+'%</b>, so it is '
      +(beats>0?'<b>'+beats+' points better</b> than guessing':beats===0?'<b>no better</b> than guessing':'<b>'+Math.abs(beats)+' points WORSE</b> than guessing')+'. '
      +'It marked itself at '+m.fitAcc+'% on the rows it was fitted to &mdash; that figure is meaningless and is only here for contrast.</span>'
    +(m.setName?'<span class="sm-ex">It tried '+((m.tried&&m.tried.length)||1)+' combinations of factors and kept <b>'+escHtml(m.setName)+'</b>'
      +(m.tried&&m.tried.length>1?' ('+m.tried.map(function(t){ return escHtml(t.short||t.k)+' '+t.acc+'%'; }).join(' &middot; ')+', scored on balanced accuracy)':'')
      +', and set its yes/no cut-off at <b>'+m.thr+'</b> rather than assuming halfway.</span>':'')
    +(ex?'<span class="sm-ex">Left out '+ex+' of '+(m.seen||m.n)+' — '
       +(m.skippedWorld?m.skippedWorld+' decided for reasons the numbers can’t see (stock, gating, cash, bulk deals)':'')
       +(m.skippedWorld&&m.skippedData?', and ':'')
       +(m.skippedData?m.skippedData+' where the lead data itself was wrong':'')
       +'. Training on those would teach it the opposite of the truth.</span>':'')
    +((m.skippedContra||m.skippedDupe)?'<span class="sm-ex">Also set aside '
       +((m.skippedDupe||0)?(m.skippedDupe+' second cop'+(m.skippedDupe===1?'y':'ies')+' of an ASIN both VAs sent'):'')
       +((m.skippedDupe&&m.skippedContra)?', and ':'')
       +((m.skippedContra||0)?(m.skippedContra+' where the two copies of the same ASIN were decided opposite ways'):'')
       +'.</span>':'')
    +(thin&&!weak?'<span class="sm-warn">Still thin — '+(m.idx?m.idx.length:7)+' factors weighed against '+m.n+' decisions.</span>':'')
    +'</details>'
    +'</div>';
}
/* One click, not a treasure hunt through Settings. */
function scoreGoManual(){
  try{
    var st=getAppSettings(); st.scoreMode='manual'; saveAppSettings(st);
    showToast('Manual scoring on — every score now comes straight from your matrix');
    try{ leads.forEach(function(l){ l._sc=calcScore({roi:l.roi,profit:l.profit,spm:l.spm,fba:l.fba,margin:l.margin}); }); renderList(); }catch(e){}
    try{ renderScoreTeach(); }catch(e){}
    try{ var v=document.getElementById('score-verdict'); if(v) v.innerHTML=smartHealthHTML(); }catch(e){}
  }catch(e){ showToast('Could not switch — do it in Settings → Leads',true); }
}
function renderScoreTeach(){
  try{ var v=document.getElementById('score-verdict'); if(v) v.innerHTML=smartHealthHTML(); }catch(e){}
  try{ var nt=document.getElementById('note-thresholds'); if(nt) nt.innerHTML=noteThresholdHTML(); }catch(e){}
  var host=document.getElementById('score-teach'); if(!host) return;
  var decided=(window.leads||[]).filter(function(l){ return l.islead!==null||l.status; });
  window._teachDecided=decided;
  try{ host.dataset.extra='1'; }catch(e){}
  var isBuy=function(l){ return l.status==='bought'||l.status==='atbq'||l.status==='atba2a'; };
  if(decided.length<5){
    host.innerHTML='<div class="tm-wait">Decide a few more leads and this shows how the scoring matrix matches your buying.</div>';
    return;
  }
  var bands=SPM_BANDS.slice().reverse();          // low → high reads better as a grid
  var tiers=[['low','under £3'],['mid','£3–8.99'],['high','£9+']];
  function cell(bandName,tier){
    var inC=decided.filter(function(l){
      var spm=parseFloat(l.spm); if(isNaN(spm)) spm=parseSpm(l.spm);
      var p=parseFloat(l.profit)||0;
      if(!(spm>0)||!(p>0)) return false;
      return spmBand(spm).name===bandName && profitTier(p)===tier;
    });
    var b=inC.filter(isBuy).length;
    var base=(DEAL_MATRIX[bandName]||{})[tier];
    return { n:inC.length, buys:b, score:base?base[0]:0,
             rate: inC.length?Math.round(b/inC.length*100):null };
  }
  var rows=bands.map(function(band){
    return '<tr><th>'+escHtml(band.name)+'<span>'+escHtml(band.label)+'</span></th>'
      +tiers.map(function(t){
          var c=cell(band.name,t[0]);
          var cls = c.n===0 ? 'none'
                  : (c.rate>=50 && c.score>=7) ? 'agree'
                  : (c.rate>=50 && c.score<5)  ? 'under'      // you buy these, matrix rates them low
                  : (c.rate<20  && c.score>=8) ? 'over'       // matrix loves these, you don't
                  : 'ok';
          return '<td class="tm-c '+cls+'"><b>'+c.score+'</b>'
            +(c.n? '<span>'+c.buys+'/'+c.n+' bought</span>' : '<span class="dim">no data</span>')
            +'</td>';
        }).join('')
      +'</tr>';
  }).join('');

  // where the matrix and Jack disagree — the only actionable part
  var flags=[];
  bands.forEach(function(band){ tiers.forEach(function(t){
    var c=cell(band.name,t[0]);
    if(c.n<3) return;
    if(c.rate>=50 && c.score<5) flags.push('You buy <b>'+c.buys+' of '+c.n+'</b> at <b>'+band.name+' SPM / '+t[1]+'</b> — the matrix scores that '+c.score+'. Worth raising.');
    if(c.rate<=10 && c.score>=8) flags.push('The matrix scores <b>'+band.name+' SPM / '+t[1]+'</b> at '+c.score+', but you\'ve bought '+c.buys+' of '+c.n+'. Worth lowering.');
  });});

  host.innerHTML='<div class="tm-h">How the matrix matches your buying</div>'
    +'<div class="tm-s">Each cell is the score that combination gets, and how many you actually bought. '
      +'Green means the matrix and you agree.</div>'
    +'<div class="tm-wrap"><table class="tm"><thead><tr><th></th>'
      +tiers.map(function(t){ return '<th>'+t[1]+'</th>'; }).join('')+'</tr></thead>'
      +'<tbody>'+rows+'</tbody></table></div>'
    +(flags.length
        ? '<div class="tm-flags">'+flags.map(function(f){ return '<div>⚠ '+f+'</div>'; }).join('')+'</div>'
        : '<div class="tm-ok">Nothing disagrees yet — decide more leads and any mismatched cell will show up here.</div>')
    + smartHealthHTML()
    + teachHighPassHTML(decided)
    + reasonMineHTML();
}
function setScoreMode(m){ var st=getAppSettings(); st.scoreMode=m; saveAppSettings(st);
  if(m==='smart'&&!getSmartModel()){ var r=trainSmartModel(); if(r&&r.err){ showToast(r.err,true); } }
  try{ leads.forEach(function(l){ l._sc=calcScore({roi:l.roi,profit:l.profit,spm:l.spm,fba:l.fba,margin:l.margin,status:l.status,islead:l.islead}); }); }catch(e){}
  mgr_renderSettings(); try{renderList&&renderList();}catch(e){}
  showToast(m==='smart'?'Learning score ON — leads rescored by the model':'Manual weights ON');
}
function trainAndApply(){ var r=trainSmartModel(); if(r&&r.err){ showToast(r.err,true); return; }
  try{ leads.forEach(function(l){ l._sc=calcScore({roi:l.roi,profit:l.profit,spm:l.spm,fba:l.fba,margin:l.margin,status:l.status,islead:l.islead}); }); }catch(e){}
  mgr_renderSettings(); try{renderList&&renderList();}catch(e){}
  showToast('Model trained ✓ '+(r.acc||'')+'% accurate on your buys — leads rescored'); }
function resetWeights(){ var st=getAppSettings(); st.swRoi=1;st.swProfit=1;st.swDemand=1;st.swMargin=1; saveAppSettings(st);
  try{ leads.forEach(function(l){ l._sc=calcScore({roi:l.roi,profit:l.profit,spm:l.spm,fba:l.fba,margin:l.margin}); }); }catch(e){}
  mgr_renderSettings(); showToast('Weights reset to neutral (1.0×) — scores rebalanced'); }
function autoTuneWeights(){
  var decided=(window.leads||[]).filter(function(l){return l.islead!==null;});
  var bought=decided.filter(function(l){return l.status==='bought'||l.status==='atbq'||l.status==='atba2a';});
  var other=decided.filter(function(l){return !(l.status==='bought'||l.status==='atbq'||l.status==='atba2a');});
  if(bought.length<3||other.length<1){ showToast('Need a few more Bought and Not-a-lead decisions first', true); return; }
  function mean(arr,f){return arr.length?arr.reduce(function(a,l){return a+(f(l)||0);},0)/arr.length:0;}
  function ratio(l){return l.fba>0?l.spm/l.fba:l.spm;}
  var metrics=[['swRoi',function(l){return l.roi;}],['swProfit',function(l){return l.profit;}],['swDemand',ratio],['swMargin',function(l){return l.margin;}]];
  var st=getAppSettings();
  var lifts=metrics.map(function(m){
    var b=mean(bought,m[1]), o=mean(other,m[1])||0.0001;
    return {k:m[0], lift:b/o}; // >1 means bought leads score higher on this metric
  });
  var maxLift=Math.max.apply(null,lifts.map(function(x){return x.lift;}));
  lifts.forEach(function(x){
    // map lift into 0.5–2.0 weight, strongest discriminator ~2x
    var w=Math.max(0.5,Math.min(2, (x.lift/ (maxLift||1))*2 ));
    st[x.k]=Math.round(w*10)/10;
  });
  saveAppSettings(st);
  try{ leads.forEach(function(l){ l._sc=calcScore({roi:l.roi,profit:l.profit,spm:l.spm,fba:l.fba,margin:l.margin}); }); }catch(e){}
  var nm={swRoi:'ROI',swProfit:'Profit',swDemand:'Demand',swMargin:'Margin'};
  var top=lifts.slice().sort(function(a,b){return b.lift-a.lift;})[0];
  mgr_renderSettings();
  showToast('Tuned to your buys \u2713 \u2014 now leaning hardest on '+(nm[top.k]||'ROI')+' (what your buys have most in common). Scores rebalanced.');
}
async function renderTabPicker(){
  var host=document.getElementById('tabpicker'); if(!host) return;
  try{
    var res=await fetchT(SUPABASE_URL+'/rest/v1/sheet_tabs?select=*&order=sheet_id,tab',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
    if(!res.ok){ host.innerHTML='Run the Supabase SQL + install the sheet script first \u2014 tabs will appear here.'; return; }
    var rows=await res.json();
    if(!rows.length){ host.innerHTML='No tabs registered yet \u2014 they appear within a minute of the sheet script running.'; return; }
    var MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
    var nowM=new Date().getMonth();
    function tabMeta(name){
      var low=(name||'').toLowerCase(), mi=-1;
      for(var i=0;i<12;i++){ if(low.indexOf(MONTHS[i])>=0 || new RegExp('\\b'+MONTHS[i].slice(0,3)).test(low)){ mi=i; break; } }
      return {mi:mi, variant:(low.indexOf('a2a')>=0?2:(low.indexOf('pp')>=0?1:0)), isCur:mi===nowM};
    }
    var by={};
    rows.forEach(function(t){ var va=SHEET_NAMES[t.sheet_id]||t.sheet_id.slice(0,6); (by[va]=by[va]||[]).push(t); });
    host.innerHTML=Object.keys(by).map(function(va){
      var list=by[va].slice().sort(function(a,b){
        var ma=tabMeta(a.tab), mb=tabMeta(b.tab);
        if(ma.mi!==mb.mi) return mb.mi-ma.mi;      // newest month first; unknown (-1) sinks to bottom
        if(ma.variant!==mb.variant) return ma.variant-mb.variant; // base month before PP / A2A
        return a.tab.localeCompare(b.tab);
      });
      var onCt=list.filter(function(t){return t.included;}).length;
      var col=(va==='Mera'?'var(--mera)':(va==='Suz'?'var(--suz)':'var(--muted)'));
      return '<div class="tabpick-va"><div class="tabpick-head"><span class="nm" style="color:'+col+';">'+va+'</span><span class="ct">'+onCt+' of '+list.length+' on</span></div>'
        +list.map(function(t){
          var m=tabMeta(t.tab);
          return '<label class="tabpick-chip'+(m.isCur?' cur':'')+(t.included?'':' off-tab')+'">'
            +'<input type="checkbox" '+(t.included?'checked':'')+' onchange="toggleTab(\''+t.sheet_id+'\',\''+encodeURIComponent(t.tab)+'\',this.checked)">'
            +escHtml(t.tab)+(m.isCur?'<span class="curpill">now</span>':'')+'</label>';
        }).join('')+'</div>';
    }).join('');
  }catch(e){ host.innerHTML='Could not reach Supabase.'; }
  try{ settingsMasonry(); }catch(e){}
}
function toggleTab(sheetId,tabEnc,on){
  var tab=decodeURIComponent(tabEnc);
  fetch(SUPABASE_URL+'/rest/v1/sheet_tabs?sheet_id=eq.'+encodeURIComponent(sheetId)+'&tab=eq.'+encodeURIComponent(tab),
    {method:'PATCH',headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
     body:JSON.stringify({included:on,updated_at:new Date().toISOString()})})
    .then(function(){ showToast(on?'Tab included \u2713':'Tab excluded \u2713'); })
    .catch(function(){ showToast('Could not save \u2014 check connection', true); });
}
function mgr_resetSettings(){
  if(!confirm('Reset settings to the default rota and targets?')) return;
  lsDrop(APP_SETTINGS_KEY);
  renderNewsletterSchedulePanels();
  mgr_renderSettings();
  showToast('Settings reset');
}

function mgr_renderTest(){
  var log=mgr_getLog();
  var recs=log.filter(function(r){return r.va==='Test';});
  var vc={Test:'#10d99a'};
  var html='<div style="font-size:12px;color:#555;margin-bottom:16px;">All shifts logged under the Test VA — for Jack\'s testing only.</div>';
  if(!recs.length){
    html+='<div style="color:var(--muted-2);font-size:13px;padding:20px 0;">No test shifts yet. Log in as Test and submit an EOD to see it here.</div>';
  } else {
    html+=mgr_section('Test Shifts ('+recs.length+')');
    html+=mgr_shiftGroup(recs,'Test');
    var realNotes=recs.filter(function(r){return mgr_isRealNote(r.notes);});
    if(realNotes.length){
      html+=mgr_section('💬 Notes');
      html+=mgr_collapsibleNotes(recs,vc);
    }
  }
  html+='<div style="margin-top:24px;border-top:1px solid rgba(255,255,255,0.05);padding-top:16px;">'
    +'<button onclick="if(confirm(\'Delete all Test shifts?\')){var l=mgr_getLog().filter(function(r){return r.va!==\'Test\';});lsPut(\'shifttrack_eod_log\',JSON.stringify(l));mgr_renderTest();showToast(\'Test shifts cleared\');}" '
    +'style="background:rgba(242,100,127,0.08);border:1px solid rgba(242,100,127,0.2);color:#f2647f;font-family:var(--font-mono);font-size:11px;padding:8px 16px;border-radius:8px;cursor:pointer;">🗑 Clear all test shifts</button>'
    +'</div>';
  document.getElementById('mgr-test-content').innerHTML=html;
}

function renderManagerLog(){mgr_renderAll();}

/* FAKE SHIFT DATA — REMOVED (v187).
   Jack, twice: "wtf where has all this come from - no fake data at all" and "i never
   added these wtf - make sure all fake data is removed". The injector held 19KB of
   invented 16-20/03/2026 shifts, and a live "Re-inject demo data" button called it
   straight after lsDrop('shifttrack_eod_log') — one misclick wiped
   the real log and replaced it with fiction. The on-load cleanup that strips those
   March rows stays, for any browser still carrying them. */

var mgr_weekOffset=0;
