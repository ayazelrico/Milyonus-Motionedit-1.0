import React from "react";
import {
  AbsoluteFill,
  Captions,
  Easings,
  Freeze,
  Loop,
  Series,
  Transition,
  defineComposition,
  interpolate,
  interpolateColors,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "@milyonus/core";

export type QuarterMetric = {
  label: string;
  value: number;
};

export type KpiExplainerProps = {
  company?: string;
  headline?: string;
  unit?: string;
  quarters?: QuarterMetric[];
};

const DEFAULT_QUARTERS: QuarterMetric[] = [
  { label: "Q1", value: 42 },
  { label: "Q2", value: 68 },
  { label: "Q3", value: 94 },
  { label: "Q4", value: 136 },
];

const PulseRing: React.FC = () => {
  const frame = useCurrentFrame();
  const radius = interpolate(frame, [0, 29], [180, 520], { easing: Easings.quadOut });
  const opacity = interpolate(frame, [0, 29], [0.35, 0], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div
        style={{
          width: radius * 2,
          height: radius * 2,
          borderRadius: "50%",
          border: "3px solid #35C6F4",
          opacity,
        }}
      />
    </AbsoluteFill>
  );
};

const IntroSlide: React.FC<{ company: string; headline: string }> = ({ company, headline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { stiffness: 120, damping: 14 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 20 }}>
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: 28,
          letterSpacing: 3,
          textTransform: "uppercase",
          color: "#35C6F4",
        }}
      >
        {company}
      </span>
      <h1
        style={{
          fontFamily: "system-ui, sans-serif",
          fontSize: 96,
          margin: 0,
          color: "#ffffff",
          transform: `scale(${pop})`,
          textAlign: "center",
        }}
      >
        {headline}
      </h1>
    </AbsoluteFill>
  );
};

const ChartSlide: React.FC<{ quarters: QuarterMetric[]; unit: string }> = ({ quarters, unit }) => {
  const frame = useCurrentFrame();
  const maxVal = Math.max(1, ...quarters.map((q) => q.value));
  const snappyCurve = Easings.bezier(0.16, 1, 0.3, 1);

  return (
    <AbsoluteFill style={{ padding: "96px 140px", justifyContent: "space-between" }}>
      <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 44, fontWeight: 700, color: "#f8fafc" }}>
        Quarterly Throughput ({unit})
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 48, height: 560, paddingBottom: 40 }}>
        {quarters.map((q, idx) => {
          const delay = idx * 6;
          const progress = interpolate(frame - delay, [0, 28], [0, 1], {
            easing: snappyCurve,
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const barHeight = Math.round((q.value / maxVal) * 440 * progress);
          const barColor = interpolateColors(progress, [0, 1], ["#1e4fd8", "#35c6f4"]);
          const shownNumber = Math.round(q.value * progress);

          return (
            <div
              key={q.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
              }}
            >
              <span
                style={{
                  fontFamily: "system-ui, sans-serif",
                  fontSize: 36,
                  fontWeight: 700,
                  color: "#ffffff",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {shownNumber}
                {unit}
              </span>
              <div
                style={{
                  width: "100%",
                  height: Math.max(8, barHeight),
                  background: barColor,
                  borderRadius: "14px 14px 4px 4px",
                  boxShadow: "0 12px 32px rgba(53, 198, 244, 0.25)",
                }}
              />
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 28, color: "#94a3b8" }}>
                {q.label}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const KpiExplainer: React.FC<KpiExplainerProps> = ({
  company = "Milyonus Analytics",
  headline = "2026 Growth Report",
  unit = "M",
  quarters = DEFAULT_QUARTERS,
}) => {
  const frame = useCurrentFrame();
  const bg = interpolateColors(frame, [0, 60, 120], ["#071233", "#0b1a42", "#09142e"]);

  return (
    <AbsoluteFill style={{ background: bg }}>
      <Loop durationInFrames={30}>
        <PulseRing />
      </Loop>

      <Series>
        <Series.Sequence name="Intro Card" durationInFrames={45}>
          <Transition enter="fade" exit="fade" enterDuration={10} exitDuration={10}>
            <IntroSlide company={company} headline={headline} />
          </Transition>
        </Series.Sequence>

        <Series.Sequence name="KPI Bar Chart" durationInFrames={75} offset={-5}>
          <Transition enter="slide-up" enterDuration={14}>
            <Freeze frame={45} active={(localFrame) => localFrame >= 55}>
              <ChartSlide quarters={quarters} unit={unit} />
            </Freeze>
          </Transition>
        </Series.Sequence>
      </Series>

      <Captions
        cues={[
          { from: 4, to: 38, text: "Declarative data films powered by React 18." },
          { from: 44, to: 116, text: "Animated with cubic-bezier curves and color interpolation." },
        ]}
      />
    </AbsoluteFill>
  );
};

export const compositions = [
  defineComposition({
    id: "kpi-explainer",
    component: KpiExplainer,
    width: 1920,
    height: 1080,
    fps: 30,
    durationInFrames: 115,
    description: "1080p data-driven KPI bar chart film using Series, Loop, Freeze, bezier, and interpolateColors.",
    defaultProps: {
      company: "Milyonus Analytics",
      headline: "2026 Growth Report",
      unit: "M",
      quarters: DEFAULT_QUARTERS,
    },
  }),
];
