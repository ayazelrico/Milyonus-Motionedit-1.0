import React, { createContext, useContext } from "react";

/** Dimensions, frame rate, and total length of a composition. */
export type VideoConfig = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
};

/** Frame context state exposed to compositions and sequences. */
export type FrameState = VideoConfig & {
  /** Frame relative to the nearest `<Sequence>` (or absolute frame at root). */
  frame: number;
  /** Absolute frame from the start of the root composition. */
  absoluteFrame?: number;
  /** Absolute start frame of the enclosing `<Sequence>`. */
  sequenceFrom?: number;
  /** Duration in frames of the enclosing `<Sequence>`. */
  sequenceDurationInFrames?: number;
  /** Nesting depth of `<Sequence>` scopes (0 at root). */
  sequenceDepth?: number;
};

/** Playback driver state provided by `<Player>`, `<Studio>`, or `<FrameRenderer>`. */
export type PlaybackState = {
  playing: boolean;
  muted: boolean;
  renderMode: boolean;
};

/** Metadata describing a `<Sequence>` window on the composition timeline. */
export type TimelineSequenceEntry = {
  id: string;
  name: string;
  from: number;
  durationInFrames: number;
  depth: number;
};

/** Metadata describing a resolved `<Audio>` track for timeline inspection and FFmpeg muxing. */
export type ResolvedAudioTrack = {
  id: string;
  name?: string;
  src: string;
  /** Absolute composition frame where playback begins. */
  startFrame: number;
  /** Number of composition frames this track plays. */
  durationInFrames: number;
  /** Frames trimmed from the beginning of the audio source. */
  trimBefore: number;
  /** Optional upper frame bound in the audio source. */
  trimAfter?: number;
  /** Scalar volume multiplier (>= 0). */
  volume: number;
  /** Per-frame volume multipliers when `volume` is a function of local frame. */
  volumeSamples?: number[];
  /** Audio playback speed multiplier. */
  playbackRate: number;
  /** Whether the source audio loops while its sequence remains active. */
  loop: boolean;
  /** Whether the track is muted. */
  muted: boolean;
};

/** Optional collector callbacks supplied by `<Studio>` and `<FrameRenderer>`. */
export type InspectorAPI = {
  reportSequence?: (entry: TimelineSequenceEntry) => void;
  reportAudio?: (track: ResolvedAudioTrack) => void;
};

/** React context holding the current frame and composition configuration. */
export const FrameContext = createContext<FrameState | null>(null);

/** React context holding preview/render driver state. */
export const PlaybackContext = createContext<PlaybackState>({
  playing: false,
  muted: false,
  renderMode: false,
});

/** React context used by drivers to discover `<Sequence>` and `<Audio>` nodes. */
export const InspectorContext = createContext<InspectorAPI | null>(null);

/** Internal hook returning the active `FrameState` or throwing outside a driver. */
export const useFrameState = (): FrameState => {
  const ctx = useContext(FrameContext);
  if (!ctx) throw new Error("Milyonus hooks must be used inside a <Player>, <Studio>, or <FrameRenderer>.");
  return ctx;
};

/** Current frame, relative to the nearest `<Sequence>`. */
export const useCurrentFrame = (): number => useFrameState().frame;

/** Current absolute frame from frame 0 of the root composition. */
export const useAbsoluteFrame = (): number => {
  const state = useFrameState();
  return state.absoluteFrame ?? state.frame;
};

/** Width, height, fps, and total duration of the root composition. */
export const useVideoConfig = (): VideoConfig => {
  const { width, height, fps, durationInFrames } = useFrameState();
  return { width, height, fps, durationInFrames };
};

/** Current playback/render driver state (`playing`, `muted`, `renderMode`). */
export const usePlayback = (): PlaybackState => useContext(PlaybackContext);

/** Provides `FrameContext` to a composition tree, normalizing optional sequence fields. */
export const FrameProvider: React.FC<{ value: FrameState; children?: React.ReactNode }> = ({ value, children }) => {
  const normalized: FrameState = {
    ...value,
    absoluteFrame: value.absoluteFrame ?? value.frame,
    sequenceFrom: value.sequenceFrom ?? 0,
    sequenceDurationInFrames: value.sequenceDurationInFrames ?? value.durationInFrames,
    sequenceDepth: value.sequenceDepth ?? 0,
  };
  return <FrameContext.Provider value={normalized}>{children}</FrameContext.Provider>;
};
