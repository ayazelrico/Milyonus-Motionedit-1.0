import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  buildAtempoChain,
  buildAudioMuxArgs,
  getNonNegativeIntFlag,
  getPositiveIntFlag,
  listCompositions,
  loadInputProps,
  parseCliArgs,
  renderMedia,
  renderStill,
  runBatchQueue,
  startWorkerServer,
  stitchMediaChunks,
} from "../dist/index.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const exampleDir = resolve(__dirname, "../../../examples/hello-world");

test("CLI argument parser and numeric validators enforce strict inputs", async () => {
  const parsed = parseCliArgs([
    "render",
    "--url",
    "http://localhost:5173/?render=1",
    "--frames=45",
    "--muted",
    "-v",
  ]);
  assert.equal(parsed.command, "render");
  assert.equal(parsed.flags.url, "http://localhost:5173/?render=1");
  assert.equal(parsed.flags.frames, "45");
  assert.equal(parsed.flags.muted, true);
  assert.equal(parsed.flags.version, true);

  assert.equal(getPositiveIntFlag(parsed.flags, "frames"), 45);
  assert.equal(getNonNegativeIntFlag({ frame: "0" }, "frame"), 0);
  assert.throws(() => getPositiveIntFlag({ frames: "0" }, "frames"), /positive integer/);
  assert.throws(() => getPositiveIntFlag({ frames: "abc" }, "frames"), /positive integer/);
  assert.throws(() => getNonNegativeIntFlag({ frame: "-1" }, "frame"), /non-negative integer/);

  const tmp = await mkdtemp(join(tmpdir(), "milyonus-cli-props-"));
  try {
    const propsPath = join(tmp, "props.json");
    await writeFile(propsPath, JSON.stringify({ title: "FromFile", count: 3 }), "utf8");
    assert.deepEqual(await loadInputProps('{"title":"Inline"}'), { title: "Inline" });
    assert.deepEqual(await loadInputProps(propsPath), { title: "FromFile", count: 3 });
    await assert.rejects(() => loadInputProps("[1,2,3]"), /JSON object/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("buildAtempoChain and buildAudioMuxArgs construct valid FFmpeg filter graphs", async () => {
  assert.deepEqual(buildAtempoChain(1), []);
  assert.deepEqual(buildAtempoChain(2), ["atempo=2.000000"]);
  assert.deepEqual(buildAtempoChain(4), ["atempo=2.0", "atempo=2.000000"]);
  assert.deepEqual(buildAtempoChain(0.25), ["atempo=0.5", "atempo=0.500000"]);

  const tmp = await mkdtemp(join(tmpdir(), "milyonus-audio-test-"));
  try {
    const silentWavBase64 = Buffer.alloc(64).toString("base64");
    const plan = await buildAudioMuxArgs(
      [
        {
          id: "1",
          src: `data:audio/wav;base64,${silentWavBase64}`,
          startFrame: 15,
          durationInFrames: 30,
          trimBefore: 5,
          volume: 0.8,
          playbackRate: 1,
          loop: false,
          muted: false,
        },
        {
          id: "2",
          src: "/muted.wav",
          startFrame: 0,
          durationInFrames: 30,
          trimBefore: 0,
          volume: 1,
          playbackRate: 1,
          loop: false,
          muted: true,
        },
      ],
      {
        fps: 30,
        renderFromFrame: 0,
        renderToFrame: 60,
        pageUrl: "http://localhost:5173/?render=1",
        tempDir: tmp,
      }
    );

    assert.equal(plan.inputArgs.length, 2);
    assert.equal(plan.inputArgs[0], "-i");
    assert.match(plan.filterAndMapArgs[1], /adelay=500:all=1/);
    assert.match(plan.filterAndMapArgs[1], /volume=0\.8000/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("E2E: listCompositions, renderStill, parallel renderMedia with audio muxing, stitch, and worker queue", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "milyonus-e2e-"));
  try {
    await withServedHelper(async (renderUrl) => {
      // 1. Discover compositions
      const comps = await listCompositions({ url: renderUrl });
      assert.ok(comps.some((c) => c.id === "hello" && c.width === 1280 && c.height === 720));
      assert.ok(comps.some((c) => c.id === "launch-card" && c.width === 1080 && c.height === 1080));

      // 2. Capture still PNG with custom props
      const stillPath = join(outDir, "card.png");
      const stillRes = await renderStill({
        url: renderUrl,
        composition: "launch-card",
        frame: 15,
        props: { headline: "Custom Still Headline" },
        out: stillPath,
      });
      assert.equal(stillRes.width, 1080);
      assert.equal(stillRes.height, 1080);
      const pngBytes = await readFile(stillPath);
      assert.equal(pngBytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.equal(pngBytes.readUInt32BE(16), 1080);
      assert.equal(pngBytes.readUInt32BE(20), 1080);

      // 3. Parallel render chunk 1 [0, 12) with audio muxed + chunk 2 [12, 24), then stitch
      const chunk1 = join(outDir, "chunk1.mp4");
      const chunk2 = join(outDir, "chunk2.mp4");
      const stitched = join(outDir, "stitched.mp4");

      const res1 = await renderMedia({
        url: renderUrl,
        composition: "hello",
        props: { title: "Parallel Test", withAudio: true },
        fromFrame: 0,
        toFrame: 12,
        concurrency: 2,
        out: chunk1,
        quiet: true,
      });
      assert.equal(res1.renderedFrames, 12);
      assert.ok(res1.audioTracksMuxed >= 1);

      const { stdout: probeOut } = await execFileAsync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "stream=codec_type,codec_name,width,height",
        "-of",
        "json",
        chunk1,
      ]);
      const probeJson = JSON.parse(probeOut);
      assert.ok(probeJson.streams.some((s) => s.codec_type === "video" && s.codec_name === "h264" && s.width === 1280));
      assert.ok(probeJson.streams.some((s) => s.codec_type === "audio" && s.codec_name === "aac"));

      await renderMedia({
        url: renderUrl,
        composition: "hello",
        props: { title: "Parallel Test", withAudio: true },
        fromFrame: 12,
        toFrame: 24,
        concurrency: 2,
        out: chunk2,
        quiet: true,
      });

      await stitchMediaChunks([chunk1, chunk2], stitched, true);
      const stitchedStat = await stat(stitched);
      assert.ok(stitchedStat.size > 1000);

      // 4. Batch queue & HTTP worker queue
      const queueJsonPath = join(outDir, "jobs.json");
      const batchStillPath = join(outDir, "batch-still.png");
      await writeFile(
        queueJsonPath,
        JSON.stringify([
          {
            type: "still",
            url: renderUrl,
            composition: "hello",
            frame: 10,
            out: batchStillPath,
          },
        ]),
        "utf8"
      );
      const batchRecords = await runBatchQueue(queueJsonPath, true);
      assert.equal(batchRecords[0].status, "completed");
      assert.ok((await stat(batchStillPath)).size > 500);

      const worker = await startWorkerServer({ port: 0, host: "127.0.0.1", quiet: true });
      try {
        const base = `http://127.0.0.1:${worker.port}`;
        const health = await (await fetch(`${base}/health`)).json();
        assert.equal(health.status, "ok");

        const httpStillOut = join(outDir, "worker-still.png");
        const submitResp = await fetch(`${base}/jobs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "still",
            url: renderUrl,
            composition: "hello",
            frame: 20,
            out: httpStillOut,
          }),
        });
        assert.equal(submitResp.status, 202);
        const created = await submitResp.json();

        let status = created.status;
        for (let attempt = 0; attempt < 100 && status !== "completed" && status !== "failed"; attempt++) {
          await new Promise((r) => setTimeout(r, 150));
          const polled = await (await fetch(`${base}/jobs/${created.id}`)).json();
          status = polled.status;
        }
        assert.equal(status, "completed");
        assert.ok((await stat(httpStillOut)).size > 500);
      } finally {
        await worker.close();
      }
    });
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

async function withServedHelper(fn) {
  const { withServedProject } = await import("../dist/browser.js");
  return withServedProject(exampleDir, fn);
}
