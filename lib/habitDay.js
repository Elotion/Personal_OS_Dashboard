// The "habit day" -- what counts as "today" for habit completion and
// journal entries specifically (not calendar events, tasks, or anything
// else, which stay on the plain calendar date). Elo, 2026-08-27: staying up
// past midnight was resetting his habits and re-dating his journal to a day
// that "hadn't happened yet" from his own perspective. His rule: habits/
// journal stay on the previous day until he actually clicks "went to bed" --
// UNLESS he went to bed before midnight, in which case the normal midnight
// reset applies exactly as it always has.
//
// Implemented as effectiveDate = min(realToday, dateOf(mostRecentBedtimeClick) + 1 day).
// Worked example -- bed at 11pm (normal case): mostRecentBedtime is today, so
// +1 day = tomorrow; but realToday is still today until midnight actually
// passes, so min() holds at today right up until then, then flips to
// tomorrow the instant midnight arrives -- the ordinary reset, unchanged.
// Worked example -- awake past midnight, no bedtime click yet: the last real
// bedtime is still yesterday's, so +1 day = today's-now-past date; but
// realToday has already moved one day further, so min() holds at that
// earlier date until a fresh "went to bed" click updates mostRecentBedtime,
// at which point it advances immediately, at that exact click, not before.
const supabase = require('../supabaseClient');
const { localDateStr } = require('./dates');

async function getEffectiveDate() {
  const realToday = localDateStr(new Date());

  const pendingResult = await supabase.from('sleep_pending').select('bed_time').eq('id', 1).maybeSingle();
  let mostRecentBedTime = pendingResult.data ? pendingResult.data.bed_time : null;

  if (!mostRecentBedTime) {
    const lastLog = await supabase.from('sleep_log').select('bed_time').order('id', { ascending: false }).limit(1);
    mostRecentBedTime = lastLog.data && lastLog.data[0] ? lastLog.data[0].bed_time : null;
  }

  // No bedtime history at all (fresh install) -- fall back to the plain
  // calendar date, same as this app's behavior everywhere else.
  if (!mostRecentBedTime) return realToday;

  const bedDate = new Date(mostRecentBedTime);
  const dayAfterBed = localDateStr(new Date(bedDate.getFullYear(), bedDate.getMonth(), bedDate.getDate() + 1));
  // 'YYYY-MM-DD' strings compare chronologically as plain strings.
  return dayAfterBed < realToday ? dayAfterBed : realToday;
}

module.exports = { getEffectiveDate };
