"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseVibeSyntax, type VibeCall } from "@/lib/vibe-syntax/parser";
import { trimVideo, mergeVideos, cutVideoSegment } from "@/lib/render-engine/ffmpeg-engine";

type AssetType = "video" | "audio";

type Asset = {
  id: string;
  name: string;
  type: AssetType;
  file: File;
  url: string;
};

type ClipInstance = {
  clipInstanceId: string;
  assetId: string;
  laneId: string;
};

type Lane = {
  id: string;
  label: string;
  kind: AssetType;
  removable: boolean;
};

const DEFAULT_LANES: Lane[] = [
  { id: "video-1", label: "Video 1", kind: "video", removable: false },
  { id: "music", label: "Music", kind: "audio", removable: false },
  { id: "voice", label: "Voice", kind: "audio", removable: false },
  { id: "sfx", label: "SFX", kind: "audio", removable: false },
];

// Functions the render engine can actually run right now.
const SUPPORTED_FUNCTIONS = ["trim", "merge", "cut"];
// Harmless words that can appear in code without doing anything.
const NO_OP_FUNCTIONS = ["render"];

// Some browsers/operating systems report an empty MIME type for formats like
// .mkv or .flac, so fall back to the file extension.
const VIDEO_EXTENSIONS = ["mp4", "mov", "m4v", "mkv", "webm", "avi", "mpg", "mpeg", "3gp"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "ogg", "oga", "flac", "opus"];

function detectAssetType(file: File): AssetType | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (VIDEO_EXTENSIONS.includes(ext)) return "video";
  if (AUDIO_EXTENSIONS.includes(ext)) return "audio";
  return null;
}

function uniqueList(items: string[]): string[] {
  return Array.from(new Set(items));
}

export default function EditorClient({
  projectId,
  projectName,
  aspectRatio,
}: {
  projectId: string | null;
  projectName: string;
  aspectRatio: "16:9" | "9:16";
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [lanes, setLanes] = useState<Lane[]>(DEFAULT_LANES);
  const [clips, setClips] = useState<ClipInstance[]>([]);
  const [selectedLaneIds, setSelectedLaneIds] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [formNotice, setFormNotice] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [renderState, setRenderState] = useState<{
    status: "idle" | "loading" | "rendering" | "done" | "error";
    message: string;
  }>({ status: "idle", message: "" });
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<"mp4" | "mp3">("mp4");
  const [exportName, setExportName] = useState("");

  const codeRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assetsRef = useRef<Asset[]>([]);
  const renderedUrlRef = useRef<string | null>(null);
  const isRenderingRef = useRef(false);

  // Id counters live in the editor instance (not at module level) so that
  // leaving the editor and coming back starts again from clip_01 instead of
  // continuing from wherever the last visit stopped.
  const idCounters = useRef({ asset: 0, videoLane: 1, clipInstance: 0 });

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => {
    renderedUrlRef.current = renderedUrl;
  }, [renderedUrl]);

  // Every uploaded file gets a browser object URL (for eventual playback/
  // thumbnails). Those URLs hold onto memory until explicitly released --
  // without this, a long editing session with many uploads would slowly
  // leak memory. This releases them all when the editor unmounts.
  useEffect(() => {
    return () => {
      assetsRef.current.forEach((asset) => URL.revokeObjectURL(asset.url));
      if (renderedUrlRef.current) URL.revokeObjectURL(renderedUrlRef.current);
    };
  }, []);

  const addAssets = useCallback((files: FileList | File[]) => {
    const newAssets: Asset[] = [];
    let skipped = 0;

    Array.from(files).forEach((file) => {
      const type = detectAssetType(file);
      if (!type) {
        skipped += 1;
        return;
      }
      idCounters.current.asset += 1;
      const prefix = type === "video" ? "clip" : "audio";
      newAssets.push({
        id: `${prefix}_${String(idCounters.current.asset).padStart(2, "0")}`,
        name: file.name,
        type,
        file,
        url: URL.createObjectURL(file),
      });
    });

    if (newAssets.length > 0) {
      setAssets((prev) => [...prev, ...newAssets]);
    }
    setUploadNotice(
      skipped > 0
        ? `Skipped ${skipped} file${skipped === 1 ? "" : "s"} that ${
            skipped === 1 ? "isn't" : "aren't"
          } a recognized video or audio format.`
        : null
    );
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length) {
      addAssets(e.dataTransfer.files);
    }
  }

  function handleBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) {
      addAssets(e.target.files);
      e.target.value = "";
    }
  }

  function toggleLaneSelection(laneId: string, isCtrlOrCmd: boolean) {
    setSelectedLaneIds((prev) => {
      if (isCtrlOrCmd) {
        return prev.includes(laneId)
          ? prev.filter((id) => id !== laneId)
          : [...prev, laneId];
      }
      if (prev.length === 1 && prev[0] === laneId) return [];
      return [laneId];
    });
  }

  function clearSelection() {
    setSelectedLaneIds([]);
  }

  function addVideoLane() {
    idCounters.current.videoLane += 1;
    const laneNumber = idCounters.current.videoLane;
    const newLane: Lane = {
      id: `video-${laneNumber}`,
      label: `Video ${laneNumber}`,
      kind: "video",
      removable: true,
    };
    setLanes((prev) => {
      const firstAudioIdx = prev.findIndex((l) => l.kind === "audio");
      const insertAt = firstAudioIdx === -1 ? prev.length : firstAudioIdx;
      return [...prev.slice(0, insertAt), newLane, ...prev.slice(insertAt)];
    });
  }

  function removeLane(laneId: string) {
    setLanes((prev) => prev.filter((l) => l.id !== laneId));
    setClips((prev) => prev.filter((c) => c.laneId !== laneId));
    setSelectedLaneIds((prev) => prev.filter((id) => id !== laneId));
  }

  function placeAssetOnSelectedLane(asset: Asset) {
    const targetLaneId =
      selectedLaneIds.length === 1
        ? selectedLaneIds[0]
        : lanes.find((l) => l.kind === asset.type)?.id;

    if (!targetLaneId) return;

    const lane = lanes.find((l) => l.id === targetLaneId);
    if (!lane || lane.kind !== asset.type) return;

    idCounters.current.clipInstance += 1;
    const clipInstanceId = `inst_${idCounters.current.clipInstance}`;

    setClips((prev) => [...prev, { clipInstanceId, assetId: asset.id, laneId: targetLaneId }]);
  }

  function removeClip(clipInstanceId: string) {
    setClips((prev) => prev.filter((c) => c.clipInstanceId !== clipInstanceId));
  }

  function insertIntoCode(snippet: string) {
    const textarea = codeRef.current;
    if (!textarea) {
      setCode((prev) => (prev ? `${prev}\n${snippet}` : snippet));
      return;
    }
    const start = textarea.selectionStart ?? code.length;
    const end = textarea.selectionEnd ?? code.length;
    const before = code.slice(0, start);
    const after = code.slice(end);
    const needsNewlineBefore = before.length > 0 && !before.endsWith("\n");
    const insertion = `${needsNewlineBefore ? "\n" : ""}${snippet}`;
    const updated = `${before}${insertion}${after}`;
    setCode(updated);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPos = before.length + insertion.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  }

  function handleFormSubmit() {
    const from = timeFrom.trim();
    const to = timeTo.trim();

    if (from === "" && to === "") {
      setFormNotice("Enter a start and/or end time first.");
      return;
    }
    // Only plain numbers are allowed, so nothing typed here can sneak extra
    // code into the snippet.
    if ((from !== "" && !Number.isFinite(Number(from))) || (to !== "" && !Number.isFinite(Number(to)))) {
      setFormNotice("Times must be numbers, in seconds.");
      return;
    }
    setFormNotice(null);

    const scopeIds =
      selectedLaneIds.length > 0
        ? selectedLaneIds
            .map((id) => lanes.find((l) => l.id === id)?.label)
            .filter(Boolean)
        : null;

    const scopeComment = scopeIds
      ? `// applies to: ${scopeIds.join(", ")}`
      : `// applies to: all timelines`;

    const snippet = `${scopeComment}\napply(time: [${from || 0}, ${to || "?"}])`;
    insertIntoCode(snippet);
  }

  const assetsById = useMemo(() => {
    const map = new Map<string, Asset>();
    assets.forEach((a) => map.set(a.id, a));
    return map;
  }, [assets]);

  function fail(message: string) {
    setRenderState({ status: "error", message });
  }

  async function handleRender() {
    // Guards against a double click starting two renders at once.
    if (isRenderingRef.current) return;

    const { calls, errors } = parseVibeSyntax(code);

    if (errors.length > 0) {
      fail(`Couldn't read the code: ${errors[0].message} (line ${errors[0].line})`);
      return;
    }

    const supported = calls.filter((c) => SUPPORTED_FUNCTIONS.includes(c.name));

    if (supported.length === 0) {
      const names = uniqueList(calls.map((c) => c.name)).join(", ");
      fail(
        calls.length === 0
          ? 'No code found. Try: trim(clip: "clip_01", start: 0, end: 5)'
          : `Found ${names}, but v1 only supports trim(), cut(), and merge() so far.`
      );
      return;
    }

    const [call, ...extraSupported] = supported;

    // Be upfront about anything that will not run, instead of silently
    // dropping it.
    const notes: string[] = [];
    if (extraSupported.length > 0) {
      notes.push(
        `Only the first operation (${call.name}) ran; ${extraSupported.length} more ${
          extraSupported.length === 1 ? "was" : "were"
        } skipped -- v1 runs one operation per render.`
      );
    }
    const ignored = uniqueList(
      calls
        .filter((c) => !SUPPORTED_FUNCTIONS.includes(c.name) && !NO_OP_FUNCTIONS.includes(c.name))
        .map((c) => `${c.name}()`)
    );
    if (ignored.length > 0) {
      notes.push(`Not supported yet, so ignored: ${ignored.join(", ")}.`);
    }
    const suffix = notes.length > 0 ? ` ${notes.join(" ")}` : "";

    isRenderingRef.current = true;
    try {
      if (call.name === "trim") {
        await runTrim(call.args, suffix);
      } else if (call.name === "merge") {
        await runMerge(call.args, suffix);
      } else if (call.name === "cut") {
        await runCut(call.args, suffix);
      }
    } finally {
      isRenderingRef.current = false;
    }
  }

  // Shared checks for trim() and cut(): both need a video clip id plus numeric
  // start/end values that make sense. Returns null (after showing the error)
  // if anything is wrong.
  function readClipRange(
    fnName: string,
    args: VibeCall["args"]
  ): { asset: Asset; start: number; end: number } | null {
    const clipId = args.clip;
    const start = args.start;
    const end = args.end;

    if (typeof clipId !== "string") {
      fail(`${fnName}() needs a clip id, e.g. clip: "clip_01"`);
      return null;
    }
    if (typeof start !== "number" || typeof end !== "number") {
      fail(`${fnName}() needs numeric start and end values`);
      return null;
    }
    if (start < 0) {
      fail("start can't be negative.");
      return null;
    }
    if (end <= start) {
      fail("end must be after start.");
      return null;
    }

    const asset = assetsById.get(clipId);
    if (!asset) {
      fail(`No uploaded asset has the id "${clipId}". Check the Assets panel for the correct id.`);
      return null;
    }
    if (asset.type !== "video") {
      fail(`"${clipId}" is an audio file -- ${fnName}() currently works on video.`);
      return null;
    }

    return { asset, start, end };
  }

  async function runTrim(args: VibeCall["args"], suffix: string) {
    const range = readClipRange("trim", args);
    if (!range) return;

    try {
      setRenderState({ status: "loading", message: "Loading render engine (first time only, ~25MB)..." });

      const blob = await trimVideo(range.asset.file, range.start, range.end, handleProgress);

      applyRenderedOutput(blob, `Render complete.${suffix}`);
    } catch (err) {
      handleRenderError(err);
    }
  }

  async function runCut(args: VibeCall["args"], suffix: string) {
    const range = readClipRange("cut", args);
    if (!range) return;

    try {
      setRenderState({ status: "loading", message: "Loading render engine (first time only, ~25MB)..." });

      const { blob, audioIncluded } = await cutVideoSegment(
        range.asset.file,
        range.start,
        range.end,
        handleProgress
      );

      applyRenderedOutput(
        blob,
        (audioIncluded
          ? "Render complete -- the section you cut has been removed."
          : "Render complete -- the section was removed, but audio couldn't be preserved across the cut.") +
          suffix
      );
    } catch (err) {
      handleRenderError(err);
    }
  }

  async function runMerge(args: VibeCall["args"], suffix: string) {
    const clipsValue = args.clips;

    if (!Array.isArray(clipsValue) || clipsValue.length < 2) {
      fail('merge() needs at least two clip ids, e.g. clips: ["clip_01", "clip_02"]');
      return;
    }

    const clipIds = clipsValue.map(String);
    const missingIds = clipIds.filter((id) => !assetsById.has(id));
    if (missingIds.length > 0) {
      fail(`No uploaded asset has the id "${missingIds[0]}". Check the Assets panel for the correct id.`);
      return;
    }

    const nonVideoIds = clipIds.filter((id) => assetsById.get(id)?.type !== "video");
    if (nonVideoIds.length > 0) {
      fail(`"${nonVideoIds[0]}" is an audio file -- merge() currently works on video clips.`);
      return;
    }

    const files = clipIds.map((id) => assetsById.get(id)!.file);

    try {
      setRenderState({ status: "loading", message: "Loading render engine (first time only, ~25MB)..." });

      const { blob, audioIncluded } = await mergeVideos(files, handleProgress);

      applyRenderedOutput(
        blob,
        (audioIncluded
          ? "Render complete."
          : "Render complete -- one or more clips had no usable audio, so the merged video has no sound.") +
          suffix
      );
    } catch (err) {
      handleRenderError(err);
    }
  }

  function handleProgress(info: { phase: string; ratio?: number }) {
    if (info.phase === "loading-engine") {
      setRenderState({ status: "loading", message: "Loading render engine (first time only, ~25MB)..." });
    } else if (info.phase === "preparing-file") {
      setRenderState({ status: "rendering", message: "Preparing your footage..." });
    } else if (info.phase === "trimming" || info.phase === "encoding") {
      const pct = info.ratio ? Math.min(100, Math.max(0, Math.round(info.ratio * 100))) : null;
      setRenderState({
        status: "rendering",
        message: pct !== null ? `Rendering... ${pct}%` : "Rendering...",
      });
    }
  }

  function applyRenderedOutput(blob: Blob, message: string) {
    if (renderedUrlRef.current) URL.revokeObjectURL(renderedUrlRef.current);
    const url = URL.createObjectURL(blob);
    renderedUrlRef.current = url;
    setRenderedBlob(blob);
    setRenderedUrl(url);
    setRenderState({ status: "done", message });
  }

  function handleRenderError(err: unknown) {
    console.error(err);
    setRenderState({
      status: "error",
      message: err instanceof Error ? `Render failed: ${err.message}` : "Render failed for an unknown reason.",
    });
  }

  // The preview box always keeps the project's real shape. Its size is based
  // on the viewport (not on the parent's height), so it can never be squashed
  // or stretched out of proportion.
  const previewStyle: React.CSSProperties =
    aspectRatio === "9:16"
      ? {
          height: "min(70vh, 720px, calc((100vw - 2rem) * 16 / 9))",
          aspectRatio: "9 / 16",
        }
      : {
          width: "min(100%, calc(70vh * 16 / 9))",
          aspectRatio: "16 / 9",
        };

  return (
    <div className="min-h-screen flex flex-col" data-project-id={projectId ?? undefined}>
      <nav className="w-full sticky top-0 z-40 border-b border-outline-variant flex justify-between items-center px-4 md:px-6 py-3 glass-panel border-x-0 border-t-0">
        <Link href="/" className="flex items-center h-8 gap-2">
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="26" height="26" rx="6" stroke="#d2bbff" strokeWidth="1.5" />
            <path d="M8 9L13 19M20 9L15 19" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="font-display-lg text-primary text-base">Vibe Edit</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="font-code-sm text-code-sm text-on-surface-variant hidden sm:block">
            {projectName} &middot; {aspectRatio}
          </span>
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 bg-primary text-background border border-primary px-4 py-2 font-label-caps text-[10px] uppercase tracking-widest hover:bg-secondary hover:border-secondary hover:text-background transition-all duration-300"
          >
            <span className="material-symbols-outlined text-[14px]">download</span>
            Export
          </button>
          <Link
            href="/dashboard"
            className="font-label-caps text-[10px] text-on-surface-variant hover:text-primary uppercase tracking-widest transition-colors"
          >
            Back to dashboard
          </Link>
        </div>
      </nav>

      <div className="flex-grow grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-px bg-outline-variant/30">
        <div className="bg-background flex flex-col min-h-[600px]">
          <div className="p-4 border-b border-outline-variant/30 flex-grow flex flex-col min-h-[260px]">
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-caps text-[10px] text-secondary uppercase tracking-widest">
                Code
              </span>
              <span className="font-code-sm text-[10px] text-outline">Vibe Syntax</span>
            </div>
            <textarea
              ref={codeRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={
                '// One operation per render (v1)\ntrim(clip: "clip_01", start: 0, end: 5)\n\n// Also available:\n// cut(clip: "clip_01", start: 2, end: 4)\n// merge(clips: ["clip_01", "clip_02"])'
              }
              spellCheck={false}
              className="flex-grow w-full bg-surface-container-lowest border border-outline-variant focus:border-secondary p-3 text-on-surface font-code-sm text-code-sm outline-none resize-none"
            />
          </div>

          <div className="p-4 border-b border-outline-variant/30 bg-surface-container-lowest/40">
            <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-3">
              {selectedLaneIds.length > 0
                ? `Scoped to: ${selectedLaneIds
                    .map((id) => lanes.find((l) => l.id === id)?.label)
                    .join(", ")}`
                : "Scoped to: all timelines"}
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label htmlFor="time-from" className="text-[10px] text-outline uppercase tracking-widest">
                  Time from
                </label>
                <input
                  id="time-from"
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full bg-surface-container-lowest border border-outline-variant focus:border-secondary px-2 py-2 text-sm text-primary outline-none"
                />
              </div>
              <div>
                <label htmlFor="time-to" className="text-[10px] text-outline uppercase tracking-widest">
                  To
                </label>
                <input
                  id="time-to"
                  value={timeTo}
                  onChange={(e) => setTimeTo(e.target.value)}
                  placeholder="5"
                  className="mt-1 w-full bg-surface-container-lowest border border-outline-variant focus:border-secondary px-2 py-2 text-sm text-primary outline-none"
                />
              </div>
            </div>
            <button
              onClick={handleFormSubmit}
              className="w-full bg-secondary text-on-secondary py-2.5 font-label-caps text-[10px] uppercase tracking-widest hover:opacity-90 transition-opacity"
            >
              Insert into code
            </button>
            {formNotice && (
              <p className="text-[11px] text-error mt-2" role="alert">
                {formNotice}
              </p>
            )}
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`p-4 flex-shrink-0 transition-colors ${isDragOver ? "bg-secondary/10" : ""}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-caps text-[10px] text-secondary uppercase tracking-widest">
                Assets
              </span>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="font-label-caps text-[10px] text-on-surface-variant hover:text-primary uppercase tracking-widest"
              >
                Browse
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*,.mkv,.m4a,.flac,.opus"
                multiple
                onChange={handleBrowse}
                className="hidden"
              />
            </div>

            <div
              className={`border border-dashed ${
                isDragOver ? "border-secondary" : "border-outline-variant"
              } p-4 text-center mb-3`}
            >
              <span className="text-xs text-outline">Drop video or audio files here</span>
            </div>

            {uploadNotice && (
              <p className="text-[11px] text-error mb-3" role="alert">
                {uploadNotice}
              </p>
            )}

            {assets.length > 0 && (
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    onClick={() => placeAssetOnSelectedLane(asset)}
                    title="Click to place on the selected timeline"
                    className="flex items-center justify-between gap-2 bg-surface-container-lowest border border-outline-variant hover:border-secondary px-3 py-2 text-left transition-colors"
                  >
                    <span className="text-xs text-primary truncate">{asset.name}</span>
                    <span className="font-code-sm text-[10px] text-secondary shrink-0">{asset.id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-background flex flex-col">
          <div className="flex-grow p-4 min-h-[320px] flex items-center justify-center overflow-hidden">
            <div
              style={previewStyle}
              className="bg-surface-container-lowest border border-outline-variant flex items-center justify-center overflow-hidden"
            >
              {renderedUrl ? (
                <video src={renderedUrl} controls className="w-full h-full object-contain bg-black" />
              ) : (
                <span className="text-outline text-sm">Rendered video preview</span>
              )}
            </div>
          </div>

          <div className="border-t border-outline-variant/30 bg-surface-container-lowest/40 p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="font-label-caps text-[10px] text-secondary uppercase tracking-widest">
                Timeline
              </span>
              <div className="flex items-center gap-3">
                {selectedLaneIds.length > 0 && (
                  <button
                    onClick={clearSelection}
                    className="text-[10px] text-on-surface-variant hover:text-primary uppercase tracking-widest"
                  >
                    Clear selection
                  </button>
                )}
                <button
                  onClick={addVideoLane}
                  className="flex items-center gap-1 text-[10px] text-on-surface-variant hover:text-primary uppercase tracking-widest"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>
                  Video track
                </button>
              </div>
            </div>
            <p className="text-[10px] text-outline mb-3">
              Tracks help you organize assets. Rendering uses the clip ids written in your code.
            </p>

            <div className="flex flex-col gap-1.5">
              {lanes.map((lane) => {
                const isSelected = selectedLaneIds.includes(lane.id);
                const laneClips = clips.filter((c) => c.laneId === lane.id);
                return (
                  <div
                    key={lane.id}
                    onClick={(e) => toggleLaneSelection(lane.id, e.ctrlKey || e.metaKey)}
                    className={`flex items-center border cursor-pointer transition-colors ${
                      isSelected
                        ? "border-secondary bg-secondary/10"
                        : "border-outline-variant hover:border-outline"
                    }`}
                  >
                    <div className="w-24 shrink-0 px-3 py-2 flex items-center justify-between border-r border-outline-variant/30">
                      <span className="text-xs text-on-surface-variant truncate">{lane.label}</span>
                      {lane.removable && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeLane(lane.id);
                          }}
                          className="text-outline hover:text-error shrink-0"
                          aria-label={`Remove ${lane.label}`}
                        >
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      )}
                    </div>
                    <div className="flex-grow min-h-[40px] flex items-center gap-1.5 px-2 py-1.5 overflow-x-auto">
                      {laneClips.length === 0 ? (
                        <span className="text-[10px] text-outline italic">Click an asset while this track is selected</span>
                      ) : (
                        laneClips.map((clip) => {
                          const asset = assetsById.get(clip.assetId);
                          if (!asset) return null;
                          return (
                            <div
                              key={clip.clipInstanceId}
                              className="shrink-0 bg-surface-container-high border border-outline-variant px-2 py-1 flex items-center gap-2"
                            >
                              <span className="text-[10px] text-primary">{asset.name}</span>
                              <span className="font-code-sm text-[9px] text-secondary">{asset.id}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeClip(clip.clipInstanceId);
                                }}
                                className="text-outline hover:text-error"
                                aria-label="Remove clip"
                              >
                                <span className="material-symbols-outlined text-[12px]">close</span>
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-outline-variant/30 p-4">
            <button
              onClick={handleRender}
              disabled={renderState.status === "loading" || renderState.status === "rendering"}
              className="w-full bg-primary text-background py-3 font-label-caps text-label-caps uppercase tracking-widest hover:bg-secondary hover:text-background transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {renderState.status === "loading" || renderState.status === "rendering"
                ? "Rendering..."
                : "Submit"}
            </button>
            {renderState.status !== "idle" && (
              <p
                className={`text-[11px] mt-2 text-center ${
                  renderState.status === "error" ? "text-error" : "text-on-surface-variant"
                }`}
                role={renderState.status === "error" ? "alert" : "status"}
              >
                {renderState.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {showExportModal && (
        <ExportModal
          format={exportFormat}
          setFormat={setExportFormat}
          name={exportName}
          setName={setExportName}
          renderedBlob={renderedBlob}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}

function ExportModal({
  format,
  setFormat,
  name,
  setName,
  renderedBlob,
  onClose,
}: {
  format: "mp4" | "mp3";
  setFormat: (f: "mp4" | "mp3") => void;
  name: string;
  setName: (n: string) => void;
  renderedBlob: Blob | null;
  onClose: () => void;
}) {
  const [attempted, setAttempted] = useState(false);

  // Characters that are not allowed in file names on common systems become "-".
  const safeName = (name.trim() || "untitled").replace(/[\\/:*?"<>|]+/g, "-");

  function handleDownload() {
    setAttempted(true);
    if (!renderedBlob || format !== "mp4") return; // v1: only real MP4 output exists so far

    const url = URL.createObjectURL(renderedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Releasing the URL straight away can cancel the download in some
    // browsers, so give it a moment first.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="glass-panel border border-outline-variant p-8 max-w-sm w-full">
        <div className="flex justify-between items-start mb-6">
          <h3 className="font-headline-md text-headline-md text-primary text-xl">Export</h3>
          <button onClick={onClose} className="text-outline hover:text-primary" aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <p className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest mb-2">
          Format
        </p>
        <div className="grid grid-cols-2 gap-2 mb-6">
          <button
            onClick={() => setFormat("mp4")}
            className={`py-3 text-sm border transition-colors ${
              format === "mp4"
                ? "border-secondary text-secondary bg-secondary/10"
                : "border-outline-variant text-on-surface-variant hover:border-outline"
            }`}
          >
            MP4 (video)
          </button>
          <button
            disabled
            title="MP3 export is coming soon"
            className="py-3 text-sm border border-outline-variant text-outline opacity-50 cursor-not-allowed"
          >
            MP3 (soon)
          </button>
        </div>

        <label htmlFor="export-name" className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest">
          File name
        </label>
        <input
          id="export-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-video"
          className="mt-2 w-full bg-surface-container-lowest border border-outline-variant focus:border-secondary px-3 py-2 text-primary text-sm outline-none mb-6"
        />

        <button
          onClick={handleDownload}
          className="w-full bg-primary text-background py-3 font-label-caps text-[10px] uppercase tracking-widest hover:bg-secondary hover:text-background transition-all duration-300 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[16px]">download</span>
          Download {safeName}.{format}
        </button>

        {attempted && (
          <p className="text-[11px] text-on-surface-variant mt-3 text-center">
            {renderedBlob
              ? "Downloaded."
              : 'Nothing to download yet -- click "Submit" on the editor first to render your video.'}
          </p>
        )}
      </div>
    </div>
  );
}
