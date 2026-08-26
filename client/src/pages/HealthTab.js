import React from 'react';
import { css } from '../css';
import { CARD, CARD_CLASS, GLOW_STRONG } from '../theme';

const RANGE_OPTIONS = [7, 14, 30, 60, 90];

// Same technique as HomeTab's FINANCE PULSE chart (buildNetWorthPaths) --
// Elo asked for HEALTH's graphs to match that look directly ("use that
// prototype to build the graph"): a smooth line PLUS a gradient-filled area
// underneath it, not just a bare stroke. Generalized here to any numeric
// series (nulls allowed, drawn as gaps -- FINANCE PULSE's data has no gaps
// so it never needed this) and returns one area/line path PER contiguous
// segment instead of assuming the whole series is unbroken.
// Zero-line fallback (2026-08-26): when there's no real data yet, instead of
// an empty "No data yet" placeholder, draw a flat line at 0 so the graph
// still exists and reconstructs itself the moment real data lands.
// `extraScaleValues` lets goal/average reference lines widen the y-axis so
// they're never clipped even when actual data doesn't reach that high yet.
// The y-axis floor is always 0 (calories/grams/hours are never negative).
function buildSparkline(values, cw = 260, ch = 64, padY = 6, extraScaleValues = []) {
  const known = values.filter((v) => v != null);
  const hasData = known.length > 0;
  const scaleSource = [...(hasData ? known : [0]), ...extraScaleValues.filter((v) => v != null)];
  const max = Math.max(...scaleSource, 1);
  const toY = (v) => padY + (1 - v / max) * (ch - padY * 2);

  const series = hasData ? values : values.map(() => 0);
  const pts = series.map((v, i) => ({
    x: (i / Math.max(1, series.length - 1)) * cw,
    y: v == null ? null : toY(v),
  }));

  const segments = [];
  let current = [];
  pts.forEach((p) => {
    if (p.y == null) {
      if (current.length) segments.push(current);
      current = [];
    } else {
      current.push(p);
    }
  });
  if (current.length) segments.push(current);

  const buildCurve = (seg) => {
    let d = `M ${seg[0].x.toFixed(1)},${seg[0].y.toFixed(1)}`;
    for (let i = 0; i < seg.length - 1; i++) {
      const p0 = seg[i], p1 = seg[i + 1];
      const cpX = (p0.x + p1.x) / 2;
      d += ` C ${cpX.toFixed(1)},${p0.y.toFixed(1)} ${cpX.toFixed(1)},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
    }
    return d;
  };
  const lines = segments.map(buildCurve);
  const areas = segments.map((seg, i) => `${lines[i]} L ${seg[seg.length - 1].x.toFixed(1)},${ch} L ${seg[0].x.toFixed(1)},${ch} Z`);

  return { lines, areas, cw, ch, toY, hasData, max };
}

// Compact date label, e.g. "2026-08-19" -> "8/19" -- used for the x-axis
// start/end labels, no year needed at this scale.
function shortDate(iso) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
}

// `refLines`: [{ value, color, label }] -- drawn as dashed horizontal lines
// across the chart using the SAME y-scale as the data line (via buildSparkline's
// `toY`), so "GOAL" and "AVG" lines sit at their true relative position even
// when they're above or below the data's own range.
// `showAxis` (2026-08-26, per Elo: "lines that indicate the units x and y
// axis") adds a real y-axis (top/bottom scale labels, right-aligned so they
// don't collide with GOAL/AVG's left-aligned labels) and an x-axis (date
// range, rendered as plain HTML below the chart rather than inside the SVG
// -- keeps the SVG's viewBox math simple and the text crisp at any width).
let sparklineIdCounter = 0;
function Sparkline({ values, color, height = 64, refLines = [], showAxis = false, dates = [], unit = '' }) {
  const gradId = React.useMemo(() => 'healthGrad' + (sparklineIdCounter += 1), []);
  const extraScaleValues = refLines.map((r) => r.value);
  const spark = buildSparkline(values, 260, height, 6, extraScaleValues);
  return (
    <div>
      <svg viewBox={`0 0 ${spark.cw} ${spark.ch}`} preserveAspectRatio="none" style={css('width:100%;height:' + height + 'px;display:block;overflow:visible;filter:drop-shadow(0 0 5px ' + color + ' / 0.4);')}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {showAxis && (
          <line x1="0" y1={spark.ch - 0.5} x2={spark.cw} y2={spark.ch - 0.5} stroke="oklch(0.4 0.03 228)" strokeWidth="1" opacity="0.5" />
        )}
        {spark.areas.map((d, i) => (
          <path key={'a' + i} d={d} fill={`url(#${gradId})`} stroke="none" opacity={spark.hasData ? 1 : 0.35} />
        ))}
        {refLines.map((r, i) => r.value != null && (
          <g key={i}>
            <line x1="0" y1={spark.toY(r.value)} x2={spark.cw} y2={spark.toY(r.value)}
              stroke={r.color} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.65" />
            {/* GOAL and AVG lines are frequently close in value (e.g. a sugar
                limit of 50g vs. an actual average of 44g) -- putting both
                labels on the same side of their own line collided when the
                lines landed within ~10px of each other. GOAL always labels
                ABOVE its line, AVG always labels BELOW, so they stay legible
                regardless of how close the two values are. */}
            <text x="2" y={spark.toY(r.value) + (r.labelBelow ? 11 : -4)} fontSize="8.5" fontWeight="700" fill={r.color} opacity="0.9">{r.label}</text>
          </g>
        ))}
        {spark.lines.map((d, i) => (
          <path key={'l' + i} d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={spark.hasData ? 1 : 0.35} />
        ))}
        {showAxis && (
          <>
            <text x={spark.cw - 2} y="8" textAnchor="end" fontSize="8" fontWeight="600" fill="oklch(0.5 0.025 228)">{Math.round(spark.max)}{unit}</text>
            <text x={spark.cw - 2} y={spark.ch - 2} textAnchor="end" fontSize="8" fontWeight="600" fill="oklch(0.5 0.025 228)">0</text>
          </>
        )}
      </svg>
      {showAxis && dates.length > 1 && (
        <div style={css('display:flex;justify-content:space-between;margin-top:4px;font-size:8.5px;font-weight:600;color:oklch(0.45 0.025 228);')}>
          <span>{shortDate(dates[0])}</span>
          <span>{shortDate(dates[dates.length - 1])}</span>
        </div>
      )}
    </div>
  );
}

// A full line graph + a boxed AVG/GOAL row underneath, shared by SLEEP,
// CALORIES, PROTEIN, and SUGAR -- the 4 metrics that still use a full trend
// graph (OTHER MACROS moved to MacroRing below).
function MetricGraph({ label, values, unit, color, height = 90, decimals = 0, goal, showRefLines = false, dates = [] }) {
  const known = values.filter((v) => v != null);
  const latest = [...values].reverse().find((v) => v != null);
  const avg = known.length ? known.reduce((s, v) => s + v, 0) / known.length : null;
  const fmt = (v) => (v == null ? '—' : decimals ? v.toFixed(decimals) : Math.round(v));

  // GOAL is always shown dashed on the graph when a goal exists, even
  // without the full showRefLines treatment (2026-08-26, per Elo: "a dash
  // line for the goal line" applies to SLEEP too, not just the 3 priority
  // macros -- AVG stays exclusive to showRefLines since it's the heavier of
  // the two lines to add).
  const refLines = [
    goal != null ? { value: goal, color: 'oklch(0.86 0.17 195)', label: 'GOAL' } : null,
    showRefLines && avg != null ? { value: avg, color: 'oklch(0.65 0.02 228)', label: 'AVG', labelBelow: true } : null,
  ].filter(Boolean);

  return (
    <div style={css('display:flex;flex-direction:column;gap:14px;')}>
      <div style={css('display:flex;align-items:baseline;justify-content:space-between;')}>
        <div style={css('font-size:12px;font-weight:700;letter-spacing:0.07em;color:oklch(0.62 0.03 228);')}>{label}</div>
        <div style={css('font-size:22px;font-weight:800;color:oklch(0.94 0.015 228);')}>
          {fmt(latest)}<span style={css('font-size:12px;font-weight:500;color:oklch(0.55 0.025 228);')}> {unit}</span>
        </div>
      </div>
      <Sparkline values={values} color={color} height={height} refLines={refLines}
        showAxis dates={dates} unit={unit} />
      <div style={css(
        'display:grid;grid-template-columns:repeat(2, 1fr);gap:1px;border-radius:10px;overflow:hidden;' +
        'background:oklch(0.32 0.07 222);border:1px solid oklch(0.32 0.07 222);'
      )}>
        {[['AVG', avg], ['GOAL', goal]].map(([lbl, val]) => (
          <div key={lbl} style={css('background:oklch(0.105 0.05 238);padding:12px 8px;text-align:center;')}>
            <div style={css('font-size:9.5px;font-weight:700;letter-spacing:0.08em;color:oklch(0.5 0.025 228);margin-bottom:6px;')}>{lbl}</div>
            <div style={css('font-size:19px;font-weight:800;color:oklch(0.9 0.02 228);')}>
              {fmt(val)}<span style={css('font-size:10px;font-weight:500;color:oklch(0.5 0.025 228);')}>{val != null ? unit : ''}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Wraps one macro's MetricGraph in its own bordered box -- Elo: "box
// different macros together in the macro's trend so it is easier to read
// each category."
function TrendBox({ children }) {
  return (
    <div style={css('padding:16px;border-radius:12px;background:oklch(0.11 0.05 236);border:1px solid oklch(0.28 0.06 232);')}>
      {children}
    </div>
  );
}

// Glowing progress ring for OTHER MACROS (carbs/fat/fiber) -- Elo: "I want
// other macros average to be like habits section glowing circle that shows
// how close it get's to the goal, and on the right side of the circle shows
// goal amounts." Exact same technique as HOME's habit "Daily score" ring
// (HomeTab.js: r=26, circumference = 2*PI*r, rotated -90deg so the fill
// starts at 12 o'clock, strokeDashoffset driving the fill amount, a glow
// drop-shadow on the filled arc) -- replaces the OTHER MACROS section's
// small line-graph boxes entirely, since a ring reads faster for "how close
// to goal" than a trend line does for a secondary metric. Shows the
// RANGE AVERAGE (not just today), matching Elo's own wording ("other
// macros average").
function MacroRing({ label, avg, goal, unit, color }) {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const pct = goal > 0 && avg != null ? Math.min(100, Math.round((avg / goal) * 100)) : 0;
  return (
    <div style={css('display:flex;align-items:center;gap:14px;padding:14px;border-radius:12px;background:oklch(0.11 0.05 236);border:1px solid oklch(0.28 0.06 232);')}>
      <svg width="48" height="48" viewBox="0 0 64 64" style={css('flex-shrink:0;transform:rotate(-90deg);')}>
        <circle cx="32" cy="32" r={r} fill="none" stroke={color.replace(')', ' / 0.22)')} strokeWidth="7" />
        <circle
          cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={circumference.toFixed(2)}
          strokeDashoffset={(circumference * (1 - pct / 100)).toFixed(2)}
          style={css('filter:drop-shadow(0 0 5px ' + color.replace(')', ' / 0.55)') + ');transition:stroke-dashoffset 0.4s ease;')}
        />
      </svg>
      <div style={css('flex:1;min-width:0;')}>
        <div style={css('font-size:10.5px;font-weight:700;letter-spacing:0.06em;color:oklch(0.62 0.03 228);margin-bottom:3px;')}>{label}</div>
        <div style={css('font-size:17px;font-weight:800;line-height:1;')}>
          {avg != null ? Math.round(avg) : '—'}<span style={css('font-size:10px;font-weight:500;color:oklch(0.55 0.025 228);')}> {unit} avg</span>
        </div>
      </div>
      <div style={css('text-align:right;flex-shrink:0;padding-left:10px;border-left:1px solid oklch(0.28 0.06 232);')}>
        <div style={css('font-size:8px;font-weight:700;letter-spacing:0.07em;color:oklch(0.5 0.025 228);margin-bottom:2px;')}>GOAL</div>
        <div style={css('font-size:14px;font-weight:800;color:oklch(0.85 0.02 228);')}>{goal}{unit}</div>
      </div>
    </div>
  );
}

// General adult reference intake per day, at a 2,000-kcal diet -- the same
// %DV baseline printed on every US nutrition label (FDA), not personalized
// advice. Used as the fallback target for CARBS/FAT/FIBER (Elo didn't ask
// for personalized goals on those, only calories/protein/sugar) and as the
// starting default for protein/sugar until healthGoals loads.
const MACRO_REFERENCE = [
  { key: 'protein', label: 'PROTEIN', unit: 'g', target: 50, color: 'oklch(0.7 0.18 150)' },
  { key: 'carbs', label: 'CARBS', unit: 'g', target: 275, color: 'oklch(0.75 0.16 90)' },
  { key: 'fat', label: 'FAT', unit: 'g', target: 78, color: 'oklch(0.75 0.16 60)' },
  { key: 'fiber', label: 'FIBER', unit: 'g', target: 28, color: 'oklch(0.72 0.15 165)' },
  { key: 'sugar', label: 'SUGAR', unit: 'g', target: 50, color: 'oklch(0.68 0.19 25)' },
];
const SECONDARY_MACROS = MACRO_REFERENCE.filter((m) => m.key === 'carbs' || m.key === 'fat' || m.key === 'fiber');

function MacroBar({ label, value, unit, target, color }) {
  const pct = target > 0 ? Math.round((value / target) * 100) : 0;
  const fillPct = Math.min(100, pct);
  return (
    <div style={css('display:flex;flex-direction:column;gap:5px;')}>
      <div style={css('display:flex;align-items:baseline;justify-content:space-between;')}>
        <div style={css('font-size:9px;font-weight:700;letter-spacing:0.07em;color:oklch(0.55 0.025 228);')}>{label}</div>
        <div style={css('font-size:11.5px;color:oklch(0.75 0.02 228);')}>
          <span style={css('font-weight:700;color:oklch(0.92 0.015 228);')}>{Math.round(value)}{unit}</span>
          <span style={css('color:oklch(0.5 0.025 228);')}> / {target}{unit}</span>
        </div>
      </div>
      <div style={css('height:6px;border-radius:3px;background:oklch(0.12 0.06 240);overflow:hidden;')}>
        <div style={css('height:100%;border-radius:3px;background:' + color + ';width:' + fillPct + '%;transition:width 0.3s ease;')} />
      </div>
    </div>
  );
}

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
// full nutrient trend graphs, bottom = DAY BY DAY. HEALTH HABITS folded into
// the top-right zone alongside TODAY'S MACROS (Claude's call, since Elo said
// "move it somewhere else unless you have a recommendation") -- both are
// glanceable "right now" stats, so they read naturally as one group, and it
// keeps top-left purely about sleep.
export default function HealthTab({
  healthData, healthDataLoading, healthRangeDays, setHealthRangeDays,
  healthInsightText, healthInsightGenerating, generateHealthInsight,
  healthGoals,
}) {
  const dateSeries = healthData.map((d) => d.date);
  const sleepHours = healthData.map((d) => d.sleep_hours);
  const kcalSeries = healthData.map((d) => (d.kcal > 0 ? d.kcal : null));
  const proteinSeries = healthData.map((d) => (d.protein > 0 ? d.protein : null));
  const sugarSeries = healthData.map((d) => (d.sugar > 0 ? d.sugar : null));
  const latestHabitDay = [...healthData].reverse().find((d) => d.health_habits_total > 0);
  const latestDay = healthData.length ? healthData[healthData.length - 1] : null;

  // Range averages for OTHER MACROS' rings (carbs/fat/fiber) -- "average"
  // specifically, per Elo's wording, not today's single value.
  const rangeAvg = (key) => {
    const known = healthData.map((d) => d[key]).filter((v) => v > 0);
    return known.length ? known.reduce((s, v) => s + v, 0) / known.length : null;
  };

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
        <div className={CARD_CLASS} style={css(CARD + 'padding:22px;flex:1 1 380px;min-width:340px;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;')}>
            <div style={css('font-size:14px;font-weight:800;letter-spacing:0.03em;')}>🌙 SLEEP</div>
            <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;color:oklch(0.5 0.025 228);')}>{healthRangeDays}-DAY TREND</div>
          </div>
          {healthDataLoading ? (
            <div style={css('height:90px;display:flex;align-items:center;justify-content:center;color:oklch(0.5 0.025 228);font-size:11.5px;')}>Loading…</div>
          ) : (
            <MetricGraph label="HOURS SLEPT" values={sleepHours} unit="hrs" color="oklch(0.62 0.2 235)" height={90} decimals={1} goal={8} showRefLines dates={dateSeries} />
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
          <div style={css('display:grid;grid-template-columns:repeat(2, 1fr);gap:12px 20px;margin-bottom:18px;')}>
            <MacroBar label="CALORIES" unit=" kcal" target={healthGoals.calorieGoal} color="oklch(0.86 0.17 195)"
              value={latestDay ? latestDay.kcal || 0 : 0} />
            {MACRO_REFERENCE.map((m) => {
              const target = m.key === 'protein' ? healthGoals.proteinGoal : m.key === 'sugar' ? healthGoals.sugarGoal : m.target;
              return (
                <MacroBar key={m.key} label={m.label} unit={m.unit} target={target} color={m.color}
                  value={latestDay ? latestDay[m.key] || 0 : 0} />
              );
            })}
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

      {/* MIDDLE: full nutrient trend graphs */}
      <div className={CARD_CLASS} style={css(CARD + 'padding:22px;')}>
        <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;')}>
          <div style={css('font-size:14px;font-weight:800;letter-spacing:0.03em;')}>🍽 NUTRITION</div>
          <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;color:oklch(0.5 0.025 228);')}>{healthRangeDays}-DAY TREND</div>
        </div>
        <div style={css('font-size:9.5px;color:oklch(0.45 0.025 228);margin-bottom:18px;')}>
          Goals are estimates from your physique/workout goals, not medical advice.
        </div>

        {/* PRIORITY: calories, protein, sugar -- the 3 macros Elo said
            matter most. Each gets its personalized goal + the current
            average drawn directly on the graph as reference lines. */}
        <div style={css('display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;')}>
          {healthDataLoading ? (
            <div style={css('color:oklch(0.5 0.025 228);font-size:11.5px;')}>Loading…</div>
          ) : (
            <>
              <TrendBox>
                <MetricGraph label="CALORIES" values={kcalSeries} unit="kcal" color="oklch(0.86 0.17 195)"
                  height={76} goal={healthGoals.calorieGoal} showRefLines dates={dateSeries} />
              </TrendBox>
              <TrendBox>
                <MetricGraph label="PROTEIN" values={proteinSeries} unit="g" color="oklch(0.7 0.18 150)"
                  height={76} goal={healthGoals.proteinGoal} showRefLines dates={dateSeries} />
              </TrendBox>
              <TrendBox>
                <MetricGraph label="SUGAR" values={sugarSeries} unit="g" color="oklch(0.68 0.19 25)"
                  height={76} goal={healthGoals.sugarGoal} showRefLines dates={dateSeries} />
              </TrendBox>
            </>
          )}
        </div>

        <div style={css('margin:22px 0 16px;height:1px;background:oklch(0.28 0.06 232);')} />

        <div style={css('font-size:11px;font-weight:700;letter-spacing:0.05em;color:oklch(0.55 0.025 228);margin-bottom:12px;')}>
          OTHER MACROS · {healthRangeDays}D AVERAGE
        </div>
        <div style={css('display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:10px;')}>
          {healthDataLoading ? (
            <div style={css('color:oklch(0.5 0.025 228);font-size:11.5px;')}>Loading…</div>
          ) : (
            SECONDARY_MACROS.map((m) => (
              <MacroRing key={m.key} label={m.label} unit={m.unit} color={m.color} goal={m.target} avg={rangeAvg(m.key)} />
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
