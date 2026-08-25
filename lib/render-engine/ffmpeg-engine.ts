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
 * Concatenates a list of already-written ffmpeg filesystem file names into
 * one output file. Tries to keep audio from every segment first; if that
 * fails (e.g. one segment has no audio track), automatically falls back to
 * a video-only concat rather than failing outright, and reports which mode
 * was actually used. Shared by both mergeVideos() and cutVideoSegment() so
 * their concat behavior can never quietly drift apart from each other.
 */
async function concatSegments(
  ffmpeg: FFmpeg,
  segmentNames: string[],
  outputName: string
): Promise<{ audioIncluded: boolean }> {
  const inputArgs = segmentNames.flatMap((name) => ["-i", name]);

  async function runConcat(withAudio: boolean) {
    const streamRefs = segmentNames
      .map((_, i) => (withAudio ? `[${i}:v:0][${i}:a:0]` : `[${i}:v:0]`))
      .join("");
    const filter = `${streamRefs}concat=n=${segmentNames.length}:v=1:a=${
      withAudio ? 1 : 0
    }[outv]${withAudio ? "[outa]" : ""}`;
    const mapArgs = withAudio
      ? ["-map", "[outv]", "-map", "[outa]"]
      : ["-map", "[outv]"];

    await ffmpeg.exec([
      ...inputArgs,
      "-filter_complex",
      filter,
      ...mapArgs,
      "-c:v",
      "libx264",
      ...(withAudio ? ["-c:a", "aac"] : []),
      outputName,
    ]);
  }

  try {
    await runConcat(true);
    return { audioIncluded: true };
  } catch (err) {
    console.warn("[ffmpeg] concat with audio failed, retrying video-only:", err);
    await runConcat(false);
    return { audioIncluded: false };
  }
}

async function cleanupFiles(ffmpeg: FFmpeg, names: string[]) {
  for (const name of names) {
    try {
      await ffmpeg.deleteFile(name);
    } catch {
      // Already gone or never existed -- fine to ignore.
    }
  }
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
  await cleanupFiles(ffmpeg, [inputName, outputName]);

  return new Blob([data as BlobPart], { type: "video/mp4" });
}

/**
 * Merges multiple video files into one, in the given order. Re-encodes
 * (rather than a fast "stream copy" concat) because a stream-copy concat
 * requires every clip to already share the exact same codec, resolution,
 * and frame rate -- something we can't guarantee for user-uploaded footage.
 */
export async function mergeVideos(
  files: File[],
  onProgress?: ProgressCallback
): Promise<{ blob: Blob; audioIncluded: boolean }> {
  const ffmpeg = await getFFmpeg(onProgress);

  const inputNames = files.map(
    (file, i) => `merge_${i}${getExtension(file.name) || ".mp4"}`
  );
  const outputName = "merged_output.mp4";

  onProgress?.({ phase: "preparing-file" });
  for (let i = 0; i < files.length; i++) {
    await ffmpeg.writeFile(inputNames[i], await fetchFile(files[i]));
  }

  onProgress?.({ phase: "trimming" }); // reuses the same "processing" phase label as trim
  const { audioIncluded } = await concatSegments(ffmpeg, inputNames, outputName);

  const data = await ffmpeg.readFile(outputName);
  await cleanupFiles(ffmpeg, [...inputNames, outputName]);

  return { blob: new Blob([data as BlobPart], { type: "video/mp4" }), audioIncluded };
}

/**
 * Removes the [start, end] section from a video and stitches together
 * whatever comes before and after it. If start is 0, there's nothing
 * before the cut, so only the "after" segment is used (no concat needed).
 * Re-encodes both segments for the same exact-cut-point reason trim() does.
 */
export async function cutVideoSegment(
  file: File,
  start: number,
  end: number,
  onProgress?: ProgressCallback
): Promise<{ blob: Blob; audioIncluded: boolean }> {
  const ffmpeg = await getFFmpeg(onProgress);

  const ext = getExtension(file.name) || ".mp4";
  const inputName = `cut_input${ext}`;
  const beforeName = "cut_before.mp4";
  const afterName = "cut_after.mp4";
  const outputName = "cut_output.mp4";

  onProgress?.({ phase: "preparing-file" });
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  onProgress?.({ phase: "trimming" });

  const hasBeforeSegment = start > 0;

  if (hasBeforeSegment) {
    await ffmpeg.exec([
      "-i",
      inputName,
      "-ss",
      "0",
      "-to",
      String(start),
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      beforeName,
    ]);
  }

  // No "-to" here on purpose -- this segment runs from `end` to the true
  // end of the file, whatever that turns out to be.
  await ffmpeg.exec([
    "-i",
    inputName,
    "-ss",
    String(end),
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    afterName,
  ]);

  let result: { blob: Blob; audioIncluded: boolean };

  if (!hasBeforeSegment) {
    const data = await ffmpeg.readFile(afterName);
    result = { blob: new Blob([data as BlobPart], { type: "video/mp4" }), audioIncluded: true };
    await cleanupFiles(ffmpeg, [inputName, afterName]);
  } else {
    const { audioIncluded } = await concatSegments(ffmpeg, [beforeName, afterName], outputName);
    const data = await ffmpeg.readFile(outputName);
    result = { blob: new Blob([data as BlobPart], { type: "video/mp4" }), audioIncluded };
    await cleanupFiles(ffmpeg, [inputName, beforeName, afterName, outputName]);
  }

  return result;
}
