export type Easing = (t: number) => number;

export const Easings = {
  linear: ((t) => t) as Easing,
  easeIn: ((t) => t * t * t) as Easing,
  easeOut: ((t) => 1 - Math.pow(1 - t, 3)) as Easing,
  easeInOut: ((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)) as Easing,
};

export type InterpolateOptions = {
  easing?: Easing;
  extrapolateLeft?: "clamp" | "extend";
  extrapolateRight?: "clamp" | "extend";
};

/**
 * Maps `input` from `inputRange` to `outputRange` (piecewise linear). Ranges must have equal
 * length and inputRange must be strictly increasing.
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
  const a = inputRange[i], b = inputRange[i + 1];
  const c = outputRange[i], d = outputRange[i + 1];
  let t = (input - a) / (b - a);
  if (t >= 0 && t <= 1) t = easing(t);
  return c + t * (d - c);
};
