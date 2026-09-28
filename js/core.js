// ── STATE ────────────────────────────────────────────────
// bumped on every ship — shown as a badge next to the logo so a screenshot instantly tells us the version
/* Versioning: 0.1 per ship (Jack's convention across his webapps).
   Carried over from the old integer scheme by /10, so ordering and every historical
   file still line up — v205 -> v20.5, v172 -> v17.2. Next ship is v20.6. */
var APP_VERSION='v51.6';
document.addEventListener('DOMContentLoaded',function(){ var v=document.getElementById('app-ver'); if(v) v.textContent=APP_VERSION; });
// EOD-based tick reconcile runs on EVERY load (any device) — so completed items are marked
// done in the rollover bucket even if only one person opens the app that day.
// MUST pull the cloud buckets first, else stale local iids won't match.
setTimeout(function(){ try{
  if(typeof mgr_fetchOpenBuckets==='function' && typeof jb_reconcileFromShifts==='function'){
    mgr_fetchOpenBuckets().then(function(){ jb_reconcileFromShifts(); }).catch(function(){});
  }
}catch(e){} }, 2500);

var state = {
  currentVA:null, shiftStart:null, onBreak:false,
  breakStart:null, totalBreakMs:0, timerInterval:null, liveInterval:null,
  pendingSkipTask:null, tasks:[], extraTasks:[],
  breaks:[], submitted:false, storefronts:[]
};

// Kill browser autofill / search-history dropdowns on every input the app ever renders
(function(){
  function stamp(root){
    try{
      (root.querySelectorAll?root.querySelectorAll('input,textarea'):[]).forEach(function(el){
        if(el.getAttribute('autocomplete')!=='off'){ el.setAttribute('autocomplete','off'); el.setAttribute('autocorrect','off'); el.setAttribute('autocapitalize','off'); el.setAttribute('spellcheck','false'); }
      });
    }catch(e){}
  }
  function boot(){
    stamp(document);
    try{
      new MutationObserver(function(muts){ muts.forEach(function(m){ m.addedNodes&&m.addedNodes.forEach(function(n){ if(n.nodeType===1) stamp(n); }); }); })
        .observe(document.body,{childList:true,subtree:true});
    }catch(e){}
  }
  if(document.body) boot(); else document.addEventListener('DOMContentLoaded',boot);
})();

// ── APP SETTINGS ─────────────────────────────────────────
var APP_SETTINGS_KEY = 'shifttrack_app_settings_v2';
var DEFAULT_APP_SETTINGS = {
  newsletterSchedule:{1:'Suz',2:'Mera',3:'Suz',4:'Mera',5:'Suz'},
  weeklyHoursTarget:40,
  dailyHoursTarget:8,
  oosHoursTarget:2.5,
  poaNotes:{Mera:'',Suz:''},
  managerPin:'1234'
};
var DAY_LABELS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var WORKDAY_INDEXES = [1,2,3,4,5];

function cloneDefaultSettings(){
  return JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS));
}
function getAppSettings(){
  var settings = cloneDefaultSettings();
  try {
    var saved = JSON.parse(lsGet(APP_SETTINGS_KEY)||'{}');
    if(saved.newsletterSchedule) {
      WORKDAY_INDEXES.forEach(function(d){
        if(saved.newsletterSchedule[d] !== undefined) settings.newsletterSchedule[d] = saved.newsletterSchedule[d];
      });
    }
    ['weeklyHoursTarget','dailyHoursTarget','oosHoursTarget'].forEach(function(k){
      var n = parseFloat(saved[k]);
      if(!isNaN(n) && n > 0) settings[k] = n;
    });
    if(saved.poaNotes) {
      settings.poaNotes.Mera = String(saved.poaNotes.Mera||'');
      settings.poaNotes.Suz = String(saved.poaNotes.Suz||'');
    }
    if(saved.managerPin !== undefined && String(saved.managerPin).trim()) settings.managerPin = String(saved.managerPin).trim();
    ['whMain','whWeekly','whTasks','whBreaks','whShiftStart','whPay','whLeadsMera','whLeadsSuz','sheetsApiKey'].forEach(function(k){
      if(saved[k] !== undefined) settings[k] = String(saved[k]).trim();
    });
    ['nMain','nWeekly','nTasks','nBreaks','nShiftStart','nLeadsMera','nLeadsSuz'].forEach(function(k){
      if(saved[k] !== undefined) settings[k] = saved[k]?1:0;
    });
    ['whLeadsMera','whLeadsSuz','leadMention','leadsStartDate','vaGreeting','labelMera','labelSuz','spendNameA','spendProvA','spendTgtA','spendNameS','spendProvS','spendTgtS','spendColA','spendColS'].forEach(function(k){
      if(saved[k] !== undefined) settings[k] = String(saved[k]).trim();
    });
    if(saved.spendShowCombined !== undefined) settings.spendShowCombined = saved.spendShowCombined?1:0;
    if(saved.spendShowPace !== undefined) settings.spendShowPace = saved.spendShowPace?1:0;
    if(Array.isArray(saved.badges)) settings.badges = saved.badges;
    // v51.5: the VAs' ticklists ride in Settings like everything else, so an edit on Jack's
    // machine reaches theirs (it used to stay in his browser — see getCustomTaskTemplateMap)
    if(saved.taskTemplates && typeof saved.taskTemplates==='object' && !Array.isArray(saved.taskTemplates)) settings.taskTemplates = saved.taskTemplates;
    ['vaCanAddTasks','vaShowBreak','vaShowStreak','vaShowMomentum','vaCelebrate'].forEach(function(k){
      if(saved[k] !== undefined) settings[k] = saved[k]?1:0;
    });
    if(saved.idleMins){ var im=parseInt(saved.idleMins); if(!isNaN(im)&&im>=15) settings.idleMins=im; }
    ['wbUrl','wbToken','sbHowText'].forEach(function(k){ if(typeof saved[k]==='string') settings[k]=saved[k]; });
    ['sfLeadsPerDay','sfLeadsPerHr'].forEach(function(k){
      var n=parseFloat(saved[k]); if(!isNaN(n)&&n>0) settings[k]=n; });
    ['goalMera','goalSuz','oaGoalMera','oaGoalSuz'].forEach(function(k){
      var n=parseInt(saved[k]); if(!isNaN(n)&&n>=0) settings[k]=n; });
    // per-VA weekly hours — Jack chose different targets per VA, not one shared number
    ['hoursMera','hoursSuz'].forEach(function(k){ var n=parseFloat(saved[k]); if(!isNaN(n)&&n>0) settings[k]=n; });
    // min leads/week were saved but never copied back here, so they snapped back to 60 on every read
    ['minLeadsMera','minLeadsSuz','keepaWkMera','keepaWkSuz','thcWkMera','thcWkSuz',
     'keepaAddWkMera','keepaAddWkSuz','over100MoMera','over100MoSuz','premiumMoMera','premiumMoSuz','flagshipMoMera','flagshipMoSuz']
      .forEach(function(k){ var n=parseInt(saved[k]); if(!isNaN(n)&&n>=0) settings[k]=n; });
    // who's on which pay run — same trap: written by the settings card, dropped on read
    if(Array.isArray(saved.payPeople)) settings.payPeople=saved.payPeople;
    if(Array.isArray(saved.payRuns)) settings.payRuns=saved.payRuns;
    if(saved.payAdminMonthEnd!==undefined) settings.payAdminMonthEnd=saved.payAdminMonthEnd;
    if(saved.payOtRate!==undefined) settings.payOtRate=saved.payOtRate;
    if(saved.payOtHours && typeof saved.payOtHours==='object') settings.payOtHours=saved.payOtHours;
    if(Array.isArray(saved.jbPresets)) settings.jbPresets=saved.jbPresets;   // From-Jack presets
    if(Array.isArray(saved.jbNoteSnips)) settings.jbNoteSnips=saved.jbNoteSnips; // reusable note phrases
    if(saved.keepaDomain) settings.keepaDomain=String(saved.keepaDomain);   // Keepa marketplace id
    if(typeof saved.appUrl==='string') settings.appUrl=saved.appUrl;
    if(Array.isArray(saved.savedFilters)) settings.savedFilters=saved.savedFilters;
    ['swRoi','swProfit','swDemand','swMargin'].forEach(function(k){ var n=parseFloat(saved[k]); if(!isNaN(n)&&n>=0&&n<=2) settings[k]=n; });
    if(saved.scoreMode==='smart'||saved.scoreMode==='manual') settings.scoreMode=saved.scoreMode;
    /* getAppSettings rebuilds from the defaults and copies back a WHITELIST, so any key
       not named here is written to storage and then silently ignored on the next read.
       The matrix overrides hit exactly that: edits saved, scores never moved. */
    if(saved.dealMatrix && typeof saved.dealMatrix==='object') settings.dealMatrix=saved.dealMatrix;
    if(Array.isArray(saved.savedFilters)) settings.savedFilters=saved.savedFilters;
    if(saved.leadsStartDate!==undefined) settings.leadsStartDate=String(saved.leadsStartDate);
    if(saved.quietFrom!==undefined) settings.quietFrom=String(saved.quietFrom);
    if(saved.quietTo!==undefined) settings.quietTo=String(saved.quietTo);
    if(saved.colMera) settings.colMera=String(saved.colMera);
    if(saved.colSuz) settings.colSuz=String(saved.colSuz);
    if(saved.discordUserId!==undefined) settings.discordUserId=String(saved.discordUserId).replace(/[^0-9]/g,'');
  } catch(e){}
  return settings;
}
// Apply webhook overrides from settings onto the runtime constants
function applyWebhookSettings(){
  try{
    var s=getAppSettings();
    if(s.whMain) DISCORD_WEBHOOK=s.whMain;
    if(s.whWeekly) DISCORD_WEEKLY_WEBHOOK=s.whWeekly; else if(s.whMain) DISCORD_WEEKLY_WEBHOOK=s.whMain;
    if(s.whTasks) DISCORD_TASKS_WEBHOOK=s.whTasks;
    if(s.whBreaks) DISCORD_BREAK_WEBHOOK=s.whBreaks;
    if(s.whShiftStart) DISCORD_SHIFT_START_WEBHOOK=s.whShiftStart; else if(s.whMain) DISCORD_SHIFT_START_WEBHOOK=s.whMain;
    if(s.whPay) DISCORD_PAY_WEBHOOK=s.whPay; else if(s.whMain) DISCORD_PAY_WEBHOOK=s.whMain;
    /* v51.1: the Google Sheets key comes from Settings, never from the file (see manager-tabs.js).
       LEAD_PULL_KEY is the sheet-ingestion copy of the same key (sheets.js). */
    if(typeof s.sheetsApiKey==='string' && s.sheetsApiKey.trim()){ SPEND_API_KEY=s.sheetsApiKey.trim(); try{ LEAD_PULL_KEY=SPEND_API_KEY; }catch(e){} }
    // toggles: off → blank the runtime URL so every sender's guard skips it
    if(s.nMain===0) DISCORD_WEBHOOK='';
    if(s.nWeekly===0) DISCORD_WEEKLY_WEBHOOK='';
    if(s.nTasks===0) DISCORD_TASKS_WEBHOOK='';
    if(s.nBreaks===0) DISCORD_BREAK_WEBHOOK='';
    if(s.nShiftStart===0) DISCORD_SHIFT_START_WEBHOOK='';
    if(s.nPay===0) DISCORD_PAY_WEBHOOK='';
  }catch(e){}
}
/* A Discord CHANNEL link and a WEBHOOK url look similar but do completely different
   things — pasting the channel link is the easiest mistake to make here, so say so
   plainly at the point of entry rather than failing silently later. */
function whBadMsg(v){
  v=String(v||'').trim();
  if(!v) return '';
  if(/^https?:\/\/(www\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+/i.test(v)) return '';
  if(/discord(app)?\.com\/channels\//i.test(v))
    return '⚠️ That\'s the <b>channel link</b>, not a webhook. In Discord: right-click the channel → <b>Edit Channel</b> → <b>Integrations</b> → <b>Webhooks</b> → <b>New Webhook</b> → <b>Copy Webhook URL</b>. It contains <b>/api/webhooks/</b>.';
  if(/^\d{10,}$/.test(v))
    return '⚠️ That\'s just the channel <b>ID</b>. You need the full webhook URL — Edit Channel → Integrations → Webhooks → Copy Webhook URL.';
  return '⚠️ Doesn\'t look like a Discord webhook URL. It should start <b>https://discord.com/api/webhooks/</b>';
}
var WH_NAMES={main:'Main \u2014 EOD reports',weekly:'Weekly Monday summary',tasks:'Task ticks',breaks:'Breaks',
  shiftstart:'Shift start',pay:'\u{1F4B7} Important \u2014 pay & admin'};
var WH_KEY={main:'whMain',weekly:'whWeekly',tasks:'whTasks',breaks:'whBreaks',shiftstart:'whShiftStart',
  pay:'whPay', sheetskey:'sheetsApiKey'};   // sheetskey is not a webhook — whValidate skips the URL check for it
/* Webhook fields now save AS YOU TYPE. Requiring a separate Save press meant a valid URL
   could sit in the box, test fine (the test reads the box directly) and still never be
   stored — which is exactly what kept happening. */
function whValidate(el){
  try{
    var kind=el.id.replace('setting-wh-','');
    var box=document.getElementById('wh-bad-'+kind);
    var val=String(el.value||'').trim();
    var isKey=(kind==='sheetskey');
    if(box) box.innerHTML=isKey?(val&&!/^AIza[0-9A-Za-z_-]{35}$/.test(val)?'⚠️ A Google API key starts with <b>AIza</b> and is 39 characters.':''):whBadMsg(val);
    var key=WH_KEY[kind]; if(!key) return;
    clearTimeout(window['_whT_'+kind]);
    window['_whT_'+kind]=setTimeout(function(){
      if(val && (isKey?!/^AIza[0-9A-Za-z_-]{35}$/.test(val):whBadMsg(val))) return;   // don't store something invalid
      var st=getAppSettings(); st[key]=val; saveAppSettings(st);
      try{ applyWebhookSettings(); }catch(e){}
      try{ pushSettingsCloud(st); }catch(e){}
      var ok=document.getElementById('wh-ok-'+kind);
      if(ok){ ok.textContent=val?'Saved \u2713':''; setTimeout(function(){ if(ok) ok.textContent=''; },2200); }
    },500);
  }catch(e){}
}
function wh_test(kind){
  try{
    var map={main:DISCORD_WEBHOOK,weekly:DISCORD_WEEKLY_WEBHOOK,tasks:DISCORD_TASKS_WEBHOOK,breaks:DISCORD_BREAK_WEBHOOK,shiftstart:DISCORD_SHIFT_START_WEBHOOK};
    var inp=document.getElementById('setting-wh-'+kind);
    var url=(inp&&inp.value.trim())||map[kind];
    if(!url){ showToast('No URL set for this webhook', true); return; }
    var bad=whBadMsg(url);
    if(bad){ showToast(bad.replace(/<[^>]+>/g,''), true); return; }
    showToast('Testing '+(WH_NAMES[kind]||kind)+'\u2026');
    // the pay channel gets the ACTUAL reminder as a demo — "this channel is connected"
    // tells him nothing about how the thing works
    if(kind==='pay' && typeof payTestPing==='function'){ payTestPing(url); return; }
    if(IS_PREVIEW){ showToast('Preview copy — test pings are blocked so they can\'t hit your real channels', true); return; }
    var notWired=false;
    var LBL={main:'Main \u2014 EOD reports',weekly:'Weekly Monday summary',tasks:'Task ticks',breaks:'Breaks',
             shiftstart:'Shift start',pay:'\u{1F4B7} Important \u2014 pay & admin'};
    var _uid=''; try{ _uid=(getAppSettings().discordUserId||'').trim(); }catch(e){}
    var body={
      content:_uid?('<@'+_uid+'> \u2014 checking this mention reaches you'):undefined,
      allowed_mentions:_uid?{parse:[],users:[_uid]}:undefined,
      embeds:[{
      author:{name:'BDL VA HQ \u00b7 webhook test'},
      title:'\u2705 This channel is connected',
      color:3066993,
      description:'**'+(LBL[kind]||kind)+'** will post here from now on.'
        +(_uid?'\n\nThe @ above confirms mentions reach you in this channel.':'\n\n\u26a0\ufe0f No Discord user ID set, so messages won\'t @ you \u2014 add it lower down in Notifications.')
        +(notWired?'\n\n\u26a0\ufe0f Note: new-lead pings aren\'t wired yet, so this URL is saved but nothing posts automatically.':''),
      footer:{text:'Sent from Settings \u2192 Notifications \u00b7 '+dcUK()},
      timestamp:new Date().toISOString()}]};
    fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){ showToast(r.ok?(notWired?'URL works \u2713 \u2014 but lead pings aren\'t wired yet':'Sent \u2713 \u2014 that was \u201c'+(WH_NAMES[kind]||kind)+'\u201d'):'Discord rejected it \u2014 check the URL', !r.ok); })
      .catch(function(){ showToast('Could not reach Discord', true); });
  }catch(e){}
}
applyWebhookSettings();
// new device with no webhooks configured? pull the shared settings once
(function(){try{
  var st=getAppSettings();
  if(st.whMain||lsGet('st_cloud_pulled')==='1') return;
  fetchT(SUPABASE_URL+'/rest/v1/app_settings?id=eq.global&select=data',
    {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}})
    .then(function(r){return r.ok?r.json():[];})
    .then(function(rows){
      lsPut('st_cloud_pulled','1');
      if(rows&&rows[0]&&rows[0].data){
        var cloud=rows[0].data, cur=getAppSettings();
        // never let an empty cloud value wipe a set local one for protected keys (leadsStartDate, webhooks…)
        try{ if(typeof SETTINGS_PROTECT!=='undefined'){ SETTINGS_PROTECT.forEach(function(k){ if((!cloud[k]||!String(cloud[k]).trim()) && cur[k]&&String(cur[k]).trim()) cloud[k]=cur[k]; }); } }catch(e){}
        saveAppSettings(cloud); applyWebhookSettings(); try{applyVaColours();}catch(e){} try{applyVaLabels();}catch(e){}
        // the filter library has its OWN cache which getSavedFilters() reads FIRST — without
        // this it survives the cloud pull, so a device keeps showing filters the cloud no
        // longer has. Cloud is the source of truth for the library.
        try{ if(typeof sfltCacheSet==='function') sfltCacheSet(Array.isArray(cloud.savedFilters)?cloud.savedFilters:[]); }catch(e){}
        try{ if(typeof mgr_currentTab!=='undefined' && mgr_currentTab==='filters' && typeof mgr_renderFilters==='function') mgr_renderFilters(); }catch(e){}
      }
    }).catch(function(){});
}catch(e){}})();
// FILTER LIBRARY SYNC — runs on EVERY load. The one-shot settings pull above is skipped
// on any device that already has webhooks, and the library keeps its own cache that
// getSavedFilters() reads FIRST — so a device could sit on filters the cloud no longer
// has, forever. The cloud row is the single source of truth for the library.
(function(){try{
  setTimeout(function(){
    if(typeof DB_ENABLED==='undefined'||!DB_ENABLED) return;
    fetchT(SUPABASE_URL+'/rest/v1/app_settings?id=eq.global&select=data',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}})
      .then(function(r){return r.ok?r.json():[];})
      .then(function(rows){
        var cloud=rows&&rows[0]&&rows[0].data; if(!cloud) return;
        if(!Array.isArray(cloud.savedFilters)) return;          // key absent → leave local alone
        var local=[]; try{ local=sfltCacheGet()||[]; }catch(e){}
        if(JSON.stringify(local)===JSON.stringify(cloud.savedFilters)) return;
        try{ sfltCacheSet(cloud.savedFilters); }catch(e){}
        try{ var st=getAppSettings(); st.savedFilters=cloud.savedFilters; saveAppSettings(st); }catch(e){}
        try{ if(typeof mgr_currentTab!=='undefined'&&mgr_currentTab==='filters'&&typeof mgr_renderFilters==='function') mgr_renderFilters(); }catch(e){}
        try{ if(typeof renderSavedFiltersVA==='function') renderSavedFiltersVA(); }catch(e){}
      }).catch(function(){});
  },1500);
}catch(e){}})();
// WEBHOOK SELF-HEAL — runs on EVERY load. For the protected keys (webhook URLs etc):
// a device that still has a URL restores an empty cloud; a device missing one adopts the
// cloud's. An empty side can never drain a full side again, in either direction.
(function(){try{
  setTimeout(function(){
    fetchT(SUPABASE_URL+'/rest/v1/app_settings?id=eq.global&select=data',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}})
      .then(function(r){return r.ok?r.json():[];})
      .then(function(rows){
        var cloud=rows&&rows[0]&&rows[0].data; if(!cloud) return;
        if(typeof SETTINGS_PROTECT==='undefined') return;
        var st=getAppSettings(); var localFix=false, cloudFix=false;
        SETTINGS_PROTECT.forEach(function(k){
          var lv=String(st[k]||'').trim(), cv=String(cloud[k]||'').trim();
          if(!lv&&cv){ st[k]=cloud[k]; localFix=true; }
          else if(lv&&!cv){ cloudFix=true; }
        });
        if(localFix){ saveAppSettings(st); applyWebhookSettings(); }
        if(cloudFix && typeof pushSettingsCloud==='function'){ pushSettingsCloud(st); }
      }).catch(function(){});
  },1200);
}catch(e){}})();
function applyVaColours(){
  try{ var st=getAppSettings(); var r=document.documentElement.style;
    if(st.colMera) r.setProperty('--mera',st.colMera);
    if(st.colSuz) r.setProperty('--suz',st.colSuz);
  }catch(e){}
}
applyVaColours(); try{applyVaLabels();}catch(e){}
// one-time: idle default moved 60 → 90 (Jack, 10 Jul)
(function(){try{
  if(lsGet('st_idle90')!=='1'){
    var st=getAppSettings();
    if(st.idleMins===60){ delete st.idleMins; saveAppSettings(st); }
    lsPut('st_idle90','1');
  }
}catch(e){}})();
function inQuietHours(){
  try{
    var st=getAppSettings();
    if(!st.quietFrom||!st.quietTo) return false;
    var now=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'}));
    var cur=now.getHours()*60+now.getMinutes();
    function m(t){var pp=String(t).split(':');return (parseInt(pp[0])||0)*60+(parseInt(pp[1])||0);}
    var a=m(st.quietFrom),b=m(st.quietTo);
    if(a===b) return false;
    return a<b ? (cur>=a&&cur<b) : (cur>=a||cur<b); // supports overnight ranges
  }catch(e){ return false; }
}
function saveAppSettings(settings){
  lsPut(APP_SETTINGS_KEY, JSON.stringify(settings));
}
function getNewsletterOwner(dayIndex){
  var settings = getAppSettings();
  return settings.newsletterSchedule[dayIndex] || 'None';
}
function isNewsletterDayFor(va){
  return getNewsletterOwner(ukDayOfWeek()) === va;
}
/* put a VA's colour back to its default — used by the collision warning above */
function vaColReset(va){
  try{
    var st=getAppSettings();
    if(va==='Suz') delete st.colSuz; else delete st.colMera;
    saveAppSettings(st); try{ pushSettingsCloud(st); }catch(e){}
    var r=document.documentElement.style;
    if(va==='Suz') r.setProperty('--suz',SUZ_COL); else r.removeProperty('--mera');
    try{ applyVaLabels(); }catch(e){}
    try{ mgr_renderSettings(); }catch(e){}
    showToast(va+'\u2019s colour reset \u2713');
  }catch(e){}
}
function vaColour(va){
  var s; try{ s=getAppSettings(); }catch(e){ s={}; }
  if(va==='Mera'||va==='VA M') return s.colMera||'#b23bff';
  if(va==='Suz'||va==='VA S') return s.colSuz||SUZ_COL;
  return '#777';
}
// custom display name / initial for a VA slot (Mera/Suz) or lead code (VA M/VA S)
function vaDisp(x){
  var s; try{ s=getAppSettings(); }catch(e){ s={}; }
  if(x==='Mera'||x==='VA M') return (s.labelMera&&s.labelMera.trim())||'Mera';
  if(x==='Suz'||x==='VA S')  return (s.labelSuz&&s.labelSuz.trim())||'Suz';
  return x;
}
function vaInitial(x){ var n=vaDisp(x); return (n[0]||'?').toUpperCase(); }
// ── configurable lead warning badges ──
var DEFAULT_BADGES=[
  {on:1,metric:'margin',op:'lt',val:6,label:'Low margin'},
  {on:1,metric:'fba',op:'gt',val:15,label:'Crowded (15+ sellers)'},
  {on:1,metric:'roi',op:'lt',val:12,label:'Low ROI'},
  {on:1,metric:'profit',op:'lt',val:3,label:'Thin profit'}    // 03/09: was 8 — contradicted the rubric's 'Mid profit £3–£9 / Strong buy'
];
var BADGE_METRICS=[['roi','ROI %'],['profit','Net profit £'],['margin','Margin %'],['fba','FBA sellers'],['spm','SPM']];
function getBadges(){ var s; try{s=getAppSettings();}catch(e){s={};} return Array.isArray(s.badges)?s.badges:DEFAULT_BADGES.slice(); }
function leadBadges(l){
  return getBadges().filter(function(r){
    if(!r.on) return false;
    var v=parseFloat(l[r.metric]); if(isNaN(v)) return false;
    var t=parseFloat(r.val); if(isNaN(t)) return false;
    return r.op==='gt' ? v>t : v<t;
  }).map(function(r){return r.label;});
}
function badgesSave(arr){ var s=getAppSettings(); s.badges=arr; saveAppSettings(s); }
function badgeAdd(){ var a=getBadges(); a.push({on:1,metric:'roi',op:'lt',val:15,label:'New warning'}); badgesSave(a); renderBadgeRules(); }
function badgeRemove(i){ var a=getBadges(); a.splice(i,1); badgesSave(a); renderBadgeRules(); }
function badgeSet(i,field,val){ var a=getBadges(); if(!a[i])return; if(field==='on')a[i].on=val?1:0; else if(field==='val')a[i].val=val; else a[i][field]=val; badgesSave(a); }
function renderBadgeRules(){
  var host=document.getElementById('badge-rules'); if(!host) return;
  var a=getBadges();
  var mopt=function(sel){return BADGE_METRICS.map(function(m){return '<option value="'+m[0]+'"'+(m[0]===sel?' selected':'')+'>'+m[1]+'</option>';}).join('');};
  host.innerHTML=a.map(function(r,i){
    return '<div class="badge-row">'
      +'<label class="wh-switch" style="flex-shrink:0"><input type="checkbox"'+(r.on?' checked':'')+' onchange="badgeSet('+i+',\'on\',this.checked)"><i></i></label>'
      +'<input class="settings-input badge-lbl" type="text" value="'+escHtml(r.label)+'" oninput="badgeSet('+i+',\'label\',this.value)" placeholder="Badge text">'
      +'<span class="badge-when">when</span>'
      +'<select class="settings-input badge-sel" onchange="badgeSet('+i+',\'metric\',this.value)">'+mopt(r.metric)+'</select>'
      +'<select class="settings-input badge-op" onchange="badgeSet('+i+',\'op\',this.value)"><option value="lt"'+(r.op==='lt'?' selected':'')+'>is below</option><option value="gt"'+(r.op==='gt'?' selected':'')+'>is above</option></select>'
      +'<input class="settings-input badge-val" type="number" step="any" value="'+escHtml(String(r.val))+'" oninput="badgeSet('+i+',\'val\',this.value)">'
      +'<button class="badge-del" title="Remove" onclick="badgeRemove('+i+')">&times;</button>'
      +'</div>';
  }).join('')+'<button class="btn btn-ghost" style="margin-top:10px;" onclick="badgeAdd()">+ Add badge</button>';
  try{ settingsMasonry(); }catch(e){}
}
// work out WHY a given ASIN has no free CDN image → drives the diagnostics list
function imgDiagReason(asin){
  var a=(asin||'').trim();
  if(!a) return {cat:'noasin', tag:'No ASIN', tagCol:'#8a8a99', txt:'No ASIN in the sheet for this lead — nothing to look up. Add the ASIN to the row.'};
  var validAsin=/^B0[0-9A-Z]{8}$/i.test(a), validIsbn=/^[0-9]{9}[0-9X]$/i.test(a);
  if(!validAsin && !validIsbn) return {cat:'invalid', tag:'Bad ASIN', tagCol:'#ff5c7a', txt:'The ASIN cell holds “'+escHtml(a.slice(0,32))+'” — not a 10-character ASIN (looks like a code or model number). Fix it in the sheet and the image pulls automatically — no Keepa needed.'};
  if(/^B0(D|F|G|H)/i.test(a)) return {cat:'newer', tag:'Too new', tagCol:'#f0a020', txt:'Recent ASIN — Amazon hasn’t added it to the free legacy image CDN yet. Only Keepa can fetch this one.'};
  return {cat:'nocdn', tag:'Not in CDN', tagCol:'#c98bff', txt:'Valid ASIN but Amazon publishes no P/-format thumbnail for it. Keepa can still pull the real listing image.'};
}
// scan every loaded lead's ASIN for a working Amazon image; list the ones that fail + why
function scanLeadImages(){
  var host=document.getElementById('img-diag'); if(!host) return;
  var ls=(window.leads||[]).filter(function(l){return l&&l.asin;});
  var seen={}; ls=ls.filter(function(l){ if(seen[l.asin])return false; seen[l.asin]=1; return true; });
  if(!ls.length){ host.innerHTML='<div style="color:var(--muted-2);font-size:12px;">No leads loaded yet — open the Leads tab once, then scan.</div>'; return; }
  host.innerHTML='<div style="color:var(--muted);font-size:12px;">Scanning '+ls.length+' unique ASINs&hellip;</div>';
  var fails=[], done=0, finished=false;
  function testOne(l,cb){
    var vs=(typeof imgCdnChain==='function')?imgCdnChain(l.asin):['https://images-na.ssl-images-amazon.com/images/P/'+l.asin+'.01._SL160_.jpg']; var i=0;
    (function nxt(){ if(i>=vs.length){cb(false);return;} var im=new Image(); im.onload=function(){ if(im.naturalWidth>1) cb(true); else nxt(); }; im.onerror=nxt; im.src=vs[i++]; })();
  }
  function finish(){ if(finished)return; finished=true; render(); }
  ls.forEach(function(l){ testOne(l,function(ok){ if(!ok) fails.push(l); if(++done===ls.length) finish(); }); });
  setTimeout(finish,25000);
  function render(){
    if(!fails.length){ host.innerHTML='<div style="color:var(--green);font-size:13px;font-weight:700;">✓ All '+ls.length+' ASINs return an Amazon image.</div>'
      +'<div style="margin-top:10px;"><button class="btn btn-ghost" onclick="window._imgScanned=0;scanLeadImages()">Re-scan</button></div>'; try{settingsMasonry();}catch(e){} return; }
    var cats={invalid:{n:'bad ASIN in sheet',c:'#ff5c7a',ct:0},newer:{n:'too new for CDN',c:'#f0a020',ct:0},nocdn:{n:'not in free CDN',c:'#c98bff',ct:0},noasin:{n:'no ASIN',c:'#8a8a99',ct:0}};
    var order={invalid:0,noasin:1,nocdn:2,newer:3};   // fixable-first so the actionable ones sit on top
    /* leadUseAsin, not l.asin — on conflicted rows this panel was diagnosing the
       column's ASIN, i.e. investigating why the WRONG product has no image. */
    var enriched=fails.map(function(l){ var _a=(typeof leadUseAsin==='function')?leadUseAsin(l):l.asin; return {l:l, _a:_a, r:imgDiagReason(_a)}; });
    enriched.forEach(function(e){ if(cats[e.r.cat]) cats[e.r.cat].ct++; });
    enriched.sort(function(a,b){ var oa=(a.r.cat in order)?order[a.r.cat]:9, ob=(b.r.cat in order)?order[b.r.cat]:9; return oa-ob; });
    window._imgFixList=enriched.filter(function(e){return e.r.cat==='invalid'||e.r.cat==='noasin';}).map(function(e){return (e.l.asin||'')+'  —  '+(e.l.title||'').slice(0,60);});
    var rowsHtml=enriched.map(function(e){
      var l=e.l, r=e.r;
      var uk='https://www.amazon.co.uk/dp/'+encodeURIComponent(e._a||'');
      var tried=(typeof imgCdnChain==='function')?imgCdnChain(e._a):[];
      var thumb=tried[0]?'<img src="'+tried[0]+'" class="imgdiag-thumb" onerror="this.classList.add(\'x\')" onload="if(this.naturalWidth<=1)this.classList.add(\'x\')">':'<div class="imgdiag-thumb x"></div>';
      return '<div class="imgdiag-row" style="border-left-color:'+r.tagCol+';display:flex;gap:11px;align-items:flex-start;">'
        +thumb
        +'<div style="flex:1;min-width:0;">'
        +'<span class="imgdiag-tag" style="background:'+r.tagCol+'22;color:'+r.tagCol+';">'+r.tag+'</span>'
        +'<div class="imgdiag-tt">'+escHtml((l.title||'(no title)').slice(0,80))+'</div>'
        +'<div class="imgdiag-meta"><code>'+escHtml(l.asin||'—')+'</code>'+(l.va?(' · '+(l.va==='VA M'?vaDisp('Mera'):vaDisp('Suz'))):'')+' · <a href="'+uk+'" target="_blank">Amazon UK ↗</a>'+(tried[0]?(' · <a href="'+tried[0]+'" target="_blank">img URL tried ↗</a>'):'')+'</div>'
        +'<div class="imgdiag-reason">'+r.txt+'</div></div></div>';
    }).join('');
    var chips=Object.keys(cats).filter(function(k){return cats[k].ct>0;}).map(function(k){
      return '<span class="imgdiag-chip" style="border-color:'+cats[k].c+'66;color:'+cats[k].c+';"><b>'+cats[k].ct+'</b> '+cats[k].n+'</span>';
    }).join('');
    var fixable=cats.invalid.ct+cats.noasin.ct, keepa=cats.newer.ct+cats.nocdn.ct;
    var verdict = fixable
      ? '<b style="color:#ff5c7a;">'+fixable+' to fix now</b> — the ASIN cell has a typo/code instead of a real ASIN; correct it in the sheet and the image appears (no Keepa)'+(keepa?'. The other <b style="color:#f0a020;">'+keepa+'</b> are valid but missing from Amazon’s free CDN — only Keepa fetches those.':'.')
      : (keepa?'Nothing to fix in the sheet — all <b style="color:#f0a020;">'+keepa+'</b> are valid ASINs Amazon just doesn’t serve a free thumbnail for. Keepa is the only way to get these.':'');
    host.innerHTML='<div style="font-size:12px;color:var(--muted);margin-bottom:9px;"><b style="color:var(--red);">'+fails.length+'</b> of '+ls.length+' ASINs show a placeholder. What&rsquo;s wrong &amp; how fast you can fix it:</div>'
      +'<div class="imgdiag-sum">'+chips+'</div>'
      +(verdict?'<div style="font-size:11.5px;color:var(--muted-2);margin-bottom:10px;line-height:1.5;background:var(--panel-2);border-radius:9px;padding:9px 12px;">'+verdict+'</div>':'')
      +'<div style="display:flex;gap:8px;margin-bottom:11px;flex-wrap:wrap;"><button class="btn btn-ghost" onclick="window._imgScanned=0;scanLeadImages()">↻ Re-scan</button>'
        +(fixable?'<button class="btn btn-ghost" onclick="copyImgFixList()">Copy the '+fixable+' to fix</button>':'')+'</div>'
      +'<div class="imgdiag-list">'+rowsHtml+'</div>';
    try{ settingsMasonry(); }catch(e){}
  }
}
function copyImgFixList(){
  var t=(window._imgFixList||[]).join('\n');
  try{ navigator.clipboard.writeText(t); showToast('Copied '+(window._imgFixList||[]).length+' ASINs to fix ✓'); }
  catch(e){ showToast('Copy failed — select manually', true); }
}
// push custom names/initials into the static screens (login cards, nav + manager tabs)
function applyVaLabels(){
  try{
    [['Mera','mera'],['Suz','suz']].forEach(function(p){
      var nm=vaDisp(p[0]), ini=vaInitial(p[0]);
      document.querySelectorAll('.va-card-'+p[1]+' .va-name').forEach(function(e){e.textContent=nm;});
      document.querySelectorAll('.va-card-'+p[1]+' .va-avatar').forEach(function(e){e.textContent=ini;});
      var tab=document.getElementById('tab-'+p[1]); if(tab) tab.textContent=nm;
    });
    var nvm=document.querySelector('.va-nav-lbl[data-va="VA M"]'); if(nvm) nvm.textContent=vaDisp('Mera');
    var nvs=document.querySelector('.va-nav-lbl[data-va="VA S"]'); if(nvs) nvs.textContent=vaDisp('Suz');
  }catch(e){}
}
function escHtml(s){
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function renderNewsletterSchedulePanels(){
  var settings = getAppSettings();
  var today = ukDayOfWeek();
  ['Mera','Suz'].forEach(function(viewVa){
    var holder = document.getElementById(viewVa.toLowerCase()+'-newsletter-schedule');
    var hint = document.getElementById(viewVa.toLowerCase()+'-newsletter-hint');
    var ownerToday = getNewsletterOwner(today);
    if(hint){
      if(ownerToday === viewVa) {
        hint.innerHTML = 'Settings say <strong>today is your Newsletter day.</strong><br>This adds the Newsletter check to your shift in 2 spots.';
      } else if(ownerToday === 'None') {
        hint.innerHTML = 'Settings say <strong>no VA owns Newsletter today.</strong><br>You can still add it manually if needed.';
      } else {
        hint.innerHTML = 'Settings say <strong>'+escHtml(ownerToday)+' owns Newsletter today.</strong><br>Only choose yes if Jack changed today manually.';
      }
    }
    if(!holder) return;
    holder.innerHTML = WORKDAY_INDEXES.map(function(day){
      var owner = settings.newsletterSchedule[day] || 'None';
      var isCurrent = day === today;
      var isMine = owner === viewVa;
      var ownerLabel = owner === 'None' ? '&#8212;' : escHtml(owner) + (isMine ? ' &#8592; You' : '');
      return '<div class="setup-schedule-row '+(isCurrent?'is-current':'')+'">'
        +'<span style="color:'+(isCurrent?'#fff':'rgba(255,255,255,0.48)')+';font-weight:'+(isCurrent?'700':'400')+';">'+DAY_LABELS[day]+'</span>'
        +'<span class="setup-schedule-va" style="color:'+vaColour(owner)+';">'+ownerLabel+'</span>'
        +'</div>';
    }).join('') + '<div class="setup-schedule-row"><span style="color:rgba(255,255,255,0.3);">Sat/Sun</span><span style="color:rgba(255,255,255,0.25);font-size:20px;">&#8212;</span></div>';
  });
}

// ── TASK TEMPLATES ───────────────────────────────────────
/* 15/09: the Sourcing app is now the VAs' filter list. ShiftTrack links INTO it and holds
   no filter links of its own for the everyday task. New tab always — its per-browser name
   and unsent-changes queue live under its own origin (Safari partitions frames). */
var SOURCING_APP_URL='https://jackbithellamazon.github.io/BDL-Sourcing-Suite/';
var SOURCING_DUE_URL=SOURCING_APP_URL+'#due';
var SOURCING_HOW='Open \u201cWhat\u2019s due\u201d first (new tab), then work down the rows below \u2014 late ones first. In the Suite: Run \u2192 open its Keepa filter \u2192 export \u2192 drop the file in \u2192 \u201cOpen all in Keepa\u201d and eyeball them. Log the keepers on your sheet as today\u2019s. A run you finish there ticks itself off here within a few minutes. Not signed in to the Suite? Ask Jack for your link.';
/* 27/09 (Jack, via the Sourcing brief): the VAs' saved filters are RETIRED. Their daily list is the
   Sourcing Suite's due list and nothing else. These ids no longer belong on anyone's ticklist,
   including a custom one Jack saved months ago — templateRefresh() strips them on the way in. */
var TEMPLATE_RETIRED=['ht-filters','eu-sheets','suz-eu','storefronts','suz-storefronts','kpf-tue','kpf-thu'];
var TASK_SOURCING_NAME='Sourcing Suite - Everyday Filters';
var TASK_SOURCING_HINT='Everything you run each day lives in the Sourcing Suite now \u2014 this is your filter list. '+SOURCING_HOW;
var taskTemplates = {
  Mera: [
    { id:'leadsheet',    name:'Lead Sheet - Check Jack\'s comments & action everything',  mandatory:true,  hint:'If you disagree with a comment, message Jack with data.' },
    { id:'telegram',     name:'Discord - Keepa Tracker Check',                           mandatory:true,  hint:'Check your Keepa tracker alerts in Jack\'s Discord — you should be getting 1-2 free leads every single day just from this. Items back in stock, price drops, deal alerts. This is easy leads for almost zero effort — do not skip it. THC Discord — also check these channels: #a2a-biz, #a2a-biz-10-20.' },
    // Newsletter slot A — after the Discord check (only if newsletter day — injected in startShift)
    { id:'pp-main',      name:'PP Main Run - Deal Watch Mera + High Ticket A2A',           mandatory:true,  hint:'Run all your PP channels fully. Log all EU brand drops in chat.' },
    { id:'kpf-daily',    name:TASK_SOURCING_NAME,                                        mandatory:true,  hint:TASK_SOURCING_HINT },
    { id:'jack-poa',     name:'Missed Yesterday + Jack POA',                               mandatory:true,  hint:'Finish anything missed from yesterday (filters, storefront ASINs etc) then check tasks/filters Jack sent.', hasLinks:true },
    { id:'sourcing',     name:'Sourcing Period - Your Own Sourcing Time',                  mandatory:true,  hint:'KPF (brand/category), Manual, Newsletter, Reverse KPF A2A, Arbi. Find a strong lead from a brand sale or promo - dig deep and pull multiple.', hasLinks:true },
    { id:'pp-light',     name:'PP Light Check (Later in Shift)',                           mandatory:true,  hint:'Quick scan for new pings only - do this later in your shift.' },
    { id:'telegram-eod', name:'Discord - End of Shift Check',                            mandatory:true,  hint:'Quick Discord check before you finish — the Keepa tracker alerts land there now. There should be at least 2 leads added to your lead sheet from this — check for back in stock alerts, price drops and deal pings. Log anything relevant.' },
    { id:'oos-sheet', name:'OOS Sheet', mandatory:true, hint:'Log any out-of-stock items to the OOS sheet. Target is 2.5 hours per week minimum — this directly impacts restocking decisions. Time how long you spend and log it.', hasLinks:false },
    { id:'leadsheet-eod', name:'Lead Sheet - Final Check Before Logging Off',             mandatory:true,  hint:'Last thing before you finish — check the lead sheet one more time. Action any new comments Jack has left. Tick off when done.' }
  ],
  Suz: [
    {
      id:'suz-leadsheet', name:'Lead Sheet - Check Jack\'s comments & action everything', mandatory:true,
      hint:'Check Jack\'s comments and action everything. If you disagree with a comment, message Jack with data.'
    },
    {
      id:'suz-telegram', name:'Discord - Keepa Tracker Check', mandatory:true,
      hint:'Check your Keepa tracker alerts in Jack\'s Discord — you should be getting 1-2 free leads every single day just from this. Items back in stock, price drops, deal alerts. This is easy leads for almost zero effort — do not skip it. THC Discord — also check these channels: #automated-leads, #a2a-leads, #a2a-non-keepa, #a2a-beta, #a2a-eu.'
    },
    {
      id:'suz-pp', name:'ProfitPath Main Run (50spm-eu-suz / uk-a2a-suz / uk-biz-suz / no-variations-eu-suz / 20spm-eu-suz)', mandatory:true,
      hint:'Run all your PP channels fully. Once PP is done → send a list in chat of ALL EU brands that have dropped (no excuses). If a brand drops multiple times → post: EU sheet needed then - brands.'
    },
    {
      id:'suz-kpf-daily', name:TASK_SOURCING_NAME, mandatory:true,
      hint:TASK_SOURCING_HINT
    },
    {
      id:'suz-jack-poa', name:'Missed Yesterday + Jack POA', mandatory:true,
      hint:'Finish anything missed from yesterday (filters, storefront ASINs etc) then check tasks/filters Jack sent.', hasLinks:true
    },
    {
      id:'suz-sourcing', name:'Sourcing Period - Your Own Sourcing Time', mandatory:true,
      hint:'KPF (brand/category), Manual, Newsletter, Reverse KPF A2A, Arbi. Find a strong lead from a brand sale or promo - dig deep and pull multiple.', hasLinks:true
    },
    {
      id:'suz-pp-light', name:'PP Light Check (Later in Shift)', mandatory:true,
      hint:'Quick scan for new pings only - do this later in your shift.'
    },
    {
      id:'suz-telegram-eod', name:'Discord - End of Shift Check', mandatory:true,
      hint:'Quick Discord check before you finish — the Keepa tracker alerts land there now. There should be at least 2 leads added to your lead sheet from this — check for back in stock alerts, price drops and deal pings. Log anything relevant.'
    },
    {
      id:'suz-oos-sheet', name:'OOS Sheet', mandatory:true,
      hint:'Log any out-of-stock items to the OOS sheet. Target is 2.5 hours per week minimum — this directly impacts restocking decisions. Time how long you spend and log it.'
    },
    {
      id:'suz-leadsheet-eod', name:'Lead Sheet - Final Check Before Logging Off', mandatory:true,
      hint:'Last thing before you finish — check the lead sheet one more time. Action any new comments Jack has left. Tick off when done.'
    }
  ],
  Test: [
    { id:'test-1', name:'Test Task 1 - Tick only',    mandatory:true,  tickOnly:true, hint:'This is a test task. Just tick it off.' },
    { id:'test-2', name:'Test Task 2 - Time + Leads', mandatory:true,  hint:'Fill in time and leads to test validation.' },
    { id:'test-3', name:'Test Task 3 - With Links',   mandatory:true,  hint:'This task has a links section.', hasLinks:true },
    { id:'test-4', name:'Test Task 4 - Optional',     mandatory:false, hint:'This is an optional test task.' }
  ]
};

var CUSTOM_TASK_TEMPLATES_KEY = 'shifttrack_custom_task_templates_v1';
var mgr_settingsTaskVA = 'Mera';
var mgr_settingsTaskDrafts = {};
var mgr_settingsPoaDrafts = {};

function cloneTaskTemplates(tasks){
  return (tasks||[]).map(function(t){
    return {
      id:String(t.id||('task-'+Date.now()+Math.random().toString(36).slice(2,6))),
      name:String(t.name||'Untitled task'),
      mandatory:t.mandatory !== false,
      hint:String(t.hint||''),
      hasLinks:!!t.hasLinks,
      tickOnly:t.tickOnly===true,
      archived:t.archived===true      // parked tasks must survive the clone, or Archive is a no-op
    };
  });
}
/* 28/09 — the bug behind "why does my ticklist say 7 Day Drops and hers says Everyday Filters":
   every ticklist edit Jack made in Settings was saved to HIS browser only (this key), while the
   VAs ran the code defaults. None of his edits had ever reached them. The shared ticklist now
   lives in app_settings.taskTemplates and syncs like the webhooks. The old browser copy is not
   applied any more; tplLegacyBannerHTML() offers it back to Jack once, to adopt or discard. */
function getCustomTaskTemplateMap(){
  try{ var st=getAppSettings(); if(st.taskTemplates && typeof st.taskTemplates==='object') return st.taskTemplates; }catch(e){}
  return {};
}
function tplLegacyLocalMap(){
  try { return JSON.parse(lsGet(CUSTOM_TASK_TEMPLATES_KEY)||'{}') || {}; }
  catch(e){ return {}; }
}
function tplLegacyBannerHTML(){
  try{
    var loc=tplLegacyLocalMap(), cloud=getCustomTaskTemplateMap(), out='';
    ['Mera','Suz'].forEach(function(va){
      var l=loc[va]; if(!Array.isArray(l)||!l.length) return;
      if(cloud[va] && cloud[va].length) return;                 // the shared one exists — the old copy is moot
      out+='<div class="save-warn" style="margin:0 0 12px;"><span>&#9888;</span><div><b>This browser holds an older saved ticklist for '+vaDisp(va)+' ('+l.length+' tasks).</b>'
        +'<span>It was saved before 28 Sep and never reached her \u2014 she has been running the built-in list. Use it as the shared ticklist, or discard it and keep the built-in one.</span></div>'
        +'<button onclick="tplAdoptLocal(\''+va+'\')">Use it</button> <button class="sf-x" onclick="tplDiscardLocal(\''+va+'\')">Discard</button></div>';
    });
    return out;
  }catch(e){ return ''; }
}
function tplAdoptLocal(va){
  var loc=tplLegacyLocalMap(); if(!loc[va]) return;
  saveTaskTemplateSource(va, templateRefresh(cloneTaskTemplates(loc[va])));
  delete loc[va]; lsPut(CUSTOM_TASK_TEMPLATES_KEY, JSON.stringify(loc));
  showToast(vaDisp(va)+'\u2019s ticklist is now the shared one \u2014 it reaches her next shift');
  try{ mgr_repaintTicklist(); }catch(e){}
}
function tplDiscardLocal(va){
  var loc=tplLegacyLocalMap(); delete loc[va]; lsPut(CUSTOM_TASK_TEMPLATES_KEY, JSON.stringify(loc));
  showToast('Old copy discarded \u2014 '+vaDisp(va)+' keeps the built-in ticklist');
  try{ mgr_repaintTicklist(); }catch(e){}
}
/* A ticklist Jack customised in Settings months ago still says "KPF Filters - 7 Day Drops",
   "Telegram" and carries EU Sheets — his screenshots on 27/09 were exactly that. Whatever the
   source, retired ids go and the renamed tasks take the current name and hint, so nothing old
   can come back through a saved copy. Everything else in his custom list is left alone. */
function templateRefresh(list){
  var byId={}; ['Mera','Suz'].forEach(function(v){ (taskTemplates[v]||[]).forEach(function(t){ byId[t.id]=t; }); });
  var RENAMED=['kpf-daily','suz-kpf-daily','telegram','suz-telegram','telegram-eod','suz-telegram-eod'];
  return (list||[]).filter(function(t){ return !t || TEMPLATE_RETIRED.indexOf(t.id)<0; })
    .map(function(t){
      if(t && RENAMED.indexOf(t.id)>=0 && byId[t.id]){ t.name=byId[t.id].name; t.hint=byId[t.id].hint; }
      return t;
    });
}
function getTaskTemplateSource(va){
  var custom=getCustomTaskTemplateMap();
  if(custom[va] && Array.isArray(custom[va]) && custom[va].length) return templateRefresh(cloneTaskTemplates(custom[va]));
  return templateRefresh(cloneTaskTemplates(taskTemplates[va]||[]));
}
function saveTaskTemplateSource(va,tasks){
  var st=getAppSettings(); st.taskTemplates=(st.taskTemplates&&typeof st.taskTemplates==='object')?st.taskTemplates:{};
  st.taskTemplates[va]=cloneTaskTemplates(tasks);
  saveAppSettings(st); try{ pushSettingsCloud(st); }catch(e){}
}
function resetTaskTemplateSource(va){
  var st=getAppSettings(); if(st.taskTemplates&&typeof st.taskTemplates==='object') delete st.taskTemplates[va];
  saveAppSettings(st); try{ pushSettingsCloud(st); }catch(e){}
}
function enrichTasksWithPOA(va,tasks){
  var poa=(getAppSettings().poaNotes||{})[va]||'';
  if(!poa.trim()) return tasks;
  tasks.forEach(function(t){
    var isPoa=t.id==='jack-poa'||t.id==='suz-jack-poa'||/jack poa/i.test(t.name||'');
    if(isPoa) t.hint=(t.hint||'')+" Today's POA: "+poa.trim();
  });
  return tasks;
}

