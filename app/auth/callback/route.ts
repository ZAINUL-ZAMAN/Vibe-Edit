import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Only allow redirecting to a path inside this site. Anything else (a full
// URL, "//other-site.com", or "@other-site.com") falls back to the dashboard,
// so this route can never be used to bounce someone to another website.
function safeNextPath(value: string | null): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/dashboard";
  }
  return value;
}

// After a user logs in with Google, Supabase sends their browser here
// with a temporary code. We exchange that code for a real session,
// then send them on to the dashboard (Page 3).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

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
