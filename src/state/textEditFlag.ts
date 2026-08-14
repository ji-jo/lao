/** True while the Leafer text editor session is open (caret, not just selected). */
let active = false;

export function setTextEditActive(on: boolean) {
  active = on;
}

export function isTextEditActive(): boolean {
  return active;
}
