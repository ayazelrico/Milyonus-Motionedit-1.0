import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  resetDelayRenders,
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

const toSummary = (comp: CompositionDefinition<any>): CompositionSummary => ({
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
 * `delayRender` asset synchronization, alpha transparency control, composition discovery,
 * and audio/sequence inspection while mounting `#milyonus-stage` at 1:1 scale.
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

  const audioMapRef = useRef<Map<string, ResolvedAudioTrack>>(new Map());
  const seqMapRef = useRef<Map<string, TimelineSequenceEntry>>(new Map());

  const activeComp = useMemo(
    () => compositions.find((c) => c.id === selectedId) ?? compositions[0],
    [compositions, selectedId]
  );

  const activeCompRef = useRef(activeComp);
  activeCompRef.current = activeComp;
  const compositionsRef = useRef(compositions);
  compositionsRef.current = compositions;

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

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.margin = "0";
      document.documentElement.style.padding = "0";
      document.body.style.margin = "0";
      document.body.style.padding = "0";
      document.body.style.overflow = "hidden";
      document.body.style.background = "transparent";
    }

    window.milyonusSetFrame = (n: number) => {
      setFrame(n);
      return waitCommitAndAssets();
    };

    window.milyonusSetInputProps = (nextProps: Record<string, unknown>) => {
      audioMapRef.current.clear();
      seqMapRef.current.clear();
      setOverrideProps(nextProps);
      return waitCommitAndAssets();
    };

    window.milyonusSetTransparent = (value: boolean) => {
      setTransparent(value);
      return waitCommitAndAssets();
    };

    window.milyonusGetConfig = () => toSummary(activeCompRef.current);

    window.milyonusListCompositions = () => compositionsRef.current.map(toSummary);

    window.milyonusSelectComposition = async (id: string) => {
      const target = compositionsRef.current.find((c) => c.id === id);
      if (!target) {
        const available = compositionsRef.current.map((c) => c.id).join(", ");
        throw new Error(`Composition "${id}" not found. Available: ${available}`);
      }
      resetDelayRenders();
      audioMapRef.current.clear();
      seqMapRef.current.clear();
      setSelectedId(target.id);
      setFrame(0);
      await waitCommitAndAssets();
      return toSummary(target);
    };

    window.milyonusGetAudioTracks = () => Array.from(audioMapRef.current.values());
    window.milyonusGetSequences = () => Array.from(seqMapRef.current.values());
    window.milyonusReady = true;

    return () => {
      window.milyonusReady = false;
      resetDelayRenders();
    };
  }, []);

  const mergedProps = useMemo(
    () => ({
      ...(activeComp.defaultProps ?? {}),
      ...(props.inputProps ?? {}),
      ...(overrideProps ?? {}),
    }),
    [activeComp.defaultProps, props.inputProps, overrideProps]
  );

  const config: VideoConfig = useMemo(
    () => ({
      width: activeComp.width,
      height: activeComp.height,
      fps: activeComp.fps,
      durationInFrames: activeComp.durationInFrames,
    }),
    [activeComp.width, activeComp.height, activeComp.fps, activeComp.durationInFrames]
  );

  const renderPlayback = useMemo(() => ({ playing: false, muted: true, renderMode: true }), []);

  return (
    <div id="milyonus-stage" style={{ width: config.width, height: config.height, margin: 0, padding: 0 }}>
      <Stage
        config={config}
        frame={frame}
        component={activeComp.component}
        props={mergedProps}
        scale={1}
        playback={renderPlayback}
        inspector={inspector}
        transparent={transparent}
      />
    </div>
  );
};
