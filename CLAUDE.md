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
Real values live in `.env` — **not yet gitignored**, do that before this is ever pushed
anywhere (add a `.gitignore` file with a single line: `.env`). Expected variables:
```
PORT=5050
SUPABASE_URL=https://znblctbounitxetfcgns.supabase.co
SUPABASE_ANON_KEY=<get from Supabase dashboard -> Project Settings -> API Keys>
```
(Deliberately not repeating the actual key value here — CLAUDE.md is the kind of file
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
);

CREATE TABLE habits (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT,
  entity_id INTEGER REFERENCES entities(id),
  completed_today BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
  -- completed_date DATE and sort_order INTEGER do NOT exist yet, despite being
  -- requested across three separate sessions -- see PENDING MIGRATION below.
);
-- CORRECTION: an earlier version of this comment claimed completed_date and
-- sort_order had already been added -- they hadn't; a previous session's backend
-- fallback logic masked the failure well enough that it looked like things were
-- working. Verify directly before trusting either column exists, rather than
-- taking this file's word for it:
--   curl -X PUT localhost:5050/api/habits/<id> -H "Content-Type: application/json" \
--     -d '{"completed_date":"2026-01-01"}'
-- If that 400s with "column ... does not exist", it's still missing.

-- ============================================================
-- PENDING MIGRATION -- run this once in the Supabase dashboard ->
-- SQL Editor (Claude cannot run DDL with the anon key it has, so this genuinely
-- needs a human to paste it in and click Run). Covers everything currently known
-- to be missing, so it only needs doing once:
--
--   ALTER TABLE habits ADD COLUMN completed_date DATE;
--   ALTER TABLE habits ADD COLUMN sort_order INTEGER;
--
--   CREATE TABLE habit_streak (
--     id SERIAL PRIMARY KEY,
--     count INTEGER NOT NULL DEFAULT 0,
--     last_done_date DATE
--   );
--   INSERT INTO habit_streak (id, count, last_done_date) VALUES (1, 0, NULL);
--   ALTER TABLE habit_streak ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "Enable all for public" ON habit_streak FOR ALL USING (true) WITH CHECK (true);
--
-- Once this has been run, no further code changes are needed -- everything below
-- already prefers the real Supabase value the moment it's available:
-- ============================================================
--
-- Until that migration runs: per-habit completion and streak count both work
-- correctly today (checking a habit off survives a refresh, resets at midnight,
-- streak increments/resets correctly) but only via the BROWSER's localStorage
-- (keys 'elo-os-habit-completions' and 'elo-os-habit-streak', both in App.js) and
-- a matching GET/PUT /api/habit-streak pair in server.js that 404s gracefully
-- until the table exists. That's a real, working stopgap -- but it's per-browser,
-- not per-account, so checking a habit off on one device won't show up on
-- another until the migration runs.
--   - transformHabit() in App.js already prefers row.completed_date over
--     localStorage when present.
--   - the /api/habit-streak fetch on load already prefers the server value over
--     the localStorage one when the table responds successfully.
--   - completed_today (the one column that already exists) is still written on
--     every toggle for whatever partial value it offers, but nothing reads it
--     back for logic -- don't trust it to mean "checked today."
--   - sort_order drives manual drag-to-reorder; without the column, reordering
--     only holds for the current browser session, same story as the above.

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
- Habits — full CRUD (add/edit/delete all hit Supabase correctly), category set via
  an entity dropdown (not free text). Daily-reset completion tracking and streak
  count both work correctly and survive a refresh, but currently via localStorage
  rather than Supabase, so they don't yet sync across different browsers/devices --
  see PENDING MIGRATION on the `habits` table above, which covers exactly this.
  Drag-to-reorder works within a session but doesn't persist across a refresh yet,
  for the same reason.
- Goals (weekly + monthly) — full CRUD: add, edit text in place, delete.
- Nutrition log — add and delete; still no editing an existing entry's macros in place.
- Journal entries — add, edit the raw text, delete. The "AI RECAP" text and its
  GENERATE button are still a fake `setTimeout` placeholder, and regenerating it is
  intentionally NOT persisted (would just be writing fake filler into the database).
- Operator card (HOME, top-left) — name/tagline/focus editable in place (same
  click-pencil pattern as goals/habits), photo click opens the native file picker
  and displays what's chosen. All of it persists across a refresh today, but via
  localStorage rather than Supabase -- see the PENDING profile table note above.

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
2. **Security foundation** — swap `supabaseClient.js` from the Supabase anon key to the
   service-role key (server-side only, added to `.env`, never reaches the browser). No
   RLS changes needed or planned — service-role bypasses RLS by design, and real RLS
   would need Supabase Auth + a user identity column, which isn't part of this
   single-user architecture. Done first because it's a one-line change today and gets
   expensive to retrofit once Calendar/Telegram/Finance secrets are sitting in the same
   tables.
3. **Habit + task completion history, and analytics on top** — new `habit_completions`
   table (`habit_id`, `completed_at` timestamp; one row per completed day, inserted on
   check, deleted on uncheck) so "what time of day do I skip habits" is finally
   answerable — the current `completed_date` column only knows whether, never when.
   `tasks` gets a `completed_at` timestamp set on archive / cleared on restore (a single
   column is enough here — unlike habits, a task is a one-shot thing, not recurring, so
   it doesn't need a full log). Backend analytics endpoints on top: hardest-to-keep
   habits, time-of-day patterns, day-by-day habit-vs-task completion correlation. This
   is explicitly meant as data infrastructure for AI insights later, not a display
   feature — self-contained, no external APIs.
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
