import { Easer, easers } from "./easing.js";
import { createListenable, createSequence, ListenFunc } from "./emitters.js";
import { createTween } from "./tween.js";

export type XY = [number, number];
type SegmentEvaluator = (t: number) => XY;

type LineSegment = {
    type: "line";
    from?: XY;
    to: XY;
    speed?: number;
    ease?: Easer | keyof typeof easers;
}

type CurveSegment = {
    type: "curve";
    from?: XY;
    to: XY;
    control1: XY;
    control2: XY;
    speed?: number;
    ease?: Easer | keyof typeof easers;
}

type ArcSegment = {
    type: "arc",
    from?: XY;
    to: XY;
    radius?: number;
    direction: "clockwise" | "anticlockwise";
    speed?: number;
    ease?: Easer | keyof typeof easers;
}

type StaticSegment = LineSegment | CurveSegment | ArcSegment;
type Segment = StaticSegment | CustomSegment;

type CustomSegment = {
    get: SegmentEvaluator;
    length?: number;
    ease?: Easer | keyof typeof easers;
} | SegmentEvaluator;

type FirstSegment = CustomSegment | (StaticSegment & {
    from: XY;
})

export type Path = [FirstSegment | XY, ...(Segment | XY)[]] | XY[];

type PathEvaluator = {
    listen: ListenFunc<XY>;
    seek: (n: number) => void;
}

export function createPathEmitter(input: Path): PathEvaluator {
	const { listen, emit } = createListenable<XY>();

	const firstItem = input[0];
	let getCurrentPosition: () => XY;
	let items: (Segment | XY)[];

	if (Array.isArray(firstItem)) {
		items = input.slice(1);
		getCurrentPosition = () => firstItem;
	} else {
		items = input;
		getCurrentPosition = () => [0, 0];
	}

	let currentTotalLength = 0;
	const ranges: { start: number; end: number; fn: (progress: number) => XY }[] = [];

	items.forEach(item => {
		const speed = typeof item === 'object' && !Array.isArray(item) && "speed" in item ? item.speed ?? 1 : 1;

		const rangeStart = currentTotalLength;
		let rangeEnd: number;
		let evaluator: (v: number) => XY;
		let easing: ((v: number) => number) | undefined = "ease" in item
            ? (typeof item.ease == "string" ? easers[item.ease] : item.ease)
            : undefined;

		if (typeof item == "function") {
			const length = estimateLength(item);
			rangeEnd = currentTotalLength + length / speed;
			evaluator = item;
			getCurrentPosition = () => item(1);
		} else if (Array.isArray(item)) {
			const start = getCurrentPosition();
			const length = distance(start, item);
			rangeEnd = currentTotalLength + length / speed;
			evaluator = (v) => {
				const tween = createTween(start, item);
				return tween(v);
			};
			getCurrentPosition = () => item;
		} else if ("get" in item) {
			const length = item.length ?? estimateLength(item.get);
			rangeEnd = currentTotalLength + length / speed;
			evaluator = item.get;
			getCurrentPosition = () => item.get(1);
		} else {
            const start = item.from ?? getCurrentPosition();
            switch (item.type) {
                case "line": {
                    const length = distance(start, item.to);
                    rangeEnd = currentTotalLength + length / speed;
                    const tween = createTween(start, item.to);
                    evaluator = (v) => tween(v);
                    getCurrentPosition = () => item.to;
                    break;
                }
                case "curve": {
                    const curve = createCurve(start, item.to, item.control1, item.control2);
                    const length = estimateLength(curve);
                    rangeEnd = currentTotalLength + length / speed;
                    evaluator = curve;
                    getCurrentPosition = () => item.to;
                    break;
                }
                case "arc": {
                    const start = getCurrentPosition();
                    const arc = createArc(start, item.to, item.radius, item.direction);
                    const length = estimateLength(arc);
                    rangeEnd = currentTotalLength + length / (item.speed ?? 1);
                    evaluator = arc;
                    getCurrentPosition = () => item.to;
                    break;
                }
            }
        }

		const fn = easing 
			? (v: number) => evaluator(easing(v))
			: evaluator;

		ranges.push({
			start: rangeStart,
			end: rangeEnd,
			fn
		});

		currentTotalLength = rangeEnd;
	});

	const sequence = createSequence(ranges);

	return {
		listen,
		seek: (t: number) => emit(sequence(t))
	};
}

function createCurve(
    [startX, startY]: XY, 
    [endX, endY]: XY, 
    [control1x, control1y]: XY, 
    [control2x, control2y]: XY
): (t: number) => XY {
    return (t: number) => {
        const ti = 1 - t;
        const x =
            ti ** 3 * startX +
            3 * ti ** 2 * t * control1x +
            3 * ti * t ** 2 * control2x +
            t ** 3 * endX;

        const y =
            ti ** 3 * startY +
            3 * ti ** 2 * t * control1y +
            3 * ti * t ** 2 * control2y +
            t ** 3 * endY;

        return [x, y];
    };
}

function estimateLength(curve: (t: number) => XY, samples: number = 100): number {
    let length = 0;
    let prev = curve(0);

    for (let i = 1; i <= samples; i++) {
        const t = i / samples;
        const current = curve(t);
        length += Math.sqrt((current[0] - prev[0]) ** 2 + (current[1] - prev[1]) ** 2);
        prev = current;
    }

    return length;
}

const distance = (a: XY, b: XY): number =>
    Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);

function createArc(
    [startX, startY]: XY,
    [endX, endY]: XY,
    radius?: number,
    direction: "clockwise" | "anticlockwise" | "cw" | "ccw" = "clockwise"
): (t: number) => XY {
    const dx = endX - startX;
    const dy = endY - startY;
    const chordLength = Math.sqrt(dx * dx + dy * dy);
    
    if (chordLength == 0) {
        return _ => [startX, startY];
    }
    
    const r = radius ?? chordLength / 2;
    const minRadius = chordLength / 2;
    let effectiveRadius = Math.max(r, minRadius);
    
    const halfChord = chordLength / 2;
    let centreOffset = Math.sqrt(effectiveRadius * effectiveRadius - halfChord * halfChord);
    
    if (isNaN(centreOffset)) {
        effectiveRadius = minRadius;
        centreOffset = 0;
    }
    
    const chordMidX = (startX + endX) / 2;
    const chordMidY = (startY + endY) / 2;
    
    const perpX = -dy / chordLength;
    const perpY = dx / chordLength;
    
    const sign = direction === "clockwise" ? 1 : -1;
    const centerX = chordMidX + perpX * sign * centreOffset;
    const centerY = chordMidY + perpY * sign * centreOffset;
    
    const startAngle = Math.atan2(startY - centerY, startX - centerX);
    const endAngle = Math.atan2(endY - centerY, endX - centerX);
    
    let angleDiff = endAngle - startAngle;
    if (direction === "clockwise") {
        if (angleDiff > 0) angleDiff -= Math.PI * 2;
        if (angleDiff > -Math.PI) angleDiff -= Math.PI * 2;
    } else {
        if (angleDiff < 0) angleDiff += Math.PI * 2;
        if (angleDiff < Math.PI) angleDiff += Math.PI * 2;
    }
    
    return (t: number) => {
        const clampedT = Math.max(0, Math.min(1, t));
        const angle = startAngle + angleDiff * clampedT;
        const x = centerX + effectiveRadius * Math.cos(angle);
        const y = centerY + effectiveRadius * Math.sin(angle);
        return [x, y];
    };
}
