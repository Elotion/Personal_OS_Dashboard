// The Telegram bot's tool-calling agent loop. Separate from lib/anthropic.js
// deliberately -- that file's askClaude()/askClaudeStructured() are both
// single-shot (one prompt in, one answer out), used by every GENERATE button
// in the dashboard. This is a genuinely different shape: multi-turn, can call
// several tools per turn, and needs to stop mid-loop to ask Elo to confirm a
// write before it happens -- reusing askClaude's plumbing would mean bolting
// a loop and a tools param onto a function whose whole contract is "no loop,
// no tools."
//
// Model config deviates from lib/anthropic.js's `effort: 'low'` default on
// purpose: this loop does real multi-step planning and can emit several tool
// calls in one turn, which benefits from more reasoning room than a short
// single-shot summary needs.

const Anthropic = require('@anthropic-ai/sdk');
const { localDateStr } = require('./dates');
const { getEffectiveDate } = require('./habitDay');
const { TOOL_DEFINITIONS, WRITE_TOOLS, EXECUTORS } = require('./tools');

const client = new Anthropic();
// Sonnet, not Opus (2026-08-28 cost pass -- Elo's choice, see CLAUDE.md).
// This is the highest-volume Claude call site in the app by a wide margin
// (every Telegram message, up to 5 calls per message via the read-tool
// loop), so it's also where the Opus->Sonnet switch saves the most --
// Sonnet is Anthropic's own recommended tier for exactly this kind of
// production tool-calling agent, not a quality compromise.
const MODEL = 'claude-sonnet-5';
const MAX_TURNS = 5;

// `effectiveDate` is the same bedtime-aware "today" the rest of the app
// uses for habits/journal (lib/habitDay.js -- Elo's rule: past midnight
// with no bedtime click yet still belongs to the previous day). Real bug
// this fixes: the system prompt used to hand the model ONLY the literal
// calendar date as "today," so past midnight but before going to bed, the
// agent reasoned habits/journal belonged to the NEW day and asked Elo a
// confusing "do you mean today, the new day?" question -- contradicting
// the rule the rest of the dashboard already enforces server-side
// regardless (PUT /api/habits/:id and POST /api/journal both already pin
// to the effective date no matter what date the agent sends), so the data
// was never actually at risk -- but the agent's own confused framing made
// it look broken and blocked Elo from just getting the action confirmed.
async function systemPrompt() {
  const realToday = localDateStr(new Date());
  const effectiveDate = await getEffectiveDate();
  const dayNote = effectiveDate === realToday
    ? ''
    : ' Right now these differ: the literal calendar date has already ticked over to ' + realToday +
      ', but Elo has not gone to bed yet since ' + effectiveDate + ' began, so for habits and journal ' +
      'specifically it is STILL ' + effectiveDate + " -- don't ask him to clarify which day he means, " +
      'just use ' + effectiveDate + ' directly, and don\'t treat this as ambiguous.';
  return (
    "You are the agent behind Elo's personal dashboard's Telegram bot. " +
    'The literal calendar date right now is ' + realToday + ' -- use this for calendar events, tasks, ' +
    'and general time awareness, never assume UTC. ' +
    'For HABITS and JOURNAL ENTRIES specifically, "today" means ' + effectiveDate + ' instead -- Elo\'s ' +
    'own rule: staying up past midnight without having gone to bed yet means habits/journal still ' +
    'belong to the previous day; the day only rolls over once he actually goes to bed (or at ordinary ' +
    'midnight if he already went to bed before it). Always use ' + effectiveDate + ' when marking a ' +
    'habit/sub-task done or dating a journal entry -- the backend enforces this regardless of what ' +
    'date you send, so there is no reason to ask Elo which day he means.' + dayNote + ' ' +
    'Use get_* tools to look up real ids before proposing any write tool -- never guess an id. ' +
    'There is no "mark task done" tool -- "done" for a task means update_task with ' +
    'is_archived: true (this also restores a task if set to false). ' +
    'Some habits have sub-tasks (a non-empty habit_subtasks array in get_habits) -- such a habit\'s ' +
    'completion is DERIVED from finishing every one of its sub-tasks, so toggle_habit can never mark ' +
    'it done/not-done directly (the backend ignores that for a habit with sub-tasks). For any habit ' +
    'with sub-tasks, use toggle_habit_subtask individually, once per sub-task Elo actually finished. ' +
    'If his message names specific sub-tasks (or says "all of them"/"everything"), match them to the ' +
    'real sub-task labels from get_habits. If it doesn\'t say which ones (e.g. just "check off morning ' +
    'routine"), do NOT guess or mark the whole thing -- ask a plain-text clarifying question that ' +
    'explicitly separates which of the habit\'s real sub-tasks are ALREADY done today vs STILL open ' +
    '(e.g. "Brush Teeth and Skin-Care are already done -- still open: Yoga and Breakfast, did you get ' +
    'those?"), not just a flat list of every sub-task name, so a short reply like "yeah both"/"just the ' +
    'first one" has an obvious, small set of open items to resolve against. Wait for his reply before ' +
    'proposing any toggle_habit_subtask calls. ' +
    'If a request is genuinely ambiguous (e.g. two habits could match "workout"), ask a short ' +
    'clarifying question as plain text instead of guessing or calling a tool. ' +
    'A single message can require several write tools at once (e.g. "I worked out and ate ' +
    'chicken and rice") -- once everything is resolved, return every write tool call needed ' +
    'together in one response, not one at a time. ' +
    "Elo often talks to you the way he'd talk to Claude.ai directly -- loosely, mid-thought, or as a " +
    'voice-note transcript that may be mumbled or slightly garbled (transcription isn\'t perfect). ' +
    "Read past small transcription glitches and interpret what he most likely meant, the way you'd " +
    'read a typo rather than get stuck on it. Use the conversation history above and the real data ' +
    'from get_* tools to fill in what he leaves implicit -- e.g. if he just says "yeah both of them" ' +
    'right after you asked which sub-tasks he finished, that answers your own question, not a new, ' +
    'unrelated request. Only fall back to a clarifying question when the real ambiguity remains after ' +
    'actually using the context you have, not as a first resort. ' +
    'The conversation history may contain lines wrapped like (Note: ...) describing what ACTUALLY ' +
    'happened via a button tap outside this chat (a proposal still awaiting Confirm, or one that was ' +
    'confirmed and executed for real). These are historical facts for your own context ONLY -- never ' +
    'copy, echo, paraphrase, or reuse that phrasing as your own new reply. Never tell Elo something ' +
    'was "confirmed" or "executed" unless a (Note: confirmed and executed...) line for THIS SPECIFIC ' +
    'action already exists in the history -- if it doesn\'t, either propose a fresh tool call or tell ' +
    'him plainly that nothing has been confirmed yet. Never narrate a fake completion. ' +
    'The ONLY way to actually propose a write action is calling the real tool -- that is what makes the ' +
    'Confirm/Cancel buttons appear. Never write a plain-text reply describing an action as "proposed," ' +
    '"queued," or "pending confirmation" -- text like that with no real tool call behind it shows Elo no ' +
    'buttons at all and he has no way to confirm something that only exists as a sentence. If a request ' +
    'maps to a real tool, call that tool even if some detail (like a date or which specific night) seems ' +
    'unresolved -- check each tool\'s own description first, since many handle exactly that automatically ' +
    'and take no such input at all. Only fall back to a plain-text clarifying question when the tool ' +
    'genuinely cannot represent what he\'s asking for, and even then, ask a real question -- never a ' +
    'sentence that sounds like a proposal but isn\'t one.'
  );
}

// Returns { type: 'text', text, history } for a direct answer / clarifying
// question, or { type: 'actions', actions: [{id, name, input}], history } for
// one or more write tool calls that need to be confirmed before they run.
// `history` is the running message list, in Anthropic's own message format --
// pass it back in as the `history` param on the next call from the same chat
// so the agent actually remembers the conversation (previously every message
// started from a blank slate, no memory of anything said a moment earlier --
// a real reason casual/loose phrasing and follow-up replies didn't work well;
// this makes the bot's memory work the way talking to Claude.ai does).
async function runAgentTurn(userText, history = []) {
  const messages = [...history, { role: 'user', content: userText }];
  // Computed once per call, not per turn -- a single runAgentTurn call
  // finishes in seconds, well within the window where the effective date
  // can't realistically change (it only advances on a real bedtime click).
  const system = await systemPrompt();

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: 'medium' },
      system,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (toolUses.length === 0) {
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      const reply = text || "I didn't catch an action there -- try rephrasing.";
      messages.push({ role: 'assistant', content: reply });
      return { type: 'text', text: reply, history: messages };
    }

    const writeCalls = toolUses.filter((b) => WRITE_TOOLS.has(b.name));
    if (writeCalls.length > 0) {
      // Recorded as plain text, not the raw tool_use blocks -- a tool_use
      // block requires a matching tool_result in the very next message, which
      // a plain follow-up reply (Confirm/Cancel happen out-of-band, not as a
      // model turn) can't supply. Wrapped as "(Note: ...)", not phrased as a
      // normal reply -- a real bug caught live: the model can see its own
      // prior turns in history, and a bare "Proposed: X" line reads enough
      // like something it just said that on a later turn it echoed a fake
      // "confirmed and executed" as plain text with no real tool call and no
      // button ever shown, so nothing actually happened even though it
      // sounded like it did. The (Note: ...) wrapper plus the system prompt
      // instruction above are the fix -- unambiguously a historical fact to
      // read, never a line to continue or imitate.
      const summary = '(Note: proposed but not yet confirmed -- ' +
        writeCalls.map((b) => b.name + '(' + JSON.stringify(b.input) + ')').join('; ') + ')';
      messages.push({ role: 'assistant', content: summary });
      return { type: 'actions', actions: writeCalls.map((b) => ({ id: b.id, name: b.name, input: b.input })), history: messages };
    }

    // Every tool_use this turn was a read -- execute them all, feed the
    // results back, and let Claude take another turn with real data in hand.
    messages.push({ role: 'assistant', content: response.content });
    const toolResults = await Promise.all(toolUses.map(async (b) => {
      try {
        const result = await EXECUTORS[b.name](b.input || {});
        return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(result) };
      } catch (e) {
        return { type: 'tool_result', tool_use_id: b.id, content: 'Error: ' + e.message, is_error: true };
      }
    }));
    messages.push({ role: 'user', content: toolResults });
  }

  const fallback = 'That needed more steps than I could chase down -- try breaking it into smaller messages.';
  messages.push({ role: 'assistant', content: fallback });
  return { type: 'text', text: fallback, history: messages };
}

// Called only after Elo taps Confirm. By this point every id in `actions` was
// already resolved by runAgentTurn before the card was shown, so this does
// NOT call Claude again -- it just runs each write executor in sequence,
// catching failures per-action so one bad action in a batch doesn't sink the
// rest of them.
async function executeActions(actions) {
  const results = [];
  for (const action of actions) {
    try {
      await EXECUTORS[action.name](action.input);
      results.push({ ...action, ok: true });
    } catch (e) {
      results.push({ ...action, ok: false, error: e.message });
    }
  }
  return results;
}

module.exports = { runAgentTurn, executeActions };
