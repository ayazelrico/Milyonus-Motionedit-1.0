#!/usr/bin/env node
import {
  getNonNegativeIntFlag,
  getPositiveIntFlag,
  getStringFlag,
  parseCliArgs,
} from "./args.js";
import {
  listCompositions,
  renderMedia,
  renderStill,
  stitchMediaChunks,
} from "./renderer.js";
import { runBatchQueue, startWorkerServer } from "./worker.js";

const VERSION = "0.1.0";

const usage = `Milyonus Motionedit CLI v${VERSION}

Usage:
  milyonus render [options]         Render a composition (or frame range) to H.264 MP4
  milyonus still [options]          Capture a single deterministic frame to PNG/JPEG/WebP
  milyonus compositions [options]   List compositions discovered on the render page
  milyonus stitch [options]         Losslessly concatenate rendered MP4 chunks
  milyonus worker [options]         Run a batch render queue or HTTP cloud worker

Render options:
  --url <url>             Render page URL (default: http://localhost:5173/?render=1)
  --serve <dir>           Auto-start a Vite server for <dir> instead of --url
  --composition <id>      Select a composition ID on multi-composition pages
  --props <json|file>     Inline JSON object or path to a .json props file
  --out <file.mp4>        Output MP4 path (default: out/video.mp4)
  --width <px>            Override stage width (defaults to composition config)
  --height <px>           Override stage height (defaults to composition config)
  --fps <n>               Override frame rate (defaults to composition config)
  --frames <n>            Override total frames (defaults to composition config)
  --from-frame <n>        Start frame (inclusive) for chunk rendering
  --to-frame <n>          End frame (exclusive) for chunk rendering
  --concurrency <n>       Number of parallel headless tabs (default: 1)
  --muted                 Omit <Audio> tracks from output

Still options:
  --url <url> | --serve <dir>
  --composition <id>      Select composition ID
  --props <json|file>     Inline JSON object or path to a .json props file
  --frame <n>             Frame index to capture (default: 0)
  --out <file.png>        Output image path (.png, .jpg, .webp; default: out/still.png)
  --width <px>            Override width
  --height <px>           Override height

Stitch options:
  --chunks <a.mp4,b.mp4>  Comma-separated ordered MP4 chunk paths
  --out <final.mp4>       Output stitched MP4 path (default: out/stitched.mp4)

Worker options:
  --queue <jobs.json>     Execute a batch JSON queue of render/still jobs and exit
  --port <n>              Start an HTTP render queue worker on port <n> (default: 4321)
  --host <addr>           Bind address for HTTP worker (default: 0.0.0.0)`;

async function main(): Promise<void> {
  const { command, flags } = parseCliArgs(process.argv.slice(2));

  if (flags.version) {
    console.log(VERSION);
    return;
  }
  if (flags.help || !command) {
    console.log(usage);
    return;
  }

  if (command === "render") {
    await renderMedia({
      url: getStringFlag(flags, "url"),
      serve: getStringFlag(flags, "serve"),
      composition: getStringFlag(flags, "composition"),
      props: getStringFlag(flags, "props"),
      out: getStringFlag(flags, "out", "out/video.mp4"),
      width: getPositiveIntFlag(flags, "width"),
      height: getPositiveIntFlag(flags, "height"),
      fps: getPositiveIntFlag(flags, "fps"),
      frames: getPositiveIntFlag(flags, "frames"),
      fromFrame: getNonNegativeIntFlag(flags, "from-frame"),
      toFrame: getPositiveIntFlag(flags, "to-frame"),
      concurrency: getPositiveIntFlag(flags, "concurrency", 1),
      muted: Boolean(flags.muted),
    });
    return;
  }

  if (command === "still") {
    const res = await renderStill({
      url: getStringFlag(flags, "url"),
      serve: getStringFlag(flags, "serve"),
      composition: getStringFlag(flags, "composition"),
      props: getStringFlag(flags, "props"),
      frame: getNonNegativeIntFlag(flags, "frame", 0),
      out: getStringFlag(flags, "out", "out/still.png"),
      width: getPositiveIntFlag(flags, "width"),
      height: getPositiveIntFlag(flags, "height"),
    });
    console.log(`Done: ${res.out} (frame ${res.frame}, ${res.width}x${res.height})`);
    return;
  }

  if (command === "compositions") {
    const list = await listCompositions({
      url: getStringFlag(flags, "url"),
      serve: getStringFlag(flags, "serve"),
    });
    if (list.length === 0) {
      console.log("No compositions discovered.");
      return;
    }
    for (const c of list) {
      console.log(
        `${c.id}\t${c.width}x${c.height}\t${c.fps}fps\t${c.durationInFrames} frames${
          c.description ? `\t— ${c.description}` : ""
        }`
      );
    }
    return;
  }

  if (command === "stitch") {
    const rawChunks = getStringFlag(flags, "chunks");
    if (!rawChunks) {
      throw new Error("milyonus stitch requires --chunks <chunk1.mp4,chunk2.mp4,...>");
    }
    const chunks = rawChunks
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const out = await stitchMediaChunks(chunks, getStringFlag(flags, "out", "out/stitched.mp4"));
    console.log(`Done: ${out}`);
    return;
  }

  if (command === "worker") {
    const queueFile = getStringFlag(flags, "queue");
    if (queueFile) {
      const records = await runBatchQueue(queueFile);
      console.log(`Completed ${records.length} queued job(s).`);
      return;
    }
    const port = getPositiveIntFlag(flags, "port", 4321);
    const host = getStringFlag(flags, "host", "0.0.0.0");
    await startWorkerServer({ port, host });
    return;
  }

  console.error(`Unknown command: "${command}"\n`);
  console.log(usage);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
