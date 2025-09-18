import { Easer, easers } from "./easing";
import { Emitter } from "./emitters";
import { TimelinePoint } from "./point";
import { Blendable } from "./tween";

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
	/**
	 * Creates a new range representing a direct expansion of this one
	 * @param delta Amount to grow by (in time units)
	 * @param anchor Normalised position at which to expand (0 being the start, expanding right, 1 being the end, expanding left, 0.5 expanding evenly)
	 * @returns Listenable: this range will emit a progression value (0..1) when a `seek()` passes or intersects it
	 */
	grow(delta: number, anchor?: number): TimelineRange;
	/**
	 * Creates a new range representing a multiplicative expansion of this one
	 * @param factor Size multiplier
	 * @param anchor Normalised position at which to expand (0 being the start, expanding right, 1 being the end, expanding left, 0.5 expanding evenly)
	 * @returns Listenable: this range will emit a progression value (0..1) when a `seek()` passes or intersects it
	 */
	scale(factor: number, anchor?: number): TimelineRange;
	/** The point on the Timeline at which this range begins */
	readonly start: TimelinePoint;
	/** The point on the Timeline at which this range ends */
	readonly end: TimelinePoint;
	/** The duration of this range */
	readonly duration: number;
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
	 * @param count Number of repetitions
	 */
	repeat(count: number): RangeProgression;
	
}
