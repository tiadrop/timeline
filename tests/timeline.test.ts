import { Period } from "@xtia/mezr";
import { animate, Timeline } from "../src";

test("looping", async () => {
	const tl = new Timeline(true, "restart");
	let count = 0;
	tl.point(5)
		.apply(v => count++);
	await new Timeline(true).range(0, 100).end.promise();
	tl.pause();
	expect(count).toBeGreaterThan(10);
});

test("legacy api", () => {
	const tl = new Timeline();
	const fn = jest.fn();
	let tweenValue = 0;
	tl.at(10, fn)
		.thenWait(5)
		.then(fn)
		.thenTween(20, v => tweenValue = v, 0, 255);

	tl.seek(14);
	expect(fn).toHaveBeenCalledTimes(1);
	tl.seek(100);
	expect(fn).toHaveBeenCalledTimes(2);
	expect(tweenValue).toBe(255);
});

test("overall progression", () => {
	const tl = new Timeline();
	tl.point(100);
	let value = -1;
	tl.progression.apply(v => value = v);
	tl.seek(20);
	expect(value).toBe(.2);
	tl.seek(99);
	expect(value).toBe(.99);	
});

test("immediately complete interrupted seeks", async () => {
	const tl = new Timeline();
	const seekFn = jest.fn();
	const pointFn = jest.fn();
	tl.point(100).apply(pointFn);
	tl.seek(100, 500).then(seekFn);
	expect(tl.currentTime).toBe(0);
	await new Timeline(true).range(0, 100);
	expect(seekFn).not.toHaveBeenCalled();
	expect(pointFn).not.toHaveBeenCalled();
	tl.seek(0, 300);
	expect(pointFn).toHaveBeenCalled();
	await new Timeline(true).range(0, 10);
	expect(seekFn).toHaveBeenCalled();
});

test("mezr Period seek duration", async () => {
	const tl = new Timeline();
	const startTime = Date.now();
	tl.seek(100, Period.seconds(.2));
	let elapsed = Date.now() - startTime;
	expect(elapsed).toBeLessThan(50);
	await tl.point(100).promise();
	elapsed = Date.now() - startTime;
	expect(elapsed).toBeGreaterThanOrEqual(200);
	expect(elapsed).toBeLessThan(250);
});

test("frameEvents emits after state updates", () => {
	const state = {
		x: 0,
		y: 0
	};
	let rendered = state;
	function render() {
		rendered = state;
	}
	const tl = new Timeline();
	tl.range(0, 100).apply(v => state.x = v);
	tl.range(0, 100).tween(10, 5).apply(v => state.y = v);
	tl.apply(render);
	tl.seek(75);
	expect(rendered.x).toBe(.75);
	expect(rendered.y).toBe(6.25);
});

test("wrap at non-zero position", () => {
	const tl = new Timeline(false, {wrapAt: 25});
	let value = -1;
	tl.range(0, 100).apply(v => value = v);
	tl.seek(150);
	expect(value).toBe(.75);
	tl.seek(500);
	expect(value).toBe(.5);
});

test("multiple cycle wrapping", () => {
	const tl = new Timeline(false, "wrap");
	let counter = 0;
	tl.point(50).apply(ev => counter += ev.direction);
	tl.point(100); // extend end
	tl.seek(400);
	expect(counter).toBe(4);
	tl.currentTime -= 60;
	expect(counter).toBe(3);
});

test("disallow seek within handlers", () => {
	const tl = new Timeline();
	tl.point(5).apply(() => {
		tl.seek(10);
	});
	expect(jest.fn(() => tl.seek(6))).toThrow();
});

test("instantiate with options object", async () => {
	const tl1 = new Timeline({
		autoplay: true,
		timeScale: .5
	});
	let lastEmission = -1;
	tl1.range(0, 1000)
		.tween(0, 100)
		.map(Math.floor)
		.apply(v => lastEmission = v);
	await new Timeline(true).range(0, 250).end.promise();
	expect(lastEmission).toBeGreaterThanOrEqual(11);
	expect(lastEmission).toBeLessThan(15);
	tl1.pause();
});

test("legacy api: at", () => {
	const tl = new Timeline();
	let count = 0;
	tl.at(5, () => count++, () => count--);
	tl.seek(10);
	expect(count).toBe(1);
	tl.seek(0);
	expect(count).toBe(0);
})