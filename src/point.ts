import { Easer } from "./easing.js";
import { Emitter, ListenFunc, UnsubscribeFunc } from "./emitters.js";
import { TimelineRange } from "./range.js";
import { Timeline } from "./timeline.js";

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
	/**
	 * Seeks the parent Timeline to this point
	 * @deprecated Use timeline.seek(point)
	 */
	seek(): void
	/**
	 * Smooth-seeks the parent Timeline to this point
	 * @deprecated Use timeline.seek(point)
	 */
	seek(duration: number, easer?: Easer): Promise<void>;
	seek(duration: number = 0, easer?: Easer) {
		return this.timeline.seek(this.position, duration, easer);
	}

	/**
	 * An point emitter that only emits on forward-moving seeks
	 * @returns Listenable: emits forward-seeking point events
	 */
	get forwardOnly() {
		if (!this._forwardOnly) this._forwardOnly = this.filter(1);
		return this._forwardOnly;
	}
	private _forwardOnly?: Emitter<PointEvent>;
	/**
	 * An point emitter that only emits on backward-moving seeks
	 * @returns Listenable: emits backward-seeking point events
	 */
	get reverseOnly() {
		if (!this._reverseOnly) this._reverseOnly = this.filter(-1);
		return this._reverseOnly;
	}
	private _reverseOnly?: Emitter<PointEvent>;

	filter(check: (event: PointEvent) => boolean): Emitter<PointEvent>
	/**
	 * Creates an emitter that forwards events emitted by seeks of a specific direction
	 * @param allow Direction to allow
	 * @returns Listenable: emits point events that match the given direction
	 */
	filter(allow: -1 | 1): Emitter<PointEvent>
	filter(arg: -1 | 1 | ((event: PointEvent) => boolean)) {
		const listen = this.transform(
			typeof arg == "number"
				? (value, emit) => {
					if (value.direction === arg) emit(value);
				}
				: (value, emit) => {
					if (arg(value)) emit(value);
				}
		)
		return new Emitter(listen);
	}

	/**
	 * Creates a Promise that will be resolved when the Timeline first seeks to/past this point
	 * 
	 * The resolved value indicates the direction of the seek that triggered resolution
	 * 
	 * @returns A Promise, resolved when the point is triggered by a seek
	 */
	promise() {
		return new Promise<-1 | 1>(resolve => {
			let remove = this.onListen((ev) => {
				remove();
				resolve(ev.direction);
			});
		});
	}

	/**
	 * Registers a pair of functions to handle seeks that reach or pass this point, depending on seek direction
	 * 
	 * @example
	 * ```
	 * point
	 * 	.applyDirectional(
	 *     () => element.classList.add("faded"),
	 *     () => element.classList.remove("faded"),
	 *   );
	 * ```
	 * 
	 * Note, for deterministic consistency, a forward-seek triggers points when it
	 * *passes or reaches* them, while a backward-seek triggers points when it
	 * *passes or departs from* them.
	 * @param apply Handler for forward-moving seeks that pass or reach this point
	 * @param revert Handler for backward-moving seeks that pass this point
	 * @returns A function to deregister both handlers
	 */
	applyDirectional(apply: () => void, revert: () => void): UnsubscribeFunc {
		return this.onListen(eventData => eventData.direction > 0
			? apply()
			: revert()
		);
	}

	/**
	 * Creates an emitter that forwards point events whose direction differs from the previous emission
	 * @returns Listenable: emits non-repeating point events
	 */
	dedupe(): Emitter<PointEvent> {
		if (!this._dedupe) {
			let previous = 0;
			const listen = this.transform(
				(value, emit) => {
					if (value.direction !== previous) {
						previous = value.direction;
						emit(value);
					}
				}
			)
			this._dedupe = new Emitter<PointEvent>(listen);
		}
		return this._dedupe;
	}
	private _dedupe?: Emitter<PointEvent>;

}
