require('dotenv').config();
const { google } = require('googleapis');
const supabase = require('../supabaseClient');
const { localDateStr, localTimestampStr } = require('./dates');

// PUBLIC_URL is this backend's own reachable base URL -- localhost:5050 in
// dev, the real Railway/production URL once deployed (set via env var,
// since the app doesn't know its own public address otherwise). FRONTEND_URL
// is where the browser gets sent back to once OAuth completes -- a separate
// origin in dev (CRA's dev server on :3001), but in production Express
// serves the built frontend itself, so it's the same as PUBLIC_URL there
// (left unset in production .env / Railway config on purpose).
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:5050';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';
const REDIRECT_URI = PUBLIC_URL + '/api/integrations/google/callback';
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const PROVIDER = 'google_calendar';

function newOAuthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, REDIRECT_URI);
}

// access_type: 'offline' + prompt: 'consent' -- without both, Google only
// issues a refresh_token on the very first authorization ever, silently
// omitting it on any re-auth (e.g. after revoking access to test the flow).
function getAuthUrl() {
  return newOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

async function saveTokens(tokens) {
  const row = {
    provider: PROVIDER,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  // refresh_token is only sent on first consent -- don't overwrite a stored
  // one with null on a later token refresh that doesn't include it
  if (!row.refresh_token) delete row.refresh_token;
  const { error } = await supabase.from('integrations').upsert([row], { onConflict: 'provider' });
  if (error) throw error;
}

async function isConnected() {
  const { data, error } = await supabase.from('integrations').select('access_token').eq('provider', PROVIDER).maybeSingle();
  if (error) return false;
  return !!(data && data.access_token);
}

// integrations.config (JSONB) stores { hidden_calendar_ids: [...] } -- an
// override list of calendars the user has explicitly turned off *within this
// dashboard*, layered on top of Google's own defaults rather than replacing
// them. Storing overrides (not a full allowlist) means a calendar added in
// Google later just picks up its sensible default with no dashboard change
// needed.
async function getHiddenCalendarIds() {
  const { data, error } = await supabase.from('integrations').select('config').eq('provider', PROVIDER).maybeSingle();
  if (error || !data || !data.config) return [];
  return data.config.hidden_calendar_ids || [];
}

async function setHiddenCalendarIds(ids) {
  const { error } = await supabase.from('integrations')
    .update({ config: { hidden_calendar_ids: ids }, updated_at: new Date().toISOString() })
    .eq('provider', PROVIDER);
  if (error) throw error;
}

// Google's own `selected` flag (true = checked in the Google Calendar
// sidebar) is only reliable for calendars the user OWNS -- confirmed
// directly: calendars the user is merely subscribed to (a shared "Family"
// calendar, a school's calendar) come back with `selected` entirely absent
// from the API, checked or not, so there's no way to read their real Google
// checkbox state through this endpoint. Default them to visible instead of
// hidden -- confirmed directly that the subscribed calendars in this
// account (Family, a college's calendar) had real, relevant events being
// silently dropped when treated as hidden-by-default. The primary calendar
// is the one exception with a reliable non-`selected` signal (`c.primary`)
// and defaults to hidden, matching this account's real usage (an empty,
// unused personal calendar, unchecked in Google's own sidebar too).
function defaultVisibility(c) {
  if (c.primary) return false;
  if (c.selected === true) return true;
  if (c.selected === false) return false;
  return true; // no signal at all (subscribed calendars) -- default visible
}

// expires_at is stored in a plain TIMESTAMP (no timezone) column, but
// saveTokens() always writes it via toISOString() -- an absolute UTC
// instant. Postgres just drops the 'Z' on the way into a timezone-naive
// column, since that column type has no timezone concept at all. Reading
// it back with a bare `new Date(str)` (no 'Z' on the string) would parse
// those wall-clock numbers as LOCAL time instead of UTC -- the same class
// of bug already fixed elsewhere in this app (habit_completions,
// tasks.completed_at) -- silently making a token look like it expires ~7
// hours later than it really does. Confirmed directly: this caused a real
// 401 from Google, because the client believed a genuinely-expired token
// was still valid and never proactively refreshed it before use.
function parseStoredUtcTimestamp(str) {
  if (!str) return undefined;
  return new Date(/[Zz]|[+-]\d\d:\d\d$/.test(str) ? str : str + 'Z').getTime();
}

// Loads stored tokens onto a fresh OAuth2 client and wires up auto-persist:
// the googleapis client refreshes an expired access_token on its own using
// the refresh_token, and fires 'tokens' with the new one -- without this
// listener that refreshed token would only live in memory for this request.
async function getAuthorizedClient() {
  const { data, error } = await supabase.from('integrations').select('*').eq('provider', PROVIDER).maybeSingle();
  if (error) throw error;
  if (!data || !data.access_token) return null;

  const client = newOAuthClient();
  client.setCredentials({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: parseStoredUtcTimestamp(data.expires_at),
  });
  client.on('tokens', (tokens) => {
    saveTokens(tokens).catch((e) => console.error('failed to persist refreshed google tokens:', e));
  });
  return client;
}

// The list of calendars this account has access to, with a `visible` flag
// (Google's default, overridden by anything hidden via setHiddenCalendarIds)
// -- what the CALENDARS toggle panel in the UI renders and edits.
async function listCalendars() {
  const client = await getAuthorizedClient();
  if (!client) return null;
  const calendar = google.calendar({ version: 'v3', auth: client });
  const [calListRes, hidden] = await Promise.all([calendar.calendarList.list(), getHiddenCalendarIds()]);
  return (calListRes.data.items || []).map((c) => ({
    id: c.id,
    name: c.summary,
    isPrimary: !!c.primary,
    visible: hidden.includes(c.id) ? false : defaultVisibility(c),
  }));
}

// Write-through history (2026-08-31, extended same week to a real daily
// sync -- see syncCalendarWindow below). Persists AND reconciles: rows are
// upserted by google_event_id, and any previously-stored row for this exact
// date that ISN'T in the fresh set gets deleted -- so an event Elo cancels
// or deletes in Google actually disappears from the local history too,
// instead of lingering forever (the original write-through-only version
// could never learn about a deletion). Shared by both listEventsForDate
// (one day, called on every HOME poll/Telegram question) and
// syncCalendarWindow (the daily cron job covering a wide rolling window) --
// one persistence path, not two that could drift.
async function persistAndReconcile(dateStr, rows) {
  if (rows.length > 0) {
    const { error } = await supabase.from('calendar_events_log').upsert(rows, { onConflict: 'google_event_id' });
    // Missing table (pre-migration) degrades silently, same tolerance
    // pattern as every other optional table in this app -- the live
    // calendar card must never break over history-table absence.
    if (error && !/calendar_events_log/i.test(error.message || '')) {
      console.error('[calendar] failed to persist event history:', error);
      return;
    }
  }
  const existing = await supabase.from('calendar_events_log').select('google_event_id').eq('event_date', dateStr);
  if (existing.error) {
    if (!/calendar_events_log/i.test(existing.error.message || '')) {
      console.error('[calendar] reconcile lookup failed:', existing.error);
    }
    return;
  }
  const freshIds = new Set(rows.map((r) => r.google_event_id));
  const staleIds = (existing.data || []).map((r) => r.google_event_id).filter((id) => !freshIds.has(id));
  if (staleIds.length === 0) return;
  const { error: delError } = await supabase.from('calendar_events_log').delete().in('google_event_id', staleIds);
  if (delError) console.error('[calendar] reconcile delete failed:', delError);
}

function isAllDayEvent(ev) {
  return !ev.start.dateTime;
}
function eventDateOf(ev) {
  return isAllDayEvent(ev) ? ev.start.date : localDateStr(new Date(ev.start.dateTime));
}
function toStorableRow(ev, calendarName, dateStr) {
  const isAllDay = isAllDayEvent(ev);
  // Google's dateTime strings carry their own offset (an absolute instant)
  // -- converted to local wall-clock text via localTimestampStr(), matching
  // how every other TIMESTAMP column in this app stores time (lib/dates.js),
  // not a raw UTC ISO string.
  return {
    google_event_id: ev.id,
    event_date: dateStr,
    calendar_name: calendarName,
    title: ev.summary || '(no title)',
    start_time: isAllDay ? null : localTimestampStr(new Date(ev.start.dateTime)),
    end_time: isAllDay ? null : localTimestampStr(new Date(ev.end.dateTime)),
    is_all_day: isAllDay,
  };
}

// Real daily sync (2026-08-31, Elo: "why can't we have the memory of the
// entire google calendar" -- fair question; the write-through-on-view
// design was a deliberate stopgap from before this app had any scheduler
// at all, not a hard limitation). Covers a rolling window -- 30 days back,
// 90 days forward -- across every visible calendar, in one API call per
// calendar (not one call per day, which would be needlessly slow over a
// 120-day window), then reconciles each day in the window so deleted/moved
// events are actually removed, not just never-added. Scheduled once daily
// via lib/scheduler.js -- no user interaction required, coverage no longer
// depends on a day happening to be viewed.
const SYNC_DAYS_BACK = 30;
const SYNC_DAYS_FORWARD = 90;

async function syncCalendarWindow() {
  const client = await getAuthorizedClient();
  if (!client) return { synced: false, reason: 'not connected' };
  const calendarApi = google.calendar({ version: 'v3', auth: client });

  const calendars = await listCalendars();
  const visibleCalendars = calendars.filter((c) => c.visible);

  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - SYNC_DAYS_BACK);
  const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + SYNC_DAYS_FORWARD);
  const timeMin = startDate.toISOString();
  const timeMax = endDate.toISOString();

  // Every date in the window starts as an empty array -- a day with zero
  // events found still gets reconciled (clearing anything stale that was
  // previously stored for it), not just skipped.
  const byDate = {};
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    byDate[localDateStr(d)] = [];
  }

  for (const cal of visibleCalendars) {
    const res = await calendarApi.events.list({
      calendarId: cal.id,
      timeMin, timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });
    (res.data.items || [])
      .filter((ev) => ev.start && (ev.start.dateTime || ev.start.date))
      .forEach((ev) => {
        const dateStr = eventDateOf(ev);
        if (!(dateStr in byDate)) return; // an edge event just outside the window
        byDate[dateStr].push(toStorableRow(ev, cal.name, dateStr));
      });
  }

  let totalEvents = 0;
  for (const [dateStr, rows] of Object.entries(byDate)) {
    await persistAndReconcile(dateStr, rows);
    totalEvents += rows.length;
  }

  return { synced: true, daysCovered: Object.keys(byDate).length, totalEvents };
}

// Events for one day, for HOME's calendar card -- defaults to today, but
// HOME lets you browse other days/weeks via the week strip, so this takes
// whichever date is actually selected rather than always querying today.
async function listEventsForDate(dateStr) {
  const client = await getAuthorizedClient();
  if (!client) return null; // not connected yet
  const calendar = google.calendar({ version: 'v3', auth: client });

  const calendars = await listCalendars();
  const visibleCalendars = calendars.filter((c) => c.visible);

  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : localDateStr(new Date());
  const timeMin = new Date(date + 'T00:00:00').toISOString();
  const timeMax = new Date(date + 'T23:59:59').toISOString();

  const events = [];
  const toPersist = [];
  for (const cal of visibleCalendars) {
    const res = await calendar.events.list({
      calendarId: cal.id,
      timeMin, timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });
    (res.data.items || [])
      .filter((ev) => ev.start && (ev.start.dateTime || ev.start.date))
      .forEach((ev) => {
        const isAllDay = isAllDayEvent(ev);
        events.push({
          time: isAllDay ? 'All day' : formatRange(new Date(ev.start.dateTime), new Date(ev.end.dateTime)),
          label: ev.summary || '(no title)',
          sortKey: isAllDay ? '' : ev.start.dateTime,
        });
        toPersist.push(toStorableRow(ev, cal.name, date));
      });
  }
  // This one-day path also reconciles (not just adds) -- viewing "today"
  // repeatedly (HOME polls every ~90s) means a cancelled event disappears
  // from local history almost as fast as it does from Google, not just
  // once the next daily sync runs.
  persistAndReconcile(date, toPersist).catch((e) => console.error('[calendar] persistAndReconcile failed:', e));

  events.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  return events.map(({ time, label }) => ({ time, label }));
}

function formatRange(start, end) {
  const fmt = (d) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return fmt(start) + ' – ' + fmt(end);
}

module.exports = {
  getAuthUrl, saveTokens, isConnected, getAuthorizedClient, listEventsForDate, newOAuthClient,
  listCalendars, setHiddenCalendarIds, syncCalendarWindow, FRONTEND_URL,
};
