import { createRef } from "react";
import type { PlayerRef } from "@remotion/player";

/** shared handle so the timeline can drive the preview Player */
export const playerRef = createRef<PlayerRef>();
