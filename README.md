# Timeline

### Not Just Another Animation Library

Timeline is a type-safe, seekable, deterministic choreography system that can control state transitions in any environment, whether that's a simple or complex CSS animation, managing a microcontroller's output, or synchronising complex hardware sequences.

* [API Reference](#reference)
* [Playground](https://stackblitz.com/edit/timeline-string-tween?file=src%2Fmain.ts)
* [Intro by HL](https://codepen.io/H-L-the-lessful/full/vELdyvB)

## Basic Use:

`npm i @xtia/timeline`

```ts
import { Timeline } from "@xtia/timeline";

// create a Timeline
const timeline = new Timeline();

// over the first second, fade an element's background colour
timeline
    .range(0, 1000)
    .tween("#646", "#000")
    .apply(
        value => element.style.background = value
    );

// add another tween to make a slow typing effect
const message = "Hi, planet!";
timeline
    .range(500, 2000)
    .ease("easeOut")
    .tween(0, message.length)
    .map(n => message.substring(0, n))
    .apply(
        s => element.textContent = s
    );

// control anything:
timeline
    .range(1000, 2000)
    .tween(0, 255)
    .apply(value => microcontroller.setPWM(value))

// make it go
timeline.play();
```

## Ranges and Emitters

`timeline.range(start, duration)` returns an object representing a period within the Timeline.

```ts
const firstFiveSeconds = timeline.range(0, 5000);
```

The range object is *applyable* and emits a progression value (between 0 and 1) when the Timeline's internal position passes through or over that period.

```ts
firstFiveSeconds
    .apply(
        value => console.log(`${value} is between 0 and 1`)
    );
```

Range emissions can be transformed through chains:

```ts
// multiply emitted values by 100 with map()
const asPercent = firstFiveSeconds.map(n => n * 100);

// use the result in a log message
asPercent
    .map(n => n.toFixed(2))
    .apply(
        n => console.log(`We are ${n}% through the first five seconds`)
    );

// and in a css property
asPercent
    .map(n => `${n}%`)
    .apply(
        n => progressBar.style.width = n
    );

// apply easing
const eased = firstFiveSeconds.ease("easeInOut");
eased.apply(
    v => console.log(`Eased value: ${v}`)
);

// chain them
range
    .tween(0, 30)
    .map(Math.floor)
    .dedupe()
    .tap(n => console.log("Showing frame #", n))
    .map(n => `animation-frame-${n}.png`)
    .apply(filename => img.src = filename);

// each step in a chain is a 'pure', independent emitter that emits a
// transformation of its parent's emissions
const filenameEmitter = range
    .tween(0, 3)
    .map(Math.floor)
    .dedupe()
    .map(n => `animation-frame-${n}.png`);

// filenameEmitter will emit filenames as the Timeline passes through
// 'range'. it can be listened directly or further transformed
const urlEmitter = filenameEmitter
    .map(filename => `http://www.example.com/${filename}`);

```

Range objects also be passed to `Timeline`'s `play()` method to play through that particular range:

```ts
// play through the first 5 seconds of the Timeline at 1000 units/s
await timeline.play(firstFiveSeconds);
```

Custom easers can be passed to `ease()` as `(progress: number) => number`:

```ts
timeline
    .range(0, 1000)
    .ease(n => n * n)
    .tween(/*...*/);
```

## Points

Points represent specific times in the Timeline.

```ts
const twoSecondsIn = timeline.point(2000);
const fiveSecondsIn = firstFiveSeconds.end;
const sixSecondsIn = fiveSecondsdIn.delta(1000);
```

Points emit `PointEvent` objects when their position is reached or passed.

```ts
twoSecondsIn.apply(event => {
    // event.direction (-1 | 1) tells us the direction of the seek that
    // triggered the point. This allows for reversible effects:
    element.classList.toggle("someClass", event.direction > 0);
});
```

*Note*, point events will be triggered in order, depending on the direction of the seek that passes over them. To ensure consistent reversible behaviour, a point is triggered with `direction = 1` when a forward seek *passes or lands on* it, and with `direction = -1` when a backward seek *passes or departs from* it.

Directionality can also be leveraged with `point.applyDirectional()`:

```ts
twoSecondsIn.applyDirectional(
    parent.append(element), // do
    element.remove() // undo
);
```

We can also create ranges from points:

```ts
twoSecondsIn
    .to(fiveSecondsIn)
    .tween(/*...*/);

timeline
    .end
    .range(1000)
    .tween(/*...*/);
```

*Note*, points and ranges are transient interfaces for adding behaviour to their Timelines; they can be garbage-collected if unreferenced even while their listeners persist.

## More on tweening

Tween emitters can interpolate numbers, arrays of numbers, strings, and objects with a method `blend(from: this, to: this): this`, by the progression value emitted by their parent.

```ts
const range = timeline.range(0, 2000);

// numbers
range
    .ease("overshootIn")
    .tween(300, 500)
    .apply(v => element.scrollTop = v);

// number arrays
range
    .tween([0, 180], [360, 180])
    .apply((angles) => pieChart.setValues(angles));

// strings
range
    .tween("#000000", "#ff00ff")
    .apply(v => element.style.color = v);

// blendable objects
// (T extends { blend(from: this, to: this): this })
import { RGBA } from "@xtia/rgba";
range
    .tween(RGBA.parse("#c971a7"), RGBA.parse("#fff"))
    .apply(v => element.style.background = v);

import { Angle } from "@xtia/mezr";
range
    .tween(Angle.degrees(45), Angle.turns(.5))
    .map(a => `rotate(${a.asDegrees}deg)`)
    .apply(v => element.style.transform = v);

```

#### String interpolation
* If the strings contain tweenable tokens (numbers, colour codes) and are otherwise identical, those tokens are interpolated
* Otherwise the `from` string is progressively replaced, left-to-right, with the `to` string

```ts
// tween four values in a CSS string
timeline
    .range(0, 2000)
    .ease("elastic")
    .tween("0px 0px 0px #0000", "15px 15px 20px #0005")
    .apply(s => element.style.textShadow = s);

// text progress bar
timeline
    .range(0, 2000)
    .tween("--------", "########")
    .dedupe()
    .apply(v => document.title = v);
```

Try out the [shadow tweening example at StackBlitz](https://stackblitz.com/edit/timeline-string-tween?file=src%2Fmain.ts)

## Autoplay and Looping Strategies

To create a Timeline that immediately starts playing, pass `true` to its constructor:

```ts
// immediately fade in an element
new Timeline(true)
    .range(0, 1000)
    .apply(v => element.style.opacity = v);

// note, an `animate(duration)` function is exported for
// disposable, single-use animations such as this:
import { animate } from "@xtia/timeline";
animate(1000)
    .apply(v => element.style.opacity = v);
```

Normally a Timeline will simply stop playing when it reaches the end. This can be changed by passing a second argument (`endAction`) to the constructor.

```ts
// "restart" looping strategy: when its end is passed by play(),
// it will seek back to 0, then forward to consistently account
// for any overshoot
const repeatingTimeline = new Timeline(true, "restart");

// "wrap" looping strategy: the Timeline will continue playing
// beyond its end point, but points and ranges will trigger as
// if the Timeline was looping
const wrappingTimeline = new Timeline(true, "wrap");

// "continue" allows the Timeline to ignore its end point and
// keep playing
const foreverTimeline = new Timeline(true, "continue");

// "pause" is the default behaviour: stop at the end
const pausingTimeline = new Timeline(true, "pause");

// "restart" and "wrap" strategies can designate a position
// to loop back to
new Timeline(true, {restartAt: 1000});
new Timeline(true, {wrapAt: 1000});
```

## Seeking

To seek to a position, we can either call `timeline.seek(n)` or set `timeline.currentTime`.

```ts
timeline.seek(1500);
timeline.currentTime += 500;
```

Seeking lets us control a Timeline with anything:

```ts
// synchronise with a video, to show subtitles or related
// activities:
videoElement.addEventListener(
    "timeupdate",
    () => timeline.seek(videoElement.currentTime)
);

// control a Timeline using page scroll
window.addEventListener(
    "scroll",
    () => timeline.seek(window.scrollY)
);

// represent real time
setInterval(() => timeline.seek(Date.now()), 1000);
timeline
    .point(new Date("2026-10-31").getTime())
    .apply(() => console.log("Happy anniversary 🏳️‍⚧️💗"));

// show a progress bar for loaded resources
const loadingTimeline = new Timeline();
loadingTimeline
    .range(0, resourceUrls.length)
    .tween("0%", "100%");
    .apply(v => progressBar.style.width = v);

// and do something when they're loaded
loadingTimeline
    .end
    .apply(startGame);

// to drive it, just seek forward by 1 for each loaded resource
resourceUrls.forEach(url => {
    preload(url).then(
        () => loadingTimeline.currentTime++
    );
});
```

We can pass a second argument to `seek()` to perform a 'smooth seek' over the given duration. A third argument can provide an easing function for the smooth seek process:

```ts
await timeline.seek(timeline.end, 400, "overshootIn");
```

## Backward-compatibility

Despite the massive overhaul, the previous API is present and expanded and upgrading to 1.0.0 should be frictionless in the vast majority of cases.

#### Breaking changes

* `timeline.end` now provides a `TimelinePoint` instead of `number`.

#### Mitigation

* `timeline.tween()` now accepts TimelinePoint as a starting position, and provides an overload that replaces the `duration: number` parameter with `end: TimelinePoint`.
* Should you encounter a case where this change still causes issue, eg `timeline.tween(0, timeline.end / 2, ...)`, `timeline.end.position` is equivalent to the old API's `timeline.end`.

#### Enhancements (non-breaking)

* `timeline.tween()` also now accepts non-numeric `from` and `to` values per `ProgressEmitter.tween<T>()`.
* The chaining interface returned by `tween()` and `at()` now includes property `end: TimelinePoint`, to take advantage of the new functional API from existing tween chains.

#### Deprecations

* `timeline.position` will be replaced with `timeline.currentTime` to be consistent with other seekable concepts.
* `"loop"` endAction is now `"restart"` to disambiguate from new looping strategies.
* `timeline.step()` is redundant now that `currentTime` is writable; use `timeline.currentTime += delta` instead.



## Reference

### Contents

#### Functions

* [`animate`](#animateduration-function)

#### Classes

* [`Timeline`](#timeline-class)
* [`TimelinePoint`](#timelinepoint-class)
* [`TimelineRange`](#timelinerange-class)
* [`RangeProgression`](#rangeprogression-class)
* [`Emitter<T>`](#emittert-class)

#### Interfaces

* [`PointEvent`](#pointevent-interface)
* [`ChainingInterface`](#chaininginterface-interface)



### `Timeline` class

A self-contained collection of points and ranges that trigger events as the Timeline seeks to and through them.

#### Properties

##### `currentTime: number`

Reads or sets the Timeline's current time position. Setting this property will perform a `seek()`, triggering any listener that is passed or landed on.

##### `timeScale: number`

Controls the speed at which a Timeline will progress when driven by the `play()` method (including by autoplay).

##### `isPlaying: boolean`

Returns true if the Timeline is actively being driven by the `play()` method (including by autoplay).

##### `end: `[`TimelinePoint`](#timelinepoint-class)

Returns the **current** final point in the Timeline.

##### `start: `[`TimelinePoint`](#timelinepoint-class)

Returns a point representing position 0.

#### Methods

##### `point(position): `[`TimelinePoint`](#timelinepoint-class)

Returns a point that represents a specific position on the Timeline.

If `position` is greater than that Timeline's end-position, the end-position will be extended to `position`.

*Note*, for deterministic consistency, points will be triggered if a forward-moving seek lands exactly on the point's position (or passes it entirely), while a backward-moving seek will trigger points that are passed or moved from.

##### `range(start, duration): `[`TimelineRange`](#timelinerange-class)

Returns a range that represents a section of the Timeline.

If the end of the range is beyond the Timeline's end-position, the end-position will be extended to the end of the range.

If `duration` is omitted, the range will extend from `start` to the **current** end-position of the Timeline.

If `start` is omitted, the range will start at 0 and represent the full **current** range of the Timeline.

##### `seek(toPosition): void`

Sets the Timeline's internal position (`currentTime`), triggering in chronological order listeners attached to any [`TimelinePoint`](#timelinepoint-class) or [`TimelineRange`](#timelinerange-class) that are passed or landed on.

`toPosition` may be a number or a [`TimelinePoint`](#timelinepoint-class).

##### `seek(toPosition, duration, easer?): Promise<void>`

Performs an interruptable 'smooth seek' to a specified position, lasting `duration` milliseconds, with optional easing.

Returns a Promise that will be resolved when the smooth seek is completed (or is interrupted by another seek\*).

\* If a smooth seek is interrupted by another seek, the interrupted seek will immediately complete before the new seek is applied, to ensure any resulting state reflects expectations set by the first seek.

##### `play(): void`

Begins playing through the Timeline, from its current position, at (1000 × `timeScale`) units per second, updating 60 times per second.

##### `play(fps): void`

Begins playing through the Timeline, from its current position, at (1000 × `timeScale`) units per second, updating `fps` times per second.

##### `play(range, easer?): Promise<void>`

If a [`TimelineRange`](#timelinerange-class) is passed, the Timeline will play through that range at 1000 units per second, following the rules of a [smooth seek](#seektoposition-duration-easer-promisevoid).

##### `tween<T>(start, duration, apply, from, to, easer?): `[`ChainingInterface`](#chaininginterface-interface)

Creates a [`TimelineRange`](#timelinerange-class) and attaches a tweening listener.

Equivalent to

```ts
timeline
    .range(start, duration)
    .ease(easer)
    .tween(from, to)
    .apply(apply);
```

Returns a [`ChainingInterface`](#chaininginterface-interface) representing the point at which the tween ends.

##### `apply(handler)`

Registers a handler to be invoked on every seek, after points and ranges are applied.

This is useful for systems that use Timeline's point and range emissions to manipulate state that is to be applied *at once* to another system.

```ts
// don't wastefully render the scene for every entity update
timeline
    .range(0, 1000)
    .tween(10, 30)
    .apply(v => scene.hero.x = v);
timeline
    .range(500, 1000)
    .tween(15, 50)
    .apply(v => scene.monster.x = v);
// render when all updates for a frame are done:
timeline.apply(() => renderScene(scene));
```

##### `tween<T>(start, end, apply, from, to, easer?): `[`ChainingInterface`](#chaininginterface-interface)

As above, but if the second argument is a [`TimelinePoint`](#timelinepoint-class), it will specify when on the Timeline the tween will *end*.

##### `at(position, apply, reverse?): `[`ChainingInterface`](#chaininginterface-interface)

Creates a [`TimelinePoint`](#timelinepoint-class) and attaches a listener that will trigger when the Timeline seeks past or to that point.

If `reverse` is a function, that will be called instead of `apply` when the seek that triggered the event was moving backwards. If `reverse` is `true`, `apply` will be called regardless of which direction the seek moved. If `reverse` is false or omitted, this listener will ignore backward-moving seeks.




### `TimelinePoint` class

Represents a single point on a [`Timeline`](#timeline-class).

This class is not meant to be constructed directly; instances are created with [`Timeline.point()`](#pointposition-timelinepoint).

##### Inherits [`Emitter<PointEvent>`](#emittert-class)

Listeners will be invoked with a [`PointEvent`](#pointevent-interface) when a seek passes or lands on the point.

*Note*, during a point event, the parent Timeline's `currentTime` property will return that point's position, even if the Timeline is configured with a [*wrap* end action](#autoplay-and-looping-strategies) and its true position is beyond its end. For deterministic consistency, ranges will emit values for the point's position before the point emits.

#### Properties

##### `position: number`

This point's position on the Timeline.

##### `forwardOnly: Emitter<PointEvent>`

Provides an emitter that forwards emissions triggered by forward-moving seeks.

##### `reverseOnly: Emitter<PointEvent>`

Provides an emitter that forwards emissions triggered by backward-moving seeks.

#### Methods

##### `range(duration): TimelineRange`

Creates a [`TimelineRange`](#timelinerange-class) on the Timeline to which the point belongs, of the specified duration.

##### `to(endPoint): TimelineRange`

Creates a [`TimelineRange`](#timelinerange-class) on the Timeline to which the point belongs, ending at the specified point.

##### `delta(timeOffset): TimelinePoint`

Creates a `TimelinePoint` at an offset from the this point.

##### `seek(): void`

Seeks the parent Timeline to this point.

##### `seek(duration: number, easer?: Easer): Promise<void>`

Smooth-seeks the parent Timeline to this point over a specified duration and resolves the returned Promise on completion.

##### `promise(): Promise<-1 | 1>`

Creates a `Promise` that will be resolved when the Timeline first seeks to/past this point.

The resolved value indicates the direction of the seek that triggered resolution.

##### `applyDirectional(apply, revert): UnsubscribeFunc`

Registers an emission handler that calls one function for forward seeks to or past the point, and another for backward seeks from or past the point.

```ts
point
    .applyDirectional(
        () => element.classList.add("faded"),
        () => element.classList.remove("faded"),
    );
```




### `PointEvent` interface

Provides information relevant to [`TimelinePoint`](#timelinepoint-class) events.

#### Properties

##### `direction: -1 | 1`

Provides the direction of the seek that triggered a point event. `direction === 1` indicates that the seek moved forward and `direction === -1` indicates that the seek was moving backwards.

Allows point listeners to undo effects when the Timeline is reversed.

```ts
timeline
    .point(4000)
    .apply(
        event => element.classList.toggle(
            "visible",
            event.direction > 0
        )
    );
```




### `TimelineRange` class

Represents a fixed-length, fixed position section of a [`Timeline`](#timeline-class).

This class is not meant to be constructed directly; instances are created with [`Timeline.range()`](#rangestart-duration-timelinerange).

##### Inherits [`RangeProgression`](#rangeprogression-class)

Emits a normalised progression (0..1) of the range when the parent Timeline seeks over or into it.

#### Properties

##### `start: `[`TimelinePoint`](#timelinepoint-class)

The point on the Timeline at which this range starts.

##### `end: `[`TimelinePoint`](#timelinepoint-class)

The point on the Timeline at which this range ends.

##### `duration: number`

The length of the range.

#### Methods

##### `bisect(position?): [TimelineRange, TimelineRange]`

Creates two ranges representing two distinct sections of the parent. `position` is relative to the parent's start.

##### `spread(count): `[`TimelinePoint`](#timelinepoint-class)[]

Creates and returns `count` points spread evenly over the range.

##### `play(easer?): Promise<void>`

Instructs the Timeline to which this range belongs to play through the represented range. This playthrough counts as a smooth seek for seek interruption purposes.

Returns a Promise that will be resolved when the range playthrough completes.

##### `grow(delta, anchor?): TimelineRange`

Creates a new range on the parent Timeline. The location and duration of the new range are copied from this range and grown from an anchor point, specified as a normalised (0..1) progression of the parent range.

##### `grow(delta, anchor?): TimelineRange`

Creates a new range on the parent Timeline. The location and duration of the new range are copied from this range and scaled multiplicatively from an anchor point, specified as a normalised (0..1) progression of the parent range.

##### `subdivide(n): TimelineRange[]`

Creates the specified number of ranges, each of `(parent.duration / count)` duration, spread evenly over this range.

##### `shift(delta): TimelineRange`

Creates a new range by offsetting the parent by a given time delta.

##### `contains(point): boolean`

Returns true if the given [`TimelinePoint`](#timelinepoint-class) sits within this range.

##### `overlaps(range): boolean`

Returns true if the given range overlaps with this range.

##### `path(steps: Path): Emitter<[number, number]>

Creates an emitter that follows a given path, emitting `[x, y]` (`XY`) as its parent range is progressed.

Path segments can be expressed as a mix of `[x, y]`, resolver functions (`progress => XY`) and Segment descriptor objects.

```ts
type LineSegment = {
    type: "line";
    from?: XY;
    to: XY;
    speed?: number;
    ease?: Easer | keyof typeof easers;
}

type CurveSegment = {
    type: "curve";
    from?: XY;
    to: XY;
    control1: XY;
    control2: XY;
    speed?: number;
    ease?: Easer | keyof typeof easers;
}

type CustomSegment = {
    get: SegmentEvaluator;
    length?: number;
    ease?: Easer | keyof typeof easers;
}
```

* If the first element is `[x, y]`, it defines the path's starting position.
* If the first element is a non-custom descriptor object it must include a `from` property.
* Duration of segments defined as resolver functions, and custom segments without a `length` property, will be estimated by point sampling

```ts
// simple path with coordinates
const eg1 = range.path([[0, 0], [100, 50], [200, 0]])

// mixed path with curve segments
const eg2 = range.path([
  [0, 0], // start position
  {
    type: 'curve',
    to: [100, 100],
    control1: [25, 0],
    control2: [75, 100],
    ease: easers.easeOut
  },
  [50, 50] // straight line to final position
]);

eg2.map(([x, y]) => [x + "%", y + "%"])
    .apply(([left, top]) => element.style({ left, top }));
```



### `RangeProgression` class

Represents a step in an immutable [`TimelineRange`](#timelinerange-class) event transformation pipeline.

This class is not meant to be constructed directly; instances are created by various transformation methods of [`TimelineRange`](#timelinerange-class).

##### Inherits [`Emitter<number>`](#emittert-class)

Listeners will be invoked when a seek passes or lands within a range.

#### Methods

##### `ease(easer?): RangeProgression`

Creates an emitter that applies an easing function to parent emissions.

##### `tween<T>(from, to): `[`Emitter<T>`](#emittert-class)

Creates an emitter blends two values, biased by progression emitted by the parent.

`T` may be `string`, `number`, `number[]` or an object type that includes

```ts
blend(from: this, to: this, progress: number): this
```

##### `snap(steps): RangeProgression`

Creates an emitter that quantises progression emitted by the parent to the nearest of `steps` discrete values.

##### `sample<T>(values: ArrayLike<T>): `[`Emitter<T>`](#emittert-class)

Creates an emitter that emits values from an array according to progression.

##### `threshold(threshold): RangeProgression`

Creates an emitter that emits 0 when the parent emits a value below `threshold` and 1 when a parent emission is equal to or greater than `threshold`.

```ts
emittedValue = parentEmission < threshold ? 0 : 1
```

##### `clamp(min?, max?): RangeProgression`

Creates an emitter that clamps progression between `min` and `max`.

##### `repeat(count): RangeProgression`

Creates an emitter that multiplies progression and wraps at 1, thereby mapping to a repeating scale.

##### `tap(cb): RangeProgression`

Creates an emitter that mirrors emissions from the parent emitter, invoking the provided callback `cb` as a side effect for each emission.

##### `filter(check: (value) => boolean): RangeProgression`

Creates an emitter that selectively discards parent emissions.

If `check(value)` returns true, the value will be emitted.

##### `dedupe(): RangeProgression`

Creates an emitter that discards emitted values that are the same as the last value emitted by the new emitter

##### `sample<T>(items): T`

Creates a chainable emitter that takes a value from an array according to progression.

```ts
range
  .sample(["a", "b", "c"])
  .apply(v => console.log(v));
// logs 'b' when a seek lands halfway through range
```

##### `offset(delta): RangeProgression`

Creates an emitter that offsets its parent's values by the given delta, wrapping at 1.

##### `fork(cb: (branch) => void): RangeProgression`

Immediately invokes `cb` with this emitter and returns this emitter for further chaining.

Allows branching without breaking a composition chain, eg:

```ts
range
  .tween("0%", "100%")
  .fork(branch => {
    branch
      .map(s => `Loading: ${s}`)
      .apply(s => document.title = s)
  })
  .apply(v => progressBar.style.width = v);
```



### `Emitter<T>` class

#### Methods

##### `apply(handler: Handler<T>): UnsubscribeFunc`

Attaches a handler to the emitter and returns a function that will unsubscribe the handler.

This class is not meant to be constructed directly; instances are created by transformation methods.

##### `map<R>(mapFunc: (value: T) => R): Emitter<R>`

Creates an emitter that performs an arbitrary transformation.

##### `filter(check: (value: T) => boolean): Emitter<T>`

Creates an emitter that selectively discards parent emissions.

If `check(value)` returns true, the value will be emitted.

##### `dedupe(compare?: (a: T, b: T) => boolean): Emitter<T>`

Creates an emitter that discards emitted values that are the same as the last value emitted by the new emitter

##### `tap(cb: Handler<T>): Emitter<T>`

Creates an emitter that mirrors emissions from the parent emitter, invoking the provided callback `cb` as a side effect for each emission.

##### `fork(cb: (branch: Emitter<T>) => void): Emitter<T>`

Immediately invokes `cb` with this emitter and returns this emitter for further chaining.

Allows branching without breaking a composition chain, eg:

```ts
range
  .tween("0%", "100%")
  .fork(branch => {
    branch
      .map(s => `Loading: ${s}`)
      .apply(s => document.title = s)
  })
  .apply(v => progressBar.style.width = v);
```




### `animate(duration)` function

Creates and returns a [`TimelineRange`](#timelinerange-class) that will automatically play over `duration` milliseconds.

### `ChainingInterface` interface

Conveys composable sequential tweens and events with the simplified API. Each instance represents a specific point on the parent Timeline.

```ts
timeline
    .tween(0, 1000, doThing, 0, 100)
    .thenWait(500)
    .then(doOtherThing)
    .thenWait(250)
    .thenTween(2000, dothing, 100, 0);
```

#### Properties

##### `end: `[`TimelinePoint`](#timelinepoint-class)

The point on the Timeline at which the effect of the previous chained call ends.

#### Methods

##### `thenTween(duration, apply, from, to, easer): ChainingInterface`

Adds a tween, beginning at the point the interface represents. Returns a new `ChainingInterface` representing the end of the new tween.

##### `then(action: () => void): ChainingInterface`

Adds a point event at the point the interface represents.

##### `thenWait(duration): ChainingInterface`

Creates a new `ChainingInterface` by offsetting the parent by `duration`.



### `easers` const

The following easers are provided:

`linear`, `easeIn`, `easeIn4`, `easeOut`, `easeOut4`, `circleIn`, `circleIn4`, `circleOut`, `circleOut4`, `easeInOut`, `elastic`, `overshootIn`, `sine`, `invert`, `bounce`, `noise`, `pingpong`

Methods that accept an easing function accept both `(progress: number) => number` and any of the names above.

```ts
timeline
    .tween(s, e, a, f, t, v => Math.sqrt(v))
    .thenTween(s, e, a, f, t, c, "elastic");

timeline
    .range(0, 1000)
    .ease("circleOut")
    .ease(easers.easeIn)
    // ...
```