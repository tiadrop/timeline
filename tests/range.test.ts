import { animate, Timeline } from '../src/index';

const globalTimeline = new Timeline();
const globalRange = globalTimeline.range(1000, 1000);

test('reports correct start, end and duration', () => {
  const tl = new Timeline();
  const range = tl.range(13, 37);
  expect(range.start.position).toBe(13);
  expect(range.end.position).toBe(13 + 37);
  expect(range.duration).toBe(37);
});

test('emits correct progression', () => {
	const tl = new Timeline();
	const range = tl.range(100, 200);
	let emittedValue = -1;
	range.apply(v => emittedValue = v);
	tl.seek(100);
	expect(emittedValue).toBe(0);
	tl.seek(200);
	expect(emittedValue).toBe(0.5);
	tl.seek(99999);
	expect(emittedValue).toBe(1);
	tl.seek(0);
	expect(emittedValue).toBe(0);
});

test('subdivisons correctly placed and sized', () => {
	const divisions = globalRange.subdivide(4);
	expect(divisions.length).toBe(4);
	expect(divisions.every(d => d.duration == 250)).toBe(true);
	expect(divisions[0].end.position).toBe(divisions[1].start.position);
	expect(divisions[2].end.position).toBe(divisions[3].start.position);
});

test('shifted ranges correctly placed', () => {
	const shifted = globalRange.shift(500);
	expect(shifted.start.position).toBe(1500);
	expect(shifted.end.position).toBe(2500);
});

test('scaled ranges correctly placed', () => {
	const scaledLeft = globalRange.scale(2, 0);
	const scaledMid = globalRange.scale(2, .5);
	expect(scaledLeft.start.position).toBe(1000);
	expect(scaledLeft.duration).toBe(2000);
	expect(scaledMid.start.position).toBe(500);
	expect(scaledMid.duration).toBe(2000);
});

test('contains and overlaps', () => {
	const pointWithin = globalTimeline.point(1500);
	const pointWithout = globalTimeline.point(2500);
	const rangeWithin = globalTimeline.range(1100, 800);
	const rangeWithout = globalTimeline.range(1500, 1000);
	const overlapping = globalTimeline.range(500, 1000);
	expect(globalRange.contains(pointWithin)).toBe(true);
	expect(globalRange.contains(rangeWithin)).toBe(true);
	expect(globalRange.contains(pointWithout)).toBe(false);
	expect(globalRange.contains(overlapping)).toBe(false);
	expect(globalRange.contains(rangeWithout)).toBe(false);
	expect(globalRange.overlaps(overlapping)).toBe(true);
});

test('easing correctly applied', () => {
	const tl = new Timeline();
	const range = tl.range(0, 1000);
	let value = 0;
	range.ease(n => n * 10).apply(v => value = v);
	tl.seek(500);
	expect(value).toBe(5);
});

test("number tweening correctly applied", () => {
	const tl = new Timeline();
	const range = tl.range(0, 1000);
	let value = 0;
	range.tween(1400, 1600).apply(v => value = v);
	tl.seek(500);
	expect(value).toBe(1500);
});

test("array-sampling emitter", () => {
	const tl = new Timeline();
	let value = "";
	tl.range(0, 100)
		.sample(["cats", "dogs", "hamsters", "fish"])
		.apply(v => value = v);
	tl.seek(10);
	expect(value).toBe("cats");
	tl.seek(40);
	expect(value).toBe("dogs");
	tl.seek(80);
	expect(value).toBe("hamsters");
	tl.seek(10000);
	expect(value).toBe("fish");
});

test("play through range", async () => {
	const tl = new Timeline(false);
	let value = -1;
	tl.range(0, 2000).tween(0, 200).apply(v => value = v);

	const playRange = tl.range(0, 1000);
	tl.play(playRange);

	await animate(250).end.promise();
	expect(tl.currentTime).toBeGreaterThanOrEqual(250);
	expect(tl.currentTime).toBeLessThan(270);
	expect(value).toBeGreaterThanOrEqual(25);
	expect(value).toBeLessThan(30);
	await animate(500).end.promise();
	expect(value).toBeGreaterThanOrEqual(75);
	expect(value).toBeLessThan(80);
	await animate(500).end.promise();
	expect(value).toBe(100);
});

test("emission deduplication", () => {
	const tl = new Timeline();
	const range = tl.range(0, 100);
	const sampler = range
		.sample([..."abcde"]);

	let raw = "";
	let deduped = "";
	sampler.apply(v => raw += v);
	sampler.dedupe().apply(v => deduped += v);

	range.spread(8).forEach(p => tl.seek(p));
	tl.seek(tl.end);

	expect(raw).toBe("aabbccdde");
	expect(deduped).toBe("abcde");	
});

test("string tweening", () => {
	const tl = new Timeline();
	let value = "";
	tl.range(0, 100)
		.tween("asd 0%, 50deg #000!", "asd 500%, 200deg #f0f!")
		.apply(v => value = v);
	tl.seek(50);
	expect(value).toBe("asd 250%, 125deg #800080!")
})