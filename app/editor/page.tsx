import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditorClient from "./editor-client";

export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { project: projectId } = await searchParams;

  let projectName = "Untitled Project";
  let aspectRatio: "16:9" | "9:16" = "16:9";

  if (projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("name, aspect_ratio")
      .eq("id", projectId)
      .maybeSingle();

    // A project id that doesn't exist (or belongs to someone else, which
    // Row Level Security makes look the same) used to silently open a blank
    // "Untitled Project". Send the person back to their dashboard instead.
    if (!project) {
      redirect("/dashboard");
    }

    projectName = project.name;
    aspectRatio = project.aspect_ratio as "16:9" | "9:16";
  }

  return (
    <EditorClient
      projectId={projectId ?? null}
      projectName={projectName}
      aspectRatio={aspectRatio}
    />
  );
}
