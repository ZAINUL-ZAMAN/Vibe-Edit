import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// This client is used on the server (Server Components, Server Actions,
// route handlers) -- it reads/writes the user's session via cookies so
// that being "logged in" persists correctly across page navigations.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component -- safe to ignore since
            // middleware will refresh the session instead.
          }
        },
      },
    }
  )
}
