"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseVibeSyntax } from "@/lib/vibe-syntax/parser";
import { trimVideo } from "@/lib/render-engine/ffmpeg-engine";

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

// Shared ruler scale: both the vertical (Y) and horizontal (X) rulers use
// this exact same pixel-per-cm value, so a "1cm" tick is the same physical
// size on both axes -- this is what keeps them synchronized.
const PX_PER_CM = 22;
const RULER_MAX_CM = 20; // fallback used only before the real size is measured

// Measures an element's live pixel size so the rulers can figure out how
// many 1cm ticks actually fit -- recalculates automatically on resize or
// browser zoom, without ever changing how big a "1cm" tick itself is.
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

let assetCounter = 0;
let videoLaneCounter = 1;
let clipInstanceCounter = 0;

function nextAssetId(type: AssetType) {
  assetCounter += 1;
  const prefix = type === "video" ? "clip" : "audio";
  return `${prefix}_${String(assetCounter).padStart(2, "0")}`;
}

function nextClipInstanceId() {
  clipInstanceCounter += 1;
  return `inst_${clipInstanceCounter}`;
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
  const [posX, setPosX] = useState("");
  const [posY, setPosY] = useState("");
  const [size, setSize] = useState("");
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

  // Measure the PREVIEW box, not the rulers themselves -- the preview's
  // size only depends on the aspect ratio and available space, never on
  // how many ticks are drawn, so this can't create a feedback loop the
  // way measuring the rulers' own (growing) content did.
  const { ref: previewRef, size: previewSize } = useElementSize<HTMLDivElement>();

  const verticalTickCount = useMemo(
    () =>
      previewSize.height > 0
        ? Math.floor(previewSize.height / PX_PER_CM) + 1
        : RULER_MAX_CM + 1,
    [previewSize.height]
  );
  const horizontalTickCount = useMemo(
    () =>
      previewSize.width > 0
        ? Math.floor(previewSize.width / PX_PER_CM) + 1
        : RULER_MAX_CM + 1,
    [previewSize.width]
  );

  const addAssets = useCallback((files: FileList | File[]) => {
    const newAssets: Asset[] = [];
    Array.from(files).forEach((file) => {
      const isAudio = file.type.startsWith("audio/");
      const isVideo = file.type.startsWith("video/");
      if (!isAudio && !isVideo) return;
      const type: AssetType = isAudio ? "audio" : "video";
      newAssets.push({
        id: nextAssetId(type),
        name: file.name,
        type,
        file,
        url: URL.createObjectURL(file),
      });
    });
    if (newAssets.length > 0) {
      setAssets((prev) => [...prev, ...newAssets]);
    }
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
    videoLaneCounter += 1;
    const newLane: Lane = {
      id: `video-${videoLaneCounter}`,
      label: `Video ${videoLaneCounter}`,
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

    setClips((prev) => [
      ...prev,
      { clipInstanceId: nextClipInstanceId(), assetId: asset.id, laneId: targetLaneId },
    ]);
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
    const scopeIds =
      selectedLaneIds.length > 0
        ? selectedLaneIds
            .map((id) => lanes.find((l) => l.id === id)?.label)
            .filter(Boolean)
        : null;

    const parts: string[] = [];
    if (timeFrom !== "" || timeTo !== "") {
      parts.push(`time: [${timeFrom || 0}, ${timeTo || "?"}]`);
    }
    if (posX !== "" || posY !== "") {
      parts.push(`x: ${posX || 0}cm, y: ${posY || 0}cm`);
    }
    if (size !== "") {
      parts.push(`size: ${size}cm`);
    }

    const scopeComment = scopeIds
      ? `// applies to: ${scopeIds.join(", ")}`
      : `// applies to: all timelines`;

    const snippet = `${scopeComment}\napply(${parts.join(", ") || "/* no values set */"})`;
    insertIntoCode(snippet);
  }

  const assetsById = useMemo(() => {
    const map = new Map<string, Asset>();
    assets.forEach((a) => map.set(a.id, a));
    return map;
  }, [assets]);

  async function handleRender() {
    const { calls, errors } = parseVibeSyntax(code);

    if (errors.length > 0) {
      setRenderState({
        status: "error",
        message: `Couldn't read the code: ${errors[0].message} (line ${errors[0].line})`,
      });
      return;
    }

    const trimCalls = calls.filter((c) => c.name === "trim");

    if (trimCalls.length === 0) {
      setRenderState({
        status: "error",
        message:
          calls.length === 0
            ? "No code found. Try: trim(clip: \"clip_01\", start: 0, end: 5)"
            : `Found ${calls.map((c) => c.name).join(", ")}, but v1 only supports trim() so far -- cut() and merge() are next.`,
      });
      return;
    }

    // v1: run the first trim() call found. Chaining multiple operations
    // together comes once cut() and merge() are wired up the same way.
    const call = trimCalls[0];
    const clipId = call.args.clip;
    const start = call.args.start;
    const end = call.args.end;

    if (typeof clipId !== "string") {
      setRenderState({ status: "error", message: 'trim() needs a clip id, e.g. clip: "clip_01"' });
      return;
    }
    if (typeof start !== "number" || typeof end !== "number") {
      setRenderState({ status: "error", message: "trim() needs numeric start and end values" });
      return;
    }

    const asset = assetsById.get(clipId);
    if (!asset) {
      setRenderState({
        status: "error",
        message: `No uploaded asset has the id "${clipId}". Check the Assets panel for the correct id.`,
      });
      return;
    }
    if (asset.type !== "video") {
      setRenderState({ status: "error", message: `"${clipId}" is an audio file -- trim() currently works on video.` });
      return;
    }
    if (end <= start) {
      setRenderState({ status: "error", message: "end must be after start." });
      return;
    }

    try {
      setRenderState({ status: "loading", message: "Loading render engine (first time only, ~25MB)..." });

      const blob = await trimVideo(asset.file, start, end, (info) => {
        if (info.phase === "loading-engine") {
          setRenderState({ status: "loading", message: "Loading render engine (first time only, ~25MB)..." });
        } else if (info.phase === "preparing-file") {
          setRenderState({ status: "rendering", message: "Preparing your footage..." });
        } else if (info.phase === "trimming" || info.phase === "encoding") {
          const pct = info.ratio ? Math.min(100, Math.round(info.ratio * 100)) : null;
          setRenderState({
            status: "rendering",
            message: pct !== null ? `Rendering... ${pct}%` : "Rendering...",
          });
        }
      });

      if (renderedUrl) URL.revokeObjectURL(renderedUrl);
      const url = URL.createObjectURL(blob);
      setRenderedBlob(blob);
      setRenderedUrl(url);
      setRenderState({ status: "done", message: "Render complete." });
    } catch (err) {
      console.error(err);
      setRenderState({
        status: "error",
        message: err instanceof Error ? `Render failed: ${err.message}` : "Render failed for an unknown reason.",
      });
    }
  }

  const previewAspectClass = aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-video";

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
              placeholder={'trim(clip: "clip_01", start: 0, end: 5)\n\noverlay(clip: "clip_02", time: [3, 6], x: 10cm, y: 4cm, size: 20cm)'}
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
                <label className="text-[10px] text-outline uppercase tracking-widest">Time from</label>
                <input
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full bg-surface-container-lowest border border-outline-variant focus:border-secondary px-2 py-2 text-sm text-primary outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-outline uppercase tracking-widest">To</label>
                <input
                  value={timeTo}
                  onChange={(e) => setTimeTo(e.target.value)}
                  placeholder="5"
                  className="mt-1 w-full bg-surface-container-lowest border border-outline-variant focus:border-secondary px-2 py-2 text-sm text-primary outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-outline uppercase tracking-widest">Position X</label>
                <input
                  value={posX}
                  onChange={(e) => setPosX(e.target.value)}
                  placeholder="cm"
                  className="mt-1 w-full bg-surface-container-lowest border border-outline-variant focus:border-secondary px-2 py-2 text-sm text-primary outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-outline uppercase tracking-widest">Position Y</label>
                <input
                  value={posY}
                  onChange={(e) => setPosY(e.target.value)}
                  placeholder="cm"
                  className="mt-1 w-full bg-surface-container-lowest border border-outline-variant focus:border-secondary px-2 py-2 text-sm text-primary outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-outline uppercase tracking-widest">Size (sq cm)</label>
                <input
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  placeholder="20"
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
                accept="video/*,audio/*"
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
          {/* Preview + rulers (left = Y axis, bottom = X axis).
              Both rulers use the same PX_PER_CM spacing so 1cm on the
              vertical ruler is the same physical size as 1cm on the
              horizontal one -- previously each ruler stretched to fill
              its container, so their "cm" units didn't actually match. */}
          <div className="flex-grow p-4 flex flex-col min-h-[320px] overflow-hidden">
            <div className="flex-grow flex gap-2 min-h-0">
              <div
                className="w-10 shrink-0 overflow-hidden"
                style={{ height: previewSize.height || undefined }}
              >
                <div className="flex flex-col">
                  {Array.from({ length: verticalTickCount }).map((_, cm) => (
                    <div
                      key={cm}
                      style={{ height: PX_PER_CM }}
                      className="flex items-start justify-end gap-1"
                    >
                      <span className="text-[9px] text-outline font-code-sm leading-none">{cm}</span>
                      <div className="w-2 h-px bg-outline-variant mt-1" />
                    </div>
                  ))}
                </div>
              </div>

              <div
                ref={previewRef}
                className={`flex-grow bg-surface-container-lowest border border-outline-variant flex items-center justify-center overflow-hidden ${previewAspectClass} max-h-full`}
              >
                {renderedUrl ? (
                  <video src={renderedUrl} controls className="w-full h-full object-contain bg-black" />
                ) : (
                  <span className="text-outline text-sm">Rendered video preview</span>
                )}
              </div>
            </div>

            <div
              className="pl-12 overflow-hidden mt-2"
              style={{ width: previewSize.width ? previewSize.width + 48 : undefined }}
            >
              <div className="flex">
                {Array.from({ length: horizontalTickCount }).map((_, cm) => (
                  <div
                    key={cm}
                    style={{ width: PX_PER_CM }}
                    className="flex flex-col items-start gap-1 shrink-0"
                  >
                    <div className="w-px h-2 bg-outline-variant" />
                    <span className="text-[9px] text-outline font-code-sm leading-none">{cm}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-outline-variant/30 bg-surface-container-lowest/40 p-4">
            <div className="flex items-center justify-between mb-3">
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

  function handleDownload() {
    setAttempted(true);
    if (!renderedBlob || format !== "mp4") return; // v1: only real MP4 trim output exists so far

    const url = URL.createObjectURL(renderedBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name || "untitled"}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="glass-panel border border-outline-variant p-8 max-w-sm w-full">
        <div className="flex justify-between items-start mb-6">
          <h3 className="font-headline-md text-headline-md text-primary text-xl">Export</h3>
          <button onClick={onClose} className="text-outline hover:text-primary">
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
            onClick={() => setFormat("mp3")}
            className={`py-3 text-sm border transition-colors ${
              format === "mp3"
                ? "border-secondary text-secondary bg-secondary/10"
                : "border-outline-variant text-on-surface-variant hover:border-outline"
            }`}
          >
            MP3 (audio)
          </button>
        </div>

        <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-widest">
          File name
        </label>
        <input
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
          Download {name ? `${name}.${format}` : `untitled.${format}`}
        </button>

        {attempted && (
          <p className="text-[11px] text-on-surface-variant mt-3 text-center">
            {renderedBlob && format === "mp4"
              ? "Downloaded."
              : !renderedBlob
              ? 'Nothing to download yet -- click "Submit" on the editor first to render your video.'
              : "MP3 export isn't wired up yet -- v1 only renders MP4 video so far."}
          </p>
        )}
      </div>
    </div>
  );
}
