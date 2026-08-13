import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import TriangleDemo from "@/demo/TriangleDemo";
import { createTriangleDemoProject } from "@/demo/triangleProject";
import { exportProject, downloadBlob } from "@/export/exportProject";
import type { Project } from "@/model/types";

declare global {
  interface Window {
    __triangleDemo: {
      project: Project;
      exportMp4: () => Promise<Blob>;
      exportMp4Base64: () => Promise<string>;
      downloadMp4: () => Promise<number>;
    };
  }
}

const project = createTriangleDemoProject();

async function exportDemoMp4(): Promise<Blob> {
  return exportProject(project, "mp4");
}

async function exportDemoMp4Base64(): Promise<string> {
  const blob = await exportDemoMp4();
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

window.__triangleDemo = {
  project,
  exportMp4: exportDemoMp4,
  exportMp4Base64: exportDemoMp4Base64,
  downloadMp4: async () => {
    const blob = await exportDemoMp4();
    downloadBlob(blob, "triangle-demo.mp4");
    return blob.size;
  },
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TriangleDemo />
  </StrictMode>,
);
