/* Paste into the browser console on the PREVIEW (127.0.0.1). Blocks every non-GET request first, then checks. */
(async function(){
  window.__SENT=[]; var real=window.fetch;
  window.fetch=function(url,opts){ var m=((opts&&opts.method)||'GET').toUpperCase();
    if(m!=='GET'||/webhooks/i.test(String(url))){ window.__SENT.push(m+' '+String(url).replace(/^https?:\/\/[^/]+/,'').split('?')[0]);
      return Promise.resolve(new Response('[]',{status:201,headers:{'Content-Type':'application/json'}})); }
    return real.apply(this,arguments); };
  window.confirm=function(){return false;}; window.alert=function(){}; window.prompt=function(){return null;};
  var out={version:APP_VERSION, preview:IS_PREVIEW, selfTest:selfTest()};
  var errs=[]; window.addEventListener('error',function(e){ errs.push(String(e.message)); });
  window._mgrUnlocked=true; _openManager();
  var t0=Date.now(); while(!window._shiftLogFull&&Date.now()-t0<12000) await new Promise(function(r){setTimeout(r,200);});
  out.history=(window._shiftLog||[]).length;
  [].slice.call(document.querySelectorAll('[id^="mgr-tab-"]')).map(function(e){return e.id.replace('mgr-tab-','');}).forEach(function(t){ try{ mgr_switchTab(t); }catch(e){ errs.push(t+': '+e.message); } });
  await new Promise(function(r){setTimeout(r,800);});
  /* 28/09: the Storefronts tab with NO Sheets key used to loop forever — press it with the key blanked and prove the tab survives */
  var _k=SPEND_API_KEY; SPEND_API_KEY=''; SB_SRC_LISTS=null; window._sbSrcTried=false;
  var _s=performance.now(); try{ mgr_switchTab('storefronts'); }catch(e){ errs.push('storefronts: '+e.message); }
  await new Promise(function(r){setTimeout(r,2000);}); out.storefrontsNoKeyMs=Math.round(performance.now()-_s); SPEND_API_KEY=_k;
  out.storage=lsUsage().ours; out.errors=errs; out.writesAttempted=window.__SENT;
  console.log(JSON.stringify(out,null,1)); return out;
})();
