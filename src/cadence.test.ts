import { describe, expect, it } from "vitest"
import { computeCadence } from "./cadence"
import type { WordTiming } from "./types"

// Helper: assert a timing sequence is well-formed — starts monotonically
// increasing, and each end is >= its own start.
function expectMonotonic(timings: WordTiming[]) {
  for (let i = 0; i < timings.length; i++) {
    expect(timings[i].end).toBeGreaterThanOrEqual(timings[i].start)
    if (i > 0) {
      expect(timings[i].start).toBeGreaterThanOrEqual(timings[i - 1].start)
    }
  }
}

describe("computeCadence — shape", () => {
  it("returns one WordTiming per input word", () => {
    const timings = computeCadence("the quick brown fox")
    expect(timings).toHaveLength(4)
    expect(timings.map((t) => t.text)).toEqual(["the", "quick", "brown", "fox"])
  })

  it("returns an empty array for an empty string", () => {
    expect(computeCadence("")).toEqual([])
  })

  it("returns an empty array for whitespace only", () => {
    expect(computeCadence("   \n\t  ")).toEqual([])
  })

  it("produces monotonic, non-negative-duration timings", () => {
    const timings = computeCadence("hello there, general kenobi. you are a bold one")
    expect(timings.length).toBeGreaterThan(0)
    expect(timings[0].start).toBe(0)
    expectMonotonic(timings)
  })

  it("keeps trailing punctuation in rendered text but trims leading quotes", () => {
    const timings = computeCadence('"Hello, world!')
    expect(timings.map((t) => t.text)).toEqual(["Hello,", "world!"])
  })
})

describe("computeCadence — reading model (default)", () => {
  it("scales word duration with charCount / cps using the documented default cps=15", () => {
    // "abcdefghij" = 10 clean chars → 10 / 15 = 0.6667s, inside [0.2, 0.7].
    const [w] = computeCadence("abcdefghij")
    expect(w.end - w.start).toBeCloseTo(10 / 15, 6)
  })

  it("clamps very short words up to the default floor minWordDuration=0.2", () => {
    // "a" = 1 char → 1/15 = 0.0667s, below the 0.2 floor.
    const [w] = computeCadence("a")
    expect(w.end - w.start).toBeCloseTo(0.2, 6)
  })

  it("clamps very long words down to the default ceiling maxWordDuration=0.7", () => {
    // 20 chars → 20/15 = 1.333s, above the 0.7 ceiling.
    const [w] = computeCadence("supercalifragilistic")
    expect(w.end - w.start).toBeCloseTo(0.7, 6)
  })

  it("scales durations proportionally when cps changes", () => {
    const slow = computeCadence("abcdefghij", { cps: 15 })[0]
    const fast = computeCadence("abcdefghij", { cps: 20 })[0]
    const slowDur = slow.end - slow.start
    const fastDur = fast.end - fast.start
    // Both are inside the clamp window, so duration is exactly proportional to 1/cps.
    expect(fastDur).toBeCloseTo(slowDur * (15 / 20), 6)
    expect(slowDur).toBeCloseTo(10 / 15, 6)
    expect(fastDur).toBeCloseTo(10 / 20, 6)
  })

  it("lays consecutive words back-to-back when there is no punctuation", () => {
    const [a, b] = computeCadence("abcde fghij")
    // No pause: the next word starts exactly where the previous ended.
    expect(b.start).toBeCloseTo(a.end, 6)
  })

  it("inserts a comma beat equal to commaPause between consecutive words", () => {
    const commaPause = 0.3
    const [a, b] = computeCadence("abcde, fghij", { commaPause, sentencePause: 0.9 })
    // The pause is a real GAP after the word — the next word's start is pushed out.
    expect(b.start - a.end).toBeCloseTo(commaPause, 6)
  })

  it("inserts a sentence beat equal to sentencePause between consecutive words", () => {
    const sentencePause = 0.9
    const [a, b] = computeCadence("abcde. fghij", { commaPause: 0.3, sentencePause })
    expect(b.start - a.end).toBeCloseTo(sentencePause, 6)
  })

  it("uses commaPause for semicolons and colons too", () => {
    const commaPause = 0.4
    const semi = computeCadence("abcde; fghij", { commaPause })
    const colon = computeCadence("abcde: fghij", { commaPause })
    expect(semi[1].start - semi[0].end).toBeCloseTo(commaPause, 6)
    expect(colon[1].start - colon[0].end).toBeCloseTo(commaPause, 6)
  })

  it("uses the documented default pauses (0.8) for both comma and sentence", () => {
    const comma = computeCadence("abcde, fghij")
    const sentence = computeCadence("abcde. fghij")
    expect(comma[1].start - comma[0].end).toBeCloseTo(0.8, 6)
    expect(sentence[1].start - sentence[0].end).toBeCloseTo(0.8, 6)
  })
})

describe("computeCadence — speech model (opt-in)", () => {
  it("runs the speech path and returns one sane, monotonic timing per word", () => {
    const timings = computeCadence("hello there general kenobi", { style: "speech" })
    expect(timings).toHaveLength(4)
    expect(timings[0].start).toBe(0)
    for (const t of timings) {
      expect(t.end - t.start).toBeGreaterThan(0)
    }
    expectMonotonic(timings)
  })

  it("still applies punctuation beats in the speech model", () => {
    const sentencePause = 1.0
    const [a, b] = computeCadence("hello. world", { style: "speech", sentencePause })
    expect(b.start - a.end).toBeCloseTo(sentencePause, 6)
  })

  it("shortens unstressed function words relative to content words", () => {
    // "the" is a function word (× functionWordScale 0.62); "world" is content and
    // also phrase-final. Compare a function word against a same-syllable content word.
    const fn = computeCadence("the cat", { style: "speech" })[0] // "the": function word, not phrase-final
    const content = computeCadence("cat the", { style: "speech" })[0] // "cat": content word, not phrase-final
    expect(fn.end - fn.start).toBeLessThan(content.end - content.start)
  })
})
