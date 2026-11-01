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

// Shared encoder settings. "veryfast" keeps in-browser (wasm) renders
// reasonably quick; yuv420p makes sure the result plays in every browser
// even when the source footage uses an unusual pixel format.
const VIDEO_ENCODE = ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"];
const AUDIO_ENCODE = ["-c:a", "aac"];

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

// The progress listener is attached once, when ffmpeg first loads, but every
// render passes its own callback. Keeping the latest one here means later
// renders report progress to the right place.
let activeProgress: ProgressCallback | undefined;

export type ProgressCallback = (info: { phase: string; ratio?: number }) => void;

export async function getFFmpeg(onProgress?: ProgressCallback): Promise<FFmpeg> {
  activeProgress = onProgress;

  if (ffmpegInstance) return ffmpegInstance;

  if (!loadPromise) {
    loadPromise = (async () => {
      const ffmpeg = new FFmpeg();

      ffmpeg.on("log", ({ message }) => {
        // Useful for debugging in the browser console if something goes wrong.
        console.log("[ffmpeg]", message);
      });

      ffmpeg.on("progress", ({ progress }) => {
        if (Number.isFinite(progress)) {
          activeProgress?.({
            phase: "encoding",
            ratio: Math.min(1, Math.max(0, progress)),
          });
        }
      });

      activeProgress?.({ phase: "loading-engine" });

      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      ffmpegInstance = ffmpeg;
      return ffmpeg;
    })();
  }

  try {
    return await loadPromise;
  } catch (err) {
    // Without this, one failed download (offline, CDN hiccup) would make
    // every later attempt fail instantly until the page was refreshed.
    loadPromise = null;
    throw err;
  }
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot);
}

/**
 * Runs one ffmpeg command and throws if it fails. ffmpeg.exec() does NOT
 * throw on failure -- it resolves with an exit code (0 = success), so
 * without this check a failed encode looked like a success and only blew up
 * later with a confusing "file not found" error.
 */
async function run(ffmpeg: FFmpeg, args: string[], what: string): Promise<void> {
  const recent: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    recent.push(message);
    if (recent.length > 6) recent.shift();
  };

  ffmpeg.on("log", onLog);
  let exitCode: number;
  try {
    exitCode = await ffmpeg.exec(args);
  } finally {
    ffmpeg.off("log", onLog);
  }

  if (exitCode !== 0) {
    const detail = recent.filter(Boolean).slice(-3).join(" | ");
    throw new Error(
      `${what} failed (ffmpeg exit code ${exitCode})${detail ? `: ${detail}` : "."}`
    );
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

/** Reads a finished output file, or null if it is missing or empty. */
async function readNonEmpty(ffmpeg: FFmpeg, name: string): Promise<Uint8Array | null> {
  try {
    const data = await ffmpeg.readFile(name);
    if (typeof data === "string" || data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * ffmpeg exits successfully even when a start time lies past the end of a
 * clip -- it just writes a container with no video in it. A file is only
 * treated as real output if it actually holds a video stream.
 */
async function readVideoOutput(ffmpeg: FFmpeg, name: string): Promise<Uint8Array | null> {
  const data = await readNonEmpty(ffmpeg, name);
  if (!data) return null;
  return (await probeVideo(ffmpeg, name)) ? data : null;
}

async function readMp4(ffmpeg: FFmpeg, name: string): Promise<Blob> {
  const data = await readVideoOutput(ffmpeg, name);
  if (!data) {
    throw new Error(
      "The render produced an empty video. Check that your start and end times fall inside the clip."
    );
  }
  return new Blob([data as BlobPart], { type: "video/mp4" });
}

type VideoInfo = { width: number; height: number; fps: number | null };

/**
 * Finds a video file's size and frame rate by asking ffmpeg to describe it.
 * With no output file ffmpeg prints the input's details and then exits with
 * an error -- that is expected here, so the exit code is deliberately
 * ignored. Returns null if the details can't be read.
 */
async function probeVideo(ffmpeg: FFmpeg, name: string): Promise<VideoInfo | null> {
  const lines: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    lines.push(message);
  };

  ffmpeg.on("log", onLog);
  try {
    await ffmpeg.exec(["-i", name]);
  } catch {
    // Expected for some builds too; the log lines are all we need.
  } finally {
    ffmpeg.off("log", onLog);
  }

  const streamLine = lines.find(
    (line) => /Stream #\d+:\d+.*Video:/.test(line) && !/attached pic/i.test(line)
  );
  if (!streamLine) return null;

  const size = streamLine.match(/,\s*(\d{2,5})x(\d{2,5})(?=[\s,[])/);
  if (!size) return null;

  const fpsMatch = streamLine.match(/,\s*(\d+(?:\.\d+)?)\s*fps/);
  const fps = fpsMatch ? parseFloat(fpsMatch[1]) : null;

  return {
    width: parseInt(size[1], 10),
    height: parseInt(size[2], 10),
    fps: fps !== null && fps >= 1 && fps <= 120 ? fps : null,
  };
}

/**
 * Builds the ffmpeg filter graph that joins the segments. When `target` is
 * given, every segment is first scaled (letterboxed, never stretched) to the
 * target size and frame rate, and its audio is converted to one common
 * format -- ffmpeg's concat filter refuses to join clips that differ in any
 * of those.
 */
function buildConcatFilter(count: number, withAudio: boolean, target: VideoInfo | null): string {
  const chains: string[] = [];
  const refs: string[] = [];

  const width = target ? target.width - (target.width % 2) : 0;
  const height = target ? target.height - (target.height % 2) : 0;
  const fps = target?.fps ?? 30;

  for (let i = 0; i < count; i++) {
    if (target) {
      chains.push(
        `[${i}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}[v${i}]`
      );
      refs.push(`[v${i}]`);
    } else {
      refs.push(`[${i}:v:0]`);
    }

    if (withAudio) {
      if (target) {
        chains.push(
          `[${i}:a:0]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`
        );
        refs.push(`[a${i}]`);
      } else {
        refs.push(`[${i}:a:0]`);
      }
    }
  }

  chains.push(
    `${refs.join("")}concat=n=${count}:v=1:a=${withAudio ? 1 : 0}[outv]${withAudio ? "[outa]" : ""}`
  );
  return chains.join(";");
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
  outputName: string,
  target: VideoInfo | null = null
): Promise<{ audioIncluded: boolean }> {
  const inputArgs = segmentNames.flatMap((name) => ["-i", name]);

  async function runConcat(withAudio: boolean) {
    const filter = buildConcatFilter(segmentNames.length, withAudio, target);
    const mapArgs = withAudio
      ? ["-map", "[outv]", "-map", "[outa]"]
      : ["-map", "[outv]"];

    await run(
      ffmpeg,
      [
        ...inputArgs,
        "-filter_complex",
        filter,
        ...mapArgs,
        ...VIDEO_ENCODE,
        ...(withAudio ? AUDIO_ENCODE : []),
        outputName,
      ],
      "Joining the clips"
    );
  }

  try {
    await runConcat(true);
    return { audioIncluded: true };
  } catch (err) {
    console.warn("[ffmpeg] concat with audio failed, retrying video-only:", err);
    await cleanupFiles(ffmpeg, [outputName]); // drop any half-written output
    await runConcat(false);
    return { audioIncluded: false };
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

  try {
    await cleanupFiles(ffmpeg, [inputName, outputName]);

    onProgress?.({ phase: "preparing-file" });
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    onProgress?.({ phase: "trimming" });
    await run(
      ffmpeg,
      [
        "-i",
        inputName,
        "-ss",
        String(start),
        "-to",
        String(end),
        ...VIDEO_ENCODE,
        ...AUDIO_ENCODE,
        outputName,
      ],
      "Trimming the video"
    );

    return await readMp4(ffmpeg, outputName);
  } finally {
    await cleanupFiles(ffmpeg, [inputName, outputName]);
  }
}

/**
 * Merges multiple video files into one, in the given order. Re-encodes
 * (rather than a fast "stream copy" concat) because a stream-copy concat
 * requires every clip to already share the exact same codec, resolution,
 * and frame rate -- something we can't guarantee for user-uploaded footage.
 * Every clip is scaled to the first clip's size and frame rate (letterboxed,
 * never stretched) so differently sized clips can be joined.
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

  try {
    await cleanupFiles(ffmpeg, [...inputNames, outputName]);

    onProgress?.({ phase: "preparing-file" });
    for (let i = 0; i < files.length; i++) {
      await ffmpeg.writeFile(inputNames[i], await fetchFile(files[i]));
    }

    const target = await probeVideo(ffmpeg, inputNames[0]);

    onProgress?.({ phase: "trimming" }); // reuses the same "processing" phase label as trim
    const { audioIncluded } = await concatSegments(ffmpeg, inputNames, outputName, target);

    return { blob: await readMp4(ffmpeg, outputName), audioIncluded };
  } finally {
    await cleanupFiles(ffmpeg, [...inputNames, outputName]);
  }
}

/**
 * Removes the [start, end] section from a video and stitches together
 * whatever comes before and after it. If start is 0, there's nothing
 * before the cut, so only the "after" segment is used (no concat needed).
 * If the cut runs to (or past) the end of the clip there's nothing after
 * it, so only the "before" segment is used. Re-encodes both segments for
 * the same exact-cut-point reason trim() does.
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
  const allNames = [inputName, beforeName, afterName, outputName];

  try {
    await cleanupFiles(ffmpeg, allNames);

    onProgress?.({ phase: "preparing-file" });
    await ffmpeg.writeFile(inputName, await fetchFile(file));

    onProgress?.({ phase: "trimming" });

    const hasBeforeSegment = start > 0;

    if (hasBeforeSegment) {
      await run(
        ffmpeg,
        [
          "-i",
          inputName,
          "-ss",
          "0",
          "-to",
          String(start),
          ...VIDEO_ENCODE,
          ...AUDIO_ENCODE,
          beforeName,
        ],
        "Cutting the video (part before the cut)"
      );
    }

    // No "-to" here on purpose -- this segment runs from `end` to the true
    // end of the file, whatever that turns out to be. If `end` is at or past
    // the end of the clip there is simply nothing left, and ffmpeg writes an
    // empty (or no) file, which we treat as "no after segment".
    await run(
      ffmpeg,
      [
        "-i",
        inputName,
        "-ss",
        String(end),
        ...VIDEO_ENCODE,
        ...AUDIO_ENCODE,
        afterName,
      ],
      "Cutting the video (part after the cut)"
    );

    const afterData = await readVideoOutput(ffmpeg, afterName);

    if (!hasBeforeSegment) {
      if (!afterData) {
        throw new Error(
          "That cut would remove the whole clip, so there is nothing left to render."
        );
      }
      return {
        blob: new Blob([afterData as BlobPart], { type: "video/mp4" }),
        audioIncluded: true,
      };
    }

    if (!afterData) {
      // The cut reaches the end of the clip: keep just the part before it.
      return { blob: await readMp4(ffmpeg, beforeName), audioIncluded: true };
    }

    const { audioIncluded } = await concatSegments(ffmpeg, [beforeName, afterName], outputName);
    return { blob: await readMp4(ffmpeg, outputName), audioIncluded };
  } finally {
    await cleanupFiles(ffmpeg, allNames);
  }
}
