/**
 * Capicola — frozen public contract (the "architect's seam").
 *
 * This file is the single source of truth that the parallel build agents
 * (timing hook, renderer, caption CLI) all target. Do NOT rename or change the
 * shape of these exported types without updating every consumer — they are the
 * interface that lets the pieces be built independently and integrate cleanly.
 *
 * Designed to be extraction-ready: no imports from design-system internals,
 * theming surfaced via CSS variables (see capicola.css), not props.
 */

/** A single word with its timing window, in seconds, relative to sequence start. */
export interface WordTiming {
  text: string
  /** Seconds from start when this word becomes active. */
  start: number
  /** Seconds from start when this word stops being active. */
  end: number
}

/**
 * The build artifact emitted by the `caption` CLI, and the audio-mode input.
 * Spread directly into <Capicola {...caption} />.
 */
export interface CaptionData {
  /** URL/path to narration audio. Omit/undefined ⇒ silent cadence mode. */
  audioSrc?: string
  words: WordTiming[]
  /** Generator metadata (voice, source tool, generatedAt, etc.). Non-functional. */
  meta?: Record<string, unknown>
}

/** Tuning for silent (no-audio) cadence mode — the per-word highlight pacing. */
export interface CadenceOptions {
  /**
   * Cadence model:
   *  - "reading" (default): char-proportional, tuned for comprehension/readability
   *    (subtitle CPS + read-along research). Each word holds for charCount / cps,
   *    clamped to a trackable floor. Fully proportional to the `cps` dial.
   *  - "speech": prosody model (function-word reduction, phrase-final lengthening) —
   *    sounds like speech, less optimal for reading.
   */
  style?: "reading" | "speech"

  // ── reading model ──
  /** Characters per second (the subtitle/comprehension metric). ~15 comfy, ~25 fast. Default 15. */
  cps?: number
  /** Per-word floor, seconds — keeps a highlight trackable (not a subliminal flick). Default 0.2. */
  minWordDuration?: number
  /** Per-word ceiling, seconds — very long words don't stall. Default 0.7. */
  maxWordDuration?: number

  // ── pauses (both models) ──
  /** Extra dwell after a comma/semicolon/colon, seconds. The highlight clears during the beat. Default 0.8. */
  commaPause?: number
  /** Extra dwell after a sentence ender (. ! ?), seconds. The highlight clears during the beat. Default 0.8. */
  sentencePause?: number

  // ── speech model only ──
  /** Approximate words-per-minute baseline (speech model). Default 165. */
  rate?: number
  /** Seconds added per syllable beyond the first (speech model). Default 0.05. */
  perSyllable?: number
  /** Multiplier for unstressed function words (speech model). Default 0.62. */
  functionWordScale?: number
  /** Multiplier for the last word before a boundary (speech model). Default 1.18. */
  phraseFinalScale?: number
}

/** Horizontal anchor vector (CSS-style). */
export type AnchorX = "left" | "center" | "right"
/**
 * Vertical anchor vector (CSS-style): "top" = above the target, "middle" = over
 * its centre, "bottom" = below. Combined with AnchorX this is a 3×3 anchor grid —
 * e.g. top+center = above-centred, middle+center = overlaid, middle+left = to the left.
 *
 * "auto" is collision-aware: it prefers above, but flips below when there isn't room
 * above in the viewport (and re-evaluates as the page scrolls), so it stays visible.
 */
export type AnchorY = "top" | "middle" | "bottom" | "auto"

/** Horizontal alignment of the caption within its box (only visible when the box is wider than content). */
export type CaptionAlign = "left" | "center" | "right"

/**
 * Caption box width source:
 *  - "auto"   → hug the current chunk's content (default; the reference look)
 *  - "parent" → match the width of the caption's flow container, live/responsive
 *    (anchored: the anchor's parent element; inline: the element it's mounted in)
 *  - number   → a MAX width in px (box shrinks to content if narrower; `align` positions it)
 */
export type CaptionWidth = number | "parent" | "auto"

/**
 * How words are grouped into the on-screen "pages" that the highlight sweeps through.
 * `pause` reproduces CapCut: phrases are cut on word-gaps + sentence punctuation, capped by
 * `maxWords`. `width` ignores gaps and greedily packs as many words as fit the box width.
 * Both produce variable-length pages; `width` requires a resolved numeric box width (falls back
 * to `maxWords`-only when width is "auto").
 */
export interface ChunkingOptions {
  /** "pause" (CapCut-style) or "width" (greedy fill). Default "pause". */
  mode?: "pause" | "width"
  /** Hard cap on words per page (both modes). Default 4. */
  maxWords?: number
  /** Pause mode: a gap (seconds) larger than this between two words starts a new page. Default 0.5. */
  gapThreshold?: number
  /** Always end a page after a sentence-ending word (. ! ?), even mid-pack. Default true. */
  breakOnPunctuation?: boolean
  /**
   * Max lines a page may wrap to before paging (CapCut caps at 2). Only engages when a
   * box width is resolved (`width` = number | "parent"); in "auto" width it stays single-line.
   * Default 2.
   */
  maxLines?: number
}

/**
 * Aesthetic config — mirrors CapCut's caption style panel (the de-facto standard for
 * this style) so the controls feel familiar to creators/editors who'd adopt the
 * open-source component. Every token is backed by a CSS custom property (`--cap-*`)
 * whose default reproduces `design-spec.md` (the reference "tiktok-pink" look), so
 * `appearance={}` === the reference and partial overrides Just Work. Raw CSS vars
 * via `className` remain the escape hatch for anything not tokenized.
 *
 * Layout-stability contract (see design-spec): NONE of these tokens may be animated
 * per-word in a way that reflows. The highlight is a paint change over constant
 * padding; the pop is a compositor `transform: scale()`. No jitter, ever.
 */
export interface CaptionTheme {
  // ── Font  (CapCut: Font / Size / Color)
  fontFamily?: string
  fontWeight?: number | string
  fontSizePx?: number
  letterSpacingEm?: number
  textTransform?: "uppercase" | "none" | "lowercase" | "capitalize"
  textColor?: string

  // ── Stroke / outline  (CapCut: Stroke → color + thickness)
  strokeColor?: string
  /** Outline thickness, px. Rendered with `-webkit-text-stroke` + `paint-order: stroke fill` (a real
   *  vector stroke drawn behind the fill), so letters keep full weight. The stroke width is internally
   *  doubled because paint-order only reveals the outer half. */
  strokeWidthPx?: number

  // ── Drop shadow  (CapCut: Shadow → color + opacity + blur + distance + angle)
  shadowColor?: string
  shadowBlurPx?: number
  shadowDistancePx?: number
  shadowAngleDeg?: number

  // ── Active-word highlight box  (per-word "karaoke" box)
  /** Solid color OR any CSS background value (e.g. a linear-gradient) for the active word. "transparent" = no box. */
  highlightColor?: string
  highlightTextColor?: string
  highlightPaddingXPx?: number
  highlightPaddingYPx?: number
  highlightRadiusPx?: number
  highlightOpacity?: number

  // ── Line background / "bubble"  (CapCut: Background — a box behind the whole line)
  /** Background behind the WHOLE caption line. Any CSS background; "transparent" = none. */
  backgroundColor?: string
  backgroundPaddingXPx?: number
  backgroundPaddingYPx?: number
  backgroundRadiusPx?: number

  // ── Motion  (the active-word pop; not a CapCut export)
  popScale?: number
  popDurationMs?: number
  popEasing?: string

  /** Space between adjacent words, em. Constant for active + inactive (anti-jitter). */
  wordGapEm?: number
}

/**
 * Named style templates (à la CapCut). A preset is just a bundle of CaptionTheme
 * tokens; `appearance` merges on top of it (appearance wins). Because the tokens
 * are orthogonal you can freely combine looks — e.g. preset="bubble" plus an
 * `appearance.highlightColor` gives a per-word box on a line bubble.
 *  - "box":    pink box behind the active word (default look)
 *  - "color":  active word changes text colour, no box
 *  - "bubble": translucent box behind the whole line
 *  - "plain":  no per-word highlight at all
 */
export type CaptionPreset = "box" | "color" | "bubble" | "plain"

/**
 * Where the caption/quote renders:
 *  - "anchored" (default): the classic overlay — portaled into `document.body`,
 *    `position: fixed`, positioned against `anchorRef` (backward-compatible).
 *  - "inline": a normal in-flow block (`position: relative`) rendered where
 *    `<Capicola>` sits in the tree; `anchorRef` is ignored.
 */
export type CaptionPlacement = "anchored" | "inline"

/**
 * What content the engine sweeps:
 *  - "caption" (default): the rolling word-by-word caption (the classic behavior).
 *  - "quote": a featured-quote reel — the whole quote shows at once, the highlight
 *    sweeps only the quote words, a separately-styled author stays static, and the
 *    reel auto-cycles through `quotes` (see QuoteOptions).
 */
export type CaptionMode = "caption" | "quote"

/** A single featured quote for `mode="quote"`. */
export interface Quote {
  /** The quote body — the words the highlight sweeps across. */
  text: string
  /** Optional attribution. Rendered as its own static element, never highlighted. */
  author?: string
}

/**
 * Tuning for the quote reel (`mode="quote"`). All fields optional; defaults keep
 * the reference look. The open quote, close quote, and author separator are each
 * individually configurable and may be set to "" (empty string) to render none.
 */
export interface QuoteOptions {
  /** Extra dwell on the author after a quote's sweep finishes, ms. Default 1600. */
  authorPauseMs?: number
  /** Auto-cycle and loop back to the first quote after the last. Default true. */
  loop?: boolean
  /** Dwell before looping from the last quote back to the first, ms. Default = authorPauseMs. */
  loopPauseMs?: number
  /** Opening quotation mark wrapped around the quote text. "" = none. Default "“". */
  openQuote?: string
  /** Closing quotation mark wrapped around the quote text. "" = none. Default "”". */
  closeQuote?: string
  /** Separator prepended to the author attribution. "" = none. Default "— ". */
  authorSeparator?: string
}

// ── Headless engine contract (React-free) ───────────────────────────────────

/**
 * Options for the framework-agnostic engine `createCapicola(mountEl, opts)`.
 *
 * Field-for-field the same surface as `CapicolaProps`, minus React: the anchor is
 * a raw `HTMLElement` (`anchorEl`) instead of a `RefObject` (`anchorRef`). The React
 * wrapper adapts `anchorRef.current → anchorEl`. This interface imports no React and
 * is what the core `.d.ts` exposes.
 */
export interface CapicolaOptions {
  /** Mounts + plays when true; resets/hides when false. Default true. */
  open?: boolean
  /** Element the caption is positioned against. Only used when `placement="anchored"`. */
  anchorEl?: HTMLElement | null

  // ── Audio mode: provide BOTH audioSrc and words (e.g. from the caption CLI).
  audioSrc?: string
  words?: WordTiming[]

  // ── Cadence mode: provide text; per-word timings are computed from `cadence`.
  text?: string
  cadence?: CadenceOptions

  /** Where the caption renders: overlay anchored to `anchorEl`, or in-flow inline. Default "anchored". */
  placement?: CaptionPlacement
  /** What the engine sweeps: the rolling caption, or the featured-quote reel. Default "caption". */
  mode?: CaptionMode
  /** The featured quotes for `mode="quote"`. The reel cycles through these in order. */
  quotes?: Quote[]
  /**
   * Aesthetic overrides for the author attribution in `mode="quote"`. Same token
   * shape as `appearance`, mapped to parallel `--cap-author-*` CSS variables.
   */
  authorAppearance?: CaptionTheme
  /** Tuning for the quote reel (pauses, looping, quotation marks, separator). */
  quote?: QuoteOptions
  /** How words are grouped into pages (see ChunkingOptions). Default: pause-based, maxWords 4. */
  chunking?: ChunkingOptions
  /** Caption box width source. Default "auto" (hug content). */
  width?: CaptionWidth
  /** Horizontal alignment of the text within the box when it's wider than the content. Default "center". */
  align?: CaptionAlign
  /** Horizontal anchor position relative to the target. Default "center". */
  anchorX?: AnchorX
  /** Vertical anchor position relative to the target (above / over / below). Default "top". */
  anchorY?: AnchorY
  /** Gap (px) pushed outward for edge positions (ignored for center/middle). Default 8. */
  offset?: number
  /** Named style template (box | color | bubble | plain). `appearance` merges on top. */
  preset?: CaptionPreset
  /**
   * Aesthetic overrides (CapCut-style tokens). Merged over the `preset` (or the
   * default box theme) and applied as `--cap-*` CSS variables.
   */
  appearance?: CaptionTheme
  /** Fires whenever the active word index changes (also good for analytics). */
  onWordChange?: (index: number, word: WordTiming) => void
  /** Fires once the sequence/audio completes. */
  onEnded?: () => void
  className?: string
}

/**
 * Imperative handle returned by `createCapicola`. `update` merges a partial set of
 * options onto the live instance (re-deriving theme/words/observers as needed);
 * `destroy` tears down every observer/timer/listener/rAF and removes the DOM.
 */
export interface CapicolaInstance {
  play: () => void
  pause: () => void
  update: (opts: Partial<CapicolaOptions>) => void
  destroy: () => void
}
