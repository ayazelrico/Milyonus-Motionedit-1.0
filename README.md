# Milyonus Motionedit 1.0

**A video is a pure function of a frame. React is the language that function is written in.**

[![CI](https://github.com/ayazelrico/Milyonus-Motionedit-1.0/actions/workflows/ci.yml/badge.svg)](https://github.com/ayazelrico/Milyonus-Motionedit-1.0/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-1E4FD8.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-20%2B-35C6F4.svg)](package.json)
[![React](https://img.shields.io/badge/react-18-61DAFB.svg)](package.json)
[![Version](https://img.shields.io/badge/version-0.1.0-071233.svg)](package.json)

Milyonus Motionedit is an open-source motion-graphics runtime. You describe every pixel of a film as a React component of the current frame, preview it in the browser, and render it to MP4. There is no timeline file, no proprietary project format, and no hidden interpolation curve. The composition is the source of truth. The same frame, evaluated twice, produces the same picture.

> Motionedit is an independent project by [Milyonus](https://www.milyonus.com). Its architecture is *inspired by* the React-first, frame-pure model popularised by [Remotion](https://github.com/remotion-dev/remotion). It contains **no Remotion source**, shares no license with Remotion, and is released under plain [MIT](LICENSE).

---

## Contents

- [The thesis](#the-thesis)
- [Why write a video](#why-write-a-video)
- [What 1.0 actually is](#what-10-actually-is)
- [Architecture](#architecture)
- [Repository map](#repository-map)
- [Requirements](#requirements)
- [Get started](#get-started)
- [Anatomy of a composition](#anatomy-of-a-composition)
- [Time, frames, and sequences](#time-frames-and-sequences)
- [Motion primitives](#motion-primitives)
- [The player](#the-player)
- [The render contract](#the-render-contract)
- [CLI reference](#cli-reference)
- [Determinism](#determinism)
- [Parameterized films](#parameterized-films)
- [Design rules](#design-rules)
- [What is deliberately missing](#what-is-deliberately-missing)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License and attribution](#license-and-attribution)

---

## The thesis

Traditional motion software stores a film as a document: layers, keyframes, easing handles, a binary or XML project that only one application can open. That model is excellent for a single artist at a single desk. It is a poor model for software.

Motionedit takes the opposite position, the one Remotion made legible to a generation of frontend engineers:

```text
frame  →  React tree  →  pixels
```

A composition is a function. Its only clock is an integer. Width, height, frame rate, and duration are configuration, not accidents of a preview window. Sequences are scopes that shift that integer. Springs and interpolations are pure calculations over it. The preview player and the renderer are two drivers of the same function: one advances time with `requestAnimationFrame`, the other sets the frame explicitly, waits for React to commit, and photographs the stage.

If you can render frame 41 in isolation, you can render a film. If you cannot, you do not have a film. You have a slideshow that happens to be playing.

---

## Why write a video

A timeline is a closed artifact. A React composition is a program, and programs compose.

- **Version control.** A title change is a diff. A timing change is a diff. There is no "which export is the real one."
- **Parameterization.** The same component can render a hundred variants. Pass `inputProps`. Change the name, the color, the claim. The motion stays.
- **Reuse.** A lower third, a progress bar, an intro card: they are components. They accept props. They live in a folder.
- **Determinism.** Frame 60 on your laptop and frame 60 in CI are the same frame, provided you do not cheat with wall-clock time or unseeded randomness.
- **The stack you already have.** TypeScript, Vite, React 18, npm workspaces. No new IDE. No plugin host.

Motionedit is for product films, launch cards, data-driven explainers, social cuts, and any motion that should live next to the application that produced the data. It is not a replacement for a finishing suite, a color grade, or a multi-track editorial timeline. It is the layer where motion becomes code.

---

## What 1.0 actually is

The repository is named Motionedit 1.0 because the *contract* is stable enough to build on: frame context, sequences, interpolate, spring, an embeddable player, and a headless renderer. The published package version is `0.1.0`. That distinction is intentional.

Shipped today:

| Surface | Package | What it does |
|---|---|---|
| Core runtime | `@milyonus/core` | Frame context, `Sequence`, `interpolate`, `spring` |
| Preview | `@milyonus/player` | `<Player>` with play, pause, and scrub |
| Still capture | `@milyonus/player` | `<FrameRenderer>` exposing `window.milyonusSetFrame` |
| Encoder | `@milyonus/cli` | Headless Chromium screenshots, FFmpeg to H.264 |
| Example | `examples/hello-world` | A 90-frame, 1280×720, 30 fps composition |

Not shipped, and not pretended: audio, captions, a transition pack, parallel frame rendering, a studio timeline, cloud render workers. Those belong on the roadmap, not in the feature list.

---

## Architecture

Four layers. Each one is boring on purpose.

```text
┌───────────────────────────────────────────────────────────┐
│  Composition                                              │
│  React component. Reads frame. Returns elements.          │
└───────────────────────────┬──────────────────────────────┘
                             │
┌───────────────────────────▼──────────────────────────────┐
│  @milyonus/core                                           │
│  FrameContext · Sequence · interpolate · spring           │
└───────────────────────────┬──────────────────────────────┘
                             │
          ┌─────────────────┴─────────────────┐
          │                                     │
┌─────────▼──────────┐               ┌──────────▼───────────┐
│  Player            │               │  FrameRenderer      │
│  rAF clock         │               │  imperative clock   │
│  scrubber          │               │  #milyonus-stage    │
└───────────────────┘               └──────────┬──────────┘
                                                │
                                     ┌──────────▼───────────┐
                                     │  @milyonus/cli      │
                                     │  Puppeteer → PNG    │
                                     │  FFmpeg → MP4       │
                                     └─────────────────────┘
```

1. `@milyonus/core` publishes a `FrameContext`: `frame`, `width`, `height`, `fps`, `durationInFrames`. Hooks refuse to run outside it.
2. `<Sequence>` subtracts `from` from the parent frame, remounts children in a fresh context, and returns `null` outside `[from, from + durationInFrames)`.
3. `@milyonus/player` mounts the composition inside a sized stage. Preview scales with CSS. Render mode does not.
4. `@milyonus/cli` opens the render URL, waits until `window.milyonusReady === true`, calls `window.milyonusSetFrame(n)` for each frame, screenshots `#milyonus-stage`, then encodes with `libx264` and `yuv420p`.

The full design note is in [DESIGN.md](DESIGN.md). The short concept list is in [docs/concepts.md](docs/concepts.md).

---

## Repository map

```text
Milyonus-Motionedit-1.0
├── packages/core          @milyonus/core
├── packages/player        @milyonus/player
├── packages/cli           @milyonus/cli   bin: milyonus
├── examples/hello-world   Vite preview and render target
├── docs                   concepts and architecture
├── .github/workflows      CI: install, build, typecheck, test
├── DESIGN.md
├── CONTRIBUTING.md
└── LICENSE                MIT
```

Workspaces are declared at the root. Build order is core, then player, then cli.

---

## Requirements

- Node.js 20 or newer
- npm 10 (workspaces)
- FFmpeg on `PATH` for MP4 output (`ffmpeg -version` must succeed)
- A local Chromium, downloaded by Puppeteer on first render

No GPU is required. The renderer photographs the DOM, it does not composite in WebGL.

---

## Get started

```bash
git clone https://github.com/ayazelrico/Milyonus-Motionedit-1.0.git
cd Milyonus-Motionedit-1.0
npm install
npm run build
npm run dev
```

The example preview is served by Vite at [http://localhost:5173](http://localhost:5173). You get a player: play, pause, and a scrubber over 90 frames.

In a second terminal, with the dev server still running:

```bash
npm run render -w hello-world
```

That writes `examples/hello-world/out/hello.mp4`.

The render script is explicit about every parameter:

```bash
milyonus render \
  --url http://localhost:5173/?render=1 \
  --out out/hello.mp4 \
  --width 1280 \
  --height 720 \
  --fps 30 \
  --frames 90
```

`?render=1` is the switch in `examples/hello-world/src/main.tsx`. Without it, the page mounts `<Player>`. With it, the page mounts `<FrameRenderer>` and exposes the capture contract.

Useful root scripts:

| Script | Effect |
|---|---|
| `npm run build` | Compiles core, player, and cli |
| `npm run dev` | Starts the hello-world preview |
| `npm run render` | Renders hello-world to MP4 |
| `npm run typecheck` | `tsc --noEmit` across the three packages |
| `npm test` | Core unit tests |

---

## Anatomy of a composition

A composition is a component plus a config. The config in the example is the contract the renderer must be told about separately, because the CLI does not yet parse your source:

```tsx
export const helloConfig = {
  width: 1280,
  height: 720,
  fps: 30,
  durationInFrames: 90,
};
```

Seconds are derived, never stored: `durationInFrames / fps` is 3. Frame 0 is the first picture. Frame 89 is the last.

The example composition, reduced to the idea:

```tsx
import { Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Easings } from "@milyonus/core";

const Title = ({ text }: { text: string }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 12 } });
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <h1 style={{ fontSize: 140, margin: 0, color: "#fff", opacity, transform: `scale(${scale})` }}>
        {text}
      </h1>
    </div>
  );
};

export const Hello = ({ title = "Milyonus" }: { title?: string }) => (
  <div style={{ flex: 1, position: "relative", display: "flex", background: "linear-gradient(135deg,#0b132b,#3a506b)" }}>
    <Sequence from={0}>
      <Title text={title} />
    </Sequence>
    <Sequence from={30} durationInFrames={60}>
      <Bar />
    </Sequence>
  </div>
);
```

Preview and render share that component. `main.tsx` only chooses the driver:

```tsx
const isRender = new URLSearchParams(location.search).has("render");

isRender
  ? <FrameRenderer component={Hello} {...helloConfig} />
  : <Player component={Hello} {...helloConfig} previewWidth={800} />;
```

---

## Time, frames, and sequences

`useCurrentFrame()` returns the frame relative to the nearest `<Sequence>`, not the absolute frame of the film. That is the entire point of a sequence. A title that springs in over 20 frames should spring in over 20 frames whether it starts at 0 or at 240.

```tsx
<Sequence from={30} durationInFrames={60}>
  <Bar />
</Sequence>
```

- `from` defaults to `0`. It is relative to the parent context.
- `durationInFrames` defaults to `Infinity`, which means "until the parent ends."
- Outside the window, children unmount. They do not render at opacity 0. They are absent.
- Inside the window, children see `frame` starting at 0.
- Nested sequences add up. A sequence at `from={10}` inside a sequence at `from={30}` begins at absolute frame 40.

`<Sequence>` must sit under `<Player>` or `<FrameRenderer>`. Both inject `FrameContext`. Using the hooks outside that tree throws.

`useVideoConfig()` returns the composition config, not the sequence window: `width`, `height`, `fps`, `durationInFrames`. Use it for layout that must know the stage, and for springs that must know the frame rate.

---

## Motion primitives

### interpolate

Piecewise linear map from an input range to an output range. Ranges must be the same length. `inputRange` must be strictly increasing. Fewer than two stops is an error.

```ts
interpolate(
  input,
  inputRange,
  outputRange,
  {
    easing = Easings.linear,
    extrapolateLeft = "extend",
    extrapolateRight = "extend",
  }
)
```

Easing is applied only while the local `t` is inside `[0, 1]`. Outside a segment, the value extends or clamps.

```ts
const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
const width = interpolate(frame, [0, 60], [0, stageWidth], {
  easing: Easings.easeOut,
  extrapolateRight: "clamp",
});
```

Built-in easings:

| Name | Curve |
|---|---|
| `Easings.linear` | `t` |
| `Easings.easeIn` | cubic in, `t³` |
| `Easings.easeOut` | cubic out |
| `Easings.easeInOut` | cubic in-out |

Bring your own easing. The type is `(t: number) => number`.

Default extrapolation is `extend`, not `clamp`. If you do not want a value to run past the last keyframe, say so. This is the sharp edge. It is also the honest one.

### spring

A deterministic damped spring, integrated with fixed substeps so frame `n` does not depend on how you arrived there.

```ts
spring({
  frame,
  fps,
  from = 0,
  to = 1,
  config = {},
})
```

Defaults: `stiffness: 100`, `damping: 10`, `mass: 1`. The integrator takes 8 substeps per frame. `frame <= 0` returns `from`. The simulation always eases a normalized mass-spring from 0 toward 1, then maps that into `[from, to]`.

```ts
const scale = spring({ frame, fps, config: { damping: 12 } });
```

Do not drive a spring from `Date.now()`. Drive it from the frame. That is what makes a scrubber and a renderer agree.

---

## The player

`<Player>` is an embeddable preview, not a video tag.

| Prop | Meaning |
|---|---|
| `component` | The composition |
| `inputProps` | Props forwarded to the composition |
| `width`, `height`, `fps`, `durationInFrames` | The film |
| `previewWidth` | CSS width of the preview. Default `640`. Height follows aspect ratio. |
| `loop` | Default `true` |
| `autoPlay` | Default `true` |

The stage is rendered at full composition resolution and scaled with `transform: scale(...)` from the top left, so a 1280×720 film previewed at 800 CSS pixels is still laid out as 1280×720. Text does not reflow between preview and render.

Scrubbing pauses playback. The clock is `performance.now()` mapped through `fps`, then floored to an integer frame. The composition itself never sees that clock.

---

## The render contract

`<FrameRenderer>` is the page the CLI knows how to drive.

On mount it sets:

- `window.milyonusSetFrame(n)` — a function that sets the frame and resolves after two animation frames, so React has committed and the browser has painted
- `window.milyonusReady = true`

The stage element is `#milyonus-stage`, sized to `width` × `height` with no preview scale. The CLI screenshots that node, not the viewport. Device scale factor is 1.

If you build your own entry, keep those two names and that id. The CLI will not guess.

---

## CLI reference

Binary: `milyonus`, provided by `@milyonus/cli`.

```text
milyonus render \
  --url    <render-page-url>     default http://localhost:5173/?render=1
  --out    <file.mp4>            default out/video.mp4
  --width  <px>                 default 1280
  --height <px>                 default 720
  --fps    <n>                  default 30
  --frames <n>                  default 90
```

Pipeline:

1. Launch headless Chromium through Puppeteer.
2. Set the viewport to `--width` × `--height`.
3. Open `--url` and wait for `networkidle0`.
4. Wait until `window.milyonusReady === true` (30 second timeout).
5. For each frame, call `milyonusSetFrame`, then screenshot `#milyonus-stage` to `frame-000000.png` and up.
6. Encode:

```text
ffmpeg -y -framerate <fps> -i frame-%06d.png -c:v libx264 -pix_fmt yuv420p <out>
```

7. Delete the temporary frame directory.

Progress prints every 10 frames. A missing stage, a missing FFmpeg, or a non-zero encoder exit fails the process.

The dev server must already be running. Motionedit 1.0 does not bundle or spawn Vite for you. That split is deliberate: preview and capture stay ordinary web pages.

---

## Determinism

A frame is a pure input. Treat it that way.

Allowed:

- `useCurrentFrame()`
- `useVideoConfig()`
- `interpolate` and `spring`
- props
- anything derived from the above

Not allowed inside a composition, if you want preview and MP4 to match:

- `Date.now()`, `performance.now()`, `Math.random()` without a frame-derived seed
- reading layout that depends on viewport scroll
- animations driven by CSS `@keyframes` or `transition` (they run on a different clock than the frame)
- network requests whose result can change between frames

CSS transforms, opacity, and inline styles keyed off the frame are the intended look. The renderer does not freeze CSS animations. It photographs whatever is on the stage after React commits.

---

## Parameterized films

`<Player>` and `<FrameRenderer>` accept `inputProps` and spread them onto the composition. The hello-world title is already a prop (`title`, default `"Milyonus"`). A batch is a loop you write: same component, different props, different `--out`.

The CLI does not yet take a JSON props file. Pass props through the page, or read query parameters in your entry and forward them. The runtime will not stop you. The convenience flag is future work.

This is the practical reason to prefer code over a timeline. One composition, many cuts, no duplicated project files.

---

## Design rules

These are the rules the code already follows. New work should follow them too.

1. **Same frame in, same pixels out.** If a function needs memory of previous frames, it must recompute that memory from frame 0 to `n` inside the call, the way `spring` does.
2. **Time is an integer.** Sub-frame rendering is not a feature. Easing happens inside the mapping, not between painted frames.
3. **Sequences own local time.** Children should not subtract `from` themselves.
4. **Preview scale is a transform, not a layout.** The composition always lays out at `width` × `height`.
5. **The CLI is a camera, not a runtime.** It does not evaluate React. It drives a page that does.
6. **No hidden project format.** If it matters, it is a TypeScript value.

---

## What is deliberately missing

Honesty keeps this document useful.

- No audio track, no waveform, no `<Audio>`.
- No caption or subtitle component.
- No transition primitives beyond what you build with `Sequence` and `interpolate`.
- No parallel rendering and no chunk stitch. Frames are captured in one Chromium, in order.
- No studio UI. The scrubber is the editor.
- No cloud renderer, no Lambda recipe, no render queue.
- No automatic discovery of compositions. You point the CLI at a URL and a frame count.
- No still-image (`png`) command separate from the frame dump the encoder already produces.

If you need one of those, the extension point is visible: another driver of `FrameContext`, or another flag on the CLI. Do not fork the core to add a feature that is a driver.

---

## Roadmap

- Audio tracks that are sliced by sequence time and muxed by FFmpeg
- A caption component driven by frame ranges, not by a video element's text track
- A small transition set built only from `interpolate`
- Parallel frame ranges and a stitch step
- A studio shell: composition list, prop editor, timeline derived from sequences
- A props file on the CLI (`--props data.json`)
- Documented cloud rendering on a single VM, then on a queue

None of these are promised for a date. The 1.0 contract above is the part you can build against now.

---

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

```bash
npm install
npm run build
npm run typecheck
npm test
```

CI on push and pull request runs that same chain on Node 20. A change to `interpolate` or `spring` needs a test in `packages/core/test`. A change to the render contract needs a matching change in this document, because the contract is the product.

Agent notes, if you are automating work in this repo, live in [AGENTS.md](AGENTS.md).

---

## License and attribution

[MIT](LICENSE). Copyright (c) 2026 Milyonus contributors.

You may use, modify, and ship Motionedit in commercial work. Keep the copyright notice.

Remotion is an inspiration for the idea that a video can be a React function of a frame, and for the shape of a monorepo that separates core, player, and renderer. Remotion is a separate project, under its own license, by its own authors. Motionedit does not include Remotion code. Do not describe a Motionedit render as a Remotion render.

---

**Frame in. Pixels out. The film is the function.**

Ayaz Elrico · Milyonus
[github.com/ayazelrico/Milyonus-Motionedit-1.0](https://github.com/ayazelrico/Milyonus-Motionedit-1.0)
