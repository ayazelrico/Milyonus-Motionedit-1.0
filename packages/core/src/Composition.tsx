import type React from "react";
import type { VideoConfig } from "./context.js";

/** Complete descriptor for a named composition in `<Studio>` and `<FrameRenderer>`. */
export type CompositionDefinition<P extends Record<string, any> = Record<string, any>> = VideoConfig & {
  /** Unique composition identifier (used by `--composition <id>` and `<Studio>`). */
  id: string;
  /** Root React component of the composition. */
  component: React.ComponentType<P>;
  /** Default props passed when no override is supplied. */
  defaultProps?: P;
  /** Optional human-readable description shown in `<Studio>`. */
  description?: string;
};

/** Serializable summary exposed over `window.milyonusListCompositions()`. */
export type CompositionSummary = VideoConfig & {
  id: string;
  defaultProps?: Record<string, unknown>;
  description?: string;
};

/** Type-safe helper for declaring a `CompositionDefinition<P>` with inferred prop types. */
export const defineComposition = <P extends Record<string, any>>(
  definition: CompositionDefinition<P>
): CompositionDefinition<P> => definition;
