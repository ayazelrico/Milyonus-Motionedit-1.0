import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Audio,
  Captions,
  Easings,
  FrameProvider,
  InspectorContext,
  PlaybackContext,
  Sequence,
  Transition,
  createRandom,
  defineComposition,
  fadeIn,
  fadeInOut,
  fadeOut,
  framesToSeconds,
  getActiveCaptions,
  interpolate,
  parseSrt,
  random,
  randomInt,
  randomRange,
  scaleIn,
  secondsToFrames,
  slideIn,
  slideOut,
  spring,
  useAbsoluteFrame,
  useCurrentFrame,
  useVideoConfig,
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

test("interpolate applies built-in and custom easings and validates ranges", () => {
  assert.equal(Easings.linear(0.5), 0.5);
  assert.ok(Easings.easeIn(0.5) < 0.5);
  assert.ok(Easings.easeOut(0.5) > 0.5);
  assert.equal(Easings.easeInOut(0.5), 0.5);
  assert.equal(interpolate(5, [0, 10], [0, 100], { easing: (t) => t * t }), 25);

  assert.throws(() => interpolate(5, [0], [0]), /at least 2/);
  assert.throws(() => interpolate(5, [0, 10], [0, 50, 100]), /equal length/);
  assert.throws(() => interpolate(5, [10, 5], [0, 100]), /strictly increasing/);
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

test("Audio reports sequence-sliced metadata and dynamic volume samples in renderMode", () => {
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

  assert.equal(html.includes("<audio"), false);
  assert.equal(reported.length, 1);
  assert.equal(reported[0].startFrame, 30);
  assert.equal(reported[0].durationInFrames, 40);
  assert.equal(reported[0].trimBefore, 15);
  assert.equal(reported[0].volumeSamples.length, 40);
  assert.equal(reported[0].volumeSamples[0], 0);
  assert.equal(reported[0].volumeSamples[20], 0.5);

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
