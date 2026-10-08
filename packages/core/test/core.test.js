import test from "node:test";
import assert from "node:assert/strict";
import { interpolate, spring } from "../dist/index.js";

test("interpolate maps linearly", () => {
  assert.equal(interpolate(5, [0, 10], [0, 100]), 50);
});
test("interpolate clamps", () => {
  assert.equal(interpolate(20, [0, 10], [0, 100], { extrapolateRight: "clamp" }), 100);
});
test("interpolate multi-point", () => {
  assert.equal(interpolate(15, [0, 10, 20], [0, 1, 0]), 0.5);
});
test("spring starts at 0 and settles near 1", () => {
  assert.equal(spring({ frame: 0, fps: 30 }), 0);
  assert.ok(Math.abs(spring({ frame: 200, fps: 30 }) - 1) < 0.01);
});
test("spring is deterministic", () => {
  assert.equal(spring({ frame: 17, fps: 30 }), spring({ frame: 17, fps: 30 }));
});
