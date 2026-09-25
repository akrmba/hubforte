/**
 * Offline queue — IndexedDB-backed storage for attendance, scores, and narratives.
 * Queues mutations when offline and replays them on reconnect.
 */

const DB_NAME = "lms_offline_queue";
const DB_VERSION = 1;
const STORE_NAME = "pending_mutations";

export interface QueuedMutation {
  id: string;
  method: "PUT" | "POST";
  url: string;
  body: unknown;
  createdAt: number;
  retries: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(mutation: Omit<QueuedMutation, "id" | "createdAt" | "retries">): Promise<string> {
  const db = await openDb();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: QueuedMutation = { ...mutation, id, createdAt: Date.now(), retries: 0 };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function dequeue(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllPending(): Promise<QueuedMutation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function incrementRetries(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result as QueuedMutation | undefined;
      if (entry) {
        entry.retries++;
        store.put(entry);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const MAX_RETRIES = 5;

/**
 * Replay all pending mutations. Called on reconnect and periodically.
 * Returns the number of successfully replayed mutations.
 */
export async function replayQueue(): Promise<number> {
  const pending = await getAllPending();
  let replayed = 0;

  for (const mutation of pending) {
    if (mutation.retries >= MAX_RETRIES) {
      await dequeue(mutation.id);
      continue;
    }

    try {
      const res = await fetch(mutation.url, {
        method: mutation.method,
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(mutation.body),
        credentials: "include",
      });

      if (res.ok) {
        await dequeue(mutation.id);
        replayed++;
      } else if (res.status >= 400 && res.status < 500) {
        // Client error — don't retry, discard
        await dequeue(mutation.id);
      } else {
        await incrementRetries(mutation.id);
      }
    } catch {
      // Network error — keep in queue for next replay
      await incrementRetries(mutation.id);
    }
  }

  return replayed;
}
