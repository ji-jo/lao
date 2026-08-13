import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import GiftBoxDemo from "@/demo/GiftBoxDemo";
import { createGiftBoxDemoProject } from "@/demo/giftBoxProject";
import { exportProject, downloadBlob } from "@/export/exportProject";
import type { Project } from "@/model/types";

declare global {
  interface Window {
    __giftBoxDemo: {
      project: Project;
      exportMp4: () => Promise<Blob>;
      exportMp4Base64: () => Promise<string>;
      downloadMp4: () => Promise<number>;
    };
  }
}

const project = createGiftBoxDemoProject();

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

window.__giftBoxDemo = {
  project,
  exportMp4: exportDemoMp4,
  exportMp4Base64: exportDemoMp4Base64,
  downloadMp4: async () => {
    const blob = await exportDemoMp4();
    downloadBlob(blob, "giftbox-demo.mp4");
    return blob.size;
  },
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GiftBoxDemo />
  </StrictMode>,
);
