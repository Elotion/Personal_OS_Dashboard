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
//     WAKE-UP (not his last bedtime) and hold it there through subsequent
//     real midnights, per his own stated rule ("stays on the previous day
//     until 'went to bed' is actually clicked") -- UNTIL a fresh bedtime
//     click starts a new pending night (the first branch takes over again),
//     OR a grace window expires (see the 2026-09-08 note right below).
//
// REAL BACKFIRE, reported live 2026-09-08: pinning indefinitely (no time
// limit at all) was correct for "staying up late, haven't gone to bed
// yet," but Elo hit the other real case that same shape of code also
// covers: he genuinely forgot to log sleep at all one night. Waking up the
// next morning, the dashboard was still frozen on the PREVIOUS day (correct
// per the old rule, since no bedtime click had ever happened) -- but that's
// not what he wants when a whole night has clearly passed and it's already
// morning; he had to click "went to bed" then immediately "woke up" just to
// force a refresh, and manually guess the hours. His fix, stated directly:
// keep deferring same as before through the night, but once it's gotten to
// be the next morning -- his words, "all the way to 5am the next morning" --
// stop waiting and just advance for real, same as if he'd gone to bed
// normally. Below that cutoff (still plausibly "staying up late, might
// still go to bed"), the indefinite pin from the fix above is unchanged.
//
// This mirrors nightOfDate()'s existing ~6am threshold in server.js (a
// bedtime before 6am still counts as "last night") but is intentionally a
// separate, slightly earlier constant -- that one describes a REAL bedtime
// that did happen; this one exists specifically to stop waiting on one that
// might never come.
const supabase = require('../supabaseClient');
const { localDateStr } = require('./dates');

const MISSED_BEDTIME_GRACE_HOUR = 5;

async function getEffectiveDate() {
  const now = new Date();
  const realToday = localDateStr(now);

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

  const wakeDate = new Date(lastWakeTime);
  const lastWakeDate = localDateStr(wakeDate);
  if (lastWakeDate === realToday) return lastWakeDate;

  // A forgotten bedtime shows up here as "still pinned days later" -- the
  // grace window only ever needs to check ONE day out (the very next
  // literal morning after that last wake), since by the day after THAT
  // it's unambiguously long past any real grace period regardless of hour.
  const dayAfterWake = localDateStr(new Date(wakeDate.getFullYear(), wakeDate.getMonth(), wakeDate.getDate() + 1));
  const graceExpired = realToday > dayAfterWake || (realToday === dayAfterWake && now.getHours() >= MISSED_BEDTIME_GRACE_HOUR);
  return graceExpired ? realToday : lastWakeDate;
}

module.exports = { getEffectiveDate };
