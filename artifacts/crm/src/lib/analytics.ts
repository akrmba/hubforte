import { getLastRequestId } from './api';

const MAX_ENTRIES = 100;
const buffer: Array<{ timestamp: string; event: string; route: string; requestId: string | null; [key: string]: unknown }> = [];

export function logUserAction(event: string, details?: Record<string, unknown>): void {
  buffer.push({
    timestamp: new Date().toISOString(),
    event,
    route: window.location.pathname,
    requestId: getLastRequestId(),
    ...details
  });

  if (buffer.length > MAX_ENTRIES) {
    buffer.shift();
  }
}

export function getRecentActions(count = 10) {
  return buffer.slice(-count);
}
