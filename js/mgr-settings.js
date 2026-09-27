/* ── #6 SET HER HOURS, WITH A PAPER TRAIL ────────────────────────────────────
   Today Jack had to correct two shifts by hand. The correction is now a first-class
   thing: an append-only 'correction' event carrying the old figure, the new one and
   why — so the original is never destroyed, seCompute() honours the latest one, and
   six months later the reason is still readable. */
async function jackFixHours(va, clockedMins, timerMins){
  try{
    var suggest=Math.round(clockedMins||0);
    var msg='Set '+vaDisp(va)+"'s hours for today.\n\n"
      +'Clocked in for : '+Math.floor((clockedMins||0)/60)+'h '+((clockedMins||0)%60)+'m\n'
      +'Timer counted  : '+Math.floor((timerMins||0)/60)+'h '+((timerMins||0)%60)+'m\n\n'
      +'Enter the MINUTES she should be paid for (blank = leave as is):';
    var raw=prompt(msg, String(suggest));
    if(raw===null) return;
    raw=String(raw).trim(); if(!raw) return;
    var mins=parseInt(raw,10);
    if(!isFinite(mins)||mins<0||mins>1440){ showToast('That is not a sensible number of minutes',true); return; }
    var note=prompt('Why? (kept with the correction — e.g. "laptop shut 9-10", "timer bug 18/08")','')||'';

    var day=(function(){ try{ return shiftDayKey(); }catch(e){ return ''; } })();
    var ok=await fetch(SUPABASE_URL+'/rest/v1/shift_events',{method:'POST',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
               'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify([{ va:va, day:day, kind:'correction', client_ms:Date.now(),
        tab:(typeof SE_TAB!=='undefined'?SE_TAB:'jack'),
        meta:{ minutes:String(mins), note:note, byJack:true,
               wasTimerMins:timerMins||0, wasClockedMins:clockedMins||0 } }])})
      .then(function(r){ return r.ok; }).catch(function(){ return false; });

    if(!ok){
      showToast('Could not save the correction — has the shift_events SQL been run yet?',true);
      return;
    }
    showToast(vaDisp(va)+' set to '+Math.floor(mins/60)+'h '+(mins%60)+'m ✓ — original kept');
    try{ mgr_renderLive(); }catch(e){}
  }catch(e){ try{ showToast('Could not save that correction',true); }catch(_){} }
}
function mgr_popoutLive(){
  var html=[
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>BDL VA HQ Live</title>',
    '<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet">',
    '<style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#0d0d1a;color:#f4f4ff;font-family:"DM Mono",monospace;padding:20px;min-width:600px;}',
    '.card{border-radius:12px;padding:18px 20px;margin-bottom:12px;border-top:3px solid #222;}',
    '.stat{background:rgba(0,0,0,0.4);border-radius:6px;padding:8px 10px;text-align:center;flex:1;}',
    '.sl{font-size:9.5px;color:#555;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;}',
    '.sv{font-size:18px;font-weight:700;}</style></head><body>',
    '<div id="hdr" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">',
    '<div style="font-family:Syne,sans-serif;font-size:18px;font-weight:800;">BDL VA HQ Live</div>',
    '<div style="display:flex;gap:8px;align-items:center;">',
    '<span id="ts" style="font-size:10px;color:var(--muted-2);"></span>',
    '<button onclick="refresh()" style="background:rgba(45,212,163,0.1);border:1px solid rgba(45,212,163,0.3);color:#10d99a;font-size:10px;padding:4px 12px;border-radius:6px;cursor:pointer;font-family:DM Mono,monospace;">↻ Refresh</button>',
    '</div></div>',
    '<div id="root"></div>',
    '<script>',
    'var URL="'+SUPABASE_URL+'";',
    'var KEY="'+SUPABASE_ANON_KEY+'";',
    'var SC="'+SUZ_COL+'";',
    'async function refresh(){',
    '  try{',
    '    var r=await fetchT(URL+"/rest/v1/live_status?select=*",{headers:{"apikey":KEY,"Authorization":"Bearer "+KEY}});',
    '    var rows=await r.json();',
    '    var bv={};(rows||[]).forEach(function(x){bv[x.va]=x.data;});',
    '    var h="";',
    '    ["Mera","Suz"].forEach(function(va){',
    '      var s=bv[va];var m=va==="Mera";',
    '      var ac=m?"#b23bff":SC;var bc=m?"#9b40ff":SC;',
    '      var bg=m?"#1a0a2e":"#1a1500";',
    '      if(!s||s.submitted){',
    '        h+="<div class=card style=background:#0d0d0d;border-color:#1a1a1a>";',
    '        h+="<div style=font-family:Syne,sans-serif;font-size:20px;font-weight:800;color:var(--muted-2)>"+va+"</div>";',
    '        h+="<div style=font-size:12px;color:#2a2a2a;margin-top:6px>No active shift</div></div>";',
    '        return;',
    '      }',
    '      var ob=s.onBreak;var sc=ob?"#f2c200":"#10d99a";',
    '      var tp=s.totalTasks>0?Math.round(s.tasksDone/s.totalTasks*100):0;',
    '      var lph=parseFloat(s.hoursWorked)>0?(s.totalLeads/parseFloat(s.hoursWorked)).toFixed(1):"-";',
    '      var hc=parseFloat(s.hoursWorked)>=8?"#10d99a":"#f2647f";',
    '      h+="<div class=card style=\\"background:"+bg+";border-top-color:"+bc+";\\">";',
    '      h+="<div style=\\"display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;\\">";',
    '      h+="<div style=\\"font-family:Syne,sans-serif;font-size:20px;font-weight:800;color:"+ac+";\\">"+va+"</div>";',
    '      h+="<div style=\\"font-size:11px;color:"+sc+";border:1px solid "+sc+"44;border-radius:12px;padding:3px 10px;\\">"+(ob?"☕ On break":"● Active")+"</div></div>";',
    '      h+="<div style=\\"background:rgba(255,255,255,0.04);border-radius:8px;padding:10px 14px;margin-bottom:10px;border-left:3px solid "+bc+";\\">";',
    '      h+="<div style=font-size:9px;color:#555;margin-bottom:3px>"+(ob?"On break":"Current task")+"</div>";',
    '      h+="<div style=font-size:13px;color:#ddd>"+s.currentTask+"</div>";',
    '      if(s.lastCompletedTask&&s.lastCompletedTask!="—") h+="<div style=font-size:10px;color:#444;margin-top:3px>Last: "+s.lastCompletedTask+(s.lastTickedAt?" · "+s.lastTickedAt:"")+"</div>";',
    '      h+="</div>";',
    '      h+="<div style=\\"display:flex;gap:6px;margin-bottom:10px;\\">";',
    '      h+="<div class=stat><div class=sl>Hours</div><div class=sv style=color:"+hc+">"+s.hoursWorked+"h</div></div>";',
    '      h+="<div class=stat><div class=sl>Leads</div><div class=sv style=color:#10d99a>"+s.totalLeads+"</div></div>";',
    '      h+="<div class=stat><div class=sl>L/Hr</div><div class=sv style=color:#9b8fff>"+lph+"</div></div>";',
    '      h+="<div class=stat><div class=sl>Break</div><div class=sv style=color:#f2c200>"+(s.totalBreakMins||0)+"m</div></div>";',
    '      h+="</div>";',
    '      h+="<div style=\\"display:flex;justify-content:space-between;font-size:10px;color:#555;margin-bottom:4px;\\"><span>Tasks "+s.tasksDone+"/"+s.totalTasks+"</span><span>"+tp+"%</span></div>";',
    '      h+="<div style=\\"height:5px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden;\\">";',
    '      h+="<div style=\\"height:100%;width:"+tp+"%;background:"+bc+";\\"></div></div>";',
    '      if(s.completedTasks&&s.completedTasks.length){',
    '        h+="<div style=margin-top:12px;border-top:1px solid rgba(255,255,255,0.04);padding-top:8px>";',
    '        h+="<div style=font-size:9px;color:#444;margin-bottom:6px>Completed tasks</div>";',
    '        s.completedTasks.forEach(function(t){',
    '          h+="<div style=\\"display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid rgba(255,255,255,0.03);font-size:11px;\\">";',
    '          h+="<div style=color:#888>✓ "+t.name+"</div>";',
    '          h+="<div style=\\"display:flex;gap:8px;color:#555;\\">"+(t.tickedAt?"<span>"+t.tickedAt+"</span>":"")+(parseInt(t.leads)>0?"<span style=color:#10d99a>"+t.leads+" leads</span>":"")+"</div>";',
    '          h+="</div>";',
    '        });',
    '        h+="</div>";',
    '      }',
    '      h+="<div style=\\"font-size:9px;color:var(--muted-2);margin-top:8px;\\">Started "+s.shiftStart+" · Updated "+s.lastUpdated+" UK</div>";',
    '      h+="</div>";',
    '    });',
    '    document.getElementById("root").innerHTML=h;',
    '    document.getElementById("ts").textContent="Updated "+new Date().toLocaleTimeString("en-GB",{timeZone:"Europe/London",hour:"2-digit",minute:"2-digit",hour12:true})+" UK";',
    '  }catch(e){document.getElementById("root").innerHTML="<div style=color:#555;padding:20px>Error fetching data</div>";}',
    '}',
    'refresh();setInterval(refresh,60000);',
    '</scr'+'ipt></body></html>'
  ].join('\n');

  var blob=new Blob([html],{type:'text/html'});
  var url=URL.createObjectURL(blob);
  window.open(url,'ShiftTrack Live','width=920,height=680,resizable=yes,scrollbars=yes');
}

function mgr_renderKeepa(){
  var el=document.getElementById('mgr-keepa-content');
  if(!el) return;

  // Pull keepa data from local log
  var log=mgr_getLog().filter(function(r){return r.va!=='Test'&&(r.keepaCount||r.data&&r.data.keepaCount);});
  // Mera & Suz work Mon-Fri. A weekend row is an oddity (late submit), so it is
  // pulled out of every window and average and called out, not quietly dropped.
  function kIsWknd(d){ var p=String(d||'').split('/'); if(p.length!==3) return false;
    var w=new Date(+p[2],+p[1]-1,+p[0]).getDay(); return w===0||w===6; }
  var kWknd=log.filter(function(r){ return kIsWknd(r.date); });
  log=log.filter(function(r){ return !kIsWknd(r.date); });

  // Normalise — data might be in rec directly or in rec.data
  function getKC(r){ return parseInt(r.keepaCount||0)||(r.data&&parseInt(r.data.keepaCount||0))||0; }
  function getKT(r){ return parseInt(r.keepaTotal||0)||(r.data&&parseInt(r.data.keepaTotal||0))||0; }

  var mRecs=log.filter(function(r){return r.va==='Mera';}).sort(function(a,b){return a.id-b.id;});
  var sRecs=log.filter(function(r){return r.va==='Suz';}).sort(function(a,b){return a.id-b.id;});

  var mera=vaColour('Mera'), suz=vaColour('Suz');
  var mTotal=mRecs.length?getKT(mRecs[mRecs.length-1]):0;
  var sTotal=sRecs.length?getKT(sRecs[sRecs.length-1]):0;
  var combined=mTotal+sTotal;
  // ── 14-day series ──
  var mBy={},sBy={},mTBy={},sTBy={};
  mRecs.forEach(function(r){mBy[r.date]=getKC(r);mTBy[r.date]=getKT(r);});
  sRecs.forEach(function(r){sBy[r.date]=getKC(r);sTBy[r.date]=getKT(r);});
  var dts=Object.keys(mBy).concat(Object.keys(sBy));
  dts=dts.filter(function(d,i){return dts.indexOf(d)===i;}).sort(function(a,b){var pa=a.split('/'),pb=b.split('/');return new Date(+pa[2],+pa[1]-1,+pa[0])-new Date(+pb[2],+pb[1]-1,+pb[0]);});
  var win=dts.slice(-14);
  if(!win.length){ el.innerHTML='<div class="mgr-sec2"><div><div class="s-ttl">Keepa Performance</div><div class="s-sub">Tracker growth · last 14 working days</div></div></div><div style="color:var(--muted-2);font-size:13px;padding:24px 4px;">No Keepa data yet — appears once VAs submit their tracker counts.</div>'; return; }
  var mAdd=win.map(function(d){return mBy[d]||0;}), sAdd=win.map(function(d){return sBy[d]||0;}), net=win.map(function(d,i){return mAdd[i]+sAdd[i];});
  var mRun=[],sRun=[],_mL=0,_sL=0; win.forEach(function(d){if(mTBy[d]!==undefined)_mL=mTBy[d];mRun.push(_mL);if(sTBy[d]!==undefined)_sL=sTBy[d];sRun.push(_sL);});
  var mChg=mAdd.reduce(function(a,b){return a+b;},0), sChg=sAdd.reduce(function(a,b){return a+b;},0), cChg=mChg+sChg;
  function pctOf(chg,tot){var base=tot-chg;return base>0?(chg/base*100):0;}
  // A tracker PURGE is not a day's sourcing. One -440 (Suz, 03 Jul) dragged the
  // y-axis to -500 and flattened every real day into a hairline, and dragged the
  // daily average negative with it. Cap the axis and drop those days from the
  // average — but name them, never silently.
  function kFmt(d){ var p=String(d).split('/');
    return p[0]+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+p[1]-1]; }
  var _kAll=mAdd.concat(sAdd,net).slice().sort(function(a,b){return a-b;});
  function _kq(pc){ return _kAll[Math.min(_kAll.length-1,Math.max(0,Math.round((_kAll.length-1)*pc)))]; }
  var _kIqr=(_kq(.75)-_kq(.25))||1, _kLo=_kq(.25)-_kIqr*3;
  // ONLY the downside counts. A huge positive day (+54) is a real day's sourcing and
  // must stay on the chart and in the average — it was being called a purge, which is
  // both wrong and insulting to the day's work. A huge NEGATIVE is a tracker cleanup.
  var kOut=[];
  win.forEach(function(d,i){ if(mAdd[i]<_kLo||sAdd[i]<_kLo||net[i]<_kLo) kOut.push(i); });
  var kNorm=win.map(function(_,i){return i;}).filter(function(i){return kOut.indexOf(i)<0;});
  var yLo=0,yHi=0;
  kNorm.forEach(function(i){ yLo=Math.min(yLo,mAdd[i],sAdd[i],net[i]); });
  win.forEach(function(d,i){ yHi=Math.max(yHi,mAdd[i],sAdd[i],net[i]); });
  var _pad=Math.max(2,Math.round((yHi-yLo)*0.14));
  yHi+=_pad; if(yLo<0) yLo-=_pad;
  var avgNet=kNorm.length?kNorm.reduce(function(a,i){return a+net[i];},0)/kNorm.length:0;
  var goalDay=parseInt(getAppSettings().keepaGoalDay)||15, goalPct=Math.max(0,Math.min(100,Math.round(avgNet/goalDay*100)));
  function kSpark(vals,col){ if(vals.length<2)return''; var w=104,h=32,mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals),rg=(mx-mn)||1; var pts=vals.map(function(v,i){return ((i/(vals.length-1))*w).toFixed(1)+','+(h-((v-mn)/rg)*(h-5)-2.5).toFixed(1);}); return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" height="'+h+'" preserveAspectRatio="none"><path d="M0,'+h+' L'+pts.join(' L')+' L'+w+','+h+' Z" fill="'+col+'20"/><polyline points="'+pts.join(' ')+'" fill="none" stroke="'+col+'" stroke-width="2" stroke-linejoin="round"/></svg>'; }
  function kCard(name,col,total,chg,pct,vals){ var up=chg>=0; return '<div class="kcard" style="--k:'+col+'"><div class="kc-top"><span class="kc-ico" style="background:'+col+'">'+name[0]+'</span><span class="kc-name">'+name+'</span></div><div class="kc-mid"><div><div class="kc-val">'+total.toLocaleString()+'</div><div class="kc-lbl">Total trackers</div></div><div class="kc-chg"><div class="kc-delta '+(up?'up':'dn')+'">'+(up?'↑':'↓')+' '+Math.abs(chg)+'</div><div class="kc-pct '+(up?'up':'dn')+'">'+(pct>=0?'+':'')+pct.toFixed(1)+'%</div></div></div><div class="kc-spark">'+kSpark(vals,col)+'</div></div>'; }
  var wLbl=win.length+' working day'+(win.length===1?'':'s');
  var html='<div class="mgr-sec2"><div><div class="s-ttl">Keepa Performance</div><div class="s-sub">Tracker growth · last '+wLbl+' (Mon–Fri) · <span style="color:#10d99a;">● live</span></div></div></div>';
  var kNotes=[];
  if(kWknd.length) kNotes.push(kWknd.length+' weekend entr'+(kWknd.length===1?'y':'ies')+' ('+kWknd.map(function(r){return String(r.date).slice(0,5);}).join(', ')+') left out — VAs work Mon–Fri');
  if(kOut.length) kNotes.push(kOut.map(function(i){ return kFmt(win[i])+' ('+net[i]+')'; }).join(', ')
      +' '+(kOut.length===1?'is a tracker clear-out, not a day\u2019s sourcing':'are tracker clear-outs, not sourcing')
      +' — kept off the axis and out of the daily average so the real days stay readable');
  if(kNotes.length) html+='<div style="font-size:11px;color:var(--muted-2);margin:-6px 0 12px;line-height:1.6;">'+kNotes.join('<br>')+'</div>';
  html+='<div class="kcard-row">'
    +kCard(vaDisp('Mera'),mera,mTotal,mChg,pctOf(mChg,mTotal),mRun)
    +kCard(vaDisp('Suz'),suz,sTotal,sChg,pctOf(sChg,sTotal),sRun)
    +kCard('Combined',KPI_TONE.green,combined,cChg,pctOf(cChg,combined),mRun.map(function(v,i){return v+(sRun[i]||0);}))
    +'<div class="kcard" style="--k:'+KPI_TONE.cyan+'"><div class="kc-top"><span class="kc-ico" style="background:'+KPI_TONE.cyan+'">◈</span><span class="kc-name">Net adds · '+win.length+'d (Mon–Fri)</span></div><div class="kc-mid"><div><div class="kc-val">'+(avgNet>=0?'+':'')+avgNet.toFixed(1)+'</div><div class="kc-lbl">avg net adds / working day</div></div></div><div class="kc-goal"><div class="kc-goal-top"><span>Goal +'+goalDay+' / working day</span><span>'+goalPct+'%</span></div><div class="kc-goal-bar"><i style="width:'+goalPct+'%;background:'+KPI_TONE.cyan+'"></i></div></div></div>'
    +'</div>';

  // Build chart data — daily totals per VA
  var allDates=[].concat(mRecs,sRecs).map(function(r){return r.date;});
  allDates=allDates.filter(function(d,i){return allDates.indexOf(d)===i;}).sort(function(a,b){
    var pa=a.split('/'),pb=b.split('/');
    return new Date(parseInt(pa[2]),parseInt(pa[1])-1,parseInt(pa[0]))-new Date(parseInt(pb[2]),parseInt(pb[1])-1,parseInt(pb[0]));
  });

  var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtDate(d){var p=d.split('/');return p[0]+' '+months[parseInt(p[1])-1];}

  var mByDate={},sByDate={};
  mRecs.forEach(function(r){mByDate[r.date]=getKC(r);});
  sRecs.forEach(function(r){sByDate[r.date]=getKC(r);});

  // Daily additions — only show days with data, no fill-forward
  var mData=[],sData=[];
  allDates.forEach(function(d){
    mData.push(mByDate[d]!==undefined?mByDate[d]:null);
    sData.push(sByDate[d]!==undefined?sByDate[d]:null);
  });

  var labels=allDates.map(fmtDate);
  var chartId='keepa-chart-'+Date.now();

  var months2=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtD(d){var p=d.split('/');return p[0]+' '+months2[+p[1]-1];}
  var bi=0,wi=0; net.forEach(function(v,i){if(v>net[bi])bi=i;if(v<net[wi])wi=i;});
  var posDays=net.filter(function(v){return v>0;}).length, hf=Math.floor(win.length/2);
  function avgA(a){return a.length?a.reduce(function(x,y){return x+y;},0)/a.length:0;}
  var trendUp=avgA(net.slice(hf))>=avgA(net.slice(0,hf));
  function kIns(col,label,sub,val){ return '<div class="kins"><span class="kins-dot" style="background:'+col+'22;color:'+col+';">●</span><div class="kins-txt"><div class="kins-l">'+label+'</div><div class="kins-s">'+sub+'</div></div><div class="kins-v" style="color:'+col+';">'+val+'</div></div>'; }
  html+='<div class="keepa-2col">'
    +'<div class="mgr-card2"><div class="mc2-h">Daily adds by tracker — last '+wLbl+' (Mon–Fri)</div><div style="height:210px;position:relative;"><canvas id="'+chartId+'"></canvas></div></div>'
    +'<div class="mgr-card2"><div class="mc2-h">&#10022; Key insights</div>'
      +kIns('#10d99a','Best day',fmtD(win[bi]),(net[bi]>=0?'+':'')+net[bi])
      +kIns('#f5455f','Worst drop',fmtD(win[wi]),(net[wi]>=0?'+':'')+net[wi])
      +kIns('#8b5cff','Positive days',posDays+' of '+win.length+' working days',Math.round(posDays/win.length*100)+'%')
      +kIns(trendUp?'#18c8f0':'#f5a524','Trend',trendUp?'Improving vs prior '+hf+' working days':'Cooling vs prior '+hf+' working days',trendUp?'&#8599;':'&#8600;')
    +'</div>'
  +'</div>';
  html+='<div class="mc2-h" style="margin:2px 0 10px;">Daily breakdown · last 7 working days logged</div>';
  html+='<div class="kbd-2col">';

  // ONE scale for both panels. Each used to normalise to its own max, so Mera's +9
  // drew longer than Suz's +10 and the side-by-side comparison was meaningless
  // (Jack: "why is Mera's bigger than Suz's?" — it wasn't; the scale was).
  var _kbdShared=(function(){
    var all=[];
    [mRecs,sRecs].forEach(function(rs){
      (rs||[]).slice().reverse().slice(0,7).forEach(function(r){ all.push(Math.abs(getKC(r))||0); });
    });
    return Math.max.apply(null,all.concat([1]));
  })();
  function keepaBreakdown(name,col,recs){
    if(!recs.length) return '<div class="mgr-card2"><div class="kbd-head"><span class="kc-ico" style="background:'+col+'">'+name[0]+'</span><span class="kc-name">'+name+' — daily breakdown</span></div><div style="color:var(--muted-2);font-size:12px;padding:8px 0;">No data yet.</div></div>';
    var last=recs.slice().reverse().slice(0,7);
    var maxAbs=_kbdShared;
    var wk=last.reduce(function(a,r){return a+Math.max(0,getKC(r));},0);
    var rows=last.map(function(r,i){
      var kc=getKC(r), kt=getKT(r), p=r.date.split('/'), isT=r.date===mgr_ukToday();
      var vs=(i+1<last.length)?(kc-getKC(last[i+1])):null;
      var vc=vs==null?'#5a6378':(vs>0?'#10d99a':vs<0?'#f5455f':'#5a6378');
      var barW=Math.max(4,Math.round(Math.abs(kc)/maxAbs*100));
      return '<div class="kbd-row"><span class="kbd-date">'+p[0]+' '+months2[+p[1]-1]+(isT?' <b class="kbd-today">Today</b>':'')+'</span>'
        +'<span class="kbd-add" style="color:'+(kc>=0?col:'#f5455f')+';">'+(kc>=0?'+':'')+kc+'</span>'
        +'<div class="kbd-bar"><i style="width:'+barW+'%;background:'+(kc>=0?col:'#f5455f')+';"></i></div>'
        +'<span class="kbd-tot">'+kt.toLocaleString()+'</span>'
        +'<span class="kbd-vs" style="color:'+vc+';">'+(vs==null?'—':(vs>0?'+':'')+vs)+'<span class="kbd-dot" style="background:'+vc+';"></span></span>'
        +'</div>';
    }).join('');
    return '<div class="mgr-card2"><div class="kbd-head"><span class="kc-ico" style="background:'+col+'">'+name[0]+'</span><span class="kc-name">'+name+' — daily breakdown</span><span class="kbd-wk" style="color:'+col+';">+'+wk+' · last 7 logged</span></div>'
      +'<div class="kbd-row kbd-hrow"><span>Date</span><span>Adds</span><span></span><span>Running</span><span>vs prev</span></div>'+rows+'</div>';
  }
  html+=keepaBreakdown(vaDisp('Mera'),mera,mRecs);
  html+=keepaBreakdown(vaDisp('Suz'),suz,sRecs);
  html+='</div>';
  el.innerHTML=html;

  // Render chart after DOM update
  setTimeout(function(){
    var canvas=document.getElementById(chartId);
    if(!canvas||typeof Chart==='undefined') return;
    new Chart(canvas,{
      type:'bar',
      data:{
        labels:win.map(fmtD),
        datasets:[
          {type:'bar',label:vaDisp('Mera')+' adds',data:mAdd,backgroundColor:mera+'cc',stack:'a',borderRadius:4,maxBarThickness:30},
          {type:'bar',label:vaDisp('Suz')+' adds',data:sAdd,backgroundColor:suz+'cc',stack:'a',borderRadius:4,maxBarThickness:30},
          {type:'line',label:'Net total',data:net,borderColor:'#e8ecf5',borderWidth:2,pointRadius:3,pointBackgroundColor:'#e8ecf5',tension:0.3,fill:false,order:0}
        ]
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{
            labels:{color:'#888',font:{family:'DM Mono, monospace',size:11}}
          },
          tooltip:{
            backgroundColor:'#1a1a2e',
            borderColor:'rgba(155,143,255,0.3)',
            borderWidth:1,
            titleColor:'#fff',
            bodyColor:'#aaa',
            callbacks:{
              label:function(ctx){
                return ' '+ctx.dataset.label+': '+ctx.parsed.y.toLocaleString()+' trackers';
              }
            }
          }
        },
        scales:{
          x:{stacked:true,
            ticks:{color:'#8b93a8',font:{size:10},maxRotation:45},
            grid:{display:false}
          },
          y:{stacked:true,min:yLo,max:yHi,
            ticks:{color:'#8b93a8',font:{size:10},callback:function(v){return v.toLocaleString();}},
            grid:{color:'rgba(255,255,255,0.05)'},
            beginAtZero:true
          }
        }
      }
    });
  },100);
}

function mgr_getTaskEditorRows(va){
  if(mgr_settingsTaskDrafts[va]) return cloneTaskTemplates(mgr_settingsTaskDrafts[va]);
  return getTaskTemplateSource(va);
}
function mgr_collectTaskEditorRows(){
  var rows=[];
  var poaEl=document.getElementById('setting-poa-notes');
  if(poaEl) mgr_settingsPoaDrafts[mgr_settingsTaskVA]=poaEl.value;
  var nodes=document.querySelectorAll('#task-editor-list .task-editor-row');
  nodes.forEach(function(row){
    rows.push({
      id:row.querySelector('.task-edit-id').value || ('custom-'+Date.now()),
      name:row.querySelector('.task-edit-name').value.trim() || 'Untitled task',
      hint:row.querySelector('.task-edit-hint').value.trim(),
      mandatory:row.querySelector('.task-edit-mandatory').checked,
      hasLinks:row.querySelector('.task-edit-links').checked,
      tickOnly:row.querySelector('.task-edit-tickonly').checked,
      archived:row.getAttribute('data-arch')==='1'
    });
  });
  mgr_settingsTaskDrafts[mgr_settingsTaskVA]=rows;
  return rows;
}
function mgr_taskSettingsHTML(settings,standalone){
  var va=mgr_settingsTaskVA||'Mera';
  var rows=mgr_getTaskEditorRows(va);
  var poa=mgr_settingsPoaDrafts[va]!==undefined?mgr_settingsPoaDrafts[va]:((settings.poaNotes&&settings.poaNotes[va])||'');
  var rowHtml=rows.map(function(t,i){
    if(t.archived) return '';
    return '<div class="task-editor-row" data-index="'+i+'" data-arch="0">'
      +'<input type="hidden" class="task-edit-id" value="'+escHtml(t.id)+'">'
      +'<div class="task-editor-index">'+(i+1)+'</div>'
      +'<div class="settings-field"><label class="settings-label">Task name</label><input class="settings-input task-edit-name" value="'+escHtml(t.name)+'"></div>'
      +'<div class="settings-field"><label class="settings-label">Hint / instructions</label><textarea class="settings-input task-edit-hint" style="min-height:76px;resize:vertical;">'+escHtml(t.hint||'')+'</textarea></div>'
      +'<div class="task-editor-checks">'
        +'<label><input type="checkbox" class="task-edit-mandatory" '+(t.mandatory?'checked':'')+'> Required</label>'
        +'<label><input type="checkbox" class="task-edit-links" '+(t.hasLinks?'checked':'')+'> Has links/leads</label>'
        +'<label><input type="checkbox" class="task-edit-tickonly" '+(t.tickOnly?'checked':'')+'> Tick-only (no time/leads)</label>'
      +'</div>'
      +'<div class="task-editor-actions">'
        +'<button class="icon-btn" title="Move up" onclick="mgr_moveTaskRow('+i+',-1)">↑</button>'
        +'<button class="icon-btn" title="Move down" onclick="mgr_moveTaskRow('+i+',1)">↓</button>'
        +'<button class="icon-btn" title="Park it — off the VA\u2019s shift, keeps the wording and any attached filters" onclick="mgr_archiveTaskRow('+i+')" style="color:#ffb84d;">Archive</button>'
      +'</div>'
      +sfltTaskStripHTML(t.id,i)
      +'</div>';
  }).join('');
  return '<div class="settings-card" data-sg="shift" style="margin-top:16px;">'
    +'<div class="task-editor-toolbar">'
      +(standalone
          ? '<div><div class="settings-title">Editing '+va+'&rsquo;s ticklist</div><div class="settings-sub" style="margin-bottom:0;">Drag order with the arrows. Changes only go live once you hit Save.</div></div>'
          : '<div><div class="settings-title">Recurring Ticklist</div><div class="settings-sub" style="margin-bottom:0;">The permanent tasks a VA gets every shift. For one-off / today-only tasks use the From Jack editor on the Mera &amp; Suz tabs.</div></div>')
      +'<div class="task-editor-toggle">'
        +'<button class="'+(va==='Mera'?'active':'')+'" onclick="mgr_setTaskEditorVA(&quot;Mera&quot;)">Mera</button>'
        +'<button class="'+(va==='Suz'?'active':'')+'" onclick="mgr_setTaskEditorVA(&quot;Suz&quot;)">Suz</button>'
      +'</div>'
    +'</div>'
    +(standalone?'':'<div class="jack-callout"><b>Where things go:</b> <span>Permanent daily tasks &rarr; here. Today\'s plan, links &amp; one-off tasks &rarr; the <em>From Jack</em> box on the '+va+' tab (VAs see it at the top of their shift).</span></div>')
    +'<div class="poa-note-box">'
      +'<div class="settings-field"><label class="settings-label">Standing note on the &quot;Jack POA&quot; task ('+va+')</label><textarea class="settings-input" id="setting-poa-notes" style="min-height:80px;resize:vertical;" placeholder="A permanent note glued to the recurring Jack POA task (optional)">'+escHtml(poa)+'</textarea></div>'
      +'<div style="font-size:11px;color:var(--muted-2);line-height:1.55;margin-top:8px;">Permanent \u2014 shown every shift. For today-only briefs use From Jack instead.</div>'
    +'</div>'
    +'<div id="task-editor-list" class="task-editor-list">'+rowHtml
      +rows.map(function(t,i){
          if(!t.archived) return '';
          // hidden carrier so mgr_collectTaskEditorRows() keeps archived tasks in the draft
          return '<div class="task-editor-row" data-index="'+i+'" data-arch="1" style="display:none;">'
            +'<input type="hidden" class="task-edit-id" value="'+escHtml(t.id)+'">'
            +'<input class="task-edit-name" type="hidden" value="'+escHtml(t.name)+'">'
            +'<textarea class="task-edit-hint" style="display:none">'+escHtml(t.hint||'')+'</textarea>'
            +'<input type="checkbox" class="task-edit-mandatory" '+(t.mandatory?'checked':'')+'>'
            +'<input type="checkbox" class="task-edit-links" '+(t.hasLinks?'checked':'')+'>'
            +'<input type="checkbox" class="task-edit-tickonly" '+(t.tickOnly?'checked':'')+'>'
            +'</div>';
        }).join('')
      +'</div>'
    +(function(){
        var arch=rows.map(function(t,i){ return {t:t,i:i}; }).filter(function(r){ return r.t.archived; });
        if(!arch.length) return '';
        return '<div class="tk-arch"><div class="tk-arch-h">\u{1F5C4} Archived <span>'+arch.length
          +' parked \u2014 not on '+va+'\u2019s shift</span></div>'
          +arch.map(function(r){
              return '<div class="tk-arch-r"><b>'+escHtml(r.t.name||'Untitled')+'</b>'
                +(r.t.hint?'<span>'+escHtml(String(r.t.hint).slice(0,80))+'</span>':'')
                +'<button class="tk-arch-b" onclick="mgr_restoreTaskRow('+r.i+')">\u21ba Restore</button>'
                +'<button class="tk-arch-x" onclick="mgr_deleteTaskRow('+r.i+')">Delete for good</button>'
              +'</div>';
            }).join('')
          +'</div>';
      })()
    +'<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">'
      +'<button class="btn btn-ghost" onclick="mgr_addTaskRow()">+ Add Task</button>'
      +'<button class="btn btn-success" onclick="mgr_saveTaskSettings()">Save POA & Ticklist</button>'
      +'<button class="btn btn-ghost" onclick="mgr_resetTaskSettings()">Reset '+va+' Ticklist</button>'
    +'</div>'
  +'</div>';
}
// the ticklist editor lives on its own tab now, but Settings still links across to it —
// repaint whichever host is actually on screen
function mgr_repaintTicklist(){
  if(mgr_currentTab==='ticklist') mgr_renderTicklist(); else mgr_renderSettings();
}
function mgr_setTaskEditorVA(va){
  mgr_collectTaskEditorRows();
  mgr_settingsTaskVA=va;
  mgr_repaintTicklist();
}
function mgr_moveTaskRow(idx,dir){
  var rows=mgr_collectTaskEditorRows();
  var next=idx+dir;
  if(next<0||next>=rows.length) return;
  var tmp=rows[idx]; rows[idx]=rows[next]; rows[next]=tmp;
  mgr_settingsTaskDrafts[mgr_settingsTaskVA]=rows;
  mgr_repaintTicklist();
}
/* ── TICKLIST ARCHIVE ──────────────────────────────────────────────────────
   Jack, twice: "still have no archive". The only control was Del, which threw the task
   away along with its wording, its flags and any filters attached to it — so a task he
   wasn't using this month had to be rebuilt from scratch later. Archiving parks it
   instead: off the VAs' shifts, one tap to bring back, and a real delete still available
   once it's in the archive. Stored on the task itself (archived:true), so it rides the
   existing save with no new table and nothing to run. */
function mgr_archiveTaskRow(idx){
  var rows=mgr_collectTaskEditorRows();
  if(!rows[idx]) return;
  rows[idx].archived=true;
  mgr_settingsTaskDrafts[mgr_settingsTaskVA]=rows;
  mgr_repaintTicklist();
  try{ showToast('Archived \u2014 it will not appear on '+mgr_settingsTaskVA+'\u2019s shift. Restore it any time below.'); }catch(e){}
}
function mgr_restoreTaskRow(idx){
  var rows=mgr_collectTaskEditorRows();
  if(!rows[idx]) return;
  rows[idx].archived=false;
  mgr_settingsTaskDrafts[mgr_settingsTaskVA]=rows;
  mgr_repaintTicklist();
  try{ showToast('Back on the ticklist \u2014 remember to Save'); }catch(e){}
}
function mgr_deleteTaskRow(idx){
  var rows=mgr_collectTaskEditorRows();
  var t=rows[idx]||{};
  if(!confirm('Delete "'+(t.name||'this task')+'" for good?\n\nThe wording, its settings and any filters attached to it go with it. Archiving keeps all of that.')) return;
  rows.splice(idx,1);
  mgr_settingsTaskDrafts[mgr_settingsTaskVA]=rows;
  mgr_repaintTicklist();
}
function mgr_addTaskRow(){
  var rows=mgr_collectTaskEditorRows();
  rows.push({id:'custom-'+Date.now(),name:'New task',mandatory:true,hint:'',hasLinks:false,tickOnly:false});
  mgr_settingsTaskDrafts[mgr_settingsTaskVA]=rows;
  mgr_repaintTicklist();
}
function mgr_saveTaskSettings(){
  var rows=mgr_collectTaskEditorRows();
  var settings=getAppSettings();
  if(!settings.poaNotes) settings.poaNotes={Mera:'',Suz:''};
  var poa=document.getElementById('setting-poa-notes');
  settings.poaNotes[mgr_settingsTaskVA]=poa?poa.value.trim():'';
  saveAppSettings(settings);
  saveTaskTemplateSource(mgr_settingsTaskVA,rows);
  delete mgr_settingsTaskDrafts[mgr_settingsTaskVA];
  delete mgr_settingsPoaDrafts[mgr_settingsTaskVA];
  renderNewsletterSchedulePanels();
  mgr_repaintTicklist();
  showToast(mgr_settingsTaskVA+' POA & ticklist saved');
}
function mgr_resetTaskSettings(){
  if(!confirm('Reset '+mgr_settingsTaskVA+' ticklist back to the built-in default?')) return;
  resetTaskTemplateSource(mgr_settingsTaskVA);
  delete mgr_settingsTaskDrafts[mgr_settingsTaskVA];
  delete mgr_settingsPoaDrafts[mgr_settingsTaskVA];
  mgr_repaintTicklist();
  showToast(mgr_settingsTaskVA+' ticklist reset');
}

/* ── "THIS BROWSER'S STORAGE" card (v50.9) — so Jack sees the pot filling before it does */
function storageCardHTML(){
  var u=lsUsage(), pct=Math.min(100,Math.round(u.all/u.cap*100));
  var col=pct>=90?'#f5455f':pct>=70?'#f5a524':'#10d99a';
  var rows=u.keys.slice(0,8).map(function(x){
    return '<div class="stg-row"><span>'+escHtml(x.k)+'</span><b>'+lsMB(x.n)+'</b></div>';
  }).join('');
  return '<div class="settings-card" data-sg="shift">'
    +'<div class="settings-title">This browser’s storage</div>'
    +'<div class="settings-sub">Every BDL app on this address shares one pot of about 5 MB. When it fills, saves fail. '
    +'AVM HQ keeps only small things here now — the shift history and lead decisions live in Supabase and are read from there.</div>'
    +'<div class="stg-meter"><i style="width:'+pct+'%;background:'+col+'"></i></div>'
    +'<div class="stg-line"><span>Whole pot</span><b style="color:'+col+'">'+lsMB(u.all)+' of 5 MB ('+pct+'%)</b></div>'
    +'<div class="stg-line"><span>AVM HQ</span><b>'+lsMB(u.ours)+'</b></div>'
    +'<div class="stg-line"><span>Your other apps here</span><b>'+lsMB(u.others)+'</b></div>'
    +(u.mem?'<div class="stg-line warn"><span>Held in memory (pot full)</span><b>'+u.mem+'</b></div>':'')
    +'<details class="stg-det"><summary>What AVM HQ keeps, biggest first</summary>'+rows+'</details>'
    +'</div>';
}
function mgr_renderSettings(){
  try{ wbRenderPending(0); }catch(e){}      // retries until the markup exists
  var el=document.getElementById('mgr-settings-content');
  if(!el) return;
  // keep the scroll position on an in-page edit (add/edit/delete) so it doesn't jump to the top;
  // only reset when opening Settings fresh (tab was hidden)
  var _st=document.getElementById('mgr-tab-settings');
  var _keepY=(_st&&_st.style.display!=='none')?(window.pageYOffset||document.documentElement.scrollTop||0):0;
  if(_keepY) window._settingsKeepY=_keepY;
  var settings=getAppSettings();
  var today=ukDayOfWeek();
  function optionHTML(val,label,current){
    return '<option value="'+val+'"'+(current===val?' selected':'')+'>'+label+'</option>';
  }
  function dayEditor(day){
    var owner=settings.newsletterSchedule[day]||'None';
    return '<div class="schedule-day">'
      +'<strong>'+DAY_LABELS[day]+'</strong>'
      +'<select class="settings-select" id="setting-newsletter-'+day+'">'
      +optionHTML('Mera','Mera',owner)
      +optionHTML('Suz','Suz',owner)
      +optionHTML('None','No newsletter day',owner)
      +'</select>'
      +(day===today?'<div style="font-size:10px;color:#10d99a;margin-top:8px;">Today</div>':'')
      +'</div>';
  }
  var ownerToday=getNewsletterOwner(today);
  var preview=WORKDAY_INDEXES.map(function(day){
    var owner=settings.newsletterSchedule[day]||'None';
    return '<div class="settings-preview-row">'
      +'<span style="color:'+(day===today?'#fff':'#8d8d9c')+';font-weight:'+(day===today?'800':'500')+';">'+DAY_LABELS[day]+'</span>'
      +'<span style="font-family:var(--font-head);font-size:17px;font-weight:800;color:'+vaColour(owner)+';">'+(owner==='None'?'No one':owner)+'</span>'
      +'</div>';
  }).join('');

  el.innerHTML='<div class="settings-seg" id="settings-seg">'
      +'<button class="on" data-sg="all" onclick="setSettingsGroup(\'all\')">All</button>'
      +'<button data-sg="shift" onclick="setSettingsGroup(\'shift\')">Shift tracking</button>'
      +'<button data-sg="vas" onclick="setSettingsGroup(\'vas\')">VAs</button>'
      +'<button data-sg="leads" onclick="setSettingsGroup(\'leads\')">Leads</button>'
    +'</div>'
    +'<div class="settings-shell">'
    +'<div class="settings-card" data-sg="shift">'
      +'<div class="settings-title">Jack Settings</div>'
      +'<div class="settings-sub">Saved on this browser. These settings control the VA setup screens and Jack targets.</div>'
      +'<div style="background:rgba(45,212,163,0.06);border:1px solid rgba(45,212,163,0.18);border-radius:12px;padding:14px;margin-bottom:16px;">'
        +'<div style="font-size:9px;color:#10d99a;text-transform:uppercase;letter-spacing:1.8px;font-weight:800;margin-bottom:4px;">Today</div>'
        +'<div style="font-family:var(--font-head);font-size:24px;font-weight:800;color:'+vaColour(ownerToday)+';">'+(ownerToday==='None'?'No newsletter owner':ownerToday+' owns Newsletter')+'</div>'
        +'<div style="font-size:11px;color:#7d7d8d;margin-top:4px;">'+ukDateString()+'</div>'
      +'</div>'
      +'<div class="settings-grid">'
        +'<div class="settings-field"><label class="settings-label">Weekly hours target</label><input class="settings-input" id="setting-weekly-hours" type="number" min="1" step="0.5" value="'+settings.weeklyHoursTarget+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Daily shift target</label><input class="settings-input" id="setting-daily-hours" type="number" min="1" step="0.25" value="'+settings.dailyHoursTarget+'"></div>'
        +'<div class="settings-field"><label class="settings-label">OOS weekly target</label><input class="settings-input" id="setting-oos-hours" type="number" min="0" step="0.25" value="'+settings.oosHoursTarget+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Jack PIN</label><input class="settings-input" id="setting-manager-pin" type="text" value="'+escHtml(settings.managerPin)+'"></div>'
      +'</div>'
      +'<div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap;">'
        +'<button class="btn btn-success" onclick="mgr_saveSettings()">Save Settings</button>'
        +'<button class="btn btn-ghost" onclick="mgr_resetSettings()">Reset Defaults</button>'
      +'</div>'
    +'</div>'
    +'<div id="mx-panel-host">'+matrixPanelHTML()+'</div>'
    +'<div class="settings-card" data-sg="vas">'
      +'<div class="settings-title">What VAs can do</div>'
      +'<div class="settings-sub">Turn features on the VA shift screen on or off. Off = the VA never sees it.</div>'
      +[['vaCanAddTasks','Add their own ad-hoc tasks','A VA can create extra tasks on top of yours',1],
        ['vaShowBreak','Take-a-break button','Lets a VA log a paused break mid-shift',1],
        ['vaShowStreak','Submit-streak KPI','Shows their run of on-time submissions',1],
        ['vaShowMomentum','Live momentum banner','The progress-to-goal bar at the top of their shift',1],
        ['vaCelebrate','Celebrations','Confetti + cheer when they hit goal or finish tasks',1]].map(function(w){
          var on=settings[w[0]]===undefined?w[3]:!!settings[w[0]];
          return '<div class="perm-row"><label class="wh-switch" style="flex-shrink:0;"><input type="checkbox" id="setting-'+w[0]+'"'+(on?' checked':'')+'><i></i></label>'
            +'<div class="perm-txt"><div class="perm-name">'+w[1]+'</div><div class="perm-desc">'+w[2]+'</div></div></div>';
        }).join('')
      +'<div class="settings-field" style="margin-top:14px;"><label class="settings-label">Custom greeting line (optional)</label><input class="settings-input" id="setting-va-greeting" type="text" placeholder="e.g. Let\'s find some bangers today" value="'+escHtml(settings.vaGreeting||'')+'"></div>'
      +'<div style="display:flex;margin-top:16px;"><button class="btn btn-success" onclick="mgr_saveSettings()">Save Settings</button></div>'
    +'</div>'
    +'<div class="settings-card" data-sg="vas">'
      +'<div class="settings-title">Team &mdash; your VAs</div>'
      +'<div class="settings-sub">Rename a VA (e.g. when someone new takes over a slot). The name updates across the app; colours &amp; goals live in Targets, Scoring &amp; VAs.</div>'
      +'<div class="settings-grid">'
        +'<div class="settings-field"><label class="settings-label">VA slot 1 &mdash; display name</label><input class="settings-input" id="setting-label-mera" type="text" placeholder="Mera" value="'+escHtml(settings.labelMera||'Mera')+'"></div>'
        +'<div class="settings-field"><label class="settings-label">VA slot 2 &mdash; display name</label><input class="settings-input" id="setting-label-suz" type="text" placeholder="Suz" value="'+escHtml(settings.labelSuz||'Suz')+'"></div>'
      +'</div>'
      +'<div style="font-size:10.5px;color:var(--muted-2);margin-top:8px;line-height:1.5;">Slot 1 = Mera\'s Google Sheet, slot 2 = Suz\'s. Renaming only changes the name shown &mdash; the sheet link and history stay the same, so it\'s safe when a VA is replaced.</div>'
      +'<div style="display:flex;margin-top:16px;"><button class="btn btn-success" onclick="mgr_saveSettings()">Save Settings</button></div>'
    +'</div>'
    +'<div class="settings-card" data-sg="shift">'
      +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;">'
        +'<div><div class="settings-title">Newsletter Days</div><div class="settings-sub" style="margin-bottom:0;">Choose which VA owns the Newsletter check each weekday.</div></div>'
      +'</div>'
      +'<div class="schedule-editor">'+WORKDAY_INDEXES.map(dayEditor).join('')+'</div>'
      +'<div style="margin-top:18px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">'+preview+'</div>'
    +'</div>'
    +'<div class="settings-card" data-sg="leads">'
      +'<div class="settings-title">Targets, Scoring &amp; VAs</div>'
      +'<div class="settings-sub">Per-VA daily lead goals, identity colours, lead-score weighting and Discord quiet hours.</div>'
      +'<div class="settings-grid">'
        +'<div class="settings-field"><label class="settings-label">Storefront target &mdash; leads per '
          +((parseFloat(settings.dailyHoursTarget)||8))+'h shift</label>'
          +'<input class="settings-input" id="setting-sf-perday" type="number" min="1" step="1" value="'
          +(settings.sfLeadsPerDay||15)+'">'
          +'<div class="settings-hint">Every storefront is graded against this. <b>'
          +(((parseFloat(settings.sfLeadsPerDay)||15)/((parseFloat(settings.dailyHoursTarget)||8))).toFixed(1))
          +' leads/hr</b> — above it is green, just under is amber, below is red.</div></div>'
        +'<div class="settings-field"><label class="settings-label">Storefront batches &mdash; how to work them</label>'
          +'<input class="settings-input" id="setting-sb-how" type="text" value="'+escHtml(sbHowText())+'">'
          +'<div class="settings-hint">Shown to the VA on every storefront batch, right above the leads box.</div></div>'
        +'<div class="settings-field wb-field"><label class="settings-label">Sheet writeback &mdash; web app URL</label>'
          +'<input class="settings-input" id="setting-wb-url" type="text" spellcheck="false" placeholder="https://script.google.com/…/exec" value="'+escHtml(settings.wbUrl||'')+'">'
          +'<div class="settings-hint">Writes your decisions into the VA sheets the moment you click, instead of waiting for their Apps Script. Setup steps are in <b>BDL VA HQ - 3 - WRITEBACK WEB APP.gs.txt</b>.</div></div>'
        +'<div class="settings-field wb-field"><label class="settings-label">Sheet writeback &mdash; token</label>'
          +'<input class="settings-input" id="setting-wb-token" type="text" spellcheck="false" placeholder="the same text as TOKEN in the script" value="'+escHtml(settings.wbToken||'')+'">'
          +'<div class="settings-hint"><button class="wb-btn" onclick="wbTest()">Test connection</button><span id="wb-test-out"></span></div>'
          +'<div class="settings-hint" id="wb-pending"></div></div>'
        +'<div class="settings-field"><label class="settings-label">Mera &mdash; daily lead goal</label><input class="settings-input" id="setting-goal-mera" type="number" min="1" value="'+(settings.goalMera||12)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Mera &mdash; of those, OA</label><input class="settings-input" id="setting-oagoal-mera" type="number" min="0" value="'+(settings.oaGoalMera||0)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Suz &mdash; of those, OA</label><input class="settings-input" id="setting-oagoal-suz" type="number" min="0" value="'+(settings.oaGoalSuz||0)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Suz &mdash; daily lead goal</label><input class="settings-input" id="setting-goal-suz" type="number" min="1" value="'+(settings.goalSuz||12)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Mera &mdash; hours / week</label><input class="settings-input" id="setting-hours-mera" type="number" min="1" step="0.5" value="'+(settings.hoursMera||settings.weeklyHoursTarget||40)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Suz &mdash; hours / week</label><input class="settings-input" id="setting-hours-suz" type="number" min="1" step="0.5" value="'+(settings.hoursSuz||settings.weeklyHoursTarget||40)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Mera &mdash; min leads / week</label><input class="settings-input" id="setting-minwk-mera" type="number" min="0" value="'+(settings.minLeadsMera!==undefined?settings.minLeadsMera:60)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Suz &mdash; min leads / week</label><input class="settings-input" id="setting-minwk-suz" type="number" min="0" value="'+(settings.minLeadsSuz!==undefined?settings.minLeadsSuz:60)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Mera &mdash; &pound;100+ leads / MONTH</label><input class="settings-input" id="setting-o100-mera" type="number" min="0" value="'+(settings.over100MoMera!==undefined?settings.over100MoMera:150)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Suz &mdash; &pound;100+ leads / MONTH</label><input class="settings-input" id="setting-o100-suz" type="number" min="0" value="'+(settings.over100MoSuz!==undefined?settings.over100MoSuz:50)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Mera &mdash; Premium &pound;200-500 / MONTH</label><input class="settings-input" id="setting-prem-mera" type="number" min="0" value="'+(settings.premiumMoMera!==undefined?settings.premiumMoMera:75)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Suz &mdash; Premium &pound;200-500 / MONTH</label><input class="settings-input" id="setting-prem-suz" type="number" min="0" value="'+(settings.premiumMoSuz!==undefined?settings.premiumMoSuz:35)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Mera &mdash; Flagship &pound;500+ / MONTH</label><input class="settings-input" id="setting-flag-mera" type="number" min="0" value="'+(settings.flagshipMoMera!==undefined?settings.flagshipMoMera:4)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Suz &mdash; Flagship &pound;500+ / MONTH</label><input class="settings-input" id="setting-flag-suz" type="number" min="0" value="'+(settings.flagshipMoSuz!==undefined?settings.flagshipMoSuz:5)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Mera &mdash; Keepa trackers ADDED / wk</label><input class="settings-input" id="setting-keepaadd-mera" type="number" min="0" value="'+(settings.keepaAddWkMera!==undefined?settings.keepaAddWkMera:10)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Suz &mdash; Keepa trackers ADDED / wk</label><input class="settings-input" id="setting-keepaadd-suz" type="number" min="0" value="'+(settings.keepaAddWkSuz!==undefined?settings.keepaAddWkSuz:10)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Mera &mdash; Keepa tracker leads / wk</label><input class="settings-input" id="setting-keepawk-mera" type="number" min="0" value="'+(settings.keepaWkMera!==undefined?settings.keepaWkMera:10)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Suz &mdash; Keepa tracker leads / wk</label><input class="settings-input" id="setting-keepawk-suz" type="number" min="0" value="'+(settings.keepaWkSuz!==undefined?settings.keepaWkSuz:10)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Mera &mdash; THC discord leads / wk</label><input class="settings-input" id="setting-thcwk-mera" type="number" min="0" value="'+(settings.thcWkMera!==undefined?settings.thcWkMera:5)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Suz &mdash; THC discord leads / wk</label><input class="settings-input" id="setting-thcwk-suz" type="number" min="0" value="'+(settings.thcWkSuz!==undefined?settings.thcWkSuz:5)+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Mera colour</label><input class="settings-input" id="setting-col-mera" type="color" style="height:42px;padding:4px;" value="'+(settings.colMera||'#b23bff')+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Suz colour</label><input class="settings-input" id="setting-col-suz" type="color" style="height:42px;padding:4px;" value="'+(settings.colSuz||SUZ_COL)+'"></div>'
        +(function(){
          // A VA's colour must not be one of the semantic colours, or "this is Suz" and
          // "this needs attention" look identical everywhere. This is exactly what had
          // happened: colSuz was #f2c200, byte-identical to --amber.
          var CLASH={'#f2c200':'the amber warning colour','#f5a524':'the amber warning colour',
                     '#10d99a':'the green "done" colour','#10d99a':'the green "done" colour',
                     '#f2647f':'the red alert colour','#f5455f':'the red alert colour'};
          var out='';
          [['Mera',(settings.colMera||'').toLowerCase()],['Suz',(settings.colSuz||'').toLowerCase()]].forEach(function(pr){
            var hit=CLASH[pr[1]];
            if(hit) out+='<div class="col-clash">\u26A0\uFE0F <b>'+pr[0]+'\u2019s colour is '+hit+'.</b> '
              +'On every screen &ldquo;this is '+pr[0]+'&rdquo; will look the same as &ldquo;something needs attention&rdquo;. '
              +'<button onclick="vaColReset(\''+pr[0]+'\')">Use the default instead</button></div>';
          });
          return out;
        })()
        +'<div class="settings-field"><label class="settings-label">Quiet hours from (UK)</label><input class="settings-input" id="setting-quiet-from" type="time" value="'+(settings.quietFrom||'')+'"></div>'
        +'<div class="settings-field"><label class="settings-label">Quiet hours until (UK)</label><input class="settings-input" id="setting-quiet-to" type="time" value="'+(settings.quietTo||'')+'"></div>'
      +'</div>'
      +'<div style="font-size:10.5px;color:var(--muted-2);margin-top:8px;">Quiet hours pause task/break/shift-start pings (EOD + weekly still send). Leave blank to disable.</div>'
      +'<div style="font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);margin:16px 0 10px;">Lead score weighting</div>'
      +'<div class="sw-grid">'
      +[['swRoi','ROI','#10d99a'],['swProfit','Net profit','#8b5cff'],['swDemand','Demand vs comp.','#18c8f0'],['swMargin','Margin','#f5a524']].map(function(w){
          var v=settings[w[0]]===undefined?1:settings[w[0]];
          return '<div class="sw-row" style="--swc:'+w[2]+'">'
            +'<span class="sw-name"><span class="sw-dot"></span>'+w[1]+'</span>'
            +'<input type="range" id="setting-'+w[0]+'" min="0" max="2" step="0.1" value="'+v+'" style="--fill:'+(v/2*100)+'%" oninput="swSlide(this)">'
            +'<span class="sw-val'+(v>1?' up':v<1?' down':'')+'" id="out-'+w[0]+'">'+(+v).toFixed(1)+'\u00d7</span>'
            +'</div>';
        }).join('')
      +'</div>'
      +'<div style="font-size:10.5px;color:var(--muted-2);margin-top:9px;">1.0&times; = neutral. Drag what matters most to you, or hit <b style="color:var(--accent-2);">Auto-tune</b> below to learn it from your buys.</div>'
      +'<div style="display:flex;gap:10px;margin-top:16px;"><button class="btn btn-success" onclick="mgr_saveSettings()">Save Settings</button></div>'
    +'</div>'
    +'<div class="settings-card" data-sg="leads">'
      +'<div class="settings-title">Leads &mdash; show from date</div>'
      +'<div class="settings-sub">Anything sourced on/after this date shows on the Leads page; everything older is hidden completely. The month dropdown on the Leads page still works on top of it.</div>'
      +'<div class="settings-field" style="max-width:240px;"><label class="settings-label">Show leads from</label><input class="settings-input" id="setting-leads-start" type="date" value="'+escHtml(settings.leadsStartDate||'')+'" onchange="saveLeadsStart(this.value)"></div>'
      +'<div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap;"><button class="btn btn-success" onclick="saveLeadsStart(document.getElementById(\'setting-leads-start\').value)">Save &amp; reload</button>'
        +'<button class="btn btn-ghost" onclick="document.getElementById(\'setting-leads-start\').value=\'\';saveLeadsStart(\'\')">Clear</button>'
        +'<span id="leads-start-status" style="font-size:11.5px;font-weight:700;color:'+(settings.leadsStartDate?'var(--green)':'var(--muted-2)')+';">'+(settings.leadsStartDate?('✓ Active — showing from '+settings.leadsStartDate.split('-').reverse().join('/')):'off — showing all history')+'</span></div>'
      +'<div style="border-top:1px solid var(--line-2);margin:16px 0 14px;"></div>'
      +'<div class="settings-title" style="font-size:15px;">Teach the score</div>'
      /* Jack: "these numbers make no sense — thought we were condensing this, it is
         huge and not simple." The verdict now leads; the lecture and the full grid
         are one click away instead of a wall he has to scroll past. */
      +'<div id="score-verdict" style="margin-bottom:10px;"></div>'
      +'<div id="note-thresholds" style="margin-bottom:10px;"></div>'
      +'<details class="score-details"><summary>How the score works &amp; the full matrix check</summary>'
      +'<div style="font-size:12px;color:var(--muted);line-height:1.6;background:var(--panel-2);border:1px solid var(--line-2);border-radius:10px;padding:11px 14px;margin-bottom:4px;">'
        +'<b style="color:var(--text);">How the score works:</b> it is a <b style="color:var(--text);">lookup, not a formula</b>. Sales per month picks a volume band, profit per unit picks a tier, and where they meet in your matrix is the score. ROI only ever adjusts it &mdash; under 10% docks a couple of points unless the profit or the speed makes up for it.'
        +'<br><br><b style="color:var(--text);">It does not learn on its own.</b> Nothing changes the matrix except you. What the grid below does is <b style="color:var(--text);">check it against your actual buying</b>: each cell shows how many decided leads landed there and how many of those you bought. <span style="color:#ffb84d;">Amber</span> = you keep buying a cell the matrix rates low (raise it). <span style="color:#ff6b7f;">Red</span> = the matrix loves a cell you keep passing (lower it). You change it by editing the matrix &mdash; the grid just tells you which cell is wrong.'
        +'<br><br><b style="color:var(--text);">Passing a 10/10 is not automatically a fault.</b> The score can only see volume, profit and ROI &mdash; it cannot see a bad listing, a gated brand, hazmat or your cash position. So the block underneath splits your high-score passes by the reason you gave: reasons the matrix <i>could</i> act on, and reasons it will never see. Only the first kind means a cell needs changing.'
      +'</div>'
      +'<div id="score-teach" style="margin-top:14px;"></div>'
      +'</details>'
    +'</div>'
    // your buying data is analysis, not config — it lives on the Insights tab now
    +'<div class="settings-card" data-sg="leads">'
      +'<div class="settings-title">📈 Your buying data</div>'
      +'<div class="settings-sub">What you buy, where it comes from and what you\'re spending has moved to the Insights tab, next to the rest of your lead analysis.</div>'
      +'<button class="btn btn-primary" style="margin-top:10px;" onclick="mgr_switchTab(\'trends\')">Open Insights →</button>'
    +'</div>'
    +'<div class="settings-card" data-sg="leads">'
      +'<div class="settings-title">Lead warning badges</div>'
      +'<div class="settings-sub">Flags that appear on a lead when it hits a threshold you set. Add, edit or remove them &mdash; they save instantly.</div>'
      +'<div id="badge-rules"></div>'
    +'</div>'
    +'<div class="settings-card" data-sg="leads">'
      +'<div class="settings-title">Image pull — diagnostics</div>'
      +'<div class="settings-sub">Thumbnails pull from the Amazon UK image CDN by ASIN. A few newer products aren\'t in it and fall back to a placeholder. Scan to list exactly which, with links to inspect.</div>'
      +'<button class="btn btn-ghost" onclick="scanLeadImages()">Scan leads for missing images</button>'
      +'</div><div class="settings-card" data-sg="all"><div class="settings-title">\u{1F9EA} Database health</div>'
      +'<div class="settings-sub">Checks every table and every column this app writes to. Read-only \u2014 it never changes anything.</div>'
      +'<button class="btn btn-success" style="margin-top:10px;" onclick="dbSelfCheck()">Check my database</button>'
      +'<div id="dbcheck-out" style="margin-top:12px;"></div>'
      +'<div id="img-diag" style="margin-top:12px;"></div>'
    +'</div>'
    +'<div class="settings-card" data-sg="vas">'
      +'<div class="settings-title">Lead Sheet Tabs</div>'
      +'<div class="settings-sub">Tick which tabs count as lead sheets. Sorted newest-first per VA; the current month is highlighted. New tabs appear here automatically and default to ON.</div>'
      +'<div id="tabpicker" style="font-size:12.5px;color:var(--muted);">Loading tabs&hellip;</div>'
    +'</div>'
    +'<div class="settings-card" data-sg="vas">'
      +'<div class="settings-title">VA spend</div>'
      +'<div class="settings-sub">Controls the two VA spend lines on your overview &amp; Spend tab. Pulled from your Spend Dashboard\'s sheet by <b>Provider</b>. Targets fall back to the sheet\'s Targets tab when left blank.</div>'
      +[['A','#8b5cf6','spendNameA','spendProvA','spendTgtA','VA-A'],['S','#eab308','spendNameS','spendProvS','spendTgtS','VA-S']].map(function(w){
          return '<div style="border-left:3px solid '+w[1]+';padding:2px 0 2px 12px;margin-bottom:14px;">'
            +'<div class="settings-grid">'
            +'<div class="settings-field"><label class="settings-label">Line '+w[0]+' &mdash; display name</label><input class="settings-input" id="setting-'+w[2]+'" type="text" placeholder="'+w[5]+'" value="'+escHtml(settings[w[2]]||w[5])+'"></div>'
            +'<div class="settings-field"><label class="settings-label">Provider(s) in the sheet</label><input class="settings-input" id="setting-'+w[3]+'" type="text" placeholder="'+w[5]+'" value="'+escHtml(settings[w[3]]||w[5])+'"></div>'
            +'<div class="settings-field"><label class="settings-label">Monthly target &pound; (optional)</label><input class="settings-input" id="setting-'+w[4]+'" type="number" min="0" placeholder="from sheet" value="'+escHtml(settings[w[4]]!=null?String(settings[w[4]]):'')+'"></div>'
            +'<div class="settings-field"><label class="settings-label">Line colour</label><input class="settings-input" id="setting-spendCol'+w[0]+'" type="color" style="height:42px;padding:4px;" value="'+escHtml(settings['spendCol'+w[0]]||w[1])+'"></div>'
            +'</div></div>';
        }).join('')
      +'<div style="font-size:10.5px;color:var(--muted-2);margin:2px 0 12px;line-height:1.5;">Provider(s) = the exact value in the sheet\'s Provider column. Add several separated by commas (e.g. <code>VA-S, S PP A2A</code>) to roll them into one line.</div>'
      +'<div class="perm-row" style="border:none;padding:0 0 6px;"><label class="wh-switch" style="flex-shrink:0;"><input type="checkbox" id="setting-spendShowCombined"'+(settings.spendShowCombined===0?'':' checked')+'><i></i></label><div class="perm-txt"><div class="perm-name">Show combined VA total</div><div class="perm-desc">The &ldquo;Combined VA spend&rdquo; summary line under the two VAs</div></div></div>'
      +'<div class="perm-row" style="border:none;padding:0 0 4px;"><label class="wh-switch" style="flex-shrink:0;"><input type="checkbox" id="setting-spendShowPace"'+(settings.spendShowPace===0?'':' checked')+'><i></i></label><div class="perm-txt"><div class="perm-name">Show pace &amp; on-track colours</div><div class="perm-desc">Pace marker + green/amber/red vs target. Off = plain bars in the line colour</div></div></div>'
      +'<div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;"><button class="btn btn-success" onclick="mgr_saveSettings()">Save Settings</button><button class="btn btn-ghost" onclick="loadSpend(true);showToast(\'Spend refreshed \\u2713\')">Refresh spend now</button></div>'
    +'</div>'
    +'<div class="settings-card wh-card" data-sg="all">'
      +'<div class="settings-title">Notifications &amp; Webhooks</div>'
      +'<div class="settings-sub">Toggle what fires, point each one at a Discord channel, and send a test. Blank URL = built-in default.</div>'
      +'<div class="wh-cols">'
      +[['pay','\u{1F4B7} Important \u2014 pay &amp; admin','whPay','nPay'],
        ['main','Main &mdash; EOD reports','whMain','nMain'],
        ['weekly','Weekly Monday summary','whWeekly','nWeekly'],
        ['tasks','Task ticks','whTasks','nTasks'],
        ['breaks','Breaks','whBreaks','nBreaks'],
        ['shiftstart','Shift start','whShiftStart','nShiftStart']].map(function(w){
          var on=settings[w[3]]===undefined?true:!!settings[w[3]];
          return '<div class="wh-item'+(w[0]==='pay'?' wh-pay':'')+'"><div class="wh-lbl-row"><label class="wh-switch"><input type="checkbox" id="setting-n-'+w[0]+'"'+(on?' checked':'')+'><i></i></label><span class="settings-label">'+w[1]+'</span></div>'
            +'<div class="wh-row"><input class="settings-input" id="setting-wh-'+w[0]+'" type="text" placeholder="https://discord.com/api/webhooks/&hellip;" value="'+escHtml(settings[w[2]]||'')+'" oninput="whValidate(this)"><button class="wh-test" onclick="wh_test(\''+w[0]+'\')">Send test</button></div>'
            +'<div class="wh-bad" id="wh-bad-'+w[0]+'">'+whBadMsg(settings[w[2]]||'')+'</div>'
            +'<div class="wh-ok" id="wh-ok-'+w[0]+'"></div></div>';
        }).join('')
      +'</div>'
      +'<div class="wh-lbl-row" style="margin-top:18px;"><span class="settings-label">@ mention you on weekly review</span></div>'
      +'<div style="display:flex;align-items:center;gap:9px;"><input class="settings-input" id="setting-discord-id" type="text" style="width:220px;" placeholder="your Discord user ID (numbers)" value="'+escHtml(settings.discordUserId||'')+'"><span style="font-size:11px;color:var(--muted-2);">Discord → Settings → Advanced → Developer Mode on, then right-click your name → Copy User ID</span></div>'
      +'<div class="wh-lbl-row" style="margin-top:18px;"><span class="settings-label">Live idle alert after</span></div>'
      +'<div style="display:flex;align-items:center;gap:9px;"><input class="settings-input" id="setting-idle-mins" type="number" min="15" step="5" style="width:90px;" value="'+(settings.idleMins||90)+'"><span style="font-size:12px;color:var(--muted);">minutes without a task tick</span></div>'
      +'<div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap;">'
        +'<button class="btn btn-success" onclick="mgr_saveSettings()">Save Settings</button>'
        +'<button class="btn btn-ghost" onclick="sendWeeklySummaryTest()">Send weekly summary now (test)</button>'
        +'<button class="btn btn-ghost" onclick="exportSettings()">Copy settings</button>'
        +'<button class="btn btn-ghost" onclick="openImportSettings()">Import settings</button>'
      +'</div>'
    +'</div>'
    +'</div>'
    +paySettingsHTML()
    // saved filters now live on their own Filters tab (a card in Settings can't hold 1000s)
    +'<div class="settings-card" data-sg="leads"><div class="settings-title">🔎 Saved Filters</div>'
      +'<div class="settings-sub">Your filter library moved to its own tab — search, bulk-paste from Discord, archive, and see which ones actually produce leads.</div>'
      +'<button class="btn btn-primary" style="margin-top:10px;" onclick="mgr_switchTab(\'filters\')">Open the Filters tab →</button></div>'
    // the recurring ticklist moved out too — it decides both VAs' whole day, it shouldn't
    // have been the last card on a settings page
    +'<div class="settings-card" data-sg="shift"><div class="settings-title">🗂️ Recurring Ticklist</div>'
      +'<div class="settings-sub">The permanent daily tasks for Mera &amp; Suz, their order, and which saved filters ride along with each one — now on its own tab.</div>'
      +'<button class="btn btn-primary" style="margin-top:10px;" onclick="mgr_switchTab(\'ticklist\')">Open the Ticklist tab →</button></div>';
  try{ renderTabPicker(); }catch(e){}
  try{ renderScoreTeach(); }catch(e){}
  try{ renderJackInsights(); }catch(e){}
  try{ renderBadgeRules(); }catch(e){}
  // auto-run the image diagnostic once so the actual problem shows without a click
  try{ if((window.leads||[]).length && !window._imgScanned){ window._imgScanned=1; scanLeadImages(); } }catch(e){}
  try{ var _shell=el.querySelector('.settings-shell'); if(_shell) _shell.insertAdjacentHTML('beforeend', storageCardHTML()); }catch(e){}
  try{ setSettingsGroup(window._settingsGroup||'all'); }catch(e){}
  // re-pack after fonts + async content (tab picker / score teach) settle
  setTimeout(settingsMasonry,60); setTimeout(settingsMasonry,300); setTimeout(settingsMasonry,800);
  // restore scroll after the layout settles (masonry positions cards async)
  if(window._settingsKeepY){ var _y=window._settingsKeepY; window._settingsKeepY=0;
    var _restore=function(){ window.scrollTo(0,_y); };
    requestAnimationFrame(_restore); setTimeout(_restore,70); setTimeout(_restore,320); }
}

// Cloud push with CLOBBER PROTECTION: a browser that has never had the webhook URLs
// (preview, fresh device) must never wipe them from the shared cloud row. For these keys,
// an EMPTY local value defers to whatever the cloud already has.
/* Keys that survive a device swap: pulled DOWN from the cloud when the local copy
   is blank, and never clobbered by a blank local value on push. wbUrl/wbToken belong
   here — without them the writeback endpoint silently stays unconfigured on any
   browser that didn't type it in, which is exactly what happened on 06/08/2026. */
var SETTINGS_PROTECT=['whMain','whWeekly','whLeadsMera','whLeadsSuz','whTasks','whBreaks','whShiftStart','whPay','appUrl','leadMention','discordUserId','leadsStartDate','jbPresets','jbNoteSnips','payOtRate','payOtHours','payAdminMonthEnd','wbUrl','wbToken','sbHowText','sfLeadsPerDay'];
async function pushSettingsCloud(s){
  if(IS_PREVIEW) return;
  try{
    var merged=JSON.parse(JSON.stringify(s));
    try{
      var r=await dbWrite('Your settings', SUPABASE_URL+'/rest/v1/app_settings?id=eq.global&select=data',
        {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
      if(r.ok){ var rows=await r.json(); var cloud=(rows[0]&&rows[0].data)||{};
        SETTINGS_PROTECT.forEach(function(k){
          if(!(merged[k]&&String(merged[k]).trim()) && cloud[k]&&String(cloud[k]).trim()) merged[k]=cloud[k];
        });
      }
    }catch(e){}
    await fetch(SUPABASE_URL+'/rest/v1/app_settings',{method:'POST',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({id:'global',data:merged,updated_at:new Date().toISOString()})});
  }catch(e){}
}
// Save the leads start-date on its own (the card has no shared Save button) + reload leads immediately
function saveLeadsStart(v){
  var s=getAppSettings(); s.leadsStartDate=(v||'').trim(); saveAppSettings(s);
  try{ pushSettingsCloud(s); }catch(e){}
  showToast(v?('Showing leads from '+v.split('-').reverse().join('/')+' ✓'):'Start date cleared ✓');
  var st=document.getElementById('leads-start-status');
  if(st){ st.style.color=v?'var(--green)':'var(--muted-2)'; st.textContent=v?('✓ Active — showing from '+v.split('-').reverse().join('/')):'off — showing all history'; }
  try{ loadLeadsFromDB(); }catch(e){}
}
function mgr_saveSettings(){
  var settings=getAppSettings();
  WORKDAY_INDEXES.forEach(function(day){
    var el=document.getElementById('setting-newsletter-'+day);
    if(el) settings.newsletterSchedule[day]=el.value;
  });
  var weekly=parseFloat(document.getElementById('setting-weekly-hours').value);
  var daily=parseFloat(document.getElementById('setting-daily-hours').value);
  var oos=parseFloat(document.getElementById('setting-oos-hours').value);
  var pin=document.getElementById('setting-manager-pin').value.trim();
  if(!isNaN(weekly)&&weekly>0) settings.weeklyHoursTarget=weekly;
  if(!isNaN(daily)&&daily>0) settings.dailyHoursTarget=daily;
  if(!isNaN(oos)&&oos>=0) settings.oosHoursTarget=oos;
  if(pin) settings.managerPin=pin;
  [['setting-wh-main','whMain'],['setting-wh-weekly','whWeekly'],['setting-wh-tasks','whTasks'],['setting-wh-breaks','whBreaks'],['setting-wh-shiftstart','whShiftStart'],['setting-wh-pay','whPay']].forEach(function(p){
    var el=document.getElementById(p[0]);
    // an EMPTY field never wipes a stored webhook URL (a device with blank fields kept
    // killing notifications on save) — to change one, paste the new URL over it
    if(el && el.value.trim()) settings[p[1]]=el.value.trim();
  });
  [['setting-n-main','nMain'],['setting-n-weekly','nWeekly'],['setting-n-tasks','nTasks'],['setting-n-breaks','nBreaks'],['setting-n-shiftstart','nShiftStart']].forEach(function(p){
    var el=document.getElementById(p[0]);
    if(el) settings[p[1]]=el.checked?1:0;
  });
  var lsEl=document.getElementById('setting-leads-start'); if(lsEl) settings.leadsStartDate=lsEl.value;
  ['vaCanAddTasks','vaShowBreak','vaShowStreak','vaShowMomentum','vaCelebrate'].forEach(function(k){ var el=document.getElementById('setting-'+k); if(el) settings[k]=el.checked?1:0; });
  var gEl=document.getElementById('setting-va-greeting'); if(gEl) settings.vaGreeting=gEl.value.trim();
  var lblM=document.getElementById('setting-label-mera'); if(lblM) settings.labelMera=lblM.value.trim()||'Mera';
  var lblS=document.getElementById('setting-label-suz'); if(lblS) settings.labelSuz=lblS.value.trim()||'Suz';
  ['spendNameA','spendProvA','spendTgtA','spendNameS','spendProvS','spendTgtS','spendColA','spendColS'].forEach(function(k){ var el=document.getElementById('setting-'+k); if(el) settings[k]=el.value.trim(); });
  var scEl=document.getElementById('setting-spendShowCombined'); if(scEl) settings.spendShowCombined=scEl.checked?1:0;
  var spEl=document.getElementById('setting-spendShowPace'); if(spEl) settings.spendShowPace=spEl.checked?1:0;
  var idleEl=document.getElementById('setting-idle-mins');
  if(idleEl){ var iv=parseInt(idleEl.value); if(!isNaN(iv)&&iv>=15) settings.idleMins=iv; }
  var didEl=document.getElementById('setting-discord-id');
  if(didEl) settings.discordUserId=didEl.value.replace(/[^0-9]/g,'');
  var sbH=document.getElementById('setting-sb-how');   if(sbH) settings.sbHowText=sbH.value.trim();
  var sfD=document.getElementById('setting-sf-perday'); if(sfD){ var n1=parseFloat(sfD.value); if(n1>0) settings.sfLeadsPerDay=n1; }
  var wbU=document.getElementById('setting-wb-url');   if(wbU) settings.wbUrl=wbU.value.trim();
  var wbT=document.getElementById('setting-wb-token'); if(wbT) settings.wbToken=wbT.value.trim();
  [['setting-goal-mera','goalMera'],['setting-goal-suz','goalSuz'],
   ['setting-oagoal-mera','oaGoalMera'],['setting-oagoal-suz','oaGoalSuz']].forEach(function(pp){
    var el=document.getElementById(pp[0]); if(el){ var n=parseInt(el.value); if(!isNaN(n)&&n>0) settings[pp[1]]=n; }
  });
  [['setting-minwk-mera','minLeadsMera'],['setting-minwk-suz','minLeadsSuz'],
   ['setting-keepawk-mera','keepaWkMera'],['setting-keepawk-suz','keepaWkSuz'],
   ['setting-keepaadd-mera','keepaAddWkMera'],['setting-keepaadd-suz','keepaAddWkSuz'],
   ['setting-o100-mera','over100MoMera'],['setting-o100-suz','over100MoSuz'],
   ['setting-prem-mera','premiumMoMera'],['setting-prem-suz','premiumMoSuz'],
   ['setting-flag-mera','flagshipMoMera'],['setting-flag-suz','flagshipMoSuz'],
   ['setting-thcwk-mera','thcWkMera'],['setting-thcwk-suz','thcWkSuz']].forEach(function(pp){
    var el=document.getElementById(pp[0]); if(el){ var n=parseInt(el.value); if(!isNaN(n)&&n>=0) settings[pp[1]]=n; }
  });
  [['setting-hours-mera','hoursMera'],['setting-hours-suz','hoursSuz']].forEach(function(pp){
    var el=document.getElementById(pp[0]); if(el){ var n=parseFloat(el.value); if(!isNaN(n)&&n>0) settings[pp[1]]=n; }
  });
  [['setting-col-mera','colMera'],['setting-col-suz','colSuz']].forEach(function(pp){
    var el=document.getElementById(pp[0]); if(el&&el.value) settings[pp[1]]=el.value;
  });
  [['setting-quiet-from','quietFrom'],['setting-quiet-to','quietTo']].forEach(function(pp){
    var el=document.getElementById(pp[0]); if(el) settings[pp[1]]=el.value;
  });
  ['swRoi','swProfit','swDemand','swMargin'].forEach(function(k){
    var el=document.getElementById('setting-'+k); if(el){ var n=parseFloat(el.value); if(!isNaN(n)) settings[k]=n; }
  });
  saveAppSettings(settings);
  applyWebhookSettings();
  try{applyVaColours();}catch(e){} try{applyVaLabels();}catch(e){}
  try{ pushSettingsCloud(settings); }catch(e){}
  renderNewsletterSchedulePanels();
  try{ loadSpend(true); }catch(e){}   // apply spend-settings changes immediately
  mgr_renderSettings();
  showToast('Settings saved');
}

var SHEET_NAMES={'1NQVGd_iMLWGt5uyA4abZETSCHVXVQs8Y5CgRfu1dyRM':'Mera','1nD7Kp3pqVUBxUTxlPNWEhgoWOVIiw80QPY4EIpcNHyA':'Suz'};
function setSettingsGroup(g){
  window._settingsGroup=g;
  document.querySelectorAll('#settings-seg button').forEach(function(b){b.classList.toggle('on',b.dataset.sg===g);});
  document.querySelectorAll('.settings-shell .settings-card, #mgr-settings-content > .settings-card').forEach(function(c){
    var sg=c.getAttribute('data-sg')||'all';
    c.style.display=(g==='all'||sg==='all'||sg===g)?'':'none';
  });
  settingsMasonry();
  requestAnimationFrame(settingsMasonry);
}
// True masonry: absolutely position each card into the shortest column → zero gaps between cards.
/* Any card that changes height after layout must re-trigger it, or it grows straight
   through the card below — which is exactly what the new collapsible score section did
   in Jack's screenshot. `toggle` does not bubble, so this listens in the capture phase,
   once. Same guard covers any <details> added to Settings later. */
(function(){
  if(window._masonryToggleBound) return; window._masonryToggleBound=true;
  document.addEventListener('toggle',function(e){
    try{
      if(!e.target||e.target.tagName!=='DETAILS') return;
      if(!e.target.closest('.settings-shell')) return;
      settingsMasonry();
    }catch(_){}
  },true);
})();
function settingsMasonry(){
  var shell=document.querySelector('.settings-shell'); if(!shell) return;
  var all=[].slice.call(shell.children).filter(function(c){return c.classList&&c.classList.contains('settings-card');});
  var W=shell.clientWidth, gap=16, minCol=340;
  var ncol=Math.max(1,Math.min(3,Math.floor((W+gap)/(minCol+gap))));
  if(!W||ncol<2){
    shell.style.height='';shell.style.position='';
    all.forEach(function(c){c.style.position='';c.style.width='';c.style.left='';c.style.top='';});
    return;
  }
  var vis=all.filter(function(c){return getComputedStyle(c).display!=='none';});
  var colW=Math.floor((W-gap*(ncol-1))/ncol);
  shell.style.position='relative';
  var colH=new Array(ncol).fill(0);
  vis.forEach(function(c){
    c.style.position='absolute';
    if(c.classList.contains('wh-card')){
      var maxH=Math.max.apply(null,colH);
      c.style.width=W+'px';c.style.left='0px';c.style.top=maxH+'px';
      var h=c.offsetHeight+gap; for(var i=0;i<ncol;i++) colH[i]=maxH+h;
    }else{
      var m=0; for(var j=1;j<ncol;j++){ if(colH[j]<colH[m]) m=j; }
      c.style.width=colW+'px';c.style.left=(m*(colW+gap))+'px';c.style.top=colH[m]+'px';
      colH[m]+=c.offsetHeight+gap;
    }
  });
  shell.style.height=Math.max.apply(null,colH)+'px';
}
window.addEventListener('resize',function(){ if(document.querySelector('.settings-shell')) settingsMasonry(); });
