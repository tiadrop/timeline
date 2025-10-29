import { Period } from "@xtia/mezr";
import { animate, Timeline } from "../src";

test("looping", async () => {
	const tl = new Timeline(true, "restart");
	let count = 0;
	tl.point(5)
		.apply(v => count++);
	await animate(100).end.promise();
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
	await animate(100);
	expect(seekFn).not.toHaveBeenCalled();
	expect(pointFn).not.toHaveBeenCalled();
	tl.seek(0, 300);
	expect(pointFn).toHaveBeenCalled();
	await animate(10);
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
