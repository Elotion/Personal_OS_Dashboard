require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// One shared call site for every feature that talks to Claude -- keeps model
// choice, error handling, and text-block extraction in one place instead of
// duplicated per feature.
async function askClaude(prompt, { maxTokens = 1024 } = {}) {
  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: maxTokens,
    // these are short, simple summarization prompts -- low effort keeps
    // adaptive thinking brief so it can't eat the whole token budget and
    // leave nothing for the actual text (seen directly: a small max_tokens
    // paired with default effort hit stop_reason "max_tokens" mid-sentence)
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: prompt }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text.trim() : '';
}

module.exports = { askClaude };
