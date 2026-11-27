import React from "react";
import { FrameContext, useFrameState } from "./context.js";

export type FreezeProps = {
  /** Frame value seen by children while frozen. */
  frame: number;
  /** Boolean or pure predicate `(currentFrame) => boolean` controlling whether freezing is active. Defaults to `true`. */
  active?: boolean | ((currentFrame: number) => boolean);
  children?: React.ReactNode;
};

/**
 * Holds `useCurrentFrame()` at a constant `frame` for all descendant components while `active` is true.
 */
export const Freeze: React.FC<FreezeProps> = ({ frame, active = true, children }) => {
  const ctx = useFrameState();
  const isFrozen = typeof active === "function" ? active(ctx.frame) : active;
  if (!isFrozen) {
    return <>{children}</>;
  }
  return <FrameContext.Provider value={{ ...ctx, frame }}>{children}</FrameContext.Provider>;
};
