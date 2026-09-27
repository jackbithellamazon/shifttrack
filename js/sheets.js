/* ─── SHEET → APP INGESTION, DONE BY THE APP ────────────────────────────────
   Mera's Apps Script stopped firing on 31/07 and nothing arrived for 4 days. The
   script is a single point of failure sitting on someone else's Google account,
   and when it dies it dies silently. So the app now reads the VA sheets itself
   with the Sheets API key and inserts straight into Supabase — same id scheme
   (sheetId::tab::rowIndex) and the same ignore-duplicates insert the script uses,
   so the two can run side by side forever without ever duplicating a lead.
   Writebacks (your Bought/Lead?/comment going back INTO the sheet) still need the
   Apps Script — an API key can read a sheet but cannot write to one. */
var LEAD_PULL_KEY=(typeof SPEND_API_KEY!=='undefined')?SPEND_API_KEY:'';
var _leadPullAt=0, _leadPullBusy=false;
window.LEAD_PULL_LAST=null;

function pullISO(v){                       // Sheets serial (epoch 1899-12-30) or text
  if(typeof v==='number' && v>1000){
    var ms=Date.UTC(1899,11,30)+Math.floor(v)*86400000, d=new Date(ms);
    return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');
  }
  var t=String(v||'').trim(); if(!t) return '';
  var m=t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m) return m[3]+'-'+String(m[1]).padStart(2,'0')+'-'+String(m[2]).padStart(2,'0');
  /* ── THE DATE WITH NO YEAR ────────────────────────────────────────────────
     01/09/2026, Mera's first day on the September tab: 19 leads, none of them
     reached the app. Her date column had reformatted itself to "09/01" — day and
     month, NO YEAR. Nothing here matched it, so pullISO handed back the raw text,
     the caller's /^\d{4}-\d{2}-\d{2}$/ test failed, and EVERY row was skipped in
     silence. Her sync had been dead since 28/08 and nothing said a word.
     A missing year is not a broken date — take the year from the tab we are
     reading (its month is authoritative), and pick the year that puts the date
     nearest today so a December tab read in January still lands right. */
  var m2=t.match(/^(\d{1,2})\/(\d{1,2})$/);
  if(m2){
    var a=+m2[1], b=+m2[2];
    var now=new Date(), yr=now.getFullYear();
    function mk(y,mo,dy){ return y+'-'+String(mo).padStart(2,'0')+'-'+String(dy).padStart(2,'0'); }
    // both orders are plausible; pullISOForTab settles day-vs-month from the tab name
    var cand=mk(yr,a,b);
    var dt=new Date(yr,a-1,b);
    if(!isNaN(dt.getTime())){
      var diff=(dt-now)/86400000;
      if(diff>200) cand=mk(yr-1,a,b);          // far future → it belongs to last year
      else if(diff<-200) cand=mk(yr+1,a,b);    // far past  → next year
    }
    return cand;
  }
  return t.slice(0,10);
}
/* identical rule to the Apps Script's isoDateForTab() and to leadDateFix() */
function pullISOForTab(v,tab){
  var s=pullISO(v), p=s.split('-'); if(p.length!==3) return s;
  var y=+p[0], mo=+p[1], dy=+p[2]; if(!y||!mo||!dy) return s;
  var tm=leadTabMonth('x::'+tab+'::1'); if(!tm||mo===tm) return s;
  if(dy!==tm) return s;
  var dim=new Date(y,tm,0).getDate();
  if(mo<1||mo>dim) return s;
  return y+'-'+String(tm).padStart(2,'0')+'-'+String(mo).padStart(2,'0');
}
function pullNum(v){
  if(v===''||v===null||v===undefined) return null;
  var n=parseFloat(String(v).replace(/[%£>,\s]/g,''));
  return isNaN(n)?null:n;
}
async function leadPullOnce(force){
  /* the pull writes to the live DB (inserts, refresh upserts and — since v48.0 —
     the lead-id reconcile). Test mode reads what's there and touches nothing. */
  if(typeof IS_PREVIEW!=='undefined'&&IS_PREVIEW) return null;
  if(_leadPullBusy) return null;
  if(!force && Date.now()-_leadPullAt < 180000) return null;    // at most every 3 min
  if(!LEAD_PULL_KEY || typeof SHEET_NAMES==='undefined') return null;
  _leadPullBusy=true;
  var added=0, updated=0, checked=0, errs=0;
  try{
    var cut=''; try{ cut=(getAppSettings().leadsStartDate||'').trim(); }catch(e){}
    var floor=cut||'2026-07-01';
    var have={};
    try{
      /* asin joined this list when it joined SHEETCOLS — without it here, cur.asin is
         undefined, every row compares as "changed" and each pull re-uploads all 800.
         status / islead / writeback_pending are here for the decision fill below. */
      var _hbase='id,sheet_id,tab,row_index,store,source_method,va_note,'
        +'supplier_url,supplier_url2,amazon_url,category,title,discount_code,screenshot,date,buy,sell,spm,profit,roi,margin,fba'
        +',asin,status,islead,writeback_pending';
      var hres=await fetchT(SUPABASE_URL+'/rest/v1/leads?select='+_hbase+',jack_comment,decided_at,lead_id,superseded'
        +'&limit=5000',{headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
      /* until the LEAD-IDS SQL has been run the two new columns 400 — pull the old
         shape and skip everything lead-id (LID_READY gates all of it) */
      if(hres.status===400){
        window._LID_READY=false;
        hres=await fetchT(SUPABASE_URL+'/rest/v1/leads?select='+_hbase
          +'&limit=5000',{headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
      } else window._LID_READY=true;
      var LID_READY=window._LID_READY;
      if(hres.ok) (await hres.json()).forEach(function(r){ have[r.id]=r; });
    }catch(e){ errs++; }
    for(var sid in SHEET_NAMES){
      var va=SHEET_NAMES[sid], tabs=[];
      try{
        var tres=await fetchT(SUPABASE_URL+'/rest/v1/sheet_tabs?select=tab,included&sheet_id=eq.'+encodeURIComponent(sid),
          {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
        if(tres.ok) tabs=(await tres.json()).filter(function(t){ return t.included; }).map(function(t){ return t.tab; });
      }catch(e){ errs++; continue; }
      for(var ti=0;ti<tabs.length;ti++){
        var tab=tabs[ti], rows=[];
        try{
          var u='https://sheets.googleapis.com/v4/spreadsheets/'+sid+'/values/'
               +encodeURIComponent(tab+'!A2:AB1000')+'?key='+LEAD_PULL_KEY+'&valueRenderOption=UNFORMATTED_VALUE';
          var sres=await fetchT(u);
          if(!sres.ok){ errs++; continue; }
          rows=(await sres.json()).values||[];
        }catch(e){ errs++; continue; }
        var batch=[], refresh=[], _badDate=0, _badEg='', checkedThisTab=0;
        for(var i=0;i<rows.length;i++){
          var r=rows[i].slice(); while(r.length<28) r.push('');
          var rowIndex=i+2;
          var asin=String(r[7]||'').trim(), buy=pullNum(r[12]);
          checked++; checkedThisTab++;
          if(!asin||buy===null) continue;
          var iso=pullISOForTab(r[0],tab);
          if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||iso<floor){ _badDate++; _badEg=_badEg||String(r[0]); continue; }
          var id=sid+'::'+tab+'::'+rowIndex;
          var fba=pullNum(r[19]);
          var rec={ id:id, sheet_id:sid, tab:tab, row_index:rowIndex, va:va, date:iso,
            store:String(r[5]||''), title:String(r[6]||''), asin:asin,
            category:String(r[10]||''), source_method:String(r[11]||''),
            buy:buy, sell:pullNum(r[14]), spm:String(r[15]||''), profit:pullNum(r[16]),
            roi:pullNum(r[17]), margin:pullNum(r[18]),
            fba:(fba===null?null:Math.round(fba)),          // integer column — 1.0 is rejected
            supplier_url:String(r[8]||''), supplier_url2:String(r[9]||''), amazon_url:String(r[13]||''),
            va_note:String(r[4]||''), discount_code:String(r[20]||''), screenshot:String(r[21]||''),
            islead:String(r[2]||'').trim()||null, status:String(r[1]||'').trim()||null,
            jack_comment:String(r[3]||'')||null };
          /* AA = the permanent lead id the Apps Script stamped. Only trusted when it
             looks like one; only sent once the DB has the column. */
          var _lid=String(r[26]||'').trim();
          if(!/^BDL-[A-F0-9]{8,16}$/i.test(_lid)) _lid=null;
          if(LID_READY) rec.lead_id=_lid;
          if(have[id]){ refresh.push(rec); } else { batch.push(rec); }
        }
        if(batch.length){
          try{
            var ins=await fetchT(SUPABASE_URL+'/rest/v1/leads',{method:'POST',
              headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
                'Content-Type':'application/json','Prefer':'resolution=ignore-duplicates,return=representation'},
              body:JSON.stringify(batch)});
            if(ins.ok){ added+=(await ins.json()).length; }
            else errs++;
          }catch(e){ errs++; }
        }
        /* Rows that already exist: push the columns the SHEET owns back over the top.
           ONE upsert per tab, not a PATCH per row — a first run has hundreds of stale
           rows and sequential PATCHes took minutes and left the pull flag stuck.
           `merge-duplicates` only writes the columns present in the payload, so leaving
           status / islead / jack_comment OUT of it preserves Jack's decisions. */
        if(refresh.length){
          /* ── 'asin' MUST STAY IN THIS LIST. ────────────────────────────────────────
             It was missing, and that was the whole "the VAs' ASIN column is broken" saga.
             A row's identity is sheet_id::tab::row_index, so when a VA inserts, deletes or
             re-sorts a row, every row below it gets a new occupant. Refresh then rewrote
             title, link, cost, ROI — everything the sheet owns — to that new occupant,
             while `asin` stayed frozen at whatever was captured the very first time.
             Result: 411 of 800 leads carried one product's ASIN beside another product's
             title, which read exactly like the VAs had wrecked their own sheets.
             They had not. Checked against the live sheet: 225 of Mera's 226 July rows have
             an ASIN matching their own Amazon link. The sheets were always right — this
             list was wrong. Anything the sheet owns belongs here; leaving a column out
             does not make it stable, it makes it silently stale.
             status / islead / jack_comment stay OUT on purpose: those are Jack's. */
          var SHEETCOLS=['store','source_method','va_note','supplier_url','supplier_url2',
            'amazon_url','category','title','discount_code','screenshot','date','buy','sell','spm',
            'profit','roi','margin','fba','asin'];
          var changed=[];
          /* ── LEAD-ID RECONCILE (v48.0) ────────────────────────────────────────────
             A row's DB identity is sheet_id::tab::row_index, so when a VA deletes a
             duplicate row every row below gets a NEW occupant — and until now Jack's
             decisions stayed glued to the row NUMBER, i.e. to the wrong product.
             The AA lead id says who the occupant really is. Four cases per row:
               adopt      DB has no lead_id yet (first pull after stamping) → store it,
                          touch nothing else
               normal     stored id == incoming id → plain refresh
               displaced  stored id != incoming id → the occupant changed; fetch the
                          decisions that belong to the INCOMING product from wherever
                          they lived (dbByLid) and write them with it
               hold       sheet row has no AA id yet (stamper runs hourly) but the DB
                          row does → skip this row entirely until it is stamped, so a
                          brand-new unstamped occupant can never inherit old decisions */
          var dbByLid={};
          if(LID_READY){ for(var _hk in have){ var _hv=have[_hk];
            if(_hv&&_hv.sheet_id===sid&&_hv.tab===tab&&_hv.lead_id) dbByLid[_hv.lead_id]=_hv; } }
          refresh.forEach(function(rec2){
            var cur=have[rec2.id]; if(!cur||cur===true) return;
            var displaced=false, donor=null;
            if(LID_READY){
              if(cur.lead_id&&!rec2.lead_id) return;                       // hold
              if(cur.lead_id&&rec2.lead_id&&cur.lead_id!==rec2.lead_id){   // displaced
                displaced=true; donor=dbByLid[rec2.lead_id]||null;
              }
            }
            var any=false;
            if(LID_READY && String(cur.lead_id||'')!==String(rec2.lead_id||'')) any=true;  // adopt or displaced
            SHEETCOLS.forEach(function(k){
              var nv=rec2[k];
              if(nv===''||nv===null||nv===undefined) return;   // sheet blank → keep what we have
              if(String(cur[k]==null?'':cur[k])===String(nv)) return;
              any=true;
            });
            /* ── DECISION FILL — the sheet may FILL A BLANK, never overwrite. ────────
               Jack marks leads up straight in the sheet. Because status / islead are
               kept out of SHEETCOLS (so a stale sheet can never wipe a call he made in
               the app), the app could never SEE those either: 30 leads sat decided in
               the sheet and blank in the app, 21 of them BOUGHT, £2,841 of spend that
               never reached his buy rate or the scoring model.
               So: if the app holds NOTHING and the sheet holds something, take it. If
               the app holds anything at all, the sheet is ignored — his call always wins.
               writeback_pending means a write is still in flight (an Undo that has not
               landed yet); leave those alone or we would resurrect what he just cleared. */
            var _canFill = (cur.status==null && cur.islead==null && !cur.writeback_pending);
            var _fillSt  = (_canFill && rec2.status!=null)  ? rec2.status : null;
            var _fillLd  = (_canFill && rec2.islead!=null)  ? rec2.islead : null;
            if(_fillSt!=null || _fillLd!=null) any=true;

            if(!any) return;
            /* THE BUG THAT KEPT SOURCE BLANK FOREVER.
               This used to send ONLY the changed fields — {id, store, source_method}. But a
               PostgREST upsert is INSERT ... ON CONFLICT DO UPDATE, so the INSERT half still
               has to satisfy every NOT NULL column. Postgres answered 400 every single time:
                 23502: null value in column "sheet_id" violates not-null constraint
               errs++ swallowed it, so the pull reported "0 updated" and looked healthy while
               NO row was ever refreshed. Send the whole record instead — it carries sheet_id,
               tab, row_index and the rest — MINUS the three columns Jack owns, so his
               decisions still cannot be overwritten by the sheet. */
            /* Every object in a bulk upsert must carry the SAME keys — PostgREST answers
               PGRST102 "All object keys must match" otherwise. So build one fixed shape:
               identity columns (which satisfy the NOT NULLs) plus every sheet-owned column.
               Where the sheet cell is blank we resend the value already in the database, so
               "sheet blank → keep what we have" still holds without a null wiping anything.
               status / islead / jack_comment are never in this list — they stay Jack's. */
            var row={ id:rec2.id, sheet_id:rec2.sheet_id, tab:rec2.tab,
                      row_index:rec2.row_index, va:rec2.va };
            SHEETCOLS.forEach(function(k){
              var v=rec2[k];
              if(v===''||v===null||v===undefined) v=(cur[k]===undefined?null:cur[k]);
              row[k]=v;
            });
            /* Same fixed shape on EVERY object or PostgREST answers PGRST102, so these two
               are always present — carrying the value already in the database unless the
               fill above applies. Never a bare null: that would wipe his decisions. */
            if(LID_READY){
              row.lead_id=rec2.lead_id||cur.lead_id||null;
              if(displaced){
                /* decisions travel with the PRODUCT: the incoming occupant brings its
                   own from wherever it lived; if it never had any, the sheet's cells
                   (which shifted with the row) may fill the blank */
                var _d=donor||{};
                row.status      =(_d.status!=null)?_d.status:(rec2.status!=null?rec2.status:null);
                row.islead      =(_d.islead!=null)?_d.islead:(rec2.islead!=null?rec2.islead:null);
                row.jack_comment=(_d.jack_comment!=null)?_d.jack_comment:(rec2.jack_comment!=null?rec2.jack_comment:null);
                row.decided_at  =(_d.decided_at!=null)?_d.decided_at:null;
              } else {
                row.status = (_fillSt!=null) ? _fillSt : (cur.status===undefined?null:cur.status);
                row.islead = (_fillLd!=null) ? _fillLd : (cur.islead===undefined?null:cur.islead);
                row.jack_comment=(cur.jack_comment===undefined?null:cur.jack_comment);
                row.decided_at=(cur.decided_at===undefined?null:cur.decided_at);
              }
            } else {
              row.status = (_fillSt!=null) ? _fillSt : (cur.status===undefined?null:cur.status);
              row.islead = (_fillLd!=null) ? _fillLd : (cur.islead===undefined?null:cur.islead);
            }
            changed.push(row);
          });
          if(changed.length){
            try{
              var up=await fetchT(SUPABASE_URL+'/rest/v1/leads',{method:'POST',
                headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
                  'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},
                body:JSON.stringify(changed)});
              if(up.ok) updated+=changed.length;
              else { errs++; try{ window.LEAD_PULL_ERR=(await up.text()).slice(0,300); }catch(e2){} }
            }catch(e){ errs++; window.LEAD_PULL_ERR=String(e&&e.message||e); }
          }
          /* ── GHOST SWEEP (v48.0). A deleted row shrinks the tab, leaving DB rows
             pointing past the end of the sheet — the same product now lives one row
             up, so the ghost would double-count on the board and in every KPI.
             Marked superseded (hidden), NEVER deleted — nothing is ever lost.
             Guards: only with lead ids live, only when the fetch was not truncated
             (a 999-row tab would make real rows look past-the-end), only a handful
             at a time (deleting duplicates is the only thing that makes ghosts). */
          if(LID_READY && rows.length<950){
            var _gmax=rows.length+1, _ghosts=[];
            for(var _gk in have){ var _gv=have[_gk];
              if(_gv&&_gv.sheet_id===sid&&_gv.tab===tab&&_gv.row_index>_gmax&&!_gv.superseded) _ghosts.push(_gk); }
            if(_ghosts.length&&_ghosts.length<=40){
              for(var _gi=0;_gi<_ghosts.length;_gi++){
                try{ await fetchT(SUPABASE_URL+'/rest/v1/leads?id=eq.'+encodeURIComponent(_ghosts[_gi]),
                  {method:'PATCH',headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
                    'Content-Type':'application/json'},body:JSON.stringify({superseded:true})}); }catch(e){}
              }
            } else if(_ghosts.length>40){ try{ window.LEAD_PULL_ERR='ghost sweep skipped: '+_ghosts.length+' on '+tab+' — too many to be dup deletions, check the tab'; }catch(e){} }
          }
        }
        /* ── A DEAD SYNC MUST NEVER BE SILENT ──────────────────────────────────
           Mera's date column reformatted itself to "09/01" — no year — so every
           row failed the date test above and was skipped without a word. Her leads
           stopped reaching the app on 28/08 and the first anyone knew was Jack
           asking why her tab was empty on 01/09. A tab that has rows in it but
           yields NOTHING usable is broken, and it now says so out loud, once a day
           per tab so it can't turn into noise. */
        if(_badDate>0 && _badDate===checkedThisTab && rows.length>0){
          try{
            var _wk='leadsync_'+sid.slice(0,8)+'_'+tab+'_'+(new Date().toISOString().slice(0,10));
            var _wr=await fetchT(SUPABASE_URL+'/rest/v1/app_flags',{method:'POST',
              headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
                'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=representation'},
              body:JSON.stringify({k:_wk,v:'warned'})});
            var _rows2=await _wr.json();
            if(Array.isArray(_rows2)&&_rows2.length){
              var _s2=getAppSettings();
              var _hook=(_s2.whPay||'').trim()||DISCORD_WEBHOOK;
              if(_hook) fetch(_hook,{method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({content:'\u26a0\uFE0F **'+va+"'s leads are not syncing**",
                  embeds:[{title:'Tab "'+tab+'" \u2014 '+_badDate+' row'+(_badDate===1?'':'s')+' unreadable',
                    color:15881515,
                    description:'Every row on this tab was skipped because the DATE could not be read.\n\n'
                      +'First bad value: `'+String(_badEg).slice(0,24)+'`\n\n'
                      +'Her leads are NOT reaching the app. Check the date column format on that tab.',
                    footer:{text:'BDL VA HQ \u00b7 lead sync watchdog \u00b7 once a day per tab'}}]})}).catch(function(){});
            }
          }catch(e){}
          try{ window.LEAD_SYNC_DEAD=(window.LEAD_SYNC_DEAD||[]); window.LEAD_SYNC_DEAD.push(va+' / '+tab+' ('+_badDate+' rows, e.g. "'+_badEg+'")'); }catch(e){}
        }
      }
    }
  }catch(e){ errs++; }
  _leadPullAt=Date.now(); _leadPullBusy=false;
  window.LEAD_PULL_LAST={at:new Date().toISOString(),added:added,updated:updated,checked:checked,
    errors:errs, lastError:window.LEAD_PULL_ERR||null};
  if(errs && window.console) console.warn('[lead pull] '+errs+' error(s):', window.LEAD_PULL_ERR||'(no body)');
  return window.LEAD_PULL_LAST;
}
/* Is he mid-edit in the leads view? Any focused input/textarea there counts —
   the note box, the big NOTES textarea, the quantity field, the search box. */
function leadsEditing(){
  try{
    var a=document.activeElement; if(!a) return false;
    var tag=String(a.tagName||'').toLowerCase();
    if(tag!=='input'&&tag!=='textarea'&&!a.isContentEditable) return false;
    return !!(a.closest&&a.closest('#view-leads'));
  }catch(e){ return false; }
}
async function loadLeadsFromDB(){
  try{
    if(typeof SUPABASE_URL==='undefined'||typeof DB_ENABLED==='undefined'||!DB_ENABLED) return;
    var _sd=''; try{_sd=(getAppSettings().leadsStartDate||'').trim();}catch(e){}
    if(window._ldStartOverride) _sd='';        // "Show them" — this session only, setting untouched
    // NOTE: the DB `date` column is unreliable (Mera's rows import day/month-swapped — a lead
    // sourced 11 July stores as "2026-11-07"). So we DON'T filter on it server-side; we repair each
    // date with normLeadISO() then filter client-side below. See also the source fix Jack needs.
    try{ await leadPullOnce(false); }catch(e){}   // read the sheets ourselves first
    var res=await fetchT(SUPABASE_URL+'/rest/v1/leads?select=*&order=created_at.desc&limit=1500',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
    if(!res.ok) return;
    var rows=await res.json();
    rows=rows.filter(function(r){ return !r.superseded; });   // ghosts stay stored, never shown
    var keepSel=(leads.find(function(x){return x.id===selId;})||{})._sid;
    var n=1;
    leads=rows.map(function(r){
      var hrs=r.created_at?Math.max(0,Math.floor((Date.now()-new Date(r.created_at).getTime())/3600000)):99;
      var roi=parseFloat(r.roi)||0, profit=parseFloat(r.profit)||0, spm=parseSpm(r.spm), fba=parseInt(r.fba)||0, margin=parseFloat(r.margin)||0;
      if(roi>0 && roi<3) roi=roi*100;   // sheet stores ROI as a decimal ratio (0.2546) — show as a real % (25.46). Fixes display, scoring, badges & priority.
      roi=Math.round(roi*10)/10;         // clean 1-dp %
      return { id:n++, _sid:r.id, va:r.va==='Mera'?'VA M':'VA S', date:fmtGB(leadDateFix(r.date,r.created_at,r.id)),
        store:r.store||'', title:r.title||'(untitled)', asin:r.asin||'', cat:r.category||'', src:r.source_method||'',
        sheetRow:r.row_index||null, sheetTab:r.tab||'',
        buy:parseFloat(r.buy)||0, sell:parseFloat(r.sell)||0, spm:spm, profit:profit, roi:roi, margin:margin, fba:fba,
        sup:r.supplier_url||'#', sup2:r.supplier_url2||'', amz:r.amazon_url||'#', screenshot:r.screenshot||'', discount:r.discount_code||'',
        notes:r.jack_comment||'', vanote:r.va_note||'',
        status:mapStatusIn(r.status), islead:r.islead==='LEAD'?true:(r.islead==='NOT LEAD'?false:null),
        seen:!!_seenIds[r.id], hrs:hrs,
        _sc:calcScore({roi:roi,profit:profit,spm:spm,fba:fba,margin:margin}),
        image:r.image||'',
        _id:'LD-'+String(r.row_index||n).padStart(4,'0') };
    });
    // Jack's "show leads from" setting — hard cutoff on the REPAIRED date (integer compare, no timezone edge)
    /* Count what this cutoff removes. It was silently dropping 224 of 1024 leads — a
       third of the board gone with nothing on screen to say so, which is exactly what
       "leads are going missing" looked like. The setting stays (it is the day Jack
       started using the app); it just stops being invisible. */
    window._ldHiddenByStart=0; window._ldStartDate=_sd||'';
    if(_sd){ var cp=_sd.split('-'); var coN=(+cp[0])*10000+(+cp[1])*100+(+cp[2]); if(coN){ var _b4=leads.length; leads=leads.filter(function(l){ var p=(l.date||'').split('/'); if(p.length!==3) return true; var dN=(+p[2])*10000+(+p[1])*100+(+p[0]); return !dN||dN>=coN; }); window._ldHiddenByStart=_b4-leads.length; } }
    if(keepSel){ var again=leads.find(function(x){return x._sid===keepSel;}); selId=again?again.id:null; }
    else if(!leadsEditing()){ selId=null; }
    try{ window.leads=leads; }catch(e){}
    try{ populateMonthFilter(); }catch(e){}
    try{ populateLeadFilters(); }catch(e){}
    try{ if(!window._fdRestored){ window._fdRestored=1; fDateRestore(); sortRestore(); } }catch(e){}
    try{ if(!window._shotLoaded){ window._shotLoaded=1; shotCacheLoad(); } }catch(e){}
    if(leadsEditing()){                       // repaint would delete what he's typing
      window._leadsRepaintDue=true;
      if(!window._leadsRepaintT) window._leadsRepaintT=setInterval(function(){
        if(leadsEditing()) return;            // still typing — keep waiting
        clearInterval(window._leadsRepaintT); window._leadsRepaintT=null;
        if(window._leadsRepaintDue){ window._leadsRepaintDue=false; try{ renderList(); }catch(e){} }
      },1200);
    } else { renderList(); }
    // keep the VA shift "Leads today" KPI in sync with their live sheet
    try{ if(window.updateStats && window.state && state.shiftStart && !state.submitted){ updateStats(); if(window.renderShiftKpiExtras) renderShiftKpiExtras(); } }catch(e){}
    // swap Jack's overview leads strip out of its loading state
    try{ if(window.refreshLeadsSnapshot) window.refreshLeadsSnapshot(); }catch(e){}
  }catch(e){}
}
/* A decision is the whole point of this screen — it must never silently fail.
   This used to fire the PATCH, swallow every error with `.catch(function(){})`,
   never check res.ok, and let the caller toast "written to sheet ✓" regardless. */
/* ─── WRITEBACK, WITHOUT ANYONE'S TRIGGER ───────────────────────────────────
   Decisions have to land in the VA's sheet. An API key can't write to a sheet, so
   this used to ride on each VA's Apps Script timer — and when Mera's died, her
   writebacks died silently with it, same as her leads.
   Now the app posts straight to ONE web app owned by Jack that can write to both
   sheets. It fires on the click, not on a timer. If it isn't set up (or the call
   fails) we leave writeback_pending=true, so the old Apps Script route still
   picks it up exactly as before — this is a fast path, never a replacement that
   can lose a decision. */
function wbCfg(){
  try{ var s=getAppSettings(); return {url:String(s.wbUrl||'').trim(), token:String(s.wbToken||'').trim()}; }
  catch(e){ return {url:'',token:''}; }
}
function wbReady(){ var c=wbCfg(); return !!(c.url && c.token); }
function wbItemFor(l,fields){
  /* Jack, seeing "[why:oos] Out of stock" in Mera's sheet: "fuck is this gone on va
     lead sheet". The reason code is an INTERNAL key — it belongs in our database so
     reasonOf() can read it back, and it must never reach a spreadsheet a person
     reads. Database keeps the tag; the sheet gets the words only. */
  var cm=(fields.jack_comment!==undefined?fields.jack_comment:null);
  if(cm!=null){ try{ cm=reasonStrip(String(cm)); }catch(e){} }
  return { tab:l.sheetTab||'', row:l.sheetRow||0,
           status:(fields.status!==undefined?fields.status:null),
           islead:(fields.islead!==undefined?fields.islead:null),
           comment:cm };
}
/* Returns true only when the sheet actually took the write. */
async function wbPush(l,fields){
  var c=wbCfg();
  if(!c.url||!c.token) return false;
  if(!l||!l.sheetTab||!l.sheetRow) return false;
  var sid=String(l._sid||'').split('::')[0];
  if(!sid) return false;
  try{
    var res=await fetch(c.url,{method:'POST',redirect:'follow',
      headers:{'Content-Type':'text/plain;charset=utf-8'},   // avoids the CORS preflight Apps Script can't answer
      body:JSON.stringify({token:c.token,sheetId:sid,items:[wbItemFor(l,fields)]})});
    if(!res.ok) return false;
    var j=await res.json();
    return !!(j&&j.ok&&j.written>0);
  }catch(e){ return false; }
}
/* Everything decided while the sheets were unreachable, oldest first. */
/* The retry queue reads jack_comment straight out of the database, tag and all,
   so it needs the same guard or a delayed write would leak what the live one no
   longer does. */
async function wbPending(){
  try{
    var r=await fetchT(SUPABASE_URL+'/rest/v1/leads?writeback_pending=eq.true'
      +'&select=id,va,tab,row_index,status,islead,jack_comment&order=decided_at',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
    return r.ok?(await r.json()):[];
  }catch(e){ return []; }
}
/* Send the backlog. Grouped per sheet because the endpoint writes one sheet per call,
   and only the rows the sheet actually confirms get their flag cleared — a partial
   failure leaves the rest queued rather than quietly dropping them. */
async function wbFlushPending(quiet){
  var c=wbCfg();
  if(!c.url||!c.token){ if(!quiet) showToast('Set the writeback URL and token first',true); return 0; }
  var rows=await wbPending();
  if(!rows.length){ if(!quiet) showToast('Nothing waiting — the sheets are up to date ✓'); return 0; }
  var bySheet={};
  rows.forEach(function(l){
    var sid=String(l.id||'').split('::')[0]; if(!sid||!l.tab||!l.row_index) return;
    (bySheet[sid]=bySheet[sid]||[]).push(l);
  });
  var written=0;
  for(var sid in bySheet){
    var group=bySheet[sid];
    try{
      var res=await fetch(c.url,{method:'POST',redirect:'follow',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({token:c.token,sheetId:sid,items:group.map(function(l){
          return {tab:l.tab,row:l.row_index,status:l.status,islead:l.islead,
                  comment:(l.jack_comment==null?null:reasonStrip(String(l.jack_comment)))}; })})});
      if(!res.ok) continue;
      var j=await res.json();
      if(!j||!j.ok||!j.written) continue;
      var ids=group.map(function(l){ return '"'+String(l.id).replace(/"/g,'')+'"'; }).join(',');
      await fetchT(SUPABASE_URL+'/rest/v1/leads?id=in.('+encodeURIComponent(ids)+')',
        {method:'PATCH',headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
          'Content-Type':'application/json',Prefer:'return=minimal'},
         body:JSON.stringify({writeback_pending:false})});
      written+=j.written;
    }catch(e){}
  }
  if(!quiet) showToast(written?(written+' decision'+(written===1?'':'s')+' written into the sheets ✓')
                              :'Couldn\'t reach the sheets — still queued, nothing lost',!written);
  try{ wbRenderPending(); }catch(e){}
  return written;
}
/* Settings line: how many decisions have not reached a sheet yet. */
async function wbRenderPending(tries){
  var el=document.getElementById('wb-pending');
  if(!el){                                    // settings markup not painted yet
    if((tries||0)<12) return setTimeout(function(){ wbRenderPending((tries||0)+1); },120);
    return;
  }
  var rows=await wbPending();
  if(!rows.length){ el.innerHTML='<span class="wb-t good">✓ Nothing waiting — every decision has reached the sheets.</span>'; return; }
  var by={}; rows.forEach(function(l){ var v=vaDisp(l.va)||l.va||'?'; by[v]=(by[v]||0)+1; });
  el.innerHTML='<span class="wb-t bad">'+rows.length+' decision'+(rows.length===1?'':'s')+' waiting to reach the sheets ('
    +Object.keys(by).map(function(k){ return escHtml(k)+' '+by[k]; }).join(', ')+').</span> '
    +'<button class="wb-btn" onclick="wbFlushPending()">Send them now</button>';
}
/* Settings -> "Test" button: proves the URL + token before Jack relies on it. */
async function wbTest(){
  var el=document.getElementById('wb-test-out');
  var u=(document.getElementById('setting-wb-url')||{}).value||'';
  var t=(document.getElementById('setting-wb-token')||{}).value||'';
  u=u.trim(); t=t.trim();
  if(el) el.innerHTML='<span class="wb-t">checking…</span>';
  if(!u||!t){ if(el) el.innerHTML='<span class="wb-t bad">Paste both the URL and the token first.</span>'; return; }
  if(!/^https:\/\/script\.google\.com\/.*\/exec$/.test(u)){
    if(el) el.innerHTML='<span class="wb-t bad">That doesn\'t look like a deployment URL — it should end in <b>/exec</b>.</span>'; return;
  }
  try{
    var r=await fetch(u+'?token='+encodeURIComponent(t),{redirect:'follow'});
    var j=await r.json();
    if(j&&j.ok){
      if(el) el.innerHTML='<span class="wb-t good">✓ Connected — '+(j.sheets||0)+' sheets writable. Save to switch it on.</span>';
      try{ wbRenderPending(); }catch(e){}
    }
    else{ if(el) el.innerHTML='<span class="wb-t bad">Reached it, but the token doesn\'t match the one in the script.</span>'; }
  }catch(e){
    if(el) el.innerHTML='<span class="wb-t bad">Couldn\'t reach it. Check the deployment is set to <b>Anyone</b> access.</span>';
  }
}
function db_leadPatch(l,fields){
  if(IS_PREVIEW){
    try{ ldToast('Preview mode \u2014 NOT saved. Open the live app to record decisions.',true); }catch(e){}
    return Promise.resolve(false);
  }
  try{
    if(!l||!l._sid||typeof SUPABASE_URL==='undefined'||!DB_ENABLED) return Promise.resolve(false);
    fields.writeback_pending=true; fields.decided_at=new Date().toISOString(); fields.updated_at=fields.decided_at;
    return fetchT(SUPABASE_URL+'/rest/v1/leads?id=eq.'+encodeURIComponent(l._sid),
      {method:'PATCH',headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
       body:JSON.stringify(fields)})
      .then(function(r){
        if(r.ok){
          leadWriteOk(l);
          // straight into the sheet; on failure the pending flag is still set, so nothing is lost
          try{ wbPush(l,fields).then(function(done){
            if(done) fetchT(SUPABASE_URL+'/rest/v1/leads?id=eq.'+encodeURIComponent(l._sid),
              {method:'PATCH',headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
               'Content-Type':'application/json',Prefer:'return=minimal'},
               body:JSON.stringify({writeback_pending:false})});
          }); }catch(e){}
          return true;
        }
        leadWriteFailed(l,'the server rejected it ('+r.status+')');
        return false;
      })
      .catch(function(e){
        leadWriteFailed(l, e&&e.timeout?'it timed out':'you appear to be offline');
        return false;
      });
  }catch(e){ return Promise.resolve(false); }
}
function leadWriteOk(l){
  try{ delete (window._leadFailed=window._leadFailed||{})[l.id]; renderLeadFailBar(); }catch(e){}
}
function leadWriteFailed(l,why){
  try{
    (window._leadFailed=window._leadFailed||{})[l.id]={title:l.title||l.asin||('Lead '+l.id), why:why, l:l};
    renderLeadFailBar();
    ldToast('NOT saved \u2014 '+why+'. Your decision is still on screen; hit Retry.',true);
  }catch(e){}
}
/* one persistent bar listing anything that didn't reach the sheet, with a retry */
function renderLeadFailBar(){
  var host=document.getElementById('view-leads'); if(!host) return;
  var bar=document.getElementById('lead-fail-bar');
  var f=window._leadFailed||{}, ids=Object.keys(f);
  if(!ids.length){ if(bar) bar.remove(); return; }
  if(!bar){ bar=document.createElement('div'); bar.id='lead-fail-bar'; host.insertBefore(bar,host.firstChild); }
  bar.innerHTML='<span>&#9888;</span><div><b>'+ids.length+' decision'+(ids.length===1?'':'s')+" didn't reach the sheet.</b>"
    +'<span>'+escHtml(f[ids[0]].why)+(ids.length>1?' &middot; and '+(ids.length-1)+' more':'')+'</span></div>'
    +'<button onclick="retryLeadWrites()">Retry all</button>';
}
function retryLeadWrites(){
  var f=window._leadFailed||{}; var ids=Object.keys(f);
  if(!ids.length) return;
  ldToast('Retrying '+ids.length+'\u2026');
  ids.forEach(function(k){
    var l=f[k].l; if(!l) return;
    var patch={};
    if(l.islead===true) patch.islead='LEAD'; else if(l.islead===false) patch.islead='NOT LEAD';
    if(l.status) patch.status=sheetStatusOut(l.status);
    if(l.notes&&l.notes.trim()) patch.jack_comment=l.notes.trim();
    db_leadPatch(l,patch);
  });
}
setTimeout(loadLeadsFromDB,800);
setTimeout(function(){ try{ loadDecisions(); }catch(e){} },1000);   // pull full decision history for the learning model
setInterval(function(){
  if(leadsEditing()) return;                  // mid-note / mid-quantity — leave him alone
  var lv=document.getElementById('view-leads');
  var onShift=window.state&&state.shiftStart&&!state.submitted;
  if((lv&&lv.classList.contains('active'))||onShift){
    var _lp=loadLeadsFromDB();
    /* Suz, 14/09: the end-of-shift warnings were painted ONCE, when the shift screen opened
       at 03:01 with no leads on her sheet. Leads refreshed every minute after that, but the
       panel never did — so at 12:53 she was looking at the 03:01 picture: no duplicate
       warning for row 131, no "11 logged vs 18 on sheet". Repaint whenever leads land. */
    if(onShift && _lp && _lp.then) _lp.then(function(){ try{ eodRenderLeadCheck(); }catch(e){} });
  }
},60000);
// prefetch spend in the background on startup so the overview shows instantly (no "loading" wait)
setTimeout(function(){ try{ loadSpend(); }catch(e){} },1500);
let view='new',va='all',scoreMin=0,sortBy='date',selId=null;   // Jack: "auto default this to date"
/* How far through the month we are, in WORKING days — Mon-Fri only, since that is
   when a lead can be found. Used to pro-rata the monthly ticket targets. */
function moPace(){
  try{
    var n=ukNow(), y=n.getFullYear(), m=n.getMonth(), dToday=n.getDate();
    var total=0, done=0;
    var last=new Date(y,m+1,0).getDate();
    for(var d=1; d<=last; d++){
      var wd=new Date(y,m,d).getDay();
      if(wd===0||wd===6) continue;
      total++;
      if(d<=dToday) done++;
    }
    if(!total) return {frac:1,done:0,total:0};
    return {frac:Math.min(1,done/total), done:done, total:total};
  }catch(e){ return {frac:1,done:0,total:0}; }
}
function ageTxt(h){if(h<1)return'just now';if(h<24)return h+'h ago';const d=Math.floor(h/24);return d+'d ago'}
function isStale(l){return (l.islead===null&&!l.status)&&l.hrs>=36}
function isFresh(l){return l.hrs<12}
function scCol(s){return s>=7?'var(--green)':s>=5?'var(--amber)':'var(--red)'}
function scGrade(s){return s>=9?'Banger':s>=7.5?'Strong':s>=6?'Decent':s>=4?'Weak':'Poor'}
function scHealth(s){return s>=7?'sh-green':s>=5?'sh-amber':'sh-red'}
function roiC(r){return r>=20?'vg':r>=12?'vg':r>=10?'va-c':'vr'}
function profC(p){return p>=9?'vg':p>=3?'va-c':'vr'}   // rubric tiers: high £9+, mid £3–£9, low under £3
function spmC(s){return s>=500?'vc':s>=100?'vg':s>=30?'va-c':'vr'}
function fbaC(f){return f<=6?'vg':f<=15?'va-c':'vr'}   // red only where the 'Crowded (15+)' badge also fires
function marC(m){return m>=6?'vg':'vr'}
function f2(n){return(+n).toFixed(2)}
function spml(s){return s>=1000?'>1000':s>=500?'>500':s>=300?'>300':s>=100?'>100':s>=50?'>50':s}
// OA vs A2A from the source method text (A2A/reverse/arbi = A2A, else Online Arbitrage)
