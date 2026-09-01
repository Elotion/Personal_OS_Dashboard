require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const supabase = require('../supabaseClient');
const { runAgentTurn, executeActions } = require('./agent');
const { PREVIEW_RESOLVERS, SUMMARIZE } = require('./tools');
const { transcribeVoice } = require('./transcribe');
const { INTERNAL_SECRET } = require('./internalAuth');
const { startSchedules } = require('./scheduler');

const PROVIDER = 'telegram';
// Calls the SAME Express API routes the React app calls -- never touches
// Supabase or lib/anthropic.js directly. Keeps this a genuinely thin client:
// task parsing, analytics, everything stays in one place instead of being
// reimplemented per client.
const API_BASE = 'http://localhost:' + (process.env.PORT || 5050);
// Same guarantee as lib/tools.js's own internal calls -- see lib/internalAuth.js.
const INTERNAL_HEADERS = { 'X-Internal-Secret': INTERNAL_SECRET };

// chatId -> array of write-tool calls awaiting a single Confirm/Cancel tap
// (2026-08-26, generalized from a single pending task to support messages
// that need several actions at once, e.g. "I worked out and ate chicken and
// rice"). In-memory only -- a server restart mid-review loses it, same
// accepted tradeoff as before. NOTE: keyed by chatId only, same as the old
// pendingTasks -- sending a second message before confirming the first
// silently replaces the pending card. Not new, just carried forward.
const pendingActions = new Map();

// chatId -> running conversation history, in Anthropic's own message format
// (2026-08-27, Elo: "it should be able to determine what I need based on me
// mumbling ... like what you can do as Claude AI"). Previously every single
// message started runAgentTurn from a completely blank slate -- no memory of
// anything said a moment earlier, unlike a real Claude.ai conversation. This
// is what actually makes follow-up replies and loose/mid-thought phrasing
// work: "yeah both of them" only makes sense as an answer if the bot
// remembers it just asked which sub-tasks were done.
// In-memory only, same accepted tradeoff as pendingActions -- resets on
// restart. Capped (trimHistory) so a long-running chat doesn't grow the
// prompt (and the API cost) unboundedly.
const conversationHistory = new Map();
const MAX_HISTORY_MESSAGES = 20;

// Trims from the front, but only ever cuts at a genuine fresh-message
// boundary (a plain-string user turn) -- never mid-way through a tool_use/
// tool_result pair, which would leave the next API call with a dangling,
// invalid tool_result and no matching tool_use before it.
function trimHistory(messages) {
  if (messages.length <= MAX_HISTORY_MESSAGES) return messages;
  let cut = messages.length - MAX_HISTORY_MESSAGES;
  while (cut < messages.length && !(messages[cut].role === 'user' && typeof messages[cut].content === 'string')) {
    cut++;
  }
  return messages.slice(cut);
}

// Records what actually happened after a Confirm/Cancel tap -- those happen
// out-of-band (a button, not a chat message), so without this the next
// message would have no idea whether the last proposal actually went
// through, making a natural follow-up ("did that log?") impossible to
// answer correctly.
function appendOutcomeNote(chatId, note) {
  const history = trimHistory(conversationHistory.get(chatId) || []);
  history.push({ role: 'assistant', content: note });
  conversationHistory.set(chatId, history);
}

// Morning stale-task nudge (2026-08-31, Elo's request; extended same day to
// also cover THIS MONTH) -- deliberately NOT a generic "here's your day"
// briefing (he already checks CRM/calendar himself right after his routine,
// so that would be redundant); the one thing worth surfacing proactively is
// a task that's been sitting longer than he'd want, since that's easy to
// miss scanning the board casually. Timed off the actual wake-up event (a
// fixed delay after end_sleep executes), not a fixed clock time, matching
// how his routine length varies day to day. Silent if nothing's actually
// stale, to respect the phone-free morning he described.
//
// THIS MONTH gets a longer threshold than THIS WEEK (21 days, not 7) --
// a month-scoped task naturally has more runway, and flagging it right at
// the ~30-day mark would just be catching it as it's already about to
// expire rather than while there's still real time to act on it.
const MORNING_NUDGE_DELAY_MS = 90 * 60 * 1000; // ~90 min, matching his typical routine length
const STALE_THRESHOLDS = {
  'THIS WEEK': 7 * 24 * 60 * 60 * 1000,
  'THIS MONTH': 21 * 24 * 60 * 60 * 1000,
};

function scheduleMorningNudge(bot, chatId) {
  setTimeout(async () => {
    try {
      const tasks = await fetch(API_BASE + '/api/tasks?archived=false', { headers: INTERNAL_HEADERS }).then((r) => r.json());
      const now = Date.now();
      const stale = tasks.filter((t) => {
        const threshold = STALE_THRESHOLDS[t.timeframe];
        return threshold && t.created_at && now - new Date(t.created_at).getTime() > threshold;
      });
      if (stale.length === 0) return;
      const lines = ['☀️ These have been sitting for a while:'];
      const byTimeframe = { 'THIS WEEK': [], 'THIS MONTH': [] };
      stale.forEach((t) => byTimeframe[t.timeframe].push(t));
      if (byTimeframe['THIS WEEK'].length > 0) {
        lines.push('This week (7+ days):', ...byTimeframe['THIS WEEK'].map((t) => '• ' + t.title));
      }
      if (byTimeframe['THIS MONTH'].length > 0) {
        lines.push('This month (3+ weeks):', ...byTimeframe['THIS MONTH'].map((t) => '• ' + t.title));
      }
      await bot.telegram.sendMessage(chatId, lines.join('\n'));
    } catch (e) {
      console.error('[telegram] morning nudge failed:', e);
    }
  }, MORNING_NUDGE_DELAY_MS);
}

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
    fetch(API_BASE + '/api/tasks?archived=false', { headers: INTERNAL_HEADERS }).then((r) => r.json()),
    fetch(API_BASE + '/api/habits', { headers: INTERNAL_HEADERS }).then((r) => r.json()),
    fetch(API_BASE + '/api/calendar/events?date=' + date, { headers: INTERNAL_HEADERS }).then((r) => r.json()),
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
      const res = await fetch(API_BASE + '/api/analytics/insight?days=14', { method: 'POST', headers: INTERNAL_HEADERS });
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
    const priorHistory = conversationHistory.get(ctx.chat.id) || [];
    const result = await runAgentTurn(text, priorHistory);
    conversationHistory.set(ctx.chat.id, trimHistory(result.history));
    if (result.type === 'text') { ctx.reply(result.text); return; }

    const resolved = await Promise.all(result.actions.map(async (a) => {
      const resolver = PREVIEW_RESOLVERS[a.name];
      return resolver ? { ...a, input: await resolver(a.input) } : a;
    }));

    pendingActions.set(ctx.chat.id, resolved);
    sendConfirmCard(ctx, resolved);
  }

  // Builds and sends the standard "here's what I'll do" Confirm/Cancel card.
  // Used both for a fresh proposal and for the final re-confirm after a
  // wake-up quality is picked (2026-08-28 redesign, Elo: going to bed and
  // waking up should each get their own explicit Confirm/Cancel -- waking
  // up specifically confirms intent first, THEN picks a quality, THEN
  // confirms once more before anything is actually saved).
  function sendConfirmCard(ctx, actions, edit) {
    const lines = actions.map((a, i) => `${i + 1}. ${SUMMARIZE[a.name](a.input)}`);
    const prompt = actions.length > 1 ? `Confirm all ${actions.length}?` : 'Confirm?';
    const text = "Here's what I'll do:\n\n" + lines.join('\n') + '\n\n' + prompt;
    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback('✅ Confirm', 'confirm'),
      Markup.button.callback('❌ Cancel', 'cancel'),
    ]);
    if (edit) ctx.editMessageText(text, keyboard).catch(() => ctx.reply(text, keyboard));
    else ctx.reply(text, keyboard);
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

  // Voice notes -- transcribed via OpenAI's Whisper, then fed through the
  // exact same handleUserMessage path as typed text. Deliberately NOT
  // hardcoded to always create a journal entry: Claude's own tool choice
  // decides based on what's actually said, so "mark workout done" spoken
  // aloud does that instead of getting journaled.
  bot.on('voice', async (ctx) => {
    if (!(await isAuthorized(ctx))) return;
    try {
      ctx.reply('🎙️ Transcribing…');
      const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
      const transcript = await transcribeVoice(fileLink);
      if (!transcript) { ctx.reply("Couldn't make out anything in that voice note."); return; }
      ctx.reply(`Heard: "${transcript}"`);
      await handleUserMessage(ctx, transcript);
    } catch (e) {
      console.error('[telegram] voice handling failed:', e);
      ctx.reply(
        e.message && e.message.includes('OPENAI_API_KEY')
          ? "Voice notes aren't set up yet -- OPENAI_API_KEY is missing from .env."
          : 'Something went wrong transcribing that — check the server logs.'
      );
    }
  });

  bot.action('cancel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!(await isAuthorized(ctx))) return;
    pendingActions.delete(ctx.chat.id);
    appendOutcomeNote(ctx.chat.id, '(Note: Elo cancelled the proposed action(s) -- nothing was changed.)');
    ctx.editMessageText('Cancelled.').catch(() => {});
  });

  bot.action('confirm', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!(await isAuthorized(ctx))) return;
    const actions = pendingActions.get(ctx.chat.id);
    if (!actions) { ctx.reply('Nothing pending to confirm.'); return; }

    // Waking up: confirming intent to wake doesn't execute yet -- it opens
    // the quality picker first (2026-08-28, Elo's explicit flow: confirm ->
    // pick quality -> confirm again before it's actually saved). qualityAsked
    // (not "quality is falsy") is the marker, so picking "Skip" (quality:
    // null) on the next step doesn't loop back into this same branch again.
    const wakeAction = actions.find((a) => a.name === 'end_sleep' && !a.input.qualityAsked);
    if (wakeAction) {
      ctx.editMessageText(
        '☀️ How do you feel?',
        Markup.inlineKeyboard([
          [1, 2, 3, 4, 5].map((q) => Markup.button.callback(String(q), 'sleepq:' + q)),
          [Markup.button.callback('Skip', 'sleepq:skip'), Markup.button.callback('❌ Cancel', 'cancel')],
        ])
      ).catch(() => {});
      return;
    }

    pendingActions.delete(ctx.chat.id);
    try {
      const results = await executeActions(actions);
      const lines = results.map((r) => (r.ok ? '✅ ' : '❌ ') + SUMMARIZE[r.name](r.input) + (r.ok ? '' : ' — ' + r.error));
      appendOutcomeNote(ctx.chat.id, '(Note: confirmed and executed for real, via a button tap --\n' + lines.join('\n') + ')');
      ctx.editMessageText(lines.join('\n')).catch(() => {});
      if (results.some((r) => r.name === 'end_sleep' && r.ok)) scheduleMorningNudge(bot, ctx.chat.id);
    } catch (e) {
      console.error('[telegram] action execution failed:', e);
      ctx.reply('Failed to carry that out — check the server logs.');
    }
  });

  // After picking a wake-up quality (or Skip), show one more Confirm/Cancel
  // before anything is actually saved -- reuses the exact same 'confirm'
  // handler above, which now sees qualityAsked:true and proceeds straight
  // to execution instead of re-opening this picker.
  bot.action(/^sleepq:(\d|skip)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!(await isAuthorized(ctx))) return;
    const actions = pendingActions.get(ctx.chat.id);
    if (!actions) { ctx.reply('Nothing pending to confirm.'); return; }
    const choice = ctx.match[1];
    const quality = choice === 'skip' ? null : parseInt(choice, 10);
    const updated = actions.map((a) =>
      a.name === 'end_sleep' && !a.input.qualityAsked ? { ...a, input: { ...a.input, quality, qualityAsked: true } } : a
    );
    pendingActions.set(ctx.chat.id, updated);
    sendConfirmCard(ctx, updated, true);
  });

  bot.catch((err) => console.error('[telegram] handler error:', err));

  startSchedules(getClaimedChatId, (chatId, text) => bot.telegram.sendMessage(chatId, text));
  launchWithRetry(bot);
}

// bot.launch()'s returned promise rejects (not just an event bot.catch()
// sees) on a 409 -- Telegram's own answer when two pollers briefly overlap,
// which happens for real, harmlessly, for a few seconds during every
// Railway deploy while the old container finishes shutting down. Previously
// nothing caught that rejection, so it became an unhandled promise
// rejection and crashed the ENTIRE Express process (not just Telegram) --
// wiping pendingActions/conversationHistory mid-flow for anyone with a
// card open at that exact moment. Real bug: Elo hit this waking up via the
// new 3-step confirm/quality/confirm flow, which needs 3 separate taps
// (3x the exposure window a single-tap action like going to bed has) to
// land inside that same few-second window.
function launchWithRetry(bot, attempt = 1) {
  bot.launch().then(
    () => console.log('[telegram] bot polling started'),
    (err) => {
      console.error('[telegram] launch failed (attempt ' + attempt + '):', err && err.message ? err.message : err);
      if (attempt >= 5) {
        console.error('[telegram] giving up after 5 attempts -- polling is NOT running. If this persists past a few seconds, check for a genuine duplicate instance (e.g. local .env TELEGRAM_BOT_TOKEN uncommented alongside Railway).');
        return;
      }
      setTimeout(() => launchWithRetry(bot, attempt + 1), 5000);
    }
  );
}

module.exports = { start };
