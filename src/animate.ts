import { masterDriver } from "./driver.js";
import { createListenable, ProgressionEmitter } from "./emitters.js";
import { Period } from "./utils.js";

/**
 * Creates an autoplaying one-shot progression emitter
 * @param durationMs Animation duration, in milliseconds
 * @returns Object representing a range on a single-use, autoplaying Timeline
 */
export function animate(durationMs: number): ProgressionEmitter
export function animate(period: Period): ProgressionEmitter
/**
 * Creates a looping progression emitter that will play while it has active listeners
 * @param duration Animation duration, in milliseconds, or a Period
 * @param looping
 * @returns Object representing a range on a looping Timeline
 */
export function animate(duration: number | Period, looping: true): ProgressionEmitter
export function animate(duration: number | Period, looping: boolean = false) {
	const durationMs = typeof duration == "number"
		? duration
		: duration.asMilliseconds;

	if (durationMs === Infinity || durationMs <= 0) throw new RangeError("animate() duration must be positive and finite");
	
	let t = 0;

	if (looping) {
		const { emit, listen } = createListenable<number>(() => masterDriver.apply(delta => {
			t += delta;
			emit((t / durationMs) % 1);
		}));
		return new ProgressionEmitter(h => {
			h(t);
			return listen(h);
		});
	}

	const { emit, listen } = createListenable<number>();

	const masterUnsub = masterDriver.apply(delta => {
		t = Math.min(durationMs, t + delta);
		emit(t / durationMs);
		if (t === duration) {
			masterUnsub();
		}
	});

	return new ProgressionEmitter(h => {
		h(Math.min(t / durationMs, 1));
		return listen(h);
	});
}
