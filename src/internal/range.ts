import { Easer, easers } from "./easing";
import { RangeProgression } from "./emitters";
import { TimelinePoint } from "./point";

export interface TimelineRange extends RangeProgression {
	/**
	 * Creates two ranges by seperating one at a given point
	 * @param position Point of separation, relative to the range's start - if omitted, the range will be separated halfway
	 * 
	 * Must be greater than 0 and less than the range's duration
	 * @returns Tuple of two ranges
	 */
	bisect(position?: number): [TimelineRange, TimelineRange];
	/**
	 * Creates a series of evenly-spread points across the range, excluding the range's start and end
	 * @param count Number of Points to return
	 * @returns Array(count) of points
	 */
	spread(count: number): TimelinePoint[];
	/**
	 * Progresses the Timeline across the range
	 * @param easer 
	 */
	play(easer?: Easer | keyof typeof easers): Promise<void>;
	/**
	 * Creates a new range representing a direct expansion of this one
	 * @param delta Amount to grow by (in time units)
	 * @param anchor Normalised position at which to expand (0 being the start, expanding right, 1 being the end, expanding left, 0.5 expanding evenly)
	 * @returns Listenable: this range will emit a progression value (0..1) when a `seek()` passes or intersects it
	 */
	grow(delta: number, anchor?: number): TimelineRange;
	/**
	 * Creates a new range representing a multiplicative expansion of this one
	 * @param factor Size multiplier
	 * @param anchor Normalised position at which to expand (0 being the start, expanding right, 1 being the end, expanding left, 0.5 expanding evenly)
	 * @returns Listenable: this range will emit a progression value (0..1) when a `seek()` passes or intersects it
	 */
	scale(factor: number, anchor?: number): TimelineRange;
	/**
	 * Checks if a point is within this range
	 * @param point The point to check
	 * @returns true if the provided point is within the range
	 */
	contains(point: TimelinePoint): boolean;
	/** The point on the Timeline at which this range begins */
	readonly start: TimelinePoint;
	/** The point on the Timeline at which this range ends */
	readonly end: TimelinePoint;
	/** The duration of this range */
	readonly duration: number;
}

