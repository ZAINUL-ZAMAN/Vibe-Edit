"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const ALLOWED_ASPECT_RATIOS = ["16:9", "9:16"];
const MIN_PASSWORD_LENGTH = 6;
const MAX_DISPLAY_NAME_LENGTH = 50;

export async function createProject(aspectRatio: "16:9" | "9:16") {
  // Server Actions are public endpoints, so check the value here as well
  // instead of trusting that the button in the browser sent a valid one.
  if (!ALLOWED_ASPECT_RATIOS.includes(aspectRatio)) {
    return { error: "Invalid aspect ratio." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name: "Untitled Project",
      aspect_ratio: aspectRatio,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  // Hand off to the editor with the new project's ID so it knows what
  // it's working on.
  redirect(`/editor?project=${data.id}`);
}

export async function deleteProject(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not logged in." };
  }

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", user.id); // belt-and-suspenders on top of RLS

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateDisplayName(name: string) {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { error: "Display name can't be empty." };
  }
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return { error: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not logged in." };
  }

  const { error } = await supabase.auth.updateUser({
    data: { display_name: trimmed },
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return { success: true };
}

export async function updatePassword(newPassword: string) {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not logged in." };
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
