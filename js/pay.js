/* ═══════ NEW-LEAD PING ═══════
   Posts to the VA's own Discord channel when their fresh leads land, so Jack sees them
   without opening the app. Works for BOTH VAs; falls back to the main channel if a VA
   hasn't got a dedicated one yet.

   Two guards that matter:
   · FIRST RUN ARMS SILENTLY — it records where the lead list is up to and sends nothing,
     so switching this on can never blast the 500+ leads already in the sheet.
   · CROSS-DEVICE DEDUPE — both VAs and Jack all run this app; an app_flags insert decides
     which device actually sends, so a batch is announced once, not three times. */
/* ═══════ PAY CYCLE ═══════
   VAs are paid every 2 weeks on a Friday. Anchor is the last known payday; everything
   else counts forward from it, so it stays right without maintenance.
   Marking it paid writes a flag to Supabase, which is what stops the Apps Script
   reminder — so the "done" state is shared between this app and the Discord button. */
var PAY_ANCHOR='2026-07-24';           // Fri 24 Jul 2026 — the last sourcing payday Jack confirmed
var PAY_EVERY_DAYS=14;
/* Two different pay runs. Sourcing VAs are every 2 weeks on a Friday; admin is the
   15th and 30th. Who sits on which run is editable in Settings, so adding a 4th person
   later is a one-line job for Jack rather than a code change. */
/* Pay runs are fully editable — name them, and pick either "every N weeks on <weekday>
   from <date>" or "on these days of the month". Nothing here is hardcoded to Jack's
   current setup, so a new arrangement is a settings change, not a code change. */
/* Jack reads dates day-first — show DD/MM/YYYY everywhere, keep ISO for storage/keys */
function payFmt(iso){
  try{ var p=String(iso).split('-'); return p.length===3?(p[2]+'/'+p[1]+'/'+p[0]):String(iso); }catch(e){ return String(iso); }
}
function payISO(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
function payUKNow(){ return new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/London'})); }
/* kept for the legacy fortnightly-Friday default and anything still calling it */
function payCycle(ref){
  ref=ref||payUKNow();
  var a=PAY_ANCHOR.split('-'); var anchor=new Date(+a[0],+a[1]-1,+a[2]);
  var day=new Date(ref.getFullYear(),ref.getMonth(),ref.getDate());
  var n=Math.floor(Math.floor((day-anchor)/86400000)/PAY_EVERY_DAYS);
  var last=new Date(anchor); last.setDate(anchor.getDate()+n*PAY_EVERY_DAYS);
  var next=new Date(last);   next.setDate(last.getDate()+PAY_EVERY_DAYS);
  return { last:payISO(last), next:payISO(next), isPayday:payISO(day)===payISO(last),
           daysToNext:Math.round((next-day)/86400000) };
}
var PAY_DEFAULT_RUNS=[
  {k:'sourcing', label:'Sourcing', icon:'\u{1F50E}', type:'weeks',   everyWeeks:2, weekday:5, anchor:'2026-07-24'},
  {k:'admin',    label:'Admin',    icon:'\u{1F4CB}', type:'monthly', days:[31]}   // last day of the month; nth() clamps 31 to 28/29/30 in shorter months
];
var PAY_ICONS=['\u{1F50E}','\u{1F4CB}','\u{1F4B7}','\u{1F5C2}️','⭐','\u{1F9FE}'];
var PAY_WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function payRuns(){
  var s=getAppSettings();
  var r=s.payRuns;
  if(Array.isArray(r)&&r.length) return r;
  return PAY_DEFAULT_RUNS;
}
function payRunsSet(arr){
  var s=getAppSettings(); s.payRuns=arr; saveAppSettings(s);
  try{ pushSettingsCloud(s); }catch(e){}
}
/* ── ADMIN OVERTIME ─────────────────────────────────────────────────────────
   Paid on the same date as the admin run. The admin VA doesn't log shifts in this
   app, so hours are entered by hand per pay date and kept keyed by that date —
   entering next month's hours never overwrites last month's record. */
var PAY_OT_DEFAULT_RATE=1.9;
/* Changing the DEFAULT admin schedule does nothing on its own — Jack's saved
   settings.payRuns overrides it, so his app kept paying on the 15th & 30th. Migrate the
   stored value once, and only when it still looks like the old mid-month setup, so a
   deliberate future change is never stomped. */
function payMigrateAdminToMonthEnd(){
  try{
    var s=getAppSettings();
    if(s.payAdminMonthEnd) return false;               // already done
    var arr=s.payRuns;
    if(!Array.isArray(arr)){ s.payAdminMonthEnd=1; saveAppSettings(s); return false; }
    var changed=false;
    arr.forEach(function(r){
      if(r && r.k==='admin' && r.type==='monthly'){
        var d=(r.days||[]).slice().sort(function(a,b){return a-b;}).join(',');
        if(d==='15,30'||d==='15,31'||d==='15'||d==='30'){ r.days=[31]; changed=true; }
      }
    });
    s.payRuns=arr; s.payAdminMonthEnd=1;
    saveAppSettings(s);
    if(changed){ try{ pushSettingsCloud(s); }catch(e){} }
    return changed;
  }catch(e){ return false; }
}
try{ payMigrateAdminToMonthEnd(); }catch(e){}
function payOtRate(){
  var s; try{ s=getAppSettings(); }catch(e){ s={}; }
  var r=parseFloat(s.payOtRate);
  return (isNaN(r)||r<=0) ? PAY_OT_DEFAULT_RATE : r;
}
function payOtRateSet(v){
  var s=getAppSettings(); var r=parseFloat(v);
  s.payOtRate=(isNaN(r)||r<=0)?PAY_OT_DEFAULT_RATE:r;
  saveAppSettings(s); try{ pushSettingsCloud(s); }catch(e){}
  try{ mgr_renderOverview(); }catch(e){}
}
function payOtAll(){
  var s; try{ s=getAppSettings(); }catch(e){ s={}; }
  return (s.payOtHours && typeof s.payOtHours==='object') ? s.payOtHours : {};
}
function payOtHours(iso){ var h=parseFloat(payOtAll()[iso]); return isNaN(h)?0:h; }
function payOtSet(iso,v){
  var s=getAppSettings();
  var all=(s.payOtHours && typeof s.payOtHours==='object') ? s.payOtHours : {};
  var h=parseFloat(v);
  if(isNaN(h)||h<=0) delete all[iso]; else all[iso]=h;
  s.payOtHours=all; saveAppSettings(s); try{ pushSettingsCloud(s); }catch(e){}
  try{ mgr_renderOverview(); }catch(e){}
}
function payOtAmount(iso){ return payOtHours(iso)*payOtRate(); }
/* `money()` exists three times in this file, all LOCAL to other functions and all
   rounding to whole pounds — useless here, since OT lands on amounts like 11.40. */
