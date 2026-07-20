import type { ToastInput } from "@/components/motion/animated-toast-stack";

/**
 * Bridge so non-React code (save/export/file handlers) can raise toasts.
 * <Toasts /> registers the handler on mount.
 */
type Handler = (input: ToastInput) => string;

let handler: Handler | null = null;

export function setToastHandler(next: Handler | null) {
  handler = next;
}

export function toast(input: ToastInput) {
  return handler?.(input);
}

export const notify = {
  success: (title: string, description?: string) =>
    toast({ title, description, status: "success" }),
  error: (title: string, description?: string) =>
    toast({ title, description, status: "error", duration: 7000 }),
  info: (title: string, description?: string) =>
    toast({ title, description, status: "info" }),
};
