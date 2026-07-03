import { describe, expect, it } from "vitest"
import {
  DEFAULT_AUTHOR_SEPARATOR,
  DEFAULT_CLOSE_QUOTE,
  DEFAULT_OPEN_QUOTE,
  QUOTE_CHUNKING,
  advanceAfterDwell,
  advanceOnEnded,
  composeAuthor,
  initialQuoteState,
  quoteWords,
  wrapQuote,
} from "./quote-sequencer"
import { chunkWords } from "./chunking"
import type { Quote } from "./types"

const QUOTES: Quote[] = [
  { text: "The only way out is through.", author: "Robert Frost" },
  { text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
  { text: "Less is more.", author: "Mies van der Rohe" },
]

describe("quote-sequencer — initial state", () => {
  it("starts on the first quote, sweeping", () => {
    expect(initialQuoteState).toEqual({ quoteIndex: 0, phase: "sweeping" })
  })
})

describe("quote-sequencer — advanceOnEnded", () => {
  it("moves a sweeping quote into the dwelling (author read-pause) phase", () => {
    const next = advanceOnEnded({ quoteIndex: 1, phase: "sweeping" }, QUOTES.length, true)
    expect(next).toEqual({ quoteIndex: 1, phase: "dwelling" })
  })

  it("keeps the same quote index (the quote stays on screen)", () => {
    const next = advanceOnEnded(
      { quoteIndex: 2, phase: "sweeping" },
      QUOTES.length,
      false,
    )
    expect(next.quoteIndex).toBe(2)
  })
})

describe("quote-sequencer — advanceAfterDwell (cycling + looping)", () => {
  it("advances to the next quote and resumes sweeping", () => {
    const { next, done } = advanceAfterDwell(
      { quoteIndex: 0, phase: "dwelling" },
      3,
      true,
    )
    expect(next).toEqual({ quoteIndex: 1, phase: "sweeping" })
    expect(done).toBe(false)
  })

  it("wraps (i + 1) % N from the last quote back to the first when looping", () => {
    const { next, done } = advanceAfterDwell(
      { quoteIndex: 2, phase: "dwelling" },
      3,
      true,
    )
    expect(next).toEqual({ quoteIndex: 0, phase: "sweeping" })
    expect(done).toBe(false)
  })

  it("cycles through all quotes and returns to the start (loop)", () => {
    let state = initialQuoteState
    const visited: number[] = [state.quoteIndex]
    for (let i = 0; i < QUOTES.length; i++) {
      const swept = advanceOnEnded(state, QUOTES.length, true)
      const { next } = advanceAfterDwell(swept, QUOTES.length, true)
      visited.push(next.quoteIndex)
      state = next
    }
    // 0 → 1 → 2 → 0 (wrapped back to the first quote)
    expect(visited).toEqual([0, 1, 2, 0])
  })

  it("marks done when loop is false on the last quote, freezing on its author", () => {
    const { next, done } = advanceAfterDwell(
      { quoteIndex: 2, phase: "dwelling" },
      3,
      false,
    )
    expect(done).toBe(true)
    expect(next).toEqual({ quoteIndex: 2, phase: "dwelling" })
  })

  it("is NOT done on a non-last quote even when loop is false", () => {
    const { next, done } = advanceAfterDwell(
      { quoteIndex: 0, phase: "dwelling" },
      3,
      false,
    )
    expect(done).toBe(false)
    expect(next).toEqual({ quoteIndex: 1, phase: "sweeping" })
  })
})

describe("quote-sequencer — single-quote self-loop", () => {
  it("loops a single quote back onto itself (0 → 0) when looping", () => {
    const swept = advanceOnEnded(initialQuoteState, 1, true)
    const { next, done } = advanceAfterDwell(swept, 1, true)
    expect(next).toEqual({ quoteIndex: 0, phase: "sweeping" })
    expect(done).toBe(false)
  })

  it("is done after a single quote when loop is false", () => {
    const swept = advanceOnEnded(initialQuoteState, 1, false)
    const { next, done } = advanceAfterDwell(swept, 1, false)
    expect(done).toBe(true)
    expect(next).toEqual({ quoteIndex: 0, phase: "dwelling" })
  })
})

describe("quote-sequencer — quoteWords", () => {
  it("returns one WordTiming per word of the quote text", () => {
    const words = quoteWords({ text: "less is more", author: "Mies" })
    expect(words.map((w) => w.text)).toEqual(["less", "is", "more"])
  })

  it("never includes the author string in the swept word track", () => {
    const author = "Frost"
    const words = quoteWords({ text: "the only way out is through", author })
    for (const w of words) {
      expect(w.text).not.toContain(author)
    }
    expect(words.map((w) => w.text).join(" ")).toBe("the only way out is through")
  })

  it("threads cadence options into computeCadence (proportional to cps)", () => {
    // "abcdefghij" = 10 clean chars; inside the [0.2, 0.7] clamp for both dials.
    const slow = quoteWords({ text: "abcdefghij" }, { cps: 15 })[0]
    const fast = quoteWords({ text: "abcdefghij" }, { cps: 20 })[0]
    expect(slow.end - slow.start).toBeCloseTo(10 / 15, 6)
    expect(fast.end - fast.start).toBeCloseTo(10 / 20, 6)
  })
})

describe("quote-sequencer — QUOTE_CHUNKING", () => {
  it("forces a multi-sentence quote into exactly ONE chunk", () => {
    const words = quoteWords({
      text: "First sentence here. Second one follows! And a third?",
    })
    expect(words.length).toBeGreaterThan(1)
    const chunks = chunkWords(words, QUOTE_CHUNKING)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].startIndex).toBe(0)
    expect(chunks[0].words).toHaveLength(words.length)
  })
})

describe("quote-sequencer — mark / separator composition", () => {
  it("wraps a quote with the default curly quotation marks", () => {
    expect(wrapQuote("hello")).toBe(`${DEFAULT_OPEN_QUOTE}hello${DEFAULT_CLOSE_QUOTE}`)
    expect(wrapQuote("hello")).toBe("“hello”")
  })

  it("honors custom marks", () => {
    expect(wrapQuote("hello", "«", "»")).toBe("«hello»")
  })

  it("renders no marks when both are empty strings", () => {
    expect(wrapQuote("hello", "", "")).toBe("hello")
  })

  it("renders only the mark that is provided", () => {
    expect(wrapQuote("hello", "“", "")).toBe("“hello")
    expect(wrapQuote("hello", "", "”")).toBe("hello”")
  })

  it("prepends the default separator to the author", () => {
    expect(composeAuthor("Frost")).toBe(`${DEFAULT_AUTHOR_SEPARATOR}Frost`)
    expect(composeAuthor("Frost")).toBe("— Frost")
  })

  it("honors a custom separator", () => {
    expect(composeAuthor("Frost", "~ ")).toBe("~ Frost")
  })

  it("renders the author with no separator when the separator is empty", () => {
    expect(composeAuthor("Frost", "")).toBe("Frost")
  })

  it("renders nothing for an absent or empty author", () => {
    expect(composeAuthor(undefined)).toBe("")
    expect(composeAuthor("")).toBe("")
    expect(composeAuthor(undefined, "— ")).toBe("")
  })
})
