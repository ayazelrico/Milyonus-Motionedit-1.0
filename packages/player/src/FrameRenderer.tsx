import React, { useEffect, useState } from "react";
import type { VideoConfig } from "@milyonus/core";
import { Stage } from "./Stage.js";

declare global {
  interface Window {
    milyonusSetFrame?: (frame: number) => Promise<void>;
    milyonusReady?: boolean;
  }
}

/** Render-mode page. The CLI calls `window.milyonusSetFrame(n)` and screenshots #milyonus-stage. */
export const FrameRenderer: React.FC<
  VideoConfig & { component: React.ComponentType<any>; inputProps?: Record<string, unknown> }
> = ({ component, inputProps, ...config }) => {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    window.milyonusSetFrame = (n: number) =>
      new Promise<void>((resolve) => {
        setFrame(n);
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    window.milyonusReady = true;
    return () => {
      window.milyonusReady = false;
    };
  }, []);
  return (
    <div id="milyonus-stage" style={{ width: config.width, height: config.height }}>
      <Stage config={config} frame={frame} component={component} props={inputProps} />
    </div>
  );
};
