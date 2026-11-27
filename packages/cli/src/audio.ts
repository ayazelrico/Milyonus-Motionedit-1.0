import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ResolvedAudioTrack } from "@milyonus/core";

export type AudioMuxPlan = {
  /** Extra `-i` arguments (including `-stream_loop -1` where needed) appended after the video input. */
  inputArgs: string[];
  /** `-filter_complex` graph and `-map` / codec arguments, or empty when there are no audible tracks. */
  filterAndMapArgs: string[];
};

/** Decomposes an arbitrary playback rate into chained FFmpeg `atempo` filters (each in `[0.5, 2.0]`). */
export const buildAtempoChain = (rate: number): string[] => {
  if (!Number.isFinite(rate) || rate <= 0 || Math.abs(rate - 1) < 1e-6) return [];
  const filters: string[] = [];
  let rem = rate;
  while (rem > 2.0) {
    filters.push("atempo=2.0");
    rem /= 2.0;
  }
  while (rem < 0.5) {
    filters.push("atempo=0.5");
    rem /= 0.5;
  }
  if (Math.abs(rem - 1) >= 1e-4) {
    filters.push(`atempo=${rem.toFixed(6)}`);
  }
  return filters;
};

/** Resolves an audio `src` (file path, HTTP URL, root-relative URL, or base64 data URI) for FFmpeg. */
export const resolveAudioSource = async (
  src: string,
  pageUrl: string,
  tempDir: string,
  index: number
): Promise<string> => {
  if (src.startsWith("data:")) {
    const match = src.match(/^data:audio\/([a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) throw new Error(`Unsupported audio data URI format.`);
    const ext = match[1] === "mpeg" ? "mp3" : match[1].replace(/[^a-z0-9]/gi, "") || "wav";
    const filePath = join(tempDir, `inline-audio-${index}.${ext}`);
    await writeFile(filePath, Buffer.from(match[2], "base64"));
    return filePath;
  }
  if (/^https?:\/\//i.test(src) || src.startsWith("file://")) {
    return src;
  }
  const candidateLocal = resolve(src);
  if (existsSync(candidateLocal)) {
    return candidateLocal;
  }
  try {
    return new URL(src, pageUrl).toString();
  } catch {
    return candidateLocal;
  }
};

/** Builds a volume filter expression from constant or per-frame sampled volume values. */
const buildVolumeFilter = (track: ResolvedAudioTrack, sliceStartOffsetFrames: number, sliceFrames: number, fps: number): string => {
  if (!track.volumeSamples || track.volumeSamples.length === 0) {
    return `volume=${Math.max(0, track.volume).toFixed(4)}`;
  }
  const samples = track.volumeSamples.slice(sliceStartOffsetFrames, sliceStartOffsetFrames + sliceFrames);
  if (samples.length === 0) {
    return `volume=${Math.max(0, track.volume).toFixed(4)}`;
  }
  const first = samples[0];
  const isConstant = samples.every((v) => Math.abs(v - first) < 1e-4);
  if (isConstant) {
    return `volume=${Math.max(0, first).toFixed(4)}`;
  }
  // Downsample up to 24 piecewise-linear segments so the FFmpeg expression stays compact and exact.
  const maxStops = Math.min(samples.length, 25);
  const stopIndices: number[] = [];
  for (let s = 0; s < maxStops; s++) {
    stopIndices.push(Math.round((s * (samples.length - 1)) / Math.max(1, maxStops - 1)));
  }
  const uniqueStops = Array.from(new Set(stopIndices));
  if (uniqueStops.length === 1) {
    return `volume=${Math.max(0, samples[uniqueStops[0]]).toFixed(4)}`;
  }
  let expr = Math.max(0, samples[uniqueStops[uniqueStops.length - 1]]).toFixed(4);
  for (let i = uniqueStops.length - 2; i >= 0; i--) {
    const f0 = uniqueStops[i];
    const f1 = uniqueStops[i + 1];
    const t0 = (f0 / fps).toFixed(4);
    const t1 = (f1 / fps).toFixed(4);
    const v0 = Math.max(0, samples[f0]).toFixed(4);
    const v1 = Math.max(0, samples[f1]).toFixed(4);
    const segDur = Math.max(0.0001, (f1 - f0) / fps).toFixed(4);
    const lerp = `${v0}+(${v1}-${v0})*((t-${t0})/${segDur})`;
    expr = `if(lt(t,${t1}),${lerp},${expr})`;
  }
  return `volume='${expr}':eval=frame`;
};

/**
 * Builds FFmpeg input and `-filter_complex` arguments to slice, offset, rate-adjust, and mix `<Audio>` tracks
 * over the rendered `[renderFromFrame, renderToFrame)` window.
 */
export const buildAudioMuxArgs = async (
  tracks: readonly ResolvedAudioTrack[],
  {
    fps,
    renderFromFrame,
    renderToFrame,
    pageUrl,
    tempDir,
  }: {
    fps: number;
    renderFromFrame: number;
    renderToFrame: number;
    pageUrl: string;
    tempDir: string;
  }
): Promise<AudioMuxPlan> => {
  const totalFrames = Math.max(0, renderToFrame - renderFromFrame);
  if (totalFrames === 0) return { inputArgs: [], filterAndMapArgs: [] };
  const videoDurationSec = totalFrames / fps;

  const active = tracks.filter((t) => {
    if (t.muted || t.durationInFrames <= 0) return false;
    const hasAudibleSample = t.volumeSamples ? t.volumeSamples.some((v) => v > 0) : t.volume > 0;
    if (!hasAudibleSample) return false;
    const trackEnd = t.startFrame + t.durationInFrames;
    return trackEnd > renderFromFrame && t.startFrame < renderToFrame;
  });

  if (active.length === 0) {
    return { inputArgs: [], filterAndMapArgs: [] };
  }

  const inputArgs: string[] = [];
  const filterChains: string[] = [];
  const mixLabels: string[] = [];

  for (let idx = 0; idx < active.length; idx++) {
    const track = active[idx];
    const resolvedSrc = await resolveAudioSource(track.src, pageUrl, tempDir, idx);
    if (track.loop) {
      inputArgs.push("-stream_loop", "-1");
    }
    inputArgs.push("-i", resolvedSrc);

    const trackEnd = track.startFrame + track.durationInFrames;
    const overlapStart = Math.max(track.startFrame, renderFromFrame);
    const overlapEnd = Math.min(trackEnd, renderToFrame);
    const overlapFrames = Math.max(1, overlapEnd - overlapStart);
    const skippedIntoSequenceFrames = overlapStart - track.startFrame;

    const rate = track.playbackRate > 0 ? track.playbackRate : 1;
    const sourceStartSec = (track.trimBefore + skippedIntoSequenceFrames * rate) / fps;
    const sourceDurationSec = (overlapFrames * rate) / fps;
    const outputPlaySec = overlapFrames / fps;
    const delayMs = Math.round(((overlapStart - renderFromFrame) / fps) * 1000);

    const chain: string[] = [
      `atrim=start=${sourceStartSec.toFixed(6)}:duration=${sourceDurationSec.toFixed(6)}`,
      "asetpts=PTS-STARTPTS",
      ...buildAtempoChain(rate),
      `atrim=0:${outputPlaySec.toFixed(6)}`,
      "asetpts=PTS-STARTPTS",
      buildVolumeFilter(track, skippedIntoSequenceFrames, overlapFrames, fps),
    ];

    if (delayMs > 0) {
      chain.push(`adelay=${delayMs}:all=1`);
    }
    chain.push(`apad=whole_dur=${videoDurationSec.toFixed(6)}`);
    chain.push(`atrim=0:${videoDurationSec.toFixed(6)}`);
    chain.push("asetpts=PTS-STARTPTS");

    const label = `[a${idx}]`;
    filterChains.push(`[${idx + 1}:a]${chain.join(",")}${label}`);
    mixLabels.push(label);
  }

  const outLabel = active.length === 1 ? mixLabels[0] : "[aout]";
  if (active.length > 1) {
    filterChains.push(
      `${mixLabels.join("")}amix=inputs=${active.length}:duration=first:dropout_transition=0:normalize=0${outLabel}`
    );
  }

  return {
    inputArgs,
    filterAndMapArgs: [
      "-filter_complex",
      filterChains.join(";"),
      "-map",
      "0:v:0",
      "-map",
      outLabel,
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
    ],
  };
};
