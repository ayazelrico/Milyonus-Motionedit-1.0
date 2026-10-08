import React, { createContext, useContext } from "react";

export type VideoConfig = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
};

export type FrameState = VideoConfig & { frame: number };

export const FrameContext = createContext<FrameState | null>(null);

const useFrameState = (): FrameState => {
  const ctx = useContext(FrameContext);
  if (!ctx) throw new Error("Milyonus hooks must be used inside a <Player> or <FrameRenderer>.");
  return ctx;
};

/** Current frame, relative to the nearest <Sequence>. */
export const useCurrentFrame = (): number => useFrameState().frame;

/** Width, height, fps and total duration of the composition. */
export const useVideoConfig = (): VideoConfig => {
  const { width, height, fps, durationInFrames } = useFrameState();
  return { width, height, fps, durationInFrames };
};

export const FrameProvider: React.FC<{ value: FrameState; children?: React.ReactNode }> = ({ value, children }) => (
  <FrameContext.Provider value={value}>{children}</FrameContext.Provider>
);
