import type { Project } from "@/model/types";
import { downloadBlob } from "@/export/exportProject";

/** .lao — versioned JSON container for a full project */

interface LaoDocument {
  format: "lao";
  version: 1;
  savedAt: string;
  project: Project;
}

export function serializeProject(project: Project): string {
  const doc: LaoDocument = {
    format: "lao",
    version: 1,
    savedAt: new Date().toISOString(),
    project,
  };
  return JSON.stringify(doc);
}

export function parseLao(text: string): Project {
  const doc = JSON.parse(text) as Partial<LaoDocument>;
  if (doc.format !== "lao") throw new Error("Not a .lao file");
  if (doc.version !== 1) throw new Error(`Unsupported .lao version: ${doc.version}`);
  const p = doc.project;
  if (!p || !Array.isArray(p.layers) || typeof p.width !== "number")
    throw new Error("Corrupt .lao file");
  return p;
}

const PICKER_TYPES = [
  {
    description: "Lao animation",
    accept: { "application/lao+json": [".lao"] as [".lao"] },
  },
];

/** Save via File System Access API; plain download fallback for browsers without it. */
export async function saveLaoFile(project: Project): Promise<boolean> {
  const text = serializeProject(project);
  const name = `${project.name || "untitled"}.lao`;
  if ("showSaveFilePicker" in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: PICKER_TYPES,
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return false;
      throw err;
    }
  }
  downloadBlob(new Blob([text], { type: "application/json" }), name);
  return true;
}

/**
 * Open via `<input type="file">`.
 *
 * Prefer this over `showOpenFilePicker` + `getFile()`: several embeddings
 * (Cursor Simple Browser, some Electron webviews, strict Edge) expose the
 * picker API but reject `getFile()` with NotAllowedError ("not allowed by
 * the user agent or the platform in the current context").
 */
function openLaoViaInput(): Promise<Project | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".lao,application/json";
    let settled = false;
    const finish = (result: Project | null) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    input.addEventListener("cancel", () => finish(null));
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      try {
        finish(parseLao(await file.text()));
      } catch (err) {
        settled = true;
        reject(err);
      }
    };
    input.click();
  });
}

export async function openLaoFile(): Promise<Project | null> {
  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: PICKER_TYPES,
        multiple: false,
      });
      // Re-prompt read permission when the handle exists but access was revoked
      // (or never granted in this context).
      const permissive = handle as FileSystemFileHandle & {
        queryPermission?: (opts?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
        requestPermission?: (opts?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
      };
      if (typeof permissive.queryPermission === "function") {
        let state = await permissive.queryPermission({ mode: "read" });
        if (state !== "granted" && typeof permissive.requestPermission === "function") {
          state = await permissive.requestPermission({ mode: "read" });
        }
        if (state !== "granted") return openLaoViaInput();
      }
      const file = await handle.getFile();
      return parseLao(await file.text());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      // Restricted context: fall back to the classic file input (one more pick).
      const name = err instanceof DOMException ? err.name : "";
      const msg = err instanceof Error ? err.message : String(err);
      if (
        name === "NotAllowedError" ||
        name === "SecurityError" ||
        msg.includes("getFile")
      ) {
        return openLaoViaInput();
      }
      throw err;
    }
  }
  return openLaoViaInput();
}
