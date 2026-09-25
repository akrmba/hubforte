export interface WorkerPollerLogger {
  info: (message: string, details?: unknown) => void;
  error: (message: string, details?: unknown) => void;
}

export interface WorkerPollerCampaign {
  id: string;
}

export interface WorkerPollerDeps {
  appUrl: string;
  workerSecret: string;
  pollIntervalMs: number;
  fetchJson: (url: string, options?: RequestInit) => Promise<unknown>;
  scheduleNext: (callback: () => void, delayMs: number) => void;
  logger: WorkerPollerLogger;
}

export function createWorkerPoller(deps: WorkerPollerDeps) {
  let shuttingDown = false;

  const scheduleNextPoll = () => {
    if (shuttingDown) {
      deps.logger.info("Graceful shutdown complete");
      return;
    }

    deps.scheduleNext(() => {
      void runCycle();
    }, deps.pollIntervalMs);
  };

  const runCycle = async (): Promise<void> => {
    deps.logger.info("Poll cycle started", { at: new Date().toISOString() });

    try {
      const campaignsResponse = await deps.fetchJson(`${deps.appUrl}/api/campaigns?status=SENDING`, {
        headers: { "x-worker-secret": deps.workerSecret },
      });

      const campaigns = Array.isArray(campaignsResponse)
        ? (campaignsResponse as WorkerPollerCampaign[])
        : [];
      deps.logger.info(`Found ${campaigns.length} pending campaign(s)`);

      for (const campaign of campaigns) {
        if (shuttingDown) {
          deps.logger.info("Shutdown requested; stopping before next campaign");
          break;
        }

        deps.logger.info(`Processing campaign: ${campaign.id}`);
        const result = await deps.fetchJson(`${deps.appUrl}/api/worker/process-campaign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-worker-secret": deps.workerSecret,
          },
          body: JSON.stringify({ campaignId: campaign.id }),
        });
        deps.logger.info(`Campaign ${campaign.id} result`, result);
      }
    } catch (error) {
      deps.logger.error("Poll error", error);
    } finally {
      scheduleNextPoll();
    }
  };

  return {
    runCycle,
    requestShutdown() {
      shuttingDown = true;
      deps.logger.info("Graceful shutdown requested");
    },
    isShuttingDown() {
      return shuttingDown;
    },
  };
}
