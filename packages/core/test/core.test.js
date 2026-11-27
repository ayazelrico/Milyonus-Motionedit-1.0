import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AbsoluteFill,
  Audio,
  Captions,
  Easings,
  FrameProvider,
  Freeze,
  Img,
  InspectorContext,
  Loop,
  PlaybackContext,
  Sequence,
  Series,
  Transition,
  Video,
  bezier,
  cancelRender,
  continueRender,
  createRandom,
  defineComposition,
  delayRender,
  fadeIn,
  fadeInOut,
  fadeOut,
  framesToSeconds,
  getActiveCaptions,
  getPendingDelayRenders,
  interpolate,
  interpolateColors,
  parseColor,
  parseSrt,
  random,
  randomInt,
  randomRange,
  resetDelayRenders,
  scaleIn,
  secondsToFrames,
  slideIn,
  slideOut,
  spring,
  useAbsoluteFrame,
  useCurrentFrame,
  useVideoConfig,
  waitForDelayRenders,
  wipeIn,
} from "../dist/index.js";

test("interpolate maps linearly and supports multi-point segments", () => {
  assert.equal(interpolate(5, [0, 10], [0, 100]), 50);
  assert.equal(interpolate(15, [0, 10, 20], [0, 1, 0]), 0.5);
});

test("interpolate clamps and extends on both sides", () => {
  assert.equal(interpolate(-5, [0, 10], [0, 100], { extrapolateLeft: "clamp" }), 0);
  assert.equal(interpolate(-5, [0, 10], [0, 100], { extrapolateLeft: "extend" }), -50);
  assert.equal(interpolate(20, [0, 10], [0, 100], { extrapolateRight: "clamp" }), 100);
  assert.equal(interpolate(20, [0, 10], [0, 100], { extrapolateRight: "extend" }), 200);
});

test("interpolate applies built-in, bezier, and custom easings and validates ranges", () => {
  assert.equal(Easings.linear(0.5), 0.5);
  assert.ok(Easings.quadIn(0.5) < 0.5);
  assert.ok(Easings.quadOut(0.5) > 0.5);
  assert.equal(Easings.quadInOut(0.5), 0.5);
  assert.ok(Easings.easeIn(0.5) < 0.5);
  assert.ok(Easings.easeOut(0.5) > 0.5);
  assert.equal(Easings.easeInOut(0.5), 0.5);
  assert.equal(Easings.expoOut(1), 1);
  assert.ok(Easings.backOut(0.8) > 1);

  const linearBezier = bezier(0.25, 0.25, 0.75, 0.75);
  assert.ok(Math.abs(linearBezier(0.4) - 0.4) < 1e-4);
  const snappy = Easings.bezier(0.16, 1, 0.3, 1);
  assert.equal(snappy(0), 0);
  assert.equal(snappy(1), 1);
  assert.ok(snappy(0.3) > 0.5);
  assert.throws(() => bezier(-0.1, 0, 1, 1), /\[0, 1\]/);

  assert.equal(interpolate(5, [0, 10], [0, 100], { easing: (t) => t * t }), 25);
  assert.throws(() => interpolate(5, [0], [0]), /at least 2/);
  assert.throws(() => interpolate(5, [0, 10], [0, 50, 100]), /equal length/);
  assert.throws(() => interpolate(5, [10, 5], [0, 100]), /strictly increasing/);
});

test("parseColor and interpolateColors support hex, rgb/rgba, and hsl/hsla", () => {
  assert.deepEqual(parseColor("#fff"), [255, 255, 255, 1]);
  assert.deepEqual(parseColor("#ff008080")[0], 255);
  assert.deepEqual(parseColor("rgba(10, 20, 30, 0.5)"), [10, 20, 30, 0.5]);
  assert.deepEqual(parseColor("hsl(0, 100%, 50%)"), [255, 0, 0, 1]);

  assert.equal(interpolateColors(0, [0, 10], ["#000000", "#ffffff"]), "rgba(0, 0, 0, 1)");
  assert.equal(interpolateColors(5, [0, 10], ["#000000", "#ffffff"]), "rgba(128, 128, 128, 1)");
  assert.equal(interpolateColors(10, [0, 10], ["#000000", "rgba(255, 255, 255, 0.5)"]), "rgba(255, 255, 255, 0.5)");
});

test("spring is deterministic, respects from/to, and validates config", () => {
  assert.equal(spring({ frame: 0, fps: 30 }), 0);
  assert.equal(spring({ frame: -5, fps: 30, from: 10, to: 20 }), 10);
  assert.ok(Math.abs(spring({ frame: 200, fps: 30, from: 10, to: 20 }) - 20) < 0.1);
  assert.equal(spring({ frame: 17, fps: 30 }), spring({ frame: 17, fps: 30 }));
  assert.throws(() => spring({ frame: 5, fps: 0 }), /fps must be positive/);
  assert.throws(() => spring({ frame: 5, fps: 30, config: { mass: 0 } }), /mass must be positive/);
});

test("random utilities are deterministic and bounded", () => {
  assert.equal(random(42), random(42));
  assert.equal(random("particle-7"), random("particle-7"));
  assert.equal(random(0), random(-0));
  assert.notEqual(random(1), random(2));

  for (let i = 0; i < 250; i++) {
    const v = random(`seed-${i}`);
    assert.ok(v >= 0 && v < 1);
    const r = randomRange(i, -10, 10);
    assert.ok(r >= -10 && r < 10);
    const k = randomInt(i, 3, 7);
    assert.ok(Number.isInteger(k) && k >= 3 && k <= 7);
  }

  const genA = createRandom("stream");
  const genB = createRandom("stream");
  assert.deepEqual([genA(), genA(), genA()], [genB(), genB(), genB()]);
  assert.throws(() => randomRange(1, 10, 5), /max >= min/);
  assert.throws(() => randomInt(1, 10, 5), /max >= min/);
});

test("hooks throw outside FrameProvider and Sequence shifts local frame while preserving absoluteFrame", () => {
  const Probe = () => {
    const local = useCurrentFrame();
    const abs = useAbsoluteFrame();
    const cfg = useVideoConfig();
    return React.createElement("span", null, `${local}|${abs}|${cfg.fps}`);
  };

  assert.throws(() => renderToStaticMarkup(React.createElement(Probe)), /Milyonus hooks/);

  const discoveredSequences = [];
  const renderAt = (frame) =>
    renderToStaticMarkup(
      React.createElement(
        InspectorContext.Provider,
        { value: { reportSequence: (s) => discoveredSequences.push(s) } },
        React.createElement(
          FrameProvider,
          { value: { width: 1280, height: 720, fps: 30, durationInFrames: 100, frame } },
          React.createElement(
            Sequence,
            { name: "Outer", from: 20, durationInFrames: 50 },
            React.createElement(
              Sequence,
              { name: "Inner", from: 10, durationInFrames: 20, layout: "none" },
              React.createElement(Probe)
            )
          )
        )
      )
    );

  assert.equal(renderAt(15), "");
  assert.equal(renderAt(25), '<div style="position:absolute;inset:0;display:flex"></div>');
  assert.equal(renderAt(35), '<div style="position:absolute;inset:0;display:flex"><span>5|35|30</span></div>');
  assert.equal(renderAt(50), '<div style="position:absolute;inset:0;display:flex"></div>');
  assert.ok(discoveredSequences.some((s) => s.name === "Outer" && s.from === 20 && s.durationInFrames === 50));
  assert.ok(discoveredSequences.some((s) => s.name === "Inner" && s.from === 30 && s.durationInFrames === 20));
});

test("AbsoluteFill, Series, Loop, and Freeze compose frame time deterministically", () => {
  const ReadFrame = ({ tag }) => `${tag}:${useCurrentFrame()}`;

  const renderTree = (frame) =>
    renderToStaticMarkup(
      React.createElement(
        FrameProvider,
        { value: { width: 1280, height: 720, fps: 30, durationInFrames: 100, frame } },
        React.createElement(
          AbsoluteFill,
          null,
          React.createElement(
            Series,
            null,
            React.createElement(
              Series.Sequence,
              { name: "First", durationInFrames: 20, layout: "none" },
              React.createElement(ReadFrame, { tag: "A" })
            ),
            React.createElement(
              Series.Sequence,
              { name: "Second", durationInFrames: 20, offset: -5, layout: "none" },
              React.createElement(ReadFrame, { tag: "B" })
            )
          ),
          React.createElement(
            Loop,
            { durationInFrames: 10, times: 3, layout: "none" },
            React.createElement(ReadFrame, { tag: "L" })
          ),
          React.createElement(
            Freeze,
            { frame: 7, active: (f) => f >= 10 },
            React.createElement(ReadFrame, { tag: "F" })
          )
        )
      )
    );

  assert.match(renderTree(5), /A:5L:5F:5/);
  assert.match(renderTree(17), /A:17B:2L:7F:7/);
  assert.match(renderTree(25), /B:10L:5F:7/);
  // At frame 35 Loop (10*3=30) and Series (15+20=35) have both unmounted; Freeze remains at 7.
  assert.match(renderTree(35), />F:7<\/div>$/);
});

test("delayRender, continueRender, and cancelRender coordinate async asset readiness", async () => {
  resetDelayRenders();
  const h1 = delayRender("font-load");
  assert.equal(getPendingDelayRenders().length, 1);

  let settled = false;
  const waiter = waitForDelayRenders(2000).then(() => {
    settled = true;
  });
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(settled, false);

  continueRender(h1);
  await waiter;
  assert.equal(settled, true);
  assert.equal(getPendingDelayRenders().length, 0);

  delayRender("broken-asset");
  cancelRender(new Error("404 asset"));
  await assert.rejects(() => waitForDelayRenders(500), /404 asset/);
});

test("Captions, parseSrt, and frame conversion helpers work accurately", () => {
  assert.equal(secondsToFrames(1.5, 30), 45);
  assert.equal(framesToSeconds(45, 30), 1.5);

  const srt = `1
00:00:01,000 --> 00:00:02,500
Hello Motionedit

2
00:00:03,000 --> 00:00:04,000
Second line`;

  const cues = parseSrt(srt, 30);
  assert.equal(cues.length, 2);
  assert.deepEqual(cues[0], { id: "1", from: 30, to: 75, text: "Hello Motionedit" });
  assert.equal(getActiveCaptions(cues, 29).length, 0);
  assert.equal(getActiveCaptions(cues, 30)[0].text, "Hello Motionedit");
  assert.equal(getActiveCaptions(cues, 75).length, 0);

  const html = renderToStaticMarkup(
    React.createElement(
      FrameProvider,
      { value: { width: 1280, height: 720, fps: 30, durationInFrames: 120, frame: 40 } },
      React.createElement(Captions, {
        cues: [{ from: 30, to: 75, text: "Pure captions", speaker: "Host" }],
      })
    )
  );
  assert.match(html, /Host:/);
  assert.match(html, /Pure captions/);
});

test("transitions compute deterministic CSS styles and Transition component renders", () => {
  assert.equal(fadeIn(0, 10).opacity, 0);
  assert.equal(fadeIn(10, 10).opacity, 1);
  assert.equal(fadeOut(90, 10, 90).opacity, 0);
  assert.equal(fadeInOut(45, 90, 15).opacity, 1);
  assert.match(String(slideIn(0, { direction: "left" }).transform), /translate3d\(100%/);
  assert.match(String(slideOut(90, { totalDurationInFrames: 90, direction: "right" }).transform), /translate3d\(100%/);
  assert.equal(scaleIn(20, { durationInFrames: 20, from: 0.5 }).transform, "scale(1)");
  assert.equal(wipeIn(20, { durationInFrames: 20, direction: "right" }).clipPath, "inset(0% 0% 0% 0%)");

  const html = renderToStaticMarkup(
    React.createElement(
      FrameProvider,
      { value: { width: 1280, height: 720, fps: 30, durationInFrames: 60, frame: 5 } },
      React.createElement(
        Transition,
        { enter: "slide-up", exit: "fade", enterDuration: 10, exitDuration: 10 },
        React.createElement("div", null, "Card")
      )
    )
  );
  assert.match(html, /Card/);
  assert.match(html, /translate3d/);
});

test("Audio, Img, and Video render cleanly and report sequence-sliced audio metadata", () => {
  const reported = [];
  const html = renderToStaticMarkup(
    React.createElement(
      PlaybackContext.Provider,
      { value: { playing: false, muted: false, renderMode: true } },
      React.createElement(
        InspectorContext.Provider,
        { value: { reportAudio: (t) => reported.push(t) } },
        React.createElement(
          FrameProvider,
          { value: { width: 1280, height: 720, fps: 30, durationInFrames: 90, frame: 40 } },
          React.createElement(
            Sequence,
            { from: 30, durationInFrames: 40 },
            React.createElement(Img, { src: "https://example.com/logo.png", alt: "Logo" }),
            React.createElement(Video, { name: "Clip", src: "/clip.mp4", trimBefore: 10 }),
            React.createElement(Audio, {
              name: "Theme",
              src: "/theme.wav",
              trimBefore: 15,
              volume: (f) => f / 40,
            })
          )
        )
      )
    )
  );

  assert.match(html, /<img[^>]+alt="Logo"/);
  assert.match(html, /<video[^>]+src="\/clip\.mp4"/);
  assert.equal(html.includes("<audio"), false);
  assert.equal(reported.length, 2);
  const theme = reported.find((t) => t.name === "Theme");
  assert.equal(theme.startFrame, 30);
  assert.equal(theme.durationInFrames, 40);
  assert.equal(theme.trimBefore, 15);
  assert.equal(theme.volumeSamples.length, 40);
  assert.equal(theme.volumeSamples[20], 0.5);

  const comp = defineComposition({
    id: "demo",
    width: 1280,
    height: 720,
    fps: 30,
    durationInFrames: 60,
    component: () => null,
    defaultProps: { title: "Demo" },
  });
  assert.equal(comp.id, "demo");
});
