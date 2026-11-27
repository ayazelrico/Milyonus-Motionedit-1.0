import React from "react";
import { useCurrentFrame } from "./context.js";
import { interpolate } from "./interpolate.js";

/** Single frame-indexed caption or subtitle cue. */
export type CaptionCue = {
  /** Inclusive start frame (relative to the enclosing `<Sequence>`). */
  from: number;
  /** Exclusive end frame (relative to the enclosing `<Sequence>`). */
  to: number;
  /** Caption text (may contain line breaks). */
  text: string;
  /** Optional speaker attribution label. */
  speaker?: string;
  /** Optional stable cue identifier. */
  id?: string;
};

/** Converts seconds to an integer frame count at `fps`. */
export const secondsToFrames = (seconds: number, fps: number): number => Math.round(seconds * fps);

/** Converts a frame index to seconds at `fps`. */
export const framesToSeconds = (frames: number, fps: number): number => frames / fps;

const parseTimestampSeconds = (raw: string): number => {
  const match = raw
    .trim()
    .match(/^(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) throw new Error(`Invalid subtitle timestamp: "${raw}"`);
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const ms = Number(match[4].padEnd(3, "0"));
  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
};

/**
 * Parses an SRT (or simple WebVTT) subtitle string into frame-indexed `CaptionCue[]` at `fps`.
 */
export const parseSrt = (srt: string, fps: number): CaptionCue[] => {
  if (fps <= 0) throw new Error("fps must be positive.");
  const normalized = srt.replace(/\r\n/g, "\n").replace(/^WEBVTT[^\n]*\n+/, "").trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const cues: CaptionCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trimEnd());
    const timingLineIdx = lines.findIndex((l) => l.includes("-->"));
    if (timingLineIdx === -1) continue;

    const timingLine = lines[timingLineIdx];
    const [startRaw, endWithSettings] = timingLine.split("-->");
    const endRaw = endWithSettings.trim().split(/\s+/)[0];
    const from = secondsToFrames(parseTimestampSeconds(startRaw), fps);
    const to = Math.max(from + 1, secondsToFrames(parseTimestampSeconds(endRaw), fps));
    const text = lines
      .slice(timingLineIdx + 1)
      .join("\n")
      .trim();

    if (text) {
      cues.push({
        id: timingLineIdx > 0 ? lines[0].trim() : String(cues.length + 1),
        from,
        to,
        text,
      });
    }
  }
  return cues;
};

/** Returns all cues active at `frame` (`cue.from <= frame && frame < cue.to`). */
export const getActiveCaptions = (cues: readonly CaptionCue[], frame: number): CaptionCue[] =>
  cues.filter((cue) => frame >= cue.from && frame < cue.to);

export type CaptionsProps = {
  /** Ordered or unordered list of frame-range caption cues. */
  cues: readonly CaptionCue[];
  /** Vertical placement on the stage. Defaults to `"bottom"`. */
  position?: "bottom" | "center" | "top";
  /** Optional fade-in/out duration in frames at each cue boundary. Defaults to `4`. */
  fadeFrames?: number;
  /** Container styles overriding the default caption overlay area. */
  style?: React.CSSProperties;
  /** Pill/text styles applied to each rendered cue. */
  cueStyle?: React.CSSProperties;
  /** Optional custom renderer for each active cue. */
  renderCue?: (cue: CaptionCue, index: number, opacity: number) => React.ReactNode;
};

/** Frame-pure caption overlay component driven by `CaptionCue` frame windows. */
export const Captions: React.FC<CaptionsProps> = ({
  cues,
  position = "bottom",
  fadeFrames = 4,
  style,
  cueStyle,
  renderCue,
}) => {
  const frame = useCurrentFrame();
  const active = getActiveCaptions(cues, frame);
  if (active.length === 0) return null;

  const alignItems =
    position === "top" ? "flex-start" : position === "center" ? "center" : "flex-end";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        justifyContent: "center",
        alignItems,
        padding: "48px 64px",
        boxSizing: "border-box",
        ...style,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center", maxWidth: "85%" }}>
        {active.map((cue, index) => {
          const cueDuration = cue.to - cue.from;
          const effFade = Math.max(0, Math.min(fadeFrames, Math.floor(cueDuration / 2)));
          let opacity = 1;
          if (effFade > 0) {
            const fadeInOp = interpolate(frame, [cue.from, cue.from + effFade], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const fadeOutOp = interpolate(frame, [cue.to - effFade, cue.to], [1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            opacity = Math.min(fadeInOp, fadeOutOp);
          }

          if (renderCue) {
            return <React.Fragment key={cue.id ?? `${cue.from}-${index}`}>{renderCue(cue, index, opacity)}</React.Fragment>;
          }

          return (
            <div
              key={cue.id ?? `${cue.from}-${index}`}
              style={{
                background: "rgba(7, 18, 51, 0.82)",
                color: "#ffffff",
                padding: "12px 24px",
                borderRadius: 10,
                fontFamily: "system-ui, -apple-system, sans-serif",
                fontSize: 34,
                fontWeight: 600,
                lineHeight: 1.35,
                textAlign: "center",
                whiteSpace: "pre-line",
                boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
                opacity,
                ...cueStyle,
              }}
            >
              {cue.speaker ? (
                <span style={{ color: "#35C6F4", marginRight: 10 }}>{cue.speaker}:</span>
              ) : null}
              {cue.text}
            </div>
          );
        })}
      </div>
    </div>
  );
};
