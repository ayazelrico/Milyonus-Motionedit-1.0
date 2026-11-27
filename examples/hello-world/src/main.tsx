import React from "react";
import { createRoot } from "react-dom/client";
import { FrameRenderer, Player, Studio } from "@milyonus/player";
import { Hello, compositions, helloConfig } from "./Hello.js";

const params = new URLSearchParams(location.search);
const isRender = params.has("render");
const isStandalonePlayer = params.has("player");

createRoot(document.getElementById("root")!).render(
  isRender ? (
    <FrameRenderer compositions={compositions} initialCompositionId="hello" />
  ) : isStandalonePlayer ? (
    <div style={{ padding: 16 }}>
      <Player component={Hello} {...helloConfig} previewWidth={800} />
    </div>
  ) : (
    <Studio compositions={compositions} initialCompositionId="hello" />
  )
);
