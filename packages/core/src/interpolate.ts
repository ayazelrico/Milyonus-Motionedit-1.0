/** Pure unit-interval curve mapping `t` in `[0, 1]` to an eased value. */
export type Easing = (t: number) => number;

/**
 * Creates a CSS-compatible `cubic-bezier(x1, y1, x2, y2)` easing function
 * using Newton-Raphson iteration with binary-subdivision fallback.
 */
export const bezier = (x1: number, y1: number, x2: number, y2: number): Easing => {
  if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
    throw new Error("bezier control point X coordinates must lie in [0, 1].");
  }
  if (x1 === y1 && x2 === y2) return (t) => t;

  const sampleCurve = (a1: number, a2: number, u: number): number =>
    (((1 - 3 * a2 + 3 * a1) * u + (3 * a2 - 6 * a1)) * u + 3 * a1) * u;

  const sampleSlope = (a1: number, a2: number, u: number): number =>
    3 * (1 - 3 * a2 + 3 * a1) * u * u + 2 * (3 * a2 - 6 * a1) * u + 3 * a1;

  const solveU = (x: number): number => {
    let u = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleCurve(x1, x2, u) - x;
      if (Math.abs(err) < 1e-6) return u;
      const slope = sampleSlope(x1, x2, u);
      if (Math.abs(slope) < 1e-6) break;
      u -= err / slope;
    }
    let lo = 0;
    let hi = 1;
    u = x;
    for (let i = 0; i < 16; i++) {
      const est = sampleCurve(x1, x2, u);
      if (Math.abs(est - x) < 1e-6) return u;
      if (x > est) lo = u;
      else hi = u;
      u = (lo + hi) * 0.5;
    }
    return u;
  };

  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleCurve(y1, y2, solveU(t));
  };
};

/** Built-in linear, quadratic, cubic, exponential, overshoot, and cubic-bezier easing curves. */
export const Easings = {
  linear: ((t) => t) as Easing,
  quadIn: ((t) => t * t) as Easing,
  quadOut: ((t) => 1 - (1 - t) * (1 - t)) as Easing,
  quadInOut: ((t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)) as Easing,
  easeIn: ((t) => t * t * t) as Easing,
  easeOut: ((t) => 1 - Math.pow(1 - t, 3)) as Easing,
  easeInOut: ((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)) as Easing,
  expoOut: ((t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t))) as Easing,
  backOut: ((t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }) as Easing,
  bezier,
};

/** Options controlling easing and out-of-range extrapolation for `interpolate`. */
export type InterpolateOptions = {
  easing?: Easing;
  extrapolateLeft?: "clamp" | "extend";
  extrapolateRight?: "clamp" | "extend";
};

/**
 * Maps `input` from `inputRange` to `outputRange` (piecewise linear). Ranges must have equal
 * length and `inputRange` must be strictly increasing.
 */
export const interpolate = (
  input: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
  { easing = Easings.linear, extrapolateLeft = "extend", extrapolateRight = "extend" }: InterpolateOptions = {}
): number => {
  if (inputRange.length !== outputRange.length) throw new Error("Ranges must have equal length.");
  if (inputRange.length < 2) throw new Error("Ranges need at least 2 values.");
  for (let i = 1; i < inputRange.length; i++) {
    if (inputRange[i] <= inputRange[i - 1]) throw new Error("inputRange must be strictly increasing.");
  }
  const last = inputRange.length - 1;
  if (input < inputRange[0] && extrapolateLeft === "clamp") return outputRange[0];
  if (input > inputRange[last] && extrapolateRight === "clamp") return outputRange[last];

  let i = 0;
  while (i < last - 1 && input > inputRange[i + 1]) i++;
  const a = inputRange[i];
  const b = inputRange[i + 1];
  const c = outputRange[i];
  const d = outputRange[i + 1];
  let t = (input - a) / (b - a);
  if (t >= 0 && t <= 1) t = easing(t);
  return c + t * (d - c);
};
