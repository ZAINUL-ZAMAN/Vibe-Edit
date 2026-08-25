import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// ffmpeg.wasm's core files are large (~25-30MB) and aren't bundled into
// our app -- they're fetched from a CDN the first time rendering happens,
// then cached by the browser. This is the single-threaded core, which
// works without needing special cross-origin-isolation server headers
// (the multi-threaded core does, and that's a common source of broken
// deploys, so single-threaded is the safer default for v1).
const FFMPEG_CORE_VERSION = "0.12.6";
const CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

export type ProgressCallback = (info: { phase: string; ratio?: number }) => void;

export async function getFFmpeg(onProgress?: ProgressCallback): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();

    ffmpeg.on("log", ({ message }) => {
      // Useful for debugging in the browser console if something goes wrong.
      console.log("[ffmpeg]", message);
    });

    ffmpeg.on("progress", ({ progress }) => {
      onProgress?.({ phase: "encoding", ratio: progress });
    });

    onProgress?.({ phase: "loading-engine" });

    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot);
}

/**
 * Trims a video file to the given start/end time (in seconds) and returns
 * the result as a real, playable MP4 Blob. Re-encodes rather than doing a
 * fast "stream copy" trim, because stream-copy trims can only cut on
 * keyframe boundaries -- re-encoding means the trim point is exact,
 * matching whatever the user actually typed.
 */
export async function trimVideo(
  file: File,
  start: number,
  end: number,
  onProgress?: ProgressCallback
): Promise<Blob> {
  const ffmpeg = await getFFmpeg(onProgress);

  const inputName = `input${getExtension(file.name) || ".mp4"}`;
  const outputName = "output.mp4";

  onProgress?.({ phase: "preparing-file" });
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  onProgress?.({ phase: "trimming" });
  await ffmpeg.exec([
    "-i",
    inputName,
    "-ss",
    String(start),
    "-to",
    String(end),
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    outputName,
  ]);

  const data = await ffmpeg.readFile(outputName);

  // Clean up ffmpeg's in-memory filesystem so repeated renders don't
  // accumulate leftover files.
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return new Blob([data as BlobPart], { type: "video/mp4" });
}
