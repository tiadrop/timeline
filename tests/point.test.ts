import { Timeline } from "../src";

const globalTimeline = new Timeline();
const oneSecondIn = globalTimeline.point(1000);

afterEach(() => globalTimeline.seek(0));

test('reports correct position', () => {
	expect(oneSecondIn.position).toBe(1000);
});

test('creating ranges with range() and to()', () => {
	const withRange = oneSecondIn.range(2000);
	expect(withRange.end.position).toBe(3000);
	const twoSecondsIn = globalTimeline.point(2000);
	const withTo = oneSecondIn.to(twoSecondsIn);
	expect(withTo.duration).toBe(1000);
});

test('point delta', () => {
	const twoSecondsIn = oneSecondIn.delta(1000);
	expect(twoSecondsIn.position).toBe(2000);
});

test('point events triggered', () => {
	const tl = new Timeline();
	const point = tl.point(500);
	let triggerCount = 0;
	let value = 0;
	point.apply(() => triggerCount++);
	point.apply(ev => value += ev.direction);
	tl.seek(1000);
	expect(value).toBe(1);
	expect(triggerCount).toBe(1);
	tl.seek(0);
	expect(triggerCount).toBe(2);
	expect(value).toBe(0);
});

test('forward- and backward-only events', () => {
	const tl = new Timeline();
	const point = tl.point(500);
	let value = 0;
	point.forwardOnly.apply(() => value++);
	tl.seek(1000);
	tl.seek(0);
	tl.seek(1000);
	tl.seek(0);
	point.reverseOnly.apply(() => value--);
	tl.seek(1000);
	expect(value).toBe(3);
	tl.seek(0);
	expect(value).toBe(2);
});

test('directional handlers', () => {
	const tl = new Timeline();
	const point = tl.point(500);
	let value = 0;
	point.applyDirectional(
		() => value++,
		() => value--
	);
	tl.seek(1000);
	expect(value).toBe(1);
	tl.seek(0);
	expect(value).toBe(0);
	tl.seek(1000);
	expect(value).toBe(1);
});

test("point promise resolved", async () => {
	const tl = new Timeline(true);
	await tl.point(200).promise();
	tl.point(500);
	expect(tl.currentTime).toBeGreaterThanOrEqual(200);
	expect(tl.currentTime).toBeLessThan(220);
}, 400);

test('handler unsubscription', () => {
	const tl = new Timeline();
	const point = tl.point(500);
	let count = 0;
	const unsub = point.apply(() => count++);
	tl.seek(1000);
	expect(count).toBe(1);
	tl.seek(0);
	expect(count).toBe(2);
	unsub();
	tl.seek(1000);
	expect(count).toBe(2);
});

test('points triggered in order', () => {
	const tl = new Timeline();
	const p1 = tl.point(100);
	const p2 = p1.delta(100);
	const p3 = p2.delta(100);
	let value = 10;

	p2.applyDirectional(
		() => value *= 2,
		() => value /= 2,
	);
	p1.applyDirectional(
		() => value += 5,
		() => value -= 5,
	);
	p3.apply(
		(ev) => value += ev.direction,
	);
	tl.seek(1000);
	expect(value).toBe(31);
	tl.seek(0);
	expect(value).toBe(10);
});

test('forward seeks trigger points on touch, backward seeks on depart', () => {
	const tl = new Timeline();
	let value = 10;

	tl.point(100)
		.applyDirectional(
			() => value *= 2,
			() => value /= 2,
		);
	tl.seek(99.99);
	expect(value).toBe(10);
	tl.seek(100);
	expect(value).toBe(20);
	tl.seek(200);
	expect(value).toBe(20);
	tl.seek(100);
	expect(value).toBe(20);
	tl.seek(99);
	expect(value).toBe(10);
});

test("seek to point", () => {
	globalTimeline.seek(oneSecondIn);
	expect(globalTimeline.currentTime).toBe(1000);
	globalTimeline.seek(globalTimeline.start);
	expect(globalTimeline.currentTime).toBe(0);
});

test("custom filter", () => {
	const tl = new Timeline();
	const point = tl.point(100);
	const rawFn = jest.fn();
	const filterFn = jest.fn();

	point.apply(rawFn);
	point.filter(ev => ev.direction > 0).apply(filterFn);

	tl.seek(200);
	expect(rawFn).toHaveBeenCalledTimes(1);
	expect(filterFn).toHaveBeenCalledTimes(1);
	tl.seek(0);
	expect(rawFn).toHaveBeenCalledTimes(2);
	expect(filterFn).toHaveBeenCalledTimes(1);
	tl.seek(200);
	expect(rawFn).toHaveBeenCalledTimes(3);
	expect(filterFn).toHaveBeenCalledTimes(2);
});

test("point dedupe", () => {
	const tl = new Timeline(false, "wrap");
	tl.point(100);
	const fn = jest.fn();
	tl.point(50)
		.dedupe()
		.apply(fn);
	tl.currentTime += 99;
	expect(fn).toHaveBeenCalledTimes(1);
	tl.currentTime += 99;
	expect(fn).toHaveBeenCalledTimes(1);
	expect(tl.currentTime).toBe(198);
	tl.currentTime -= 97;
	expect(fn).toHaveBeenCalledTimes(2);
	tl.currentTime -= 98;
	expect(fn).toHaveBeenCalledTimes(2);
});

test("disallow listen during event", () => {
	const tl = new Timeline();
	tl.point(1).apply(() => tl.point(2).apply(jest.fn()));
	expect(() => {
		tl.seek(5)
	}).toThrow();
});
