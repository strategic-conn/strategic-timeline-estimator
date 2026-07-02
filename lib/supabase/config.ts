/**
 * Whether the Supabase backend is wired up. True only when both public env vars
 * are present. The whole Phase-1 auth layer keys off this: when false, the app
 * falls back to the Zustand + localStorage demo (so teammates without a
 * `.env.local` still run it unchanged).
 *
 * Safe to read on client and server — NEXT_PUBLIC_* values are inlined at build.
 */
export const isSupabaseConfigured =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
