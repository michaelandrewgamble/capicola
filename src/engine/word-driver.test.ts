// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createWordDriver } from "./word-driver"
import type { WordTiming } from "../types"

// ─── rAF + clock stub ───────────────────────────────────────────────────────
//
// The driver only touches `requestAnimationFrame`/`cancelAnimationFrame` and
// `performance.now()` for its clock — no setTimeout/setInterval — so we drive it
// deterministically with a manual frame queue + a controllable wall clock. Each
// `flushFrame()` runs exactly the frames scheduled at that moment (the tick's
// re-schedule lands in the next flush), giving one-frame-at-a-time stepping.

let rafQueue: Map<number, FrameRequestCallback>
let nextRafId: number
let now: number

function flushFrame() {
  const pending = [...rafQueue.entries()]
  rafQueue.clear()
  for (const [, cb] of pending) cb(now)
}

/** Advance the wall clock by `ms` then run one frame. */
function advance(ms: number) {
  now += ms
  flushFrame()
}

beforeEach(() => {
  rafQueue = new Map()
  nextRafId = 0
  now = 0
  vi.useFakeTimers()
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    const id = ++nextRafId
    rafQueue.set(id, cb)
    return id
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    rafQueue.delete(id)
  })
  vi.spyOn(performance, "now").mockImplementation(() => now)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ─── mock audio element ─────────────────────────────────────────────────────

class MockAudio {
  currentTime = 0
  paused = true
  play = vi.fn(() => {
    this.paused = false
    return Promise.resolve()
  })
  pause = vi.fn(() => {
    this.paused = true
  })
  private listeners: Record<string, Set<EventListener>> = {}
  addEventListener = vi.fn((type: string, cb: EventListenerOrEventListenerObject) => {
    ;(this.listeners[type] ??= new Set()).add(cb as EventListener)
  })
  removeEventListener = vi.fn((type: string, cb: EventListenerOrEventListenerObject) => {
    this.listeners[type]?.delete(cb as EventListener)
  })
  dispatch(type: string) {
    for (const cb of this.listeners[type] ?? []) cb(new Event(type))
  }
  listenerCount() {
    return Object.values(this.listeners).reduce((n, s) => n + s.size, 0)
  }
  asEl() {
    return this as unknown as HTMLAudioElement
  }
}

// ─── fixtures ─────────────────────────────────────────────────────────────────

function words(): WordTiming[] {
  return [
    { text: "alpha", start: 0, end: 1 },
    { text: "bravo", start: 1, end: 2 },
    { text: "charlie", start: 2, end: 3 },
  ]
}

/** Flush the microtask queue so an audio `play().then()` chain settles. */
async function flushMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

// ─── cadence (wall-clock) ─────────────────────────────────────────────────────

describe("createWordDriver — cadence (wall-clock)", () => {
  it("progresses the active index as the wall clock advances", () => {
    const onIndexChange = vi.fn()
    const onWordChange = vi.fn()
    const driver = createWordDriver({
      getWords: words,
      getAudioEl: () => null,
      onIndexChange,
      onWordChange,
      onEnded: vi.fn(),
    })

    driver.play() // stamps startTime = now (0), schedules the first frame

    flushFrame() // now=0   → word 0 active
    expect(driver.currentIndex).toBe(0)
    advance(1500) // now=1.5s → word 1 active
    expect(driver.currentIndex).toBe(1)
    advance(1000) // now=2.5s → word 2 active
    expect(driver.currentIndex).toBe(2)

    expect(onIndexChange.mock.calls.map((c) => c[0])).toEqual([0, 1, 2])
    expect(onWordChange).toHaveBeenCalledTimes(3)
    expect(onWordChange).toHaveBeenNthCalledWith(2, 1, words()[1])

    driver.destroy()
  })

  it("does not tick before play() stamps a start time", () => {
    const onIndexChange = vi.fn()
    const driver = createWordDriver({
      getWords: words,
      getAudioEl: () => null,
      onIndexChange,
      onEnded: vi.fn(),
    })
    // No play() yet → nothing scheduled, nothing happens.
    advance(5000)
    expect(onIndexChange).not.toHaveBeenCalled()
    expect(driver.currentIndex).toBe(-1)
    driver.destroy()
  })
})

// ─── audio (media-element clock) ──────────────────────────────────────────────

describe("createWordDriver — audio clock", () => {
  it("drives the index from audio.currentTime", async () => {
    const audio = new MockAudio()
    const onIndexChange = vi.fn()
    const driver = createWordDriver({
      getWords: words,
      getAudioEl: () => audio.asEl(),
      onIndexChange,
      onEnded: vi.fn(),
    })

    driver.play()
    expect(audio.play).toHaveBeenCalledTimes(1)
    await flushMicrotasks() // let play().then() schedule the first frame

    audio.currentTime = 0.5
    flushFrame()
    expect(driver.currentIndex).toBe(0)

    audio.currentTime = 2.5
    flushFrame()
    expect(driver.currentIndex).toBe(2)

    driver.destroy()
  })
})

// ─── resume after pause ───────────────────────────────────────────────────────

describe("createWordDriver — pause/resume (cadence)", () => {
  it("resumes from the paused elapsed time, not the wall clock", () => {
    const onIndexChange = vi.fn()
    const onPlayingChange = vi.fn()
    const driver = createWordDriver({
      getWords: words,
      getAudioEl: () => null,
      onIndexChange,
      onPlayingChange,
      onEnded: vi.fn(),
    })

    driver.play() // startTime = 0
    advance(1500) // → word 1
    expect(driver.currentIndex).toBe(1)

    driver.pause() // captures pausedElapsed = 1500ms
    expect(onPlayingChange).toHaveBeenLastCalledWith(false)

    // Real time marches on for 10s while paused — must NOT affect playback time.
    now += 10000

    driver.play() // resumes: effective elapsed continues from 1.5s
    flushFrame()
    expect(driver.currentIndex).toBe(1) // still word 1, not jumped ahead

    advance(1000) // effective 2.5s → word 2
    expect(driver.currentIndex).toBe(2)

    driver.destroy()
  })
})

// ─── onEnded ──────────────────────────────────────────────────────────────────

describe("createWordDriver — end of sequence", () => {
  it("fires onEnded exactly once when the clock passes the last word", () => {
    const onEnded = vi.fn()
    const driver = createWordDriver({
      getWords: words,
      getAudioEl: () => null,
      onIndexChange: vi.fn(),
      onEnded,
    })

    driver.play()
    advance(3000) // now=3s ≥ lastWord.end → ended
    expect(onEnded).toHaveBeenCalledTimes(1)

    // Loop has stopped (raf === null); further frames are no-ops.
    advance(1000)
    advance(1000)
    expect(onEnded).toHaveBeenCalledTimes(1)

    driver.destroy()
  })

  it("fires onEnded immediately for an empty word list", () => {
    const onEnded = vi.fn()
    const driver = createWordDriver({
      getWords: () => [],
      getAudioEl: () => null,
      onIndexChange: vi.fn(),
      onEnded,
    })
    driver.play()
    flushFrame()
    expect(onEnded).toHaveBeenCalledTimes(1)
    driver.destroy()
  })
})

// ─── seeked re-arms ended (audio) ─────────────────────────────────────────────

describe("createWordDriver — seeked re-arms ended", () => {
  it("lets onEnded fire again after scrubbing back before the end", () => {
    const audio = new MockAudio()
    const onEnded = vi.fn()
    const driver = createWordDriver({
      getWords: words,
      getAudioEl: () => audio.asEl(),
      onIndexChange: vi.fn(),
      onEnded,
    })

    // Native 'ended' fires once.
    audio.currentTime = 3
    audio.dispatch("ended")
    expect(onEnded).toHaveBeenCalledTimes(1)

    // A duplicate 'ended' without seeking does NOT re-fire (endedFired guard).
    audio.dispatch("ended")
    expect(onEnded).toHaveBeenCalledTimes(1)

    // Scrub back before the last word's end → re-arms the guard.
    audio.currentTime = 1
    audio.dispatch("seeked")

    // Playing through to the end again fires onEnded a second time.
    audio.currentTime = 3
    audio.dispatch("ended")
    expect(onEnded).toHaveBeenCalledTimes(2)

    driver.destroy()
  })
})

// ─── destroy() teardown ───────────────────────────────────────────────────────

describe("createWordDriver — destroy()", () => {
  it("removes all audio listeners and cancels any pending frame", async () => {
    const audio = new MockAudio()
    const driver = createWordDriver({
      getWords: words,
      getAudioEl: () => audio.asEl(),
      onIndexChange: vi.fn(),
      onEnded: vi.fn(),
    })

    // 4 listeners attached in the constructor.
    expect(audio.listenerCount()).toBe(4)

    driver.play()
    await flushMicrotasks() // schedules a frame
    expect(rafQueue.size).toBe(1)

    driver.destroy()
    expect(audio.listenerCount()).toBe(0)
    expect(rafQueue.size).toBe(0) // pending frame cancelled

    // A dispatched event after destroy is inert (handlers removed).
    audio.dispatch("play")
    expect(rafQueue.size).toBe(0)
  })

  it("cancels the cadence-mode frame loop on destroy", () => {
    const onIndexChange = vi.fn()
    const driver = createWordDriver({
      getWords: words,
      getAudioEl: () => null,
      onIndexChange,
      onEnded: vi.fn(),
    })
    driver.play()
    flushFrame()
    expect(rafQueue.size).toBe(1)

    driver.destroy()
    expect(rafQueue.size).toBe(0)

    onIndexChange.mockClear()
    advance(5000)
    expect(onIndexChange).not.toHaveBeenCalled()
  })
})
