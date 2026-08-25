# Elo's Personal OS Dashboard

A personal life-management dashboard — tasks, habits, goals, nutrition, journal entries,
and "entities" (life areas) in one interface. Originally designed in Claude Design as a
single self-contained HTML file, then rebuilt from scratch as a working React + Express +
Supabase app, entirely through conversational guidance in Claude.ai chat (Elo has not
written code by hand — every file was built, explained, and tested step by step).

## Who this is for
Elo — UCLA Business Econ student, building this as a genuine daily-use tool, not a demo.
New to React, Node, Supabase, Terminal, and VS Code — learning the stack as this gets
built, which is part of the point of the project, not incidental. Prefers plain-language
explanations over jargon, confirmation before large unannounced changes, and being walked
through things one step at a time rather than handed a wall of instructions at once. Wants
the "why" behind decisions, not just the "what." Values things being genuinely tested
before being told they work — don't claim something is done without verifying it.

## How this project came to be (context for anything that looks unusual)
1. Started as a single polished HTML mockup made in Claude Design — all visual design,
   animations, and interaction patterns originate there.
2. Rebuilt as real React components (`HomeTab.js`, `CrmTab.js`, `BrainTab.js`,
   `JournalTab.js`, `EntityPanel.js`) with an Express + Node backend, initially running on
   local mock data with no real persistence.
3. Wired to Supabase for real data persistence — this is where things stand now. Tasks,
   entities, habits, goals, nutrition, and journal entries are all real (see "What's real
   vs. still mock" below for the current, accurate breakdown — this section is historical
   context, not a status report).
4. Along the way: VS Code wasn't installed on this Mac at all until partway through this
   process — it is now, and is Elo's primary editor going forward. Also worth knowing:
   macOS blocks Terminal from touching `~/Downloads` without an explicit permission grant;
   `~/Documents` does not have this restriction, so that's the safer place for anything
   Terminal needs to read or write. An earlier Supabase project was lost/inaccessible and
   a new one was created — the current project and credentials below are the correct,
   current ones.

## Stack
- Frontend: React 18 (Create React App) — `localhost:3001`
- Backend: Node.js + Express — `localhost:5050`
- Database: Supabase (Postgres), project `personal-os-dashboard`,
  `https://znblctbounitxetfcgns.supabase.co`
- Dev proxy: `client/package.json` proxies `/api/*` to `localhost:5050`, so frontend code
  calls relative paths like `fetch('/api/tasks')`, never a full URL

## Running it
Two terminals, both need to stay open the whole time:
```
cd ~/Documents/personal-os-dashboard && npm start          # backend, port 5050
cd ~/Documents/personal-os-dashboard/client && npm start   # frontend, port 3001
```
Backend does **not** hot-reload — changes to `server.js` or `supabaseClient.js` need a
manual restart (Ctrl+C, then `npm start` again). Frontend **does** hot-reload — saving a
file is enough, no restart needed. Closing a Terminal window kills whatever process it was
running; closing a browser tab does not affect the server at all.

## Latest Session Summary (2026-08-23)
**Completed this session:**
- **Phase 1 — Security foundation.** `supabaseClient.js` now prefers
  `SUPABASE_SERVICE_ROLE_KEY` (falls back to anon key if absent). Along the way, fixed a
  credential-formatting bug (`<`/`=>` copy-paste artifacts wrapped around the pasted key
  in `.env`, causing "Invalid API key") — diagnosed via `od -c` without ever printing the
  actual secret.
- **Phase 2 — Habit + task completion history and analytics.** New `habit_completions`
  log table (one row per habit per completed day) and `tasks.completed_at`, both wired
  into `PUT /api/habits/:id` and `PUT /api/tasks/:id`. Two new endpoints:
  `GET /api/analytics/habits` (per-habit completion rate, avg completion hour, ranked
  hardest-first) and `GET /api/analytics/correlation?days=N` (day-by-day habit-vs-task
  completion buckets). **Found and fixed a real bug during testing**: both
  `completed_at` columns are timezone-naive `TIMESTAMP`, but the code was writing
  `.toISOString()` (UTC) into them, so a 4:52pm local toggle was stored and read back as
  hour 23. Fixed with a new `localTimestampStr()` helper in `server.js`, applied
  everywhere those columns are written or filtered. Full detail in the RESOLVED note
  under `habit_completions` in the schema section above.
- **Phase 3a — Claude API bridge (BRAIN briefings + JOURNAL summaries).** New
  `lib/anthropic.js` (shared `askClaude()` client) and `lib/context.js`
  (fetch-and-format Supabase data into a prompt) — deliberately two shared modules,
  not per-feature one-offs, so 4b/5 extend `context.js` rather than duplicate fetch
  logic. Two new routes: `POST /api/entities/:id/briefing` (live snapshot, not
  persisted — no briefing column on `entities`) and `POST /api/journal/:id/summary`
  (persisted to `journal_entries.recap`, which already existed as a column). Both
  wired into the existing GENERATE buttons in place of the old `setTimeout` fakes.
  **Found and fixed a real bug during testing**: Claude Opus 5's adaptive thinking is
  on by default, and the first version capped `max_tokens` at 300-400 — thinking
  alone occasionally ate the whole budget, truncating or emptying the visible reply
  (`stop_reason: "max_tokens"`). Reproduced by re-running the same prompt 3x and
  catching it fail intermittently, not assumed from one run. Fixed by adding
  `output_config: { effort: 'low' }` (these are simple summarization prompts, not
  reasoning-heavy) and raising `max_tokens` to 1024 — re-tested several times after
  with no repeat.

**Verified working, not just assumed:**
- Full end-to-end CRUD re-test after the service-role key swap (every route).
- Analytics endpoints checked against 6 days of seeded, hand-calculated data across 3
  habits + 2 tasks — every completion rate, ranking, and correlation bucket matched by
  hand. All seeded test data was deleted/restored afterward; confirmed via a fresh
  browser reload that real data (6 habits, 2 tasks, 1-day streak) was untouched.
- Timezone fix re-verified live (re-toggled a habit, `avg_completion_hour` came back
  correct) before being called done.
- BRAIN briefing and JOURNAL summary both exercised live in the actual browser UI
  (not just curl) — clicked the real GENERATE buttons, watched real Claude output
  render. Journal recap persistence confirmed via reload; the test journal entry
  used for this was deleted afterward, confirmed empty via a fresh fetch.

**Git:** Phase 3a (lib/anthropic.js, lib/context.js, server.js routes, App.js
GENERATE handlers, CLAUDE.md, package.json/package-lock.json for the new
`@anthropic-ai/sdk` dependency) is committed on top of `7b39e92` — check
`git log -1` for the current HEAD. Working tree clean.

**Not started:** Phase 3b (AI task capture in CRM, with a review-step-before-create)
— the harder follow-on to 3a, using the same `lib/anthropic.js` + `lib/context.js`
pair. Not started this session.

## Working process (standing process, started 2026-08-23)
Elo doesn't carry memory between sessions — this file and the git history are how any
future session (Claude or human) gets back on the same page about exactly where things
stand. So, going forward:
- **Commit after meaningful work**, not in one giant batch at the end of a session. Each
  commit message should describe specifically what changed and why, not just "updates."
- **Keep "What's real vs. still mock" (below) current** every time something moves from
  mock/local to real, or from real to newly-discovered-broken. This file has drifted from
  reality more than once already (see the CORRECTION notes on the `habits` table above) —
  the fix is updating it in the same pass as the code change, not as an afterthought.
- If git isn't initialized, that's a problem to fix immediately, not defer.

## File structure
```
personal-os-dashboard/
├── .env                     # PORT, SUPABASE_URL, SUPABASE_ANON_KEY — see Credentials below
├── server.js                # Express API, all routes, talks to Supabase
├── supabaseClient.js        # Supabase client init, reads .env
├── lib/
│   ├── anthropic.js          # Shared Claude API client + askClaude()/askClaudeStructured()
│   ├── context.js            # Fetches + formats Supabase data (incl. Claude-ready text)
│   ├── dates.js              # Shared localDateStr()/localTimestampStr() (server-side)
│   └── google.js             # Google OAuth2 client + Calendar API (Phase 6)
├── package.json
└── client/src/
    ├── App.js                # ALL app state lives here, passed down as props to tabs
    ├── css.js                # CSS-string -> React style object helper
    ├── theme.js              # Shared constants: colors, glow effects, entity metadata
    ├── index.css             # Global keyframes, scrollbar, hover animation classes
    ├── pages/
    │   ├── HomeTab.js         # Habits, goals, nutrition, capture bar, calendar
    │   ├── CrmTab.js          # Task manager: Priority / Kanban / Category / Archive views
    │   ├── BrainTab.js        # Entity grid + live task counts
    │   └── JournalTab.js      # Daily journal entries
    └── components/
        └── EntityPanel.js     # Slide-in detail panel for a single entity
```

## Credentials
Real values live in `.env`, which is gitignored (confirmed — see `.gitignore`, and this
is now a real git repo, so that actually matters). Expected variables:
```
PORT=5050
SUPABASE_URL=https://znblctbounitxetfcgns.supabase.co
SUPABASE_ANON_KEY=<get from Supabase dashboard -> Project Settings -> API Keys>
SUPABASE_SERVICE_ROLE_KEY=<same page, "service_role" key -- server-side only, never sent to the browser>
ANTHROPIC_API_KEY=<from console.anthropic.com -> Settings -> API Keys -- server-side only>
GOOGLE_CLIENT_ID=<from console.cloud.google.com -> APIs & Services -> Clients -- OAuth client ID>
GOOGLE_CLIENT_SECRET=<same page, paired with the client ID -- server-side only>
```
`ANTHROPIC_API_KEY` powers Phase 3a's Claude bridge (`lib/anthropic.js`) -- added and confirmed live 2026-08-23.
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` power Phase 6's Google Calendar OAuth (`lib/google.js`) --
added 2026-08-25. Google Cloud project "Personal OS Dashboard", OAuth consent screen set to
External + Testing (only the test-user email listed there can authorize -- fine for a
single-user app, avoids Google's app-review process), scope
`https://www.googleapis.com/auth/calendar.readonly` only (read-only -- nothing today needs
write access), redirect URI `http://localhost:5050/api/integrations/google/callback`. Testing-mode
apps get refresh tokens that Google may expire after ~7 days for sensitive scopes -- expect an
occasional re-auth via the CONNECT GOOGLE CALENDAR button, not a bug.
`SUPABASE_SERVICE_ROLE_KEY` is the roadmap's security-foundation step (see "Longer-term
roadmap" below) — `supabaseClient.js` prefers it automatically the moment it's present
and falls back to the anon key until then, so adding it is the entire fix, no other code
change needed.
(Deliberately not repeating actual key values here — CLAUDE.md is the kind of file
that ends up committed to git without anyone thinking twice about it.)

## Database schema
```sql
CREATE TABLE entities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  icon TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
-- pre-seeded, ids 1-7: UCLA, HEMS, WORK, FINANCE, HEALTH, LEARNING, PERSONAL
-- App.js fetches these at runtime and builds an id<->name map — don't hardcode ids elsewhere

CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  entity_id INTEGER REFERENCES entities(id),
  timeframe TEXT CHECK (timeframe IN ('TODAY','THIS WEEK','THIS MONTH','SOMEDAY')),
  is_key BOOLEAN DEFAULT FALSE,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
  -- completed_at TIMESTAMP does NOT exist yet -- Phase 2 migration, see below.
  -- Set on archive / cleared on restore by PUT /api/tasks/:id the moment the
  -- column exists; falls back gracefully (same pattern as habits.sort_order)
  -- until then, so archiving/restoring already works either way.
);

CREATE TABLE habits (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT,
  entity_id INTEGER REFERENCES entities(id),
  completed_today BOOLEAN DEFAULT FALSE,
  completed_date DATE,      -- confirmed live 2026-08-23, see below
  sort_order INTEGER,       -- confirmed live 2026-08-23, see below
  created_at TIMESTAMP DEFAULT NOW()
);
-- RESOLVED 2026-08-23: completed_date and sort_order (requested across three
-- earlier sessions) and the habit_streak table (below) are all confirmed live
-- and working, including real cross-device sync -- verified directly, not just
-- assumed. The CORRECTION note that used to live here (an earlier session
-- claimed these existed when they didn't) is gone because it's no longer true,
-- but the lesson stands for anything still marked PENDING below: verify before
-- trusting this file, don't just take its word for it.
--   curl -X PUT localhost:5050/api/habits/<id> -H "Content-Type: application/json" \
--     -d '{"completed_date":"2026-01-01"}'
-- A 400 "column ... does not exist" means something claimed live here actually isn't.

CREATE TABLE habit_streak (
  id SERIAL PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  last_done_date DATE
);
-- confirmed live 2026-08-23 -- singleton row (id=1), global (not per-habit)
-- streak count, synced cross-device. See "Decisions" below for why it's a
-- separate table rather than a habits column.

-- RESOLVED 2026-08-23: habit_completions table + tasks.completed_at column
-- both confirmed live and tested with real math, not just "it responds":
--   CREATE TABLE habit_completions (
--     id SERIAL PRIMARY KEY,
--     habit_id INTEGER REFERENCES habits(id) ON DELETE CASCADE,
--     completed_at TIMESTAMP NOT NULL DEFAULT NOW()
--   );
--   ALTER TABLE habit_completions ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "Enable all for public" ON habit_completions FOR ALL USING (true) WITH CHECK (true);
--   ALTER TABLE tasks ADD COLUMN completed_at TIMESTAMP;
--
-- habit_completions is a one-row-per-habit-per-day log (grain decided
-- deliberately -- matches the existing single daily on/off toggle, not
-- unlimited events), written by PUT /api/habits/:id on check/uncheck.
-- tasks.completed_at is a single column (not a log like habits get -- a task
-- is one-shot, not recurring), written by PUT /api/tasks/:id on
-- archive/restore. GET /api/analytics/habits and GET /api/analytics/correlation
-- both verified against seeded, hand-checked historical data (6 days across 3
-- habits + 2 tasks) -- every completion rate, hardest-habit ranking, and
-- day-by-day correlation bucket matched hand calculation exactly. ON DELETE
-- CASCADE means deleting a habit also deletes its history -- accepted for now
-- (single-user, v1), revisit if that turns out to matter. This is data
-- infrastructure for AI insights later, not a display feature, so there's
-- intentionally no frontend UI for it yet -- it's verified directly against
-- the API, same as this testing pass did.
--
-- BUG FOUND AND FIXED during that testing: both completed_at columns are plain
-- TIMESTAMP (no timezone) -- the first version of this code wrote
-- new Date().toISOString() into them, which stores the UTC clock reading
-- verbatim (e.g. wrote "23:52" for a toggle done at 4:52pm PDT). Caught via
-- direct testing (avg_completion_hour came back as 23, not 16) before it was
-- ever called done. Fixed by writing local wall-clock time instead
-- (localTimestampStr() in server.js) -- correct for a single-user,
-- single-timezone app without needing a TIMESTAMPTZ column (which would've
-- meant yet another migration). If this data is ever read by something running
-- in a different timezone, this convention needs revisiting.

-- PENDING: profile table (Operator card's name/tagline/focus/photo) does not
-- exist yet either. Same singleton-row pattern as habit_streak above, same
-- reason it's pending, same auto-upgrade behavior once it's created:
--
--   CREATE TABLE profile (
--     id SERIAL PRIMARY KEY,
--     name TEXT,
--     tagline TEXT,
--     focus TEXT,
--     photo_data TEXT,   -- a base64 data: URL, not a Supabase Storage path --
--                        -- see note below on why
--     updated_at TIMESTAMP DEFAULT NOW()
--   );
--   INSERT INTO profile (id, name, tagline, focus) VALUES
--     (1, 'Elo', 'UCLA ''27 · Founder, HEMS', 'Shipping HEMS.');
--   ALTER TABLE profile ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "Enable all for public" ON profile FOR ALL USING (true) WITH CHECK (true);
--
-- Until that's run: name/tagline/focus/photo are all editable and do persist
-- across a refresh, but via the browser's localStorage (key 'elo-os-profile'),
-- not Supabase -- same per-browser-only caveat as habits above, same
-- auto-upgrade-with-no-code-change once the table exists (App.js's profile
-- fetch on load already prefers the server value when it responds).
-- The photo is stored as a compressed base64 JPEG (resized client-side to
-- ~160px, see resizeImageFile() in HomeTab.js) directly in a TEXT column,
-- not Supabase Storage -- Storage would need its own bucket created + policies
-- set up by hand first (same manual-step problem as every table here), and a
-- base64 column works today with zero extra setup. Fine at personal-photo
-- sizes; would need revisiting if this ever needs to hold large images.
-- express.json()'s body size limit was raised to 5mb in server.js to fit these.

CREATE TABLE goals (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  timeframe TEXT CHECK (timeframe IN ('THIS WEEK','THIS MONTH')),
  entity_id INTEGER REFERENCES entities(id),
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE nutrition_log (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  kcal INTEGER, protein INTEGER, carbs INTEGER, fat INTEGER,
  logged_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE journal_entries (
  id SERIAL PRIMARY KEY,
  day TEXT, date TEXT,
  tasks_count INTEGER DEFAULT 0, captures_count INTEGER DEFAULT 0,
  recap TEXT, raw_text TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  entry_date DATE,      -- confirmed live 2026-08-25, see below
  mood INTEGER,         -- confirmed live 2026-08-25, see below
  themes TEXT[]         -- confirmed live 2026-08-25, see below
);

-- RESOLVED 2026-08-25 (Phase 4 -- journal as an insight source):
--   ALTER TABLE journal_entries ADD COLUMN entry_date DATE;
--   ALTER TABLE journal_entries ADD COLUMN mood INTEGER;      -- 1 (rough day) to 5 (great day)
--   ALTER TABLE journal_entries ADD COLUMN themes TEXT[];     -- 2-4 short tags
--
-- entry_date is a real joinable calendar date -- day/date are DISPLAY
-- strings computed once at creation ("YESTERDAY", "AUG 23, 2026"), never
-- reliable for joining against habit_completions/tasks.completed_at by day.
-- Populated from the add-form's existing date picker, sent as a plain
-- 'YYYY-MM-DD' string and never routed through `new Date()` anywhere (a
-- bare date-only string parses as UTC midnight in JS -- the same class of
-- bug already fixed once for habit_completions/tasks.completed_at, just via
-- a different code path; entry_date avoids it by staying a string end to end).
-- mood/themes are extracted from raw_text via Claude, auto-triggered right
-- after an entry is created (a separate POST /api/journal/:id/extract call,
-- not synchronous inside creation -- keeps journal saves fast) and reused as
-- a manual "re-analyze" control (the ↻ next to mood/themes on a card) for
-- later edits, since raw_text edits don't auto-re-extract.
--
-- Verified live with real seeded data (4 days, a deliberate great->good->
-- rough->bad mood/habit pattern), not just "the request succeeds":
-- GET /api/analytics/correlation merged mood onto exactly the right dates
-- (hand-checked every value against what was seeded), and
-- POST /api/analytics/insight correctly identified the real correlation
-- ("habit completion and mood move in lockstep"), quantified it, and added
-- an unprompted, correct caveat about causation direction and about days
-- with no logged data -- not a generic-sounding paragraph. All seeded data
-- (habit_completions, temporary tasks, journal entries) deleted afterward,
-- confirmed via a fresh fetch that real data was untouched.

-- PENDING MIGRATION (Phase 6 -- Google Calendar integration):
--   CREATE TABLE integrations (
--     id SERIAL PRIMARY KEY,
--     provider TEXT NOT NULL UNIQUE,   -- 'google_calendar' now, 'telegram' reuses this later
--     access_token TEXT,
--     refresh_token TEXT,
--     expires_at TIMESTAMP,
--     config JSONB,                    -- provider-specific extras, unused so far
--     created_at TIMESTAMP DEFAULT NOW(),
--     updated_at TIMESTAMP DEFAULT NOW()
--   );
--   ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "Enable all for public" ON integrations FOR ALL USING (true) WITH CHECK (true);
--
-- One general-purpose table, not a google_calendar-specific one -- reused for
-- Telegram in roadmap step 7 instead of a bespoke table per integration
-- (`provider` distinguishes rows). `lib/google.js` reads/writes this via
-- `getAuthorizedClient()`/`saveTokens()`; the googleapis client auto-refreshes
-- an expired access_token using the refresh_token and fires a 'tokens' event
-- with the new one, which is what triggers the re-save -- without that listener
-- a refreshed token would only ever live in memory for one request.
--
-- Until this migration runs: POST /api/journal/.../callback still completes
-- the OAuth exchange but redirects with ?google=no_table instead of saving
-- anything; GET /api/calendar/events 404s cleanly instead of erroring. All
-- confirmed via direct testing before this was written, not assumed.
```

**Security — fix before deploying anywhere public:** every table currently has an
`"Enable all for public" ... USING (true)` RLS policy — anyone holding the anon key can
read and write everything, no auth at all. Fine on localhost. Not fine once this has a
public URL, since the key ships inside whatever the browser downloads. Fix is either real
RLS scoped to a signed-in user, or move all Supabase access behind Express with a
service-role key that never reaches the browser (Express already sits in the middle for
exactly this reason).

## What's real vs. still mock (as of this handoff)
**Wired to Supabase, persists across refresh:**
- Tasks — full CRUD: create, star (`is_key`), archive/restore, delete, drag between
  timeframes. This one table backs three UI surfaces at once:
  - CRM tab — the task list itself
  - HOME's "Today · Key Tasks" — derived client-side as `activeTasks.filter(t => t.key)`,
    not a separate table or separate state
  - BRAIN's per-entity task counts
- Entities — fetched from Supabase; drives BRAIN's cards and the id<->name lookup used
  whenever a task is created or re-categorized.
- Habits — full CRUD, category set via an entity dropdown (not free text),
  daily-reset completion tracking, cross-device streak count, and drag-to-reorder
  all confirmed live and syncing across devices for real as of 2026-08-23 (see the
  RESOLVED note on the `habits` table above -- this used to say localStorage-only,
  that's no longer true).
- Goals (weekly + monthly) — full CRUD: add, edit text in place, delete.
- Nutrition log — add and delete; still no editing an existing entry's macros in place.
- Journal entries — add, edit the raw text, delete. The "AI RECAP" text and its
  GENERATE button are still a fake `setTimeout` placeholder, and regenerating it is
  intentionally NOT persisted (would just be writing fake filler into the database).
- Operator card (HOME, top-left) — name/tagline/focus editable in place (same
  click-pencil pattern as goals/habits), photo click opens the native file picker
  and displays what's chosen. All of it persists across a refresh today, but via
  localStorage rather than Supabase -- see the PENDING profile table note above.
- Backend: Express now talks to Supabase with the service-role key, not the anon
  key -- Phase 1 of the roadmap below, done 2026-08-23.
- Habit + task completion history / analytics (Phase 2 of the roadmap) -- done and
  tested 2026-08-23, including catching and fixing a real UTC/local timezone bug
  in the process (see the RESOLVED note above). `GET /api/analytics/habits` and
  `GET /api/analytics/correlation` both return real, verified-correct numbers. No
  frontend UI for this yet, by design -- see the roadmap note on why.
- AI entity briefings (BRAIN) and journal summaries (JOURNAL) -- Phase 3a, done and
  tested 2026-08-23. Both GENERATE buttons now call real Claude Opus 5 through a
  shared `lib/anthropic.js` (`askClaude()`) + `lib/context.js` (fetches/formats
  Supabase data into a prompt) pair, instead of the old `setTimeout` placeholders.
  Verified live in the browser, not just via curl. Journal recaps are persisted to
  `journal_entries.recap` (that column already existed, so once the summary was
  real there was no reason not to save it -- unlike the old fake version, which
  was deliberately never saved). Entity briefings are NOT persisted -- `entities`
  has no briefing column, so BRAIN's briefing is a fresh live snapshot every time
  GENERATE is hit, not saved history.
  **Real bug found and fixed during testing:** Claude Opus 5 has adaptive thinking
  on by default, and the first version of these routes capped `max_tokens` at
  300-400 -- occasionally the model's thinking alone consumed the entire budget,
  cutting the visible text off mid-sentence or leaving it empty entirely
  (`stop_reason: "max_tokens"` with a near-empty text block). Reproduced directly
  (ran the same prompt 3x, saw it fail intermittently), not assumed from a single
  test. Fixed by setting `output_config: { effort: 'low' }` (these are short,
  simple summarization prompts, not reasoning-heavy ones) and raising `max_tokens`
  to 1024 in both routes -- re-ran the same prompts several times afterward with
  no repeat.
- AI-driven task capture in CRM (Phase 3b) -- done and tested 2026-08-23. New
  "✨ AI ADD" input above CRM's manual add row: freeform text -> `POST
  /api/tasks/parse` (title, entity, timeframe, is_key, via `askClaudeStructured()`
  + a Zod schema, `lib/anthropic.js`) -> the SAME manual add row, pre-filled --
  the review step is just "the normal add row, already filled in," not a
  separate UI, so it's trivially removable later (swap the parse call for a
  direct create, no second code path to rip out). Nothing is auto-created;
  the user still hits the same ADD button. Added a small star toggle to that
  row (previously the manual add flow had no way to set `is_key` at all) so
  the AI's importance guess is visible and editable, not silently dropped.
  **Real bug found and fixed during testing:** the first version only gave
  Claude entity *names* (`UCLA, HEMS, WORK, ...`), no descriptions -- caught a
  real misclassification this way ("follow up with mentor about fundraising
  deck feedback" filed under generic `WORK` instead of `HEMS`, the actual
  startup). Fixed by adding `getEntitiesWithDescriptions()` to
  `lib/context.js` and passing `name: description` pairs in the prompt;
  re-tested the same note afterward and it correctly picked `HEMS`.
  Cross-checked a `WORK`-shaped note afterward to confirm no regression.
- Journal mood/theme extraction + the cross-domain INSIGHTS view (Phase 4) — done and
  tested 2026-08-25, migration confirmed live. New entries get mood (1-5) + 2-4 theme
  tags auto-extracted right after creation (`POST /api/journal/:id/extract`), shown on
  the entry card with a manual ↻ re-analyze control. JOURNAL's new INSIGHTS view mode
  shows a day-by-day habit/task/mood list (`GET /api/analytics/correlation`, now
  includes `mood`) plus a GENERATE button for a Claude-written pattern callout
  (`POST /api/analytics/insight`, not persisted -- same reasoning as BRAIN's entity
  briefing). Verified against real seeded data with a deliberate mood/habit pattern
  (see the RESOLVED note on `journal_entries` above) -- the insight correctly identified
  the correlation, quantified it, and added an unprompted causation-direction caveat.
- Google Calendar on HOME (Phase 6) — done and tested 2026-08-25, real OAuth
  connection + real events confirmed live. `lib/google.js` wraps OAuth
  (Authorization Code flow, `googleapis`) and `listTodayEvents()` against the real
  Calendar API. `EVENTS_TODAY`'s hardcoded array is gone -- HOME's CALENDAR card
  calls `GET /api/calendar/events` (polled every 90s while the tab is open, matching
  the roadmap's "1-2 minutes" decision) and shows a CONNECT GOOGLE CALENDAR button
  when nothing's authorized yet. Read-only scope only (`calendar.readonly`) --
  nothing today needs the dashboard to create events. Deliberately NOT syncing to a
  local table yet -- HOME only ever needs "today", so there's nothing to gain from
  persisting a copy until something else (analytics, history) actually needs
  calendar data at rest; the roadmap's `syncToken`-based incremental sync becomes
  worth building at that point, not before.
  **Two real bugs found and fixed during testing:**
  1. The CONNECT GOOGLE CALENDAR button initially did nothing when clicked --
     reported by Elo as "it just glitches a little bit and nothing happens." Root
     cause: `connectGoogleCalendar()` navigated to the relative path
     `/api/integrations/google/auth`, which CRA's dev-server proxy does NOT
     reliably forward for a real full-page navigation the way it does for
     `fetch()` calls -- webpack-dev-server's own SPA fallback intercepts requests
     whose `Accept` header signals a browser page load (`text/html`, which
     `window.location.href` sends but `fetch()` doesn't) and serves `index.html`
     instead of proxying to Express. Confirmed directly: curling that path
     through port 3001 with an html `Accept` header returned a 200 with
     `index.html`, not the expected 302. Every other `/api/*` call in this app is
     a `fetch()`, which is why this hadn't surfaced before. Fixed by pointing
     `connectGoogleCalendar()` at the backend's own port directly
     (`http://localhost:5050/...`), bypassing the dev-server proxy for this one
     navigation.
  2. After connecting, HOME showed nothing even though Elo's calendar clearly had
     events -- `listTodayEvents()` only queried `calendarId: 'primary'`, but
     Elo's actual schedule lives on secondary calendars (School, Work, ...) with
     the primary calendar unchecked/empty in his own Google Calendar sidebar.
     Fixed by calling `calendarList.list()` first and querying every calendar
     with `selected === true` (Google's own flag for "checked in your calendar
     list"), merging and sorting the results -- so the dashboard shows exactly
     the calendars Elo has checked, same as Google Calendar's own UI, not just
     the primary one.
  3. Even after fix #2, calendars Elo is *subscribed to* rather than owns
     (Family, a college's calendar) were still silently excluded -- confirmed
     directly that Google's `selected` flag is simply absent from the API
     response for non-owned calendars, checked or not, so there's no reliable
     signal to read their real sidebar state through this endpoint at all
     (verified: Family, which looks checked in Elo's sidebar, and a college
     calendar with a real class happening that day, both came back with
     `selected` entirely missing). Rather than guess at a heuristic, asked Elo
     directly what he wanted -- he asked for these included by default AND a way
     to toggle any calendar on/off from within the dashboard itself. Built both:
     `defaultVisibility()` in `lib/google.js` now treats non-owned calendars as
     visible by default (only the primary calendar, detected via `c.primary`,
     defaults to hidden), and a new CALENDARS toggle panel (⚙ next to the week
     nav on HOME's CALENDAR card) lets Elo hide/show any individual calendar.
     Overrides persist in `integrations.config` (the JSONB column already on
     the table, no new migration needed) as a `hidden_calendar_ids` list layered
     on top of the defaults -- storing overrides rather than a full allowlist
     means a calendar added in Google later just inherits its sensible default.
     New routes: `GET /api/calendar/calendars` (list with current visible
     state), `PUT /api/calendar/calendars` (save the hidden-ids override).
  **Verified end-to-end, not just "it compiles":** real OAuth round-trip
  completed by Elo; `GET /api/integrations/google/status` returns
  `{connected:true}`; `GET /api/calendar/events` returns all 3 of Elo's real
  events for the day across owned and subscribed calendars ("Andy trip- Japan"
  from Family, "Work", "Communication Research Methods" from a subscribed
  college calendar); confirmed the CALENDARS toggle panel in the actual
  browser -- unchecking a calendar removed its event from the list immediately,
  re-checking it brought the event back, verified against the live API
  response at each step, not just the UI redrawing.
- ~~Google Tasks~~ -- RETRACTED 2026-08-25, was chasing a problem that didn't
  exist. The UCLA class schedule (Econ 105, MGMT 170, ...) initially looked
  like recurring Calendar events with no matching Calendar data anywhere in
  the account, which led to a wrong theory that they were actually Google
  Tasks. Root cause of THAT confusion: misread a screenshot of Elo's calendar
  -- the visible month grid was headed "September 2026", but the dates in it
  (20, 21, 22...) got read as August dates, i.e. "today." Elo pushed back
  ("I created them from Google Calendar") and shared a screenshot of one of
  the actual events, which showed a completely normal recurring Calendar
  Event (Event details tab, guests, a room, a professor's name) on the
  School calendar, starting **September 21, 2026** -- not August. Verified
  directly: querying the School calendar for Sep 21 returns exactly the
  events in that screenshot (Econ 105 9:30am, MGMT 170 11am, Econ 11 5pm),
  correctly formatted, already handled by the Calendar integration built
  earlier -- there was never a second Google product involved, just a
  same-day mismatch during testing because the class quarter hadn't started
  yet when "today" was checked. The `tasks.readonly` scope and
  `listTasks()`/`GET /api/integrations/google/tasks` added for the Tasks
  theory were reverted -- see the commit that undid Phase 6's tasks-scope
  commit for the full diff.

## Decisions worth knowing before touching this code
- **HOME's key-task checkbox archives the task, full stop** — no separate "done but still
  visible" state. The original Claude Design mock had HOME keep checked tasks visible with
  a strikethrough while CRM removed them outright on the same action; we picked one
  consistent behavior (checking off = archived, same as CRM) instead of maintaining two
  different completion meanings for the same underlying task.
- **Backend rows get adapted to match the already-built UI, not the other way around.**
  `App.js` has one `transformX()` function per table (`transformTask`, `transformEntity`,
  `transformHabit`, `transformGoal`, `transformNutrition`, `transformJournal`) that
  converts Supabase's column names into whatever shape the already-built components
  expect. Keep using this pattern for anything new — it's much lower-risk than reshaping
  components that already work.
- **Optimistic UI, fire-and-forget writes.** Every task handler updates local React state
  immediately and fires the API call as a side effect (`.catch(console.error)`, no
  rollback on failure). Keeps the UI feeling instant. If a write silently fails, the UI can
  drift from the database until the next reload — worth real error handling if that starts
  causing problems in practice.
- **A stacked-delay bug already happened once and got fixed** — `toggleTask` originally
  waited 260ms before calling `archiveCrmTask`, which itself waits another 260ms before
  actually saving, adding up to ~520ms of pointless delay before anything persisted. Fixed
  by calling `archiveCrmTask` directly. Worth checking for this pattern (handlers wrapping
  other handlers' timeouts) if new features get layered on existing ones.
- **KNOWN QUIRK, not yet root-caused:** a freshly-added row (a new journal entry via
  `submitJournalAdd`, a new task via `submitCrmAdd`) sometimes doesn't render in its
  list immediately after creation, even though the create genuinely succeeded (confirmed
  both times via direct API check) — a page reload always shows it correctly. Observed
  twice independently during Phase 3a/3b testing (once with journal, once with CRM add),
  so it's a pre-existing pattern in how these lists filter/derive from state, not
  specific to either feature or to the new AI-assisted flows. Didn't block either phase
  since the underlying data was always correct — worth investigating on its own if it
  keeps showing up, but out of scope for what was asked in either session.

## Longer-term roadmap (agreed 2026-08-23 — supersedes any earlier ordering in this file)
The long-term goal: this becomes a personal data layer, not just a tracker — habits,
tasks, calendar, and journal data accumulating as real history that AI agents (in-app,
and eventually a Telegram bot) can cross-reference for genuine insights ("didn't finish
habits today → probably didn't finish tasks either" is the kind of correlation this is
meant to eventually surface on its own), not just display numbers back.

Phase order below is dependency-driven, not just priority-driven — each phase either
unblocks or is meaningfully cheaper because of the one before it. Full reasoning for the
ordering lives in the planning discussion this came out of; this is the summary to build
from.

1. ~~Supabase persistence~~ — done (tasks/entities/habits/goals/nutrition/journal all
   real; habit_streak real; profile table still pending, see above)
2. ~~**Security foundation**~~ — done 2026-08-23. `supabaseClient.js` uses the
   service-role key (server-side only, in `.env`, never reaches the browser), confirmed
   working end-to-end (every route re-tested, a full CRUD round-trip re-verified). No
   RLS changes made or planned — service-role bypasses RLS by design, and real RLS
   would need Supabase Auth + a user identity column, which isn't part of this
   single-user architecture.
3. ~~**Habit + task completion history, and analytics on top**~~ — done and tested
   2026-08-23 (see the RESOLVED note in the `habits` table section above, including
   a UTC/local timezone bug that was caught and fixed during testing, not after).
   `habit_completions` table (`habit_id`, `completed_at` timestamp; one row per
   completed day, inserted on check, deleted on uncheck) answers "what time of day
   do I tend to complete habits" — the `completed_date` column only ever knew
   whether, never when. `tasks.completed_at` set on archive / cleared on restore.
   Backend analytics endpoints (`GET /api/analytics/habits`,
   `GET /api/analytics/correlation`): hardest-to-keep habits, time-of-day-completed
   patterns, day-by-day habit-vs-task completion correlation — verified against
   hand-checked seeded data, not just "the request succeeds." Data infrastructure
   for AI insights later, not a display feature — self-contained, no external APIs,
   no frontend UI yet by design.
4. **Claude API bridge, in two steps:**
   - ~~**4a.**~~ BRAIN entity briefings + JOURNAL AI summaries made real — done and
     tested 2026-08-23 (see "What's real vs. still mock" above for the full writeup,
     including a real bug found and fixed during testing: adaptive thinking on Claude
     Opus 5 occasionally consumed the whole token budget on a too-small `max_tokens`,
     truncating or emptying the visible response). Shipped as two shared modules,
     not per-feature one-offs: `lib/anthropic.js` (the API client + `askClaude()`) and
     `lib/context.js` (fetch-and-format Supabase data into a prompt) — later phases
     that need Claude (4b, 5) extend `context.js` with new context-builder functions
     rather than duplicating fetch logic per feature.
   - ~~**4b.**~~ AI-driven task capture in CRM — done and tested 2026-08-23 (see
     "What's real vs. still mock" above, including a real misclassification bug
     found and fixed during testing). `POST /api/tasks/parse` (freeform text →
     structured title/entity/timeframe/is_key, via a Zod schema so the response
     is validated, not hand-parsed) feeds the *existing* manual add row instead
     of a separate review UI. This was the decision going in: parsed tasks go
     through a **review step before creation, not auto-created** — a mis-filed
     task costs more to notice than a mediocre AI paragraph costs to reread —
     and reusing the manual add row satisfies that for free (the user sees
     and can edit every field before hitting the same ADD button that was
     already there) while staying trivially removable later, since there's no
     separate review UI to strip out if the parsing is ever trusted enough to
     auto-create. No dedicated voice/mic feature was needed — the capture
     input is a normal text field, as decided going in.
5. ~~**Journal as a real insight source**~~ — done and tested 2026-08-25.
   `POST /api/journal/:id/extract` reads mood (1-5) + 2-4 theme tags out of an entry's
   raw text via `askClaudeStructured()`, auto-triggered right after creation (not
   synchronous inside the create route — a design call made after a second review pass
   flagged that blocking journal saves on a Claude call could look identical to this
   app's known "new row doesn't appear until reload" quirk). `lib/context.js`'s new
   `getCorrelationData(days)` extends step 3's day-by-day habit/task bucketing with
   journal mood, joined on the new `entry_date` column — used by both the existing
   `GET /api/analytics/correlation` (now returns `mood` per day) and a new
   `POST /api/analytics/insight` (feeds that data to Claude for a short plain-English
   pattern callout, explicitly told not to invent a pattern if there isn't one). The
   insight paragraph is deliberately NOT persisted, same reasoning as BRAIN's entity
   briefing — no natural row to attach a rolling-window summary to. New JOURNAL tab view
   mode, **INSIGHTS**: a day-by-day list (habit rate, tasks done, mood emoji) plus a
   GENERATE button for the insight paragraph. This is the concrete "didn't finish
   habits → didn't finish tasks" example from the original roadmap ask — verified for
   real: seeded 4 days with a deliberate great→good→rough→bad habit/mood pattern, the
   correlation endpoint merged mood onto exactly the right dates (hand-checked), and the
   generated insight correctly identified and quantified the pattern, plus added an
   unprompted, correct caveat about causation direction and untracked days — not a
   generic-sounding paragraph. All seeded data deleted afterward, confirmed via a fresh
   fetch that real data was untouched.
6. ~~**Google Calendar integration**~~ — done and tested 2026-08-25, real events
   confirmed rendering on HOME (see "What's real vs. still mock" above for the full
   writeup, including two real bugs found and fixed: a dev-server-proxy navigation
   bug, and events only being pulled from the empty primary calendar instead of
   Elo's actual checked calendars). Tokens stored in a new general-purpose
   `integrations` table (`provider`, `access_token`, `refresh_token`, `expires_at`,
   `config` — reused for Telegram in step 7, instead of a bespoke table per
   integration). Scope narrowed to `calendar.readonly` — the only thing built so far
   is *showing* real events on HOME, not creating them. V1 skips the
   `syncToken`-based incremental sync originally planned here: HOME only ever needs
   today's events, live-fetched and polled every 90s (the "1–2 minutes" cadence from
   this line's original decision), so there's no local table to keep in sync yet and
   nothing to gain from one until something else (analytics, calendar history)
   actually needs it — revisit `syncToken` at that point, it's still the right
   mechanism, just not needed yet. Push notifications were already ruled out for the
   same reason as before: Google Calendar push needs a public HTTPS endpoint, which
   localhost doesn't have — revisit once this app is deployed publicly (step 8), same
   as originally planned.
7. **Telegram bot** — thin client: calls the *same* Express API routes the React app
   calls, never talks to Supabase directly (so logic isn't duplicated across two
   clients); reuses step 4b's natural-language task parsing instead of reimplementing
   it; answers questions using step 3/5's analytics and insights so responses are
   actually informed by real logged data, not generic. Stores its own config in the same
   `integrations` table as Calendar. Sequenced late because it's an integration layer
   consuming capabilities built in earlier steps, not new capability on its own.
8. **Deploy publicly** (Vercel + Railway or similar) — the security foundation from step
   2 is already in place by this point, which is exactly the right precondition.
9. **Finance** (last, deliberately — most complex, most sensitive data) — live data from
   multiple financial/investment accounts, feeding both the existing (currently
   hardcoded) Finance Pulse widget on HOME and a full Finance tab that doesn't exist yet.
   By this point the OAuth/token-storage pattern will already exist once (Calendar), and
   the event-log pattern for historical data will already exist twice (habits, tasks) —
   transactions are inherently a log, so this reuses proven patterns instead of
   inventing its own. Also, correctly, lands on the most mature version of the security
   foundation, which matters a lot once real financial data is involved. If the fake
   Finance Pulse numbers are annoying before the real integration lands, a cheap
   manual-entry stopgap (same spirit as how `profile`/`habit_streak` started as
   localStorage stopgaps) is a reasonable aside, not a sequencing change.
10. Build out the HEALTH tab (currently a "coming soon" placeholder) — not yet
    sequenced; revisit once the above is solid.

**Cross-cutting note for every step above:** manual DDL is a recurring cost, not a
one-time one — Claude cannot run schema changes with the credentials this project uses
(see PENDING MIGRATION notes above), so each step will need its own trip to the Supabase
SQL editor. Batch each step's migration into one SQL block (as already done for
`habit_streak`/`profile`) rather than several one-off ALTERs.
