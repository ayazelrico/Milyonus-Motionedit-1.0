import type React from "react";
import type { VideoConfig } from "./context.js";
import type { ObjectPropSchema } from "./schema.js";

/** Result returned by `calculateMetadata` to dynamically override composition config or props. */
export type CalculatedMetadata<P extends Record<string, any> = Record<string, any>> = Partial<VideoConfig> & {
  props?: P;
};

/** Sync or async function deriving `durationInFrames`, dimensions, `fps`, or transformed `props` from `inputProps`. */
export type CalculateMetadataFunction<P extends Record<string, any> = Record<string, any>> = (options: {
  props: P;
  defaultProps: P;
  compositionId: string;
}) => CalculatedMetadata<P> | Promise<CalculatedMetadata<P>>;

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
  /** Optional declarative `propSchema.object(...)` validating `inputProps` and powering rich `<Studio>` controls. */
  schema?: ObjectPropSchema;
  /** Optional function computing dynamic `durationInFrames`, `width`, `height`, `fps`, or transformed `props`. */
  calculateMetadata?: CalculateMetadataFunction<P>;
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

/** Resolves effective `VideoConfig` and `props` for a `CompositionDefinition`, awaiting `calculateMetadata` if present. */
export const resolveCompositionMetadata = async <P extends Record<string, any>>(
  comp: CompositionDefinition<P>,
  overrideProps?: Record<string, unknown>
): Promise<{ config: VideoConfig; props: P }> => {
  const defaultProps = (comp.defaultProps ?? {}) as P;
  const merged = { ...defaultProps, ...(overrideProps ?? {}) } as P;

  if (!comp.calculateMetadata) {
    return {
      config: {
        width: comp.width,
        height: comp.height,
        fps: comp.fps,
        durationInFrames: comp.durationInFrames,
      },
      props: merged,
    };
  }

  const computed = await comp.calculateMetadata({
    props: merged,
    defaultProps,
    compositionId: comp.id,
  });

  return {
    config: {
      width: computed.width ?? comp.width,
      height: computed.height ?? comp.height,
      fps: computed.fps ?? comp.fps,
      durationInFrames: computed.durationInFrames ?? comp.durationInFrames,
    },
    props: (computed.props ?? merged) as P,
  };
};
