// ═══════════════════════════════════════════════════════════════
//  MODERN REBUILD — customisation, KPIs, trends, shell wiring
//  (additive; wraps two functions, edits no core logic)
// ═══════════════════════════════════════════════════════════════
(function(){
  var PREF_KEY='shifttrack_ui_prefs';
  var ACCENTS=[['violet','#7c6cff'],['blue','#4d82f3'],['emerald','#20c997'],['amber','#eab24a'],['rose','#f2647f']];
  // 'keepa' was a switch for a card that doesn't exist; 'month' is a real card that had no
  // switch — so one toggle did nothing and one card could never be hidden.
  var KPI_KEYS=[['leads','Leads today'],['tasks','Tasks done'],['hrs','Hours worked'],['lph','Leads / hr'],['week','Week leads'],['streak','Submit streak'],['month','Leads this month'],['spend','Spend this month'],['keepaadd','Trackers added'],['keepawk','Keepa leads'],['over100','£100+ leads (mo)'],['premium','Premium £200-500 (mo)'],['flagship','Flagship £500+ (mo)'],['thcwk','THC discord'],['break','Break time']];
  /* EVERY key in KPI_KEYS must be here. This object listed only the original 8,
     so all seven tiles added for the new KPIs (spend, trackers, keepa leads,
     £100+, premium, flagship, THC) defaulted to undefined → applyPrefs read that
     as "off" → SIX SHIPPED VERSIONS of tiles nobody ever saw. Jack, looking at
     his live shift screen: "where are the KPIs hahaha". The verification ran the
     paint functions and read the numbers — it never once asked whether the tile
     was visible. Unknown keys now also default ON in applyPrefs as a backstop. */
  /* Jack: "is there too many KPIs here now" — yes. Week leads / Break time / Submit
   streak were the three a VA never acts on mid-shift (and Break/Streak sat bare,
   no target bar). Default OFF; any VA can flip them back on in VA Settings, and a
   VA who already saved prefs keeps exactly what they chose. */
var DEFAULTS={accent:'violet',density:'comfortable',kpi:{leads:1,tasks:1,hrs:1,lph:1,week:0,streak:0,month:1,break:0,
    spend:1,keepaadd:1,keepawk:1,over100:1,premium:1,flagship:1,thcwk:1},dailyTarget:12,weeklyTarget:60};

  function loadPrefs(){
    var p=JSON.parse(JSON.stringify(DEFAULTS));
    try{var s=JSON.parse(lsGet(PREF_KEY)||'{}');
      if(s.accent) p.accent=s.accent;
      if(s.density) p.density=s.density;
      if(s.kpi) KPI_KEYS.forEach(function(k){ if(s.kpi[k[0]]!==undefined) p.kpi[k[0]]=s.kpi[k[0]]; });
      if(s.dailyTarget!==undefined) p.dailyTarget=+s.dailyTarget||0;
      if(s.weeklyTarget!==undefined) p.weeklyTarget=+s.weeklyTarget||0;
    }catch(e){}
    return p;
  }
  function savePrefs(){ try{lsPut(PREF_KEY,JSON.stringify(PREFS));}catch(e){} }
  var PREFS=loadPrefs();

  function applyPrefs(){
    var r=document.documentElement;
    r.setAttribute('data-accent',PREFS.accent);
    r.setAttribute('data-density',PREFS.density);
    KPI_KEYS.forEach(function(k){
      var c=document.querySelector('.stat-card[data-kpi="'+k[0]+'"]');
      // undefined = a tile newer than this browser's saved prefs → show it.
      if(c) c.setAttribute('data-off', PREFS.kpi[k[0]]===0||PREFS.kpi[k[0]]===false?'1':'0');
    });
  }

  // ---------- date helpers ----------
  function fmtKey(d){var dd=('0'+d.getDate()).slice(-2),mm=('0'+(d.getMonth()+1)).slice(-2);return dd+'/'+mm+'/'+d.getFullYear();}
  function parseKey(k){try{var p=(''+k).split('/');return new Date(+p[2],+p[1]-1,+p[0]);}catch(e){return null;}}
  function todayKey(){ try{ return (typeof mgr_ukToday==='function')?mgr_ukToday():fmtKey(new Date()); }catch(e){ return fmtKey(new Date()); } }
  function getLog(){ try{ return mgr_getLog(); }catch(e){ return []; } }

  function leadsSeries(va,n){
    var log=getLog().filter(function(r){return r.va===va;});
    var byDay={}; log.forEach(function(r){ var k=r.date; byDay[k]=(byDay[k]||0)+(parseInt(r.totalLeads)||0); });
    var base=parseKey(todayKey())||new Date();
    var out=[];
    for(var i=n-1;i>=0;i--){ var d=new Date(base); d.setDate(base.getDate()-i); out.push(byDay[fmtKey(d)]||0); }
    return out;
  }
  function streakFor(va){
    var log=getLog().filter(function(r){return r.va===va;});
    var days={}; log.forEach(function(r){ days[r.date]=1; });
    var base=parseKey(todayKey())||new Date(); var c=0;
    // if today not submitted yet, start counting from yesterday
    var start = days[fmtKey(base)] ? 0 : 1;
    for(var i=start;i<400;i++){ var d=new Date(base); d.setDate(base.getDate()-i); if(days[fmtKey(d)]) c++; else break; }
    return c;
  }
  function weekLeads(va){
    var s=leadsSeries(va,7); return s.reduce(function(a,b){return a+b;},0);
  }

  // ---------- sparkline svg ----------
  function sparkSVG(vals){
    if(!vals||!vals.length) vals=[0];
    var w=100,h=26,max=Math.max.apply(null,vals),min=Math.min.apply(null,vals);
    if(max===min){max=min+1;}
    var step=vals.length>1?w/(vals.length-1):0;
    var pts=vals.map(function(v,i){var x=(i*step).toFixed(1);var y=(h-2-((v-min)/(max-min))*(h-6)).toFixed(1);return x+','+y;});
    var line='M'+pts.join(' L');
    var area=line+' L'+w+','+h+' L0,'+h+' Z';
    return '<svg class="kpi-spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><path class="area" d="'+area+'"/><path class="line" d="'+line+'"/></svg>';
  }
  function deltaChip(cur,prev){
    var d=cur-prev, cls=d>0?'up':(d<0?'down':'flat'), arr=d>0?'\u2191':(d<0?'\u2193':'\u2192');
    return '<span class="kpi-delta '+cls+'">'+arr+' '+(d>0?'+':'')+d+'</span>';
  }

  // ---------- shift KPI extras ----------
  window.renderShiftKpiExtras=function(){
    try{
      var va=(window.state&&state.currentVA)||null; if(!va) return;
      var real = va==='Mera'||va==='Suz';
      var leadsNow=parseInt((document.getElementById('stat-leads')||{}).textContent)||0;
      var hrsNow=parseFloat((document.getElementById('stat-hrs')||{}).textContent)||0;
      // leads card: sparkline + daily target progress
      var e;
      e=document.getElementById('kpi-leads-extra');
      if(e){
        var series=real?leadsSeries(va,10):[]; series.push(leadsNow);
        var dt=PREFS.dailyTarget||0; try{var _st=getAppSettings(); if(va==='Mera'&&_st.goalMera) dt=_st.goalMera; if(va==='Suz'&&_st.goalSuz) dt=_st.goalSuz;}catch(_){} var pct=dt>0?Math.min(100,Math.round(leadsNow/dt*100)):0;
        var prev=real?(function(){var s=leadsSeries(va,2);return s[0];})():0;
        e.innerHTML=(real?sparkSVG(series):'')
          +(dt>0?'<div class="kpi-prog"><i style="width:'+pct+'%"></i></div><div class="kpi-meta"><span><b>'+leadsNow+'</b> / '+dt+' goal</span><span>'+pct+'%</span></div>'
                :'<div class="kpi-meta"><span>vs yesterday</span>'+(real?deltaChip(leadsNow,prev):'')+'</div>');
      }
      e=document.getElementById('kpi-hrs-extra');
      if(e){
        var target=8; try{target=(getAppSettings().dailyHoursTarget)||8;}catch(_){}
        var hp=target>0?Math.min(100,Math.round(hrsNow/target*100)):0;
        e.innerHTML='<div class="kpi-prog"><i style="width:'+hp+'%"></i></div><div class="kpi-meta"><span><b>'+hrsNow.toFixed(1)+'</b> / '+target+'h</span><span>'+hp+'%</span></div>';
      }
      e=document.getElementById('kpi-tasks-extra');
      if(e){
        var all=(window.state?state.tasks.concat(state.extraTasks):[]); var total=all.length||0; var done=all.filter(function(t){return t.done;}).length;
        var tp=total>0?Math.round(done/total*100):0;
        e.innerHTML='<div class="kpi-prog"><i style="width:'+tp+'%"></i></div><div class="kpi-meta"><span><b>'+done+'</b> / '+total+' done</span><span style="color:var(--k);font-weight:800;font-size:13px;">'+tp+'%</span></div>';
      }
      e=document.getElementById('kpi-lph-extra');
      if(e){ e.innerHTML='<div class="kpi-meta"><span>this shift</span><span><b>'+((document.getElementById('stat-lph')||{}).textContent||'-')+'</b> /hr</span></div>'; }
      // WEEK leads: last 7 days + today live, with sparkline
      var wc=document.getElementById('stat-week'), we=document.getElementById('kpi-week-extra');
      if(wc){
        if(!real){
          // a confident 0 next to a strip saying 51 reads as broken maths — on Test
          // profiles there are no submitted shifts to count, so say nothing instead
          wc.textContent='—';
          if(we) we.innerHTML='<div class="kpi-meta"><span>from submitted shifts</span><span>none on this profile</span></div>';
        } else {
          var wtot=weekLeads(va)+leadsNow;
          wc.textContent=wtot;
          if(we){ var s7=leadsSeries(va,7); s7.push(leadsNow);
            we.innerHTML=sparkSVG(s7)+'<div class="kpi-meta"><span title="Counted from submitted shifts, rolling 7 days — the sheet numbers above use Mon-start weeks">last 7 days · shifts</span><span><b>'+wtot+'</b> leads</span></div>'; }
        }
      }
      // KEEPA added today
      var kc=document.getElementById('stat-keepa'), ke=document.getElementById('kpi-keepa-extra');
      if(kc){
        var kv={count:0,total:0}; try{ if(typeof keepaGetValues==='function') kv=keepaGetValues(); }catch(_){}
        kc.textContent=kv.count||0;
        if(ke) ke.innerHTML='<div class="kpi-meta"><span>added today</span><span><b>'+((kv.total||0).toLocaleString())+'</b> total</span></div>';
      }
      // BREAK time this shift
      var brc=document.getElementById('stat-break'), bre=document.getElementById('kpi-break-extra');
      if(brc){
        var bmin=window.state?Math.round((state.totalBreakMs||0)/60000):0;
        var nB=window.state&&state.breaks?state.breaks.length:0;
        brc.textContent=bmin;
        if(bre) bre.innerHTML='<div class="kpi-meta"><span>'+nB+' break'+(nB===1?'':'s')+'</span><span>'+(window.state&&state.onBreak?'on break now':'minutes')+'</span></div>';
      }
      e=document.getElementById('kpi-streak-extra');
      if(e){ var st=real?streakFor(va):0; var sc=document.getElementById('stat-streak'); if(sc) sc.textContent=st;
        e.innerHTML='<div class="kpi-meta"><span>days in a row</span><span>'+(st>=3?'\uD83D\uDD25 on fire':(st>0?'keep going':'start today'))+'</span></div>'; }
      // LEADS this month (from the synced sheet)
      var mc=document.getElementById('stat-month'), me2=document.getElementById('kpi-month-extra');
      if(mc){
        var mcount=0;
        try{
          var vaEff=(window.state&&(state._previewAs||state.currentVA))||'';
          var code=vaEff==='Mera'?'VA M':vaEff==='Suz'?'VA S':null;
          if(code && window.leads && window.leads.length){
            var now=new Date(); var ym=now.getFullYear()+'-'+('0'+(now.getMonth()+1)).slice(-2);
            /* Rows, not products — so a re-sent ASIN counted twice and this tile read
               235 while the strip beside it read 218 for the same VA and month. Jack
               settled this once already ("you cannot find the same product twice");
               it just never reached this tile. Count distinct products. */
            var _seenM={};
            window.leads.forEach(function(l){ if(l.va!==code) return;
              try{ if(ldDupUnexplained(l)) return; }catch(e){}
              var p=String(l.date||'').split('/');
              var iso=p.length===3?(p[2]+'-'+('0'+p[1]).slice(-2)):String(l.date||'').slice(0,7);
              if(iso.slice(0,7)!==ym) return;
              var a=''; try{ a=asinKey(l); }catch(e){}
              a=a||('row'+(l.id!=null?l.id:Math.random()));
              if(!_seenM[a]){ _seenM[a]=1; mcount++; }
            });
          }
        }catch(_){}
        mc.textContent=mcount;
        if(me2){ var mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][new Date().getMonth()];
          me2.innerHTML='<div class="kpi-meta"><span>'+mn+' so far</span><span><b>'+mcount+'</b> product'+(mcount===1?'':'s')+'</span></div>'; }
      }

      /* Jack: "if there are dups with no VA note it should show here — what row
         numbers etc — from the September page onwards." Same panel as EOD, painted
         at the TOP of the shift from the moment she clocks in, so the fix happens
         during the day instead of ambushing her at submit. September-onward is
         enforced inside the predicate itself. Repaints only when the count moves. */
      try{
        var _sdHost=document.getElementById('shift-dups');
        if(_sdHost){
          var _sdVa=(window.state&&(state._previewAs||state.currentVA))||'';
          if(_sdVa==='Mera'||_sdVa==='Suz'){
            var _sdN=eodDupList(_sdVa).length;
            if(_sdN!==window._sdLastN){
              window._sdLastN=_sdN;
              _sdHost.innerHTML=_sdN?eodDupCheckHTML(_sdVa):'';
            }
          }
        }
      }catch(_){}

      /* ── KEEPA TRACKERS + THC DISCORD — this week vs the weekly target ─────────
         Jack: "get it in shift track" — the brief rows only show when Details is open,
         and a target nobody can see is not a target. These two sit in the KPI grid
         with the same green/amber/red rule, so the VA watches herself close the gap.
         Same source matcher as vaTally — THC is spelt three ways in the sheets. */
      try{
        var _kc3=document.getElementById('stat-keepawk'), _tc3=document.getElementById('stat-thcwk');
        if(_kc3||_tc3){
          var _vaE3=(window.state&&(state._previewAs||state.currentVA))||'';
          if(_vaE3==='Mera'||_vaE3==='Suz'){
            var _code3=_vaE3==='Mera'?'VA M':'VA S';
            var _monW=(function(){ var d=new Date(); var dw=(d.getDay()+6)%7;
              d.setDate(d.getDate()-dw); d.setHours(0,0,0,0); return d; })();
            var _wkK=0,_wkT=0;
            (window.leads||[]).forEach(function(l){
              if(l.va!==_code3) return;
              try{ if(ldDupUnexplained(l)) return; }catch(e){}
              var pp=String(l.date||'').split('/'); if(pp.length!==3) return;
              var dd=new Date(+pp[2],+pp[1]-1,+pp[0]); if(!(dd>=_monW)) return;
              var sr=String(l.src||'').toLowerCase();
              if(sr.indexOf('keepa')>=0) _wkK++;
              if(sr.indexOf('thc')>=0||sr.indexOf('discord')>=0) _wkT++;
            });
            var _T3=vaTargets(_vaE3);
            var _paintWk=function(cell,exId,count,target){
              if(!cell) return;
              var pct=target>0?count/target*100:0, col=vaKpiCol(pct);
              cell.textContent=count; cell.style.color=col;
              var ex=document.getElementById(exId);
              if(ex) ex.innerHTML='<div class="kpi-prog"><i style="width:'+Math.min(100,Math.round(pct))+'%;background:'+col+'"></i></div>'
                +'<div class="kpi-meta"><span><b>'+count+'</b> / '+target+' this week</span><span>'+Math.round(pct)+'%</span></div>';
            };
            _paintWk(_kc3,'kpi-keepawk-extra',_wkK,_T3.keepaWk);
            _paintWk(_tc3,'kpi-thcwk-extra',_wkT,_T3.thcWk);
            /* trackers ADDED = this week's submitted shifts (cloud) + today's live box.
               window._vaHours is filled by the brief's vaWeekHours fetch; until it
               lands, the tile shows today's count rather than a fake zero week. */
            var _ka3=((window._vaHours&&window._vaHours.keepaAdded)||0)
              +((window.state&&!state.submitted&&typeof keepaGetValues==='function')?(keepaGetValues().count||0):0);
            _paintWk(document.getElementById('stat-keepaadd'),'kpi-keepaadd-extra',_ka3,_T3.keepaAddWk);
            /* sale-price bands — cumulative, same as vaTally */
            /* all three ticket KPIs are monthly now — counted below with premium
               and flagship, from the 1st. */
            /* premium and flagship are MONTHLY targets, so they count from the 1st,
               not from Monday — a monthly quota shown against a weekly count would
               read as failing for the first three weeks of every month. */
            var _m1=new Date(); _m1=new Date(_m1.getFullYear(),_m1.getMonth(),1);
            var _prem=0,_flag=0,_o100=0;
            (window.leads||[]).forEach(function(l){
              if(l.va!==_code3) return;
              try{ if(ldDupUnexplained(l)) return; }catch(e){}
              var pp=String(l.date||'').split('/'); if(pp.length!==3) return;
              var dd=new Date(+pp[2],+pp[1]-1,+pp[0]); if(!(dd>=_m1)) return;
              var sp=parseFloat(l.sell)||0;
              if(sp>=100) _o100++;
              if(sp>=200&&sp<500) _prem++;
              if(sp>=500) _flag++;
            });
            var _paintMo=function(cell,exId,count,target){
              if(!cell) return;
              var pct=target>0?count/target*100:0, col=vaKpiCol(pct);
              cell.textContent=count; cell.style.color=col;
              var ex=document.getElementById(exId);
              if(ex) ex.innerHTML='<div class="kpi-prog"><i style="width:'+Math.min(100,Math.round(pct))+'%;background:'+col+'"></i></div>'
                +'<div class="kpi-meta"><span><b>'+count+'</b> / '+target+' this month</span><span>'+Math.round(pct)+'%</span></div>';
            };
            _paintMo(document.getElementById('stat-over100'),'kpi-over100-extra',_o100,_T3.over100Mo);
            _paintMo(document.getElementById('stat-premium'),'kpi-premium-extra',_prem,_T3.premiumMo);
            _paintMo(document.getElementById('stat-flagship'),'kpi-flagship-extra',_flag,_T3.flagshipMo);
          }
        }
      }catch(_){}

      /* ── SPEND THIS MONTH ──────────────────────────────────────────────────────
         Read from the PURCHASE LEDGER — the same sheet, columns and provider split
         the Spend Dashboard uses — not from lead buy-prices. The two were telling
         different stories: the VA panel showed Mera £5,331 for August while the
         dashboard showed £6,761 for the same month, because the panel was summing
         quoted buy price x an assumed quantity on leads marked bought, and the
         ledger is what was actually paid. On a screen about money, the money has to
         be the real number. */
      try{
        var _spC=document.getElementById('stat-spend'), _spE=document.getElementById('kpi-spend-extra');
        if(_spC){
          var _spVa=(window.state&&(state._previewAs||state.currentVA))||'';
          if(!_spVa || _spVa==='Test'){ _spC.textContent='\u2014'; }
          else vaMonthSpendFetch(_spVa).then(function(r){
            var c=document.getElementById('stat-spend'), e2=document.getElementById('kpi-spend-extra');
            if(!c) return;
            var mn2=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][new Date().getMonth()];
            if(!r){ c.textContent='\u2014';
              if(e2) e2.innerHTML='<div class="kpi-meta"><span>'+mn2+' so far</span><span>not available</span></div>';
              return; }
            c.innerHTML='<span style="font-size:.62em;opacity:.55;vertical-align:.12em">\u00a3</span>'
              +Math.round(r.spend).toLocaleString();
            if(e2) e2.innerHTML='<div class="kpi-meta"><span title="From the purchase ledger — money actually paid, not quoted lead prices">'+mn2+' paid (ledger)</span><span><b>'
              +r.units.toLocaleString()+'</b> unit'+(r.units===1?'':'s')+'</span></div>';
          });
        }
      }catch(_){}
      // ── STATUS COLOURS on target-based KPIs: green on/above, amber just below, red below ──
      try{
        var _s=getAppSettings();
        var _vaE=(window.state&&(state._previewAs||state.currentVA))||'';
        // Pace against how far through the shift they actually ARE. Judging progress
        // against the WHOLE day's target from minute one painted the entire screen red
        // at 00:00:07 — which is not feedback, it's just a telling-off for showing up.
        var _shiftPct=0;
        try{
          var _tgt=(+_s.dailyHoursTarget||8)*3600000;
          var _el=(window.state&&state.shiftStart)?(Date.now()-state.shiftStart-(state.totalBreakMs||0)):0;
          _shiftPct=_tgt>0?Math.max(0,Math.min(1,_el/_tgt)):0;
        }catch(_e){}
        // first ~30 min of a shift: neutral, there is nothing meaningful to judge yet
        var _early=_shiftPct<0.06;
        function _sc(done,target){
          if(_early||target<=0) return '';                       // '' = fall back to the tile's own colour
          var expected=target*_shiftPct;                          // where they should be BY NOW
          if(done>=target) return '#10d99a';                      // day's target already hit
          if(expected<=0) return '';
          var r=done/expected;
          return r>=0.95?'#10d99a':r>=0.7?'#f5a524':'#f5455f';
        }
        function _paint(sel,done,target,fallback){
          var el=document.querySelector(sel); if(!el) return;
          var c=_sc(done,target);
          if(c) el.style.setProperty('--k',c); else el.style.setProperty('--k',fallback);
        }
        var _goal=_vaE==='Mera'?(_s.goalMera||12):_vaE==='Suz'?(_s.goalSuz||12):12;
        _paint('.stat-card-leads',leadsNow,_goal,'#10d99a');
        var _allT=(window.state?state.tasks.concat(state.extraTasks):[]); var _tot=_allT.length; var _don=_allT.filter(function(t){return t.done;}).length;
        _paint('.stat-card-tasks',_don,_tot,'#8b5cff');
      }catch(_){}
    }catch(err){}
  };

  // ---------- customise panel ----------
  window.openCustomise=function(){ buildCustomise(); document.getElementById('cz-overlay').classList.add('open'); document.getElementById('cz-panel').classList.add('open'); };
  window.closeCustomise=function(){ document.getElementById('cz-overlay').classList.remove('open'); document.getElementById('cz-panel').classList.remove('open'); };
  window.czSaveTargets=function(){ var d=document.getElementById('cz-daily'),w=document.getElementById('cz-weekly'); if(d) PREFS.dailyTarget=+d.value||0; if(w) PREFS.weeklyTarget=+w.value||0; savePrefs(); try{renderShiftKpiExtras();}catch(e){} };
  function buildCustomise(){
    var sw=document.getElementById('cz-swatches'); sw.innerHTML='';
    ACCENTS.forEach(function(a){ var b=document.createElement('button'); b.className='cz-sw'+(PREFS.accent===a[0]?' on':''); b.style.background=a[1]; b.title=a[0];
      b.onclick=function(){ PREFS.accent=a[0]; savePrefs(); applyPrefs(); buildCustomise(); }; sw.appendChild(b); });
    document.querySelectorAll('#cz-density button').forEach(function(b){ b.classList.toggle('on', b.dataset.v===PREFS.density);
      b.onclick=function(){ PREFS.density=b.dataset.v; savePrefs(); applyPrefs(); buildCustomise(); }; });
    var kc=document.getElementById('cz-kpis'); kc.innerHTML='';
    KPI_KEYS.forEach(function(k){ var row=document.createElement('div'); row.className='cz-toggle';
      row.innerHTML='<span>'+k[1]+'</span>';
      var swi=document.createElement('button'); swi.className='cz-switch'+(PREFS.kpi[k[0]]?' on':'');
      swi.onclick=function(){ PREFS.kpi[k[0]]=PREFS.kpi[k[0]]?0:1; savePrefs(); applyPrefs(); swi.classList.toggle('on'); };
      row.appendChild(swi); kc.appendChild(row); });
    var _cd=document.getElementById('cz-daily'); if(_cd) _cd.value=PREFS.dailyTarget;
    var _cw=document.getElementById('cz-weekly'); if(_cw) _cw.value=PREFS.weeklyTarget;
    document.querySelectorAll('#cz-layout button').forEach(function(b){b.classList.toggle('on',b.dataset.v===(lsGet('st_layout')||'auto'));});
  }

  // ---------- trends tab ----------
  var trendCharts={};
  window.mgr_leadInsightsHTML=function(){
    var all=(window.leads||[]);
    if(!all.length) return '<div class="mgr-section">Lead insights</div><div style="color:var(--muted-2);font-size:13px;padding:6px 0 16px;">No leads loaded yet. Open the Leads tab once (or wait for the 60s sync) and this fills with buy-rate, sourcing and retailer performance.</div>';
    function isBought(l){return l.status==='bought'||l.status==='atbq'||l.status==='atba2a';}
    var decided=all.filter(function(l){return l.islead!==null;});
    var bought=all.filter(isBought);
    var buyRate=decided.length?Math.round(bought.length/decided.length*100):0;
    var pending=all.filter(function(l){return l.islead===null&&!l.status;}).length;
    // a lead without a score object used to blow up the whole Insights tab
    var avg=all.length?(all.reduce(function(a,l){return a+((l._sc&&l._sc.total)||0);},0)/all.length).toFixed(1):'-';
    function vaFunnel(vaCode,name,col){
      var v=all.filter(function(l){return l.va===vaCode;});
      var vd=v.filter(function(l){return l.islead!==null;});
      var vb=v.filter(isBought);
      var br=vd.length?Math.round(vb.length/vd.length*100):0;
      return '<div class="mgr-tile" style="--k:'+col+'"><div class="mgr-tile-label">'+name+' — buy rate</div><div class="mgr-tile-val val-lg">'+br+'%</div><div class="mgr-tile-sub">'+v.length+' leads · '+vb.length+' bought · '+vd.reduce(function(a,l){return a+(l.islead?1:0);},0)+' leads</div></div>';
    }
    function grpRow(label,n,b,d,max){
      var rate=d?Math.round(b/d*100):0;
      var col=rate>=40?'#10d99a':rate>=20?'#f5a524':'#f5455f';
      return '<div style="display:grid;grid-template-columns:160px 1fr 132px;gap:12px;align-items:center;padding:8px 0;border-top:1px solid var(--line);">'
        +'<span style="font-size:12.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+label+'</span>'
        +'<div style="height:9px;border-radius:5px;background:rgba(255,255,255,.07);overflow:hidden;"><i style="display:block;height:100%;width:'+Math.round(n/max*100)+'%;border-radius:5px;background:var(--accent);"></i></div>'
        +'<span style="font-family:var(--font-mono);font-size:12px;text-align:right;"><b style="color:'+col+';">'+rate+'%</b> <span style="color:var(--muted-2);">buy · '+n+'</span></span>'
        +'</div>';
    }
    function panel(title,rowsHtml,hint){
      return '<div class="mgr-section">'+title+(hint?'<span style="margin-left:auto;font-size:10.5px;font-weight:600;color:var(--muted-2);">'+hint+'</span>':'')+'</div>'
        +'<div style="background:var(--panel);border:1px solid var(--line-2);border-radius:14px;padding:6px 18px 14px;margin-bottom:8px;">'
        +'<div style="display:grid;grid-template-columns:160px 1fr 132px;gap:12px;font-size:9px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--muted-2);padding:8px 0 2px;"><span>Name</span><span>Volume</span><span style="text-align:right;">Buy rate</span></div>'
        +(rowsHtml||'<div style="color:var(--muted-2);font-size:12px;padding:10px 0;">No data yet.</div>')+'</div>';
    }
    function league(keyFn,title){
      var g={};
      all.forEach(function(l){ var k=keyFn(l)||'—'; (g[k]=g[k]||{n:0,b:0,d:0}); g[k].n++; if(isBought(l))g[k].b++; if(l.islead!==null)g[k].d++; });
      var arr=Object.keys(g).map(function(k){var o=g[k];return {k:k,n:o.n,b:o.b,d:o.d};});
      arr.sort(function(a,b){return b.b-a.b || b.n-a.n;});
      arr=arr.slice(0,8);
      var max=Math.max.apply(null,arr.map(function(x){return x.n;}).concat([1]));
      return panel(title, arr.map(function(x){return grpRow(x.k,x.n,x.b,x.d,max);}).join(''), 'top '+arr.length+' by buys');
    }
    function bands(title,buckets,hint){
      var groups=buckets.map(function(bk){var inb=all.filter(bk.test);return {k:bk.label,n:inb.length,b:inb.filter(isBought).length,d:inb.filter(function(l){return l.islead!==null;}).length};});
      var max=Math.max.apply(null,groups.map(function(x){return x.n;}).concat([1]));
      return panel(title, groups.map(function(x){return grpRow(x.k,x.n,x.b,x.d,max);}).join(''), hint);
    }
    function money(l,f){return parseFloat(l[f])||0;}
    function avgOf(arr,f){return arr.length?(arr.reduce(function(a,l){return a+money(l,f);},0)/arr.length):0;}
    var avgRoi=Math.round(avgOf(bought,'roi'));
    var avgMargin=Math.round(avgOf(bought,'margin'));
    var avgProfit=avgOf(bought,'profit');
    function ld(l){var s=String(l.date||'');var m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return new Date(+m[1],+m[2]-1,+m[3]);var p=s.split('/');if(p.length===3)return new Date(+p[2],+p[1]-1,+p[0]);return null;}
    var now=new Date();var d7=new Date(now);d7.setDate(d7.getDate()-7);var d14=new Date(now);d14.setDate(d14.getDate()-14);
    var last7=all.filter(function(l){var d=ld(l);return d&&d>d7;});
    var prev7=all.filter(function(l){var d=ld(l);return d&&d>d14&&d<=d7;});
    var mom=prev7.length?Math.round((last7.length-prev7.length)/prev7.length*100):0;
    var momTxt=prev7.length?((mom>=0?'+':'')+mom+'% vs prior 7d'):'vs prior 7d';
    var pend=all.filter(function(l){return l.islead===null&&!l.status;}).sort(function(a,b){return ((b._sc&&b._sc.total)||0)-((a._sc&&a._sc.total)||0);}).slice(0,6);
    var oppRows=pend.map(function(l){
      return '<div onclick="showLeadsView()" style="cursor:pointer;display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:9px 0;border-top:1px solid var(--line);">'
        +'<span style="font-size:12.5px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+escHtml(l.title||'—')+'</span>'
        +'<span style="font-family:var(--font-mono);font-size:11.5px;color:var(--muted-2);white-space:nowrap;">★ '+((l._sc&&l._sc.total)||0)+' · '+Math.round(money(l,'roi'))+'% ROI · £'+Math.round(money(l,'profit'))+'</span></div>';
    }).join('');
    /* ── Filter performance — which saved filters are actually producing ──
       Exact: opens + leads the VA logged against each filter.
       Estimated: that VA-day's buys shared out in proportion to the leads each
       filter produced that day (labelled as an estimate — leads don't carry a
       filter id). NOTHING here bins or archives anything: Jack decides. */
    function filterPerfHTML(){ return filterRepeatPanel()+filterPerfPanel(); }
    return '<div class="mgr-section">Lead insights — from your live sheets</div>'
      +'<div class="mgr-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:8px;">'
        +'<div class="mgr-tile tile-purple"><div class="mgr-tile-label">Total leads</div><div class="mgr-tile-val val-lg">'+all.length+'</div><div class="mgr-tile-sub">'+pending+' pending review</div></div>'
        +'<div class="mgr-tile tile-cyan"><div class="mgr-tile-label">Buy rate</div><div class="mgr-tile-val val-lg">'+buyRate+'%</div><div class="mgr-tile-sub">'+bought.length+' of '+decided.length+' decided</div></div>'
        +'<div class="mgr-tile tile-green"><div class="mgr-tile-label">Bought</div><div class="mgr-tile-val val-lg">'+bought.length+'</div><div class="mgr-tile-sub">converted leads</div></div>'
        +'<div class="mgr-tile tile-amber"><div class="mgr-tile-label">Avg score</div><div class="mgr-tile-val val-lg">'+avg+'</div><div class="mgr-tile-sub">out of 10</div></div>'
      +'</div>'
      +'<div class="mgr-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:8px;">'
        +'<div class="mgr-tile tile-teal"><div class="mgr-tile-label">Avg ROI · bought</div><div class="mgr-tile-val val-lg">'+avgRoi+'%</div><div class="mgr-tile-sub">what you actually buy</div></div>'
        +'<div class="mgr-tile tile-teal"><div class="mgr-tile-label">Avg margin · bought</div><div class="mgr-tile-val val-lg">'+avgMargin+'%</div><div class="mgr-tile-sub">net on bought leads</div></div>'
        +'<div class="mgr-tile tile-navy"><div class="mgr-tile-label">Avg profit / unit</div><div class="mgr-tile-val val-lg">£'+avgProfit.toFixed(0)+'</div><div class="mgr-tile-sub">on bought leads</div></div>'
        +'<div class="mgr-tile '+(mom>=0?'tile-green':'tile-red')+'"><div class="mgr-tile-label">Leads last 7 days</div><div class="mgr-tile-val val-lg">'+last7.length+'</div><div class="mgr-tile-sub">'+momTxt+'</div></div>'
      +'</div>'
      +'<div class="mgr-grid-2" style="margin-bottom:8px;">'+vaFunnel('VA M','Mera','var(--mera)')+vaFunnel('VA S','Suz','var(--suz)')+'</div>'
      +bands('Score bands — does the score predict buys?',[
          {label:'9–10 ★',test:function(l){return ((l._sc&&l._sc.total)||0)>=9;}},
          {label:'7–8',test:function(l){var v=(l._sc&&l._sc.total)||0;return v>=7&&v<9;}},
          {label:'5–6',test:function(l){var v=(l._sc&&l._sc.total)||0;return v>=5&&v<7;}},
          {label:'Under 5',test:function(l){return ((l._sc&&l._sc.total)||0)<5;}}
        ],'buy rate should climb with score')
      +league(function(l){return l.src;},'Sourcing methods — what converts')
      +filterPerfHTML()
      +league(function(l){return l.store;},'Retailers — what converts')
      +league(function(l){return l.cat;},'Categories — what converts')
      +bands('Cost-price bands — where your buys sit',[
          {label:'£0–10',test:function(l){return money(l,'buy')>0&&money(l,'buy')<10;}},
          {label:'£10–25',test:function(l){return money(l,'buy')>=10&&money(l,'buy')<25;}},
          {label:'£25–50',test:function(l){return money(l,'buy')>=25&&money(l,'buy')<50;}},
          {label:'£50+',test:function(l){return money(l,'buy')>=50;}}
        ],'by source price')
      +(oppRows?('<div class="mgr-section">Top unreviewed — highest score, decide these<span style="margin-left:auto;font-size:10.5px;font-weight:600;color:var(--accent-2);cursor:pointer;" onclick="showLeadsView()">Open Leads →</span></div>'
        +'<div style="background:var(--panel);border:1px solid var(--line-2);border-radius:14px;padding:6px 18px 14px;margin-bottom:8px;">'+oppRows+'</div>'):'');
  };
  /* ── WHERE LEADS ACTUALLY COME FROM ──────────────────────────────────────────
     Buckets every completed task across every submitted shift by the KIND of work
     it is, then ranks by volume AND by leads-per-hour — because the two orders are
     very different, and only one of them tells you where to spend the next hour. */
  function srcBucket(name,id){
    var s=((name||'')+' '+(id||'')).toLowerCase();
    function has(){ for(var i=0;i<arguments.length;i++){ if(s.indexOf(arguments[i])>=0) return true; } return false; }
    // A From-Jack item is not a source in itself — it's a DELIVERY of one. Classify by
    // the work it actually is (KPF, storefront, EU sheet…) and mark the origin, so
    // "KPF · from Jack" sits next to plain KPF rather than in a meaningless pile.
    // Only genuinely unidentifiable ones fall back to a single generic row.
    var fromJack=has('from jack','jbitem','sbatch','jack poa');
    // Split kept (Jack wants his KPF separate from theirs) — just labelled from HIS
    // point of view, since this is his dashboard: "KPF filters · from you".
    function J(label,icon){ return fromJack?[label+' \u00b7 from you',icon]:[label,icon]; }
    if(has('storefront')) return J('Storefronts','\u{1F3EC}');
    // THC is one of Jack's main categories, not a stray — it was falling through to
    // "Other: THC" and reading as noise at the bottom of the table.
    if(has('thc')) return J('THC','\u{1F9EA}');
    // NOT 'eu +' / 'eu+' — Jack: those appear in NOTES on ordinary KPF work and would
    // drag normal filter runs into the EU-sheet bucket.
    if(has('eu asin','eu asins','euasin')) return J('EU ASIN lists','\u{1F1EA}\u{1F1FA}');
    if(has('eu sheet','eu-sheet','suz-eu','eu sheets')) return J('EU sheets','\u{1F1EA}\u{1F1FA}');
    if(has('kpf','keepa product finder')) return J('KPF filters','\u{1F3AF}');
    if(has('profitpath','pp main','pp light','deal watch')) return J('ProfitPath','\u{1F4C9}');
    if(has('telegram')) return J('Telegram','✈️');
    if(has('newsletter')) return J('Newsletters','\u{1F4F0}');
    if(has('high ticket','a2a','arbitrage')) return J('High Ticket / A2A','\u{1F501}');
    if(has('sourcing period','own sourcing','sourcing')) return J('Own sourcing time','\u{1F50D}');
    if(has('asin')) return ['ASINs from Jack','#'];
    if(has('lead sheet','leadsheet')) return ['Lead sheet admin','\u{1F4CB}'];
    if(has('oos')) return ['OOS sheet','\u{1F4E6}'];
    if(has('poa','missed')) return ['Jack POA / missed','\u{1F4CC}'];
    // unidentifiable From-Jack items share ONE row instead of one row each — their names
    // are auto-generated (stately-pixie, A2LR4YUQ7USEVO) so they can never aggregate.
    if(fromJack) return ['Other \u00b7 from you','\u{1F4E3}'];
    return ['Other: '+String(name||'?').slice(0,26),'●'];
  }
  function srcMins(t){
    var h=parseInt(t.timeHrs)||0, m=parseInt(t.timeMins)||0;
    if(h||m) return h*60+m;
    var str=String(t.time||''); var hm=str.match(/(\d+)\s*h/), mm=str.match(/(\d+)\s*m/);
    return (hm?parseInt(hm[1])*60:0)+(mm?parseInt(mm[1]):0);
  }
  /* Default 30 days. All-time meant 119 shifts of history dominating the ranking, so a
     source Jack dropped months ago still looked significant and a recent change took
     weeks to show. He wants the last 30 as the answer, with the option to widen. */
  var SRC_DAYS=30;
  window.mgr_srcDaysSet=function(d){
    SRC_DAYS=d;
    try{ var h=document.getElementById('src-mix'); if(h) h.innerHTML=mgr_sourceMixHTML(SRC_DAYS); }catch(e){}
  };
  function mgr_sourceMixHTML(days){
    days=(days===undefined)?SRC_DAYS:days;
    var log=mgr_getLog(); if(!log.length) return '';
    var cut=null;
    if(days){ cut=new Date(); cut.setDate(cut.getDate()-days); }
    var agg={}, zeros={}, shifts=0;
    log.forEach(function(r){
      if(cut){ var d=parseKey(r.date); if(d && d<cut) return; }
      shifts++;
      ((r.tasks)||[]).forEach(function(t){
        if(!t.done) return;
        var b=srcBucket(t.name,t.id), k=b[0];
        var a=agg[k]||(agg[k]={icon:b[1],leads:0,mins:0,runs:0,zero:0,mera:0,suz:0});
        var L=parseInt(t.leads)||0;
        a.leads+=L; a.mins+=srcMins(t); a.runs++;
        if(L===0) a.zero++;
        if(r.va==='Mera') a.mera+=L; else if(r.va==='Suz') a.suz+=L;
        if(L===0 && t.zeroReason){ (zeros[k]=zeros[k]||{})[t.zeroReason]=((zeros[k]||{})[t.zeroReason]||0)+1; }
      });
    });
    var rows=Object.keys(agg).map(function(k){ var a=agg[k]; return {k:k,a:a,hrs:a.mins/60,lph:a.mins>3?a.leads/(a.mins/60):0}; });
    if(!rows.length) return '';
    var tot=rows.reduce(function(x,r){return x+r.a.leads;},0);
    var totH=rows.reduce(function(x,r){return x+r.hrs;},0);
    if(!tot) return '';
    var byVol=rows.slice().sort(function(x,y){return y.a.leads-x.a.leads;});
    var byEff=rows.filter(function(r){return r.hrs>=1&&r.a.leads>0;}).sort(function(x,y){return y.lph-x.lph;});
    var best=byEff[0], maxLph=byEff.length?byEff[0].lph:0;
    function bar(w,col){ return '<span class="sm-bar"><i style="width:'+Math.max(2,Math.round(w))+'%;background:'+col+'"></i></span>'; }
    var head='<div class="mgr-section">Where leads actually come from'
      +'<span style="margin-left:auto;display:flex;align-items:center;gap:8px;">'
        +'<span style="font-size:10.5px;font-weight:600;color:var(--muted-2);">'
          +shifts+' shifts &#183; '+tot.toLocaleString()+' leads &#183; '+Math.round(totH)+'h logged</span>'
        +[30,90,0].map(function(d){
            return '<button class="sbp-t'+(days===d?' on':'')+'" onclick="mgr_srcDaysSet('+d+')">'
              +(d?d+'d':'All')+'</button>';
          }).join('')
      +'</span></div>';
    var verdict='';
    if(best){
      var worst=byEff[byEff.length-1];
      verdict='<div class="sm-verdict"><b>'+best.a.icon+' '+best.k+'</b> is your best hour-for-hour at <b>'+best.lph.toFixed(1)+' leads/hr</b>'
        +' &#8212; but it only gets <b>'+best.hrs.toFixed(0)+'h</b> of '+Math.round(totH)+'h.'
        +(worst&&worst!==best?' <span class="sm-dim">'+worst.a.icon+' '+worst.k+' is the slowest at '+worst.lph.toFixed(1)+'/hr.</span>':'')+'</div>';
    }
    var rowsHtml=byVol.map(function(r){
      var a=r.a, share=Math.round(a.leads/tot*100);
      var zr=zeros[r.k]?Object.keys(zeros[r.k]).sort(function(x,y){return zeros[r.k][y]-zeros[r.k][x];})[0]:'';
      var zpct=a.runs?Math.round(a.zero/a.runs*100):0;
      return '<tr>'
        +'<td class="sm-name"><span>'+a.icon+'</span>'+escHtml(r.k)+'</td>'
        +'<td class="sm-num"><b>'+a.leads.toLocaleString()+'</b></td>'
        +'<td class="sm-share">'+bar(share,'var(--accent)')+'<i>'+share+'%</i></td>'
        +'<td class="sm-num">'+(r.hrs>=1?r.hrs.toFixed(0)+'h':Math.round(a.mins)+'m')+'</td>'
        +'<td class="sm-num sm-lph">'+(r.lph>0?'<b>'+r.lph.toFixed(2)+'</b>':'&#8211;')+(maxLph>0&&r.lph>0?bar(r.lph/maxLph*100,r.lph>=maxLph*0.7?'var(--green)':r.lph>=maxLph*0.35?'var(--amber)':'var(--red)'):'')+'</td>'
        +'<td class="sm-num'+(zpct>=50?' sm-hot':'')+'">'+zpct+'%'+(zr?'<i class="sm-why">'+escHtml(zr)+'</i>':'')+'</td>'
        +'<td class="sm-split"><span style="color:#b23bff">'+a.mera+'</span><em>/</em><span style="color:'+(typeof SUZ_COL!=='undefined'?SUZ_COL:'#f2c200')+'">'+a.suz+'</span></td>'
        +'</tr>';
    }).join('');
    return head+verdict
      +'<div class="sm-wrap"><table class="sm-tbl">'
      +'<thead><tr><th>Source</th><th>Leads</th><th>Share</th><th>Hours</th><th title="Leads found per hour spent">Leads/hr</th><th title="How often a run of this finds nothing">Blank runs</th><th>Mera / Suz</th></tr></thead>'
      +'<tbody>'+rowsHtml+'</tbody></table></div>';
  }
  window.mgr_sourceMixHTML=mgr_sourceMixHTML;
  window.mgr_renderTrends=function(){
    var host=document.getElementById('mgr-trends-content'); if(!host) return;
    try{ if((window.leads||[]).length===0 && typeof loadLeadsFromDB==='function'){ loadLeadsFromDB().then(function(){
      try{ var hi=document.getElementById('lead-intel'); if(hi) hi.innerHTML=mgr_leadIntelHTML(); }catch(e){}
      try{ renderVaResults(); }catch(e){}
      try{ var h=document.getElementById('lead-insights'); if(h) h.innerHTML=mgr_leadInsightsHTML(); }catch(e){}
    }); } }catch(e){}
    // filter usage (own table) so the Filter performance panel has data
    try{ if(!window._fuCloud && typeof fuLoadCloud==='function'){ fuLoadCloud().then(function(){ try{ var h=document.getElementById('lead-insights'); if(h) h.innerHTML=mgr_leadInsightsHTML(); }catch(e){} }); } }catch(e){}
    // mgr_leadIntelHTML/mgr_leadInsightsHTML both return '' until the leads arrive, so
    // this tab used to open as a mostly-blank page with no sign anything was coming.
    var _leadsReady=(window.leads||[]).length>0;
    var leadInsights='<div id="src-mix">'+(function(){ try{ return mgr_sourceMixHTML(); }catch(e){ return ''; } })()+'</div>'
      +'<div id="lead-intel">'+(_leadsReady?mgr_leadIntelHTML():(skTiles(4)+skRows(3)))+'</div>'
      +'<div id="lead-insights">'+(_leadsReady?mgr_leadInsightsHTML():'')+'</div>'
      +(function(){ try{ return sbBuyHTML()+sbSrcFixHTML(); }catch(e){ return ''; } })()
      // moved out of Settings — your buying data belongs with the rest of the analysis
      +'<div class="mgr-section">Your buying data<span style="margin-left:auto;font-size:10.5px;font-weight:600;color:var(--muted-2);">learned from every decision you make</span></div>'
      +'<div style="background:var(--panel);border:1px solid var(--line-2);border-radius:14px;padding:14px 18px;margin-bottom:10px;"><div id="jack-insights"></div></div>';
    var mLeads=leadsSeries('Mera',14), sLeads=leadsSeries('Suz',14);
    var labels=[]; var base=parseKey(todayKey())||new Date();
    for(var i=13;i>=0;i--){var d=new Date(base);d.setDate(base.getDate()-i);labels.push(('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2));}
    var mWeek=weekLeads('Mera'), sWeek=weekLeads('Suz');
    var wt=PREFS.weeklyTarget||0, dt=PREFS.dailyTarget||0;
    var mStreak=streakFor('Mera'), sStreak=streakFor('Suz');
    var totalWeek=mWeek+sWeek;
    var wpct=wt>0?Math.min(100,Math.round(totalWeek/(wt*2)*100)):0; // both VAs
    function goal(name,val,target,col){
      var p=target>0?Math.min(100,Math.round(val/target*100)):0;
      return '<div class="goal-card"><div class="mgr-tile-label">'+name+'</div><div style="display:flex;align-items:baseline;gap:8px;"><span class="mgr-tile-val val-lg" style="color:'+col+'">'+val+'</span><span style="font-size:12px;color:var(--muted-2)">/ '+(target||'\u2014')+'</span></div><div class="goal-bar"><i style="width:'+p+'%;background:'+col+'"></i></div></div>';
    }
    /* ── the verdict strip ──────────────────────────────────────────────────
       The page was a pile of panels with no answer at the top. These four numbers
       are the ones Jack acts on: this week vs target, the decision backlog (the
       single biggest lever — it feeds the learned score AND the VAs' panels),
       buy rate, and the best source right now. Backlog is a button, not a stat. */
    var _undec=0,_buy=null,_bestSrc='';
    try{ _undec=(window.leads||[]).filter(function(l){ return l.islead===null&&!l.status; }).length; }catch(e){}
    try{ _buy=buyStats(null); }catch(e){}
    try{
      var _bs={};
      (window.leads||[]).forEach(function(l){
        if(l.status==='bought'&&l.src) _bs[l.src]=(_bs[l.src]||0)+1;
      });
      _bestSrc=Object.keys(_bs).sort(function(a,b){return _bs[b]-_bs[a];})[0]||'';
    }catch(e){}
    var verdict='<div class="ins-verdict">'
      +'<div class="ins-v"><em>This week</em><b>'+totalWeek+'</b><span>of '+(wt*2||'—')+' target</span>'
        +'<div class="ins-vbar"><i style="width:'+wpct+'%"></i></div></div>'
      +'<div class="ins-v'+(_undec>100?' bad':'')+'"><em>Waiting on you</em><b>'+_undec+'</b><span>undecided leads</span>'
        +'<button onclick="_openLeads()">Decide some &#8594;</button></div>'
      +'<div class="ins-v"><em>Buy rate</em><b>'+(_buy?_buy.rate+'%':'—')+'</b><span>'+(_buy?_buy.b+' of '+_buy.d+' decided':'decide leads to see this')+'</span></div>'
      +'<div class="ins-v"><em>Best source</em><b class="ins-vsm">'+(_bestSrc?escHtml(_bestSrc):'—')+'</b><span>most bought from</span></div>'
      +'</div>';

    host.innerHTML=verdict
      +'<div class="mgr-section">Goal progress</div>'
      +'<div class="mgr-grid-3">'
        +goal('Mera \u00b7 this week',mWeek,wt,'var(--mera)')
        +goal('Suz \u00b7 this week',sWeek,wt,'var(--suz)')
        +goal('Combined week',totalWeek,wt*2,'var(--accent)')
      +'</div>'
      +'<div class="mgr-grid">'
        +'<div class="mgr-tile tile-mera"><div class="mgr-tile-label">Mera streak</div><div class="mgr-tile-val val-lg">'+mStreak+'</div><div class="mgr-tile-sub">days submitted</div></div>'
        +'<div class="mgr-tile tile-suz"><div class="mgr-tile-label">Suz streak</div><div class="mgr-tile-val val-lg">'+sStreak+'</div><div class="mgr-tile-sub">days submitted</div></div>'
        +'<div class="mgr-tile tile-green"><div class="mgr-tile-label">Leads (14d)</div><div class="mgr-tile-val val-lg">'+(mLeads.concat(sLeads).reduce(function(a,b){return a+b;},0))+'</div><div class="mgr-tile-sub">both VAs</div></div>'
        +'<div class="mgr-tile tile-cyan"><div class="mgr-tile-label">Best day</div><div class="mgr-tile-val val-lg">'+Math.max.apply(null,[0].concat(mLeads,sLeads))+'</div><div class="mgr-tile-sub">single VA / day</div></div>'
      +'</div>'
      +'<div class="ins-2col">'
        +'<div><div class="mgr-section">Leads over time (14 days)</div>'
          +'<div class="trend-chart-wrap"><canvas id="trends-line" height="150"></canvas></div></div>'
        +'<div><div class="mgr-section">Per-VA comparison</div>'
          +'<div class="trend-chart-wrap"><canvas id="trends-bar" height="150"></canvas></div></div>'
      +'</div>'
      +leadInsights;

    if(typeof Chart==='undefined') return;
    try{ if(trendCharts.line) trendCharts.line.destroy(); if(trendCharts.bar) trendCharts.bar.destroy(); }catch(e){}
    var css=getComputedStyle(document.documentElement);
    var accent=css.getPropertyValue('--accent').trim()||'#7c6cff';
    var mera=css.getPropertyValue('--mera').trim()||'#b23bff', suz=css.getPropertyValue('--suz').trim()||'#f2c200';
    var grid='rgba(255,255,255,0.06)', tick='#9aa1b4';
    var lc=document.getElementById('trends-line');
    if(lc) trendCharts.line=new Chart(lc,{type:'line',data:{labels:labels,datasets:[
        {label:'Mera',data:mLeads,borderColor:mera,backgroundColor:mera+'26',fill:true,tension:.35,borderWidth:2.5,pointRadius:3,pointBackgroundColor:mera},
        {label:'Suz',data:sLeads,borderColor:suz,backgroundColor:suz+'26',fill:true,tension:.35,borderWidth:2.5,pointRadius:3,pointBackgroundColor:suz}
      ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#c6ccdb',boxWidth:12,font:{size:12,weight:'700'}}}},scales:{x:{grid:{color:grid},ticks:{color:tick,font:{size:10.5}}},y:{grid:{color:grid},ticks:{color:tick,font:{size:10.5}},beginAtZero:true}}}});
    var bc=document.getElementById('trends-bar');
    if(bc) trendCharts.bar=new Chart(bc,{type:'bar',data:{labels:['This week','14-day total'],datasets:[
        {label:'Mera',data:[mWeek,mLeads.reduce(function(a,b){return a+b;},0)],backgroundColor:mera,borderRadius:8,maxBarThickness:70},
        {label:'Suz',data:[sWeek,sLeads.reduce(function(a,b){return a+b;},0)],backgroundColor:suz,borderRadius:8,maxBarThickness:70}
      ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#c6ccdb',boxWidth:12,font:{size:12,weight:'700'}}}},scales:{x:{grid:{display:false},ticks:{color:'#c6ccdb',font:{size:12,weight:'600'}}},y:{grid:{color:grid},ticks:{color:tick,font:{size:10.5}},beginAtZero:true}}}});
    // buying data panel (moved here from Settings) needs its own render pass
    try{ if(typeof renderJackInsights==='function') renderJackInsights(); }catch(e){}
  };

  // ---------- wrap mgr_switchTab to include 'trends' ----------
  function installSwitchTab(){
    if(typeof window.mgr_switchTab!=='function'){ setTimeout(installSwitchTab,60); return; }
    /* 'leadsdash' was missing here. This wrapper REPLACES the original mgr_switchTab
       (to add Trends/Audit), so a tab the original knew but this list doesn't gets its
       container shown and its renderer never called — Jack's dashboard Leads tab was
       a permanently blank page. If you add a tab, add it in BOTH places below. */
    var KNOWN=['overview','trends','today','mera','suz','test','issues','week','mtd','live','keepa','spend','settings','perf','filters','ticklist','storefronts','audit','leadsdash'];
    window.mgr_switchTab=function(tab){
      window.mgr_currentTab=tab;
      window._jbSendPrefs={};   // leaving a VA tab resets the mini-task composer to defaults
      // opening a VA tab: pull the freshest bucket from the cloud first, then re-render the
      // composer — so Jack never pushes a stale copy over the VA's ticked-off items
      if(tab==='mera'||tab==='suz'){
        var _pv=tab==='mera'?'Mera':'Suz';
        try{ jb_cloudPull(_pv).then(function(){ try{ jb_rerender(_pv); }catch(e){} }).catch(function(){}); }catch(e){}
      }
      KNOWN.forEach(function(t){var el=document.getElementById('mgr-tab-'+t);if(el)el.style.display='none';var b=document.getElementById('tab-'+t);if(b)b.classList.remove('active-tab');});
      var el=document.getElementById('mgr-tab-'+tab);if(el)el.style.display='block';
      var ab=document.getElementById('tab-'+tab);if(ab)ab.classList.add('active-tab');
      try{
        if(tab==='overview') mgr_renderOverview();
        else if(tab==='trends') mgr_renderTrends();
        else if(tab==='audit') mgr_renderAudit();
        else if(tab==='perf') perfShow(window._perfWhich||'week');
        else if(tab==='today') mgr_renderToday();
        else if(tab==='mera') mgr_renderVA('Mera','mgr-mera-content');
        else if(tab==='suz') mgr_renderVA('Suz','mgr-suz-content');
        else if(tab==='test') mgr_renderTest();
        else if(tab==='issues') mgr_renderIssues();
        else if(tab==='week') mgr_renderWeek();
        else if(tab==='mtd') mgr_renderMTD();
        else if(tab==='live') mgr_renderLive();
        else if(tab==='keepa') mgr_renderKeepa();
        else if(tab==='spend') mgr_renderSpend();
        else if(tab==='leadsdash') mgr_renderLeadsDash();
        else if(tab==='filters') mgr_renderFilters();
        else if(tab==='ticklist') mgr_renderTicklist();
        else if(tab==='storefronts') mgr_renderStorefronts();
        else if(tab==='settings') mgr_renderSettings();
        tabScrollIntoView(tab);
      }catch(e){}
    };
  }

  // ---------- wrap updateStats to refresh KPI extras ----------
  function installUpdateStats(){
    if(typeof window.updateStats!=='function'){ setTimeout(installUpdateStats,60); return; }
    var _u=window.updateStats;
    window.updateStats=function(){ _u.apply(this,arguments); try{renderShiftKpiExtras();}catch(e){} };
  }

  // ---------- shell wiring ----------
  function initShell(){
    var shell=document.querySelector('.app-shell');
    // manager sections now live in a horizontal tab bar inside the page (single-sidebar layout)
    var mgrView=document.getElementById('view-manager');
    var leadsView=document.getElementById('view-leads');
    function sync(){
      var onM=mgrView&&mgrView.classList.contains('active');
      var onL=leadsView&&leadsView.classList.contains('active');
      if(shell) shell.setAttribute('data-view', onM?'manager':(onL?'leads':'va'));
      var cap=document.getElementById('side-sections-cap'); if(cap) cap.style.display=onM?'block':'none';
    }
    if(mgrView){ new MutationObserver(sync).observe(mgrView,{attributes:true,attributeFilter:['class']}); }
    if(leadsView){ new MutationObserver(sync).observe(leadsView,{attributes:true,attributeFilter:['class']}); }
    sync();
  }

  function mirrorClocks(){
    var pairs=[['mgr-uk-clock','uk-clock'],['mgr-ph-clock','ph-clock'],['ld-uk-clock','uk-clock'],['ld-ph-clock','ph-clock']];
    pairs.forEach(function(p){ var d=document.getElementById(p[0]),src=document.getElementById(p[1]); if(d&&src&&src.textContent) d.textContent=src.textContent; });
  }
  function boot(){ applyPrefs(); initShell(); installSwitchTab(); installUpdateStats(); mirrorClocks(); setInterval(mirrorClocks,1000); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
