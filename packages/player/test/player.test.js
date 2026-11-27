import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Sequence, defineComposition, useCurrentFrame } from "@milyonus/core";
import { FrameRenderer, Player, Stage, Studio } from "../dist/index.js";

const SampleComp = ({ label = "Default" }) => {
  const frame = useCurrentFrame();
  return React.createElement(
    "div",
    null,
    React.createElement(Sequence, { name: "MainSeq", from: 0 }, `${label}:${frame}`)
  );
};

const config = { width: 1280, height: 720, fps: 30, durationInFrames: 90 };

test("Stage renders scaled outer wrapper and full-size inner composition", () => {
  const html = renderToStaticMarkup(
    React.createElement(Stage, {
      config,
      frame: 12,
      component: SampleComp,
      props: { label: "StageTest" },
      scale: 0.5,
    })
  );
  assert.match(html, /width:640px;height:360px/);
  assert.match(html, /width:1280px;height:720px/);
  assert.match(html, /StageTest:12/);
});

test("Player renders preview stage and transport controls", () => {
  const withControls = renderToStaticMarkup(
    React.createElement(Player, {
      ...config,
      component: SampleComp,
      inputProps: { label: "Preview" },
      initialFrame: 5,
      autoPlay: false,
    })
  );
  assert.match(withControls, /Preview:5/);
  assert.match(withControls, /Play/);
  assert.match(withControls, /5\/89/);

  const noControls = renderToStaticMarkup(
    React.createElement(Player, {
      ...config,
      component: SampleComp,
      controls: false,
    })
  );
  assert.equal(noControls.includes("<button"), false);
});

test("FrameRenderer supports single-component and multi-composition modes", () => {
  const singleHtml = renderToStaticMarkup(
    React.createElement(FrameRenderer, {
      ...config,
      component: SampleComp,
      inputProps: { label: "SingleRender" },
    })
  );
  assert.match(singleHtml, /id="milyonus-stage"/);
  assert.match(singleHtml, /SingleRender:0/);

  const multiHtml = renderToStaticMarkup(
    React.createElement(FrameRenderer, {
      compositions: [
        defineComposition({
          id: "first",
          ...config,
          component: SampleComp,
          defaultProps: { label: "FirstComp" },
        }),
        defineComposition({
          id: "second",
          width: 1080,
          height: 1080,
          fps: 30,
          durationInFrames: 60,
          component: SampleComp,
          defaultProps: { label: "SecondComp" },
        }),
      ],
      initialCompositionId: "second",
    })
  );
  assert.match(multiHtml, /width:1080px;height:1080px/);
  assert.match(multiHtml, /SecondComp:0/);
});

test("Studio renders composition list, prop controls, and timeline shell", () => {
  const comps = [
    defineComposition({
      id: "hero",
      ...config,
      component: SampleComp,
      description: "Hero cut",
      defaultProps: { label: "StudioHero" },
    }),
  ];
  const html = renderToStaticMarkup(React.createElement(Studio, { compositions: comps }));
  assert.match(html, /Milyonus Motionedit Studio/);
  assert.match(html, /hero/);
  assert.match(html, /StudioHero:0/);
  assert.match(html, /Input Props/);

  assert.throws(() => renderToStaticMarkup(React.createElement(Studio, { compositions: [] })), /at least one/);
});
