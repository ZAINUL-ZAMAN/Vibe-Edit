# Vibe Edit

Browser-based, code-driven video editing. Describe an edit to any AI assistant, paste the code it writes into the editor, drop in your footage, and render -- entirely in your browser. Footage never leaves your device.

Built with Next.js (App Router), React, Tailwind CSS v4, Supabase (auth + database) and ffmpeg.wasm.

## Getting started

### 1. Install

```bash
npm install
```

### 2. Connect Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the dashboard open **SQL Editor -> New Query**, paste the contents of `supabase/schema.sql`, and run it. It is safe to run more than once.
3. Under **Authentication -> Providers**, enable Email and (optionally) Google. Add `http://localhost:3000/auth/callback` (and your deployed URL's `/auth/callback`) to the redirect URLs.
4. Copy `.env.example` to `.env.local` and fill in the two values from **Project Settings -> API**:

```bash
cp .env.example .env.local
```

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your project's public anon key |

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). In GitHub Codespaces, open the forwarded port 3000 instead.

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

## Vibe Syntax (v1)

Paste code into the editor's **Code** box and press **Submit**. Upload your clips first; each gets an id (`clip_01`, `clip_02`, ...) shown in the Assets panel.

```
// Keep only seconds 0-5 of a clip
trim(clip: "clip_01", start: 0, end: 5)

// Remove seconds 2-4 and join what's left
cut(clip: "clip_01", start: 2, end: 4)

// Join clips in order (scaled to the first clip's size)
merge(clips: ["clip_01", "clip_02"])
```

- Times are in seconds.
- v1 runs **one operation per render**. If the code contains more than one, the first runs and the editor says what was skipped.
- Comments start with `//` or sit between `/*` and `*/`.
- Anything not listed above (for example `overlay()`) is reported as not supported yet.

## How it works

- `app/` -- pages: landing, login, dashboard, editor, and the Google sign-in callback.
- `lib/vibe-syntax/parser.ts` -- turns the code text into structured calls. It doesn't run anything.
- `lib/render-engine/ffmpeg-engine.ts` -- runs trim / cut / merge with ffmpeg.wasm in the browser. The ffmpeg core (~25 MB) is downloaded the first time you render.
- `supabase/schema.sql` -- the `projects` table and its Row Level Security policies.
- `proxy.ts` -- keeps the Supabase session fresh on every request.
