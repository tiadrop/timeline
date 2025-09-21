/** @internal */
export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** @internal */
export type Widen<T> = T extends number ? number
	: T extends string ? string
	: T;
