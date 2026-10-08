# Concepts

- **Frame**: integer time index. Seconds = frame / fps.
- **Composition**: a React component plus config (`width`, `height`, `fps`, `durationInFrames`).
- **Sequence**: places children in time (`from`, `durationInFrames`).
- **interpolate**: maps a number range to another, with clamping/extrapolation and easing.
- **spring**: physics-based 0→1 animation driven by the frame.
- **Deterministic rendering**: avoid time and randomness that is not frame-derived.
