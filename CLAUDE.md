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

## Real bug: the bedtime-aware day boundary went stale a day after waking (2026-09-04)
Elo hit this live, past midnight into Sep 4, hadn't gone to bed yet: HOME's
habits had already reset (all unchecked) and NUTRITION was already
filtering to Sep 4, even though nothing he'd done that day (Sep 3) should
have rolled over yet -- exactly the bug the 2026-08-27 day-boundary feature
was built to prevent, now recurring.

**Root cause:** `getEffectiveDate()` (`lib/habitDay.js`) anchored on the
most recent bedtime EVER recorded, pending or already-completed, and
computed `min(realToday, thatBedtime + 1 day)`. That formula only holds
correctly for the ONE midnight immediately following that bedtime -- once
Elo wakes up and lives through a full day, the same historical bedtime
becomes stale, but `+1 day` from it naturally lands exactly on the NEXT
literal midnight regardless of whether a fresh "went to bed" click ever
happened, silently ending the deferral. Real numbers: last real bed_time
was `2026-09-03 00:29` (already woken from) -- `+1 day` = `2026-09-04`,
which is exactly today's real date the instant midnight into the 4th
arrives, so the old code read that as "he already went to bed, ordinary
reset applies" when the truth was "he hasn't gone to bed since waking,
this is exactly the deferred case." Every prior verification of this
feature (2026-08-27/28, 2026-08-31) only ever tested the same-night /
next-midnight window, never a full day-plus stretch afterward, which is
why this went uncaught for over a week of real use.

**Fix:** anchor on the most recent WAKE-UP instead of the most recent
bedtime, whenever no bedtime is currently pending -- pinned at that wake's
date through any number of subsequent real midnights, until a fresh
bedtime click starts a new pending night (which re-engages the original
`min(realToday, bedDate+1)` formula, unchanged). Matches Elo's original
rule literally -- "stays on the previous day until went to bed is
clicked" has no implicit expiration.

**Extended the same effective date to nutrition** (`GET`/`POST
/api/nutrition`, and the Telegram bot's `log_food` tool in `lib/tools.js`)
-- previously nutrition used the plain literal calendar date, unrelated to
the habit/journal boundary at all. Elo: a midnight snack before he's gone
to bed should count toward the day that, from his perspective, hasn't
ended yet, same reasoning as habits/journal. `client/src/App.js` also
gained a `loadNutrition()` re-fetch wired into `goToBed`/`cancelBedtime`/
`wakeUp`, mirroring the existing `refreshEffectiveHabitDate()` calls there
-- without it, NUTRITION would keep showing the just-ended day's meals (or
hide a genuine post-bedtime-click entry) until a full page reload.

**No data was ever lost or miscomputed server-side** -- this was purely a
read-time "which day is today" bug. The moment the fix landed, Elo's real
Sep 3 completions (Morning Routine, Learning Session, Creative Session,
Deep Work) and all 3 real logged meals (3,690 kcal) reappeared exactly as
they'd actually been recorded, with zero data changes needed.

**Verified directly against real production data, not synthetic:**
restarted the backend and confirmed `GET /api/today` flipped from the
wrong `2026-09-04` back to the correct `2026-09-03`; confirmed `GET
/api/habits` and `GET /api/nutrition` both reflected the real underlying
completions/meals immediately, no data migration needed; full live-browser
pass on HOME confirmed HABITS reads `4/6 · 67%` with the correct four
habits checked and NUTRITION shows all 3 real meals -- both matching hand-
checked reality -- with zero new console errors.

## FINANCE tab built: accounts, subscriptions, CSV transaction import, AI insight (2026-09-01)
Elo, unprompted, framed this as the highest-stakes feature in the whole app:
"this is very, very important to me because I think it's gonna be the most
direct effect of my life financially." Wants everything centralized --
checking/savings/HYSA/investment/retirement accounts, credit card debt,
subscriptions, spend/budget -- plus AI insight on income/spend trends and
what's cuttable.

**Real live bank sync was ruled out, not just deprioritized.** Elo initially
assumed a "Google Sheets bank sync via account/card number" was achievable
for free -- it isn't: live balance/transaction sync from a real bank requires
going through an aggregator (Plaid being the standard one), and typing an
account/card number directly into a spreadsheet formula doesn't talk to a
bank at all. Checked Plaid's actual current pricing via WebFetch rather than
asserting from memory -- confirmed a real free development tier exists but
production use is metered per connected account, so "free forever" isn't a
promise safe to make. Told Elo this directly rather than build toward a
premise that doesn't hold. Live investment-price lookup (`GOOGLEFINANCE`-
style, ticker+shares) IS genuinely free and real (stock prices are public
data, unlike private bank balances) -- Elo's own research surfaced this
correctly -- but he explicitly deferred it: "we will figure the live part
later on, let's do csv export." **What got built instead:** balances entered
directly (same "manual entry now, live later" pattern this app already used
for `profile`/`habit_streak` before those had real integrations), and
transaction HISTORY via CSV import -- Elo downloads his own bank/card export,
uploads it here, nothing ever touches his real bank credentials, $0 cost,
matching a hard constraint he stated directly: "I honestly don't want to
spend any money at all with this one while still having a live update."

**Schema** (3 new tables, migration below) -- `finance_accounts` (balance,
type, `is_debt`, `sort_order`), `finance_transactions` (`account_id`,
`txn_date`, `description`, `amount` -- signed, negative = spend), 
`finance_subscriptions` (`amount`, `billing_cycle`, `is_active`). No CHECK
constraint on `type`/`billing_cycle` -- free text, matching this app's
existing convention for category-style columns (habits.category is the same
pattern) rather than a rigid enum that would need its own migration to
extend later.

**CSV import, `server.js`:** bank exports vary wildly (one signed amount
column vs. separate debit/credit columns, different date formats, extra
columns like a running balance) -- rather than hardcode one bank's layout,
`POST /api/finance/transactions/parse-csv` uses `csv-parse/sync` to
robustly split real CSV (handles quoted fields with embedded commas, unlike
a naive `.split(',')`), then sends the header + 5 sample rows to Claude via
`askClaudeStructured()` with a `ColumnMapSchema` (Zod) to identify which
columns are date/description/amount -- reusing the exact same "let Claude
read messy real-world structure" pattern already used for bank-agnostic
task/journal extraction elsewhere in this app. Returns a PREVIEW only,
nothing saved -- same review-before-create principle as CRM's AI ADD.
`POST /api/finance/transactions/commit` is the explicit second step that
actually inserts, once Elo's picked which real account the statement
belongs to (the parse step has no way to know that).

**AI insight, `POST /api/finance/insight`:** Sonnet (shared default, no
override) -- judging what's a real spending pattern worth flagging vs. noise
is exactly the kind of call worth the better tier, same reasoning already
applied to the HEALTH/JOURNAL insight generators. Prompt explicitly states
"this is spending-pattern feedback only, never investment or financial
advice" and instructs against inventing a pattern that isn't actually in the
data -- same safety framing HEALTH's goals already use for a sensitive
domain, applied here to money instead of the body.

**Real bug found and fixed before this ever ran once:** `GET
/api/finance/summary` and `POST /api/finance/insight` both called a
`missingTable(error, tableName)` helper that was never defined at module
scope -- would have crashed both routes with a `ReferenceError` the first
time either was ever hit with a real error (including the everyday
pre-migration 404 case). Caught immediately on the first local restart
(`SyntaxError: Identifier 'missingTable' has already been declared` --
turned out a helper with that exact name already existed, added earlier for
the sleep routes) before any curl test, not discovered later. Fixed by
reusing the existing shared helper instead of redeclaring it.

**Frontend (`client/src/pages/FinanceTab.js`, new):** net worth/assets/
debt/spend summary strip, accounts split into CASH & INVESTMENTS vs. CREDIT
& DEBT (click a balance to edit it inline), subscriptions list with a
monthly-equivalent total (yearly÷12, weekly×4.33), a CSV upload -> preview
table -> account picker -> IMPORT flow (`FileReader.readAsText()`, matching
this app's existing base64-file-handling convention but for text instead of
images), an AI INSIGHT card with a 30/60/90/365-day range picker, and a
recent-transactions list. Degrades gracefully pre-migration exactly like
`sleep_log`/`health_goals` did before their own migrations ran -- a real
404 from `/api/finance/summary` flips `financeMigrated` false and the tab
shows a plain "run the migration" message instead of an empty or broken
dashboard.

**Verified before calling this done:** `CI=true npm run build` compiles
clean (the exact command that's caught a real deploy-blocking issue once
before in this app -- see the Railway build-failure note further down);
restarted the backend and confirmed all 5 finance routes (accounts,
subscriptions, transactions, summary, insight) return a clean 404 with
`{error: "... table does not exist yet"}` pre-migration, not a raw 400 or a
crash; loaded the real FINANCE tab in a browser pre-migration and confirmed
it shows the "isn't set up yet" message with no unexpected console errors
(only the same three expected pre-migration 404s, matching the pattern
already documented for `profile`/`health_goals`).

**Full round-trip re-verified after Elo ran the migration (2026-09-01), all
test data cleaned up afterward:** created a real TEST Checking account
($1,500.50) and TEST Credit Card ($420.75 debt) and a TEST Streaming
subscription ($15.99/mo) via curl, confirmed `GET /api/finance/summary`
computed net worth/assets/debts/subscription-total correctly by hand-check;
built a synthetic 6-row bank-export CSV (never real bank data -- generated
locally, never pasted into chat) with a single signed-amount column, MM/DD/
YYYY dates, and a description field with an embedded comma inside quotes
(`"AMAZON.COM*A1B2C3, SEATTLE WA"`) specifically to stress-test `csv-parse`'s
quoted-field handling -- `POST /api/finance/transactions/parse-csv` parsed
all 6 rows correctly, Claude correctly identified the amount/date/description
columns and the MM/DD/YYYY format, dates normalized correctly to ISO, and the
quoted comma did NOT get misread as a column break. Committed the preview via
`POST /api/finance/transactions/commit` and confirmed all 6 rows landed
exactly as parsed via a fresh `GET /api/finance/transactions`.
`POST /api/finance/insight` against this real (synthetic) transaction data
correctly summarized income/spend, called out the two largest unlabeled
purchases as worth checking, and explicitly declined to call 6 transactions
across 6 days a "pattern" -- exactly the grounded, non-overclaiming behavior
this route's prompt was written for. Then a full live-browser pass: loaded
the real FINANCE tab and confirmed every number matched the API exactly;
clicked a real account balance, edited it inline, hit SAVE, and confirmed via
a fresh `GET /api/finance/accounts` that it was a genuine persisted write
(777.77), not just optimistic local state. All test accounts/subscription/
transactions deleted afterward via individual DELETE calls (not a bulk wipe);
confirmed via both a fresh curl and a **fresh browser tab** (this session's
known console-history-persists-across-reload quirk, documented elsewhere in
this file, means a same-tab reload isn't proof by itself) that FINANCE is
back to a genuinely empty state with zero console errors -- "No accounts
yet." / "No transactions yet." everywhere, not leftover test residue.

Migration (Supabase SQL editor):
```sql
CREATE TABLE finance_accounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  institution TEXT,
  current_balance NUMERIC(12,2) DEFAULT 0,
  credit_limit NUMERIC(12,2),
  is_debt BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE finance_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for public" ON finance_accounts FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE finance_transactions (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES finance_accounts(id) ON DELETE CASCADE,
  txn_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for public" ON finance_transactions FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE finance_subscriptions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  next_renewal_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE finance_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for public" ON finance_subscriptions FOR ALL USING (true) WITH CHECK (true);
```
Migration confirmed run 2026-09-01 -- FINANCE is fully live now, not just
code-complete. Nothing left to do here except actually use it.

## Calendar upgraded from write-through to a real daily sync with deletion handling (2026-08-31)
Same day as the write-through version above, Elo pushed back: "why can't we
make it better by having the memory of the entire google calendar." Fair
question -- the original scoping-down was about sequencing (no scheduler
existed in this app yet, nothing needed calendar history at rest), not a
hard limitation, and both of those reasons were gone within the same
session (the scheduler now exists; the insight feature now wants the
history). Also surfaced a real gap the write-through version could never
close on its own: it could add/update events but never learn about a
deletion -- something Elo cancelled in Google would just linger in the
local copy forever.

**`syncCalendarWindow()` (`lib/google.js`)** -- one API call per calendar
(not one per day, which would be needlessly slow across a 120-day window)
covering a rolling window, 30 days back through 90 days forward, across
every visible calendar. `persistAndReconcile()` (replacing the old
`persistEvents`) upserts by `google_event_id` same as before, but ALSO
diffs against what's already stored for that exact date and deletes
anything no longer present in the fresh fetch -- so a cancelled event
actually disappears from history, not just never-added. This same
reconcile logic now backs BOTH the wide window sync AND the original
single-day `listEventsForDate()` path (HOME/Telegram's live fetch), so a
day that's actively being viewed gets near-real-time deletion handling on
top of the once-daily full sweep.

**Scheduled via `lib/scheduler.js`, 3am daily, no Telegram message
involved** -- pure background maintenance, logged server-side only (same
"nothing for Elo to act on" pattern as any other infra task, unlike the
nudges which exist specifically to message him).

**Cost, since Elo asked before agreeing to build this:** effectively $0 --
Google Calendar API has a generous free quota nowhere close to being
threatened by one daily sync for one person, Supabase storage cost for a
few thousand small event rows is negligible, and the sync runs inside the
already-running server process, no new compute. Confirmed nothing here
touches the Claude/Anthropic billing this session already worked to bring
down.

**Verified directly against the real connected calendar, not just
re-read:** ran the actual sync -- 121 days covered, 87 real events found
across multiple calendars (Birthdays/Anniversaries, Events, Work, School)
in 17.4 seconds; spot-checked the stored rows matched exactly (calendar
name, title, times); confirmed `/api/analytics/correlation` now reflects
real busy-hour data pulled from this. **Reconciliation tested with a real
deletion scenario**, not just reasoned about: inserted a fake event row
directly into the table (simulating something Google no longer returns),
re-fetched that date through the live route, and confirmed the fake row
was correctly removed while the four real events for that day were left
untouched.

## Calendar history + proactive Telegram nudges (2026-08-31)
Elo picked two of the gaps flagged in an earlier "what could be better"
discussion: calendar data was never stored (so it couldn't feed
correlation/insight), and the Telegram bot was purely reactive (never
initiates anything). Detailed follow-up on the nudges specifically --
explicitly NOT a generic morning briefing (he already checks CRM/calendar
himself right after his phone-free morning routine, so that would be
redundant); the one morning nudge worth having is stale "THIS WEEK" tasks,
timed off his actual wake-up event rather than a fixed clock time.

**Calendar history, write-through, no separate sync job.** Calendar was
deliberately never persisted before now (HOME only ever needed a live
"today" view). Rather than build a real background sync (no scheduler
existed in this app until this same session), `lib/google.js`'s
`listEventsForDate()` now also upserts each event into a new
`calendar_events_log` table as a side effect of the same fetch HOME/
Telegram already make -- keyed by `google_event_id` so re-fetching the same
day refreshes rather than duplicates. **Real, accepted tradeoff:** coverage
depends on a day actually being looked at/asked about at least once -- a
day nobody ever views has no history. `getCorrelationData()`
(`lib/context.js`) now aggregates this into `calendar_events_count`/
`calendar_busy_hours` per day, and `/api/analytics/insight`'s prompt
(`server.js`) includes both, with an explicit instruction not to read a
string of zero-event days as "always free" since it may just mean the
calendar was never checked that day.

Migration (Supabase SQL editor):
```sql
CREATE TABLE calendar_events_log (
  id SERIAL PRIMARY KEY,
  google_event_id TEXT NOT NULL UNIQUE,
  event_date DATE NOT NULL,
  calendar_name TEXT,
  title TEXT,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  is_all_day BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE calendar_events_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for public" ON calendar_events_log FOR ALL USING (true) WITH CHECK (true);
```
Degrades gracefully like every other pre-migration table in this app --
confirmed directly: the live calendar route still returns real events
correctly even with the table missing (`PGRST205`, matched and silenced by
a regex check, not left to crash anything), and `/api/analytics/correlation`
returns `0`/`0` for calendar fields rather than erroring.

**Proactive Telegram nudges, new `lib/scheduler.js`** (added `node-cron` --
this app had no scheduler of any kind before now). All three are
deliberately conditional -- silent unless there's actually something to
say, matching Elo's own framing that the value is catching real misses,
not noise:
- **Morning stale-task nudge** (`lib/telegram.js`) -- NOT on the cron
  schedule at all; a `setTimeout` fired ~90 minutes after a real
  `end_sleep` execution (matching his stated routine length), checking for
  tasks in `timeframe: 'THIS WEEK'` with `created_at` older than 7 days.
  **Extended same day** to also flag `THIS MONTH` tasks, at a longer
  21-day threshold (3 weeks) -- a month-scoped task has more natural
  runway, and flagging it right at the ~30-day mark would just catch it
  as it's already about to expire rather than while there's still real
  time to act. Grouped into two labeled sections in one message when both
  fire together. Silent if none exist in either category.
- **Evening check-in, 9pm daily** (cron) -- open habits, no journal entry
  yet today (via `getEffectiveDate()`, consistent with the rest of the
  day-boundary system), or unfinished starred tasks. Silent if all three
  are already clear.
- **Food reminders, 10am/2pm/8pm daily** (cron) -- skipped if anything was
  logged to `nutrition_log` in the last ~90 minutes, so it doesn't
  double-ping right after a real log.
- `cron.schedule(...)` passes `timezone: 'America/Los_Angeles'` explicitly
  on every schedule rather than relying on the server's own `TZ` env var --
  this app has hit enough TZ-default bugs that being explicit here, not
  implicit, is the safer choice.

**Real, previously-undiscovered bug caught while building this:**
`POST /api/tasks` never explicitly wrote `created_at`, relying on the
column's own UTC-evaluated `DEFAULT NOW()` -- the same bug class already
fixed for `nutrition_log`/`journal_entries`, just missed here. Caught
because the morning nudge's stale-task detection depends on this column
being accurate; fixed to use `localTimestampStr()` like everywhere else.

**Verified directly against real data, not just re-read:** confirmed the
evening check-in correctly listed the real open habits and missing journal
entry for today; confirmed the food reminder correctly stayed silent given
a real meal logged 27 minutes earlier; inserted a real test task dated 11
days old and confirmed the stale-task detector correctly flagged it, then
deleted it; confirmed a real calendar fetch (Sep 21, 2026 -- Elo's actual
class schedule) attempted to persist and degraded silently pre-migration,
with the live calendar card itself unaffected either way.

**Still needs Elo:** run the migration above in Supabase's SQL editor for
calendar history to actually start accumulating -- nothing else changes
until then, the live calendar card already works exactly as before.

## Telegram agent's own sense of "today" ignored the bedtime-aware day boundary (2026-08-31)
Elo: past midnight last night, before going to bed, he tried marking his
Wind-Down Routine done via Telegram -- the bot asked whether he meant
"today" (the new calendar day) instead of just doing it, contradicting the
day-boundary rule already established for habits/journal (see the entry
below this one): before bed, it's still the previous day.

**Root cause:** `lib/agent.js`'s system prompt told the model "Today's
local date is X" using the plain calendar date (`localDateStr(new Date())`)
unconditionally -- it never knew about `getEffectiveDate()`
(`lib/habitDay.js`), the bedtime-aware date every backend habit/journal
route already enforces regardless of what date a caller sends. So the data
itself was never actually at risk (the backend overrides the date either
way), but the AGENT'S OWN REASONING used the wrong "today," making it ask a
confusing, blocking clarifying question instead of just doing the action.

**Fix:** `systemPrompt()` is now async and calls `getEffectiveDate()`
directly (same-process import, no HTTP round-trip). The model gets BOTH
dates explicitly labeled -- the literal calendar date for calendar
events/tasks/general awareness, and the effective date for habits/journal
specifically -- with an explicit instruction not to ask Elo which day he
means when they differ, just use the effective date. Computed once per
`runAgentTurn` call (not per internal turn), since a single call finishes
in seconds, well inside the window where the effective date can't change.

**Verified against the exact real scenario, not just re-read:** temporarily
set the most recent real bedtime 2 days back (simulating "hasn't gone to
bed since," deferring the effective date), then called `runAgentTurn('mark
my wind-down routine done')` -- it correctly asked which sub-tasks, with NO
mention of "today" ambiguity; followed up with "all of them" and confirmed
via `executeActions` that every sub-task and the cascaded parent wrote
`completed_date` as the DEFERRED date, not the literal new day. Reverted
every touched value (the 5 test sub-task completions and the real bed_time)
immediately after, confirmed via a fresh `GET` that real data matched
exactly what it was before the test.

## Telegram writes silently not happening: a real prompt-injection bug in the conversation-memory feature, plus a guaranteed internal-auth bypass (2026-08-29)
Elo tried going to bed and waking up via Telegram again -- this time the bot
never showed a Confirm button at all, just said something like "proposed
start sleep, confirmed and executed" (and the same for waking up), and
nothing landed on the dashboard. He suspected the Google-login gate again
and asked for the dashboard to be updatable from Telegram "even though my
dashboard mightve been logged out from google."

**Root-caused by re-reading my own conversation-memory code (2026-08-27),
not from logs this time.** `runAgentTurn` (`lib/agent.js`) injects a plain
`role: 'assistant'` line into history every time a write is proposed
(`'Proposed: X(...)'`) and `lib/telegram.js`'s `appendOutcomeNote` does the
same after a real Confirm (`'[Confirmed and executed: ...]'`). The model
sees these as things IT already said. On a later turn (e.g. if Elo's next
message wasn't a clean button tap -- another text message, a garbled
voice-note follow-up, anything before he actually pressed Confirm), Claude
could see its own prior "Proposed:"/"[Confirmed and executed:]" phrasing in
history and generate a plain-TEXT reply narrating a fake "confirmed and
executed" completion, with no real tool call and no button ever shown.
Nothing was actually written -- it just sounded like it was, exactly
matching what Elo described for both bedtime and wake-up.

**Fix:** both injected notes are now wrapped as `(Note: ...)` instead of
bare imperative-sounding lines, and the system prompt gained an explicit
instruction: these are historical facts to read, never to echo/paraphrase/
imitate, and Claude must never tell Elo something was "confirmed" or
"executed" unless a matching `(Note: confirmed and executed...)` line for
THAT SPECIFIC action already exists in history.

**Verified directly, both directions:** called `runAgentTurn` with a real
proposal in history but NO confirm note (simulating "button never
tapped") and asked "did that actually save?" -- it correctly did NOT
claim success, it safely re-proposed the action instead of hallucinating
a completion. Then repeated with a REAL `(Note: confirmed and executed...)`
appended (simulating a genuine button tap) and asked the same question --
it correctly said yes and described what was logged. Both outcomes are
exactly right.

**Second, independent fix, directly answering Elo's explicit ask:** a new
`lib/internalAuth.js` generates a random secret once per process
(`crypto.randomBytes`), shared automatically between `server.js` (checks
it) and `lib/tools.js`/`lib/telegram.js`'s own internal `fetch()` calls
(send it as `X-Internal-Secret`) purely because they're `require()`'d
within the same Node process -- no env var, no Railway action needed. This
is checked BEFORE the loopback-IP check in the auth gate, so the Telegram
agent's writes no longer depend on correctly detecting a loopback IP (which
had never actually been confirmed against Railway's real networking) or on
Elo's own browser session (PIN entered / Google logged in) at all --
exactly what he asked for, guaranteed by construction rather than by IP
heuristics.

**Verified this specifically, not just by inspection:** restarted the
backend with `AUTHORIZED_GOOGLE_EMAIL` set (matching production's real
auth-active state) and tested via the Mac's real LAN IP (a genuinely
non-loopback path, simulating what a loopback-detection failure on Railway
would look like) -- no credential still `401`s, the correct internal secret
`200`s, a wrong secret still `401`s. Since this mechanism can't be exercised
correctly from a separate test script (each `node -e` invocation is its own
process with its own freshly-generated secret; only genuinely matters
within the single real running process), this LAN-IP test is the closest
verification possible without a live Telegram round-trip on Railway itself.

**Real missed sleep logged from this request:** bed 2:00 AM / wake 10:00 AM
on `2026-08-29`, correctly labeled `2026-08-28` under the "night of" rule
above.

## Sleep entries now label by "night of," not wake date (2026-08-28)
Elo: HOME's SLEEP card could show today's date for a completed entry before
he'd gone to bed tonight -- confusing, since it read like it was describing
tonight's (not-yet-happened) sleep rather than last night's. Root cause:
`logged_date` was always the WAKE date -- a 1am bedtime is already past
midnight, so a night that's really "last night" from Elo's own perspective
got labeled with today's date.

**Fix:** `nightOfDate()` (`server.js`) -- a bedtime before ~6am now labels
the entry with the PREVIOUS calendar day instead of its own literal date,
matching how people actually talk about sleep ("I went to bed at 1am" still
means "last night"). Deliberately a fixed clock threshold, not a reuse of
the stateful bedtime-click day-boundary system built for habits/journal
(`lib/habitDay.js`) -- that one exists to answer "has a bedtime happened
yet," a different question from "which night does this specific completed
bedtime belong to" (this route only ever runs once bed has already
happened, so there's nothing left to defer). No migration needed -- pure
application-code fix, unlike the habit/journal day boundary.

**Real near-miss caught while testing:** simulating a late bedtime via
`sleep_pending` manipulation collided with the wake route's existing
"one row per `logged_date`" dedupe logic and overwrote Elo's real id-17
entry with test data, since the test's computed date matched that row's
old label. Caught immediately (not shipped blind) and restored with the
correct values.

**Historical entries relabeled for consistency**, not just the new logic
going forward -- both of Elo's other two real sleep rows had a bed_time
before 6am and were still labeled under the old wake-date convention,
which would have collided with newly-logged nights under the new rule:
id 13 (bed 2:20am) `2026-08-26` -> `2026-08-25`; id 17 (bed 1:00am)
`2026-08-27` -> `2026-08-26`. Also logged a real missed night from the
same request -- bed 1:00am/wake 10:45am on `2026-08-28`, correctly labeled
`2026-08-27` under the new rule, no quality given this time.

**Verified live, not just via the API:** confirmed via a fresh browser
reload that HOME's SLEEP card shows `2026-08-27` for the latest entry
while the header still correctly reads `AUG 28, 2026` -- the exact
distinction Elo's complaint was about -- and confirmed HEALTH's sleep
ring/bedtime/wake time still render correctly with no regressions.

## RESOLVED: the "waking up doesn't log" bug -- an uncaught 409 was crashing the whole server, not an auth issue
Root-caused from real Railway logs Elo pasted after being asked for them.
The earlier Google-login-loopback theory was wrong -- the actual cause was
much simpler and had nothing to do with auth: `bot.launch()` (`lib/
telegram.js`) never caught its own returned promise. Telegram's `getUpdates`
answers with a `409: Conflict` for a few seconds during every Railway
deploy, while the old container is still shutting down and the new one
starts polling -- normal, harmless, self-resolving *if something catches
it*. Nothing did, so it became an unhandled promise rejection and crashed
the **entire Express process**, not just the Telegram feature -- wiping
`pendingActions`/`conversationHistory` (both in-memory) for anyone with a
card open at that exact moment.

This explains exactly why bedtime kept working and wake-up didn't: going to
bed is one button tap (`start_sleep`, a single Confirm/Cancel), so it
rarely lands inside that few-second crash window. Waking up, after the
2026-08-28 redesign a few entries below, needs THREE separate taps
(confirm -> quality picker -> confirm again) -- three times the exposure to
the same narrow window, which is almost certainly why it was the one Elo
kept hitting, especially right after one of today's many deploys.

**Fix:** `launchWithRetry()` wraps `bot.launch()` properly -- on rejection,
logs the error and retries after 5s, up to 5 attempts, before giving up
loudly (so a genuine persistent duplicate-instance problem, not just a
transient deploy overlap, still surfaces in logs rather than silently
hiding forever). The whole server no longer goes down over a few seconds of
expected overlap during a deploy.

**Verified:** isolated unit test of the retry logic against a mock `bot`
object -- confirmed it retries on rejection, recovers once the mock starts
succeeding, gives up cleanly after exactly 5 attempts, and critically that
the Node process never crashes in any of these paths. **Could not
reproduce the real 409 itself** (that needs an actual second poller, i.e. a
real Railway deploy in flight) -- the fix targets the exact failure mode
in the real log Elo provided, but the true end-to-end fix (a wake-up
surviving an actual deploy-time restart without getting stuck) still needs
Elo to notice it not recurring over the next few deploys.

**Lesson for next time a Telegram bug looks auth-related:** check the
actual Railway logs before building a fix on a theory. The loopback-auth
suspicion was reasonable given the timing (Google login went live earlier
the same day) but was still just a theory -- asking for real logs found
the real, much simpler cause in one read.

## Claude model split: Opus -> Sonnet/Haiku by feature (2026-08-28)
Elo asked me to check API costs -- $2 in 3 days, more than he expected. Root
cause: every single Claude call in this app, across every feature, ran on
Opus 5 (the most expensive tier, $5/$25 per million input/output tokens vs.
Sonnet 5's $2/$10) -- including the Telegram bot, which is by far the
highest-volume call site (every message, up to 5 calls per message via the
read-tool loop). Compared per-tier tradeoffs against what each feature
actually needs, Elo picked a split: Sonnet for anything that has to read
nuance or avoid overclaiming a pattern, Haiku for bounded/low-stakes
extraction.

- **Sonnet 5** (`claude-sonnet-5`): the Telegram bot (`lib/agent.js` --
  highest volume by far, and Sonnet is Anthropic's own recommended tier for
  production tool-calling agents, not a quality compromise), journal
  mood/theme extraction (becomes real history other features read back
  later, so a bad read compounds), and both insight generators
  (`/api/analytics/insight`, `/api/health/insight` -- judging whether a
  pattern is real vs. forced is exactly the kind of call worth the better
  tier). This is now `lib/anthropic.js`'s shared default, so these call
  sites needed no code change, just a comment documenting the choice.
- **Haiku 4.5** (`claude-haiku-4-5-20251001`): nutrition macro estimates
  (highest-frequency of the remaining features -- every food log), AI task
  parsing, BRAIN entity briefings, journal recaps -- all bounded,
  structured, low-stakes-if-occasionally-terse.
- `lib/anthropic.js`'s `askClaude`/`askClaudeStructured` both gained an
  optional `model` param (default `claude-sonnet-5`); each `server.js` call
  site either relies on that default or passes the Haiku id explicitly.

**Real bug caught immediately by testing, not assumed:** Haiku 4.5 rejects
`output_config.effort` outright (`400: This model does not support the
effort parameter`) -- Sonnet and Opus both accept it, Haiku doesn't. Fixed
with a `supportsEffort(model)` check that omits the field entirely for any
`claude-haiku-*` model. Caught because the very first live test (nutrition
estimate) failed instead of being assumed to work from reading the diff.

**Verified every one of the 8 call sites for real, not just re-read:** all
four Haiku routes (nutrition estimate, task parsing -- including the exact
HEMS-vs-WORK classification the original misclassification bug was about,
confirmed still correct -- BRAIN briefing, journal recap) tested live with
real prompts and produced good-quality output; both Sonnet insight routes
correctly identified sparse real data and declined to overclaim a pattern,
matching the whole reason they stayed off Haiku; the Telegram agent
(`runAgentTurn`) tested with both a read-only question and the habit-
subtask-clarification scenario, both producing the same quality of answer
seen on Opus. Two routes (journal recap, mood/theme extraction) write to
Elo's one real journal entry -- captured its exact `recap`/`mood`/`themes`
values before testing, ran the real calls, then restored the exact
original values afterward, confirmed via a fresh `GET`.

## Telegram sleep/wake: explicit confirm -> quality -> confirm again (2026-08-28)
Elo reported waking up via Telegram wasn't updating the dashboard (tested
twice, same result), and separately asked for a specific 3-step flow: going
to bed gets its own Confirm/Cancel (already true -- `start_sleep` was always
a normal write tool); waking up should ALSO get an initial Confirm/Cancel,
THEN the 1-5 quality picker, THEN one more Confirm/Cancel before anything is
actually saved -- not the single-step "pick a quality and that's the
confirm" flow built the day before.

**Rebuilt in `lib/telegram.js`:** the old special-case (an `end_sleep`
proposal skipped the normal confirm card and went straight to the quality
picker) is gone -- every proposal, wake-up included, now goes through the
same `sendConfirmCard()` first. Tapping Confirm checks for an `end_sleep`
action that hasn't had its quality asked yet (`qualityAsked` flag, not
`!input.quality` -- that would misfire on "Skip", which sets `quality:
null`, sending it back into the picker in a loop); if found, it edits the
message into the 1-5/Skip/Cancel picker instead of executing. Picking a
quality sets `quality` + `qualityAsked:true` and edits the message into a
final Confirm/Cancel card (reusing the same `sendConfirmCard`) -- only that
second Confirm actually calls `executeActions`. Cancel at any of the three
stages cancels the whole batch, unchanged.

**Verified as fully as possible without a live Telegram chat:** simulated
the exact tap sequence in code against real data (propose -> confirm ->
quality picker shown -> pick 4 -> final card shows "quality 4/5" -> final
confirm -> real `sleep_log` row written and confirmed via a fresh `GET`),
and confirmed the `qualityAsked` marker correctly prevents the picker from
re-appearing after "Skip". Test row deleted afterward. **Could not test the
actual Telegram button taps** -- same standing limitation as every other
Telegram-specific change in this file.

**The reported bug itself is still open, not yet root-caused.** The
`end_sleep` execution path tested clean end-to-end against the local
backend, but local testing can't rule out a production-only cause -- the
leading theory is the Google-login access-control gate added earlier the
same day (`server.js`): the Telegram agent's internal tool calls are
supposed to be exempt via a loopback-IP check, and that specific exemption
has never actually been verified against Railway's real environment (every
"verified end-to-end" Telegram test done locally today ran with
`isAccessControlled()` false the whole time, since neither `DASHBOARD_PIN`
nor `AUTHORIZED_GOOGLE_EMAIL` is set in local `.env` -- meaning a
loopback-detection bug specific to Railway could exist without anything
local ever having exercised it). Needs Railway logs from a real wake-up
attempt to confirm or rule out before a fix can be written with confidence.

## Bedtime-aware day boundary for habits + journal (2026-08-27/28)
Elo: staying up past midnight was resetting his habits, and journaling after
midnight (before going to bed) dated the entry to a day that "hasn't
happened yet" from his own perspective. His exact rule, worked out over a
few messages: **habits/journal stay on the previous day until "went to bed"
is actually clicked, UNLESS bed happened before midnight, in which case the
ordinary midnight reset applies exactly as it always has.** Also asked for
a way to undo an accidental "went to bed" click, since the whole scheme
hinges on that click meaning something.

**The rule, as code:** `lib/habitDay.js`'s `getEffectiveDate()` computes
`effectiveDate = min(realToday, dateOf(mostRecentBedtimeClick) + 1 day)`.
Bed at 11pm: `mostRecentBedtime` is today, so `+1 day` = tomorrow, but
`realToday` is still today until midnight actually passes -- `min()` holds
at today right up until then, then flips the instant midnight arrives (the
ordinary reset, unchanged). Awake past midnight with no bedtime click yet:
the last real bedtime is still yesterday's, so `+1 day` lands one day behind
`realToday`, which has already moved further -- `min()` holds at that
earlier date until a fresh "went to bed" click updates `mostRecentBedtime`,
at which point it advances immediately, at that exact click, not before.
`mostRecentBedtimeClick` reads `sleep_pending.bed_time` first (a click still
in progress), falling back to the most recent completed `sleep_log.bed_time`
if nothing's currently pending.

**Backend, made authoritative everywhere "today" mattered for habits/journal**
(same "server computes it, never trusts the caller" pattern already used for
the habit-subtask guard above):
- New `GET /api/today` -- `{date}`, the effective date, for the frontend to
  fetch instead of computing its own literal calendar date.
- New `POST /api/sleep/bedtime/cancel` -- undoes an accidental "went to bed"
  click. Clears `sleep_pending` back to null with no `sleep_log` row ever
  created, so it's as if it never happened, including for
  `getEffectiveDate()` itself (which reads `sleep_pending` directly).
- `PUT /api/habits/:id` and `PUT /api/habit-subtasks/:id` both now pin
  `completed_date` to `getEffectiveDate()` whenever marking something done,
  ignoring whatever date the caller sent -- closes this for every caller
  (dashboard, Telegram, anything future) at once, same as the sub-task guard.
- `POST /api/journal` defaults `entry_date` to `getEffectiveDate()` when the
  caller doesn't specify one. Also fixed a real related bug caught in the
  same pass: `created_at` relied on the column's own `DEFAULT NOW()` (UTC,
  unfixed) instead of `localTimestampStr()` -- the same bug class already
  fixed for `nutrition_log`/`habit_completions`/`tasks`, just missed here.
  Found it because a real voice-note entry's `created_at` showed ~7 hours
  ahead of the actual local submission time.

**Frontend** (`client/src/App.js`): new `effectiveHabitDate` state, fetched
on load and refreshed after any bed/wake/cancel action (exactly the events
that can change it). The single `todayStr` that already drove habit-done
rendering and the streak logic (both already centralized before this
change) now prefers `effectiveHabitDate` over a fresh `localDateStr(now)`
call, and so do `toggleHabit`/`toggleSubtask`/`deleteSubtask`'s own local
date computations and the journal add-form's date-picker default. A "Not
really — cancel" link appears next to "In bed since {time}" on HOME's SLEEP
card whenever a bedtime is pending, calling the new cancel route.

**Telegram** (`lib/tools.js`): new `cancel_sleep` write tool (confirm
required, same as every other write) mapped to the new cancel route.
`create_journal_entry`'s executor now fetches `/api/today` instead of doing
its own `localDateStr(new Date())` math, so a voice-note journal entry gets
the same effective-date treatment as the dashboard. `toggle_habit`/
`toggle_habit_subtask` needed no changes -- the backend is authoritative
now regardless of what date they send.

**Verified directly against real data, not just "the code looks right,"**
using temporary manipulation of `sleep_pending`/`sleep_log` timestamps
(restored to their exact real values afterward, confirmed via a final full
sanity check): confirmed the deferred case (last bedtime 2 days ago -- via
both the `sleep_pending` path and the completed-`sleep_log`-fallback path
independently -- effective date correctly held at the earlier date, not the
real calendar date); confirmed clicking "went to bed" immediately advances
the effective date to match real today; confirmed cancelling a pending
bedtime correctly falls back to real prior history (not just "revert to
some default"); confirmed a habit toggle during the deferred state wrote
`completed_date` as the deferred date, ignoring both the caller's own value
and the literal calendar date; confirmed a journal entry created with no
`entry_date` during the deferred state correctly defaulted to it too, with
`created_at` landing at genuine local time. Live-browser-tested the actual
"went to bed" -> "Not really — cancel" round trip on HOME, confirmed via a
fresh `GET /api/sleep/pending` that the cancel was a real persisted write,
not just optimistic UI. Tested `cancel_sleep` end-to-end through the real
agent with a natural phrasing ("oops that went to bed click was an
accident, undo it") and confirmed it resolved and executed correctly.

## Telegram: fixed Korean mis-transcription + real conversation memory (2026-08-27/28)
Elo: voice notes were sometimes transcribed in Korean instead of English, and
separately, "I want my telegram bot to be a lot smarter than it is now, it
should be able to determine what I need based on me mumbling ... like what
you can do as Claude AI."

**Transcription bug, root cause + fix:** `lib/transcribe.js`'s Whisper call
never passed a `language` param -- without one, Whisper auto-detects the
spoken language from the audio itself, and a quiet/mumbled/short note
(exactly what voice notes to this bot tend to be) is exactly the kind of
input that detection can misfire on. Fixed by pinning `language: 'en'`
explicitly, since English is the only language Elo actually speaks into
this bot.

**"Smarter" -- the real gap was conversation memory, not model quality.**
Every single message previously started `runAgentTurn` from a completely
blank slate: no memory of anything said a moment earlier, in either
direction. That's a fundamentally different experience from talking to
Claude.ai (where the whole conversation is visible), and it's a concrete,
fixable architecture gap, not a vague "make it smarter" ask -- a loose
follow-up reply like "yeah both of them" is only answerable if the bot
remembers it just asked which sub-tasks were done.
- **`lib/agent.js`**: `runAgentTurn(userText, history)` now accepts and
  returns a running message history in Anthropic's own message format.
  Write-tool proposals are recorded into history as a plain-text summary,
  not the raw `tool_use` blocks -- a `tool_use` block requires a matching
  `tool_result` in the very next message, which a later plain-text reply
  can't supply (Confirm/Cancel happen out-of-band via a button tap, not as
  a model turn), so storing raw tool_use there would make the next real API
  call invalid. Read-tool `tool_use`/`tool_result` pairs stay raw (already
  correctly paired within the same turn, safe to keep).
- **`lib/telegram.js`**: new `conversationHistory: Map<chatId, messages[]>`,
  same in-memory/resets-on-restart tradeoff as `pendingActions`. Threaded
  into `handleUserMessage` (both the text and voice paths, since both
  already shared this function). `trimHistory` caps it at 20 messages,
  but only ever cuts at a genuine fresh-user-text boundary -- never
  mid-way through a `tool_use`/`tool_result` pair, which would otherwise
  leave a dangling, invalid `tool_result` with no matching `tool_use`
  before it on the next call.
- **Confirm/Cancel now write back into history too** (`appendOutcomeNote`)
  -- those taps happen out-of-band as button presses, not chat messages, so
  without this the next message would have no idea whether the last
  proposal actually went through, making "did that log?" unanswerable.
- **System prompt** (`lib/agent.js`) gained an explicit instruction to read
  past small transcription glitches and loose/mid-thought phrasing the way
  a typo gets read past, and to use the conversation history + real data
  from `get_*` tools to fill in what's left implicit, rather than defaulting
  to a clarifying question. Also tightened the habit-sub-task clarifying
  question specifically (see the entry above this one): it must now say
  which sub-tasks are ALREADY done vs STILL open, not just list every
  sub-task name -- a flat list is exactly what made a real test's "yeah
  both of them" unresolvable (ambiguous against 5 items instead of an
  obvious 2), caught and fixed during this same pass.

**Verified end-to-end, not just "the code looks right":** direct
`runAgentTurn` calls against real habit data -- first with a fresh `[]`
history (correctly asked which of Morning Routine's sub-tasks were still
open, explicitly separating already-done from open), then fed that
returned history into a second call of literally `"yeah both of them"` with
zero restated context, and it correctly resolved to `toggle_habit_subtask`
for exactly the two real open sub-tasks (Yoga, Breakfast) -- proving both
that history actually carries across calls and that the improved
clarifying-question phrasing gives a short reply something concrete to
resolve against. Ran `executeActions` on the result and confirmed via a
fresh `GET /api/habits` that both sub-tasks and the cascaded parent
correctly landed as done. All test completions reverted afterward -- this
testing happened right at a real midnight rollover to 2026-08-28, so the
final state was reset to "nothing logged yet today," matching reality
rather than leaving fake completion data on a day Elo hadn't used the app
yet. **Could not test a real voice note or a real multi-message Telegram
exchange** -- same limitation as every other Telegram-specific test in this
file; the mechanism was verified by calling `runAgentTurn`/`executeActions`
directly against real data, not through an actual Telegram round trip.

## Real bug: Telegram could mark a habit-with-subtasks done without its subtasks (2026-08-27)
Elo: asked the Telegram bot to check off Morning Routine (which has 5 sub-
tasks), and it just marked the whole habit done without asking which
sub-tasks he'd actually finished or touching any of them -- "the main habit
shouldn't be able to check if the subtask is unchecked," and asked for it
fixed on both "the dashboard end and the telegram bot intelligent end." He
also flagged this applies to every habit with sub-tasks, not just this one --
the fix below is fully generic, keyed off `habit_subtasks` presence, never
hardcoded to a specific habit.

**Root cause:** `toggle_habit`'s executor (`lib/tools.js`) sends a plain
`{completed_today, completed_date}` PUT to `/api/habits/:id` -- the SAME
route the dashboard's own non-subtask checkbox uses. That route accepted
this blindly from ANY caller with zero awareness of sub-tasks -- a known,
documented limitation from the original 2026-08-26 agent build ("habits with
habit_subtasks aren't individually addressable via chat"), never actually
closed until now.

**Fix 1 -- dashboard/backend end, closes it for every caller:**
`PUT /api/habits/:id` (`server.js`) now checks, whenever a caller tries to
set `completed_today`/`completed_date`, whether that habit has any
sub-tasks; if it does, the caller-supplied value is ignored and the field is
recomputed live from the real sub-task state instead ("are ALL of today's
sub-tasks actually done?"). This closes the loophole structurally --
regardless of what the Telegram agent, a future integration, or a stray curl
call sends, a habit with sub-tasks can never be marked done while any
sub-task is unchecked, and can't be falsely marked NOT done while they're
all actually checked either (same derived-value rule, both directions).

**Fix 2 -- Telegram "intelligent" end:** new `toggle_habit_subtask` write
tool (`lib/tools.js`) addresses one sub-task at a time via the existing
`PUT /api/habit-subtasks/:id` (which already cascades the parent habit's own
completion once every sub-task is done -- nothing new needed there).
`toggle_habit`'s own description now explicitly warns it's a no-op on a
habit with sub-tasks. The agent's system prompt (`lib/agent.js`) was
extended with explicit instructions: for a habit with sub-tasks, never call
`toggle_habit`; if Elo's message names specific sub-tasks (or says "all of
them"), map them to the real sub-task labels from `get_habits` and propose
`toggle_habit_subtask` per one; if his message doesn't say which ones (e.g.
just "check off morning routine"), ask a plain-text clarifying question
naming the habit's actual sub-tasks and wait for his answer instead of
guessing or marking the whole thing.

**Verified end-to-end, not just read back:** reproduced the exact bug first
(temporarily unchecked one real sub-task, sent the exact old buggy PUT body
directly at `/api/habits/:id`, confirmed the OLD code path would have
accepted it -- then confirmed the NEW guard correctly overrides it back to
`completed_today:false`); called `runAgentTurn('check off my morning
routine')` directly against the real habit data (one sub-task deliberately
left incomplete) and got back a real clarifying question naming the exact
open sub-tasks, not a silent complete; followed up with `runAgentTurn("I
finished yoga and breakfast this morning")` and got back correctly-resolved
`toggle_habit_subtask` proposals for exactly those two real sub-task ids;
ran `executeActions` on them and confirmed via a fresh `GET /api/habits`
that both sub-tasks and the cascaded parent were correctly marked done.
Also regression-checked a habit WITHOUT sub-tasks (Working Out) still
toggles directly with no interference from the new guard. Every real
sub-task/habit state touched during this testing was restored to its exact
original value afterward, confirmed via a final full habit-by-habit sanity
check against real data -- learned from testing carefully this time,
unlike the sleep-data incident earlier this same day.

## Sleep UX refinements + Telegram wake-up quality picker (2026-08-27)
Elo, in one message: (1) HOME's SLEEP card should show only the single most
recent night, not a running list -- older nights already live in HEALTH;
(2) an edit mode to correct an already-logged night's hours and quality
emoji after the fact; (3) the Telegram bot never asked how he felt after
"I woke up" -- wants a clickable 1-5 picker, not silent logging with no
quality.

**1. HOME's SLEEP card, single-entry only.** `sleepLog.slice(0, 3)` ->
`sleepLog[0]` (`HomeTab.js`), label changed "RECENT" -> "LATEST". No backend
change -- HEALTH's own trend/day-by-day view already reads the full
`sleep_log` history independently, so nothing needed to "move" data there;
it was always there.

**2. Sleep edit mode.** New `PUT /api/sleep/:id` (`server.js`, same
"trust the body directly" convention as every other PUT in this file) --
updates `hours`/`quality` only, bed_time/wake_time stay whatever the
original bed/wake click recorded (editing those wasn't asked for). HOME's
SLEEP card gained a pencil icon next to the latest entry
(`startEditSleep`/`saveEditSleep`/`cancelEditSleep` in `App.js`) that swaps
the row for an hours input + the same 1-5 quality-emoji picker already used
at wake-time, styled to match. Optimistic UI, fire-and-forget write -- same
convention as the rest of this file.

**3. Telegram wake-up quality picker.** `end_sleep`'s existing `quality`
input was always optional and silently omitted if Elo didn't mention a
number -- there was no follow-up ask. Handled deterministically in
`lib/telegram.js`'s `handleUserMessage`, not left to the model's judgment:
if a proposed `end_sleep` action has no `quality`, the normal Confirm/Cancel
card is replaced with a 1-5 button row (plus Skip/Cancel) -- tapping a
number IS the confirmation, no separate confirm step after. Any other
actions bundled in the same message (e.g. "I woke up and did my workout")
still execute together with it once a number's picked, just summarized
above the picker instead of behind a plain Confirm button. New
`bot.action(/^sleepq:(\d|skip)$/, ...)` handler fills the quality into the
already-pending `end_sleep` action and runs `executeActions` on the whole
batch, same as a normal Confirm tap.

**Verified:** full round trip on the new PUT route (logged a real test
night, edited hours 0->7.5 and quality 3->5 via curl, confirmed via a fresh
GET, deleted); a live browser pass of the edit UI itself (clicked the
pencil, changed the hours input and quality emoji, hit Save, confirmed the
row updated with no console errors, then confirmed via the API directly
that it was a real persisted write, not just optimistic local state); and
confirmed HEALTH's SLEEP ring/trend are unaffected (still reads the full
history correctly). **Could not test the Telegram button flow end-to-end**
-- same limitation as the voice-note testing earlier in this file, this
needs a real tap inside Elo's actual Telegram chat; the code path was
checked by reading it against the existing, already-verified confirm/cancel
handlers it's structurally identical to, but this specific interaction
hasn't been mechanically exercised.

## Full-stack audit before real daily use (2026-08-26) -- TZ bug + open API
Elo, right before starting real daily use of the dashboard: "why does my telegram
bot think today is august 27th? ... check for all the bugs ... from the backend
to the frontend, to the localhost, to railway to telegram to every possible
check. fix it immediately if there are any decision making process please let
me know." Two real, previously-unknown issues found -- one fixed outright, one
that needed (and got) a real decision from Elo first.

**1. RESOLVED (code-side) but needs a Railway action from Elo: no timezone set
on the production server.** Root cause of the Telegram "today is Aug 27" report,
and bigger than Telegram -- this is the exact "DEPLOYMENT RISK" flagged in an
earlier audit (see the note near the bottom of the schema section) coming true
for real. Every "local time" helper in this app (`localDateStr`,
`localTimestampStr`, the hour-of-day math in `/api/analytics/habits`) reads the
SERVER process's own OS timezone via bare `d.getHours()`/`d.getFullYear()` --
correct by design for a single-user app where server and user share a
timezone, which was true on localhost but stopped being true the moment this
deployed to Railway (defaults to UTC, ~7-8 hours ahead of Elo's Pacific time).
Confirmed live, not just theoretically: loaded the actual production site and
found HOME's NUTRITION card showing "0 meals logged today" even though a real
meal had been logged that day -- Railway's server-side "today" filter was
already off by a calendar day. **Fix is a single env var, no code change**:
add `TZ=America/Los_Angeles` in Railway's Variables tab. This corrects every
server-side "what is today"/"what hour is it" calculation at once (analytics,
nutrition/journal/task date defaults, sleep bed/wake math, the Telegram
agent's own sense of "today") since it's a Node-wide setting, not a per-file
fix. **Still needs Elo to actually add it in Railway** -- I can't touch
Railway's config myself.

**2. RESOLVED with a real decision from Elo: the entire API had zero
authentication.** Found while auditing `server.js`: `app.use(cors())` wide
open, no auth middleware anywhere -- every route (read AND write: create/
delete tasks, journal entries, health data, sleep logs, literally everything)
was reachable by anyone who had the Railway URL, no login at all. This is the
exact "fix before deploying anywhere public" note from the schema section's
Security callout, never actually built, now genuinely live. Real risk wasn't
just data exposure -- the AI-backed routes (`/api/tasks/parse`,
`/api/nutrition/estimate`, journal summaries, entity briefings,
`/api/analytics/insight`) could be hit by anyone to burn Elo's Anthropic/
OpenAI quota for free, the same abuse class as the already-removed
`/api/_dev/agent-test` route, just covering the whole app instead of one
route. Asked Elo how he wanted to handle this rather than silently picking an
approach (auth changes his own daily access flow, worth his call) -- he chose
a simple PIN prompted every time he opens the dashboard, not a full login
system.
- **`server.js`**: new `DASHBOARD_PIN`-gated middleware on `app.use('/api',
  ...)`, placed right after the JSON body parser, before any route
  definitions. Degrades gracefully exactly like every other optional-config
  feature in this app (`health_goals`/`sleep_log` before their migrations
  ran) -- if `DASHBOARD_PIN` isn't set, it's a complete no-op and every route
  stays open, so deploying this code before the env var exists doesn't break
  anything. New `POST /api/auth/verify` route does the actual pin comparison
  (also a no-op `{ok:true}` when unconfigured). Two categories of exemption,
  both necessary: (a) loopback requests (`127.0.0.1`/`::1`) skip the check
  entirely -- this is what lets the Telegram agent's own tool executors
  (`lib/tools.js`/`lib/telegram.js`, which `fetch()`
  `http://localhost:PORT/api/...` from inside the same Railway
  container/process) keep working without threading the PIN through every
  executor, since those calls never actually leave the container and arrive
  as genuine loopback connections, distinct from real external traffic
  arriving over Railway's public network interface; (b) Google's OAuth
  redirect routes (`/api/integrations/google/auth`,
  `/api/integrations/google/callback`) are explicitly exempted since they're
  plain browser navigations (`window.location.href` / a redirect from
  Google), which can't carry a custom header the way `fetch()` can.
- **`client/src/PinGate.js`** (new) -- a full-screen lock component wrapping
  the whole app. Checks `sessionStorage` (deliberately not `localStorage` --
  clears on tab/browser close, matching Elo's own "every time I log on"
  framing rather than "once ever") for a stored PIN on mount, verifies it
  against `POST /api/auth/verify`; shows a PIN entry screen if missing or
  wrong, renders the real app once verified.
- **`client/src/index.js`** -- patches `window.fetch` once at startup to
  auto-attach the entered PIN as an `X-Dashboard-Pin` header on every
  `/api/...` call. App.js has roughly 50 raw `fetch('/api/...')` call sites
  built up over every earlier phase of this project -- patching fetch once
  here, rather than threading a header through all of them individually, was
  deliberate to avoid touching that much working code for a cross-cutting
  concern.
- **Verified for real, not just "it compiles":** direct `curl` tests proved
  the server-side split is genuine -- hitting the backend via `localhost`
  (loopback) always succeeded regardless of PIN (the intentional internal-call
  exemption), so verification specifically used the Mac's real LAN IP to
  simulate a genuine external, non-loopback request: no header → `401`, wrong
  PIN → `401`, correct PIN → `200`, and the Google OAuth exempt path stayed a
  clean `302` throughout. Then a full live-browser pass of the actual
  `PinGate` UI: cleared `sessionStorage`, reloaded, confirmed the lock screen
  renders; submitted a wrong PIN, confirmed "Wrong PIN." shows and access
  stays blocked; submitted the correct PIN, confirmed the real app loaded
  with every data fetch (`/api/entities`, `/api/tasks`, `/api/habits`, etc.)
  returning `200`. Re-ran `CI=true npm run build` after these changes (the
  exact command that failed once before on a different bug -- see the
  Railway deployment section below) and confirmed it still compiles clean,
  no new lint issues introduced.
- **Still needs Elo:** choose an actual PIN value and set `DASHBOARD_PIN` to
  it in Railway's Variables tab (and optionally in local `.env` too, though
  local dev has no real need for it since only Elo's own Mac can reach
  `localhost` anyway) -- I don't choose or see the real value, same handling
  as every other credential in this project.

**Also audited, no issues found:** grepped for `dangerouslySetInnerHTML`/
`eval`/`new Function` (none), grepped for accidentally-committed secret
patterns across `client/src`/`server.js`/`lib/` (none), confirmed `.gitignore`
still correctly excludes `.env`, re-ran `CI=true npm run build` (clean, no
regressions since the last ESLint-under-CI fix), and did a live click-through
of every tab (HOME, CRM, BRAIN, JOURNAL, HEALTH, FINANCE) on both localhost
and the real Railway production URL checking console errors and network
requests -- zero errors, zero failed requests anywhere, including confirming
the earlier `/api/profile`/`/api/health/goals` 404s (from back when those
tables' migrations hadn't run yet) are genuinely gone now, not just
undocumented.

**Same-day follow-up: the "not transferring" report turned out to be the same
TZ bug, plus Google Sign-In added as a second access method.** After the PIN
work above, Elo reported (a) the TZ fix from earlier in this same session
didn't actually take -- Railway still computed "today" as Aug 27 -- and (b)
food logged via localhost wasn't showing up on the live site. Diagnosed both
directly rather than guessing:
- **(a):** confirmed live via `GET /api/health/data?days=1` against
  production -- still returned `date: "2026-08-27"`. Elo's own description of
  what he'd entered ("American california") is almost certainly the actual
  bug: Node's `TZ` env var needs the exact IANA identifier
  `America/Los_Angeles` -- an unrecognized string is silently ignored (no
  error), falling back to UTC, which matches exactly what was observed. Told
  Elo to double check the literal value in Railway's Variables tab.
- **(b):** proved this is the SAME bug, not a second one, with a real round
  trip: logged a real test food item via the local backend, confirmed it
  existed via a local `GET /api/nutrition` (`logged_date: "2026-08-26"`), then
  queried the exact same row via `GET /api/nutrition` on the live Railway URL
  -- came back empty. Root cause: `GET /api/nutrition` filters
  `logged_date = today`, and `today` is computed by whichever server answers
  the request (`server.js:485`) -- locally that's correctly Aug 26, on
  Railway (still UTC per the unfixed TZ bug above) it's Aug 27, so the row
  genuinely exists in the one shared Supabase database both environments
  already use, it's just filtered out of "today" by Railway's wrong clock.
  **There was never a missing sync feature to build** -- local and production
  have always shared one database; once the TZ value actually takes effect,
  this resolves itself with no code change. Test row deleted after
  confirming.

**Google Sign-In added as a second access method, alongside the PIN.** Elo,
in the same message: "I will setup the password/pin later ... I also want a
Login to Google in order to access the website." Extended the access-control
work from earlier in this section rather than replacing it -- `server.js`'s
gate now accepts EITHER a valid `X-Dashboard-Pin` header OR a valid Google
session (`X-Session-Token`), whichever is configured; access is open only
when NEITHER `DASHBOARD_PIN` nor `AUTHORIZED_GOOGLE_EMAIL` is set, same
graceful-degradation rule as before.
- **`server.js`**: added `google-auth-library`'s `OAuth2Client` (already a
  transitive dep of `googleapis`, added directly to `package.json` rather
  than relying on that implicitly). New `POST /api/auth/google-verify` --
  verifies the ID token credential Google's own Sign-In button hands back
  (`verifyIdToken`, checked against `GOOGLE_CLIENT_ID` as audience), then
  checks the token's email against `AUTHORIZED_GOOGLE_EMAIL` (a single
  allowed address -- this is a single-user app, not a multi-account one) and
  `email_verified`. On success, issues a random session token
  (`crypto.randomUUID()`) stored in an in-memory `Map` (`googleSessions`,
  30-day TTL) -- **known limitation, flagged not silently accepted: this
  resets on every redeploy**, meaning a fresh Google sign-in is needed after
  each `git push` (which happens often on this project). Worth moving to a
  real `sessions` table later if that becomes annoying enough to bother Elo;
  not built now since it's easy to add on top later and wasn't asked for.
  New `GET /api/auth/config` (unauthenticated by design -- a Google client ID
  isn't secret, and the response reveals only which methods are turned on,
  not any actual PIN/session value) tells the frontend which method(s) are
  live so the gate UI only shows what's actually usable.
- **`client/src/PinGate.js`** rebuilt (same file, same role, outgrew its
  original name) to fetch `/api/auth/config` on mount and render whichever
  of the two methods are enabled -- a real "Sign in with Google" button
  (rendered by Google's own `accounts.google.com/gsi/client` script, loaded
  dynamically only when Google login is actually enabled) and/or the
  existing PIN box, with an "OR" divider when both are live. The Google
  session token is stored in `localStorage` (persists across browser
  restarts, matching normal "stay signed in with Google" behavior) --
  deliberately different from the PIN's `sessionStorage` (clears on tab
  close, matching Elo's own "every time I log on" framing for that method
  specifically); this is an intentional difference between the two methods,
  not an inconsistency to fix.
- **`client/src/index.js`**'s fetch patch extended to attach whichever
  credential is present (`X-Dashboard-Pin` from `sessionStorage`,
  `X-Session-Token` from `localStorage`, either/both/neither).
- **Verified directly:** `GET /api/auth/config` correctly toggles
  `pinEnabled`/`googleEnabled` based on which env vars are set; a garbage
  credential to `/api/auth/google-verify` fails cleanly (`401`, server stays
  up, confirmed with a follow-up request) rather than crashing the process;
  re-ran the same LAN-IP external-request test from the PIN work above with
  only Google login configured -- no credential still `401`s, a fake session
  token still `401`s, the internal loopback exemption still `200`s (proving
  the Telegram agent's own internal tool calls stay unaffected regardless of
  which access method is active); and a live browser check confirmed the
  real Google-branded "Sign in with Google" button renders correctly once
  `AUTHORIZED_GOOGLE_EMAIL` is set. **Could not test a full real sign-in**
  (needs an actual logged-in Google session in a real browser, which this
  environment doesn't have) -- that part needs Elo himself.
- **Still needs Elo, two things:**
  1. Set `AUTHORIZED_GOOGLE_EMAIL` in Railway's Variables tab to the Google
     account that should be allowed in (his own -- `el200594@gmail.com`,
     stated directly here since it's not a secret, just an address).
  2. In Google Cloud Console, on the SAME OAuth client already used for
     Calendar (`GOOGLE_CLIENT_ID`), add the site's origin under **Authorized
     JavaScript origins** (a different field from Calendar's "Authorized
     redirect URIs," which is already set) --
     `https://personalosdashboard-production.up.railway.app`, and
     `http://localhost:3001` too if Elo wants Google login to also work in
     local dev. Google's Sign-In button will fail with an origin-mismatch
     error without this -- a real, required manual step, not optional.

## Latest HEALTH tab refinement (2026-08-26) -- cleaner layout, clearer rings
Elo asked for a focused pass on HEALTH specifically, by voice ("focus on the half
tab" -> HEALTH): reorder AI INSIGHT above HEALTH OVERVIEW for cleaner spacing;
remove the page header (💗 HEALTH / "Your health, optimized.") entirely; show each
ring's percentage INSIDE the circle for the TODAY and NUTRITION sections so it pops
more; make SLEEP's percentage a lot bigger; and show value/target as one big
"{value} / {target}" pairing (a slash, not a separate line) for both the nutrition
macros and sleep, sized big enough to actually read at a glance.

`MacroRing` (`HealthTab.js`) rebuilt to a single unified rendering instead of the
previous `variant="today"` vs `variant="trend"` branching (which produced two
different, inconsistent layouts for what's now the same visual pattern everywhere):
- The ring's own center now shows the fill percentage directly (big, bold, color-
  matched to the ring) whenever no `icon` is set -- covers every TODAY-section and
  NUTRITION-section ring. SLEEP is the one exception: its center is already occupied
  by the moon icon (rotated -90deg SVG, can't share the space), so its percentage
  stays in the text block instead, just at a much larger font size than before
  (`fs(15)`, scaling up to ~20px on SLEEP's 84px hero ring) per Elo's explicit "make
  the percentages in the sleep section a lot bigger."
- The main value line changed from a smaller number with the target buried in a
  separate line below, to one big `fs(22)` "{value} / {goal}{unit}" number (or "of
  {goal}{unit} limit" for sugar, which is a ceiling not a target) -- exactly the
  "if you have a slash and then goes the target... make it big" format Elo asked
  for, applied uniformly to NUTRITION's range averages, TODAY's snapshot values,
  and SLEEP's hours-slept ring alike.
- Removing the variant branching also deleted the "avg" suffix that used to
  distinguish a range-average ring from a today-snapshot ring -- not replaced with
  anything, since each section's own header (TODAY's "vs. your goals" / NUTRITION's
  "{N}-DAY AVERAGE") already makes that distinction without repeating it on every
  ring.
- `variant` prop and its two callers' `variant="today"` (`TODAY` section's
  `PRIORITY_MACROS`/`SECONDARY_MACROS` maps) removed as dead code once the branch
  it selected no longer existed.

Page header and reorder: the 💗 HEALTH / "Your health, optimized." block (added in
an earlier pass from a design mock) is gone outright, not hidden -- Elo: "I don't
wanna see that." AI INSIGHT moved to the very top of the page, above HEALTH
OVERVIEW, so the page now leads with the one thing that actually changes/matters
(the generated insight) rather than a summary strip.

Verified live in the browser (not just read back): AI INSIGHT renders first, no
page header, TODAY's 6 rings each show their own percentage centered inside the
ring (confirmed 25%/26%/16%/23%/62%/14% against real logged data), NUTRITION's
rings do the same at a larger size (39%/37%/52%/53%/68%/55%), and SLEEP shows
"8h 30m / 8h 0m" with a large "106%" beneath it. No console errors. This session's
screenshot tool briefly rendered a blank gap mid-scroll on a couple of attempts
(same general zoom/scroll rendering quirk already documented elsewhere in this
file) -- resolved by widening the viewport height instead of scrolling, and cross-
checked against `get_page_text` and direct `getBoundingClientRect()` calls the
whole time, so this was a tooling artifact, not a real layout bug.

## Telegram bot → real tool-calling agent (2026-08-26, Stages 1-2 done; Stage 3 voice not started)
Elo felt the bot was "nowhere near enough" -- it could only parse freeform text into a
task (review-then-create) plus two fixed commands (`/today`, `/insight`). He wants it
to reach every part of the dashboard from his phone: toggle habits, log food, check his
calendar/tasks, get flexible cross-domain insights (not just a fixed 14-day window),
trigger the sleep bed/wake flow, and (a later stage) send voice notes. Full plan lives
in `/Users/elotion/.claude/plans/read-claude-md-first-for-lovely-book.md` if the exact
reasoning behind any of this needs revisiting.

Two things Elo confirmed explicitly before this was built: (1) voice transcription
needs a new external dependency (OpenAI's Whisper API, a new `OPENAI_API_KEY`) -- he'd
deferred this once before specifically to avoid adding a new API, asked again directly
he said yes; (2) "confirm everything" -- interpreted as every tool call that *changes*
data gets a Confirm/Cancel card first, pure questions answer immediately (confirming a
question before it's allowed to be answered would be bad UX and isn't really what
"confirm everything" was asking for -- flagged to Elo as the one place this build made
a judgment call he didn't spell out byte-for-byte).

**Architecture: this is genuinely new to the codebase -- real Claude tool-use, not
another single-shot `askClaude()`/`askClaudeStructured()` call.** Two new files:
- `lib/tools.js` -- the single source of truth for every tool the agent can call:
  `TOOL_DEFINITIONS` (15 tools as JSON-schema, passed straight to
  `client.messages.create({tools})`), `READ_TOOLS`/`WRITE_TOOLS` (two `Set`s deciding
  auto-execute vs. stop-and-confirm), `EXECUTORS` (each a `fetch` against the SAME
  Express API the React dashboard calls -- never Supabase directly, same "one place
  logic lives" rule the bot has followed since Phase 7), `PREVIEW_RESOLVERS` (currently
  just `log_food` -- runs the real macro-estimate call once, before the confirm card is
  built, so what Elo confirms is exactly what gets saved a moment later, no drift), and
  `SUMMARIZE` (a deterministic one-line description per write tool for the confirm
  card -- not left to Claude's own prose, so a multi-action card has a consistent
  format every time).
- `lib/agent.js` -- the actual loop. `runAgentTurn(userText)` calls
  `client.messages.create` with `tools: TOOL_DEFINITIONS`, capped at 5 turns: no
  `tool_use` blocks → return the text answer directly; every `tool_use` this turn is a
  read tool → execute them all, feed `tool_result`s back, take another turn (this is
  what lets "mark working out done" resolve which habit that actually is before
  proposing anything); the moment ANY `tool_use` is a write tool → stop and return
  every proposed write action from that turn (Claude can and does return several write
  tool_use blocks in one turn when a message needs several actions -- "I worked out and
  ate chicken and rice" resolves to two separate proposals in ONE confirm card, verified
  live). `executeActions(actions)` is deliberately simple and separate -- by the time
  Elo taps Confirm every id was already resolved, so confirming does NOT call Claude
  again, it just runs each write executor in sequence, catching failures per-action so
  one bad action in a batch doesn't sink the rest.
  Model config deliberately deviates from `lib/anthropic.js`'s `effort: 'low'` default
  -- this loop does real multi-step planning and can emit several tool calls per turn,
  which benefits from more reasoning room: `effort: 'medium'`.

**The 15 tools** (exact route mapping in the plan file, not repeated here) -- 8 read
(`get_habits`, `get_tasks`, `get_calendar_events`, `get_entities`, `get_health_summary`
which merges `GET /api/health/data` + `GET /api/health/goals`, `get_insight`,
`get_correlation_data`, `get_sleep_status`) and 7 write (`toggle_habit`, `log_food`,
`create_task`, `update_task`, `start_sleep`, `end_sleep`, `create_journal_entry`).
"Mark a task done" is `update_task` with `is_archived: true` (matching the route's real
semantics, `completed_at` auto-stamps) -- the system prompt states this explicitly
since there's no separate "is_done" field for Claude to reach for.

**`lib/telegram.js` changes:** `/start`, `/today`, `/insight` untouched (fast,
deterministic, no reason to route them through the new agent). `pendingTasks: Map<
chatId, task>` generalized to `pendingActions: Map<chatId, ToolUse[]>`. New shared
`handleUserMessage(ctx, text)` (used by the text handler now, and will be reused by a
Stage-3 voice handler) runs the agent turn, resolves preview steps, and shows one
Confirm/Cancel card listing every proposed action. Confirm executes all of them and
reports per-action success/failure; Cancel just clears the pending entry -- same shape
as the old single-task flow, generalized to a list.

**Real bug found and fixed during testing:** the first version of `toggle_habit` only
sent `{completed_date}` in the `PUT /api/habits/:id` body. `GET /api/habits` afterward
showed `completed_date` set correctly but `completed_today` still `false` -- the
dashboard's own `toggleHabit` (`App.js`) sends BOTH fields together
(`{completed_today, completed_date}`), and the route has no logic inferring one from
the other. Caught by actually checking `GET /api/habits` after a test toggle instead of
trusting the PUT response looked fine. Fixed to send both fields; re-verified with a
fresh toggle → correct `completed_today: true` → reverted, confirmed clean.

**Verified via real round-trips (all test data cleaned up afterward), everything I
could test without Elo's own Telegram device:**
- Every read tool individually, and multi-tool-in-one-turn (a combined "tasks + habits"
  question correctly called both `get_tasks` and `get_habits` in parallel).
- Every write tool's full execute path (`toggle_habit`, `log_food`, `create_task`,
  `update_task`, `create_journal_entry`) -- proposed, previewed where relevant, executed,
  checked against a fresh `GET`, cleaned up. `create_journal_entry` correctly triggers
  mood/theme extraction as part of the same action (verified real mood/themes on the
  test row before deleting it).
- Multi-action detection: "I worked out and ate grilled chicken with rice" correctly
  proposed both `toggle_habit` and `log_food` from one message.
- A genuinely open-ended nutrition question ("what have I eaten today and how does that
  compare to my goals") produced a real, useful comparison against Elo's actual macro
  goals -- not a generic-sounding answer.
- Loop safety: an unresolvable request ("toggle the habit called xyzzy123") correctly
  read the real habit list, found no match, and asked a clarifying question instead of
  guessing or looping to the 5-turn cap.
- No regressions: `/api/tasks`, `/api/habits` still 200; `lib/telegram.js`/`lib/agent.js`/
  `lib/tools.js` all load cleanly.

**Not yet verified, needs Elo:** the actual Confirm/Cancel button tap inside Telegram's
own UI -- everything above was exercised by calling `runAgentTurn`/`executeActions`
directly, or through a temporary dev-only route (`POST /api/_dev/agent-test`,
`server.js` -- added purely so the loop could be curl-iterated on without a Telegram
round-trip per tweak). This still needs a real pass from Elo's actual chat before it's
called done.

**RESOLVED 2026-08-26: `/api/_dev/agent-test` removed.** The moment Elo's Railway
deployment went live, this had no auth and was reachable by anyone with the URL --
confirmed directly with a real `curl` against the production domain before removing
it (200 OK, no auth required, would have let anyone burn Elo's Anthropic quota for
free). Caught and fixed in the same session the app went public, not left as a
known gap. Local verification of new agent tools going forward uses the same
direct `runAgentTurn`/`executeActions` calls this route was already thin wrapper
around (see the tool-by-tool verification notes above for examples), so nothing
about the testing workflow is lost by removing it.

**Stage 3 (voice) code written 2026-08-26, not yet live -- waiting on Elo's
`OPENAI_API_KEY`.** `lib/transcribe.js` (`transcribeVoice(oggFileUrl)`, raw `fetch`/
`FormData` against `https://api.openai.com/v1/audio/transcriptions`, deliberately not
the `openai` npm package for one call's worth of surface area) and `lib/telegram.js`'s
new `bot.on('voice', ...)` handler (downloads the file via `ctx.telegram.getFileLink()`,
transcribes it, feeds the transcript through the exact same `handleUserMessage`
pipeline typed text uses -- not hardcoded to always journal, Claude's own tool choice
decides) are both written and load cleanly. Verified the graceful-degradation path
directly: with no `OPENAI_API_KEY` set, `transcribeVoice()` throws a clear
"OPENAI_API_KEY is not set" error before ever calling OpenAI, and the bot's `catch`
turns that into a plain "voice notes aren't set up yet" reply instead of crashing.
**Cannot verify the actual transcription call or a real voice-note round-trip until
Elo adds the key** -- that's the one remaining step before this line can move to
RESOLVED.

**Known limitations carried forward, not introduced by this build:** `pendingActions`
is still keyed by `chatId` only (same as the old `pendingTasks`) -- a second message
before confirming the first silently replaces the pending card. `toggle_habit`
addresses whole habits via the same route the dashboard's own non-subtask checkbox
uses -- habits with `habit_subtasks` aren't individually addressable via chat in v1,
same limitation the direct-PUT route already had.

## Latest HEALTH tab follow-up (2026-08-26) -- TODAY section hierarchy
Same-day follow-up to the HEALTH refinement above. Elo: drop TODAY's caption text
("Calories/protein/sugar vs. your personal goal · carbs/fat/fiber vs. general
reference"); make CALORIES and PROTEIN's rings bigger; move SUGAR down to sit with
CARBS/FAT/FIBER on a smaller second row instead of alongside CALORIES/PROTEIN.

`HealthTab.js`'s TODAY section: caption `<div>` removed outright. The single
6-ring grid split into two -- row 1 is `PRIORITY_MACROS` minus sugar (CALORIES,
PROTEIN) at `size={56}` (up from 40), row 2 is sugar plus all of `SECONDARY_MACROS`
(SUGAR, CARBS, FAT, FIBER) at `size={36}`. This is deliberately scoped to TODAY
only -- NUTRITION's own priority/secondary split (CALORIES/PROTEIN/SUGAR big,
CARBS/FAT/FIBER small) further down the page is unrelated and untouched; TODAY's
grouping is now different on purpose (just the two macros Elo singled out get the
bigger treatment here, not all three "priority" macros). Verified live: no caption
text, CALORIES/PROTEIN visibly larger than the other four, no console errors.

## Latest UI/UX refinements (2026-08-26) -- full audit and refinement pass
Elo asked for a systematic UI/UX + backend-frontend interaction audit across HOME, CRM,
BRAIN, and JOURNAL -- a debug-and-fix pass, not a new-feature pass. Went through every
tab in the actual browser, made a list of visual issues, fixed them, then did live
end-to-end interaction testing (CRM full CRUD, HOME habit persistence, BRAIN entity
panel accuracy, JOURNAL mood extraction + AI recap + insights, and an explicit
backend-down error-handling test). One real, previously-invisible bug came out of that
last test and got fixed same-session.

**Visual/spacing fixes:**
1. **HOME's right column (GOALS/NUTRITION/SLEEP) had a large dead-space gap at the
   bottom** whenever a sibling column (HABITS+CALENDAR, or the habit-edit panel) was
   taller -- the 3-column row had no `align-items` set, so it defaulted to `stretch`,
   forcing every column's own background "well" to match the tallest column's height
   even though its content ended much sooner. Measured directly via
   `getBoundingClientRect()`: with the habit-manage panel open, the right column was
   being stretched to 1195.5px tall while its actual content only needed 684.5px --
   over 500px of visible empty space. Fixed with `align-items:flex-start` on the row
   container (`HomeTab.js`) -- confirmed afterward that each column now sizes to its
   own content independently (824 / 1195.5 / 684.5px in the same test case).
2. **CRM's Kanban empty columns showed a bare box with zero indication** (e.g. SOMEDAY
   with 0 tasks), inconsistent with Archive view's "Nothing archived yet." message.
   Added a matching "Nothing here." empty-state line to empty Kanban columns
   (`CrmTab.js`).

**Real bugs found and fixed:**
3. **BRAIN's "Life Bucket" filter toggle was completely non-functional** -- clicking it
   changed its own active/selected styling but never affected the rendered grid at all
   (`decorated`/the entity grid always rendered the same "Entity Dashboard" content
   regardless of `brainFilter`). Confirmed by reading `BrainTab.js`: the state existed,
   the click handler existed, but nothing downstream ever branched on it. This is worse
   than no toggle at all -- it gives false visual feedback that something changed when
   it didn't. Since building out a real second view would be a new feature (out of
   scope for a debug-and-fix pass), removed the dead toggle entirely: `BrainTab.js`
   lost the `filters` array and the whole toggle-pill row, `App.js` lost the
   `brainFilter`/`setBrainFilter` state and its entry in the persisted UI-state blob.
   Per this project's standing "delete dead code, don't leave unused flags" convention.
4. **JOURNAL's empty state always said "No entries match that search"** regardless of
   whether a search was actually active -- with zero real entries and an empty search
   box, it still claimed a search had failed to match anything, which is misleading
   (there's a real difference between "you searched and got nothing" and "there's
   nothing here yet"). Fixed to branch on whether the trimmed search query is non-empty
   (`JournalTab.js`): shows "No journal entries yet." when the list is genuinely empty,
   "No entries match that search." only when a real query produced zero results.
   Verified both branches live (emptied search box -> correct message; typed a
   guaranteed-no-match string -> correct message).
5. **JOURNAL's per-entry GENERATE (AI RECAP) button had no double-submit guard** --
   every other GENERATE button in the app (JOURNAL's INSIGHTS, HEALTH's insight) already
   guarded against a second click firing a concurrent request while one was in flight,
   but this one didn't. Added the same `if (!entry.generating)` guard used everywhere
   else, plus a dimmed/non-pointer visual state while generating (matching the pattern
   already used on CRM's AI ADD and NUTRITION's add-food button).
6. **Writes that fail mid-session (backend down, network drop) failed completely
   silently** -- reproduced directly by killing the backend process and then starring/
   archiving/creating a CRM task: the optimistic UI update either silently reverted
   (create) or just never persisted (star/archive/restore/delete), with the failure
   only ever visible in the browser console (`.catch(console.error)`), never to Elo.
   Root cause: this app already has exactly one error-banner mechanism for this
   (`tasksError`, shown in the top nav bar), but it was wired to ONLY the initial
   page-load fetch (`useEffect(..., [])`) -- a write that failed *after* the page had
   already loaded successfully had no path to ever set it. Fixed by wiring the same
   `tasksError` banner into all 5 of CRM's write handlers (`toggleCrmKey`,
   `archiveCrmTask`, `restoreCrmTask`, `deleteCrmTask`, `submitCrmAdd` -- new shared
   `WRITE_FAILED_MSG` constant in `App.js`): each now sets the banner on failure and
   clears it on the next successful write. Verified the full cycle live: killed the
   backend, starred a task, watched the banner appear ("Could not save that change --
   check your connection and try again.") while the star still optimistically flipped
   locally; restarted the backend, starred it back, confirmed the banner cleared and
   the real Supabase state matched. This was a real, user-facing gap the audit's own
   "if submission fails, does the user know?" question was specifically asking about --
   not extended to HOME/JOURNAL/BRAIN's own write handlers in this pass, since CRM was
   the concrete reproduction case and this project's own convention is to fix what's
   confirmed broken, not speculatively harden everything that shares a pattern.

**Component consistency -- missing hover feedback (systemic, fixed broadly):**
7. Audited interactive-element feedback via `getComputedStyle(el).cursor === 'pointer'`
   against which elements actually carried a hover-capable class -- **66 of 70
   clickable elements on HOME alone** (and proportionally similar across CRM/BRAIN/
   JOURNAL) had zero visual feedback beyond the cursor turning into a pointer. Root
   cause: this app styles almost everything through a `css()` helper that converts a
   CSS string into an inline React style object (`client/src/css.js`), and inline
   styles cannot express `:hover` -- so hover states only ever existed on the handful
   of elements someone had already added a real CSS class to (`elo-hover-pop`,
   `elo-row-hover`, `elo-entity-card`). Added two new shared classes to `index.css`:
   `elo-btn-hover` (brightness+lift on hover, a dimmer "pressed" flash on `:active` --
   for solid CTA-style buttons: ADD, CAPTURE, SAVE, GENERATE, WENT TO BED, habit tiles,
   calendar day cells, etc.) and `elo-link-hover` (a lighter opacity-dip, for plain
   inline text links like SHOW RAW/EDIT where a lift would look heavy-handed) --
   mirroring `elo-entity-card:hover`'s existing lift+brighten visual language rather
   than inventing a new one. Applied across `HomeTab.js`, `CrmTab.js`, `JournalTab.js`,
   and `App.js`'s top nav to every primary button, toggle pill, checkbox, and icon
   button identified in the audit -- reduced HOME's own unstyled-clickable count from
   66 to 31 (remaining ones are largely native `<select>` dropdown options and drag
   handles, which don't take the same treatment). Deliberately scoped to the elements
   an audit like this would actually flag (primary actions, nav, toggles) rather than
   chasing literally every clickable pixel in the app.

**Verified via live end-to-end testing, no other bugs found:**
- **CRM full lifecycle**: created a real test task, starred it, archived it, restored
  it (confirmed it came back unchecked, not falsely marked done -- the exact bug an
  earlier session's audit had already found and fixed once), searched for it, deleted
  it. Cross-checked against `GET /api/tasks` at every step; zero drift between UI and
  Supabase at any point; test task fully removed afterward, confirmed via a fresh
  fetch.
- **HOME habit persistence**: checked "Working Out," confirmed the daily-score ring and
  header updated instantly, confirmed the completion persisted to Supabase
  (`completed_today`/`completed_date`), confirmed it survived a full page reload, then
  reverted it -- important this session specifically because 2026-08-26 is Elo's real
  first day of tracked usage (see the Data note above), so a stray test completion
  would have polluted real data, not test data. Confirmed via `GET
  /api/analytics/habits` that the revert left zero residue (0 completions logged for
  that habit today).
- **BRAIN entity panel**: confirmed the panel opens with exactly accurate counts (UCLA:
  2 open, 2 key, matching its card) and lists the correct two tasks. Hit a false alarm
  during this check -- the panel appeared not to open in three consecutive screenshots,
  but `elementFromPoint()`/direct rect queries confirmed it was actually rendering
  correctly and instantly; the screenshots were stale/lagged relative to the real DOM
  state (the panel's own double-`requestAnimationFrame` open animation plus this
  session's screenshot tool not always reflecting a just-changed page, a tooling quirk
  already documented elsewhere in this file, not a real bug). A later screenshot showed
  it correctly.
- **JOURNAL**: created a real entry with clearly positive text; mood extraction
  correctly scored it 5/5 with sensible themes ("work productivity," "accomplishment,"
  "energy"); AI RECAP generated a coherent, content-aware paragraph; INSIGHTS'
  GENERATE correctly identified there was no real cross-domain pattern in the sparse
  surrounding data (mood logged exactly once, habits/tasks otherwise empty) and
  explicitly declined to invent one -- exactly the designed behavior, not a
  generic-sounding paragraph. Entry deleted afterward, confirmed via a fresh fetch that
  real data (0 entries) was untouched.

**Flagged, deliberately not fixed (mobile is out of scope per Elo's own framing --
"don't fix mobile specifically unless it's obviously broken, that's a future phase"):**
- **Top nav breaks at phone width (375px).** `App.js`'s header row (logo + 6 tabs +
  date/clock) has no wrap, scroll, or collapse behavior for narrow viewports -- at
  375px the tab list visually compresses/overflows and JOURNAL, HEALTH, and the
  date/clock become unreachable (confirmed `document.body.scrollWidth === innerWidth`,
  i.e. this isn't even reachable via a horizontal scroll, the content is just
  squeezed/clipped with no affordance to get to it). This is a real, "obviously
  broken" finding by the letter of Elo's own carve-out, but a proper fix needs an
  actual responsive nav pattern (hamburger menu or a scrollable tab strip) -- a
  bigger, dedicated change better suited to its own future phase than an incidental
  fix inside this audit, so it's flagged here rather than fixed. Worth prioritizing
  whenever mobile use is actually planned.

**Tooling artifacts hit during this session's testing -- NOT app bugs, noted so a
future session doesn't re-investigate them:**
- This session's browser-automation `Backspace`/`Delete` key presses do not trigger
  real text deletion in this app's controlled React inputs -- typing/inserting
  characters works completely normally, only deletion silently no-ops. Reproduced
  identically on two different, freshly-typed-into search inputs (CRM and JOURNAL),
  ruling out an app-level bug in either. Confirmed by setting the DOM value directly
  via the native `HTMLInputElement` value setter + dispatching a real `input` event,
  which cleared the field instantly -- so the app's own controlled-input handling is
  fine, this is specifically a synthetic-`KeyboardEvent` limitation of this browser
  automation environment, the same general class of limitation already documented
  elsewhere in this file for HTML5 drag-and-drop.

Git: all of the above (HomeTab.js, CrmTab.js, BrainTab.js, JournalTab.js, App.js,
index.css, this CLAUDE.md section) is one combined "UI/UX audit and refinement"
commit. Backend restarted twice during this session for the intentional backend-down
error-handling test, each time verified back up via a direct curl before resuming.

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
│   ├── telegram.js           # Telegram bot (Phase 7) -- long-polling, calls the Express API
│   ├── tools.js               # Agent tool defs/executors/summaries (2026-08-26 rebuild)
│   ├── agent.js               # Multi-turn tool-use loop the bot runs every message through
│   └── transcribe.js          # Whisper voice-note transcription (Stage 3, needs OPENAI_API_KEY)
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
OPENAI_API_KEY=<from platform.openai.com -> API keys -- server-side only>
DASHBOARD_PIN=<any PIN Elo picks -- gates every /api/* route once set, see the audit note above>
AUTHORIZED_GOOGLE_EMAIL=<the one Google account allowed to sign in -- el200594@gmail.com>
```
`TZ` is a Railway-only env var, not a local `.env` line (local dev never needed it -- the
Mac's own OS timezone was always correct). Set `TZ=America/Los_Angeles` directly in
Railway's Variables tab -- see the "Full-stack audit" note above for why this one var
fixes every server-side "what is today" calculation across the whole app at once.
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
`OPENAI_API_KEY` powers the Telegram agent's voice-note transcription (`lib/transcribe.js`,
Stage 3 of the 2026-08-26 agent rebuild) -- get it from platform.openai.com's API keys page.
Nothing else in this app uses OpenAI; every other AI feature goes through Claude
(`lib/anthropic.js`). Not yet added -- `bot.on('voice', ...)` degrades gracefully with a
clear "voice notes aren't set up yet" reply until this is set, rather than crashing.
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

-- RESOLVED 2026-08-26: profile table confirmed live. Elo ran this migration
-- (INSERT included, so the singleton row was already correct on creation --
-- no separate seed step needed unlike health_goals below).
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
-- name/tagline/focus/photo are now real, cross-device Supabase data, not
-- localStorage -- verified via a direct GET /api/profile returning the exact
-- seeded row (id 1, name "Elo", tagline "UCLA '27 · Founder, HEMS", focus
-- "Shipping HEMS.", photo_data null since no photo's been uploaded yet).
-- localStorage (key 'elo-os-profile') is now just the fallback for the rare
-- case the API is unreachable, not the source of truth.
-- The photo is stored as a compressed base64 JPEG (resized client-side to
-- ~160px, see resizeImageFile() in HomeTab.js) directly in a TEXT column,
-- not Supabase Storage -- Storage would need its own bucket created + policies
-- set up by hand first (same manual-step problem as every table here), and a
-- base64 column works today with zero extra setup. Fine at personal-photo
-- sizes; would need revisiting if this ever needs to hold large images.
-- express.json()'s body size limit was raised to 5mb in server.js to fit these.

-- RESOLVED 2026-08-26: health_goals table confirmed live -- ran empty (no
-- INSERT in the migration, unlike profile above), then the app's own
-- first-load-after-migration seed logic (App.js) filled it automatically:
-- loaded the app once with the table freshly created, GET /api/health/goals
-- came back null, App.js's effect caught that and fired PUT
-- /api/health/goals with the real interview values -- a follow-up GET
-- confirmed the exact seeded row (3500 kcal / 175g protein / 50g sugar,
-- plus the physique/workout goal text below). Same singleton-row pattern as
-- habit_streak/profile above:
--
--   CREATE TABLE health_goals (
--     id SERIAL PRIMARY KEY,
--     calorie_goal INTEGER,
--     protein_goal INTEGER,
--     sugar_goal INTEGER,
--     physique_goal TEXT,
--     workout_goal TEXT,
--     updated_at TIMESTAMP DEFAULT NOW()
--   );
--   ALTER TABLE health_goals ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "Enable all for public" ON health_goals FOR ALL USING (true) WITH CHECK (true);
--
-- Values captured 2026-08-26 via an in-chat "interview" -- Elo asked
-- specifically to be asked about physique/workout goals rather than raw
-- macro numbers ("instead of asking what my macro's goal you should ask me
-- about what my physique goal, workout goal, then determines how much
-- macros i should target"): physique goal = lean recomposition / mini-bulk
-- (build muscle while staying lean and athletic), workout = calisthenics
-- 5-6x/week mixed cardio+strength plus occasional sport, 6'1", 175lbs, 20
-- (about to turn 21), male. calorie_goal (3500) derived from Mifflin-St
-- Jeor BMR (~1858 kcal) x a 1.8 activity factor (blend of "very active" and
-- "extra active" given the training frequency) + 200 kcal for the
-- mini-bulk. protein_goal (175) from the standard 1g-per-lb-bodyweight
-- heuristic for muscle-building while staying lean. sugar_goal (50) is the
-- general WHO/FDA reference limit, not biometric-derived -- flagged to Elo
-- as such. These are estimates from standard formulas, explicitly not
-- medical/dietitian advice -- HEALTH's NUTRITION card says so directly.
-- Goals are now real, cross-device Supabase data -- localStorage (key
-- 'elo-os-health-goals') is now just the fallback for the rare case the API
-- is unreachable, not the source of truth, same as profile above.

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
- FINANCE tab — full CRUD on accounts/subscriptions, CSV transaction import (AI column
  mapping via Claude, preview-then-commit), net worth/spend summary, AI spending insight.
  Migration run and fully re-verified against real (test) data 2026-09-01 — see the dated
  "FINANCE tab built" section above for the complete writeup. Not real yet: live bank
  sync (deliberately ruled out, needs a paid aggregator) and live investment pricing
  (a real, deliberately deferred follow-up); HOME's Finance Pulse widget is still
  hardcoded mock data, not yet wired to this real `finance_accounts` data.
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
  and displays what's chosen. Real Supabase persistence as of 2026-08-26 (the
  `profile` table migration ran) -- see the RESOLVED note on `profile` above.
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
  **Third follow-up (2026-08-26) -- personalized goals + reference lines +
  decluttered DAY BY DAY.** Elo asked for six things in one message: (1)
  box each macro's trend individually for readability; (2) drop MIN/MAX in
  the stat box in favor of AVERAGE and a personal GOAL; (3) derive that goal
  by interviewing him on physique/workout goals rather than asking for raw
  macro numbers directly; (4) treat calories/protein/sugar as the 3 macros
  that matter most, with calories' average specifically called out; (5) a
  zero-line graph instead of a "No data yet" placeholder when there's no
  data yet, reconstructing into a real line once data lands; (6) goal AND
  average reference lines drawn on the calories/protein line graphs
  themselves, not just in the stat box.
  Interview: first pass at asking (AskUserQuestion, direct macro-number
  options) was interrupted/dismissed -- Elo explicitly wants to be asked
  about outcomes (physique goal, workout routine) and have Claude derive the
  macro numbers, not be asked for the numbers directly. Re-asked with that
  framing (physique goal, workout routine + frequency, bodyweight), then he
  volunteered exact height/age/sex unprompted, letting the estimate move
  from a rough bodyweight-multiplier heuristic to a real Mifflin-St Jeor BMR
  calculation. See the `health_goals` PENDING migration note earlier in this
  file for the exact numbers and formula.
  Implementation (`HealthTab.js` rebuilt again, `App.js` gained the
  healthGoals fetch/localStorage pair, `server.js` gained
  `GET`/`PUT /api/health/goals`):
  - `buildSparkline` rewritten to never return `null` -- when a series has
    no real values it now renders a flat line at 0 (item 5) instead of the
    caller showing a placeholder div, and gained an `extraScaleValues` param
    so goal/average reference lines widen the y-axis instead of being
    clipped when they're above the data's own range. Also now returns a
    `toY` scale function so `Sparkline` can plot reference lines on the
    exact same scale as the data.
  - `Sparkline` gained a `refLines` prop -- dashed horizontal lines with a
    text label, used for item 6.
  - `MetricGraph`'s stat box changed from a 3-cell AVG/MIN/MAX grid to a
    2-cell AVG/GOAL grid (item 2), and gained `goal`/`showRefLines` props.
    Used for every metric now (SLEEP included, goal defaulted to a general
    8-hour reference since Elo didn't ask for a personalized sleep goal).
  - New `TrendBox` wraps each macro's `MetricGraph` in its own bordered box
    (item 1).
  - NUTRITION restructured into a "priority" grid (CALORIES/PROTEIN/SUGAR,
    each boxed, each with `showRefLines`) above the existing TODAY'S MACROS
    bars, then an "OTHER MACROS" grid (CARBS/FAT/FIBER, boxed, no reference
    lines -- Elo didn't flag these as priorities) below. TODAY'S MACROS bars
    now pull protein/sugar targets from `healthGoals` instead of the flat
    FDA reference, while carbs/fat/fiber stay on the generic reference (item
    4 -- only asked to personalize the 3 he cares about).
  - New `MacroPill` component replaces DAY BY DAY's single " · "-joined
    string with individually spaced, color-coded chips per macro (item 5's
    "cluttered" complaint was actually about this row, not the graphs --
    re-read carefully since the two "space it out" asks in the same message
    were about two different UI elements).
  **Real bug caught before shipping, not after:** GOAL and AVG reference
  lines collided visually whenever the two values were close (e.g. sugar:
  goal 50g vs. average 44g landed only ~7.7px apart on a 76px-tall graph,
  same order as the ~8.5px font size). Caught by reading the actual rendered
  `<text>` element `y` positions via `javascript_tool` rather than eyeballing
  a screenshot (screenshots at this scale don't reliably show a 7px text
  overlap). Fixed by always anchoring the GOAL label above its line and the
  AVG label below its line (a `labelBelow` flag on the ref-line object) --
  re-checked the same way afterward and confirmed a consistent ~15-22px gap
  between labels regardless of how close the underlying values are.
  Verified live: no console errors beyond the pre-existing, already-
  documented `/api/profile` and (now also pre-migration, same pattern)
  `/api/health/goals` 404s; confirmed via `read_network_requests` that
  `GET /api/health/goals` 404s cleanly and the app falls back to the
  localStorage defaults exactly as designed.
  **Fourth follow-up (2026-08-26) -- match FINANCE PULSE's chart style, and a
  full 4-zone layout rebuild.** Before running the `health_goals` migration,
  Elo asked for a batch of layout/visual changes:
  1. Match HOME's FINANCE PULSE chart exactly, not just "a line graph."
     Read `buildNetWorthPaths`/the FINANCE PULSE `<svg>` in `HomeTab.js` --
     the real technique there is a smooth bezier line PLUS a gradient-filled
     area underneath (`<linearGradient>` from 35% opacity at the top fading
     to 0%), not a bare stroke. `buildSparkline` (`HealthTab.js`) rebuilt to
     return an `areas` path per line segment (closes each segment down to
     the chart's own baseline), and `Sparkline` gained a per-instance
     `<linearGradient>` (unique id via a module-level counter, since
     multiple sparklines render on the page simultaneously -- FINANCE PULSE
     only ever has exactly one, so it could get away with one hardcoded id).
     Also matched FINANCE PULSE's exact stroke details (`strokeWidth="2"`,
     `strokeLinejoin="round"`) instead of the slightly different values the
     first HEALTH pass had used.
  2. TODAY'S MACROS moved to the top-right, "so I can access it as soon as
     possible when I enter the health tab" -- no longer buried mid-page
     below the priority trend graphs.
  3. OTHER MACROS (carbs/fat/fiber) explicitly called out as "talking way
     too much space" -- `MetricGraph`, `TrendBox`, and `MacroBar` all gained
     a `compact` flag that shrinks every dimension (padding, font sizes, and
     the graph's own height down to 32px), and the grid went from
     `minmax(260px,1fr)` to `minmax(150px,1fr)` so more fit per row.
  4. A specific 4-zone spec: top-left = SLEEP, top-right = today's snapshot,
     middle = full nutrient trend graphs, bottom = DAY BY DAY. HEALTH HABITS
     wasn't assigned a zone in that spec -- Elo's follow-up ("move health
     habits somewhere else unless you have a recommendation") left the call
     to Claude. Folded it into the top-right card alongside TODAY'S MACROS
     (both are glanceable "right now" stats, so they read as one natural
     group, and it keeps top-left purely about sleep) rather than giving it
     a fourth zone that wasn't asked for.
  5. DAY BY DAY kept the pill-based macro display from the previous pass
     (Elo: "I like how the day to day display") but flattened each row back
     to a single skinny line -- date, then macros, then sleep, then habits,
     left to right (`date---macros---sleep---habits`), instead of the
     two-line date-header-then-wrapped-pills layout from before. Pills
     themselves shrunk slightly (padding/font) so a typical day's worth fits
     on one line without wrapping.
  Verified live: DOM-inspected every chart's `<linearGradient>`/area-path
  output directly (`querySelectorAll('linearGradient')`/`path[fill^="url"]`)
  to confirm the gradient fill technique actually renders, since this
  session's screenshot tool had recurring zoom+scroll issues that made
  visual close-up verification unreliable -- same pragmatic workaround as
  the `get_page_text` one three follow-ups up, applied to a different
  verification problem. Confirmed no new console errors and no regression
  on HOME (FINANCE PULSE itself untouched, just read for reference).
  **Fifth follow-up (2026-08-26) -- real x/y axes, dashed goal line on SLEEP
  too, and OTHER MACROS became glowing rings.** Three more refinements to
  the fourth-follow-up layout:
  1. CALORIES/PROTEIN/SUGAR (and now SLEEP) gained an actual x/y axis, not
     just the FINANCE PULSE-style line+area: a faint baseline plus right-
     aligned y-axis labels (`max` at the top, `0` at the bottom -- deliberately
     opposite side from GOAL/AVG's left-aligned labels so they never
     collide) drawn inside the SVG, and an x-axis date range (oldest ...
     newest, e.g. "8/12 ... 8/26") rendered as plain HTML below the SVG
     rather than fought into the viewBox's coordinate math.
  2. SLEEP gets the same dashed-GOAL-line treatment as the 3 priority
     macros now, not just its own AVG/GOAL stat box -- `MetricGraph`'s
     `refLines` logic changed so the GOAL line shows whenever a `goal` prop
     is passed, independent of `showRefLines` (which now controls only the
     heavier AVG line). SLEEP's goal defaults to a general 8-hour reference,
     same as before.
  3. OTHER MACROS (carbs/fat/fiber) replaced entirely -- Elo: "I want other
     macros average to be like habits section glowing circle that shows how
     close it get's to the goal, and on the right side of the circle shows
     goal amounts." New `MacroRing` component copies HOME's habit "Daily
     score" ring exactly (`HomeTab.js`: r=26 circle, `circumference = 2*PI*r`,
     rotated -90deg so the fill starts at 12 o'clock, `strokeDashoffset`
     driving the fill, a glow drop-shadow on the filled arc) -- fill
     percentage is the RANGE AVERAGE against goal (not today's single value,
     matching Elo's own wording "other macros average"), with the goal
     number in its own block to the right of the ring. This fully replaced
     the small line-graph boxes from the previous pass, which also made the
     now-unused `compact` prop on `MetricGraph`/`TrendBox`/`MacroBar` dead
     code -- removed rather than left in place per this project's standing
     "delete dead code, don't leave unused flags" convention.
  Verified live: full-page screenshot confirmed dashed GOAL lines, y-axis
  labels, and x-axis date ranges rendering on all 4 graphs, and all 3
  MacroRing circles filling to the correct percentage (fiber's ring reads
  nearly full at 27g avg / 28g goal, carbs/fat visibly less full at their
  own ratios) with the right-side goal numbers legible. No new console
  errors beyond the pre-existing `/api/profile` and `/api/health/goals`
  404s. Close-up zoom verification hit the same screenshot-tool zoom+scroll
  quirk noted in the fourth follow-up -- relied on the full-page screenshot
  instead, which was sufficient to confirm correctness.
  **Sixth follow-up (2026-08-26) -- full pivot to rings, line graphs removed
  entirely.** After seeing the OTHER MACROS rings live, Elo asked for the
  same treatment everywhere: "I like how the circle looks for other's
  macro... let's do circles for calories protein and sugar as well, instead
  of the line graph for sleep, let's do the circle as well, as well as the
  macro in today's macro let's all use circle against goal so it looks
  better and cleaner." This covered every remaining line-graph/bar usage in
  the file (SLEEP, the 3 priority macros, and TODAY'S MACROS' bars), so
  `HealthTab.js` was rewritten to drop the entire line-graph era --
  `buildSparkline`, `Sparkline`, `MetricGraph`, `TrendBox`, `shortDate`, and
  `MacroBar` all deleted outright rather than left unused, per this
  project's standing dead-code convention.
  `MacroRing` (the component built for OTHER MACROS two follow-ups ago)
  gained two params to cover every remaining use case with one component:
  `size` (scales the ring and all its text proportionally, since r=26 stays
  fixed in the viewBox -- 84px for SLEEP's single hero ring, 64px for the 3
  priority macros' averages, 40px for the 6-up TODAY grid, default 48px for
  the secondary carbs/fat/fiber averages) and `valueLabel` (`'avg'` for the
  NUTRITION section's range averages vs. `'today'` for the TODAY section's
  same-day snapshot -- same ring, genuinely different underlying data, which
  is a real improvement over the old design: TODAY and NUTRITION used to
  show overlapping information in different visual languages, now they're
  visually consistent AND meaningfully distinct in what they measure).
  SLEEP's card also gained `display:flex;flex-direction:column` so its
  single large ring can vertically center in a card that used to be filled
  by a full graph -- an empty ring alone at the top of a tall card would
  have looked sparse and unbalanced.
  Verified live: full-page screenshot confirms all 4 zones -- SLEEP (one
  large ring), TODAY (6 small rings in a grid, all reading 0/goal correctly
  since it's a fresh day with nothing logged yet), NUTRITION (3 larger
  rings + 3 smaller "OTHER MACROS" rings, fill percentages matching the
  same real averages verified in the prior follow-up -- fiber's ring still
  reads nearly full at 27g/28g), and DAY BY DAY unchanged. No new console
  errors beyond the pre-existing `/api/profile` and `/api/health/goals`
  404s.
- **Seventh follow-up (2026-08-26) -- a real design mock, and a real DST bug
  it surfaced.** Elo dropped a fully-designed HEALTH mockup in the project
  root and asked to "mock up the model screenshot and build the health tab
  layout based on that," then immediately refined the instruction twice:
  "use the mockup as a recommendation and build off based on what we have
  and keep what we have as well" (don't replace working features the mock
  happens to omit, like AI INSIGHT or DAY BY DAY's sleep column), and "also
  add an all time time range on the top right."
  New from the mock, layered onto the existing rings/layout rather than
  replacing it: a plain-text page header (💗 HEALTH / "Your health,
  optimized.", unboxed like BRAIN/JOURNAL's own small headers); a new
  "HEALTH OVERVIEW" 4-up summary strip (sleep avg, today's calorie %,
  today's habit completion, and a heuristic "Great/Good/Fair/Needs
  attention" `overallRating()` blending all three -- explicitly not a
  medical assessment, just a quick glance signal); SLEEP gained a centered
  moon icon (rendered as a separate non-rotated overlay div, since the ring
  SVG itself is rotated -90deg and an icon drawn inside it would rotate
  too) and a new BEDTIME/WAKE/CONSISTENCY row, which needed
  `sleep_log.bed_time`/`wake_time` added to `getHealthContext`'s select
  (`lib/context.js`) since it only fetched hours/quality before; and
  `MacroRing` gained a `variant` prop matching the mock's two distinct text
  layouts exactly (`'today'`: "{value} / {goal}{unit}" then "{pct}%" below;
  `'trend'`: "{value}{unit} avg" then "{goal}{unit} target · {pct}%" on one
  row) plus `isLimit` (sugar only, "{value}g of {goal}g limit" instead of a
  target to hit, matching a detail the mock itself drew this way) and an
  `icon`/`formatValue` pair for SLEEP's moon and "Xh Ym" formatting.
  "ALL" range: added as a 6th option on the existing `RangePicker` (already
  top-right of the AI INSIGHT card, so no new element needed) mapping to
  3650 days (~10 years -- comfortably "all time" for a dashboard whose real
  data starts 2026-08-26, simpler than a second backend mode that finds the
  actual earliest logged date). `getHealthContext`'s own day clamp raised
  from 90 to 3650 to match.
  **Real bug found via this new range, not cosmetic:** selecting ALL threw
  React "two children with the same key" warnings for `DAY BY DAY` rows,
  naming real dates years apart (2025-11-02, 2024-11-03, ...) as duplicates.
  Root cause: both `getHealthContext` and (found by grepping for the same
  pattern) `getCorrelationData` built each day via
  `new Date(Date.now() - i * 86400000)` -- raw millisecond subtraction,
  which silently drifts across DST transitions (a "spring forward"/"fall
  back" day is 23 or 25 real hours, not 24). Invisible at the old 90-day
  cap since a handful of ~1-hour drifts rarely accumulate into a full day
  there, but with "now" sitting close to local midnight and a 3650-day
  range crossing ~20 DST transitions, the drift reliably pushed some dates
  across a calendar boundary, producing a duplicate date (and, silently, a
  skipped one elsewhere in the same sequence -- a real data gap, not just a
  React rendering nitpick). Fixed in both functions by switching to
  calendar-date arithmetic -- `new Date(y, m, d - i)` using the Date
  constructor's own local rollover instead of absolute-millisecond math, so
  it can't drift regardless of how many DST/month/year boundaries the range
  crosses. Verified the fix is real, not just quieter: fetched
  `/api/health/data?days=3650` directly and confirmed all 3650 returned
  dates are unique (`new Set(dates).size === 3650`), spanning exactly
  2016-08-29 to 2026-08-26; re-checked the console on a fresh tab and
  confirmed the duplicate-key warnings were gone entirely, not just reduced.
  Backend restarted twice this pass (`lib/context.js` doesn't hot-reload,
  same as `server.js`) -- once for the bed_time/wake_time select, once more
  for the DST fix.

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
   real; habit_streak, profile, and health_goals all real too — confirmed 2026-08-26)
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
   **Update 2026-08-26: rebuilt from a thin client into a real tool-calling
   agent** (Elo: the original bot was "nowhere near enough") -- Stages 1-2
   done and verified via direct execution, Stage 3 (voice, using the
   previously-deferred Whisper API -- Elo confirmed he now wants it) not yet
   built. Full writeup under "Telegram bot → real tool-calling agent" above;
   the one-line version is the bot now understands 15 different actions
   across every tab (not just task creation), can act on several in one
   message, and always shows a Confirm/Cancel card before changing anything.
   Still needs a real pass from Elo's own Telegram chat before this line can
   say "confirmed by Elo" the way it did for the original build.
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
   starts. Elo was separately in the middle of creating an Oracle Cloud account (an
   always-free-tier VM, an alternative to Railway being considered) -- that signup
   was paused mid-flight, not abandoned, at that point.
   **Update 2026-08-26: Oracle dropped, Railway confirmed as the host.** Elo's own
   call ("let's give up on oracle and do the other one that needs to pay") --
   Oracle's always-free tier kept adding friction (account verification/approval
   steps are known to be inconsistent), and Railway was already the architecturally
   -preferred choice from the original decision above (single process, no separate
   frontend host, no CORS config). Paying for Railway trades a bit of monthly cost
   for a setup that just works, which is the right trade for a personal daily-use
   tool. Still needed, and these need Elo himself (account creation + payment can't
   be done on his behalf): create the Railway account, connect it to the
   `Elotion/Personal_OS_Dashboard` GitHub repo, set every var from the `.env`
   Credentials section above in Railway's dashboard (not a committed `.env` --
   Railway's env var UI, one at a time) plus `NODE_ENV=production`, deploy, then
   once the real Railway URL is known: set `PUBLIC_URL`/`FRONTEND_URL` to that URL
   in Railway's env vars, and update the redirect URI in Google Cloud Console's
   OAuth client config to match (currently
   `http://localhost:5050/api/integrations/google/callback` -- needs the real
   `https://<railway-url>/api/integrations/google/callback`). Code side is already
   done and locally verified (see above) -- nothing else to build before this can
   go live.
   **First real Railway build attempt failed, real bug found and fixed
   2026-08-26.** Elo created the Railway project and connected the GitHub repo;
   the build failed at `npm run build` with 4 ESLint errors (a `no-unused-vars`
   on a genuinely dead prop in `CrmTab.js`, and 3 `react/jsx-no-comment-textnodes`
   false-positives -- `// OS`/`// N ENTITIES`/`// N ENTRIES` header text that's
   real literal content, not a forgotten comment, but LOOKS like one to that
   ESLint rule when it's the first thing in a JSX text node). Root cause the
   "verified locally" claim above missed: Create React App's `react-scripts build`
   only promotes ESLint *warnings* to hard build-*failures* when
   `process.env.CI` is truthy -- these 4 issues had existed for a while as
   harmless warnings under a plain local `npm run build` (CI unset), so
   "compiles clean" was true locally and still wrong, because Railway (like
   effectively every CI host) sets `CI=true` automatically. Confirmed by
   reproducing the exact failure locally with `CI=true npm run build` before
   touching anything, then re-running the same command after each fix until it
   printed "Compiled successfully." -- not assumed from reading the Railway log
   alone. Fixed: wrapped the three literal `// ...` header fragments in
   `{'// '}` (or `{' // OS'}`) so they're JS string expressions instead of raw
   JSX text nodes, and dropped the unused `crmDraggingId` destructure from
   `CrmTab.js` (real dead code -- `App.js` already computes the drag-visual
   state into `task.cardStyle` before handing tasks to `CrmTab`, which only
   ever needed `setCrmDraggingId` to start/stop a drag, never the id itself).
   Re-verified the actual running dev app afterward (all three header labels
   render identically, CRM's kanban board unaffected) since this touches JSX
   structure, not just the build step. **Worth remembering for next time:**
   a local "the build compiles" claim on a CRA app is incomplete unless it was
   run with `CI=true` -- that's the one env var that changes whether ESLint
   warnings are cosmetic or fatal, and it's exactly the difference between
   this machine and every real deploy host.
9. ~~Finance~~ — moved up out of its original last-in-sequence slot at Elo's explicit
   request ("I am ready for the finance tab"), same as HEALTH (step 10) was earlier.
   Built, migration run, and fully re-verified against real (test) data 2026-09-01 —
   see the dated
   "FINANCE tab built" section above for the full writeup. Landed on CSV import for
   transaction history + manual account-balance entry, not live bank sync (real bank
   aggregation needs a paid service like Plaid at production volume, contradicting
   Elo's explicit "I don't want to spend any money on this one" constraint) — live
   investment-price lookup (a genuinely free public-data API) is a real, deliberately
   deferred follow-up, not ruled out. HOME's Finance Pulse widget is still hardcoded
   mock data, untouched by this pass — wiring it to the new real `finance_accounts`
   data is a natural next step but wasn't asked for yet.
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
