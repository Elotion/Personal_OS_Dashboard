import React from 'react';
import { css } from '../css';
import { CARD, CARD_CLASS, GLOW_STRONG } from '../theme';

const RANGE_OPTIONS = [7, 14, 30, 60, 90];

// Same technique as HomeTab's buildNetWorthPaths -- a smooth SVG line/area
// path over a fixed viewBox, generalized to any numeric series (nulls
// allowed, drawn as gaps). Rebuilt (2026-08-26) with two changes Elo asked
// for: (1) a zero-line fallback -- when there's no real data yet, instead of
// an empty "No data yet" placeholder, draw a flat line at 0 so the graph
// still exists and reconstructs itself the moment real data lands, rather
// than flipping between two different UI states; (2) `extraScaleValues` lets
// a caller (goal/average reference lines) widen the y-axis scale so those
// reference lines are never clipped even when actual data doesn't reach that
// high yet. The y-axis floor is always 0 (calories/grams/hours are never
// negative), not a data-driven min, so a flat zero-line reads as "the true
// bottom of the chart," not an arbitrary crop.
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

  const lines = segments.map((seg) => {
    let d = `M ${seg[0].x.toFixed(1)},${seg[0].y.toFixed(1)}`;
    for (let i = 0; i < seg.length - 1; i++) {
      const p0 = seg[i], p1 = seg[i + 1];
      const cpX = (p0.x + p1.x) / 2;
      d += ` C ${cpX.toFixed(1)},${p0.y.toFixed(1)} ${cpX.toFixed(1)},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
    }
    return d;
  });
  return { lines, cw, ch, toY, hasData };
}

// `refLines`: [{ value, color, label }] -- drawn as dashed horizontal lines
// across the chart using the SAME y-scale as the data line (via buildSparkline's
// `toY`), so "GOAL" and "AVG" lines sit at their true relative position even
// when they're above or below the data's own range.
function Sparkline({ values, color, height = 64, refLines = [] }) {
  const extraScaleValues = refLines.map((r) => r.value);
  const spark = buildSparkline(values, 260, height, 6, extraScaleValues);
  return (
    <svg viewBox={`0 0 ${spark.cw} ${spark.ch}`} preserveAspectRatio="none" style={css('width:100%;height:' + height + 'px;display:block;overflow:visible;filter:drop-shadow(0 0 5px ' + color + ' / 0.4);')}>
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
        <path key={i} d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity={spark.hasData ? 1 : 0.35} />
      ))}
    </svg>
  );
}

// A full line graph + a boxed, large-font AVG/GOAL row underneath, shared by
// SLEEP, CALORIES, and every macro. Rebuilt (2026-08-26) per Elo's feedback:
// MIN/MAX dropped in favor of AVG + GOAL ("min and max is not that important,
// I would rather you show the average and the goal to hit"). When
// `showRefLines` is on (used for the 3 macros Elo said matter most --
// calories, protein, sugar), the GOAL and AVG values are also drawn directly
// on the line graph itself as dashed reference lines, not just in the box
// below.
function MetricGraph({ label, values, unit, color, height = 90, decimals = 0, goal, showRefLines = false }) {
  const known = values.filter((v) => v != null);
  const latest = [...values].reverse().find((v) => v != null);
  const avg = known.length ? known.reduce((s, v) => s + v, 0) / known.length : null;
  const fmt = (v) => (v == null ? '—' : decimals ? v.toFixed(decimals) : Math.round(v));

  const refLines = showRefLines
    ? [
        goal != null ? { value: goal, color: 'oklch(0.86 0.17 195)', label: 'GOAL' } : null,
        avg != null ? { value: avg, color: 'oklch(0.65 0.02 228)', label: 'AVG', labelBelow: true } : null,
      ].filter(Boolean)
    : [];

  return (
    <div style={css('display:flex;flex-direction:column;gap:14px;')}>
      <div style={css('display:flex;align-items:baseline;justify-content:space-between;')}>
        <div style={css('font-size:12px;font-weight:700;letter-spacing:0.07em;color:oklch(0.62 0.03 228);')}>{label}</div>
        <div style={css('font-size:22px;font-weight:800;color:oklch(0.94 0.015 228);')}>
          {fmt(latest)}<span style={css('font-size:12px;font-weight:500;color:oklch(0.55 0.025 228);')}> {unit}</span>
        </div>
      </div>
      <Sparkline values={values} color={color} height={height} refLines={refLines} />
      <div style={css(
        'display:grid;grid-template-columns:repeat(2, 1fr);gap:1px;border-radius:10px;overflow:hidden;' +
        'background:oklch(0.32 0.07 222);border:1px solid oklch(0.32 0.07 222);'
      )}>
        {[['AVG', avg], ['GOAL', goal]].map(([lbl, val]) => (
          <div key={lbl} style={css('background:oklch(0.105 0.05 238);padding:12px 8px;text-align:center;')}>
            <div style={css('font-size:9.5px;font-weight:700;letter-spacing:0.09em;color:oklch(0.5 0.025 228);margin-bottom:6px;')}>{lbl}</div>
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
// each category" (previously they were bare grid items with no visual
// separation from each other).
function TrendBox({ children }) {
  return (
    <div style={css('padding:16px;border-radius:12px;background:oklch(0.11 0.05 236);border:1px solid oklch(0.28 0.06 232);')}>
      {children}
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

// Small labeled pill for one macro value in a DAY BY DAY row -- replaces the
// old " · "-joined run-on string ("2510 kcal · 114g protein · 313g carbs...")
// that Elo said read as "cluttered... all the words and numbers messed up
// together." Each value now gets its own spaced, color-coded chip.
function MacroPill({ label, value, color }) {
  return (
    <div style={css(
      'display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;' +
      'background:oklch(0.14 0.06 236);border:1px solid ' + color + ';'
    )}>
      <span style={css('font-size:11.5px;font-weight:700;color:oklch(0.9 0.02 228);')}>{value}</span>
      <span style={css('font-size:9px;font-weight:600;letter-spacing:0.03em;color:oklch(0.55 0.025 228);')}>{label}</span>
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
export default function HealthTab({
  healthData, healthDataLoading, healthRangeDays, setHealthRangeDays,
  healthInsightText, healthInsightGenerating, generateHealthInsight,
  healthGoals,
}) {
  const sleepHours = healthData.map((d) => d.sleep_hours);
  const kcalSeries = healthData.map((d) => (d.kcal > 0 ? d.kcal : null));
  const proteinSeries = healthData.map((d) => (d.protein > 0 ? d.protein : null));
  const sugarSeries = healthData.map((d) => (d.sugar > 0 ? d.sugar : null));
  const latestHabitDay = [...healthData].reverse().find((d) => d.health_habits_total > 0);
  const latestDay = healthData.length ? healthData[healthData.length - 1] : null;

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

      <div style={css('display:flex;gap:16px;flex-wrap:wrap;')}>
        {/* SLEEP */}
        <div className={CARD_CLASS} style={css(CARD + 'padding:22px;flex:2 1 380px;min-width:340px;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;')}>
            <div style={css('font-size:14px;font-weight:800;letter-spacing:0.03em;')}>🌙 SLEEP</div>
            <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;color:oklch(0.5 0.025 228);')}>{healthRangeDays}-DAY TREND</div>
          </div>
          {healthDataLoading ? (
            <div style={css('height:90px;display:flex;align-items:center;justify-content:center;color:oklch(0.5 0.025 228);font-size:11.5px;')}>Loading…</div>
          ) : (
            <MetricGraph label="HOURS SLEPT" values={sleepHours} unit="hrs" color="oklch(0.62 0.2 235)" height={90} decimals={1} goal={8} />
          )}
        </div>

        {/* HEALTH HABITS */}
        <div className={CARD_CLASS} style={css(CARD + 'padding:22px;flex:1 1 220px;min-width:200px;')}>
          <div style={css('font-size:14px;font-weight:800;letter-spacing:0.03em;margin-bottom:18px;')}>HEALTH HABITS</div>
          {latestHabitDay ? (
            <div style={css('display:flex;flex-direction:column;gap:12px;')}>
              <div style={css('font-size:30px;font-weight:800;')}>
                {latestHabitDay.health_habits_completed}<span style={css('font-size:16px;font-weight:600;color:oklch(0.55 0.025 228);')}>/{latestHabitDay.health_habits_total}</span>
              </div>
              <div style={css('height:8px;border-radius:4px;background:oklch(0.12 0.06 240);overflow:hidden;')}>
                <div style={css(
                  'height:100%;border-radius:4px;background:oklch(0.58 0.18 204);box-shadow:' + GLOW_STRONG + ';width:' +
                  (latestHabitDay.health_habits_total > 0
                    ? Math.round((latestHabitDay.health_habits_completed / latestHabitDay.health_habits_total) * 100)
                    : 0) + '%;'
                )} />
              </div>
              <div style={css('font-size:12px;color:oklch(0.55 0.025 228);')}>completed today</div>
            </div>
          ) : (
            <div style={css('color:oklch(0.5 0.025 228);font-size:11.5px;')}>No HEALTH-entity habits set up yet.</div>
          )}
        </div>

        {/* NUTRITION */}
        <div className={CARD_CLASS} style={css(CARD + 'padding:22px;flex:1 1 100%;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;')}>
            <div style={css('font-size:14px;font-weight:800;letter-spacing:0.03em;')}>🍽 NUTRITION</div>
            <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;color:oklch(0.5 0.025 228);')}>{healthRangeDays}-DAY TREND</div>
          </div>
          <div style={css('font-size:9.5px;color:oklch(0.45 0.025 228);margin-bottom:18px;')}>
            Goals below are estimates from your physique/workout goals, not medical advice.
          </div>

          {/* PRIORITY: calories, protein, sugar -- the 3 macros Elo said
              matter most ("the most important macros i care about are
              calories, proteins, and sugar"). Each gets its personalized
              goal + the current average drawn directly on the graph as
              reference lines, not just in the stat box below. */}
          <div style={css('display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:16px;')}>
            {healthDataLoading ? (
              <div style={css('color:oklch(0.5 0.025 228);font-size:11.5px;')}>Loading…</div>
            ) : (
              <>
                <TrendBox>
                  <MetricGraph label="CALORIES" values={kcalSeries} unit="kcal" color="oklch(0.86 0.17 195)"
                    height={76} goal={healthGoals.calorieGoal} showRefLines />
                </TrendBox>
                <TrendBox>
                  <MetricGraph label="PROTEIN" values={proteinSeries} unit="g" color="oklch(0.7 0.18 150)"
                    height={76} goal={healthGoals.proteinGoal} showRefLines />
                </TrendBox>
                <TrendBox>
                  <MetricGraph label="SUGAR" values={sugarSeries} unit="g" color="oklch(0.68 0.19 25)"
                    height={76} goal={healthGoals.sugarGoal} showRefLines />
                </TrendBox>
              </>
            )}
          </div>

          <div style={css('margin:24px 0 16px;height:1px;background:oklch(0.28 0.06 232);')} />

          <div style={css('display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px;')}>
            <div style={css('font-size:13px;font-weight:800;letter-spacing:0.04em;color:oklch(0.75 0.02 228);')}>TODAY'S MACROS</div>
            <div style={css('font-size:10px;color:oklch(0.45 0.025 228);')}>protein/sugar vs. your goal, carbs/fat/fiber vs. general reference</div>
          </div>
          <div style={css('display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px 28px;')}>
            {MACRO_REFERENCE.map((m) => {
              const target = m.key === 'protein' ? healthGoals.proteinGoal : m.key === 'sugar' ? healthGoals.sugarGoal : m.target;
              return (
                <MacroBar key={m.key} label={m.label} unit={m.unit} target={target} color={m.color}
                  value={latestDay ? latestDay[m.key] || 0 : 0} />
              );
            })}
          </div>

          <div style={css('margin:24px 0 16px;height:1px;background:oklch(0.28 0.06 232);')} />

          <div style={css('font-size:13px;font-weight:800;letter-spacing:0.04em;color:oklch(0.75 0.02 228);margin-bottom:18px;')}>
            OTHER MACROS · {healthRangeDays}D
          </div>
          <div style={css('display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:16px;')}>
            {healthDataLoading ? (
              <div style={css('color:oklch(0.5 0.025 228);font-size:11.5px;')}>Loading…</div>
            ) : (
              SECONDARY_MACROS.map((m) => (
                <TrendBox key={m.key}>
                  <MetricGraph label={m.label} unit={m.unit} color={m.color} height={56} goal={m.target}
                    values={healthData.map((d) => (d[m.key] > 0 ? d[m.key] : null))} />
                </TrendBox>
              ))
            )}
          </div>
        </div>
      </div>

      {/* DAY BY DAY -- rebuilt (2026-08-26) as spaced, color-coded pills per
          macro instead of one run-on " · "-joined string, per Elo: "space
          out the day by day display of macros, it is too cluttered, all
          the words and numbers are messed up together." */}
      <div className={CARD_CLASS} style={css(CARD + 'padding:16px;')}>
        <div style={css('font-size:10px;font-weight:700;letter-spacing:0.08em;color:oklch(0.55 0.025 228);margin-bottom:12px;')}>DAY BY DAY</div>
        {healthDataLoading ? (
          <div style={css('color:oklch(0.5 0.025 228);font-size:12.5px;padding:12px 0;')}>Loading…</div>
        ) : healthData.length === 0 ? (
          <div style={css('color:oklch(0.5 0.025 228);font-size:12.5px;padding:12px 0;')}>No data yet.</div>
        ) : (
          <div style={css('display:flex;flex-direction:column;')}>
            {[...healthData].reverse().map((d) => (
              <div key={d.date} style={css('display:flex;flex-direction:column;gap:10px;padding:14px 6px;border-bottom:1px solid oklch(0.28 0.06 232);')}>
                <div style={css('display:flex;align-items:center;justify-content:space-between;')}>
                  <div style={css('font-size:13px;font-weight:700;color:oklch(0.78 0.025 228);')}>{d.date}</div>
                  <div style={css('font-size:11.5px;color:oklch(0.55 0.025 228);')}>
                    {d.sleep_hours != null ? d.sleep_hours + 'h sleep' : 'no sleep data'}
                    {'   '}
                    {d.health_habits_total > 0 ? d.health_habits_completed + '/' + d.health_habits_total + ' habits' : '—'}
                  </div>
                </div>
                <div style={css('display:flex;flex-wrap:wrap;gap:8px;')}>
                  <MacroPill label="kcal" value={d.kcal} color="oklch(0.86 0.17 195 / 0.4)" />
                  {d.protein ? <MacroPill label="protein" value={Math.round(d.protein) + 'g'} color="oklch(0.7 0.18 150 / 0.4)" /> : null}
                  {d.carbs ? <MacroPill label="carbs" value={Math.round(d.carbs) + 'g'} color="oklch(0.75 0.16 90 / 0.4)" /> : null}
                  {d.fat ? <MacroPill label="fat" value={Math.round(d.fat) + 'g'} color="oklch(0.75 0.16 60 / 0.4)" /> : null}
                  {d.fiber ? <MacroPill label="fiber" value={Math.round(d.fiber) + 'g'} color="oklch(0.72 0.15 165 / 0.4)" /> : null}
                  {d.sugar ? <MacroPill label="sugar" value={Math.round(d.sugar) + 'g'} color="oklch(0.68 0.19 25 / 0.4)" /> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
