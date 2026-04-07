import { createListenable, Emitter } from "./emitters.js";

const default_interval_fps = 60;

const useInterval = () => {
	const {emit, listen} = createListenable<number>(
		() => {
			let lastTime = performance.now();
			const intervalId = setInterval(() => {
				const now = performance.now();
				emit(now - lastTime);
				lastTime = now;
			}, 1000 / default_interval_fps);
			return () => clearInterval(intervalId);
		},
	);
	return new Emitter(listen);
};

const useAnimationFrames = () => {
	const {emit, listen} = createListenable<number>(
		() => {
			let rafId: ReturnType<typeof requestAnimationFrame> | null = null;
			let lastTime: number | null = null;
			const frame = (time: number) => {
				rafId = requestAnimationFrame(frame);
				const elapsed = time - (lastTime ?? time);
				lastTime = time;
				emit(elapsed);
			};
			rafId = requestAnimationFrame(frame);
			return () => cancelAnimationFrame(rafId!);
		}
	);
	return new Emitter(listen);
};

export const masterDriver = "requestAnimationFrame" in globalThis
	? useAnimationFrames()
	: useInterval();
