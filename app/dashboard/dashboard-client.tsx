"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  createProject,
  deleteProject,
  updateDisplayName,
  updatePassword,
  logout,
} from "./actions";

type Project = {
  id: string;
  name: string;
  aspect_ratio: string;
  created_at: string;
  updated_at: string;
};

type Props = {
  displayName: string;
  email: string;
  hasPassword: boolean;
  projects: Project[];
  fetchError: string | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function DashboardClient({
  displayName,
  email,
  hasPassword,
  projects,
  fetchError,
}: Props) {
  const [showNewProjectMenu, setShowNewProjectMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreateProject(ratio: "16:9" | "9:16") {
    startTransition(() => {
      createProject(ratio);
    });
  }

  function handleDelete(projectId: string) {
    startTransition(async () => {
      await deleteProject(projectId);
      setConfirmDeleteId(null);
      setOpenMenuId(null);
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="w-full sticky top-0 z-40 border-b border-outline-variant flex justify-between items-center px-4 md:px-12 py-4 glass-panel border-x-0 border-t-0">
        <Link href="/" className="flex items-center h-8 gap-2">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="26" height="26" rx="6" stroke="#d2bbff" strokeWidth="1.5" />
            <path d="M8 9L13 19M20 9L15 19" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="font-display-lg text-primary text-[18px]">Vibe Edit</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="hidden sm:block font-code-sm text-code-sm text-on-surface-variant">
            {displayName}
          </span>
          <button
            onClick={() => setShowSettings(true)}
            className="border border-outline-variant hover:border-secondary hover:text-secondary p-2 transition-all duration-300 blueprint-glow"
            aria-label="Settings"
          >
            <span className="material-symbols-outlined text-[18px] block">settings</span>
          </button>
          <button
            onClick={() => startTransition(() => logout())}
            className="font-label-caps text-label-caps text-on-surface-variant hover:text-primary uppercase tracking-widest transition-colors"
          >
            Log out
          </button>
        </div>
      </nav>

      <main className="flex-grow px-4 md:px-12 py-12 max-w-7xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <div>
            <span className="font-label-caps text-label-caps text-secondary uppercase tracking-widest">
              Dashboard
            </span>
            <h1 className="font-display-lg text-primary text-3xl mt-2">
              Welcome back, {displayName}
            </h1>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowNewProjectMenu(!showNewProjectMenu)}
              className="flex items-center gap-2 bg-primary text-background border border-primary px-6 py-3 font-label-caps text-label-caps uppercase tracking-widest hover:bg-secondary hover:border-secondary hover:text-background transition-all duration-300"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Start a New Project
            </button>

            {showNewProjectMenu && (
              <div className="absolute right-0 mt-2 w-56 glass-panel border border-outline-variant p-2 z-30">
                <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest px-3 pt-2 pb-1">
                  Choose aspect ratio
                </p>
                <button
                  disabled={isPending}
                  onClick={() => handleCreateProject("16:9")}
                  className="w-full text-left px-3 py-3 hover:bg-surface-container-high transition-colors flex items-center justify-between disabled:opacity-50"
                >
                  <span className="text-sm text-primary">16:9</span>
                  <span className="text-xs text-outline">Landscape</span>
                </button>
                <button
                  disabled={isPending}
                  onClick={() => handleCreateProject("9:16")}
                  className="w-full text-left px-3 py-3 hover:bg-surface-container-high transition-colors flex items-center justify-between disabled:opacity-50"
                >
                  <span className="text-sm text-primary">9:16</span>
                  <span className="text-xs text-outline">Portrait</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {fetchError && (
          <div className="border border-error/40 bg-error-container/10 text-error px-4 py-3 mb-6 text-sm">
            Couldn&apos;t load your projects: {fetchError}
          </div>
        )}

        {!fetchError && projects.length === 0 && (
          <div className="glass-panel border border-outline-variant p-16 text-center">
            <span className="material-symbols-outlined text-outline text-[40px]">movie</span>
            <p className="text-on-surface-variant mt-4">
              No projects yet. Start your first one above.
            </p>
          </div>
        )}

        {projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group relative bg-surface-container-lowest border border-outline-variant hover:border-secondary transition-colors"
              >
                <Link href={`/editor?project=${project.id}`} className="block">
                  <div
                    className={`bg-surface-container-high flex items-center justify-center text-outline ${
                      project.aspect_ratio === "9:16" ? "aspect-[9/16]" : "aspect-video"
                    }`}
                  >
                    <span className="material-symbols-outlined text-[32px] opacity-40">movie</span>
                  </div>
                  <div className="p-4">
                    <p className="text-primary text-sm font-body-md truncate">{project.name}</p>
                    <p className="text-outline text-xs mt-1 font-code-sm">
                      {project.aspect_ratio} &middot; {formatDate(project.updated_at)}
                    </p>
                  </div>
                </Link>

                {/* Three-dot menu, shown on hover */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setOpenMenuId(openMenuId === project.id ? null : project.id);
                    }}
                    className="w-8 h-8 flex items-center justify-center bg-background/80 border border-outline-variant hover:border-secondary"
                    aria-label="Project options"
                  >
                    <span className="material-symbols-outlined text-[16px]">more_vert</span>
                  </button>

                  {openMenuId === project.id && (
                    <div className="absolute right-0 mt-1 w-40 glass-panel border border-outline-variant py-1 z-20">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          setConfirmDeleteId(project.id);
                          setOpenMenuId(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-error hover:bg-error-container/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="glass-panel border border-outline-variant p-8 max-w-sm w-full">
            <h3 className="font-headline-md text-headline-md text-primary mb-2">Delete this project?</h3>
            <p className="text-on-surface-variant text-sm mb-6">
              This can&apos;t be undone. The project and its settings will be permanently removed.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-5 py-2 font-label-caps text-label-caps uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={isPending}
                onClick={() => handleDelete(confirmDeleteId)}
                className="px-5 py-2 bg-error text-on-error font-label-caps text-label-caps uppercase tracking-widest disabled:opacity-50"
              >
                {isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          displayName={displayName}
          email={email}
          hasPassword={hasPassword}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function SettingsModal({
  displayName,
  email,
  hasPassword,
  onClose,
}: {
  displayName: string;
  email: string;
  hasPassword: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(displayName);
  const [newPassword, setNewPassword] = useState("");
  const [nameStatus, setNameStatus] = useState<string | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSaveName() {
    startTransition(async () => {
      const result = await updateDisplayName(name);
      setNameStatus(result?.error ? result.error : "Saved.");
    });
  }

  function handleSavePassword() {
    if (newPassword.length < 6) {
      setPasswordStatus("Password must be at least 6 characters.");
      return;
    }
    startTransition(async () => {
      const result = await updatePassword(newPassword);
      setPasswordStatus(result?.error ? result.error : "Password updated.");
      if (!result?.error) setNewPassword("");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="glass-panel border border-outline-variant p-8 max-w-md w-full">
        <div className="flex justify-between items-start mb-6">
          <h3 className="font-headline-md text-headline-md text-primary text-xl">Settings</h3>
          <button onClick={onClose} className="text-outline hover:text-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <p className="text-outline text-xs font-code-sm mb-6">{email}</p>

        <div className="mb-6">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest">
            Display name
          </label>
          <div className="flex gap-2 mt-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 bg-surface-container-lowest border border-outline-variant focus:border-secondary px-3 py-2 text-primary text-sm outline-none"
            />
            <button
              disabled={isPending}
              onClick={handleSaveName}
              className="px-4 py-2 border border-outline-variant hover:border-secondary hover:text-secondary text-sm transition-colors disabled:opacity-50"
            >
              Save
            </button>
          </div>
          {nameStatus && <p className="text-xs text-on-surface-variant mt-2">{nameStatus}</p>}
        </div>

        <div>
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest">
            {hasPassword ? "Change password" : "Set a password"}
          </label>
          {!hasPassword && (
            <p className="text-xs text-outline mt-1 mb-2">
              You signed up with Google, so you don&apos;t have a password yet. Set one here if you&apos;d like to log in without Google in the future.
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="flex-1 bg-surface-container-lowest border border-outline-variant focus:border-secondary px-3 py-2 text-primary text-sm outline-none"
            />
            <button
              disabled={isPending}
              onClick={handleSavePassword}
              className="px-4 py-2 border border-outline-variant hover:border-secondary hover:text-secondary text-sm transition-colors disabled:opacity-50"
            >
              Save
            </button>
          </div>
          {passwordStatus && <p className="text-xs text-on-surface-variant mt-2">{passwordStatus}</p>}
        </div>
      </div>
    </div>
  );
}
