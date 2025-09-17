const default_fps = 60;


type PointEvent = {
	direction: -1 | 1;
};

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
	handlers: ((position: number) => void)[];
};

/**
 * Creates an autoplaying Timeline and returns a range from it
 * @param duration 
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
	private positionHandlers: ((n: number) => void)[] = [];

	constructor();
	/**
	 * @param autoplay Pass `true` to begin playing at (1000 x this.timeScale) units per second immediately on creation
	 */
	constructor(autoplay: boolean);
	/**
	 * Creates a Timeline that begins playing immediately at (1000 x this.timeScale) units per second
	 * @param autoplayFps Specifies frames per second
	 */
	constructor(autoplayFps: number);
	/**
	 * @param autoplay If this argument is `true`, the Timeline will begin playing immediately on creation. If the argument is a number, the Timeline will begin playing at the specified frames per second
	 * @param endAction Specifies what should happen when the final position is passed by `play()`/`autoplay`
	 * 
	 * `"pause"`: **(default)** the Timeline will pause at its final position  
	 * `"continue"`: The Timeline will continue progressing beyond its final position  
	 * `"restart"`: The Timeline will seek back to 0 then forward to account for any overshoot and continue progressing  
	 * `"wrap"`: The Timeline's position will continue to increase beyond the final position, but Points and Ranges will be activated as if looping  
	 * `{restartAt: number}`: Like `"restart"` but seeking back to `restartAt` instead of 0  
	 * `{wrapAt: number}`: Like `"wrap"` but as if restarting at `wrapAt` instead of 0
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
		if (position > this._endPosition) this._endPosition = position;

		const handlers: ((event: PointEvent) => void)[] = [];
		const data: PointData = {
			handlers,
			position,
		};

		return createEmitter<PointEvent, TimelinePoint>(
			handler => {
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
			},
			{
				delta: t => this.point(position + t),
				range: duration => this.range(position, duration),
				to: target => {
					const targetPosition = typeof target == "number"
						? target
						: target.position;
					return this.range(position, targetPosition - position);
				},
				position,
			},
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
		if ((startPosition + duration) > this._endPosition) this._endPosition = startPosition + duration;

		const handlers: ((value: number) => void)[] = [];
		const range: RangeData = {
			position: startPosition,
			duration,
			handlers,
		};

		const addHandler = (handler: Handler<number>) => {
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

		return createProgressEmitter<TimelineRange>(
			addHandler,
			{
				duration,
				start: this.point(startPosition),
				end: this.point(startPosition + duration),
				bisect: (position = duration / 2) => {
					return [
						this.range(startPosition, position),
						this.range(startPosition + position, duration - position),
					];
				},
				spread: (count) => {
					const delta = duration / (count + 1);
					return [
						...Array(count).fill(0).map((_, idx) => this.point(idx * delta + startPosition + delta))
					];
				},
				play: (easer) => {
					this.pause();
					this.currentTime = startPosition;
					return this.seek(startPosition + duration, duration, easer);
				},
			},
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
	 * Aborts and replaces any on-going smooth-seek process on this Timeline
	 * @param toPosition 
	 * @param duration Duration of the smooth-seek process in milliseconds
	 * @param easer Optional easing function for the smooth-seek process
	 * @returns A promise, resolved when the smooth-seek process finishes
	 */
	seek(toPosition: number | TimelinePoint, duration: number, easer?: Easer): Promise<void>;
	seek(to: number | TimelinePoint, duration: number = 0, easer?: Easer) {
		const toPosition = typeof to == "number"
			? to
			: to.position;

		if (this.seeking) {
			throw new Error("Can't seek while seeking");
		}

		if (this.smoothSeeker !== null) {
			this.smoothSeeker.pause();
			// ensure any awaits are resolved for the previous seek?
			this.smoothSeeker.seek(this.smoothSeeker.end);
			this.smoothSeeker = null;
		}

		if (duration === 0) {
			this.seekDirect(toPosition);
			return;
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
		this.positionHandlers.forEach(h => h(toPosition));
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
		pointsBetween.forEach(p => {
			this.seekRanges(p.position);
			this._currentTime = p.position;
			const eventData: PointEvent = {
				direction
			};
			p.handlers.forEach(h => h(eventData));
		});
	}

	private seekRanges(to: number) {
		const fromTime = this._currentTime;
		this.ranges.forEach((range) => {
			const { duration, position } = range;
			const end = position + duration;
			// filter ranges that overlap seeked range
			if (Math.min(position, end) <= Math.max(to, fromTime)
				&& Math.min(to, fromTime) <= Math.max(position, end)) {
				let progress = clamp(
					(to - range.position) / range.duration,
					0,
					1
				);
				range.handlers.forEach(h => h(progress));
			}
		});
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
	 * Starts progression of the Timeline from its current position at (1000 x this.timeScale) units per second
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
		apply: (v: T) => void,
		from: T,
		to: T,
		easer?: Easer
	): ChainingInterface;
	tween<T extends Tweenable>(
		start: number | TimelinePoint,
		end: TimelinePoint, // ease migration for tl.tween(0, tl.end, ...)
		apply: (v: T) => void,
		from: T,
		to: T,
		easer?: Easer
	): ChainingInterface;
	tween<T extends Tweenable>(
		start: number | TimelinePoint,
		durationOrToPoint: number | TimelinePoint,
		apply: (v: T) => void,
		from: T,
		to: T,
		easer?: Easer
	) {
		const startPosition = typeof start == "number"
			? start
			: start.position;
		const duration = typeof durationOrToPoint == "number"
			? durationOrToPoint
			: (durationOrToPoint.position - startPosition);
		this.range(startPosition, duration).ease(easer).tween(from, to).listen(apply);
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
			thenTween: (duration, apply, from = 0, to = 1, easer) => {
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

interface ChainingInterface {
	thenTween(duration: number, apply: (v: number) => void, from?: number, to?: number, easer?: Easer): ChainingInterface;
	then(action: () => void): ChainingInterface;
	thenWait(duration: number): ChainingInterface;
	readonly end: TimelinePoint;
}

export interface TimelineRange extends RangeProgression {
	/**
	 * Creates two ranges by seperating one at a given point
	 * @param position Point of separation, relative to the range's start - if omitted, the range will be separated halfway
	 * 
	 * Must be greater than 0 and less than the range's duration
	 */
	bisect(position?: number): [TimelineRange, TimelineRange];
	/**
	 * Creates a series of evenly-spread points across the range, excluding the range's start and end
	 * @param count Number of Points to return
	 */
	spread(count: number): TimelinePoint[];
	/**
	 * Progresses the Timeline across the range
	 * @param easer 
	 */
	play(easer?: Easer): Promise<void>;
	/** The point on the Timeline at which this range begins */
	readonly start: TimelinePoint;
	/** The point on the Timeline at which this range ends */
	readonly end: TimelinePoint;
	/** The duration of this range */
	readonly duration: number;
}

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



////////////
// UTILITY


type Tweenable = number | number[] | string | Blendable;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

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

function tweenValue<T extends Tweenable>(from: T, to: T, progress: number): T {
	if (Array.isArray(from)) {
		const toArr = to as typeof from;
		if (from.length != toArr.length) throw new Error("Array size mismatch");
		return from.map((v, i) => tweenValue(v, toArr[i], progress)) as T;
	}
	if (typeof from == "string") {
		return blendStrings(from, to as string, progress) as T;
	}
	if (typeof from == "number") {
		return blendNumbers(from, to as number, progress) as T;
	}
	if (from && typeof from == "object") {
		if ("blend" in from) {
			const blendableSource = from as Blendable;
			return blendableSource.blend(to as Blendable, progress) as T;
		}
	}
	throw new Error("Value not recognised as Tweenable");
}

function blendNumbers(from: number, to: number, progress: number) {
	return from + progress * (to - from);
}

interface Blendable {
	blend(target: this, progress: number): this;
}

function mergeStrings(
	from: string,
	to: string,
	progress: number
): string {
	const p = Math.min(Math.max(progress, 0), 1);

	// Fast‑path: identical strings or one is empty
	if (from === to) return from;
	if (!from) return to;
	if (!to) return from;

	const split = (s: string): string[] => {
		// Prefer Intl.Segmenter if available (Node ≥ 14, modern browsers)
		if (typeof Intl !== "undefined" && (Intl as any).Segmenter) {
			const seg = new (Intl as any).Segmenter(undefined, { granularity: "grapheme" });
			return Array.from(seg.segment(s), (seg: any) => seg.segment);
		}
		// Fallback regex (covers surrogate pairs & combining marks)
		const graphemeRegex = /(\P{Mark}\p{Mark}*|[\uD800-\uDBFF][\uDC00-\uDFFF])/gu;
		return s.match(graphemeRegex) ?? Array.from(s);
	};

	const a = split(from);
	const b = split(to);

	const maxLen = Math.max(a.length, b.length);
	const pad = (arr: string[]) => {
		const diff = maxLen - arr.length;
		if (diff <= 0) return arr;
		return arr.concat(Array(diff).fill(" "));
	};

	const fromP = pad(a);
	const toP = pad(b);

	const replaceCount = Math.floor(p * maxLen);

	const result: string[] = new Array(maxLen);
	for (let i = 0; i < maxLen; ++i) {
		result[i] = i < replaceCount ? toP[i] : fromP[i];
	}
	while (result.length && result[result.length - 1] === " ") {
		result.pop();
	}

	return result.join("");
}

function parseColour(code: string) {
	if (code.length < 2 || !code.startsWith("#")) throw new Error("Invalid colour");
	let rawHex = code.substring(1);
	if (rawHex.length == 1) rawHex = rawHex + rawHex + rawHex;
	if (rawHex.length == 2) {
		const white = rawHex[0];
		const alpha = rawHex[1];
		rawHex = white + white + white + alpha;
	}
	if (rawHex.length == 3) rawHex += "f";
	if (rawHex.length == 4) rawHex = rawHex.replace(/./g, c => c + c);
	if (rawHex.length == 6) rawHex += "ff";
	return [...rawHex.matchAll(/../g)].map(hex => parseInt(hex[0], 16));
}

function blendColours(from: string, to: string, bias: number) {
	const fromColour = parseColour(from);
	const toColour = parseColour(to);
	const blended = fromColour.map((val, i) => clamp(blendNumbers(val, toColour[i], bias), 0, 255));
	return ("#" + blended.map(n => Math.round(n).toString(16).padStart(2, "0")).join("")).replace(/ff$/, "");
}

const tweenableTokenRegex =
	/(#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;

function blendStrings(
	from: string,
	to: string,
	progress: number
): string {
	if (from === to || progress === 0) return from;
	type Chunk = {
		prefix: string;
		token: string;
	};

	const tokenise = (s: string): Chunk[] => {
		const chunks: Chunk[] = [];
		let lastIdx = 0;
		let m: RegExpExecArray | null;

		while ((m = tweenableTokenRegex.exec(s))) {
			const token = m[0];
			const prefix = s.slice(lastIdx, m.index); // literal before token
			chunks.push({ prefix, token });
			lastIdx = m.index + token.length;
		}

		// trailing literal after the last token – stored as a final chunk
		// with an empty token (so the consumer can easily append it)
		const tail = s.slice(lastIdx);
		if (tail.length) {
			chunks.push({ prefix: tail, token: "" });
		}

		return chunks;
	};

	const fromChunks = tokenise(from);
	const toChunks = tokenise(to);

	const tokenCount = fromChunks.filter(c => c.token).length;
	if (tokenCount !== toChunks.filter(c => c.token).length) {
		return mergeStrings(from, to, progress);
	}

	let result = "";
	for (let i = 0, j = 0; i < fromChunks.length && j < toChunks.length;) {
		const f = fromChunks[i];
		const t = toChunks[j];

		// The *prefix* (the text before the token) must be the same.
		if (f.prefix !== t.prefix) {
			return mergeStrings(from, to, progress);
		}

		// Append the unchanged prefix.
		result += f.prefix;

		// If we are at the *trailing* chunk (no token), just break.
		if (!f.token && !t.token) {
			break;
		}

		// Blend the token according to its kind.
		let blended: string;
		if (f.token.startsWith("#")) {
			blended = blendColours(f.token, t.token, progress);
		} else {
			const fNum = parseFloat(f.token);
			const tNum = parseFloat(t.token);
			const blendedNum = blendNumbers(fNum, tNum, progress);
			blended = blendedNum.toString();
		}

		result += blended;

		// Advance both pointers.
		i++;
		j++;
	}

	return result;
}



////////////
// EMITTERS


type Handler<T> = (value: T) => void;
type Disposer = () => void;

interface Emitter<T> {
	/**
	 * Registers a function to receive emitted values
	 * @param handler 
	 * @returns A function to deregister the handler
	 */
	listen(handler: Handler<T>): Disposer;
	map<R>(mapFunc: (value: T) => R): Emitter<R>;
}

export interface TweenEmitter<T extends Tweenable> extends Emitter<T> { };

export interface RangeProgression extends Emitter<number> {
	/**
	 * Creates a chainable progress emitter that applies an easing function to its parent's emitted values
	 * 
	 * @param easer An easing function of the form `(progression: number) => number`
	 * @returns Listenable: emits an eased value
	 */
	ease(easer?: Easer | keyof typeof easers): RangeProgression;
	/**
	 * Creates an emitter that interpolates two given values by progression emitted by its parent
	 * 
	 * Can interpolate types `number`, `number[]`, string and objects with a `blend(from: this, to: this): this` method
	 * 
	 * #### String interpolation
	 * * If the strings contain tweenable tokens (numbers, colour codes) and are otherwise identical, those tokens are interpolated
	 * * Otherwise the `from` string is progressively replaced, left-to-right, with the `to` string
	 * 
	 * eg
	 * ```ts
	 * range
	 *   .tween("0px 0px 0px #0000", "4px 4px 8px #0005")
	 *   .listen(s => element.style.textShadow = s);
	 * ```
	 * 
	 * @param from Value to interpolate from
	 * @param to Value to interpolate to
	 * @returns Listenable: emits an interpolated value
	 */
	tween<T extends Tweenable>(from: T, to: T): TweenEmitter<T>;
}

function createEmitter<T>(
	onListen: (handler: Handler<T>) => Disposer,
): Emitter<T>;
function createEmitter<T, API extends object>(
	onListen: (handler: Handler<T>) => Disposer,
	api: Omit<API, keyof Emitter<T>>
): Emitter<T> & API;
function createEmitter<T>(
	onListen: (handler: Handler<T>) => Disposer,
	api?: object,
) {
	const emitter = Object.create(api ?? {}, {
		listen: {
			value: (handler: Handler<T>) => {
				const uniqueHandler = (value: T) => {
					handler(value);
				};
				return onListen(uniqueHandler);
			},
		},
		map: {
			value: <R>(mapFunc: (value: T) => R) => {

				return createEmitter<R>(
					handler => {
						const pipedHandler = (value: T) => {
							handler(mapFunc(value));
						};
						return onListen(pipedHandler);
					},
				);
			}
		},
	});
	return emitter;
}

function createProgressEmitter<API extends object>(
	onListen: (handler: Handler<number>) => Disposer,
	api: Omit<API, keyof RangeProgression>,
): RangeProgression & API {
	return createEmitter<number, RangeProgression & API>(
		onListen,
		Object.create(api, {
			ease: {
				value: (easer: Easer | keyof typeof easers) => {
					const easerFunc = typeof easer == "string"
						? easers[easer]
						: easer;
					return createProgressEmitter(
						easer ? handler => {
							const pipedHandler = (value: number) => {
								handler(easerFunc(value));
							};
							return onListen(pipedHandler);
						} : onListen,
						{}
					);
				}
			},
			tween: {
				value: <T extends Tweenable>(from: T, to: T) => createEmitter<T>(
					handler => {
						const tweenedHandler = (progress: number) => {
							const value = tweenValue(from, to, progress);
							handler(value);
						};
						return onListen(tweenedHandler);
					},
				)
			}
		})
	);
}



///////////
// EASERS


type Easer = (n: number) => number;

const overshoot = 1.70158;
export const easers = {
	linear: (x) => x,
	easeIn: (x) => x * x,
	easeIn4: (x) => Math.pow(x, 4),
	easeOut: (x) => 1 - Math.pow((1 - x), 2),
	easeOut4: (x) => 1 - Math.pow((1 - x), 4),
	circleIn: (x) => 1 - Math.sqrt(1 - Math.pow(x, 2)),
	circleIn4: (x) => 1 - Math.sqrt(1 - Math.pow(x, 4)),
	circleOut: (x) => Math.sqrt(1 - Math.pow((1 - x), 2)),
	circleOut4: (x) => Math.sqrt(1 - Math.pow((1 - x), 4)),
	easeInOut: (x) => -Math.cos(x * Math.PI) / 2 + .5,
	elastic: (x) => 1 - Math.cos(4 * Math.PI * x) * (1 - x),
	overshootIn: (x) => --x * x * ((overshoot + 1) * x + overshoot) + 1,
	bounce: (x) => {
		if (x < 4 / 11.0) {
			return (121 * x * x) / 16.0;
		}
		else if (x < 8 / 11.0) {
			return (363 / 40.0 * x * x) - (99 / 10.0 * x) + 17 / 5.0;
		}
		else if (x < 9 / 10.0) {
			return (4356 / 361.0 * x * x) - (35442 / 1805.0 * x) + 16061 / 1805.0;
		}
		else {
			return (54 / 5.0 * x * x) - (513 / 25.0 * x) + 268 / 25.0;
		}
	},
	noise: (x) => x == 0 ? 0 : (x >= 1 ? 1 : Math.random()),
	step2: (x) => {
		if (x < 0.333)
			return 0;
		if (x < 0.667)
			return 0.5;
		return 1;
	},
	step3: (x) => {
		if (x < .25)
			return 0;
		if (x < .5)
			return .333;
		if (x < .75)
			return .667;
		return 1;
	},
	pingpong: (x) => x < .5 ? x * 2 : 1 - (x - .5) * 2,
} satisfies Readonly<Record<string, Easer>>;
