/** @internal */
export const clamp = (value: number, min: number = 0, max: number = 1) => Math.min(Math.max(value, min), max);

/** @internal */
export type Widen<T> = T extends number ? number
	: T extends string ? string
	: T;
