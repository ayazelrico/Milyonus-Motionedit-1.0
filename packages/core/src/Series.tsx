import React from "react";
import { Sequence } from "./Sequence.js";
import { useFrameState } from "./context.js";

export type SeriesSequenceProps = {
  /** Positive integer duration in frames for this sequential segment. */
  durationInFrames: number;
  /** Optional relative frame shift (negative values overlap with the previous segment). Defaults to `0`. */
  offset?: number;
  /** Optional label displayed in `<Studio>` timelines. */
  name?: string;
  /** Wrapper layout mode forwarded to `<Sequence>`. Defaults to `"absolute-fill"`. */
  layout?: "absolute-fill" | "none";
  /** Optional inline style merged onto the `<Sequence>` container. */
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

/** Marker component used as a direct child of `<Series>` to declare a sequential scene. */
const SeriesSequence: React.FC<SeriesSequenceProps> = ({ children }) => <>{children}</>;
SeriesSequence.displayName = "Series.Sequence";

export type SeriesProps = {
  children?: React.ReactNode;
};

type SeriesComponent = React.FC<SeriesProps> & {
  Sequence: React.FC<SeriesSequenceProps>;
};

/**
 * Places `<Series.Sequence>` children back-to-back in time without manual cumulative `from` math.
 * Supports negative `offset` values for overlapping transitions.
 */
export const Series: SeriesComponent = Object.assign(
  (({ children }: SeriesProps) => {
    // Ensure hooks check runs even when Series has no children.
    useFrameState();

    let cursor = 0;
    const nodes = React.Children.toArray(children);

    return (
      <>
        {nodes.map((child, idx) => {
          if (!React.isValidElement<SeriesSequenceProps>(child)) {
            return child;
          }
          if (child.type !== SeriesSequence) {
            throw new Error("<Series> children must be <Series.Sequence> elements.");
          }
          const { durationInFrames, offset = 0, name, layout, style, children: seqChildren } = child.props;
          if (!Number.isFinite(durationInFrames) || durationInFrames <= 0) {
            throw new Error(`<Series.Sequence> requires a positive finite durationInFrames (got ${durationInFrames}).`);
          }
          const startFrom = cursor + offset;
          cursor = startFrom + durationInFrames;

          return (
            <Sequence
              key={child.key ?? idx}
              from={startFrom}
              durationInFrames={durationInFrames}
              name={name ?? `Series #${idx + 1}`}
              layout={layout}
              style={style}
            >
              {seqChildren}
            </Sequence>
          );
        })}
      </>
    );
  }) as React.FC<SeriesProps>,
  { Sequence: SeriesSequence }
);
