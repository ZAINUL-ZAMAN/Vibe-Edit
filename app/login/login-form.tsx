"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export default function LoginForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      setMessage("Check your email to confirm your account before logging in.");
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) setError(error.message);
    // On success, Supabase redirects the browser to Google automatically --
    // no further code needed here.
  }

  return (
    <div className="w-full max-w-md">
      <div className="glass-panel border border-outline-variant p-8 md:p-10">
        <div className="mb-8">
          <span className="font-label-caps text-[10px] text-secondary uppercase tracking-widest">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </span>
          <h1 className="font-display-lg text-primary text-3xl mt-2 leading-tight">
            {mode === "login" ? "Log in to Vibe Edit" : "Sign up for Vibe Edit"}
          </h1>
        </div>

        {/* Google OAuth */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 border border-outline-variant hover:border-primary transition-all duration-300 blueprint-glow py-3 mb-6 font-body-md text-sm text-primary"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z"
              fill="#34A853"
            />
            <path
              d="M3.95 10.7A5.41 5.41 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-outline-variant/40" />
          <span className="font-code-sm text-[10px] text-outline uppercase tracking-widest">or</span>
          <div className="h-px flex-1 bg-outline-variant/40" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="mt-2 w-full bg-surface-container-lowest border border-outline-variant focus:border-secondary px-4 py-3 text-primary text-sm outline-none transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="mt-2 w-full bg-surface-container-lowest border border-outline-variant focus:border-secondary px-4 py-3 text-primary text-sm outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-error text-sm font-body-md" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="text-tertiary-container text-sm font-body-md" role="status">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 bg-primary text-background border border-primary px-8 py-3 font-label-caps text-[10px] uppercase tracking-widest hover:bg-secondary hover:border-secondary hover:text-background transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? "Please wait..."
              : mode === "login"
              ? "Log In"
              : "Create Account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-on-surface-variant">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setMessage(null);
            }}
            className="text-secondary hover:underline"
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}
