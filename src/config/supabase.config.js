/**
 * Detecta se o Supabase está configurado via variáveis Vite.
 * Sem URL/key o app continua em modo localStorage (dev, testes, demo offline).
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';

export const isSupabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
