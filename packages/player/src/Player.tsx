import React, { useEffect, useMemo, useRef, useState } from "react";
import type { VideoConfig } from "@milyonus/core";
import { Stage } from "./Stage.js";

export type PlayerProps = VideoConfig & {
  /** Composition component to preview. */
  component: React.ComponentType<any>;
  /** Props forwarded to the composition component. */
  inputProps?: Record<string, unknown>;
  /** Preview width in CSS pixels (height follows the aspect ratio). Defaults to `640`. */
  previewWidth?: number;
  /** Restart from frame 0 after reaching `durationInFrames - 1`. Defaults to `true`. */
  loop?: boolean;
  /** Begin playback automatically on mount. Defaults to `true`. */
  autoPlay?: boolean;
  /** Mute `<Audio>` elements inside the composition. Defaults to `false`. */
  muted?: boolean;
  /** Initial frame shown before playback advances. Defaults to `0`. */
  initialFrame?: number;
  /** Show transport controls below the stage. Defaults to `true`. */
  controls?: boolean;
};

const formatSeconds = (frame: number, fps: number): string => {
  const totalSec = frame / Math.max(1, fps);
  const mins = Math.floor(totalSec / 60);
  const secs = (totalSec % 60).toFixed(2).padStart(5, "0");
  return `${String(mins).padStart(2, "0")}:${secs}`;
};

/** Embeddable preview player with play/pause, frame stepping, mute toggle, and scrubber. */
export const Player: React.FC<PlayerProps> = ({
  component,
  inputProps,
  previewWidth = 640,
  loop = true,
  autoPlay = true,
  muted: initialMuted = false,
  initialFrame = 0,
  controls = true,
  ...config
}) => {
  const maxFrame = Math.max(0, config.durationInFrames - 1);
  const [frame, setFrame] = useState(() => Math.min(maxFrame, Math.max(0, Math.floor(initialFrame))));
  const [playing, setPlaying] = useState(autoPlay);
  const [muted, setMuted] = useState(initialMuted);
  const frameRef = useRef(frame);
  frameRef.current = frame;

  useEffect(() => {
    if (!playing) return;
    let origin = performance.now() - (frameRef.current / config.fps) * 1000;
    let raf = 0;
    const tick = (now: number) => {
      let f = Math.floor(((now - origin) / 1000) * config.fps);
      if (f >= config.durationInFrames) {
        if (loop) {
          origin = now;
          f = 0;
        } else {
          setFrame(maxFrame);
          setPlaying(false);
          return;
        }
      }
      setFrame(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, config.fps, config.durationInFrames, maxFrame]);

  const playback = useMemo(() => ({ playing, muted, renderMode: false }), [playing, muted]);

  return (
    <div style={{ width: previewWidth, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <Stage
        config={config}
        frame={frame}
        component={component}
        props={inputProps}
        scale={previewWidth / config.width}
        playback={playback}
      />
      {controls ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
          <button
            type="button"
            onClick={() => {
              if (!playing && frame >= maxFrame) setFrame(0);
              setPlaying((p: boolean) => !p);
            }}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            title="Previous frame"
            onClick={() => {
              setPlaying(false);
              setFrame((f) => Math.max(0, f - 1));
            }}
          >
            -1
          </button>
          <button
            type="button"
            title="Next frame"
            onClick={() => {
              setPlaying(false);
              setFrame((f) => Math.min(maxFrame, f + 1));
            }}
          >
            +1
          </button>
          <input
            type="range"
            min={0}
            max={maxFrame}
            value={frame}
            onChange={(e) => {
              setPlaying(false);
              setFrame(Number(e.target.value));
            }}
            style={{ flex: 1 }}
          />
          <button type="button" onClick={() => setMuted((m) => !m)}>
            {muted ? "Unmute" : "Mute"}
          </button>
          <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
            {formatSeconds(frame, config.fps)} · {frame}/{maxFrame}
          </span>
        </div>
      ) : null}
    </div>
  );
};
