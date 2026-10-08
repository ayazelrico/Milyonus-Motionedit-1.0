export type SpringConfig = { stiffness: number; damping: number; mass: number };

export const defaultSpring: SpringConfig = { stiffness: 100, damping: 10, mass: 1 };

/**
 * Deterministic damped spring from `from` to `to`, evaluated at `frame`.
 * Uses fixed sub-steps so the same frame always gives the same value.
 */
export const spring = ({
  frame,
  fps,
  from = 0,
  to = 1,
  config = {},
}: {
  frame: number;
  fps: number;
  from?: number;
  to?: number;
  config?: Partial<SpringConfig>;
}): number => {
  if (frame <= 0) return from;
  const { stiffness, damping, mass } = { ...defaultSpring, ...config };
  const sub = 8;
  const dt = 1 / fps / sub;
  let x = 0;
  let v = 0;
  const steps = Math.round(frame * sub);
  for (let i = 0; i < steps; i++) {
    const a = (stiffness * (1 - x) - damping * v) / mass;
    v += a * dt;
    x += v * dt;
  }
  return from + (to - from) * x;
};
