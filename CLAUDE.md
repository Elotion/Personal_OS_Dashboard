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

## Data note (2026-08-25): everything logged before tonight is test data
Every habit completion, task, and nutrition entry logged up through 2026-08-25 was
created while building/testing this app (development seeding, feature verification,
etc.) — Elo's real day-to-day usage of this dashboard starts tonight (2026-08-25
evening / 2026-08-26). **Do not treat pre-2026-08-26 history as a real behavioral
pattern** in any AI-driven feature that reads historical data (BRAIN entity
briefings, JOURNAL/HEALTH insights, `/api/analytics/*`) — a low habit-completion
rate or sparse task history from this period reflects testing, not Elo's actual
habits. Elo explicitly asked NOT to have this data bulk-deleted (his request walked
back from "reset all logged data" to just "acknowledge that the past data...is not
relevant" mid-message) — so the historical rows are still in Supabase, untouched;
this is a framing note for interpretation, not a migration or cleanup that happened.
If Elo asks for an actual purge later, that's a real destructive action (irreversible
deletes across `habit_completions`, `tasks`, `nutrition_log`, etc.) and needs his
explicit go-ahead at that time, not an assumption that this note already covers it.

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
- **Push to GitHub after committing** (added 2026-08-25, once the remote
  `origin` — `github.com/Elotion/Personal_OS_Dashboard` — actually existed).
  A local-only commit isn't a real backup if this Mac is what's lost; `git
  push` after every commit is what makes GitHub the actual disaster-recovery
  copy Elo asked for, not just a one-time snapshot from the day it was set
  up. `.env` is still deliberately never pushed (gitignored, holds real
  secrets) — Elo keeps his own copy of those values separately.

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
│   ├── google.js             # Google OAuth2 client + Calendar API (Phase 6)
│   └── telegram.js           # Telegram bot (Phase 7) -- long-polling, calls the Express API
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
TELEGRAM_BOT_TOKEN=<from @BotFather on Telegram, /newbot -- server-side only>
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
`TELEGRAM_BOT_TOKEN` powers Phase 7's bot (`lib/telegram.js`) -- added 2026-08-25. No app
review or scopes to configure, unlike Google -- created via Telegram's own @BotFather
(`/newbot`), which hands back a token immediately. The bot (`@ZeusExecBot`) runs inside the
same backend process (started from `server.js`'s `app.listen()` callback) via long-polling,
not a webhook -- same reasoning as Calendar: no public HTTPS endpoint on localhost yet.
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
  created_at TIMESTAMP DEFAULT NOW(),
  notes TEXT   -- confirmed live 2026-08-25, BRAIN's per-entity NOTES textarea, autosaved
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

-- RESOLVED 2026-08-25: habit_subtasks -- an OPTIONAL per-habit checklist.
-- Elo's own words: "in the morning, I can create subtasks of brushing my
-- teeth, morning yoga, breakfast... it is only if you click all of the
-- sub-tasks then you complete that habit." A habit with zero sub-tasks
-- behaves exactly as it always has (direct checkbox toggle) -- this is
-- additive, not a replacement for the simple case.
--   CREATE TABLE habit_subtasks (
--     id SERIAL PRIMARY KEY,
--     habit_id INTEGER REFERENCES habits(id) ON DELETE CASCADE,
--     label TEXT NOT NULL,
--     sort_order INTEGER DEFAULT 0,
--     completed_date DATE,
--     completed_at TIMESTAMP,
--     created_at TIMESTAMP DEFAULT NOW()
--   );
--   ALTER TABLE habit_subtasks ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "Enable all for public" ON habit_subtasks FOR ALL USING (true) WITH CHECK (true);
--
-- completed_date mirrors habits' own column (the day-level "done today"
-- gate). completed_at is a real timestamp, set alongside it and cleared on
-- uncheck -- captured deliberately, not just a boolean, per a separate
-- request from Elo the same day that as much of his input as possible
-- should land in Supabase with real timestamps ("these small data can be
-- overlooked... patterns recognition benefits in the future" -- see the
-- standing memory on this). GET /api/habits now embeds
-- `habit_subtasks(*)` via Supabase's relationship-based select
-- (`select('*, entities(name,icon), habit_subtasks(*)')`) rather than a
-- second round-trip -- one request still returns everything the frontend
-- needs, same as before this feature.
--
-- Server-side cascade (server.js, PUT /api/habit-subtasks/:id): toggling a
-- sub-task re-checks the FULL set for that habit and flips the parent's own
-- completed_date/completed_today to match "are ALL sub-tasks done today,"
-- through the exact same logHabitCompletion() a direct habit toggle uses
-- (extracted into a shared function specifically so the two paths can't
-- drift out of sync) -- so streak count and /api/analytics/habits stay
-- correct whether a habit was completed directly or by finishing its last
-- sub-task. Frontend (App.js's toggleSubtask) mirrors this same "all done?"
-- check optimistically for an instant UI update, same "optimistic UI,
-- fire-and-forget writes" pattern as everywhere else in this app.
--
-- UI: the 3-column habit grid can't cleanly expand a single cell downward
-- without breaking the grid for its neighbors, so a habit with sub-tasks
-- renders its checklist as a full-width block below the WHOLE grid when
-- expanded (`expandedHabitId` in App.js, part of the persisted UI-state
-- blob), not nested in its own tile. Clicking a tile that has sub-tasks
-- toggles this expand instead of completing it directly -- the checkbox
-- for such a tile is purely a derived display of "all done," matching
-- Elo's stated rule. Sub-tasks are added/removed from the same
-- habit-edit (pencil) panel that already existed for renaming/
-- recategorizing a habit, not a separate UI.
--
-- REAL BUG found and fixed during testing: the "+"/"✕" buttons inside the
-- sub-task editor are plain clickable divs (not native buttons/inputs).
-- Clicking one moved focus away from the sub-task label INPUT, which
-- triggered the surrounding row's existing onBlur guard (there to save-
-- and-close when focus leaves the row entirely) -- so clicking "add" closed
-- the whole edit panel before the click could reliably register, some-
-- times silently dropping the sub-task. Reproduced directly: typed "morning
-- yoga," clicked +, and confirmed via a fresh GET that only the earlier
-- "brush teeth" sub-task existed. Fixed with the standard technique for
-- exactly this class of bug -- `onMouseDown={(e) => e.preventDefault()}`
-- on the button, which stops the browser from blurring the focused input
-- in the first place, rather than trying to out-guess relatedTarget
-- semantics. Applied to both new sub-task buttons and, for the same
-- underlying risk, the pre-existing per-habit edit/delete buttons in that
-- same row. Re-verified afterward via direct DOM inspection (not just a
-- screenshot) that the edit panel stayed open and the sub-task actually
-- landed in a fresh GET.
--
-- Full cascade verified live, both directions: expanded a real habit's
-- checklist, checked both sub-tasks, watched the tile flip to done and the
-- daily score update, confirmed via GET /api/analytics/habits that a real
-- completion was logged (avg_completion_hour matched the actual clock
-- time); unchecked one sub-task, watched the tile immediately revert and
-- the daily score drop back, confirmed the completions record was removed
-- again. All test sub-tasks deleted afterward, confirmed via a fresh GET
-- that real habits were left untouched.

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
  created_at TIMESTAMP DEFAULT NOW(),   -- DEFAULT no longer relied on, see note below
  fiber INTEGER,   -- confirmed live 2026-08-25, see RESOLVED note near sleep_log below
  sugar INTEGER    -- same migration -- NOT sodium, see that note for why
);
-- RESOLVED 2026-08-25 (same day, follow-up): POST /api/nutrition now writes
-- created_at explicitly via localTimestampStr(), instead of relying on this
-- column's own DEFAULT NOW() -- that evaluates on the database server (UTC)
-- into a timezone-naive column, the same bug class already fixed multiple
-- times elsewhere in this app. Caught proactively, before it ever produced a
-- visibly wrong time: created_at had never been displayed anywhere, but
-- HOME's redesigned NUTRITION card (below) was about to start showing it as
-- "what time did I log this meal," which would have surfaced the bug
-- immediately. Verified directly: logged a real meal at 16:31 local, curl-
-- confirmed created_at stored "16:31", not a UTC-shifted value.

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

-- RESOLVED 2026-08-25 (Phase 6 -- Google Calendar integration, later reused by
-- Phase 7's Telegram bot): integrations table confirmed live and working --
-- real OAuth round-trip completed, real tokens stored/refreshed, real
-- Telegram chat_id stored in config. This note used to say PENDING; that had
-- gone stale (the migration ran and both Phase 6 and 7 were verified done
-- days ago) without this note being updated to match -- exactly the kind of
-- drift the "keep this file current" process rule exists to catch.
--   CREATE TABLE integrations (
--     id SERIAL PRIMARY KEY,
--     provider TEXT NOT NULL UNIQUE,   -- 'google_calendar', 'telegram' -- both live
--     access_token TEXT,
--     refresh_token TEXT,
--     expires_at TIMESTAMP,
--     config JSONB,                    -- 'telegram' row stores {chat_id}; 'google_calendar'
--                                       -- row stores {hidden_calendar_ids}
--     created_at TIMESTAMP DEFAULT NOW(),
--     updated_at TIMESTAMP DEFAULT NOW()
--   );
--   ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "Enable all for public" ON integrations FOR ALL USING (true) WITH CHECK (true);
--
-- One general-purpose table, not a google_calendar-specific one -- `provider`
-- distinguishes rows, so Telegram (Phase 7) reused it instead of getting its
-- own bespoke table. `lib/google.js` reads/writes this via
-- `getAuthorizedClient()`/`saveTokens()`; the googleapis client auto-refreshes
-- an expired access_token using the refresh_token and fires a 'tokens' event
-- with the new one, which is what triggers the re-save -- without that listener
-- a refreshed token would only ever live in memory for one request.

-- RESOLVED 2026-08-25 (Phase 10 -- HEALTH tab, sleep tracking): sleep_log
-- confirmed live -- curl round-trip (POST then GET then DELETE) succeeded
-- immediately after Elo ran this in the Supabase SQL editor, test row cleaned
-- up afterward. GET/POST/DELETE /api/sleep no longer 404 -- the pre-migration
-- graceful-degradation path (404 cleanly, HealthTab's SLEEP card shows "No
-- sleep logged yet", add-sleep form silently no-ops) is now dead code path,
-- kept as-is since it's harmless and matches the same tolerance pattern used
-- elsewhere in this app (habit_streak/profile before their migrations ran).
--   CREATE TABLE sleep_log (
--     id SERIAL PRIMARY KEY,
--     hours NUMERIC(3,1) NOT NULL,
--     quality INTEGER,          -- 1-5, optional -- matches journal's mood scale convention
--     logged_date DATE NOT NULL,
--     created_at TIMESTAMP DEFAULT NOW()
--   );
--   ALTER TABLE sleep_log ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "Enable all for public" ON sleep_log FOR ALL USING (true) WITH CHECK (true);
--
-- logged_date is a plain DATE, written as a 'YYYY-MM-DD' string from
-- localDateStr() client- and server-side, same discipline as nutrition_log's
-- logged_date and journal_entries.entry_date -- never routed through a bare
-- `new Date()` on either end, to avoid reintroducing the UTC-vs-local bug
-- class already fixed multiple times elsewhere in this app.

-- RESOLVED 2026-08-25 (same day, follow-up): manual hours entry replaced with
-- a bed/wake CLICK flow at Elo's explicit request ("I don't have to manually
-- put how many hours I do, and you can calculate that for me"). hours is now
-- always server-computed from two real timestamps, never typed in.
--   CREATE TABLE sleep_pending (
--     id SERIAL PRIMARY KEY,
--     bed_time TIMESTAMP
--   );
--   INSERT INTO sleep_pending (id, bed_time) VALUES (1, NULL);
--   ALTER TABLE sleep_pending ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "Enable all for public" ON sleep_pending FOR ALL USING (true) WITH CHECK (true);
--   ALTER TABLE sleep_log ADD COLUMN bed_time TIMESTAMP;
--   ALTER TABLE sleep_log ADD COLUMN wake_time TIMESTAMP;
--
-- sleep_pending is a singleton row (id=1, same pattern as habit_streak/
-- profile) holding the in-progress night's bed_time, or NULL when not
-- currently "in bed" -- deliberately NOT a nullable row in sleep_log itself,
-- so every row that ever lands in sleep_log stays a complete, valid record
-- (no query anywhere needs to filter out half-finished nights).
-- POST /api/sleep/bedtime upserts sleep_pending.bed_time = now (clicking it
-- again just resets the timestamp -- handles "oops, too early" for free).
-- POST /api/sleep/wake reads sleep_pending, 400s if there's no bed_time set,
-- otherwise computes hours = (now - bed_time) / 3600 rounded to 1 decimal,
-- inserts the completed sleep_log row, and clears sleep_pending back to NULL.
-- Verified live: curl round-trip (bedtime -> wait -> wake) produced the
-- correct elapsed hours, and a full browser pass confirmed the SLEEP card
-- flips between "WENT TO BED" and "In bed since {time}" / "WOKE UP" correctly,
-- with the quality emoji picker shown at wake-time (matching journal's mood
-- scale, since "how do you feel about your sleep" makes more sense to ask on
-- waking than at bedtime). Test entry deleted afterward.
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
  Macros are real AI estimates (`POST /api/nutrition/estimate`, Claude via
  `askClaudeStructured()`) as of the HEALTH tab work (2026-08-25) -- previously this
  silently saved the same hardcoded `250/12/20/8` for every meal regardless of what
  was typed, which is what this line used to (incorrectly) not mention. See the
  HEALTH tab entry further down for the full writeup.
- Journal entries — add, edit the raw text, delete. **Correction:** this line used to
  say the "AI RECAP" GENERATE button was still a fake `setTimeout` placeholder --
  that became stale the moment Phase 3a shipped (2026-08-23) and was never fixed here
  until now, exactly the kind of drift the "keep this file current" process rule
  exists to catch. It's real: GENERATE calls `POST /api/journal/:id/summary` (Claude,
  via `lib/anthropic.js`) and persists the result to `journal_entries.recap`. See the
  Phase 3a writeup further down for the full detail, including a real bug found and
  fixed during that work.
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
  (Authorization Code flow, `googleapis`) and `listEventsForDate(dateStr)` against
  the real Calendar API. `EVENTS_TODAY`'s hardcoded array is gone -- HOME's
  CALENDAR card calls `GET /api/calendar/events?date=YYYY-MM-DD` (polled every 90s
  for whichever day is currently selected, matching the roadmap's "1-2 minutes"
  decision) and shows a CONNECT GOOGLE CALENDAR button when nothing's authorized
  yet. Read-only scope only (`calendar.readonly`) -- nothing today needs the
  dashboard to create events. Deliberately NOT syncing to a local table yet --
  there's nothing to gain from persisting a copy until something else (analytics,
  history) actually needs calendar data at rest; the roadmap's `syncToken`-based
  incremental sync becomes worth building at that point, not before.
  Originally only fetched *today* -- Elo pointed out he couldn't browse forward to
  see future events (his class schedule, upcoming birthdays) even though HOME's
  week strip already let him click other days. Fixed by threading the actually
  selected date (`selectedCalendarDateStr()` in `App.js`, mirroring the
  week-offset/day-index math `HomeTab.js` already does for rendering) through to
  the fetch -- `refreshCalendarEvents` now re-fetches whenever the selected
  day/week changes, not just on a timer. Verified live: navigated to Sep 21, 2026
  in the browser and got back Elo's real class schedule for that day (matches the
  screenshot he'd shared exactly), confirming both this fix and that the
  Sep-vs-Aug date-misread from earlier never affected the underlying data -- once
  actually viewing the right day, it was correct the whole time.
  **Real bugs found and fixed during testing:**
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
  4. `integrations.expires_at` is a plain `TIMESTAMP` (no timezone) column --
     `saveTokens()` always writes it via `.toISOString()` (an absolute UTC
     instant), but Postgres drops the `Z` on the way into a timezone-naive
     column. Reading it back with a bare `new Date(str)` parsed those
     wall-clock numbers as LOCAL time instead of UTC -- the exact same class
     of bug already fixed for `habit_completions`/`tasks.completed_at`, just
     via a different code path -- silently making a token look like it
     expires ~7 hours later than it really does. Found this the boring way:
     `GET /api/calendar/events` started returning a real 401 from Google
     mid-session, because the client believed a genuinely-expired token was
     still valid and never proactively refreshed it before use. Fixed with
     a `parseStoredUtcTimestamp()` helper that restores the `Z` before
     parsing (no migration needed -- the stored value was always correct,
     only the read-side parsing was wrong). Re-verified directly: forced a
     refresh, confirmed the newly-stored `expires_at` landed ~59 minutes
     ahead of actual server time (matching Google's real access-token
     lifetime), not 7 hours off.
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
- Telegram bot (Phase 7) -- done and tested 2026-08-25, real message round-trip
  confirmed by Elo. `lib/telegram.js`, running
  via `telegraf` (long-polling, started from `server.js`). A genuinely thin
  client -- every handler calls the same Express routes the React app calls
  (`/api/tasks/parse`, `/api/tasks`, `/api/entities`, `/api/habits`,
  `/api/calendar/events`, `/api/analytics/insight`), never touches Supabase or
  `lib/anthropic.js` directly, so there's exactly one place task-parsing and
  insight logic live. `/start` claims the sending chat as the single
  authorized user (stored in `integrations`, `provider: 'telegram'`,
  `config.chat_id`) -- every other chat gets ignored, cheap insurance in case
  the bot's username ever leaks. Freeform text -> `POST /api/tasks/parse` ->
  an inline Confirm/Cancel card, same review-before-creation rule as CRM's AI
  ADD, nothing auto-created. `/today` (key tasks + habit completion + today's
  calendar events) and `/insight` (the same cross-domain pattern callout
  JOURNAL's INSIGHTS tab uses) round out v1.
  **Real bug hit while building this (unrelated to Telegram itself):**
  `node-telegram-bot-api`, the library originally planned for this, turned
  out to have been rewritten into an incompatible v2+ API with no stable 0.x
  version published under the name anymore -- `new TelegramBot(...)` failed
  with `TypeError: TelegramBot is not a constructor`. Switched to `telegraf`
  (a well-established, actively maintained alternative) instead of fighting
  an unfamiliar rewritten API. Also surfaced (see the RESOLVED note on
  `integrations.expires_at` above) a real Google-token timezone bug during
  the regression pass after this switch -- unrelated to Telegram, just found
  while testing alongside it.
  **Verified end-to-end:** Elo tested the real flow from his own Telegram
  account -- `/start` connected the chat, a freeform task message came back
  as a Confirm/Cancel card and created correctly on Confirm, `/today` and
  `/insight` both replied with real data. Voice-note input (transcribing
  mumbled/mispronounced speech via Whisper before parsing) was discussed as
  a follow-on but deliberately deferred for now -- Elo asked to hold off
  rather than add a new external API (OpenAI) and credential at this point;
  revisit whenever that's actually wanted, nothing else depends on it.
- HEALTH tab (Phase 10) — backend done and tested, frontend built and verified live
  in the browser, 2026-08-25. Scope came directly from Elo: sleep tracking, real AI
  calorie/macro estimation on the existing HOME nutrition log (previously fake, see
  the correction on the Nutrition log line above), and a HEALTH-tab dashboard
  (sleep trend, calorie trend, HEALTH-entity habit completion, day-by-day table)
  with an on-demand AI insight generator, reusing the exact `getCorrelationData`-style
  shared-context pattern from Phase 5 (`getHealthContext(days)` in `lib/context.js`,
  feeds both `GET /api/health/data` and `POST /api/health/insight` so they can't
  drift apart). New `POST /api/nutrition/estimate` route (Claude via
  `askClaudeStructured()`, same Zod-schema pattern as CRM task parsing and journal
  mood extraction) replaces the old hardcoded macros in `App.js`'s `addFood()` --
  every meal now gets a real per-food estimate instead of the same fake numbers.
  `sleep_log` table migration confirmed run and live 2026-08-25 (see the RESOLVED
  note in the schema section above) -- sleep logging is fully real now, not just
  gracefully degrading; verified with a real curl round-trip immediately after Elo
  ran the migration, test row cleaned up afterward.
  **Two real timezone bugs found and fixed in the existing nutrition routes while
  building this** (the same UTC-vs-local bug class already hit and fixed at least
  three times before elsewhere in this app): `GET /api/nutrition`'s "today" was
  computed via `new Date().toISOString().slice(0,10)` (UTC, drifts a day off part of
  the evening in a negative-UTC-offset timezone); `POST /api/nutrition` never sent
  `logged_date` at all, silently relying on the database's `DEFAULT CURRENT_DATE`,
  which evaluates in the database server's own timezone, not the user's. Both fixed
  using `localDateStr(new Date())` explicitly, matching this project's established
  convention -- neither bug was reported by Elo, both were caught by re-reading the
  existing routes while wiring in the new sleep/estimate code, before they caused a
  visible symptom.
  **Verified, not just "it compiles":** curl-tested `POST /api/nutrition/estimate`
  against real food descriptions before wiring it into the UI (returned sensible,
  distinct numbers per food, not a repeated fake constant); curl-tested
  `GET /api/sleep`/`POST /api/sleep` 404ing cleanly pre-migration; curl-tested
  `GET /api/health/data` returning correct real nutrition numbers merged with
  correctly-null sleep data and the correct HEALTH habit count (4). Then a full
  browser pass: logged a real meal ("grilled chicken breast with rice") through
  HOME's existing nutrition input and watched the real AI estimate (480 kcal / 45g
  protein / 50g carbs / 10g fat) render, distinct from the old constant; opened
  HEALTH and confirmed the sparkline/day-by-day picked up that same real entry;
  submitted the sleep form and confirmed it degraded gracefully (cleared, no crash)
  given the pending migration; hit GENERATE on the health insight and got back a
  genuinely data-aware response -- correctly said there was no real pattern yet
  given only 2 days of (test) calorie data and zero sleep data, and correctly
  recommended more consistent tracking rather than inventing a pattern. Test
  nutrition entry deleted afterward, confirmed via a fresh `GET /api/nutrition`
  that real data was left untouched (empty, as it should be pre-this-session).
  **Same-day follow-up (2026-08-25), four changes Elo asked for after using it:**
  1. Sleep is now a bed/wake CLICK flow, not manual hours entry -- see the
     RESOLVED note in the schema section above for the full `sleep_pending`
     design. Shows a single "🛏️ WENT TO BED" button when not in bed, or
     "😴 In bed since {time}" + the quality emoji picker + "☀️ WOKE UP" when
     pending.
  2. Both AI insight generators (HEALTH and JOURNAL's INSIGHTS view) had their
     fixed 14-day window replaced with a 7/14/30/60/90-day picker -- Elo felt
     locked into "very stagnant" fixed 14-day data. Changing the range
     re-fetches the day-by-day list immediately; GENERATE always uses whatever
     range is currently selected. No backend change was needed for this --
     `getCorrelationData`/`getHealthContext` already accepted an arbitrary
     `days` param (clamped 1-90), only the frontend was hardcoding `?days=14`.
  3. Nutrition estimation extended to fiber and sugar (`POST
     /api/nutrition/estimate`), shown in HOME's nutrition summary line.
     Deliberately NOT sodium -- Elo pointed out sodium is driven almost
     entirely by unseen seasoning/salt choices, not the food itself, so an
     estimate from a text description would be a guess dressed up as data;
     fiber/sugar are genuine properties of the food and stayed in.
  4a. **Bug found and fixed via Elo's own testing:** a second bed/wake CLICK
     cycle on the same calendar day created a SECOND sleep_log row instead of
     replacing the day's entry -- Elo caught this immediately ("they just
     create another section... I'm not gonna sleep two times in a row").
     Root cause: `POST /api/sleep/wake` always did a plain INSERT. Fixed by
     checking for an existing `sleep_log` row on today's `logged_date` first
     and UPDATEing it in place instead of inserting a duplicate when one
     exists -- no schema change/migration needed, purely an app-logic fix
     (`server.js`). Frontend's `wakeUp()` updated to match: it now dedupes
     `sleepLog` by `date` before prepending the fresh row, instead of always
     prepending (which would've left a stale duplicate in local state even
     with the backend fixed). Verified directly: two full bed->wake cycles on
     the same day via curl AND via real browser clicks both landed on the
     same row id, with the second cycle's quality overwriting the first's --
     confirmed via the actual displayed emoji changing (😄 quality 5 ->
     😕 quality 2) while the entry count stayed at exactly one. Test data
     (4 stray rows Elo's own testing had created, all same-day) cleaned up
     directly afterward.
  4b. **Same-day second follow-up:** moved the bed/wake buttons (plus the
     quality picker and a 3-most-recent-nights list) from HEALTH onto HOME,
     directly under NUTRITION in the right column -- same layout pattern as
     NUTRITION itself (a short list + an inline action row), not a separate
     view. HealthTab lost the button/list entirely and is now pure visual
     data + on-demand insight generation, per Elo: "the health page should be
     just visual data where I can see and generate insight." `sleepLog`/
     `sleepPending`/`goToBed`/`wakeUp`/`deleteSleep` are now `HomeTab` props,
     not `HealthTab` props -- `HealthTab` only receives `healthData` (the
     aggregated trend/day-by-day feed) and the insight-generation props.
  All four verified live in the browser (not just curl): the bed/wake flow
  end-to-end from its new spot on HOME (button flips, quality picker appears,
  hours computed correctly, log entry appears in HOME's SLEEP card, HEALTH's
  sparkline/day-by-day picked up the same entry, test entry deleted after);
  confirmed HEALTH renders with zero interactive logging controls, just the
  three visual cards + GENERATE; the range picker actually re-fetching
  (`GET /api/health/data?days=60` confirmed firing on click, same for
  JOURNAL's INSIGHTS view); a real "greek yogurt with berries and granola"
  estimate returning distinct fiber/sugar numbers (4g fiber / 24g sugar), not
  a repeated constant.
  **Follow-up (2026-08-25, later same day):** Elo asked HEALTH to actually show
  the full macro breakdown (protein/carbs/fat/fiber/sugar, not just kcal) and
  "utilize the space" with recommendation-style data, then asked for that as
  real graphs, then asked for those graphs to follow the existing range picker
  automatically. All three landed in one pass, since `getHealthContext` already
  returned every macro per day (`lib/context.js`) -- this was a display gap, not
  a data gap, no backend changes needed. `HealthTab.js`:
  - The old sparse "CALORIES" card became "NUTRITION": kept its kcal number +
    trend sparkline, added a "TODAY'S MACROS" bar-per-macro section (new
    `MacroBar` component) comparing today's protein/carbs/fat/fiber/sugar
    against the standard US nutrition-label %DV reference for a 2,000-kcal
    diet (`MACRO_REFERENCE` -- labeled in the UI as a general reference, not
    personalized advice), and a "MACRO TRENDS" section (new `MacroTrend`
    component) with one small sparkline per macro across the selected range --
    reuses the same `Sparkline`/`buildSparkline` machinery SLEEP and kcal
    already used, just parameterized with a `height` prop for the smaller
    size. Since all of these read from the same `healthData` prop the range
    picker already drives, "update automatically with the range" needed zero
    extra wiring -- confirmed live by switching to 7D and watching both the
    label and a fresh `GET /api/health/data?days=7` fire immediately.
  - HEALTH HABITS (previously bolted onto the bottom of the calories card) is
    now its own card, since NUTRITION had gotten too tall to hold it
    comfortably -- three cards in that row now (SLEEP / NUTRITION / HEALTH
    HABITS), NUTRITION given `flex:2` so it gets proportionally more width for
    its extra content.
  - DAY BY DAY's per-row summary extended from `kcal · fiber` to all five
    macros (`kcal · Xg protein · Xg carbs · Xg fat · Xg fiber · Xg sugar`,
    each conditionally shown only when non-zero, matching the existing
    pattern).
  **Real bug hit and fixed during this pass:** the new components used `ref`
  as a prop name for each macro's reference/target value (`<MacroBar ref={m.ref}>`)
  -- `ref` is a reserved JSX prop that React intercepts for actual DOM/component
  refs, not a normal prop, and passing a non-ref value through it threw
  `Function components cannot have string refs` and crashed the whole HEALTH
  tab (blank white error overlay). Caught immediately on the first live check
  (not shipped blind), fixed by renaming the prop to `target` everywhere
  (`MACRO_REFERENCE`'s key, `MacroBar`'s destructured prop, both call sites).
  Re-verified via a **fresh browser tab** specifically -- the first re-check
  after the fix still showed the old error in `read_console_messages`, which
  turned out to be stale buffered console history from before the fix rather
  than a real recurrence; a brand new tab confirmed the console was actually
  clean (only the pre-existing, already-documented `GET /api/profile` 404).
  Worth remembering: don't trust console-error persistence across a same-tab
  reload as proof a fix didn't work -- verify with a fresh tab if the timing
  is ambiguous.
  **Second follow-up (2026-08-25, same day):** Elo asked for real line graphs
  (not tiny sparklines) for both sleep and every nutrient, with boxed,
  bigger-font trend details underneath each one. New shared `MetricGraph`
  component (`HealthTab.js`) replaces the old small `MacroTrend` -- renders a
  label + latest-value header, a full-size line graph (reuses the existing
  `Sparkline`, which gained a `height` prop so it can be sized per use: 90px
  for SLEEP/CALORIES, 64px for the 5 macro trends), and underneath that a
  boxed AVG/MIN/MAX row computed from the same series, in a 3-column grid
  with real dividers (1px gap + matching background color between cells, so
  the divider lines have clean rounded corners instead of individual
  per-cell borders) and much larger stat numbers (19-22px vs. the previous
  9-12px). Used for SLEEP's hours-slept graph, NUTRITION's calories graph,
  and all 5 macro trend graphs -- one consistent treatment everywhere
  instead of one style for sleep/calories and a cramped different one for
  macros. Layout also reshuffled: SLEEP and HEALTH HABITS now share a row
  (SLEEP wider, since it carries the graph), and NUTRITION moved to its own
  full-width row below since it now holds six graphs (calories + 5 macros)
  plus the TODAY'S MACROS reference-bar section -- trying to keep all of
  that in a cramped side-by-side card would've been unreadable. Verified
  live via `get_page_text` (this session's screenshot tool had an unrelated
  scroll/viewport quirk in this specific test -- see below -- so the DOM
  text extraction was used as the more reliable check) that every section
  renders in order with correct real numbers: SLEEP's AVG/MIN/MAX (empty,
  no sleep data logged yet), NUTRITION's CALORIES AVG 1630/MIN 750/MAX 2510,
  and all 5 macros' own AVG/MIN/MAX boxes.
  **Unrelated tooling note, not an app bug:** this session's browser-
  automation `scroll` action stopped visibly moving the page partway through
  verification, and `.elo-scroll`'s own `scrollHeight`/`clientHeight` were
  reported equal (i.e. nothing to scroll internally) even though the content
  was clearly taller than the viewport -- turned out to be a page-level
  scroll (`window.scrollTo`/`document.body.scrollHeight`) that the
  screenshot tool wasn't reflecting in this session, not a real layout bug.
  `get_page_text` sidesteps this entirely since it reads the DOM regardless
  of scroll/viewport state -- worth reaching for that instead of fighting
  the screenshot tool if this recurs.

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
- **"Where was I" survives a refresh (2026-08-25), via one localStorage blob, not per-tab
  URLs/routing.** Elo reported that refreshing on BRAIN (or any non-HOME tab) always
  bounced him back to HOME, then specifically that refreshing mid-edit on an entity's
  NOTES textarea lost his place and his unsaved typing. `App.js`'s `loadUiState()` /
  `UI_STATE_KEY` ('elo-os-ui-state') persist: `activeTab`; CRM's view mode, search text,
  and add-form drafts (including the AI-parse smart-add text); BRAIN's filter and which
  entity panel is open (`selectedEntityId`/`entityDetailOpen`) plus the in-progress
  `entityNotes` draft itself (not just what's made it to the database -- the autosave in
  `updateEntityNotes` debounces 800ms, so this covers the gap a refresh inside that
  window would otherwise fall into); JOURNAL's view mode, search, add-form draft, and
  insight range; HEALTH's insight range; and HOME's habit-manage/calendar-manage panel
  open-state plus add-habit draft. One combined `useEffect` writes the whole blob on any
  tracked change, rather than fifteen separate localStorage keys each with their own
  effect. A second small effect covers one edge this created: JOURNAL's INSIGHTS day-by-
  day data is normally only fetched by the GENERATE-adjacent view-mode button's click
  handler, so a refresh restoring straight into INSIGHTS mode needed its own mount-only
  fetch to avoid landing on the view with no data loaded.
  Deliberately NOT persisted: which EXISTING item (a habit, a goal, a journal entry) is
  mid-edit, or any category-picker/drag/fade/animation state -- those would need
  reconciling against server data that's still loading async at mount, which is far more
  fragile than restoring "which screen/view/panel was open," for much less value. Revisit
  if that specific gap ever gets reported.
  Verified directly, not just "it compiles" -- for both the CRM/JOURNAL view-mode cases
  and the BRAIN case specifically: set `entityDetailOpen`/`selectedEntityId`/`entityNotes`
  in localStorage via the browser console to simulate "was mid-typing an unsaved note,"
  reloaded fresh, and confirmed via direct DOM inspection that the panel opened
  immediately (no slide-in animation needed on a restore) with the exact unsaved draft
  text in the textarea -- the literal scenario Elo described.
- **HOME's NUTRITION and GOALS cards were redesigned (2026-08-25) from a reference
  screenshot Elo shared** (a Claude Design mockup, not this session's own work) --
  he specifically liked that mockup's per-meal time display and asked for the real
  NUTRITION card to be rebuilt toward it, plus separately asked for GOALS to be made
  more visually significant ("something I wanna see every day"), leaving the exact
  visual treatment up to judgment. Implemented within this app's own existing design
  language (oklch glow system, `CARD`/`GLOW_MED`/`GLOW_STRONG`) rather than adopting
  the mockup's different visual style wholesale, which would have looked inconsistent
  against every other card on HOME.
  - NUTRITION: each meal row now shows the time it was logged (24-hour, matching the
    header clock's own convention -- deliberately not the 12-hour format `sleep`'s
    `formatClockTime` uses, those read differently on purpose), plus separate kcal and
    protein badges, under a new "TODAY · N MEAL(S)" label. Time comes from
    `nutrition_log.created_at`, which needed its own fix first -- see the RESOLVED
    note on `nutrition_log` above (it was silently UTC via the column's own
    `DEFAULT NOW()`, caught proactively before this display change would have
    surfaced it as a visibly wrong time).
  - GOALS: now the single most visually prominent card on HOME by design -- a
    persistent slow "breathing" glow (`eloGoalGlow` keyframe, `index.css`, 4.5s cycle,
    deliberately gentle so it reads as ambient emphasis over a full day of the app
    being open, not a flashing alert), a GOLD border on the card, and bigger/bolder
    goal text with a GOLD left-border accent per row. Reuses the exact `GOLD` constant
    already used for key-task stars elsewhere (an app-internal cyan-toned accent, not
    literally gold-colored) -- this app's own established "this matters" visual
    language, not a new one invented for this. One real implementation trap worth
    knowing if this card is touched again: the glow card must NOT carry an inline
    `box-shadow` -- an inline style always wins over a CSS animation targeting the
    same property, which would freeze the glow on a single frame. Verified the
    animation is actually running, not frozen, by sampling `getComputedStyle(...)
    .boxShadow` twice a few seconds apart and confirming the value genuinely changed.
  - **Same-day follow-up:** Elo didn't want the "Add a weekly/monthly goal" input
    permanently visible once goals already exist in that section -- only as an
    inviting first prompt when a section is genuinely empty. Now: empty section shows
    the full input (unchanged); once it has at least one goal, the input collapses to
    a bare `+` button (same collapse-behind-a-button pattern CRM's own "+ ADD" already
    uses), which reveals the input on click and closes it again automatically after a
    successful add (or on Escape). New `weeklyGoalAddOpen`/`monthlyGoalAddOpen` state
    in `App.js`, included in the same UI-state persistence blob as everything else on
    this page. Verified live: with both sections already populated, both collapsed to
    `+` buttons on load; clicking one revealed the input; Escape collapsed it again
    with nothing added. **Immediate follow-up, same day:** Elo asked for that collapsed
    `+` to live in the section header (top-right, next to "THIS WEEK"/"THIS MONTH")
    rather than below the goal list where it originally landed. Moved it there, and
    moved the reveal-on-click input to sit right under the header (above the goal
    list, not below it) -- keeps the input spatially next to the button that reveals
    it rather than appearing far below all the goal rows. The old bottom-of-list
    block is gone entirely, not just hidden. Verified live: `+` now renders inline
    with each header label; clicking it opens the input directly beneath the header;
    Escape collapses it again.
- **HOME's TODAY · KEY TASKS card got small glowing GOLD dots (2026-08-25), Elo's
  request, refined twice in the same exchange.** First pass: a glowing blue dot on
  the right of each task row, and the header's "N OPEN" text replaced with N small
  glowing dots. Elo's immediate correction, twice over: (1) the dots should be
  smaller/lighter and use the GOALS card's own GOLD accent color, not a separate
  blue -- "I want the dot to be... the framing, the silhouette of the goal section,
  I want that color"; (2) the header should show the actual number plus ONE glowing
  dot next to it, not N separate dots -- "that doesn't work." Landed on: 6px dots at
  `GOLD` (`oklch(0.86 0.17 195)`) 75% opacity with a soft matching glow, dimming to
  plain grey (no glow) when a task is done, same visual grammar the row already uses
  for its done/opacity state; header shows `{openCount}` followed by one such dot.
  One more correction after that: the per-row dot initially used a guessed
  `margin-top` to line up with the text block, which read as "a little upward" --
  replaced with `align-self:center` instead, which centers correctly relative to
  the row's actual content height regardless of label length, rather than a magic-
  number offset that only happens to work for one specific case. Verified via
  `getBoundingClientRect()` on both, not just eyeballing a screenshot: dot center
  and row center matched to within 0.5px.
- **Shared `CARD` style (`theme.js`) tuned for more contrast (2026-08-25), from a
  reference screenshot Elo shared of a different mockup.** He wanted the same subtle
  silhouette/contrast technique the reference used, in this app's own blue rather than
  a new color, applied only to "decently sized boxes" -- explicitly NOT toggle
  buttons, tab switchers, or individual task/habit rows. Since `CARD` is already the
  one shared constant every such box in this app uses (HOME's cards, CRM's category
  groups, BRAIN's entity cards, JOURNAL's entries, HEALTH's panels) and small chrome
  never uses it, tuning that single constant was the entire, exactly-scoped change --
  no per-file edits needed. Background deepened slightly relative to the page
  (`oklch(0.12 0.06 240)`), border shifted a little richer, the existing bevel inset
  highlight bumped slightly stronger. Kept deliberately restrained -- Elo's own word
  was "subtle" twice in the same sentence describing what he wanted.
- **Habit sub-tasks (2026-08-25) -- an optional per-habit checklist.** Full writeup,
  including the schema, the server-side completion cascade, and a real focus/blur bug
  found and fixed during testing, lives in the schema section above right after the
  main `habits` table (search "RESOLVED 2026-08-25: habit_subtasks"). Summary: a habit
  can optionally have sub-tasks; if it does, the habit only counts as done once every
  sub-task is checked, and its main checkbox becomes a derived display rather than
  something you click directly -- clicking such a tile expands the checklist instead.
  A habit with no sub-tasks is completely unaffected. `expandedHabitId` (which single
  habit's checklist is open) is part of the same persisted UI-state blob as everything
  else on HOME.
  **Same-day follow-up, two corrections from Elo after seeing it live:**
  1. The checklist originally rendered below the ENTIRE 3-column grid, always at the
     very bottom regardless of which row the clicked habit was in. Elo: "I want the
     subtask to display as boxes in rows right underneath the main task instead
     underneath all the tasks." Fixed by chunking `habits` into rows of 3 (matching
     the grid's column count) and inserting the checklist as a `grid-column:1/-1`
     item in DOM order right after the row containing the expanded habit -- CSS grid
     honors DOM order for auto-placement, so a full-width item there pushes later
     rows down instead of the checklist landing at the bottom. The tile-rendering
     JSX was extracted into a `HabitTile` component specifically to make this
     row-chunking loop legible. Also restyled sub-tasks as small bordered boxes in a
     wrapped row (his own words: "use a smaller box to indicate it's a subtask"),
     echoing the main tiles' own box language at a smaller scale instead of a plain
     vertical list.
  2. Sub-tasks can now be drag-reordered while editing a habit (mirrors the existing
     top-level habit reorder exactly -- `draggingSubtaskId`/`reorderSubtasks` in
     `App.js`, same splice-and-reindex-then-PUT-every-item approach as
     `reorderHabits`). Since the per-habit sub-task list now lives nested inside the
     already-`draggable` top-level habit row (for reordering habits themselves), each
     sub-task's own drag handlers call `e.stopPropagation()` -- without it, dropping a
     sub-task would also bubble up and fire the outer row's `onDrop`, calling
     `reorderHabits` with a sub-task's numeric id misread as a habit id.
     **Verification note:** HTML5 drag-and-drop could not be mechanically exercised
     through this session's browser automation -- both simulated mouse-drag and
     scripted `DragEvent`/`DataTransfer` dispatch failed to trigger the drop (a known,
     general limitation of automating native HTML5 DnD, not specific to this app;
     browsers restrict `DataTransfer` on non-trusted synthetic events). Verified
     instead via direct API calls replicating the exact PUT sequence
     `reorderSubtasks` would send for a real drag (splice a subtask out, reinsert it,
     PUT sequential `sort_order` for every item) -- confirmed the resulting order was
     exactly correct, and confirmed the checklist correctly renders in whatever order
     `sort_order` holds. The event wiring itself mirrors the already-shipped,
     already-working top-level habit drag pattern structurally. Flagged to Elo as a
     real gap in verification (not claimed as fully tested) -- worth a real drag test
     on his end before relying on it.
  3. **Real bug Elo hit using it, same day:** "The drag button doesn't work, when I
     click on the drag 6 dots button it would immediately jump out of the edit
     section" -- exactly the verification gap flagged above turned out to hide a real
     bug. Root cause: the same premature-blur pattern already fixed once for the
     +/add and ✕/delete sub-task buttons (see the `habit_subtasks` RESOLVED note in
     the schema section) also applied to the draggable sub-task box itself -- it's a
     plain, non-focusable `div`, so a mousedown on it (which is what starts a native
     drag) shifted focus away from the sub-task label `<input>`, tripping the row's
     onBlur-triggered save-and-close guard before the drag could ever begin. The fix
     had only been applied to the small buttons inside each box, not the box you
     actually grab. Fixed with the same `onMouseDown={(e) => e.preventDefault()}`
     technique, applied to the draggable box itself (`HomeTab.js`). Verified directly
     that this specific failure is gone: clicked the drag handle and confirmed the
     edit panel stays open instead of closing -- the underlying full drag gesture
     still can't be mechanically automated in this session (same tooling limitation
     as before), so a real end-to-end drag is still worth Elo confirming himself, but
     the reported symptom (immediate jump-out) is fixed and re-verified.
  4. **Real bug Elo hit using it AGAIN, same day, after the jump-out fix above:**
     "I still can't really drag the subtask within the habits section, it wouldnt
     drag when I click on edit on the subtask." The jump-out fix (item 3) was real
     but incomplete -- it stopped the edit panel from closing prematurely, but the
     actual drag-and-drop still never worked, for a completely different reason:
     a genuine nested-draggable conflict. The sub-task boxes (`draggable`, inside
     the edit panel) render INSIDE the outer per-habit row (`key={'manage'+h.id}`
     in `HomeTab.js`), which itself is UNCONDITIONALLY `draggable` (for the
     top-level "reorder habits" feature) regardless of whether that habit is
     currently being edited. Two `draggable=true` elements nested inside each
     other is a well-known, cross-browser-unreliable HTML5 DnD pattern -- the
     browser's own hit-testing for "which element is the drag source" often lets
     the OUTER draggable win the gesture even when the mousedown target is nested
     deeper, and critically, the sub-task handlers' `e.stopPropagation()` calls
     (added for exactly this concern originally) do NOT fix it -- stopPropagation
     only affects React's synthetic bubbling of drag EVENTS after the browser has
     already picked a drag source, it has no influence over that initial source
     selection. Fixed by making the outer row's `draggable` conditional:
     `draggable={editingHabitId !== h.id}` -- while a habit's edit/sub-task panel
     is open, the outer row simply isn't a drag source at all, so there's no
     nested-draggable conflict during the exact window sub-task dragging needs to
     work in. (Reordering the top-level habit itself while its own edit panel is
     open doesn't make sense anyway, so this loses nothing.) Verified the fix
     structurally, since real HTML5 drag gestures still can't be triggered by this
     session's browser automation (`left_click_drag` moves the mouse but doesn't
     dispatch trusted native drag events -- confirmed yet again: the sub-task order
     was unchanged after an automated drag attempt): walked the live DOM via
     `javascript_tool` from a sub-task box up through its ancestors and confirmed
     the sub-task box itself is `draggable="true"` while its outer habit-row
     ancestor is now `draggable="false"` during editing -- the actual nested-
     conflict is structurally gone, confirmed on the real rendered page, not
     just by re-reading the diff. Still asked Elo to do one real drag himself to
     close the loop, since this session's tooling gap means the full gesture has
     never once been mechanically exercised end-to-end here.
  5. **Elo reported it STILL didn't work after fix #4** ("I still can't drag the
     subtask for different order") -- the nested-draggable fix was real and
     necessary but not sufficient; a second, independent bug was also blocking the
     drag from ever starting. The sub-task box's `onMouseDown={(e) =>
     e.preventDefault()}` -- the ORIGINAL fix from item 3 for the premature-blur/
     jump-out bug -- has a well-documented cross-browser side effect: calling
     `preventDefault()` on `mousedown` silently suppresses the browser's native
     `dragstart` from ever firing on that same element in Firefox, and
     inconsistently in Safari (Chrome is more forgiving, which is likely why this
     wasn't caught by testing in this session's Chromium-based browser
     automation). In other words, the item-3 fix traded the jump-out bug for a
     new one that just didn't show up in this session's own browser. Fixed by
     replacing `preventDefault()` with a flag instead: a new `skipHabitBlurSave`
     ref (`useRef(false)`) is set to `true` in the sub-task box's `onMouseDown`
     (no `preventDefault` call at all this time), and the outer row's `onBlur`
     checks and consumes that flag before its existing save-and-close logic --
     same net effect (suppress the premature save when this specific box was
     clicked) without ever touching the mousedown's default action, so native
     drag-start is no longer at risk of being suppressed in any browser. The
     sub-task row's own ✕ delete button keeps its original `preventDefault`
     unchanged -- it was never draggable itself, so it was never part of this
     particular conflict, no reason to touch it.
     **Verification note, still an open loop:** confirmed the panel no longer
     closes on a plain click (the flag-based blur guard works), and confirmed no
     new console errors -- but this session's browser automation still cannot
     dispatch a real, trusted native drag gesture (`left_click_drag` moves the
     mouse but Chrome doesn't treat it as a genuine drag; scripted
     `DragEvent`/`DataTransfer` dispatch is restricted on synthetic events for
     security reasons) -- so even with two real, distinct bugs found and fixed
     this session, the actual end-to-end drag still has never been mechanically
     verified inside this environment. If Elo tries again and it's STILL broken,
     the next thing to ask him for is which browser he's testing in -- that's the
     one variable this session can't control for or reproduce.
- **`CARD` (`theme.js`) rebuilt a third time (2026-08-25), this time against a real
  screenshot of the target UI instead of a verbal description.** Elo shared a
  screenshot of the actual reference dashboard and asked for the major-box silhouette
  to be copied closely, then gave two corrections in the same exchange once he saw
  the first attempt live:
  1. First rebuild read the screenshot as mostly an interior effect -- a lighter
     blue-navy wash at the top of each box fading down to the page's dark background,
     with a fairly restrained border and no real outer bloom. Applied as a vertical
     `linear-gradient` background plus a dialed-back (less neon than the prior pass)
     border, corner radius opened back up slightly (12px -> 14px).
  2. Elo: "notice how the glow is more vibrant on the top of the boxes, and lose it's
     vibrancy towards the bottom" -- then, after seeing that applied to the interior
     fill, the sharper correction: "it is more of the of a s[i]lhouette of the line
     glows then the interior of the box glow." The directional fade belongs to the
     glowing OUTLINE itself, not the box's fill. Rebuilt again: the interior gradient
     was toned down to a faint assist (so the panel doesn't read flat, but isn't the
     main effect), and the outer glow became the deliberately asymmetric part -- two
     box-shadow layers, a small-blur/brighter one with a slight negative y-offset
     concentrated at the top edge, and a wider-blur/much-dimmer one with a positive
     y-offset that reads as falloff toward the bottom, plus a bright inset top edge
     line vs. a dark inset bottom edge line reinforcing the same direction on the
     border's own bevel. Box-shadow (not `border-image`) was used deliberately so the
     glow still follows the box's rounded corners -- `border-image` ignores
     `border-radius` entirely, which would have squared off every corner.
  Also fixed while doing this pass: three "major boxes" that were still hardcoded
  near-duplicates of the OLD `CARD` style instead of importing the shared constant
  (meaning they'd silently drift out of sync with any future `CARD` tuning) --
  HOME's CALENDAR card, CRM's CATEGORY-view group boxes, and BRAIN's entity dashboard
  cards (`.elo-entity-card` in `index.css` also had its own hardcoded `:hover` glow,
  updated to match the new restrained/directional look instead of the old wide
  neon bloom). All three now render from `CARD` directly, so this and any future
  "apply it everywhere" pass only has to touch the one constant.
  Verified live across every tab (HOME, CRM both Kanban and Category views, BRAIN,
  JOURNAL, HEALTH) -- consistent silhouette everywhere `CARD` is used, GOALS
  correctly untouched (it deliberately keeps its own separate gold-accented style,
  per the earlier "pop the goals section" request), no new console errors introduced
  (the only console errors present are the pre-existing, already-documented
  `GET /api/profile` 404 from the pending `profile` table migration, unrelated to
  this change). Exact color values throughout are a best-effort visual match to the
  reference screenshot and Elo's verbal corrections, not a pixel sample -- flagged as
  something to iterate on further if it's still not close enough once Elo looks at it
  himself.
- **`CARD`'s border/glow rebuilt a fourth and final time (2026-08-25), from a real CSS
  technique Elo supplied himself** (not a verbal description this round -- he'd asked
  an image model to generate the reference look, then extracted the actual CSS it was
  visually aiming for and handed that over directly, plus an explicit instruction not
  to touch background/layout/spacing, only the border/glow treatment). This is a
  materially different technique from the box-shadow approximation the third pass
  used: a genuine gradient-colored BORDER via the standard `mask-composite` trick
  (paint a full gradient across the box, then XOR-exclude a content-box-sized mask
  from it, leaving only a 1px ring of that gradient as the actual border), plus a
  separate top-concentrated `box-shadow` glow layered on top. Elo's "advanced" variant
  was used for the border gradient specifically -- a `radial-gradient(ellipse at 50%
  0%, ...)` (brightest at top-center, fading toward the corners and much further by
  the bottom) rather than a flat top-to-bottom `linear-gradient`, per his own stated
  preference ("that's probably the version I'd use... gives the boxes that more
  expensive-looking 'lit from above' silhouette").
  **Real architectural constraint this ran into:** this app styles everything through
  a `css()` helper that turns an inline CSS string into a React style object (see
  `client/src/css.js`) -- there is no mechanism for inline styles to express
  pseudo-elements (`::before`/`::after`), which this technique requires. Solution:
  split `CARD` (`theme.js`) into two parts. The inline string keeps only what a plain
  style CAN express -- the interior fill (untouched, per Elo's explicit instruction),
  `border-radius`, `position:relative` (so the pseudo-elements anchor correctly), and
  a `1px solid transparent` placeholder border (keeps the box model pixel-identical to
  when a real border color lived here, so nothing shifts now that the visible border
  moved elsewhere). A new export, `CARD_CLASS = 'elo-panel-glow'`, is a real CSS class
  (implemented in `client/src/index.css`) carrying the actual `::before`/`::after`
  rules -- every CARD consumer now needs BOTH `style={css(CARD + ...)}` AND
  `className={CARD_CLASS}` (merged with `elo-entity-card` on BRAIN's cards, which
  keeps its own separate hover rule). All eight call sites across `HomeTab.js`,
  `CrmTab.js`, `BrainTab.js`, `JournalTab.js`, and `HealthTab.js` updated to add the
  className alongside the existing style. `.elo-entity-card:hover` (BRAIN's cards,
  the only CARD consumer that's actually clickable) simplified to a `translateY` lift
  plus `filter:brightness(1.18)` -- brightening the whole card including its
  pseudo-elements in one property, instead of trying to redefine the gradient colors
  a second time for a hover state.
  Verified live across every tab (HOME, CRM both views, BRAIN including hover state,
  JOURNAL, HEALTH) -- consistent gradient-ring silhouette everywhere, no new console
  errors (only the pre-existing, already-documented `GET /api/profile` 404). Exact
  color stops are Elo's own supplied values, not re-derived -- if the look still needs
  tuning, adjust the rgba stops directly in `.elo-panel-glow::before`/`::after` in
  `index.css`, not the inline `CARD` string in `theme.js` (that string no longer
  controls border/glow at all, only fill/radius/position).
- **Same-day follow-up: the gradient stops above got re-derived from real pixel data,
  not eyeballing.** Elo's question ("why can't you just copy the coloring from the
  model screenshot") was a fair challenge -- the prior pass's colors were a visual
  estimate of an image only visible inline in chat, with no file to actually measure.
  He then saved that reference PNG into `~/Downloads/Elo's Personal OS Dashboard/`,
  which made real measurement possible: installed Pillow (`pip3 install --user
  Pillow`) and scanned vertical/horizontal pixel strips through two different boxes'
  borders (OPERATOR and HABITS, chosen since they're clear of overlapping UI).
  **This directly contradicted the assumption both the third pass AND Elo's own
  hand-typed reference CSS had made** -- that assumption was a simple monotonic
  top-to-bottom fade (his reference's bottom stop was `rgba(..., 0.08)`, i.e. almost
  invisible). The real pixels showed something different: brightest at the top edge
  (~rgb(80,186,238)), then the vertical SIDES are the dimmest part of the whole
  border (~rgb(1,17,40), confirmed at mid-height on both boxes), and the BOTTOM edge
  is moderately bright again (~rgb(2,90,145) -- roughly half the top's brightness,
  not a barely-visible one). In other words the real panel reads as a frame with lit
  top and bottom horizontal rails and nearly-invisible vertical sides, not a single
  vertical gradient. `.elo-panel-glow::before`'s gradient was rebuilt to fit these
  three measured points directly (a `linear-gradient` carrying the bright-top /
  dim-middle / moderate-bottom vertical curve, layered under a small `radial-gradient`
  that reproduces the top edge being slightly brighter at center than at the corners,
  which the same sampling also confirmed). `::after`'s outer glow was tuned down to
  match the real (fairly modest) glow bleed measured on the page background just
  above a box's top edge, and gained a matching bottom inset highlight instead of a
  flat dark one, since the bottom edge turned out not to be dark. **Worth remembering
  for next time a reference image needs matching:** if the image exists as an actual
  file (ask Elo to save it if it's only inline in chat), sample it programmatically
  (Pillow, or similar) rather than describing it by eye -- eyeballing missed a real,
  non-obvious pattern (dim sides that are dimmer than BOTH edges) that direct
  measurement caught immediately.
- **Second same-day follow-up: a distinct second effect was missing entirely.** After
  seeing the border-ring fix live, Elo pointed out there's a separate thing the
  reference has beyond the thin border line itself: "a little glow... glowing lights
  going under, like inside the box... very very vibrant glow on the top... like a
  stringy blue going downwards... they don't have it anywhere on the side or at the
  bottom." That's real and it's a different effect from the border ring covered above
  -- a genuinely vibrant cyan wash bleeding DOWN FROM the top edge INTO the box's own
  interior fill, clearly visible when the reference PNG is cropped and viewed up
  close (confirmed by eye across three different boxes -- OPERATOR, HABITS, and even
  GOALS despite its separate custom styling -- so this is a shared characteristic of
  the whole panel language, not one box's quirk). This had NOT been captured by the
  border-ring work, since that only affects a 1px ring; the interior fill was still
  the old, much fainter placeholder wash from the third pass. Measured properly this
  time: sampled the MEDIAN pixel brightness across each row at increasing depth into
  the OPERATOR box (median, not a single column, specifically to filter out bright
  text/icon pixels contaminating the reading) -- the interior glow starts near the
  border's own peak brightness right at the top edge, decays fast through the first
  ~20% of the box's height, and is fully flat at the plain dark base color by ~48-50%
  down, with nothing equivalent happening near the bottom. `CARD`'s inline
  `background` (`theme.js`) was rebuilt from that measured curve -- a multi-stop
  `linear-gradient` fading from the peak color at 0% down to fully transparent by
  50%, layered on top of (not replacing) the plain solid base card color, so anything
  below ~50% height renders pixel-identical to before this change and the glow is
  purely additive above that line. This is the one instance in this whole styling
  arc where Elo's own earlier instruction ("don't alter the background, only the
  border/glow treatment") was deliberately superseded -- his own later, more specific
  description of the reference made clear the background/interior fill was in scope
  after all; when a later, more specific instruction conflicts with an earlier general
  one on the same feature, the later one wins. Verified live across HOME and BRAIN --
  visibly matches the reference crop's vibrant top-down wash, fading to the ordinary
  dark card color by mid-box, with GOALS correctly untouched (separate style).
- **Third same-day follow-up: that interior glow still wasn't right, and this is
  the one where "compare the two screenshots directly" actually mattered.** Elo:
  "the blue color is very different... it's not really glowing blue, it's just
  plain blue, and it's too much shade all the way down to the center of the box."
  Comparing a live app screenshot against the reference crops side by side (at 3x
  browser zoom via `document.body.style.zoom`, to see the OPERATOR box's top region
  in real detail) confirmed he was right, and pinned down two distinct, separate
  problems with the previous attempt:
  1. **Reach.** The gradient had been fit to match the reference's raw measured
     brightness curve, which technically doesn't flatten out until ~48-50% down --
     but a plain alpha-blended color stays visually perceptible at far lower alphas
     than the raw brightness numbers implied, so matching that curve exactly still
     read as "shade reaching too far down" once actually rendered and looked at.
     Confirmed directly: at 3x zoom, the "PHOTO / Elo / UCLA" row -- which is
     basically pure black in the reference -- still carried a visible blue cast.
     Tightened from fading out at 50% down to fully transparent by 13%.
  2. **Quality.** Plain CSS alpha-blending a bright color onto a dark background
     produces a darker, desaturated version of that color -- it reads as tinted
     paint, not light, which is exactly Elo's "not really glowing, just plain
     blue." Added `background-blend-mode: screen` to this layer (paired with
     `normal` for the solid base layer beneath it) -- `screen` composites the way
     overlapping LIGHT behaves rather than overlapping paint, so the same peak
     color reads as noticeably more luminous/"lit" instead of just darker-and-
     tinted.
  Also worth remembering: the base "floor" color (the plain card background with
  no glow at all) was independently verified to already closely match the
  reference -- rendered `oklch(0.145 0.055 240)` to an actual canvas via
  `ctx.fillStyle` + `getImageData` and got `rgb(0,11,30)`, versus the reference's
  measured floor of roughly `rgb(0,8,26)`. So the floor color was never the
  problem; isolating that early (instead of re-tuning a value that was already
  correct) kept the fix targeted at the two things that actually were wrong.
  Verified live at 3x zoom (close, matches the reference's tight top-only flash)
  and at normal scale across HOME and BRAIN (no longer reads as a flat blue wash).
- **Fourth same-day follow-up, and the one that actually fixed the root cause: the
  whole approach was architecturally wrong, not just mistuned.** Even after the
  reach/blend-mode fix above, Elo caught the real underlying bug and named it
  precisely: "the glow shade are not supposed to be different or proportional to
  the size of the boxes." Every version up to this point -- the mask-composite
  border, the interior gradient, all of it -- used gradient stops as PERCENTAGES
  of the element's own height. That's mathematically guaranteed to make a tall box
  (CALENDAR, HABITS, JOURNAL's day-by-day list, HEALTH's day-by-day list -- all
  several hundred px tall) show a deeper, more spread-out glow than a short one
  (OPERATOR, ~150-200px) at identical color stops, since "20% of 700px" and "20%
  of 150px" are different pixel counts. This was never going to look right no
  matter how the color stops were tuned -- the shape of the effect itself was
  wrong. Elo supplied a fully worked reference implementation making the fix
  concrete: the reference isn't a shading effect at all, it's edge lighting -- a
  dark panel with an illuminated top rim and a shallow bloom immediately below it,
  both a FIXED pixel depth regardless of panel height.
  Rebuilt `CARD`/`CARD_CLASS` (`theme.js`, `index.css`) from scratch around this,
  as three independent layers instead of one gradient trying to do everything:
  (A) **base border** -- `CARD`'s own inline `border` is now a plain, uniform,
  subtle `rgba` color with zero directionality (no more mask-composite gradient
  border at all -- that whole technique is gone); (B) **top rim** --
  `.elo-panel-glow::before`, a bright 1px horizontal line sitting exactly on the
  top edge with a small box-shadow bloom, gradiented left-to-right so it's dimmer
  at the rounded corners; (C) **top bloom** -- `.elo-panel-glow::after`, a soft
  vertical falloff extending exactly `28px` down from the top edge using gradient
  stops in **`px`, not `%`** (`0px, 8px, 18px, 24px, 28px`) -- this is the actual
  mechanism that makes it height-independent. The panel interior itself is back to
  a single flat color with no vertical gradient of any kind; all the glow lives in
  these two fixed-depth pseudo-element layers.
  **Verified this was actually fixed, not just re-described:** queried every
  `.elo-panel-glow` element live via `getBoundingClientRect()` and
  `getComputedStyle(el, '::after').height` across HOME, and confirmed panel
  heights ranged from 154px to 419px (a ~2.7x spread) while every single one's
  `::after` bloom measured exactly `28px` -- not approximately, exactly, since
  it's a fixed value rather than a computed percentage. Also checked visually
  across every tab, including three of the tallest boxes in the whole app
  (JOURNAL's and HEALTH's day-by-day lists, both 350px+) -- all show the same
  thin rim + shallow bloom as the short OPERATOR card, no visible scaling.
  **If this ever needs retuning:** change the `28px` value (and the matching px
  stops inside it) in `.elo-panel-glow::after` directly -- never convert those
  stops back to percentages, that's the exact regression this pass fixed.

## Full-app audit (2026-08-25) -- Elo asked for a systematic pass to catch anything
before it costs him a future fix-cycle, not a response to one specific report.
Code-reviewed every backend route + the frontend handler layer, then live-tested
every tab in the actual browser (not just curl). Four real, previously-unknown
bugs found and fixed; two real gaps found and left for a decision rather than
silently fixed, since both need either a migration or an explicit tradeoff call.

**Fixed:**
1. **Restoring an archived key task from CRM's Archive view made it show as
   already checked-off on HOME, even though it had just been restored and not
   redone.** Root cause: `pendingDoneIds` (a Set that briefly marks a task
   "done" during its 260ms archive fade) was never cleaned up after the fade
   completed -- the id just sat there forever. If that same task was later
   restored (still `key: true`, back in `activeTasks`), `keyTasksDerived`
   read the stale id and rendered it as done. Reproduced directly: checked
   off "working out," restored it from Archive, watched it come back checked
   on HOME. Fixed by clearing the id from `pendingDoneIds` inside
   `restoreCrmTask` (`App.js`). Re-verified the exact same repro afterward --
   correctly comes back unchecked.
2. **JOURNAL's header said "{count} DAYS (LAST 30)" but `GET /api/journal`
   has never filtered to 30 days or to one-per-day** -- it fetches every
   entry that exists, full stop. The label was just wrong regardless of what
   was in the data. Fixed to "{count} ENTRY/ENTRIES" (`JournalTab.js`),
   accurate to what's actually shown.
3. **`tasks.updated_at` was written via a raw `new Date()`**, which
   JSON-serializes to a UTC ISO string -- the exact UTC-vs-local bug class
   already fixed multiple times elsewhere in this app (habit_completions,
   tasks.completed_at, nutrition_log), just on a column nothing currently
   reads back, so it was silently wrong instead of visibly wrong. Fixed to
   `localTimestampStr()` for consistency with `completed_at` on the same
   table (`server.js`).
4. **`POST /api/sleep/wake`'s same-day dedupe check used `.maybeSingle()`**,
   which throws if more than one row ever matches -- meaning a single stray
   duplicate row for one date (exactly the kind the same-day-duplicate bug
   fixed earlier this session could produce) would have hard-failed every
   future wake for that date instead of just picking one to update. Hardened
   to `.order('id', {ascending:false}).limit(1)` (`server.js`), which can't
   throw on multiple matches.

**Found, not fixed at first -- fixed same day once Elo confirmed the call:**
- ~~Entity notes (BRAIN's per-entity NOTES textarea) are never persisted
  anywhere.~~ RESOLVED 2026-08-25. Elo wanted it to "just save" as he types,
  no button -- added `entities.notes TEXT` (one-column migration, confirmed
  run) plus `PUT /api/entities/:id` (`server.js`, 404s cleanly pre-migration
  like everything else) and a debounced autosave in `App.js`
  (`updateEntityNotes`, 800ms after typing stops -- local state updates
  instantly for a responsive textarea, the network write is what's
  debounced, not the UI). `transformEntity` now carries `notes`; the
  textarea's fallback chain is `entityNotes[id] (this-session edits) ??
  entity.notes (persisted) ?? entity.desc (helpful starting content when
  nothing's been saved yet)`. Verified for real, not just "it compiles":
  curl-confirmed 404 pre-migration, curl round-trip post-migration, then a
  full browser pass -- typed a real note, waited for the debounced
  `PUT /api/entities/1` to actually fire (confirmed via network tab), then
  did a hard page reload and read the textarea's DOM value directly
  (bypassing a flaky screenshot-timing issue with this session's browser
  automation, unrelated to the app itself) -- the saved text was there, not
  the description fallback. Test note cleared back to empty afterward.
- **DEPLOYMENT RISK, not yet a live bug:** every "local time" helper in this
  app (`localDateStr`, `localTimestampStr`, `formatRange` in `lib/google.js`,
  the hour-of-day math in `/api/analytics/habits`) reads the SERVER
  process's OS timezone (`d.getHours()`, `d.getFullYear()`, etc.) -- there is
  no hardcoded timezone anywhere. This works today only because the server
  and Elo are both on the same Mac. The moment this deploys to a cloud VM
  (Oracle/Railway, both default to UTC), every one of these would silently
  start computing "today," "this hour," and every local-time comparison
  using UTC instead of Elo's actual timezone -- reintroducing, at the
  deployment layer, the exact bug class this project has already spent
  multiple sessions fixing at the code layer. **Action needed at deploy
  time, not a code change:** set `TZ=America/Los_Angeles` as an environment
  variable on whatever host runs this (Oracle Cloud instance / Railway
  service config), before the first real day of use post-deployment. Adding
  this note here so it isn't forgotten when step 8 (deploy) resumes.

**Also live-tested and confirmed correct, no bugs found:** AI ADD task
parsing (correct entity classification, star pre-check), BRAIN entity
briefing generation, JOURNAL mood/theme extraction + AI recap generation +
INSIGHTS range picker, HOME's goal add/edit/delete, HOME's habit
add/toggle/delete (daily score and streak both updated correctly), calendar
week navigation, and the documented "new row doesn't render immediately"
quirk (tried to reproduce directly both for CRM and JOURNAL adds -- did not
reproduce either time; leaving the existing note as-is since it's evidently
intermittent, not gone).

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
7. ~~**Telegram bot**~~ — done and tested 2026-08-25, real message round-trip
   confirmed by Elo from his own account (see "What's real vs. still mock" above
   for the full writeup). Thin client: calls the *same* Express API routes the
   React app calls, never talks to Supabase or `lib/anthropic.js` directly (so
   logic isn't duplicated across two clients); reuses step 4b's natural-language
   task parsing instead of reimplementing it; answers questions using step 3/5's
   analytics and insights so responses are actually informed by real logged data,
   not generic. Stores its own config in the same `integrations` table as
   Calendar (`provider: 'telegram'`, `config.chat_id`). Runs via `telegraf`
   (long-polling, not a webhook -- no public HTTPS endpoint on localhost yet,
   same reasoning as Calendar) inside the same backend process, no third
   terminal needed. Voice-note input (Whisper transcription, for
   mumbled/mispronounced speech) discussed and deliberately deferred -- Elo
   asked to hold off on adding a new external API/credential for now; revisit
   whenever that's actually wanted.
8. **Deploy publicly** — in progress, code-side prep done and tested 2026-08-25, actual
   hosting not yet live. **Architecture decided: one deployment (Railway), not the
   originally-sketched Vercel+Railway split.** Reason: the Telegram bot's long-polling
   loop needs an always-on process, which serverless hosting (Vercel) fundamentally
   can't run -- functions spin down between requests. Railway (or Render/Fly.io) runs a
   persistent Node process, which the bot needs anyway, so one platform serves both the
   API and the built React frontend from the same Express process. This also sidesteps
   CORS entirely (same origin) and removes the need for a separate frontend API-base-URL
   config.
   Code changes: `server.js` now serves `client/build` as static files + an SPA
   fallback when `NODE_ENV=production` (registered after every `/api/*` route so those
   still win); root `package.json` gained a `build` script (`cd client && npm install
   && npm run build`); `lib/google.js`'s OAuth redirect URI and the post-auth browser
   redirect are now driven by `PUBLIC_URL`/`FRONTEND_URL` env vars instead of hardcoded
   `localhost` (defaults preserve current local-dev behavior when those aren't set);
   `client/src/App.js`'s `connectGoogleCalendar()` now branches on
   `process.env.NODE_ENV` -- the dev-only proxy workaround only applies in dev, since
   production has no separate dev server/port to route around.
   **Verified locally before touching any real host:** `npm run build` compiles clean
   (pre-existing lint warnings only, nothing introduced by this); ran the app with
   `NODE_ENV=production` locally and confirmed one process serves both the real built
   frontend (loaded correctly in-browser, real data rendering) and the API from the
   same port -- proving the deployment architecture works before spending a single
   Railway build minute on it.
   **Update 2026-08-25:** the GitHub remote is now set up (`github.com/Elotion/
   Personal_OS_Dashboard`, SSH key auth, "Push to GitHub after committing" is now a
   standing process rule above) -- Railway can deploy from it once hosting actually
   starts. Elo is separately in the middle of creating an Oracle Cloud account (an
   always-free-tier VM, an alternative to Railway being considered) -- that signup
   was still in progress and deliberately paused mid-flight so work could move on to
   the next roadmap phase (this was Elo's explicit call: "let's put deployment to the
   last step ... let's focus on the next phase right now"), not abandoned. Whichever
   host is used, **still needed:** the actual hosting account finished/chosen,
   environment variables set in that host's dashboard (not a committed `.env`), and
   updating Google Cloud Console's OAuth redirect URI once the real production URL is
   known.
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
10. ~~Build out the HEALTH tab~~ — done and tested 2026-08-25 (see "What's real vs.
    still mock" above for the full writeup). Done out of its original sequencing
    (before Finance/deployment) at Elo's explicit request, while the Oracle Cloud
    account for step 8 was mid-signup. Sleep tracking + real AI calorie/macro
    estimation + a HEALTH-tab dashboard (sleep/calorie trend, HEALTH-entity habit
    completion, day-by-day table, on-demand AI insight) — the `sleep_log` table
    migration ran 2026-08-25 (see RESOLVED note above), so this phase is fully done.

**Cross-cutting note for every step above:** manual DDL is a recurring cost, not a
one-time one — Claude cannot run schema changes with the credentials this project uses
(see PENDING MIGRATION notes above), so each step will need its own trip to the Supabase
SQL editor. Batch each step's migration into one SQL block (as already done for
`habit_streak`/`profile`) rather than several one-off ALTERs.
