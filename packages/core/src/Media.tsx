import React, { useContext, useEffect, useId, useLayoutEffect, useRef } from "react";
import { InspectorContext, useFrameState, usePlayback } from "./context.js";
import { cancelRender, continueRender, delayRender } from "./delayRender.js";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type ImgProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  /** Image URL or data URI (required). */
  src: string;
};

/**
 * Frame-safe `<img>` replacement that blocks `<FrameRenderer>` via `delayRender`
 * until the image has fully loaded and decoded before any screenshot is taken.
 */
export const Img = React.forwardRef<HTMLImageElement, ImgProps>(({ src, onLoad, onError, ...rest }, forwardedRef) => {
  const playback = usePlayback();
  const internalRef = useRef<HTMLImageElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!playback.renderMode) return;
    const el = internalRef.current;
    if (!el) return;
    if (el.complete && el.naturalWidth > 0) return;

    const handle = delayRender(`Img(${src.slice(0, 64)})`);
    let done = false;
    const settle = () => {
      if (!done) {
        done = true;
        continueRender(handle);
      }
    };

    if (typeof el.decode === "function") {
      el.decode().then(settle, () => {
        if (el.complete && el.naturalWidth > 0) settle();
      });
    }

    const handleLoad = () => settle();
    const handleError = () => {
      if (!done) {
        done = true;
        cancelRender(new Error(`Failed to load <Img src="${src}" />`));
      }
    };

    el.addEventListener("load", handleLoad);
    el.addEventListener("error", handleError);
    return () => {
      el.removeEventListener("load", handleLoad);
      el.removeEventListener("error", handleError);
      settle();
    };
  }, [src, playback.renderMode]);

  return (
    <img
      ref={(node) => {
        internalRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      src={src}
      onLoad={onLoad}
      onError={onError}
      {...rest}
    />
  );
});
Img.displayName = "Img";

export type VideoProps = Omit<React.VideoHTMLAttributes<HTMLVideoElement>, "loop" | "muted"> & {
  /** Video asset URL or path. */
  src: string;
  /** Optional timeline label. */
  name?: string;
  /** Source frames skipped from the start of `src`. Defaults to `0`. */
  trimBefore?: number;
  /** Optional source frame index where playback stops. */
  trimAfter?: number;
  /** Audio volume (`0..1+`) or `(localFrame) => number`. Defaults to `1`. */
  volume?: number | ((frame: number) => number);
  /** Playback rate multiplier. Defaults to `1`. */
  playbackRate?: number;
  /** Loop video when sequence outlasts source clip. Defaults to `false`. */
  loop?: boolean;
  /** Mute embedded audio track in preview and FFmpeg muxing. Defaults to `false`. */
  muted?: boolean;
};

/**
 * Frame-synchronized `<video>` element. Seeks deterministically to `(trimBefore + frame) / fps`
 * and holds `<FrameRenderer>` via `delayRender` until the target frame has decoded.
 * Also reports embedded audio to FFmpeg unless `muted` is true.
 */
export const Video: React.FC<VideoProps> = ({
  src,
  name,
  trimBefore = 0,
  trimAfter,
  volume = 1,
  playbackRate = 1,
  loop = false,
  muted = false,
  style,
  ...rest
}) => {
  const state = useFrameState();
  const playback = usePlayback();
  const inspector = useContext(InspectorContext);
  const reactId = useId();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const startFrame = state.sequenceFrom ?? 0;
  const seqDuration = state.sequenceDurationInFrames ?? state.durationInFrames;
  const maxTrimmedFrames =
    trimAfter !== undefined
      ? Math.max(0, Math.floor((trimAfter - trimBefore) / Math.max(0.01, playbackRate)))
      : Infinity;
  const activeDuration = loop ? seqDuration : Math.min(seqDuration, maxTrimmedFrames);

  if (inspector?.reportAudio && !muted && activeDuration > 0) {
    const scalarVolume =
      typeof volume === "function"
        ? Math.max(0, volume(0))
        : Math.max(0, volume);
    const volumeSamples =
      typeof volume === "function"
        ? Array.from({ length: Math.min(activeDuration, 36000) }, (_, f) => Math.max(0, volume(f)))
        : undefined;

    inspector.reportAudio({
      id: `video:${startFrame}:${activeDuration}:${trimBefore}:${src}:${name ?? reactId}`,
      name: name ?? src.split("/").pop() ?? "Video Audio",
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

  const withinWindow = state.frame >= 0 && state.frame < activeDuration;
  const rate = playbackRate > 0 ? playbackRate : 1;
  const targetTime = Math.max(0, trimBefore) / state.fps + (state.frame / state.fps) * rate;

  useIsomorphicLayoutEffect(() => {
    const el = videoRef.current;
    if (!el || !withinWindow) return;

    if (playback.renderMode) {
      el.pause();
      el.muted = true;
      if (el.readyState >= 2 && Math.abs(el.currentTime - targetTime) < 0.005) {
        return;
      }
      const handle = delayRender(`Video(${src.slice(0, 48)} @ ${targetTime.toFixed(3)}s)`);
      let settled = false;
      const done = () => {
        if (!settled) {
          settled = true;
          continueRender(handle);
        }
      };
      const onSeeked = () => done();
      const onLoaded = () => {
        el.currentTime = targetTime;
        if (Math.abs(el.currentTime - targetTime) < 0.005) done();
      };
      const onError = () => {
        if (!settled) {
          settled = true;
          cancelRender(new Error(`Failed to load/seek <Video src="${src}" />`));
        }
      };

      el.addEventListener("seeked", onSeeked);
      el.addEventListener("loadeddata", onLoaded);
      el.addEventListener("error", onError);
      if (el.readyState >= 1) {
        try {
          el.currentTime = targetTime;
        } catch {
          // Wait for loadeddata.
        }
      }
      return () => {
        el.removeEventListener("seeked", onSeeked);
        el.removeEventListener("loadeddata", onLoaded);
        el.removeEventListener("error", onError);
        done();
      };
    }

    // Preview mode synchronization
    const currentVol =
      muted || playback.muted
        ? 0
        : Math.max(0, Math.min(1, typeof volume === "function" ? volume(state.frame) : volume));
    el.volume = currentVol;
    el.muted = muted || playback.muted;
    el.playbackRate = rate;
    el.loop = loop;

    if (Math.abs(el.currentTime - targetTime) > (playback.playing ? 0.22 : 0.02)) {
      try {
        el.currentTime = targetTime;
      } catch {
        // Ignore seek before metadata.
      }
    }

    if (playback.playing) {
      if (el.paused) el.play().catch(() => {});
    } else if (!el.paused) {
      el.pause();
    }
  }, [
    src,
    withinWindow,
    playback.renderMode,
    playback.playing,
    playback.muted,
    muted,
    volume,
    rate,
    loop,
    targetTime,
    state.frame,
  ]);

  if (!withinWindow) return null;

  return (
    <video
      ref={videoRef}
      src={src}
      playsInline
      preload="auto"
      muted={playback.renderMode || muted || playback.muted}
      style={{ width: "100%", height: "100%", objectFit: "cover", ...style }}
      {...rest}
    />
  );
};
