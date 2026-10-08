import React from "react";
import { FrameProvider, VideoConfig } from "@milyonus/core";

export const Stage: React.FC<{
  config: VideoConfig;
  frame: number;
  component: React.ComponentType<any>;
  props?: Record<string, unknown>;
  scale?: number;
}> = ({ config, frame, component: C, props, scale = 1 }) => (
  <div style={{ width: config.width * scale, height: config.height * scale, overflow: "hidden", position: "relative" }}>
    <div
      style={{
        width: config.width,
        height: config.height,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        position: "relative",
        display: "flex",
        background: "#fff",
      }}
    >
      <FrameProvider value={{ ...config, frame }}>
        <C {...(props ?? {})} />
      </FrameProvider>
    </div>
  </div>
);
