# Timeline

### A Type‑Safe Choreography Engine for Deterministic Timelines

**Timeline** is a general‑purpose, environment-agnostic choreography engine that lets you orchestrate any sequence of value changes; numbers, vectors, colour tokens, custom blendable objects, or arbitrary data structures.

* [API Reference](#reference)

## Basic Use:

`npm i @xtia/timeline`

```ts
import { Timeline } from "@xtia/timeline";

// create a Timeline
const timeline = new Timeline();

// over the first second, fade the body's background colour
timeline
    .range(0, 1000)
    .tween("#646", "#000")
    .listen(
        value => document.body.style.backgroundColor = value
    );

// add another tween to make a slow typing effect
const message = "Hi, planet!";
timeline
    .range(500, 2000)
    .tween(0, message.length)
    .listen(
        n => element.textContent = message.substring(0, n)
    );

// use an easing function
timeline
    .end
    .delta(500)
    .range(3000)
    .ease("bounce")
    .tween("50%", "0%")
    .listen(
        value => element.style.marginLeft = value
    );

// make it go
timeline.play();
```

## Ranges and Emitters

`timeline.range(start, duration)` returns an object representing a period within the Timeline.

```ts
const firstFiveSeconds = timeline.range(0, 5000);
```

The range object is *listenable* and emits a progression value (between 0 and 1) when the Timeline's internal position passes through or over that period.

```ts
firstFiveSeconds
    .listen(
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
    .listen(
        n => console.log(`We are ${n}% through the first five seconds`)
    );

// and in a css property
asPercent
    .map(n => `${n}%`)
    .listen(
        n => progressBar.style.width = n
    );

// apply easing
const eased = firstFiveSeconds.ease("easeInOut");
eased.listen(
    v => console.log(`Eased value: ${v}`)
);

// chain them
range
    .tween(0, 30)
    .map(Math.floor)
    .dedupe()
    .tap(n => console.log("Showing frame #", n))
    .map(n => `animation-frame-${n}.png`)
    .listen(filename => img.src = filename);

// each step in the chain is a 'pure', independent emitter that emits
// a transformation of its parent's emissions
const filenameEmitter = range
    .tween(0, 3)
    .map(Math.floor)
    .dedupe()
    .map(n => `animation-frame-${n}.png`);

// filenameEmitter will emit filenames as the Timeline passes through 'range'.
// it can be listened directly or further transformed
const urlEmitter = filenameEmitter
    .map(filename => `http://www.example.com/${filename}`);

```

Range objects also provide a `play()` method that instructs the Timeline to play through that particular range:

```ts
// play through the first two seconds of the Timeline
await timeline
    .range(0, 2000)
    .play();
```

Custom easers can be passed to `ease()` as `(progress: number) => number`:

```ts
timeline
    .range(0, 1000)
    .ease(n => Math.sqrt(n))
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
twoSecondsIn.listen(event => {
    // event.direction (-1 | 1) tells us the direction of the seek that
    // triggered the point. This allows for reversible point events
    document.body.classList.toggle("someClass", event.direction > 0);
});
```

*Note*, point events will be triggered in order, depending on the direction of the seek that passes over them.

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

*Note*, points and ranges without active listeners are not stored, so will be garbage-collected if unreferenced.

## More on tweening

Tween emitters can interpolate numbers, arrays of numbers, strings, and objects with a method `blend(from: this, to: this): this`, by the progression value emitted by their parent.

```ts
const range = timeline.range(0, 2000);

// numbers
range
    .ease("overshootIn")
    .tween(300, 500)
    .listen(v => element.scrollTop = v);

// number arrays
range
    .tween([0, 180], [360, 180])
    .listen((angles) => pieChart.setValues(angles));

// strings
range
    .tween("#000000", "#ff00ff")
    .listen(v => element.style.color = v);

// blendable objects
// (T extends { blend(from: this, to: this): this })
import { RGBA } from "@xtia/rgba";
range
    .tween(RGBA.parse("#c971a7"), RGBA.parse("#fff"))
    .listen(v => element.style.background = v.hexCode);

import { Angle } from "@xtia/mezr";
range
    .tween(Angle.degrees(45), Angle.turns(.5))
    .map(a => `rotate(${a.asDegrees}deg)`)
    .listen(v => element.style.transform = v);

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
    .listen(s => element.style.textShadow = s);

// text progress bar
timeline
    .range(0, 2000)
    .tween("--------", "########")
    .dedupe()
    .listen(v => document.title = v);
```

Try out the [shadow tweening example at StackBlitz](https://stackblitz.com/edit/timeline-string-tween?file=src%2Fmain.ts)

## Autoplay and Looping Strategies

To create a Timeline that immediately starts playing, pass `true` to its constructor:

```ts
// immediately fade in an element
new Timeline(true)
    .range(0, 1000)
    .listen(v => element.style.opacity = v);

// note, an `animate(duration)` function is exported for
// disposable, single-use animations such as this:
import { animate } from "@xtia/timeline";
animate(1000)
    .listen(v => element.style.opacity = v);
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
    .listen(() => console.log("Happy anniversary 🏳️‍⚧️💗"));

// show a progress bar for loaded resources
const loadingTimeline = new Timeline();
loadingTimeline
    .range(0, resourceUrls.length)
    .tween("0%", "100%");
    .listen(v => progressBar.style.width = v);

// and do something when they're loaded
loadingTimeline
    .end
    .listen(startGame);

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

### `Timeline` class

A self-contained collection of points and ranges that trigger events as the Timeline seeks to and through them.

#### Properties

##### `currentTime: number`

Reads or sets the Timeline's current time position. Setting this property will perform a `seek()`, triggering any listener that is passed or landed on.

##### `timeScale: number`

Controls the speed at which a Timeline will progress when driven by the `play()` method (including by autoplay).

##### `isPlaying: boolean`

Returns true if the Timeline is actively being driven by the `play()` method (including by autoplay).

##### `end: `[`TimelinePoint`](#timelinepoint-interface)

Returns the **current** final point in the Timeline.

##### `start: `[`TimelinePoint`](#timelinepoint-interface)

Returns a point representing position 0.

#### Methods

##### `point(position): `[`TimelinePoint`](#timelinepoint-interface)

Returns a point that represents a specific position on the Timeline.

If `position` is greater than that Timeline's end-position, the end-position will be extended to `position`.

*Note*, for deterministic consistency, points will be triggered if a forward-moving seek lands exactly on the point's position (or passes it entirely), while a backward-moving seek will trigger points that are passed or moved from.

##### `range(start, duration): `[`TimelineRange`](#timelinerange-interface)

Returns a range that represents a section of the Timeline.

If the end of the range is beyond the Timeline's end-position, the end-position will be extended to the end of the range.

If `duration` is omitted, the range will extend from `start` to the **current** end-position of the Timeline.

If `start` is omitted, the range will start at 0 and represent the full **current** range of the Timeline.

##### `seek(toPosition): void`

Sets the Timeline's internal position (`currentTime`), triggering in chronological order listeners attached to any [`TimelinePoint`](#timelinepoint-interface) or [`TimelineRange`](#timelinerange-interface) that are passed or landed on.

##### `seek(toPosition, duration, easer?): Promise<void>`

Performs an interruptable 'smooth seek' to a specified position, lasting `duration` milliseconds, with optional easing.

Returns a Promise that will be resolved when the smooth seek is completed (or is interrupted by another seek\*).

\* Resolution on interruption is not finalised in the library's design and the effect should be considered exceptional; relying on it is not recommended. Future versions might reject the promise when its seek is interrupted.

##### `play(): void`

Begins playing through the Timeline, from its current position, at (1000 x `timeScale`) units per second, updating 60 times per second.

##### `play(fps): void`

Begins playing through the Timeline, from its current position, at (1000 x `timeScale`) units per second, updating `fps` times per second.

##### `tween<T>(start, duration, apply, from, to, easer?): `[`ChainingInterface`](#chaininginterface-interface)

Creates a [`TimelineRange`](#timelinerange-interface) and attaches a tweening listener.

Equivalent to

```ts
timeline
    .range(start, duration)
    .ease(easer)
    .tween(from, to)
    .listen(apply);
```

Returns a [`ChainingInterface`](#chaininginterface-interface) representing the point at which the tween ends.

##### `tween<T>(start, end, apply, from, to, easer?): `[`ChainingInterface`](#chaininginterface-interface)

As above, but if the second argument is a [`TimelinePoint`](#timelinepoint-interface), it will specify when on the Timeline the tween will *end*.

##### `at(position, apply, reverse?): `[`ChainingInterface`](#chaininginterface-interface)

Creates a [`TimelinePoint`](#timelinepoint-interface) and attaches a listener that will trigger when the Timeline seeks past or to that point.

If `reverse` is a function, that will be called instead of `apply` when the seek that triggered the event was moving backwards. If `reverse` is `true`, `apply` will be called regardless of which direction the seek moved. If `reverse` is false or omitted, this listener will ignore backward-moving seeks.




### `TimelinePoint` interface

Represents a single point on a [`Timeline`](#timeline-class).

##### Inherits [`Emitter<PointEvent>`](#emittert-interface)

Listeners will be invoked with a [`PointEvent`](#pointevent-interface) when a seek passes or lands on the point.

*Note*, during a point event, the parent Timeline's `currentTime` property will return that point's position, even if the Timeline is configured with a [*wrap* end action](#autoplay-and-looping-strategies) and its true position is beyond its end. For deterministic consistency, ranges will emit values for the point's position before the point emits.

#### Properties

##### `position: number`

This point's position on the Timeline.

#### Methods

##### `range(duration): TimelineRange`

Creates a [`TimelineRange`](#timelinerange-interface) on the Timeline to which the point belongs, of the specified duration.

##### `to(endPoint): TimelineRange`

Creates a [`TimelineRange`](#timelinerange-interface) on the Timeline to which the point belongs, ending at the specified point.

##### `delta(timeOffset): TimelinePoint`

Creates a `TimelinePoint` at an offset from the this point.




### `PointEvent` interface

Provides information relevant to [`TimelinePoint`](#timelinepoint-interface) events.

#### Properties

##### `direction: -1 | 1`

Provides the direction of the seek that triggered a point event. `direction === 1` indicates that the seek moved forward and `direction === -1` indicates that the seek was moving backwards.

Allows point listeners to undo effects when the Timeline is reversed.

```ts
timeline
    .point(4000)
    .listen(
        event => element.classList.toggle(
            "visible",
            event.direction > 0
        )
    );
```




### `TimelineRange` interface

Represents a fixed-length, fixed position section of a [`Timeline`](#timeline-class).

##### Inherits [`RangeProgression`](#rangeprogression-interface)

Emits a normalised progression (0..1) of the range when the parent Timeline seeks over or into it.

#### Properties

##### `start: `[`TimelinePoint`](#timelinepoint-interface)

The point on the Timeline at which this range starts.

##### `end: `[`TimelinePoint`](#timelinepoint-interface)

The point on the Timeline at which this range ends.

##### `duration: number`

The length of the range.

#### Methods

##### `bisect(position?): [TimelineRange, TimelineRange]`

Creates two ranges representing two distinct sections of the parent. `position` is relative to the parent's start.

##### `spread(count): `[`TimelinePoint`](#timelinepoint-interface)[]

Creates and returns `count` points spread evenly over the range.

##### `play(easer?): Promise<void>`

Instructs the Timeline to which this range belongs to play through the represented range. This playthrough counts as a smooth seek for seek interruption purposes.

Returns a Promise that will be resolved when the range playthrough completes.

##### `grow(delta, anchor?): TimelineRange`

Creates a new range on the parent Timeline. The location and duration of the new range are copied from this range and grown from an anchor point, specified as a normalised (0..1) progression of the parent range.

##### `grow(delta, anchor?): TimelineRange`

Creates a new range on the parent Timeline. The location and duration of the new range are copied from this range and scaled multiplicatively from an anchor point, specified as a normalised (0..1) progression of the parent range.

##### `contains(point)`

Returns true if the given [`TimelinePoint`](#timelinepoint-interface) sits within this range.




### `RangeProgression` interface

Represents a step in an immutable [`TimelineRange`](#timelinerange-interface) event transformation pipeline.

##### Inherits [`Emitter<number>`](#emittert-interface)

Listeners will be invoked when a seek passes or lands within a range.

#### Methods

##### `ease(easer?): RangeProgression`

Creates an emitter that applies an easing function to parent emissions.

##### `tween<T>(from, to): `[`Emitter<T>`](#emittert-interface)

Creates an emitter blends two values, biased by progression emitted by the parent.

`T` may be `string`, `number`, `number[]` or an object type that includes

```ts
blend(from: this, to: this, progress: number): this
```

##### `snap(steps): RangeProgression`

Creates an emitter that quantises progression emitted by the parent to the nearest of `steps` discrete values.

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

##### `offset(delta): RangeProgression`

Creates an emitter that offsets its parent's values by the given delta, wrapping at 1

##### `fork(cb: (branch) => void): RangeProgression`

Immediately invokes `cb` with this emitter and returns this emitter for further chaining.

Allows branching without breaking a composition chain, eg:

```ts
range
  .tween("0%", "100%")
  .fork(branch => {
    branch
      .map(s => `Loading: ${s}`)
      .listen(s => document.title = s)
  })
  .listen(v => progressBar.style.width = v);
```




### `Emitter<T>` interface

#### Methods

##### `listen(handler: Handler<T>): UnsubscribeFunc`

Attaches a handler to the emitter and returns a function that will unsubscribe the handler.

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
      .listen(s => document.title = s)
  })
  .listen(v => progressBar.style.width = v);
```




### `animate(duration)` function

Creates and returns a [`TimelineRange`](#timelinerange-interface) that will automatically play over `duration` milliseconds.

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

##### `end: `[`TimelinePoint`](#timelinepoint-interface)

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