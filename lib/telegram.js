require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const supabase = require('../supabaseClient');
const { runAgentTurn, executeActions } = require('./agent');
const { PREVIEW_RESOLVERS, SUMMARIZE } = require('./tools');

const PROVIDER = 'telegram';
// Calls the SAME Express API routes the React app calls -- never touches
// Supabase or lib/anthropic.js directly. Keeps this a genuinely thin client:
// task parsing, analytics, everything stays in one place instead of being
// reimplemented per client.
const API_BASE = 'http://localhost:' + (process.env.PORT || 5050);

// chatId -> array of write-tool calls awaiting a single Confirm/Cancel tap
// (2026-08-26, generalized from a single pending task to support messages
// that need several actions at once, e.g. "I worked out and ate chicken and
// rice"). In-memory only -- a server restart mid-review loses it, same
// accepted tradeoff as before. NOTE: keyed by chatId only, same as the old
// pendingTasks -- sending a second message before confirming the first
// silently replaces the pending card. Not new, just carried forward.
const pendingActions = new Map();

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

  // Shared by the text handler and (Stage 3) the voice handler, so the
  // confirm-card logic only lives in one place. Runs the tool-use agent loop
  // (lib/agent.js): a plain question/clarifying question comes back as text
  // and is just relayed; one or more proposed write actions get resolved
  // (PREVIEW_RESOLVERS -- currently just log_food's macro estimate) and
  // shown as a single Confirm/Cancel card, nothing executed yet.
  async function handleUserMessage(ctx, text) {
    const result = await runAgentTurn(text);
    if (result.type === 'text') { ctx.reply(result.text); return; }

    const resolved = await Promise.all(result.actions.map(async (a) => {
      const resolver = PREVIEW_RESOLVERS[a.name];
      return resolver ? { ...a, input: await resolver(a.input) } : a;
    }));

    pendingActions.set(ctx.chat.id, resolved);
    const lines = resolved.map((a, i) => `${i + 1}. ${SUMMARIZE[a.name](a.input)}`);
    const prompt = resolved.length > 1 ? `Confirm all ${resolved.length}?` : 'Confirm?';
    ctx.reply(
      "Here's what I'll do:\n\n" + lines.join('\n') + '\n\n' + prompt,
      Markup.inlineKeyboard([
        Markup.button.callback('✅ Confirm', 'confirm'),
        Markup.button.callback('❌ Cancel', 'cancel'),
      ])
    );
  }

  // Freeform text (not a command -- those are matched above and stop here)
  // -> the tool-use agent decides what it means and either answers directly
  // or proposes action(s) for review. Nothing is created/changed until
  // confirmed -- same "review before it happens" principle the old
  // task-only flow had, now applied to every write action, not just tasks.
  bot.on('text', async (ctx) => {
    if (!(await isAuthorized(ctx))) return;
    try {
      await handleUserMessage(ctx, ctx.message.text);
    } catch (e) {
      console.error('[telegram] agent turn failed:', e);
      ctx.reply('Something went wrong figuring that out — check the server logs.');
    }
  });

  bot.action('cancel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!(await isAuthorized(ctx))) return;
    pendingActions.delete(ctx.chat.id);
    ctx.editMessageText('Cancelled.').catch(() => {});
  });

  bot.action('confirm', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!(await isAuthorized(ctx))) return;
    const actions = pendingActions.get(ctx.chat.id);
    if (!actions) { ctx.reply('Nothing pending to confirm.'); return; }
    pendingActions.delete(ctx.chat.id);
    try {
      const results = await executeActions(actions);
      const lines = results.map((r) => (r.ok ? '✅ ' : '❌ ') + SUMMARIZE[r.name](r.input) + (r.ok ? '' : ' — ' + r.error));
      ctx.editMessageText(lines.join('\n')).catch(() => {});
    } catch (e) {
      console.error('[telegram] action execution failed:', e);
      ctx.reply('Failed to carry that out — check the server logs.');
    }
  });

  bot.catch((err) => console.error('[telegram] handler error:', err));

  bot.launch();
  console.log('[telegram] bot polling started');
}

module.exports = { start };
