"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/toast";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#docs", label: "Documentation" },
  { href: "#faq", label: "FAQ" },
];

const FEATURES = [
  {
    icon: "terminal",
    title: "Code-driven editing",
    body: "Write your edit as a short script. No hunting through nested menus \u2014 every effect is a line you can read back.",
  },
  {
    icon: "timeline",
    title: "Frame-accurate timeline",
    body: "Every effect applies exactly where you tell it to, down to the frame, and only for the window you set.",
  },
  {
    icon: "key",
    title: "Chroma key built in",
    body: "Pull a subject off a green screen and place it anywhere in the frame, at any size, at any point in time.",
  },
  {
    icon: "auto_awesome",
    title: "Bring your own AI",
    body: "Describe the edit to any AI assistant, paste back the code it writes. No subscription to an AI baked in required.",
  },
  {
    icon: "bolt",
    title: "Runs entirely in-browser",
    body: "No install, no upload to a render farm. Your footage stays on your machine until you choose to export.",
  },
  {
    icon: "straighten",
    title: "Precise placement",
    body: "A real ruler alongside your preview so position and size are exact measurements, not guesswork.",
  },
];

const STEPS = [
  { n: "01", title: "Describe the edit", body: "Tell any AI assistant what you want, in plain language." },
  { n: "02", title: "Get the script", body: "The assistant writes it back to you in Vibe Edit's syntax." },
  { n: "03", title: "Drop in footage", body: "Paste the script and drop your clips into the editor." },
  { n: "04", title: "Render and download", body: "Everything renders locally in your browser. Export when ready." },
];

const FAQS = [
  {
    q: "Do I need to know how to code?",
    a: "No. You describe your edit to an AI assistant in plain language, and it writes the script for you in Vibe Edit's syntax.",
  },
  {
    q: "Does my footage get uploaded to a server?",
    a: "Rendering happens locally in your browser. Your footage stays on your device unless you choose to save a project to your account.",
  },
  {
    q: "What video formats are supported?",
    a: "Common formats like MP4 and MOV coming in, exported as MP4 up to 1080p.",
  },
];

export default function LandingPage() {
  const { showToast, Toast } = useToast();
  const [playing, setPlaying] = useState(true);

  return (
    <div id="top" className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="w-full sticky top-0 z-50 border-b border-outline-variant flex justify-between items-center px-4 md:px-12 py-4 glass-panel border-x-0 border-t-0">
        <a href="#top" className="flex items-center h-8 gap-2">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="26" height="26" rx="6" stroke="#d2bbff" strokeWidth="1.5" />
            <path d="M8 9L13 19M20 9L15 19" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="font-display-lg text-primary text-[18px]">Vibe Edit</span>
        </a>
        <div className="hidden md:flex gap-6 items-center">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-on-surface-variant font-body-md hover:text-primary transition-colors duration-200 cursor-pointer"
            >
              {link.label}
            </a>
          ))}
        </div>
        <Link
          href="/login"
          className="border border-outline-variant hover:border-secondary hover:text-secondary px-4 py-2 font-label-caps text-label-caps uppercase tracking-widest transition-all duration-300 blueprint-glow"
        >
          Get Started
        </Link>
      </nav>

      <main className="flex-grow flex flex-col relative overflow-hidden">
        {/* Hero */}
        <section className="flex flex-col justify-center px-4 md:px-12 py-24 relative">
          <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center z-10">
            <div className="space-y-8 flex flex-col justify-center">
              <div>
                <span className="font-label-caps text-label-caps text-secondary uppercase tracking-widest">
                  Browser-based &middot; No install
                </span>
                <h1 className="font-display-lg text-display-lg text-primary mt-4 mb-4 leading-tight">
                  The Future of VFX<br />is <span className="text-secondary">Code.</span>
                </h1>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-md text-lg leading-relaxed">
                  Describe the edit you want to any AI assistant, paste the code it writes, drop in your footage, and render \u2014 entirely in your browser.
                </p>
              </div>
              <div className="flex gap-4 flex-wrap">
                <Link
                  href="/editor"
                  className="bg-primary text-background border border-primary px-8 py-3 font-label-caps text-label-caps uppercase tracking-widest hover:bg-secondary hover:border-secondary hover:text-background transition-all duration-300"
                >
                  Launch Editor
                </Link>
                <button
                  onClick={() => showToast("Demo video coming soon")}
                  className="border border-outline-variant text-primary px-8 py-3 font-label-caps text-label-caps uppercase tracking-widest hover:border-primary transition-all duration-300 blueprint-glow flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">play_arrow</span> View Demo
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-8 border-t border-outline-variant/30">
                <div>
                  <div className="font-label-caps text-label-caps text-secondary mb-1">01</div>
                  <div className="font-code-sm text-code-sm text-on-surface">Script-Driven Motion</div>
                </div>
                <div>
                  <div className="font-label-caps text-label-caps text-secondary mb-1">02</div>
                  <div className="font-code-sm text-code-sm text-on-surface">Timeline Precision</div>
                </div>
                <div>
                  <div className="font-label-caps text-label-caps text-secondary mb-1">03</div>
                  <div className="font-code-sm text-code-sm text-on-surface">Runs In-Browser</div>
                </div>
              </div>
            </div>

            <div className="relative grid grid-cols-1 md:grid-cols-2 gap-2 p-2 glass-panel border border-outline-variant h-[500px]">
              <div className="bg-surface-dim border border-outline-variant/50 p-4 font-code-sm text-code-sm overflow-hidden flex flex-col">
                <div className="flex justify-between items-center mb-4 border-b border-outline-variant/30 pb-2">
                  <span className="text-outline">overlay_node.vibe</span>
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-outline-variant" />
                    <div className="w-2 h-2 rounded-full bg-outline-variant" />
                    <div className="w-2 h-2 rounded-full bg-outline-variant" />
                  </div>
                </div>
                <pre className="text-on-surface-variant overflow-x-auto whitespace-pre-wrap">
                  <span className="text-secondary">trim</span>(clip: <span className="text-tertiary-container">&quot;intro_01&quot;</span>, start: <span className="text-tertiary-container">0</span>, end: <span className="text-tertiary-container">5</span>)
                  {"\n\n"}
                  <span className="text-secondary">overlay</span>(
                  {"\n  "}clip: <span className="text-tertiary-container">&quot;logo_02&quot;</span>,
                  {"\n  "}time: [<span className="text-tertiary-container">3</span>, <span className="text-tertiary-container">6</span>],
                  {"\n  "}x: <span className="text-tertiary-container">10cm</span>, y: <span className="text-tertiary-container">4cm</span>,
                  {"\n  "}size: <span className="text-tertiary-container">20cm</span>
                  {"\n"})
                  {"\n\n"}
                  <span className="text-secondary">render</span>()
                </pre>
                <div className="mt-auto border-t border-outline-variant/30 pt-2 flex justify-between items-center text-outline text-[10px]">
                  <span>UTF-8</span>
                  <span>Vibe Syntax</span>
                </div>
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant/50 relative overflow-hidden group">
                <div className="absolute inset-0 bg-surface-container flex items-center justify-center text-outline">
                  <svg className="absolute inset-0 w-full h-full opacity-60" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
                    <defs>
                      <linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#1c1b1b" />
                        <stop offset="60%" stopColor="#25005a" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#004e60" stopOpacity="0.5" />
                      </linearGradient>
                    </defs>
                    <rect width="400" height="400" fill="url(#heroGrad)" />
                    <g stroke="#d2bbff" strokeOpacity="0.35" strokeWidth="1">
                      <line x1="0" y1="120" x2="400" y2="120" />
                      <line x1="0" y1="240" x2="400" y2="240" />
                      <line x1="130" y1="0" x2="130" y2="400" />
                      <line x1="270" y1="0" x2="270" y2="400" />
                    </g>
                    <circle cx="270" cy="120" r="36" fill="none" stroke="#4cd6ff" strokeWidth="1.5" />
                  </svg>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-8 bg-surface/90 border-t border-outline-variant flex items-center px-2 gap-2">
                  <span
                    className="material-symbols-outlined text-[14px] text-secondary cursor-pointer"
                    onClick={() => setPlaying(!playing)}
                  >
                    {playing ? "pause" : "play_arrow"}
                  </span>
                  <div className="flex-grow h-[1px] bg-outline-variant relative">
                    <div className="absolute top-1/2 -translate-y-1/2 left-0 h-[1px] bg-secondary w-[45%]" />
                    <div className="absolute top-1/2 -translate-y-1/2 left-[45%] w-2 h-2 bg-primary rotate-45 border border-background" />
                  </div>
                  <span className="font-code-sm text-[10px] text-outline">00:02:14:08</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="px-4 md:px-12 py-24 border-t border-outline-variant/30">
          <div className="max-w-7xl mx-auto">
            <div className="mb-14 max-w-2xl">
              <span className="font-label-caps text-label-caps text-secondary uppercase tracking-widest">Features</span>
              <h2 className="font-display-lg text-primary text-3xl md:text-4xl mt-3 leading-tight">
                Built for editors who think in logic, not layers.
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-outline-variant/30 border border-outline-variant/30">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="bg-background p-8 flex flex-col gap-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(210,187,255,0.08)] hover:border-secondary"
                >
                  <span className="material-symbols-outlined text-secondary text-[28px]">{f.icon}</span>
                  <h3 className="font-headline-md text-headline-md text-primary">{f.title}</h3>
                  <p className="text-on-surface-variant text-sm leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="px-4 md:px-12 py-24 border-t border-outline-variant/30 bg-surface-container-lowest/40">
          <div className="max-w-7xl mx-auto">
            <div className="mb-14 max-w-2xl">
              <span className="font-label-caps text-label-caps text-secondary uppercase tracking-widest">How it works</span>
              <h2 className="font-display-lg text-primary text-3xl md:text-4xl mt-3 leading-tight">
                From a sentence to a rendered clip.
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {STEPS.map((s) => (
                <div key={s.n} className="flex flex-col gap-3">
                  <div className="font-code-sm text-code-sm text-secondary">STEP {s.n}</div>
                  <div className="h-px w-full" style={{ background: "linear-gradient(180deg, rgba(210,187,255,0.5), rgba(210,187,255,0))" }} />
                  <h3 className="font-headline-md text-headline-md text-primary text-lg">{s.title}</h3>
                  <p className="text-on-surface-variant text-sm leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Docs teaser */}
        <section id="docs" className="px-4 md:px-12 py-24 border-t border-outline-variant/30">
          <div className="max-w-7xl mx-auto glass-panel border border-outline-variant p-10 md:p-14 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="max-w-xl">
              <span className="font-label-caps text-label-caps text-secondary uppercase tracking-widest">Documentation</span>
              <h2 className="font-display-lg text-primary text-2xl md:text-3xl mt-3 leading-tight">
                The full syntax library lives in its own workspace.
              </h2>
              <p className="text-on-surface-variant text-sm leading-relaxed mt-3">
                Every function, every parameter, with copyable examples ready to hand to your AI assistant of choice.
              </p>
            </div>
            <button
              onClick={() => showToast("Documentation workspace coming soon")}
              className="shrink-0 bg-primary text-background border border-primary px-8 py-3 font-label-caps text-label-caps uppercase tracking-widest hover:bg-secondary hover:border-secondary hover:text-background transition-all duration-300"
            >
              Open Documentation
            </button>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="px-4 md:px-12 py-24 border-t border-outline-variant/30">
          <div className="max-w-4xl mx-auto">
            <div className="mb-10">
              <span className="font-label-caps text-label-caps text-secondary uppercase tracking-widest">FAQ</span>
              <h2 className="font-display-lg text-primary text-3xl md:text-4xl mt-3 leading-tight">Common questions</h2>
            </div>
            <div className="divide-y divide-outline-variant/30 border-t border-b border-outline-variant/30">
              {FAQS.map((item) => (
                <details key={item.q} className="group py-5">
                  <summary className="flex justify-between items-center cursor-pointer list-none">
                    <span className="font-headline-md text-headline-md text-primary text-base">{item.q}</span>
                    <span className="material-symbols-outlined text-secondary transition-transform group-open:rotate-45">add</span>
                  </summary>
                  <p className="text-on-surface-variant text-sm leading-relaxed mt-3">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="px-4 md:px-12 py-24 border-t border-outline-variant/30 text-center">
          <div className="max-w-2xl mx-auto flex flex-col items-center gap-6">
            <h2 className="font-display-lg text-primary text-3xl md:text-4xl leading-tight">
              Start editing with a script, not a stack of menus.
            </h2>
            <Link
              href="/editor"
              className="bg-primary text-background border border-primary px-10 py-4 font-label-caps text-label-caps uppercase tracking-widest hover:bg-secondary hover:border-secondary hover:text-background transition-all duration-300"
            >
              Launch Editor
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full mt-auto border-t border-outline-variant flex flex-col md:flex-row justify-between items-center px-4 md:px-12 py-8 gap-4 glass-panel">
        <div className="flex items-center gap-4">
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-80">
            <rect x="1" y="1" width="26" height="26" rx="6" stroke="#d2bbff" strokeWidth="1.5" />
            <path d="M8 9L13 19M20 9L15 19" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="font-label-caps text-label-caps text-primary uppercase tracking-widest text-outline">
            &copy; 2026 Vibe Edit. Code-driven video editing.
          </span>
        </div>
        <div className="flex gap-6">
          {["Terms", "Privacy", "Github", "Discord"].map((label) => (
            <button
              key={label}
              onClick={() => showToast(`${label} page coming soon`)}
              className="text-outline hover:text-secondary transition-colors cursor-pointer font-code-sm text-code-sm"
            >
              {label}
            </button>
          ))}
        </div>
      </footer>

      {Toast}
    </div>
  );
}
