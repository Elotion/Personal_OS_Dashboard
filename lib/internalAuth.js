// A secret shared ONLY between this Node process's own internal HTTP calls
// (the Telegram agent's tool executors in lib/tools.js and lib/telegram.js,
// which fetch http://localhost:PORT/api/... from inside this same
// process/container) and its own HTTP server (server.js). Not a real secret
// in the security sense -- nothing outside this container can ever reach
// localhost:PORT to begin with -- just a deterministic bypass for the
// access-control gate that doesn't depend on correctly detecting a loopback
// IP, which had never actually been verified against Railway's real
// networking (every prior "verified end-to-end" Telegram test ran locally,
// where the gate is a no-op either way). Elo, 2026-08-29: "I want to be able
// to update my dashboard on my telegram even though my dashboard mightve
// been logged out from google" -- this guarantees exactly that,
// unconditionally, regardless of PIN/Google session state.
//
// Generated fresh at process start, not persisted -- both server.js and
// lib/tools.js `require()` this same module instance within the same
// process (Node's module cache guarantees an identical value), which is all
// that's needed since the header exchange only ever happens within that
// one process's own lifetime.
const crypto = require('crypto');
const INTERNAL_SECRET = crypto.randomBytes(32).toString('hex');

module.exports = { INTERNAL_SECRET };
