# Concepts

- **Frame**: Integer time index (`0 .. durationInFrames - 1`). Seconds are derived (`frame / fps`), never stored as primary state.
- **Composition**: A React component paired with `VideoConfig` (`width`, `height`, `fps`, `durationInFrames`) and optional `defaultProps`, declared directly or with `defineComposition`.
- **`<AbsoluteFill>`**: Full-stage flex container (`position: "absolute"`, `inset: 0`) for clean layer stacking.
- **`<Sequence>` / `<Series>` / `<Loop>` / `<Freeze>`**:
  - `<Sequence>` scopes children to `[from, from + durationInFrames)` with zero-based local frames.
  - `<Series>` & `<Series.Sequence>` stack scenes sequentially (with optional `offset` overlaps) without manual cumulative math.
  - `<Loop>` repeats a cyclic animation every `durationInFrames` frames.
  - `<Freeze>` holds `useCurrentFrame()` at a fixed integer frame for hold-shots and callouts.
- **`interpolate` & `Easings.bezier`**: Piecewise-linear keyframe mapping with quadratic, cubic, exponential, overshoot, and arbitrary `cubic-bezier(x1, y1, x2, y2)` curves.
- **`interpolateColors`**: Smoothly interpolates `#hex`, `rgb/rgba`, and `hsl/hsla` stops into deterministic `rgba(...)` strings.
- **`spring`**: Fixed-substep damped harmonic oscillator evaluated from frame `0` to `frame` so scrubbing and parallel rendering always agree.
- **`random` / `randomRange` / `randomInt`**: Seeded PRNG utilities replacing `Math.random()` inside compositions.
- **Transitions**: Pure `interpolate` helpers (`fadeIn`, `fadeOut`, `slideIn`, `scaleIn`, `wipeIn`) and `<Transition>`.
- **Captions**: `<Captions>` and `parseSrt(srt, fps)` render subtitles from integer `[from, to)` frame windows.
- **Media & Async Gates (`<Audio>`, `<Img>`, `<Video>`, `delayRender`)**:
  - `<Audio>` and `<Video>` synchronize playback in preview and export exact sequence offsets, trims, rates, and volume curves for FFmpeg muxing.
  - `<Img>`, `<Video>`, and `delayRender` / `continueRender` hold `<FrameRenderer>` until frame-critical assets finish decoding or seeking.
- **Studio & Multi-Codec CLI**: `<Studio>` provides an interactive browser workspace, while `milyonus` exports H.264 MP4, alpha-transparent VP9 WebM, Apple ProRes MOV, animated GIF, and PNG/JPEG/WebP stills.
