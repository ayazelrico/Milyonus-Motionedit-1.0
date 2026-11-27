import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { Page } from "puppeteer";
import type { CompositionSummary, ResolvedAudioTrack } from "@milyonus/core";
import { buildAudioMuxArgs } from "./audio.js";
import { launchHeadlessBrowser, withServedProject } from "./browser.js";
import { loadInputProps } from "./args.js";

/** Supported output video/animation codecs. */
export type VideoCodec = "h264" | "vp9" | "prores" | "gif";

/** Options for rendering a composition video/animation. */
export type RenderMediaOptions = {
  /** URL of a running `<FrameRenderer>` page (default `http://localhost:5173/?render=1`). */
  url?: string;
  /** Optional Vite project directory to start and stop automatically instead of `--url`. */
  serve?: string;
  /** Output file path (`.mp4`, `.webm`, `.mov`, or `.gif`). Defaults to `"out/video.mp4"`. */
  out?: string;
  /** Encoder codec (`"h264"`, `"vp9"`, `"prores"`, or `"gif"`). Auto-inferred from `out` extension if omitted. */
  codec?: VideoCodec;
  /** Constant Rate Factor (`0..51`) for `h264`/`vp9`. */
  crf?: number;
  /** Preserve alpha transparency (`vp9`, `prores`, `gif`, or PNG sequence). Defaults to `false`. */
  transparent?: boolean;
  /** Optional directory where captured `frame-000000.png` files are copied. */
  sequenceDir?: string;
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
  /** Number of parallel headless browsers capturing frames concurrently. Defaults to `1`. */
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
  codec: VideoCodec;
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
  transparent?: boolean;
};

/** Infers the output codec from explicit option or file extension. */
export const resolveVideoCodec = (outPath: string, explicit?: string): VideoCodec => {
  if (explicit !== undefined) {
    if (explicit === "h264" || explicit === "vp9" || explicit === "prores" || explicit === "gif") {
      return explicit;
    }
    throw new Error(`Unsupported --codec="${explicit}". Supported: h264, vp9, prores, gif.`);
  }
  const ext = extname(outPath).toLowerCase();
  if (ext === ".webm") return "vp9";
  if (ext === ".mov") return "prores";
  if (ext === ".gif") return "gif";
  return "h264";
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
  inputProps: Record<string, unknown> | undefined,
  transparent = false
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

  if (transparent) {
    await page.evaluate(async () => {
      const fn = (window as any).milyonusSetTransparent;
      if (typeof fn === "function") await fn(true);
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
  const transparent = Boolean(options.transparent) && format !== "jpeg";
  const inputProps = await loadInputProps(options.props);

  await mkdir(dirname(out), { recursive: true });
  const browser = await launchHeadlessBrowser();
  try {
    const page = await browser.newPage();
    const discovered = await prepareRenderPage(page, url, options.composition, inputProps, transparent);
    const width = options.width ?? discovered.width;
    const height = options.height ?? discovered.height;

    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.evaluate((n: number) => (window as any).milyonusSetFrame(n), frame);
    const stage = await page.$("#milyonus-stage");
    if (!stage) throw new Error("#milyonus-stage not found on the render page.");

    await stage.screenshot({
      path: out as `${string}.png`,
      type: format,
      omitBackground: transparent,
      ...(format !== "png" && options.quality !== undefined ? { quality: options.quality } : {}),
    });

    return { out, width, height, frame };
  } finally {
    await browser.close();
  }
};

const buildVideoCodecArgs = (codec: VideoCodec, transparent: boolean, crf?: number): string[] => {
  if (codec === "vp9") {
    return [
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "0",
      "-crf",
      String(crf ?? 30),
      "-pix_fmt",
      transparent ? "yuva420p" : "yuv420p",
    ];
  }
  if (codec === "prores") {
    return [
      "-c:v",
      "prores_ks",
      "-profile:v",
      transparent ? "4" : "3",
      "-pix_fmt",
      transparent ? "yuva444p10le" : "yuv422p10le",
    ];
  }
  return [
    "-c:v",
    "libx264",
    ...(crf !== undefined ? ["-crf", String(crf)] : []),
    "-pix_fmt",
    "yuv420p",
  ];
};

/**
 * Renders a frame range or full composition to H.264 MP4, VP9 WebM (with optional alpha),
 * Apple ProRes MOV, or high-palette animated GIF, with parallel workers and audio muxing.
 */
export const renderMedia = async (options: RenderMediaOptions = {}): Promise<RenderMediaResult> => {
  if (options.serve) {
    return withServedProject(options.serve, (servedUrl) =>
      renderMedia({ ...options, serve: undefined, url: servedUrl })
    );
  }

  await checkFfmpeg();

  const url = options.url ?? "http://localhost:5173/?render=1";
  const out = resolve(options.out ?? "out/video.mp4");
  const codec = resolveVideoCodec(out, options.codec);
  const transparent = Boolean(options.transparent);
  if (transparent && codec === "h264") {
    throw new Error("H.264 MP4 does not support alpha transparency. Use --codec vp9 (.webm), prores (.mov), or gif (.gif).");
  }
  if (options.crf !== undefined && (!Number.isInteger(options.crf) || options.crf < 0 || options.crf > 51)) {
    throw new Error(`Invalid --crf="${options.crf}": expected an integer in [0, 51].`);
  }

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
      const discovered = await prepareRenderPage(
        primaryPage,
        url,
        options.composition,
        inputProps,
        transparent
      );
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

      const pages: Page[] = [primaryPage];
      if (workerCount > 1) {
        const extraWorkers = await Promise.all(
          Array.from({ length: workerCount - 1 }, async () => {
            const b = await launchHeadlessBrowser();
            browsers.push(b);
            const p = await b.newPage();
            await prepareRenderPage(p, url, options.composition, inputProps, transparent);
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
            await stage.screenshot({ path: file, omitBackground: transparent });
            completed++;
            options.onProgress?.(completed, renderedFrames);
            if (!options.quiet && (completed % 10 === 0 || completed === renderedFrames)) {
              process.stdout.write(`\rFrame ${completed}/${renderedFrames}`);
            }
          }

          if (!options.muted && codec !== "gif") {
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

    if (options.sequenceDir) {
      const seqDest = resolve(options.sequenceDir);
      await mkdir(seqDest, { recursive: true });
      await cp(tempDir, seqDest, {
        recursive: true,
        filter: (srcPath) => srcPath === tempDir || srcPath.endsWith(".png"),
      });
    }

    let audioTracksMuxed = 0;
    if (codec === "gif") {
      const reserveTransparent = transparent ? "1" : "0";
      const gifFilter = `split[s0][s1];[s0]palettegen=reserve_transparent=${reserveTransparent}[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`;
      await runBinary(
        "ffmpeg",
        [
          "-y",
          "-framerate",
          String(fps),
          "-i",
          join(tempDir, "frame-%06d.png"),
          "-vf",
          gifFilter,
          out,
        ],
        options.quiet
      );
    } else {
      const deduplicatedTracks = options.muted ? [] : Array.from(collectedAudio.values());
      const audioPlan = await buildAudioMuxArgs(deduplicatedTracks, {
        fps,
        renderFromFrame: fromFrame,
        renderToFrame: toFrame,
        pageUrl: url,
        tempDir,
      });

      const audioCodecOverride =
        codec === "vp9" && audioPlan.filterAndMapArgs.length > 0
          ? audioPlan.filterAndMapArgs.map((arg) => (arg === "aac" ? "libopus" : arg))
          : audioPlan.filterAndMapArgs;

      const ffmpegArgs = [
        "-y",
        "-framerate",
        String(fps),
        "-i",
        join(tempDir, "frame-%06d.png"),
        ...audioPlan.inputArgs,
        ...buildVideoCodecArgs(codec, transparent, options.crf),
        ...audioCodecOverride,
        out,
      ];

      await runBinary("ffmpeg", ffmpegArgs, options.quiet);
      audioTracksMuxed =
        audioPlan.inputArgs.length > 0 ? deduplicatedTracks.filter((t) => !t.muted).length : 0;
    }

    const renderedFrames = toFrame - fromFrame;
    if (!options.quiet) {
      console.log(`Done: ${out}`);
    }

    return {
      out,
      codec,
      compositionId,
      width,
      height,
      fps,
      fromFrame,
      toFrame,
      renderedFrames,
      audioTracksMuxed,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

/**
 * Losslessly concatenates multiple rendered video chunk files (e.g., from distributed cloud workers)
 * into a single file using FFmpeg's `concat` demuxer.
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
