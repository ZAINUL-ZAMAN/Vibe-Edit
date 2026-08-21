import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// After a user logs in with Google, Supabase sends their browser here
// with a temporary code. We exchange that code for a real session,
// then send them on to the dashboard (Page 3).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong -- send them back to login with a notice.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
