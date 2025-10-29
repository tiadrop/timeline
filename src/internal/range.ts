import { Easer, easers } from "./easing";
import { ListenFunc, RangeProgression } from "./emitters";
import { TimelinePoint } from "./point";
import { Timeline } from "./timeline";

export class TimelineRange extends RangeProgression {
	private endPosition: number;
	/** The point on the Timeline at which this range begins */
	readonly start: TimelinePoint;
	/** The point on the Timeline at which this range ends */
	readonly end: TimelinePoint;
	
	/** @internal Manual construction of RangeProgression is outside of the API contract and subject to undocumented change */
	constructor(
		onListen: ListenFunc<number>,
		private timeline: Timeline,
		private startPosition: number,
		/** The duration of this range */
		readonly duration: number,
	) {
		super(duration == 0
			? () => {
				throw new Error("Zero-duration ranges may not be listened")
			}
			: onListen
		);
		this.endPosition = startPosition + duration;
		this.end = timeline.point(this.endPosition);
		this.start = timeline.point(startPosition);
	}

	protected redirect(listen: ListenFunc<number>) {
		return new TimelineRange(listen, this.timeline, this.startPosition, this.duration);
	}

	/**
	 * Creates two ranges by seperating one at a given point
	 * @param position Point of separation, relative to the range's start - if omitted, the range will be separated halfway
	 * 
	 * Must be greater than 0 and less than the range's duration
	 * @returns Tuple of two ranges
	 */
	bisect(position: number = this.duration / 2): [TimelineRange, TimelineRange] {
		return [
			this.timeline.range(this.startPosition, position),
			this.timeline.range(
				position + this.startPosition,
				this.duration - position
			),
		];
	}
	/**
	 * Creates a series of evenly-spread points across the range, excluding the range's start and end
	 * @param count Number of Points to return
	 * @returns Array(count) of points
	 */
	spread(count: number): TimelinePoint[] {
		const delta = this.duration / (count + 1);
		return [
			...Array(count).fill(0).map((_, idx) => this.timeline.point(idx * delta + this.startPosition + delta))
		];
	}
	/**
	 * Creates the specified number of ranges, each of `(parent.duration / count)` duration, spread
	 * evenly over this range
	 * @param count Number of sub-ranges to create
	 * @returns Array of sub-ranges
	 */
	subdivide(count: number): TimelineRange[] {
		const duration = this.duration / count;
		return Array.from({length: count}, (_, i) => 
			this.timeline.range(this.startPosition + i * duration, duration)
		)
	}
	/**
	 * Creates a new range by offsetting the parent by a given time delta
	 * @param delta
	 * @returns Offset range
	 */
	shift(delta: number): TimelineRange {
		return this.timeline.range(this.startPosition + delta, this.duration);
	}
	/**
	 * Progresses the Timeline across the range at 1000 units per second
	 * @param easer Optional easing function
	 * @returns Promise, resolved when the end is reached
	 * @deprecated Use timeline.play(range, easer?)
	 */
	play(easer?: Easer | keyof typeof easers): Promise<void> {
		this.timeline.pause();
		this.timeline.currentTime = this.startPosition;
		return this.timeline.seek(
			this.end,
			this.duration,
			easer
		);
	}
	/**
	 * Creates a new range representing a direct expansion of this one
	 * @param delta Amount to grow by (in time units)
	 * @param anchor Normalised position at which to expand (0 being the start, expanding right, 1 being the end, expanding left, 0.5 expanding evenly)
	 * @returns Listenable: this range will emit a progression value (0..1) when a `seek()` passes or intersects it
	 */
	grow(delta: number, anchor: number = 0): TimelineRange {
		return this.timeline.range(
			this.startPosition - (delta * anchor),
			this.duration + delta
		)
	}
	/**
	 * Creates a new range representing a multiplicative expansion of this one
	 * @param factor Size multiplier
	 * @param anchor Normalised position at which to expand (0 being the start, expanding right, 1 being the end, expanding left, 0.5 expanding evenly)
	 * @returns Listenable: this range will emit a progression value (0..1) when a `seek()` passes or intersects it
	 */
	scale(factor: number, anchor: number = 0): TimelineRange {
		if (factor <= 0) {
			throw new RangeError('Scale factor must be > 0');
		}

		return this.grow((factor - 1) * this.duration, anchor);
	}
	/**
	 * Checks if a point is within this range
	 * @param point The point to check
	 * @returns true if the provided point is within the range
	 */
	contains(point: TimelinePoint | number): boolean
	/**
	 * Checks if a range is fully within this range
	 * @param range The range to check
	 * @returns true if the provided range is within the parent
	 */
	contains(range: TimelineRange): boolean
	contains(target: TimelinePoint | TimelineRange | number): boolean {
		if (typeof target == "number") {
			return target >= this.startPosition && target < this.endPosition;
		}
		const [targetStart, targetEnd] = target instanceof TimelinePoint
			? [target.position, target.position]
			: [target.startPosition, target.startPosition + target.duration];
		return targetStart >= this.startPosition && targetEnd < this.endPosition;
	}
	overlaps(range: TimelineRange): boolean
	overlaps(range: {position: number, duration: number}): boolean
	overlaps(range: TimelineRange | {position: number, duration: number}) {
		const [start, end] = range instanceof TimelineRange
			? [range.startPosition, range.endPosition]
			: [range.position, range.position + range.duration];
		return this.startPosition <= end && this.endPosition >= start;
	}
}
