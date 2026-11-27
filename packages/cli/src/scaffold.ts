import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

export type ScaffoldOptions = {
  /** Target directory where the starter project will be generated. */
  dir: string;
  /** Optional package name (defaults to directory basename). */
  name?: string;
  /** Overwrite files even if target directory is non-empty. Defaults to `false`. */
  force?: boolean;
};

/**
 * Generates a ready-to-run Milyonus Motionedit project (TypeScript + React 18 + Vite + Studio).
 */
export const scaffoldProject = async ({
  dir,
  name,
  force = false,
}: ScaffoldOptions): Promise<{ dir: string; files: string[] }> => {
  const targetDir = resolve(dir);
  if (existsSync(targetDir) && !force) {
    const entries = await readdir(targetDir);
    if (entries.length > 0) {
      throw new Error(`Target directory "${targetDir}" is not empty. Pass --force to overwrite.`);
    }
  }

  const pkgName = (name ?? basename(targetDir))
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/^-+|-+$/g, "") || "my-motionedit-film";

  await mkdir(join(targetDir, "src"), { recursive: true });

  const files: Record<string, string> = {
    "package.json": JSON.stringify(
      {
        name: pkgName,
        private: true,
        version: "0.1.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
          typecheck: "tsc -p . --noEmit",
          render: "milyonus render --serve . --composition main --out out/video.mp4 --concurrency 2",
          still: "milyonus still --serve . --composition main --frame 30 --out out/still.png",
        },
        dependencies: {
          "@milyonus/cli": "^0.1.0",
          "@milyonus/core": "^0.1.0",
          "@milyonus/player": "^0.1.0",
          react: "^18.3.0",
          "react-dom": "^18.3.0",
        },
        devDependencies: {
          "@types/react": "^18.3.0",
          "@types/react-dom": "^18.3.0",
          "@vitejs/plugin-react": "^4.3.0",
          typescript: "^5.5.0",
          vite: "^5.4.0",
        },
      },
      null,
      2
    ) + "\n",
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "react-jsx",
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          lib: ["ES2022", "DOM"],
        },
        include: ["src"],
      },
      null,
      2
    ) + "\n",
    "vite.config.js": `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({ plugins: [react()] });\n`,
    "index.html": `<!doctype html>\n<html>\n  <head><meta charset="utf-8" /><title>${pkgName}</title></head>\n  <body style="margin:0;background:#070d1f;color:#eee">\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`,
    ".gitignore": `node_modules\ndist\nout\n*.log\n.DS_Store\n`,
    "src/Composition.tsx": `import React from "react";
import {
  AbsoluteFill,
  Series,
  Transition,
  defineComposition,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "@milyonus/core";

export type MainProps = {
  title?: string;
  tagline?: string;
};

const IntroCard: React.FC<{ title: string }> = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <h1 style={{ fontFamily: "system-ui, sans-serif", fontSize: 120, margin: 0, color: "#fff", transform: \`scale(\${scale})\` }}>
        {title}
      </h1>
    </AbsoluteFill>
  );
};

const OutroCard: React.FC<{ tagline: string }> = ({ tagline }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <p style={{ fontFamily: "system-ui, sans-serif", fontSize: 48, margin: 0, color: "#35C6F4", opacity }}>
        {tagline}
      </p>
    </AbsoluteFill>
  );
};

export const Main: React.FC<MainProps> = ({
  title = "Hello Milyonus",
  tagline = "Frame in. Pixels out.",
}) => (
  <AbsoluteFill style={{ background: "linear-gradient(135deg, #071233, #1e4fd8)" }}>
    <Series>
      <Series.Sequence name="Intro" durationInFrames={50}>
        <Transition enter="fade" exit="fade">
          <IntroCard title={title} />
        </Transition>
      </Series.Sequence>
      <Series.Sequence name="Outro" durationInFrames={40}>
        <Transition enter="slide-up">
          <OutroCard tagline={tagline} />
        </Transition>
      </Series.Sequence>
    </Series>
  </AbsoluteFill>
);

export const compositions = [
  defineComposition({
    id: "main",
    component: Main,
    width: 1280,
    height: 720,
    fps: 30,
    durationInFrames: 90,
    defaultProps: {
      title: "Hello Milyonus",
      tagline: "Frame in. Pixels out.",
    },
  }),
];
`,
    "src/main.tsx": `import React from "react";
import { createRoot } from "react-dom/client";
import { FrameRenderer, Studio } from "@milyonus/player";
import { compositions } from "./Composition.js";

const isRender = new URLSearchParams(location.search).has("render");

createRoot(document.getElementById("root")!).render(
  isRender ? (
    <FrameRenderer compositions={compositions} />
  ) : (
    <Studio compositions={compositions} />
  )
);
`,
  };

  const written: string[] = [];
  for (const [relPath, content] of Object.entries(files)) {
    const abs = join(targetDir, relPath);
    await writeFile(abs, content, "utf8");
    written.push(relPath);
  }

  return { dir: targetDir, files: written };
};
