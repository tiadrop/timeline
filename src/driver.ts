import { createListenable, Emitter } from "./emitters.js";

const default_interval_fps = 60;

export const createIntervalDriver = (targetFps: number = default_interval_fps) => {
    const timeProvider = performance ?? Date;
    const {emit, listen} = createListenable<number>(
        () => {
            let lastTime = timeProvider.now();
            const intervalId = setInterval(() => {
                const now = timeProvider.now();
                emit(now - lastTime);
                lastTime = now;
            }, 1000 / targetFps);
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
	: createIntervalDriver();
