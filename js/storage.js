/* ── ONE BROWSER-STORAGE HELPER (v50.9, 27/09/2026) ─────────────────────────────
   Every app on jackbithellamazon.github.io shares ONE localStorage pot — about
   5.2 million characters for all of them together. On 27/09 it filled up and the
   Sourcing Suite lost an hour of clicks in silence. AVM HQ was the biggest user:
   a 1.85M-character copy of the shift history that Supabase already holds.
   Worse, most saves here ran "browser first, cloud second" in one statement, so
   a full pot stopped the CLOUD write too: a VA could not submit her shift, a
   From-Jack brief never left the browser, the Sunday review never sent, and
   nothing said why. Jack, 27/09: the copies go — "it can get it from Supabase".
   Rule now: every read and write of localStorage goes through lsGet / lsPut /
   lsDrop. lsPut never throws. If the pot is full it drops AVM HQ's own pure
   caches and tries again; if that still fails the value is kept in memory so the
   app carries on (cloud saves are separate fetches and still go), and a bar says
   so. Nothing in this file touches localStorage directly any more. */
var LS_MEM={}, LS_FULL_AT=0;
var LS_SHED=['spend_cache_v1','bdl_shotmap','shifttrack_reports','bdl_saved_filters'];   // copies of Supabase / Sheets — they come straight back
function lsGet(k){
  if(Object.prototype.hasOwnProperty.call(LS_MEM,k)) return LS_MEM[k];
  try{ return localStorage.getItem(k); }catch(e){ return null; }
}
function lsPut(k,v){
  v=String(v);
  try{ localStorage.setItem(k,v); delete LS_MEM[k]; return true; }catch(e){}
  for(var i=0;i<LS_SHED.length;i++){
    var c=LS_SHED[i]; if(c===k) continue;
    try{ if(localStorage.getItem(c)==null) continue; localStorage.removeItem(c); }catch(e){ continue; }
    try{ localStorage.setItem(k,v); delete LS_MEM[k];
         try{ console.warn('[storage] the pot was full — dropped the cache '+c+' to make room'); }catch(_){}
         return true; }catch(e){}
  }
  LS_MEM[k]=v; try{ lsFullBar(); }catch(e){}
  return false;
}
function lsDrop(k){ delete LS_MEM[k]; try{ localStorage.removeItem(k); }catch(e){} }
/* AVM HQ's own keys (SellerFuse uses bdl_reimb*, PL Sourcing bdl_pl_* on the same address — not ours) */
var LS_OURS=/^(shifttrack_|st_|ld_seen$|spend_cache_v1$|overdue_ping_|weekly_sent_|bdl_(?!reimb|pl_|oa|hq|sourcing))/;
function lsUsage(){
  var ours=0, all=0, keys=[];
  try{
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i), n=k.length+(localStorage.getItem(k)||'').length;
      all+=n;
      if(LS_OURS.test(k)){ ours+=n; keys.push({k:k,n:n}); }
    }
  }catch(e){}
  keys.sort(function(a,b){ return b.n-a.n; });
  return {ours:ours, all:all, others:all-ours, keys:keys, cap:5*1048576, mem:Object.keys(LS_MEM).length};
}
function lsMB(n){ return (n/1048576).toFixed(2)+' MB'; }
function lsFullBar(){
  if(Date.now()-LS_FULL_AT<30000 && document.getElementById('ls-full-bar')) return;
  LS_FULL_AT=Date.now();
  function paint(){
    var el=document.getElementById('ls-full-bar');
    if(!el){ el=document.createElement('div'); el.id='ls-full-bar'; document.body.appendChild(el); }
    var u=lsUsage();
    el.innerHTML='<span class="sf-i">&#9888;</span><div><b>This browser’s storage is full.</b>'
      +'<span>Your work is still being sent to Supabase, but anything not sent yet is lost if you reload. '
      +'It holds '+lsMB(u.all)+' of about 5 MB — AVM HQ '+lsMB(u.ours)+', your other apps on this address '+lsMB(u.others)+'.</span></div>'
      +'<button class="sf-x" onclick="document.getElementById(\'ls-full-bar\').remove()" title="Hide">&#10005;</button>';
  }
  if(document.body) paint(); else document.addEventListener('DOMContentLoaded',paint);
}
/* ── HOUSEKEEPING — small things that used to pile up for ever ─────────────────
   From-Jack briefs are keyed by day and every day's stayed in this browser; the
   cloud (jack_briefs) has all of them and the app only ever reads today's, this
   week's and the OPEN bucket. Same for the once-a-day markers. */
function lsHousekeep(){
  try{
    var today=new Date();
    function ageDays(dmy){ var p=String(dmy||'').split(/[\/-]/); if(p.length!==3) return null;
      var d=new Date(+p[2],+p[1]-1,+p[0]); return isNaN(d.getTime())?null:Math.floor((today-d)/86400000); }
    var a=null; try{ a=JSON.parse(lsGet('st_jack_briefs')||'{}'); }catch(e){ a=null; }
    if(a && typeof a==='object'){
      var dropped=0;
      Object.keys(a).forEach(function(k){
        var p=k.split('|'); if(p.length!==2) return;           // VA|DD/MM/YYYY only — WEEK and OPEN keys stay
        var age=ageDays(p[1]); if(age!=null && age>14){ delete a[k]; dropped++; }
      });
      if(dropped) lsPut('st_jack_briefs',JSON.stringify(a));
    }
    var stale=[];
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i); if(!k) continue;
      var m=/^(overdue_ping_|weekly_sent_|bdl_unclosed_skip_(?:Mera|Suz)_)(.+)$/.exec(k);
      if(!m) continue;
      var age2=ageDays(m[2]); if(age2!=null && age2>30) stale.push(k);
    }
    stale.forEach(lsDrop);
  }catch(e){}
}
try{ setTimeout(lsHousekeep,2500); }catch(e){}
