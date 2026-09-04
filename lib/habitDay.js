// The "habit day" -- what counts as "today" for habit completion, journal
// entries, and (2026-09-04) nutrition logging specifically (not calendar
// events, tasks, or anything else, which stay on the plain calendar date).
// Elo, 2026-08-27: staying up past midnight was resetting his habits and
// re-dating his journal to a day that "hadn't happened yet" from his own
// perspective. His rule: habits/journal stay on the previous day until he
// actually clicks "went to bed" -- UNLESS he went to bed before midnight, in
// which case the normal midnight reset applies exactly as it always has.
//
// REAL BUG, caught 2026-09-04 by Elo hitting it live (not from a test): the
// original version anchored the deferral on the most recent bedtime EVER
// recorded, pending or completed, and computed effectiveDate as
// min(realToday, dateOf(thatBedtime) + 1 day). That only works correctly for
// the single midnight immediately following that bedtime -- once he's woken
// up from it and lived through an entire day, that same historical bedtime
// is stale, but "+1 day" from it naturally lands exactly on the NEXT literal
// midnight regardless, silently ending the deferral even though no new
// "went to bed" click had happened for that transition. Concretely: bed_time
// 2026-09-03 00:29 (already woken from) + 1 day = 2026-09-04 -- which is
// exactly today's real date the moment midnight into the 4th arrives, so the
// old code treated that as "he already went to bed, ordinary reset applies"
// when the truth was "he hasn't gone to bed since waking, this is exactly
// the deferred case." Every prior verification of this feature only ever
// tested the same-night / next-midnight window, never a full day-plus
// stretch afterward, which is why this went uncaught until now.
//
// Fixed by anchoring on whichever event is CURRENTLY ACTIVE instead of
// whichever happened most recently:
//   - A genuinely pending bedtime (sleep_pending.bed_time set, no wake yet)
//     -- deferral logic unchanged: effectiveDate = min(realToday, bedDate+1).
//   - No pending bedtime -- pin effectiveDate at the date of his last actual
//     WAKE-UP (not his last bedtime) and hold it there through any number of
//     subsequent real midnights, exactly per his own stated rule ("stays on
//     the previous day until 'went to bed' is actually clicked" has no
//     implicit expiration), until a fresh bedtime click starts a new pending
//     night and the first branch takes over again.
const supabase = require('../supabaseClient');
const { localDateStr } = require('./dates');

async function getEffectiveDate() {
  const realToday = localDateStr(new Date());

  const pendingResult = await supabase.from('sleep_pending').select('bed_time').eq('id', 1).maybeSingle();
  const pendingBedTime = pendingResult.data ? pendingResult.data.bed_time : null;

  if (pendingBedTime) {
    const bedDate = new Date(pendingBedTime);
    const dayAfterBed = localDateStr(new Date(bedDate.getFullYear(), bedDate.getMonth(), bedDate.getDate() + 1));
    // 'YYYY-MM-DD' strings compare chronologically as plain strings.
    return dayAfterBed < realToday ? dayAfterBed : realToday;
  }

  // No night in progress -- anchor on the last real wake-up instead of the
  // now-consumed bedtime that preceded it.
  const lastLog = await supabase.from('sleep_log').select('wake_time').order('id', { ascending: false }).limit(1);
  const lastWakeTime = lastLog.data && lastLog.data[0] ? lastLog.data[0].wake_time : null;

  // No sleep history at all (fresh install) -- fall back to the plain
  // calendar date, same as this app's behavior everywhere else.
  if (!lastWakeTime) return realToday;

  return localDateStr(new Date(lastWakeTime));
}

module.exports = { getEffectiveDate };
