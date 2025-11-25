import { Timeline } from "../src";

const globalTimeline = new Timeline();

test("forking", () => {
	const tl = new Timeline();
	const range = tl.range(0, 1000);
	let v1 = -1;
	let v2 = -1;
	const handler = jest.fn();
	range
		.fork(
			range => range.apply(v => v1 = v)
		)
		.tween(0, 50)
		.fork(
			tweened => tweened.apply(v => v2 = v)
		)
		.apply(handler);
	tl.seek(500);
	expect(v1).toBe(.5);
	expect(v2).toBe(25);
	expect(handler).toHaveBeenCalledWith(25);
});

test("tap functions called once per update", () => {
	const tl = new Timeline();
	const tapHandler = jest.fn();
	let count = 0;
	const tapped = tl.point(10)
		.tap(tapHandler);
	tapped.apply(() => count++);
	tapped.apply(() => count++);
	
	tl.seek(10);
	expect(tapHandler).toHaveBeenCalledTimes(1);
	expect(count).toBe(2);
});

test("snapping", () => {
	const tl = new Timeline();
	const range = tl.range(0, 1000);
	let value = 0;
	range
		.snap(10)
		.tween(0, 100)
		.apply(v => value = v);
	tl.seek(480);
	expect(value).toBe(50);
	tl.seek(840);
	expect(value).toBe(80);
});

test("invalid snap value", () => {
	const range = new Timeline().range(0, 1);
	expect(jest.fn(() => {
		range.snap(0.5)
	})).toThrow();
	expect(jest.fn(() => {
		range.snap(-2)
	})).toThrow();
});

test("threshold", () => {
	const tl = new Timeline();
	let value = -1;
	tl.range(0, 1000)
		.threshold(.8)
		.apply(v => value = v);
	tl.seek(400);
	expect(value).toBe(0);
	tl.seek(600);
	expect(value).toBe(0);
	tl.seek(800);
	expect(value).toBe(1);
	tl.seek(1000);
	expect(value).toBe(1);
});

test("range clamping", () => {
	const tl = new Timeline();
	let value = -1;
	tl.range(0, 100)
		.clamp(0, .8)
		.apply(v => value = v);
	tl.seek(40);
	expect(value).toBe(.4);
	tl.seek(90);
	expect(value).toBe(.8);
});

test("range repeating", () => {
	const tl = new Timeline();
	let value = -1;
	tl.range(0, 100)
		.repeat(2)
		.apply(v => value = v);
	
	tl.seek(25);
	expect(value).toBe(.5);
	tl.seek(49.999);
	expect(value).toBeCloseTo(1);
	tl.seek(50.001);
	expect(value).toBeCloseTo(0);
	tl.seek(75);
	expect(value).toBe(.5);
});

test("filtering", () => {
	const tl = new Timeline();
	let value = -1;
	tl.range(0, 5)
		.tween(0, 5)
		.map(v => Math.floor(v))
		.filter(v => v % 2 == 0)
		.apply(v => value = v);
	tl.seek(1);
	expect(value).toBe(0);
	tl.seek(2);
	expect(value).toBe(2);
	tl.seek(3);
	expect(value).toBe(2);
});

test("unsubscription", () => {
	const fn = jest.fn();
	const unsub = globalTimeline.point(100).apply(fn);
	globalTimeline.seek(200);
	globalTimeline.seek(0);
	globalTimeline.seek(200);
	unsub();
	globalTimeline.seek(0);
	expect(fn).toHaveBeenCalledTimes(3);
});


test("tap unsubscription", () => {
	const tapFn = jest.fn();
	const fn = jest.fn();
	const tapped = globalTimeline.point(100)
		.tap(tapFn);

	const unsub1 = tapped.apply(fn);
	const unsub2 = tapped.map(v => 0).apply(fn);

	globalTimeline.seek(200); // fn +2, tfn +1
	globalTimeline.seek(0); // fn +2, tfn +1
	globalTimeline.seek(200); // fn +2, tfn +1
	unsub1();
	globalTimeline.seek(0); // fn +1, tfn +1
	expect(fn).toHaveBeenCalledTimes(7);
	unsub2();
	globalTimeline.seek(0); // +0
	expect(fn).toHaveBeenCalledTimes(7);
	expect(tapFn).toHaveBeenCalledTimes(4);
});

test("filtering", () => {
	const tl = new Timeline();
	const emissions: string[] = [];
	tl.range(0, 100)
		.filter(v => v < .6)
		.sample(["a", "l", "e", "t", "a", "r", "o", "f", "l"])
		.dedupe()
		.apply(v => emissions.push(v));
	tl.range(0, 200).spread(20).forEach(p => tl.seek(p));
	expect(emissions.join(",")).toBe("a,l,e,t,a");	
});
