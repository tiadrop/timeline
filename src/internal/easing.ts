export type Easer = (n: number) => number;

const overshoot = 1.70158;
export const easers = {
	linear: (x) => x,
	easeIn: (x) => x * x,
	easeIn4: (x) => Math.pow(x, 4),
	easeOut: (x) => 1 - Math.pow((1 - x), 2),
	easeOut4: (x) => 1 - Math.pow((1 - x), 4),
	circleIn: (x) => 1 - Math.sqrt(1 - Math.pow(x, 2)),
	circleIn4: (x) => 1 - Math.sqrt(1 - Math.pow(x, 4)),
	circleOut: (x) => Math.sqrt(1 - Math.pow((1 - x), 2)),
	circleOut4: (x) => Math.sqrt(1 - Math.pow((1 - x), 4)),
	easeInOut: (x) => -Math.cos(x * Math.PI) / 2 + .5,
	elastic: (x) => 1 - Math.cos(4 * Math.PI * x) * (1 - x),
	overshootIn: (x) => --x * x * ((overshoot + 1) * x + overshoot) + 1,
	sine: (x) => (Math.sin(2 * Math.PI * x) + 1) / 2,
	invert: (x) => 1 - x,
	bounce: (x) => {
		if (x < 4 / 11.0) {
			return (121 * x * x) / 16.0;
		}
		else if (x < 8 / 11.0) {
			return (363 / 40.0 * x * x) - (99 / 10.0 * x) + 17 / 5.0;
		}
		else if (x < 9 / 10.0) {
			return (4356 / 361.0 * x * x) - (35442 / 1805.0 * x) + 16061 / 1805.0;
		}
		else {
			return (54 / 5.0 * x * x) - (513 / 25.0 * x) + 268 / 25.0;
		}
	},
	noise: (x) => x == 0 ? 0 : (x >= 1 ? 1 : Math.random()),
	pingpong: (x) => x < .5 ? x * 2 : 1 - (x - .5) * 2,
} satisfies Readonly<Record<string, Easer>>;
