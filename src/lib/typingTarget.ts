import { isTextEditActive } from "@/state/textEditFlag";

/** True when a key event belongs to an editable field (incl. Leafer TextEditor). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (isTextEditActive()) return true;
  if (elementIsTyping(target)) return true;
  if (typeof document === "undefined") return false;
  return elementIsTyping(document.activeElement);
}

function elementIsTyping(node: EventTarget | null): boolean {
  if (!node || !(node instanceof HTMLElement)) return false;
  const tag = node.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (node.isContentEditable) return true;
  return Boolean(node.closest("[contenteditable='true'], [contenteditable='']"));
}
