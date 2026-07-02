import { describe, expect, it } from "vitest"
import { chunkWords, findChunkIndex } from "./chunking"
import type { ChunkMeasure } from "./chunking"
import type { WordTiming } from "./types"

// Build a WordTiming with explicit timing so gap assertions are exact.
function w(text: string, start: number, end: number): WordTiming {
  return { text, start, end }
}

describe("chunkWords — general", () => {
  it("returns no chunks for an empty word list", () => {
    expect(chunkWords([])).toEqual([])
  })

  it("keeps startIndex pointing at the first word of each page", () => {
    // Contiguous words, gap 0, no punctuation → capped by default maxWords=4.
    const words = [
      w("one", 0, 1),
      w("two", 1, 2),
      w("three", 2, 3),
      w("four", 3, 4),
      w("five", 4, 5),
    ]
    const chunks = chunkWords(words)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].startIndex).toBe(0)
    expect(chunks[0].words).toHaveLength(4)
    expect(chunks[1].startIndex).toBe(4)
    expect(chunks[1].words).toHaveLength(1)
  })
})

describe("chunkWords — pause mode", () => {
  it("starts a new page when the inter-word gap exceeds gapThreshold", () => {
    const words = [
      w("a", 0, 1),
      w("b", 1.2, 2), // gap 0.2 < 0.5 → same page
      w("c", 3, 4), // gap 1.0 > 0.5 → new page
    ]
    const chunks = chunkWords(words)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].words.map((x) => x.text)).toEqual(["a", "b"])
    expect(chunks[1].words.map((x) => x.text)).toEqual(["c"])
  })

  it("does not break on a gap at or below the default threshold (0.5)", () => {
    const words = [
      w("a", 0, 1),
      w("b", 1.5, 2), // gap exactly 0.5, not > 0.5 → same page
    ]
    expect(chunkWords(words)).toHaveLength(1)
  })

  it("honours a custom gapThreshold", () => {
    const words = [
      w("a", 0, 1),
      w("b", 1.3, 2), // gap 0.3
    ]
    expect(chunkWords(words, { gapThreshold: 0.2 })).toHaveLength(2)
    expect(chunkWords(words, { gapThreshold: 0.4 })).toHaveLength(1)
  })

  it("ends a page after sentence-ending punctuation when breakOnPunctuation (default)", () => {
    const words = [
      w("Hello.", 0, 1),
      w("World", 1.1, 2), // tiny gap, would otherwise pack together
    ]
    const chunks = chunkWords(words)
    expect(chunks).toHaveLength(2)
    expect(chunks[0].words.map((x) => x.text)).toEqual(["Hello."])
    expect(chunks[1].words.map((x) => x.text)).toEqual(["World"])
  })

  it("keeps a sentence together when breakOnPunctuation is false", () => {
    const words = [w("Hello.", 0, 1), w("World", 1.1, 2)]
    expect(chunkWords(words, { breakOnPunctuation: false })).toHaveLength(1)
  })

  it("breaks after a closing quote/paren following sentence punctuation", () => {
    const words = [w('done.)', 0, 1), w("next", 1.1, 2)]
    const chunks = chunkWords(words)
    expect(chunks).toHaveLength(2)
  })

  it("never exceeds maxWords per page", () => {
    const words = Array.from({ length: 9 }, (_, i) => w(`w${i}`, i, i + 1))
    const chunks = chunkWords(words, { maxWords: 3 })
    for (const c of chunks) {
      expect(c.words.length).toBeLessThanOrEqual(3)
    }
    expect(chunks).toHaveLength(3)
  })
})

describe("chunkWords — width mode", () => {
  // wordWidths parallel to words; a page wraps up to maxLines then flushes.
  const words = [w("a", 0, 1), w("b", 1, 2), w("c", 2, 3), w("d", 3, 4)]

  it("packs by width and flushes a page once maxLines is exceeded", () => {
    // width 25, each word 10px, gap 5px → two words fill a line (10+5+10=25).
    const measure: ChunkMeasure = {
      wordWidths: [10, 10, 10, 10],
      gapWidth: 5,
      targetWidth: 25,
    }
    const chunks = chunkWords(words, { mode: "width", maxLines: 1 }, measure)
    // maxLines 1 → only one line of two words per page.
    expect(chunks).toHaveLength(2)
    expect(chunks[0].words.map((x) => x.text)).toEqual(["a", "b"])
    expect(chunks[1].words.map((x) => x.text)).toEqual(["c", "d"])
  })

  it("allows up to maxLines lines on a single page before flushing", () => {
    const measure: ChunkMeasure = {
      wordWidths: [10, 10, 10, 10],
      gapWidth: 5,
      targetWidth: 25,
    }
    // maxLines 2 → four words (two lines) fit on one page.
    const chunks = chunkWords(words, { mode: "width", maxLines: 2 }, measure)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].words).toHaveLength(4)
  })

  it("ignores word gaps in width mode (does not pause-break)", () => {
    const gappy = [w("a", 0, 1), w("b", 5, 6), w("c", 10, 11)] // huge gaps
    const measure: ChunkMeasure = {
      wordWidths: [10, 10, 10],
      gapWidth: 5,
      targetWidth: 100, // everything fits one line
    }
    const chunks = chunkWords(gappy, { mode: "width", maxLines: 2 }, measure)
    // Width mode never consults gaps, so the big gaps do not split the page.
    expect(chunks).toHaveLength(1)
  })

  it("falls back to maxWords-only single-line packing when no numeric width is measured", () => {
    // No measure → useLines is false, default maxWords for that path is 4.
    const five = Array.from({ length: 5 }, (_, i) => w(`w${i}`, i, i + 1))
    const chunks = chunkWords(five, { mode: "width" })
    expect(chunks).toHaveLength(2)
    expect(chunks[0].words).toHaveLength(4)
  })
})

describe("findChunkIndex", () => {
  const chunks = [
    { startIndex: 0, words: [w("a", 0, 1), w("b", 1, 2)] },
    { startIndex: 2, words: [w("c", 2, 3), w("d", 3, 4)] },
  ]

  it("maps a word index to the page that contains it", () => {
    expect(findChunkIndex(chunks, 0)).toBe(0)
    expect(findChunkIndex(chunks, 1)).toBe(0)
    expect(findChunkIndex(chunks, 2)).toBe(1)
    expect(findChunkIndex(chunks, 3)).toBe(1)
  })

  it("returns 0 for an out-of-range index (clamped fallback)", () => {
    expect(findChunkIndex(chunks, 99)).toBe(0)
  })

  // NOTE: the documented/intended behaviour is that a beat (activeIndex === -1)
  // should HOLD on the current page rather than snap back to page 0. The current
  // implementation does NOT do this — it maps activeIndex < 0 to index 0 and thus
  // always returns page 0. This test pins the ACTUAL behaviour (see the report).
  it("currently returns page 0 when activeIndex is -1 (a beat)", () => {
    expect(findChunkIndex(chunks, -1)).toBe(0)
  })

  it("returns 0 for an empty chunk list", () => {
    expect(findChunkIndex([], 0)).toBe(0)
  })
})
