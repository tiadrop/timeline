import { clamp } from "./utils";

/** @internal */
export type Tweenable = number | number[] | string | string[] | Blendable | Date | Blendable[];

/** @internal */
export interface Blendable {
	blend(target: this, progress: number): this;
}

// typed-target blendable for, eg, rgba.blend("#000")
export interface BlendableWith<T, R> {
	blend(target: R, progress: number): T;
}

type TweenFunc<T> = (progress: number) => T;

enum TokenTypes {
	none,
	number,
	colour,
};

export function createTween<T extends Tweenable>(
	from: T,
	to: T
): TweenFunc<T>
export function createTween<T extends BlendableWith<T, R>, R>(
	from: T,
	to: R
): TweenFunc<T>
export function createTween<T extends Tweenable | BlendableWith<T, any>>(
	from: T,
	to: any
): TweenFunc<unknown> {
	if (from === to) return () => from;
	if (Array.isArray(from)) {
		if (from.length != to.length) {
			throw new Error("Array size mismatch");
		}
		const tweens = from.map((f, i) => createTween(f, to[i]));
		return progress => tweens.map(t => t(progress));
	}
	switch (typeof from) {
		case "number": return progress => blendNumbers(from, to, progress);
		case "object": {
			if (from instanceof Date) return progress => new Date(
				blendNumbers(from.getTime(), to.getTime(), progress)
			);
			return progress => from.blend(to, progress);
		}
		case "string": return createStringTween(from, to);
		default: throw new Error("Invalid tweening type");
	}	
}

function createStringTween(from: string, to: string): TweenFunc<string> {
	const fromChunks = tokenise(from);
	const toChunks = tokenise(to);
	const tokenCount = fromChunks.filter(c => c.token).length;
	// where length mismatch, use merging
	if (tokenCount !== toChunks.filter(c => c.token).length) {
		return createStringMerge(from, to);
	}
	// where token prefix/type mismatch, use merging
	if (fromChunks.some((chunk, i) => 
		toChunks[i].prefix !== chunk.prefix ||
		toChunks[i].type !== chunk.type
	)) {
		return createStringMerge(from, to);
	}

	// convert token chunks to individual string tween funcs
	const tweenChunks = fromChunks.map((chunk, i): TweenFunc<string> => {
		const fromToken = chunk.token;
		const toToken = toChunks[i].token;
		const prefix = chunk.prefix;
		if (chunk.type === TokenTypes.none) return () => prefix;
		if (chunk.type === TokenTypes.colour) {
			const fromColour = parseColour(fromToken);
			const toColour = parseColour(toToken);
			return progress => prefix + blendColours(fromColour, toColour, progress);
		} else {
			const fromNum = parseFloat(fromToken);
			const toNum = parseFloat(toToken);
			return progress => {
				const blendedNum = blendNumbers(fromNum, toNum, progress);
				return prefix + blendedNum.toString();				
			};
		}
	});

	if (tweenChunks.length == 1) return tweenChunks[0];
	return progress => tweenChunks.map(t => t(progress)).join("");
}

function blendNumbers(from: number, to: number, progress: number) {
	return from + progress * (to - from);
}

function createStringMerge(
	from: string,
	to: string,
) {
	// fast‑path: identical strings or one is empty
	if (from === to) return () => from;
	if (!from) return () => to;
	if (!to) return () => from;

	const split = (s: string): string[] => {
		// prefer Intl.Segmenter if available (Node 14, modern browsers)
		if (typeof Intl !== "undefined" && (Intl as any).Segmenter) {
			const seg = new (Intl as any).Segmenter(undefined, { granularity: "grapheme" });
			return Array.from(seg.segment(s), (seg: any) => seg.segment);
		}
		// fallback regex (covers surrogate pairs & combining marks)
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

	return (progress: number) => {
		const clampedProgress = clamp(progress);
		const replaceCount = Math.floor(clampedProgress * maxLen);

		const result: string[] = new Array(maxLen);
		for (let i = 0; i < maxLen; ++i) {
			result[i] = i < replaceCount ? toP[i] : fromP[i];
		}
		while (result.length && result[result.length - 1] === " ") {
			result.pop();
		}

		return result.join("");
	}
}

type Colour = [number, number, number, number];

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
	return [...rawHex.matchAll(/../g)].map(hex => parseInt(hex[0], 16)) as Colour;
}

function blendColours(from: Colour, to: Colour, bias: number) {
	const blended = from.map((val, i) => clamp(blendNumbers(val, to[i], bias), 0, 255));
	return ("#" + blended.map(n => Math.round(n).toString(16).padStart(2, "0")).join("")).replace(/ff$/, "");
}

type Chunk = {
	prefix: string;
	token: string;
	type: number;
};

const tweenableTokenRegex =
	/(#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;

function tokenise(s: string): Chunk[] {
	const chunks: Chunk[] = [];
	let lastIdx = 0;
	let m: RegExpExecArray | null;

	while ((m = tweenableTokenRegex.exec(s))) {
		const token = m[0];
		const prefix = s.slice(lastIdx, m.index); // literal before token
		const type = getTokenType(token);
		chunks.push({ prefix, token, type });
		lastIdx = m.index + token.length;
	}

	// trailing literal after the last token – stored as a final chunk
	const tail = s.slice(lastIdx);
	if (tail.length) {
		chunks.push({ prefix: tail, token: "", type: TokenTypes.none });
	}

	return chunks;
};

function getTokenType(token: string) {
	if (token.startsWith("#")) return TokenTypes.colour;
	return TokenTypes.number;
}