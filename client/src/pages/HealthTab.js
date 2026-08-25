import React from 'react';
import { css } from '../css';
import { CARD, GLOW_STRONG } from '../theme';

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

function Sparkline({ values, color }) {
  const spark = buildSparkline(values);
  if (!spark) {
    return (
      <div style={css('height:64px;display:flex;align-items:center;justify-content:center;color:oklch(0.5 0.025 228);font-size:11.5px;')}>
        No data yet
      </div>
    );
  }
  return (
    <svg viewBox={`0 0 ${spark.cw} ${spark.ch}`} preserveAspectRatio="none" style={css('width:100%;height:64px;display:block;filter:drop-shadow(0 0 5px ' + color + ' / 0.4);')}>
      {spark.lines.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      ))}
    </svg>
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
  const avgSleep = (() => {
    const known = sleepHours.filter((v) => v != null);
    return known.length ? (known.reduce((s, v) => s + v, 0) / known.length).toFixed(1) : null;
  })();
  const latestHabitDay = [...healthData].reverse().find((d) => d.health_habits_total > 0);

  return (
    <div className="elo-scroll" style={css('flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:16px;padding-right:6px;')}>

      {/* AI INSIGHT */}
      <div style={css(CARD + 'padding:16px;display:flex;flex-direction:column;gap:10px;')}>
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
        <div style={css(CARD + 'padding:18px;flex:1 1 320px;min-width:280px;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;')}>
            <div style={css('font-size:10px;font-weight:700;letter-spacing:0.1em;color:oklch(0.55 0.025 228);')}>SLEEP</div>
            <div style={css('font-size:9px;font-weight:600;letter-spacing:0.06em;color:oklch(0.5 0.025 228);')}>{healthRangeDays}-DAY AVG</div>
          </div>
          <div style={css('font-size:26px;font-weight:800;margin-bottom:10px;')}>
            {avgSleep != null ? avgSleep : '—'} <span style={css('font-size:11px;font-weight:500;color:oklch(0.55 0.025 228);')}>hrs</span>
          </div>
          {healthDataLoading ? (
            <div style={css('height:64px;display:flex;align-items:center;justify-content:center;color:oklch(0.5 0.025 228);font-size:11.5px;')}>Loading…</div>
          ) : (
            <Sparkline values={sleepHours} color="oklch(0.62 0.2 235)" />
          )}
        </div>

        {/* NUTRITION TREND */}
        <div style={css(CARD + 'padding:18px;flex:1 1 320px;min-width:280px;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;')}>
            <div style={css('font-size:10px;font-weight:700;letter-spacing:0.1em;color:oklch(0.55 0.025 228);')}>CALORIES</div>
            <div style={css('font-size:9px;font-weight:600;letter-spacing:0.06em;color:oklch(0.5 0.025 228);')}>{healthRangeDays}-DAY TREND</div>
          </div>
          <div style={css('font-size:26px;font-weight:800;margin-bottom:10px;')}>
            {healthData.length ? healthData[healthData.length - 1].kcal : 0} <span style={css('font-size:11px;font-weight:500;color:oklch(0.55 0.025 228);')}>kcal today</span>
          </div>
          {healthDataLoading ? (
            <div style={css('height:64px;display:flex;align-items:center;justify-content:center;color:oklch(0.5 0.025 228);font-size:11.5px;')}>Loading…</div>
          ) : (
            <Sparkline values={kcalSeries} color="oklch(0.86 0.17 195)" />
          )}

          <div style={css('margin-top:14px;font-size:9px;font-weight:700;letter-spacing:0.08em;color:oklch(0.55 0.025 228);margin-bottom:10px;')}>HEALTH HABITS</div>
          {latestHabitDay ? (
            <div style={css('display:flex;align-items:center;gap:10px;')}>
              <div style={css('flex:1;height:8px;border-radius:4px;background:oklch(0.12 0.06 240);overflow:hidden;')}>
                <div style={css(
                  'height:100%;border-radius:4px;background:oklch(0.58 0.18 204);box-shadow:' + GLOW_STRONG + ';width:' +
                  (latestHabitDay.health_habits_total > 0
                    ? Math.round((latestHabitDay.health_habits_completed / latestHabitDay.health_habits_total) * 100)
                    : 0) + '%;'
                )} />
              </div>
              <div style={css('font-size:12px;color:oklch(0.65 0.025 228);white-space:nowrap;')}>
                {latestHabitDay.health_habits_completed}/{latestHabitDay.health_habits_total} today
              </div>
            </div>
          ) : (
            <div style={css('color:oklch(0.5 0.025 228);font-size:11.5px;')}>No HEALTH-entity habits set up yet.</div>
          )}
        </div>
      </div>

      {/* DAY BY DAY */}
      <div style={css(CARD + 'padding:16px;')}>
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
                <div style={css('flex:1;min-width:0;color:oklch(0.65 0.025 228);')}>{d.kcal} kcal{d.fiber ? ' · ' + d.fiber + 'g fiber' : ''}</div>
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
