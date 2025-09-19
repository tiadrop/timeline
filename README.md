# Timeline

### A Type‑Safe Choreography Engine for Deterministic Timelines

**Timeline** is a general‑purpose, environment-agnostic choreography engine that lets you orchestrate any sequence of value changes; numbers, vectors, colour tokens, custom blendable objects, or arbitrary data structures.


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
typingRange
    .end
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

// apply easing (creates a *new* emitter)
const eased = firstFiveSeconds.ease("easeInOut");
eased.listen(
    v => console.log(`Eased value: ${v}`)
);

// combine them
const frames = eased
    .tween(0, 30)
    .map(Math.floor)
    .dedupe()
    .tap(n => console.log("Showing frame #", n))
    .map(n => `animation-frame-${n}.png`)
    .listen(filename => img.src = filename);
```

Range objects also provide a `play()` method that instructs the Timeline to play through that particular range:

```ts
// play through the first two seconds of the Timeline
timeline
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

Tween emitters can interpolate numbers, arrays of numbers, strings, and objects with a method `blend(from: this, to: this): this`.

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
    .listen(v => document.title = v);
```

You can try out the [shadow tweening example at StackBlitz](https://stackblitz.com/edit/timeline-string-tween?file=src%2Fmain.ts)

## Autoplay and Looping Strategies

To create a Timeline that immediately starts playing, pass `true` to its constructor:

```ts
// immediately fade in an element
new Timeline(true)
    .range(0, 1000)
    .tween(v => element.style.opacity = v);

// note, an `animate(duration)` function is exported for
// disposable, single-use animations such as this:
import { animate } from "@xtia/timeline";
animate(1000)
    .tween(v => element.style.opacity = v);
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

loadingTimeline
    .end
    .listen(startGame);

resourceUrls.forEach(url => {
    preload(url).then(
        () => loadingTimeline.currentTime++
    );
});
```

We can pass a second argument to `seek()` to perform a 'smooth seek' over the given duration. A third argument can provide an easing function for the smooth seek process:

```ts
timeline.seek(timeline.end, 400, "overshootIn");
```

## Backward-compatibility

Despite the massive overhaul, the previous API is present and expanded  and upgrading to 1.0.0 should be frictionless in the vast majority of cases.

#### Breaking changes

* `timeline.end` now provides a `TimelinePoint` instead of `number`.

#### Mitigation

* `timeline.tween()` now accepts TimelinePoint as a starting position, and provides an overload that replaces the `duration: number` parameter with `end: TimelinePoint`.
* Should you encounter a case where this change still causes issue, eg `tl.tween(0, tl.end / 2, ...)`, `tl.end.position` is equivalent to the old API's `tl.end`.

#### Enhancements (non-breaking)

* `timeline.tween()` also now accepts non-numeric `from` and `to` values per `ProgressEmitter.tween<T>()`.
* The chaining interface returned by `tween()` and `at()` now includes property `end: TimelinePoint`, to take advantage of the new functional API from existing tween chains.

#### Deprecations

* `timeline.position` will be replaced with `timeline.currentTime` to be consistent with other seekable concepts.
* `"loop"` endAction is now `"restart"` to disambiguate from new looping strategies.
* `timeline.step()` is redundant now that `currentTime` is writable; use `timeline.currentTime += delta` instead.