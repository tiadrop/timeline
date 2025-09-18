import { Emitter } from "./emitters";
import { TimelineRange } from "./range";

export type PointEvent = {
	direction: -1 | 1;
};

export interface TimelinePoint extends Emitter<PointEvent> {
	/**
	 * Creates a range on the Timeline, with a given duration, starting at this point
	 * @param duration 
	 */
	range(duration: number): TimelineRange;
	/**
	 * Creates a range on the Timeline, with a given end point, starting at this point
	 * @param endPoint 
	 */
	to(endPoint: number | TimelinePoint): TimelineRange;
	/**
	 * Creates a point on the Timeline at an offset position from this one
	 * @param timeOffset
	 */
	delta(timeOffset: number): TimelinePoint;
	/**
	 * The point's absolute position on the Timeline
	 */
	readonly position: number;
}