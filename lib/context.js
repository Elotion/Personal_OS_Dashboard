const supabase = require('../supabaseClient');

// Pulls and formats the data a given feature needs into Claude-ready text.
// Shared by any prompt that needs "everything about entity X" or "this
// journal entry" -- grows as later phases (insights, correlation) need wider
// slices, instead of each route re-deriving its own fetch-and-format logic.

async function getEntityContext(entityId) {
  const { data: entity, error: entityError } = await supabase
    .from('entities').select('*').eq('id', entityId).maybeSingle();
  if (entityError) throw entityError;
  if (!entity) return null;

  const { data: tasks, error: tasksError } = await supabase
    .from('tasks').select('*').eq('entity_id', entityId).eq('is_archived', false);
  if (tasksError) throw tasksError;

  const taskLines = (tasks || []).map(
    (t) => `- [${t.timeframe}]${t.is_key ? ' (KEY)' : ''} ${t.title}`
  );

  const text =
    `Life area: ${entity.name}\n` +
    `Description: ${entity.description || '(none)'}\n\n` +
    `Open tasks (${tasks ? tasks.length : 0}):\n` +
    (taskLines.length ? taskLines.join('\n') : '(none)');

  return { entity, tasks: tasks || [], text };
}

// Names alone aren't enough signal to classify a task correctly (e.g. "HEMS"
// gives Claude nothing to go on) -- this pairs each with its description for
// prompts that need to pick the right one, like task parsing.
async function getEntitiesWithDescriptions() {
  const { data, error } = await supabase.from('entities').select('name, description').order('id');
  if (error) throw error;
  return data || [];
}

async function getJournalContext(entryId) {
  const { data: entry, error } = await supabase
    .from('journal_entries').select('*').eq('id', entryId).maybeSingle();
  if (error) throw error;
  return entry || null;
}

module.exports = { getEntityContext, getJournalContext, getEntitiesWithDescriptions };
