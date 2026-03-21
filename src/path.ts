import { Easer, easers } from "./easing.js";
import { createListenable, ListenFunc } from "./emitters.js";
import { Timeline } from "./timeline.js";

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

type StaticSegment = LineSegment | CurveSegment;
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

    const tl = new Timeline();
    let lastXY: XY = [0, 0];

    const firstItem = input[0];
    let getCurrentPosition: () => XY;
    let items: (Segment | XY)[];

    if (Array.isArray(firstItem)) {
        // first is XY - use it as starting position and exclude it from iteration
        items = input.slice(1);
        getCurrentPosition = () => firstItem;
    } else {
        items = input;
        getCurrentPosition = () => [0, 0];
    }

    items.forEach(item => {
        const speed = typeof item === 'object' && !Array.isArray(item) && "speed" in item ? item.speed ?? 1 : 1;

        if (typeof item == "function") {
            const length = estimateLength(item);
            tl.end.range(length / speed).apply(v => lastXY = item(v));
            getCurrentPosition = () => item(1);
        } else if (Array.isArray(item)) { // XY
            const start = getCurrentPosition();
            const length = distance(start, item);
            tl.end.range(length / speed).tween(start, item).apply(v => lastXY = v);
            getCurrentPosition = () => item;
        } else if ("get" in item) { // custom segment
            const length = item.length ?? estimateLength(item.get);
            tl.end.range(length / speed).ease(item.ease).apply(v => lastXY = item.get(v));
            getCurrentPosition = () => item.get(1);
        } else switch (item.type) { // static segment
            case "line": {
                const start = item.from ?? getCurrentPosition();
                const length = distance(start, item.to);
                tl.end.range(length / speed).ease(item.ease).tween(start, item.to).apply(v => lastXY = v);
                getCurrentPosition = () => item.to;
                break;
            }
            case "curve": {
                const start = item.from ?? getCurrentPosition();
                const curve = createCurve(start, item.to, item.control1, item.control2);
                const length = estimateLength(curve);
                tl.end.range(length / speed).ease(item.ease).map(curve).apply(v => lastXY = v);
                getCurrentPosition = () => item.to;
            }
        }
    });

    return { listen, seek: t => {
        tl.seek(t * tl.end.position);
        emit(lastXY);
    } };
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
