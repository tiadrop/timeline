/** @internal */
export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** @internal */
export type Widen<T> = T extends number ? number
	: T extends string ? string
	: T;

export type OptionalIfKeyIn<T, U> =
  Omit<T, keyof U> &
  Partial<Pick<T, Extract<keyof T, keyof U>>>;

export function prototypify<
	Prototype extends object,
	Members extends object
>(proto: Prototype, members: Members) {
	const propertyDescriptor = Object.fromEntries(
		Object.entries(members).map(([key, value]) => [
			key,
			{value}
		]
	));
	return Object.create(proto, propertyDescriptor) as Prototype & Members;
}
