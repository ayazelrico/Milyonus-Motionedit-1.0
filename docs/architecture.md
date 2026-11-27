# Architecture

Motionedit separates composition logic from playback and encoding across three workspace packages.

```text
┌──────────────────────────────────────────────────────────────────────┐
│  User Composition(s)                                                 │
│  Pure React 18 components reading frame + props                      │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
┌──────────────────────────────────▼───────────────────────────────────┐
│  @milyonus/core  (zero runtime dependencies; React peer only)        │
│  FrameContext · PlaybackContext · InspectorContext                   │
│  Sequence · interpolate · spring · random · Transition               │
│  Captions · Audio · defineComposition                                │
└───────────┬──────────────────────┬───────────────────────┬───────────┘
            │                      │                       │
  ┌─────────▼─────────┐  ┌─────────▼─────────┐  ┌──────────▼───────────┐
  │  Player           │  │  Studio           │  │  FrameRenderer       │
  │  rAF clock        │  │  Composition list │  │  #milyonus-stage     │
  │  HTML5 <audio>    │  │  Live prop editor │  │  window.milyonus*    │
  └───────────────────┘  │  Sequence/Audio   │  └──────────┬───────────┘
                         │  timeline         │             │
                         └───────────────────┘  ┌──────────▼───────────┐
                                                │  @milyonus/cli       │
                                                │  Parallel Chromium   │
                                                │  FFmpeg H.264 + AAC  │
                                                │  Still · Stitch ·    │
                                                │  Queue Worker        │
                                                └──────────────────────┘
```

## Context Layers (`@milyonus/core`)

1. **`FrameContext`**: Carries `frame` (local to the nearest `<Sequence>`), `absoluteFrame` (from root frame `0`), `width`, `height`, `fps`, `durationInFrames`, and enclosing sequence bounds. Calling hooks outside a driver throws immediately.
2. **`PlaybackContext`**: Supplies `{ playing, muted, renderMode }`. Preview drivers (`<Player>`, `<Studio>`) synchronize HTML5 `<audio>` elements; `<FrameRenderer>` sets `renderMode: true` so `<Audio>` skips DOM playback and reports exact slice metadata instead.
3. **`InspectorContext`**: Zero-overhead collector interface (`reportSequence`, `reportAudio`). `<Studio>` uses it to draw timeline tracks; `<FrameRenderer>` exposes collected tracks to `@milyonus/cli`.

## Browser Capture Contract (`@milyonus/player`)

`<FrameRenderer>` resets document margins to `0`, mounts `#milyonus-stage` at exact pixel dimensions (`scale = 1`), waits for `document.fonts.ready` plus two `requestAnimationFrame` ticks on every frame change, and attaches:

- `window.milyonusReady: boolean`
- `window.milyonusSetFrame(frame: number): Promise<void>`
- `window.milyonusSetInputProps(props: Record<string, unknown>): Promise<void>`
- `window.milyonusGetConfig(): CompositionSummary`
- `window.milyonusListCompositions(): CompositionSummary[]`
- `window.milyonusSelectComposition(id: string): Promise<CompositionSummary>`
- `window.milyonusGetAudioTracks(): ResolvedAudioTrack[]`
- `window.milyonusGetSequences(): TimelineSequenceEntry[]`

## Encoding & Audio Muxing Pipeline (`@milyonus/cli`)

1. **Pre-flight**: Validates CLI flags, loads `--props` (inline JSON or `.json` file), and verifies `ffmpeg` is available before launching Chromium.
2. **Parallel Frame Capture**: Opens `N` (`--concurrency`) headless Chromium pages, partitions `[fromFrame, toFrame)` across workers, screenshots `#milyonus-stage` to indexed PNGs in an isolated temp directory, and deduplicates reported `<Audio>` tracks.
3. **FFmpeg Audio Filter Graph**: Each audible `<Audio>` track is trimmed (`atrim`), time-stretched (`atempo` chains), volume-shaped (scalar or piecewise per-frame `volume` expression), delayed to its sequence's `startFrame` (`adelay`), padded (`apad`), and mixed (`amix`) into a 192 kbps AAC stream alongside `libx264` (`yuv420p`) video.
4. **Cleanup**: A top-level `try / finally` removes temporary directories whether encoding succeeds or fails.
