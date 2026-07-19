import type { Project } from "@/model/types";
import { useProject } from "@/state/project";

/** IndexedDB autosave — crash/refresh recovery, separate from explicit .lao saves. */

const DB_NAME = "lao";
const STORE = "autosave";
const KEY = "latest";
const DEBOUNCE_MS = 1000;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(value: unknown) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function readAutosave(): Promise<{ project: Project; savedAt: number } | null> {
  try {
    const db = await openDb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!value || typeof value !== "object") return null;
    return value as { project: Project; savedAt: number };
  } catch {
    return null;
  }
}

export async function clearAutosave() {
  try {
    await put(null);
  } catch {
    // best-effort
  }
}

/** subscribe to the project store and persist snapshots, debounced */
export function startAutosave(): () => void {
  let timer = 0;
  const unsub = useProject.subscribe((s, prev) => {
    if (s.project === prev.project) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void put({ project: useProject.getState().project, savedAt: Date.now() });
    }, DEBOUNCE_MS);
  });
  return () => {
    window.clearTimeout(timer);
    unsub();
  };
}
