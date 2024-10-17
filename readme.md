### This project has been superseded by https://aleta.codes/timeline.ts-alpha/

# quick guide

```js
const Timeline = require("timeline.js");
```

## immediately start a simple animation:

```js
Timeline.tween(duration, func, from = 0, to = 1, easer = null, fps = 60)
```

* per frame, *func* will be passed a value between *from* and *to* according to progression
* *easer*, optional, is a function of (progression) => number, passed a number between 0 and 1
* *duration* is in milliseconds
* returns a Promise, resolved when the tween ends
* eg:

```js
Timeline.tween(2000, v => myDiv.style.opacity = v, 1, 0).then(() => body.removeChild(myDiv));
```

## create a timeline

```js
let timeline = Timeline(autoplay = false)
```

or

```js
timeline = new Timeline(autoplay = false)
```

* autoplay option internally uses play(), below

## add an action to occur at a specific time

```js
timeline.at(time, func, undo = null)
```

* *undo* (if a function) will be called when the specified time is passed while seeking backwards
* if *undo* is `true`, func will be called in this case
* if *undo* is `null` (default), this event will be ignored while seeking backwards
* eg:

```js
timeline.at(5000, () => myDiv.classList.add("visible"), () => myDiv.classList.remove("visible"));
```

## apply a function per frame within a time range

```js
timeline.tween(startTime, duration, func, from = 0, to = 1, easer = null)
```

* *func* will be passed values between *from* and *to* according to progression
* *duration* is any unit as consistent with seek() and tick()
* eg: 

```js
timeline.tween(5000, 1000, v => myDiv.style.opacity = v);
```

## seek forward n time, triggering events between

```js
timeline.tick(n = 1)
```

* *n* may be negative
* eg: 

```js
setInterval(() => timeline.tick(16), 16);
```

## seek to a position, triggering events between

```js
timeline.seek(n)
```

* eg:

```js
window.onscroll = () => timeline.seek(window.scrollY);
```

## add an action to occur at a relative time

```js
timeline.in(timeDelta, func, undo = null)
```

* equivalent to `timeline.at(timeline.position + timeDelta, func, undo)`
* if this is called within a timeline event, the resulting event will be correctly placed relative to the caller regardless of FPS.

## make it go

```js
timeline.play(fps = 60)
```

* sets an interval to tick the timeline in real time
* *fps* is subject to background tab limitations as applied by browsers

## make it repeat

```js
timeline.loopAt(n, rewind = true) [ experimental and incomplete ]
```

* position will wrap back to 0 when it reaches *n*
* if *rewind* is true, events and tweens will be applied in the reversal
 
## change speed

```js
timeline.timescale
```

* affects timelines that run via timeline.play()
* does not affect tick() or seek()
* eg:

```js
tl.timescale = .25; // run at quarter speed
```

## read the timeline's internal time position

```js
timeline.position
```

* read only

## find the final activity time

```js
timeline.end
```

* returns the time after which no activity exists
* eg:

```js
timeline.at(timeline.end, () => timeline.pause());
```

## set raw position without triggering any events or tweens

```js
timeline.jump(time)
```


## notes

* event callbacks are called in expected order, reversed when seeking backwards
* undocumented functionality may change