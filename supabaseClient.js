require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
// Prefer the service-role key -- it never reaches the browser (this file only
// ever runs server-side), and every table's RLS policy is currently wide open
// ("Enable all for public"), so the anon key alone offers no real protection.
// Falls back to the anon key if the service-role one isn't in .env yet, so
// this upgrades automatically the moment it's added -- no other code change
// needed, same pattern as the habit_streak/profile tables.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or a Supabase key (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY) in .env');
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[supabaseClient] Using SUPABASE_ANON_KEY -- add SUPABASE_SERVICE_ROLE_KEY to .env to fix this (Supabase dashboard -> Project Settings -> API Keys -> service_role). See CLAUDE.md.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
