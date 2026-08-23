import React from 'react';
import { css } from '../css';
import { CARD, GLOW_STRONG } from '../theme';

export default function JournalTab({
  journalEntries, journalViewMode, setJournalViewMode,
  journalSearch, setJournalSearch, toggleJournalRaw, generateJournalSummary,
  journalAddOpen, toggleJournalAdd, journalAddDate, setJournalAddDate,
  journalAddRaw, setJournalAddRaw, submitJournalAdd,
  journalEditingId, journalEditText, setJournalEditText,
  startEditJournal, saveEditJournal, cancelEditJournal,
  deleteJournalEntry,
}) {
  const q = journalSearch.trim().toLowerCase();
  const filtered = q
    ? journalEntries.filter((j) => j.day.toLowerCase().includes(q) || j.date.toLowerCase().includes(q))
    : journalEntries;

  const modes = ['SUMMARY', 'RAW'];

  return (
    <div style={css('flex:1;padding:24px 36px;display:flex;flex-direction:column;gap:18px;min-height:0;')}>
      <div style={css('display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;')}>
        <div style={css('font-size:13px;font-weight:700;letter-spacing:0.03em;')}>
          JOURNAL <span style={css('color:oklch(0.55 0.025 228);font-weight:500;')}>// {journalEntries.length} DAYS (LAST 30)</span>
        </div>
        <div style={css('display:flex;gap:2px;background:oklch(0.16 0.075 238);border:1px solid oklch(0.58 0.18 204);border-radius:8px;padding:3px;')}>
          {modes.map((m) => (
            <div
              key={m}
              onClick={() => setJournalViewMode(m)}
              style={css(
                'padding:7px 14px;font-size:11px;font-weight:700;letter-spacing:0.05em;border-radius:6px;cursor:pointer;white-space:nowrap;' +
                (journalViewMode === m
                  ? 'background:oklch(0.2 0.08 228);color:oklch(0.92 0.1 198);border:1px solid oklch(0.78 0.2 200);'
                  : 'color:oklch(0.55 0.025 228);')
              )}
            >{m}</div>
          ))}
        </div>
      </div>

      <div style={css('display:flex;gap:10px;align-items:center;')}>
        <input
          value={journalSearch}
          onChange={(e) => setJournalSearch(e.target.value)}
          placeholder="Search by date or day — e.g. AUG 20, YESTERDAY…"
          style={css('flex:1;min-width:0;background:oklch(0.16 0.075 238);border:1px solid oklch(0.58 0.18 204);border-radius:8px;padding:10px 14px;color:oklch(0.92 0.015 228);font-size:12.5px;')}
        />
        <div
          onClick={toggleJournalAdd}
          style={css('display:flex;align-items:center;gap:6px;background:oklch(0.58 0.18 204);color:oklch(0.92 0.015 228);font-size:11.5px;font-weight:700;letter-spacing:0.03em;padding:10px 16px;border-radius:8px;cursor:pointer;white-space:nowrap;flex-shrink:0;box-shadow:' + GLOW_STRONG + ';')}
        >+ NEW ENTRY</div>
      </div>

      {journalAddOpen && (
        <div style={css(CARD + 'padding:16px;display:flex;flex-direction:column;gap:10px;')}>
          <input
            type="date"
            value={journalAddDate}
            onChange={(e) => setJournalAddDate(e.target.value)}
            style={css('background:oklch(0.12 0.06 240);border:1px solid oklch(0.58 0.18 204);border-radius:6px;padding:8px 10px;color:oklch(0.92 0.015 228);font-size:12px;align-self:flex-start;')}
          />
          <textarea
            value={journalAddRaw}
            onChange={(e) => setJournalAddRaw(e.target.value)}
            placeholder="What happened today…"
            rows={4}
            style={css('background:oklch(0.12 0.06 240);border:1px solid oklch(0.58 0.18 204);border-radius:6px;padding:10px 12px;color:oklch(0.92 0.015 228);font-size:12.5px;line-height:1.5;resize:vertical;font-family:inherit;')}
          />
          <div style={css('display:flex;justify-content:flex-end;gap:8px;')}>
            <div
              onClick={toggleJournalAdd}
              style={css('font-size:11px;font-weight:600;color:oklch(0.55 0.025 228);cursor:pointer;padding:8px 12px;')}
            >CANCEL</div>
            <div
              onClick={submitJournalAdd}
              style={css('background:oklch(0.2 0.08 228);color:oklch(0.92 0.1 198);border:1px solid oklch(0.78 0.2 200);box-shadow:' + GLOW_STRONG + ';font-size:11.5px;font-weight:700;padding:8px 16px;border-radius:6px;cursor:pointer;white-space:nowrap;')}
            >SAVE ENTRY</div>
          </div>
        </div>
      )}

      {filtered.length > 0 ? (
        <div className="elo-scroll" style={css('flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:16px;padding-right:6px;')}>
          {filtered.map((entry) => (
            <div key={entry.id} style={css(CARD + 'padding:20px;transition:box-shadow 0.2s ease;')}>
              <div style={css('display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;')}>
                <div>
                  <div style={css('font-size:18px;font-weight:800;letter-spacing:0.02em;')}>{entry.day}</div>
                  <div style={css('font-size:10.5px;color:oklch(0.55 0.025 228);letter-spacing:0.05em;margin-top:2px;')}>{entry.date}</div>
                </div>
                <div style={css('display:flex;align-items:center;gap:14px;')}>
                  <div style={css('display:flex;align-items:center;gap:12px;font-size:11px;font-weight:600;color:oklch(0.7 0.025 228);')}>
                    <span>↑ {entry.tasks}</span>
                    <span>⭐ {entry.captures}</span>
                  </div>
                  <div
                    onClick={() => generateJournalSummary(entry.id)}
                    style={css('font-size:10px;font-weight:700;letter-spacing:0.05em;padding:6px 12px;border-radius:6px;background:oklch(0.2 0.08 228);color:oklch(0.92 0.1 198);border:1px solid oklch(0.78 0.2 200);box-shadow:' + GLOW_STRONG + ';cursor:pointer;white-space:nowrap;')}
                  >{entry.generating ? 'GENERATING…' : 'GENERATE'}</div>
                  <div
                    onClick={() => deleteJournalEntry(entry.id)}
                    style={css('width:26px;height:26px;flex-shrink:0;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:oklch(0.45 0.025 228);font-size:13px;')}
                  >✕</div>
                </div>
              </div>

              <div style={css('font-size:10px;font-weight:700;letter-spacing:0.08em;color:oklch(0.86 0.17 195);margin-bottom:6px;')}>⭐ AI RECAP</div>
              <div style={css('font-size:13.5px;line-height:1.55;color:oklch(0.7 0.025 228);margin-bottom:8px;')}>
                {entry.recap || 'No recap yet — hit GENERATE.'}
              </div>
              <div style={css('display:flex;align-items:center;gap:16px;')}>
                <div
                  onClick={() => toggleJournalRaw(entry.id)}
                  style={css('font-size:11.5px;font-weight:600;color:oklch(0.78 0.2 200);cursor:pointer;display:inline-block;')}
                >{entry.expanded ? 'HIDE RAW' : 'SHOW RAW'}</div>
                {journalEditingId !== entry.id && (
                  <div
                    onClick={() => startEditJournal(entry.id)}
                    style={css('font-size:11.5px;font-weight:600;color:oklch(0.55 0.025 228);cursor:pointer;display:inline-block;')}
                  >EDIT</div>
                )}
              </div>

              {entry.expanded && (
                <div style={css('margin-top:12px;background:oklch(0.12 0.06 240);border:1px solid oklch(0.48 0.14 210);border-radius:10px;padding:14px 16px;')}>
                  <div style={css('font-size:9px;font-weight:700;letter-spacing:0.08em;color:oklch(0.5 0.025 228);margin-bottom:8px;')}>RAW TRANSCRIPT</div>
                  {journalEditingId === entry.id ? (
                    <>
                      <textarea
                        autoFocus
                        value={journalEditText}
                        onChange={(e) => setJournalEditText(e.target.value)}
                        rows={6}
                        style={css('width:100%;background:oklch(0.16 0.075 238);border:1px solid oklch(0.86 0.17 195);border-radius:8px;padding:10px 12px;color:oklch(0.9 0.015 228);font-size:13px;line-height:1.6;resize:vertical;font-family:inherit;')}
                      />
                      <div style={css('display:flex;gap:8px;justify-content:flex-end;margin-top:10px;')}>
                        <div
                          onClick={cancelEditJournal}
                          style={css('font-size:11px;font-weight:600;color:oklch(0.55 0.025 228);cursor:pointer;padding:7px 12px;')}
                        >CANCEL</div>
                        <div
                          onClick={saveEditJournal}
                          style={css('font-size:10.5px;font-weight:700;letter-spacing:0.05em;padding:7px 14px;border-radius:6px;background:oklch(0.8 0.19 200 / 0.15);border:1px solid oklch(0.8 0.19 200);color:oklch(0.8 0.19 200);cursor:pointer;')}
                        >SAVE</div>
                      </div>
                    </>
                  ) : (
                    <div style={css('font-size:13px;line-height:1.6;color:oklch(0.8 0.015 228);')}>{entry.raw}</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={css('flex:1;display:flex;align-items:center;justify-content:center;color:oklch(0.5 0.025 228);font-size:13px;')}>
          No entries match that search.
        </div>
      )}
    </div>
  );
}
