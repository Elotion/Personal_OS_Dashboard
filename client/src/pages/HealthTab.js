import React from 'react';
import { css } from '../css';
import { CARD, CARD_CLASS, GLOW_STRONG } from '../theme';

const RANGE_OPTIONS = [7, 14, 30, 60, 90];

// Glowing progress ring, used for every metric on this page now (2026-08-26,
// full pivot away from line graphs -- Elo saw the ring built for OTHER
// MACROS and asked for it everywhere: "I like how the circle looks for
// other's macro... let's do circles for calories protein and sugar as well,
// instead of the line graph for sleep, let's do the circle as well, as well
// as the macro in today's macro let's all use circle against goal"). Exact
// same technique as HOME's habit "Daily score" ring (HomeTab.js: r=26,
// circumference = 2*PI*r, rotated -90deg so the fill starts at 12 o'clock,
// strokeDashoffset driving the fill amount, a glow drop-shadow on the
// filled arc). `size` scales the ring itself (bigger for SLEEP/the 3
// priority macros, smaller for the 6-up TODAY grid and the secondary
// carbs/fat/fiber row) -- the underlying r=26/circumference math stays
// fixed in the viewBox, only the rendered width/height (and stroke/font
// scaling with it) change, so the ring never looks stretched at any size.
// `valueLabel` distinguishes "avg" (range average, used in the NUTRITION
// trend section) from "today" (used in the TODAY snapshot section) -- same
// component, different underlying data per Elo's own two use cases.
function MacroRing({ label, value, goal, unit, color, size = 48, valueLabel = 'avg' }) {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const pct = goal > 0 && value != null ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  const scale = size / 64;
  return (
    <div style={css('display:flex;align-items:center;gap:' + Math.round(12 * Math.max(scale, 0.8)) + 'px;padding:' + Math.round(12 * Math.max(scale, 0.85)) + 'px;border-radius:12px;background:oklch(0.11 0.05 236);border:1px solid oklch(0.28 0.06 232);')}>
      <svg width={size} height={size} viewBox="0 0 64 64" style={css('flex-shrink:0;transform:rotate(-90deg);')}>
        <circle cx="32" cy="32" r={r} fill="none" stroke={color.replace(')', ' / 0.22)')} strokeWidth="7" />
        <circle
          cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={circumference.toFixed(2)}
          strokeDashoffset={(circumference * (1 - pct / 100)).toFixed(2)}
          style={css('filter:drop-shadow(0 0 5px ' + color.replace(')', ' / 0.55)') + ');transition:stroke-dashoffset 0.4s ease;')}
        />
      </svg>
      <div style={css('flex:1;min-width:0;')}>
        <div style={css('font-size:' + Math.max(9, Math.round(10.5 * scale)) + 'px;font-weight:700;letter-spacing:0.06em;color:oklch(0.62 0.03 228);margin-bottom:3px;')}>{label}</div>
        <div style={css('font-size:' + Math.max(13, Math.round(17 * scale)) + 'px;font-weight:800;line-height:1;')}>
          {value != null ? Math.round(value) : '—'}<span style={css('font-size:' + Math.max(8, Math.round(10 * scale)) + 'px;font-weight:500;color:oklch(0.55 0.025 228);')}> {unit} {valueLabel}</span>
        </div>
      </div>
      <div style={css('text-align:right;flex-shrink:0;padding-left:' + Math.round(10 * Math.max(scale, 0.8)) + 'px;border-left:1px solid oklch(0.28 0.06 232);')}>
        <div style={css('font-size:' + Math.max(7, Math.round(8 * scale)) + 'px;font-weight:700;letter-spacing:0.07em;color:oklch(0.5 0.025 228);margin-bottom:2px;')}>GOAL</div>
        <div style={css('font-size:' + Math.max(11, Math.round(14 * scale)) + 'px;font-weight:800;color:oklch(0.85 0.02 228);')}>{goal}{unit}</div>
      </div>
    </div>
  );
}

// The 3 macros Elo said matter most ("the most important macros i care
// about are calories, proteins, and sugar") -- personalized goals from
// healthGoals, used both in the TODAY snapshot (today's value) and the
// NUTRITION section (range average).
const PRIORITY_MACROS = [
  { key: 'kcal', label: 'CALORIES', unit: 'kcal', goalKey: 'calorieGoal', color: 'oklch(0.86 0.17 195)' },
  { key: 'protein', label: 'PROTEIN', unit: 'g', goalKey: 'proteinGoal', color: 'oklch(0.7 0.18 150)' },
  { key: 'sugar', label: 'SUGAR', unit: 'g', goalKey: 'sugarGoal', color: 'oklch(0.68 0.19 25)' },
];
// General adult reference intake per day, at a 2,000-kcal diet -- the same
// %DV baseline printed on every US nutrition label (FDA), not personalized
// advice. Elo didn't ask for personalized goals on these, only calories/
// protein/sugar above.
const SECONDARY_MACROS = [
  { key: 'carbs', label: 'CARBS', unit: 'g', target: 275, color: 'oklch(0.75 0.16 90)' },
  { key: 'fat', label: 'FAT', unit: 'g', target: 78, color: 'oklch(0.75 0.16 60)' },
  { key: 'fiber', label: 'FIBER', unit: 'g', target: 28, color: 'oklch(0.72 0.15 165)' },
];

// Small labeled pill for one macro value in a DAY BY DAY row -- each value
// gets its own spaced, color-coded chip instead of a joined string.
function MacroPill({ label, value, color }) {
  return (
    <div style={css(
      'display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:20px;flex-shrink:0;' +
      'background:oklch(0.14 0.06 236);border:1px solid ' + color + ';'
    )}>
      <span style={css('font-size:10.5px;font-weight:700;color:oklch(0.9 0.02 228);white-space:nowrap;')}>{value}</span>
      <span style={css('font-size:8.5px;font-weight:600;letter-spacing:0.03em;color:oklch(0.55 0.025 228);')}>{label}</span>
    </div>
  );
}

// Shared by the AI INSIGHT card's window and DAY BY DAY's window -- they're
// the same `days` value under the hood (HealthTab has one range, not two).
function RangePicker({ value, onChange }) {
  return (
    <div style={css('display:flex;gap:6px;')}>
      {RANGE_OPTIONS.map((d) => (
        <div
          key={d}
          onClick={() => onChange(d)}
          style={css(
            'font-size:10px;font-weight:700;letter-spacing:0.03em;padding:5px 10px;border-radius:6px;cursor:pointer;white-space:nowrap;' +
            (value === d
              ? 'background:oklch(0.58 0.18 204);color:oklch(0.95 0.02 200);box-shadow:' + GLOW_STRONG + ';'
              : 'background:oklch(0.12 0.06 240);color:oklch(0.55 0.025 228);border:1px solid oklch(0.4 0.08 220);')
          )}
        >{d}D</div>
      ))}
    </div>
  );
}

// HEALTH is pure visual data + on-demand insight generation -- no logging
// actions live here. Bed/wake clicks and meal logging both live on HOME
// instead (2026-08-25, at Elo's request: "the health page should be just
// visual data where I can see and generate insight").
//
// Layout (2026-08-26, per Elo's explicit 4-zone spec): top-left = SLEEP,
// top-right = TODAY'S snapshot (macros vs. goal + health habits, "so I can
// access it as soon as possible when I enter the health tab"), middle =
// full nutrient averages, bottom = DAY BY DAY. HEALTH HABITS folded into
// the top-right zone alongside TODAY'S MACROS (Claude's call, since Elo said
// "move it somewhere else unless you have a recommendation") -- both are
// glanceable "right now" stats, so they read naturally as one group, and it
// keeps top-left purely about sleep.
//
// Everything below the AI INSIGHT card is MacroRing now -- the line-graph
// era of this file (buildSparkline/Sparkline/MetricGraph/TrendBox,
// MacroBar) is gone entirely, replaced across the board per Elo's request
// ("let's all use circle against goal so it looks better and cleaner").
export default function HealthTab({
  healthData, healthDataLoading, healthRangeDays, setHealthRangeDays,
  healthInsightText, healthInsightGenerating, generateHealthInsight,
  healthGoals,
}) {
  const latestHabitDay = [...healthData].reverse().find((d) => d.health_habits_total > 0);
  const latestDay = healthData.length ? healthData[healthData.length - 1] : null;

  // Range average, used by NUTRITION's rings and SLEEP's ring -- "average"
  // specifically, per Elo's own wording ("other macros average").
  const rangeAvg = (key) => {
    const known = healthData.map((d) => d[key]).filter((v) => v > 0);
    return known.length ? known.reduce((s, v) => s + v, 0) / known.length : null;
  };
  const sleepAvg = (() => {
    const known = healthData.map((d) => d.sleep_hours).filter((v) => v != null);
    return known.length ? known.reduce((s, v) => s + v, 0) / known.length : null;
  })();

  return (
    <div className="elo-scroll" style={css('flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:16px;padding-right:6px;')}>

      {/* AI INSIGHT */}
      <div className={CARD_CLASS} style={css(CARD + 'padding:16px;display:flex;flex-direction:column;gap:10px;')}>
        <div style={css('display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;')}>
          <div style={css('font-size:10px;font-weight:700;letter-spacing:0.08em;color:oklch(0.86 0.17 195);')}>⭐ AI INSIGHT</div>
          <div style={css('display:flex;align-items:center;gap:10px;')}>
            <RangePicker value={healthRangeDays} onChange={setHealthRangeDays} />
            <div
              onClick={() => { if (!healthInsightGenerating) generateHealthInsight(); }}
              style={css('font-size:10px;font-weight:700;letter-spacing:0.05em;padding:6px 12px;border-radius:6px;background:oklch(0.2 0.08 228);color:oklch(0.92 0.1 198);border:1px solid oklch(0.78 0.2 200);box-shadow:' + GLOW_STRONG + ';cursor:pointer;white-space:nowrap;')}
            >{healthInsightGenerating ? 'GENERATING…' : 'GENERATE'}</div>
          </div>
        </div>
        <div style={css('font-size:13.5px;line-height:1.55;color:oklch(0.7 0.025 228);')}>
          {healthInsightText || 'No insight yet — hit GENERATE to have AI look for real patterns across your sleep, nutrition, and health habits.'}
        </div>
      </div>

      {/* TOP ROW: sleep (left) + today's snapshot (right) */}
      <div style={css('display:flex;gap:16px;flex-wrap:wrap;')}>
        {/* TOP-LEFT: SLEEP */}
        <div className={CARD_CLASS} style={css(CARD + 'padding:22px;flex:1 1 380px;min-width:340px;display:flex;flex-direction:column;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;')}>
            <div style={css('font-size:14px;font-weight:800;letter-spacing:0.03em;')}>🌙 SLEEP</div>
            <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;color:oklch(0.5 0.025 228);')}>{healthRangeDays}-DAY AVERAGE</div>
          </div>
          {healthDataLoading ? (
            <div style={css('flex:1;display:flex;align-items:center;justify-content:center;color:oklch(0.5 0.025 228);font-size:11.5px;')}>Loading…</div>
          ) : (
            <div style={css('flex:1;display:flex;align-items:center;')}>
              <MacroRing label="HOURS SLEPT" value={sleepAvg} goal={8} unit="hrs" color="oklch(0.62 0.2 235)" size={84} />
            </div>
          )}
        </div>

        {/* TOP-RIGHT: today's macros + health habits */}
        <div className={CARD_CLASS} style={css(CARD + 'padding:22px;flex:1 1 380px;min-width:340px;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;')}>
            <div style={css('font-size:14px;font-weight:800;letter-spacing:0.03em;')}>📋 TODAY</div>
            <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;color:oklch(0.5 0.025 228);')}>vs. your goals</div>
          </div>
          <div style={css('font-size:9px;color:oklch(0.45 0.025 228);margin-bottom:16px;')}>
            Calories/protein/sugar vs. your personal goal · carbs/fat/fiber vs. general reference
          </div>
          <div style={css('display:grid;grid-template-columns:repeat(auto-fit, minmax(150px, 1fr));gap:10px;margin-bottom:18px;')}>
            {PRIORITY_MACROS.map((m) => (
              <MacroRing key={m.key} label={m.label} unit={m.unit} color={m.color} goal={healthGoals[m.goalKey]}
                value={latestDay ? latestDay[m.key] || 0 : 0} size={40} valueLabel="today" />
            ))}
            {SECONDARY_MACROS.map((m) => (
              <MacroRing key={m.key} label={m.label} unit={m.unit} color={m.color} goal={m.target}
                value={latestDay ? latestDay[m.key] || 0 : 0} size={40} valueLabel="today" />
            ))}
          </div>

          <div style={css('margin:0 0 14px;height:1px;background:oklch(0.28 0.06 232);')} />

          <div style={css('display:flex;align-items:center;justify-content:space-between;')}>
            <div style={css('font-size:11px;font-weight:700;letter-spacing:0.05em;color:oklch(0.62 0.03 228);')}>HEALTH HABITS</div>
            {latestHabitDay ? (
              <div style={css('display:flex;align-items:center;gap:10px;flex:1;margin-left:16px;')}>
                <div style={css('flex:1;height:8px;border-radius:4px;background:oklch(0.12 0.06 240);overflow:hidden;')}>
                  <div style={css(
                    'height:100%;border-radius:4px;background:oklch(0.58 0.18 204);box-shadow:' + GLOW_STRONG + ';width:' +
                    (latestHabitDay.health_habits_total > 0
                      ? Math.round((latestHabitDay.health_habits_completed / latestHabitDay.health_habits_total) * 100)
                      : 0) + '%;'
                  )} />
                </div>
                <div style={css('font-size:15px;font-weight:800;white-space:nowrap;')}>
                  {latestHabitDay.health_habits_completed}<span style={css('font-size:11px;font-weight:600;color:oklch(0.55 0.025 228);')}>/{latestHabitDay.health_habits_total}</span>
                </div>
              </div>
            ) : (
              <div style={css('color:oklch(0.5 0.025 228);font-size:11px;')}>None set up yet</div>
            )}
          </div>
        </div>
      </div>

      {/* MIDDLE: full nutrient averages, all rings now */}
      <div className={CARD_CLASS} style={css(CARD + 'padding:22px;')}>
        <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;')}>
          <div style={css('font-size:14px;font-weight:800;letter-spacing:0.03em;')}>🍽 NUTRITION</div>
          <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;color:oklch(0.5 0.025 228);')}>{healthRangeDays}-DAY AVERAGE</div>
        </div>
        <div style={css('font-size:9.5px;color:oklch(0.45 0.025 228);margin-bottom:18px;')}>
          Goals are estimates from your physique/workout goals, not medical advice.
        </div>

        {/* PRIORITY: calories, protein, sugar -- bigger rings, since these
            are the 3 macros Elo said matter most. */}
        <div style={css('display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;')}>
          {healthDataLoading ? (
            <div style={css('color:oklch(0.5 0.025 228);font-size:11.5px;')}>Loading…</div>
          ) : (
            PRIORITY_MACROS.map((m) => (
              <MacroRing key={m.key} label={m.label} unit={m.unit} color={m.color} goal={healthGoals[m.goalKey]}
                value={rangeAvg(m.key)} size={64} />
            ))
          )}
        </div>

        <div style={css('margin:22px 0 16px;height:1px;background:oklch(0.28 0.06 232);')} />

        <div style={css('font-size:11px;font-weight:700;letter-spacing:0.05em;color:oklch(0.55 0.025 228);margin-bottom:12px;')}>
          OTHER MACROS
        </div>
        <div style={css('display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:10px;')}>
          {healthDataLoading ? (
            <div style={css('color:oklch(0.5 0.025 228);font-size:11.5px;')}>Loading…</div>
          ) : (
            SECONDARY_MACROS.map((m) => (
              <MacroRing key={m.key} label={m.label} unit={m.unit} color={m.color} goal={m.target} value={rangeAvg(m.key)} />
            ))
          )}
        </div>
      </div>

      {/* BOTTOM: DAY BY DAY -- one skinny row per day: date, then macros,
          then sleep, then habits, left to right, per Elo's exact spec:
          "date---------macros---------sleep---------habits". */}
      <div className={CARD_CLASS} style={css(CARD + 'padding:16px;')}>
        <div style={css('font-size:10px;font-weight:700;letter-spacing:0.08em;color:oklch(0.55 0.025 228);margin-bottom:12px;')}>DAY BY DAY</div>
        {healthDataLoading ? (
          <div style={css('color:oklch(0.5 0.025 228);font-size:12.5px;padding:12px 0;')}>Loading…</div>
        ) : healthData.length === 0 ? (
          <div style={css('color:oklch(0.5 0.025 228);font-size:12.5px;padding:12px 0;')}>No data yet.</div>
        ) : (
          <div style={css('display:flex;flex-direction:column;')}>
            {[...healthData].reverse().map((d) => (
              <div key={d.date} style={css('display:flex;align-items:center;gap:14px;padding:9px 6px;border-bottom:1px solid oklch(0.28 0.06 232);')}>
                <div style={css('width:78px;flex-shrink:0;font-size:12px;font-weight:700;color:oklch(0.72 0.025 228);')}>{d.date}</div>
                <div style={css('flex:1;min-width:0;display:flex;flex-wrap:wrap;gap:6px;')}>
                  <MacroPill label="kcal" value={d.kcal} color="oklch(0.86 0.17 195 / 0.4)" />
                  {d.protein ? <MacroPill label="protein" value={Math.round(d.protein) + 'g'} color="oklch(0.7 0.18 150 / 0.4)" /> : null}
                  {d.carbs ? <MacroPill label="carbs" value={Math.round(d.carbs) + 'g'} color="oklch(0.75 0.16 90 / 0.4)" /> : null}
                  {d.fat ? <MacroPill label="fat" value={Math.round(d.fat) + 'g'} color="oklch(0.75 0.16 60 / 0.4)" /> : null}
                  {d.fiber ? <MacroPill label="fiber" value={Math.round(d.fiber) + 'g'} color="oklch(0.72 0.15 165 / 0.4)" /> : null}
                  {d.sugar ? <MacroPill label="sugar" value={Math.round(d.sugar) + 'g'} color="oklch(0.68 0.19 25 / 0.4)" /> : null}
                </div>
                <div style={css('width:82px;flex-shrink:0;text-align:right;font-size:11.5px;color:oklch(0.6 0.025 228);')}>
                  {d.sleep_hours != null ? d.sleep_hours + 'h sleep' : '—'}
                </div>
                <div style={css('width:64px;flex-shrink:0;text-align:right;font-size:11.5px;color:oklch(0.6 0.025 228);')}>
                  {d.health_habits_total > 0 ? d.health_habits_completed + '/' + d.health_habits_total : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
