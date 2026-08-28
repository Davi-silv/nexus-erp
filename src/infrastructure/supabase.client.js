import { createClient } from '@supabase/supabase-js';
import { isSupabaseEnabled, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/supabase.config.js';

/** @type {import('@supabase/supabase-js').SupabaseClient | null} */
let client = null;

export function getSupabaseClient() {
  if (!isSupabaseEnabled) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
  return client;
}
