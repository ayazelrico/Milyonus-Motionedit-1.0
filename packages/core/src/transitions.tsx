import React from "react";
import { useFrameState } from "./context.js";
import { Easings, interpolate, type Easing } from "./interpolate.js";

/** Cardinal direction for slide and wipe transitions. */
export type TransitionDirection = "left" | "right" | "up" | "down";

/** Preset transition names supported by `<Transition>`. */
export type TransitionKind =
  | "none"
  | "fade"
  | "scale"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "wipe-left"
  | "wipe-right"
  | "wipe-up"
  | "wipe-down";

/** Computes an opacity fade-in style over `[0, durationInFrames]`. */
export const fadeIn = (
  frame: number,
  durationInFrames = 15,
  easing: Easing = Easings.easeOut
): React.CSSProperties => {
  if (durationInFrames <= 0) return { opacity: 1 };
  const opacity = interpolate(frame, [0, durationInFrames], [0, 1], {
    easing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { opacity };
};

/** Computes an opacity fade-out style over the final `durationInFrames` of `totalDurationInFrames`. */
export const fadeOut = (
  frame: number,
  durationInFrames: number,
  totalDurationInFrames: number,
  easing: Easing = Easings.easeIn
): React.CSSProperties => {
  if (durationInFrames <= 0 || !Number.isFinite(totalDurationInFrames)) return { opacity: 1 };
  const start = Math.max(0, totalDurationInFrames - durationInFrames);
  if (totalDurationInFrames <= start) return { opacity: 0 };
  const opacity = interpolate(frame, [start, totalDurationInFrames], [1, 0], {
    easing,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { opacity };
};

/** Computes a combined fade-in and fade-out opacity style across `totalDurationInFrames`. */
export const fadeInOut = (
  frame: number,
  totalDurationInFrames: number,
  fadeDuration = 15,
  easing: Easing = Easings.easeInOut
): React.CSSProperties => {
  const inOpacity = Number(fadeIn(frame, fadeDuration, easing).opacity ?? 1);
  const outOpacity = Number(fadeOut(frame, fadeDuration, totalDurationInFrames, easing).opacity ?? 1);
  return { opacity: Math.min(inOpacity, outOpacity) };
};

/** Computes a directional translate slide-in style (`direction` indicates travel direction). */
export const slideIn = (
  frame: number,
  {
    durationInFrames = 20,
    direction = "up",
    distance = 100,
    easing = Easings.easeOut,
  }: {
    durationInFrames?: number;
    direction?: TransitionDirection;
    distance?: number;
    easing?: Easing;
  } = {}
): React.CSSProperties => {
  const progress =
    durationInFrames <= 0
      ? 1
      : interpolate(frame, [0, durationInFrames], [0, 1], {
          easing,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const offset = (1 - progress) * distance;
  const tx = direction === "left" ? offset : direction === "right" ? -offset : 0;
  const ty = direction === "up" ? offset : direction === "down" ? -offset : 0;
  return { transform: `translate3d(${tx}%, ${ty}%, 0)` };
};

/** Computes a directional translate slide-out style over the final `durationInFrames`. */
export const slideOut = (
  frame: number,
  {
    durationInFrames = 20,
    totalDurationInFrames,
    direction = "up",
    distance = 100,
    easing = Easings.easeIn,
  }: {
    durationInFrames?: number;
    totalDurationInFrames: number;
    direction?: TransitionDirection;
    distance?: number;
    easing?: Easing;
  }
): React.CSSProperties => {
  if (durationInFrames <= 0 || !Number.isFinite(totalDurationInFrames)) {
    return { transform: "translate3d(0%, 0%, 0)" };
  }
  const start = Math.max(0, totalDurationInFrames - durationInFrames);
  const progress =
    totalDurationInFrames <= start
      ? 1
      : interpolate(frame, [start, totalDurationInFrames], [0, 1], {
          easing,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const offset = progress * distance;
  const tx = direction === "left" ? -offset : direction === "right" ? offset : 0;
  const ty = direction === "up" ? -offset : direction === "down" ? offset : 0;
  return { transform: `translate3d(${tx}%, ${ty}%, 0)` };
};

/** Computes a zoom/scale-in style from `from` to `1`. */
export const scaleIn = (
  frame: number,
  {
    durationInFrames = 20,
    from = 0.85,
    easing = Easings.easeOut,
  }: {
    durationInFrames?: number;
    from?: number;
    easing?: Easing;
  } = {}
): React.CSSProperties => {
  const s =
    durationInFrames <= 0
      ? 1
      : interpolate(frame, [0, durationInFrames], [from, 1], {
          easing,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  return { transform: `scale(${s})` };
};

/** Computes a CSS `clipPath: inset(...)` wipe-in reveal in `direction`. */
export const wipeIn = (
  frame: number,
  {
    durationInFrames = 20,
    direction = "right",
    easing = Easings.easeInOut,
  }: {
    durationInFrames?: number;
    direction?: TransitionDirection;
    easing?: Easing;
  } = {}
): React.CSSProperties => {
  const progress =
    durationInFrames <= 0
      ? 1
      : interpolate(frame, [0, durationInFrames], [0, 1], {
          easing,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const hidden = (1 - progress) * 100;
  if (direction === "right") return { clipPath: `inset(0% ${hidden}% 0% 0%)` };
  if (direction === "left") return { clipPath: `inset(0% 0% 0% ${hidden}%)` };
  if (direction === "down") return { clipPath: `inset(0% 0% ${hidden}% 0%)` };
  return { clipPath: `inset(${hidden}% 0% 0% 0%)` };
};

export type TransitionProps = {
  /** Enter animation preset applied at the beginning of the sequence. */
  enter?: TransitionKind;
  /** Exit animation preset applied at the end of the sequence. */
  exit?: TransitionKind;
  /** Duration of the enter transition in frames. Defaults to `15`. */
  enterDuration?: number;
  /** Duration of the exit transition in frames. Defaults to `15`. */
  exitDuration?: number;
  /** Optional custom easing function. */
  easing?: Easing;
  /** Additional inline styles merged onto the transition wrapper. */
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

const computePreset = (
  kind: TransitionKind,
  frame: number,
  duration: number,
  totalDuration: number,
  mode: "enter" | "exit",
  easing?: Easing
): React.CSSProperties => {
  if (kind === "none" || duration <= 0) return {};
  if (kind === "fade") {
    return mode === "enter"
      ? fadeIn(frame, duration, easing)
      : fadeOut(frame, duration, totalDuration, easing);
  }
  if (kind === "scale") {
    if (mode === "enter") return { ...fadeIn(frame, duration, easing), ...scaleIn(frame, { durationInFrames: duration, easing }) };
    const start = Math.max(0, totalDuration - duration);
    const s = interpolate(frame, [start, Math.max(start + 1, totalDuration)], [1, 0.85], {
      easing: easing ?? Easings.easeIn,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    return { ...fadeOut(frame, duration, totalDuration, easing), transform: `scale(${s})` };
  }
  if (kind.startsWith("slide-")) {
    const direction = kind.slice("slide-".length) as TransitionDirection;
    return mode === "enter"
      ? slideIn(frame, { durationInFrames: duration, direction, easing })
      : slideOut(frame, { durationInFrames: duration, totalDurationInFrames: totalDuration, direction, easing });
  }
  if (kind.startsWith("wipe-")) {
    const direction = kind.slice("wipe-".length) as TransitionDirection;
    if (mode === "enter") return wipeIn(frame, { durationInFrames: duration, direction, easing });
    const start = Math.max(0, totalDuration - duration);
    const reversedFrame = Math.max(0, totalDuration - frame);
    return start < totalDuration ? wipeIn(reversedFrame, { durationInFrames: duration, direction, easing }) : {};
  }
  return {};
};

/** Declarative transition container driven purely by `useCurrentFrame()` and `interpolate`. */
export const Transition: React.FC<TransitionProps> = ({
  enter = "fade",
  exit = "none",
  enterDuration = 15,
  exitDuration = 15,
  easing,
  style,
  children,
}) => {
  const state = useFrameState();
  const total = state.sequenceDurationInFrames ?? state.durationInFrames;
  const enterStyle = computePreset(enter, state.frame, enterDuration, total, "enter", easing);
  const exitStyle = computePreset(exit, state.frame, exitDuration, total, "exit", easing);

  const opacity =
    enterStyle.opacity !== undefined && exitStyle.opacity !== undefined
      ? Math.min(Number(enterStyle.opacity), Number(exitStyle.opacity))
      : (exitStyle.opacity ?? enterStyle.opacity);

  const transforms = [enterStyle.transform, exitStyle.transform].filter(Boolean).join(" ") || undefined;
  const clipPath = exitStyle.clipPath ?? enterStyle.clipPath;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        ...style,
        ...(opacity !== undefined ? { opacity } : {}),
        ...(transforms ? { transform: transforms } : {}),
        ...(clipPath ? { clipPath } : {}),
      }}
    >
      {children}
    </div>
  );
};
