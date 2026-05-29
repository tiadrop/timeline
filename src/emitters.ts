import { Easer, easers } from "./easing.js";
import { createPathEmitter, Path, XY } from "./path.js";
import { BlendableWith, createTween, Tweenable } from "./tween.js";
import { clamp } from "./utils.js";

type Handler<T> = (value: T) => void;
export type ListenFunc<T> = (handler: Handler<T>) => UnsubscribeFunc;
export type UnsubscribeFunc = () => void;

export type EmitterLike<T> = {
    subscribe: ListenFunc<T>;
} | {
    listen: ListenFunc<T>;
}

/**
 * Helper to wrap ambiguous EmitterLike as a ListenFunc
 * @param source EmitterLike
 * @returns Listen function - `(handler: Handler<T>) => UnsubscribeFunc`
 */
function createEmitterListenFunc<T>(source: EmitterLike<T>) {
	return "subscribe" in source
		? (h: Handler<T>) => source.subscribe(h)
		: (h: Handler<T>) => source.listen(h);
}

export const createGateHandler = <T>(listenParent: ListenFunc<T>, condition: EmitterLike<boolean>) => {
	const listenCondition = createEmitterListenFunc(condition);

	const {listen, emit} = createListenable<T>();

	let parentUnsubscribe: UnsubscribeFunc | null = null;

	listenCondition(open => {
		if (open) {
			if (!parentUnsubscribe) parentUnsubscribe = listenParent(emit);
		} else {
			parentUnsubscribe?.();
			parentUnsubscribe = null;
		}
	});

	return listen;
}

export class Emitter<T> {
	constructor(protected onListen: ListenFunc<T>) {}

	protected transform<R = T>(
		handler: (value: T, emit: (value: R) => void) => void
	) {
		const {emit, listen} = createListenable<R>(
			() => this.onListen(value => {
				handler(value, emit);
			}),
		);
		return listen;
	}

	/**
	 * Compatibility alias for `apply()` - registers a function to receive emitted values
	 * @param handler 
	 * @returns A function to deregister the handler
	 */
	listen(handler: Handler<T>): UnsubscribeFunc {
		return this.onListen(handler);
	}
	/**
	 * Registers a function to receive emitted values
	 * @param handler 
	 * @returns A function to deregister the handler
	 */
	apply(handler: Handler<T>): UnsubscribeFunc {
		return this.onListen(handler);
	}
	/**
	 * Creates a chainable emitter that activates and deactivates its parent subscription
	 * depending on a boolean emitter.
	 * This enables **automatic chain cleanup**; in the following example, when `element.domConnected$` becomes
	 * unreachable (the element is removed and not referenced), the entire downstream subscription chain from
	 * `gate(...)` can be garbage collected.
	 * 
	 * @example
	 * ```ts
	 * // Automatic memory management: only subscribe when element is in DOM
	 * interval(1000)
	 *   .gate(element.domConnected$)
	 *   .apply(v => doSomethingWith(element));
	 * // Subscription automatically freed when element leaves DOM
	 * ```
	 * 
	 * To prevent resource leaks, ensure `condition` emits `false` before it becomes inaccessible.
	 * @param condition 
	 * @returns Listenable: subscribes/unsubscribes to parent as condition changes
	 */
	gate(condition: EmitterLike<boolean>) {
		return new Emitter(
			createGateHandler(this.onListen, condition)
		);
	}
	/**
	 * Creates a chainable emitter that applies a transformation to values emitted by its parent
	 * @param mapFunc 
	 * @returns Listenable: emits transformed values
	 */
	map<R>(mapFunc: (value: T) => R): Emitter<R> {
		const listen = this.transform<R>(
			(value, emit) => emit(mapFunc(value))
		)
		return new Emitter(listen);
	}
	/**
	 * Creates a chainable emitter that selectively forwards emissions down the chain
	 * @param check Function that takes an emitted value and returns true if the emission should be forwarded along the chain
	 * @returns Listenable: emits values that pass the filter
	 */
	filter(check: (value: T) => boolean): Emitter<T> {
		const listen = this.transform<T>(
			(value, emit) => check(value) && emit(value)
		)
		return new Emitter<T>(listen);
	}
	/**
	 * Creates a chainable emitter that discards emitted values that are the same as the last value emitted by the new emitter
	 * @param compare Optional function that takes the previous and next values and returns true if they should be considered equal
	 * 
	 * If no `compare` function is provided, values will be compared via `===`
	 * @returns Listenable: emits non-repeating values
	 */
	dedupe(compare?: (a: T, b: T) => boolean): Emitter<T> {
		let previous: null | { value: T; } = null;
		const listen = this.transform(
			(value, emit) => {
				if (
					!previous || (
						compare
							? !compare(previous.value, value)
							: (previous.value !== value)
					)
				) {
					emit(value);
					previous = { value };
				}

			}
		)
		return new Emitter<T>(listen);
	}
	
	/**
	 * Creates a chainable emitter that forwards emissions from the parent emitter, invoking the provided callback `cb` as a side effect for each emission.  
	 * 
	 * The callback `cb` is called exactly once per parent emission, regardless of how many listeners are attached to the returned emitter.
	 * All listeners attached to the returned emitter receive the same values as the parent emitter.
	 * 
	 * *Note*, the side effect `cb` is only invoked when there is at least one listener attached to the returned emitter
	 * 
	 * @param cb A function to be called as a side effect for each value emitted by the parent emitter.
	 * @returns A new emitter that forwards all values from the parent, invoking `cb` as a side effect.
	 */
	tap(cb: Handler<T>): Emitter<T> {
		const listen = this.transform(
			(value, emit) => {
				cb(value);
				emit(value);
			}
		)
		return new Emitter<T>(listen);
	}
	/**
	 * Immediately passes this emitter to a callback and returns this emitter
	 * 
	 * Allows branching without breaking a composition chain
	 * 
	 * @example
	 * ```ts
	 * range
	 *   .tween("0%", "100%")
	 *   .fork(
	 *       branch => branch
	 *           .apply(s => console.log("loading:", s)),
	 *   )
	 *   .apply(v => progressBar.style.width = v);
	 * ```
	 * @param cb 
	 */
	fork(...cb: ((branch: this) => void)[]): this {
		cb.forEach(cb => cb(this));
		return this;
	}

	/**
	 * Creates a chainable emitter that forwards emissions from the parent and any of the provided emitters
	 * @param emitters 
	 */
	or(...emitters: Emitter<T>[]): Emitter<T>
	or<U>(...emitters: Emitter<U>[]): Emitter<T | U>
	or(...emitters: Emitter<any>[]): Emitter<any> {
		return new Emitter(handler => {
			const unsubs = [this, ...emitters].map(e => e.listen(handler));
			return () => unsubs.forEach(unsub => unsub());
		})
	}
}





export class ProgressionEmitter extends Emitter<number> {
	/**
	 * Creates a chainable progress emitter that applies an easing function to its parent's emitted values
	 * 
	 * @param easer An easing function of the form `(progression: number) => number`
	 * @returns Listenable: emits eased progression values
	 */
	ease(easer?: Easer | keyof typeof easers): ProgressionEmitter
	ease(easer?: undefined): ProgressionEmitter
	ease(easer?: Easer | keyof typeof easers | undefined): ProgressionEmitter {
		const easerFunc = typeof easer == "string"
			? easers[easer]
			: easer;
		const listen = easerFunc
			? this.transform(
				(value, emit) => emit(easerFunc(value))
			)
			: this.onListen;
	
		return new ProgressionEmitter(listen);
	}
	protected wrapListener(listen: ListenFunc<number>): ProgressionEmitter {
		return new ProgressionEmitter(listen);
	}
	/**
	 * Creates a chainable emitter that interpolates two given values by progression emitted by its parent
	 * 
	 * Can interpolate types `number`, `number[]`, string and objects with a `blend(from: this, progression: number): this` method
	 * 
	 * @param from Value to interpolate from
	 * @param to Value to interpolate to
	 * @returns Listenable: emits interpolated values
	 */
	tween(from: number, to: number, ...extraSteps: number[]): Emitter<number>
	/**
	 * Creates a chainable emitter that interpolates two given values by progression emitted by its parent
	 * 
	 * Can interpolate types `number`, `number[]`, string and objects with a `blend(from: this, progression: number): this` method
	 * 
	 * #### String interpolation
	 * * If the strings contain tweenable tokens (numbers, colour codes) and are otherwise identical, those tokens are interpolated
	 * * Otherwise the `from` string is progressively replaced, left-to-right, with the `to` string
	 * 
	 * eg
	 * ```ts
	 * range
	 *   .tween("0px 0px 0px #0000", "4px 4px 8px #0005")
	 *   .apply(s => element.style.textShadow = s);
	 * ```
	 * 
	 * @param from Value to interpolate from
	 * @param to Value to interpolate to
	 * @returns Listenable: emits interpolated values
	 */
	tween(from: string, to: string, ...extraSteps: string[]): Emitter<string>;
	tween<T extends Tweenable>(from: T, to: T, ...extraSteps: T[]): Emitter<T>
	tween<T extends BlendableWith<T, R>, R>(from: T, to: R, ...extraSteps: R[]): Emitter<T>
	tween<T extends BlendableWith<T, R>, R>(from: T, to: R, ...extraSteps: (R|T)[]): Emitter<T>
	tween<T extends Tweenable | BlendableWith<any, any>>(from: T, ...steps: T[]) {
		if (steps.length === 1) {
			const tween = createTween(from, steps[0]);
			const listen = this.transform<T>(
				(progress, emit) => emit(tween(progress))
			);
			return new Emitter<T>(listen);
		}

		let stepFrom = from;
		const ranges = steps.map((to, i) => {
			const tween = createTween(stepFrom, to);
			stepFrom = tween(1);
			return {
				start: i / steps.length,
				end: (i + 1) / steps.length,
				fn: tween,
			}
		});
		const sequence = createSequence(ranges);
		return new Emitter<T>(this.transform((progress, emit) => {
			emit(sequence(progress));
		}));
	}
	gate(condition: EmitterLike<boolean>) {
		return new ProgressionEmitter(
			createGateHandler(this.onListen, condition)
		);
	}
	/**
	 * Creates a chainable emitter that takes a value from an array according to progression
	 * 
	 * @example
	 * ```ts
	 * range
	 *   .sample(["a", "b", "c"])
	 *   .apply(v => console.log(v));
	 * // logs 'b' when a seek lands halfway through range
	 * ```
	 * @param source array to sample
	 * @returns Listenable: emits the sampled values
	 */
	sample<T>(source: ArrayLike<T>){
		if (source.length === 0) {
            throw new Error("Sample source is empty");
        }
		const sourceArray = Array.from(source);
		const listen = this.transform<T>(
			(value, emit) => {
				const clampedProgress = clamp(value);
				const index = Math.floor(
					clampedProgress * (sourceArray.length - 1)
				);
				emit(sourceArray[index]);
			}
		);
		return new Emitter<T>(listen);
	}
	/**
	 * Creates a chainable progress emitter that quantises progress, as emitted by its parent, to the nearest of `steps` discrete values.
	 *
	 * @param steps – positive integer (e.g. 10 → 0, .1, .2 … 1)
	 * @throws RangeError if steps is not a positive integer
	 * @returns Listenable: emits quantised progression values
	 */
	snap(steps: number): ProgressionEmitter {
		if (!Number.isInteger(steps) || steps <= 0) {
			throw new RangeError('snap(steps) requires a positive integer');
		}

		return new ProgressionEmitter(
			handler => this.onListen(progress => {
				const snapped = Math.round(progress * steps) / steps;
				handler(snapped);
			})
		);
	}
	/**
	 * Creates a chainable progress emitter that emits `1` when the incoming progress value is greater‑than‑or‑equal to the supplied `threshold`, otherwise emits `0`
	 *
	 * @param threshold the cut‑off value
	 * @returns Listenable: emits 0 or 1 after comparing progress with a threshold
	 */
	threshold(threshold: number): ProgressionEmitter {
		const listen = this.transform(
			(value, emit) => emit(value >= threshold ? 1 : 0),
		);
		return new ProgressionEmitter(listen);
	}
	/**
	 * Creates a chainable progress emitter that clamps incoming values
	 * @param min default 0
	 * @param max default 1
	 * @returns Listenable: emits clamped progression values
	 */
	clamp(min: number = 0, max: number = 1): ProgressionEmitter {
		return new ProgressionEmitter(
			handler => this.onListen(
				progress => handler(clamp(progress, min, max))
			)
		);
	}
	/**
	 * Creates a chainable progress emitter that maps incoming values to a repeating linear scale
	 * 
	 * ```plain
	 * 	count=2
	 *‎	1
	 *‎	 |     /     /
	 *‎	o|    /     /
	 *‎	u|   /     /
	 *‎	t|  /     /
 	 *‎	 | /     /
 	 *‎	 |/_____/_____
     *‎	0     in      1
	 * ```
	 * 
	 * @param count Number of repetitions
	 * @returns Listenable: emits scaled and repeating values
	 */
	repeat(count: number): ProgressionEmitter {
		if (count <= 0) throw new RangeError("Repeat count must be greater than 0");
		const listen = this.transform(
			(value, emit) => {
				const out = (value * count) % 1;
				emit(out);
			}
		);
		return new ProgressionEmitter(listen);
	}
	/**
	 * Creates a chainable progress emitter that selectively forwards emissions along the chain
	 * @param check Function that takes an emitted value and returns true if the emission should be forwarded along the chain
	 * @returns Listenable: emits values that pass the filter
	 */
	filter(check: (progress: number) => boolean): ProgressionEmitter {
		const listen = this.transform(
			(value, emit) => {
				if (check(value)) emit(value);
			}
		);
		return new ProgressionEmitter(listen);
	}
	private _dedupe?: ProgressionEmitter;
	/**
	 * Creates a chainable progress emitter that discards emitted values that are the same as the last value emitted by the new emitter
	 * @returns Listenable: emits non-repeating values
	 */
	dedupe(): ProgressionEmitter {
		if (!this._dedupe) {
			let previous: null | number = null;
			const listen = this.transform(
				(value, emit) => {
					if (previous !== value) {
						emit(value);
						previous = value
					}
				}
			);
			this._dedupe = new ProgressionEmitter(listen);
		}
		return this._dedupe;
	}
	tap(cb: Handler<number>) {
		const listen = this.transform(
			(value, emit) => {
				cb(value);
				emit(value);
			}
		)
		return new ProgressionEmitter(listen);
	}
	path(segments: Path): Emitter<XY> {
		const pathEvaluator = createPathEmitter(segments);
		let parentUnsubscribe: UnsubscribeFunc | null = null;
		let pathUnsubscribe: UnsubscribeFunc | null = null;
		
		const { listen, emit } = createListenable<XY>(
			() => {
				pathUnsubscribe = pathEvaluator.listen(emit);
				parentUnsubscribe = this.listen((timeValue) => {
					pathEvaluator.seek(timeValue);
				});
				return () => {
					pathUnsubscribe!();
					parentUnsubscribe!();
				}
			},
			
		);

		return new Emitter(listen);
	}
	/**
	 * Creates a chainable progress emitter that offsets its parent's values by the given delta, wrapping at 1
	 * 
	 * ```plain
	 *‎	1
	 *‎	 |  /
	 *‎	o| /
	 *‎	u|/       __ delta=.5
	 *‎	t|     /
 	 *‎	 |    /
 	 *‎	 |___/__
     *‎	0  in   1
	 * ```
	 * 
	 * @param delta
	 * @returns Listenable: emits offset values
	 */
	offset(delta: number): ProgressionEmitter {
		return new ProgressionEmitter(
			handler => this.onListen(value => handler((value + delta) % 1))
		);
	}
}


export function createListenable<T>(sourceListen?: () => UnsubscribeFunc | undefined) {
	const handlers: {fn: (v: T) => void}[] = [];
	let onRemoveLast: undefined | UnsubscribeFunc;
	const addListener = (fn: (v: T) => void): UnsubscribeFunc => {
		const unique = {fn};
		handlers.push(unique);
		if (sourceListen && handlers.length == 1) onRemoveLast = sourceListen();
		return () => {
			const idx = handlers.indexOf(unique);
			if (idx === -1) throw new Error("Handler already unsubscribed")
			handlers.splice(idx, 1);
			if (onRemoveLast && handlers.length == 0) onRemoveLast();
		};
	}
	return {
		listen: addListener,
		emit: (value: T) => handlers.forEach(h => h.fn(value)),
	};
}

type SequenceRange<T> = {
	readonly start: number;
	readonly end: number;
	readonly fn: (progress: number) => T
}

export function createSequence<T>(ranges: SequenceRange<T>[]) {
	if (!ranges.some(r => r.start === 0)) {
		throw new Error("Sequences must start at 0");
	}

	const maxEnd = Math.max(...ranges.map(r => r.end));
	const firstRange = ranges[0];
	const lastRange = ranges[ranges.length - 1];

	return (progress: number) => {
		const position = progress * maxEnd;

		if (position < firstRange.start) {
			return firstRange.fn(position / (firstRange.end - firstRange.start));
		}
		if (position > lastRange.end) {
			const duration = lastRange.end - lastRange.start;
			return lastRange.fn((position - lastRange.start) / duration);
		}

		const range = ranges.find(r => r.start <= position && position <= r.end)!;
		const localProgress = (position - range.start) / (range.end - range.start);
		return range.fn(localProgress);
	};
}
