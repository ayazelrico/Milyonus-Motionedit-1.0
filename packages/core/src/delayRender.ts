type PendingHandle = {
  id: number;
  label: string;
  createdAt: number;
};

let nextHandleId = 1;
const pendingHandles = new Map<number, PendingHandle>();
let fatalRenderError: Error | null = null;
const waiters = new Set<() => void>();

const notifyWaiters = (): void => {
  if (pendingHandles.size === 0 || fatalRenderError !== null) {
    for (const notify of Array.from(waiters)) {
      notify();
    }
  }
};

/**
 * Signals `<FrameRenderer>` to hold screenshot capture until `continueRender(handle)` is called.
 * Useful when decoding images, seeking `<video>` elements, or loading frame-critical assets.
 */
export const delayRender = (label = "unnamed async resource"): number => {
  const id = nextHandleId++;
  pendingHandles.set(id, {
    id,
    label,
    createdAt: Date.now(),
  });
  return id;
};

/** Releases a handle previously created by `delayRender(label)`. */
export const continueRender = (handle: number): void => {
  pendingHandles.delete(handle);
  notifyWaiters();
};

/** Fails the active render immediately with `error` instead of hanging until timeout. */
export const cancelRender = (error: unknown): void => {
  fatalRenderError = error instanceof Error ? error : new Error(String(error));
  pendingHandles.clear();
  notifyWaiters();
};

/** Returns human-readable labels for all currently open `delayRender` handles. */
export const getPendingDelayRenders = (): string[] =>
  Array.from(pendingHandles.values()).map((h) => `#${h.id} (${h.label})`);

/** Clears any stale handles or canceled state (used between tests or composition switches). */
export const resetDelayRenders = (): void => {
  pendingHandles.clear();
  fatalRenderError = null;
  notifyWaiters();
};

/**
 * Awaits until all active `delayRender` handles are resolved via `continueRender`,
 * rejecting if `cancelRender` is called or `timeoutMs` elapses.
 */
export const waitForDelayRenders = (timeoutMs = 15000): Promise<void> => {
  if (fatalRenderError) {
    const err = fatalRenderError;
    fatalRenderError = null;
    return Promise.reject(err);
  }
  if (pendingHandles.size === 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(check);
      const labels = getPendingDelayRenders().join(", ");
      reject(new Error(`delayRender timed out after ${timeoutMs}ms waiting for: ${labels}`));
    }, timeoutMs);

    const check = () => {
      if (fatalRenderError) {
        clearTimeout(timer);
        waiters.delete(check);
        const err = fatalRenderError;
        fatalRenderError = null;
        reject(err);
        return;
      }
      if (pendingHandles.size === 0) {
        clearTimeout(timer);
        waiters.delete(check);
        resolve();
      }
    };

    waiters.add(check);
  });
};
