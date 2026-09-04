import React, { useState } from 'react';
import { css } from '../css';
import { CARD, CARD_CLASS, GLOW_STRONG, GOLD } from '../theme';

// Account types shown in the add-account form -- free-text `type` column
// server-side (no CHECK constraint, matching this app's existing convention
// of keeping category-style columns free text, e.g. habits.category), this
// list just keeps entry consistent. `debt` pre-checks the is_debt checkbox
// when that type is picked, since a credit card/loan balance almost always
// means "money owed," but stays editable in case that's ever not true.
const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking', debt: false },
  { value: 'savings', label: 'Savings', debt: false },
  { value: 'hysa', label: 'High-Yield Savings', debt: false },
  { value: 'investment', label: 'Investment', debt: false },
  { value: 'retirement', label: 'Retirement', debt: false },
  { value: 'credit_card', label: 'Credit Card', debt: true },
  { value: 'loan', label: 'Loan', debt: true },
  { value: 'other', label: 'Other', debt: false },
];
const TYPE_LABEL = ACCOUNT_TYPES.reduce((m, t) => ({ ...m, [t.value]: t.label }), {});

const RANGE_OPTIONS = [
  { days: 30, label: '30D' },
  { days: 60, label: '60D' },
  { days: 90, label: '90D' },
  { days: 365, label: '1Y' },
];

function fmtMoney(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? '-' : '';
  return sign + '$' + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatBlock({ label, value, color, sub }) {
  return (
    <div style={css('flex:1;min-width:150px;')}>
      <div style={css('font-size:9.5px;font-weight:700;letter-spacing:0.08em;color:oklch(0.55 0.025 228);margin-bottom:5px;')}>{label}</div>
      <div style={css('font-size:24px;font-weight:800;color:' + (color || 'inherit') + ';white-space:nowrap;')}>{value}</div>
      {sub && <div style={css('font-size:10.5px;color:oklch(0.5 0.025 228);margin-top:2px;')}>{sub}</div>}
    </div>
  );
}

function RangePicker({ value, onChange }) {
  return (
    <div style={css('display:flex;gap:6px;')}>
      {RANGE_OPTIONS.map((opt) => (
        <div
          key={opt.days}
          onClick={() => onChange(opt.days)}
          style={css(
            'font-size:10px;font-weight:700;letter-spacing:0.03em;padding:5px 10px;border-radius:6px;cursor:pointer;white-space:nowrap;' +
            (value === opt.days
              ? 'background:oklch(0.58 0.18 204);color:oklch(0.95 0.02 200);box-shadow:' + GLOW_STRONG + ';'
              : 'background:oklch(0.12 0.06 240);color:oklch(0.55 0.025 228);border:1px solid oklch(0.4 0.08 220);')
          )}
        >{opt.label}</div>
      ))}
    </div>
  );
}

// Full field editor (name/type/institution) -- separate from the quick
// balance-click-to-edit below, since that one's meant for the frequent
// "update my balance" action and this one's for the rarer "fix a typo in
// the name" / "recategorize this account" action.
function AccountEditForm({ account, onSave, onCancel }) {
  const [name, setName] = useState(account.name);
  const [type, setType] = useState(account.type);
  const [institution, setInstitution] = useState(account.institution || '');
  const [isDebt, setIsDebt] = useState(!!account.is_debt);
  const save = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), type, institution: institution.trim() || null, is_debt: isDebt });
  };
  return (
    <div style={css('display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:8px;background:oklch(0.11 0.05 236);border:1px solid oklch(0.28 0.06 232);margin-bottom:2px;')}>
      <div style={css('display:flex;gap:8px;flex-wrap:wrap;')}>
        <input value={name} onChange={(e) => setName(e.target.value)}
          style={css('flex:2;min-width:120px;background:oklch(0.1 0.05 236);border:1px solid oklch(0.3 0.06 232);border-radius:6px;color:inherit;padding:6px 9px;font-size:12px;')} />
        <select value={type} onChange={(e) => setType(e.target.value)}
          style={css('flex:1;min-width:110px;background:oklch(0.1 0.05 236);border:1px solid oklch(0.3 0.06 232);border-radius:6px;color:inherit;padding:6px 9px;font-size:12px;')}>
          {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div style={css('display:flex;gap:8px;flex-wrap:wrap;align-items:center;')}>
        <input placeholder="Institution" value={institution} onChange={(e) => setInstitution(e.target.value)}
          style={css('flex:1;min-width:120px;background:oklch(0.1 0.05 236);border:1px solid oklch(0.3 0.06 232);border-radius:6px;color:inherit;padding:6px 9px;font-size:12px;')} />
        <label style={css('display:flex;align-items:center;gap:5px;font-size:10.5px;color:oklch(0.6 0.025 228);white-space:nowrap;cursor:pointer;')}>
          <input type="checkbox" checked={isDebt} onChange={(e) => setIsDebt(e.target.checked)} /> I owe this
        </label>
        <div style={css('flex:1;')} />
        <div className="elo-link-hover" onClick={onCancel} style={css('font-size:10px;font-weight:700;color:oklch(0.5 0.025 228);cursor:pointer;padding:5px 4px;')}>CANCEL</div>
        <div className="elo-link-hover" onClick={save} style={css('font-size:10px;font-weight:700;color:oklch(0.86 0.17 195);cursor:pointer;padding:5px 4px;')}>SAVE</div>
      </div>
    </div>
  );
}

function AccountRow({ account, onUpdate, onDelete, dragging, setDragging, onReorder }) {
  const [editingBalance, setEditingBalance] = useState(false);
  const [editingFields, setEditingFields] = useState(false);
  const [balanceInput, setBalanceInput] = useState(String(account.current_balance ?? 0));
  const saveBalance = () => {
    const n = parseFloat(balanceInput);
    if (!isNaN(n)) onUpdate(account.id, { current_balance: n });
    setEditingBalance(false);
  };

  if (editingFields) {
    return (
      <AccountEditForm
        account={account}
        onCancel={() => setEditingFields(false)}
        onSave={(patch) => { onUpdate(account.id, patch); setEditingFields(false); }}
      />
    );
  }

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(account.id)); setDragging(account.id); }}
      onDragEnd={() => setDragging(null)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onReorder(Number(e.dataTransfer.getData('text/plain')), account.id); setDragging(null); }}
      style={css(
        'display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:1px solid oklch(0.28 0.06 232);cursor:grab;' +
        (dragging === account.id ? 'opacity:0.35;' : 'opacity:1;')
      )}
    >
      <div style={css('color:oklch(0.4 0.02 228);font-size:12px;letter-spacing:-1px;flex-shrink:0;')}>⠿</div>
      <div style={css('flex:1;min-width:0;')}>
        <div style={css('font-size:13px;font-weight:700;')}>{account.name}</div>
        <div style={css('font-size:10px;color:oklch(0.5 0.025 228);')}>
          {TYPE_LABEL[account.type] || account.type}{account.institution ? ' · ' + account.institution : ''}
        </div>
      </div>
      {editingBalance ? (
        <>
          <input
            autoFocus type="number" step="0.01" value={balanceInput}
            onChange={(e) => setBalanceInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveBalance(); if (e.key === 'Escape') setEditingBalance(false); }}
            style={css('width:110px;background:oklch(0.1 0.05 236);border:1px solid oklch(0.5 0.15 204);border-radius:6px;color:inherit;padding:5px 8px;font-size:13px;text-align:right;')}
          />
          <div className="elo-link-hover" onClick={saveBalance} style={css('font-size:10px;font-weight:700;color:oklch(0.86 0.17 195);cursor:pointer;')}>SAVE</div>
        </>
      ) : (
        <>
          <div
            onClick={() => { setBalanceInput(String(account.current_balance ?? 0)); setEditingBalance(true); }}
            style={css('font-size:15px;font-weight:800;cursor:pointer;color:' + (account.is_debt ? 'oklch(0.68 0.19 25)' : 'inherit') + ';white-space:nowrap;')}
          >{account.is_debt ? '-' : ''}{fmtMoney(Math.abs(account.current_balance || 0))}</div>
          <div className="elo-link-hover" onClick={() => setEditingFields(true)} style={css('font-size:12px;color:oklch(0.5 0.025 228);cursor:pointer;padding:2px 4px;')}>✎</div>
          <div className="elo-link-hover" onClick={() => onDelete(account.id)} style={css('font-size:13px;color:oklch(0.5 0.025 228);cursor:pointer;padding:2px 4px;')}>✕</div>
        </>
      )}
    </div>
  );
}

function AddAccountForm({ onAdd, onClose }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('checking');
  const [institution, setInstitution] = useState('');
  const [balance, setBalance] = useState('');
  const [isDebt, setIsDebt] = useState(false);
  const submit = () => {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(), type, institution: institution.trim() || null,
      current_balance: parseFloat(balance) || 0, is_debt: isDebt,
    });
    setName(''); setInstitution(''); setBalance(''); setIsDebt(false);
  };
  return (
    <div style={css('display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:10px;background:oklch(0.11 0.05 236);border:1px solid oklch(0.28 0.06 232);margin-bottom:10px;')}>
      <div style={css('display:flex;gap:8px;flex-wrap:wrap;')}>
        <input placeholder="Account name" value={name} onChange={(e) => setName(e.target.value)}
          style={css('flex:2;min-width:140px;background:oklch(0.1 0.05 236);border:1px solid oklch(0.3 0.06 232);border-radius:6px;color:inherit;padding:7px 10px;font-size:12.5px;')} />
        <select value={type} onChange={(e) => { setType(e.target.value); setIsDebt(ACCOUNT_TYPES.find((t) => t.value === e.target.value)?.debt || false); }}
          style={css('flex:1;min-width:120px;background:oklch(0.1 0.05 236);border:1px solid oklch(0.3 0.06 232);border-radius:6px;color:inherit;padding:7px 10px;font-size:12.5px;')}>
          {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div style={css('display:flex;gap:8px;flex-wrap:wrap;align-items:center;')}>
        <input placeholder="Institution (optional)" value={institution} onChange={(e) => setInstitution(e.target.value)}
          style={css('flex:2;min-width:140px;background:oklch(0.1 0.05 236);border:1px solid oklch(0.3 0.06 232);border-radius:6px;color:inherit;padding:7px 10px;font-size:12.5px;')} />
        <input placeholder="Balance" type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)}
          style={css('flex:1;min-width:100px;background:oklch(0.1 0.05 236);border:1px solid oklch(0.3 0.06 232);border-radius:6px;color:inherit;padding:7px 10px;font-size:12.5px;')} />
        <label style={css('display:flex;align-items:center;gap:5px;font-size:11px;color:oklch(0.6 0.025 228);white-space:nowrap;cursor:pointer;')}>
          <input type="checkbox" checked={isDebt} onChange={(e) => setIsDebt(e.target.checked)} /> I owe this
        </label>
      </div>
      <div style={css('display:flex;gap:8px;justify-content:flex-end;')}>
        <div className="elo-link-hover" onClick={onClose} style={css('font-size:10.5px;font-weight:700;color:oklch(0.5 0.025 228);cursor:pointer;padding:6px 4px;')}>CANCEL</div>
        <div className="elo-btn-hover" onClick={submit} style={css('font-size:10.5px;font-weight:700;letter-spacing:0.04em;padding:7px 14px;border-radius:6px;background:oklch(0.2 0.08 228);color:oklch(0.92 0.1 198);border:1px solid oklch(0.78 0.2 200);box-shadow:' + GLOW_STRONG + ';cursor:pointer;')}>ADD ACCOUNT</div>
      </div>
    </div>
  );
}

function AddSubscriptionForm({ onAdd, onClose }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState('monthly');
  const submit = () => {
    const amt = parseFloat(amount);
    if (!name.trim() || !amt) return;
    onAdd({ name: name.trim(), amount: amt, billing_cycle: cycle });
    setName(''); setAmount('');
  };
  return (
    <div style={css('display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px;border-radius:10px;background:oklch(0.11 0.05 236);border:1px solid oklch(0.28 0.06 232);margin-bottom:10px;')}>
      <input placeholder="Subscription name" value={name} onChange={(e) => setName(e.target.value)}
        style={css('flex:2;min-width:120px;background:oklch(0.1 0.05 236);border:1px solid oklch(0.3 0.06 232);border-radius:6px;color:inherit;padding:7px 10px;font-size:12.5px;')} />
      <input placeholder="Amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
        style={css('flex:1;min-width:90px;background:oklch(0.1 0.05 236);border:1px solid oklch(0.3 0.06 232);border-radius:6px;color:inherit;padding:7px 10px;font-size:12.5px;')} />
      <select value={cycle} onChange={(e) => setCycle(e.target.value)}
        style={css('background:oklch(0.1 0.05 236);border:1px solid oklch(0.3 0.06 232);border-radius:6px;color:inherit;padding:7px 10px;font-size:12.5px;')}>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
        <option value="weekly">Weekly</option>
      </select>
      <div className="elo-link-hover" onClick={onClose} style={css('font-size:10.5px;font-weight:700;color:oklch(0.5 0.025 228);cursor:pointer;padding:6px 4px;')}>CANCEL</div>
      <div className="elo-btn-hover" onClick={submit} style={css('font-size:10.5px;font-weight:700;letter-spacing:0.04em;padding:7px 14px;border-radius:6px;background:oklch(0.2 0.08 228);color:oklch(0.92 0.1 198);border:1px solid oklch(0.78 0.2 200);box-shadow:' + GLOW_STRONG + ';cursor:pointer;white-space:nowrap;')}>ADD</div>
    </div>
  );
}

// CSV upload -> AI column mapping -> preview -> pick account -> commit.
// Same review-before-create principle as CRM's AI ADD: nothing is saved
// until the explicit IMPORT click, and the account picker forces Elo to say
// which real account this statement belongs to (parse-csv never knows).
function CsvImport({
  accounts, parseFinanceCsv, financeCsvPreview, financeCsvParsing,
  cancelFinanceCsvPreview, commitFinanceCsv, financeCsvAccountId, setFinanceCsvAccountId, financeCsvCommitting,
}) {
  const fileRef = React.useRef(null);
  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => parseFinanceCsv(String(reader.result || ''));
    reader.readAsText(file);
    e.target.value = '';
  };

  if (financeCsvPreview) {
    const t = financeCsvPreview.transactions || [];
    return (
      <div>
        <div style={css('font-size:11.5px;color:oklch(0.6 0.025 228);margin-bottom:10px;')}>
          Parsed {financeCsvPreview.parsedCount} of {financeCsvPreview.rowCount} rows. Nothing is saved yet — pick which account this belongs to, then import.
        </div>
        <div style={css('display:flex;gap:8px;align-items:center;margin-bottom:10px;')}>
          <select value={financeCsvAccountId} onChange={(e) => setFinanceCsvAccountId(e.target.value)}
            style={css('flex:1;background:oklch(0.1 0.05 236);border:1px solid oklch(0.3 0.06 232);border-radius:6px;color:inherit;padding:7px 10px;font-size:12.5px;')}>
            <option value="">Select account…</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="elo-link-hover" onClick={cancelFinanceCsvPreview} style={css('font-size:10.5px;font-weight:700;color:oklch(0.5 0.025 228);cursor:pointer;padding:7px 4px;white-space:nowrap;')}>CANCEL</div>
          <div
            className="elo-btn-hover"
            onClick={() => { if (financeCsvAccountId && !financeCsvCommitting) commitFinanceCsv(); }}
            style={css('font-size:10.5px;font-weight:700;letter-spacing:0.04em;padding:8px 16px;border-radius:6px;white-space:nowrap;' +
              (financeCsvAccountId
                ? 'background:oklch(0.2 0.08 228);color:oklch(0.92 0.1 198);border:1px solid oklch(0.78 0.2 200);box-shadow:' + GLOW_STRONG + ';cursor:pointer;'
                : 'background:oklch(0.15 0.04 232);color:oklch(0.4 0.02 228);border:1px solid oklch(0.28 0.06 232);cursor:default;'))}
          >{financeCsvCommitting ? 'IMPORTING…' : 'IMPORT ' + t.length + ' TRANSACTIONS'}</div>
        </div>
        <div className="elo-scroll" style={css('max-height:260px;overflow-y:auto;border-radius:8px;border:1px solid oklch(0.28 0.06 232);')}>
          {t.slice(0, 50).map((tx, i) => (
            <div key={i} style={css('display:flex;gap:10px;padding:7px 10px;border-bottom:1px solid oklch(0.22 0.05 232);font-size:11.5px;')}>
              <div style={css('width:78px;flex-shrink:0;color:oklch(0.55 0.025 228);')}>{tx.date}</div>
              <div style={css('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{tx.description}</div>
              <div style={css('width:90px;flex-shrink:0;text-align:right;font-weight:700;color:' + (tx.amount < 0 ? 'oklch(0.68 0.19 25)' : 'oklch(0.7 0.18 150)') + ';')}>{fmtMoney(tx.amount)}</div>
            </div>
          ))}
          {t.length > 50 && <div style={css('padding:8px 10px;font-size:10.5px;color:oklch(0.5 0.025 228);')}>+ {t.length - 50} more…</div>}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={css('font-size:11.5px;color:oklch(0.6 0.025 228);margin-bottom:10px;')}>
        Export a CSV from your bank or card, upload it here — AI figures out the date/description/amount columns for whatever format it's in, then you review before anything saves.
      </div>
      <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={css('display:none;')} />
      <div
        className="elo-btn-hover"
        onClick={() => { if (!financeCsvParsing) fileRef.current.click(); }}
        style={css('display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.04em;padding:9px 16px;border-radius:8px;background:oklch(0.2 0.08 228);color:oklch(0.92 0.1 198);border:1px solid oklch(0.78 0.2 200);box-shadow:' + GLOW_STRONG + ';cursor:pointer;')}
      >{financeCsvParsing ? 'PARSING…' : '📄 UPLOAD CSV'}</div>
    </div>
  );
}

export default function FinanceTab({
  financeSummary, financeSummaryLoading, financeMigrated,
  financeSubscriptions, financeTransactions,
  addFinanceAccount, updateFinanceAccount, deleteFinanceAccount, reorderFinanceAccounts,
  draggingFinanceAccountId, setDraggingFinanceAccountId,
  financeAddAccountOpen, setFinanceAddAccountOpen,
  addFinanceSubscription, deleteFinanceSubscription,
  financeAddSubOpen, setFinanceAddSubOpen,
  parseFinanceCsv, financeCsvPreview, financeCsvParsing,
  cancelFinanceCsvPreview, commitFinanceCsv, financeCsvAccountId, setFinanceCsvAccountId, financeCsvCommitting,
  financeInsightText, financeInsightGenerating, generateFinanceInsight,
  financeInsightDays, setFinanceInsightDays,
}) {
  if (!financeMigrated) {
    return (
      <div className="elo-scroll" style={css('flex:1;overflow-y:auto;')}>
        <div className={CARD_CLASS} style={css(CARD + 'padding:22px;max-width:560px;margin:40px auto;')}>
          <div style={css('font-size:14px;font-weight:800;margin-bottom:10px;')}>💰 FINANCE isn't set up yet</div>
          <div style={css('font-size:12.5px;line-height:1.6;color:oklch(0.65 0.025 228);')}>
            The Finance tab needs three new tables in Supabase. Run the migration Claude gave you in the SQL editor,
            then reload this tab — everything else here already works, it's just waiting on that.
          </div>
        </div>
      </div>
    );
  }

  const accounts = financeSummary?.accounts || [];
  const assetAccounts = accounts.filter((a) => !a.is_debt);
  const debtAccounts = accounts.filter((a) => a.is_debt);
  const monthlySubTotal = financeSummary?.monthly_subscription_total || 0;

  return (
    <div className="elo-scroll" style={css('flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:16px;padding-right:6px;')}>

      {/* AI INSIGHT -- above FINANCE OVERVIEW (2026-09-04, matching HEALTH's
          same layout: the page leads with the thing that actually changes,
          not a static summary strip). */}
      <div className={CARD_CLASS} style={css(CARD + 'padding:16px;display:flex;flex-direction:column;gap:10px;')}>
        <div style={css('display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;')}>
          <div style={css('font-size:10px;font-weight:700;letter-spacing:0.08em;color:oklch(0.86 0.17 195);')}>⭐ AI INSIGHT</div>
          <div style={css('display:flex;align-items:center;gap:10px;')}>
            <RangePicker value={financeInsightDays} onChange={setFinanceInsightDays} />
            <div
              className="elo-btn-hover"
              onClick={() => { if (!financeInsightGenerating) generateFinanceInsight(); }}
              style={css('font-size:10px;font-weight:700;letter-spacing:0.05em;padding:6px 12px;border-radius:6px;background:oklch(0.2 0.08 228);color:oklch(0.92 0.1 198);border:1px solid oklch(0.78 0.2 200);box-shadow:' + GLOW_STRONG + ';cursor:pointer;white-space:nowrap;')}
            >{financeInsightGenerating ? 'GENERATING…' : 'GENERATE'}</div>
          </div>
        </div>
        <div style={css('font-size:13.5px;line-height:1.55;color:oklch(0.7 0.025 228);')}>
          {financeInsightText || 'No insight yet — hit GENERATE to have AI look for real spending patterns in your imported transactions. Spending feedback only, never investment advice.'}
        </div>
      </div>

      {/* NET WORTH summary strip */}
      <div className={CARD_CLASS} style={css(CARD + 'padding:20px 22px;')}>
        <div style={css('font-size:9.5px;font-weight:700;letter-spacing:0.08em;color:oklch(0.5 0.025 228);margin-bottom:14px;')}>FINANCE OVERVIEW</div>
        {financeSummaryLoading && !financeSummary ? (
          <div style={css('color:oklch(0.5 0.025 228);font-size:12px;')}>Loading…</div>
        ) : (
          <div style={css('display:flex;flex-wrap:wrap;gap:22px;')}>
            <StatBlock label="NET WORTH" value={fmtMoney(financeSummary?.net_worth)} color={GOLD} />
            <StatBlock label="ASSETS" value={fmtMoney(financeSummary?.total_assets)} color="oklch(0.7 0.18 150)" />
            <StatBlock label="DEBT OWED" value={fmtMoney(financeSummary?.total_debts)} color="oklch(0.68 0.19 25)" />
            <StatBlock label="THIS MONTH SPEND" value={fmtMoney(financeSummary?.month_spend)} />
            <StatBlock label="THIS MONTH INCOME" value={fmtMoney(financeSummary?.month_income)} />
            <StatBlock label="SUBSCRIPTIONS / MO" value={fmtMoney(monthlySubTotal)} />
          </div>
        )}
      </div>

      {/* ACCOUNTS */}
      <div style={css('display:flex;gap:16px;flex-wrap:wrap;')}>
        <div className={CARD_CLASS} style={css(CARD + 'padding:20px;flex:1 1 380px;min-width:320px;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;')}>
            <div style={css('font-size:13px;font-weight:800;')}>💵 CASH & INVESTMENTS</div>
            <div className="elo-link-hover" onClick={() => setFinanceAddAccountOpen((o) => !o)} style={css('font-size:16px;font-weight:800;color:oklch(0.86 0.17 195);cursor:pointer;')}>+</div>
          </div>
          {financeAddAccountOpen && <AddAccountForm onAdd={addFinanceAccount} onClose={() => setFinanceAddAccountOpen(false)} />}
          {assetAccounts.length === 0 ? (
            <div style={css('color:oklch(0.5 0.025 228);font-size:12px;padding:8px 0;')}>No accounts yet.</div>
          ) : (
            assetAccounts.map((a) => (
              <AccountRow key={a.id} account={a} onUpdate={updateFinanceAccount} onDelete={deleteFinanceAccount}
                dragging={draggingFinanceAccountId} setDragging={setDraggingFinanceAccountId} onReorder={reorderFinanceAccounts} />
            ))
          )}
        </div>

        <div className={CARD_CLASS} style={css(CARD + 'padding:20px;flex:1 1 380px;min-width:320px;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;')}>
            <div style={css('font-size:13px;font-weight:800;')}>💳 CREDIT & DEBT</div>
          </div>
          {debtAccounts.length === 0 ? (
            <div style={css('color:oklch(0.5 0.025 228);font-size:12px;padding:8px 0;')}>No debt accounts logged.</div>
          ) : (
            debtAccounts.map((a) => (
              <AccountRow key={a.id} account={a} onUpdate={updateFinanceAccount} onDelete={deleteFinanceAccount}
                dragging={draggingFinanceAccountId} setDragging={setDraggingFinanceAccountId} onReorder={reorderFinanceAccounts} />
            ))
          )}
        </div>
      </div>

      {/* SUBSCRIPTIONS */}
      <div className={CARD_CLASS} style={css(CARD + 'padding:20px;')}>
        <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;')}>
          <div style={css('font-size:13px;font-weight:800;')}>🔁 SUBSCRIPTIONS</div>
          <div style={css('display:flex;align-items:center;gap:12px;')}>
            <div style={css('font-size:11px;color:oklch(0.55 0.025 228);')}>{fmtMoney(monthlySubTotal)}/mo total</div>
            <div className="elo-link-hover" onClick={() => setFinanceAddSubOpen((o) => !o)} style={css('font-size:16px;font-weight:800;color:oklch(0.86 0.17 195);cursor:pointer;')}>+</div>
          </div>
        </div>
        {financeAddSubOpen && <AddSubscriptionForm onAdd={addFinanceSubscription} onClose={() => setFinanceAddSubOpen(false)} />}
        {financeSubscriptions.length === 0 ? (
          <div style={css('color:oklch(0.5 0.025 228);font-size:12px;padding:8px 0;')}>No subscriptions logged.</div>
        ) : (
          financeSubscriptions.map((s) => (
            <div key={s.id} style={css('display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid oklch(0.28 0.06 232);')}>
              <div style={css('flex:1;font-size:13px;font-weight:700;')}>{s.name}</div>
              <div style={css('font-size:10.5px;color:oklch(0.5 0.025 228);')}>{s.billing_cycle}</div>
              <div style={css('font-size:13.5px;font-weight:800;white-space:nowrap;')}>{fmtMoney(s.amount)}</div>
              <div className="elo-link-hover" onClick={() => deleteFinanceSubscription(s.id)} style={css('font-size:13px;color:oklch(0.5 0.025 228);cursor:pointer;padding:2px 4px;')}>✕</div>
            </div>
          ))
        )}
      </div>

      {/* CSV IMPORT */}
      <div className={CARD_CLASS} style={css(CARD + 'padding:20px;')}>
        <div style={css('font-size:13px;font-weight:800;margin-bottom:10px;')}>📄 IMPORT TRANSACTIONS</div>
        <CsvImport
          accounts={accounts}
          parseFinanceCsv={parseFinanceCsv} financeCsvPreview={financeCsvPreview} financeCsvParsing={financeCsvParsing}
          cancelFinanceCsvPreview={cancelFinanceCsvPreview} commitFinanceCsv={commitFinanceCsv}
          financeCsvAccountId={financeCsvAccountId} setFinanceCsvAccountId={setFinanceCsvAccountId}
          financeCsvCommitting={financeCsvCommitting}
        />
      </div>

      {/* RECENT TRANSACTIONS */}
      <div className={CARD_CLASS} style={css(CARD + 'padding:16px;')}>
        <div style={css('font-size:10px;font-weight:700;letter-spacing:0.08em;color:oklch(0.55 0.025 228);margin-bottom:12px;')}>RECENT TRANSACTIONS</div>
        {financeTransactions.length === 0 ? (
          <div style={css('color:oklch(0.5 0.025 228);font-size:12.5px;padding:8px 0;')}>No transactions yet — import a CSV above.</div>
        ) : (
          <div className="elo-scroll" style={css('max-height:320px;overflow-y:auto;')}>
            {financeTransactions.slice(0, 100).map((t) => (
              <div key={t.id} style={css('display:flex;align-items:center;gap:12px;padding:7px 4px;border-bottom:1px solid oklch(0.22 0.05 232);')}>
                <div style={css('width:78px;flex-shrink:0;font-size:11px;color:oklch(0.55 0.025 228);')}>{t.txn_date}</div>
                <div style={css('flex:1;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{t.description}</div>
                <div style={css('font-size:12.5px;font-weight:700;white-space:nowrap;color:' + (t.amount < 0 ? 'oklch(0.68 0.19 25)' : 'oklch(0.7 0.18 150)') + ';')}>{fmtMoney(t.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
