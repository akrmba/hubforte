import { describe, expect, it, vi } from "vitest";
import { createWorkerPoller } from "../../worker/poller";

describe("worker poller", () => {
  it("does not schedule another cycle after shutdown is requested", async () => {
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const infoLogs: string[] = [];
    let poller!: ReturnType<typeof createWorkerPoller>;

    const fetchJson = vi.fn(async (url: string) => {
      if (url.endsWith("/api/campaigns?status=SENDING")) {
        return [{ id: "camp-1" }];
      }

      poller.requestShutdown();
      return { processed: 1, sent: 1, failed: 0 };
    });

    poller = createWorkerPoller({
      appUrl: "http://127.0.0.1:3000",
      workerSecret: "secret",
      pollIntervalMs: 60_000,
      fetchJson,
      scheduleNext: (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
      },
      logger: {
        info: (message) => {
          infoLogs.push(message);
        },
        error: () => undefined,
      },
    });

    await poller.runCycle();

    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(scheduled).toHaveLength(0);
    expect(infoLogs).toContain("Graceful shutdown complete");
  });
});
