require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// Haiku 4.5 rejects `output_config.effort` outright (400 "This model does
// not support the effort parameter") -- caught live while wiring up the
// 2026-08-28 model split, not assumed. Sonnet/Opus both accept it.
function supportsEffort(model) {
  return !model.startsWith('claude-haiku');
}

// One shared call site for every feature that talks to Claude -- keeps
// error handling and text-block extraction in one place instead of
// duplicated per feature. `model` defaults to Sonnet (2026-08-28 cost pass,
// Elo's choice -- see CLAUDE.md): every feature ran on Opus 5 by default,
// the priciest tier, for tasks that don't need it. Callers that want the
// cheaper Haiku tier for a bounded/low-stakes task pass it explicitly.
async function askClaude(prompt, { maxTokens = 1024, model = 'claude-sonnet-5' } = {}) {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    // these are short, simple summarization prompts -- low effort keeps
    // adaptive thinking brief so it can't eat the whole token budget and
    // leave nothing for the actual text (seen directly: a small max_tokens
    // paired with default effort hit stop_reason "max_tokens" mid-sentence).
    // Omitted entirely on Haiku, which doesn't accept this param at all.
    ...(supportsEffort(model) ? { output_config: { effort: 'low' } } : {}),
    messages: [{ role: 'user', content: prompt }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text.trim() : '';
}

// For extraction tasks (freeform text -> structured fields) instead of prose.
// Uses client.messages.parse() + a Zod schema so the response is validated,
// not hand-parsed JSON -- returns null if Claude's output didn't validate.
async function askClaudeStructured(prompt, zodSchema, { maxTokens = 1024, model = 'claude-sonnet-5' } = {}) {
  const response = await client.messages.parse({
    model,
    max_tokens: maxTokens,
    output_config: { format: zodOutputFormat(zodSchema), ...(supportsEffort(model) ? { effort: 'low' } : {}) },
    messages: [{ role: 'user', content: prompt }],
  });
  return response.parsed_output;
}

module.exports = { askClaude, askClaudeStructured };
