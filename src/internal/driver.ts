import { UnsubscribeFunc } from "./emitters.js";

const default_interval_fps = 60;

const createRafDriver = (tick: (ts: number) => void) => {
	let rafId: number | null = null;
	return () => {
		const frame = (ts: number) => {
			tick(ts);
			rafId = requestAnimationFrame!(frame);
		};
		rafId = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(rafId!);
	};
};

const createIntervalDriver = (tick: (ts: number) => void) => {
	const timeSource = globalThis.performance || globalThis.Date;
	const tickTime = () => tick(timeSource.now());
	return () => {
		const intervalId = setInterval(tickTime, 1000 / default_interval_fps);
		return () => clearInterval(intervalId);
	};
}

export const masterDriver = (() => {
	const timelines = new Map<symbol, (n: number) => void>();
	let previousTime: number | null = null;
	let pause: UnsubscribeFunc | null = null;
	const stepAll = (currentTime: number) => {
		if (previousTime === null) {
			previousTime = currentTime;
			return;
		}
		const delta = currentTime - previousTime;
		previousTime = currentTime;
		timelines.forEach((step, tl) => {
			step(delta);
		});
	}
	const start = "requestAnimationFrame" in globalThis
		? createRafDriver(stepAll)
		: createIntervalDriver(stepAll)

	return (stepFn: (n: number) => void) => {
		const key = Symbol();
		timelines.set(key, stepFn);
		if (timelines.size === 1) {
			previousTime = null;
			pause = start();
		}
		return () => {
			timelines.delete(key);
			if (timelines.size === 0) {
				pause!();
			}
		};
	};
})();

