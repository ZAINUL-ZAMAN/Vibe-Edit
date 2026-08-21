import { createBrowserClient } from '@supabase/ssr'

// This client is used inside components that run in the user's browser
// (anything marked "use client"). It reads the public env vars, which
// are safe to expose -- real protection comes from Row Level Security
// rules configured on the Supabase project itself.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
