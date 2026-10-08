# 🎞️ Milyonus

**Motion graphics and video, written in React. Fully open source (MIT).**

Milyonus lets you describe a video as a function of the current frame: `frame → pixels`.
Write React components, preview them in the browser, then render them to MP4.

> Milyonus is an independent project. Its structure and ideas are inspired by
> [remotion-dev/remotion](https://github.com/remotion-dev/remotion) (a monorepo of
> packages, a React-first workflow, "code is the source of truth"), but it contains
> **no Remotion code** and is licensed under plain MIT.

## Features

- **Frame-based animation**: `useCurrentFrame()`, `useVideoConfig()`
- **Timeline**: `<Sequence from durationInFrames>` to place content in time
- **Animation helpers**: `interpolate()`, `spring()`, easing presets
- **Player**: embeddable `<Player />` with play/pause and scrubbing
- **CLI renderer**: headless Chromium (Puppeteer) captures frames, FFmpeg encodes MP4
- **Batch-friendly**: render from data and props, scriptable from Node

## Repository layout

| Path | Purpose |
|------|---------|
| `packages/core` | `@milyonus/core` – hooks, `Sequence`, `interpolate`, `spring` |
| `packages/player` | `@milyonus/player` – `Player` and `FrameRenderer` |
| `packages/cli` | `@milyonus/cli` – `milyonus render` command |
| `examples/hello-world` | Vite + React example project |
| `docs` | Concepts and architecture |

## Get started

Requirements: Node 20+, FFmpeg on your PATH.

```bash
git clone https://github.com/<your-user>/milyonus.git
cd milyonus
npm install
npm run build            # builds core, player, cli
npm run dev              # starts the example preview at http://localhost:5173
```

Render to MP4 (in a second terminal, while `npm run dev` is running):

```bash
npm run render -w hello-world
# -> examples/hello-world/out/hello.mp4
```

## A tiny composition

```tsx
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "@milyonus/core";

export const Hello = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps });
  const opacity = interpolate(frame, [0, 20], [0, 1]);
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <h1 style={{ fontSize: 120, opacity, transform: `scale(${scale})` }}>Milyonus</h1>
    </div>
  );
};
```

## Roadmap

- [ ] Audio tracks and waveform helpers
- [ ] Captions / subtitle component
- [ ] Transitions library
- [ ] Parallel rendering and chunk stitching
- [ ] Studio UI with timeline editor
- [ ] Cloud rendering recipes

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
