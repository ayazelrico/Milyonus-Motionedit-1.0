<div align="center">

<img src="docs/assets/milyonus-wordmark-lg.png" alt="Milyonus" width="640" />

**Frame-based motion graphics by Milyonus.**

[Website](https://www.milyonus.com) · [Repository](https://github.com/ayazelrico/Milyonus-Motionedit-1.0)

</div>

---

# Milyonus Motionedit 1.0

**A video is a pure function of a frame. React is the language that function is written in.**

[![CI](https://github.com/ayazelrico/Milyonus-Motionedit-1.0/actions/workflows/ci.yml/badge.svg)](https://github.com/ayazelrico/Milyonus-Motionedit-1.0/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-1E4FD8.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-20%2B-35C6F4.svg)](package.json)
[![React](https://img.shields.io/badge/react-18-61DAFB.svg)](package.json)
[![Version](https://img.shields.io/badge/version-0.1.0-071233.svg)](package.json)

Milyonus Motionedit is an open-source motion-graphics runtime. You describe every pixel and audio cue of a film as a React component of the current frame, preview and inspect it in the browser Studio, and render it to H.264 MP4 or still images. There is no timeline project file, no proprietary format, and no hidden interpolation curve. The composition is the source of truth. The same frame, evaluated twice, produces the same picture.

> Motionedit is an independent project by [Milyonus](https://www.milyonus.com). Its architecture is *inspired by* the React-first, frame-pure model popularised by [Remotion](https://github.com/remotion-dev/remotion). It contains **no Remotion source**, shares no license with Remotion, and is released under plain [MIT](LICENSE).

---

## Contents

- [The thesis](#the-thesis)
- [Why write a video](#why-write-a-video)
- [What 1.0 ships](#what-10-ships)
- [Architecture](#architecture)
- [Repository map](#repository-map)
- [Requirements](#requirements)
- [Get started](#get-started)
- [Anatomy of a composition](#anatomy-of-a-composition)
- [Time, frames, and sequences](#time-frames-and-sequences)
- [Motion primitives & seeded randomness](#motion-primitives--seeded-randomness)
- [Transitions, captions, and audio](#transitions-captions-and-audio)
- [Player and Studio](#player-and-studio)
- [The render contract](#the-render-contract)
- [CLI & programmatic reference](#cli--programmatic-reference)
- [Parallel, chunked, and cloud rendering](#parallel-chunked-and-cloud-rendering)
- [Determinism](#determinism)
- [Design rules](#design-rules)
- [Contributing](#contributing)
- [License and attribution](#license-and-attribution)

---

## The thesis

Traditional motion software stores a film as a document: layers, keyframes, easing handles, a binary or XML project that only one application can open. That model is excellent for a single artist at a single desk. It is a poor model for software.

Motionedit takes the opposite position:

```text
frame  →  React tree  →  pixels + audio slice
```

A composition is a function. Its only clock is an integer. Width, height, frame rate, and duration are configuration, not accidents of a preview window. Sequences are scopes that shift that integer. Springs, interpolations, transitions, and seeded random values are pure calculations over it. The preview player, the Studio, and the headless renderer are drivers of the same function.

---

## Why write a video

- **Version control.** A title change is a diff. A timing change is a diff.
- **Parameterization.** Pass `--props data.json` or inline JSON to render a hundred localized variants from a single component.
- **Reuse.** Lower thirds, captions, progress bars, and intro cards are ordinary React components.
- **Determinism.** Frame 60 on your laptop and frame 60 on a parallel cloud worker are identical.
- **The stack you already have.** TypeScript, Vite, React 18, npm workspaces.

---

## What 1.0 ships

| Surface | Package | What it provides |
|---|---|---|
| Core runtime | `@milyonus/core` | `FrameContext`, `Sequence`, `interpolate`, `spring`, `random`, `Transition`, `Captions`, `Audio`, `defineComposition` (zero runtime dependencies) |
| Embeddable preview | `@milyonus/player` | `<Player>` with play/pause, frame-stepping, mute toggle, timecode, and scrubber |
| Interactive workspace | `@milyonus/player` | `<Studio>` with composition switcher, live prop controls + JSON editor, CLI command generator, and sequence/audio timeline |
| Capture driver | `@milyonus/player` | `<FrameRenderer>` exposing `window.milyonusSetFrame`, prop injection, composition discovery, and audio/sequence inspection |
| Renderer & Worker CLI | `@milyonus/cli` | `milyonus render` (parallel tabs, audio muxing, `--serve`, `--props`), `still`, `compositions`, `stitch`, and `worker` (batch + HTTP queue) |
| Example | `examples/hello-world` | Multi-composition Vite workspace (`hello` 1280×720 + `launch-card` 1080×1080) |

---

## Architecture

```text
┌───────────────────────────────────────────────────────────┐
│  Composition(s)                                           │
│  React 18 components reading frame + props                │
└───────────────────────────┬───────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────┐
│  @milyonus/core  (dependency-free; React peer only)       │
│  FrameContext · Sequence · interpolate · spring · random  │
│  Transition · Captions · Audio · defineComposition        │
└──────────┬───────────────────────┬────────────────────────┘
           │                       │
┌──────────▼──────────┐  ┌─────────▼───────────┐
│  Player & Studio    │  │  FrameRenderer      │
│  rAF preview        │  │  #milyonus-stage    │
│  Timeline + Props   │  │  window.milyonus*   │
└─────────────────────┘  └─────────┬───────────┘
                                   │
                         ┌─────────▼───────────┐
                         │  @milyonus/cli      │
                         │  Parallel Chromium  │
                         │  FFmpeg H.264 + AAC │
                         │  Still · Stitch ·   │
                         │  Queue Worker       │
                         └─────────────────────┘
```

See [DESIGN.md](DESIGN.md), [docs/architecture.md](docs/architecture.md), [docs/concepts.md](docs/concepts.md), and [docs/cloud-rendering.md](docs/cloud-rendering.md).

---

## Repository map

```text
Milyonus-Motionedit-1.0
├── packages/core          @milyonus/core
├── packages/player        @milyonus/player  (Player, Studio, FrameRenderer, Stage)
├── packages/cli           @milyonus/cli     (bin: milyonus + Node API)
├── examples/hello-world   Multi-composition Studio, Player, and Render target
├── docs                   concepts, architecture, and cloud rendering guides
├── .github/workflows      CI: npm ci, build, typecheck, unit + E2E tests
├── DESIGN.md
├── CONTRIBUTING.md
└── LICENSE                MIT
```

---

## Requirements

- Node.js 20 or newer
- npm 10+ (workspaces)
- FFmpeg on `PATH` for MP4 video/audio output (`ffmpeg -version`)
- Chromium or Google Chrome (managed by Puppeteer or system binary)

---

## Get started

```bash
git clone https://github.com/ayazelrico/Milyonus-Motionedit-1.0.git
cd Milyonus-Motionedit-1.0
npm install
npm run build
npm run dev
```

Open the Vite server URL (`http://localhost:5173`) to launch `<Studio>` (or append `?player=1` for the minimal `<Player>`).

Render directly from the CLI—either against a running server (`--url`) or by letting the CLI start and stop Vite automatically (`--serve`):

```bash
npm run render
npm run still
```

Root scripts:

| Script | Effect |
|---|---|
| `npm run build` | Compiles `@milyonus/core`, `@milyonus/player`, `@milyonus/cli`, and `hello-world` |
| `npm run dev` | Starts the `hello-world` Studio/preview server |
| `npm run render` | Renders `hello` to `examples/hello-world/out/hello.mp4` (`--concurrency 2`) |
| `npm run still` | Captures frame 45 to `examples/hello-world/out/hello.png` |
| `npm run typecheck` | Runs `tsc --noEmit` across all packages and examples |
| `npm test` | Runs unit, SSR, and headless Chrome + FFmpeg E2E tests |

---

## Anatomy of a composition

Declare one or multiple compositions with `defineComposition`:

```tsx
import {
  Sequence,
  Transition,
  Captions,
  Audio,
  defineComposition,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "@milyonus/core";

export const Hello = ({ title = "Milyonus" }: { title?: string }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 12 } });
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  return (
    <div style={{ flex: 1, display: "flex", background: "#0b132b", position: "relative" }}>
      <Sequence name="Hero" from={0}>
        <Transition enter="fade" enterDuration={12}>
          <h1 style={{ margin: "auto", fontSize: 132, color: "#fff", opacity, transform: `scale(${scale})` }}>
            {title}
          </h1>
        </Transition>
      </Sequence>
      <Captions cues={[{ from: 5, to: 85, text: "Frame in. Pixels out." }]} />
    </div>
  );
};

export const helloComposition = defineComposition({
  id: "hello",
  component: Hello,
  width: 1280,
  height: 720,
  fps: 30,
  durationInFrames: 90,
  defaultProps: { title: "Milyonus" },
});
```

---

## Time, frames, and sequences

- `useCurrentFrame()` returns the integer frame relative to the nearest `<Sequence>`.
- `useAbsoluteFrame()` returns the integer frame from root frame `0`.
- `useVideoConfig()` returns `{ width, height, fps, durationInFrames }`.
- `<Sequence from={30} durationInFrames={60} name="Bar">` unmounts children outside `[30, 90)` and shifts local `frame` to `0`. Pass `layout="none"` to omit the default absolute-fill wrapper.

---

## Motion primitives & seeded randomness

### `interpolate`

```ts
const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
const width = interpolate(frame, [0, 60], [0, stageWidth], {
  easing: Easings.easeOut,
  extrapolateRight: "clamp",
});
```

Built-in easings: `Easings.linear`, `Easings.easeIn`, `Easings.easeOut`, `Easings.easeInOut`, or any `(t: number) => number`.

### `spring`

```ts
const scale = spring({ frame, fps, from: 0, to: 1, config: { stiffness: 100, damping: 12, mass: 1 } });
```

Integrated with 8 fixed sub-steps per frame so scrubbing and parallel chunk rendering are always identical.

### `random`, `randomRange`, `randomInt`, `createRandom`

Never call `Math.random()` in a composition. Use deterministic seeded helpers:

```ts
const x = randomRange(`star-x-${index}`, 0, width);
const count = randomInt("burst-count", 4, 12);
const u = random(frame);
```

---

## Transitions, captions, and audio

### Transitions

Pure `interpolate`-driven style functions (`fadeIn`, `fadeOut`, `fadeInOut`, `slideIn`, `slideOut`, `scaleIn`, `wipeIn`) plus `<Transition>`:

```tsx
<Sequence name="Card" from={20} durationInFrames={50}>
  <Transition enter="slide-up" exit="fade" enterDuration={12} exitDuration={10}>
    <Card />
  </Transition>
</Sequence>
```

### Captions

Frame-range subtitles with optional SRT/WebVTT parsing (`parseSrt(srtText, fps)`):

```tsx
const cues = parseSrt(srtString, 30);
<Captions cues={cues} position="bottom" fadeFrames={4} />
```

### Audio

`<Audio>` syncs an HTML5 `<audio>` element during preview and exports sequence-sliced track metadata (`startFrame`, `durationInFrames`, `trimBefore`, `trimAfter`, `playbackRate`, `loop`, and scalar or `(frame) => number` volume curves) for FFmpeg AAC muxing during render:

```tsx
<Sequence name="Voiceover" from={15} durationInFrames={75}>
  <Audio src="/audio/narration.wav" trimBefore={0} volume={(f) => interpolate(f, [0, 10], [0, 1], { extrapolateRight: "clamp" })} />
</Sequence>
```

---

## Player and Studio

- **`<Player>`**: Lightweight embeddable preview with play/pause, `-1`/`+1` frame stepping, scrubber, mute toggle, and timecode readout.
- **`<Studio>`**: Full browser workspace featuring a composition list, responsive stage, keyboard shortcuts (`Space`, `ArrowLeft`, `ArrowRight`), live prop form + JSON editor, one-click CLI command copy, and an interactive sequence/audio timeline.

---

## The render contract

`<FrameRenderer>` mounts `#milyonus-stage` at 1:1 composition resolution with zero page margin, awaits `document.fonts.ready` + two animation frames per update, and exposes:

- `window.milyonusReady = true`
- `window.milyonusSetFrame(n)`
- `window.milyonusSetInputProps(props)`
- `window.milyonusGetConfig()` / `window.milyonusListCompositions()` / `window.milyonusSelectComposition(id)`
- `window.milyonusGetAudioTracks()` / `window.milyonusGetSequences()`

---

## CLI & programmatic reference

Binary: `milyonus` (`@milyonus/cli`). Width, height, fps, and duration are automatically discovered from the composition unless overridden.

```bash
# Render MP4 (auto-starting Vite with 4 parallel tabs and JSON props)
milyonus render \
  --serve examples/hello-world \
  --composition hello \
  --props data.json \
  --concurrency 4 \
  --out out/hello.mp4

# Capture a single PNG/JPEG/WebP still frame (no FFmpeg required)
milyonus still \
  --serve examples/hello-world \
  --composition launch-card \
  --frame 30 \
  --out out/card.png

# List compositions exposed by a project
milyonus compositions --serve examples/hello-world

# Stitch distributed MP4 chunks losslessly
milyonus stitch --chunks part0.mp4,part1.mp4 --out out/full.mp4

# Run batch job queue or HTTP render worker
milyonus worker --queue jobs.json
milyonus worker --port 4321
```

Programmatic Node API from `@milyonus/cli`:

```ts
import { renderMedia, renderStill, listCompositions, stitchMediaChunks, startWorkerServer } from "@milyonus/cli";
```

---

## Parallel, chunked, and cloud rendering

- **Single-machine parallelism**: `--concurrency <n>` partitions frames across `n` headless Chromium pages and encodes in one pass.
- **Multi-worker chunking**: `--from-frame` and `--to-frame` render exact slices on separate machines; `milyonus stitch` concatenates them with `ffmpeg -f concat -c copy`.
- **Queue worker**: `milyonus worker` provides both batch JSON execution and an HTTP job queue (`POST /jobs`, `GET /jobs/:id`, `GET /health`). Full Docker and distributed recipes live in [docs/cloud-rendering.md](docs/cloud-rendering.md).

---

## Determinism

Allowed inside compositions: `useCurrentFrame()`, `useAbsoluteFrame()`, `useVideoConfig()`, `interpolate`, `spring`, `random` / `randomRange` / `randomInt`, and props.

Avoid inside compositions: `Date.now()`, `performance.now()`, unseeded `Math.random()`, CSS `@keyframes` / `transition`, and uncached network mutations.

---

## Design rules

1. **Same frame in, same pixels out.** Functions with memory (like `spring`) recompute deterministically from frame `0` to `n`.
2. **Time is an integer.** Easing lives inside value mappings, never on an external wall clock.
3. **Sequences own local time.** Children read zero-based local frames without manual offset math.
4. **Preview scale is a CSS transform, never a reflow.** Layout always runs at `width` × `height`.
5. **`@milyonus/core` stays dependency-free.** Drivers live in `@milyonus/player` and `@milyonus/cli`.

---

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

```bash
npm ci
npm run build
npm run typecheck
npm test
```

Agent notes live in [AGENTS.md](AGENTS.md).

---

## License and attribution

[MIT](LICENSE). Copyright (c) 2026 Milyonus contributors.

Remotion is an inspiration for the idea that a video can be a React function of a frame, and for the shape of a monorepo that separates core, player, and renderer. Remotion is a separate project, under its own license, by its own authors. Motionedit does not include Remotion code. Do not describe a Motionedit render as a Remotion render.

---

**Frame in. Pixels out. The film is the function.**

Ayaz Elrico · Milyonus
[github.com/ayazelrico/Milyonus-Motionedit-1.0](https://github.com/ayazelrico/Milyonus-Motionedit-1.0)
