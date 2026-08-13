import { Toaster } from "sonner";
import { PAPER } from "@/components/chrome/paper-tokens";

/** App-wide sonner host — Paper surface / text / outline. */
export function LaoToaster() {
  return (
    <Toaster
      position="top-center"
      expand={false}
      closeButton
      theme="dark"
      visibleToasts={3}
      gap={8}
      offset={16}
      toastOptions={{
        duration: 3200,
        style: {
          background: PAPER.surface,
          color: PAPER.text,
          border: `1px solid ${PAPER.outline}`,
          borderRadius: 12,
          fontFamily: PAPER.fontSans,
          fontSize: 13,
          boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
        },
        classNames: {
          description: "lao-toast-description",
          closeButton: "lao-toast-close",
          success: "lao-toast-success",
          error: "lao-toast-error",
        },
      }}
    />
  );
}
