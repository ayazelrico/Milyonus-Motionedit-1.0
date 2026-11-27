import React, { useContext, useId } from "react";
import { FrameContext, InspectorContext } from "./context.js";

export type SequenceProps = {
  /** Frame (relative to the parent) at which children appear. Defaults to `0`. */
  from?: number;
  /** How long children stay mounted. Defaults to "until the parent ends". */
  durationInFrames?: number;
  /** Optional label displayed in `<Studio>` timelines. */
  name?: string;
  /** Wrapper layout mode: `"absolute-fill"` (default) or `"none"` (renders children directly). */
  layout?: "absolute-fill" | "none";
  /** Optional inline styles merged onto the `"absolute-fill"` container. */
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/** Shifts time for its children and unmounts them outside `[from, from + durationInFrames)`. */
export const Sequence: React.FC<SequenceProps> = ({
  from = 0,
  durationInFrames = Infinity,
  name,
  layout = "absolute-fill",
  style,
  children,
}) => {
  const ctx = useContext(FrameContext);
  const inspector = useContext(InspectorContext);
  const reactId = useId();

  if (!ctx) throw new Error("<Sequence> must be used inside a <Player>, <Studio>, or <FrameRenderer>.");

  const parentStart = ctx.sequenceFrom ?? 0;
  const parentDuration = ctx.sequenceDurationInFrames ?? ctx.durationInFrames;
  const absoluteFrom = parentStart + from;
  const remainingInParent = Math.max(0, parentDuration - from);
  const resolvedDuration = Number.isFinite(durationInFrames)
    ? Math.max(0, Math.min(durationInFrames, remainingInParent))
    : remainingInParent;
  const depth = ctx.sequenceDepth ?? 0;

  if (inspector?.reportSequence) {
    inspector.reportSequence({
      id: `${depth}:${absoluteFrom}:${resolvedDuration}:${name ?? reactId}`,
      name: name ?? `Sequence @ ${absoluteFrom}`,
      from: absoluteFrom,
      durationInFrames: resolvedDuration,
      depth,
    });
  }

  const local = ctx.frame - from;
  if (local < 0 || local >= durationInFrames) return null;

  const nextState = {
    ...ctx,
    frame: local,
    absoluteFrame: ctx.absoluteFrame ?? ctx.frame,
    sequenceFrom: absoluteFrom,
    sequenceDurationInFrames: resolvedDuration,
    sequenceDepth: depth + 1,
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
