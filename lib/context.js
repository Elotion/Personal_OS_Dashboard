const supabase = require('../supabaseClient');
const { localDateStr, localTimestampStr } = require('./dates');

// Pulls and formats the data a given feature needs into Claude-ready text.
// Shared by any prompt that needs "everything about entity X" or "this
// journal entry" -- grows as later phases (insights, correlation) need wider
// slices, instead of each route re-deriving its own fetch-and-format logic.

async function getEntityContext(entityId) {
  const { data: entity, error: entityError } = await supabase
    .from('entities').select('*').eq('id', entityId).maybeSingle();
  if (entityError) throw entityError;
  if (!entity) return null;

  const { data: tasks, error: tasksError } = await supabase
    .from('tasks').select('*').eq('entity_id', entityId).eq('is_archived', false);
  if (tasksError) throw tasksError;

  const taskLines = (tasks || []).map(
    (t) => `- [${t.timeframe}]${t.is_key ? ' (KEY)' : ''} ${t.title}`
  );

  const text =
    `Life area: ${entity.name}\n` +
    `Description: ${entity.description || '(none)'}\n\n` +
    `Open tasks (${tasks ? tasks.length : 0}):\n` +
    (taskLines.length ? taskLines.join('\n') : '(none)');

  return { entity, tasks: tasks || [], text };
}

// Names alone aren't enough signal to classify a task correctly (e.g. "HEMS"
// gives Claude nothing to go on) -- this pairs each with its description for
// prompts that need to pick the right one, like task parsing.
async function getEntitiesWithDescriptions() {
  const { data, error } = await supabase.from('entities').select('name, description').order('id');
  if (error) throw error;
  return data || [];
}

async function getJournalContext(entryId) {
  const { data: entry, error } = await supabase
    .from('journal_entries').select('*').eq('id', entryId).maybeSingle();
  if (error) throw error;
  return entry || null;
}

// Day-by-day habit/task/mood data for the trailing N days -- the one shared
// build for both GET /api/analytics/correlation (raw data) and
// POST /api/analytics/insight (same data, fed to Claude as a prompt), so the
// two never drift out of sync with each other.
//
// habits/tasks errors are thrown as-is -- the caller checks them against
// missingHabitCompletionsTable/missingTaskCompletedAtColumn, since those are
// hard dependencies (there's no meaningful correlation without them). The
// journal-mood merge is best-effort: a missing entry_date/mood column just
// means mood stays null for every day, rather than failing the whole
// endpoint -- habit/task correlation has value on its own even before the
// Phase 4 migration lands.
async function getCorrelationData(days) {
  const clampedDays = Math.min(90, Math.max(1, days || 14));
  const windowStart = new Date(Date.now() - clampedDays * 86400000);

  const habitsResult = await supabase.from('habits').select('id');
  if (habitsResult.error) throw habitsResult.error;
  const totalHabits = habitsResult.data.length;

  const completionsResult = await supabase.from('habit_completions')
    .select('habit_id, completed_at').gte('completed_at', localTimestampStr(windowStart));
  if (completionsResult.error) throw completionsResult.error;

  const tasksResult = await supabase.from('tasks')
    .select('id, completed_at').eq('is_archived', true).gte('completed_at', localTimestampStr(windowStart));
  if (tasksResult.error) throw tasksResult.error;

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

  // entry_date comes back from PostgREST as a plain 'YYYY-MM-DD' string --
  // used directly as the join key, never wrapped in `new Date()` (a bare
  // date-only string parses as UTC midnight in JS, which would drift the day
  // in any negative-UTC-offset timezone -- the same bug class already fixed
  // once for habit_completions/tasks.completed_at).
  const moodByDay = {};
  const journalResult = await supabase.from('journal_entries')
    .select('entry_date, mood').gte('entry_date', localDateStr(windowStart));
  if (!journalResult.error) {
    (journalResult.data || []).forEach((j) => {
      if (j.entry_date && j.mood != null) moodByDay[j.entry_date] = j.mood;
    });
  } else if (!/entry_date|mood/i.test(journalResult.error.message || '')) {
    throw journalResult.error; // a real error, not just the columns being missing pre-migration
  }

  const out = [];
  for (let i = clampedDays - 1; i >= 0; i--) {
    const k = localDateStr(new Date(Date.now() - i * 86400000));
    const habitsCompleted = habitsByDay[k] ? habitsByDay[k].size : 0;
    out.push({
      date: k,
      habits_completed: habitsCompleted,
      habits_total: totalHabits,
      habit_completion_rate: totalHabits > 0 ? Math.round((habitsCompleted / totalHabits) * 100) / 100 : null,
      tasks_completed_count: tasksByDay[k] || 0,
      mood: moodByDay[k] != null ? moodByDay[k] : null,
    });
  }

  return { days: clampedDays, correlation: out };
}

// Day-by-day sleep/nutrition/HEALTH-habit data for the trailing N days --
// shared by GET /api/health/data (raw data for HealthTab's charts) and
// POST /api/health/insight (same data, fed to Claude), same reasoning as
// getCorrelationData above: one build, not two that can drift apart.
//
// sleep_log/nutrition_log errors are best-effort (missing table just means
// that metric stays empty for every day, same as the missing-column
// pattern used elsewhere) -- sleep and nutrition are independent of each
// other, so one being unavailable shouldn't block the other. The HEALTH
// entity's habit completion piece is similarly best-effort: no "HEALTH"
// entity, no habits on it, or no completions yet all just mean 0/0 rather
// than an error.
async function getHealthContext(days) {
  const clampedDays = Math.min(90, Math.max(1, days || 14));
  const windowStart = new Date(Date.now() - clampedDays * 86400000);
  const windowStartStr = localDateStr(windowStart);

  const sleepByDay = {};
  const sleepResult = await supabase.from('sleep_log')
    .select('hours, quality, logged_date').gte('logged_date', windowStartStr);
  if (!sleepResult.error) {
    (sleepResult.data || []).forEach((s) => { sleepByDay[s.logged_date] = { hours: s.hours, quality: s.quality }; });
  } else if (!/sleep_log/i.test(sleepResult.error.message || '')) {
    throw sleepResult.error;
  }

  const nutritionByDay = {};
  const nutritionResult = await supabase.from('nutrition_log')
    .select('kcal, protein, carbs, fat, fiber, sugar, logged_date').gte('logged_date', windowStartStr);
  if (!nutritionResult.error) {
    (nutritionResult.data || []).forEach((n) => {
      const d = nutritionByDay[n.logged_date] || { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };
      d.kcal += n.kcal || 0; d.protein += n.protein || 0; d.carbs += n.carbs || 0; d.fat += n.fat || 0;
      d.fiber += n.fiber || 0; d.sugar += n.sugar || 0;
      nutritionByDay[n.logged_date] = d;
    });
  } else if (!/fiber|sugar/i.test(nutritionResult.error.message || '')) {
    throw nutritionResult.error; // nutrition_log/kcal etc have always existed, a real error here is real
  }

  let totalHealthHabits = 0;
  const healthHabitsByDay = {};
  const entityResult = await supabase.from('entities').select('id').eq('name', 'HEALTH').maybeSingle();
  if (!entityResult.error && entityResult.data) {
    const habitsResult = await supabase.from('habits').select('id').eq('entity_id', entityResult.data.id);
    if (!habitsResult.error) {
      totalHealthHabits = habitsResult.data.length;
      const habitIds = habitsResult.data.map((h) => h.id);
      if (habitIds.length > 0) {
        const completionsResult = await supabase.from('habit_completions')
          .select('habit_id, completed_at').in('habit_id', habitIds).gte('completed_at', localTimestampStr(windowStart));
        if (!completionsResult.error) {
          completionsResult.data.forEach((c) => {
            const k = localDateStr(new Date(c.completed_at));
            (healthHabitsByDay[k] = healthHabitsByDay[k] || new Set()).add(c.habit_id);
          });
        }
      }
    }
  }

  const out = [];
  for (let i = clampedDays - 1; i >= 0; i--) {
    const k = localDateStr(new Date(Date.now() - i * 86400000));
    const n = nutritionByDay[k];
    out.push({
      date: k,
      sleep_hours: sleepByDay[k] ? sleepByDay[k].hours : null,
      sleep_quality: sleepByDay[k] ? sleepByDay[k].quality : null,
      kcal: n ? n.kcal : 0,
      protein: n ? n.protein : 0,
      carbs: n ? n.carbs : 0,
      fat: n ? n.fat : 0,
      fiber: n ? n.fiber : 0,
      sugar: n ? n.sugar : 0,
      health_habits_completed: healthHabitsByDay[k] ? healthHabitsByDay[k].size : 0,
      health_habits_total: totalHealthHabits,
    });
  }
  return out;
}

module.exports = {
  getEntityContext, getJournalContext, getEntitiesWithDescriptions, getCorrelationData, getHealthContext,
};
