import { ProgressionEmitter } from "./emitters.js";

export { Timeline, ChainingInterface } from "./timeline.js";
export { animate } from "./animate.js";
export { type TimelinePoint, PointEvent, type PointEmitter } from "./point.js";
export { type TimelineRange } from "./range.js";
export { type Emitter, type ProgressionEmitter, UnsubscribeFunc } from "./emitters.js";
export { easers } from "./easing.js";

/**
 * Compatibility alias for `ProgressionEmitter`
 * @deprecated Use `ProgressionEmitter`
 */
export type RangeProgression = ProgressionEmitter;