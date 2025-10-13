import { Easer } from "./easing";
import { Emitter, ListenFunc } from "./emitters";
import { TimelineRange } from "./range";
import { Timeline } from "./timeline";

export type PointEvent = {
	readonly direction: -1 | 1;
};

export class TimelinePoint extends Emitter<PointEvent> {
	/** @internal Manual construction of TimelinePoint is outside of the API contract and subject to undocumented change */
	constructor(
		onListen: ListenFunc<PointEvent>,
		private timeline: Timeline,
		/**
		 * The point's absolute position on the Timeline
		 */
		readonly position: number
	) {
		super(onListen);
	}

	protected redirect = (listen: ListenFunc<PointEvent>) =>
		new TimelinePoint(listen, this.timeline, this.position);

	/**
	 * Creates a range on the Timeline, with a given duration, starting at this point
	 * @param duration 
	 * @returns Listenable: emits normalised (0..1) range progression
	 */
	range(duration: number): TimelineRange {
		return this.timeline.range(this.position, duration);
	}
	/**
	 * Creates a range on the Timeline, with a given end point, starting at this point
	 * @param endPoint 
	 * @returns Listenable: emits normalised (0..1) range progression
	 */
	to(endPoint: number | TimelinePoint): TimelineRange {
		const endPosition = typeof endPoint == "number"
			? endPoint
			: endPoint.position;
		return this.timeline.range(this.position, endPosition - this.position);
	}
	/**
	 * Creates a point on the Timeline at an offset position from this one
	 * @param timeOffset
	 * @returns Listenable: emits a PointEvent when the point is reached or passed by a Timeline seek
	 */
	delta(timeOffset: number): TimelinePoint {
		return this.timeline.point(this.position + timeOffset);
	}
	seek(): void
	seek(duration?: number, easer?: Easer): void;
	seek(duration: number = 0, easer?: Easer) {
		this.timeline.seek(this.position, duration, easer);
	}
}
