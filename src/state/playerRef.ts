import type { PlayerRef } from "@remotion/player";

/** shared mutable handle so the timeline can drive the preview Player */
export const playerRef: { current: PlayerRef | null } = { current: null };
