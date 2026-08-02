/**
 * Mounts the Highlighters tool tray plus the live-selection marker.
 *
 * `SelectionStyleProvider` holds the chosen ink/pen/opacity; `Dock` is the UI
 * that edits it and `SelectionMarker` is what actually paints the user's
 * selection. Both have to sit inside the same provider.
 */
import { Component, type ReactNode } from 'react';
import { LazyMotion, domMax } from 'motion/react';
import { SelectionStyleProvider } from '../selection-style';
import { SelectionMarker } from './SelectionMarker';
import { BrushCanvas } from './BrushCanvas';
import { Dock } from './dock/Dock';

/**
 * The dock is an enhancement, not core content: if it throws, drop it quietly
 * rather than taking the page down. Without this the island renders empty and
 * the actual error is swallowed, which is painful to diagnose — so log it.
 */
class DockBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('[HighlighterDock] failed to render', error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function HighlighterDock() {
  return (
    // The dock is built on framer's lightweight `m` components, which only
    // animate inside a LazyMotion feature provider — without it the tray stays
    // frozen in its entrance state (blurred, offset below the fold). `domMax`
    // rather than `domAnimation` because the tray is draggable.
    <DockBoundary>
      <LazyMotion features={domMax}>
        <SelectionStyleProvider>
          <SelectionMarker />
          <BrushCanvas />
          <Dock />
        </SelectionStyleProvider>
      </LazyMotion>
    </DockBoundary>
  );
}
