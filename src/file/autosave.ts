import type { Project, ProjectWorkflow } from "@/model/types";
import { useProject } from "@/state/project";
import { useWorkflowMemory } from "@/state/workflowMemory";

/** IndexedDB autosave — crash/refresh recovery, separate from explicit .lao saves. */

const DB_NAME = "lao";
const STORE = "autosave";
const KEY = "latest";
const DEBOUNCE_MS = 1000;

export interface AutosaveRecord {
  project: Project;
  savedAt: number;
  workflowMemory?: Partial<Record<ProjectWorkflow, Project>>;
}

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

export async function readAutosave(): Promise<AutosaveRecord | null> {
  try {
    const db = await openDb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(tx.error);
    });
    db.close();
    if (!value || typeof value !== "object") return null;
    return value as AutosaveRecord;
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

function snapshotForAutosave(): AutosaveRecord {
  const project = useProject.getState().project;
  const workflow = project.workflow ?? "animatron";
  return {
    project,
    savedAt: Date.now(),
    workflowMemory: useWorkflowMemory.getState().projectsForSave(workflow),
  };
}

/** subscribe to the project store and persist snapshots, debounced */
export function startAutosave(): () => void {
  let timer = 0;
  const unsub = useProject.subscribe((s, prev) => {
    if (s.project === prev.project) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      void put(snapshotForAutosave());
    }, DEBOUNCE_MS);
  });
  return () => {
    window.clearTimeout(timer);
    unsub();
  };
}
