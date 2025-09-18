import { Easer, easers } from "./easing";
import { RangeProgression } from "./range";
import { Tweenable, tweenValue } from "./tween";
import { clamp } from "./utils";

/** @internal */
export function createEmitter<T>(
	onListen: (handler: Handler<T>) => UnsubscribeFunc,
): Emitter<T>;
/** @internal */
export function createEmitter<T, API extends object>(
	onListen: (handler: Handler<T>) => UnsubscribeFunc,
	api: Omit<API, keyof Emitter<T>>
): Emitter<T> & API;
/** @internal */
export function createEmitter<T>(
	onListen: (handler: Handler<T>) => UnsubscribeFunc,
	api?: object,
) {
	const propertyDescriptor = Object.fromEntries(Object.entries({
		listen: (handler: Handler<T>) => {
			const uniqueHandler = (value: T) => {
				handler(value);
			};
			return onListen(uniqueHandler);
		},
		map: <R>(mapFunc: (value: T) => R) => {
			return createEmitter<R>(
				handler => {
					const pipedHandler = (value: T) => {
						handler(mapFunc(value));
					};
					return onListen(pipedHandler);
				},
			);
		},
		filter: (filterFunc: (value: T) => boolean) => {
			return createEmitter<T>(
				handler => {
					const filteredHandler = (value: T) => {
						if (filterFunc(value)) handler(value);
					};
					return onListen(filteredHandler);
				}
			);
		},
		noRepeat: (compare?: (a: T, b: T) => boolean) => {
			let previous: null | { value: T; } = null;
			return createEmitter<T>(
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
					return onListen(filteredHandler);
				}
			);
		},
	} as Emitter<T>).map(([key, value]) => [
		key,
		{value}
	]));
	return Object.create(api ?? {}, propertyDescriptor);
}

/** @internal */
export function createProgressEmitter<API extends object>(
	onListen: (handler: Handler<number>) => UnsubscribeFunc,
	api: Omit<API, keyof RangeProgression>,
): RangeProgression & API
/** @internal */
export function createProgressEmitter(
	onListen: (handler: Handler<number>) => UnsubscribeFunc,
): RangeProgression
/** @internal */
export function createProgressEmitter<API extends object>(
	onListen: (handler: Handler<number>) => UnsubscribeFunc,
	api: object = {},
): RangeProgression & API {
	const propertyDescriptor = Object.fromEntries(Object.entries({
		ease: (easer: Easer | keyof typeof easers) => {
			const easerFunc = typeof easer == "string"
				? easers[easer]
				: easer;
			return createProgressEmitter(
				easer ? (handler => 
					onListen((progress: number) => {
						handler(easerFunc(progress));
					})
				) : onListen,
			);
		},
		tween: <T extends Tweenable>(from: T, to: T) => createEmitter<T>(
			handler => onListen(
				progress => handler(tweenValue(from, to, progress))
			)
		),
		snap: (steps: number) => {
			if (!Number.isInteger(steps) || steps <= 0) {
				throw new RangeError('snap(steps) requires a positive integer');
			}

			return createProgressEmitter(
				handler => onListen(progress => {
					const snapped = Math.round(progress * steps) / steps;
					handler(clamp(snapped, 0, 1));
				})
			);
		},
		threshold: (threshold: number) => 
			createProgressEmitter(
				handler => onListen(progress => {
					handler(progress >= threshold ? 1 : 0);
				})
			),
		clamp: (min: number = 0, max: number = 1) => 
			createProgressEmitter(
				handler => onListen(
					progress => handler(clamp(progress, min, max))
				)
			),
		repeat: (repetitions: number) => {
			repetitions = Math.max(0, repetitions);
			return createProgressEmitter(
				handler => onListen(progress => {
					const out = (progress * repetitions) % 1;
					handler(out);
				})
			)	
		},
	} as RangeProgression).map(([key, value]) => [
		key,
		{value}
	]));
	return createEmitter<number, RangeProgression & API>(
		onListen,
		Object.create(api, propertyDescriptor)
	);
}

type Handler<T> = (value: T) => void;
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
	noRepeat(compare?: (a: T, b: T) => boolean): Emitter<T>;
}
