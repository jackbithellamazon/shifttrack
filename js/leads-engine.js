/* ══════════ LEADS ENGINE (merged from LeadDesk — demo data, backend TBD) ══════════ */
const ICO={
  ext:'<svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>',
  copy:'<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
  check:'<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>',
  inbox:'<svg viewBox="0 0 24 24"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg>',
  msg:'<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>'
};
const STORE_LBL={'Argos':'#f5455f','Amazon.UK':'#f5a524','Amazon.FR':'#f5a524','Currys':'#18c8f0','John Lewis':'#4a86ff','scan':'#b23bff'};
function storeCol(s){return STORE_LBL[s]||'#847a94'}
const RAW=[]; // demo data removed — real leads arrive via the Sheets wiring
/* ══════════ SMART SCORE — a model that LEARNS from Jack's actual buys ══════════
   Flat weights can't say "a fast seller justifies a lower ROI". This does, via
   interaction features (ROI×Velocity, Profit×Velocity): logistic regression trained
   on bought(1) vs passed(0), so each lead is judged in its OWN context. ── */
var SMART_FEATS=['ROI','Profit','Margin','Velocity','ROI×Velocity','Profit×Velocity','Competition'];
function featVecFull(l){
  var spm=parseFloat(l.spm)||0, fba=+l.fba||0;
  var d=fba>0?spm/fba:spm;                   // velocity = sales/mo per competing seller
  // Unit cost was never a factor, yet measured on live data (12/08/2026) it is one of the
  // clearest splits there is: £40+ leads bought 61% of the time, £10–20 leads 38%.
  var bp=+l.buy||0;
  return [ +l.roi||0, +l.profit||0, +l.margin||0, d, (+l.roi||0)*d/100, (+l.profit||0)*d/100, fba,
           bp, Math.log(1+Math.max(0,bp)) ];
}
/* ── CATEGORY / SOURCE / VA ─────────────────────────────────────────────────
   These are words, not numbers, so they could never enter the model — but on live
   data they separate harder than some factors that were already in it:
     Home & Kitchen 75% bought vs PC & Video Games 20%
     JKPF 64% vs Keepa Tracker 33% vs EU Sheet 25%
   Each is turned into ONE number: the buy-rate of that group, pulled toward the overall
   rate when the group is small (m=8), so "1 lead from a category, bought" can't become
   a 100% signal. Built ONLY from the training slice inside each fold — if it were built
   from all rows the model would be reading the answers it is about to be graded on. */
/* Supplier added: measured on Jack's live board the retailer separates hard —
   sharkninja.co.uk and argos.co.uk convert nothing like amazon.uk does. It is known
   BEFORE he decides, so it is a fair feature, and it rides the same fold-safe
   target-encoding as the other three (built inside each training fold only). */
var CAT_KEYS=[['cat','category'],['src','source method'],['va','VA'],['sup','supplier']];
function _catVal(l,k){
  var v;
  if(k==='cat') v=(l.cat||l.category);
  else if(k==='src') v=(l.src||l.source_method);
  else if(k==='sup'){ try{ v=buyFromKey(l); }catch(e){ v=l.store; } }
  else v=l.va;
  v=String(v||'').trim().toLowerCase();
  return v||'(blank)';
}
function _catMaps(rows,y){
  var prior=y.reduce(function(a,b){ return a+b; },0)/(y.length||1), m=8, maps={prior:prior};
  CAT_KEYS.forEach(function(kk){
    var k=kk[0], agg={};
    rows.forEach(function(l,i){
      var v=_catVal(l,k); var a=agg[v]||(agg[v]={n:0,s:0}); a.n++; a.s+=y[i];
    });
    var out={};
    Object.keys(agg).forEach(function(v){ out[v]=(agg[v].s+prior*m)/(agg[v].n+m); });
    maps[k]=out;
  });
  return maps;
}
function _catVec(l,maps){
  if(!maps) return [];
  return CAT_KEYS.map(function(kk){
    var t=maps[kk[0]]||{}, v=_catVal(l,kk[0]);
    return (t[v]!=null)?t[v]:maps.prior;
  });
}
/* Which factors the model is allowed to use. More factors is NOT better on ~100 rows —
   every extra one is another thing it can fit to noise. The trainer now tries all three
   and keeps whichever wins on data it did NOT see (see cvAcc below). */
var FEAT_SETS=[
  {k:'full', idx:[0,1,2,3,4,5,6], short:'all 7', name:'all seven factors'},
  {k:'core', idx:[0,1,3,4],       short:'core 4', name:'ROI, profit, velocity + ROI×velocity'},
  {k:'lean', idx:[1,3,6],         short:'lean 3', name:'profit, velocity, competition'},
  {k:'cost', idx:[0,1,3,4,8],     short:'core + cost', name:'the core four plus unit cost'},
  {k:'wide', idx:[0,1,2,3,4,5,6,8], short:'all + cost', name:'all seven factors plus unit cost'},
  {k:'coreC',idx:[0,1,3,4,8],     cats:true, short:'core + cost + words',
     name:'core four, unit cost, and category / source / VA'},
  {k:'wideC',idx:[0,1,2,3,4,5,6,8], cats:true, short:'everything',
     name:'every factor, unit cost, and category / source / VA'}
];
function setByKey(k){ for(var i=0;i<FEAT_SETS.length;i++) if(FEAT_SETS[i].k===k) return FEAT_SETS[i]; return FEAT_SETS[0]; }
// NB: never pass this straight to .map() — Array.map supplies an index as the 2nd argument.
function smartFeatVec(l,idx){
  var v=featVecFull(l);
  if(!idx||!idx.length||!Array.isArray(idx)) return v;
  return idx.map(function(i){ return v[i]; });
}
function featNames(idx,cats){
  var all=['ROI','Profit','Margin','Velocity','ROI×Velocity','Profit×Velocity','Competition','Unit cost','Unit cost'];
  var out=(idx&&idx.length)?idx.map(function(i){ return all[i]; }):all.slice(0,7);
  if(cats) out=out.concat(CAT_KEYS.map(function(k){ return k[1].charAt(0).toUpperCase()+k[1].slice(1); }));
  return out;
}
/* ── Cross-device learning: every decision is logged to the cloud `lead_decisions`
   table so the model trains on FULL history from any device, even after old leads
   drop off the Leads page. Falls back to the current leads if the table isn't there. ── */
window._decisionCache=[];   // v50.9: filled by loadDecisions() from Supabase — no browser copy (it was 0.13M characters)
function loadDecisions(){
  if(typeof SUPABASE_URL==='undefined'||!DB_ENABLED) return Promise.resolve();
  return fetchT(SUPABASE_URL+'/rest/v1/lead_decisions?select=*&limit=5000',{headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(rows){ if(Array.isArray(rows)){ window._decisionCache=rows;
      try{ if(typeof mgr_currentTab!=='undefined'&&mgr_currentTab==='storefronts'&&typeof mgr_renderStorefronts==='function') mgr_renderStorefronts(); }catch(e){} } })
    .catch(function(){});
}
function logDecision(l){
  if(IS_PREVIEW) return;
  try{ if(!l||!l._sid) return;
    var isBuy=(l.status==='bought'||l.status==='atbq'||l.status==='atba2a');
    var m=(typeof ldMeta==='function')?ldMeta(l):{};
    var rec={ id:l._sid, asin:l.asin||'', title:String(l.title||'').slice(0,300),
      decision:l.status||(l.islead===true?'lead':l.islead===false?'passed':null),
      is_buy:isBuy, qty:(m.na?null:(m.qty!=null?parseInt(m.qty):null)), na:!!m.na,
      roi:+l.roi||0, profit:+l.profit||0, margin:+l.margin||0, spm:parseInt(l.spm)||0, fba:parseInt(l.fba)||0,
      src:l.src||'', store:l.store||'', cat:l.cat||'', note:String(l.notes||'').slice(0,500), va:l.va||'',
      updated_at:new Date().toISOString() };
    if(!rec.decision) return;
    var c=window._decisionCache||[]; var i=c.findIndex(function(x){return x.id===rec.id;});
    if(i>=0) c[i]=Object.assign(c[i]||{},rec); else c.push(rec);
    window._decisionCache=c;
    if(typeof SUPABASE_URL!=='undefined'&&DB_ENABLED){
      fetch(SUPABASE_URL+'/rest/v1/lead_decisions',{method:'POST',
        headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify(rec)}).catch(function(){});
    }
  }catch(e){}
}
/* Both sources, MERGED — never one or the other.
   Measured 12/08/2026 against live data: 101 leads carried a decision but lead_decisions
   held only 46, because anything decided directly in the VA's Google Sheet never passes
   through logDecision(). The old `if(cache>=12) return cache` silently discarded 55 real
   decisions — 30 buys and 25 passes — more than half the evidence available. */
function trainingRows(){
  var by={};
  (window.leads||[]).forEach(function(l){
    if(l.islead===null && !l.status) return;
    var k=l._sid||l.id; if(k==null) return;
    by[k]={_sid:k, roi:+l.roi||0, profit:+l.profit||0, margin:+l.margin||0,
      spm:parseFloat(l.spm)||0, fba:+l.fba||0, status:l.status, islead:l.islead,
      buy:+l.buy||0, cat:l.cat||l.category, src:l.src||l.source_method, va:l.va,
      _decQty:null, title:l.title, notes:l.notes, store:l.store, asin:asinKey(l), _src:'sheet'};
  });
  (window._decisionCache||[]).forEach(function(r){
    if(!r.decision) return;
    var prev=by[r.id]||{};
    by[r.id]={_sid:r.id, roi:+r.roi||0, profit:+r.profit||0, margin:+r.margin||0,
      spm:+r.spm||0, fba:+r.fba||0,
      status:r.is_buy?(r.decision||'bought'):r.decision,
      islead:(r.decision==='lead'||r.is_buy)?true:(r.decision==='passed'?false:null),
      _decQty:r.na?1:(r.qty!=null?+r.qty:1),
      buy:+r.buy||prev.buy||0, cat:r.cat||prev.cat, src:r.src||prev.src, va:r.va||prev.va,
      title:r.title||prev.title, notes:r.note||prev.notes,
      store:r.store||prev.store, asin:r.asin||prev.asin, _src:'log'};
  });
  return Object.keys(by).map(function(k){ return by[k]; });
}
function recQty(l){ if(l._decQty!=null) return Math.max(1,Math.min(20,l._decQty)); var m=(typeof ldMeta==='function')?ldMeta(l):{}; return Math.max(1,Math.min(20,m.na?1:(parseInt(m.qty)||1))); }
/* ══════════ WHAT YOUR NOTES SAY YOUR REAL LIMITS ARE ════════════════════════
   Jack: "it must read notes anyway and analyse my notes as I write a note on most
   things I action". Right — and this is the way that works.

   A note cannot be a per-lead FEATURE: at the moment the score is needed the lead is
   undecided and the note does not exist yet, so a model trained on notes would score
   brilliantly in testing and know nothing about a fresh lead. But a note is a superb
   TEACHER. Every time he writes "low ROI" he is labelling a number, and across many
   notes those labels reveal where his real line sits — which is exactly the thing the
   matrix needs and cannot learn on its own.

   So: for each score-type reason, take every lead he gave it to, and read off the
   distribution of the metric it refers to. "You say low ROI on leads averaging 9.4%,
   and you have never said it above 13%" is a threshold learned from his own words. */
var NOTE_METRICS=[
  {code:'roi',    metric:'roi',    label:'ROI',         unit:'%', dir:'below', say:'you call this low ROI'},
  {code:'profit', metric:'profit', label:'profit/unit', unit:'£', dir:'below', say:'you call this low profit'},
  {code:'comp',   metric:'fba',    label:'FBA sellers', unit:'',  dir:'above', say:'you call this too crowded'},
  {code:'demand', metric:'spm',    label:'sales/month', unit:'',  dir:'below', say:'you call this too slow'},
  {code:'margin', metric:'margin', label:'margin',      unit:'%', dir:'above', say:'you call this a great margin', good:true},
  {code:'fast',   metric:'spm',    label:'sales/month', unit:'',  dir:'above', say:'you call this fast-selling', good:true}
];
function noteThresholds(){
  var rows=(window.leads||[]).filter(function(l){ return l&&(l.status||l.islead!==null); });
  var out=[];
  NOTE_METRICS.forEach(function(nm){
    var vals=[];
    rows.forEach(function(l){
      var a=(typeof reasonAny==='function')?reasonAny(l.notes):null;
      var code=a&&a.r&&a.r.c;
      if(code!==nm.code) return;
      var v=parseFloat(l[nm.metric]); if(!isFinite(v)) return;
      vals.push(v);
    });
    if(vals.length<3) return;                       // two mentions is not a pattern
    vals.sort(function(x,y){ return x-y; });
    var med=vals[Math.floor(vals.length/2)];
    var edge=(nm.dir==='below')?vals[vals.length-1]:vals[0];   // the furthest he has tolerated
    out.push({label:nm.label, unit:nm.unit, dir:nm.dir, n:vals.length, say:nm.say, good:!!nm.good,
              median:Math.round(med*10)/10, edge:Math.round(edge*10)/10});
  });
  return out;
}
function noteThresholdHTML(){
  var t=noteThresholds();
  if(!t.length) return '<div class="nt-box off">Write a few more reasons on your rejections and this will show the lines you actually draw.</div>';
  return '<div class="nt-box"><div class="nt-h">What your notes say your real limits are</div>'
    +'<div class="nt-sub">Learned from the reasons you gave — not from the matrix.</div>'
    +t.map(function(x){
      // £ prefixes, % suffixes — "over %13.1" read as broken
      function u(v){ return x.unit==='£' ? '£'+v : (x.unit==='%' ? v+'%' : String(v)); }
      return '<div class="nt-r'+(x.good?' good':'')+'"><span class="nt-l">'+escHtml(x.say)+'</span>'
        +'<b>'+(x.dir==='below'?'under ':'over ')+u(x.median)+'</b>'
        +'<span class="nt-n">'+x.n+' times · furthest '+u(x.edge)+'</span></div>';
    }).join('')+'</div>';
}
/* Keep only the decisions that were genuinely about the lead's NUMBERS. */
function trainableRows(all){
  var kept=[], skipped={world:0,data:0,contra:0,dupe:0};
  (all||[]).forEach(function(l){
    var a=(typeof reasonAny==='function')?reasonAny(l.notes):null, w=a&&a.r;
    if(w&&w.k==='world'){ skipped.world++; return; }   // stock, gating, cash, bulk — not about the numbers
    if(w&&w.k==='data'){  skipped.data++;  return; }   // wrong item, tanked — the numbers it saw were lies
    kept.push(l);
  });
  /* Both VAs send the same ASIN, so a product can appear twice. Decided the same way it is
     one piece of evidence counted twice; decided OPPOSITE ways it is a flat contradiction —
     identical numbers, opposite answers — which can only pull the fit apart.
     Measured on live data: 5 ASINs decided twice, 2 of them contradictory. */
  var isBuy=function(l){ return l.status==='bought'||l.status==='atbq'||l.status==='atba2a'; };
  var byAsin={}, drop={};
  kept.forEach(function(l){ var a=String(l.asin||'').toUpperCase(); if(!a) return;
    (byAsin[a]||(byAsin[a]=[])).push(l); });
  Object.keys(byAsin).forEach(function(a){
    var g=byAsin[a]; if(g.length<2) return;
    var seen={}; g.forEach(function(l){ seen[isBuy(l)?1:0]=1; });
    if(seen[0]&&seen[1]){ g.forEach(function(l){ drop[l._sid]=1; }); skipped.contra+=g.length; }
    else { g.slice(1).forEach(function(l){ drop[l._sid]=1; skipped.dupe++; }); }
  });
  var out=kept.filter(function(l){ return !drop[l._sid]; });
  out._skipped=skipped;
  return out;
}
/* ── HONEST TRAINING ────────────────────────────────────────────────────────
   The old accuracy figure was measured on the very rows the model was fitted to —
   marking its own homework. A model can score 100% that way and still be useless on
   the next lead. Everything below is now measured out-of-fold: the model is fitted on
   4/5 of the decisions and graded on the 1/5 it never saw, five times over.
   That also makes two things possible that were guesswork before:
     · choosing HOW MANY factors to use (more is not better on ~100 rows)
     · choosing the yes/no cut-off, instead of assuming 0.5
   And it is compared against the only benchmark that matters — always guessing the
   more common answer. A model that can't beat that is worse than a coin with a bias. */
function _sig(z){ return 1/(1+Math.exp(-Math.max(-30,Math.min(30,z)))); }
function _standardise(X){
  var k=X[0].length, mean=[], std=[];
  for(var j=0;j<k;j++){
    var col=X.map(function(r){ return r[j]; });
    var m=col.reduce(function(a,b){ return a+b; },0)/col.length;
    var v=col.reduce(function(a,b){ return a+(b-m)*(b-m); },0)/col.length;
    mean[j]=m; std[j]=Math.sqrt(v)||1;
  }
  return {mean:mean, std:std,
    Xs:X.map(function(r){ return r.map(function(v,j){ return (v-mean[j])/std[j]; }); })};
}
function _fitLogit(Xs,y,sw,iters,lambda){
  var k=Xs[0].length, w=new Array(k+1).fill(0), lr=0.3;
  var swSum=sw.reduce(function(a,b){ return a+b; },0)||1;
  for(var it=0;it<iters;it++){
    var grad=new Array(k+1).fill(0);
    for(var i=0;i<Xs.length;i++){
      var z=w[0]; for(var a=0;a<k;a++) z+=w[a+1]*Xs[i][a];
      var e=(_sig(z)-y[i])*sw[i];
      grad[0]+=e; for(var b=0;b<k;b++) grad[b+1]+=e*Xs[i][b];
    }
    for(var g=0;g<w.length;g++) w[g]-=lr*(grad[g]/swSum+(g===0?0:lambda*w[g]));
  }
  return w;
}
function _prob(w,x,mean,std){
  var z=w[0]; for(var j=0;j<x.length;j++) z+=w[j+1]*((x[j]-mean[j])/(std[j]||1));
  return _sig(z);
}
/* out-of-fold probabilities for one candidate feature set. Folds are i%5 on a stable
   sort, so the same decisions always give the same answer — no Math.random anywhere. */
function _cvProbs(rows,y,sw,idx,cats){
  var out=new Array(rows.length);
  for(var f=0;f<5;f++){
    var trI=[],teI=[];
    for(var i=0;i<rows.length;i++){ (i%5===f?teI:trI).push(i); }
    if(!trI.length||!teI.length) continue;
    // encodings are built from THIS fold's training rows only — never from the held-out ones
    var maps=cats?_catMaps(trI.map(function(i){ return rows[i]; }), trI.map(function(i){ return y[i]; })):null;
    var vec=function(i){ return smartFeatVec(rows[i],idx).concat(cats?_catVec(rows[i],maps):[]); };
    var trX=trI.map(vec), trY=trI.map(function(i){ return y[i]; }), trW=trI.map(function(i){ return sw[i]; });
    var st=_standardise(trX);
    var w=_fitLogit(st.Xs,trY,trW,300,0.08);
    for(var t=0;t<teI.length;t++) out[teI[t]]=_prob(w,vec(teI[t]),st.mean,st.std);
  }
  for(var q=0;q<out.length;q++) if(out[q]==null) out[q]=0.5;
  return out;
}
/* pick the cut-off that gets the most decisions right, judged on BALANCED accuracy so a
   lopsided buy/pass split can't be gamed by always answering the more common one. */
function _bestThr(probs,y){
  var best={thr:0.5,acc:0,bal:0};
  for(var t=0.30;t<=0.701;t+=0.02){
    var tp=0,tn=0,np=0,nn=0,ok=0;
    for(var i=0;i<y.length;i++){
      var p=probs[i]>=t?1:0; if(p===y[i]) ok++;
      if(y[i]===1){ np++; if(p===1) tp++; } else { nn++; if(p===0) tn++; }
    }
    var bal=((np?tp/np:0)+(nn?tn/nn:0))/2;
    if(bal>best.bal+1e-9) best={thr:Math.round(t*100)/100, acc:ok/y.length, bal:bal};
  }
  return best;
}
function trainSmartModel(){
  var isBuy=function(l){ return l.status==='bought'||l.status==='atbq'||l.status==='atba2a'; };
  var _all=trainingRows().filter(function(l){ return l.islead!==null||l.status; });
  var decided=trainableRows(_all);
  var _skip=decided._skipped||{world:0,data:0,contra:0,dupe:0};
  // stable order → stable folds → the same number every time he opens the app
  decided=decided.slice().sort(function(a,b){ return String(a._sid)<String(b._sid)?-1:1; });
  var buys=decided.filter(isBuy), passes=decided.filter(function(l){ return !isBuy(l); });
  if(buys.length<6||passes.length<6) return {err:'need ≥6 buys and ≥6 passes (have '+buys.length+' / '+passes.length+')'};

  var y=decided.map(function(l){ return isBuy(l)?1:0; });
  /* Jack: "I want it to learn by how many I buy too" — it already does, and this is
     the version that actually works. Quantity is CONFIDENCE in the label: 20 units is
     conviction, 1 unit is a toe in the water.
     MEASURED on his 86 decisions, five weightings, same folds, balanced accuracy:
       linear qty 61%  ·  sqrt qty 58%  ·  sqrt+good-lead-0.4 59%
       log qty+good-lead 57%  ·  flat (ignore qty entirely) 58%
     Linear wins by 3 points, and ignoring quantity costs 3. I tried the gentler
     curves on the theory that one 20-unit buy shouldn't outvote twenty decisions;
     the data disagreed, so they are gone. Do not "improve" this without re-running
     that comparison. */
  var sw=decided.map(function(l){ return isBuy(l)?recQty(l):1; });
  var maj=Math.max(buys.length,passes.length)/decided.length;   // "always say the common one"

  // try each candidate feature set, keep the one that does best on unseen decisions
  var cand=FEAT_SETS.map(function(fs){
    var probs=_cvProbs(decided,y,sw,fs.idx,fs.cats);
    var b=_bestThr(probs,y);
    return {fs:fs, thr:b.thr, cvAcc:b.acc, cvBal:b.bal};
  }).sort(function(a,b){
    if(Math.abs(b.cvBal-a.cvBal)>0.005) return b.cvBal-a.cvBal;
    // a genuine tie goes to the SIMPLER model — fewer factors, less to fit to noise
    return (a.fs.idx.length+(a.fs.cats?CAT_KEYS.length:0))-(b.fs.idx.length+(b.fs.cats?CAT_KEYS.length:0));
  });
  var win=cand[0];

  // final fit on everything, using the winning set
  var maps=win.fs.cats?_catMaps(decided,y):null;
  var X=decided.map(function(l){ return smartFeatVec(l,win.fs.idx).concat(win.fs.cats?_catVec(l,maps):[]); });
  var st=_standardise(X);
  var w=_fitLogit(st.Xs,y,sw,500,0.08);
  var fitOk=0; for(var i=0;i<X.length;i++) if((_prob(w,X[i],st.mean,st.std)>=win.thr?1:0)===y[i]) fitOk++;

  var model={ w:w, mean:st.mean, std:st.std, idx:win.fs.idx, cats:!!win.fs.cats, maps:maps,
    setKey:win.fs.k, setName:win.fs.name, thr:win.thr,
    acc:Math.round(win.cvAcc*100),            // the number shown: OUT-OF-FOLD, not self-marked
    balAcc:Math.round(win.cvBal*100),
    fitAcc:Math.round(fitOk/X.length*100),    // kept only so the gap can be shown
    baseline:Math.round(maj*100),
    beats:Math.round((win.cvAcc-maj)*100),
    /* The list printed cvAcc while the sort used cvBal, so "everything 59%" appeared
       to beat "core + cost + words 62%" for no visible reason. Print what it picks on. */
    tried:cand.map(function(c){ return {k:c.fs.k, name:c.fs.name, short:c.fs.short,
      acc:Math.round(c.cvBal*100), raw:Math.round(c.cvAcc*100)}; }),
    n:decided.length, buys:buys.length, passes:passes.length,
    seen:_all.length, skippedWorld:_skip.world, skippedData:_skip.data,
    skippedContra:_skip.contra||0, skippedDupe:_skip.dupe||0, trained:ukDateShort() };
  try{ lsPut('bdl_smart_model',JSON.stringify(model)); }catch(e){}
  return model;
}
function modelVec(l,model){
  return smartFeatVec(l,model&&model.idx).concat((model&&model.cats)?_catVec(l,model.maps):[]);
}
function getSmartModel(){ try{return JSON.parse(lsGet('bdl_smart_model')||'null');}catch(e){return null;} }
function smartScore(l,model){
  model=model||getSmartModel(); if(!model||!model.w) return null;
  var NAMES=featNames(model.idx,model.cats);
  var x=modelVec(l,model), xs=x.map(function(v,j){return (v-model.mean[j])/(model.std[j]||1);});
  var z=model.w[0]; for(var j=0;j<x.length;j++) z+=model.w[j+1]*xs[j];
  var p=1/(1+Math.exp(-Math.max(-30,Math.min(30,z))));
  var contrib=xs.map(function(v,j){return {n:NAMES[j], c:model.w[j+1]*v};}).sort(function(a,b){return Math.abs(b.c)-Math.abs(a.c);});
  var bd=contrib.slice(0,4).map(function(cc){ return {n:cc.n+(cc.c>=0?' ↑ helps':' ↓ hurts'), p:Math.round(Math.min(10,Math.abs(cc.c)*3)), m:10}; });
  return {total:Math.round(p*100)/10, prob:p, bd:bd, smart:true};
}
// plain-English "why the model scores this lead like this", using its learned drivers
function smartWhy(l,s){
  var model=getSmartModel(); if(!model) return '';
  try{
    var NAMES=featNames(model.idx,model.cats);
    var x=modelVec(l,model), xs=x.map(function(v,j){return (v-model.mean[j])/(model.std[j]||1);});
    var contrib=xs.map(function(v,j){return {n:NAMES[j], c:model.w[j+1]*v};}).sort(function(a,b){return b.c-a.c;});
    var help=contrib.filter(function(c){return c.c>0.15;}).slice(0,2).map(function(c){return c.n;});
    var hurt=contrib.filter(function(c){return c.c<-0.15;}).slice(-2).map(function(c){return c.n;});
    var prob=Math.round((s.prob||0)*100);
    // nearest lead Jack bought, for context
    var isBuy=function(x2){return x2.status==='bought'||x2.status==='atbq'||x2.status==='atba2a';};
    var buys=(window.leads||[]).filter(isBuy);
    var near=null,nd=1e9; buys.forEach(function(b){ if(b.id===l.id)return; var bx=modelVec(b,model).map(function(v,j){return (v-model.mean[j])/(model.std[j]||1);});
      var d=0; for(var j=0;j<xs.length;j++){d+=(xs[j]-bx[j])*(xs[j]-bx[j]);} if(d<nd){nd=d;near=b;} });
    var msg='<b>'+prob+'% match</b> to your buys.';
    if(help.length) msg+=' In its favour: <span class="sw-help">'+help.join(', ')+'</span>.';
    if(hurt.length) msg+=' Against it: <span class="sw-hurt">'+hurt.join(', ')+'</span>.';
    var nearTxt=(near&&nd<6)?'<div class="smart-near">Most like a lead you bought: <b>'+String(near.title||'').slice(0,46)+'…</b></div>':'';
    return '<div class="smart-why">🧠 '+msg+nearTxt+'</div>';
  }catch(e){ return ''; }
}
/* ── JACK'S DEAL MATRIX ─────────────────────────────────────────────────────
   Replaces the old weighted sum. Measured against his real decisions, that sum
   scored WORSE than a coin flip (AUC 0.43) — because his rule was never additive.
   It is a lookup: volume first, then unit profit, then ROI as a safety check.
   "Below 10 SPM, reject regardless of profit" cannot be expressed by weights at all,
   which is why auto-tuning the sliders could never converge.

   SPM band  ×  profit tier  →  base score, then the ROI check.               */
/* The two ways a sub-10% ROI is forgiven. "Super" is a judgement call, so it lives here
   as one editable object rather than buried in the branch: £25/unit is well clear of the
   £9 "high profit" tier, and 300 SPM is the top volume band. */
var ROI_LET_OFF={ profit:25, spm:300 };
var SPM_BANDS=[
  {min:300, name:'300+',      label:'very high volume'},
  {min:100, name:'100-299',   label:'strong volume'},
  {min:50,  name:'50-99',     label:'decent volume'},
  {min:30,  name:'30-49',     label:'workable volume'},
  {min:10,  name:'10-29',     label:'very low volume'},
  {min:0,   name:'under 10',  label:'below minimum volume'}
];
var DEAL_MATRIX={
  '300+':    {high:[10,'Exceptional lead. Buy as many as possible.'],
              mid: [9, 'Rare find — fast sales and mid profit. Buy heavily.'],
              low: [7, 'Fast sales, low profit. Still solid.']},
  '100-299': {high:[9, 'Rare find — strong volume and high profit. Buy heavily.'],
              mid: [8, 'Strong buy. Good volume, mid profit.'],
              low: [6, 'Decent volume but low profit.']},
  '50-99':   {high:[8, 'Good profit and decent volume. Strong buy.'],
              mid: [7, 'Bread-and-butter mid-ticket lead. Solid buy.'],
              low: [5, 'Borderline — only buy if the graphs look good.']},
  '30-49':   {high:[8, 'High profit and decent volume. Buy roughly 7-15 units.'],
              mid: [6, 'Buy roughly 7-15 units depending on competition.'],
              low: [3, 'Low priority. Pass.']},
  '10-29':   {high:[7, 'High profit but borderline volume — only buy if the graphs look good.'],
              mid: [5, 'Borderline — only buy if the graphs look good.'],
              low: [2, 'Low priority. Pass.']},
  'under 10':{high:[1, 'Below minimum volume. Profit does not rescue it.'],
              mid: [1, 'Below minimum volume. Profit does not rescue it.'],
              low: [1, 'Below minimum volume. Profit does not rescue it.']}
};
function spmBand(spm){
  for(var i=0;i<SPM_BANDS.length;i++) if(spm>=SPM_BANDS[i].min) return SPM_BANDS[i];
  return SPM_BANDS[SPM_BANDS.length-1];
}
function profitTier(p){ return p>=9?'high':(p>=3?'mid':'low'); }
function tierLabel(t){ return t==='high'?'High profit':t==='mid'?'Mid profit':'Low profit'; }
/* "Why this score" explained what the score IS but never what would CHANGE it, so a
   7/10 and a 9/10 read the same to a VA being told to find better leads. This answers
   "how far off is it" in the two units they can actually influence: sales per month and
   profit per unit.
   It does NOT re-implement the model — it re-runs calcScore() on a copy of the lead with
   one field raised, so it can never drift from the real scoring, ROI penalties included. */
function scoreLift(l,s){
  if(!l||!s||s.unscored) return null;
  var spm=parseFloat(l.spm); if(isNaN(spm)) spm=parseSpm(l.spm);
  var profit=parseFloat(l.profit)||0;
  if(!(spm>0)||!(profit>0)) return null;
  var now=s.total;
  function at(over){
    try{ var t={}; for(var k in l) t[k]=l[k]; for(var k2 in over) t[k2]=over[k2];
         var r=calcScore(t); return r&&!r.unscored?r.total:null; }catch(e){ return null; }
  }
  var out={now:now, spm:null, profit:null};
  // the next SPM band up that actually scores higher
  for(var i=SPM_BANDS.length-1;i>=0;i--){
    var m=SPM_BANDS[i].min;
    if(m<=spm) continue;
    var v=at({spm:m});
    if(v!=null&&v>now){ out.spm={need:m, gain:v, extra:Math.max(0,Math.round(m-spm))}; break; }
  }
  // the next profit tier up that actually scores higher (£3 and £9 are the thresholds)
  [3,9].forEach(function(t){
    if(out.profit||t<=profit) return;
    var v=at({profit:t});
    if(v!=null&&v>now) out.profit={need:t, gain:v, extra:Math.round((t-profit)*100)/100};
  });
  return (out.spm||out.profit)?out:{now:now,spm:null,profit:null,topped:now>=10};
}
/* ── THE MATRIX, AND HOW TO TELL WHETHER IT IS ANY GOOD ──────────────────────
   Jack, 03/09: "make it easy to help improve the scoring side, it's still a bit
   shit". Measured on his own 228 decisions, he is right and here is the proof:
   a 7/10 lead is bought 69% of the time, an 8/10 68%, a 9/10 67%. The score does
   not separate — bought leads average 7.87 and rejected leads 7.10, a gap of 0.77
   on a 10-point scale. 44 leads scored 8+ and were rejected.
   It was also unfixable: DEAL_MATRIX was a const in the file, so the only way to
   change a score was a new build. Now every cell can be overridden from Settings,
   each cell is shown WITH the buy rate it actually produced, and one button
   proposes scores straight from his own decisions. */
function mxOverrides(){
  try{ var o=getAppSettings().dealMatrix; return (o&&typeof o==='object')?o:{}; }catch(e){ return {}; }
}
function mxKey(band,tier){ return band+'|'+tier; }
function mxCell(band,tier){
  var base=(DEAL_MATRIX[band]||DEAL_MATRIX['under 10'])[tier];
  var ov=mxOverrides()[mxKey(band,tier)];
  if(ov==null||isNaN(parseFloat(ov))) return base;
  return [Math.max(0,Math.min(10,parseFloat(ov))), base[1]];
}
function mxSet(band,tier,val){
  var st=getAppSettings();
  var o=(st.dealMatrix&&typeof st.dealMatrix==='object')?st.dealMatrix:{};
  var k=mxKey(band,tier);
  if(val===''||val==null) delete o[k]; else o[k]=Math.max(0,Math.min(10,parseFloat(val)||0));
  st.dealMatrix=o; saveAppSettings(st);
  try{ pushSettingsCloud(st); }catch(e){}
  try{ leads.forEach(function(l){ l._sc=calcScore({roi:l.roi,profit:l.profit,spm:l.spm,fba:l.fba,margin:l.margin,status:l.status,islead:l.islead}); }); }catch(e){}
  try{ renderList(); }catch(e){}
  try{ renderMatrixPanel(); }catch(e){}
}
function mxReset(){
  var st=getAppSettings(); delete st.dealMatrix; saveAppSettings(st);
  try{ pushSettingsCloud(st); }catch(e){}
  try{ leads.forEach(function(l){ l._sc=calcScore({roi:l.roi,profit:l.profit,spm:l.spm,fba:l.fba,margin:l.margin,status:l.status,islead:l.islead}); }); renderList(); }catch(e){}
  try{ renderMatrixPanel(); }catch(e){}
  try{ showToast('Matrix put back to the built-in scores'); }catch(e){}
}
/* ── A REJECT THAT WAS NOT ABOUT THE NUMBERS TEACHES NOTHING ─────────────────
   Jack, 03/09, asked for this directly. Passing a 9/10 because it was gated, or
   because he already has a pallet of them, is not evidence the 9/10 profile is
   wrong — but the cell was counted as a miss all the same. Measured on his live
   board: 20 of 82 rejects are "world" reasons, and they were dragging good cells
   down and corrupting every suggestion made from them.
   The reason is taken from reasonAny(), so it uses the tag when he set one and
   otherwise reads the words he already typed ("got loads left in stock", "gated")
   — 36 of 82 rejects are now classified, 28 of them from his own free text. */
function mxIsNumbersDecision(l){
  if(l.status==='bought'||l.status==='atbq'||l.status==='atba2a') return true;   // buys always count
  try{
    var a=(typeof reasonAny==='function')?reasonAny(l.notes):null;
    if(a && a.r && a.r.k==='world') return false;      // out of stock, gated, already have it…
  }catch(e){}
  return true;
}
/* every decision he has made, grouped by the matrix cell it fell in */
function mxStats(){
  var out={};
  (window.leads||[]).forEach(function(l){
    if(!(l.status||l.islead!==null)) return;
    if(!mxIsNumbersDecision(l)) return;                // see mxIsNumbersDecision
    var s=l._sc; if(!s||!s.band||!s.tier) return;
    var k=mxKey(s.band,s.tier);
    out[k]=out[k]||{n:0,b:0};
    out[k].n++;
    if(l.status==='bought'||l.status==='atbq'||l.status==='atba2a') out[k].b++;
  });
  return out;
}
/* how many decisions are being set aside, so the panel can say so out loud */
function mxSetAside(){
  var n=0;
  (window.leads||[]).forEach(function(l){
    if(!(l.status||l.islead!==null)) return;
    if(!mxIsNumbersDecision(l)) n++;
  });
  return n;
}
/* Propose a score per cell straight from his buy rate there. Deliberately simple and
   deliberately shown before it is applied: 90%+ -> 10, and down in even steps. Cells
   with fewer than 8 decisions are left alone — there is no evidence to move them. */
function mxSuggest(){
  var st=mxStats(), prop=[];
  Object.keys(DEAL_MATRIX).forEach(function(band){
    ['high','mid','low'].forEach(function(tier){
      var k=mxKey(band,tier), d=st[k];
      if(!d||d.n<8) return;
      var rate=d.b/d.n;
      var want=Math.round(rate*10);
      if(want<1) want=1;
      var cur=mxCell(band,tier)[0];
      if(Math.abs(want-cur)>=2) prop.push({band:band,tier:tier,from:cur,to:want,n:d.n,rate:Math.round(rate*100)});
    });
  });
  return prop;
}
function mxApplySuggest(){
  var prop=mxSuggest();
  if(!prop.length){ try{ showToast('Nothing to change — every cell with enough decisions already lines up'); }catch(e){} return; }
  var msg='Apply '+prop.length+' change'+(prop.length===1?'':'s')+' from your own decisions?\n\n'
    +prop.map(function(p){ return '  '+p.band+' x '+p.tier+':  '+p.from+' -> '+p.to+'   (you buy '+p.rate+'% of these, '+p.n+' decided)'; }).join('\n')
    +'\n\nNothing else changes and you can put it all back with Reset.';
  if(!confirm(msg)) return;
  var stg=getAppSettings();
  var o=(stg.dealMatrix&&typeof stg.dealMatrix==='object')?stg.dealMatrix:{};
  prop.forEach(function(p){ o[mxKey(p.band,p.tier)]=p.to; });
  stg.dealMatrix=o; saveAppSettings(stg);
  try{ pushSettingsCloud(stg); }catch(e){}
  try{ leads.forEach(function(l){ l._sc=calcScore({roi:l.roi,profit:l.profit,spm:l.spm,fba:l.fba,margin:l.margin,status:l.status,islead:l.islead}); }); renderList(); }catch(e){}
  try{ renderMatrixPanel(); }catch(e){}
  try{ showToast('Applied '+prop.length+' change'+(prop.length===1?'':'s')+' \u2713'); }catch(e){}
}
/* how well the score currently predicts him — the number that says whether any of
   this is working */
function mxSeparation(){
  var b=[],r=[];
  (window.leads||[]).forEach(function(l){
    if(!(l.status||l.islead!==null)) return;
    if(!mxIsNumbersDecision(l)) return;                // same rule as mxStats
    var s=l._sc&&l._sc.total; if(s==null) return;
    if(l.status==='bought'||l.status==='atbq'||l.status==='atba2a') b.push(s); else r.push(s);
  });
  function avg(a){ return a.length?a.reduce(function(x,y){return x+y;},0)/a.length:null; }
  if(!b.length||!r.length) return null;
  return { bought:+avg(b).toFixed(2), rejected:+avg(r).toFixed(2), gap:+(avg(b)-avg(r)).toFixed(2), nB:b.length, nR:r.length };
}
/* The panel: the matrix as a grid, every cell carrying the buy rate it actually
   produced, editable in place. Red where the score and his behaviour disagree —
   that is the whole point, it shows WHERE to fix rather than saying "it's off". */
function matrixPanelHTML(){
  var st=mxStats(), ov=mxOverrides(), sep=mxSeparation();
  var bands=Object.keys(DEAL_MATRIX);
  var head='<tr><th>Sales / month</th>'+['high','mid','low'].map(function(t){
    return '<th>'+(t==='high'?'High profit £9+':t==='mid'?'Mid £3–£9':'Low under £3')+'</th>'; }).join('')+'</tr>';
  var body=bands.map(function(b){
    return '<tr><th>'+b+'</th>'+['high','mid','low'].map(function(t){
      var k=mxKey(b,t), cur=mxCell(b,t)[0], d=st[k], edited=(ov[k]!=null);
      var rate=d&&d.n>=1?Math.round(d.b/d.n*100):null;
      /* "expected" = the score as a percentage. A 9/10 cell he buys 46% of is the
         disagreement worth showing; a 9/10 he buys 90% of is working. */
      var gap=(rate!=null&&d.n>=8)?Math.abs(rate-cur*10):null;
      var cls=gap==null?'':(gap>=30?' mx-bad':gap>=15?' mx-warn':' mx-ok');
      return '<td class="mx-cell'+cls+(edited?' mx-edited':'')+'">'
        +'<input class="mx-in" type="number" min="0" max="10" step="1" value="'+cur+'" '
        +'title="Score for '+b+' sales/month at '+t+' profit'+(edited?' — you changed this from '+((DEAL_MATRIX[b]||{})[t]||[0])[0]:'')+'" '
        +'onchange="mxSet(\''+b+'\',\''+t+'\',this.value)">'
        +(d&&d.n>=1
          ? '<span class="mx-rate">you buy <b>'+rate+'%</b><em>'+d.b+'/'+d.n+' decided</em></span>'
          : '<span class="mx-rate none">no decisions yet</span>')
        +'</td>';
    }).join('')+'</tr>';
  }).join('');
  var prop=mxSuggest();
  var sepLine=sep
    ? '<div class="mx-sep'+(sep.gap<1.5?' weak':'')+'">Right now a lead you <b>buy</b> averages <b>'+sep.bought
      +'</b>/10 and one you <b>reject</b> averages <b>'+sep.rejected+'</b>/10 — a gap of <b>'+sep.gap+'</b>.'
      +(sep.gap<1.5?' That is too small to be useful: the score is barely telling them apart.':' Bigger is better.')
      +' <em>'+sep.nB+' bought · '+sep.nR+' not</em></div>'
    : '';
  return '<div class="settings-card" data-sg="leads">'
    +'<div class="settings-title">Lead scoring matrix</div>'
    +'<div class="settings-sub">Every score comes from this grid: sales per month down the side, profit per unit across. '
      +'Each cell shows how often you actually bought the leads that landed in it — where the two disagree, the cell is the thing to change.</div>'
    +sepLine
    +(function(){ var sa=mxSetAside(); return sa
        ? '<div class="mx-aside">'+sa+' decision'+(sa===1?'':'s')+' set aside \u2014 rejected for reasons that had nothing to do with the numbers '
          +'(out of stock, gated, already have stock). Counting those as scoring misses is how a good cell gets marked bad.</div>'
        : ''; })()
    +'<div class="mx-wrap"><table class="mx-table">'+head+body+'</table></div>'
    +'<div class="mx-legend"><span class="mx-key mx-ok"></span>score matches your buying'
      +'<span class="mx-key mx-warn"></span>drifting'
      +'<span class="mx-key mx-bad"></span>clearly wrong'
      +'<span class="mx-note">cells with under 8 decisions are not judged</span></div>'
    +'<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">'
      +'<button class="btn btn-success" onclick="mxApplySuggest()">'
        +(prop.length?'Suggest '+prop.length+' change'+(prop.length===1?'':'s')+' from my decisions':'Check against my decisions')+'</button>'
      +'<button class="btn btn-ghost" onclick="mxReset()">Reset to built-in</button>'
    +'</div></div>';
}
function renderMatrixPanel(){
  var h=document.getElementById('mx-panel-host');
  if(h) h.innerHTML=matrixPanelHTML();
}
function calcScore(l,forceManual){
  var spm=parseFloat(l&&l.spm); if(isNaN(spm)) spm=parseSpm(l&&l.spm);
  var profit=parseFloat(l&&l.profit)||0;
  var roiRaw=l?l.roi:null;
  var roiBlank=(roiRaw===''||roiRaw===null||roiRaw===undefined);
  var roi=parseFloat(roiRaw); if(isNaN(roi)) roi=0;
  // NO ratio conversion here. The loader already does `if(roi>0&&roi<3) roi*=100`, so a
  // lead arrives as a real percentage — converting again turned a genuine 1% ROI into
  // 100% and let a hopeless lead skip the check entirely.

  // nothing to score until the two inputs the matrix needs are present
  if(!(spm>0) || !(profit>0)){
    return { total:0, unscored:true, verdict:'Needs SPM and profit before it can be scored.',
             band:null, tier:null, bd:[
               {n:'Sales per month', p:spm>0?1:0, m:1},
               {n:'Profit per unit', p:profit>0?1:0, m:1},
               {n:'ROI', p:roiBlank?0:1, m:1},
               {n:'—', p:0, m:1}] };
  }

  var band=spmBand(spm), tier=profitTier(profit);
  var cell=mxCell(band.name,tier);
  var base=cell[0], verdict=cell[1], note='', roiExempt=false;

  // ── ROI safety check ──────────────────────────────────────────────────────
  var total=base;
  if(roiBlank){
    // His own write-up calls a blank ROI reading as 0% "the biggest practical issue" —
    // it punishes a lead for a field nobody filled in. Unknown is not the same as bad:
    // no penalty, but say so, because the check genuinely hasn't run.
    note='ROI not entered — the 10% check hasn’t run on this one.';
  } else if(roi < 10){
    /* Jack: "wouldn't really buy anything under 10% ROI unless it's super high ticket
       high profit, or a super fast seller." So the ROI check is conditional, not
       absolute — two escapes, both of which mean the money still works despite the
       percentage. Below 10 SPM is NOT one of them: that floor is unconditional. */
    var superProfit = profit >= ROI_LET_OFF.profit;
    var superFast   = spm    >= ROI_LET_OFF.spm;
    if(spm >= 10 && (superProfit || superFast)){
      note = superProfit
        ? 'ROI is only '+Math.round(roi*10)/10+'%, but at £'+profit.toFixed(2)+' a unit the cash still works — not docked.'
        : 'ROI is only '+Math.round(roi*10)/10+'%, but at '+Math.round(spm)+' sales a month the cash recycles fast — not docked.';
      roiExempt = true;
    } else if(base > 3){
      total=Math.max(base-2, 3); note='ROI below 10% — docked 2 points.';
    } else {
      total=1; verdict='ROI below 10%. Pass.'; note='Weak before the ROI check, so rejected outright.';
    }
  }

  return {
    total: total, base: base, band: band.name, bandLabel: band.label,
    tier: tier, tierLabel: tierLabel(tier), verdict: verdict, note: note,
    roiPenalty: (total!==base), roiBlank: roiBlank, roiExempt: roiExempt,
    bd:[
      {n:'Sales per month ('+(Math.round(spm*10)/10)+')', p:Math.round(base/10*30), m:30},
      {n:'Profit per unit (£'+profit.toFixed(2)+') — '+tierLabel(tier),
        p:tier==='high'?30:tier==='mid'?20:8, m:30},
      {n:'Volume band — '+band.label, p:Math.round(base/10*30), m:30},
      {n:'ROI ('+(roiBlank?'not entered':Math.round(roi*10)/10+'%')+')',
        p:roiBlank?5:(roi>=10?10:0), m:10}
    ]
  };
}
const VANOTES={};
const HRS={};
let leads=[];
var _seenIds={}; try{_seenIds=JSON.parse(lsGet('ld_seen')||'{}')}catch(e){}
function markSeen(sid){ if(!sid) return; _seenIds[sid]=1; try{lsPut('ld_seen',JSON.stringify(_seenIds));}catch(e){} }
function parseSpm(v){ var n=parseInt(String(v||'').replace(/[^0-9]/g,'')); return isNaN(n)?0:n; }
function fmtGB(iso){ if(!iso) return ''; var p=String(iso).slice(0,10).split('-'); return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):String(iso); }
function mapStatusIn(st){ st=String(st||'').trim().toUpperCase();
  if(st==='BOUGHT') return 'bought';
  if(st==='ATB (Q)') return 'atbq';
  if(st==='ATB (A2A)') return 'atba2a';
  if(st==='WAITING') return 'waiting';
  if(st==='NOT') return 'passed';
  return null; }
/* These strings must match the sheet's Bought? dropdown EXACTLY — both sheets use
   ONE_OF_LIST with strict:true, so anything else lands as an invalid entry.
   Checked against the live validation on 05/08/2026:
     ['BOUGHT', 'NOT', 'ATB (Q)', 'waiting ', 'ATB (A2A)']
   Note the TRAILING SPACE on 'waiting ' — it is in the sheet, not a typo here.
   Column C is ['LEAD', 'NOT LEAD'], which we already match. */
function sheetStatusOut(st){ return st==='bought'?'BOUGHT':st==='atbq'?'ATB (Q)':st==='atba2a'?'ATB (A2A)':st==='waiting'?'waiting ':st==='passed'?'NOT':null; }
// The Supabase id is "<sheetId>::<TabName>::<row>" — the tab name is the AUTHORITATIVE month.
function leadTabMonth(sid){
  var t=String(sid||'').split('::')[1]; if(!t) return null; t=t.toLowerCase();
  var M={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  for(var k in M){ if(t.indexOf(k)>=0) return M[k]; } return null;
}
// Repair the corrupted lead date 1000% using the sheet tab as source of truth. Mera's rows import
// day/month-swapped (a lead sourced 11 July in the "July" tab stores as "2026-11-07"). The tab tells
// the true month, so: if the stored month != tab month, the real month IS the tab month and the real
// day is the mis-parsed month slot. Falls back to the created_at heuristic when there's no tab.
function leadDateFix(raw, createdAt, sid){
  var s=String(raw||'').slice(0,10), p=s.split('-'); if(p.length!==3) return raw;
  var y=+p[0], a=+p[1], b=+p[2]; if(!y||!a||!b) return raw;           // a=month-slot, b=day-slot
  var tm=leadTabMonth(sid);
  if(tm){
    if(a===tm) return s;                                             // stored month already matches tab
    var dim=new Date(y,tm,0).getDate();
    if(a>=1 && a<=dim) return y+'-'+String(tm).padStart(2,'0')+'-'+String(a).padStart(2,'0'); // month=tab, day=a
  }
  return normLeadISO(raw, createdAt);                                // no tab → created_at heuristic
}
// Fallback repair (no tab): a real sheet date can't be after insert, so a future reading was swapped.
function normLeadISO(raw, createdAt){
  var s=String(raw||'').slice(0,10), p=s.split('-');
  if(p.length!==3) return raw;
  var y=+p[0], a=+p[1], b=+p[2];
  if(!y||!a||!b) return raw;
  function iso(mo,dy){ return y+'-'+String(mo).padStart(2,'0')+'-'+String(dy).padStart(2,'0'); }
  var ca=createdAt?new Date(createdAt):null;
  var asis=new Date(Date.UTC(y,a-1,b));
  if(ca && !isNaN(asis.getTime()) && asis.getTime() > ca.getTime()+86400000 && b>=1 && b<=12){
    return iso(b,a);
  }
  return iso(a,b);
}
