/* ═══════════ STOREFRONT SOURCING MODULE (V1) ═══════════════════════════════
   Replaces the Google Sheets storefront workflow.
     Sarah pastes ASINs → batch created/appended → Keepa link → auto-assigned
     (or held for Jack) → VA presses Start (LOCKS) → Complete.
   Deliberately NOT built in V1, per spec: analytics, reports, workload
   balancing, comments, search, a notification centre. It is a clipboard,
   not an ERP. Every common action is one click. */

var SB_STATUS = ['Draft','Assigned','Started','Completed'];
var SB_PRIORITY = ['Low','Normal','High'];

/* ── ASIN parsing ───────────────────────────────────────────────────────────
   Sarah pastes one ASIN per line. We're tolerant of commas/spaces/blank lines
   because a clipboard is a messy place, but we never try to parse columns. */
function sbParseAsins(raw){
  var seen={}, out=[], dupes=0, bad=[];
  String(raw||'').split(/[\s,;]+/).forEach(function(tok){
    tok=String(tok||'').trim().toUpperCase();
    if(!tok) return;
    if(!/^B0[0-9A-Z]{8}$/.test(tok)){
      /* Sarah works off storefront PAGES, so copying product links is at least as
         likely as copying a bare ASIN column. Pulling the ASIN out of a URL is the
         difference between "12 added" and a dead end reading
         "I saw things like HTTPS://WWW.AM". Only ever taken from a recognised
         product path, so a stray B0-looking string in a title can't sneak in. */
      var m=tok.match(/(?:\/DP\/|\/GP\/PRODUCT\/|\/GP\/AW\/D\/|\/PRODUCT\/|[?&]ASIN=)(B0[0-9A-Z]{8})/);
      if(m) tok=m[1];
      else { if(tok.length>3) bad.push(tok.length>28?tok.slice(0,26)+'\u2026':tok); return; }
    }
    if(seen[tok]){ dupes++; return; }           // duplicates stripped WITHIN this paste only
    seen[tok]=1; out.push(tok);
  });
  return {asins:out, dupes:dupes, bad:bad};
}

/* ── Keepa Product Viewer link ──────────────────────────────────────────────
   The URL carries a JSON payload; the listId inside it does NOT matter —
   Keepa regenerates it when the link is opened. The exact encoding is held in
   a SETTING rather than hard-coded, so it can be corrected from the admin page
   without touching code if Keepa ever changes it.
   `{ASINS}` is replaced with the comma-separated list, `{ASINS_NL}` newline-
   separated, `{JSON}` with a base64url-encoded payload. */
/* ── Keepa Product Viewer link ──────────────────────────────────────────────
   CONFIRMED against a real URL from Jack (28/07/2026). The format is:

     https://keepa.com/#!viewer/  +  encodeURIComponent(JSON.stringify({ "<domain>": [asins] }))

   e.g. {"2":["B07BCP4B35","B07CQQG66F"]} → %7B%222%22%3A%5B%22B07BCP4B35%22%2C…
   "2" is Keepa's domain id for amazon.co.uk — the same 2 already used by this
   app's single-product links (`#!product/2-<ASIN>`). There is no listId to keep:
   Keepa regenerates the list from the ASINs when the link is opened. Verified by
   rebuilding one of his URLs from its ASINs and matching it character for character. */
var SB_KEEPA_DOMAIN = '2';                    // 1=.com 2=.co.uk 3=.de 4=.fr 8=.it 9=.es
function sbKeepaDomain(){
  try{ var d=String(getAppSettings().keepaDomain||'').trim(); if(/^\d+$/.test(d)) return d; }catch(e){}
  return SB_KEEPA_DOMAIN;
}
function sbKeepaUrl(asins){
  asins=(asins||[]).filter(function(a){ return /^B0[0-9A-Z]{8}$/i.test(String(a||'').trim()); })
                   .map(function(a){ return String(a).trim().toUpperCase(); });
  if(!asins.length) return '';
  var payload={}; payload[sbKeepaDomain()]=asins;
  return 'https://keepa.com/#!viewer/'+encodeURIComponent(JSON.stringify(payload));
}
/* ── DATABASE SELF-CHECK ─────────────────────────────────────────────────────
   "Is the database right?" should be a button, not a favour. Asks Supabase for
   every table and column the app writes to. Read-only — selects, never writes. */
var DB_EXPECT = [
  ['app_settings',           ['id','data']],
  ['leads',                  ['id','va','asin','islead','status','decided_at','writeback_pending','image']],
  ['shifts',                 ['id','va','date','data','submitted_at','keepa_count','keepa_total']],
  ['draft_shifts',           ['va','date','data','updated_at']],
  ['live_status',            ['va','data','updated_at']],
  ['app_flags',              ['k','v']],
  ['jack_briefs',            ['k','data','updated_at']],
  ['saved_filters',          ['id','title','url','tag','pos','archived']],
  ['filter_usage',           ['filter_id','va','date','leads']],
  ['lead_decisions',         []],
  ['reports',                ['id','va','type','text','resolved']],
  ['storefront_sessions',    ['va','name','date','seconds','leads']],
  ['sheet_tabs',             []],
  ['storefronts',            ['id','name','default_assignee','manual_review','priority','active','pos','notes']],
  ['storefront_batches',     ['id','storefront_id','date','batch_number','status','assigned_to','priority','keepa_url','asin_count']],
  ['storefront_batch_items', ['batch_id','asin']]
];
async function dbSelfCheck(){
  var host=document.getElementById('dbcheck-out');
  if(host) host.innerHTML='<div class="sk-note">Checking every table and column&hellip;</div>';
  var rows=[];
  for(var i=0;i<DB_EXPECT.length;i++){
    var t=DB_EXPECT[i][0], cols=DB_EXPECT[i][1];
    var r={table:t, ok:false, missingCols:[], note:''};
    try{
      var res=await fetchT(SUPABASE_URL+'/rest/v1/'+t+'?select=*&limit=1',
        {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
      if(res.status===404){ r.note='table missing'; }
      else if(!res.ok){ r.note='HTTP '+res.status; }
      else {
        r.ok=true;
        if(cols.length){
          var cr=await fetchT(SUPABASE_URL+'/rest/v1/'+t+'?select='+cols.join(',')+'&limit=1',
            {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
          if(!cr.ok){
            for(var c=0;c<cols.length;c++){
              var one=await fetchT(SUPABASE_URL+'/rest/v1/'+t+'?select='+cols[c]+'&limit=1',
                {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
              if(!one.ok) r.missingCols.push(cols[c]);
            }
            if(r.missingCols.length) r.ok=false;
          }
        }
      }
    }catch(e){ r.note = (e&&e.timeout)?'timed out':'couldn\'t reach it'; }
    rows.push(r);
  }
  var bad=rows.filter(function(x){ return !x.ok; });
  var html='<div class="dbc-sum '+(bad.length?'bad':'good')+'">'
    +(bad.length ? ('&#9888; '+bad.length+' of '+rows.length+' need attention')
                 : ('&#10003; All '+rows.length+' tables and every column the app writes are present'))
    +'</div><div class="dbc-list">'
    + rows.map(function(x){
        var detail = x.ok ? 'ok'
          : (x.missingCols.length ? ('missing column'+(x.missingCols.length>1?'s':'')+': '+x.missingCols.join(', '))
                                  : (x.note||'problem'));
        return '<div class="dbc-row'+(x.ok?'':' bad')+'"><span>'+(x.ok?'&#10003;':'&#9888;')+'</span>'
          +'<b>'+escHtml(x.table)+'</b><i>'+escHtml(detail)+'</i></div>';
      }).join('')
    +'</div>';
  if(bad.some(function(x){ return /^storefront/.test(x.table); })){
    html+='<div class="dbc-hint">The storefront tables are created by the SQL on the '
      +'<a onclick="mgr_switchTab(\'storefronts\')">Storefronts tab</a> &mdash; one click to copy it.</div>';
  }
  if(host) host.innerHTML=html;
}
/* ── SETUP SQL, CARRIED BY THE APP ──────────────────────────────────────────*/
function sbSetupSQL(){
  return [
"-- BDL VA HQ · STOREFRONT SOURCING MODULE — run once.",
"-- Creates only. Nothing existing is altered or deleted. Safe to run twice.",
"",
"create table if not exists storefronts (",
"  id text primary key,",
"  name text not null,",
"  storefront_id text,",
"  source_type text default 'storefront',",
"  owner text,",
"  default_assignee text not null default 'Jack',",
"  manual_review boolean not null default false,",
"  priority text not null default 'Normal',",
"  frequency text default 'Daily',",
"  notes text,",
"  active boolean not null default true,",
"  pos integer default 0,",
"  created_at timestamptz default now(),",
"  updated_at timestamptz default now()",
");",
"alter table storefronts enable row level security;",
"do $$ begin",
"  if not exists (select 1 from pg_policies where tablename='storefronts' and policyname='allow all') then",
"    create policy \"allow all\" on storefronts for all using (true) with check (true);",
"  end if;",
"end $$;",
"create index if not exists storefronts_active_idx on storefronts (active, pos);",
"",
"create table if not exists storefront_batches (",
"  id text primary key,",
"  storefront_id text not null,",
"  storefront_name text,",
"  date text not null,",
"  batch_number integer not null default 1,",
"  status text not null default 'Draft',",
"  assigned_to text,",
"  priority text not null default 'Normal',",
"  keepa_url text,",
"  asin_count integer default 0,",
"  created_by text,",
"  started_by text,",
"  completed_by text,",
"  created_at timestamptz default now(),",
"  started_at timestamptz,",
"  completed_at timestamptz",
");",
"alter table storefront_batches enable row level security;",
"do $$ begin",
"  if not exists (select 1 from pg_policies where tablename='storefront_batches' and policyname='allow all') then",
"    create policy \"allow all\" on storefront_batches for all using (true) with check (true);",
"  end if;",
"end $$;",
"create index if not exists sb_date_idx on storefront_batches (date);",
"create index if not exists sb_open_idx on storefront_batches (storefront_id, date, batch_number);",
"create index if not exists sb_assigned_idx on storefront_batches (assigned_to, status);",
"",
"create table if not exists storefront_batch_items (",
"  id bigint generated by default as identity primary key,",
"  batch_id text not null,",
"  asin text not null,",
"  added_at timestamptz default now()",
");",
"alter table storefront_batch_items enable row level security;",
"do $$ begin",
"  if not exists (select 1 from pg_policies where tablename='storefront_batch_items' and policyname='allow all') then",
"    create policy \"allow all\" on storefront_batch_items for all using (true) with check (true);",
"  end if;",
"end $$;",
"create index if not exists sbi_batch_idx on storefront_batch_items (batch_id);",
"",
"insert into storefronts (id, name, default_assignee, manual_review, priority, pos, active) values",
"  ('sf_mera','Mera','Mera',false,'Normal',1,true),",
"  ('sf_suz','Suz','Suz',false,'Normal',2,true),",
"  ('sf_jack','Jack','Jack',false,'Normal',3,true),",
"  ('sf_competitors','Competitors','Jack',true,'Normal',4,true),",
"  ('sf_ub','UB','Jack',true,'Normal',5,true),",
"  ('sf_hta','HTA','Jack',true,'Normal',6,true),",
"  ('sf_pl','PL','Jack',true,'Normal',7,true)",
"on conflict (id) do nothing;",
"",
"select name, default_assignee, manual_review from storefronts order by pos;"
  ].join('\n');
}
async function sbCopySQL(btn){
  var sql=sbSetupSQL();
  try{
    await navigator.clipboard.writeText(sql);
    if(btn){ var t=btn.textContent; btn.textContent='Copied ✓'; setTimeout(function(){ btn.textContent=t; },1800); }
    showToast('SQL copied — paste it into the Supabase SQL editor and hit Run');
  }catch(e){
    var box=document.getElementById('sb-sql-box');
    if(box){ box.style.display='block'; box.querySelector('textarea').select(); }
    showToast("Couldn't reach the clipboard — select the text below and copy it",true);
  }
}
function sbToggleSQL(){
  var box=document.getElementById('sb-sql-box'); if(!box) return;
  box.style.display = box.style.display==='block' ? 'none' : 'block';
}
/* ── storefront (queue) config ──────────────────────────────────────────────*/
var SB_QUEUES=null;
function sbLoadQueues(force){
  if(SB_QUEUES && !force) return Promise.resolve(SB_QUEUES);
  if(!DB_ENABLED) { SB_QUEUES=[]; return Promise.resolve(SB_QUEUES); }
  if(window.SB_TABLES_MISSING && !force){ SB_QUEUES=[]; return Promise.resolve(SB_QUEUES); }
  return fetchT(SUPABASE_URL+'/rest/v1/storefronts?select=*&order=pos',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}})
    .then(function(r){
      if(r.status===404){ window.SB_TABLES_MISSING=true; return []; }
      window.SB_TABLES_MISSING=false;
      return r.ok?r.json():[];
    })
    .then(function(rows){ SB_QUEUES=Array.isArray(rows)?rows:[]; return SB_QUEUES; })
    .catch(function(){ SB_QUEUES=[]; return SB_QUEUES; });
}
function sbActiveQueues(){ return (SB_QUEUES||[]).filter(function(q){ return q.active!==false; }); }
function sbQueueById(id){ return (SB_QUEUES||[]).filter(function(q){ return q.id===id; })[0]||null; }

/* ── batches ────────────────────────────────────────────────────────────────*/
var SB_BATCHES=null;
var SB_BATCHES_ALL=null;   // includes binned ones — the paste log, see sbLoadBatches
function sbLoadBatches(force){
  if(SB_BATCHES && !force) return Promise.resolve(SB_BATCHES);
  if(!DB_ENABLED){ SB_BATCHES=[]; return Promise.resolve(SB_BATCHES); }
  // once we know the tables aren't there, stop asking — it just fills the console
  // with 404s on every render until the setup SQL is run
  if(window.SB_TABLES_MISSING){ SB_BATCHES=[]; return Promise.resolve(SB_BATCHES); }
  return fetchT(SUPABASE_URL+'/rest/v1/storefront_batches?select=*&order=created_at.desc&limit=400',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}})
    .then(function(r){
      if(r.status===404) window.SB_TABLES_MISSING=true;
      return r.ok?r.json():[];
    })
    .then(function(rows){
      /* Jack, 31/08: "we have the log she pasted — I bin it if it's shit, but it
         should still count that Sarah pasted it." A bin used to DELETE the batch and
         its ASINs, so the paste stopped existing: Process 4 read "4 weeks ago" for a
         tag she had pasted into days earlier. Scrapped batches are now KEPT.
         SB_BATCHES = the working board (scrapped filtered out, so every existing
         consumer behaves exactly as before). SB_BATCHES_ALL = the true paste log. */
      var all=Array.isArray(rows)?rows:[];
      SB_BATCHES_ALL=all;
      /* scrapped = binned or auto-removed at 5+ days. Also hide anything already
         past the expiry even if the sweep has not written yet, so the board never
         shows a batch it is about to remove. */
      SB_BATCHES=all.filter(function(b){
        if(b.scrapped) return false;
        try{ if(typeof sbIsExpired==='function' && sbIsExpired(b)) return false; }catch(e){}
        return true;
      });
      try{ setTimeout(sbExpireSweep,1200); }catch(e){}
      return SB_BATCHES;
    })
    .catch(function(){ SB_BATCHES=[]; SB_BATCHES_ALL=[]; return SB_BATCHES; });
}
function sbToday(){ return ukDateShort(); }
function sbBatchesToday(){ var t=sbToday(); return (SB_BATCHES||[]).filter(function(b){ return b.date===t; }); }

/* ── THE DAY BEING IMPORTED FOR ─────────────────────────────────────────────
   Defaults to today and stays there unless it's deliberately changed. Backdating
   exists because the sheet sometimes gets done a day late, and a batch has to
   land on the day the work was actually for — otherwise the history is wrong and
   the VA's task list is wrong with it. Everything downstream (which batch is open,
   what Sarah sees, what the VA gets) follows sbWorkDate(), never sbToday(). */
var SB_IMPORT_DATE=null;                       // null = today
function sbWorkDate(){ return SB_IMPORT_DATE || sbToday(); }
function sbIsBackdated(){ return sbWorkDate()!==sbToday(); }
function sbToISO(uk){ var m=String(uk||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m?(m[3]+'-'+m[2]+'-'+m[1]):''; }
function sbFromISO(iso){ var m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m?(m[3]+'/'+m[2]+'/'+m[1]):''; }
/* "Tue 28 Jul" — so a backdated import can never be mistaken for today's at a glance */
function sbAgeDays(uk){
  var iso=sbToISO(uk); if(!iso) return null;
  var d=new Date(iso+'T12:00:00'), n=new Date();
  n=new Date(n.getFullYear(),n.getMonth(),n.getDate(),12,0,0);
  return Math.round((n-d)/86400000);
}
/* ── JACK'S ORDER, 03/09 ─────────────────────────────────────────────────────
   "priority should be high today then high yesterday - till oldest - then medium
   today to oldest then low today till oldest."
   So: PRIORITY BANDS FIRST, and inside each band NEWEST first. This is the
   opposite of the oldest-first rule the VA list used to use, and it is deliberate:
   he wants today's high-priority work cleared before anything else, whatever age.
   The 5-day expiry below is what stops that burying anything for ever. */
function sbPriRank(p){
  var v=String(p||'Normal').toLowerCase();
  if(v==='high') return 0;
  if(v==='low')  return 2;
  return 1;                                    // Normal / Medium / anything else
}
function sbOrderCmp(a,b){
  var pa=sbPriRank(a&&a.priority), pb=sbPriRank(b&&b.priority);
  if(pa!==pb) return pa-pb;                    // High, then Medium, then Low
  var aa=sbAgeDays(a&&a.date), ab=sbAgeDays(b&&b.date);
  aa=(aa===null||aa===undefined)?9999:aa; ab=(ab===null||ab===undefined)?9999:ab;
  if(aa!==ab) return aa-ab;                    // inside a band: today first, then back
  return String((a&&a.storefront_name)||'').localeCompare(String((b&&b.storefront_name)||''));
}
/* ── 5-DAY AUTO-REMOVE ──────────────────────────────────────────────────────
   Jack: "anything 5 days or older needs to auto remove now."
   A storefront list five days old is stale stock and stale prices — working it is
   worse than not working it. These drop off the board on their own.
   NOTHING IS DELETED: an expired batch is marked scrapped (the same soft-bin added
   on 31/08), so the paste still counts on the tag's last-paste and it can be
   brought back. A batch a VA has already STARTED is never auto-removed — she is
   mid-way through it. */
var SB_EXPIRE_DAYS=5;
function sbIsExpired(b){
  if(!b || b.scrapped) return false;
  if(b.status==='Completed'||b.status==='Started') return false;   // finished, or in someone's hands
  var a=sbAgeDays(b.date);
  return a!==null && a>=SB_EXPIRE_DAYS;
}
function sbExpireSweep(){
  try{
    if(typeof IS_PREVIEW!=='undefined'&&IS_PREVIEW) return;
    if(!DB_ENABLED || !window._mgrUnlocked) return;                // Jack's app does the sweep
    var due=(SB_BATCHES||[]).filter(sbIsExpired);
    if(!due.length) return;
    var names=due.map(function(b){ return (b.storefront_name||'batch')+' ('+sbAgeDays(b.date)+'d, '+(b.asin_count||0)+' ASINs)'; });
    var done=0;
    (function next(i){
      if(i>=due.length){
        if(done){
          SB_BATCHES=null; SB_BATCHES_ALL=null;
          try{ sbLoadBatches(true).then(function(){ try{ mgr_renderStorefronts(); }catch(e){} }); }catch(e){}
          try{ showToast('\u{1F5D1} '+done+' batch'+(done===1?'':'es')+' auto-removed at '+SB_EXPIRE_DAYS+'+ days old'); }catch(e){}
        }
        return;
      }
      var b=due[i];
      fetchT(SUPABASE_URL+'/rest/v1/storefront_batches?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',
        headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
          'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify({scrapped:true, scrapped_at:new Date().toISOString(), scrapped_by:'auto-'+SB_EXPIRE_DAYS+'d'})})
        .then(function(r){ if(r.ok) done++; }).catch(function(){})
        .then(function(){ next(i+1); });
    })(0);
    window.SB_EXPIRED_LAST=names;
  }catch(e){}
}
function sbAgeCls(n){
  if(n===null) return '';
  if(n<=0) return ' fresh';
  if(n<=2) return '';
  if(n<=5) return ' old';
  return ' stale';
}
function sbAgeLabel(uk){
  var n=sbAgeDays(uk);
  if(n===null) return uk||'';
  if(n<=0) return 'Today';
  if(n===1) return 'Yesterday';
  return n+' days old';
}
function sbDayLabel(uk){
  var iso=sbToISO(uk); if(!iso) return uk||'';
  try{ return new Date(iso+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}); }
  catch(e){ return uk; }
}
/* An explicit way to prove nothing is stale, rather than asking the user to trust it. */
function sbForceRefresh(btn){
  if(btn){ btn.disabled=true; btn.textContent='Refreshing\u2026'; }
  SB_FLASH=null;
  Promise.all([sbLoadQueues(true), sbLoadBatches(true)])
    .then(function(){ sbRenderImport(); showToast('Refreshed from the server \u2713'); })
    .catch(function(){ if(btn){ btn.disabled=false; btn.textContent='\u21bb Refresh'; }
                       showToast('Couldn\'t reach the server',true); });
}
function sbSetImportDate(iso){
  var uk=sbFromISO(iso);
  SB_IMPORT_DATE=(!uk||uk===sbToday())?null:uk;
  // Clear the last submit's result. It said "Filed under Wed 29 Jul" while the picker
  // read Tue 28 Jul — it was a leftover from the previous submit, not a wrong date, but
  // it looked exactly like the app filing work on the wrong day. A stale confirmation is
  // worse than none: it describes something that didn't just happen.
  SB_FLASH=null;
  window._sbBackOk=false;                 // re-confirm backdating for the new day
  sbRenderImport();
  // ...then re-read from the server. SB_BATCHES is a page-level cache: without this,
  // switching days shows whatever was true when the page loaded, so a batch filed on
  // another device (or in another tab) is invisible and it looks like stale data.
  try{ sbLoadBatches(true).then(function(){ sbRenderImport(); }); }catch(e){}
}
function sbResetImportDate(){ SB_IMPORT_DATE=null; SB_FLASH=null; window._sbBackOk=false; sbRenderImport(); }
/* the batch a new paste should join: today's highest-numbered one that is NOT started */
/* Every batch a group route creates is a real batch of its own — same tag, same day,
   same batch number, same ASINs, one owner each. The per-VA done flags stay in the file
   for rows written before this (assigned_to 'Both'/'All'), which still read correctly
   through sbPeople — nothing is migrated, nothing is lost. */
async function sbFanOut(batch, people, asins){
  if(IS_PREVIEW) return {made:0, people:people.slice()};
  var made=0;
  for(var i=1;i<people.length;i++){
    var clone={ id:'b_'+sbUid(), storefront_id:batch.storefront_id, storefront_name:batch.storefront_name,
                date:batch.date, batch_number:batch.batch_number, status:'Assigned', assigned_to:people[i],
                priority:batch.priority, keepa_url:batch.keepa_url, asin_count:(asins||[]).length,
                created_by:batch.created_by };
    var r=await fetchT(SUPABASE_URL+'/rest/v1/storefront_batches',{method:'POST',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
               'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify(clone)});
    if(!r.ok) continue;
    made++;
    if((asins||[]).length){
      await fetchT(SUPABASE_URL+'/rest/v1/storefront_batch_items',{method:'POST',
        headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
                 'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify(asins.map(function(a){ return {batch_id:clone.id, asin:a}; }))});
    }
  }
  return {made:made, people:people.slice()};
}
/* Sarah keeps pasting into a tag all morning. Once a group route has split the tag into
   one batch per VA, a later paste has to reach EVERY one of them — appending to just the
   first would quietly give one VA a shorter list than the other. */
function sbOpenGroup(qid){
  var t=sbWorkDate();
  var mine=(SB_BATCHES||[]).filter(function(b){ return b.storefront_id===qid && b.date===t && !b.scrapped; })
    .sort(function(a,b){ return (b.batch_number||1)-(a.batch_number||1); });
  if(!mine.length) return {group:[], nextNumber:1};
  var topNo=mine[0].batch_number||1;
  var group=mine.filter(function(b){ return (b.batch_number||1)===topNo; });
  var locked=group.some(function(b){ return b.status==='Started'||b.status==='Completed'; });
  if(locked) return {group:[], nextNumber:topNo+1};
  return {group:group, nextNumber:topNo};
}
function sbOpenBatch(qid){
  var t=sbWorkDate();
  var mine=(SB_BATCHES||[]).filter(function(b){ return b.storefront_id===qid && b.date===t; })
    .sort(function(a,b){ return (b.batch_number||1)-(a.batch_number||1); });
  var top=mine[0];
  if(!top) return {batch:null, nextNumber:1};
  if(top.status==='Started'||top.status==='Completed') return {batch:null, nextNumber:(top.batch_number||1)+1};
  return {batch:top, nextNumber:top.batch_number||1};
}
function sbUid(){ return Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4); }

/* ── SUBMIT ─────────────────────────────────────────────────────────────────
   Validate → dedupe within the paste → find today's unlocked batch → append,
   or open the next numbered one → regenerate the Keepa link → assign. */
async function sbSubmit(qid, raw, opts){
  opts=opts||{};
  var q=sbQueueById(qid);
  if(!q) return {ok:false, msg:'That queue no longer exists — refresh the page.'};
  var parsed=sbParseAsins(raw);
  if(!parsed.asins.length){
    return {ok:false, msg: parsed.bad.length
      ? ('No valid ASINs found. An ASIN looks like B0XXXXXXXX — I saw things like "'+parsed.bad[0]+'".')
      : 'Paste some ASINs first — one per line.'};
  }
  if(IS_PREVIEW) return {ok:true, preview:true, added:parsed.asins.length, dupes:parsed.dupes, bad:parsed.bad.length,
                         queue:q.name, assignedTo:(q.manual_review?'Jack':(q.default_assignee||'Jack')), manual:!!q.manual_review};

  await sbLoadBatches(true);
  var slot=sbOpenGroup(qid);
  var group=slot.group, isNew=!group.length, newNumber=slot.nextNumber;
  /* A tag routed to a pair or to Both is TWO pieces of work, so it is two batches from
     the moment Sarah submits — not one row that both VAs are told to share. Manual-review
     tags stay a single Draft: Jack decides who it goes to. */
  var people = q.manual_review ? ['Jack'] : sbPeople(q.default_assignee||'Jack');
  if(!people.length) people=['Jack'];

  if(isNew){
    var first={ id:'b_'+sbUid(), storefront_id:qid, storefront_name:q.name, date:sbWorkDate(),
            batch_number:newNumber, status: q.manual_review?'Draft':'Assigned',
            assigned_to: people[0], priority:q.priority||'Normal',
            asin_count:0, created_by:(opts.by||'Sarah') };
    var ins=await fetchT(SUPABASE_URL+'/rest/v1/storefront_batches',{method:'POST',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
               'Content-Type':'application/json',Prefer:'return=representation'},
      body:JSON.stringify(first)});
    if(!ins.ok) return {ok:false, msg:'Couldn\'t create the batch — check your connection and try again.'};
    group=[first];
    if(people.length>1){
      var extra=await sbFanOut(first, people, []);       // ASINs are added to each below
      if(extra.made){
        SB_BATCHES=null; SB_BATCHES_ALL=null;
        await sbLoadBatches(true);
        group=sbOpenGroup(qid).group;
        if(!group.length) group=[first];
      }
    }
  }

  // every open batch on this tag gets this paste — one VA must never end up short
  for(var gi=0; gi<group.length; gi++){
    var tgt=group[gi];
    var ir=await fetchT(SUPABASE_URL+'/rest/v1/storefront_batch_items',{method:'POST',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
               'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify(parsed.asins.map(function(a){ return {batch_id:tgt.id, asin:a}; }))});
    if(!ir.ok && gi===0) return {ok:false, msg:'Couldn\'t save those ASINs — nothing was added. Try again.'};
  }

  // Keepa link is regenerated from the WHOLE batch, not just this paste
  var all=await sbBatchAsins(group[0].id);
  for(var gp=0; gp<group.length; gp++){
    await fetchT(SUPABASE_URL+'/rest/v1/storefront_batches?id=eq.'+encodeURIComponent(group[gp].id),{method:'PATCH',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
               'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify({ asin_count:all.length, keepa_url:sbKeepaUrl(all) })});
  }

  SB_BATCHES=null; SB_BATCHES_ALL=null;
  return {ok:true, added:parsed.asins.length, dupes:parsed.dupes, bad:parsed.bad.length,
          total:all.length, batchNo:group[0].batch_number, isNew:isNew,
          assignedTo:(people.length>1?people.join(' + '):group[0].assigned_to),
          splitInto:(people.length>1?people.length:0),
          manual:!!q.manual_review, queue:q.name};
}
async function sbBatchAsins(batchId){
  try{
    var r=await fetchT(SUPABASE_URL+'/rest/v1/storefront_batch_items?batch_id=eq.'+encodeURIComponent(batchId)+'&select=asin&order=id',
      {headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY}});
    if(!r.ok) return [];
    var rows=await r.json();
    return (rows||[]).map(function(x){ return x.asin; });
  }catch(e){ return []; }
}
/* ── lifecycle ──────────────────────────────────────────────────────────────*/
async function sbPatch(batchId, patch, keepLocal){
  if(IS_PREVIEW) return true;
  try{
    var r=await dbWrite('A storefront batch', SUPABASE_URL+'/rest/v1/storefront_batches?id=eq.'+encodeURIComponent(batchId),{method:'PATCH',
      headers:{apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY,
               'Content-Type':'application/json',Prefer:'return=minimal'},
      body:JSON.stringify(patch)});
    if(r.ok && !keepLocal){ SB_BATCHES=null; SB_BATCHES_ALL=null; }   // keepLocal: the caller already applied it
    return r.ok;
  }catch(e){ return false; }
}
