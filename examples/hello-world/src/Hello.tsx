import React from "react";
import { Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easings } from "@milyonus/core";

const Title: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 12 } });
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <h1 style={{ fontFamily: "system-ui", fontSize: 140, margin: 0, opacity, transform: `scale(${scale})`, color: "#fff" }}>{text}</h1>
    </div>
  );
};

const Bar: React.FC = () => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const w = interpolate(frame, [0, 60], [0, width], { easing: Easings.easeOut, extrapolateRight: "clamp" });
  return <div style={{ position: "absolute", bottom: 80, left: 0, height: 16, width: w, background: "#ffb703" }} />;
};

export const Hello: React.FC<{ title?: string }> = ({ title = "Milyonus" }) => (
  <div style={{ flex: 1, background: "linear-gradient(135deg,#0b132b,#3a506b)", position: "relative", display: "flex" }}>
    <Sequence from={0}>
      <Title text={title} />
    </Sequence>
    <Sequence from={30} durationInFrames={60}>
      <Bar />
    </Sequence>
  </div>
);

export const helloConfig = { width: 1280, height: 720, fps: 30, durationInFrames: 90 };
