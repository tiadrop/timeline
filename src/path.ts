import { Easer, easers } from "./easing.js";
import { createSequence } from "./emitters.js";
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

export function createPath(input: Path) {
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

	const ranges: { duration: number; fn: (progress: number) => XY }[] = [];

	items.forEach(item => {
		const speed = typeof item === 'object'
            && !Array.isArray(item)
            && "speed" in item
             ? item.speed ?? 1
             : 1;

        let length: number | undefined;
		let evaluator: (v: number) => XY;
		let easing: ((v: number) => number) | undefined = "ease" in item
            ? (typeof item.ease == "string" ? easers[item.ease] : item.ease)
            : undefined;

		if (typeof item == "function") {
			evaluator = item;
			getCurrentPosition = () => item(1);
		} else if (Array.isArray(item)) {
			const start = getCurrentPosition();
			length = distance(start, item);
			evaluator = createTween(start, item);
			getCurrentPosition = () => item;
		} else if ("get" in item) {
			length = item.length;
			evaluator = item.get;
			getCurrentPosition = () => item.get(1);
		} else {
            const start = item.from ?? getCurrentPosition();
            getCurrentPosition = () => item.to;
            switch (item.type) {
                case "line": {
                    length = distance(start, item.to);
                    evaluator = createTween(start, item.to);
                    break;
                }
                case "curve": {
                    evaluator = createCurve(start, item.to, item.control1, item.control2);
                    break;
                }
                case "arc": {
                    evaluator = createArc(start, item.to, item.radius, item.direction);
                    break;
                }
            }
        }

		const fn = easing 
			? (v: number) => evaluator(easing(v))
			: evaluator;

		ranges.push({
            duration: (length ?? estimateLength(evaluator)) / speed,
			fn
		});

	});

	return createSequence(ranges);    
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
