export type WorkerRuntimeStatus = "idle" | "running" | "shutting_down" | "error";

export interface WorkerRuntimeSnapshot {
  status: WorkerRuntimeStatus;
  lastHeartbeatAt: string | null;
  lastAction: string | null;
  lastCampaignId: string | null;
  lastContactId: string | null;
  consecutiveFailures: number;
  lastError: string | null;
  shuttingDown: boolean;
}

interface WorkerRuntimeUpdate {
  status?: WorkerRuntimeStatus;
  action?: string;
  campaignId?: string | null;
  contactId?: string | null;
  consecutiveFailures?: number;
  lastError?: string | null;
  shuttingDown?: boolean;
}

const initialSnapshot = (): WorkerRuntimeSnapshot => ({
  status: "idle",
  lastHeartbeatAt: null,
  lastAction: null,
  lastCampaignId: null,
  lastContactId: null,
  consecutiveFailures: 0,
  lastError: null,
  shuttingDown: false,
});

let snapshot = initialSnapshot();

export function updateWorkerRuntimeState(update: WorkerRuntimeUpdate): WorkerRuntimeSnapshot {
  const heartbeatAt = new Date().toISOString();

  snapshot = {
    status: update.status ?? snapshot.status,
    lastHeartbeatAt: heartbeatAt,
    lastAction: update.action ?? snapshot.lastAction,
    lastCampaignId: update.campaignId === undefined ? snapshot.lastCampaignId : update.campaignId,
    lastContactId: update.contactId === undefined ? snapshot.lastContactId : update.contactId,
    consecutiveFailures: update.consecutiveFailures ?? snapshot.consecutiveFailures,
    lastError: update.lastError === undefined ? snapshot.lastError : update.lastError,
    shuttingDown: update.shuttingDown ?? snapshot.shuttingDown,
  };

  return { ...snapshot };
}

export function recordWorkerHeartbeat(update: WorkerRuntimeUpdate): WorkerRuntimeSnapshot {
  return updateWorkerRuntimeState(update);
}

export function getWorkerRuntimeSnapshot(): WorkerRuntimeSnapshot {
  return { ...snapshot };
}

export function resetWorkerRuntimeSnapshot(): void {
  snapshot = initialSnapshot();
}
