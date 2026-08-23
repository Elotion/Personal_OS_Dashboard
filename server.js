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

// local calendar date (not UTC) -- mirrors localDateStr() in client/src/App.js;
// a bare toISOString().slice(0,10) drifts a day off in negative-UTC-offset
// timezones for part of the evening, which would silently misbucket analytics
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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

// completed_at was added via the Phase 2 migration (see CLAUDE.md) and may not
// exist yet -- same missing-column fallback pattern as sort_order below.
const missingTaskCompletedAtColumn = (error) => error && /completed_at/i.test(error.message || '');

app.put('/api/tasks/:id', async (req, res) => {
  const body = { ...req.body, updated_at: new Date() };
  // archiving = completed, restoring = not -- set/clear completed_at in step,
  // so task completion history needs zero frontend changes to start working
  if (Object.prototype.hasOwnProperty.call(req.body, 'is_archived')) {
    body.completed_at = req.body.is_archived ? new Date() : null;
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
        const ins = await supabase.from('habit_completions').insert([{ habit_id: id, completed_at: new Date().toISOString() }]);
        if (ins.error && !missingHabitCompletionsTable(ins.error)) console.error('habit_completions insert failed:', ins.error);
      } else if (existing.error && !missingHabitCompletionsTable(existing.error)) {
        console.error('habit_completions lookup failed:', existing.error);
      }
    } else {
      // unchecked -- remove today's logged completion, if any
      const today = new Date().toISOString().slice(0, 10);
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
  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 14));
  const windowStart = new Date(Date.now() - days * 86400000);

  const habitsResult = await supabase.from('habits').select('id');
  if (habitsResult.error) {
    console.error(habitsResult.error);
    return res.status(400).json({ error: habitsResult.error.message });
  }
  const totalHabits = habitsResult.data.length;

  const completionsResult = await supabase.from('habit_completions')
    .select('habit_id, completed_at').gte('completed_at', windowStart.toISOString());
  if (completionsResult.error) {
    if (missingHabitCompletionsTable(completionsResult.error)) {
      return res.status(404).json({ error: 'habit_completions table does not exist yet' });
    }
    console.error(completionsResult.error);
    return res.status(400).json({ error: completionsResult.error.message });
  }

  const tasksResult = await supabase.from('tasks')
    .select('id, completed_at').eq('is_archived', true).gte('completed_at', windowStart.toISOString());
  if (tasksResult.error) {
    if (missingTaskCompletedAtColumn(tasksResult.error)) {
      return res.status(404).json({ error: 'tasks.completed_at column does not exist yet' });
    }
    console.error(tasksResult.error);
    return res.status(400).json({ error: tasksResult.error.message });
  }

  // bucket both by LOCAL calendar date (see localDateStr note above)
  const habitsByDay = {};
  completionsResult.data.forEach((c) => {
    const k = localDateStr(new Date(c.completed_at));
    (habitsByDay[k] = habitsByDay[k] || new Set()).add(c.habit_id);
  });
  const tasksByDay = {};
  tasksResult.data.forEach((t) => {
    if (!t.completed_at) return;
    const k = localDateStr(new Date(t.completed_at));
    tasksByDay[k] = (tasksByDay[k] || 0) + 1;
  });

  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = localDateStr(new Date(Date.now() - i * 86400000));
    const habitsCompleted = habitsByDay[k] ? habitsByDay[k].size : 0;
    out.push({
      date: k,
      habits_completed: habitsCompleted,
      habits_total: totalHabits,
      habit_completion_rate: totalHabits > 0 ? Math.round((habitsCompleted / totalHabits) * 100) / 100 : null,
      tasks_completed_count: tasksByDay[k] || 0,
    });
  }

  res.json({ days, correlation: out });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));