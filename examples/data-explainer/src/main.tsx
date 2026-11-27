import React from "react";
import { createRoot } from "react-dom/client";
import { FrameRenderer, Studio } from "@milyonus/player";
import { compositions } from "./Explainer.js";

const isRender = new URLSearchParams(location.search).has("render");

createRoot(document.getElementById("root")!).render(
  isRender ? (
    <FrameRenderer compositions={compositions} />
  ) : (
    <Studio compositions={compositions} />
  )
);
