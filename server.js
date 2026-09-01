require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const supabase = require('./supabaseClient');
const { z } = require('zod');
const { OAuth2Client } = require('google-auth-library');
const { askClaude, askClaudeStructured } = require('./lib/anthropic');
const { getEntityContext, getJournalContext, getEntitiesWithDescriptions, getCorrelationData, getHealthContext } = require('./lib/context');
const { localDateStr, localTimestampStr } = require('./lib/dates');
const { getEffectiveDate } = require('./lib/habitDay');
const { INTERNAL_SECRET } = require('./lib/internalAuth');
const googleCalendar = require('./lib/google');
const telegramBot = require('./lib/telegram');

const app = express();
app.use(cors());
// raised from the default ~100kb -- the profile photo is sent as a base64 data
// URL in the request body, which is bigger than plain JSON payloads elsewhere
app.use(express.json({ limit: '5mb' }));

const PORT = process.env.PORT || 5050;

// ---------------- ACCESS CONTROL (2026-08-26, extended same day) ----------------
// This app went publicly reachable on Railway with zero authentication on any
// route -- anyone with the URL could read/write/delete every part of Elo's
// personal data, and could burn his Anthropic/OpenAI quota via the AI-backed
// routes. Started as just a PIN (Elo: "a simple pin every time I log on"),
// extended same-day to also accept Google Sign-In, since Elo asked to defer
// the PIN but wants Google login working now -- both are accepted credential
// types, whichever is configured actually gates access; a request needs to
// satisfy at least one to get through once EITHER is configured.
//
// Degrades gracefully like every other optional-config feature in this app
// (health_goals, sleep_log before their migrations): if neither DASHBOARD_PIN
// nor AUTHORIZED_GOOGLE_EMAIL is set, this is a complete no-op and every
// route stays open -- so deploying this code before either var exists
// doesn't break anything.
//
// Internal calls from the Telegram agent's own tool executors
// (lib/tools.js/lib/telegram.js, which fetch http://localhost:PORT/api/...
// from inside this same process/container) never pass through Railway's
// public edge at all -- they land here as genuine loopback connections, so
// they're exempted by IP rather than needing a credential threaded through
// every executor.
//
// Google's CALENDAR OAuth redirect (/api/integrations/google/auth,
// /api/integrations/google/callback -- a different flow from login, see
// lib/google.js) is also exempted -- those are plain browser navigations
// (window.location.href / a redirect from Google), which can't carry a
// custom header the way a fetch() call can.
//
// Google LOGIN sessions are an in-memory Map, not a database table -- fine
// for a single trusted user, but they reset on every redeploy (i.e. every
// git push, which happens often on this project), meaning a fresh sign-in is
// needed after each deploy. Flagged as a known tradeoff, not silently
// accepted -- worth moving to a `sessions` table later if that gets
// annoying, same "start simple, note the limitation" pattern already used
// elsewhere in this app (e.g. pendingActions' single-chat-key limitation).
const AUTH_EXEMPT_PATHS = new Set([
  '/api/auth/verify',
  '/api/auth/google-verify',
  '/api/auth/config',
  '/api/integrations/google/auth',
  '/api/integrations/google/callback',
]);
function isLoopback(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

const googleLoginClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const googleSessions = new Map(); // token -> { email, expiresAt }

function isAccessControlled() {
  return !!(process.env.DASHBOARD_PIN || process.env.AUTHORIZED_GOOGLE_EMAIL);
}
function hasValidSession(req) {
  const token = req.get('X-Session-Token');
  if (!token) return false;
  const session = googleSessions.get(token);
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    googleSessions.delete(token);
    return false;
  }
  return true;
}

app.use('/api', (req, res, next) => {
  if (!isAccessControlled()) return next();
  // req.path has the '/api' mount prefix stripped by Express (this
  // middleware is mounted via app.use('/api', ...)), but originalUrl never
  // is -- matching against the stripped req.path here was the actual bug:
  // every AUTH_EXEMPT_PATHS entry (all written as '/api/...') silently never
  // matched, so the exempt routes -- including /api/auth/verify and
  // /api/auth/google-verify themselves -- fell through and required a
  // credential nothing could ever supply, locking out all access (including
  // the login routes) the instant either DASHBOARD_PIN or
  // AUTHORIZED_GOOGLE_EMAIL got set. Caught live on production.
  if (AUTH_EXEMPT_PATHS.has(req.originalUrl.split('?')[0])) return next();
  // Primary internal-call bypass (lib/internalAuth.js) -- a deterministic
  // secret only this same process's own tool executors know, so the
  // Telegram agent's writes never depend on Elo's own browser session
  // (PIN/Google) or on correctly detecting a loopback IP, which was never
  // actually confirmed against Railway's real networking. Checked before
  // the IP check specifically so it's the one guaranteed path, not a
  // fallback that only helps if the IP check happens to be right.
  if (req.get('X-Internal-Secret') === INTERNAL_SECRET) return next();
  if (isLoopback(req.ip)) return next();
  if (process.env.DASHBOARD_PIN && req.get('X-Dashboard-Pin') === process.env.DASHBOARD_PIN) return next();
  if (hasValidSession(req)) return next();
  res.status(401).json({ error: 'Authentication required' });
});

app.get('/api/auth/config', (req, res) => {
  res.json({
    pinEnabled: !!process.env.DASHBOARD_PIN,
    googleEnabled: !!(process.env.AUTHORIZED_GOOGLE_EMAIL && process.env.GOOGLE_CLIENT_ID),
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  });
});

app.post('/api/auth/verify', (req, res) => {
  if (!process.env.DASHBOARD_PIN) return res.json({ ok: true });
  res.json({ ok: (req.body || {}).pin === process.env.DASHBOARD_PIN });
});

app.post('/api/auth/google-verify', async (req, res) => {
  if (!googleLoginClient || !process.env.AUTHORIZED_GOOGLE_EMAIL) {
    return res.status(400).json({ error: 'Google login is not configured.' });
  }
  try {
    const ticket = await googleLoginClient.verifyIdToken({
      idToken: (req.body || {}).credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (payload.email !== process.env.AUTHORIZED_GOOGLE_EMAIL || !payload.email_verified) {
      return res.status(403).json({ error: 'This Google account is not authorized for this dashboard.' });
    }
    const token = crypto.randomUUID();
    googleSessions.set(token, { email: payload.email, expiresAt: Date.now() + SESSION_TTL_MS });
    res.json({ sessionToken: token, email: payload.email, name: payload.name });
  } catch (e) {
    console.error('[auth] google-verify failed:', e.message);
    res.status(401).json({ error: 'Invalid Google credential' });
  }
});

// small helper so every route doesn't repeat the same error handling
function handle(res, promise) {
  return promise.then(({ data, error }) => {
    if (error) {
      console.error(error);
      return res.status(400).json({ error: error.message });
    }
    res.json(data);
  });
}

// ---------------- ENTITIES ----------------
app.get('/api/entities', (req, res) => {
  handle(res, supabase.from('entities').select('*').order('id'));
});

// BRAIN's per-entity NOTES textarea -- previously pure client-side state
// (App.js's entityNotes) with no schema column at all, so anything typed
// was silently lost on reload. `notes` is a new column (see CLAUDE.md for
// the migration) -- 404s cleanly pre-migration, same tolerance pattern as
// every other not-yet-migrated table/column in this app.
const missingEntityNotesColumn = (error) => error && /notes/i.test(error.message || '');

app.put('/api/entities/:id', async (req, res) => {
  const result = await supabase.from('entities').update({ notes: req.body.notes }).eq('id', req.params.id).select();
  if (result.error) {
    if (missingEntityNotesColumn(result.error)) return res.status(404).json({ error: 'entities.notes column does not exist yet' });
    console.error(result.error);
    return res.status(400).json({ error: result.error.message });
  }
  res.json(result.data);
});

// Generated on demand (BRAIN's GENERATE button), not persisted -- entities has
// no briefing column, so this is a live snapshot each time, not saved history.
app.post('/api/entities/:id/briefing', async (req, res) => {
  try {
    const context = await getEntityContext(req.params.id);
    if (!context) return res.status(404).json({ error: 'Entity not found' });
    const prompt =
      'You are writing a short status briefing for one life area inside a personal ' +
      "dashboard. Based on the data below, write a 2-3 sentence plain-language " +
      'summary of where things stand -- call out anything overdue or piling up. ' +
      'No headers, no bullet points, just prose.\n\n' + context.text;
    // Haiku (2026-08-28 cost pass) -- a short, bounded summary of data
    // that's already right in the prompt, low stakes if occasionally terse.
    const briefing = await askClaude(prompt, { maxTokens: 1024, model: 'claude-haiku-4-5-20251001' });
    res.json({ briefing });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- TASKS ----------------
app.get('/api/tasks', (req, res) => {
  let q = supabase.from('tasks').select('*, entities(name, icon)').order('created_at', { ascending: false });
  if (req.query.archived !== undefined) {
    q = q.eq('is_archived', req.query.archived === 'true');
  }
  handle(res, q);
});

app.post('/api/tasks', (req, res) => {
  const { title, entity_id, timeframe, is_key } = req.body;
  // created_at previously relied on the column's own DEFAULT NOW() (UTC,
  // unfixed) instead of localTimestampStr() -- the same bug class already
  // fixed for nutrition_log/journal_entries, just missed here. Caught
  // while adding the morning stale-task nudge (lib/telegram.js), which
  // computes task age from this exact column.
  handle(res, supabase.from('tasks')
    .insert([{ title, entity_id, timeframe, is_key: !!is_key, created_at: localTimestampStr(new Date()) }]).select());
});

// Phase 3b: freeform text -> structured task fields, via Claude. Deliberately
// does NOT create anything -- returns the parsed fields for the frontend to
// show as a review step (pre-filling the existing manual add row) before the
// normal POST /api/tasks above actually creates it. A mis-filed task costs
// more to notice than a mediocre parse costs to re-edit, so nothing here is
// auto-created.
app.post('/api/tasks/parse', async (req, res) => {
  try {
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text is required' });
    const entities = await getEntitiesWithDescriptions();
    const entityNames = entities.map((e) => e.name);
    const TaskSchema = z.object({
      title: z.string().describe('A short, clear task title, cleaned up from the raw text'),
      entity: z.enum(entityNames).describe('Best-matching life area for this task'),
      timeframe: z.enum(['TODAY', 'THIS WEEK', 'THIS MONTH', 'SOMEDAY'])
        .describe('When this should happen, inferred from the text -- default to THIS WEEK if unclear'),
      is_key: z.boolean().describe('True only if the text signals this is especially important or urgent'),
    });
    // names alone aren't enough signal (e.g. "HEMS" means nothing on its own) --
    // pairing each with its description is what fixed a real misclassification
    // seen during testing (a startup-fundraising note was filed under a
    // generic "WORK" area instead of the startup's own entity)
    const entityList = entities.map((e) => `${e.name}: ${e.description || '(no description)'}`).join('\n');
    const prompt =
      'Extract a structured task from this freeform note for a personal task tracker. ' +
      'Available life areas (pick the single best match):\n' + entityList + '\n\nNote: ' + text;
    // Haiku (2026-08-28 cost pass) -- bounded structured extraction with the
    // entity list right in the prompt, same fix that resolved the earlier
    // misclassification bug above; re-check if a similar miss shows up again.
    const parsed = await askClaudeStructured(prompt, TaskSchema, { model: 'claude-haiku-4-5-20251001' });
    if (!parsed) return res.status(502).json({ error: 'Could not parse a task from that text' });
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// completed_at was added via the Phase 2 migration (see CLAUDE.md) and may not
// exist yet -- same missing-column fallback pattern as sort_order below.
const missingTaskCompletedAtColumn = (error) => error && /completed_at/i.test(error.message || '');

app.put('/api/tasks/:id', async (req, res) => {
  // tasks.updated_at is a plain TIMESTAMP (no timezone), same as completed_at
  // below -- a raw `new Date()` here would get JSON-serialized to a UTC ISO
  // string on the way out, storing UTC clock digits in a column meant to hold
  // local wall-clock time (the same bug class already fixed multiple times
  // elsewhere in this app). Nothing currently reads updated_at back, so this
  // was silent, but localTimestampStr() keeps it consistent with completed_at
  // on this same table and with every other local-time column in this app.
  const body = { ...req.body, updated_at: localTimestampStr() };
  // archiving = completed, restoring = not -- set/clear completed_at in step,
  // so task completion history needs zero frontend changes to start working
  if (Object.prototype.hasOwnProperty.call(req.body, 'is_archived')) {
    body.completed_at = req.body.is_archived ? localTimestampStr() : null;
  }

  let result = await supabase.from('tasks').update(body).eq('id', req.params.id).select();
  if (missingTaskCompletedAtColumn(result.error)) {
    delete body.completed_at;
    result = await supabase.from('tasks').update(body).eq('id', req.params.id).select();
  }
  if (result.error) {
    console.error(result.error);
    return res.status(400).json({ error: result.error.message });
  }
  res.json(result.data);
});

app.delete('/api/tasks/:id', (req, res) => {
  handle(res, supabase.from('tasks').delete().eq('id', req.params.id));
});

// ---------------- HABITS ----------------
// sort_order was added to the table via a manual migration that may not have been
// run yet (see CLAUDE.md) -- these two routes fall back to working without it rather
// than hard-failing the whole habits feature when the column is missing. Drag-reorder
// just won't persist until the column actually exists.
// PostgREST reports a missing column differently depending on the operation --
// INSERT gives code PGRST204 ("Could not find the column... in the schema cache"),
// a plain SELECT/ORDER BY gives the raw Postgres 42703 ("column ... does not exist").
// Matching on the column name in the message covers both.
const missingSortOrderColumn = (error) =>
  error && /sort_order/i.test(error.message || '');
// Defined here (not down by the other habit_subtasks routes) so it's
// available to GET /api/habits below -- const isn't hoisted.
const missingHabitSubtasksTable = (error) => error && /habit_subtasks/i.test(error.message || '');

app.get('/api/habits', async (req, res) => {
  let result = await supabase.from('habits').select('*, entities(name, icon), habit_subtasks(*)')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('id');
  if (missingHabitSubtasksTable(result.error)) {
    result = await supabase.from('habits').select('*, entities(name, icon)')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('id');
  }
  if (missingSortOrderColumn(result.error)) {
    result = await supabase.from('habits').select('*, entities(name, icon)').order('id');
  }
  if (result.error) {
    console.error(result.error);
    return res.status(400).json({ error: result.error.message });
  }
  res.json(result.data);
});

app.post('/api/habits', async (req, res) => {
  const { label, category, entity_id, sort_order } = req.body;
  const row = { label, category, entity_id };
  if (sort_order !== undefined) row.sort_order = sort_order;

  let result = await supabase.from('habits').insert([row]).select();
  if (missingSortOrderColumn(result.error)) {
    delete row.sort_order;
    result = await supabase.from('habits').insert([row]).select();
  }
  if (result.error) {
    console.error(result.error);
    return res.status(400).json({ error: result.error.message });
  }
  res.json(result.data);
});

// habit_completions is the Phase 2 history log (see CLAUDE.md) -- a row per
// habit per completed day, inserted when checked, deleted when unchecked same
// day. Table may not exist yet -- best-effort: failures here are logged but
// never block the main habits update, which has to keep working regardless.
const missingHabitCompletionsTable = (error) => error && /habit_completions/i.test(error.message || '');

// Shared side effect of "a habit became done/undone for a given day" --
// used both by a direct habit toggle (PUT /api/habits/:id below) and the
// sub-task cascade (PUT /api/habit-subtasks/:id further down, when
// completing/unchecking a sub-task flips whether ALL of a habit's
// sub-tasks are done). One place logs/unlogs habit_completions instead of
// duplicating this in two call sites that need to stay in sync.
async function logHabitCompletion(habitId, completedDate) {
  if (completedDate) {
    const dayStart = completedDate + 'T00:00:00';
    const dayEnd = completedDate + 'T23:59:59.999';
    const existing = await supabase.from('habit_completions')
      .select('id').eq('habit_id', habitId).gte('completed_at', dayStart).lte('completed_at', dayEnd).limit(1);
    if (!existing.error && (!existing.data || existing.data.length === 0)) {
      const ins = await supabase.from('habit_completions').insert([{ habit_id: habitId, completed_at: localTimestampStr() }]);
      if (ins.error && !missingHabitCompletionsTable(ins.error)) console.error('habit_completions insert failed:', ins.error);
    } else if (existing.error && !missingHabitCompletionsTable(existing.error)) {
      console.error('habit_completions lookup failed:', existing.error);
    }
  } else {
    const today = localDateStr(new Date());
    const dayStart = today + 'T00:00:00';
    const dayEnd = today + 'T23:59:59.999';
    const del = await supabase.from('habit_completions').delete().eq('habit_id', habitId).gte('completed_at', dayStart).lte('completed_at', dayEnd);
    if (del.error && !missingHabitCompletionsTable(del.error)) console.error('habit_completions delete failed:', del.error);
  }
}

app.put('/api/habits/:id', async (req, res) => {
  const id = req.params.id;
  const body = { ...req.body };

  // A habit WITH sub-tasks derives its completion from finishing every
  // sub-task -- completed_today/completed_date are read-only computed
  // fields for such a habit, never something a direct PUT can force.
  // Closes this for every caller, not just the dashboard's own UI (which
  // already avoids sending this for a subtask habit) -- real bug: asking
  // the Telegram agent to "check off morning routine" sent a direct
  // {completed_today:true} here exactly like this route already accepted
  // from anyone, marking the parent done while its sub-tasks stayed
  // unchecked. Applies to every habit with sub-tasks, not just one.
  //
  // "today" here is the bedtime-aware effective date (lib/habitDay.js), not
  // the plain calendar date -- Elo's rule: staying up past midnight without
  // having gone to bed yet shouldn't reset habits; the day only rolls over
  // once he actually clicks "went to bed" (or at the ordinary midnight, if
  // he went to bed before it, same as always).
  if (Object.prototype.hasOwnProperty.call(body, 'completed_date') || Object.prototype.hasOwnProperty.call(body, 'completed_today')) {
    const today = await getEffectiveDate();
    const subtasksResult = await supabase.from('habit_subtasks').select('completed_date').eq('habit_id', id);
    if (!subtasksResult.error && subtasksResult.data.length > 0) {
      const allDone = subtasksResult.data.every((s) => s.completed_date === today);
      body.completed_today = allDone;
      body.completed_date = allDone ? today : null;
    } else if (body.completed_today) {
      // No sub-tasks -- still pin the date to the effective "today" rather
      // than trusting whatever date the caller sent.
      body.completed_date = today;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'completed_date')) {
    await logHabitCompletion(id, body.completed_date);
  }

  handle(res, supabase.from('habits').update(body).eq('id', id).select());
});

app.delete('/api/habits/:id', (req, res) => {
  handle(res, supabase.from('habits').delete().eq('id', req.params.id));
});

// ---------------- HABIT SUBTASKS ----------------
// Optional per-habit checklist -- "in the morning, I can create subtasks of
// brushing my teeth, morning yoga, breakfast... it is only if you click all
// of the sub-tasks then you complete that habit" (Elo's own words,
// 2026-08-25). A habit with zero sub-tasks behaves exactly as before
// (direct checkbox toggle) -- this is additive, not a replacement for the
// simple case, so "only if it's applicable."
//
// completed_date mirrors habits' own column (day-level "is this done
// today" gate). completed_at is a real timestamp, set alongside it and
// cleared on uncheck -- captured deliberately, not just a boolean, per
// Elo's separate request the same day that as much of his input as
// possible should land in Supabase with real timestamps for future pattern
// recognition, not be dropped as "too small to matter."
// (missingHabitSubtasksTable is defined earlier, above GET /api/habits.)

app.post('/api/habits/:id/subtasks', async (req, res) => {
  const habitId = req.params.id;
  const label = (req.body.label || '').trim();
  if (!label) return res.status(400).json({ error: 'label is required' });

  const existing = await supabase.from('habit_subtasks')
    .select('sort_order').eq('habit_id', habitId).order('sort_order', { ascending: false }).limit(1);
  if (existing.error) {
    if (missingHabitSubtasksTable(existing.error)) return res.status(404).json({ error: 'habit_subtasks table does not exist yet' });
    console.error(existing.error);
    return res.status(400).json({ error: existing.error.message });
  }
  const nextOrder = existing.data.length ? (existing.data[0].sort_order || 0) + 1 : 0;
  handle(res, supabase.from('habit_subtasks').insert([{ habit_id: habitId, label, sort_order: nextOrder }]).select());
});

app.put('/api/habit-subtasks/:id', async (req, res) => {
  const id = req.params.id;
  const body = req.body;

  if (!Object.prototype.hasOwnProperty.call(body, 'completed_date')) {
    handle(res, supabase.from('habit_subtasks').update(body).eq('id', id).select());
    return;
  }

  const now = new Date();
  // "today" is the bedtime-aware effective date (lib/habitDay.js), not the
  // plain calendar date -- see the note on PUT /api/habits/:id. Pinning the
  // date server-side here too, same "backend is authoritative" rule, rather
  // than trusting whatever date the caller sent.
  const today = body.completed_date ? await getEffectiveDate() : null;
  const patch = { completed_date: today, completed_at: today ? localTimestampStr(now) : null };
  const subResult = await supabase.from('habit_subtasks').update(patch).eq('id', id).select();
  if (subResult.error) {
    if (missingHabitSubtasksTable(subResult.error)) return res.status(404).json({ error: 'habit_subtasks table does not exist yet' });
    console.error(subResult.error);
    return res.status(400).json({ error: subResult.error.message });
  }

  // Did that toggle just complete (or break) "every sub-task done today"?
  // Cascade the parent habit's own completed_date/completed_today to
  // match, through the same logHabitCompletion() a direct toggle uses, so
  // streak/analytics can't drift out of sync with what the checkboxes show.
  const habitId = subResult.data[0].habit_id;
  const todayForCascade = today || (await getEffectiveDate());
  const allSubs = await supabase.from('habit_subtasks').select('completed_date').eq('habit_id', habitId);
  if (!allSubs.error) {
    const allDone = allSubs.data.length > 0 && allSubs.data.every((s) => s.completed_date === todayForCascade);
    const habitRow = await supabase.from('habits').select('completed_date').eq('id', habitId).maybeSingle();
    const wasDone = !habitRow.error && habitRow.data && habitRow.data.completed_date === todayForCascade;
    if (allDone !== wasDone) {
      await logHabitCompletion(habitId, allDone ? todayForCascade : null);
      const err = (await supabase.from('habits')
        .update({ completed_today: allDone, completed_date: allDone ? todayForCascade : null }).eq('id', habitId)).error;
      if (err) console.error('habit cascade update failed:', err);
    }
  }

  res.json(subResult.data[0]);
});

app.delete('/api/habit-subtasks/:id', (req, res) => {
  handle(res, supabase.from('habit_subtasks').delete().eq('id', req.params.id));
});

// ---------------- HABIT STREAK ----------------
// Streak is a single global count, not a per-habit value, so it doesn't belong on
// the habits table -- it lives in its own singleton table (always exactly one row,
// id=1). That table doesn't exist yet as of this writing (see CLAUDE.md for the
// CREATE TABLE statement) -- these routes fail gracefully until it's created, and
// the frontend falls back to per-browser localStorage in the meantime.
// PostgREST reports a missing table as PGRST205 ("Could not find the table...in
// the schema cache") when queried through its API, not the raw Postgres 42P01 --
// matching on the table name in the message covers it regardless of exact code,
// same lesson as missingSortOrderColumn above.
const missingStreakTable = (error) => error && /habit_streak/i.test(error.message || '');

app.get('/api/habit-streak', async (req, res) => {
  const result = await supabase.from('habit_streak').select('*').limit(1).maybeSingle();
  if (result.error) {
    if (missingStreakTable(result.error)) return res.status(404).json({ error: 'habit_streak table does not exist yet' });
    console.error(result.error);
    return res.status(400).json({ error: result.error.message });
  }
  res.json(result.data || { count: 0, last_done_date: null });
});

app.put('/api/habit-streak', async (req, res) => {
  const { count, last_done_date } = req.body;
  let result = await supabase.from('habit_streak').update({ count, last_done_date }).eq('id', 1).select();
  if (missingStreakTable(result.error)) {
    return res.status(404).json({ error: 'habit_streak table does not exist yet' });
  }
  if (!result.error && (!result.data || result.data.length === 0)) {
    // no row yet (table exists but was created without the seed row) -- create it
    result = await supabase.from('habit_streak').insert([{ id: 1, count, last_done_date }]).select();
  }
  if (result.error) {
    console.error(result.error);
    return res.status(400).json({ error: result.error.message });
  }
  res.json(result.data);
});

// ---------------- PROFILE ----------------
// Operator card's name/tagline/focus/photo -- another singleton row (id=1), same
// shape as habit_streak above. Table doesn't exist until the migration in
// CLAUDE.md is run -- these routes 404 gracefully until then, and the frontend
// falls back to localStorage (and ultimately the original hardcoded values) in
// the meantime.
const missingProfileTable = (error) => error && /profile/i.test(error.message || '');

app.get('/api/profile', async (req, res) => {
  const result = await supabase.from('profile').select('*').eq('id', 1).maybeSingle();
  if (result.error) {
    if (missingProfileTable(result.error)) return res.status(404).json({ error: 'profile table does not exist yet' });
    console.error(result.error);
    return res.status(400).json({ error: result.error.message });
  }
  res.json(result.data);
});

app.put('/api/profile', async (req, res) => {
  const { name, tagline, focus, photo_data } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (tagline !== undefined) update.tagline = tagline;
  if (focus !== undefined) update.focus = focus;
  if (photo_data !== undefined) update.photo_data = photo_data;

  let result = await supabase.from('profile').update(update).eq('id', 1).select();
  if (missingProfileTable(result.error)) {
    return res.status(404).json({ error: 'profile table does not exist yet' });
  }
  if (!result.error && (!result.data || result.data.length === 0)) {
    // no seed row yet -- create it
    result = await supabase.from('profile').insert([{ id: 1, ...update }]).select();
  }
  if (result.error) {
    console.error(result.error);
    return res.status(400).json({ error: result.error.message });
  }
  res.json(result.data);
});

// ---------------- GOALS ----------------
app.get('/api/goals', (req, res) => {
  let q = supabase.from('goals').select('*').order('created_at', { ascending: false });
  if (req.query.timeframe) q = q.eq('timeframe', req.query.timeframe);
  handle(res, q);
});

app.post('/api/goals', (req, res) => {
  const { text, timeframe, entity_id } = req.body;
  handle(res, supabase.from('goals').insert([{ text, timeframe, entity_id }]).select());
});

app.put('/api/goals/:id', (req, res) => {
  handle(res, supabase.from('goals').update(req.body).eq('id', req.params.id).select());
});

app.delete('/api/goals/:id', (req, res) => {
  handle(res, supabase.from('goals').delete().eq('id', req.params.id));
});

// ---------------- NUTRITION ----------------
// GET's "today" was previously computed via `new Date().toISOString().slice(0,10)`
// -- UTC, not local -- the same class of date-drift bug already fixed
// elsewhere in this app for evening entries in a negative-UTC-offset zone.
// POST previously didn't send logged_date at all, relying on the DB's
// `DEFAULT CURRENT_DATE`, which evaluates in the *database server's*
// timezone (typically UTC on a hosted Postgres), not Elo's -- same bug,
// write side. Both now use localDateStr() explicitly.
app.get('/api/nutrition', (req, res) => {
  const today = localDateStr(new Date());
  handle(res, supabase.from('nutrition_log').select('*').eq('logged_date', req.query.date || today));
});

app.post('/api/nutrition', (req, res) => {
  const { label, kcal, protein, carbs, fat, fiber, sugar, logged_date } = req.body;
  // created_at previously relied on the column's own DEFAULT NOW(), which
  // evaluates on the database server (UTC) into a timezone-naive column --
  // harmless while nothing displayed it, but HOME is about to show it as
  // "what time did I eat this," so it needs to be local, same fix pattern
  // (and same bug class) already applied to logged_date on this exact route.
  const row = {
    label, kcal, protein, carbs, fat,
    fiber: fiber ?? null, sugar: sugar ?? null,
    logged_date: logged_date || localDateStr(new Date()),
    created_at: localTimestampStr(new Date()),
  };
  handle(res, supabase.from('nutrition_log').insert([row]).select());
});

// Replaces what used to be a hardcoded placeholder -- every logged meal
// got the exact same 250 kcal / 12g protein / 20g carbs / 8g fat regardless
// of what was actually typed (confirmed directly, this was never real).
// Assumes a typical single-serving portion when the description doesn't
// specify one, rather than asking a clarifying question every time --
// this is meant to be fast, low-friction logging, not precise nutrition
// science, so a rough estimate beats adding a round-trip.
// Extended (2026-08-25) to also estimate fiber/sugar -- Elo asked for "the
// important stuff" beyond kcal/protein/carbs/fat, without ballooning into
// every micronutrient a food label carries. Deliberately NOT sodium -- Elo
// pointed out that sodium is driven almost entirely by unseen seasoning/salt
// choices, not by the food itself, so an estimate from a text description
// would just be a guess dressed up as data, unlike fiber/sugar which really
// are properties of the food. Fiber/sugar are the two genuinely estimable
// additions beyond the original four.
app.post('/api/nutrition/estimate', async (req, res) => {
  try {
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'text is required' });
    const MacroSchema = z.object({
      kcal: z.number().int().describe('Estimated total calories for this food/meal'),
      protein: z.number().int().describe('Estimated grams of protein'),
      carbs: z.number().int().describe('Estimated grams of carbohydrates'),
      fat: z.number().int().describe('Estimated grams of fat'),
      fiber: z.number().int().describe('Estimated grams of dietary fiber'),
      sugar: z.number().int().describe('Estimated grams of sugar'),
    });
    const prompt =
      'Estimate the nutrition for this food/meal, assuming a typical single-serving ' +
      "portion if the description doesn't specify one. Give your best rough estimate " +
      '-- this is for casual personal tracking, not precise nutrition science.\n\n' +
      'Food: ' + text;
    // Haiku (2026-08-28 cost pass) -- rough, casual estimation, and this is
    // the highest-frequency of the GENERATE-button-style features (every
    // food log, dashboard and Telegram both).
    const estimate = await askClaudeStructured(prompt, MacroSchema, { model: 'claude-haiku-4-5-20251001' });
    if (!estimate) return res.status(502).json({ error: 'Could not estimate nutrition for that' });
    res.json(estimate);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/nutrition/:id', (req, res) => {
  handle(res, supabase.from('nutrition_log').delete().eq('id', req.params.id));
});

// ---------------- SLEEP ----------------
// Reworked 2026-08-25: sleep is now logged by clicking "went to bed" / "woke
// up" rather than typing hours by hand -- Elo asked for hours to be derived
// from the two timestamps, not manually entered. An in-progress night lives
// in the tiny `sleep_pending` singleton row (same pattern as habit_streak/
// profile) rather than as a nullable-hours row in sleep_log, so every row
// that ever lands in sleep_log is a complete, valid record.
const missingTable = (error, name) => error && new RegExp(name, 'i').test(error.message || '');

app.get('/api/sleep', async (req, res) => {
  const result = await supabase.from('sleep_log').select('*').order('logged_date', { ascending: false }).limit(30);
  if (result.error) {
    if (missingTable(result.error, 'sleep_log')) return res.status(404).json({ error: 'sleep_log table does not exist yet' });
    console.error(result.error);
    return res.status(400).json({ error: result.error.message });
  }
  res.json(result.data);
});

app.get('/api/sleep/pending', async (req, res) => {
  const result = await supabase.from('sleep_pending').select('bed_time').eq('id', 1).maybeSingle();
  if (result.error) {
    if (missingTable(result.error, 'sleep_pending')) return res.status(404).json({ error: 'sleep_pending table does not exist yet' });
    console.error(result.error);
    return res.status(400).json({ error: result.error.message });
  }
  res.json({ bed_time: result.data ? result.data.bed_time : null });
});

// A bedtime before ~6am reads as "very late last night," not "today" --
// Elo: seeing a completed sleep entry labeled with today's date is
// confusing before he's actually gone to bed tonight. Matches how people
// naturally talk about sleep ("I went to bed at 1am" still means "last
// night"), not a literal midnight cutoff. Deliberately a fixed clock
// threshold, not the stateful bedtime-click day-boundary system
// (lib/habitDay.js) -- that one exists to answer "has a bedtime happened
// yet," which is a different question from "which night does THIS
// specific bedtime belong to" (this route only ever runs once you've
// already gone to bed, so there's nothing to defer).
function nightOfDate(bedDate) {
  const d = new Date(bedDate);
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  return localDateStr(d);
}

app.post('/api/sleep/bedtime', async (req, res) => {
  const result = await supabase.from('sleep_pending')
    .update({ bed_time: localTimestampStr(new Date()) }).eq('id', 1).select().maybeSingle();
  if (result.error) {
    if (missingTable(result.error, 'sleep_pending')) return res.status(404).json({ error: 'sleep_pending table does not exist yet' });
    console.error(result.error);
    return res.status(400).json({ error: result.error.message });
  }
  res.json({ bed_time: result.data.bed_time });
});

// Undoes an accidental "went to bed" click -- Elo: "the system should know
// that when I click off the accidental sleep was an accident." Clears
// sleep_pending back to null with no sleep_log row ever created, so it's as
// if the click never happened -- including for getEffectiveDate() (habitDay.js),
// which reads sleep_pending directly, so cancelling correctly stops that click
// from advancing the habit/journal day boundary.
app.post('/api/sleep/bedtime/cancel', async (req, res) => {
  const result = await supabase.from('sleep_pending').update({ bed_time: null }).eq('id', 1).select().maybeSingle();
  if (result.error) {
    if (missingTable(result.error, 'sleep_pending')) return res.status(404).json({ error: 'sleep_pending table does not exist yet' });
    console.error(result.error);
    return res.status(400).json({ error: result.error.message });
  }
  res.json({ ok: true });
});

// The "effective" habit/journal day -- see lib/habitDay.js for the full
// bedtime-aware rule. Frontend fetches this instead of computing its own
// literal calendar date for habit-completion display and journal defaults.
app.get('/api/today', async (req, res) => {
  res.json({ date: await getEffectiveDate() });
});

app.post('/api/sleep/wake', async (req, res) => {
  const pendingResult = await supabase.from('sleep_pending').select('bed_time').eq('id', 1).maybeSingle();
  if (pendingResult.error) {
    if (missingTable(pendingResult.error, 'sleep_pending')) return res.status(404).json({ error: 'sleep_pending table does not exist yet' });
    console.error(pendingResult.error);
    return res.status(400).json({ error: pendingResult.error.message });
  }
  const bedTimeStr = pendingResult.data ? pendingResult.data.bed_time : null;
  if (!bedTimeStr) return res.status(400).json({ error: 'No bedtime recorded yet -- click "went to bed" first' });

  // bedTimeStr came from localTimestampStr() (no 'Z'), so `new Date(str)` parses
  // it as local time -- consistent with how every other TIMESTAMP column in
  // this app is written and read (see lib/dates.js). Do NOT append 'Z' here --
  // that would reintroduce the UTC-vs-local bug this project has hit and fixed
  // multiple times already.
  const now = new Date();
  const bedDate = new Date(bedTimeStr);
  const hours = Math.round(((now.getTime() - bedDate.getTime()) / 3600000) * 10) / 10;

  const loggedDate = nightOfDate(bedDate);
  const row = {
    bed_time: bedTimeStr, wake_time: localTimestampStr(now),
    hours, quality: req.body.quality ?? null, logged_date: loggedDate,
  };

  // One sleep_log row per calendar day, not one per wake click -- Elo only
  // sleeps once a night, so waking up twice on the same date (a mis-click, or
  // deliberately redoing it) should overwrite that day's entry, not stack a
  // second one next to it. No unique constraint needed for this -- just check
  // for an existing row on today's logged_date first. Uses order+limit(1)
  // rather than .maybeSingle() -- that throws if MORE than one row ever
  // matches, which would otherwise turn one stray duplicate (e.g. leftover
  // from before this de-dupe logic existed) into a hard failure on every
  // future wake for that day instead of just picking one to update.
  const existingResult = await supabase.from('sleep_log').select('id')
    .eq('logged_date', loggedDate).order('id', { ascending: false }).limit(1);
  if (existingResult.error) {
    if (missingTable(existingResult.error, 'sleep_log')) return res.status(404).json({ error: 'sleep_log table does not exist yet' });
    console.error(existingResult.error);
    return res.status(400).json({ error: existingResult.error.message });
  }
  const existing = existingResult.data[0];

  const writeResult = existing
    ? await supabase.from('sleep_log').update(row).eq('id', existing.id).select()
    : await supabase.from('sleep_log').insert([row]).select();
  if (writeResult.error) {
    if (missingTable(writeResult.error, 'sleep_log')) return res.status(404).json({ error: 'sleep_log table does not exist yet' });
    console.error(writeResult.error);
    return res.status(400).json({ error: writeResult.error.message });
  }
  await supabase.from('sleep_pending').update({ bed_time: null }).eq('id', 1);
  res.json(writeResult.data[0]);
});

app.put('/api/sleep/:id', (req, res) => {
  // Manual correction of an already-logged night -- hours/quality only
  // (bed_time/wake_time stay whatever the original bed/wake click flow
  // recorded; editing those isn't what was asked for). Same "trust the
  // body directly" convention as every other PUT in this file.
  handle(res, supabase.from('sleep_log').update(req.body).eq('id', req.params.id).select());
});

app.delete('/api/sleep/:id', (req, res) => {
  handle(res, supabase.from('sleep_log').delete().eq('id', req.params.id));
});

// ---------------- JOURNAL ----------------
app.get('/api/journal', (req, res) => {
  handle(res, supabase.from('journal_entries').select('*').order('created_at', { ascending: false }));
});

// entry_date is a plain 'YYYY-MM-DD' string from the add form's native date
// input, inserted as-is -- never routed through `new Date()`, which parses a
// bare date-only string as UTC midnight and would drift the stored day in any
// negative-UTC-offset timezone (the same class of bug already fixed once for
// habit_completions/tasks.completed_at, just via a different code path).
const missingJournalExtractColumns = (error) => error && /(entry_date|mood|themes)/i.test(error.message || '');

app.post('/api/journal', async (req, res) => {
  const { day, date, tasks_count, captures_count, recap, raw_text, entry_date } = req.body;
  // created_at previously relied on the column's own DEFAULT NOW(), which
  // evaluates on the database server in UTC into a timezone-naive column --
  // the same bug class already fixed for nutrition_log/habit_completions/
  // tasks, just missed here. Caught while building the bedtime-aware day
  // boundary below: a voice-note journal entry right around midnight showed
  // created_at ~7 hours ahead of the real local submission time.
  const body = { day, date, tasks_count, captures_count, recap, raw_text, created_at: localTimestampStr(new Date()) };
  // entry_date is the bedtime-aware effective date (lib/habitDay.js) when
  // the caller doesn't specify one -- same rule as habits, and the actual
  // point of this change: journaling right after midnight, before going to
  // bed, dates the entry to the day it's actually about, not the day the
  // clock happens to say.
  body.entry_date = entry_date || (await getEffectiveDate());
  let result = await supabase.from('journal_entries').insert([body]).select();
  if (result.error && missingJournalExtractColumns(result.error) && body.entry_date) {
    delete body.entry_date;
    result = await supabase.from('journal_entries').insert([body]).select();
  }
  if (result.error) { console.error(result.error); return res.status(400).json({ error: result.error.message }); }
  res.json(result.data);
});

app.put('/api/journal/:id', (req, res) => {
  handle(res, supabase.from('journal_entries').update(req.body).eq('id', req.params.id).select());
});

app.delete('/api/journal/:id', (req, res) => {
  handle(res, supabase.from('journal_entries').delete().eq('id', req.params.id));
});

// Unlike the entity briefing above, journal_entries.recap is a real column
// that already existed -- so a generated recap is persisted here, not just
// returned. (Previously the fake placeholder deliberately wasn't saved, since
// it would've just written filler text into the database -- now that it's a
// real summary, saving it is the right call.)
app.post('/api/journal/:id/summary', async (req, res) => {
  try {
    const entry = await getJournalContext(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Journal entry not found' });
    const prompt =
      'You are writing a short recap of one journal entry inside a personal ' +
      'dashboard. Based on the raw text below, write a 2-3 sentence plain-' +
      'language summary of what happened and how the day went. No headers, ' +
      'no bullet points, just prose.\n\n' + (entry.raw_text || '(empty entry)');
    // Haiku (2026-08-28 cost pass) -- a short summary of text already in the
    // prompt, low stakes if occasionally terse.
    const recap = await askClaude(prompt, { maxTokens: 1024, model: 'claude-haiku-4-5-20251001' });
    const { error } = await supabase.from('journal_entries').update({ recap }).eq('id', req.params.id);
    if (error) { console.error(error); return res.status(400).json({ error: error.message }); }
    res.json({ recap });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Reads mood/themes out of a journal entry's raw text. Auto-triggered by the
// client right after a new entry is created (a separate call, not synchronous
// inside POST /api/journal above -- keeps journal saves fast), and reused as
// the manual "re-analyze" affordance after an edit -- one route, two triggers,
// no second code path.
app.post('/api/journal/:id/extract', async (req, res) => {
  try {
    const entry = await getJournalContext(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Journal entry not found' });
    const MoodSchema = z.object({
      mood: z.number().int().min(1).max(5)
        .describe('Overall mood of the day based on this entry: 1 = rough/bad day, 5 = great day'),
      themes: z.array(z.string()).min(1).max(4)
        .describe('2-4 short lowercase theme tags summarizing the day, e.g. "work stress", "exercise"'),
    });
    const prompt =
      "Read this journal entry and rate the day's overall mood on a 1-5 scale " +
      '(1 = rough/bad day, 5 = great day), and extract 2-4 short theme tags.\n\n' +
      (entry.raw_text || '(empty entry)');
    // Sonnet (the shared default, 2026-08-28 cost pass) -- kept off Haiku
    // deliberately: this becomes real history other features read back later
    // (correlation data, insights), so a nuanced misread here compounds.
    const parsed = await askClaudeStructured(prompt, MoodSchema);
    if (!parsed) return res.status(502).json({ error: 'Could not analyze this entry' });
    const update = await supabase.from('journal_entries')
      .update({ mood: parsed.mood, themes: parsed.themes }).eq('id', req.params.id);
    if (update.error) {
      if (missingJournalExtractColumns(update.error)) {
        return res.status(404).json({ error: 'mood/themes columns do not exist yet' });
      }
      console.error(update.error);
      return res.status(400).json({ error: update.error.message });
    }
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- ANALYTICS ----------------
// Backend-driven pattern analysis over habit_completions + tasks.completed_at.
// This is meant as data infrastructure for AI insights later (roadmap step 5),
// not a display feature -- there's no frontend UI consuming these yet, they're
// verified directly. Needs the Phase 2 migration (see CLAUDE.md); 404s
// gracefully until it's run, same as habit_streak/profile above.
app.get('/api/analytics/habits', async (req, res) => {
  const habitsResult = await supabase.from('habits').select('id, label');
  if (habitsResult.error) {
    console.error(habitsResult.error);
    return res.status(400).json({ error: habitsResult.error.message });
  }
  const completionsResult = await supabase.from('habit_completions').select('habit_id, completed_at');
  if (completionsResult.error) {
    if (missingHabitCompletionsTable(completionsResult.error)) {
      return res.status(404).json({ error: 'habit_completions table does not exist yet' });
    }
    console.error(completionsResult.error);
    return res.status(400).json({ error: completionsResult.error.message });
  }

  const WINDOW_DAYS = 30;
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 86400000);

  // hardest-to-keep habits first (lowest completion rate over the window);
  // avg_completion_hour is local-time, null if the habit has no logged history
  const stats = habitsResult.data
    .map((h) => {
      const forHabit = completionsResult.data.filter((c) => c.habit_id === h.id);
      const inWindow = forHabit.filter((c) => new Date(c.completed_at) >= windowStart);
      const hours = inWindow.map((c) => new Date(c.completed_at).getHours());
      const avgHour = hours.length > 0 ? hours.reduce((a, b) => a + b, 0) / hours.length : null;
      return {
        habit_id: h.id,
        label: h.label,
        total_completions: forHabit.length,
        completions_last_30d: inWindow.length,
        completion_rate_last_30d: Math.round((inWindow.length / WINDOW_DAYS) * 100) / 100,
        avg_completion_hour: avgHour === null ? null : Math.round(avgHour * 10) / 10,
      };
    })
    .sort((a, b) => a.completion_rate_last_30d - b.completion_rate_last_30d);

  res.json({ window_days: WINDOW_DAYS, habits: stats });
});

app.get('/api/analytics/correlation', async (req, res) => {
  try {
    const result = await getCorrelationData(parseInt(req.query.days, 10) || 14);
    res.json(result);
  } catch (error) {
    if (missingHabitCompletionsTable(error)) {
      return res.status(404).json({ error: 'habit_completions table does not exist yet' });
    }
    if (missingTaskCompletedAtColumn(error)) {
      return res.status(404).json({ error: 'tasks.completed_at column does not exist yet' });
    }
    console.error(error);
    res.status(400).json({ error: error.message });
  }
});

// Phase 4: a plain-English callout of any real pattern across habit
// completion, task completion, and journal mood. Deliberately NOT persisted
// (same reasoning as the entity briefing above) -- it's a live snapshot over
// a rolling window, not a fact about one row, so there's no natural place to
// cache it. Generated on demand via a button, not on every view, so looking
// at the page doesn't itself cost a Claude call.
app.post('/api/analytics/insight', async (req, res) => {
  try {
    const { correlation } = await getCorrelationData(parseInt(req.query.days, 10) || 14);
    const lines = correlation.map((d) =>
      `${d.date}: habits ${d.habits_completed}/${d.habits_total}` +
      (d.habit_completion_rate != null ? ` (${Math.round(d.habit_completion_rate * 100)}%)` : '') +
      `, tasks completed ${d.tasks_completed_count}, mood ${d.mood != null ? d.mood + '/5' : 'n/a'}` +
      `, calendar ${d.calendar_events_count} event${d.calendar_events_count === 1 ? '' : 's'}` +
      (d.calendar_busy_hours > 0 ? ` (${d.calendar_busy_hours}h busy)` : '')
    ).join('\n');
    const prompt =
      'Here is day-by-day data from a personal dashboard: habit completion rate, tasks completed, ' +
      'self-reported mood (1-5, higher is better), and calendar load (event count + scheduled hours) ' +
      'for each day. A day showing 0 calendar events may mean a genuinely free day, or may just mean ' +
      'the calendar was never checked that day (history only exists once a day is actually looked at) -- ' +
      "don't treat a string of 0s as meaningful unless it's plausible Elo really had that many free days.\n\n" +
      lines + '\n\n' +
      'Write 2-4 sentences pointing out any REAL pattern connecting these (for example ' +
      'habits vs mood, tasks vs mood, or a busy calendar day vs habit completion). If the data does not ' +
      'show a clear pattern, say so plainly instead of inventing one -- do not force a conclusion.';
    // Sonnet (the shared default, 2026-08-28 cost pass) -- kept off Haiku
    // deliberately: judging whether a pattern is real (vs. forcing one that
    // isn't there) is exactly the kind of nuanced call worth the better tier.
    const insight = await askClaude(prompt, { maxTokens: 1024 });
    res.json({ insight });
  } catch (error) {
    if (missingHabitCompletionsTable(error)) {
      return res.status(404).json({ error: 'habit_completions table does not exist yet' });
    }
    if (missingTaskCompletedAtColumn(error)) {
      return res.status(404).json({ error: 'tasks.completed_at column does not exist yet' });
    }
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------- HEALTH ----------------
app.get('/api/health/data', async (req, res) => {
  try {
    const health = await getHealthContext(parseInt(req.query.days, 10) || 14);
    res.json({ days: health.length, health });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/health/insight', async (req, res) => {
  try {
    const health = await getHealthContext(parseInt(req.query.days, 10) || 14);
    const lines = health.map((d) =>
      `${d.date}: sleep ${d.sleep_hours != null ? d.sleep_hours + 'h' : 'n/a'}` +
      (d.sleep_quality != null ? ` (quality ${d.sleep_quality}/5)` : '') +
      `, ${d.kcal} kcal, health habits ${d.health_habits_completed}/${d.health_habits_total}`
    ).join('\n');
    const prompt =
      'Here is day-by-day health data from a personal dashboard: sleep hours and quality ' +
      '(1-5, higher is better), calories logged, and completion of health-related habits.\n\n' +
      lines + '\n\n' +
      'Write 2-4 sentences pointing out any REAL pattern connecting these (for example ' +
      'sleep vs habit completion, or nutrition vs sleep). If the data does not show a ' +
      'clear pattern, say so plainly instead of inventing one -- do not force a conclusion.';
    // Sonnet (the shared default, 2026-08-28 cost pass) -- same reasoning as
    // /api/analytics/insight above.
    const insight = await askClaude(prompt, { maxTokens: 1024 });
    res.json({ insight });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// health_goals: singleton row (id=1), same pattern as habit_streak/profile --
// captured once via an in-chat "interview" (physique goal, workout routine,
// bodyweight/height/age -> Mifflin-St Jeor + activity factor for calories,
// 1g/lb bodyweight for protein), editable later the same way profile fields
// are. Graceful 404 pre-migration, same as every other singleton table here.
const missingHealthGoalsTable = (error) => error && /health_goals/i.test(error.message || '');

app.get('/api/health/goals', async (req, res) => {
  const result = await supabase.from('health_goals').select('*').eq('id', 1).maybeSingle();
  if (result.error) {
    if (missingHealthGoalsTable(result.error)) return res.status(404).json({ error: 'health_goals table does not exist yet' });
    console.error(result.error);
    return res.status(400).json({ error: result.error.message });
  }
  res.json(result.data);
});

app.put('/api/health/goals', async (req, res) => {
  const { calorie_goal, protein_goal, sugar_goal, physique_goal, workout_goal } = req.body;
  const update = { updated_at: localTimestampStr(new Date()) };
  if (calorie_goal !== undefined) update.calorie_goal = calorie_goal;
  if (protein_goal !== undefined) update.protein_goal = protein_goal;
  if (sugar_goal !== undefined) update.sugar_goal = sugar_goal;
  if (physique_goal !== undefined) update.physique_goal = physique_goal;
  if (workout_goal !== undefined) update.workout_goal = workout_goal;

  let result = await supabase.from('health_goals').update(update).eq('id', 1).select();
  if (missingHealthGoalsTable(result.error)) {
    return res.status(404).json({ error: 'health_goals table does not exist yet' });
  }
  if (!result.error && (!result.data || result.data.length === 0)) {
    result = await supabase.from('health_goals').insert([{ id: 1, ...update }]).select();
  }
  if (result.error) {
    console.error(result.error);
    return res.status(400).json({ error: result.error.message });
  }
  res.json(result.data);
});

// ---------------- GOOGLE CALENDAR ----------------
// Phase 6: OAuth (Authorization Code flow) + a live "today's events" read,
// no local sync/table yet -- HOME just needs today's real events in place of
// EVENTS_TODAY, so there's nothing to gain from a synced local copy until
// something else (analytics, history) actually needs calendar data at rest.
const missingIntegrationsTable = (error) => error && /integrations/i.test(error.message || '');

// Browser navigation, not a fetch -- this has to be a real page redirect to
// Google's own consent screen, which a fetch() can't drive.
app.get('/api/integrations/google/auth', (req, res) => {
  res.redirect(googleCalendar.getAuthUrl());
});

app.get('/api/integrations/google/callback', async (req, res) => {
  const { code, error: authError } = req.query;
  if (authError) return res.redirect(googleCalendar.FRONTEND_URL + '/?google=denied');
  try {
    const client = googleCalendar.newOAuthClient();
    const { tokens } = await client.getToken(code);
    await googleCalendar.saveTokens(tokens);
    res.redirect(googleCalendar.FRONTEND_URL + '/?google=connected');
  } catch (err) {
    if (missingIntegrationsTable(err)) {
      return res.redirect(googleCalendar.FRONTEND_URL + '/?google=no_table');
    }
    console.error(err);
    res.redirect(googleCalendar.FRONTEND_URL + '/?google=error');
  }
});

app.get('/api/integrations/google/status', async (req, res) => {
  try {
    res.json({ connected: await googleCalendar.isConnected() });
  } catch (err) {
    console.error(err);
    res.json({ connected: false });
  }
});

app.get('/api/calendar/events', async (req, res) => {
  try {
    const events = await googleCalendar.listEventsForDate(req.query.date);
    if (events === null) return res.json({ connected: false, events: [] });
    res.json({ connected: true, events });
  } catch (err) {
    if (missingIntegrationsTable(err)) {
      return res.status(404).json({ error: 'integrations table does not exist yet' });
    }
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Lists every calendar this account can see, with its current visible/hidden
// state (Google's own signal where reliable, this app's stored override
// otherwise) -- powers the CALENDARS toggle panel on HOME.
app.get('/api/calendar/calendars', async (req, res) => {
  try {
    const calendars = await googleCalendar.listCalendars();
    if (calendars === null) return res.status(404).json({ error: 'not connected' });
    res.json({ calendars });
  } catch (err) {
    if (missingIntegrationsTable(err)) {
      return res.status(404).json({ error: 'integrations table does not exist yet' });
    }
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/calendar/calendars', async (req, res) => {
  try {
    await googleCalendar.setHiddenCalendarIds(req.body.hidden_calendar_ids || []);
    res.json({ ok: true });
  } catch (err) {
    if (missingIntegrationsTable(err)) {
      return res.status(404).json({ error: 'integrations table does not exist yet' });
    }
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Production only -- in local dev, CRA's own dev server (port 3001) serves
// the frontend and proxies /api/* back here instead. In production there's
// no separate frontend server: this Express process serves the already-built
// React app directly, so the whole thing is one deployment, one origin, no
// CORS to worry about. Registered after every /api/* route above so those
// still win; this only catches whatever's left over (actual page loads).
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  const clientBuildPath = path.join(__dirname, 'client', 'build');
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Started after the HTTP server is listening -- the bot's own handlers call
// back into this same server (http://localhost:PORT/api/...), so it needs
// to already be up.
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  telegramBot.start();
});