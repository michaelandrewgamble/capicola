import { computeCadence } from "./cadence"
import type { CadenceOptions, ChunkingOptions, Quote, WordTiming } from "./types"

/**
 * Pure, DOM-free core for the quote reel (`mode="quote"`).
 *
 * Like `cadence.ts` and `chunking.ts`, this file must never touch the DOM,
 * `window`, or wall-clock time — it's the unit-testable brain the component
 * wires timers and rendering around. The two-phase state machine is:
 *
 *   sweeping ──(the quote's word sweep ends)──▶ dwelling
 *   dwelling ──(the author read-pause elapses)─▶ next quote (or done)
 */

// ─── state machine ──────────────────────────────────────────────────────────

/** Which quote is on screen, and whether its sweep is still running or paused on the author. */
export interface QuoteSequencerState {
  /** Index into the `quotes` array of the quote currently on screen. */
  quoteIndex: number
  /** "sweeping" while the highlight runs; "dwelling" during the post-sweep author read-pause. */
  phase: "sweeping" | "dwelling"
}

/** The reel starts on the first quote, sweeping. */
export const initialQuoteState: QuoteSequencerState = {
  quoteIndex: 0,
  phase: "sweeping",
}

/**
 * A quote's word sweep just ended → enter the author read-pause. The quote stays
 * on screen; only the phase changes. `quoteCount`/`loop` are accepted for a uniform
 * call site with `advanceAfterDwell` but do not affect the (always-dwell) result.
 */
export function advanceOnEnded(
  state: QuoteSequencerState,
  _quoteCount: number,
  _loop: boolean,
): QuoteSequencerState {
  return {
    quoteIndex: state.quoteIndex,
    phase: "sweeping" === state.phase ? "dwelling" : state.phase,
  }
}

/** Result of the post-dwell advance: the next state, plus whether the reel is finished. */
export interface AdvanceResult {
  /** The state to render next (the following quote, back to sweeping). */
  next: QuoteSequencerState
  /** True when the reel has run out of quotes and should stop (only possible when `loop` is false). */
  done: boolean
}

/**
 * The author read-pause elapsed → advance to the next quote, wrapping with
 * `(i + 1) % quoteCount`. When `loop` is false and we're dwelling on the last
 * quote, `done` is true and `next` freezes on that last quote's author.
 */
export function advanceAfterDwell(
  state: QuoteSequencerState,
  quoteCount: number,
  loop: boolean,
): AdvanceResult {
  const count = Math.max(1, quoteCount)
  const isLast = state.quoteIndex >= count - 1
  if (!loop && isLast) {
    // Freeze on the last quote's author; the reel is complete.
    return { next: { quoteIndex: state.quoteIndex, phase: "dwelling" }, done: true }
  }
  const nextIndex = (state.quoteIndex + 1) % count
  return { next: { quoteIndex: nextIndex, phase: "sweeping" }, done: false }
}

// ─── word timing (quote body only) ───────────────────────────────────────────

/**
 * Per-word timings the highlight sweeps across for a quote. Derived from the
 * quote's `text` ONLY — the author string is rendered as its own static element
 * and is never part of the swept word track, so the highlight can never land on it.
 */
export function quoteWords(quote: Quote, cadence?: CadenceOptions): WordTiming[] {
  return computeCadence(quote.text, cadence)
}

// ─── single-chunk display ────────────────────────────────────────────────────

/**
 * Chunking options that force the WHOLE quote onto one page: no word cap, no
 * gap-based paging, no punctuation breaks. Feed this to `chunkWords` in quote
 * mode so the entire quote is visible at once while the highlight sweeps it.
 */
export const QUOTE_CHUNKING: ChunkingOptions = {
  maxWords: Infinity,
  gapThreshold: Infinity,
  breakOnPunctuation: false,
}

// ─── mark / separator composition ────────────────────────────────────────────

/** Default opening quotation mark wrapped around the quote text. */
export const DEFAULT_OPEN_QUOTE = "“"
/** Default closing quotation mark wrapped around the quote text. */
export const DEFAULT_CLOSE_QUOTE = "”"
/** Default separator prepended to the author attribution. */
export const DEFAULT_AUTHOR_SEPARATOR = "— "

/**
 * Wrap a quote body with its opening/closing marks. Each mark is configurable
 * and an empty string renders none. Pure string composition — the component
 * splits these into decorative (aria-hidden) spans around the swept word track.
 */
export function wrapQuote(
  text: string,
  openQuote: string = DEFAULT_OPEN_QUOTE,
  closeQuote: string = DEFAULT_CLOSE_QUOTE,
): string {
  return `${openQuote}${text}${closeQuote}`
}

/**
 * Compose the author attribution with its leading separator. An empty separator
 * renders no separator; an empty/absent author renders nothing at all.
 */
export function composeAuthor(
  author: string | undefined,
  separator: string = DEFAULT_AUTHOR_SEPARATOR,
): string {
  if (!author) return ""
  return `${separator}${author}`
}
