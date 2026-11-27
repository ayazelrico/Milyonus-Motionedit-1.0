import React from "react";
import { useCurrentFrame } from "./context.js";
import { Easings, interpolate, type Easing } from "./interpolate.js";

/**
 * Computes deterministic `strokeDasharray` and `strokeDashoffset` styles to animate drawing an SVG path
 * of total length `pathLength` from `progress = 0` (hidden) to `progress = 1` (fully drawn).
 */
export const evolvePath = (
  progress: number,
  pathLength = 1
): { strokeDasharray: string; strokeDashoffset: number } => {
  if (pathLength <= 0) throw new Error("pathLength must be positive.");
  const clamped = Math.max(0, Math.min(1, progress));
  return {
    strokeDasharray: `${pathLength} ${pathLength}`,
    strokeDashoffset: Number(((1 - clamped) * pathLength).toFixed(4)),
  };
};

export type StrokePathProps = Omit<React.SVGProps<SVGPathElement>, "pathLength"> & {
  /** SVG path `d` command string (required). */
  d: string;
  /** Duration in frames over which the stroke draws from `0%` to `100%`. Defaults to `30`. */
  durationInFrames?: number;
  /** Frame delay before drawing starts. Defaults to `0`. */
  delay?: number;
  /** Easing curve for stroke progression. Defaults to `Easings.easeInOut`. */
  easing?: Easing;
};

/**
 * Frame-pure `<path>` component using normalized SVG `pathLength={1}` to animate line drawing
 * deterministically without measuring DOM geometry (`getTotalLength()`).
 */
export const StrokePath: React.FC<StrokePathProps> = ({
  d,
  durationInFrames = 30,
  delay = 0,
  easing = Easings.easeInOut,
  style,
  ...rest
}) => {
  const frame = useCurrentFrame();
  const progress =
    durationInFrames <= 0
      ? 1
      : interpolate(frame - delay, [0, durationInFrames], [0, 1], {
          easing,
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const dash = evolvePath(progress, 1);

  return (
    <path
      d={d}
      pathLength={1}
      strokeDasharray={dash.strokeDasharray}
      strokeDashoffset={dash.strokeDashoffset}
      style={style}
      {...rest}
    />
  );
};
