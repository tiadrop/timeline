import { Easer, easers } from "./easing";
import { Blendable, Tweenable, tweenValue } from "./tween";
import { clamp, OptionalIfKeyIn, prototypify } from "./utils";

/** @internal */
export function createEmitter<T>(
	listen: ListenFunc<T>,
): Emitter<T>;
/** @internal */
export function createEmitter<T, API extends object>(
	onListen: ListenFunc<T>,
	api: OptionalIfKeyIn<API, Emitter<T>>
): Emitter<T> & API;
/** @internal */
export function createEmitter<T, API extends object>(
	listen: ListenFunc<T>,
	api?: API,
) {
	const methods = {
		listen: (handler: Handler<T>) => listen((value: T) => {
			handler(value);
		}),
		map: <R>(mapFunc: (value: T) => R) => createEmitter<R>(
			handler => listen((value: T) => {
				handler(mapFunc(value));
			}
		)),
		filter: (filterFunc: (value: T) => boolean) => createEmitter<T>(
			handler => listen((value) => {
				if (filterFunc(value)) handler(value);
			})
		),
		dedupe: (compare?: (a: T, b: T) => boolean) => {
			let previous: null | { value: T; } = null;
			return createEmitter<T, API>(
				handler => {
					const filteredHandler = (value: T) => {
						if (
							!previous || (
								compare
									? !compare(previous.value, value)
									: (previous.value !== value)
							)
						) {
							handler(value);
							previous = { value };
						}
					};
					return listen(filteredHandler);
				},
				api ?? {} as API
			);
		},
		tap: (cb: Handler<T>) => createTap(createEmitter<T>, listen, cb),
		fork: (cb: (branch: Emitter<T> & API) => void) => {
			cb(emitter);
			return emitter;
		}
	} as Emitter<T>;
	
	const emitter = prototypify(methods, api ?? {} as API);
	return emitter;
}

/** @internal */
export function createProgressEmitter<API extends object>(
	listen: ListenFunc<number>,
	api: Omit<API, keyof RangeProgression>,
): RangeProgression & API
/** @internal */
export function createProgressEmitter(
	listen: ListenFunc<number>,
): RangeProgression
/** @internal */
export function createProgressEmitter<API extends object>(
	listen: ListenFunc<number>,
	api?: API,
): RangeProgression & API {
	const methods = {
		ease: (easer: Easer | keyof typeof easers) => {
			const easerFunc = typeof easer == "string"
				? easers[easer]
				: easer;
			return createProgressEmitter(
				easer ? (handler => 
					listen((progress: number) => {
						handler(easerFunc(progress));
					})
				) : listen,
			);
		},
		tween: <T extends Tweenable>(from: T, to: T) => createEmitter<T>(
			handler => listen(
				progress => handler(tweenValue(from, to, progress))
			)
		),
		snap: (steps: number) => {
			if (!Number.isInteger(steps) || steps <= 0) {
				throw new RangeError('snap(steps) requires a positive integer');
			}

			return createProgressEmitter(
				handler => listen(progress => {
					const snapped = Math.round(progress * steps) / steps;
					handler(clamp(snapped, 0, 1));
				})
			);
		},
		threshold: (threshold: number) => createProgressEmitter(
			handler => listen(progress => {
				handler(progress >= threshold ? 1 : 0);
			})
		),
		clamp: (min: number = 0, max: number = 1) => createProgressEmitter(
			handler => listen(
				progress => handler(clamp(progress, min, max))
			)
		),
		repeat: (repetitions: number) => {
			repetitions = Math.max(0, repetitions);
			return createProgressEmitter(
				handler => listen(progress => {
					const out = (progress * repetitions) % 1;
					handler(out);
				})
			)	
		},
		tap: (cb: Handler<number>) => createTap<number, RangeProgression>(createProgressEmitter, listen, cb),
		filter: (filterFunc: (value: number) => boolean) => createProgressEmitter(
			handler => listen((value) => {
				if (filterFunc(value)) handler(value);
			})
		),
		offset: (delta: number) => createProgressEmitter(
			handler => listen(value => handler((value + delta) % 1))
		),
	};
	const baseEmitter = createEmitter<number, RangeProgression>(listen, methods);
	const emitter = prototypify(baseEmitter, api ?? {} as API);
	return emitter;
}


function createTap<T, E extends Emitter<any>>(
	create: (listener: ListenFunc<T>) => E,
	parentListen: ListenFunc<T>,
	cb: Handler<T>,
) {
	const listeners: Handler<T>[] = [];
	let parentUnsubscribe: UnsubscribeFunc | null = null;

	const tappedListen: ListenFunc<T> = (handler: Handler<T>) => {
		listeners.push(handler);
		if (listeners.length === 1) {
			parentUnsubscribe = parentListen(value => {
				cb(value);
				listeners.slice().forEach(fn => fn(value));
			});
		}

		return () => {
			const idx = listeners.indexOf(handler);
			listeners.splice(idx, 1);
			if (listeners.length === 0 && parentUnsubscribe) {
				parentUnsubscribe();
				parentUnsubscribe = null;
			}
		};
	};
	return create(tappedListen);
}

type Handler<T> = (value: T) => void;
type ListenFunc<T> = (handler: Handler<T>) => UnsubscribeFunc;
export type UnsubscribeFunc = () => void;





export interface Emitter<T> {
	/**
	 * Registers a function to receive emitted values
	 * @param handler 
	 * @returns A function to deregister the handler
	 */
	listen(handler: Handler<T>): UnsubscribeFunc;
	/**
	 * Creates a chainable emitter that applies arbitrary transformation to values emitted by its parent
	 * @param mapFunc 
	 * @returns Listenable: emits transformed values
	 */
	map<R>(mapFunc: (value: T) => R): Emitter<R>;
	/**
	 * Creates a chainable emitter that selectively forwards emissions along the chain
	 * @param check Function that takes an emitted value and returns true if the emission should be forwarded along the chain
	 * @returns Listenable: emits values that pass the filter
	 */
	filter(check: (value: T) => boolean): Emitter<T>;
	/**
	 * Creates a chainable emitter that discards emitted values that are the same as the last value emitted by the new emitter
	 * @param compare Optional function that takes the previous and next values and returns true if they should be considered equal
	 * 
	 * If no `compare` function is provided, values will be compared via `===`
	 * @returns Listenable: emits non-repeating values
	 */
	dedupe(compare?: (a: T, b: T) => boolean): Emitter<T>;
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
	tap(cb: Handler<T>): Emitter<T>;
	/**
	 * Immediately passes this emitter to a callback and returns this emitter
	 * 
	 * Allows branching without breaking a composition chain
	 * 
	 * @example
	 * ```ts
	 * range
	 *   .tween("0%", "100%")
	 *   .fork(branch => {
	 *     branch
	 *       .map(s => `Loading: ${s}`)
	 *       .listen(s => document.title = s)
	 *   })
	 *   .listen(v => progressBar.style.width = v);
	 * ```
	 * @param cb 
	 */
	fork(cb: (branch: Emitter<T>) => void): Emitter<T>;
}





export interface RangeProgression extends Emitter<number> {
	/**
	 * Creates a chainable progress emitter that applies an easing function to its parent's emitted values
	 * 
	 * @param easer An easing function of the form `(progression: number) => number`
	 * @returns Listenable: emits eased progression values
	 */
	ease(easer?: Easer | keyof typeof easers): RangeProgression;
	/**
	 * Creates a chainable emitter that interpolates two given values by progression emitted by its parent
	 * 
	 * Can interpolate types `number`, `number[]`, string and objects with a `blend(from: this, to: this): this` method
	 * 
	 * @param from Value to interpolate from
	 * @param to Value to interpolate to
	 * @returns Listenable: emits interpolated values
	 */
	tween(from: number, to: number): Emitter<number>;
	/**
	 * Creates a chainable emitter that interpolates two given values by progression emitted by its parent
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
	 * @returns Listenable: emits interpolated values
	 */
	tween(from: string, to: string): Emitter<string>;
	/**
	 * Creates a chainable emitter that interpolates two given values by progression emitted by its parent
	 * 
	 * Can interpolate types `number`, `number[]`, string and objects with a `blend(from: this, to: this): this` method
	 * 
	 * @param from Value to interpolate from
	 * @param to Value to interpolate to
	 * @returns Listenable: emits interpolated values
	 */
	tween<T extends Blendable | number[]>(from: T, to: T): Emitter<T>;
	/**
	 * Creates a chainable progress emitter that quantises progress, as emitted by its parent, to the nearest of `steps` discrete values.
	 *
	 * @param steps – positive integer (e.g. 10 → 0, .1, .2 … 1)
	 * @throws RangeError if steps is not a positive integer
	 * @returns Listenable: emits quantised progression values
	 */
	snap(steps: number): RangeProgression;
	/**
	 * Creates a chainable progress emitter that emits `1` when the incoming progress value is greater‑than‑or‑equal to the supplied `threshold`, otherwise emits `0`
	 *
	 * @param threshold the cut‑off value
	 * @returns Listenable: emits 0 or 1 after comparing progress with a threshold
	 */
	threshold(threshold: number): RangeProgression;
	/**
	 * Creates a chainable progress emitter that clamps incoming values
	 * @param min default 0
	 * @param max default 1
	 * @returns Listenable: emits clamped progression values
	 */
	clamp(min?: number, max?: number): RangeProgression;
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
	repeat(count: number): RangeProgression;
	/**
	 * Creates a chainable progress emitter that mirrors emissions from the parent emitter, invoking the provided callback `cb` as a side effect for each emission.  
	 * 
	 * The callback `cb` is called exactly once per parent emission, regardless of how many listeners are attached to the returned emitter.
	 * All listeners attached to the returned emitter receive the same values as the parent emitter.
	 * 
	 * *Note*, the side effect `cb` is only invoked when there is at least one listener attached to the returned emitter
	 * 
	 * @param cb A function to be called as a side effect for each value emitted by the parent emitter.
	 * @returns A new emitter that forwards all values from the parent, invoking `cb` as a side effect.
	 */
	tap(cb: (value: number) => void): RangeProgression;
	/**
	 * Creates a chainable progress emitter that selectively forwards emissions along the chain
	 * @param check Function that takes an emitted value and returns true if the emission should be forwarded along the chain
	 * @returns Listenable: emits values that pass the filter
	 */
	filter(check: (value: number) => boolean): RangeProgression;
	/**
	 * Creates a chainable progress emitter that discards emitted values that are the same as the last value emitted by the new emitter
	 * @returns Listenable: emits non-repeating values
	 */
	dedupe(): RangeProgression;
	/**
	 * Creates a chainable progress emitter that offsets its parent's values by the given delta, wrapping at 1
	 * 
	 * ```plain
	 *‎	1
	 *‎	 |  /
	 *‎	o| /
	 *‎	u|/      __ delta=.5
	 *‎	t|     /
 	 *‎	 |    /
 	 *‎	 |___/__
     *‎	0  in   1
	 * ```
	 * 
	 * @param delta
	 * @returns Listenable: emits offset values
	 */
	offset(delta: number): RangeProgression;
	fork(cb: (branch: RangeProgression) => void): RangeProgression;
}
