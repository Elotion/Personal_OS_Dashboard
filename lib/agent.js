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
const { TOOL_DEFINITIONS, WRITE_TOOLS, EXECUTORS } = require('./tools');

const client = new Anthropic();
const MODEL = 'claude-opus-5';
const MAX_TURNS = 5;

function systemPrompt() {
  return (
    "You are the agent behind Elo's personal dashboard's Telegram bot. " +
    'Today\'s local date is ' + localDateStr(new Date()) + ' -- always use this, never assume UTC. ' +
    'Use get_* tools to look up real ids before proposing any write tool -- never guess an id. ' +
    'There is no "mark task done" tool -- "done" for a task means update_task with ' +
    'is_archived: true (this also restores a task if set to false). ' +
    'Some habits have sub-tasks (a non-empty habit_subtasks array in get_habits) -- such a habit\'s ' +
    'completion is DERIVED from finishing every one of its sub-tasks, so toggle_habit can never mark ' +
    'it done/not-done directly (the backend ignores that for a habit with sub-tasks). For any habit ' +
    'with sub-tasks, use toggle_habit_subtask individually, once per sub-task Elo actually finished. ' +
    'If his message names specific sub-tasks (or says "all of them"/"everything"), match them to the ' +
    'real sub-task labels from get_habits. If it doesn\'t say which ones (e.g. just "check off morning ' +
    'routine"), do NOT guess or mark the whole thing -- ask a plain-text clarifying question naming the ' +
    'habit\'s actual sub-tasks and asking which he completed, then wait for his reply before proposing ' +
    'any toggle_habit_subtask calls. ' +
    'If a request is genuinely ambiguous (e.g. two habits could match "workout"), ask a short ' +
    'clarifying question as plain text instead of guessing or calling a tool. ' +
    'A single message can require several write tools at once (e.g. "I worked out and ate ' +
    'chicken and rice") -- once everything is resolved, return every write tool call needed ' +
    'together in one response, not one at a time.'
  );
}

// Returns either { type: 'text', text } for a direct answer / clarifying
// question, or { type: 'actions', actions: [{id, name, input}] } for one or
// more write tool calls that need to be confirmed before they run.
async function runAgentTurn(userText) {
  const messages = [{ role: 'user', content: userText }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: 'medium' },
      system: systemPrompt(),
      tools: TOOL_DEFINITIONS,
      messages,
    });

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (toolUses.length === 0) {
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { type: 'text', text: text || "I didn't catch an action there -- try rephrasing." };
    }

    const writeCalls = toolUses.filter((b) => WRITE_TOOLS.has(b.name));
    if (writeCalls.length > 0) {
      return { type: 'actions', actions: writeCalls.map((b) => ({ id: b.id, name: b.name, input: b.input })) };
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

  return { type: 'text', text: 'That needed more steps than I could chase down -- try breaking it into smaller messages.' };
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
