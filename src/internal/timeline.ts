import { Easer, easers } from "./easing";
import { RangeProgression } from "./emitters";
import { PointEvent, TimelinePoint } from "./point";
import { TimelineRange } from "./range";
import { Tweenable } from "./tween";
import { clamp, Widen } from "./utils";

const default_fps = 60;

const EndAction = {
	pause: 0,
	continue: 1,
	wrap: 2,
	restart: 3,
} as const;

type PointData = {
	position: number;
	handlers: ((event: PointEvent) => void)[];
};

type RangeData = {
	position: number;
	duration: number;
	handlers: ((progress: number) => void)[];
};

/**
 * Creates an autoplaying Timeline and returns a range from it
 * @param duration Animation duration, in milliseconds
 * @returns Object representing a range on a single-use, autoplaying Timeline
 */
export function animate(duration: number) {
	return new Timeline(true).range(0, duration);
}

export class Timeline {
	/**
	 * Multiplies the speed at which `play()` progresses through the Timeline
	 * 
	 * A value of 2 would double progression speed while .25 would slow it to a quarter
	 */
	public timeScale: number = 1;
	get currentTime() { return this._currentTime; }
	set currentTime(v) {
		this.seek(v);
	}
	get isPlaying() {
		return this.interval !== null;
	}
	get end() {
		return this.point(this._endPosition);
	}

	private _currentTime: number = 0;
	private _endPosition: number = 0;
	private interval: (ReturnType<typeof setInterval>) | null = null;

	private points: PointData[] = [];
	private endAction: {
		type: typeof EndAction.wrap | typeof EndAction.restart,
		at: TimelinePoint;
	} | {
		type: typeof EndAction.continue;
	} | {
		type: typeof EndAction.pause;
	};

	private ranges: RangeData[] = [];

	private currentSortDirection: -1 | 0 | 1 = 0;
	private smoothSeeker: Timeline | null = null;
	private seeking: boolean = false;

	readonly start = this.point(0);

	private progressionHandlers: ((n: number) => void)[] = [];
	private _progression: null | RangeProgression = null;
	
	/**
	 * Listenable: emits a progression value (0..1) when the Timeline's internal
	 * position changes, and when the Timeline's total duration is extended
	 * 
	 * **Experimental**
	 */
	get progression(): RangeProgression {
		if (this._progression === null) this._progression = new TimelineProgressionEmitter(this.progressionHandlers);
		return this._progression;
	}

	constructor();
	/**
	 * @param autoplay Pass `true` to begin playing at (1000 × this.timeScale) units per second immediately on creation
	 */
	constructor(autoplay: boolean);
	/**
	 * Creates a Timeline that begins playing immediately at (1000 × this.timeScale) units per second
	 * @param autoplayFps Specifies frames per second
	 */
	constructor(autoplayFps: number);
	/**
	 * @param autoplay If this argument is `true`, the Timeline will begin playing immediately on creation. If the argument is a number, the Timeline will begin playing at the specified frames per second
	 * @param endAction Specifies what should happen when the final position is passed by `play()`/`autoplay`
	 * 
	 * * `"pause"`: **(default)** the Timeline will pause at its final position  
	 * * `"continue"`: The Timeline will continue progressing beyond its final position  
	 * * `"restart"`: The Timeline will seek back to 0 then forward to account for any overshoot and continue progressing  
	 * * `"wrap"`: The Timeline's position will continue to increase beyond the final position, but Points and Ranges will be activated as if looping  
	 * * `{restartAt: number}`: Like `"restart"` but seeking back to `restartAt` instead of 0  
	 * * `{wrapAt: number}`: Like `"wrap"` but as if restarting at `wrapAt` instead of 0
	 */
	constructor(autoplay: boolean | number, endAction: { wrapAt: number; } | { restartAt: number; } | keyof typeof EndAction);
	/**
	 * @deprecated "loop" endAction will be removed; use "restart" or `{restartAt: 0}` (disambiguates new looping strategies)
	 */
	constructor(autoplay: boolean | number, endAction: "loop");
	constructor(autoplay: boolean | number = false, endAction: { wrapAt: number; } | { restartAt: number; } | "loop" | keyof typeof EndAction = "pause") {
		if (endAction == "loop") endAction = "restart";
		if (autoplay !== false) {
			this.play(typeof autoplay == "number" ? autoplay : default_fps);
		}

		if (
			typeof endAction == "object"
			&& "restartAt" in endAction
		) {
			this.endAction = {
				type: EndAction.restart,
				at: this.point(endAction.restartAt),
			};
		} else if (
			typeof endAction == "object"
			&& "wrapAt" in endAction
		) {
			this.endAction = {
				type: EndAction.wrap,
				at: this.point(endAction.wrapAt),
			};
		} else this.endAction = {
			type: EndAction[endAction],
			at: this.point(0),
		};

	}

	/**
	 * Defines a single point on the Timeline
	 * 
	 * @param position
	 * @returns A point on the Timeline as specified
	 * 
	 * Listenable: this point will emit a PointEvent whenever a `seek()` reaches or passes it
	 */
	point(position: number): TimelinePoint {
		if (position > this._endPosition) {
			this._endPosition = position;
			this.progressionHandlers.slice().forEach(h => h(this._currentTime / position));
		}

		const handlers: ((event: PointEvent) => void)[] = [];
		const data: PointData = {
			handlers,
			position,
		};

		const addHandler = (handler: (data: PointEvent) => void) => {
			if (this.seeking) throw new Error("Can't add a listener while seeking");
			// we're adding and removing points and ranges to the internal registry according to whether any subscriptions are active, to allow obsolete points and ranges to be garbage-collected
			if (handlers.length == 0) {
				this.points.push(data);
				this.currentSortDirection = 0;
			}
			handlers.push(handler);
			return () => {
				const idx = handlers.indexOf(handler);
				if (idx === -1) throw new Error("Internal error: attempting to remove a non-present handler");
				handlers.splice(idx, 1);
				if (handlers.length == 0) {
					const idx = this.points.indexOf(data);
					this.points.splice(idx, 1);
				}
			};
		};

		return new TimelinePoint(
			addHandler,
			this,
			position
		);

	}

	/**
	 * Defines a range on this Timeline
	 * 
	 * @param start The position on this Timeline at which the range starts
	 * @param duration Length of the resulting range - if omitted, the range will end at the Timeline's **current** final position
	 * @returns A range on the Timeline
	 * 
	 * Listenable: this range will emit a progression value (0..1) when a `seek()` passes or intersects it
	 */
	range(start: number | TimelinePoint, duration?: number): TimelineRange;
	/**
	 * Creates an observable range from position 0 to the Timeline's **current** final position
	 */
	range(): TimelineRange;
	range(start: number | TimelinePoint = 0, optionalDuration?: number): TimelineRange {
		const startPoint = typeof start == "number"
			? this.point(start)
			: start;
		const startPosition = startPoint.position;
		const duration = optionalDuration ?? this._endPosition - startPosition;

		// const endPosition = startPosition + duration;
		//if (endPosition > this._endPosition) this._endPosition = endPosition;
		// ^ leave this to range's point() calls

		const handlers: ((value: number) => void)[] = [];
		const range: RangeData = {
			position: startPosition,
			duration,
			handlers,
		};

		const addHandler = (handler: (value: number) => void) => {
			if (this.seeking) throw new Error("Can't add a listener while seeking");

			if (handlers.length == 0) {
				this.ranges.push(range);
				this.currentSortDirection = 0;
			}
			handlers.push(handler);
			return () => {
				const idx = handlers.indexOf(handler);
				if (idx === -1) throw new Error("Internal error: attempting to remove a non-present handler");
				handlers.splice(idx, 1);
				if (handlers.length == 0) {
					const idx = this.ranges.indexOf(range);
					this.ranges.splice(idx, 1);
				}
			};
		};

		return new TimelineRange(
			addHandler,
			this,
			startPosition,
			duration
		);
	}

	private getWrappedPosition(n: number) {
		if (this.endAction.type !== EndAction.wrap) return n;
		const wrapAt = this.endAction.at?.position ?? 0;
		if (wrapAt == 0) return n % this._endPosition;
		if (n <= this._endPosition) return n;

		const loopStart = wrapAt;
		const segment = this._endPosition - loopStart;
		if (segment <= 0) return Math.min(n, this._endPosition);
		const overflow = n - this._endPosition;
		const remainder = overflow % segment;
		return loopStart + remainder;
	}

	/**
	 * Seeks the Timeline to a specified position, triggering in order any point and range subscriptions between its current and new positions
	 * @param toPosition
	 */
	seek(toPosition: number | TimelinePoint): void;
	/**
	 * Smooth-seeks to a specified position
	 * 
	 * Immediately completes and replaces any ongoing smooth-seek process on this Timeline
	 * @param toPosition 
	 * @param duration Duration of the smooth-seek process in milliseconds
	 * @param easer Optional easing function for the smooth-seek process
	 * @returns A promise, resolved when the smooth-seek process finishes
	 */
	seek(toPosition: number | TimelinePoint, duration: number, easer?: Easer | keyof typeof easers): Promise<void>;
	seek(to: number | TimelinePoint, duration: number = 0, easer?: Easer | keyof typeof easers) {
		const toPosition = typeof to == "number"
			? to
			: to.position;

		if (this.seeking) {
			throw new Error("Can't seek while seeking");
		}

		if (this.smoothSeeker !== null) {
			this.smoothSeeker.pause();
			// ensure any awaits are resolved for the previous seek
			this.smoothSeeker.seek(this.smoothSeeker.end);
			this.smoothSeeker = null;
		}

		if (duration === 0) {
			this.seekDirect(toPosition);
			return Promise.resolve();
		}

		const seeker = new Timeline(true);
		this.smoothSeeker = seeker;
		seeker.range(0, duration).ease(easer).tween(this.currentTime, toPosition).listen(v => this.seekDirect(v));
		return new Promise<void>(r => seeker.end.listen(() => r()));
	}


	private seekDirect(toPosition: number) {
		const fromPosition = this._currentTime;
		if (toPosition === fromPosition) return;

		const loopingTo = this.getWrappedPosition(toPosition);
		const loopingFrom = this.getWrappedPosition(fromPosition);

		let virtualFrom = loopingFrom;
		let virtualTo = loopingTo;

		const direction = toPosition > fromPosition ? 1 : -1;

		if (direction !== this.currentSortDirection) this.sortEntries(direction);

		if (direction === 1 && loopingTo < loopingFrom) {
			virtualFrom = loopingFrom - this._endPosition;
		}
		else if (direction === -1 && loopingTo > loopingFrom) {
			virtualFrom = loopingFrom + this._endPosition;
		}

		this.seeking = true;

		this._currentTime = virtualFrom;
		try {
			this.seekPoints(virtualTo);
			this.seekRanges(virtualTo);
		} catch (e) {
			this.pause();
			throw e;
		}

		this._currentTime = toPosition;
		this.seeking = false;
	}


	private seekPoints(to: number) {
		const from = this._currentTime;
		const direction = to > from ? 1 : -1;
		const pointsBetween = this.points.filter(
			direction > 0
				? p => p.position > from && p.position <= to
				: p => p.position <= from && p.position > to
		);
		const eventData: PointEvent = {
			direction
		};
		pointsBetween.slice().forEach(p => {
			this.seekRanges(p.position);
			this._currentTime = p.position;
			p.handlers.slice().forEach(h => h(eventData));
		});
	}

	private seekRanges(to: number) {
		const fromTime = Math.min(this._currentTime, to);
		const toTime = Math.max(this._currentTime, to);

		this.ranges.slice().forEach((range) => {
			const rangeEnd = range.position + range.duration;
			const overlaps = fromTime <= rangeEnd && toTime >= range.position;
			if (overlaps) {
				let progress = clamp(
					(to - range.position) / range.duration,
					0,
					1
				);
				range.handlers.slice().forEach(h => h(progress));
			}
		});
		this.progressionHandlers.slice().forEach(h => h(fromTime / this._endPosition));
	}

	private sortEntries(direction: -1 | 1) {
		this.currentSortDirection = direction;
		this.points.sort(
			direction == 1
				? sortEvents
				: sortReverse
		);
		this.ranges.sort(
			direction == 1
				? sortTweens
				: sortReverse
		);
	}

	/**
	 * Starts progression of the Timeline from its current position at (1000 × this.timeScale) units per second
	 */
	play(): void;
	play(fps: number): void;
	play(fps: number = default_fps) {
		if (this.interval !== null) this.pause();
		let previousTime = Date.now();
		this.interval = setInterval(() => {
			const newTime = Date.now();
			const elapsed = newTime - previousTime;
			previousTime = newTime;
			let delta = elapsed * this.timeScale;
			if (this._currentTime + delta <= this._endPosition) {
				this.currentTime += delta;
				return;
			}

			// overshot; perform endAction			

			if (this.endAction.type == EndAction.restart) {
				const loopRange = this.endAction.at.to(this._endPosition);
				const loopLen = loopRange.duration;

				if (loopLen <= 0) {
					const target = Math.min(this._currentTime + delta, this._endPosition);
					this.seek(target);
					return;
				}
				while (delta > 0) {
					const distanceToEnd = this._endPosition - this._currentTime;
					if (delta < distanceToEnd) {
						this.seek(this._currentTime + delta);
						return;
					}
					this.seek(this._endPosition);
					delta -= distanceToEnd;
					this.seek(this.endAction.at);
				}
				return;
			}

			if (this.endAction.type == EndAction.pause) {
				this.seek(this._endPosition);
				this.pause();
				return;
			}

			this.currentTime += delta;

		}, 1000 / fps);
	}

	pause() {
		if (this.interval === null) return;
		clearInterval(this.interval);
		this.interval = null;
	}

	// compatibility

	/**
	 * Progresses the Timeline by 1 unit
	 * @param delta 
	 * @deprecated Use timeline.position++
	 */
	step(): void;
	/**
	 * Progresses the Timeline by a given delta
	 * @param delta
	 * @deprecated Use timeline.position += n
	 */
	step(delta: number): void;
	step(delta: number = 1) {
		this.currentTime += delta * this.timeScale;
	}

	tween<T extends Tweenable>(
		start: number | TimelinePoint,
		duration: number,
		apply: (v: Widen<T>) => void,
		from: T,
		to: T,
		easer?: Easer | keyof typeof easers
	): ChainingInterface;
	tween<T extends Tweenable>(
		start: number | TimelinePoint,
		end: TimelinePoint, // ease migration for tl.tween(0, tl.end, ...)
		apply: (v: Widen<T>) => void,
		from: T,
		to: T,
		easer?: Easer | keyof typeof easers
	): ChainingInterface;
	tween<T extends Tweenable>(
		start: number | TimelinePoint,
		durationOrToPoint: number | TimelinePoint,
		apply: (v: T) => void,
		from: T,
		to: T,
		easer?: Easer | keyof typeof easers
	) {
		const startPosition = typeof start == "number"
			? start
			: start.position;
		const duration = typeof durationOrToPoint == "number"
			? durationOrToPoint
			: (durationOrToPoint.position - startPosition);
		this.range(startPosition, duration).ease(easer).tween<T>(from, to).listen(apply);
		return this.createChainingInterface(startPosition + duration);
	}
	at(position: number | TimelinePoint, action?: () => void, reverse?: boolean | (() => void)) {
		const point = typeof position == "number" ? this.point(position) : position;
		if (reverse === true) reverse = action;
		if (action) point.listen(reverse
			? (event => event.direction < 0 ? reverse() : action)
			: action
		);
		return this.createChainingInterface(point.position);
	}
	private createChainingInterface(position: number): ChainingInterface {
		return {
			thenTween: <T extends Tweenable>(
				duration: number, apply: (v: Widen<T>) => void,
				from: T,
				to: T,
				easer?: Easer | keyof typeof easers
			) => {
				return this.tween(position, duration, apply, from, to, easer);
			},
			then: (action) => this.at(position, action),
			thenWait: (delay) => {
				this.point(position + delay);
				return this.createChainingInterface(position + delay);
			},
			end: this.point(position),
		};
	}
	/**
	 * @deprecated use `timeline.currentTime`
	 */
	get position() {
		return this._currentTime;
	}

}

class TimelineProgressionEmitter extends RangeProgression {
	constructor(handlers: ((value: number) => void)[]) {
		super((handler) => {
			const unique = (n: number) => handler(n);
			handlers.push(unique);
			return () => {
				const idx = handlers.indexOf(unique);
				handlers.splice(idx, 1);
			};
		})
	}
}

export interface ChainingInterface {
	thenTween<T extends Tweenable>(duration: number, apply: (v: Widen<T>) => void, from: T, to: T, easer: Easer): ChainingInterface;
	then(action: () => void): ChainingInterface;
	thenWait(duration: number): ChainingInterface;
	readonly end: TimelinePoint;
}

const sortEvents = (a: PointData, b: PointData) => {
	return a.position - b.position;
};
const sortTweens = (a: RangeData, b: RangeData) => {
	return (a.position + a.duration) - (b.position + b.duration);
};
const sortReverse = (a: PointData | RangeData, b: PointData | RangeData) => {
	if (a.position == b.position)
		return 1;
	return b.position - a.position;
};

