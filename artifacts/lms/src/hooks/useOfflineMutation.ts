import { useState, useEffect, useCallback } from "react";
import { enqueue, replayQueue, getPendingCount } from "@/lib/offlineQueue";

/**
 * Hook for offline-aware mutations.
 * When online: sends directly. When offline: queues to IndexedDB.
 * Replays queue on reconnect.
 */
export function useOfflineMutation() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced">("idle");

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      setSyncStatus("syncing");
      const replayed = await replayQueue();
      const remaining = await getPendingCount();
      setPendingCount(remaining);
      setSyncStatus(replayed > 0 ? "synced" : "idle");
      if (replayed > 0) {
        setTimeout(() => setSyncStatus("idle"), 3000);
      }
    };

    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check pending count on mount
    getPendingCount().then(setPendingCount);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const mutate = useCallback(
    async (method: "PUT" | "POST", url: string, body: unknown): Promise<boolean> => {
      if (navigator.onLine) {
        try {
          const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
            body: JSON.stringify(body),
            credentials: "include",
          });
          if (res.ok) return true;
          // If server error, queue for retry
          if (res.status >= 500) {
            await enqueue({ method, url, body });
            const count = await getPendingCount();
            setPendingCount(count);
            return false;
          }
          return false;
        } catch {
          // Network error — queue it
          await enqueue({ method, url, body });
          const count = await getPendingCount();
          setPendingCount(count);
          return false;
        }
      } else {
        // Offline — queue it
        await enqueue({ method, url, body });
        const count = await getPendingCount();
        setPendingCount(count);
        return false;
      }
    },
    [],
  );

  return { isOnline, pendingCount, syncStatus, mutate };
}
