import { interpolate, type InterpolateOptions } from "./interpolate.js";

/** Normalized RGBA tuple with `r, g, b` in `[0, 255]` and `a` in `[0, 1]`. */
export type RgbaColor = readonly [r: number, g: number, b: number, a: number];

const NAMED_COLORS: Record<string, RgbaColor> = {
  transparent: [0, 0, 0, 0],
  black: [0, 0, 0, 1],
  white: [255, 255, 255, 1],
};

const hslToRgb = (hDeg: number, sPct: number, lPct: number): [number, number, number] => {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  const s = Math.max(0, Math.min(1, sPct / 100));
  const l = Math.max(0, Math.min(1, lPct / 100));
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
};

/**
 * Parses CSS hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), `rgb()`/`rgba()`, or `hsl()`/`hsla()`
 * into an `[r, g, b, a]` tuple.
 */
export const parseColor = (color: string): RgbaColor => {
  const trimmed = color.trim().toLowerCase();
  if (trimmed in NAMED_COLORS) return NAMED_COLORS[trimmed];

  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      if ([r, g, b, a].some(Number.isNaN)) throw new Error(`Invalid hex color: "${color}"`);
      return [r, g, b, a];
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if ([r, g, b, a].some(Number.isNaN)) throw new Error(`Invalid hex color: "${color}"`);
      return [r, g, b, a];
    }
    throw new Error(`Invalid hex color: "${color}"`);
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)(?:\s*,\s*([+-]?\d+(?:\.\d+)?))?\s*\)$/
  );
  if (rgbMatch) {
    return [
      Number(rgbMatch[1]),
      Number(rgbMatch[2]),
      Number(rgbMatch[3]),
      rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : 1,
    ];
  }

  const hslMatch = trimmed.match(
    /^hsla?\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)%\s*,\s*([+-]?\d+(?:\.\d+)?)%(?:\s*,\s*([+-]?\d+(?:\.\d+)?))?\s*\)$/
  );
  if (hslMatch) {
    const [r, g, b] = hslToRgb(Number(hslMatch[1]), Number(hslMatch[2]), Number(hslMatch[3]));
    return [r, g, b, hslMatch[4] !== undefined ? Number(hslMatch[4]) : 1];
  }

  throw new Error(`Unsupported color format: "${color}"`);
};

const clampByte = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
const clampUnit = (v: number): number => Math.max(0, Math.min(1, Number(v.toFixed(4))));

/**
 * Smoothly interpolates between CSS color stops (`#hex`, `rgb/rgba`, `hsl/hsla`) across `inputRange`.
 * Returns a deterministic `rgba(r, g, b, a)` CSS string.
 */
export const interpolateColors = (
  input: number,
  inputRange: readonly number[],
  outputColors: readonly string[],
  options: Omit<InterpolateOptions, "extrapolateLeft" | "extrapolateRight"> = {}
): string => {
  if (inputRange.length !== outputColors.length) {
    throw new Error("inputRange and outputColors must have equal length.");
  }
  const parsed = outputColors.map(parseColor);
  const opts: InterpolateOptions = {
    ...options,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  };

  const r = clampByte(interpolate(input, inputRange, parsed.map((c) => c[0]), opts));
  const g = clampByte(interpolate(input, inputRange, parsed.map((c) => c[1]), opts));
  const b = clampByte(interpolate(input, inputRange, parsed.map((c) => c[2]), opts));
  const a = clampUnit(interpolate(input, inputRange, parsed.map((c) => c[3]), opts));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
