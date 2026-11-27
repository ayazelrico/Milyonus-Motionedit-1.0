import React from "react";
import {
  Audio,
  AudioWaveform,
  Captions,
  Easings,
  Sequence,
  StrokePath,
  Transition,
  defineComposition,
  interpolate,
  parseWavAudioData,
  propSchema,
  randomRange,
  spring,
  useCurrentFrame,
  useVideoConfig,
  type CaptionCue,
} from "@milyonus/core";
import { createChimeWavDataUri } from "./tone.js";

const INTRO_CHIME = createChimeWavDataUri(523.25, 0.55);
const ACCENT_CHIME = createChimeWavDataUri(783.99, 0.45);
const INTRO_WAVEFORM = parseWavAudioData(INTRO_CHIME);

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
      <svg
        width="360"
        height="24"
        viewBox="0 0 360 24"
        style={{ position: "absolute", left: "50%", top: "67%", transform: "translateX(-50%)" }}
      >
        <StrokePath
          d="M 10 12 Q 180 2 350 12"
          stroke={accentColor}
          strokeWidth={4}
          strokeLinecap="round"
          fill="none"
          delay={10}
          durationInFrames={28}
        />
      </svg>
      {withAudio ? (
        <>
          <Audio name="Intro Chime" src={INTRO_CHIME} volume={0.7} />
          <div style={{ position: "absolute", top: 36, right: 48, opacity: 0.75 }}>
            <AudioWaveform audioData={INTRO_WAVEFORM} bars={18} height={44} gap={4} color={accentColor} />
          </div>
        </>
      ) : null}
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

export const LaunchCard: React.FC<{ headline?: string; tag?: string; aspect?: "square" | "portrait" }> = ({
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

export const StickerBadge: React.FC<{ label?: string }> = ({ label = "LIVE" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { stiffness: 150, damping: 11 } });

  return (
    <div
      style={{
        flex: 1,
        background: "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#f43f5e",
          color: "#ffffff",
          padding: "24px 56px",
          borderRadius: 999,
          fontFamily: "system-ui, sans-serif",
          fontSize: 72,
          fontWeight: 800,
          letterSpacing: 4,
          transform: `scale(${scale})`,
          boxShadow: "0 12px 30px rgba(244, 63, 94, 0.45)",
        }}
      >
        {label}
      </div>
    </div>
  );
};

export const compositions = [
  defineComposition({
    id: "hello",
    component: Hello,
    ...helloConfig,
    description: "16:9 hero intro with seeded particles, SVG stroke, waveform, captions, and audio.",
    schema: propSchema.object({
      title: propSchema.string({ label: "Hero Title", minLength: 1 }),
      subtitle: propSchema.string({ label: "Subtitle" }),
      accentColor: propSchema.color({ label: "Accent Color" }),
      showCaptions: propSchema.boolean({ label: "Show Captions" }),
      withAudio: propSchema.boolean({ label: "Enable Chime Audio" }),
    }),
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
    description: "Social launch card with dynamic 1:1 or 9:16 aspect via calculateMetadata.",
    schema: propSchema.object({
      headline: propSchema.string({ label: "Headline", minLength: 1 }),
      tag: propSchema.string({ label: "Badge Tag" }),
      aspect: propSchema.enum(["square", "portrait"], { label: "Aspect Ratio" }),
    }),
    defaultProps: {
      headline: "Write Films in TypeScript",
      tag: "@milyonus/core",
      aspect: "square" as "square" | "portrait",
    },
    calculateMetadata: ({ props }) => ({
      width: 1080,
      height: props.aspect === "portrait" ? 1920 : 1080,
    }),
  }),
  defineComposition({
    id: "sticker-badge",
    component: StickerBadge,
    width: 512,
    height: 256,
    fps: 30,
    durationInFrames: 30,
    description: "Alpha-transparent lower-third/sticker overlay for WebM, ProRes, and GIF.",
    schema: propSchema.object({
      label: propSchema.string({ label: "Badge Text", minLength: 1 }),
    }),
    defaultProps: {
      label: "LIVE",
    },
  }),
];
