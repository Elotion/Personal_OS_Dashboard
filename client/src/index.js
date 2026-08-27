import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import PinGate from './PinGate';

// Auto-attach the dashboard PIN and/or Google session token (once unlocked
// via PinGate) to every /api/ request App.js already makes -- App.js has
// ~50 raw fetch('/api/...') call sites, so patching fetch once here avoids
// editing every single one. A no-op when neither credential is present
// (server.js's own auth check is also a no-op when neither DASHBOARD_PIN
// nor AUTHORIZED_GOOGLE_EMAIL is configured, so this is harmless either way).
const PIN_KEY = 'elo-os-pin';
const SESSION_KEY = 'elo-os-session-token';
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input && input.url;
  if (url && url.startsWith('/api/')) {
    const headers = { ...((init && init.headers) || {}) };
    const pin = sessionStorage.getItem(PIN_KEY);
    if (pin) headers['X-Dashboard-Pin'] = pin;
    const sessionToken = localStorage.getItem(SESSION_KEY);
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    if (pin || sessionToken) init = { ...(init || {}), headers };
  }
  return nativeFetch(input, init);
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <PinGate>
      <App />
    </PinGate>
  </React.StrictMode>
);
