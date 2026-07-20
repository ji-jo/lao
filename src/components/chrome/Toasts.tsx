import { useEffect } from "react";
import {
  AnimatedToastStack,
  useAnimatedToastStack,
} from "@/components/motion/animated-toast-stack";
import { setToastHandler } from "@/state/toasts";

/** App-wide toast surface (@beui/animated-toast-stack), bottom-right. */
export function Toasts() {
  const { toasts, showToast, dismissToast } = useAnimatedToastStack({ limit: 4 });

  useEffect(() => {
    setToastHandler(showToast);
    return () => setToastHandler(null);
  }, [showToast]);

  return (
    <AnimatedToastStack
      toasts={toasts}
      onDismiss={dismissToast}
      position="top-right"
      placement="fixed"
      maxVisible={3}
      className="z-[90]"
    />
  );
}
