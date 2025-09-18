import { clamp } from "./utils";

/** @internal */
export type Tweenable = number | number[] | string | Blendable;

/** @internal */
export interface Blendable {
	blend(target: this, progress: number): this;
}

/** @internal */
export function tweenValue<T extends Tweenable>(from: T, to: T, progress: number): T {
	if (Array.isArray(from)) {
		const toArr = to as typeof from;
		if (from.length != toArr.length) throw new Error("Array size mismatch");
		return from.map((v, i) => tweenValue(v, toArr[i], progress)) as T;
	}
	if (typeof from == "string") {
		return blendStrings(from, to as string, progress) as T;
	}
	if (typeof from == "number") {
		return blendNumbers(from, to as number, progress) as T;
	}
	if (from && typeof from == "object") {
		if ("blend" in from) {
			const blendableSource = from as Blendable;
			return blendableSource.blend(to as Blendable, progress) as T;
		}
	}
	throw new Error("Value not recognised as Tweenable");
}

function blendNumbers(from: number, to: number, progress: number) {
	return from + progress * (to - from);
}

function mergeStrings(
	from: string,
	to: string,
	progress: number
): string {
	const p = Math.min(Math.max(progress, 0), 1);

	// Fast‑path: identical strings or one is empty
	if (from === to) return from;
	if (!from) return to;
	if (!to) return from;

	const split = (s: string): string[] => {
		// Prefer Intl.Segmenter if available (Node ≥ 14, modern browsers)
		if (typeof Intl !== "undefined" && (Intl as any).Segmenter) {
			const seg = new (Intl as any).Segmenter(undefined, { granularity: "grapheme" });
			return Array.from(seg.segment(s), (seg: any) => seg.segment);
		}
		// Fallback regex (covers surrogate pairs & combining marks)
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

	const replaceCount = Math.floor(p * maxLen);

	const result: string[] = new Array(maxLen);
	for (let i = 0; i < maxLen; ++i) {
		result[i] = i < replaceCount ? toP[i] : fromP[i];
	}
	while (result.length && result[result.length - 1] === " ") {
		result.pop();
	}

	return result.join("");
}

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
	return [...rawHex.matchAll(/../g)].map(hex => parseInt(hex[0], 16));
}

function blendColours(from: string, to: string, bias: number) {
	const fromColour = parseColour(from);
	const toColour = parseColour(to);
	const blended = fromColour.map((val, i) => clamp(blendNumbers(val, toColour[i], bias), 0, 255));
	return ("#" + blended.map(n => Math.round(n).toString(16).padStart(2, "0")).join("")).replace(/ff$/, "");
}

const tweenableTokenRegex =
	/(#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;

function blendStrings(
	from: string,
	to: string,
	progress: number
): string {
	if (from === to || progress === 0) return from;
	type Chunk = {
		prefix: string;
		token: string;
	};

	const tokenise = (s: string): Chunk[] => {
		const chunks: Chunk[] = [];
		let lastIdx = 0;
		let m: RegExpExecArray | null;

		while ((m = tweenableTokenRegex.exec(s))) {
			const token = m[0];
			const prefix = s.slice(lastIdx, m.index); // literal before token
			chunks.push({ prefix, token });
			lastIdx = m.index + token.length;
		}

		// trailing literal after the last token – stored as a final chunk
		// with an empty token (so the consumer can easily append it)
		const tail = s.slice(lastIdx);
		if (tail.length) {
			chunks.push({ prefix: tail, token: "" });
		}

		return chunks;
	};

	const fromChunks = tokenise(from);
	const toChunks = tokenise(to);

	const tokenCount = fromChunks.filter(c => c.token).length;
	if (tokenCount !== toChunks.filter(c => c.token).length) {
		return mergeStrings(from, to, progress);
	}

	let result = "";
	for (let i = 0, j = 0; i < fromChunks.length && j < toChunks.length;) {
		const f = fromChunks[i];
		const t = toChunks[j];

		// The *prefix* (the text before the token) must be the same.
		if (f.prefix !== t.prefix) {
			return mergeStrings(from, to, progress);
		}

		// Append the unchanged prefix.
		result += f.prefix;

		// If we are at the *trailing* chunk (no token), just break.
		if (!f.token && !t.token) {
			break;
		}

		// Blend the token according to its kind.
		let blended: string;
		if (f.token.startsWith("#")) {
			blended = blendColours(f.token, t.token, progress);
		} else {
			const fNum = parseFloat(f.token);
			const tNum = parseFloat(t.token);
			const blendedNum = blendNumbers(fNum, tNum, progress);
			blended = blendedNum.toString();
		}

		result += blended;

		// Advance both pointers.
		i++;
		j++;
	}

	return result;
}
