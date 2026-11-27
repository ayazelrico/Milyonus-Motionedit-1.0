import React from "react";

export type AbsoluteFillProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Full-stage positioned flex container (`position: "absolute"`, `inset: 0`, `display: "flex"`, `flexDirection: "column"`).
 * Useful for stacking composition layers cleanly without repeating positioning styles.
 */
export const AbsoluteFill = React.forwardRef<HTMLDivElement, AbsoluteFillProps>(
  ({ style, children, ...rest }, ref) => (
    <div
      ref={ref}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
);

AbsoluteFill.displayName = "AbsoluteFill";
