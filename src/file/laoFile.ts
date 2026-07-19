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

export async function openLaoFile(): Promise<Project | null> {
  if ("showOpenFilePicker" in window) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: PICKER_TYPES });
      const file = await handle.getFile();
      return parseLao(await file.text());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      throw err;
    }
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".lao";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(parseLao(await file.text()));
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
}
