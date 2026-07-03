import type { ChunkingOptions, WordTiming } from "./types"

/** A page of words shown together while the highlight sweeps through them. */
export interface Chunk {
  /** Index (into the full words array) of this chunk's first word. */
  startIndex: number
  words: WordTiming[]
}

/** Width-mode inputs measured by the renderer (DOM measurement of the real font). */
export interface ChunkMeasure {
  /** Rendered box width (px) of each word, parallel to the words array. */
  wordWidths: number[]
  /** Gap (px) between adjacent words. */
  gapWidth: number
  /** Target inner width (px) words wrap within. */
  targetWidth: number
}

const DEFAULTS = {
  mode: "pause" as const,
  gapThreshold: 0.5,
  breakOnPunctuation: true,
  maxLines: 2,
}

/** Sentence-ending punctuation, allowing a trailing close-quote/paren. */
const SENTENCE_END = /[.!?]+["'’)\]]?$/

/**
 * Segment the full word list into display pages.
 *
 * When a box width is known (`measure`), words are line-packed: a page may wrap up
 * to `maxLines` lines (CapCut caps at 2); when the next word would need a line
 * beyond that, the page flushes. Without a measure (auto width) pages are a single
 * line capped by `maxWords`. In both cases `pause` mode also breaks on word-gaps,
 * and sentence punctuation ends a page when `breakOnPunctuation`.
 */
export function chunkWords(
  words: WordTiming[],
  options?: ChunkingOptions,
  measure?: ChunkMeasure,
): Chunk[] {
  if (words.length === 0) return []

  const mode = options?.mode ?? DEFAULTS.mode
  const gapThreshold = options?.gapThreshold ?? DEFAULTS.gapThreshold
  const breakOnPunctuation = options?.breakOnPunctuation ?? DEFAULTS.breakOnPunctuation
  const maxLines = Math.max(1, options?.maxLines ?? DEFAULTS.maxLines)

  const useLines =
    !!measure && measure.targetWidth > 0 && measure.wordWidths.length === words.length
  // With a width constraint the line/word geometry binds; otherwise cap words/line.
  const maxWords = options?.maxWords ?? (useLines ? 16 : 4)

  const chunks: Chunk[] = []
  let cur: WordTiming[] = []
  let startIdx = 0
  let lineCount = 1
  let lineWidth = 0 // running px of the current line

  const flush = () => {
    if (cur.length > 0) {
      chunks.push({ startIndex: startIdx, words: cur })
      cur = []
      lineCount = 1
      lineWidth = 0
    }
  }

  for (let i = 0; i < words.length; i++) {
    const w = words[i]

    // Does this word force a NEW PAGE before being added?
    let pageBreak = false
    if (cur.length > 0) {
      if (cur.length >= maxWords) {
        pageBreak = true
      } else if (mode === "pause" && w.start - words[i - 1].end > gapThreshold) {
        pageBreak = true
      } else if (useLines) {
        const projected = lineWidth + measure!.gapWidth + measure!.wordWidths[i]
        // Won't fit the current line AND no more lines left → page is full.
        if (projected > measure!.targetWidth && lineCount >= maxLines) pageBreak = true
      }
    }
    if (pageBreak) flush()

    // Add the word, tracking line geometry.
    if (cur.length === 0) {
      startIdx = i
      lineCount = 1
      lineWidth = useLines ? measure!.wordWidths[i] : 0
    } else if (useLines) {
      const projected = lineWidth + measure!.gapWidth + measure!.wordWidths[i]
      if (projected > measure!.targetWidth) {
        // wrap to a new line (room guaranteed by the pageBreak check above)
        lineCount += 1
        lineWidth = measure!.wordWidths[i]
      } else {
        lineWidth = projected
      }
    }
    cur.push(w)

    // Sentence end flushes the page (both modes).
    if (breakOnPunctuation && SENTENCE_END.test(w.text)) flush()
  }

  flush()
  return chunks
}

/** Index of the chunk that contains `activeIndex` (clamped; defaults to first). */
export function findChunkIndex(chunks: Chunk[], activeIndex: number): number {
  const idx = activeIndex < 0 ? 0 : activeIndex
  for (let c = 0; c < chunks.length; c++) {
    const ch = chunks[c]
    if (idx >= ch.startIndex && idx < ch.startIndex + ch.words.length) return c
  }
  return 0
}
