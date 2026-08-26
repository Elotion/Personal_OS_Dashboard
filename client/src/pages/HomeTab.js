import React, { useRef } from 'react';
import { css } from '../css';
import { CARD, GLOW_MED, GLOW_STRONG, GOLD, ENTITY_OPTIONS } from '../theme';

// resizes/compresses a picked image client-side before it goes anywhere, so the
// stored data URL stays reasonably small
function resizeImageFile(file, maxSize = 160, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) { height = Math.round(height * (maxSize / width)); width = maxSize; }
        else if (height >= width && height > maxSize) { width = Math.round(width * (maxSize / height)); height = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const COL = 'flex:1 1 0;min-width:260px;display:flex;flex-direction:column;gap:16px;padding:24px 4px;background:oklch(0.15 0.075 250);border-radius:16px;';

const SLEEP_QUALITY_EMOJI = { 1: '😴', 2: '😕', 3: '😐', 4: '🙂', 5: '😄' };
function formatClockTime(str) {
  if (!str) return '';
  return new Date(str).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
// 24-hour, matching the header clock's own convention (not 12-hour like
// formatClockTime above, which is used for sleep's "in bed since" phrasing).
function formatMealTime(str) {
  if (!str) return '';
  const d = new Date(str);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

const PARTICLE_COLORS = [
  'oklch(0.86 0.17 195)', 'oklch(0.95 0.02 200)',
  'oklch(0.8 0.19 200)', 'oklch(0.92 0.1 198)',
];

const NET_WORTH_SERIES = [10420, 10680, 11050, 11380, 11720, 12080, 12460, 12780, 13020, 13240];

function buildNetWorthPaths() {
  const min = Math.min(...NET_WORTH_SERIES);
  const max = Math.max(...NET_WORTH_SERIES);
  const cw = 260, ch = 84, padY = 6;
  const pts = NET_WORTH_SERIES.map((v, i) => ({
    x: (i / (NET_WORTH_SERIES.length - 1)) * cw,
    y: padY + (1 - (v - min) / (max - min)) * (ch - padY * 2),
  }));
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const cpX = (p0.x + p1.x) / 2;
    d += ` C ${cpX.toFixed(1)},${p0.y.toFixed(1)} ${cpX.toFixed(1)},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
  }
  return { line: d, area: d + ` L ${cw},${ch} L 0,${ch} Z` };
}
const NW = buildNetWorthPaths();

export default function HomeTab(props) {
  const {
    now, greeting, dayLabel,
    profile, editingProfileField, editingProfileText, setEditingProfileText,
    startEditProfile, saveEditProfile, cancelEditProfile, updateProfilePhoto,
    financeHidden, setFinanceHidden,
    keyTasks, toggleTask,
    captureText, setCaptureText, submitCapture,
    habits, toggleHabit, habitBurst, streakCount, streakBurst,
    habitsManageOpen, toggleHabitsManage,
    habitAddLabel, setHabitAddLabel, habitAddCategory, setHabitAddCategory, addHabit, deleteHabit,
    editingHabitId, editingHabitLabel, setEditingHabitLabel, startEditHabit, saveEditHabit, cancelEditHabit,
    editingHabitCategory, setEditingHabitCategory,
    draggingHabitId, setDraggingHabitId, reorderHabits,
    selectedDayIdx, setSelectedDayIdx, calendarWeekOffset, setCalendarWeekOffset,
    weeklyGoals, monthlyGoals,
    weeklyInput, setWeeklyInput, addWeeklyGoal,
    monthlyInput, setMonthlyInput, addMonthlyGoal, deleteGoal,
    weeklyGoalAddOpen, setWeeklyGoalAddOpen, monthlyGoalAddOpen, setMonthlyGoalAddOpen,
    editingGoalId, editingGoalText, setEditingGoalText, startEditGoal, saveEditGoal, cancelEditGoal,
    foodLog, foodInput, setFoodInput, addFood, deleteFood, foodEstimating,
    sleepLog, sleepPending, sleepQualityInput, setSleepQualityInput, goToBed, wakeUp, deleteSleep,
    calendarEvents, googleConnected, connectGoogleCalendar,
    dashboardCalendars, calendarManageOpen, toggleCalendarManage, toggleCalendarVisibility,
  } = props;

  const photoInputRef = useRef(null);
  const handlePhotoChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow picking the same file again later
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file);
      updateProfilePhoto(dataUrl);
    } catch (err) {
      console.error('photo resize failed', err);
    }
  };

  // ---- habits derived ----
  const habitsDoneCount = habits.filter((h) => h.done).length;
  const habitsTotal = habits.length;
  const dailyScore = habitsTotal > 0 ? Math.round((habitsDoneCount / habitsTotal) * 100) : 0;
  const r = 26;
  const circumference = 2 * Math.PI * r;

  const fireGlowBlur = streakCount >= 30 ? 14 : streakCount >= 14 ? 11 : streakCount >= 7 ? 8 : 5;
  const fireGlowAlpha = streakCount >= 30 ? 0.85 : streakCount >= 14 ? 0.7 : streakCount >= 7 ? 0.55 : 0.4;
  const fireStyle = css(
    'filter:drop-shadow(0 0 ' + fireGlowBlur + 'px oklch(0.86 0.17 195 / ' + fireGlowAlpha + '))' +
    (streakBurst ? ';animation:eloFirePulse 0.5s ease-in-out 3' : '') + ';transition:filter 0.4s ease;'
  );

  const particles = Array.from({ length: 10 }, (_, i) => ({
    idx: i,
    style: {
      ...css(
        'position:absolute;top:50%;left:50%;width:' + (i % 2 === 0 ? 6 : 4) + 'px;height:' + (i % 2 === 0 ? 6 : 4) +
        'px;border-radius:' + (i % 3 === 0 ? '1px' : '50%') + ';background:' + PARTICLE_COLORS[i % PARTICLE_COLORS.length] +
        ';animation:eloParticle 0.9s ease-out forwards;animation-delay:' + (i * 0.02) + 's;box-shadow:0 0 4px ' +
        PARTICLE_COLORS[i % PARTICLE_COLORS.length] + ';'
      ),
      '--ang': i * 36 + 'deg',
    },
  }));

  // ---- calendar derived ----
  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const isCurrentWeek = calendarWeekOffset === 0;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dow + calendarWeekOffset * 7);
  const weekDayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const weekDays = weekDayNames.map((weekday, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    const isToday = isCurrentWeek && idx === dow;
    const isSelected = idx === selectedDayIdx;
    return {
      idx, weekday, num: d.getDate(),
      cellStyle:
        'text-align:center;padding:8px 4px;border-radius:8px;cursor:pointer;' +
        (isSelected
          ? 'background:oklch(0.58 0.18 204);border:1px solid oklch(0.86 0.17 195 / 0.6);'
          : 'border:1px solid transparent;') +
        (isToday && !isSelected ? 'color:oklch(0.86 0.17 195);' : ''),
    };
  });
  const weekEnd = new Date(monday);
  weekEnd.setDate(monday.getDate() + 6);
  const sameMonth = monday.getMonth() === weekEnd.getMonth();
  const monthLabel = sameMonth
    ? monday.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
    : (monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' - ' +
       weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).toUpperCase();

  const isViewingToday = isCurrentWeek && selectedDayIdx === dow;
  let selectedEvents = (calendarEvents.length > 0
    ? calendarEvents
    : [{ time: '', label: isViewingToday ? 'No events today.' : 'No events scheduled.' }]
  ).map((ev) => ({ ...ev, isEvent: true, isNow: false }));

  if (isViewingToday) {
    const nowLabel = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const toMinutes = (t) => {
      const [h, m] = t.split(' – ')[0].split(':').map(Number);
      return h * 60 + m;
    };
    let insertAt = selectedEvents.length;
    for (let i = 0; i < selectedEvents.length; i++) {
      if (toMinutes(selectedEvents[i].time) > nowMinutes) { insertAt = i; break; }
    }
    selectedEvents = [
      ...selectedEvents.slice(0, insertAt),
      { isEvent: false, isNow: true, label: 'NOW · ' + nowLabel },
      ...selectedEvents.slice(insertAt),
    ];
  }

  // ---- nutrition derived ----
  const totalCalories = foodLog.reduce((s, f) => s + f.kcal, 0);
  const totalProtein = foodLog.reduce((s, f) => s + f.protein, 0);
  const totalCarbs = foodLog.reduce((s, f) => s + f.carbs, 0);
  const totalFat = foodLog.reduce((s, f) => s + f.fat, 0);
  const totalFiber = foodLog.reduce((s, f) => s + (f.fiber || 0), 0);

  const openCount = keyTasks.filter((t) => !t.done).length;

  return (
    <div style={css('display:flex;flex:1;flex-wrap:wrap;gap:20px;padding:0 12px;')}>

      {/* ================= LEFT COLUMN ================= */}
      <div style={css(COL)}>

        {/* OPERATOR */}
        <div style={css(CARD + 'padding:18px;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;')}>
            <div style={css('font-size:10px;font-weight:700;letter-spacing:0.1em;color:oklch(0.55 0.025 228);')}>OPERATOR</div>
            <div style={css('display:flex;align-items:center;gap:5px;')}>
              <div style={css('width:6px;height:6px;border-radius:50%;background:oklch(0.8 0.19 200);')} />
              <div style={css('font-size:9px;font-weight:600;letter-spacing:0.08em;color:oklch(0.6 0.025 228);')}>ONLINE</div>
            </div>
          </div>
          <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:14px;')}>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              style={css('display:none;')}
            />
            <div
              onClick={() => photoInputRef.current && photoInputRef.current.click()}
              style={css(
                'width:44px;height:44px;border-radius:10px;flex-shrink:0;cursor:pointer;position:relative;overflow:hidden;' +
                (profile.photoData
                  ? ''
                  : 'background:repeating-linear-gradient(135deg, oklch(0.3 0.025 228), oklch(0.3 0.025 228) 4px, oklch(0.26 0.025 228) 4px, oklch(0.26 0.025 228) 8px);display:flex;align-items:center;justify-content:center;font-size:9px;color:oklch(0.5 0.025 228);')
              )}
            >
              {profile.photoData && (
                <img src={profile.photoData} alt="" style={css('width:100%;height:100%;object-fit:cover;display:block;')} />
              )}
              {!profile.photoData && 'PHOTO'}
              <div style={css('position:absolute;bottom:-2px;right:-2px;width:16px;height:16px;border-radius:5px;background:oklch(0.58 0.18 204);border:1.5px solid oklch(0.16 0.075 238);display:flex;align-items:center;justify-content:center;font-size:8px;')}>✎</div>
            </div>
            <div style={css('min-width:0;flex:1;')}>
              {editingProfileField === 'name' ? (
                <input
                  autoFocus
                  value={editingProfileText}
                  onChange={(e) => setEditingProfileText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEditProfile(); if (e.key === 'Escape') cancelEditProfile(); }}
                  onBlur={saveEditProfile}
                  style={css('font-size:16px;font-weight:700;background:oklch(0.12 0.06 240);border:1px solid oklch(0.86 0.17 195);border-radius:6px;padding:2px 6px;color:oklch(0.92 0.015 228);width:100%;')}
                />
              ) : (
                <div style={css('display:flex;align-items:center;gap:6px;')}>
                  <div style={css('font-size:16px;font-weight:700;')}>{profile.name}</div>
                  <div
                    onClick={() => startEditProfile('name')}
                    style={css('cursor:pointer;color:oklch(0.5 0.025 228);font-size:10px;flex-shrink:0;')}
                  >✎</div>
                </div>
              )}
              {editingProfileField === 'tagline' ? (
                <input
                  autoFocus
                  value={editingProfileText}
                  onChange={(e) => setEditingProfileText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEditProfile(); if (e.key === 'Escape') cancelEditProfile(); }}
                  onBlur={saveEditProfile}
                  style={css('font-size:11px;background:oklch(0.12 0.06 240);border:1px solid oklch(0.86 0.17 195);border-radius:6px;padding:2px 6px;color:oklch(0.92 0.015 228);width:100%;margin-top:2px;')}
                />
              ) : (
                <div style={css('display:flex;align-items:center;gap:6px;')}>
                  <div style={css('font-size:11px;color:oklch(0.55 0.025 228);')}>{profile.tagline}</div>
                  <div
                    onClick={() => startEditProfile('tagline')}
                    style={css('cursor:pointer;color:oklch(0.5 0.025 228);font-size:9px;flex-shrink:0;')}
                  >✎</div>
                </div>
              )}
            </div>
          </div>
          <div style={css('display:flex;gap:20px;')}>
            <div style={css('min-width:0;flex:1;')}>
              <div style={css('font-size:9px;font-weight:700;letter-spacing:0.08em;color:oklch(0.5 0.025 228);margin-bottom:4px;')}>FOCUS</div>
              {editingProfileField === 'focus' ? (
                <input
                  autoFocus
                  value={editingProfileText}
                  onChange={(e) => setEditingProfileText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEditProfile(); if (e.key === 'Escape') cancelEditProfile(); }}
                  onBlur={saveEditProfile}
                  style={css('font-size:12px;font-style:italic;background:oklch(0.12 0.06 240);border:1px solid oklch(0.86 0.17 195);border-radius:6px;padding:2px 6px;color:oklch(0.92 0.015 228);width:100%;')}
                />
              ) : (
                <div style={css('display:flex;align-items:center;gap:6px;')}>
                  <div style={css('font-size:12px;font-style:italic;color:oklch(0.82 0.015 228);')}>{profile.focus}</div>
                  <div
                    onClick={() => startEditProfile('focus')}
                    style={css('cursor:pointer;color:oklch(0.5 0.025 228);font-size:9px;flex-shrink:0;')}
                  >✎</div>
                </div>
              )}
            </div>
            <div>
              <div style={css('font-size:9px;font-weight:700;letter-spacing:0.08em;color:oklch(0.5 0.025 228);margin-bottom:4px;')}>STREAK</div>
              <div style={css('font-size:14px;font-weight:700;')}>
                {streakCount} <span style={css('font-size:10px;font-weight:500;color:oklch(0.55 0.025 228);')}>days</span>
              </div>
            </div>
          </div>
        </div>

        {/* FINANCE PULSE */}
        <div style={css('position:relative;' + CARD + 'padding:18px;')}>
          <div
            className="elo-hover-pop"
            onClick={() => setFinanceHidden(!financeHidden)}
            style={css('position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:17px;cursor:pointer;background:oklch(0.24 0.08 232);z-index:2;transition:transform 0.15s ease;')}
          >🐵</div>
          <div style={css('filter:' + (financeHidden ? 'blur(9px)' : 'blur(0px)') + ';transition:filter 0.3s ease;user-select:' + (financeHidden ? 'none' : 'auto') + ';')}>
            <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-right:34px;')}>
              <div style={css('font-size:10px;font-weight:700;letter-spacing:0.1em;color:oklch(0.55 0.025 228);')}>FINANCE PULSE</div>
              <div style={css('font-size:10px;font-weight:600;color:oklch(0.8 0.19 200);background:oklch(0.8 0.19 200 / 0.12);padding:3px 8px;border-radius:20px;')}>↑ 6.2% · 30D</div>
            </div>
            <div style={css('font-size:10px;color:oklch(0.5 0.025 228);letter-spacing:0.06em;margin-bottom:4px;')}>NET WORTH</div>
            <div style={css('font-size:28px;font-weight:700;letter-spacing:-0.01em;margin-bottom:10px;')}>$13,240</div>
            <svg viewBox="0 0 260 84" preserveAspectRatio="none" style={css('width:100%;height:84px;display:block;margin-bottom:12px;filter:drop-shadow(0 0 5px oklch(0.86 0.17 195 / 0.4));')}>
              <defs>
                <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.86 0.17 195)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="oklch(0.86 0.17 195)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={NW.area} fill="url(#nwFill)" stroke="none" />
              <path d={NW.line} fill="none" stroke="oklch(0.86 0.17 195)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={css('display:flex;gap:10px;')}>
              <div style={css('flex:1;background:oklch(0.12 0.06 240);border-radius:8px;padding:10px 12px;box-shadow:' + GLOW_MED + ';')}>
                <div style={css('font-size:9px;color:oklch(0.5 0.025 228);letter-spacing:0.06em;margin-bottom:3px;')}>DAILY</div>
                <div style={css('font-size:14px;font-weight:700;color:oklch(0.8 0.19 200);')}>+$32</div>
              </div>
              <div style={css('flex:1;background:oklch(0.12 0.06 240);border-radius:8px;padding:10px 12px;box-shadow:' + GLOW_MED + ';')}>
                <div style={css('font-size:9px;color:oklch(0.5 0.025 228);letter-spacing:0.06em;margin-bottom:3px;')}>MONTHLY</div>
                <div style={css('font-size:14px;font-weight:700;color:oklch(0.8 0.19 200);')}>+$960</div>
              </div>
            </div>
          </div>
        </div>

        {/* TODAY · KEY TASKS */}
        <div style={css(CARD + 'padding:18px;flex:1;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;')}>
            <div style={css('font-size:10px;font-weight:700;letter-spacing:0.1em;color:oklch(0.55 0.025 228);')}>TODAY · KEY TASKS</div>
            <div style={css('display:flex;align-items:center;gap:6px;')}>
              <div style={css('font-size:10px;font-weight:600;color:oklch(0.5 0.025 228);')}>{openCount}</div>
              <div style={css('width:5px;height:5px;border-radius:50%;flex-shrink:0;background:' + GOLD + ';box-shadow:0 0 5px ' + GOLD.replace(')', ' / 0.7)') + ', 0 0 9px ' + GOLD.replace(')', ' / 0.4)') + ';')} />
            </div>
          </div>
          <div style={css('display:flex;flex-direction:column;gap:10px;')}>
            {keyTasks.map((t) => (
              <div
                key={t.id}
                style={css(
                  'display:flex;align-items:flex-start;gap:10px;padding:10px;border-radius:8px;border-bottom:1px solid oklch(0.52 0.15 208);transition:box-shadow 0.3s ease, opacity 0.3s ease;opacity:' +
                  (t.done ? '0.6' : '1') + ';box-shadow:' +
                  (t.done
                    ? '0 0 14px oklch(0.8 0.19 200 / 0.06), 0 0 28px oklch(0.62 0.2 235 / 0.035)'
                    : '0 0 24px oklch(0.8 0.19 200 / 0.19), 0 0 48px oklch(0.62 0.2 235 / 0.11)') +
                  ', inset 1px 1px 0 oklch(0.95 0.02 200 / 0.07), inset -1px -1px 0 oklch(0.05 0 0 / 0.3);'
                )}
              >
                <div
                  onClick={() => toggleTask(t.id)}
                  style={css(
                    'width:15px;height:15px;border-radius:4px;border:1.5px solid ' +
                    (t.done ? 'oklch(0.8 0.19 200)' : 'oklch(0.4 0.025 228)') + ';background:' +
                    (t.done ? 'oklch(0.8 0.19 200 / 0.15)' : 'transparent') +
                    ';color:oklch(0.8 0.19 200);box-shadow:' +
                    (t.done
                      ? '0 0 14px oklch(0.8 0.19 200 / 0.06), 0 0 28px oklch(0.62 0.2 235 / 0.035)'
                      : '0 0 24px oklch(0.8 0.19 200 / 0.19), 0 0 48px oklch(0.62 0.2 235 / 0.11)') +
                    ';flex-shrink:0;margin-top:1px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;transition:box-shadow 0.3s ease;'
                  )}
                >{t.done ? '✓' : ''}</div>
                <div style={css('flex:1;min-width:0;')}>
                  <div style={css('font-size:12.5px;font-weight:500;line-height:1.35;' + (t.done ? 'color:oklch(0.5 0.025 228);text-decoration:line-through;' : ''))}>{t.label}</div>
                  <div style={css('font-size:9.5px;font-weight:600;letter-spacing:0.06em;color:oklch(0.55 0.025 228);margin-top:2px;')}>{t.entity}</div>
                </div>
                <div style={css(
                  'width:6px;height:6px;border-radius:50%;flex-shrink:0;align-self:center;background:' +
                  (t.done ? 'oklch(0.4 0.025 228)' : GOLD.replace(')', ' / 0.75)')) + ';' +
                  (t.done ? '' : 'box-shadow:0 0 5px ' + GOLD.replace(')', ' / 0.6)') + ', 0 0 9px ' + GOLD.replace(')', ' / 0.35)') + ';')
                )} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ================= MIDDLE COLUMN ================= */}
      <div style={css('flex:3 1 0;padding:28px 12px;display:flex;flex-direction:column;gap:28px;min-width:400px;min-height:780px;')}>

        {/* GREETING + CAPTURE */}
        <div style={css(CARD + 'padding:20px;')}>
          <div style={css('font-size:11px;letter-spacing:0.08em;color:oklch(0.55 0.025 228);margin-bottom:6px;')}>{dayLabel}</div>
          <div style={css('font-size:30px;font-weight:700;letter-spacing:-0.01em;margin-bottom:18px;')}>
            {greeting}, <span style={css('font-style:italic;font-weight:500;')}>Elo</span>.
          </div>
          <div style={css('display:flex;align-items:center;gap:10px;background:oklch(0.12 0.06 240);border:1px solid oklch(0.58 0.18 204);border-radius:10px;padding:6px 6px 6px 16px;')}>
            <span style={css('font-size:14px;color:oklch(0.5 0.025 228);')}>⌘</span>
            <input
              value={captureText}
              onChange={(e) => setCaptureText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCapture(); }}
              placeholder="Capture a task, idea, or note…"
              style={css('flex:1;min-width:0;background:transparent;border:none;color:oklch(0.92 0.015 228);font-size:13.5px;padding:8px 0;')}
            />
            <div
              onClick={submitCapture}
              style={css('display:flex;align-items:center;gap:6px;background:oklch(0.2 0.08 228);color:oklch(0.92 0.1 198);border:1px solid oklch(0.78 0.2 200);box-shadow:0 0 16px -2px oklch(0.78 0.2 200 / 0.4);font-size:11.5px;font-weight:700;letter-spacing:0.04em;padding:9px 16px;border-radius:7px;cursor:pointer;white-space:nowrap;flex-shrink:0;')}
            >CAPTURE →</div>
          </div>
        </div>

        {/* HABITS */}
        <div style={css(CARD + 'padding:16px 18px;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;')}>
            <div style={css('font-size:10px;font-weight:700;letter-spacing:0.1em;color:oklch(0.55 0.025 228);')}>HABITS</div>
            <div style={css('display:flex;align-items:center;gap:10px;')}>
              <div style={css('font-size:10px;font-weight:600;color:oklch(0.5 0.025 228);')}>{habitsDoneCount}/{habitsTotal} · {dailyScore}%</div>
              <div style={css('display:flex;align-items:center;gap:5px;')}>
                <svg width="20" height="20" viewBox="0 0 24 24" style={fireStyle}>
                  <defs>
                    <linearGradient id="fireGrad" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="oklch(0.7 0.18 235)" />
                      <stop offset="100%" stopColor="oklch(0.92 0.1 198)" />
                    </linearGradient>
                  </defs>
                  <path d="M12 2c-1 2.5-3.5 4.5-3.5 8 0 2.5 2 4.5 4.5 4.5 1.6 0 2.4-1 2.4-2.2 0-1-.5-1.7-.9-2.4 1.8 1.1 3.5 3 3.5 5.6a5.5 5.5 0 0 1-11 0c0-3.4 1.9-5.3 3.4-7.4-.4 1.4.3 2.3 1.2 2.3.9 0 1.4-.7 1.4-1.6 0-1.4-1.2-2.6-1-6.8z" fill="url(#fireGrad)" />
                </svg>
                <span style={css('font-size:11px;font-weight:700;color:oklch(0.86 0.17 195);')}>
                  {streakCount}<span style={css('font-weight:500;color:oklch(0.6 0.025 228);')}> day streak</span>
                </span>
              </div>
              <div
                className="elo-hover-pop"
                onClick={toggleHabitsManage}
                style={css(
                  'width:22px;height:22px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;flex-shrink:0;transition:background 0.15s ease;background:' +
                  (habitsManageOpen ? 'oklch(0.58 0.18 204)' : 'oklch(0.24 0.08 232)') + ';color:oklch(0.88 0.02 228);'
                )}
              >✎</div>
            </div>
          </div>

          <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:12px;')}>
            <svg width="36" height="36" viewBox="0 0 64 64" style={css('flex-shrink:0;transform:rotate(-90deg);')}>
              <circle cx="32" cy="32" r="26" fill="none" stroke="oklch(0.58 0.18 204)" strokeWidth="6" />
              <circle
                cx="32" cy="32" r="26" fill="none" stroke="oklch(0.86 0.17 195)" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={circumference.toFixed(2)}
                strokeDashoffset={(circumference * (1 - dailyScore / 100)).toFixed(2)}
                style={css('filter:drop-shadow(0 0 5px oklch(0.86 0.17 195 / 0.55));transition:stroke-dashoffset 0.4s ease;')}
              />
            </svg>
            <div>
              <div style={css('font-size:15px;font-weight:800;line-height:1;')}>{dailyScore}</div>
              <div style={css('font-size:9.5px;color:oklch(0.6 0.025 228);')}>Daily score · resets 00:00</div>
            </div>
          </div>

          <div style={css('display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;')}>
            {habits.map((h) => (
              <div
                key={h.id}
                onClick={() => toggleHabit(h.id)}
                style={css(
                  'position:relative;overflow:visible;background:oklch(0.12 0.06 240);border-radius:9px;padding:9px 10px;cursor:pointer;border:1px solid ' +
                  (h.done ? 'oklch(0.86 0.17 195 / 0.4)' : 'oklch(0.58 0.18 204)') + ';opacity:' + (h.done ? '0.65' : '1') +
                  ';box-shadow:' +
                  (h.done
                    ? '0 0 14px oklch(0.8 0.19 200 / 0.06), 0 0 28px oklch(0.62 0.2 235 / 0.035)'
                    : '0 0 24px oklch(0.8 0.19 200 / 0.19), 0 0 48px oklch(0.62 0.2 235 / 0.11)') +
                  ', inset 1px 1px 0 oklch(0.95 0.02 200 / 0.07), inset -1px -1px 0 oklch(0.05 0 0 / 0.3);transition:border-color 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease;'
                )}
              >
                {h.done && (
                  <svg width="13" height="13" viewBox="0 0 24 24" style={css('position:absolute;top:7px;right:7px;filter:drop-shadow(0 0 4px oklch(0.86 0.17 195 / 0.55));')}>
                    <defs>
                      <linearGradient id={'fireGradMini' + h.id} x1="0" y1="1" x2="0" y2="0">
                        <stop offset="0%" stopColor="oklch(0.7 0.18 235)" />
                        <stop offset="100%" stopColor="oklch(0.92 0.1 198)" />
                      </linearGradient>
                    </defs>
                    <path d="M12 2c-1 2.5-3.5 4.5-3.5 8 0 2.5 2 4.5 4.5 4.5 1.6 0 2.4-1 2.4-2.2 0-1-.5-1.7-.9-2.4 1.8 1.1 3.5 3 3.5 5.6a5.5 5.5 0 0 1-11 0c0-3.4 1.9-5.3 3.4-7.4-.4 1.4.3 2.3 1.2 2.3.9 0 1.4-.7 1.4-1.6 0-1.4-1.2-2.6-1-6.8z" fill={'url(#fireGradMini' + h.id + ')'} />
                  </svg>
                )}
                <div style={css(
                  'width:17px;height:17px;border-radius:4px;border:1.5px solid ' +
                  (h.done ? 'oklch(0.86 0.17 195)' : 'oklch(0.4 0.025 228)') + ';background:' +
                  (h.done ? 'oklch(0.86 0.17 195 / 0.18)' : 'transparent') +
                  ';color:oklch(0.86 0.17 195);box-shadow:' +
                  (h.done
                    ? '0 0 14px oklch(0.8 0.19 200 / 0.06), 0 0 28px oklch(0.62 0.2 235 / 0.035)'
                    : '0 0 24px oklch(0.8 0.19 200 / 0.19), 0 0 48px oklch(0.62 0.2 235 / 0.11)') +
                  ';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;transition:box-shadow 0.3s ease;'
                )}>{h.done ? '✓' : ''}</div>
                <div style={css('font-size:11px;font-weight:600;margin-top:6px;')}>{h.label}</div>
                <div style={css('font-size:9px;font-weight:600;letter-spacing:0.05em;color:oklch(0.55 0.025 228);margin-top:1px;')}>{h.category}</div>
                {habitBurst === h.id && particles.map((p) => <div key={p.idx} style={p.style} />)}
              </div>
            ))}
          </div>

          {habitsManageOpen && (
            <div style={css('margin-top:14px;padding-top:14px;border-top:1px solid oklch(0.48 0.14 210);display:flex;flex-direction:column;gap:10px;')}>
              <div style={css('display:flex;align-items:center;gap:8px;')}>
                <input
                  value={habitAddLabel}
                  onChange={(e) => setHabitAddLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addHabit(); }}
                  placeholder="Add a habit"
                  style={css('flex:1;min-width:0;background:oklch(0.12 0.06 240);border:1px solid oklch(0.58 0.18 204);border-radius:7px;padding:8px 10px;color:oklch(0.92 0.015 228);font-size:12px;')}
                />
                <select
                  value={habitAddCategory}
                  onChange={(e) => setHabitAddCategory(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addHabit(); }}
                  style={css('width:100px;flex-shrink:0;background:oklch(0.12 0.06 240);border:1px solid oklch(0.58 0.18 204);border-radius:7px;padding:8px 10px;color:oklch(0.92 0.015 228);font-size:12px;')}
                >
                  {ENTITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <div
                  onClick={addHabit}
                  style={css('width:32px;height:32px;flex-shrink:0;border-radius:7px;background:oklch(0.58 0.18 204);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;box-shadow:' + GLOW_STRONG + ';')}
                >+</div>
              </div>
              <div style={css('display:flex;flex-direction:column;')}>
                {habits.map((h) => (
                  <div
                    key={'manage' + h.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(h.id)); setDraggingHabitId(h.id); }}
                    onDragEnd={() => setDraggingHabitId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      reorderHabits(Number(e.dataTransfer.getData('text/plain')), h.id);
                      setDraggingHabitId(null);
                    }}
                    onBlur={(e) => {
                      // Only save-and-exit once focus leaves the row entirely --
                      // without this check, tabbing/clicking from the label input
                      // to the category select (both inside this same row) would
                      // blur the input, save, and exit edit mode before the select
                      // ever got a chance to open.
                      if (editingHabitId === h.id && !e.currentTarget.contains(e.relatedTarget)) {
                        saveEditHabit();
                      }
                    }}
                    style={css(
                      'display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid oklch(0.48 0.14 210);transition:opacity 0.15s ease;' +
                      (draggingHabitId === h.id ? 'opacity:0.35;' : 'opacity:1;')
                    )}
                  >
                    <div style={css('cursor:grab;color:oklch(0.45 0.025 228);font-size:12px;flex-shrink:0;letter-spacing:-1px;')}>⋮⋮</div>
                    {editingHabitId === h.id ? (
                      <input
                        autoFocus
                        value={editingHabitLabel}
                        onChange={(e) => setEditingHabitLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEditHabit(); if (e.key === 'Escape') cancelEditHabit(); }}
                        style={css('flex:1;min-width:0;background:oklch(0.12 0.06 240);border:1px solid oklch(0.86 0.17 195);border-radius:6px;padding:6px 8px;color:oklch(0.92 0.015 228);font-size:12px;')}
                      />
                    ) : (
                      <div style={css('flex:1;min-width:0;font-size:12px;font-weight:500;')}>{h.label}</div>
                    )}
                    {editingHabitId === h.id ? (
                      <select
                        value={editingHabitCategory}
                        onChange={(e) => setEditingHabitCategory(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEditHabit(); if (e.key === 'Escape') cancelEditHabit(); }}
                        style={css('flex-shrink:0;background:oklch(0.12 0.06 240);border:1px solid oklch(0.86 0.17 195);border-radius:6px;padding:6px 8px;color:oklch(0.92 0.015 228);font-size:11px;')}
                      >
                        {ENTITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <div style={css('font-size:9px;font-weight:600;letter-spacing:0.05em;color:oklch(0.5 0.025 228);flex-shrink:0;')}>{h.category}</div>
                    )}
                    <div
                      onClick={() => startEditHabit(h.id)}
                      style={css('width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:oklch(0.5 0.025 228);font-size:11px;flex-shrink:0;')}
                    >✎</div>
                    <div
                      onClick={() => deleteHabit(h.id)}
                      style={css('width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:oklch(0.45 0.025 228);font-size:12px;flex-shrink:0;')}
                    >✕</div>
                  </div>
                ))}
                {habits.length === 0 && (
                  <div style={css('padding:12px 4px;text-align:center;color:oklch(0.5 0.025 228);font-size:11px;')}>No habits yet — add one above.</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* CALENDAR */}
        <div style={css('border:1.5px solid oklch(0.86 0.17 195 / 0.45);border-radius:14px;padding:20px;background:oklch(0.16 0.075 238);box-shadow:0 0 14px oklch(0.8 0.19 200 / 0.06), 0 0 28px oklch(0.62 0.2 235 / 0.035), inset 1px 1px 0 oklch(0.95 0.02 200 / 0.07), inset -1px -1px 0 oklch(0.05 0 0 / 0.3);flex:1;display:flex;flex-direction:column;min-height:0;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-shrink:0;')}>
            <div style={css('font-size:10px;font-weight:700;letter-spacing:0.1em;color:oklch(0.55 0.025 228);')}>CALENDAR</div>
            <div style={css('display:flex;align-items:center;gap:10px;')}>
              {!googleConnected && (
                <div
                  onClick={connectGoogleCalendar}
                  style={css('font-size:9.5px;font-weight:700;letter-spacing:0.04em;padding:5px 10px;border-radius:6px;background:oklch(0.58 0.18 204 / 0.15);border:1px solid oklch(0.58 0.18 204);color:oklch(0.75 0.15 210);cursor:pointer;white-space:nowrap;')}
                >CONNECT GOOGLE CALENDAR</div>
              )}
              {googleConnected && (
                <div
                  onClick={toggleCalendarManage}
                  title="Choose which calendars to show"
                  style={css('width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;background:' + (calendarManageOpen ? 'oklch(0.86 0.17 195 / 0.15)' : 'transparent') + ';color:' + (calendarManageOpen ? 'oklch(0.86 0.17 195)' : 'oklch(0.6 0.025 228)') + ';')}
                >⚙</div>
              )}
              <div style={css('display:flex;align-items:center;gap:6px;')}>
                <div
                className="elo-row-hover"
                onClick={() => setCalendarWeekOffset((o) => o - 1)}
                style={css('width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;font-weight:700;color:oklch(0.6 0.025 228);')}
              >‹</div>
              <div style={css('font-size:12px;font-weight:600;color:oklch(0.5 0.025 228);min-width:110px;text-align:center;')}>{monthLabel}</div>
              <div
                className="elo-row-hover"
                onClick={() => setCalendarWeekOffset((o) => o + 1)}
                style={css('width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;font-weight:700;color:oklch(0.6 0.025 228);')}
              >›</div>
              </div>
            </div>
          </div>
          {calendarManageOpen && (
            <div style={css('background:oklch(0.12 0.06 240);border:1px solid oklch(0.48 0.14 210);border-radius:10px;padding:14px 16px;margin-bottom:14px;flex-shrink:0;display:flex;flex-direction:column;gap:12px;max-height:240px;overflow-y:auto;')} className="elo-scroll">
              {dashboardCalendars.length === 0 ? (
                <div style={css('font-size:13px;color:oklch(0.5 0.025 228);')}>Loading calendars…</div>
              ) : (
                // checked (visible) calendars first, so it's obvious at a glance
                // what's currently showing vs. hidden, instead of scattered in
                // whatever order Google returns them in -- re-sorts live as
                // calendars are toggled, so a newly-checked one moves straight up
                [...dashboardCalendars]
                  .sort((a, b) => Number(b.visible) - Number(a.visible) || a.name.localeCompare(b.name))
                  .map((cal) => (
                    <div
                      key={cal.id}
                      onClick={() => toggleCalendarVisibility(cal.id)}
                      style={css('display:flex;align-items:center;gap:12px;cursor:pointer;')}
                    >
                      <div style={css('width:20px;height:20px;flex-shrink:0;border-radius:5px;border:2px solid ' + (cal.visible ? 'oklch(0.86 0.17 195)' : 'oklch(0.4 0.025 228)') + ';background:' + (cal.visible ? 'oklch(0.86 0.17 195 / 0.25)' : 'transparent') + ';')} />
                      <div style={css('font-size:14.5px;color:' + (cal.visible ? 'oklch(0.85 0.015 228)' : 'oklch(0.5 0.025 228)') + ';')}>{cal.name}{cal.isPrimary ? ' (primary)' : ''}</div>
                    </div>
                  ))
              )}
            </div>
          )}
          <div style={css('display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:16px;flex-shrink:0;')}>
            {weekDays.map((d) => (
              <div key={d.idx} onClick={() => setSelectedDayIdx(d.idx)} style={css(d.cellStyle)}>
                <div style={css('font-size:8.5px;font-weight:600;letter-spacing:0.05em;color:oklch(0.5 0.025 228);margin-bottom:4px;')}>{d.weekday}</div>
                <div style={css('font-size:14px;font-weight:700;')}>{d.num}</div>
              </div>
            ))}
          </div>
          <div style={css('position:relative;height:240px;flex-shrink:0;')}>
            <div className="elo-scroll" style={css('overflow-y:auto;height:100%;display:flex;flex-direction:column;gap:10px;padding-right:6px;')}>
              {selectedEvents.map((ev, i) =>
                ev.isNow ? (
                  <div key={'now' + i} style={css('display:flex;align-items:center;gap:8px;flex-shrink:0;')}>
                    <div style={css('font-size:10.5px;font-weight:700;letter-spacing:0.06em;color:oklch(0.86 0.17 195);white-space:nowrap;')}>{ev.label}</div>
                    <div style={css('flex:1;height:1px;background:oklch(0.86 0.17 195 / 0.55);box-shadow:0 0 6px oklch(0.86 0.17 195 / 0.6);')} />
                  </div>
                ) : (
                  <div key={'ev' + i} style={css('display:flex;gap:14px;padding-bottom:12px;border-bottom:1px solid oklch(0.52 0.15 208);flex-shrink:0;')}>
                    <div style={css('font-size:13px;font-weight:600;color:oklch(0.6 0.025 228);width:112px;flex-shrink:0;')}>{ev.time}</div>
                    <div style={css('font-size:14.5px;font-weight:500;')}>{ev.label}</div>
                  </div>
                )
              )}
            </div>
            <div style={css('position:absolute;left:0;right:6px;bottom:0;height:32px;background:linear-gradient(to bottom, transparent, oklch(0.16 0.075 238));pointer-events:none;')} />
          </div>
        </div>
      </div>

      {/* ================= RIGHT COLUMN ================= */}
      <div style={css(COL)}>

        {/* GOALS -- deliberately the most visually significant card on HOME
            (persistent breathing glow, GOLD border, bigger/bolder goal text)
            per Elo's explicit request: something he can't help but see and
            be reminded of every day. Same GOLD accent already used for key
            tasks/stars elsewhere, not a new color -- reuses this app's own
            existing "this matters" visual language instead of inventing one.
            Note: no inline box-shadow here -- the eloGoalGlow animation
            (index.css) owns box-shadow entirely; an inline one would always
            win over the CSS animation and freeze it on a single frame. */}
        <div className="elo-goal-card" style={css('background:oklch(0.16 0.075 238);border:1.5px solid ' + GOLD + ';border-radius:14px;padding:18px;')}>
          <div style={css('display:flex;align-items:center;gap:7px;margin-bottom:14px;')}>
            <span style={css('font-size:13px;')}>🎯</span>
            <span style={css('font-size:11px;font-weight:800;letter-spacing:0.1em;color:' + GOLD + ';')}>GOALS</span>
          </div>

          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;')}>
            <div style={css('font-size:9px;font-weight:700;letter-spacing:0.08em;color:oklch(0.5 0.025 228);')}>THIS WEEK</div>
            {weeklyGoals.length > 0 && !weeklyGoalAddOpen && (
              <div
                onClick={() => setWeeklyGoalAddOpen(true)}
                style={css('width:20px;height:20px;border-radius:6px;background:oklch(0.12 0.06 240);border:1px solid oklch(0.4 0.08 220);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;color:oklch(0.6 0.025 228);flex-shrink:0;')}
              >+</div>
            )}
          </div>
          {(weeklyGoals.length === 0 || weeklyGoalAddOpen) && (
            <div style={css('display:flex;gap:8px;margin-bottom:8px;')}>
              <input
                autoFocus={weeklyGoals.length > 0}
                value={weeklyInput}
                onChange={(e) => setWeeklyInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addWeeklyGoal(); if (e.key === 'Escape') setWeeklyGoalAddOpen(false); }}
                placeholder="Add a weekly goal"
                style={css('flex:1;min-width:0;background:oklch(0.12 0.06 240);border:1px solid oklch(0.58 0.18 204);border-radius:7px;padding:8px 10px;color:oklch(0.92 0.015 228);font-size:12px;')}
              />
              <div onClick={addWeeklyGoal} style={css('width:32px;height:32px;flex-shrink:0;border-radius:7px;background:oklch(0.58 0.18 204);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;box-shadow:' + GLOW_STRONG + ';')}>+</div>
            </div>
          )}
          <div style={css('display:flex;flex-direction:column;gap:8px;margin-bottom:16px;')}>
            {weeklyGoals.map((g) => (
              <div key={g.id} style={css('display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;padding:10px 12px;background:oklch(0.12 0.06 240);border-left:3px solid ' + GOLD + ';border-radius:7px;box-shadow:' + GLOW_MED + ';')}>
                {editingGoalId === g.id ? (
                  <input
                    autoFocus
                    value={editingGoalText}
                    onChange={(e) => setEditingGoalText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEditGoal(); if (e.key === 'Escape') cancelEditGoal(); }}
                    onBlur={saveEditGoal}
                    style={css('flex:1;min-width:0;background:oklch(0.16 0.075 238);border:1px solid oklch(0.86 0.17 195);border-radius:5px;padding:5px 7px;color:oklch(0.92 0.015 228);font-size:12px;')}
                  />
                ) : (
                  <div style={css('flex:1;min-width:0;')}>{g.text}</div>
                )}
                <div
                  onClick={() => startEditGoal(g.id)}
                  style={css('width:18px;height:18px;flex-shrink:0;border-radius:5px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:oklch(0.5 0.025 228);font-size:10px;')}
                >✎</div>
                <div
                  onClick={() => deleteGoal(g.id)}
                  style={css('width:18px;height:18px;flex-shrink:0;border-radius:5px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:oklch(0.45 0.025 228);font-size:11px;')}
                >✕</div>
              </div>
            ))}
          </div>

          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;')}>
            <div style={css('font-size:9px;font-weight:700;letter-spacing:0.08em;color:oklch(0.5 0.025 228);')}>THIS MONTH</div>
            {monthlyGoals.length > 0 && !monthlyGoalAddOpen && (
              <div
                onClick={() => setMonthlyGoalAddOpen(true)}
                style={css('width:20px;height:20px;border-radius:6px;background:oklch(0.12 0.06 240);border:1px solid oklch(0.4 0.08 220);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;color:oklch(0.6 0.025 228);flex-shrink:0;')}
              >+</div>
            )}
          </div>
          {(monthlyGoals.length === 0 || monthlyGoalAddOpen) && (
            <div style={css('display:flex;gap:8px;margin-bottom:8px;')}>
              <input
                autoFocus={monthlyGoals.length > 0}
                value={monthlyInput}
                onChange={(e) => setMonthlyInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addMonthlyGoal(); if (e.key === 'Escape') setMonthlyGoalAddOpen(false); }}
                placeholder="Add a monthly goal"
                style={css('flex:1;min-width:0;background:oklch(0.12 0.06 240);border:1px solid oklch(0.58 0.18 204);border-radius:7px;padding:8px 10px;color:oklch(0.92 0.015 228);font-size:12px;')}
              />
              <div onClick={addMonthlyGoal} style={css('width:32px;height:32px;flex-shrink:0;border-radius:7px;background:oklch(0.58 0.18 204);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;box-shadow:' + GLOW_STRONG + ';')}>+</div>
            </div>
          )}
          <div style={css('display:flex;flex-direction:column;gap:8px;')}>
            {monthlyGoals.map((g) => (
              <div key={g.id} style={css('display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;padding:10px 12px;background:oklch(0.12 0.06 240);border-left:3px solid ' + GOLD + ';border-radius:7px;box-shadow:' + GLOW_MED + ';')}>
                {editingGoalId === g.id ? (
                  <input
                    autoFocus
                    value={editingGoalText}
                    onChange={(e) => setEditingGoalText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEditGoal(); if (e.key === 'Escape') cancelEditGoal(); }}
                    onBlur={saveEditGoal}
                    style={css('flex:1;min-width:0;background:oklch(0.16 0.075 238);border:1px solid oklch(0.86 0.17 195);border-radius:5px;padding:5px 7px;color:oklch(0.92 0.015 228);font-size:12px;')}
                  />
                ) : (
                  <div style={css('flex:1;min-width:0;')}>{g.text}</div>
                )}
                <div
                  onClick={() => startEditGoal(g.id)}
                  style={css('width:18px;height:18px;flex-shrink:0;border-radius:5px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:oklch(0.5 0.025 228);font-size:10px;')}
                >✎</div>
                <div
                  onClick={() => deleteGoal(g.id)}
                  style={css('width:18px;height:18px;flex-shrink:0;border-radius:5px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:oklch(0.45 0.025 228);font-size:11px;')}
                >✕</div>
              </div>
            ))}
          </div>
        </div>

        {/* NUTRITION */}
        <div style={css(CARD + 'padding:18px;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;')}>
            <div style={css('font-size:10px;font-weight:700;letter-spacing:0.1em;color:oklch(0.55 0.025 228);')}>NUTRITION</div>
            <div style={css('font-size:9px;font-weight:600;letter-spacing:0.06em;color:oklch(0.5 0.025 228);')}>TODAY</div>
          </div>
          <div style={css('font-size:26px;font-weight:800;margin-bottom:2px;')}>
            {totalCalories} <span style={css('font-size:11px;font-weight:500;color:oklch(0.55 0.025 228);')}>kcal</span>
          </div>
          <div style={css('font-size:11px;color:oklch(0.55 0.025 228);margin-bottom:14px;')}>
            {totalProtein}g protein · {totalCarbs}g carbs · {totalFat}g fat · {totalFiber}g fiber
          </div>
          <div style={css('font-size:9px;font-weight:700;letter-spacing:0.08em;color:oklch(0.5 0.025 228);margin-bottom:8px;')}>
            TODAY · {foodLog.length} {foodLog.length === 1 ? 'MEAL' : 'MEALS'}
          </div>
          <div style={css('display:flex;flex-direction:column;gap:8px;margin-bottom:12px;')}>
            {foodLog.map((item) => (
              <div key={item.id} style={css('display:flex;align-items:center;gap:10px;font-size:12px;padding:9px 10px;border-radius:7px;border-bottom:1px solid oklch(0.52 0.15 208);box-shadow:' + GLOW_MED + ';')}>
                <div style={css('font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;color:oklch(0.86 0.17 195);flex-shrink:0;')}>{formatMealTime(item.loggedAt)}</div>
                <div style={css('font-weight:500;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{item.label}</div>
                <div style={css('font-size:10px;font-weight:600;color:oklch(0.65 0.025 228);background:oklch(0.12 0.06 240);padding:3px 7px;border-radius:5px;flex-shrink:0;')}>{item.kcal} kcal</div>
                <div style={css('font-size:10px;font-weight:600;color:oklch(0.8 0.19 200);background:oklch(0.8 0.19 200 / 0.12);padding:3px 7px;border-radius:5px;flex-shrink:0;')}>{item.protein}p</div>
                <div
                  onClick={() => deleteFood(item.id)}
                  style={css('width:18px;height:18px;flex-shrink:0;border-radius:5px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:oklch(0.45 0.025 228);font-size:11px;')}
                >✕</div>
              </div>
            ))}
            {foodLog.length === 0 && (
              <div style={css('color:oklch(0.5 0.025 228);font-size:11.5px;padding:4px 0;')}>No meals logged yet today.</div>
            )}
          </div>
          <div style={css('display:flex;gap:8px;')}>
            <input
              value={foodInput}
              onChange={(e) => setFoodInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addFood(); }}
              placeholder={foodEstimating ? 'Estimating…' : 'Log a meal — e.g. chicken, rice'}
              disabled={foodEstimating}
              style={css('flex:1;min-width:0;background:oklch(0.12 0.06 240);border:1px solid oklch(0.58 0.18 204);border-radius:7px;padding:8px 10px;color:oklch(0.92 0.015 228);font-size:12px;')}
            />
            <div onClick={addFood} style={css('width:32px;height:32px;flex-shrink:0;border-radius:7px;background:oklch(0.58 0.18 204);display:flex;align-items:center;justify-content:center;cursor:' + (foodEstimating ? 'default' : 'pointer') + ';font-size:14px;box-shadow:' + GLOW_STRONG + ';opacity:' + (foodEstimating ? '0.5' : '1') + ';')}>+</div>
          </div>
        </div>

        {/* SLEEP -- bed/wake click flow lives here, not on HEALTH (which is
            pure visual data + insight generation, no logging actions) */}
        <div style={css(CARD + 'padding:18px;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;')}>
            <div style={css('font-size:10px;font-weight:700;letter-spacing:0.1em;color:oklch(0.55 0.025 228);')}>SLEEP</div>
            <div style={css('font-size:9px;font-weight:600;letter-spacing:0.06em;color:oklch(0.5 0.025 228);')}>RECENT</div>
          </div>
          <div style={css('display:flex;flex-direction:column;gap:8px;margin-bottom:12px;')}>
            {sleepLog.length === 0 ? (
              <div style={css('color:oklch(0.5 0.025 228);font-size:11.5px;')}>No sleep logged yet.</div>
            ) : (
              sleepLog.slice(0, 3).map((s) => (
                <div key={s.id} style={css('display:flex;align-items:center;gap:8px;font-size:12px;padding:8px 10px;border-radius:7px;border-bottom:1px solid oklch(0.52 0.15 208);box-shadow:' + GLOW_MED + ';')}>
                  <div style={css('font-weight:500;flex:1;min-width:0;')}>{s.date}</div>
                  <div style={css('color:oklch(0.55 0.025 228);flex-shrink:0;')}>{s.hours}h{s.quality ? ' ' + SLEEP_QUALITY_EMOJI[s.quality] : ''}</div>
                  <div
                    onClick={() => deleteSleep(s.id)}
                    style={css('width:18px;height:18px;flex-shrink:0;border-radius:5px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:oklch(0.45 0.025 228);font-size:11px;')}
                  >✕</div>
                </div>
              ))
            )}
          </div>
          {sleepPending ? (
            <div style={css('display:flex;flex-direction:column;gap:10px;')}>
              <div style={css('font-size:12px;color:oklch(0.65 0.025 228);')}>
                😴 In bed since <span style={css('font-weight:700;color:oklch(0.86 0.17 195);')}>{formatClockTime(sleepPending)}</span>
              </div>
              <div style={css('display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;')}>
                <div style={css('display:flex;gap:6px;')}>
                  {[1, 2, 3, 4, 5].map((q) => (
                    <div
                      key={q}
                      onClick={() => setSleepQualityInput(sleepQualityInput === q ? 0 : q)}
                      title={'Quality ' + q}
                      style={css(
                        'width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;' +
                        (sleepQualityInput === q
                          ? 'background:oklch(0.58 0.18 204);box-shadow:' + GLOW_STRONG + ';'
                          : 'background:oklch(0.12 0.06 240);border:1px solid oklch(0.4 0.08 220);opacity:0.6;')
                      )}
                    >{SLEEP_QUALITY_EMOJI[q]}</div>
                  ))}
                </div>
                <div
                  onClick={wakeUp}
                  style={css('font-size:11px;font-weight:700;letter-spacing:0.05em;padding:9px 16px;border-radius:8px;background:oklch(0.58 0.18 204);color:oklch(0.95 0.02 200);cursor:pointer;white-space:nowrap;box-shadow:' + GLOW_STRONG + ';')}
                >☀️ WOKE UP</div>
              </div>
            </div>
          ) : (
            <div
              onClick={goToBed}
              style={css('width:100%;text-align:center;font-size:12px;font-weight:700;letter-spacing:0.05em;padding:12px;border-radius:8px;background:oklch(0.2 0.08 228);color:oklch(0.92 0.1 198);border:1px solid oklch(0.78 0.2 200);cursor:pointer;box-shadow:' + GLOW_STRONG + ';')}
            >🛏️ WENT TO BED</div>
          )}
        </div>
      </div>
    </div>
  );
}
