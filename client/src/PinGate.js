import React, { useEffect, useRef, useState } from 'react';

// Gate added 2026-08-26, extended same day to also support Google Sign-In --
// this app's whole API had zero auth once it went public on Railway (anyone
// with the URL could read/write/delete everything, or burn Elo's Anthropic/
// OpenAI quota via the AI-backed routes). Elo asked to defer the PIN but
// wants Google login working now, so this gate checks GET /api/auth/config
// on mount and shows whichever method(s) are actually configured server-side
// -- if neither is configured, this renders nothing and the app loads
// straight through, matching the backend's own no-op-when-unconfigured rule.
//
// PIN lives in sessionStorage (clears on tab/browser close -- Elo's own
// "every time I log on" framing). The Google session token lives in
// localStorage instead (persists across restarts, matching normal "stay
// signed in with Google" behavior) -- flagged as a deliberate difference,
// not an inconsistency: a PIN is meant to be re-typed each visit, a Google
// login is meant to stick until you sign out or the server-side session
// expires/resets (see the SESSION_TTL_MS / in-memory-session note in
// server.js for the one real limitation of that: it resets on every
// redeploy).
const PIN_KEY = 'elo-os-pin';
const SESSION_KEY = 'elo-os-session-token';

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

async function verifySession(token) {
  if (!token) return false;
  try {
    // Any cheap authenticated route works as a session check -- /api/entities
    // is small and already fetched again immediately after unlock anyway.
    const res = await fetch('/api/entities', { headers: { 'X-Session-Token': token } });
    return res.status !== 401;
  } catch {
    return false;
  }
}

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.id) return resolve();
    const existing = document.getElementById('google-identity-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-identity-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function PinGate({ children }) {
  const [status, setStatus] = useState('checking'); // checking | locked | unlocked
  const [config, setConfig] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const googleButtonRef = useRef(null);

  useEffect(() => {
    (async () => {
      let cfg;
      try {
        cfg = await fetch('/api/auth/config').then((r) => r.json());
      } catch {
        // Backend unreachable -- can't confirm the gate is off, so stay
        // locked rather than silently granting access.
        setConfig({ pinEnabled: false, googleEnabled: false });
        setStatus('locked');
        return;
      }
      setConfig(cfg);

      if (!cfg.pinEnabled && !cfg.googleEnabled) {
        setStatus('unlocked');
        return;
      }

      const storedSession = localStorage.getItem(SESSION_KEY);
      if (storedSession && (await verifySession(storedSession))) {
        setStatus('unlocked');
        return;
      }
      if (storedSession) localStorage.removeItem(SESSION_KEY);

      const storedPin = sessionStorage.getItem(PIN_KEY);
      if (storedPin && (await verifyPin(storedPin))) {
        setStatus('unlocked');
        return;
      }
      if (storedPin) sessionStorage.removeItem(PIN_KEY);

      setStatus('locked');
    })();
  }, []);

  // Once locked and Google login is enabled, load the Identity Services
  // script and render the real "Sign in with Google" button into our own
  // div -- Google's script owns that button's markup/rendering directly.
  useEffect(() => {
    if (status !== 'locked' || !config || !config.googleEnabled || !config.googleClientId) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !googleButtonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: async (response) => {
            try {
              const res = await fetch('/api/auth/google-verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential: response.credential }),
              });
              const data = await res.json();
              if (res.ok && data.sessionToken) {
                localStorage.setItem(SESSION_KEY, data.sessionToken);
                setStatus('unlocked');
              } else {
                setError(data.error || 'That Google account is not authorized for this dashboard.');
              }
            } catch {
              setError('Could not verify Google sign-in -- check your connection and try again.');
            }
          },
        });
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'filled_black',
          size: 'large',
          shape: 'pill',
        });
      })
      .catch(() => setError('Could not load Google Sign-In -- check your connection and try again.'));
    return () => { cancelled = true; };
  }, [status, config]);

  async function submitPin(e) {
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

  const showBoth = config && config.pinEnabled && config.googleEnabled;

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
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          width: 280,
          padding: 32,
          borderRadius: 14,
          background: 'oklch(0.15 0.05 240)',
          border: '1px solid oklch(0.45 0.1 210 / 40%)',
        }}
      >
        <div style={{ color: 'oklch(0.92 0.02 228)', fontSize: 18, fontWeight: 700, textAlign: 'center' }}>
          🔒 Elo // OS
        </div>

        {config && config.googleEnabled && (
          <div ref={googleButtonRef} style={{ display: 'flex', justifyContent: 'center' }} />
        )}

        {showBoth && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'oklch(0.55 0.025 228)', fontSize: 11 }}>
            <div style={{ flex: 1, height: 1, background: 'oklch(0.45 0.1 210 / 30%)' }} />
            OR
            <div style={{ flex: 1, height: 1, background: 'oklch(0.45 0.1 210 / 30%)' }} />
          </div>
        )}

        {config && config.pinEnabled && (
          <form onSubmit={submitPin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="password"
              inputMode="numeric"
              autoFocus={!config.googleEnabled}
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
        )}

        {error && <div style={{ color: 'oklch(0.65 0.2 25)', fontSize: 12, textAlign: 'center' }}>{error}</div>}
      </div>
    </div>
  );
}
