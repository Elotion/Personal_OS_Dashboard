import React from 'react';
import { css } from '../css';
import { GOLD, CARD, CARD_CLASS } from '../theme';

export default function BrainTab({ brainEntities, activeTasks, brainFilter, setBrainFilter, openEntityDetail }) {
  const decorated = brainEntities.map((en) => {
    const forEntity = activeTasks.filter((t) => t.entity === en.name.toUpperCase());
    const keyTasks = forEntity.filter((t) => t.key);
    const todayTasks = forEntity.filter((t) => t.timeframe === 'TODAY');
    // what to actually preview on the card: key tasks first (starred, so most
    // important), then today's tasks, deduping anything that's both
    const seen = new Set();
    const highlight = [...keyTasks, ...todayTasks].filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
    return {
      ...en,
      open: forEntity.length,
      key: keyTasks.length,
      today: todayTasks.length,
      highlightTasks: highlight.slice(0, 3),
      highlightMore: Math.max(0, highlight.length - 3),
    };
  });

  const filters = ['Entity Dashboard', 'Life Bucket'];

  return (
    <div style={css('flex:1;padding:28px 36px;display:flex;flex-direction:column;gap:22px;')}>
      <div style={css('display:flex;align-items:center;justify-content:space-between;')}>
        <div style={css('font-size:20px;font-weight:700;letter-spacing:-0.01em;')}>
          BRAIN <span style={css('color:oklch(0.55 0.025 228);font-weight:500;')}>// {brainEntities.length} ENTITIES</span>
        </div>
        <div style={css('display:flex;gap:4px;background:oklch(0.16 0.075 238);border:1px solid oklch(0.58 0.18 204);border-radius:9px;padding:4px;')}>
          {filters.map((name) => (
            <div
              key={name}
              onClick={() => setBrainFilter(name)}
              style={css(
                'padding:7px 14px;font-size:11.5px;font-weight:600;border-radius:7px;cursor:pointer;transition:all 0.15s ease;' +
                (name === brainFilter
                  ? 'background:oklch(0.58 0.18 204);color:oklch(0.92 0.015 228);'
                  : 'color:oklch(0.55 0.025 228);')
              )}
            >{name}</div>
          ))}
        </div>
      </div>

      <div style={css('display:grid;grid-template-columns:repeat(4, 1fr);gap:20px;')}>
        {decorated.map((en) => (
          <div
            key={en.id}
            className={'elo-entity-card ' + CARD_CLASS}
            onClick={() => openEntityDetail(en.id)}
            style={css(CARD + 'padding:24px;cursor:pointer;transition:filter 0.15s ease, transform 0.15s ease;display:flex;flex-direction:column;')}
          >
            <div style={css('display:flex;align-items:center;gap:12px;margin-bottom:12px;')}>
              <div style={css('font-size:26px;')}>{en.icon}</div>
              <div style={css('font-size:18px;font-weight:700;')}>{en.name}</div>
            </div>
            <div style={css('font-size:13px;color:oklch(0.6 0.025 228);margin-bottom:18px;line-height:1.5;')}>{en.desc}</div>
            <div style={css('display:flex;gap:16px;flex-wrap:wrap;')}>
              <div style={css('display:flex;align-items:center;gap:7px;')}>
                <div style={css('width:8px;height:8px;border-radius:50%;background:oklch(0.8 0.19 200);')} />
                <div style={css('font-size:13px;font-weight:600;')}>{en.open} <span style={css('color:oklch(0.55 0.025 228);font-weight:500;')}>OPEN</span></div>
              </div>
              <div style={css('display:flex;align-items:center;gap:7px;')}>
                <div style={css('width:8px;height:8px;border-radius:50%;background:oklch(0.62 0.2 235);')} />
                <div style={css('font-size:13px;font-weight:600;')}>{en.key} <span style={css('color:oklch(0.55 0.025 228);font-weight:500;')}>KEY</span></div>
              </div>
              <div style={css('display:flex;align-items:center;gap:7px;')}>
                <div style={css('width:8px;height:8px;border-radius:50%;background:oklch(0.86 0.17 195);')} />
                <div style={css('font-size:13px;font-weight:600;')}>{en.today} <span style={css('color:oklch(0.55 0.025 228);font-weight:500;')}>TODAY</span></div>
              </div>
            </div>

            {en.highlightTasks.length > 0 && (
              <div style={css('display:flex;flex-direction:column;gap:8px;margin-top:16px;padding-top:16px;border-top:1px solid oklch(0.48 0.14 210);')}>
                {en.highlightTasks.map((t) => (
                  <div key={t.id} style={css('display:flex;align-items:center;gap:8px;min-width:0;')}>
                    <span style={css('flex-shrink:0;font-size:11px;color:' + (t.key ? GOLD : 'oklch(0.62 0.2 235)') + ';')}>{t.key ? '★' : '•'}</span>
                    <span style={css('font-size:12.5px;color:oklch(0.75 0.02 228);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{t.title}</span>
                  </div>
                ))}
                {en.highlightMore > 0 && (
                  <div style={css('font-size:11px;color:oklch(0.5 0.025 228);')}>+{en.highlightMore} more</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
