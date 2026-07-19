/** Minimal File System Access API surface used by laoFile.ts (not yet in lib.dom). */

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: string | BufferSource | Blob): Promise<void>;
  close(): Promise<void>;
}

interface FileSystemFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface Window {
  showSaveFilePicker(options?: {
    suggestedName?: string;
    types?: FilePickerAcceptType[];
  }): Promise<FileSystemFileHandle>;
  showOpenFilePicker(options?: {
    types?: FilePickerAcceptType[];
    multiple?: boolean;
  }): Promise<FileSystemFileHandle[]>;
}
