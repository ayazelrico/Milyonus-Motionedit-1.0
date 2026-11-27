import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  resolveCompositionMetadata,
  validateProps,
  type CompositionDefinition,
  type InspectorAPI,
  type PropFieldSchema,
  type ResolvedAudioTrack,
  type TimelineSequenceEntry,
  type VideoConfig,
} from "@milyonus/core";
import { Stage } from "./Stage.js";

export type StudioProps = {
  /** Registered compositions shown in the Studio sidebar. */
  compositions: readonly CompositionDefinition<any>[];
  /** Composition ID selected on initial load. */
  initialCompositionId?: string;
  /** Optional title displayed in the Studio top bar. Defaults to `"Milyonus Motionedit Studio"`. */
  title?: string;
};

const PALETTE = ["#35C6F4", "#1E4FD8", "#FFB703", "#10B981", "#A855F7", "#F43F5E"];

const CHECKERBOARD_BG =
  "repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 24px 24px";

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const formatTimecode = (frame: number, fps: number): string => {
  const totalSeconds = Math.floor(frame / Math.max(1, fps));
  const remFrames = frame % Math.max(1, fps);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(remFrames).padStart(2, "0")}`;
};

/**
 * Interactive Motionedit Studio shell with composition switcher, zoom/transparency controls,
 * schema-aware prop editor (color pickers, sliders, enums, JSON), In/Out loop markers,
 * dynamic `calculateMetadata` evaluation, CLI command generator, and sequence/audio timeline ruler.
 */
export const Studio: React.FC<StudioProps> = ({
  compositions,
  initialCompositionId,
  title = "Milyonus Motionedit Studio",
}) => {
  if (compositions.length === 0) {
    throw new Error("<Studio> requires at least one composition in `compositions`.");
  }

  const [selectedId, setSelectedId] = useState<string>(
    () => initialCompositionId ?? compositions[0].id
  );
  const activeComp = useMemo(
    () => compositions.find((c) => c.id === selectedId) ?? compositions[0],
    [compositions, selectedId]
  );

  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [zoomMode, setZoomMode] = useState<"fit" | "0.5" | "0.75" | "1">("fit");
  const [transparentStage, setTransparentStage] = useState(false);
  const [inFrame, setInFrame] = useState<number | null>(null);
  const [outFrame, setOutFrame] = useState<number | null>(null);

  const [propsMap, setPropsMap] = useState<Record<string, Record<string, unknown>>>(() => {
    const init: Record<string, Record<string, unknown>> = {};
    for (const c of compositions) {
      init[c.id] = { ...(c.defaultProps ?? {}) };
    }
    return init;
  });
  const [resolvedConfig, setResolvedConfig] = useState<VideoConfig>(() => ({
    width: activeComp.width,
    height: activeComp.height,
    fps: activeComp.fps,
    durationInFrames: activeComp.durationInFrames,
  }));
  const [resolvedProps, setResolvedProps] = useState<Record<string, unknown>>(
    () => propsMap[activeComp.id] ?? activeComp.defaultProps ?? {}
  );

  const [editorTab, setEditorTab] = useState<"form" | "json">("form");
  const [jsonDraft, setJsonDraft] = useState<string>(() =>
    JSON.stringify(activeComp.defaultProps ?? {}, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copiedCli, setCopiedCli] = useState(false);
  const [fitWidth, setFitWidth] = useState(720);

  const stageHostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  const seqRegistryRef = useRef<Map<string, TimelineSequenceEntry>>(new Map());
  const audioRegistryRef = useRef<Map<string, ResolvedAudioTrack>>(new Map());
  const [, bumpTimelineVersion] = useState(0);

  const currentProps = propsMap[activeComp.id] ?? activeComp.defaultProps ?? {};
  const maxFrame = Math.max(0, resolvedConfig.durationInFrames - 1);
  const loopStart = inFrame !== null ? Math.min(inFrame, maxFrame) : 0;
  const loopEnd = outFrame !== null ? Math.min(Math.max(loopStart, outFrame), maxFrame) : maxFrame;

  const schemaValidation = useMemo(
    () => (activeComp.schema ? validateProps(activeComp.schema, currentProps) : { valid: true, errors: [] }),
    [activeComp.schema, currentProps]
  );

  useEffect(() => {
    seqRegistryRef.current.clear();
    audioRegistryRef.current.clear();
    setFrame(0);
    setInFrame(null);
    setOutFrame(null);
    setPlaying(false);
    const nextProps = propsMap[activeComp.id] ?? activeComp.defaultProps ?? {};
    setJsonDraft(JSON.stringify(nextProps, null, 2));
    setJsonError(null);
  }, [activeComp.id]);

  useEffect(() => {
    let cancelled = false;
    resolveCompositionMetadata(activeComp, currentProps)
      .then(({ config: nextCfg, props: nextResolved }) => {
        if (cancelled) return;
        setResolvedConfig(nextCfg);
        setResolvedProps(nextResolved);
        setFrame((f) => Math.min(f, Math.max(0, nextCfg.durationInFrames - 1)));
      })
      .catch(() => {
        // Keep last valid metadata if user is mid-keystroke.
      });
    return () => {
      cancelled = true;
    };
  }, [activeComp, currentProps]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined" || !stageHostRef.current) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(240, Math.floor(entry.contentRect.width - 48));
        const h = Math.max(180, Math.floor(entry.contentRect.height - 48));
        const fitW = Math.min(w, Math.floor((h * resolvedConfig.width) / resolvedConfig.height));
        setFitWidth(Math.max(240, fitW));
      }
    });
    obs.observe(stageHostRef.current);
    return () => obs.disconnect();
  }, [resolvedConfig.width, resolvedConfig.height]);

  useEffect(() => {
    if (!playing) return;
    const effectiveFps = resolvedConfig.fps * speed;
    let origin = performance.now() - (frameRef.current / effectiveFps) * 1000;
    let raf = 0;
    const tick = (now: number) => {
      let f = Math.floor(((now - origin) / 1000) * effectiveFps);
      if (f > loopEnd) {
        if (loop) {
          origin = now - (loopStart / effectiveFps) * 1000;
          f = loopStart;
        } else {
          setFrame(loopEnd);
          setPlaying(false);
          return;
        }
      }
      setFrame(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, resolvedConfig.fps, loopStart, loopEnd, speed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space" || e.code === "KeyK") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        setPlaying(false);
        setFrame((f) => Math.max(0, f - (e.shiftKey ? 10 : 1)));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        setPlaying(false);
        setFrame((f) => Math.min(maxFrame, f + (e.shiftKey ? 10 : 1)));
      } else if (e.code === "Home") {
        e.preventDefault();
        setPlaying(false);
        setFrame(loopStart);
      } else if (e.code === "End") {
        e.preventDefault();
        setPlaying(false);
        setFrame(loopEnd);
      } else if (e.code === "KeyI") {
        e.preventDefault();
        setInFrame(frameRef.current);
      } else if (e.code === "KeyO") {
        e.preventDefault();
        setOutFrame(frameRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maxFrame, loopStart, loopEnd]);

  const inspector: InspectorAPI = useMemo(
    () => ({
      reportSequence: (entry) => {
        if (!seqRegistryRef.current.has(entry.id)) {
          seqRegistryRef.current.set(entry.id, entry);
          queueMicrotask(() => bumpTimelineVersion((v) => v + 1));
        } else {
          seqRegistryRef.current.set(entry.id, entry);
        }
      },
      reportAudio: (track) => {
        if (!audioRegistryRef.current.has(track.id)) {
          audioRegistryRef.current.set(track.id, track);
          queueMicrotask(() => bumpTimelineVersion((v) => v + 1));
        } else {
          audioRegistryRef.current.set(track.id, track);
        }
      },
    }),
    []
  );

  const updatePropValue = (key: string, value: unknown) => {
    const updated = { ...currentProps, [key]: value };
    setPropsMap((prev) => ({ ...prev, [activeComp.id]: updated }));
    setJsonDraft(JSON.stringify(updated, null, 2));
    setJsonError(null);
  };

  const resetProps = () => {
    const defaults = { ...(activeComp.defaultProps ?? {}) };
    seqRegistryRef.current.clear();
    audioRegistryRef.current.clear();
    setPropsMap((prev) => ({ ...prev, [activeComp.id]: defaults }));
    setJsonDraft(JSON.stringify(defaults, null, 2));
    setJsonError(null);
  };

  const playback = useMemo(() => ({ playing, muted, renderMode: false }), [playing, muted]);

  const effectiveScale =
    zoomMode === "fit" ? fitWidth / resolvedConfig.width : Number(zoomMode);

  const sequences = Array.from(seqRegistryRef.current.values()).sort(
    (a, b) => a.from - b.from || a.depth - b.depth
  );
  const audioTracks = Array.from(audioRegistryRef.current.values()).sort(
    (a, b) => a.startFrame - b.startFrame
  );

  const rulerTicks = useMemo(() => {
    const count = 6;
    return Array.from({ length: count + 1 }, (_, idx) =>
      Math.round((idx * maxFrame) / Math.max(1, count))
    );
  }, [maxFrame]);

  const buildCliCommand = (): string => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin + window.location.pathname
        : "http://localhost:5173/";
    const serialized = JSON.stringify(currentProps);
    const hasProps = Object.keys(currentProps).length > 0;
    const ext = transparentStage ? "webm" : "mp4";
    return [
      "milyonus render",
      `--url "${origin}?render=1"`,
      `--composition "${activeComp.id}"`,
      transparentStage ? "--codec vp9 --transparent" : "",
      inFrame !== null ? `--from-frame ${loopStart}` : "",
      outFrame !== null ? `--to-frame ${loopEnd + 1}` : "",
      hasProps ? `--props '${serialized}'` : "",
      `--out "out/${activeComp.id}.${ext}"`,
    ]
      .filter(Boolean)
      .join(" ");
  };

  const copyCommand = () => {
    const cmd = buildCliCommand();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(cmd).then(() => {
        setCopiedCli(true);
        setTimeout(() => setCopiedCli(false), 1800);
      });
    }
  };

  const renderFieldControl = (key: string, val: unknown, fieldSchema?: PropFieldSchema) => {
    const label = fieldSchema?.label ?? key;

    if (fieldSchema?.kind === "enum") {
      return (
        <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <span style={{ color: "#cbd5e1", fontWeight: 500 }}>{label}</span>
          <select
            value={String(val ?? fieldSchema.options[0] ?? "")}
            onChange={(e) => updatePropValue(key, e.target.value)}
            style={fieldStyle}
          >
            {fieldSchema.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (fieldSchema?.kind === "color" || (typeof val === "string" && HEX_COLOR_RE.test(val))) {
      const hex = typeof val === "string" && HEX_COLOR_RE.test(val) ? val : "#35c6f4";
      return (
        <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <span style={{ color: "#cbd5e1", fontWeight: 500 }}>{label}</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              type="color"
              value={hex}
              onChange={(e) => updatePropValue(key, e.target.value)}
              style={{ width: 32, height: 28, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
            />
            <input
              type="text"
              value={String(val ?? "")}
              onChange={(e) => updatePropValue(key, e.target.value)}
              style={{ ...fieldStyle, flex: 1 }}
            />
          </div>
        </label>
      );
    }

    if (fieldSchema?.kind === "boolean" || typeof val === "boolean") {
      return (
        <label key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: "#cbd5e1", fontWeight: 500 }}>{label}</span>
          <input
            type="checkbox"
            checked={Boolean(val)}
            onChange={(e) => updatePropValue(key, e.target.checked)}
          />
        </label>
      );
    }

    if (fieldSchema?.kind === "number" || typeof val === "number") {
      const numVal = typeof val === "number" ? val : 0;
      const hasBounds =
        fieldSchema?.kind === "number" &&
        fieldSchema.min !== undefined &&
        fieldSchema.max !== undefined;
      return (
        <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <span style={{ color: "#cbd5e1", fontWeight: 500 }}>{label}</span>
          {hasBounds && fieldSchema.kind === "number" ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="range"
                min={fieldSchema.min}
                max={fieldSchema.max}
                step={fieldSchema.step ?? 1}
                value={numVal}
                onChange={(e) => updatePropValue(key, Number(e.target.value))}
                style={{ flex: 1, accentColor: "#35C6F4" }}
              />
              <input
                type="number"
                min={fieldSchema.min}
                max={fieldSchema.max}
                step={fieldSchema.step ?? 1}
                value={numVal}
                onChange={(e) => updatePropValue(key, Number(e.target.value))}
                style={{ ...fieldStyle, width: 64 }}
              />
            </div>
          ) : (
            <input
              type="number"
              step={fieldSchema?.kind === "number" ? fieldSchema.step : undefined}
              value={numVal}
              onChange={(e) => updatePropValue(key, Number(e.target.value))}
              style={fieldStyle}
            />
          )}
        </label>
      );
    }

    if (typeof val === "string" || fieldSchema?.kind === "string") {
      return (
        <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <span style={{ color: "#cbd5e1", fontWeight: 500 }}>{label}</span>
          <input
            type="text"
            value={String(val ?? "")}
            onChange={(e) => updatePropValue(key, e.target.value)}
            style={fieldStyle}
          />
        </label>
      );
    }

    return (
      <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
        <span style={{ color: "#cbd5e1", fontWeight: 500 }}>{label}</span>
        <input
          type="text"
          value={JSON.stringify(val)}
          readOnly
          title="Edit complex objects/arrays in the JSON tab"
          style={{ ...fieldStyle, opacity: 0.7 }}
        />
      </label>
    );
  };

  const fieldKeys = useMemo(() => {
    const keys = new Set<string>(Object.keys(currentProps));
    if (activeComp.schema) {
      for (const k of Object.keys(activeComp.schema.shape)) keys.add(k);
    }
    return Array.from(keys);
  }, [currentProps, activeComp.schema]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        minHeight: 620,
        background: "#070d1f",
        color: "#e2e8f0",
        fontFamily: "system-ui, -apple-system, sans-serif",
        boxSizing: "border-box",
      }}
    >
      {/* Top Header */}
      <header
        style={{
          height: 50,
          padding: "0 16px",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#0b132b",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#35C6F4", letterSpacing: 0.2 }}>
            {title}
          </span>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {resolvedConfig.width}×{resolvedConfig.height} · {resolvedConfig.fps} fps · {resolvedConfig.durationInFrames} frames (
            {(resolvedConfig.durationInFrames / resolvedConfig.fps).toFixed(2)}s)
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: 12, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 4 }}>
            Zoom
            <select
              value={zoomMode}
              onChange={(e) => setZoomMode(e.target.value as any)}
              style={{ ...transportBtnStyle, padding: "3px 6px" }}
            >
              <option value="fit">Fit ({Math.round(effectiveScale * 100)}%)</option>
              <option value="0.5">50%</option>
              <option value="0.75">75%</option>
              <option value="1">100%</option>
            </select>
          </label>
          <label style={{ fontSize: 12, color: "#cbd5e1", display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={transparentStage}
              onChange={(e) => setTransparentStage(e.target.checked)}
            />
            Alpha Grid
          </label>
          <button
            type="button"
            onClick={copyCommand}
            style={{
              background: copiedCli ? "#10b981" : "#1e4fd8",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {copiedCli ? "Copied CLI Command" : "Copy Render CLI Command"}
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Left Sidebar: Compositions */}
        <aside
          style={{
            width: 230,
            borderRight: "1px solid #1e293b",
            background: "#091024",
            padding: 12,
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: 8 }}>
            Compositions ({compositions.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {compositions.map((comp) => {
              const active = comp.id === activeComp.id;
              return (
                <button
                  key={comp.id}
                  type="button"
                  onClick={() => setSelectedId(comp.id)}
                  style={{
                    textAlign: "left",
                    background: active ? "rgba(53, 198, 244, 0.14)" : "transparent",
                    border: active ? "1px solid #35C6F4" : "1px solid #1e293b",
                    borderRadius: 8,
                    padding: "8px 10px",
                    color: "#f8fafc",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{comp.id}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                    {comp.width}×{comp.height} · {comp.fps}fps · {comp.durationInFrames}f
                  </div>
                  {comp.description ? (
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{comp.description}</div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center Stage + Transport */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div
            ref={stageHostRef}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              overflow: "auto",
              background: "radial-gradient(circle at center, #111c3a 0%, #060b19 100%)",
            }}
          >
            <div
              style={{
                boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
                border: "1px solid #1e293b",
                background: transparentStage ? CHECKERBOARD_BG : undefined,
              }}
            >
              <Stage
                config={resolvedConfig}
                frame={frame}
                component={activeComp.component}
                props={resolvedProps}
                scale={effectiveScale}
                playback={playback}
                inspector={inspector}
                transparent={transparentStage}
              />
            </div>
          </div>

          {/* Transport Bar */}
          <div
            style={{
              height: 46,
              padding: "0 16px",
              borderTop: "1px solid #1e293b",
              background: "#0b132b",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setFrame(loopStart);
              }}
              style={transportBtnStyle}
            >
              |&lt;
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setFrame((f) => Math.max(0, f - 1));
              }}
              style={transportBtnStyle}
            >
              -1
            </button>
            <button
              type="button"
              onClick={() => {
                if (!playing && frame >= loopEnd) setFrame(loopStart);
                setPlaying((p) => !p);
              }}
              style={{ ...transportBtnStyle, background: "#1e4fd8", minWidth: 60, fontWeight: 600 }}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setFrame((f) => Math.min(maxFrame, f + 1));
              }}
              style={transportBtnStyle}
            >
              +1
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setFrame(loopEnd);
              }}
              style={transportBtnStyle}
            >
              &gt;|
            </button>
            <button
              type="button"
              title="Set In frame (I)"
              onClick={() => setInFrame(frame)}
              style={{ ...transportBtnStyle, borderColor: inFrame !== null ? "#35C6F4" : "#334155" }}
            >
              In{inFrame !== null ? `:${inFrame}` : ""}
            </button>
            <button
              type="button"
              title="Set Out frame (O)"
              onClick={() => setOutFrame(frame)}
              style={{ ...transportBtnStyle, borderColor: outFrame !== null ? "#35C6F4" : "#334155" }}
            >
              Out{outFrame !== null ? `:${outFrame}` : ""}
            </button>
            {inFrame !== null || outFrame !== null ? (
              <button
                type="button"
                title="Clear In/Out range"
                onClick={() => {
                  setInFrame(null);
                  setOutFrame(null);
                }}
                style={transportBtnStyle}
              >
                ×
              </button>
            ) : null}
            <input
              type="range"
              min={0}
              max={maxFrame}
              value={frame}
              onChange={(e) => {
                setPlaying(false);
                setFrame(Number(e.target.value));
              }}
              style={{ flex: 1, accentColor: "#35C6F4" }}
            />
            <select
              aria-label="Playback speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              style={{ ...transportBtnStyle, padding: "4px 6px" }}
            >
              <option value={0.25}>0.25x</option>
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, color: "#cbd5e1" }}>
              <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
              Loop
            </label>
            <button type="button" onClick={() => setMuted((m) => !m)} style={transportBtnStyle}>
              {muted ? "Unmute" : "Mute"}
            </button>
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                fontSize: 12,
                color: "#35C6F4",
                minWidth: 128,
                textAlign: "right",
              }}
            >
              {formatTimecode(frame, resolvedConfig.fps)} · {frame}/{maxFrame}
            </span>
          </div>
        </main>

        {/* Right Sidebar: Prop Editor */}
        <aside
          style={{
            width: 288,
            borderLeft: "1px solid #1e293b",
            background: "#091024",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#64748b" }}>
              Input Props
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                onClick={() => setEditorTab("form")}
                style={{
                  ...tabBtnStyle,
                  background: editorTab === "form" ? "#1e293b" : "transparent",
                }}
              >
                Controls
              </button>
              <button
                type="button"
                onClick={() => setEditorTab("json")}
                style={{
                  ...tabBtnStyle,
                  background: editorTab === "json" ? "#1e293b" : "transparent",
                }}
              >
                JSON
              </button>
            </div>
          </div>

          {editorTab === "form" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {fieldKeys.length === 0 ? (
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  No default props declared. Switch to the JSON tab to add custom props.
                </div>
              ) : (
                fieldKeys.map((key) =>
                  renderFieldControl(key, currentProps[key], activeComp.schema?.shape[key])
                )
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
              <textarea
                value={jsonDraft}
                onChange={(e) => {
                  const text = e.target.value;
                  setJsonDraft(text);
                  try {
                    const parsed = JSON.parse(text);
                    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                      setJsonError("Props root must be a JSON object.");
                    } else {
                      setJsonError(null);
                      setPropsMap((prev) => ({ ...prev, [activeComp.id]: parsed }));
                    }
                  } catch (err) {
                    setJsonError((err as Error).message);
                  }
                }}
                style={{
                  ...fieldStyle,
                  minHeight: 180,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12,
                  resize: "vertical",
                }}
              />
              {jsonError ? <div style={{ color: "#f43f5e", fontSize: 11 }}>{jsonError}</div> : null}
            </div>
          )}

          {!schemaValidation.valid ? (
            <div
              style={{
                background: "rgba(244, 63, 94, 0.12)",
                border: "1px solid #f43f5e",
                borderRadius: 6,
                padding: 8,
                fontSize: 11,
                color: "#fda4af",
              }}
            >
              {schemaValidation.errors.map((err, idx) => (
                <div key={idx}>{err}</div>
              ))}
            </div>
          ) : null}

          <button type="button" onClick={resetProps} style={{ ...transportBtnStyle, alignSelf: "flex-start" }}>
            Reset to Default Props
          </button>
        </aside>
      </div>

      {/* Bottom Timeline Panel */}
      <section
        style={{
          height: 188,
          borderTop: "1px solid #1e293b",
          background: "#080f22",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "6px 16px",
            borderBottom: "1px solid #1e293b",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            color: "#64748b",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>
            Timeline · {sequences.length} Sequences · {audioTracks.length} Audio Tracks
          </span>
          <span>Shortcuts: Space (Play) · ←/→ (±1f) · I/O (In/Out Loop)</span>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "6px 16px 10px", position: "relative" }}>
          <div
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
              setPlaying(false);
              setFrame(Math.round(ratio * maxFrame));
            }}
            style={{ position: "relative", minHeight: 120, cursor: "pointer" }}
          >
            {/* Frame ruler */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: "#64748b",
                borderBottom: "1px solid #1e293b",
                paddingBottom: 4,
                marginBottom: 6,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {rulerTicks.map((t, i) => (
                <span key={i}>{t}f</span>
              ))}
            </div>

            {/* Active In/Out loop highlight */}
            {inFrame !== null || outFrame !== null ? (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${(loopStart / Math.max(1, resolvedConfig.durationInFrames)) * 100}%`,
                  width: `${((loopEnd - loopStart + 1) / Math.max(1, resolvedConfig.durationInFrames)) * 100}%`,
                  background: "rgba(53, 198, 244, 0.08)",
                  borderLeft: "1px dashed #35C6F4",
                  borderRight: "1px dashed #35C6F4",
                  pointerEvents: "none",
                }}
              />
            ) : null}

            {/* Playhead indicator */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${(frame / Math.max(1, resolvedConfig.durationInFrames)) * 100}%`,
                width: 2,
                background: "#f43f5e",
                zIndex: 5,
                pointerEvents: "none",
              }}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sequences.map((seq, idx) => {
                const leftPct = (seq.from / Math.max(1, resolvedConfig.durationInFrames)) * 100;
                const widthPct = (seq.durationInFrames / Math.max(1, resolvedConfig.durationInFrames)) * 100;
                const color = PALETTE[idx % PALETTE.length];
                return (
                  <div
                    key={seq.id}
                    style={{
                      position: "relative",
                      height: 24,
                      background: "rgba(30, 41, 59, 0.45)",
                      borderRadius: 4,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: `${leftPct}%`,
                        width: `${Math.max(1, widthPct)}%`,
                        top: 2,
                        bottom: 2,
                        background: color,
                        borderRadius: 4,
                        padding: "0 8px",
                        display: "flex",
                        alignItems: "center",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#071233",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        boxSizing: "border-box",
                      }}
                    >
                      {seq.name} [{seq.from}..{seq.from + seq.durationInFrames})
                    </div>
                  </div>
                );
              })}

              {audioTracks.map((track) => {
                const leftPct = (track.startFrame / Math.max(1, resolvedConfig.durationInFrames)) * 100;
                const widthPct = (track.durationInFrames / Math.max(1, resolvedConfig.durationInFrames)) * 100;
                return (
                  <div
                    key={track.id}
                    style={{
                      position: "relative",
                      height: 24,
                      background: "rgba(16, 185, 129, 0.12)",
                      borderRadius: 4,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: `${leftPct}%`,
                        width: `${Math.max(1, resolvedConfig.durationInFrames ? widthPct : 100)}%`,
                        top: 2,
                        bottom: 2,
                        background: "#10b981",
                        borderRadius: 4,
                        padding: "0 8px",
                        display: "flex",
                        alignItems: "center",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#042f2e",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        boxSizing: "border-box",
                      }}
                    >
                      AUDIO: {track.name} [{track.startFrame}..{track.startFrame + track.durationInFrames})
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const transportBtnStyle: React.CSSProperties = {
  background: "#1e293b",
  color: "#f8fafc",
  border: "1px solid #334155",
  borderRadius: 5,
  padding: "4px 9px",
  fontSize: 12,
  cursor: "pointer",
};

const tabBtnStyle: React.CSSProperties = {
  color: "#cbd5e1",
  border: "1px solid #334155",
  borderRadius: 4,
  padding: "2px 8px",
  fontSize: 11,
  cursor: "pointer",
};

const fieldStyle: React.CSSProperties = {
  background: "#0f172a",
  color: "#f8fafc",
  border: "1px solid #334155",
  borderRadius: 5,
  padding: "6px 8px",
  fontSize: 12,
};
