import React from "react";
import {
  FrameProvider,
  InspectorContext,
  PlaybackContext,
  type InspectorAPI,
  type PlaybackState,
  type VideoConfig,
} from "@milyonus/core";

export type StageProps = {
  /** Composition dimensions, frame rate, and duration. */
  config: VideoConfig;
  /** Current integer frame index (`0 <= frame < durationInFrames`). */
  frame: number;
  /** Root composition component. */
  component: React.ComponentType<any>;
  /** Props forwarded to `component`. */
  props?: Record<string, unknown>;
  /** Preview CSS scale factor (`1` in render mode). Defaults to `1`. */
  scale?: number;
  /** Optional playback state forwarded to `<Audio>` and `usePlayback()`. */
  playback?: PlaybackState;
  /** Optional timeline/audio inspector callbacks. */
  inspector?: InspectorAPI | null;
};

const defaultPlayback: PlaybackState = {
  playing: false,
  muted: false,
  renderMode: false,
};

/** Fixed-resolution composition stage scaled cleanly via CSS `transform: scale(...)`. */
export const Stage: React.FC<StageProps> = ({
  config,
  frame,
  component: C,
  props,
  scale = 1,
  playback = defaultPlayback,
  inspector = null,
}) => (
  <div
    style={{
      width: config.width * scale,
      height: config.height * scale,
      overflow: "hidden",
      position: "relative",
      boxSizing: "border-box",
    }}
  >
    <div
      style={{
        width: config.width,
        height: config.height,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        position: "relative",
        display: "flex",
        background: "#fff",
        boxSizing: "border-box",
      }}
    >
      <PlaybackContext.Provider value={playback}>
        <InspectorContext.Provider value={inspector}>
          <FrameProvider value={{ ...config, frame, absoluteFrame: frame }}>
            <C {...(props ?? {})} />
          </FrameProvider>
        </InspectorContext.Provider>
      </PlaybackContext.Provider>
    </div>
  </div>
);
