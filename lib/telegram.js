require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const supabase = require('../supabaseClient');

const PROVIDER = 'telegram';
// Calls the SAME Express API routes the React app calls -- never touches
// Supabase or lib/anthropic.js directly. Keeps this a genuinely thin client:
// task parsing, analytics, everything stays in one place instead of being
// reimplemented per client.
const API_BASE = 'http://localhost:' + (process.env.PORT || 5050);

// chatId -> parsed task awaiting a Confirm/Cancel tap. In-memory only -- a
// server restart mid-review loses it, which is fine for something this
// short-lived (not worth a migration for).
const pendingTasks = new Map();

async function getClaimedChatId() {
  const { data, error } = await supabase.from('integrations').select('config').eq('provider', PROVIDER).maybeSingle();
  if (error || !data || !data.config) return null;
  return data.config.chat_id || null;
}

async function claimChatId(chatId) {
  const { error } = await supabase.from('integrations')
    .upsert([{ provider: PROVIDER, config: { chat_id: chatId }, updated_at: new Date().toISOString() }], { onConflict: 'provider' });
  if (error) throw error;
}

// Single-user allowlist: the first chat to send /start "claims" the bot;
// every other chat gets ignored. Cheap insurance in case the bot's
// username ever leaks, since anyone with the link could otherwise message
// it and read/write Elo's data.
async function isAuthorized(ctx) {
  const claimed = await getClaimedChatId();
  if (claimed === ctx.chat.id) return true;
  if (!claimed) await ctx.reply('Send /start first to connect this chat.');
  return false;
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function buildTodaySummary() {
  const date = todayStr();
  const [tasks, habits, calendarResult] = await Promise.all([
    fetch(API_BASE + '/api/tasks?archived=false').then((r) => r.json()),
    fetch(API_BASE + '/api/habits').then((r) => r.json()),
    fetch(API_BASE + '/api/calendar/events?date=' + date).then((r) => r.json()),
  ]);

  const keyTasks = tasks.filter((t) => t.is_key);
  const habitsDone = habits.filter((h) => h.completed_date === date).length;
  const events = calendarResult.events || [];

  const lines = [];
  lines.push(`📋 Key tasks (${keyTasks.length}):`);
  lines.push(keyTasks.length ? keyTasks.map((t) => `• ${t.title}`).join('\n') : '(none)');
  lines.push('');
  lines.push(`✅ Habits: ${habitsDone}/${habits.length}`);
  lines.push('');
  lines.push('📅 Today:');
  lines.push(events.length ? events.map((e) => `• ${e.time} — ${e.label}`).join('\n') : '(no events)');
  return lines.join('\n');
}

function start() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN not set -- bot not started');
    return;
  }
  const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

  bot.start(async (ctx) => {
    const claimed = await getClaimedChatId();
    if (!claimed) {
      await claimChatId(ctx.chat.id);
      ctx.reply("Connected! Send me a task to add it, or try /today or /insight.");
    } else if (claimed === ctx.chat.id) {
      ctx.reply('Already connected — send me a task, or try /today or /insight.');
    } else {
      ctx.reply("This bot is already linked to someone else's dashboard.");
    }
  });

  bot.command('today', async (ctx) => {
    if (!(await isAuthorized(ctx))) return;
    try {
      ctx.reply(await buildTodaySummary());
    } catch (e) {
      console.error('[telegram] /today failed:', e);
      ctx.reply("Couldn't load today's summary — check the server logs.");
    }
  });

  bot.command('insight', async (ctx) => {
    if (!(await isAuthorized(ctx))) return;
    ctx.reply('Thinking…');
    try {
      const res = await fetch(API_BASE + '/api/analytics/insight?days=14', { method: 'POST' });
      const data = await res.json();
      ctx.reply(data.insight || data.error || 'No insight available.');
    } catch (e) {
      console.error('[telegram] /insight failed:', e);
      ctx.reply("Couldn't generate an insight — check the server logs.");
    }
  });

  // Freeform text (not a command -- those are matched above and stop here)
  // -> parse into a task, show a Confirm/Cancel review card. Mirrors CRM's
  // AI ADD: nothing is created until confirmed.
  bot.on('text', async (ctx) => {
    if (!(await isAuthorized(ctx))) return;
    try {
      const res = await fetch(API_BASE + '/api/tasks/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ctx.message.text }),
      });
      const parsed = await res.json();
      if (parsed.error) { ctx.reply("Couldn't parse that: " + parsed.error); return; }

      pendingTasks.set(ctx.chat.id, parsed);
      const summary = `${parsed.is_key ? '⭐ ' : ''}${parsed.title}\n${parsed.entity} · ${parsed.timeframe}`;
      ctx.reply(summary, Markup.inlineKeyboard([
        Markup.button.callback('✅ Add', 'confirm'),
        Markup.button.callback('❌ Cancel', 'cancel'),
      ]));
    } catch (e) {
      console.error('[telegram] task parse failed:', e);
      ctx.reply('Something went wrong parsing that — check the server logs.');
    }
  });

  bot.action('cancel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!(await isAuthorized(ctx))) return;
    pendingTasks.delete(ctx.chat.id);
    ctx.editMessageText('Cancelled.').catch(() => {});
  });

  bot.action('confirm', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!(await isAuthorized(ctx))) return;
    const pending = pendingTasks.get(ctx.chat.id);
    if (!pending) { ctx.reply('Nothing pending to confirm.'); return; }
    try {
      const entities = await fetch(API_BASE + '/api/entities').then((r) => r.json());
      const match = entities.find((e) => e.name === pending.entity);
      await fetch(API_BASE + '/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: pending.title, entity_id: match ? match.id : null, timeframe: pending.timeframe, is_key: pending.is_key }),
      });
      pendingTasks.delete(ctx.chat.id);
      ctx.editMessageText('✅ Added: ' + pending.title).catch(() => {});
    } catch (e) {
      console.error('[telegram] task create failed:', e);
      ctx.reply('Failed to create the task — check the server logs.');
    }
  });

  bot.catch((err) => console.error('[telegram] handler error:', err));

  bot.launch();
  console.log('[telegram] bot polling started');
}

module.exports = { start };
