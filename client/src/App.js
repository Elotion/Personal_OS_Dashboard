import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { css } from './css';
import { ENTITY_META, ENTITY_OPTIONS, TF_COLOR, GOLD, GLOW_MED, GLOW_STRONG } from './theme';
import HomeTab from './pages/HomeTab';
import CrmTab from './pages/CrmTab';
import BrainTab from './pages/BrainTab';
import JournalTab from './pages/JournalTab';
import HealthTab from './pages/HealthTab';
import EntityPanel from './components/EntityPanel';

// ---- talking to the real backend ----
// CRA's dev server proxies /api/* to localhost:5050 (set in client/package.json),
// so plain relative paths work here.
async function apiGet(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('GET ' + path + ' failed');
  return res.json();
}
async function apiSend(path, method, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(method + ' ' + path + ' failed');
  return res.json();
}
// backend row -> the shape every existing component already expects
function transformTask(row, entityNameOverride) {
  return {
    id: row.id,
    title: row.title,
    timeframe: row.timeframe,
    key: row.is_key,
    archived: row.is_archived,
    entity: entityNameOverride || row.entities?.name || 'PERSONAL',
  };
}
function transformEntity(row) {
  return { id: row.id, icon: row.icon, name: row.name, desc: row.description };
}
// habit "done today" is derived by comparing a completion date to the local
// calendar date, rather than trusting a bare completed_today flag with no date
// attached -- that flag alone can't tell "checked off today" from "checked off
// three days ago and never reset." See localDateStr().
//
// completed_date SHOULD live in Supabase (that's what the PUT in toggleHabit
// already sends), but as of this session that column still doesn't exist in the
// table despite being requested twice before -- every write to it has been
// silently failing. Rather than block a third time, completion dates are tracked
// in localStorage instead, which actually persists. row.completed_date is still
// checked first and preferred when present, so the moment that column is added
// this automatically starts using the real Supabase value with no code change.
const HABIT_COMPLETIONS_KEY = 'elo-os-habit-completions';
function loadHabitCompletions() {
  try { return JSON.parse(window.localStorage.getItem(HABIT_COMPLETIONS_KEY)) || {}; }
  catch { return {}; }
}
function saveHabitCompletions(map) {
  window.localStorage.setItem(HABIT_COMPLETIONS_KEY, JSON.stringify(map));
}

function transformHabit(row, localCompletions) {
  return {
    id: row.id, label: row.label, category: row.category,
    entity_id: row.entity_id, sort_order: row.sort_order,
    completedDate: row.completed_date || (localCompletions && localCompletions[row.id]) || null,
  };
}

// streak count + the date it was last extended on, persisted the same way and
// for the same reason as habit completions above
const HABIT_STREAK_KEY = 'elo-os-habit-streak';
function loadHabitStreak() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HABIT_STREAK_KEY));
    if (parsed && typeof parsed.count === 'number') return parsed;
  } catch { /* fall through to default */ }
  return { count: 0, lastDoneDate: null };
}
function saveHabitStreak(streak) {
  window.localStorage.setItem(HABIT_STREAK_KEY, JSON.stringify(streak));
}
// Operator card profile -- same localStorage-first, Supabase-when-available
// pattern as habit completions/streak above, for the same reason: the `profile`
// table doesn't exist until the migration in CLAUDE.md is run.
const PROFILE_KEY = 'elo-os-profile';
const DEFAULT_PROFILE = { name: 'Elo', tagline: "UCLA '27 · Founder, HEMS", focus: 'Shipping HEMS.', photoData: null };
function loadProfile() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROFILE_KEY));
    if (parsed && typeof parsed === 'object') return { ...DEFAULT_PROFILE, ...parsed };
  } catch { /* fall through to default */ }
  return DEFAULT_PROFILE;
}
function saveProfile(p) {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}
function transformProfile(row) {
  return {
    name: row.name || DEFAULT_PROFILE.name,
    tagline: row.tagline || DEFAULT_PROFILE.tagline,
    focus: row.focus || DEFAULT_PROFILE.focus,
    photoData: row.photo_data || null,
  };
}

function transformGoal(row) {
  return { id: row.id, text: row.text, timeframe: row.timeframe };
}
function transformNutrition(row) {
  return {
    id: row.id, label: row.label, kcal: row.kcal, protein: row.protein, carbs: row.carbs, fat: row.fat,
    fiber: row.fiber, sugar: row.sugar,
  };
}
function transformSleep(row) {
  return {
    id: row.id, hours: row.hours, quality: row.quality, date: row.logged_date,
    bedTime: row.bed_time, wakeTime: row.wake_time,
  };
}
function transformJournal(row) {
  return {
    id: row.id, day: row.day, date: row.date,
    tasks: row.tasks_count || 0, captures: row.captures_count || 0,
    recap: row.recap || '', raw: row.raw_text || '',
    mood: row.mood != null ? row.mood : null, themes: row.themes || [],
    expanded: false, generating: false, extracting: false,
  };
}

// local calendar date (not UTC) -- a bare toISOString().slice(0,10) drifts a day
// off in negative-UTC-offset timezones for part of the evening
function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
// Resolves HOME's week-strip selection (which week, which day within it) to
// an actual calendar date -- mirrors the same math HomeTab.js already does
// for rendering (dow/monday/weekDays), kept here too since App.js is what
// drives the actual data fetch. Takes `now` as a plain snapshot (not the
// reactive `now` state) so calling this doesn't need to re-run every second.
function selectedCalendarDateStr(now, weekOffset, dayIdx) {
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow + weekOffset * 7);
  const d = new Date(monday);
  d.setDate(monday.getDate() + dayIdx);
  return localDateStr(d);
}

function dayLabelForDate(d, now) {
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'YESTERDAY';
  return d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
}

const todayIdx = () => (new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);

export default function App() {
  const [now, setNow] = useState(new Date());
  const [activeTab, setActiveTab] = useState('HOME');

  // ---- REAL DATA: entities + tasks ----
  const [entityIdByName, setEntityIdByName] = useState({});
  const [crmTasks, setCrmTasks] = useState([]);
  const [brainEntities, setBrainEntities] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState(null);
  const [pendingDoneIds, setPendingDoneIds] = useState(new Set());

  useEffect(() => {
    apiGet('/api/entities')
      .then((rows) => {
        setBrainEntities(rows.map(transformEntity));
        const byName = {};
        rows.forEach((r) => { byName[r.name] = r.id; });
        setEntityIdByName(byName);
      })
      .catch((e) => console.error('entities load failed', e));

    apiGet('/api/tasks')
      .then((rows) => {
        setCrmTasks(rows.map((r) => transformTask(r)));
        setTasksLoading(false);
      })
      .catch((e) => {
        console.error('tasks load failed', e);
        setTasksError('Could not reach your backend — make sure it\u2019s running on port 5050.');
        setTasksLoading(false);
      });
  }, []);

  // HOME state -- habits/goals/nutrition, now backed by the real API
  const [financeHidden, setFinanceHidden] = useState(true);
  const [captureText, setCaptureText] = useState('');

  const [profile, setProfile] = useState(() => loadProfile());
  const [editingProfileField, setEditingProfileField] = useState(null); // 'name' | 'tagline' | 'focus' | null
  const [editingProfileText, setEditingProfileText] = useState('');

  const [habits, setHabits] = useState([]);
  const [streak, setStreak] = useState(() => loadHabitStreak());
  const [streakBurst, setStreakBurst] = useState(false);
  const [habitBurst, setHabitBurst] = useState(null);
  const [selectedDayIdx, setSelectedDayIdx] = useState(todayIdx);
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0);
  const [habitsManageOpen, setHabitsManageOpen] = useState(false);
  const [habitAddLabel, setHabitAddLabel] = useState('');
  const [habitAddCategory, setHabitAddCategory] = useState('PERSONAL');
  const [editingHabitId, setEditingHabitId] = useState(null);
  const [editingHabitLabel, setEditingHabitLabel] = useState('');
  const [editingHabitCategory, setEditingHabitCategory] = useState('PERSONAL');
  const [draggingHabitId, setDraggingHabitId] = useState(null);

  const [goals, setGoals] = useState([]);
  const weeklyGoals = useMemo(() => goals.filter((g) => g.timeframe === 'THIS WEEK'), [goals]);
  const monthlyGoals = useMemo(() => goals.filter((g) => g.timeframe === 'THIS MONTH'), [goals]);
  const [weeklyInput, setWeeklyInput] = useState('');
  const [monthlyInput, setMonthlyInput] = useState('');
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [editingGoalText, setEditingGoalText] = useState('');

  const [foodLog, setFoodLog] = useState([]);
  const [foodInput, setFoodInput] = useState('');

  useEffect(() => {
    const localCompletions = loadHabitCompletions();
    apiGet('/api/habits')
      .then((rows) => setHabits(rows.map((r) => transformHabit(r, localCompletions))))
      .catch((e) => console.error('habits load failed', e));

    apiGet('/api/goals')
      .then((rows) => setGoals(rows.map(transformGoal)))
      .catch((e) => console.error('goals load failed', e));

    apiGet('/api/nutrition')
      .then((rows) => setFoodLog(rows.map(transformNutrition)))
      .catch((e) => console.error('nutrition load failed', e));

    apiGet('/api/journal')
      .then((rows) => setJournalEntries(rows.map(transformJournal)))
      .catch((e) => console.error('journal load failed', e));

    apiGet('/api/sleep')
      .then((rows) => setSleepLog(rows.map(transformSleep)))
      .catch(() => { /* sleep_log table not there yet -- HEALTH tab shows no sleep data */ });

    apiGet('/api/sleep/pending')
      .then((result) => setSleepPending(result.bed_time))
      .catch(() => { /* sleep_pending table not there yet -- bed/wake buttons no-op */ });

    // streak starts from localStorage (instant, avoids a flash of "0"), then gets
    // corrected from Supabase once that responds -- Supabase wins when both exist,
    // since it's the cross-device source of truth. If the habit_streak table
    // doesn't exist yet, this 404s and the localStorage value quietly stays.
    apiGet('/api/habit-streak')
      .then((row) => {
        const fromServer = { count: row.count, lastDoneDate: row.last_done_date };
        setStreak(fromServer);
        saveHabitStreak(fromServer);
      })
      .catch(() => { /* table not there yet -- keep the localStorage value */ });

    // same pattern: localStorage/defaults first (instant), Supabase corrects it
    // once that responds successfully
    apiGet('/api/profile')
      .then((row) => {
        const fromServer = transformProfile(row);
        setProfile(fromServer);
        saveProfile(fromServer);
      })
      .catch(() => { /* table not there yet -- keep the localStorage/default value */ });
  }, []);

  // Phase 6: Google Calendar. Live-fetches events for whichever day is
  // selected in HOME's week strip, on demand, rather than syncing to a local
  // table -- there's nothing yet that needs calendar data at rest. Polls
  // every 90s while the tab is open (the "1-2 minutes" cadence from the
  // roadmap) instead of a true push subscription -- Google Calendar push
  // needs a public HTTPS endpoint, which localhost doesn't have; revisit
  // once this is deployed.
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [dashboardCalendars, setDashboardCalendars] = useState([]);
  const [calendarManageOpen, setCalendarManageOpen] = useState(false);

  // uses a fresh `new Date()` at call time, not the reactive `now` state
  // (which ticks every second) -- depending on `now` here would tear down
  // and rebuild the polling interval every second instead of only when the
  // user actually changes which day/week they're looking at
  const refreshCalendarEvents = useCallback(() => {
    const dateStr = selectedCalendarDateStr(new Date(), calendarWeekOffset, selectedDayIdx);
    apiGet('/api/calendar/events?date=' + dateStr)
      .then((result) => {
        setGoogleConnected(result.connected);
        setCalendarEvents(result.events || []);
      })
      .catch((e) => console.error('calendar events load failed', e));
  }, [calendarWeekOffset, selectedDayIdx]);

  const toggleCalendarManage = () => {
    setCalendarManageOpen((open) => {
      const next = !open;
      if (next) {
        apiGet('/api/calendar/calendars')
          .then((result) => setDashboardCalendars(result.calendars || []))
          .catch((e) => console.error('calendar list load failed', e));
      }
      return next;
    });
  };

  // Optimistic toggle + persist -- hidden_calendar_ids sent is the full
  // current hidden set, not just the one being flipped, since the backend
  // stores it as a plain override list (see setHiddenCalendarIds in
  // lib/google.js), not a per-id patch.
  const toggleCalendarVisibility = (id) => {
    const nextCalendars = dashboardCalendars.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c));
    setDashboardCalendars(nextCalendars);
    const hiddenIds = nextCalendars.filter((c) => !c.visible).map((c) => c.id);
    apiSend('/api/calendar/calendars', 'PUT', { hidden_calendar_ids: hiddenIds })
      .then(() => refreshCalendarEvents())
      .catch((e) => console.error('calendar visibility save failed', e));
  };

  useEffect(() => {
    // after the OAuth redirect back from the backend, ?google=connected|denied|error|no_table
    // is on the URL -- just clean it off, the connected/disconnected state itself
    // comes from the real status check below, not this query param
    if (window.location.search.includes('google=')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    refreshCalendarEvents();
    const interval = setInterval(refreshCalendarEvents, 90000);
    return () => clearInterval(interval);
  }, [refreshCalendarEvents]);

  // In dev, goes straight at the backend's own port rather than through
  // CRA's dev-server proxy -- that proxy only reliably forwards fetch()/XHR
  // requests; a real full-page navigation (Accept: text/html, which is what
  // window.location.href sends) gets swallowed by webpack-dev-server's own
  // SPA fallback instead, which just reloads the React app and never reaches
  // Express. Confirmed directly: curling /api/integrations/google/auth
  // through port 3001 with an html Accept header returns the React app's
  // index.html (200), not the expected 302 redirect. In production there's
  // no separate dev server or port to route around -- Express serves the
  // built frontend itself, so a plain relative path already goes to the
  // right place.
  const connectGoogleCalendar = () => {
    const base = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5050';
    window.location.href = base + '/api/integrations/google/auth';
  };

  // CRM state
  const [crmView, setCrmView] = useState('PRIORITY');
  const [crmSearch, setCrmSearch] = useState('');
  const [crmAddOpen, setCrmAddOpen] = useState(false);
  const [crmAddTitle, setCrmAddTitle] = useState('');
  const [crmAddTimeframe, setCrmAddTimeframe] = useState('TODAY');
  const [crmAddEntity, setCrmAddEntity] = useState('PERSONAL');
  const [crmAddIsKey, setCrmAddIsKey] = useState(false);
  const [crmSmartText, setCrmSmartText] = useState('');
  const [crmSmartParsing, setCrmSmartParsing] = useState(false);
  const [crmDraggingId, setCrmDraggingId] = useState(null);
  const [crmDragOverCol, setCrmDragOverCol] = useState(null);
  const [crmFadingIds, setCrmFadingIds] = useState([]);
  const [categoryPickerId, setCategoryPickerId] = useState(null);

  // BRAIN state
  const [brainFilter, setBrainFilter] = useState('Entity Dashboard');
  const [selectedEntityId, setSelectedEntityId] = useState(null);
  const [entityDetailOpen, setEntityDetailOpen] = useState(false);
  const [entityNotes, setEntityNotes] = useState({});
  const [entityBriefing, setEntityBriefing] = useState({});
  const [briefingGenerating, setBriefingGenerating] = useState(false);

  // JOURNAL state -- entries backed by the real API (see useEffect above)
  const [journalEntries, setJournalEntries] = useState([]);
  const [journalViewMode, setJournalViewMode] = useState('SUMMARY');
  const [journalSearch, setJournalSearch] = useState('');
  const [journalAddOpen, setJournalAddOpen] = useState(false);
  const [journalAddDate, setJournalAddDate] = useState(localDateStr());
  const [journalAddRaw, setJournalAddRaw] = useState('');
  const [journalEditingId, setJournalEditingId] = useState(null);
  const [journalEditText, setJournalEditText] = useState('');
  // Phase 4: INSIGHTS view state -- day-by-day data loads automatically (cheap,
  // deterministic), the generated insight paragraph only on demand (Claude call)
  const [journalInsightDays, setJournalInsightDays] = useState([]);
  const [journalInsightLoading, setJournalInsightLoading] = useState(false);
  const [journalInsightText, setJournalInsightText] = useState('');
  const [journalInsightGenerating, setJournalInsightGenerating] = useState(false);
  const [journalInsightRangeDays, setJournalInsightRangeDaysState] = useState(14);

  // HEALTH state -- sleep log backed by the real API (404s gracefully pre-
  // migration, same tolerance pattern as habit_streak/profile above). Health
  // data (sleep+nutrition+HEALTH-habit trend) loads on demand when the tab is
  // opened, same reasoning as JOURNAL's INSIGHTS view -- cheap/deterministic
  // so it's fine to auto-load, the Claude insight paragraph stays button-gated.
  //
  // Sleep is logged by clicking "went to bed" / "woke up" rather than typing
  // hours by hand (2026-08-25 rework, at Elo's request) -- sleepPending holds
  // the in-progress night's bed_time (null when not currently "in bed").
  const [sleepLog, setSleepLog] = useState([]);
  const [sleepPending, setSleepPending] = useState(null);
  const [sleepQualityInput, setSleepQualityInput] = useState(0);
  const [foodEstimating, setFoodEstimating] = useState(false);
  const [healthData, setHealthData] = useState([]);
  const [healthDataLoading, setHealthDataLoading] = useState(false);
  const [healthRangeDays, setHealthRangeDaysState] = useState(14);
  const [healthInsightText, setHealthInsightText] = useState('');
  const [healthInsightGenerating, setHealthInsightGenerating] = useState(false);

  const selectedEntityIdRef = useRef(selectedEntityId);
  selectedEntityIdRef.current = selectedEntityId;

  // live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const closeEntityDetail = useCallback(() => {
    setEntityDetailOpen(false);
    setTimeout(() => setSelectedEntityId(null), 260);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && selectedEntityIdRef.current != null) closeEntityDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeEntityDetail]);

  // ---- CRM handlers (now backed by the real API) ----
  const toggleCrmKey = (id) => {
    setCrmTasks((ts) => {
      const next = ts.map((t) => (t.id === id ? { ...t, key: !t.key } : t));
      const updated = next.find((t) => t.id === id);
      apiSend('/api/tasks/' + id, 'PUT', { is_key: updated.key }).catch((e) => console.error(e));
      return next;
    });
  };
  const setTaskCategory = (id, entity) => {
    setCrmTasks((ts) => ts.map((t) => (t.id === id ? { ...t, entity } : t)));
    setCategoryPickerId(null);
    const entity_id = entityIdByName[entity];
    if (entity_id) apiSend('/api/tasks/' + id, 'PUT', { entity_id }).catch((e) => console.error(e));
  };
  const toggleCategoryPicker = (id) =>
    setCategoryPickerId((cur) => (cur === id ? null : id));
  const archiveCrmTask = (id) => {
    setCrmFadingIds((f) => [...f, id]);
    setTimeout(() => {
      setCrmTasks((ts) => ts.map((t) => (t.id === id ? { ...t, archived: true } : t)));
      setCrmFadingIds((f) => f.filter((x) => x !== id));
      apiSend('/api/tasks/' + id, 'PUT', { is_archived: true }).catch((e) => console.error(e));
    }, 260);
  };
  const restoreCrmTask = (id) => {
    setCrmTasks((ts) => ts.map((t) => (t.id === id ? { ...t, archived: false } : t)));
    apiSend('/api/tasks/' + id, 'PUT', { is_archived: false }).catch((e) => console.error(e));
  };
  const deleteCrmTask = (id) => {
    setCrmTasks((ts) => ts.filter((t) => t.id !== id));
    fetch('/api/tasks/' + id, { method: 'DELETE' }).catch((e) => console.error(e));
  };
  const submitCrmAdd = () => {
    const title = crmAddTitle.trim();
    if (!title) return;
    const entity_id = entityIdByName[crmAddEntity];
    apiSend('/api/tasks', 'POST', { title, entity_id, timeframe: crmAddTimeframe, is_key: crmAddIsKey })
      .then((rows) => setCrmTasks((ts) => [transformTask(rows[0], crmAddEntity), ...ts]))
      .catch((e) => console.error(e));
    setCrmAddTitle('');
    setCrmAddIsKey(false);
    setCrmAddOpen(false);
  };
  // Phase 3b: parses freeform text into task fields via Claude, then pre-fills
  // and opens the SAME manual add row above -- the review step is just "the
  // normal add row, pre-filled," not a separate UI to build or later remove.
  const submitCrmSmartAdd = () => {
    const text = crmSmartText.trim();
    if (!text) return;
    setCrmSmartParsing(true);
    apiSend('/api/tasks/parse', 'POST', { text })
      .then((parsed) => {
        setCrmAddTitle(parsed.title);
        setCrmAddTimeframe(parsed.timeframe);
        setCrmAddEntity(parsed.entity);
        setCrmAddIsKey(!!parsed.is_key);
        setCrmAddOpen(true);
        setCrmSmartText('');
      })
      .catch((e) => console.error(e))
      .finally(() => setCrmSmartParsing(false));
  };
  const dropOnCol = (id, timeframe) => {
    setCrmTasks((ts) => ts.map((t) => (t.id === id ? { ...t, timeframe } : t)));
    setCrmDraggingId(null);
    setCrmDragOverCol(null);
    apiSend('/api/tasks/' + id, 'PUT', { timeframe }).catch((e) => console.error(e));
  };

  // ---- HOME: key tasks are just real tasks where key === true ----
  const toggleTask = (id) => {
    setPendingDoneIds((s) => new Set(s).add(id));
    archiveCrmTask(id); // its own 260ms fade already covers the visual timing
  };
  const submitCapture = () => {
    const text = captureText.trim();
    if (!text) return;
    const entity_id = entityIdByName.PERSONAL;
    apiSend('/api/tasks', 'POST', { title: text, entity_id, timeframe: 'TODAY', is_key: true })
      .then((rows) => setCrmTasks((ts) => [transformTask(rows[0], 'PERSONAL'), ...ts]))
      .catch((e) => console.error(e));
    setCaptureText('');
  };

  // ---- PROFILE handlers (Operator card) ----
  const startEditProfile = (field) => {
    setEditingProfileField(field);
    setEditingProfileText(profile[field] || '');
  };
  const cancelEditProfile = () => {
    setEditingProfileField(null);
    setEditingProfileText('');
  };
  const saveEditProfile = () => {
    const field = editingProfileField;
    if (!field) return;
    const text = editingProfileText.trim();
    if (!text) { cancelEditProfile(); return; }
    setProfile((p) => {
      const next = { ...p, [field]: text };
      saveProfile(next);
      return next;
    });
    apiSend('/api/profile', 'PUT', { [field]: text }).catch((e) => console.error('profile sync failed', e));
    cancelEditProfile();
  };
  const updateProfilePhoto = (dataUrl) => {
    setProfile((p) => {
      const next = { ...p, photoData: dataUrl };
      saveProfile(next);
      return next;
    });
    apiSend('/api/profile', 'PUT', { photo_data: dataUrl }).catch((e) => console.error('profile photo sync failed', e));
  };

  // ---- HABITS handlers (backed by the real API) ----
  const toggleHabit = (id) => {
    const todayStr = localDateStr();
    setHabits((prev) => {
      const next = prev.map((h) => {
        if (h.id !== id) return h;
        const wasDone = h.completedDate === todayStr;
        return { ...h, completedDate: wasDone ? null : todayStr };
      });
      const updated = next.find((h) => h.id === id);
      const nowDone = updated.completedDate === todayStr;
      setHabitBurst(nowDone ? id : null);

      apiSend('/api/habits/' + id, 'PUT', {
        completed_today: nowDone,
        completed_date: nowDone ? todayStr : null,
      }).catch((e) => console.error(e));

      const map = loadHabitCompletions();
      if (nowDone) map[id] = todayStr; else delete map[id];
      saveHabitCompletions(map);

      return next;
    });
    setTimeout(() => setHabitBurst(null), 1100);
  };
  const toggleHabitsManage = () => setHabitsManageOpen((v) => !v);
  const addHabit = () => {
    const label = habitAddLabel.trim();
    if (!label) return;
    const category = habitAddCategory;
    const entity_id = entityIdByName[category] || null;
    const sort_order = habits.length > 0 ? Math.max(...habits.map((h) => h.sort_order ?? 0)) + 1 : 0;
    apiSend('/api/habits', 'POST', { label, category, entity_id, sort_order })
      .then((rows) => setHabits((hs) => [...hs, transformHabit(rows[0], loadHabitCompletions())]))
      .catch((e) => console.error(e));
    setHabitAddLabel('');
  };
  const startEditHabit = (id) => {
    const h = habits.find((x) => x.id === id);
    setEditingHabitId(id);
    setEditingHabitLabel(h ? h.label : '');
    setEditingHabitCategory(h && ENTITY_OPTIONS.includes(h.category) ? h.category : 'PERSONAL');
  };
  const cancelEditHabit = () => {
    setEditingHabitId(null);
    setEditingHabitLabel('');
  };
  const saveEditHabit = () => {
    const label = editingHabitLabel.trim();
    if (!label) { cancelEditHabit(); return; }
    const id = editingHabitId;
    const category = editingHabitCategory;
    const entity_id = entityIdByName[category] || null;
    setHabits((hs) => hs.map((h) => (h.id === id ? { ...h, label, category, entity_id } : h)));
    apiSend('/api/habits/' + id, 'PUT', { label, category, entity_id }).catch((e) => console.error(e));
    cancelEditHabit();
  };
  const reorderHabits = (draggedId, targetId) => {
    if (draggedId === targetId) return;
    setHabits((prev) => {
      const fromIdx = prev.findIndex((h) => h.id === draggedId);
      const toIdx = prev.findIndex((h) => h.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const list = [...prev];
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      const reordered = list.map((h, i) => ({ ...h, sort_order: i }));
      reordered.forEach((h) => {
        apiSend('/api/habits/' + h.id, 'PUT', { sort_order: h.sort_order }).catch((e) => console.error(e));
      });
      return reordered;
    });
  };
  const deleteHabit = (id) => {
    setHabits((hs) => hs.filter((h) => h.id !== id));
    if (editingHabitId === id) cancelEditHabit();
    const map = loadHabitCompletions();
    delete map[id];
    saveHabitCompletions(map);
    fetch('/api/habits/' + id, { method: 'DELETE' }).catch((e) => console.error(e));
  };

  // ---- GOALS handlers (backed by the real API) ----
  const addWeeklyGoal = () => {
    const text = weeklyInput.trim();
    if (!text) return;
    apiSend('/api/goals', 'POST', { text, timeframe: 'THIS WEEK', entity_id: null })
      .then((rows) => setGoals((g) => [...g, transformGoal(rows[0])]))
      .catch((e) => console.error(e));
    setWeeklyInput('');
  };
  const addMonthlyGoal = () => {
    const text = monthlyInput.trim();
    if (!text) return;
    apiSend('/api/goals', 'POST', { text, timeframe: 'THIS MONTH', entity_id: null })
      .then((rows) => setGoals((g) => [...g, transformGoal(rows[0])]))
      .catch((e) => console.error(e));
    setMonthlyInput('');
  };
  const deleteGoal = (id) => {
    setGoals((g) => g.filter((x) => x.id !== id));
    fetch('/api/goals/' + id, { method: 'DELETE' }).catch((e) => console.error(e));
  };
  const startEditGoal = (id) => {
    const g = goals.find((x) => x.id === id);
    setEditingGoalId(id);
    setEditingGoalText(g ? g.text : '');
  };
  const cancelEditGoal = () => {
    setEditingGoalId(null);
    setEditingGoalText('');
  };
  const saveEditGoal = () => {
    const text = editingGoalText.trim();
    if (!text) { cancelEditGoal(); return; }
    const id = editingGoalId;
    setGoals((g) => g.map((x) => (x.id === id ? { ...x, text } : x)));
    apiSend('/api/goals/' + id, 'PUT', { text }).catch((e) => console.error(e));
    cancelEditGoal();
  };

  // ---- NUTRITION handlers (backed by the real API) ----
  // Macros are AI-estimated from the freeform text (POST /api/nutrition/estimate,
  // via Claude) before the entry is saved -- previously this silently saved the
  // same hardcoded 250/12/20/8 for every meal regardless of what was typed.
  const addFood = () => {
    const text = foodInput.trim();
    if (!text || foodEstimating) return;
    setFoodEstimating(true);
    setFoodInput('');
    apiSend('/api/nutrition/estimate', 'POST', { text })
      .then((macros) => apiSend('/api/nutrition', 'POST', { label: text, ...macros }))
      .then((rows) => setFoodLog((f) => [...f, transformNutrition(rows[0])]))
      .catch((e) => console.error(e))
      .finally(() => setFoodEstimating(false));
  };
  const deleteFood = (id) => {
    setFoodLog((f) => f.filter((x) => x.id !== id));
    fetch('/api/nutrition/' + id, { method: 'DELETE' }).catch((e) => console.error(e));
  };

  // ---- SLEEP handlers (backed by the real API) ----
  // Clicking "went to bed" / "woke up" replaces typing hours by hand -- hours
  // are derived server-side from the two timestamps (Elo's request,
  // 2026-08-25). sleepPending mirrors the server's sleep_pending singleton.
  const goToBed = () => {
    apiSend('/api/sleep/bedtime', 'POST', {})
      .then((result) => setSleepPending(result.bed_time))
      .catch((e) => console.error(e));
  };
  const wakeUp = () => {
    apiSend('/api/sleep/wake', 'POST', { quality: sleepQualityInput || null })
      .then((row) => {
        setSleepLog((s) => [transformSleep(row), ...s]);
        setSleepPending(null);
        setSleepQualityInput(0);
        loadHealthData(healthRangeDays);
      })
      .catch((e) => console.error(e));
  };
  const deleteSleep = (id) => {
    setSleepLog((s) => s.filter((x) => x.id !== id));
    fetch('/api/sleep/' + id, { method: 'DELETE' }).catch((e) => console.error(e));
  };

  // ---- HEALTH tab handlers ----
  // Time window is user-adjustable (7/14/30/60/90 days), not fixed at 14 --
  // Elo felt locked into a stagnant fixed window; changing it re-fetches the
  // day-by-day data immediately (cheap) but does NOT auto-regenerate the AI
  // insight paragraph (still an explicit GENERATE click, avoiding a Claude
  // call on every range click).
  const loadHealthData = (days) => {
    setHealthDataLoading(true);
    apiGet('/api/health/data?days=' + (days || healthRangeDays))
      .then((result) => setHealthData(result.health))
      .catch((e) => console.error(e))
      .finally(() => setHealthDataLoading(false));
  };
  const setHealthRangeDays = (days) => {
    setHealthRangeDaysState(days);
    loadHealthData(days);
  };
  const generateHealthInsight = () => {
    setHealthInsightGenerating(true);
    apiSend('/api/health/insight?days=' + healthRangeDays, 'POST', {})
      .then((result) => setHealthInsightText(result.insight))
      .catch((e) => console.error(e))
      .finally(() => setHealthInsightGenerating(false));
  };
  useEffect(() => {
    if (activeTab === 'HEALTH') loadHealthData(healthRangeDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ---- BRAIN handlers ----
  const openEntityDetail = (id) => {
    setSelectedEntityId(id);
    setEntityDetailOpen(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setEntityDetailOpen(true)));
  };
  const generateBriefing = () => {
    const eid = selectedEntityId;
    setBriefingGenerating(true);
    apiSend('/api/entities/' + eid + '/briefing', 'POST', {})
      .then((result) => setEntityBriefing((b) => ({ ...b, [eid]: result.briefing })))
      .catch((e) => {
        console.error(e);
        setEntityBriefing((b) => ({ ...b, [eid]: 'Briefing generation failed — try again in a moment.' }));
      })
      .finally(() => setBriefingGenerating(false));
  };

  // ---- JOURNAL handlers ----
  const toggleJournalRaw = (id) =>
    setJournalEntries((js) => js.map((j) => (j.id === id ? { ...j, expanded: !j.expanded } : j)));
  const loadJournalInsightDays = (days) => {
    setJournalInsightLoading(true);
    apiGet('/api/analytics/correlation?days=' + (days || journalInsightRangeDays))
      .then((result) => setJournalInsightDays(result.correlation))
      .catch((e) => console.error(e))
      .finally(() => setJournalInsightLoading(false));
  };
  const changeJournalViewMode = (mode) => {
    setJournalViewMode(mode);
    setJournalEntries((js) => js.map((j) => ({ ...j, expanded: mode === 'RAW' })));
    if (mode === 'INSIGHTS') loadJournalInsightDays(journalInsightRangeDays);
  };
  // Time window is user-adjustable (7/14/30/60/90 days), same reasoning as
  // HEALTH's range picker -- a fixed 14-day window felt stagnant to Elo.
  const setJournalInsightRangeDays = (days) => {
    setJournalInsightRangeDaysState(days);
    loadJournalInsightDays(days);
  };
  const generateJournalInsight = () => {
    setJournalInsightGenerating(true);
    apiSend('/api/analytics/insight?days=' + journalInsightRangeDays, 'POST', {})
      .then((result) => setJournalInsightText(result.insight))
      .catch((e) => console.error(e))
      .finally(() => setJournalInsightGenerating(false));
  };
  // Auto-triggered right after a new entry is created (not blocking the
  // create itself), and reused as the manual re-analyze control on a card --
  // one function, two call sites.
  const extractJournalMood = (id) => {
    setJournalEntries((js) => js.map((j) => (j.id === id ? { ...j, extracting: true } : j)));
    apiSend('/api/journal/' + id + '/extract', 'POST', {})
      .then((result) =>
        setJournalEntries((js) =>
          js.map((j) => (j.id === id ? { ...j, extracting: false, mood: result.mood, themes: result.themes } : j))
        )
      )
      .catch((e) => {
        console.error(e);
        setJournalEntries((js) => js.map((j) => (j.id === id ? { ...j, extracting: false } : j)));
      });
  };
  const generateJournalSummary = (id) => {
    setJournalEntries((js) => js.map((j) => (j.id === id ? { ...j, generating: true } : j)));
    apiSend('/api/journal/' + id + '/summary', 'POST', {})
      .then((result) =>
        setJournalEntries((js) => js.map((j) => (j.id === id ? { ...j, generating: false, recap: result.recap } : j)))
      )
      .catch((e) => {
        console.error(e);
        setJournalEntries((js) => js.map((j) => (j.id === id ? { ...j, generating: false } : j)));
      });
  };
  const toggleJournalAdd = () => setJournalAddOpen((v) => !v);
  const submitJournalAdd = () => {
    const raw = journalAddRaw.trim();
    if (!raw || !journalAddDate) return;
    const [y, m, d] = journalAddDate.split('-').map(Number);
    const picked = new Date(y, m - 1, d);
    const day = dayLabelForDate(picked, now);
    const date = picked.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
    apiSend('/api/journal', 'POST', {
      day, date, tasks_count: 0, captures_count: 0, recap: '', raw_text: raw, entry_date: journalAddDate,
    })
      .then((rows) => {
        const created = transformJournal(rows[0]);
        setJournalEntries((js) => [created, ...js]);
        extractJournalMood(created.id);
      })
      .catch((e) => console.error(e));
    setJournalAddRaw('');
    setJournalAddDate(localDateStr());
    setJournalAddOpen(false);
  };
  const startEditJournal = (id) => {
    const entry = journalEntries.find((j) => j.id === id);
    setJournalEditingId(id);
    setJournalEditText(entry ? entry.raw : '');
    setJournalEntries((js) => js.map((j) => (j.id === id ? { ...j, expanded: true } : j)));
  };
  const cancelEditJournal = () => {
    setJournalEditingId(null);
    setJournalEditText('');
  };
  const saveEditJournal = () => {
    const id = journalEditingId;
    const raw = journalEditText;
    setJournalEntries((js) => js.map((j) => (j.id === id ? { ...j, raw } : j)));
    apiSend('/api/journal/' + id, 'PUT', { raw_text: raw }).catch((e) => console.error(e));
    cancelEditJournal();
  };

  const deleteJournalEntry = (id) => {
    setJournalEntries((js) => js.filter((j) => j.id !== id));
    if (journalEditingId === id) cancelEditJournal();
    fetch('/api/journal/' + id, { method: 'DELETE' }).catch((e) => console.error(e));
  };

  // ---- derived ----
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dayLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
  const dateLabel = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
  const timeLabel = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  // "done today" is recomputed from `now` on every render (not baked in once at
  // fetch time), so a habit correctly flips back to unchecked the moment the
  // calendar date actually changes -- including a tab left open across midnight,
  // not just on the next refresh.
  const todayStr = localDateStr(now);
  const habitsWithDone = useMemo(
    () => habits.map((h) => ({ ...h, done: h.completedDate === todayStr })),
    [habits, todayStr]
  );
  const isAllHabitsDoneToday = habitsWithDone.length > 0 && habitsWithDone.every((h) => h.done);

  // streak: +1 exactly once per day the moment every habit is done (guarded by
  // lastDoneDate so more clicking today can't push it higher); resets to 0 once a
  // full calendar day has passed without that happening. Runs off the same `now`
  // tick as the clock, so both the increment and the midnight reset apply live.
  useEffect(() => {
    const yesterdayStr = localDateStr(new Date(now.getTime() - 86400000));
    setStreak((prev) => {
      let { count, lastDoneDate } = prev;
      if (lastDoneDate && lastDoneDate !== todayStr && lastDoneDate !== yesterdayStr) {
        count = 0;
        lastDoneDate = null;
      }
      if (isAllHabitsDoneToday && lastDoneDate !== todayStr) {
        count += 1;
        lastDoneDate = todayStr;
        if ([7, 14, 30].includes(count)) setStreakBurst(true);
      }
      if (count === prev.count && lastDoneDate === prev.lastDoneDate) return prev;
      const next = { count, lastDoneDate };
      saveHabitStreak(next);
      apiSend('/api/habit-streak', 'PUT', { count: next.count, last_done_date: next.lastDoneDate })
        .catch((e) => console.error('streak sync failed (habit_streak table may not exist yet)', e));
      return next;
    });
    // `now` deliberately isn't a dependency: todayStr (derived from it) already
    // changes at the exact moment we care about (the calendar date rolling over),
    // so including `now` too would just re-run this every second for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAllHabitsDoneToday, todayStr]);

  useEffect(() => {
    if (!streakBurst) return;
    const t = setTimeout(() => setStreakBurst(false), 1700);
    return () => clearTimeout(t);
  }, [streakBurst]);

  const activeTasks = useMemo(() => crmTasks.filter((t) => !t.archived), [crmTasks]);
  const archivedTasks = useMemo(() => crmTasks.filter((t) => t.archived), [crmTasks]);

  const keyTasksDerived = useMemo(
    () =>
      activeTasks
        .filter((t) => t.key)
        .map((t) => ({ id: t.id, label: t.title, entity: t.entity, done: pendingDoneIds.has(t.id) })),
    [activeTasks, pendingDoneIds]
  );

  const decorate = useCallback(
    (t) => {
      const fading = crmFadingIds.includes(t.id);
      const dragging = crmDraggingId === t.id;
      const pickerOpen = categoryPickerId === t.id;
      const tfc = TF_COLOR[t.timeframe];
      return {
        ...t,
        color: tfc,
        starChar: t.key ? '★' : '☆',
        categoryIcon: ENTITY_META[t.entity] || '📁',
        pickerOpen,
        categoryOptions: ENTITY_OPTIONS.map((name) => ({
          name,
          icon: ENTITY_META[name],
          isCurrent: name === t.entity,
          style:
            'display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;border-radius:6px;white-space:nowrap;' +
            (name === t.entity
              ? 'background:oklch(0.8 0.19 200 / 0.15);color:oklch(0.86 0.17 195);'
              : 'color:oklch(0.75 0.02 228);'),
        })),
        categoryBtnStyle:
          'width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;flex-shrink:0;border:1px solid oklch(0.4 0.025 228);background:' +
          (pickerOpen ? 'oklch(0.24 0.08 232)' : 'transparent') + ';position:relative;',
        starStyle:
          'width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:15px;flex-shrink:0;border:1px solid ' +
          (t.key ? GOLD.replace(')', ' / 0.5)') : 'oklch(0.3 0.025 228)') + ';' +
          (t.key
            ? 'background:' + GOLD.replace(')', ' / 0.16)') + ';color:' + GOLD + ';box-shadow:' + GLOW_STRONG + ';'
            : 'background:transparent;color:oklch(0.45 0.025 228);'),
        badgeStyle:
          'font-size:9px;font-weight:700;letter-spacing:0.05em;padding:3px 8px;border-radius:5px;flex-shrink:0;background:' +
          tfc.replace(')', ' / 0.15)') + ';color:' + tfc + ';',
        rowStyle:
          'display:flex;align-items:center;gap:12px;padding:16px 10px;border-bottom:1px solid oklch(0.48 0.14 210);border-radius:8px;transition:background 0.15s ease, opacity 0.22s ease;' +
          (fading ? 'opacity:0.15;' : 'opacity:1;') +
          (t.key
            ? 'background:' + GOLD.replace(')', ' / 0.05)') + ';border-left:2px solid ' + GOLD + ';box-shadow:' + GLOW_STRONG + ';'
            : 'box-shadow:' + GLOW_MED + ';'),
        cardStyle:
          'background:oklch(0.16 0.075 238);border-radius:9px;padding:12px;cursor:grab;transition:opacity 0.15s ease, border-color 0.15s ease;border:1px solid ' +
          (t.key ? GOLD.replace(')', ' / 0.4)') : 'oklch(0.58 0.18 204)') + ';' +
          (t.key ? 'box-shadow:' + GLOW_STRONG + ';' : 'box-shadow:' + GLOW_MED + ';') +
          (dragging ? 'opacity:0.35;cursor:grabbing;' : 'opacity:1;'),
      };
    },
    [crmFadingIds, crmDraggingId, categoryPickerId]
  );

  const q = crmSearch.trim().toLowerCase();
  const visibleTasks = q ? activeTasks.filter((t) => t.title.toLowerCase().includes(q)) : activeTasks;
  const decoratedVisible = visibleTasks.map(decorate);

  const tabs = ['HOME', 'CRM', 'BRAIN', 'FINANCE', 'JOURNAL', 'HEALTH'];
  const tabBase = 'padding:8px 14px;font-size:12px;font-weight:600;letter-spacing:0.06em;border-radius:6px;cursor:pointer;transition:all 0.15s ease;white-space:nowrap;flex-shrink:0;';

  const selectedEntityRaw = brainEntities.find((en) => en.id === selectedEntityId) || null;
  const rawEntityTasks = selectedEntityRaw
    ? activeTasks.filter((t) => t.entity === selectedEntityRaw.name.toUpperCase())
    : [];

  const crmProps = {
    decorate, decoratedVisible, activeTasks, archivedTasks,
    crmView, setCrmView, crmSearch, setCrmSearch,
    crmAddOpen, setCrmAddOpen, crmAddTitle, setCrmAddTitle,
    crmAddTimeframe, setCrmAddTimeframe, crmAddEntity, setCrmAddEntity,
    crmAddIsKey, setCrmAddIsKey,
    crmSmartText, setCrmSmartText, crmSmartParsing, submitCrmSmartAdd,
    crmDraggingId, setCrmDraggingId, crmDragOverCol, setCrmDragOverCol,
    submitCrmAdd, toggleCrmKey, archiveCrmTask, restoreCrmTask, deleteCrmTask,
    toggleCategoryPicker, setTaskCategory, dropOnCol,
  };

  return (
    <div style={css('width:100%;max-width:1760px;min-height:100vh;background:oklch(0.12 0.06 240);color:oklch(0.92 0.015 228);display:flex;flex-direction:column;margin:0 auto;')}>

      <div style={css('display:flex;align-items:center;justify-content:space-between;padding:20px 32px;border-bottom:1px solid oklch(0.58 0.18 204);')}>
        <div style={css('display:flex;align-items:center;gap:28px;')}>
          <div style={css('font-size:14px;font-weight:800;letter-spacing:0.08em;')}>
            ELO<span style={css('color:oklch(0.6 0.025 228);font-weight:500;')}> // OS</span>
          </div>
          <div style={css('display:flex;gap:4px;')}>
            {tabs.map((name) => (
              <div
                key={name}
                onClick={() => setActiveTab(name)}
                style={css(
                  tabBase +
                    (name === activeTab
                      ? 'background:oklch(0.2 0.08 228);color:oklch(0.92 0.1 198);border:1px solid oklch(0.78 0.2 200);box-shadow:' + GLOW_STRONG + ';'
                      : 'color:oklch(0.6 0.025 228);')
                )}
              >
                {name}
              </div>
            ))}
          </div>
        </div>
        <div style={css('display:flex;align-items:center;gap:18px;')}>
          {tasksError && (
            <div style={css('font-size:10px;font-weight:600;color:oklch(0.65 0.2 25);background:oklch(0.65 0.2 25 / 0.12);padding:5px 10px;border-radius:6px;')}>
              {tasksError}
            </div>
          )}
          <div style={css('font-size:11px;color:oklch(0.55 0.025 228);letter-spacing:0.05em;')}>{dateLabel}</div>
          <div style={css('font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:0.02em;color:oklch(0.86 0.17 195);')}>{timeLabel}</div>
        </div>
      </div>

      {activeTab === 'HOME' && (
        <HomeTab
          now={now} greeting={greeting} dayLabel={dayLabel}
          calendarEvents={calendarEvents} googleConnected={googleConnected}
          connectGoogleCalendar={connectGoogleCalendar}
          dashboardCalendars={dashboardCalendars} calendarManageOpen={calendarManageOpen}
          toggleCalendarManage={toggleCalendarManage} toggleCalendarVisibility={toggleCalendarVisibility}
          profile={profile}
          editingProfileField={editingProfileField} editingProfileText={editingProfileText}
          setEditingProfileText={setEditingProfileText}
          startEditProfile={startEditProfile} saveEditProfile={saveEditProfile} cancelEditProfile={cancelEditProfile}
          updateProfilePhoto={updateProfilePhoto}
          financeHidden={financeHidden} setFinanceHidden={setFinanceHidden}
          keyTasks={keyTasksDerived} toggleTask={toggleTask}
          captureText={captureText} setCaptureText={setCaptureText} submitCapture={submitCapture}
          habits={habitsWithDone} toggleHabit={toggleHabit}
          habitBurst={habitBurst} streakCount={streak.count} streakBurst={streakBurst}
          habitsManageOpen={habitsManageOpen} toggleHabitsManage={toggleHabitsManage}
          habitAddLabel={habitAddLabel} setHabitAddLabel={setHabitAddLabel}
          habitAddCategory={habitAddCategory} setHabitAddCategory={setHabitAddCategory}
          addHabit={addHabit} deleteHabit={deleteHabit}
          editingHabitId={editingHabitId} editingHabitLabel={editingHabitLabel}
          setEditingHabitLabel={setEditingHabitLabel}
          editingHabitCategory={editingHabitCategory} setEditingHabitCategory={setEditingHabitCategory}
          startEditHabit={startEditHabit} saveEditHabit={saveEditHabit} cancelEditHabit={cancelEditHabit}
          draggingHabitId={draggingHabitId} setDraggingHabitId={setDraggingHabitId} reorderHabits={reorderHabits}
          selectedDayIdx={selectedDayIdx} setSelectedDayIdx={setSelectedDayIdx}
          calendarWeekOffset={calendarWeekOffset} setCalendarWeekOffset={setCalendarWeekOffset}
          weeklyGoals={weeklyGoals} monthlyGoals={monthlyGoals}
          weeklyInput={weeklyInput} setWeeklyInput={setWeeklyInput} addWeeklyGoal={addWeeklyGoal}
          monthlyInput={monthlyInput} setMonthlyInput={setMonthlyInput} addMonthlyGoal={addMonthlyGoal}
          deleteGoal={deleteGoal}
          editingGoalId={editingGoalId} editingGoalText={editingGoalText} setEditingGoalText={setEditingGoalText}
          startEditGoal={startEditGoal} saveEditGoal={saveEditGoal} cancelEditGoal={cancelEditGoal}
          foodLog={foodLog} foodInput={foodInput} setFoodInput={setFoodInput} addFood={addFood}
          deleteFood={deleteFood} foodEstimating={foodEstimating}
        />
      )}

      {activeTab === 'CRM' && (
        tasksLoading
          ? <div style={css('flex:1;display:flex;align-items:center;justify-content:center;color:oklch(0.5 0.025 228);font-size:13px;')}>Loading your tasks…</div>
          : <CrmTab {...crmProps} />
      )}

      {activeTab === 'BRAIN' && (
        <BrainTab
          brainEntities={brainEntities} activeTasks={activeTasks}
          brainFilter={brainFilter} setBrainFilter={setBrainFilter}
          openEntityDetail={openEntityDetail}
        />
      )}

      {activeTab === 'JOURNAL' && (
        <JournalTab
          journalEntries={journalEntries} journalViewMode={journalViewMode}
          setJournalViewMode={changeJournalViewMode}
          journalSearch={journalSearch} setJournalSearch={setJournalSearch}
          toggleJournalRaw={toggleJournalRaw} generateJournalSummary={generateJournalSummary}
          extractJournalMood={extractJournalMood}
          journalInsightDays={journalInsightDays} journalInsightLoading={journalInsightLoading}
          journalInsightText={journalInsightText} journalInsightGenerating={journalInsightGenerating}
          generateJournalInsight={generateJournalInsight}
          journalInsightRangeDays={journalInsightRangeDays} setJournalInsightRangeDays={setJournalInsightRangeDays}
          journalAddOpen={journalAddOpen} toggleJournalAdd={toggleJournalAdd}
          journalAddDate={journalAddDate} setJournalAddDate={setJournalAddDate}
          journalAddRaw={journalAddRaw} setJournalAddRaw={setJournalAddRaw}
          submitJournalAdd={submitJournalAdd}
          journalEditingId={journalEditingId} journalEditText={journalEditText}
          setJournalEditText={setJournalEditText}
          startEditJournal={startEditJournal} saveEditJournal={saveEditJournal} cancelEditJournal={cancelEditJournal}
          deleteJournalEntry={deleteJournalEntry}
        />
      )}

      {activeTab === 'HEALTH' && (
        <HealthTab
          sleepLog={sleepLog} sleepPending={sleepPending}
          sleepQualityInput={sleepQualityInput} setSleepQualityInput={setSleepQualityInput}
          goToBed={goToBed} wakeUp={wakeUp} deleteSleep={deleteSleep}
          healthData={healthData} healthDataLoading={healthDataLoading}
          healthRangeDays={healthRangeDays} setHealthRangeDays={setHealthRangeDays}
          healthInsightText={healthInsightText} healthInsightGenerating={healthInsightGenerating}
          generateHealthInsight={generateHealthInsight}
        />
      )}

      {!['HOME', 'CRM', 'BRAIN', 'JOURNAL', 'HEALTH'].includes(activeTab) && (
        <div style={css('flex:1;display:flex;align-items:center;justify-content:center;color:oklch(0.5 0.025 228);font-size:13px;')}>
          This tab is coming soon.
        </div>
      )}

      {selectedEntityRaw && (
        <EntityPanel
          entity={selectedEntityRaw}
          open={entityDetailOpen}
          close={closeEntityDetail}
          tasks={rawEntityTasks.map(decorate)}
          notesValue={entityNotes[selectedEntityRaw.id] ?? selectedEntityRaw.desc}
          onNotesChange={(v) => setEntityNotes((n) => ({ ...n, [selectedEntityRaw.id]: v }))}
          briefing={entityBriefing[selectedEntityRaw.id] || 'No briefing yet. Hit GENERATE to have AI write a status snapshot from your tasks + captures.'}
          briefingLabel={briefingGenerating ? 'GENERATING…' : 'GENERATE'}
          generateBriefing={generateBriefing}
          toggleCrmKey={toggleCrmKey}
          archiveCrmTask={archiveCrmTask}
          toggleCategoryPicker={toggleCategoryPicker}
          setTaskCategory={setTaskCategory}
        />
      )}
    </div>
  );
}