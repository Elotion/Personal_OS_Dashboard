require('dotenv').config();
const express = require('express');
const cors = require('cors');
const supabase = require('./supabaseClient');

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

app.put('/api/tasks/:id', (req, res) => {
  handle(res, supabase.from('tasks').update({ ...req.body, updated_at: new Date() }).eq('id', req.params.id).select());
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

app.put('/api/habits/:id', (req, res) => {
  handle(res, supabase.from('habits').update(req.body).eq('id', req.params.id).select());
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
app.get('/api/nutrition', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  handle(res, supabase.from('nutrition_log').select('*').eq('logged_date', req.query.date || today));
});

app.post('/api/nutrition', (req, res) => {
  const { label, kcal, protein, carbs, fat } = req.body;
  handle(res, supabase.from('nutrition_log').insert([{ label, kcal, protein, carbs, fat }]).select());
});

app.delete('/api/nutrition/:id', (req, res) => {
  handle(res, supabase.from('nutrition_log').delete().eq('id', req.params.id));
});

// ---------------- JOURNAL ----------------
app.get('/api/journal', (req, res) => {
  handle(res, supabase.from('journal_entries').select('*').order('created_at', { ascending: false }));
});

app.post('/api/journal', (req, res) => {
  const { day, date, tasks_count, captures_count, recap, raw_text } = req.body;
  handle(res, supabase.from('journal_entries').insert([{ day, date, tasks_count, captures_count, recap, raw_text }]).select());
});

app.put('/api/journal/:id', (req, res) => {
  handle(res, supabase.from('journal_entries').update(req.body).eq('id', req.params.id).select());
});

app.delete('/api/journal/:id', (req, res) => {
  handle(res, supabase.from('journal_entries').delete().eq('id', req.params.id));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));