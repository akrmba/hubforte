import { createWorkerPoller } from "./poller";

const APP_URL = process.env.APP_URL || "";
const WORKER_SECRET = process.env.WORKER_SECRET || "";
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_SECONDS || "60", 10) * 1000;

if (!APP_URL || !WORKER_SECRET) {
  console.error("APP_URL and WORKER_SECRET must be set");
  process.exit(1);
}

async function fetchJson(url: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, options);
  return response.json();
}

const poller = createWorkerPoller({
  appUrl: APP_URL,
  workerSecret: WORKER_SECRET,
  pollIntervalMs: POLL_INTERVAL,
  fetchJson,
  scheduleNext: (callback, delayMs) => {
    setTimeout(callback, delayMs);
  },
  logger: {
    info: (message, details) => {
      if (details === undefined) {
        console.log(message);
        return;
      }
      console.log(message, details);
    },
    error: (message, details) => {
      console.error(message, details);
    },
  },
});

const requestShutdown = (signal: string) => {
  console.log(`Received ${signal}; finishing current work before shutdown.`);
  poller.requestShutdown();
};

process.on("SIGINT", () => requestShutdown("SIGINT"));
process.on("SIGTERM", () => requestShutdown("SIGTERM"));

console.log("CRM Worker started. App URL:", APP_URL);
console.log(`Polling every ${POLL_INTERVAL / 1000}s`);
void poller.runCycle();
