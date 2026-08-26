// Voice-note transcription for the Telegram bot (Stage 3 of the agent
// rebuild). Raw fetch/FormData against OpenAI's Whisper endpoint --
// deliberately not the `openai` npm package, since this is exactly one
// endpoint with a simple documented shape and Node 24's built-in
// fetch/FormData/Blob are enough. Revisit only if voice features grow
// beyond a single transcription call.

async function transcribeVoice(oggFileUrl) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set -- add it to .env to enable voice notes');
  }

  const audioRes = await fetch(oggFileUrl);
  if (!audioRes.ok) throw new Error('Could not download voice note from Telegram: ' + audioRes.status);

  const form = new FormData();
  form.append('file', await audioRes.blob(), 'voice.oga');
  form.append('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: form,
  });
  if (!res.ok) throw new Error('Whisper transcription failed: ' + res.status + ' ' + (await res.text()));

  const data = await res.json();
  return (data.text || '').trim();
}

module.exports = { transcribeVoice };
