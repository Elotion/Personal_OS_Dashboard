import React from 'react';
import { css } from '../css';

export default function EntityPanel({
  entity, open, close, tasks, notesValue, onNotesChange,
  briefing, briefingLabel, generateBriefing,
  toggleCrmKey, archiveCrmTask, toggleCategoryPicker, setTaskCategory,
}) {
  const accent = 'oklch(0.75 0.15 210)';

  return (
    <>
      <div
        onClick={close}
        style={css('position:fixed;inset:0;background:oklch(0.05 0 0 / ' + (open ? '0.6' : '0') + ');backdrop-filter:blur(' + (open ? '3px' : '0px') + ');transition:background 0.25s ease, backdrop-filter 0.25s ease;z-index:40;')}
      />
      <div style={css('position:fixed;top:0;right:0;bottom:0;width:min(560px, 94vw);background:oklch(0.13 0.065 240);border-left:1px solid oklch(0.6 0.18 202);z-index:41;transform:translateX(' + (open ? '0' : '100%') + ');transition:transform 0.28s cubic-bezier(0.2,0.8,0.2,1);display:flex;flex-direction:column;box-shadow:-24px 0 48px -12px oklch(0.02 0 0 / 0.5);')}>

        <div style={css('padding:24px 28px;border-bottom:1px solid oklch(0.58 0.18 204);border-top:3px solid ' + accent + ';display:flex;align-items:flex-start;justify-content:space-between;flex-shrink:0;')}>
          <div>
            <div style={css('display:flex;align-items:center;gap:10px;margin-bottom:8px;')}>
              <span style={css('font-size:22px;')}>{entity.icon}</span>
              <span style={css('font-size:22px;font-weight:700;letter-spacing:-0.01em;')}>{entity.name}</span>
            </div>
            <div style={css('font-size:11px;font-weight:600;letter-spacing:0.04em;color:oklch(0.55 0.025 228);')}>
              {tasks.length} OPEN · {tasks.filter((t) => t.key).length} KEY · {tasks.filter((t) => t.timeframe === 'TODAY').length} TODAY
            </div>
          </div>
          <div onClick={close} style={css('width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:oklch(0.6 0.025 228);font-size:15px;flex-shrink:0;background:oklch(0.24 0.08 232);')}>✕</div>
        </div>

        <div className="elo-scroll" style={css('flex:1;overflow-y:auto;padding:24px 28px;display:flex;flex-direction:column;gap:26px;')}>

          <div>
            <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;')}>
              <div style={css('font-size:10px;font-weight:700;letter-spacing:0.1em;color:oklch(0.55 0.025 228);')}>AI BRIEFING</div>
              <div onClick={generateBriefing} style={css('font-size:10px;font-weight:700;letter-spacing:0.06em;padding:6px 12px;border-radius:6px;background:oklch(0.58 0.18 204);cursor:pointer;')}>{briefingLabel}</div>
            </div>
            <div style={css('background:oklch(0.10 0.05 240);border:1px solid oklch(0.52 0.15 208);border-radius:10px;padding:14px 16px;font-size:12.5px;line-height:1.5;color:oklch(0.65 0.025 228);')}>{briefing}</div>
          </div>

          <div>
            <div style={css('font-size:10px;font-weight:700;letter-spacing:0.1em;color:oklch(0.55 0.025 228);margin-bottom:12px;')}>OPEN TASKS ({tasks.length})</div>
            <div style={css('display:flex;flex-direction:column;')}>
              {tasks.map((task) => (
                <div key={task.id} style={css('display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid oklch(0.48 0.14 210);')}>
                  <div onClick={() => archiveCrmTask(task.id)} style={css('width:16px;height:16px;border-radius:4px;border:1.5px solid oklch(0.4 0.025 228);flex-shrink:0;cursor:pointer;')} />
                  <div style={css('font-size:13px;font-weight:500;flex:1;min-width:0;')}>{task.title}</div>
                  <div style={css(task.badgeStyle)}>{task.timeframe}</div>
                  <div style={css('position:relative;')}>
                    <div onClick={() => toggleCategoryPicker(task.id)} style={css(task.categoryBtnStyle)}>{task.categoryIcon}</div>
                    {task.pickerOpen && (
                      <div style={css('position:absolute;top:32px;right:0;background:oklch(0.16 0.075 238);border:1px solid oklch(0.58 0.18 204);border-radius:10px;padding:6px;box-shadow:0 8px 24px oklch(0 0 0 / 0.5);z-index:20;display:flex;flex-direction:column;gap:2px;')}>
                        {task.categoryOptions.map((opt) => (
                          <div key={opt.name} onClick={(e) => { e.stopPropagation(); setTaskCategory(task.id, opt.name); }} style={css(opt.style)}>
                            <span>{opt.icon}</span> <span>{opt.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div onClick={() => toggleCrmKey(task.id)} style={css(task.starStyle)}>{task.starChar}</div>
                </div>
              ))}
              {tasks.length === 0 && (
                <div style={css('padding:20px 4px;color:oklch(0.5 0.025 228);font-size:12.5px;')}>No open tasks for this entity.</div>
              )}
            </div>
          </div>

          <div>
            <div style={css('font-size:10px;font-weight:700;letter-spacing:0.1em;color:oklch(0.55 0.025 228);margin-bottom:10px;')}>NOTES</div>
            <textarea
              value={notesValue}
              onChange={(e) => onNotesChange(e.target.value)}
              style={css('width:100%;min-height:120px;background:oklch(0.10 0.05 240);border:1px solid oklch(0.52 0.15 208);border-radius:10px;padding:14px 16px;color:oklch(0.85 0.015 228);font-size:13px;line-height:1.6;resize:vertical;font-family:inherit;')}
            />
          </div>
        </div>
      </div>
    </>
  );
}
