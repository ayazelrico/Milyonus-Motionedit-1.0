import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  renderMedia,
  renderStill,
  type RenderMediaOptions,
  type RenderMediaResult,
  type RenderStillOptions,
} from "./renderer.js";

/** Specification for a queued render or still-capture job. */
export type RenderJobSpec =
  | ({ type?: "render" } & Omit<RenderMediaOptions, "onProgress" | "quiet">)
  | ({ type: "still" } & RenderStillOptions);

/** Live state of a job managed by the render queue worker. */
export type RenderJobRecord = {
  id: string;
  spec: RenderJobSpec;
  status: "queued" | "rendering" | "completed" | "failed";
  progress: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: RenderMediaResult | { out: string; width: number; height: number; frame: number };
  error?: string;
};

/** Executes a batch JSON file of render/still jobs sequentially and returns completed job records. */
export const runBatchQueue = async (
  queueFilePath: string,
  quiet = false
): Promise<RenderJobRecord[]> => {
  const raw = await readFile(queueFilePath, "utf8");
  const parsed = JSON.parse(raw);
  const specs: RenderJobSpec[] = Array.isArray(parsed) ? parsed : parsed?.jobs;
  if (!Array.isArray(specs) || specs.length === 0) {
    throw new Error("Queue JSON must be a non-empty array of jobs or `{ \"jobs\": [...] }`.");
  }

  const records: RenderJobRecord[] = specs.map((spec, idx) => ({
    id: `job-${idx + 1}`,
    spec,
    status: "queued",
    progress: 0,
    createdAt: new Date().toISOString(),
  }));

  for (const record of records) {
    record.status = "rendering";
    record.startedAt = new Date().toISOString();
    try {
      if (record.spec.type === "still") {
        record.result = await renderStill(record.spec);
      } else {
        record.result = await renderMedia({
          ...record.spec,
          quiet,
          onProgress: (done, total) => {
            record.progress = total > 0 ? Number((done / total).toFixed(3)) : 1;
          },
        });
      }
      record.progress = 1;
      record.status = "completed";
      record.completedAt = new Date().toISOString();
    } catch (err) {
      record.status = "failed";
      record.error = (err as Error).message;
      record.completedAt = new Date().toISOString();
      throw err;
    }
  }

  return records;
};

const readJsonBody = (req: IncomingMessage): Promise<unknown> =>
  new Promise((res, rej) => {
    let body = "";
    req.on("data", (chunk) => {
      body += String(chunk);
      if (body.length > 2 * 1024 * 1024) {
        rej(new Error("Payload too large."));
      }
    });
    req.on("end", () => {
      try {
        res(body ? JSON.parse(body) : {});
      } catch (err) {
        rej(new Error(`Invalid JSON body: ${(err as Error).message}`));
      }
    });
    req.on("error", rej);
  });

const sendJson = (res: ServerResponse, status: number, payload: unknown): void => {
  const data = JSON.stringify(payload, null, 2);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(data);
};

/**
 * Starts an HTTP render queue worker server (`GET /health`, `POST /jobs`, `GET /jobs`, `GET /jobs/:id`).
 */
export const startWorkerServer = async ({
  port = 4321,
  host = "0.0.0.0",
  quiet = false,
}: {
  port?: number;
  host?: string;
  quiet?: boolean;
} = {}): Promise<{ server: Server; port: number; close: () => Promise<void> }> => {
  const jobs = new Map<string, RenderJobRecord>();
  const pendingIds: string[] = [];
  let processing = false;

  const pump = async () => {
    if (processing) return;
    processing = true;
    try {
      while (pendingIds.length > 0) {
        const nextId = pendingIds.shift()!;
        const record = jobs.get(nextId);
        if (!record) continue;
        record.status = "rendering";
        record.startedAt = new Date().toISOString();
        try {
          if (record.spec.type === "still") {
            record.result = await renderStill(record.spec);
          } else {
            record.result = await renderMedia({
              ...record.spec,
              quiet: true,
              onProgress: (done, total) => {
                record.progress = total > 0 ? Number((done / total).toFixed(3)) : 1;
              },
            });
          }
          record.progress = 1;
          record.status = "completed";
        } catch (err) {
          record.status = "failed";
          record.error = (err as Error).message;
        } finally {
          record.completedAt = new Date().toISOString();
        }
      }
    } finally {
      processing = false;
    }
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (req.method === "GET" && url.pathname === "/health") {
        const all = Array.from(jobs.values());
        sendJson(res, 200, {
          status: "ok",
          queued: all.filter((j) => j.status === "queued").length,
          rendering: all.filter((j) => j.status === "rendering").length,
          completed: all.filter((j) => j.status === "completed").length,
          failed: all.filter((j) => j.status === "failed").length,
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/jobs") {
        sendJson(res, 200, { jobs: Array.from(jobs.values()) });
        return;
      }

      if (req.method === "GET" && url.pathname.startsWith("/jobs/")) {
        const id = url.pathname.slice("/jobs/".length);
        const job = jobs.get(id);
        if (!job) {
          sendJson(res, 404, { error: `Job "${id}" not found.` });
          return;
        }
        sendJson(res, 200, job);
        return;
      }

      if (req.method === "POST" && url.pathname === "/jobs") {
        const body = (await readJsonBody(req)) as RenderJobSpec;
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          sendJson(res, 400, { error: "Job body must be a JSON object." });
          return;
        }
        const id = randomUUID();
        const record: RenderJobRecord = {
          id,
          spec: body,
          status: "queued",
          progress: 0,
          createdAt: new Date().toISOString(),
        };
        jobs.set(id, record);
        pendingIds.push(id);
        void pump();
        sendJson(res, 202, record);
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (err) {
      sendJson(res, 400, { error: (err as Error).message });
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => resolveListen());
  });

  const addr = server.address();
  const actualPort = typeof addr === "object" && addr ? addr.port : port;
  if (!quiet) {
    console.log(`Milyonus render worker listening on http://${host}:${actualPort}`);
  }

  return {
    server,
    port: actualPort,
    close: () =>
      new Promise<void>((res, rej) => {
        server.close((err) => (err ? rej(err) : res()));
      }),
  };
};
