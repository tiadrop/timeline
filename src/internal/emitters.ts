import { Easer, easers } from "./easing.js";
import { createPathEmitter, Path, XY } from "./path.js";
import { BlendableWith, createTween, Tweenable } from "./tween.js";
import { clamp } from "./utils.js";

type Handler<T> = (value: T) => void;
export type ListenFunc<T> = (handler: Handler<T>) => UnsubscribeFunc;
export type UnsubscribeFunc = () => void;

export class Emitter<T> {
	protected constructor(protected onListen: ListenFunc<T>) {}

	protected transform<R = T>(
		handler: (value: T, emit: (value: R) => void) => void
	) {
		let parentUnsubscribe: UnsubscribeFunc | null = null;
		const parentListen = this.onListen;
		const {emit, listen} = createListenable<R>(
			() => parentUnsubscribe = parentListen(value => {
				handler(value, emit);
			}),
			() => {
				parentUnsubscribe!();
				parentUnsubscribe = null;
			}
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
	 * Creates a chainable emitter that applies arbitrary transformation to values emitted by its parent
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
	 * Creates a chainable emitter that selectively forwards emissions along the chain
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
	 * Creates a chainable emitter that mirrors emissions from the parent emitter, invoking the provided callback `cb` as a side effect for each emission.  
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
	 *   .fork(branch => branch
	 *       .map(s => `Loading: ${s}`)
	 *       .apply(s => document.title = s)
	 *   )
	 *   .apply(v => progressBar.style.width = v);
	 * ```
	 * @param cb 
	 */
	fork(cb: (branch: this) => void): this {
		cb(this);
		return this;
	}
}





export class RangeProgression extends Emitter<number> {
	/**
	 * Creates a chainable progress emitter that applies an easing function to its parent's emitted values
	 * 
	 * @param easer An easing function of the form `(progression: number) => number`
	 * @returns Listenable: emits eased progression values
	 */
	ease(easer?: Easer | keyof typeof easers): RangeProgression
	ease(easer?: undefined): RangeProgression
	ease(easer?: Easer | keyof typeof easers | undefined): RangeProgression {
		const easerFunc = typeof easer == "string"
			? easers[easer]
			: easer;
		const listen = easerFunc
			? this.transform(
				(value, emit) => emit(easerFunc(value))
			)
			: this.onListen;
	
		return new RangeProgression(listen);
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
	tween(from: number, to: number): Emitter<number>;
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
	tween(from: string, to: string): Emitter<string>;
	/**
	 * Creates a chainable emitter that interpolates two given values by progression emitted by its parent
	 * 
	 * Can interpolate types `number`, `number[]`, string and objects with a `blend(from: this, progression: number): this` method
	 * 
	 * @param from Value to interpolate from
	 * @param to Value to interpolate to
	 * @returns Listenable: emits interpolated values
	 */
	tween<T extends Tweenable>(from: T, to: T): Emitter<T>
	tween<T extends BlendableWith<T, R>, R>(from: T, to: R): Emitter<T>
	tween<T extends Tweenable | BlendableWith<any, any>>(from: T, to: T) {		
		const tween = createTween(from, to);
		const listen = this.transform<T>(
			(progress, emit) => emit(tween(progress))
		);
		return new Emitter<T>(listen);
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
	snap(steps: number): RangeProgression {
		if (!Number.isInteger(steps) || steps <= 0) {
			throw new RangeError('snap(steps) requires a positive integer');
		}

		return new RangeProgression(
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
	threshold(threshold: number): RangeProgression {
		const listen = this.transform(
			(value, emit) => emit(value >= threshold ? 1 : 0),
		);
		return new RangeProgression(listen);
	}
	/**
	 * Creates a chainable progress emitter that clamps incoming values
	 * @param min default 0
	 * @param max default 1
	 * @returns Listenable: emits clamped progression values
	 */
	clamp(min: number = 0, max: number = 1): RangeProgression {
		return new RangeProgression(
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
	repeat(count: number): RangeProgression {
		if (count <= 0) throw new RangeError("Repeat count must be greater than 0");
		const listen = this.transform(
			(value, emit) => {
				const out = (value * count) % 1;
				emit(out);
			}
		);
		return new RangeProgression(listen);
	}
	/**
	 * Creates a chainable progress emitter that selectively forwards emissions along the chain
	 * @param check Function that takes an emitted value and returns true if the emission should be forwarded along the chain
	 * @returns Listenable: emits values that pass the filter
	 */
	filter(check: (progress: number) => boolean): RangeProgression {
		const listen = this.transform(
			(value, emit) => {
				if (check(value)) emit(value);
			}
		);
		return new RangeProgression(listen);
	}
	/**
	 * Creates a chainable progress emitter that discards emitted values that are the same as the last value emitted by the new emitter
	 * @returns Listenable: emits non-repeating values
	 */
	dedupe(): RangeProgression {
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
			this._dedupe = new RangeProgression(listen);
		}
		return this._dedupe;
	}
	path(segments: Path): Emitter<XY> {
		const pathEvaluator = createPathEmitter(segments);
		let parentUnsubscribe: UnsubscribeFunc | null = null;
		let pathUnsubscribe: UnsubscribeFunc | null = null;
		
		const { listen, emit } = createListenable<XY>(
			() => {
				// onAddFirst - when first listener subscribes
				pathUnsubscribe = pathEvaluator.listen(emit);
				parentUnsubscribe = this.listen((timeValue) => {
					pathEvaluator.seek(timeValue);
				});
			},
			() => {
				// onRemoveLast - when last listener unsubscribes  
				if (pathUnsubscribe) {
					pathUnsubscribe();
					pathUnsubscribe = null;
				}
				if (parentUnsubscribe) {
					parentUnsubscribe();
					parentUnsubscribe = null;
				}
			}
		);

		return new Emitter(listen);
	}
	private _dedupe?: RangeProgression;
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
	offset(delta: number): RangeProgression {
		return new RangeProgression(
			handler => this.onListen(value => handler((value + delta) % 1))
		);
	}
	/**
	 * Creates a chainable emitter that mirrors emissions from the parent emitter, invoking the provided callback `cb` as a side effect for each emission.  
	 * 
	 * The callback `cb` is called exactly once per parent emission, regardless of how many listeners are attached to the returned emitter.
	 * All listeners attached to the returned emitter receive the same values as the parent emitter.
	 * 
	 * *Note*, the side effect `cb` is only invoked when there is at least one listener attached to the returned emitter
	 * 
	 * @param cb A function to be called as a side effect for each value emitted by the parent emitter.
	 * @returns A new emitter that forwards all values from the parent, invoking `cb` as a side effect.
	 */
	tap(cb: Handler<number>): RangeProgression {
		const listen = this.transform(
			(value, emit) => {
				cb(value);
				emit(value);
			}
		);
		return new RangeProgression(listen);
	}
}


export function createListenable<T>(onAddFirst?: () => void, onRemoveLast?: () => void) {
	const handlers: {fn: (v: T) => void}[] = [];
	const addListener = (fn: (v: T) => void): UnsubscribeFunc => {
		const unique = {fn};
		handlers.push(unique);
		if (onAddFirst && handlers.length == 1) onAddFirst();
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
