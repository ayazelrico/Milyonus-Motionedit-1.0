# Concepts

- **Frame**: Integer time index (`0 .. durationInFrames - 1`). Seconds are derived (`frame / fps`), never stored as primary state.
- **Composition**: A React component paired with `VideoConfig` (`width`, `height`, `fps`, `durationInFrames`) and optional `defaultProps`, declared directly or with `defineComposition`.
- **Sequence**: Scopes children in time (`from`, `durationInFrames`, `name`). Children read local frames starting at `0` via `useCurrentFrame()`, or root frames via `useAbsoluteFrame()`, and unmount outside their active window.
- **`interpolate`**: Piecewise-linear mapping between input and output keyframe arrays with optional cubic/custom `easing` and `"clamp" | "extend"` extrapolation.
- **`spring`**: Fixed-substep damped harmonic oscillator evaluated from frame `0` to `frame` so scrubbing and parallel rendering always agree.
- **`random` / `randomRange` / `randomInt`**: Seeded PRNG utilities replacing `Math.random()` inside compositions so particles, jitter, and layouts stay deterministic.
- **Transitions**: Pure `interpolate` helpers (`fadeIn`, `fadeOut`, `slideIn`, `scaleIn`, `wipeIn`) and the `<Transition>` wrapper for declarative scene entrances and exits.
- **Captions**: `<Captions>` and `parseSrt(srt, fps)` render subtitles from integer `[from, to)` frame windows rather than browser `<track>` timers.
- **Audio**: `<Audio>` synchronizes HTML5 audio during preview and exports exact sequence offsets, trims, playback rates, and volume curves for FFmpeg AAC muxing during render.
- **Studio**: `<Studio>` provides a browser workspace with a composition switcher, live prop controls + JSON editor, CLI command generator, and interactive sequence/audio timeline.
- **Deterministic Rendering**: Avoid `Date.now()`, unseeded `Math.random()`, CSS `@keyframes`/`transition`, and uncached network mutations inside compositions.
