import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  continueRender,
  delayRender,
  resetDelayRenders,
  resolveCompositionMetadata,
  validateProps,
  waitForDelayRenders,
  type CompositionDefinition,
  type CompositionSummary,
  type InspectorAPI,
  type ResolvedAudioTrack,
  type TimelineSequenceEntry,
  type VideoConfig,
} from "@milyonus/core";
import { Stage } from "./Stage.js";

declare global {
  interface Window {
    milyonusSetFrame?: (frame: number) => Promise<void>;
    milyonusSetInputProps?: (props: Record<string, unknown>) => Promise<void>;
    milyonusSetTransparent?: (transparent: boolean) => Promise<void>;
    milyonusGetConfig?: () => CompositionSummary;
    milyonusListCompositions?: () => CompositionSummary[];
    milyonusSelectComposition?: (id: string) => Promise<CompositionSummary>;
    milyonusGetAudioTracks?: () => ResolvedAudioTrack[];
    milyonusGetSequences?: () => TimelineSequenceEntry[];
    milyonusReady?: boolean;
  }
}

export type SingleFrameRendererProps = VideoConfig & {
  id?: string;
  component: React.ComponentType<any>;
  inputProps?: Record<string, unknown>;
  transparent?: boolean;
  compositions?: undefined;
  initialCompositionId?: undefined;
};

export type MultiFrameRendererProps = {
  compositions: readonly CompositionDefinition<any>[];
  initialCompositionId?: string;
  inputProps?: Record<string, unknown>;
  transparent?: boolean;
};

export type FrameRendererProps = SingleFrameRendererProps | MultiFrameRendererProps;

const nextPaintTick = (): Promise<void> =>
  new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    requestAnimationFrame(done);
    setTimeout(done, 20);
  });

const waitCommitAndAssets = async (): Promise<void> => {
  await nextPaintTick();
  if (typeof document !== "undefined" && "fonts" in document && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Ignore font readiness errors.
    }
  }
  await waitForDelayRenders();
  await nextPaintTick();
};

const readInitialQueryOverrides = (): {
  compositionId?: string;
  frame?: number;
  transparent?: boolean;
  props?: Record<string, unknown>;
} => {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const compositionId = params.get("composition") ?? undefined;
  const rawFrame = params.get("frame");
  const frame =
    rawFrame !== null && !Number.isNaN(Number(rawFrame))
      ? Math.max(0, Math.floor(Number(rawFrame)))
      : undefined;
  const transparent = params.has("transparent") ? params.get("transparent") !== "0" : undefined;
  let props: Record<string, unknown> | undefined;
  const rawProps = params.get("props");
  if (rawProps) {
    try {
      const parsed = JSON.parse(rawProps);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        props = parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore malformed query JSON; CLI uses milyonusSetInputProps directly.
    }
  }
  return { compositionId, frame, transparent, props };
};

const toStaticSummary = (comp: CompositionDefinition<any>): CompositionSummary => ({
  id: comp.id,
  width: comp.width,
  height: comp.height,
  fps: comp.fps,
  durationInFrames: comp.durationInFrames,
  defaultProps: comp.defaultProps,
  description: comp.description,
});

/**
 * Render-mode driver page. Exposes `window.milyonusSetFrame(n)`, `window.milyonusSetInputProps`,
 * schema validation, `calculateMetadata` resolution, `delayRender` asset synchronization,
 * alpha transparency control, composition discovery, and audio/sequence inspection.
 */
export const FrameRenderer: React.FC<FrameRendererProps> = (props) => {
  const queryInit = useMemo(readInitialQueryOverrides, []);

  const compositions: CompositionDefinition<any>[] = useMemo(() => {
    if ("compositions" in props && props.compositions) {
      if (props.compositions.length === 0) {
        throw new Error("<FrameRenderer> requires at least one composition in `compositions`.");
      }
      return [...props.compositions];
    }
    const single = props as SingleFrameRendererProps;
    return [
      {
        id: single.id ?? "main",
        component: single.component,
        width: single.width,
        height: single.height,
        fps: single.fps,
        durationInFrames: single.durationInFrames,
        defaultProps: single.inputProps,
      },
    ];
  }, [props]);

  const [selectedId, setSelectedId] = useState<string>(() => {
    if (queryInit.compositionId && compositions.some((c) => c.id === queryInit.compositionId)) {
      return queryInit.compositionId;
    }
    if ("initialCompositionId" in props && props.initialCompositionId) {
      return props.initialCompositionId;
    }
    return compositions[0].id;
  });

  const [frame, setFrame] = useState<number>(() => queryInit.frame ?? 0);
  const [transparent, setTransparent] = useState<boolean>(
    () => queryInit.transparent ?? props.transparent ?? false
  );
  const [overrideProps, setOverrideProps] = useState<Record<string, unknown> | undefined>(
    () => queryInit.props
  );

  const activeComp = useMemo(
    () => compositions.find((c) => c.id === selectedId) ?? compositions[0],
    [compositions, selectedId]
  );

  const [resolvedConfig, setResolvedConfig] = useState<VideoConfig>(() => ({
    width: activeComp.width,
    height: activeComp.height,
    fps: activeComp.fps,
    durationInFrames: activeComp.durationInFrames,
  }));
  const [resolvedProps, setResolvedProps] = useState<Record<string, unknown>>(() => ({
    ...(activeComp.defaultProps ?? {}),
    ...(props.inputProps ?? {}),
    ...(queryInit.props ?? {}),
  }));

  const audioMapRef = useRef<Map<string, ResolvedAudioTrack>>(new Map());
  const seqMapRef = useRef<Map<string, TimelineSequenceEntry>>(new Map());

  const activeCompRef = useRef(activeComp);
  activeCompRef.current = activeComp;
  const resolvedConfigRef = useRef(resolvedConfig);
  resolvedConfigRef.current = resolvedConfig;
  const compositionsRef = useRef(compositions);
  compositionsRef.current = compositions;
  const baseInputPropsRef = useRef(props.inputProps);
  baseInputPropsRef.current = props.inputProps;
  const overridePropsRef = useRef(overrideProps);
  overridePropsRef.current = overrideProps;

  const inspector: InspectorAPI = useMemo(
    () => ({
      reportSequence: (entry) => {
        seqMapRef.current.set(entry.id, entry);
      },
      reportAudio: (track) => {
        audioMapRef.current.set(track.id, track);
      },
    }),
    []
  );

  const applyCompositionAndProps = async (
    comp: CompositionDefinition<any>,
    nextOverrides: Record<string, unknown> | undefined
  ): Promise<CompositionSummary> => {
    const combinedOverrides = {
      ...(baseInputPropsRef.current ?? {}),
      ...(nextOverrides ?? {}),
    };
    const candidateProps = {
      ...(comp.defaultProps ?? {}),
      ...combinedOverrides,
    };
    if (comp.schema) {
      const check = validateProps(comp.schema, candidateProps);
      if (!check.valid) {
        throw new Error(`Invalid props for composition "${comp.id}": ${check.errors.join(" ")}`);
      }
    }

    const handle = delayRender(`calculateMetadata(${comp.id})`);
    try {
      const { config: nextCfg, props: nextProps } = await resolveCompositionMetadata(
        comp,
        combinedOverrides
      );
      resolvedConfigRef.current = nextCfg;
      setResolvedConfig(nextCfg);
      setResolvedProps(nextProps);
      return {
        id: comp.id,
        ...nextCfg,
        defaultProps: comp.defaultProps,
        description: comp.description,
      };
    } finally {
      continueRender(handle);
    }
  };

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.margin = "0";
      document.documentElement.style.padding = "0";
      document.body.style.margin = "0";
      document.body.style.padding = "0";
      document.body.style.overflow = "hidden";
      document.body.style.background = "transparent";
    }

    let cancelled = false;

    const bootstrap = async () => {
      await applyCompositionAndProps(activeCompRef.current, overridePropsRef.current);
      if (cancelled) return;

      window.milyonusSetFrame = (n: number) => {
        setFrame(n);
        return waitCommitAndAssets();
      };

      window.milyonusSetInputProps = async (nextProps: Record<string, unknown>) => {
        audioMapRef.current.clear();
        seqMapRef.current.clear();
        overridePropsRef.current = nextProps;
        setOverrideProps(nextProps);
        await applyCompositionAndProps(activeCompRef.current, nextProps);
        await waitCommitAndAssets();
      };

      window.milyonusSetTransparent = (value: boolean) => {
        setTransparent(value);
        return waitCommitAndAssets();
      };

      window.milyonusGetConfig = () => ({
        id: activeCompRef.current.id,
        ...resolvedConfigRef.current,
        defaultProps: activeCompRef.current.defaultProps,
        description: activeCompRef.current.description,
      });

      window.milyonusListCompositions = () => compositionsRef.current.map(toStaticSummary);

      window.milyonusSelectComposition = async (id: string) => {
        const target = compositionsRef.current.find((c) => c.id === id);
        if (!target) {
          const available = compositionsRef.current.map((c) => c.id).join(", ");
          throw new Error(`Composition "${id}" not found. Available: ${available}`);
        }
        resetDelayRenders();
        audioMapRef.current.clear();
        seqMapRef.current.clear();
        activeCompRef.current = target;
        setSelectedId(target.id);
        setFrame(0);
        const summary = await applyCompositionAndProps(target, overridePropsRef.current);
        await waitCommitAndAssets();
        return summary;
      };

      window.milyonusGetAudioTracks = () => Array.from(audioMapRef.current.values());
      window.milyonusGetSequences = () => Array.from(seqMapRef.current.values());
      await waitCommitAndAssets();
      if (!cancelled) {
        window.milyonusReady = true;
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      window.milyonusReady = false;
      resetDelayRenders();
    };
  }, []);

  const renderPlayback = useMemo(() => ({ playing: false, muted: true, renderMode: true }), []);

  return (
    <div
      id="milyonus-stage"
      style={{ width: resolvedConfig.width, height: resolvedConfig.height, margin: 0, padding: 0 }}
    >
      <Stage
        config={resolvedConfig}
        frame={frame}
        component={activeComp.component}
        props={resolvedProps}
        scale={1}
        playback={renderPlayback}
        inspector={inspector}
        transparent={transparent}
      />
    </div>
  );
};
