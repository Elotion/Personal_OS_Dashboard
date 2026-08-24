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

**Verified working, not just assumed:**
- Full end-to-end CRUD re-test after the service-role key swap (every route).
- Analytics endpoints checked against 6 days of seeded, hand-calculated data across 3
  habits + 2 tasks — every completion rate, ranking, and correlation bucket matched by
  hand. All seeded test data was deleted/restored afterward; confirmed via a fresh
  browser reload that real data (6 habits, 2 tasks, 1-day streak) was untouched.
- Timezone fix re-verified live (re-toggled a habit, `avg_completion_hour` came back
  correct) before being called done.

**Git:** HEAD is `7b39e92` ("Phase 2 tested + a real timezone bug found and fixed").
Working tree clean, no uncommitted changes.

**Not started:** Phase 3 (Claude API bridge) — see roadmap step 4 below. Start with 4a
(BRAIN entity briefings + JOURNAL AI summaries — both already-built UI wired to fake
`setTimeout` placeholders, structurally the same problem: read existing data → one
summarization prompt via a new Express→Anthropic helper → display text). 4b (AI task
capture in CRM, with a review-step-before-create) is a harder follow-on, not to be
started until 4a is built and tested. Needs an Anthropic API key added to `.env` first.

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
```
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
  created_at TIMESTAMP DEFAULT NOW()
);
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

**Still fake, not wired to anything real:**
- AI entity briefings (BRAIN) and journal summaries (JOURNAL) — both `setTimeout`
  placeholders standing in for real Claude API calls (see roadmap below).
- Calendar events on HOME — the day cells and week navigation are real, but the events
  list itself is still the hardcoded `EVENTS_TODAY` demo data, only ever shown for the
  actual current day.

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
   - **4a.** BRAIN entity briefings + JOURNAL AI summaries made real — both are already
     built UI wired to fake `setTimeout` placeholders, and structurally the same problem
     (read data → one summarization prompt → display text). One small Express→Anthropic
     helper ships both.
   - **4b.** AI-driven task capture in CRM, as its own follow-on using the same helper —
     a harder problem than 4a (freeform text → structured extraction of title / entity /
     timeframe → a *write* into `tasks`, with real failure modes). Decided: parsed tasks
     go through a **review step before creation, not auto-created** — a mis-filed task
     costs more to notice than a mediocre AI paragraph costs to reread. Build this so the
     review step is easy to remove later once the parsing is trusted, rather than deeply
     baked into the flow — revisit removing it once trust is established, but no setting
     or toggle for this needed now. No dedicated voice/mic feature either — the capture
     input just needs to be a normal, well-behaved text field; voice comes from OS-level
     dictation (macOS built-in / Whisper Flow) typing into it, not something this app
     needs to build.
5. **Journal as a real insight source** — use the Claude bridge from step 4 to extract
   structured signal (mood, themes) from raw journal text at save time, then build the
   actual cross-domain correlation view using step 3's habit/task history + this new
   journal signal. This is the concrete "didn't finish habits → didn't finish tasks"
   example, now buildable because the underlying data is finally rich enough. Depends on
   3 and 4 both existing — building it earlier would mean building it twice.
6. **Google Calendar integration** — OAuth flow; tokens stored in one new general-purpose
   `integrations` table (`provider`, `access_token`, `refresh_token`, `expires_at`,
   `config` — reused for Telegram in step 7, instead of a bespoke table per integration).
   Sync uses Google's `syncToken`-based incremental fetch (the real mechanism either
   way), driven by **polling every 1–2 minutes** — decided against a tunnel (ngrok/
   Cloudflare) for true push notifications for now. Google Calendar push requires a
   public HTTPS endpoint verified by Google, which a tunnel can provide today but with
   its own upkeep (channels expire every 7 days, need renewal) — revisit true push once
   this app is deployed publicly anyway (see step 8), since a tunnel becomes unnecessary
   at that point and push becomes the natural default, not an extra moving part.
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
