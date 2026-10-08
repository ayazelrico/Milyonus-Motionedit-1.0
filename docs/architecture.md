# Design

**Principle:** a video is a pure function of a frame number. Same frame in, same pixels out.

1. `@milyonus/core` provides a `FrameContext` (frame, fps, width, height, duration).
2. `<Sequence>` shifts the frame so children see time starting at 0 and unmounts them outside their window.
3. `@milyonus/player` renders a component inside a sized stage and drives the frame via a timer (preview) or `window.milyonusSetFrame(n)` (render mode).
4. `@milyonus/cli` opens the render page in headless Chromium, sets each frame, screenshots to PNG, and encodes with FFmpeg.
