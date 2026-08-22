"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";

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
  const [renderStatus, setRenderStatus] = useState<string | null>(null);

  const codeRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  function handleRender() {
    setRenderStatus("connecting-to-engine");
  }

  const assetsById = useMemo(() => {
    const map = new Map<string, Asset>();
    assets.forEach((a) => map.set(a.id, a));
    return map;
  }, [assets]);

  const previewAspectClass = aspectRatio === "9:16" ? "aspect-[9/16]" : "aspect-video";

  return (
    <div className="min-h-screen flex flex-col">
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
          <div className="flex-grow p-4 flex gap-3 min-h-[320px]">
            <div className={`flex-grow bg-surface-container-lowest border border-outline-variant flex items-center justify-center ${previewAspectClass} max-h-full mx-auto`}>
              <span className="text-outline text-sm">Rendered video preview</span>
            </div>
            <div className="w-10 flex flex-col justify-between py-1 shrink-0">
              {Array.from({ length: 11 }).map((_, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="w-2 h-px bg-outline-variant" />
                  <span className="text-[9px] text-outline font-code-sm">{(10 - i).toFixed(1)}</span>
                </div>
              ))}
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
              className="w-full bg-primary text-background py-3 font-label-caps text-label-caps uppercase tracking-widest hover:bg-secondary hover:text-background transition-all duration-300"
            >
              Submit
            </button>
            {renderStatus === "connecting-to-engine" && (
              <p className="text-[11px] text-on-surface-variant mt-2 text-center">
                The render engine (Remotion + ffmpeg.wasm) isn&apos;t wired up yet &mdash; this button is ready and will trigger a real render once that&apos;s built.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
