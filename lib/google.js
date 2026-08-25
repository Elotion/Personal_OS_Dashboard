require('dotenv').config();
const { google } = require('googleapis');
const supabase = require('../supabaseClient');
const { localDateStr } = require('./dates');

const REDIRECT_URI = 'http://localhost:5050/api/integrations/google/callback';
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
    expiry_date: data.expires_at ? new Date(data.expires_at).getTime() : undefined,
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
        const isAllDay = !ev.start.dateTime;
        events.push({
          time: isAllDay ? 'All day' : formatRange(new Date(ev.start.dateTime), new Date(ev.end.dateTime)),
          label: ev.summary || '(no title)',
          sortKey: isAllDay ? '' : ev.start.dateTime,
        });
      });
  }

  events.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  return events.map(({ time, label }) => ({ time, label }));
}

function formatRange(start, end) {
  const fmt = (d) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return fmt(start) + ' – ' + fmt(end);
}

module.exports = {
  getAuthUrl, saveTokens, isConnected, getAuthorizedClient, listEventsForDate, newOAuthClient,
  listCalendars, setHiddenCalendarIds,
};
