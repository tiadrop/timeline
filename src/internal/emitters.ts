import { Easer, easers } from "./easing";
import { Blendable, BlendableWith, Tweenable, tweenValue } from "./tween";
import { clamp } from "./utils";

type Handler<T> = (value: T) => void;
export type ListenFunc<T> = (handler: Handler<T>) => UnsubscribeFunc;
export type UnsubscribeFunc = () => void;

export class Emitter<T> {
	protected constructor(protected onListen: ListenFunc<T>) {}

	/**
	 * Used by tap() to create a clone of an Emitter with a redirected onListen
	 * Should be overridden in all Emitter subclasses
	 * @see {@link TimelineRange.redirect}
	 * @param listen 
	 * @returns {this}
	 */
	protected redirect = (listen: ListenFunc<T>) => new Emitter<T>(listen);

	/**
	 * Registers a function to receive emitted values
	 * @param handler 
	 * @returns A function to deregister the handler
	 */
	listen(handler: Handler<T>): UnsubscribeFunc {
		return this.onListen((value: T) => {
			handler(value);
		})
	}
	/**
	 * Creates a chainable emitter that applies arbitrary transformation to values emitted by its parent
	 * @param mapFunc 
	 * @returns Listenable: emits transformed values
	 */
	map<R>(mapFunc: (value: T) => R): Emitter<R> {
		return new Emitter<R>(
			handler => this.onListen((value: T) => {
				handler(mapFunc(value));
			}
		));
	}
	/**
	 * Creates a chainable emitter that selectively forwards emissions along the chain
	 * @param check Function that takes an emitted value and returns true if the emission should be forwarded along the chain
	 * @returns Listenable: emits values that pass the filter
	 */
	filter(check: (value: T) => boolean): Emitter<T> {
		return new Emitter<T>(
			handler => this.onListen((value) => {
				if (check(value)) handler(value);
			})
		);
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
		return new Emitter<T>(handler => {
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
			return this.onListen(filteredHandler);
		});
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
	tap(cb: Handler<T>): this {
		const listeners: Handler<T>[] = [];
		let parentUnsubscribe: UnsubscribeFunc | null = null;

		const tappedListen: ListenFunc<T> = (handler: Handler<T>) => {
			listeners.push(handler);
			if (listeners.length === 1) {
				parentUnsubscribe = this.onListen(value => {
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
		return this.redirect(tappedListen) as this;
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
	 *   .fork(branch => {
	 *     branch
	 *       .map(s => `Loading: ${s}`)
	 *       .listen(s => document.title = s)
	 *   })
	 *   .listen(v => progressBar.style.width = v);
	 * ```
	 * @param cb 
	 */
	fork(cb: (branch: this) => void): this {
		cb(this);
		return this;
	}
}





export class RangeProgression extends Emitter<number> {
	protected redirect = (listen: ListenFunc<number>) => new RangeProgression(listen);
	/**
	 * Creates a chainable progress emitter that applies an easing function to its parent's emitted values
	 * 
	 * @param easer An easing function of the form `(progression: number) => number`
	 * @returns Listenable: emits eased progression values
	 */
	ease(easer?: Easer | keyof typeof easers): RangeProgression
	ease(easer?: undefined): RangeProgression
	ease(easer?: Easer | keyof typeof easers | undefined): RangeProgression {
		if (!easer) return this;
		const easerFunc = typeof easer == "string"
			? easers[easer]
			: easer;
		return new RangeProgression(
			easer ? (handler => 
				this.onListen((progress: number) => {
					handler(easerFunc(progress));
				})
			) : h => this.onListen(h),
		);
	}
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
	tween<T extends Tweenable>(from: T, to: T): Emitter<T>
	tween<T extends BlendableWith<T, R>, R>(from: T, to: R): Emitter<T>
	tween<T extends Tweenable | BlendableWith<any, any>>(from: T, to: T): Emitter<T> {		
		return new Emitter<T>(
			handler => this.onListen(
				progress => handler(tweenValue(from, to, progress))
			)
		)
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
				handler(clamp(snapped, 0, 1));
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
		return new RangeProgression(
			handler => this.onListen(progress => {
				handler(progress >= threshold ? 1 : 0);
			})
		);
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
		count = Math.max(0, count);
		return new RangeProgression(
			handler => this.onListen(progress => {
				const out = (progress * count) % 1;
				handler(out);
			})
		)	
	}
	/**
	 * Creates a chainable progress emitter that selectively forwards emissions along the chain
	 * @param check Function that takes an emitted value and returns true if the emission should be forwarded along the chain
	 * @returns Listenable: emits values that pass the filter
	 */
	filter(check: (value: number) => boolean): RangeProgression {
		return new RangeProgression(
			handler => this.onListen((value) => {
				if (check(value)) handler(value);
			})
		)
	}
	/**
	 * Creates a chainable progress emitter that discards emitted values that are the same as the last value emitted by the new emitter
	 * @returns Listenable: emits non-repeating values
	 */
	dedupe(): RangeProgression {
		let previous: null | number = null;
		return new RangeProgression(
			handler => {
				return this.onListen((value: number) => {
					if (
						!previous === null || previous !== value
					) {
						handler(value);
						previous = value;
					}
				});
			},
		);
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
	offset(delta: number): RangeProgression {
		return new RangeProgression(
			handler => this.onListen(value => handler((value + delta) % 1))
		);
	}
}
