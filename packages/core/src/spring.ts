/** Physical parameters for a damped harmonic spring oscillator. */
export type SpringConfig = {
  stiffness: number;
  damping: number;
  mass: number;
  /** Clamp spring output so it never overshoots past `to`. Defaults to `false`. */
  overshootClamping?: boolean;
};

/** Default spring parameters (`stiffness: 100`, `damping: 10`, `mass: 1`, `overshootClamping: false`). */
export const defaultSpring: SpringConfig = {
  stiffness: 100,
  damping: 10,
  mass: 1,
  overshootClamping: false,
};

/** Estimates the natural settling frame count of a normalized `[0, 1]` spring at `fps`. */
const measureSpringSettlingFrames = (
  fps: number,
  stiffness: number,
  damping: number,
  mass: number
): number => {
  const sub = 8;
  const dt = 1 / fps / sub;
  let x = 0;
  let v = 0;
  const maxFrames = fps * 20;
  for (let f = 1; f <= maxFrames; f++) {
    for (let s = 0; s < sub; s++) {
      const a = (stiffness * (1 - x) - damping * v) / mass;
      v += a * dt;
      x += v * dt;
    }
    if (Math.abs(1 - x) < 0.001 && Math.abs(v) < 0.001) {
      return f;
    }
  }
  return maxFrames;
};

/**
 * Deterministic damped spring from `from` to `to`, evaluated at `frame`.
 * Supports `delay` (in frames), `durationInFrames` time-scaling, and `overshootClamping`.
 */
export const spring = ({
  frame,
  fps,
  from = 0,
  to = 1,
  delay = 0,
  durationInFrames,
  config = {},
}: {
  frame: number;
  fps: number;
  from?: number;
  to?: number;
  /** Frame delay before the spring starts moving. Defaults to `0`. */
  delay?: number;
  /** Optional target duration in frames; scales simulation time to settle at `durationInFrames`. */
  durationInFrames?: number;
  config?: Partial<SpringConfig>;
}): number => {
  if (fps <= 0) throw new Error("fps must be positive.");
  const { stiffness, damping, mass, overshootClamping } = { ...defaultSpring, ...config };
  if (mass <= 0) throw new Error("spring mass must be positive.");
  if (durationInFrames !== undefined && durationInFrames <= 0) {
    throw new Error("spring durationInFrames must be positive when specified.");
  }

  const delayedFrame = frame - delay;
  if (delayedFrame <= 0) return from;

  let effectiveFrame = delayedFrame;
  if (durationInFrames !== undefined) {
    if (delayedFrame >= durationInFrames) return to;
    const naturalFrames = measureSpringSettlingFrames(fps, stiffness, damping, mass);
    effectiveFrame = (delayedFrame / durationInFrames) * naturalFrames;
  }

  const sub = 8;
  const dt = 1 / fps / sub;
  let x = 0;
  let v = 0;
  const steps = Math.round(effectiveFrame * sub);
  for (let i = 0; i < steps; i++) {
    const prevX = x;
    const a = (stiffness * (1 - x) - damping * v) / mass;
    v += a * dt;
    x += v * dt;
    if (overshootClamping && ((prevX < 1 && x >= 1) || x > 1)) {
      x = 1;
      v = 0;
      break;
    }
  }
  if (overshootClamping) {
    x = Math.max(0, Math.min(1, x));
  }
  return from + (to - from) * x;
};
