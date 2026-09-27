// ── DISCORD NOTIFICATION ─────────────────────────────────
async function discord_notify(rec) {
  if (IS_PREVIEW) return;
  if (!DISCORD_WEBHOOK || DISCORD_WEBHOOK === 'YOUR_DISCORD_WEBHOOK_URL') return;
  var lph = rec.leadsPerHr && rec.leadsPerHr !== '-' ? rec.leadsPerHr : '-';
  var skips = parseInt(rec.tasksSkipped) || 0;
  var colour = rec.va === 'Mera' ? 9699327 : 16775867; // purple / yellow
  // leads vs their daily goal, and vs the same VA's previous shift
  var goal=12, prevLeads=null;
  try{ goal=vaGoal(rec.va)||12; }catch(e){}
  try{
    var hist=mgr_getLog()
      .filter(function(r){ return r.va===rec.va && r.date!==rec.date; });
    if(hist.length) prevLeads=parseInt(hist[0].totalLeads)||0;
  }catch(e){}
  var leadsN=parseInt(rec.totalLeads)||0;
  var hrsN=parseFloat(rec.hoursWorked)||0;
  var hitGoal=leadsN>=goal;
  var totalTasks=(rec.tasks||[]).length||(parseInt(rec.tasksDone)||0);
  var delta=dcDelta(leadsN,prevLeads,'');
  /* Jack's verdict on the old layout: "not a fan of the bars as it looks like it's
     broken" — the block-character bars render as broken grey rectangles on Discord
     dark mode. Killed entirely. Fields + real analysis instead:
     the VA's 7-shift average, best recent shift, and where today sits against both. */
  var avg7=null, best7=null, days7=0;
  try{
    var h7=mgr_getLog()
      .filter(function(r){ return r.va===rec.va && r.date!==rec.date; }).slice(0,7);
    days7=h7.length;
    if(days7){
      avg7=Math.round(h7.reduce(function(s,r){ return s+(parseInt(r.totalLeads)||0); },0)/days7*10)/10;
      best7=Math.max.apply(null,h7.map(function(r){ return parseInt(r.totalLeads)||0; }));
    }
  }catch(e){}
  var headline=hitGoal
    ? '🔥 **'+leadsN+' leads** — goal hit ('+goal+' needed)'+(best7!==null&&leadsN>=best7?'  ·  🏆 **best of the last '+(days7+1)+' shifts**':'')
    : leadsN>=goal*0.75 ? '🟢 **'+leadsN+' leads** — '+(goal-leadsN)+' short of the '+goal+' goal'
    : '🟠 **'+leadsN+' leads** — '+(goal-leadsN)+' under the '+goal+' goal';
  var form='';
  if(avg7!==null){
    var vsAvg=leadsN-avg7;
    form=(vsAvg>=0?'▲ ':'▼ ')+Math.abs(Math.round(vsAvg*10)/10)+' vs their '+days7+'-shift average ('+avg7+')';
  }
  var desc=headline
    +(delta?'\n'+delta+' vs last shift'+(form?'  ·  '+form:''):(form?'\n'+form:''));
  if(rec.notes && rec.notes.trim()) desc+='\n\n💬 '+rec.notes.trim().slice(0,400);

  var fields=[
    {name:'✅ Tasks', value:'**'+rec.tasksDone+'** / '+totalTasks+(skips>0?'\n⚠️ '+skips+' skipped':''), inline:true},
    {name:'⏱ Worked', value:'**'+rec.hoursWorked+'h**'+(rec.breakMins?'\n☕ '+rec.breakMins+'m break':''), inline:true},
    {name:'📈 Rate', value:'**'+lph+'** leads/hr'+(avg7!==null?'\nusual ~'+(hrsN?Math.round(avg7/Math.max(1,hrsN)*10)/10:'—')+'/hr':''), inline:true},
    {name:'🕐 Shift', value:rec.shiftStart+' → '+rec.shiftEnd
      + ((function(){ try{ return shiftEvidence(rec).trusted?'':'\n\u26A0 times rebuilt after a reload'; }catch(e){ return ''; } })()),
      inline:true},
  ];
  if(typeof rec.jbOutstanding==='number'){
    fields.push({name:'📌 From Jack',
      value: rec.jbOutstanding>0
        ? '**'+rec.jbOutstanding+' still open**'+(rec.jbOldest>0?' · oldest '+rec.jbOldest+'d':'')+'\nrolls to tomorrow'
        : '✓ all clear', inline:true});
  }
  if(best7!==null) fields.push({name:'🏅 Recent best', value:'**'+best7+'** leads', inline:true});

  var embed = {
    embeds: [{
      author: { name: 'End of day · '+rec.date },
      title: (rec.va === 'Mera' ? '🟣' : '🟡') + ' ' + rec.va + ' — ' + leadsN + ' lead' + (leadsN===1?'':'s'),
      color: hitGoal ? 3066993 : colour,
      description: desc,
      fields: fields,
      footer: { text: 'BDL VA HQ · submitted ' + rec.submittedAt + ' UK' },
      timestamp: new Date().toISOString()
    }]
  };
  try {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed)
    });
  } catch(e) { console.error('Discord notify error:', e); }
}

// ── UK TIME ──────────────────────────────────────────────
// ── DISCORD TASK NOTIFICATION ────────────────────────────
/* ── Discord embed helpers — a consistent visual language across every message ── */
function dcBar(done,total,width){
  width=width||12; total=+total||0; done=Math.max(0,+done||0);
  var pct=total>0?Math.min(1,done/total):0;
  var full=Math.round(pct*width);
  return '`'+new Array(full+1).join('█')+new Array(width-full+1).join('░')+'` **'+Math.round(pct*100)+'%**';
}
function dcVA(va){ return va==='Mera'?{e:'🟣',c:9699327}:{e:'🟡',c:16775867}; }
function dcUK(){ return new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:true})+' UK'; }
function dcDelta(cur,prev,unit){
  if(prev==null||!isFinite(prev)||prev===0) return '';
  var d=cur-prev, pc=Math.round(d/prev*100);
  return (d>=0?'▲ +':'▼ ')+Math.abs(d)+(unit||'')+' ('+(d>=0?'+':'')+pc+'%)';
}
async function discord_task_notify(task) {
  if (IS_PREVIEW) return;
  try{ if(inQuietHours()) return; }catch(e){}
  if (!DISCORD_TASKS_WEBHOOK) return;
  if (!state.currentVA || state.currentVA === 'Test') return;
  var isMera = state.currentVA === 'Mera';
  var colour = isMera ? 9699327 : 16775867;
  var emoji = isMera ? '🟣' : '🟡';
  var leads = parseInt(task.leads) || 0;
  var timeStr = task.time || ((task.timeHrs||0) > 0 || (task.timeMins||0) > 0 ? (task.timeHrs||0)+'h '+(task.timeMins||0)+'m' : '');
  var ms = workedMs();
  var shiftHrs = (ms/3600000).toFixed(1);
  var allTasks = state.tasks.concat(state.extraTasks);
  var doneSoFar = allTasks.filter(function(t){return t.done;}).length;
  var totalLeadsSoFar = allTasks.reduce(function(s,t){return s+(parseInt(t.leads)||0);},0);
  var goal=(function(){ try{ return vaGoal(state.currentVA)||12; }catch(e){ return 12; } })();
  // The task name used to be the embed TITLE and the first line of the DESCRIPTION, so
  // every message said it twice under an author line that said it a third time. And the
  // `█░` bar rendered as a row of broken-looking blocks. Numbers now live in Discord's
  // own inline fields, which lay out as a clean grid on desktop and mobile.
  var pct = allTasks.length ? Math.round(doneSoFar/allTasks.length*100) : 0;
  var beat = goal>0 && totalLeadsSoFar>=goal;
  var bits=[];
  if(leads>0) bits.push('**+'+leads+'** lead'+(leads===1?'':'s')+' from this');
  if(timeStr) bits.push(timeStr);
  var fields=[
    {name:'Tasks',  value:'**'+doneSoFar+'**/'+allTasks.length+'  ·  '+pct+'%', inline:true},
    {name:'Leads today', value:'**'+totalLeadsSoFar+'**/'+goal+(beat?'  \u2705':''), inline:true},
    {name:'Shift',  value:shiftHrs+'h', inline:true}
  ];
  try {
    await fetch(DISCORD_TASKS_WEBHOOK, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({embeds:[{
        author: {name: emoji+' '+vaDisp(state.currentVA)},
        title: task.name.slice(0,120),
        color: colour,
        description: bits.length?bits.join('  \u00b7  '):undefined,
        fields: fields,
        footer: {text:(task.tickedAt?'Ticked '+task.tickedAt+'  \u00b7  ':'')+'BDL VA HQ'}
      }]})
    });
  } catch(e) { console.error('Task notify error:',e); }
}

// ── LIVE STATUS PUSH ─────────────────────────────────────
// ── DISCORD BREAK NOTIFICATION ───────────────────────────
async function discord_break_notify(isStart, breakDurationMins) {
  if (IS_PREVIEW) return;
  try{ if(inQuietHours()) return; }catch(e){}
  if (!DISCORD_BREAK_WEBHOOK) return;
  if (!state.currentVA || state.currentVA === 'Test') return;
  // a break started and ended inside a minute is a misclick, not a break — don't ping Jack
  if (!isStart && (parseInt(breakDurationMins)||0) < 1) return;
  var isMera = state.currentVA === 'Mera';
  var colour = isStart ? 16750848 : 5763719; // amber for start, green for end
  var emoji = isMera ? '🟣' : '🟡';
  var ms = workedMs();
  var shiftHrs = (ms/3600000).toFixed(1);
  var allTasks = state.tasks.concat(state.extraTasks);
  var totalLeads = allTasks.reduce(function(s,t){return s+(parseInt(t.leads)||0);},0);
  var doneTasks = allTasks.filter(function(t){return t.done;}).length;
  var fields = [
    {name:'⏱ Shift time', value: shiftHrs+'h worked', inline:true},
    {name:'🎯 Leads so far', value: String(totalLeads), inline:true},
    {name:'✅ Tasks done', value: doneTasks+'/'+allTasks.length, inline:true},
  ];
  if (!isStart && breakDurationMins !== undefined) {
    fields.push({name:'☕ Break duration', value: breakDurationMins+' mins', inline:true});
    var totalBreakSoFar = Math.round(state.totalBreakMs/60000);
    fields.push({name:'Total break today', value: totalBreakSoFar+' mins', inline:true});
  }
  var title = emoji + ' ' + state.currentVA + (isStart ? ' — Started a break ☕' : ' — Back from break ✅');
  try {
    await fetch(DISCORD_BREAK_WEBHOOK, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({embeds:[{
        title: title,
        color: colour,
        fields: fields,
        footer: {text:'BDL VA HQ · '+(isStart?state._currentBreakStartTime:new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:true}))+' UK'}
      }]})
    });
  } catch(e) { console.error('Break notify error:',e); }
}

// ── DISCORD SHIFT START NOTIFICATION ────────────────────
async function discord_shift_start_notify(va) {
  if (IS_PREVIEW) return;
  try{ if(inQuietHours()) return; }catch(e){}
  if (!DISCORD_SHIFT_START_WEBHOOK || DISCORD_SHIFT_START_WEBHOOK === 'YOUR_SHIFT_START_WEBHOOK') return;
  if (!va || va === 'Test') return;
  var isMera = va === 'Mera';
  var emoji = isMera ? '🟣' : '🟡';
  var startTime = new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:true});
  try {
    await fetch(DISCORD_SHIFT_START_WEBHOOK, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({content: emoji+' **'+va+'** has started their shift · '+startTime+' UK'})
    });
  } catch(e) { console.error('Shift start notify error:',e); }
}

async function db_pushLiveStatus() {
  if (IS_PREVIEW) return;
  if (!DB_ENABLED || !state.currentVA || state.currentVA === 'Test' || !state.shiftStart) return;
  var ms = workedMs();
  var shiftHrs = (ms/3600000).toFixed(1);
  var allTasks = state.tasks.concat(state.extraTasks);
  var doneTasks = allTasks.filter(function(t){return t.done;});
  var totalLeads = allTasks.reduce(function(s,t){return s+(parseInt(t.leads)||0);},0);
  var currentTask = allTasks.find(function(t){return !t.done&&!t.skipped;});
  // order by when it was actually ticked, not by position in the list — going back to tick
  // an earlier task was making a VA look idle on Jack's Live panel
  var _byTick = doneTasks.slice().sort(function(a,b){ return String(a.tickedAt||'').localeCompare(String(b.tickedAt||'')); });
  var lastDone = _byTick.length ? _byTick[_byTick.length-1] : null;
  var status = {
    va: state.currentVA,
    // _trueStart: state.shiftStart is a timer base the draft restore rewrites, and this
    // value is what Jack's Live card prints AND what its idle detection counts from.
    shiftStart: new Date(state._trueStart||state.shiftStart).toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:true}),
    hoursWorked: shiftHrs,
    /* Wall-clock since she clocked in, minus breaks, versus what the timer actually
       counted. These should match. On 18/08 Suz's read 0.8h against 4h04m on the wall.
       NOT auto-corrected: a closed laptop legitimately parks the clock and would make
       an auto-fix pay her for time she was not working. Reported instead, so Jack sees
       the gap on the Live card the same hour it opens rather than at the end of a day. */
    clockGapMins: (function(){
      try{
        var ts=state._trueStart||state.shiftStart; if(!ts) return 0;
        var wall=Date.now()-ts-breakSoFarMs();
        return Math.max(0, Math.round((wall-workedMs())/60000));
      }catch(e){ return 0; }
    })(),
    /* Both numbers, not just the difference — so the Live card can show "clocked 4h04m
       / counted 47m" and the problem reads itself, instead of a bare gap figure that
       still needs working out. */
    clockedMins: (function(){ try{ var ts=state._trueStart||state.shiftStart;
      return ts?Math.max(0,Math.round((Date.now()-ts-breakSoFarMs())/60000)):0; }catch(e){ return 0; } })(),
    timerMins:   (function(){ try{ return Math.round(workedMs()/60000); }catch(e){ return 0; } })(),
    clockRepairs:(window._shiftClockRepaired||0),
    onBreak: state.onBreak,
    breakCount: state.breaks.length,
    totalBreakMins: Math.round(state.totalBreakMs/60000),
    totalLeads: totalLeads,
    tasksDone: doneTasks.length,
    totalTasks: allTasks.length,
    currentTask: currentTask ? currentTask.name : (state.submitted ? 'Shift submitted' : 'All tasks done'),
    lastCompletedTask: lastDone ? lastDone.name : '—',
    lastTickedAt: lastDone ? (lastDone.tickedAt||'') : '',
    submitted: state.submitted,
    lastUpdated: new Date().toLocaleTimeString('en-GB',{timeZone:'Europe/London',hour:'2-digit',minute:'2-digit',hour12:true}),
    completedTasks: doneTasks.map(function(t){return {name:t.name,tickedAt:t.tickedAt||'',leads:t.leads||0};})
  };
  try {
    await fetch(SUPABASE_URL+'/rest/v1/live_status', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'apikey':SUPABASE_ANON_KEY,
        'Authorization':'Bearer '+SUPABASE_ANON_KEY,
        'Prefer':'resolution=merge-duplicates'
      },
      body: JSON.stringify({va: state.currentVA, updated_at: new Date().toISOString(), data: status})
    });
  } catch(e) { console.error('Live push error:',e); }
}

