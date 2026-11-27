import React from "react";
import {
  Audio,
  Captions,
  Easings,
  Sequence,
  Transition,
  defineComposition,
  interpolate,
  randomRange,
  spring,
  useCurrentFrame,
  useVideoConfig,
  type CaptionCue,
} from "@milyonus/core";
import { createChimeWavDataUri } from "./tone.js";

const INTRO_CHIME = createChimeWavDataUri(523.25, 0.55);
const ACCENT_CHIME = createChimeWavDataUri(783.99, 0.45);

const Starfield: React.FC<{ count?: number }> = ({ count = 24 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {Array.from({ length: count }, (_, idx) => {
        const baseX = randomRange(`star-x-${idx}`, 40, width - 40);
        const baseY = randomRange(`star-y-${idx}`, 40, height - 40);
        const size = randomRange(`star-size-${idx}`, 3, 8);
        const drift = frame * randomRange(`star-speed-${idx}`, 0.3, 1.1);
        const y = ((baseY - drift) % height + height) % height;
        const twinkle = interpolate(Math.sin((frame + idx * 7) * 0.15), [-1, 1], [0.2, 0.75]);
        return (
          <div
            key={idx}
            style={{
              position: "absolute",
              left: baseX,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              background: "#35C6F4",
              opacity: twinkle,
            }}
          />
        );
      })}
    </div>
  );
};

const Title: React.FC<{ text: string; subtitle?: string }> = ({ text, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 12 } });
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <h1
        style={{
          fontFamily: "system-ui, sans-serif",
          fontSize: 132,
          margin: 0,
          opacity,
          transform: `scale(${scale})`,
          color: "#fff",
        }}
      >
        {text}
      </h1>
      {subtitle ? (
        <p
          style={{
            fontFamily: "system-ui, sans-serif",
            fontSize: 34,
            margin: 0,
            color: "#35C6F4",
            opacity: interpolate(frame, [12, 28], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
};

const Bar: React.FC<{ accentColor: string }> = ({ accentColor }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const w = interpolate(frame, [0, 60], [0, width], {
    easing: Easings.easeOut,
    extrapolateRight: "clamp",
  });
  return <div style={{ position: "absolute", bottom: 32, left: 0, height: 14, width: w, background: accentColor }} />;
};

const DEFAULT_CUES: CaptionCue[] = [
  { from: 4, to: 42, text: "Frame in. React tree out." },
  { from: 45, to: 88, text: "Deterministic pixels, audio, and captions." },
];

export type HelloProps = {
  title?: string;
  subtitle?: string;
  accentColor?: string;
  showCaptions?: boolean;
  withAudio?: boolean;
};

export const Hello: React.FC<HelloProps> = ({
  title = "Milyonus",
  subtitle = "Motionedit 1.0",
  accentColor = "#ffb703",
  showCaptions = true,
  withAudio = true,
}) => (
  <div
    style={{
      flex: 1,
      background: "linear-gradient(135deg,#0b132b,#1c2541 55%,#3a506b)",
      position: "relative",
      display: "flex",
    }}
  >
    <Sequence name="Starfield" from={0}>
      <Starfield />
    </Sequence>
    <Sequence name="Hero Title" from={0}>
      <Transition enter="fade" enterDuration={12}>
        <Title text={title} subtitle={subtitle} />
      </Transition>
      {withAudio ? <Audio name="Intro Chime" src={INTRO_CHIME} volume={0.7} /> : null}
    </Sequence>
    <Sequence name="Progress Bar" from={30} durationInFrames={60}>
      <Bar accentColor={accentColor} />
      {withAudio ? <Audio name="Accent Chime" src={ACCENT_CHIME} volume={0.55} /> : null}
    </Sequence>
    {showCaptions ? (
      <Sequence name="Captions" from={0}>
        <Captions cues={DEFAULT_CUES} style={{ paddingBottom: 68 }} />
      </Sequence>
    ) : null}
  </div>
);

export const helloConfig = { width: 1280, height: 720, fps: 30, durationInFrames: 90 };

export const LaunchCard: React.FC<{ headline?: string; tag?: string }> = ({
  headline = "Write Films in TypeScript",
  tag = "@milyonus/core",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { stiffness: 130, damping: 13 } });

  return (
    <div
      style={{
        flex: 1,
        background: "radial-gradient(circle at top left, #1e4fd8, #071233 70%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
        boxSizing: "border-box",
      }}
    >
      <Sequence name="Badge" from={0}>
        <Transition enter="slide-down" enterDuration={16}>
          <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 140 }}>
            <span
              style={{
                background: "rgba(53, 198, 244, 0.18)",
                border: "2px solid #35C6F4",
                color: "#35C6F4",
                padding: "10px 24px",
                borderRadius: 999,
                fontFamily: "ui-monospace, monospace",
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              {tag}
            </span>
          </div>
        </Transition>
      </Sequence>
      <Sequence name="Headline" from={8}>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <h2
            style={{
              fontFamily: "system-ui, sans-serif",
              fontSize: 92,
              lineHeight: 1.1,
              color: "#ffffff",
              textAlign: "center",
              margin: 0,
              transform: `scale(${pop})`,
            }}
          >
            {headline}
          </h2>
        </div>
      </Sequence>
    </div>
  );
};

export const compositions = [
  defineComposition({
    id: "hello",
    component: Hello,
    ...helloConfig,
    description: "16:9 hero intro with seeded particles, captions, transitions, and audio.",
    defaultProps: {
      title: "Milyonus",
      subtitle: "Motionedit 1.0",
      accentColor: "#ffb703",
      showCaptions: true,
      withAudio: true,
    },
  }),
  defineComposition({
    id: "launch-card",
    component: LaunchCard,
    width: 1080,
    height: 1080,
    fps: 30,
    durationInFrames: 60,
    description: "1:1 square social launch card.",
    defaultProps: {
      headline: "Write Films in TypeScript",
      tag: "@milyonus/core",
    },
  }),
];
