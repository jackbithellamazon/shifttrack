// ── WEEKLY REVIEW ────────────────────────────────────────
async function sendWeeklyReview(isAutoSunday) {
  if (!DISCORD_WEEKLY_WEBHOOK) return;
  try{
    var monThis=mgr_weekStart(), sunThis=mgr_addDays(monThis,6);
    var log=mgr_getLog().filter(function(r){return r.va!=='Test'&&mgr_dateInRange(r.date,monThis,sunThis);});
    var msgs=await buildWeeklyEmbeds(monThis,sunThis,log,{label:'Weekly VA Review',current:true});
    await postWeeklyMessages(DISCORD_WEEKLY_WEBHOOK,msgs);
  }catch(e){}
}
function mgr_startWeeklyScheduler(){
  clearInterval(window._weeklySchedulerInterval);
  window._weeklySchedulerInterval = setInterval(function(){
    var now = ukNow();
    if(now.getDay()===0){ // Sunday
      var h=now.getHours(), mn=now.getMinutes();
      if(h===18&&mn===0){
        var key='weekly_sent_'+now.toLocaleDateString('en-GB');
        if(!lsGet(key)){
          lsPut(key,'1');
          sendWeeklyReview();
        }
      }
    }
  }, 60000); // check every minute
}

function mgr_renderAll(){
  document.getElementById('dash-date').textContent=ukDateString();
  // Update DB status indicator
  var dbEl=document.getElementById('db-status');
  if(dbEl){
    if(DB_ENABLED){
      dbEl.textContent='⬤ Supabase live';
      dbEl.style.color='#10d99a';
      dbEl.style.borderColor='rgba(45,212,163,0.3)';
      dbEl.style.background='rgba(45,212,163,0.06)';
    } else {
      dbEl.textContent='⬤ Local only';
      dbEl.style.color='#555';
    }
  }
  /* (v50.9) the March-2026 demo-row cleanup went with the browser copy it cleaned —
     Supabase holds no such rows (checked 27/09/2026). */
  mgr_flagBanner(mgr_getLog());
  mgr_renderOverview();
  mgr_syncFromDB();
  try{ mgr_startLiveTick(); }catch(e){}    // keep ON SHIFT NOW live without a hard refresh
  try{ mgr_syncReports(); }catch(e){}
  try{ payCheckCloud(); }catch(e){}                    // VA-reported issues live in the cloud, not his browser
  // saved-filter library + usage stats (own tables) — repaint settings if it's open
  try{ sfltLoadCloud().then(function(){ if(mgr_currentTab==='settings') sfltMgrRepaint(); }); }catch(e){}
  try{ fuLoadCloud().then(function(){ if(mgr_currentTab==='settings') sfltMgrRepaint(); }); }catch(e){}
  mgr_startWeeklyScheduler();
  setTimeout(function(){
    var out=document.getElementById('ai-out');
    if(out&&out.innerHTML.indexOf('Ask a question')>=0){
      mgr_aiAsk('Give me a quick overview of this week\'s performance. Which VA is doing better and why? Any patterns worth noting?','ai-out');
    }
  },800);
}


