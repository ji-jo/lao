import { toast } from "sonner";

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Info toast — file saved / opened / copied, etc. */
export function toastInfo(title: string, description?: string) {
  toast(title, description ? { description } : undefined);
}

export function toastSuccess(title: string, description?: string) {
  toast.success(title, description ? { description } : undefined);
}

export function toastError(title: string, err?: unknown) {
  toast.error(title, err !== undefined ? { description: errMessage(err) } : undefined);
}

export function toastSaved(name?: string) {
  toastSuccess("File saved", name ? `${name}.lao` : undefined);
}

export function toastOpened(name?: string) {
  toastSuccess("File opened", name);
}

export function toastExported(format: string, name?: string) {
  const label = format.toUpperCase();
  toastSuccess(`Exported ${label}`, name ? `${name}.${format}` : undefined);
}

export function toastCopied(what = "Copied to clipboard") {
  toastSuccess(what);
}
