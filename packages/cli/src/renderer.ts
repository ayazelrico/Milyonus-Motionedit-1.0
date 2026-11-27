import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { Page } from "puppeteer";
import type { CompositionSummary, ResolvedAudioTrack } from "@milyonus/core";
import { buildAudioMuxArgs } from "./audio.js";
import { launchHeadlessBrowser, withServedProject } from "./browser.js";
import { loadInputProps } from "./args.js";

/** Options for rendering a composition video to MP4. */
export type RenderMediaOptions = {
  /** URL of a running `<FrameRenderer>` page (default `http://localhost:5173/?render=1`). */
  url?: string;
  /** Optional Vite project directory to start and stop automatically instead of `--url`. */
  serve?: string;
  /** Output `.mp4` path. Defaults to `"out/video.mp4"`. */
  out?: string;
  /** Optional composition ID to select on multi-composition pages. */
  composition?: string;
  /** Inline JSON string, `.json` file path, or object passed as `inputProps`. */
  props?: string | Record<string, unknown>;
  /** Override composition width in pixels (defaults to discovered composition width or `1280`). */
  width?: number;
  /** Override composition height in pixels (defaults to discovered composition height or `720`). */
  height?: number;
  /** Override frame rate (defaults to discovered composition fps or `30`). */
  fps?: number;
  /** Override total frame count (defaults to discovered composition `durationInFrames` or `90`). */
  frames?: number;
  /** Inclusive start frame for range/chunk rendering. Defaults to `0`. */
  fromFrame?: number;
  /** Exclusive end frame for range/chunk rendering. Defaults to `frames`. */
  toFrame?: number;
  /** Number of parallel headless tabs capturing frames concurrently. Defaults to `1`. */
  concurrency?: number;
  /** Disable audio muxing even when `<Audio>` tracks exist. Defaults to `false`. */
  muted?: boolean;
  /** Optional progress callback invoked as frames are captured. */
  onProgress?: (completedFrames: number, totalFrames: number) => void;
  /** Suppress terminal progress logs. Defaults to `false`. */
  quiet?: boolean;
};

/** Summary returned when `renderMedia` finishes. */
export type RenderMediaResult = {
  out: string;
  compositionId: string;
  width: number;
  height: number;
  fps: number;
  fromFrame: number;
  toFrame: number;
  renderedFrames: number;
  audioTracksMuxed: number;
};

/** Options for capturing a single deterministic still image. */
export type RenderStillOptions = {
  url?: string;
  serve?: string;
  out?: string;
  frame?: number;
  composition?: string;
  props?: string | Record<string, unknown>;
  width?: number;
  height?: number;
  format?: "png" | "jpeg" | "webp";
  quality?: number;
};

const runBinary = (bin: string, args: string[], quiet = false): Promise<void> =>
  new Promise<void>((res, rej) => {
    const p = spawn(bin, args, { stdio: quiet ? ["ignore", "ignore", "pipe"] : "inherit" });
    let errText = "";
    p.stderr?.on("data", (d) => {
      errText += String(d);
    });
    p.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        rej(new Error(`"${bin}" was not found on PATH. Install FFmpeg before rendering video.`));
      } else {
        rej(err);
      }
    });
    p.on("exit", (code) =>
      code === 0 ? res() : rej(new Error(`${bin} exited with code ${code}${errText ? `: ${errText.trim()}` : ""}`))
    );
  });

/** Verifies FFmpeg is installed and executable before spending time capturing frames. */
export const checkFfmpeg = async (): Promise<void> => {
  await runBinary("ffmpeg", ["-version"], true);
};

const prepareRenderPage = async (
  page: Page,
  url: string,
  composition: string | undefined,
  inputProps: Record<string, unknown> | undefined
): Promise<CompositionSummary> => {
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.waitForFunction("window.milyonusReady === true", { timeout: 30000 });

  let discovered: CompositionSummary | undefined;
  if (composition) {
    discovered = await page.evaluate(async (id: string) => {
      const fn = (window as any).milyonusSelectComposition;
      if (typeof fn !== "function") {
        throw new Error("Render page does not support composition selection (upgrade @milyonus/player).");
      }
      return await fn(id);
    }, composition);
  } else {
    discovered = await page.evaluate(() => {
      const fn = (window as any).milyonusGetConfig;
      return typeof fn === "function" ? fn() : undefined;
    });
  }

  if (inputProps) {
    await page.evaluate(async (p: Record<string, unknown>) => {
      const fn = (window as any).milyonusSetInputProps;
      if (typeof fn === "function") {
        await fn(p);
      }
    }, inputProps);
  }

  return (
    discovered ?? {
      id: composition ?? "main",
      width: 1280,
      height: 720,
      fps: 30,
      durationInFrames: 90,
    }
  );
};

/** Lists all compositions exposed by a `<FrameRenderer>` page. */
export const listCompositions = async ({
  url = "http://localhost:5173/?render=1",
  serve,
}: {
  url?: string;
  serve?: string;
} = {}): Promise<CompositionSummary[]> => {
  if (serve) {
    return withServedProject(serve, (servedUrl) => listCompositions({ url: servedUrl }));
  }
  const browser = await launchHeadlessBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForFunction("window.milyonusReady === true", { timeout: 30000 });
    return await page.evaluate(() => {
      const listFn = (window as any).milyonusListCompositions;
      if (typeof listFn === "function") return listFn();
      const getFn = (window as any).milyonusGetConfig;
      return typeof getFn === "function" ? [getFn()] : [];
    });
  } finally {
    await browser.close();
  }
};

/** Renders a single frame to a PNG, JPEG, or WebP file without requiring FFmpeg. */
export const renderStill = async (options: RenderStillOptions = {}): Promise<{
  out: string;
  width: number;
  height: number;
  frame: number;
}> => {
  if (options.serve) {
    return withServedProject(options.serve, (servedUrl) =>
      renderStill({ ...options, serve: undefined, url: servedUrl })
    );
  }

  const url = options.url ?? "http://localhost:5173/?render=1";
  const out = resolve(options.out ?? "out/still.png");
  const frame = options.frame ?? 0;
  if (!Number.isInteger(frame) || frame < 0) {
    throw new Error(`Invalid frame "${frame}": expected a non-negative integer.`);
  }

  const ext = extname(out).toLowerCase();
  const format: "png" | "jpeg" | "webp" =
    options.format ?? (ext === ".jpg" || ext === ".jpeg" ? "jpeg" : ext === ".webp" ? "webp" : "png");
  const inputProps = await loadInputProps(options.props);

  await mkdir(dirname(out), { recursive: true });
  const browser = await launchHeadlessBrowser();
  try {
    const page = await browser.newPage();
    const discovered = await prepareRenderPage(page, url, options.composition, inputProps);
    const width = options.width ?? discovered.width;
    const height = options.height ?? discovered.height;

    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.evaluate((n: number) => (window as any).milyonusSetFrame(n), frame);
    const stage = await page.$("#milyonus-stage");
    if (!stage) throw new Error("#milyonus-stage not found on the render page.");

    await stage.screenshot({
      path: out as `${string}.png`,
      type: format,
      ...(format !== "png" && options.quality !== undefined ? { quality: options.quality } : {}),
    });

    return { out, width, height, frame };
  } finally {
    await browser.close();
  }
};

/** Renders a frame range or full composition to H.264 MP4, with optional parallel workers and audio muxing. */
export const renderMedia = async (options: RenderMediaOptions = {}): Promise<RenderMediaResult> => {
  if (options.serve) {
    return withServedProject(options.serve, (servedUrl) =>
      renderMedia({ ...options, serve: undefined, url: servedUrl })
    );
  }

  await checkFfmpeg();

  const url = options.url ?? "http://localhost:5173/?render=1";
  const out = resolve(options.out ?? "out/video.mp4");
  const inputProps = await loadInputProps(options.props);
  const requestedConcurrency = options.concurrency ?? 1;
  if (!Number.isInteger(requestedConcurrency) || requestedConcurrency < 1) {
    throw new Error(`Invalid concurrency "${requestedConcurrency}": expected an integer >= 1.`);
  }

  await mkdir(dirname(out), { recursive: true });
  const tempDir = await mkdtemp(join(tmpdir(), "milyonus-"));

  try {
    const browsers = [await launchHeadlessBrowser()];
    let width = options.width ?? 1280;
    let height = options.height ?? 720;
    let fps = options.fps ?? 30;
    let compositionId = options.composition ?? "main";
    let fromFrame = options.fromFrame ?? 0;
    let toFrame = options.toFrame ?? options.frames ?? 90;
    const collectedAudio = new Map<string, ResolvedAudioTrack>();

    try {
      const primaryPage = await browsers[0].newPage();
      const discovered = await prepareRenderPage(primaryPage, url, options.composition, inputProps);
      compositionId = discovered.id;
      width = options.width ?? discovered.width;
      height = options.height ?? discovered.height;
      fps = options.fps ?? discovered.fps;
      const totalCompositionFrames = options.frames ?? discovered.durationInFrames;

      fromFrame = options.fromFrame ?? 0;
      toFrame = options.toFrame ?? totalCompositionFrames;

      if (!Number.isInteger(fromFrame) || fromFrame < 0) {
        throw new Error(`Invalid fromFrame "${fromFrame}": expected an integer >= 0.`);
      }
      if (!Number.isInteger(toFrame) || toFrame <= fromFrame) {
        throw new Error(`Invalid frame window [${fromFrame}, ${toFrame}): toFrame must be > fromFrame.`);
      }

      const renderedFrames = toFrame - fromFrame;
      const workerCount = Math.min(requestedConcurrency, renderedFrames);

      // Give each parallel worker an isolated headless Browser so active-tab screenshots never contend.
      const pages: Page[] = [primaryPage];
      if (workerCount > 1) {
        const extraWorkers = await Promise.all(
          Array.from({ length: workerCount - 1 }, async () => {
            const b = await launchHeadlessBrowser();
            browsers.push(b);
            const p = await b.newPage();
            await prepareRenderPage(p, url, options.composition, inputProps);
            return p;
          })
        );
        pages.push(...extraWorkers);
      }

      for (const p of pages) {
        await p.setViewport({ width, height, deviceScaleFactor: 1 });
      }

      let completed = 0;
      const chunkSize = Math.ceil(renderedFrames / workerCount);

      await Promise.all(
        pages.map(async (page, workerIdx) => {
          const chunkStart = fromFrame + workerIdx * chunkSize;
          const chunkEnd = Math.min(toFrame, chunkStart + chunkSize);
          if (chunkStart >= chunkEnd) return;

          const stage = await page.$("#milyonus-stage");
          if (!stage) throw new Error("#milyonus-stage not found on the render page.");

          for (let f = chunkStart; f < chunkEnd; f++) {
            await page.evaluate((n: number) => (window as any).milyonusSetFrame(n), f);
            const outputIndex = f - fromFrame;
            const file = join(tempDir, `frame-${String(outputIndex).padStart(6, "0")}.png`) as `${string}.png`;
            await stage.screenshot({ path: file });
            completed++;
            options.onProgress?.(completed, renderedFrames);
            if (!options.quiet && (completed % 10 === 0 || completed === renderedFrames)) {
              process.stdout.write(`\rFrame ${completed}/${renderedFrames}`);
            }
          }

          if (!options.muted) {
            const tracks = await page.evaluate(() => {
              const fn = (window as any).milyonusGetAudioTracks;
              return typeof fn === "function" ? (fn() as ResolvedAudioTrack[]) : [];
            });
            for (const t of tracks) {
              const dedupeKey = `${t.startFrame}:${t.durationInFrames}:${t.trimBefore}:${t.src}:${t.playbackRate}:${t.loop}`;
              if (!collectedAudio.has(dedupeKey)) {
                collectedAudio.set(dedupeKey, t);
              }
            }
          }
        })
      );

      if (!options.quiet) {
        process.stdout.write("\n");
      }
    } finally {
      await Promise.allSettled(browsers.map((b) => b.close()));
    }

    const deduplicatedTracks = options.muted ? [] : Array.from(collectedAudio.values());
    const audioPlan = await buildAudioMuxArgs(deduplicatedTracks, {
      fps,
      renderFromFrame: fromFrame,
      renderToFrame: toFrame,
      pageUrl: url,
      tempDir,
    });

    const ffmpegArgs = [
      "-y",
      "-framerate",
      String(fps),
      "-i",
      join(tempDir, "frame-%06d.png"),
      ...audioPlan.inputArgs,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      ...audioPlan.filterAndMapArgs,
      out,
    ];

    await runBinary("ffmpeg", ffmpegArgs, options.quiet);
    const renderedFrames = toFrame - fromFrame;
    if (!options.quiet) {
      console.log(`Done: ${out}`);
    }

    return {
      out,
      compositionId,
      width,
      height,
      fps,
      fromFrame,
      toFrame,
      renderedFrames,
      audioTracksMuxed: audioPlan.inputArgs.length > 0 ? deduplicatedTracks.filter((t) => !t.muted).length : 0,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

/**
 * Losslessly concatenates multiple rendered MP4 chunk files (e.g., from distributed cloud workers)
 * into a single MP4 using FFmpeg's `concat` demuxer.
 */
export const stitchMediaChunks = async (
  chunkPaths: readonly string[],
  out: string,
  quiet = false
): Promise<string> => {
  if (chunkPaths.length === 0) {
    throw new Error("stitchMediaChunks requires at least one chunk MP4 file.");
  }
  await checkFfmpeg();
  const resolvedOut = resolve(out);
  await mkdir(dirname(resolvedOut), { recursive: true });
  const tempDir = await mkdtemp(join(tmpdir(), "milyonus-stitch-"));
  try {
    const listFile = join(tempDir, "chunks.txt");
    const content = chunkPaths
      .map((p) => `file '${resolve(p).replace(/'/g, "'\\''")}'`)
      .join("\n");
    await writeFile(listFile, content + "\n", "utf8");
    await runBinary(
      "ffmpeg",
      ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", resolvedOut],
      quiet
    );
    return resolvedOut;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};
