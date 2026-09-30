BDL VA HQ (ShiftTrack) — folder build, since v51.6 (30 Sep 2026)
Live: https://jackbithellamazon.github.io/shifttrack/  ·  repo jackbithellamazon/shifttrack  ·  Supabase (anon key in js/config.js, that is fine)
Master lives in ~/Documents/Claude/bdl-shifttrack-harness/BDL-SHIFTTRACK/ — edit there, then: bash gate.sh (checks + preview), python3 build.py push.

index.html   the page shell (sidebar, VA screen, Jack's dashboard, modals) — no code
css/app.css  every style
js/ in load order (order matters — earlier files must not call later ones while loading; gate.sh checks this):
  storage           the one localStorage helper (lsGet/lsPut/lsDrop), housekeeping — loads first
  config            keys, IS_PREVIEW, fetchT, skeletons, preview banner, stale-build nudge
  cloud             save safety net (dbWrite + retry bar), Supabase helpers, VA history from Supabase, legacy-copy retirement
  discord           every Discord message (EOD, tasks, breaks, shift start), live-status push
  draft             draft shift save/restore (60s autosave, draft_shifts)
  core              APP_VERSION, state, app settings, lead warning badges, task templates
  shift             navigation/login, unclosed-shift check, start shift, render tasks, EU sheets, link arrays
  shift-tasks       storefront batch card, quick-log, per-link timers, storefront tracker, From-Jack tasks
  clock             worked time, the clock, shift event log, break UI
  eod               results, A2A vs OA, celebrations, price bands, per-VA targets, submitEOD
  manager           Jack's dashboard engine, KPI/shift cards, banners, week table, AI insights, day-by-day
  manager-tabs      tab renderers, spend, storefront league, outstanding-from-Jack tracker
  insights          lead intelligence, repeat behaviour
  oa                Filters tab, OA sourcing panel (read-only window on the Sourcing Suite)
  mgr-settings      set hours, ticklist archive, storage card, the Settings page
  autotune          analysis engine for Auto-tune and Insights
  weekly            weekly review
  helpers           MOTD, Keepa tracker, VA issue report, link/lead helpers, clocks, nav toggle, toast
  shell             the VA stat strip and app-shell wiring
  cardstyle         KPI card style toggle
  leads-engine      leads engine, smart score, decisions, honest training, deal matrix
  pay               new-lead ping, pay cycle, admin overtime
  eod-check         does what she logged match the sheet, must-fix-before-finish, dups, ack gate
  sheets            sheet → app ingestion, writeback
  leads-list        the leads list: OA vs A2A, archive, twin rows, thumbnails, duplicates, signals, ASIN key
  leads-focus       focus queue, Lightshot, screenshot viewer, reasons, per-lead meta
  saved-filters     saved filter library, POA links, bulk import, filter usage
  from-jack         From-Jack briefs and open items
  storefronts-core  ASIN parsing, Keepa links, DB self-check, SQL, queues, batches, submit
  storefronts-import  Sarah's import page
  storefronts-jack  Jack's batches board, routing, queue admin, bulk edit
  storefronts-history  history, what's producing, worth-it
  audit             shift audit
  selftest          selfTest()
  storefronts-va    VA-side batches, shared batches
  send-again        repeat schedules, storefront memory, note snippets
  leads-page        the leads page boot — loads last

tests/sandbox-checks.js  paste into the preview's console: blocks every non-GET request, then runs selfTest + a tab sweep + storage checks.
Rules: never a real webhook URL, Google key or secret key in these files (build.py push refuses). Preview at 127.0.0.1 never writes to the cloud (IS_PREVIEW).
SHIP GATE (gate.sh): every js file parses; the single-file checks run on the rejoined file; no file calls a later file while loading; no secrets;
  then smoke.ts opens the app in headless Chrome with NO Sheets key and NO cached data, waits for real data, presses every dashboard tab, the leads page
  and a VA shift, and FAILS if anything hangs or throws (30 Sep 2026: the Storefronts tab looped forever without a key — this catches exactly that).
  A build that has not passed gate.sh is not shippable.
