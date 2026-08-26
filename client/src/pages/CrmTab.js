import React from 'react';
import { css } from '../css';
import { ENTITY_META, ENTITY_OPTIONS, TF_COLOR, TF_ORDER, GLOW_STRONG, GOLD, CARD, CARD_CLASS } from '../theme';

function CategoryPicker({ task, setTaskCategory }) {
  if (!task.pickerOpen) return null;
  return (
    <div style={css('position:absolute;top:32px;right:0;background:oklch(0.16 0.075 238);border:1px solid oklch(0.58 0.18 204);border-radius:10px;padding:6px;box-shadow:0 8px 24px oklch(0 0 0 / 0.5);z-index:20;display:flex;flex-direction:column;gap:2px;')}>
      {task.categoryOptions.map((opt) => (
        <div
          key={opt.name}
          onClick={(e) => { e.stopPropagation(); setTaskCategory(task.id, opt.name); }}
          style={css(opt.style)}
        >
          <span>{opt.icon}</span> <span>{opt.name}</span>
        </div>
      ))}
    </div>
  );
}

function TaskRow({ task, archiveCrmTask, toggleCategoryPicker, setTaskCategory, toggleCrmKey, deleteCrmTask }) {
  return (
    <div className="elo-row-hover" style={css(task.rowStyle)}>
      <div onClick={() => archiveCrmTask(task.id)} style={css('width:17px;height:17px;border-radius:4px;border:1.5px solid oklch(0.4 0.025 228);flex-shrink:0;cursor:pointer;')} />
      <div style={css(task.badgeStyle)}>{task.timeframe}</div>
      <div style={css('font-size:13px;font-weight:500;flex:1;min-width:0;')}>{task.title}</div>
      <div style={css('position:relative;')}>
        <div onClick={() => toggleCategoryPicker(task.id)} style={css(task.categoryBtnStyle)}>{task.categoryIcon}</div>
        <CategoryPicker task={task} setTaskCategory={setTaskCategory} />
      </div>
      <div onClick={() => toggleCrmKey(task.id)} style={css(task.starStyle)}>{task.starChar}</div>
      <div onClick={() => deleteCrmTask(task.id)} style={css('width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:oklch(0.45 0.025 228);font-size:13px;flex-shrink:0;')}>✕</div>
    </div>
  );
}

export default function CrmTab(props) {
  const {
    decorate, decoratedVisible, activeTasks, archivedTasks,
    crmView, setCrmView, crmSearch, setCrmSearch,
    crmAddOpen, setCrmAddOpen, crmAddTitle, setCrmAddTitle,
    crmAddTimeframe, setCrmAddTimeframe, crmAddEntity, setCrmAddEntity,
    crmAddIsKey, setCrmAddIsKey,
    crmSmartText, setCrmSmartText, crmSmartParsing, submitCrmSmartAdd,
    crmDraggingId, setCrmDraggingId, crmDragOverCol, setCrmDragOverCol,
    submitCrmAdd, toggleCrmKey, archiveCrmTask, restoreCrmTask, deleteCrmTask,
    toggleCategoryPicker, setTaskCategory, dropOnCol,
  } = props;

  const stats = {
    open: activeTasks.length,
    today: activeTasks.filter((t) => t.timeframe === 'TODAY').length,
    week: activeTasks.filter((t) => t.timeframe === 'THIS WEEK').length,
    month: activeTasks.filter((t) => t.timeframe === 'THIS MONTH').length,
    someday: activeTasks.filter((t) => t.timeframe === 'SOMEDAY').length,
    key: activeTasks.filter((t) => t.key).length,
  };

  const priorityGroups = TF_ORDER
    .map((tf) => ({ tf, color: TF_COLOR[tf], tasks: decoratedVisible.filter((t) => t.timeframe === tf) }))
    .filter((g) => g.tasks.length > 0);

  const kanbanColumns = TF_ORDER.map((tf) => ({
    tf,
    color: TF_COLOR[tf],
    tasks: decoratedVisible.filter((t) => t.timeframe === tf),
    colStyle:
      'background:oklch(0.10 0.05 240);border:1px solid oklch(0.52 0.15 208);border-top:3px solid ' + TF_COLOR[tf] +
      ';border-radius:10px 10px 12px 12px;padding:12px;min-height:140px;transition:background 0.15s ease;' +
      (crmDragOverCol === tf ? 'background:oklch(0.16 0.075 238);' : ''),
  }));

  const categoryGroups = ENTITY_OPTIONS
    .map((name) => ({ name, icon: ENTITY_META[name], tasks: decoratedVisible.filter((t) => t.entity === name) }))
    .filter((g) => g.tasks.length > 0);

  const viewButtons = ['PRIORITY', 'KANBAN', 'CATEGORY', 'ARCHIVE'];
  const pill = 'display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:11.5px;color:oklch(0.7 0.025 228);background:oklch(0.16 0.075 238);border:1px solid oklch(0.58 0.18 204);border-radius:20px;padding:6px 12px;';
  const dot = (c) => 'width:7px;height:7px;border-radius:50%;background:' + c + ';display:inline-block;';

  const rowHandlers = { archiveCrmTask, toggleCategoryPicker, setTaskCategory, toggleCrmKey, deleteCrmTask };

  return (
    <div style={css('flex:1;padding:24px 32px;display:flex;flex-direction:column;gap:16px;min-height:0;')}>

      <div style={css('display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;')}>
        <div style={css('font-size:13px;font-weight:700;letter-spacing:0.03em;display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
          <span style={css('padding:7px 12px;')}>CRM // {stats.open} OPEN</span>
          <span style={css(pill)}><span style={css(dot('oklch(0.62 0.2 235)'))} />TODAY {stats.today}</span>
          <span style={css(pill)}><span style={css(dot('oklch(0.86 0.17 195)'))} />THIS WEEK {stats.week}</span>
          <span style={css(pill)}><span style={css(dot('oklch(0.8 0.19 200)'))} />THIS MONTH {stats.month}</span>
          <span style={css(pill)}><span style={css(dot('oklch(0.5 0.025 228)'))} />SOMEDAY {stats.someday}</span>
          <span style={css('display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:11.5px;color:oklch(0.86 0.17 195);background:oklch(0.86 0.17 195 / 0.1);border:1px solid oklch(0.86 0.17 195 / 0.4);border-radius:20px;padding:6px 12px;')}>★ KEY {stats.key}</span>
        </div>
        <div style={css('display:flex;gap:2px;background:oklch(0.16 0.075 238);border:1px solid oklch(0.58 0.18 204);border-radius:8px;padding:3px;')}>
          {viewButtons.map((v) => (
            <div
              key={v}
              onClick={() => setCrmView(v)}
              style={css(
                'padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:0.05em;border-radius:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;' +
                (crmView === v
                  ? 'background:oklch(0.2 0.08 228);color:oklch(0.92 0.1 198);border:1px solid oklch(0.78 0.2 200);box-shadow:' + GLOW_STRONG + ';'
                  : 'color:oklch(0.55 0.025 228);')
              )}
            >
              {v === 'ARCHIVE' ? 'ARCHIVE (' + archivedTasks.length + ')' : v}
            </div>
          ))}
        </div>
      </div>

      <div style={css('display:flex;gap:10px;align-items:center;')}>
        <input
          value={crmSearch}
          onChange={(e) => setCrmSearch(e.target.value)}
          placeholder="Search title, description, tag…"
          style={css('flex:1;min-width:0;background:oklch(0.16 0.075 238);border:1px solid oklch(0.58 0.18 204);border-radius:8px;padding:10px 14px;color:oklch(0.92 0.015 228);font-size:12.5px;')}
        />
        <div
          onClick={() => setCrmAddOpen(!crmAddOpen)}
          style={css('display:flex;align-items:center;gap:6px;background:oklch(0.58 0.18 204);color:oklch(0.92 0.015 228);font-size:11.5px;font-weight:700;letter-spacing:0.03em;padding:10px 16px;border-radius:8px;cursor:pointer;white-space:nowrap;flex-shrink:0;box-shadow:' + GLOW_STRONG + ';')}
        >+ ADD</div>
      </div>

      <div style={css('display:flex;gap:8px;align-items:center;')}>
        <input
          value={crmSmartText}
          onChange={(e) => setCrmSmartText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !crmSmartParsing) submitCrmSmartAdd(); }}
          placeholder="Describe a task in plain English — Claude fills in the details below to review…"
          style={css('flex:1;min-width:0;background:oklch(0.16 0.075 238);border:1px solid ' + GOLD + ';border-radius:8px;padding:10px 14px;color:oklch(0.92 0.015 228);font-size:12.5px;')}
        />
        <div
          onClick={() => { if (!crmSmartParsing) submitCrmSmartAdd(); }}
          style={css('display:flex;align-items:center;gap:6px;background:' + GOLD + ';color:oklch(0.12 0.06 240);font-size:11.5px;font-weight:700;letter-spacing:0.03em;padding:10px 16px;border-radius:8px;cursor:pointer;white-space:nowrap;flex-shrink:0;')}
        >{crmSmartParsing ? 'PARSING…' : '✨ AI ADD'}</div>
      </div>

      {crmAddOpen && (
        <div style={css('display:flex;gap:8px;background:oklch(0.16 0.075 238);border:1px solid oklch(0.58 0.18 204);border-radius:8px;padding:10px;')}>
          <input
            value={crmAddTitle}
            onChange={(e) => setCrmAddTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitCrmAdd(); }}
            placeholder="New task title…"
            style={css('flex:1;min-width:0;background:oklch(0.12 0.06 240);border:1px solid oklch(0.58 0.18 204);border-radius:6px;padding:8px 10px;color:oklch(0.92 0.015 228);font-size:12.5px;')}
          />
          <select
            value={crmAddTimeframe}
            onChange={(e) => setCrmAddTimeframe(e.target.value)}
            style={css('background:oklch(0.12 0.06 240);border:1px solid oklch(0.58 0.18 204);border-radius:6px;padding:8px 10px;color:oklch(0.92 0.015 228);font-size:12px;')}
          >
            {TF_ORDER.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
          </select>
          <select
            value={crmAddEntity}
            onChange={(e) => setCrmAddEntity(e.target.value)}
            style={css('background:oklch(0.12 0.06 240);border:1px solid oklch(0.58 0.18 204);border-radius:6px;padding:8px 10px;color:oklch(0.92 0.015 228);font-size:12px;')}
          >
            {ENTITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <div
            onClick={() => setCrmAddIsKey(!crmAddIsKey)}
            title="Mark as key task"
            style={css('display:flex;align-items:center;justify-content:center;width:34px;flex-shrink:0;cursor:pointer;font-size:16px;color:' + (crmAddIsKey ? GOLD : 'oklch(0.4 0.025 228)') + ';')}
          >★</div>
          <div
            onClick={submitCrmAdd}
            style={css('background:oklch(0.2 0.08 228);color:oklch(0.92 0.1 198);border:1px solid oklch(0.78 0.2 200);box-shadow:' + GLOW_STRONG + ';font-size:11.5px;font-weight:700;padding:8px 16px;border-radius:6px;cursor:pointer;white-space:nowrap;flex-shrink:0;')}
          >ADD</div>
        </div>
      )}

      <div style={css('flex:1;overflow-y:auto;min-height:0;')} className="elo-scroll">

        {crmView === 'PRIORITY' && (
          <div style={css('display:flex;flex-direction:column;gap:22px;')}>
            {priorityGroups.map((grp) => (
              <div key={grp.tf}>
                <div style={css('display:flex;align-items:center;gap:8px;margin-bottom:10px;')}>
                  <span style={css(dot(grp.color))} />
                  <span style={css('font-size:10px;font-weight:700;letter-spacing:0.08em;color:oklch(0.6 0.025 228);')}>{grp.tf}</span>
                </div>
                <div style={css('display:flex;flex-direction:column;')}>
                  {grp.tasks.map((task) => <TaskRow key={task.id} task={task} {...rowHandlers} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {crmView === 'KANBAN' && (
          <div style={css('display:grid;grid-template-columns:repeat(4, 1fr);gap:14px;align-items:start;')}>
            {kanbanColumns.map((col) => (
              <div
                key={col.tf}
                onDragOver={(e) => { e.preventDefault(); if (crmDragOverCol !== col.tf) setCrmDragOverCol(col.tf); }}
                onDragLeave={() => setCrmDragOverCol(null)}
                onDrop={(e) => { e.preventDefault(); dropOnCol(Number(e.dataTransfer.getData('text/plain')), col.tf); }}
                style={css(col.colStyle)}
              >
                <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;')}>
                  <div style={css('display:flex;align-items:center;gap:7px;')}>
                    <span style={css(dot(col.color))} />
                    <span style={css('font-size:10px;font-weight:700;letter-spacing:0.06em;')}>{col.tf}</span>
                  </div>
                </div>
                <div style={css('display:flex;flex-direction:column;gap:10px;')}>
                  {col.tasks.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(task.id)); setCrmDraggingId(task.id); }}
                      onDragEnd={() => { setCrmDraggingId(null); setCrmDragOverCol(null); }}
                      style={css(task.cardStyle)}
                    >
                      <div style={css('display:flex;align-items:flex-start;gap:9px;')}>
                        <div onClick={() => archiveCrmTask(task.id)} style={css('width:15px;height:15px;border-radius:4px;border:1.5px solid oklch(0.4 0.025 228);flex-shrink:0;margin-top:1px;cursor:pointer;')} />
                        <div style={css('font-size:12.5px;font-weight:500;flex:1;min-width:0;line-height:1.35;')}>{task.title}</div>
                        <div style={css('position:relative;')}>
                          <div onClick={() => toggleCategoryPicker(task.id)} style={css(task.categoryBtnStyle)}>{task.categoryIcon}</div>
                          <CategoryPicker task={task} setTaskCategory={setTaskCategory} />
                        </div>
                        <div onClick={() => toggleCrmKey(task.id)} style={css(task.starStyle)}>{task.starChar}</div>
                        <div onClick={() => deleteCrmTask(task.id)} style={css('width:22px;height:22px;border-radius:5px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:oklch(0.45 0.025 228);font-size:12px;flex-shrink:0;')}>✕</div>
                      </div>
                      <div style={css('font-size:9px;font-weight:600;letter-spacing:0.05em;color:oklch(0.5 0.025 228);margin-top:6px;margin-left:24px;')}>· {task.entity}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {crmView === 'CATEGORY' && (
          <div style={css('display:flex;flex-direction:column;gap:20px;')}>
            {categoryGroups.map((grp) => (
              <div key={grp.name} className={CARD_CLASS} style={css(CARD + 'padding:16px 18px;')}>
                <div style={css('display:flex;align-items:center;gap:10px;margin-bottom:10px;')}>
                  <span style={css('font-size:18px;')}>{grp.icon}</span>
                  <span style={css('font-size:13px;font-weight:700;')}>{grp.name}</span>
                  <span style={css('font-size:10.5px;font-weight:600;color:oklch(0.55 0.025 228);')}>{grp.tasks.length} OPEN</span>
                </div>
                <div style={css('display:flex;flex-direction:column;')}>
                  {grp.tasks.map((task) => <TaskRow key={task.id} task={task} {...rowHandlers} />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {crmView === 'ARCHIVE' && (
          <div style={css('display:flex;flex-direction:column;')}>
            {archivedTasks.map(decorate).map((task) => (
              <div key={task.id} style={css('display:flex;align-items:center;gap:12px;padding:11px 6px;border-bottom:1px solid oklch(0.48 0.14 210);')}>
                <div style={css('font-size:13px;font-weight:500;flex:1;min-width:0;color:oklch(0.55 0.025 228);text-decoration:line-through;')}>{task.title}</div>
                <div onClick={() => restoreCrmTask(task.id)} style={css('font-size:10.5px;font-weight:700;letter-spacing:0.05em;padding:7px 14px;border-radius:6px;background:oklch(0.8 0.19 200 / 0.15);border:1px solid oklch(0.8 0.19 200);color:oklch(0.8 0.19 200);cursor:pointer;white-space:nowrap;flex-shrink:0;')}>RESTORE</div>
                <div onClick={() => deleteCrmTask(task.id)} style={css('width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:oklch(0.45 0.025 228);font-size:13px;flex-shrink:0;')}>✕</div>
              </div>
            ))}
            {archivedTasks.length === 0 && (
              <div style={css('padding:40px;text-align:center;color:oklch(0.5 0.025 228);font-size:13px;')}>Nothing archived yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
