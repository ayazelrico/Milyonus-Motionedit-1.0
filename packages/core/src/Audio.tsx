import React, { useContext, useEffect, useId, useRef } from "react";
import { InspectorContext, useFrameState, usePlayback } from "./context.js";

export type AudioProps = {
  /** URL or file path to the audio asset (WAV, MP3, AAC, OGG, etc.). */
  src: string;
  /** Optional display label in `<Studio>` timelines. */
  name?: string;
  /** Source frames skipped from the start of `src`. Defaults to `0`. */
  trimBefore?: number;
  /** Optional source frame index at which playback of `src` stops. */
  trimAfter?: number;
  /** Scalar volume (`0..1+`) or a pure function `(localFrame) => number`. Defaults to `1`. */
  volume?: number | ((frame: number) => number);
  /** Playback rate multiplier (`0.5` to `4`). Defaults to `1`. */
  playbackRate?: number;
  /** Loop audio when the sequence outlasts the source clip. Defaults to `false`. */
  loop?: boolean;
  /** Mute this audio track in preview and rendered output. Defaults to `false`. */
  muted?: boolean;
};

const clampNonNegative = (n: number): number => (Number.isFinite(n) ? Math.max(0, n) : 0);

/**
 * Declarative audio track sliced automatically by its enclosing `<Sequence>` window.
 * Syncs an HTML5 `<audio>` element in preview and registers exact frame slice metadata for FFmpeg muxing in render mode.
 */
export const Audio: React.FC<AudioProps> = ({
  src,
  name,
  trimBefore = 0,
  trimAfter,
  volume = 1,
  playbackRate = 1,
  loop = false,
  muted = false,
}) => {
  const state = useFrameState();
  const playback = usePlayback();
  const inspector = useContext(InspectorContext);
  const reactId = useId();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const startFrame = state.sequenceFrom ?? 0;
  const seqDuration = state.sequenceDurationInFrames ?? state.durationInFrames;
  const maxTrimmedFrames =
    trimAfter !== undefined
      ? Math.max(0, Math.floor((trimAfter - trimBefore) / Math.max(0.01, playbackRate)))
      : Infinity;
  const activeDuration = loop ? seqDuration : Math.min(seqDuration, maxTrimmedFrames);

  if (inspector?.reportAudio && activeDuration > 0) {
    let scalarVolume = 1;
    let volumeSamples: number[] | undefined;
    if (typeof volume === "function") {
      const sampleCount = Math.min(activeDuration, 36000);
      volumeSamples = Array.from({ length: sampleCount }, (_, f) => clampNonNegative(volume(f)));
      const sum = volumeSamples.reduce((acc, v) => acc + v, 0);
      scalarVolume = sampleCount > 0 ? sum / sampleCount : 1;
    } else {
      scalarVolume = clampNonNegative(volume);
    }

    inspector.reportAudio({
      id: `${startFrame}:${activeDuration}:${trimBefore}:${src}:${name ?? reactId}`,
      name: name ?? src.split("/").pop() ?? "Audio",
      src,
      startFrame,
      durationInFrames: activeDuration,
      trimBefore: Math.max(0, trimBefore),
      trimAfter,
      volume: scalarVolume,
      volumeSamples,
      playbackRate: playbackRate > 0 ? playbackRate : 1,
      loop,
      muted,
    });
  }

  const withinTrimWindow = state.frame >= 0 && state.frame < activeDuration;
  const currentVolume =
    muted || playback.muted || !withinTrimWindow
      ? 0
      : clampNonNegative(typeof volume === "function" ? volume(state.frame) : volume);

  useEffect(() => {
    if (playback.renderMode) return;
    const el = audioRef.current;
    if (!el) return;

    el.volume = Math.min(1, currentVolume);
    el.muted = muted || playback.muted || !withinTrimWindow;
    el.playbackRate = playbackRate > 0 ? playbackRate : 1;
    el.loop = loop;

    const targetTime = (Math.max(0, trimBefore) / state.fps) + (state.frame / state.fps) * el.playbackRate;
    const drift = Math.abs(el.currentTime - targetTime);
    if (drift > (playback.playing ? 0.2 : 0.02)) {
      try {
        el.currentTime = targetTime;
      } catch {
        // Ignore seek errors before media metadata has loaded.
      }
    }

    if (playback.playing && withinTrimWindow && !el.muted) {
      if (el.paused) {
        el.play().catch(() => {
          // Browser autoplay policy may block unmuted audio until user interaction.
        });
      }
    } else if (!el.paused) {
      el.pause();
    }
  }, [
    playback.renderMode,
    playback.playing,
    playback.muted,
    muted,
    withinTrimWindow,
    currentVolume,
    playbackRate,
    loop,
    trimBefore,
    state.frame,
    state.fps,
  ]);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    []
  );

  if (playback.renderMode || !withinTrimWindow) return null;

  return <audio ref={audioRef} src={src} preload="auto" style={{ display: "none" }} />;
};
