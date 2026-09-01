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
  // Calendar-date arithmetic, not raw ms subtraction -- see the matching
  // comment in getHealthContext below for why `Date.now() - N*86400000`
  // drifts across DST transitions and can produce duplicate/skipped dates.
  const today = new Date();
  const windowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - clampedDays);

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

  // Calendar history (2026-08-31) -- best-effort, same pre-migration
  // tolerance as journal mood above: a missing calendar_events_log table
  // just means every day's calendar fields stay at 0, not a broken
  // endpoint. Coverage also depends on a day having been viewed/asked
  // about at least once (see lib/google.js's persistEvents) -- a day with
  // real events that was never looked at will show 0 here, not because
  // nothing happened but because nothing was ever fetched.
  const calendarByDay = {};
  const calendarResult = await supabase.from('calendar_events_log')
    .select('event_date, start_time, end_time, is_all_day').gte('event_date', localDateStr(windowStart));
  if (!calendarResult.error) {
    (calendarResult.data || []).forEach((e) => {
      const d = calendarByDay[e.event_date] || { count: 0, busyHours: 0 };
      d.count += 1;
      if (!e.is_all_day && e.start_time && e.end_time) {
        d.busyHours += Math.max(0, (new Date(e.end_time) - new Date(e.start_time)) / 3600000);
      }
      calendarByDay[e.event_date] = d;
    });
  } else if (!/calendar_events_log/i.test(calendarResult.error.message || '')) {
    throw calendarResult.error;
  }

  const out = [];
  for (let i = clampedDays - 1; i >= 0; i--) {
    const k = localDateStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i));
    const habitsCompleted = habitsByDay[k] ? habitsByDay[k].size : 0;
    out.push({
      date: k,
      habits_completed: habitsCompleted,
      habits_total: totalHabits,
      habit_completion_rate: totalHabits > 0 ? Math.round((habitsCompleted / totalHabits) * 100) / 100 : null,
      tasks_completed_count: tasksByDay[k] || 0,
      mood: moodByDay[k] != null ? moodByDay[k] : null,
      calendar_events_count: calendarByDay[k] ? calendarByDay[k].count : 0,
      calendar_busy_hours: calendarByDay[k] ? Math.round(calendarByDay[k].busyHours * 10) / 10 : 0,
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
  // 3650 (~10 years) covers "ALL TIME" for a personal dashboard whose real
  // data only starts 2026-08-26 -- simpler than a separate "no limit" mode
  // that'd need its own query to find the earliest logged date, and this
  // app won't have anywhere near 10 years of history for a long while.
  const clampedDays = Math.min(3650, Math.max(1, days || 14));
  // Calendar-date arithmetic (year/month/day components), not raw ms
  // subtraction -- `Date.now() - N*86400000` drifts across DST transitions
  // (a "spring forward"/"fall back" day is 23 or 25 real hours, not 24),
  // which is invisible at 90 days but genuinely produced duplicate/skipped
  // calendar dates once the 3650-day "ALL" range started crossing DST
  // boundaries close to local midnight. `new Date(y, m, d - N)` uses the
  // Date constructor's own local calendar rollover instead, so it can't
  // drift regardless of how many DST transitions or month/year boundaries
  // are in the range.
  const today = new Date();
  const windowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - clampedDays);
  const windowStartStr = localDateStr(windowStart);

  const sleepByDay = {};
  const sleepResult = await supabase.from('sleep_log')
    .select('hours, quality, logged_date, bed_time, wake_time').gte('logged_date', windowStartStr);
  if (!sleepResult.error) {
    (sleepResult.data || []).forEach((s) => {
      sleepByDay[s.logged_date] = { hours: s.hours, quality: s.quality, bedTime: s.bed_time, wakeTime: s.wake_time };
    });
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
    // Same calendar-date arithmetic as windowStart above -- see that
    // comment for why raw ms subtraction from Date.now() is wrong here.
    const k = localDateStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i));
    const n = nutritionByDay[k];
    out.push({
      date: k,
      sleep_hours: sleepByDay[k] ? sleepByDay[k].hours : null,
      sleep_quality: sleepByDay[k] ? sleepByDay[k].quality : null,
      sleep_bed_time: sleepByDay[k] ? sleepByDay[k].bedTime : null,
      sleep_wake_time: sleepByDay[k] ? sleepByDay[k].wakeTime : null,
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
