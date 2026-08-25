require('dotenv').config();
const express = require('express');
const cors = require('cors');
const supabase = require('./supabaseClient');
const { z } = require('zod');
const { askClaude, askClaudeStructured } = require('./lib/anthropic');
const { getEntityContext, getJournalContext, getEntitiesWithDescriptions, getCorrelationData, getHealthContext } = require('./lib/context');
const { localDateStr, localTimestampStr } = require('./lib/dates');
const googleCalendar = require('./lib/google');
const telegramBot = require('./lib/telegram');

const app = express();
app.use(cors());
// raised from the default ~100kb -- the profile photo is sent as a base64 data
// URL in the request body, which is bigger than plain JSON payloads elsewhere
app.use(express.json({ limit: '5mb' }));

const PORT = process.env.PORT || 5050;

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
    const briefing = await askClaude(prompt, { maxTokens: 1024 });
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
  handle(res, supabase.from('tasks').insert([{ title, entity_id, timeframe, is_key: !!is_key }]).select());
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
    const parsed = await askClaudeStructured(prompt, TaskSchema);
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
  const body = { ...req.body, updated_at: new Date() };
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

app.get('/api/habits', async (req, res) => {
  let result = await supabase.from('habits').select('*, entities(name, icon)')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('id');
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

app.put('/api/habits/:id', async (req, res) => {
  const id = req.params.id;
  const body = req.body;

  if (Object.prototype.hasOwnProperty.call(body, 'completed_date')) {
    if (body.completed_date) {
      // checked -- log today's completion if one isn't already on record
      const dayStart = body.completed_date + 'T00:00:00';
      const dayEnd = body.completed_date + 'T23:59:59.999';
      const existing = await supabase.from('habit_completions')
        .select('id').eq('habit_id', id).gte('completed_at', dayStart).lte('completed_at', dayEnd).limit(1);
      if (!existing.error && (!existing.data || existing.data.length === 0)) {
        const ins = await supabase.from('habit_completions').insert([{ habit_id: id, completed_at: localTimestampStr() }]);
        if (ins.error && !missingHabitCompletionsTable(ins.error)) console.error('habit_completions insert failed:', ins.error);
      } else if (existing.error && !missingHabitCompletionsTable(existing.error)) {
        console.error('habit_completions lookup failed:', existing.error);
      }
    } else {
      // unchecked -- remove today's logged completion, if any
      const today = localDateStr(new Date());
      const dayStart = today + 'T00:00:00';
      const dayEnd = today + 'T23:59:59.999';
      const del = await supabase.from('habit_completions').delete().eq('habit_id', id).gte('completed_at', dayStart).lte('completed_at', dayEnd);
      if (del.error && !missingHabitCompletionsTable(del.error)) console.error('habit_completions delete failed:', del.error);
    }
  }

  handle(res, supabase.from('habits').update(body).eq('id', id).select());
});

app.delete('/api/habits/:id', (req, res) => {
  handle(res, supabase.from('habits').delete().eq('id', req.params.id));
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
  const row = {
    label, kcal, protein, carbs, fat,
    fiber: fiber ?? null, sugar: sugar ?? null,
    logged_date: logged_date || localDateStr(new Date()),
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
    const estimate = await askClaudeStructured(prompt, MacroSchema);
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

  const row = {
    bed_time: bedTimeStr, wake_time: localTimestampStr(now),
    hours, quality: req.body.quality ?? null, logged_date: localDateStr(now),
  };
  const insertResult = await supabase.from('sleep_log').insert([row]).select();
  if (insertResult.error) {
    if (missingTable(insertResult.error, 'sleep_log')) return res.status(404).json({ error: 'sleep_log table does not exist yet' });
    console.error(insertResult.error);
    return res.status(400).json({ error: insertResult.error.message });
  }
  await supabase.from('sleep_pending').update({ bed_time: null }).eq('id', 1);
  res.json(insertResult.data[0]);
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
  const body = { day, date, tasks_count, captures_count, recap, raw_text };
  if (entry_date) body.entry_date = entry_date;
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
    const recap = await askClaude(prompt, { maxTokens: 1024 });
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
      `, tasks completed ${d.tasks_completed_count}, mood ${d.mood != null ? d.mood + '/5' : 'n/a'}`
    ).join('\n');
    const prompt =
      'Here is day-by-day data from a personal dashboard: habit completion rate, ' +
      'tasks completed, and self-reported mood (1-5, higher is better) for each day.\n\n' +
      lines + '\n\n' +
      'Write 2-4 sentences pointing out any REAL pattern connecting these (for example ' +
      'habits vs mood, or habits vs tasks). If the data does not show a clear pattern, ' +
      'say so plainly instead of inventing one -- do not force a conclusion.';
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
    const insight = await askClaude(prompt, { maxTokens: 1024 });
    res.json({ insight });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
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