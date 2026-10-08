import React, { useContext } from "react";
import { FrameContext } from "./context.js";

export type SequenceProps = {
  /** Frame (relative to the parent) at which children appear. */
  from?: number;
  /** How long children stay mounted. Defaults to "until the parent ends". */
  durationInFrames?: number;
  children?: React.ReactNode;
};

/** Shifts time for its children and unmounts them outside [from, from + duration). */
export const Sequence: React.FC<SequenceProps> = ({ from = 0, durationInFrames = Infinity, children }) => {
  const ctx = useContext(FrameContext);
  if (!ctx) throw new Error("<Sequence> must be used inside a <Player> or <FrameRenderer>.");
  const local = ctx.frame - from;
  if (local < 0 || local >= durationInFrames) return null;
  return (
    <FrameContext.Provider value={{ ...ctx, frame: local }}>
      <div style={{ position: "absolute", inset: 0, display: "flex" }}>{children}</div>
    </FrameContext.Provider>
  );
};
