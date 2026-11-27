# Cloud & Queue Rendering

Motionedit renders ordinary web pages in headless Chromium and encodes with FFmpeg. No proprietary cloud SDK is required.

---

## 1. Single-VM Setup (Ubuntu 24.04 / Docker)

Install Node.js 20+, Chromium/Chrome, and FFmpeg:

```dockerfile
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ffmpeg \
    fonts-liberation \
    fonts-noto-color-emoji \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY . .
RUN npm ci && npm run build

EXPOSE 4321
CMD ["npx", "milyonus", "worker", "--port", "4321"]
```

On a multi-core VM, pass `--concurrency <cores>` to parallelize frame capture across headless tabs:

```bash
npx milyonus render \
  --serve examples/hello-world \
  --composition hello \
  --props '{"title":"Cloud Render"}' \
  --concurrency 4 \
  --out /var/renders/hello.mp4
```

---

## 2. HTTP Render Queue Worker

Start a queue worker daemon on a VM or container:

```bash
npx milyonus worker --port 4321 --host 0.0.0.0
```

### Endpoints

- **`GET /health`** — Worker liveness and queue counts (`queued`, `rendering`, `completed`, `failed`).
- **`POST /jobs`** — Enqueue a `render` or `still` job (returns `202 Accepted` with job `id`).
- **`GET /jobs`** — List all jobs.
- **`GET /jobs/:id`** — Poll job progress (`0..1`), status, output path, or error.

Example enqueue request:

```bash
curl -X POST http://localhost:4321/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "render",
    "url": "http://127.0.0.1:5173/?render=1",
    "composition": "hello",
    "props": { "title": "Customer #42" },
    "concurrency": 4,
    "out": "out/customer-42.mp4"
  }'
```

For batch offline processing without an HTTP server, pass `--queue`:

```bash
npx milyonus worker --queue jobs.json
```

---

## 3. Distributed Multi-Worker Chunk Rendering & Stitching

For long compositions, split `[0, durationInFrames)` across multiple VMs or containers with `--from-frame` and `--to-frame`, then concatenate losslessly with `milyonus stitch`:

```bash
# Worker A: frames [0, 45)
npx milyonus render --url https://preview.internal/?render=1 --from-frame 0 --to-frame 45 --out chunks/part-0.mp4

# Worker B: frames [45, 90)
npx milyonus render --url https://preview.internal/?render=1 --from-frame 45 --to-frame 90 --out chunks/part-1.mp4

# Coordinator: lossless FFmpeg concat (-c copy)
npx milyonus stitch --chunks chunks/part-0.mp4,chunks/part-1.mp4 --out out/final.mp4
```

Audio tracks inside `<Sequence>` windows are automatically sliced and aligned to each chunk's `[fromFrame, toFrame)` interval so concatenated chunks stay frame- and sample-aligned.
