import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import puppeteer, { type Browser } from "puppeteer";

const SYSTEM_CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter((p): p is string => Boolean(p));

/** Launches headless Chromium with background-tab throttling disabled for multi-page concurrency. */
export const launchHeadlessBrowser = async (): Promise<Browser> => {
  const baseArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ];
  if (process.env.PUPPETEER_EXECUTABLE_PATH && existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: baseArgs,
    });
  }

  try {
    return await puppeteer.launch({ headless: true, args: baseArgs });
  } catch (firstErr) {
    const fallback = SYSTEM_CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
    if (!fallback) throw firstErr;
    return puppeteer.launch({
      headless: true,
      executablePath: fallback,
      args: baseArgs,
    });
  }
};

const getFreePort = (): Promise<number> =>
  new Promise((res, rej) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close();
        rej(new Error("Could not allocate a free local TCP port."));
        return;
      }
      const port = addr.port;
      srv.close(() => res(port));
    });
    srv.on("error", rej);
  });

const waitForHttpReady = async (url: string, timeoutMs = 25000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return;
    } catch {
      // Retry until Vite binds the port.
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`Timed out waiting for dev server at ${url}`);
};

/**
 * Spawns a temporary Vite server for `projectDir`, invokes `fn(renderUrl)`, and terminates the entire process group cleanly.
 */
export const withServedProject = async <T>(
  projectDir: string,
  fn: (renderUrl: string) => Promise<T>
): Promise<T> => {
  const cwd = resolve(projectDir);
  const port = await getFreePort();
  const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
  const isPosix = process.platform !== "win32";

  const child: ChildProcess = spawn(
    npxBin,
    ["vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd,
      detached: isPosix,
      stdio: ["ignore", "ignore", "pipe"],
    }
  );

  let stderrBuf = "";
  child.stderr?.on("data", (chunk) => {
    stderrBuf += String(chunk);
  });

  const baseUrl = `http://127.0.0.1:${port}/?render=1`;
  try {
    await Promise.race([
      waitForHttpReady(baseUrl),
      new Promise<never>((_, rej) => {
        child.once("exit", (code) => {
          rej(new Error(`Vite dev server exited prematurely (code ${code}). ${stderrBuf}`));
        });
      }),
    ]);
    return await fn(baseUrl);
  } finally {
    child.stderr?.destroy();
    if (child.pid) {
      try {
        if (isPosix) {
          process.kill(-child.pid, "SIGTERM");
        } else {
          child.kill("SIGTERM");
        }
      } catch {
        // Process already exited.
      }
    }
  }
};
