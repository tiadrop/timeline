import { Easer, easers } from "./easing";
import { createListenable, ListenFunc, RangeProgression, UnsubscribeFunc } from "./emitters";
import { PointEvent, TimelinePoint } from "./point";
import { TimelineRange } from "./range";
import { Tweenable } from "./tween";
import { clamp, Widen } from "./utils";

const default_fps = 60;
const requestAnimFrame = (globalThis as any)?.requestAnimationFrame as ((cb: FrameRequestCallback) => number) | undefined;
const cancelAnimFrame = (globalThis as any)?.cancelAnimationFrame as (id: number) => void;

const EndAction = {
	pause: 0,
	continue: 1,
	wrap: 2,
	restart: 3,
} as const;

type PointData = {
	position: number;
	emit: (v: PointEvent) => void;
};

type RangeData = {
	position: number;
	duration: number;
	emit: (v: number) => void;
};

// @xtia/mezr Period compat
type Period = {
	asMilliseconds: number;
}

/**
 * Creates an autoplaying Timeline and returns a range from it
 * @param durationMs Animation duration, in milliseconds
 * @returns Object representing a range on a single-use, autoplaying Timeline
 */
export function animate(durationMs: number): TimelineRange
export function animate(period: Period): TimelineRange
export function animate(durationMs: number | Period) {
	return new Timeline(true)
		.range(
			0,
			typeof durationMs == "number"
				? durationMs
				: durationMs.asMilliseconds
		);
}

export class Timeline {
	/**
	 * Multiplies the speed at which `play()` progresses through the Timeline
	 * 
	 * A value of 2 would double progression speed while .25 would slow it to a quarter
	 */
	public timeScale: number = 1;
	/**
	 * The current position of this Timeline's 'play head'
	 */
	get currentTime() { return this._currentTime; }
	set currentTime(v) {
		this.seek(v);
	}
	/**
	 * Returns true if this Timeline is currently progressing via `play()`, otherwise false
	 */
	get isPlaying() {
		return !!this._pause;
	}
	/**
	 * Returns a fixed point at the current end of the Timeline
	 */
	get end() {
		return this.point(this._endPosition);
	}

	private _currentTime: number = 0;
	private _endPosition: number = 0;
	private _pause: (() => void) | null = null;

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

	/**
	 * A fixed point representing the start of this Timeline (position 0)
	 */
	readonly start = this.point(0);

	private _frameEvents: null | {
		listen: (handler: () => void) => UnsubscribeFunc;
		emit: () => void;
	} = null;

	/**
	 * Registers a handler to be invoked on every seek, after points and ranges are applied
	 */
	apply(handler: () => void) {
		if (this._frameEvents === null) {
			const {emit, listen} = createListenable<void>();
			this._frameEvents = {
				listen,
				emit,
			};
		}
		return this._frameEvents!.listen(handler);
	}

	private _progression: null | {
		emitter: RangeProgression;
		emit: (value: number) => void;
	} = null;
	
	/**
	 * Listenable: emits a progression value (0..1), representing progression through the entire Timeline,
	 * when the Timeline's internal position changes, and when the Timeline's total duration is extended
	 */
	get progression(): RangeProgression {
		if (this._progression === null) {
			const {emit, listen} = createListenable<number>();
			this._progression = {
				emitter: new TimelineProgressionEmitter(listen),
				emit,
			};
		}
		return this._progression.emitter;
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
			this._progression?.emit(this._currentTime / position);
		}

		const {emit, listen} = createListenable<PointEvent>(
			() => this.points.push(data),
			() => {
				const idx = this.points.indexOf(data);
				this.points.splice(idx, 1);
			}
		);

		const addHandler = (handler: (value: PointEvent) => void) => {
			if (this.seeking) throw new Error("Can't add a listener while seeking");
			if (position == this._currentTime) {
				emit({
					direction: 1
				});
			}
			return listen(handler);
		};

		const data: PointData = {
			emit,
			position,
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
	 * @param duration Length of the resulting range
	 * @returns A range on the Timeline
	 * 
	 * Listenable: this range will emit a progression value (0..1) when a `seek()` passes or intersects it
	 */
	range(start: number | TimelinePoint, duration: number): TimelineRange;
	/**
	 * Defines a range from position 0 to the Timeline's **current** final position
	 */
	range(): TimelineRange;
	range(start: number | TimelinePoint = 0, optionalDuration?: number): TimelineRange {
		const startPoint = typeof start == "number"
			? this.point(start)
			: start;
		const startPosition = startPoint.position;
		const duration = optionalDuration ?? this._endPosition - startPosition;
		const endPoint = this.point(startPosition + duration);

		const {emit, listen} = createListenable<number>(
			() => this.ranges.push(rangeData),
			() => {
				const idx = this.ranges.indexOf(rangeData);
				this.ranges.splice(idx, 1);
			}
		);

		const rangeData: RangeData = {
			position: startPosition,
			duration,
			emit,
		};

		const addHandler = duration == 0
			? () => {
				throw new Error("Zero-duration ranges may not be listened")
			}
			: (handler: (value: number) => void) => {
				if (this.seeking) throw new Error("Can't add a listener while seeking");
				if (range.contains(this._currentTime)) {
					let progress = clamp(
						(this._currentTime - startPosition) / duration,
						0,
						1
					);
					handler(progress);
				}
				return listen(handler);
			};

		const range = new TimelineRange(
			addHandler,
			this,
			startPoint,
			endPoint,
		);
		return range;
	}

	/**
	 * Seeks the Timeline to a specified position, triggering in order any point and range
	 * subscriptions between its current and new positions
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
	seek(
		toPosition: number | TimelinePoint,
		durationMs: number,
		easer?: Easer | keyof typeof easers
	): Promise<void>;
	seek(
		toPosition: number | TimelinePoint,
		duration: Period,
		easer?: Easer | keyof typeof easers
	): Promise<void>;
	/**
	 * Smooth-seeks through a range over a given duration
	 * @param range The range to seek through
	 * @param durationMs Smooth-seek duration
	 * @param easer Optional easing function
	 */
	seek(
		range: TimelineRange,
		durationMs: number,
		easer?: Easer | keyof typeof easers
	): Promise<void>
	seek(
		range: TimelineRange,
		duration: Period,
		easer?: Easer | keyof typeof easers
	): Promise<void>
	seek(
		to: number | TimelinePoint | TimelineRange,
		duration?: number | Period,
		easer?: Easer | keyof typeof easers
	) {

		if (to instanceof TimelineRange) {
			this.seek(to.start);
			return this.seek(to, duration as number, easer);
		}

		const durationMs = typeof duration == "object"
			? duration.asMilliseconds
			: duration;

		const toPosition = typeof to == "number"
			? to
			: to.position;

		if (this.seeking) {
			throw new Error("Can't seek while a seek event is processed");
		}

		if (this.smoothSeeker !== null) {
			this.smoothSeeker.pause();
			// ensure any awaits are resolved for the interrupted seek
			const interruptPosition = this._currentTime;
			this.smoothSeeker.seekDirect(this.smoothSeeker.end.position);
			this.smoothSeeker = null;
			// and jump back to where we were interrupted
			this.seekDirect(interruptPosition);
		}

		if (!durationMs) {
			this.seekDirect(toPosition);
			this._frameEvents?.emit();
			// only add Promise overhead if duration is explicitly 0
			return durationMs === 0 ? Promise.resolve() : undefined;
		}

		const seeker = new Timeline(true);
		this.smoothSeeker = seeker;
		seeker
			.range(0, durationMs)
			.ease(easer)
			.tween(this._currentTime, toPosition)
			.apply(v => this.seekDirect(v));
		return seeker.end.promise();
	}


	private seekDirect(toPosition: number) {
		const fromPosition = this._currentTime;
		if (toPosition === fromPosition) return;

		const direction = toPosition > fromPosition ? 1 : -1;
		if (direction !== this.currentSortDirection) this.sortEntries(direction);

		this.seeking = true;
		try {
			// use wrapping logic?
			if (this.endAction.type === EndAction.wrap && (
				fromPosition > this._endPosition || toPosition > this._endPosition
			)) {
				this.seekWrapped(toPosition);
			} else {
				this.seekPoints(toPosition);
				this.seekRanges(toPosition);
			}
		} catch (e) {
			this.pause();
			throw e;
		} finally {
			this.seeking = false;
		}

		this._currentTime = toPosition;
	}

	private seekWrapped(toPosition: number) {
		const fromPosition = this._currentTime;
		const timelineEnd = this._endPosition;
		const wrapAt = "at" in this.endAction ? this.endAction.at.position : 0;
		const loopLen = timelineEnd - wrapAt;

		const getWrappedPosition = (pos: number) => ((pos - wrapAt) % loopLen + loopLen) % loopLen + wrapAt;
		const realDelta = toPosition - fromPosition;
		const direction = realDelta >= 0 ? 1 : -1;
		let remaining = Math.abs(realDelta);

		let virtualFrom = getWrappedPosition(fromPosition);

		while (remaining > 0) {
			let virtualTo;
			if (direction > 0) {
				const wrapSize = timelineEnd - virtualFrom;
				virtualTo = remaining <= wrapSize
					? virtualFrom + remaining
					: timelineEnd;
			} else {
				const wrapSize = virtualFrom - wrapAt;
				virtualTo = remaining <= wrapSize
					? virtualFrom - remaining
					: wrapAt;
			}

			this._currentTime = virtualFrom;
			this.seekPoints(virtualTo);

			remaining -= Math.abs(virtualTo - virtualFrom);

			if (remaining > 0) {
				virtualFrom = direction > 0 ? wrapAt : timelineEnd;
			} else {
				virtualFrom = virtualTo;
			}
		}

		this.seekRanges(getWrappedPosition(toPosition));
		this._currentTime = toPosition;

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
			p.emit(eventData);
		});
	}

	private seekRanges(to: number) {
		if (this._currentTime === to) return;
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
				range.emit(progress);
			}
		});
		this._progression?.emit(toTime / this._endPosition);
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
	/**
	 * Performs a smooth-seek through a range at (1000 × this.timeScale) units per second
	 */
	play(range: TimelineRange, easer?: Easer): Promise<void>
	play(arg?: number | TimelineRange, easer?: Easer) {
		this._pause?.();
		if (this.smoothSeeker) {
			this.smoothSeeker.pause();
			this.smoothSeeker.seek(this.smoothSeeker.end);
			this.smoothSeeker = null;
		}
		if (arg instanceof TimelineRange) {
			this.seek(arg.start);
			return this.seek(arg.end, arg.duration / this.timeScale, easer);
		}
		if (arg !== undefined && requestAnimFrame) {
			this.playWithRAF();
			return;
		}
		this.playWithInterval(arg ?? default_fps);
	}

	private playWithInterval(fps: number) {
		let previousTime = Date.now();
		const interval = setInterval(() => {
			const newTime = Date.now();
			const elapsed = newTime - previousTime;
			previousTime = newTime;
			let delta = elapsed * this.timeScale;
			this.next(delta);
		}, 1000 / fps);
		this._pause = () => clearInterval(interval);
	}

	private playWithRAF() {		
		let previousTime: number | null = null;
		let rafId: number;
		
		const frame = (currentTime: number) => {
			if (previousTime === null) {
				previousTime = currentTime;
			}
			const elapsed = currentTime - previousTime;
			previousTime = currentTime;
			
			let delta = elapsed * this.timeScale;
			this.next(delta);
			if (this._pause) rafId = requestAnimFrame!(frame);
		};
		
		rafId = requestAnimFrame!(frame);
		this._pause = () => cancelAnimFrame(rafId);
	}

	private next(delta: number) {
		if (this._currentTime + delta <= this._endPosition) {
			this.currentTime += delta;
			return;
		}

		// overshot; perform restart/pause endAction			

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

		// endaction must be "continue" or "wrap"
		this.currentTime += delta;
	}

	/**
	 * Stops normal progression instigated by play()
	 * 
	 * Does not affect ongoing smooth-seek operations or play(range)
	 * 
	 */
	pause() {
		if (this._pause === null) return;
		this._pause();
		this._pause = null;
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

	/**
	 * Adds a tweening range to the Timeline
	 * 
	 * **Legacy API**
	 * @param start Range's start position
	 * @param duration Tween's duration
	 * @param apply Function to apply interpolated values
	 * @param from Value at start of range
	 * @param to Value at end of range
	 * @param easer Optional easing function
	 */
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
		this.range(startPosition, duration).ease(easer).tween<T>(from, to).apply(apply);
		return this.createChainingInterface(startPosition + duration);
	}
	/**
	 * Adds an event at a specific position
	 * 
	 * **Legacy API**
	 * @param position Position of the event
	 * @param action Handler for forward seeking
	 * @param reverse Handler for backward seeking
	 * @returns A tween/event chaining interface
	 */
	at(position: number | TimelinePoint, action?: () => void, reverse?: boolean | (() => void)) {
		const point = typeof position == "number" ? this.point(position) : position;

		if (!action) {
			if (reverse) {
				if (reverse === true) throw new Error("Invalid call");
				point.reverseOnly.apply(reverse);
			}
			return this.createChainingInterface(point.position);
		}
		if (reverse) {
			if (reverse === true) {
				point.apply(action);
			} else {
				point.applyDirectional(action, reverse);
			}
		} else {
			point.forwardOnly.apply(action);
		}

		return this.createChainingInterface(point.position);
	}

	private createChainingInterface(position: number): ChainingInterface {
		const chain: ChainingInterface = {
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
			fork: fn => {
				fn(chain);
				return chain;
			},
			end: this.point(position),
		};
		return chain;
	}
	/**
	 * @deprecated use `timeline.currentTime`
	 */
	get position() {
		return this._currentTime;
	}

}


class TimelineProgressionEmitter extends RangeProgression {
	constructor(listen: ListenFunc<number>) {
		super(listen);
	}
}

export interface ChainingInterface {
	thenTween<T extends Tweenable>(
		duration: number,
		apply: (v: Widen<T>) => void,
		from: T,
		to: T,
		easer?: Easer
	): ChainingInterface;
	then(action: () => void): ChainingInterface;
	thenWait(duration: number): ChainingInterface;
	fork(fn: (chain: ChainingInterface) => void): ChainingInterface;
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
