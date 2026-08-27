import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import PinGate from './PinGate';

// Auto-attach the dashboard PIN (once unlocked via PinGate) to every /api/
// request App.js already makes -- App.js has ~50 raw fetch('/api/...') call
// sites, so patching fetch once here avoids editing every single one. A
// no-op when no PIN has been entered (server.js's own PIN check is also a
// no-op when DASHBOARD_PIN isn't configured, so this is harmless either way).
const PIN_KEY = 'elo-os-pin';
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input && input.url;
  if (url && url.startsWith('/api/')) {
    const pin = sessionStorage.getItem(PIN_KEY);
    if (pin) {
      init = { ...(init || {}), headers: { ...((init && init.headers) || {}), 'X-Dashboard-Pin': pin } };
    }
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
