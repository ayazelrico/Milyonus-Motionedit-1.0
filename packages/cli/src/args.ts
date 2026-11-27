import { readFile } from "node:fs/promises";

/** Parsed representation of CLI flags and positional arguments. */
export type ParsedArgs = {
  command?: string;
  flags: Record<string, string | boolean>;
  positionals: string[];
};

/** Parses `process.argv.slice(2)` into a command, flags map, and extra positionals. */
export const parseCliArgs = (argv: readonly string[]): ParsedArgs => {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token === "-h") {
      flags.help = true;
      i++;
      continue;
    }
    if (token === "-v") {
      flags.version = true;
      i++;
      continue;
    }
    if (token.startsWith("--")) {
      const eqIdx = token.indexOf("=");
      if (eqIdx !== -1) {
        const key = token.slice(2, eqIdx);
        const val = token.slice(eqIdx + 1);
        flags[key] = val;
        i++;
        continue;
      }
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
      continue;
    }
    positionals.push(token);
    i++;
  }

  const [command, ...rest] = positionals;
  return { command, flags, positionals: rest };
};

/** Reads an optional string flag. */
export function getStringFlag(flags: Record<string, string | boolean>, name: string, fallback: string): string;
export function getStringFlag(flags: Record<string, string | boolean>, name: string, fallback?: undefined): string | undefined;
export function getStringFlag(
  flags: Record<string, string | boolean>,
  name: string,
  fallback?: string
): string | undefined {
  const raw = flags[name];
  if (raw === undefined) return fallback;
  if (typeof raw === "boolean") {
    throw new Error(`Flag --${name} requires a value.`);
  }
  return raw;
}

/** Reads and validates a positive integer flag (`>= 1`). */
export const getPositiveIntFlag = (
  flags: Record<string, string | boolean>,
  name: string,
  fallback?: number
): number | undefined => {
  const raw = flags[name];
  if (raw === undefined) return fallback;
  if (typeof raw === "boolean" || raw.trim() === "") {
    throw new Error(`Flag --${name} requires a positive integer.`);
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid --${name}="${raw}": expected a positive integer.`);
  }
  return n;
};

/** Reads and validates a non-negative integer flag (`>= 0`). */
export const getNonNegativeIntFlag = (
  flags: Record<string, string | boolean>,
  name: string,
  fallback?: number
): number | undefined => {
  const raw = flags[name];
  if (raw === undefined) return fallback;
  if (typeof raw === "boolean" || raw.trim() === "") {
    throw new Error(`Flag --${name} requires a non-negative integer.`);
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`Invalid --${name}="${raw}": expected a non-negative integer.`);
  }
  return n;
};

/** Reads and validates a positive finite floating-point or integer flag (`> 0`). */
export const getPositiveNumberFlag = (
  flags: Record<string, string | boolean>,
  name: string,
  fallback?: number
): number | undefined => {
  const raw = flags[name];
  if (raw === undefined) return fallback;
  if (typeof raw === "boolean" || raw.trim() === "") {
    throw new Error(`Flag --${name} requires a positive number.`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid --${name}="${raw}": expected a positive number.`);
  }
  return n;
};

/**
 * Loads `inputProps` from either an inline JSON object string (`'{"title":"Hi"}'`)
 * or a path to a `.json` file (`data.json`).
 */
export const loadInputProps = async (
  raw?: string | Record<string, unknown>
): Promise<Record<string, unknown> | undefined> => {
  if (raw === undefined) return undefined;
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    return raw;
  }
  if (typeof raw !== "string") {
    throw new Error("inputProps must be a JSON object or path to a JSON file.");
  }
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const looksInline =
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    trimmed === "null" ||
    trimmed === "true" ||
    trimmed === "false" ||
    /^-?\d/.test(trimmed) ||
    trimmed.startsWith('"');
  const jsonText = looksInline ? trimmed : await readFile(trimmed, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`Failed to parse --props JSON: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--props must evaluate to a JSON object (not an array or primitive).");
  }
  return parsed as Record<string, unknown>;
};
