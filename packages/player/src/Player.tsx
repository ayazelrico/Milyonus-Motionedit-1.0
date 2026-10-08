import React, { useEffect, useRef, useState } from "react";
import type { VideoConfig } from "@milyonus/core";
import { Stage } from "./Stage.js";

export type PlayerProps = VideoConfig & {
  component: React.ComponentType<any>;
  inputProps?: Record<string, unknown>;
  /** Preview width in CSS pixels (height follows the aspect ratio). */
  previewWidth?: number;
  loop?: boolean;
  autoPlay?: boolean;
};

/** Embeddable preview player with play/pause and a scrubber. */
export const Player: React.FC<PlayerProps> = ({
  component,
  inputProps,
  previewWidth = 640,
  loop = true,
  autoPlay = true,
  ...config
}) => {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const frameRef = useRef(0);
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
          setFrame(config.durationInFrames - 1);
          setPlaying(false);
          return;
        }
      }
      setFrame(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, config.fps, config.durationInFrames]);

  return (
    <div style={{ width: previewWidth, fontFamily: "system-ui, sans-serif" }}>
      <Stage config={config} frame={frame} component={component} props={inputProps} scale={previewWidth / config.width} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button onClick={() => setPlaying((p: boolean) => !p)}>{playing ? "Pause" : "Play"}</button>
        <input
          type="range"
          min={0}
          max={config.durationInFrames - 1}
          value={frame}
          onChange={(e) => {
            setPlaying(false);
            setFrame(Number(e.target.value));
          }}
          style={{ flex: 1 }}
        />
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {frame}/{config.durationInFrames - 1}
        </span>
      </div>
    </div>
  );
};
