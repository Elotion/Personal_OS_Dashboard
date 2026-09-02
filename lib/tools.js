// Tool definitions for the Telegram bot's agent loop (lib/agent.js). Single
// source of truth: the JSON-schema tool defs Claude sees, the executor that
// actually performs each one, and (for write tools) a deterministic one-line
// summary used to build the Confirm/Cancel card.
//
// Every executor calls the SAME Express API the React dashboard itself calls
// -- never Supabase directly -- so there's exactly one place each piece of
// app logic lives, same rule the Telegram bot has followed since Phase 7.
//
// Read tools execute immediately (nothing changes, confirming a question
// would be strange UX). Write tools always stop for a Confirm/Cancel card --
// see lib/agent.js for how the loop enforces that split.

const { localDateStr } = require('./dates');
const { INTERNAL_SECRET } = require('./internalAuth');

const API_BASE = 'http://localhost:' + (process.env.PORT || 5050);
// Guarantees these internal calls work regardless of Elo's own browser
// session state (PIN entered / Google logged in or not) -- see
// lib/internalAuth.js for why this exists instead of relying solely on
// loopback-IP detection.
const INTERNAL_HEADERS = { 'X-Internal-Secret': INTERNAL_SECRET };

async function apiGet(path) {
  const res = await fetch(API_BASE + path, { headers: INTERNAL_HEADERS });
  if (!res.ok) throw new Error('GET ' + path + ' failed: ' + res.status);
  return res.json();
}

// Used only for genuinely optional lookups (health goals may not exist yet,
// same pre-migration-tolerant pattern as the rest of this app) -- returns
// null instead of throwing so one missing table doesn't sink a whole tool.
async function apiGetSoft(path) {
  try {
    const res = await fetch(API_BASE + path, { headers: INTERNAL_HEADERS });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function apiSend(method, path, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...INTERNAL_HEADERS },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.error) || (method + ' ' + path + ' failed: ' + res.status));
  return data;
}

// journal_entries.day/date are display-formatted strings (e.g. "TODAY" /
// "AUG 23, 2026"), computed once at creation by the dashboard's own add form
// -- there's no bot-side equivalent of that form, so this recreates the same
// format from a plain entry_date string. Accepted simplification for
// bot-originated entries, not a gap in the existing /api/journal route.
// effectiveTodayStr is the bedtime-aware "today" (GET /api/today,
// lib/habitDay.js on the server), not a plain `new Date()` -- so a voice
// note journaled right after midnight, before going to bed, still labels
// correctly as "TODAY"/"YESTERDAY" relative to the day it's actually about.
function journalDisplayFields(entryDateStr, effectiveTodayStr) {
  const entryDate = new Date(entryDateStr + 'T00:00:00');
  const date = entryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  const yesterday = new Date(effectiveTodayStr + 'T00:00:00');
  yesterday.setDate(yesterday.getDate() - 1);
  let day;
  if (entryDateStr === effectiveTodayStr) day = 'TODAY';
  else if (entryDateStr === localDateStr(yesterday)) day = 'YESTERDAY';
  else day = entryDate.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  return { day, date };
}

const TIMEFRAME_ENUM = ['TODAY', 'THIS WEEK', 'THIS MONTH', 'SOMEDAY'];

const TOOL_DEFINITIONS = [
  // ---------------- READ (execute immediately, no confirm) ----------------
  {
    name: 'get_habits',
    description: 'List every habit, including whether each is completed today and its sub-tasks if any. Use this to resolve a habit name (e.g. "workout") to its real id before proposing a habit toggle.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_tasks',
    description: 'List tasks. Defaults to open (non-archived) tasks. Use this to find a task\'s real id/title before proposing a task update, or to answer questions about what\'s open/urgent/key.',
    input_schema: {
      type: 'object',
      properties: { archived: { type: 'boolean', description: 'true for archived/completed tasks, false (default) for open tasks' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_calendar_events',
    description: "List calendar events for a given date (defaults to today).",
    input_schema: {
      type: 'object',
      properties: { date: { type: 'string', description: 'YYYY-MM-DD, defaults to today if omitted' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_entities',
    description: 'List every life-area entity (UCLA, HEMS, WORK, FINANCE, HEALTH, LEARNING, PERSONAL) with their real ids. Use this to resolve an entity name to its id before creating a task.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_health_summary',
    description: "Get sleep/nutrition/health-habit data for the trailing N days, plus Elo's personal macro/calorie goals. Use this to answer questions like \"what have I eaten today\" or \"am I on track with my goals.\"",
    input_schema: {
      type: 'object',
      properties: { days: { type: 'integer', description: 'How many trailing days of data, default 7' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_insight',
    description: 'Get an AI-generated plain-English callout of any real cross-domain pattern (habits/tasks/mood) over the trailing N days.',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'integer', description: 'How many trailing days, default 14' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_correlation_data',
    description: 'Get raw day-by-day habit completion / task completion / mood data for the trailing N days, for answering specific questions yourself rather than using the canned insight.',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'integer', description: 'How many trailing days, default 14' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_sleep_status',
    description: 'Check whether Elo currently has an in-progress night logged (went to bed but hasn\'t woken up yet).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },

  // ---------------- WRITE (always confirm before executing) ----------------
  {
    name: 'toggle_habit',
    description: 'Mark a specific habit done or not-done for today. ONLY for a habit with an EMPTY habit_subtasks array in get_habits. ' +
      'A habit WITH sub-tasks derives its completion from finishing every sub-task and can never be toggled directly -- calling this on ' +
      'one is a no-op on the backend. Use toggle_habit_subtask per sub-task instead (see that tool).',
    input_schema: {
      type: 'object',
      properties: {
        habit_id: { type: 'integer', description: 'The real id from get_habits' },
        habit_label: { type: 'string', description: 'The habit\'s label, for display on the confirm card' },
        mark_done: { type: 'boolean', description: 'true to mark done, false to mark not done' },
      },
      required: ['habit_id', 'habit_label', 'mark_done'],
      additionalProperties: false,
    },
  },
  {
    name: 'toggle_habit_subtask',
    description: 'Mark ONE specific sub-task of a habit done or not-done for today. Use this, once per sub-task, for any habit that has a ' +
      'non-empty habit_subtasks array -- never toggle_habit for those. If Elo\'s message doesn\'t make clear which sub-tasks he means ' +
      '(e.g. he just says "check off morning routine" with no detail), do NOT guess -- ask him which of the habit\'s actual sub-tasks ' +
      '(name them) he finished, as plain text, before proposing anything.',
    input_schema: {
      type: 'object',
      properties: {
        subtask_id: { type: 'integer', description: 'The real habit_subtasks.id from get_habits' },
        subtask_label: { type: 'string', description: 'The sub-task\'s label, for display on the confirm card' },
        habit_label: { type: 'string', description: 'The parent habit\'s label, for display on the confirm card' },
        mark_done: { type: 'boolean', description: 'true to check it off, false to uncheck' },
      },
      required: ['subtask_id', 'subtask_label', 'habit_label', 'mark_done'],
      additionalProperties: false,
    },
  },
  {
    name: 'log_food',
    description: 'Log a meal/food from a plain description (e.g. "chicken and rice"). Macros are estimated automatically -- do not estimate them yourself.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'What was eaten, in Elo\'s own words' },
        logged_date: { type: 'string', description: 'YYYY-MM-DD, defaults to today if omitted' },
      },
      required: ['description'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_task',
    description: 'Create a brand-new task. Look up the real entity_id via get_entities first.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'A short, clear task title' },
        entity_id: { type: 'integer', description: 'The real id from get_entities' },
        entity_name: { type: 'string', description: 'The entity\'s name, for display on the confirm card' },
        timeframe: { type: 'string', enum: TIMEFRAME_ENUM },
        is_key: { type: 'boolean', description: 'True only if this is especially important/urgent' },
      },
      required: ['title', 'entity_id', 'entity_name', 'timeframe', 'is_key'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_task',
    description: 'Update an existing task -- mark it key/not key, move it to a different timeframe, or mark it done (is_archived: true) / restore it (is_archived: false). Look up the real task_id via get_tasks first. Only include the fields that are actually changing.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'integer', description: 'The real id from get_tasks' },
        task_title: { type: 'string', description: 'The task\'s title, for display on the confirm card' },
        is_key: { type: 'boolean' },
        timeframe: { type: 'string', enum: TIMEFRAME_ENUM },
        is_archived: { type: 'boolean', description: 'true marks the task done/archived, false restores it' },
      },
      required: ['task_id', 'task_title'],
      additionalProperties: false,
    },
  },
  {
    name: 'start_sleep',
    description: 'Record that Elo is going to bed right now. Takes no date -- always logs the current moment. ' +
      'The backend automatically labels WHICH NIGHT this belongs to once he wakes up (a bedtime before ~6am is ' +
      'attributed to the PREVIOUS calendar day, matching how people actually talk about sleep), so if Elo says ' +
      'something like "going to bed for last night" or names a specific date/night, that is not a real ambiguity ' +
      'and not something this tool can or needs to take as input -- just call this tool exactly as you would for ' +
      'a plain "going to bed" with no further clarification needed.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'cancel_sleep',
    description: 'Undo an accidental "going to bed" -- clears the pending bedtime with no sleep logged, as if it never happened. ' +
      'Only call this if get_sleep_status shows a pending bedtime AND Elo says it was a mistake/accident, not to end a real night (use end_sleep for that).',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'end_sleep',
    description: 'Record that Elo just woke up, closing out the in-progress night. Only call this if get_sleep_status shows a pending bedtime.',
    input_schema: {
      type: 'object',
      properties: { quality: { type: 'integer', minimum: 1, maximum: 5, description: 'Optional 1-5 sleep quality rating, only if Elo mentioned one' } },
      additionalProperties: false,
    },
  },
  {
    name: 'create_journal_entry',
    description: 'Save a new journal entry from freeform text (e.g. a voice-note transcript recapping the day). Mood and themes are extracted automatically.',
    input_schema: {
      type: 'object',
      properties: {
        raw_text: { type: 'string', description: 'The journal entry text, in Elo\'s own words -- do not summarize or rewrite it' },
        entry_date: { type: 'string', description: 'YYYY-MM-DD, defaults to today if omitted' },
      },
      required: ['raw_text'],
      additionalProperties: false,
    },
  },
];

const READ_TOOLS = new Set([
  'get_habits', 'get_tasks', 'get_calendar_events', 'get_entities',
  'get_health_summary', 'get_insight', 'get_correlation_data', 'get_sleep_status',
]);
const WRITE_TOOLS = new Set([
  'toggle_habit', 'toggle_habit_subtask', 'log_food', 'create_task', 'update_task', 'start_sleep', 'cancel_sleep', 'end_sleep', 'create_journal_entry',
]);

const EXECUTORS = {
  get_habits: async () => apiGet('/api/habits'),
  get_tasks: async (input) => apiGet('/api/tasks?archived=' + (input && typeof input.archived === 'boolean' ? input.archived : false)),
  get_calendar_events: async (input) => apiGet('/api/calendar/events?date=' + ((input && input.date) || localDateStr(new Date()))),
  get_entities: async () => apiGet('/api/entities'),
  get_health_summary: async (input) => {
    const days = (input && input.days) || 7;
    const [healthResult, goals] = await Promise.all([apiGet('/api/health/data?days=' + days), apiGetSoft('/api/health/goals')]);
    return { days: healthResult.days, health: healthResult.health, goals };
  },
  get_insight: async (input) => apiSend('POST', '/api/analytics/insight?days=' + ((input && input.days) || 14), {}),
  get_correlation_data: async (input) => apiGet('/api/analytics/correlation?days=' + ((input && input.days) || 14)),
  get_sleep_status: async () => apiGet('/api/sleep/pending'),

  // Mirrors App.js's toggleHabit exactly -- both fields together. Sending
  // completed_date alone (what this looked like it needed from the route's
  // own logHabitCompletion side-effect logic) left completed_today stale,
  // a real bug caught by checking GET /api/habits after a test toggle, not
  // just trusting the PUT response.
  toggle_habit: async (input) => {
    const completed_date = input.mark_done ? localDateStr(new Date()) : null;
    return apiSend('PUT', '/api/habits/' + input.habit_id, { completed_today: input.mark_done, completed_date });
  },
  // PUT /api/habit-subtasks/:id already cascades the parent habit's own
  // completed_today/completed_date once every sub-task is done -- same
  // route the dashboard's own sub-task checkboxes use, so there's nothing
  // extra to do here beyond toggling this one sub-task.
  toggle_habit_subtask: async (input) => {
    const completed_date = input.mark_done ? localDateStr(new Date()) : null;
    return apiSend('PUT', '/api/habit-subtasks/' + input.subtask_id, { completed_date });
  },
  log_food: async (input) =>
    apiSend('POST', '/api/nutrition', {
      label: input.description, kcal: input.kcal, protein: input.protein, carbs: input.carbs,
      fat: input.fat, fiber: input.fiber, sugar: input.sugar,
      logged_date: input.logged_date || localDateStr(new Date()),
    }),
  create_task: async (input) =>
    apiSend('POST', '/api/tasks', { title: input.title, entity_id: input.entity_id, timeframe: input.timeframe, is_key: !!input.is_key }),
  update_task: async (input) => {
    const body = {};
    if (typeof input.is_key === 'boolean') body.is_key = input.is_key;
    if (input.timeframe) body.timeframe = input.timeframe;
    if (typeof input.is_archived === 'boolean') body.is_archived = input.is_archived;
    return apiSend('PUT', '/api/tasks/' + input.task_id, body);
  },
  start_sleep: async () => apiSend('POST', '/api/sleep/bedtime', {}),
  cancel_sleep: async () => apiSend('POST', '/api/sleep/bedtime/cancel', {}),
  end_sleep: async (input) => apiSend('POST', '/api/sleep/wake', { quality: input && input.quality }),
  create_journal_entry: async (input) => {
    // effectiveToday, not localDateStr(new Date()) -- a voice note journaled
    // right after midnight, before going to bed, should still date to the
    // day it's actually about (lib/habitDay.js's rule, same as habits).
    const effectiveToday = (await apiGet('/api/today')).date;
    const entry_date = input.entry_date || effectiveToday;
    const { day, date } = journalDisplayFields(entry_date, effectiveToday);
    const created = await apiSend('POST', '/api/journal', { day, date, tasks_count: 0, captures_count: 0, recap: '', raw_text: input.raw_text, entry_date });
    const row = Array.isArray(created) ? created[0] : created;
    const extracted = row && row.id ? await apiSend('POST', '/api/journal/' + row.id + '/extract', {}).catch(() => null) : null;
    return { entry: row, extracted };
  },
};

// Runs once, right after Claude proposes a write, before the confirm card is
// built -- currently only log_food needs this, so the card shows the exact
// macros that will be saved (no drift between what's shown and what's saved
// a moment later on Confirm).
const PREVIEW_RESOLVERS = {
  log_food: async (input) => ({ ...input, ...(await apiSend('POST', '/api/nutrition/estimate', { text: input.description })) }),
};

// Deterministic per-tool line for the confirm card -- not left to Claude's
// own prose, so a multi-action card has a consistent format every time.
const SUMMARIZE = {
  toggle_habit: (input) => (input.mark_done ? '✅ Mark habit done: ' : '⬜ Mark habit not done: ') + input.habit_label,
  toggle_habit_subtask: (input) =>
    (input.mark_done ? '✅ ' : '⬜ ') + input.subtask_label + ' (' + input.habit_label + ')',
  log_food: (input) =>
    '🍽️ Log food: ' + input.description +
    (input.kcal != null ? ' — ~' + input.kcal + ' kcal, ' + input.protein + 'g protein, ' + input.carbs + 'g carbs, ' + input.fat + 'g fat' : ''),
  create_task: (input) => '➕ Create task: "' + input.title + '" (' + input.entity_name + ', ' + input.timeframe + (input.is_key ? ', key' : '') + ')',
  update_task: (input) => {
    const changes = [];
    if (typeof input.is_key === 'boolean') changes.push(input.is_key ? 'mark key' : 'unmark key');
    if (input.timeframe) changes.push('move to ' + input.timeframe);
    if (typeof input.is_archived === 'boolean') changes.push(input.is_archived ? 'mark done' : 'restore');
    return '✏️ ' + (changes.join(', ') || 'update') + ': ' + input.task_title;
  },
  start_sleep: () => '🛏️ Went to bed (starting now)',
  cancel_sleep: () => '↩️ Undo accidental "went to bed" (no sleep logged)',
  end_sleep: (input) => '☀️ Woke up' + (input.quality ? ' — quality ' + input.quality + '/5' : ''),
  create_journal_entry: (input) => '📓 New journal entry: "' + (input.raw_text.length > 60 ? input.raw_text.slice(0, 60) + '…' : input.raw_text) + '"',
};

module.exports = { TOOL_DEFINITIONS, READ_TOOLS, WRITE_TOOLS, EXECUTORS, PREVIEW_RESOLVERS, SUMMARIZE };
