import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./dashboard-client";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No real session -> straight back to login. A logged-out person
  // should never be able to see this page.
  if (!user) {
    redirect("/login");
  }

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, aspect_ratio, created_at, updated_at")
    .order("updated_at", { ascending: false });

  const displayName =
    (user.user_metadata?.display_name as string | undefined) ||
    user.email?.split("@")[0] ||
    "there";

  // "provider" only records how the account was first created, so someone who
  // signed up with Google and later added a password would still look
  // password-less. Check every provider linked to the account instead.
  const linkedProviders = (user.app_metadata?.providers as string[] | undefined) ?? [];
  const hasPassword =
    user.app_metadata?.provider === "email" ||
    linkedProviders.includes("email") ||
    (user.identities ?? []).some((identity) => identity.provider === "email");

  return (
    <DashboardClient
      displayName={displayName}
      email={user.email ?? ""}
      hasPassword={hasPassword}
      projects={projects ?? []}
      fetchError={error?.message ?? null}
    />
  );
}
