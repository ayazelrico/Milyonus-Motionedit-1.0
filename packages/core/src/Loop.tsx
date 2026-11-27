import React from "react";
import { FrameContext, useFrameState } from "./context.js";

export type LoopProps = {
  /** Length of a single cycle in frames (must be a positive integer). */
  durationInFrames: number;
  /** Number of repetitions. Defaults to `Infinity` (loops until parent ends). */
  times?: number;
  /** Wrapper layout mode: `"absolute-fill"` (default) or `"none"`. */
  layout?: "absolute-fill" | "none";
  /** Optional inline styles merged onto the wrapper div when `layout="absolute-fill"`. */
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/**
 * Repeats its children every `durationInFrames` frames (`localFrame = frame % durationInFrames`).
 * Unmounts after `durationInFrames * times` when `times` is finite.
 */
export const Loop: React.FC<LoopProps> = ({
  durationInFrames,
  times = Infinity,
  layout = "absolute-fill",
  style,
  children,
}) => {
  const ctx = useFrameState();
  if (!Number.isInteger(durationInFrames) || durationInFrames <= 0) {
    throw new Error("<Loop> requires a positive integer durationInFrames.");
  }
  if (times <= 0) return null;

  const maxFrames = Number.isFinite(times) ? durationInFrames * times : Infinity;
  if (ctx.frame < 0 || ctx.frame >= maxFrames) return null;

  const iteration = Math.floor(ctx.frame / durationInFrames);
  const loopedFrame = ctx.frame % durationInFrames;
  const parentStart = ctx.sequenceFrom ?? 0;

  const nextState = {
    ...ctx,
    frame: loopedFrame,
    sequenceFrom: parentStart + iteration * durationInFrames,
    sequenceDurationInFrames: durationInFrames,
  };

  return (
    <FrameContext.Provider value={nextState}>
      {layout === "none" ? (
        children
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", ...style }}>{children}</div>
      )}
    </FrameContext.Provider>
  );
};
