import React from 'react';
import { css } from '../css';
import { CARD, CARD_CLASS, GLOW_STRONG } from '../theme';

const RANGE_OPTIONS = [7, 14, 30, 60, 90];

// Same technique as HomeTab's buildNetWorthPaths -- a smooth SVG line/area
// path over a fixed viewBox, just generalized to any numeric series (nulls
// allowed, drawn as gaps) instead of the hardcoded net-worth numbers.
function buildSparkline(values, cw = 260, ch = 64, padY = 6) {
  const known = values.filter((v) => v != null);
  if (known.length === 0) return null;
  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / Math.max(1, values.length - 1)) * cw,
    y: v == null ? null : padY + (1 - (v - min) / span) * (ch - padY * 2),
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
  return { lines, cw, ch };
}

function Sparkline({ values, color, height = 64 }) {
  const spark = buildSparkline(values, 260, height);
  if (!spark) {
    return (
      <div style={css('height:' + height + 'px;display:flex;align-items:center;justify-content:center;color:oklch(0.5 0.025 228);font-size:11.5px;')}>
        No data yet
      </div>
    );
  }
  return (
    <svg viewBox={`0 0 ${spark.cw} ${spark.ch}`} preserveAspectRatio="none" style={css('width:100%;height:' + height + 'px;display:block;filter:drop-shadow(0 0 5px ' + color + ' / 0.4);')}>
      {spark.lines.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      ))}
    </svg>
  );
}

// A full line graph + a boxed, large-font trend-stats row underneath (AVG /
// MIN / MAX over whatever range is currently selected) -- shared by SLEEP,
// CALORIES, and every macro so all of HEALTH's graphs read the same way,
// per Elo's request for bigger, more legible trend detail under each line
// graph rather than the small inline numbers the first pass used. The stats
// grid uses the "1px gap + matching background" trick for hairline dividers
// between cells instead of individual borders (cleaner corners with
// border-radius on the outer grid).
function MetricGraph({ label, values, unit, color, height = 90, decimals = 0 }) {
  const known = values.filter((v) => v != null);
  const latest = [...values].reverse().find((v) => v != null);
  const avg = known.length ? known.reduce((s, v) => s + v, 0) / known.length : null;
  const min = known.length ? Math.min(...known) : null;
  const max = known.length ? Math.max(...known) : null;
  const fmt = (v) => (v == null ? '—' : decimals ? v.toFixed(decimals) : Math.round(v));

  return (
    <div style={css('display:flex;flex-direction:column;gap:14px;')}>
      <div style={css('display:flex;align-items:baseline;justify-content:space-between;')}>
        <div style={css('font-size:12px;font-weight:700;letter-spacing:0.07em;color:oklch(0.62 0.03 228);')}>{label}</div>
        <div style={css('font-size:22px;font-weight:800;color:oklch(0.94 0.015 228);')}>
          {fmt(latest)}<span style={css('font-size:12px;font-weight:500;color:oklch(0.55 0.025 228);')}> {unit}</span>
        </div>
      </div>
      <Sparkline values={values} color={color} height={height} />
      <div style={css(
        'display:grid;grid-template-columns:repeat(3, 1fr);gap:1px;border-radius:10px;overflow:hidden;' +
        'background:oklch(0.32 0.07 222);border:1px solid oklch(0.32 0.07 222);'
      )}>
        {[['AVG', avg], ['MIN', min], ['MAX', max]].map(([lbl, val]) => (
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

// General adult reference intake per day, at a 2,000-kcal diet -- the same
// %DV baseline printed on every US nutrition label (FDA), not personalized
// advice. Used purely as a "how does today compare to a common reference"
// bar, labeled as such in the UI.
const MACRO_REFERENCE = [
  { key: 'protein', label: 'PROTEIN', unit: 'g', target: 50, color: 'oklch(0.7 0.18 150)' },
  { key: 'carbs', label: 'CARBS', unit: 'g', target: 275, color: 'oklch(0.75 0.16 90)' },
  { key: 'fat', label: 'FAT', unit: 'g', target: 78, color: 'oklch(0.75 0.16 60)' },
  { key: 'fiber', label: 'FIBER', unit: 'g', target: 28, color: 'oklch(0.72 0.15 165)' },
  { key: 'sugar', label: 'SUGAR', unit: 'g', target: 50, color: 'oklch(0.68 0.19 25)' },
];

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
}) {
  const sleepHours = healthData.map((d) => d.sleep_hours);
  const kcalSeries = healthData.map((d) => (d.kcal > 0 ? d.kcal : null));
  const latestHabitDay = [...healthData].reverse().find((d) => d.health_habits_total > 0);

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
        {/* SLEEP -- full line graph + boxed AVG/MIN/MAX trend details
            underneath, bigger font throughout (2026-08-25, per Elo: "line
            graphs for both sleep and nutrient, and trend details underneath
            the line graph... box the trend sections and make the font
            bigger"). */}
        <div className={CARD_CLASS} style={css(CARD + 'padding:22px;flex:2 1 380px;min-width:340px;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;')}>
            <div style={css('font-size:14px;font-weight:800;letter-spacing:0.03em;')}>🌙 SLEEP</div>
            <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;color:oklch(0.5 0.025 228);')}>{healthRangeDays}-DAY TREND</div>
          </div>
          {healthDataLoading ? (
            <div style={css('height:90px;display:flex;align-items:center;justify-content:center;color:oklch(0.5 0.025 228);font-size:11.5px;')}>Loading…</div>
          ) : (
            <MetricGraph label="HOURS SLEPT" values={sleepHours} unit="hrs" color="oklch(0.62 0.2 235)" height={90} decimals={1} />
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

        {/* NUTRITION -- calories as a full line graph + trend details, then
            today's macros vs. a general 2,000-kcal-diet reference (the same
            %DV baseline every US nutrition label uses, not personalized
            advice), then a full line graph + trend details per macro. Full
            width (its own row) since it now carries six graphs. */}
        <div className={CARD_CLASS} style={css(CARD + 'padding:22px;flex:1 1 100%;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;')}>
            <div style={css('font-size:14px;font-weight:800;letter-spacing:0.03em;')}>🍽 NUTRITION</div>
            <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;color:oklch(0.5 0.025 228);')}>{healthRangeDays}-DAY TREND</div>
          </div>

          {healthDataLoading ? (
            <div style={css('height:90px;display:flex;align-items:center;justify-content:center;color:oklch(0.5 0.025 228);font-size:11.5px;')}>Loading…</div>
          ) : (
            <MetricGraph label="CALORIES" values={kcalSeries} unit="kcal" color="oklch(0.86 0.17 195)" height={90} />
          )}

          <div style={css('margin:24px 0 16px;height:1px;background:oklch(0.28 0.06 232);')} />

          <div style={css('display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px;')}>
            <div style={css('font-size:13px;font-weight:800;letter-spacing:0.04em;color:oklch(0.75 0.02 228);')}>TODAY'S MACROS</div>
            <div style={css('font-size:10px;color:oklch(0.45 0.025 228);')}>vs. general 2,000-kcal reference</div>
          </div>
          <div style={css('display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px 28px;')}>
            {MACRO_REFERENCE.map((m) => (
              <MacroBar key={m.key} label={m.label} unit={m.unit} target={m.target} color={m.color}
                value={healthData.length ? healthData[healthData.length - 1][m.key] || 0 : 0} />
            ))}
          </div>

          <div style={css('margin:24px 0 16px;height:1px;background:oklch(0.28 0.06 232);')} />

          <div style={css('font-size:13px;font-weight:800;letter-spacing:0.04em;color:oklch(0.75 0.02 228);margin-bottom:18px;')}>
            MACRO TRENDS · {healthRangeDays}D
          </div>
          <div style={css('display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:20px 28px;')}>
            {healthDataLoading ? (
              <div style={css('color:oklch(0.5 0.025 228);font-size:11.5px;')}>Loading…</div>
            ) : (
              MACRO_REFERENCE.map((m) => (
                <MetricGraph key={m.key} label={m.label} unit={m.unit} color={m.color} height={64}
                  values={healthData.map((d) => (d[m.key] > 0 ? d[m.key] : null))} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* DAY BY DAY */}
      <div className={CARD_CLASS} style={css(CARD + 'padding:16px;')}>
        <div style={css('font-size:10px;font-weight:700;letter-spacing:0.08em;color:oklch(0.55 0.025 228);margin-bottom:12px;')}>DAY BY DAY</div>
        {healthDataLoading ? (
          <div style={css('color:oklch(0.5 0.025 228);font-size:12.5px;padding:12px 0;')}>Loading…</div>
        ) : healthData.length === 0 ? (
          <div style={css('color:oklch(0.5 0.025 228);font-size:12.5px;padding:12px 0;')}>No data yet.</div>
        ) : (
          <div style={css('display:flex;flex-direction:column;')}>
            {[...healthData].reverse().map((d) => (
              <div key={d.date} style={css('display:flex;align-items:center;gap:16px;padding:9px 4px;border-bottom:1px solid oklch(0.28 0.06 232);font-size:12.5px;')}>
                <div style={css('width:80px;flex-shrink:0;color:oklch(0.7 0.025 228);font-weight:600;')}>{d.date}</div>
                <div style={css('width:110px;flex-shrink:0;color:oklch(0.65 0.025 228);')}>{d.sleep_hours != null ? d.sleep_hours + 'h sleep' : 'no sleep data'}</div>
                <div style={css('flex:1;min-width:0;color:oklch(0.65 0.025 228);')}>
                  {d.kcal} kcal
                  {d.protein ? ' · ' + Math.round(d.protein) + 'g protein' : ''}
                  {d.carbs ? ' · ' + Math.round(d.carbs) + 'g carbs' : ''}
                  {d.fat ? ' · ' + Math.round(d.fat) + 'g fat' : ''}
                  {d.fiber ? ' · ' + Math.round(d.fiber) + 'g fiber' : ''}
                  {d.sugar ? ' · ' + Math.round(d.sugar) + 'g sugar' : ''}
                </div>
                <div style={css('width:80px;flex-shrink:0;text-align:right;color:oklch(0.65 0.025 228);')}>
                  {d.health_habits_total > 0 ? d.health_habits_completed + '/' + d.health_habits_total + ' habits' : '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
