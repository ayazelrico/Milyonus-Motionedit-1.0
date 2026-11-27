# Design

**Principle:** a video is a pure function of an integer frame number. Same frame in, same pixels and audio slice out.

1. **`@milyonus/core`** (dependency-free, React 18 only) publishes `FrameContext` (`frame`, `absoluteFrame`, `fps`, `width`, `height`, `durationInFrames`), `<Sequence>`, motion primitives (`interpolate`, `spring`, `random`, `Transition`), frame-range `<Captions>`, `<Audio>`, and `defineComposition`.
2. **`<Sequence>`** shifts `frame` so children see local time starting at `0`, tracks `absoluteFrame` for nested scopes, unmounts children outside `[from, from + durationInFrames)`, and reports timeline spans to optional inspectors.
3. **`@milyonus/player`** mounts compositions on a fixed-resolution `<Stage>` driven by `requestAnimationFrame` (`<Player>` and `<Studio>`) or imperatively via `window.milyonusSetFrame(n)` (`<FrameRenderer>`).
4. **`@milyonus/cli`** drives one or more parallel headless Chromium tabs (`--concurrency`), captures `#milyonus-stage` frames (`render` / `still`), slices and mixes `<Audio>` tracks through FFmpeg `-filter_complex`, stitches distributed chunks (`stitch`), and exposes batch/HTTP render workers (`worker`).
