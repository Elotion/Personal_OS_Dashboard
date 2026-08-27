import React, { useEffect, useState } from 'react';

// Gate added 2026-08-26 -- this app's whole API had zero auth once it went
// public on Railway (anyone with the URL could read/write/delete everything,
// or burn Elo's Anthropic/OpenAI quota via the AI-backed routes). Elo asked
// for "a simple pin every time I log on" rather than a full login system.
// PIN lives in sessionStorage (not localStorage) deliberately -- clears when
// the browser tab/window closes, matching "every time I log on" rather than
// "once ever." The matching server-side check (server.js) is a no-op when
// DASHBOARD_PIN isn't set, so this gate is invisible in local dev unless Elo
// sets the same var there too.
const PIN_KEY = 'elo-os-pin';

async function verifyPin(candidate) {
  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: candidate }),
    });
    const data = await res.json();
    return !!data.ok;
  } catch {
    return false; // backend unreachable -- fail closed, not open
  }
}

export default function PinGate({ children }) {
  const [status, setStatus] = useState('checking'); // checking | locked | unlocked
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const stored = sessionStorage.getItem(PIN_KEY) || '';
    verifyPin(stored).then((ok) => {
      if (ok) {
        setStatus('unlocked');
      } else {
        sessionStorage.removeItem(PIN_KEY);
        setStatus('locked');
      }
    });
  }, []);

  async function submit(e) {
    e.preventDefault();
    const ok = await verifyPin(pin);
    if (ok) {
      sessionStorage.setItem(PIN_KEY, pin);
      setStatus('unlocked');
    } else {
      setError('Wrong PIN.');
      setPin('');
    }
  }

  if (status === 'checking') return null;
  if (status === 'unlocked') return children;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'oklch(0.1 0.03 240)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          width: 260,
          padding: 32,
          borderRadius: 14,
          background: 'oklch(0.15 0.05 240)',
          border: '1px solid oklch(0.45 0.1 210 / 40%)',
        }}
      >
        <div style={{ color: 'oklch(0.92 0.02 228)', fontSize: 18, fontWeight: 700, textAlign: 'center' }}>
          🔒 Elo // OS
        </div>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => { setPin(e.target.value); setError(''); }}
          placeholder="Enter PIN"
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid oklch(0.45 0.1 210 / 50%)',
            background: 'oklch(0.12 0.05 240)',
            color: 'oklch(0.92 0.02 228)',
            fontSize: 16,
            textAlign: 'center',
            letterSpacing: '0.15em',
            outline: 'none',
          }}
        />
        {error && <div style={{ color: 'oklch(0.65 0.2 25)', fontSize: 12, textAlign: 'center' }}>{error}</div>}
        <button
          type="submit"
          className="elo-btn-hover"
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: 'none',
            background: 'oklch(0.86 0.17 195)',
            color: 'oklch(0.12 0.05 240)',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
