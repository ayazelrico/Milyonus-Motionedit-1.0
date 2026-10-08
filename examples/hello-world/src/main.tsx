import React from "react";
import { createRoot } from "react-dom/client";
import { Player, FrameRenderer } from "@milyonus/player";
import { Hello, helloConfig } from "./Hello";

const isRender = new URLSearchParams(location.search).has("render");

createRoot(document.getElementById("root")!).render(
  isRender ? (
    <FrameRenderer component={Hello} {...helloConfig} />
  ) : (
    <div style={{ padding: 16 }}>
      <Player component={Hello} {...helloConfig} previewWidth={800} />
    </div>
  )
);
