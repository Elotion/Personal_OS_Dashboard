// Shared local-time helpers -- used by server.js and lib/context.js so both
// stay consistent instead of each maintaining its own copy. (client/src/App.js
// still keeps its own localDateStr() -- that one runs in the browser, a
// different runtime, so mirroring it there instead of importing is deliberate.)

// local calendar date (not UTC) -- a bare toISOString().slice(0,10) drifts a
// day off in negative-UTC-offset timezones for part of the evening, which
// would silently misbucket analytics
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// local wall-clock timestamp, deliberately WITHOUT a 'Z'/offset suffix.
// habit_completions.completed_at and tasks.completed_at are both plain
// TIMESTAMP columns (no timezone) -- Postgres stores exactly the string it's
// given, with no conversion. Writing new Date().toISOString() there (as this
// code originally did) stores the UTC clock reading verbatim, e.g. writes
// "23:52" into a column meant to answer "what hour did this happen" for a
// user whose actual local time was 16:52 -- confirmed wrong via direct testing
// (avg_completion_hour came back as 23 for a toggle done at 4:52pm PDT).
// Writing local wall-clock time instead makes the stored value ALREADY correct
// for "what hour, locally" without needing a timezone-aware column type (which
// would need yet another migration) -- deliberate for a single-user,
// single-timezone app. Every read of these columns elsewhere parses the
// result via `new Date(str)`, which JS interprets as local time for an
// offset-less string, so this stays self-consistent end to end. If this data
// is ever consumed by something running in a different timezone (e.g. a
// server deployed elsewhere), this convention needs revisiting.
function localTimestampStr(d = new Date()) {
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

module.exports = { localDateStr, localTimestampStr };
