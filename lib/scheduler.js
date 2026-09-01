// Proactive Telegram nudges (2026-08-31, Elo's request). Everything here is
// deliberately conditional -- only sends a message when there's actually
// something to say -- matching how Elo described wanting this: real value,
// not noise. No generic morning briefing (he already checks the dashboard
// himself right after his routine); the one morning nudge that IS worth
// having (stale "THIS WEEK" tasks) is timed off his actual wake-up event,
// not a fixed clock time, and lives in lib/telegram.js next to that event,
// not here.
//
// cron.schedule's `timezone` option is passed explicitly on every schedule
// rather than relying on the server process's own TZ env var -- this app
// has hit enough TZ-default bugs (see CLAUDE.md) that being explicit here,
// not implicit, is the safer default.
const cron = require('node-cron');
const { localDateStr } = require('./dates');
const { getEffectiveDate } = require('./habitDay');
const { INTERNAL_SECRET } = require('./internalAuth');

const TIMEZONE = 'America/Los_Angeles';
const API_BASE = 'http://localhost:' + (process.env.PORT || 5050);
const INTERNAL_HEADERS = { 'X-Internal-Secret': INTERNAL_SECRET };

async function apiGet(path) {
  const res = await fetch(API_BASE + path, { headers: INTERNAL_HEADERS });
  if (!res.ok) throw new Error('GET ' + path + ' failed: ' + res.status);
  return res.json();
}

// Evening check-in, 9pm daily -- open habits, no journal entry yet today,
// or an unfinished starred (key) task. Silent if everything's actually
// done, since the whole point is catching misses, not congratulating.
async function eveningCheckIn(sendMessage) {
  const today = await getEffectiveDate();

  const [habits, journal, tasks] = await Promise.all([
    apiGet('/api/habits'),
    apiGet('/api/journal'),
    apiGet('/api/tasks?archived=false'),
  ]);

  const openHabits = habits.filter((h) => h.completed_date !== today).map((h) => h.label);
  const hasJournalToday = journal.some((j) => j.entry_date === today);
  const openKeyTasks = tasks.filter((t) => t.is_key).map((t) => t.title);

  if (openHabits.length === 0 && hasJournalToday && openKeyTasks.length === 0) return; // nothing missing, stay quiet

  const lines = ['🌙 Evening check-in — a few things still open today:'];
  if (openHabits.length > 0) lines.push('• Habits: ' + openHabits.join(', '));
  if (!hasJournalToday) lines.push('• No journal entry yet today');
  if (openKeyTasks.length > 0) lines.push('• Key tasks: ' + openKeyTasks.join(', '));
  await sendMessage(lines.join('\n'));
}

// Food logging reminders, 10am/2pm/8pm -- skipped if something was already
// logged in roughly the last 90 minutes, so it doesn't double-ping right
// after Elo just logged a meal on his own.
async function foodReminder(sendMessage) {
  const food = await apiGet('/api/nutrition');
  const cutoff = Date.now() - 90 * 60 * 1000;
  // created_at is a naive local-time string (localTimestampStr(), no 'Z') --
  // a bare `new Date(str)` correctly parses that as local time. Appending
  // 'Z' here would reintroduce the exact UTC-vs-local bug this app has hit
  // and fixed multiple times already.
  const loggedRecently = food.some((f) => f.created_at && new Date(f.created_at).getTime() > cutoff);
  if (loggedRecently) return;
  await sendMessage('🍽️ Reminder to log your meals if you\'ve eaten since the last check-in.');
}

function startSchedules(getClaimedChatId, sendMessageTo) {
  async function withChat(fn) {
    const chatId = await getClaimedChatId();
    if (!chatId) return;
    await fn((text) => sendMessageTo(chatId, text)).catch((e) => console.error('[scheduler] failed:', e));
  }

  cron.schedule('0 21 * * *', () => withChat(eveningCheckIn), { timezone: TIMEZONE });
  cron.schedule('0 10,14,20 * * *', () => withChat(foodReminder), { timezone: TIMEZONE });

  console.log('[scheduler] evening check-in (9pm) and food reminders (10am/2pm/8pm) scheduled');
}

module.exports = { startSchedules };
