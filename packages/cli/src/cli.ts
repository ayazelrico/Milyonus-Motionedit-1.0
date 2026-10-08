#!/usr/bin/env node
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer";

const args = process.argv.slice(2);
const cmd = args[0];

const opt = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const usage = `Usage:
  milyonus render --url <render-page-url> --out <file.mp4> --width 1280 --height 720 --fps 30 --frames 90

The render page must expose window.milyonusSetFrame (use <FrameRenderer /> from @milyonus/player).
Requires FFmpeg on your PATH.`;

const run = (bin: string, a: string[]) =>
  new Promise<void>((res, rej) => {
    const p = spawn(bin, a, { stdio: "inherit" });
    p.on("error", rej);
    p.on("exit", (code) => (code === 0 ? res() : rej(new Error(`${bin} exited with ${code}`))));
  });

async function render() {
  const url = opt("url", "http://localhost:5173/?render=1");
  const out = opt("out", "out/video.mp4");
  const width = Number(opt("width", "1280"));
  const height = Number(opt("height", "720"));
  const fps = Number(opt("fps", "30"));
  const frames = Number(opt("frames", "90"));

  await mkdir(dirname(out), { recursive: true });
  const dir = await mkdtemp(join(tmpdir(), "milyonus-"));
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle0" });
    await page.waitForFunction("window.milyonusReady === true", { timeout: 30000 });
    const stage = await page.$("#milyonus-stage");
    if (!stage) throw new Error("#milyonus-stage not found on the render page.");

    for (let f = 0; f < frames; f++) {
      await page.evaluate((n: number) => (window as any).milyonusSetFrame(n), f);
      const file = join(dir, `frame-${String(f).padStart(6, "0")}.png`) as `${string}.png`;
      await stage.screenshot({ path: file });
      if (f % 10 === 0) process.stdout.write(`\rFrame ${f + 1}/${frames}`);
    }
    process.stdout.write(`\rFrame ${frames}/${frames}\n`);
  } finally {
    await browser.close();
  }
  await run("ffmpeg", ["-y", "-framerate", String(fps), "-i", join(dir, "frame-%06d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
  await rm(dir, { recursive: true, force: true });
  console.log(`Done: ${out}`);
}

if (cmd === "render") {
  render().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  console.log(usage);
}
