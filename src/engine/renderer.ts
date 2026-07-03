import { QUOTE_FADE_MS } from "../theme"
import type { CaptionAlign, WordTiming } from "../types"
import type { ComputePositionResult } from "./positioning"

/**
 * The derived render state the renderer consumes — the DOM-free description of one
 * frame of the caption. The orchestrator computes it from options + driver state;
 * the renderer turns it into (or diffs it onto) the byte-identical `.cap-root` DOM.
 */
export interface RendererState {
  /** Anchored overlay (`.cap-root`) vs inline in-flow block (`.cap-root--inline`). */
  isAnchored: boolean
  /** Quote-reel mode (`.cap-track--quote` + author) vs rolling caption. */
  isQuote: boolean
  /** Extra caller-supplied class appended to the root. */
  className?: string
  /** The full caption text, used as the root's `aria-label`. */
  ariaLabel: string

  /** `--cap-*` custom properties (from `themeToVars(mergedTheme)`). */
  themeVars: Record<string, string>
  /** `--cap-author-*` custom properties (quote mode; empty otherwise). */
  authorVars: Record<string, string>

  /** Resolved numeric box width (px), or undefined to hug content. */
  resolvedBoxWidth?: number
  /** Horizontal alignment within the box. */
  align: CaptionAlign

  /** All words, for the hidden measure row (present only when a box width is set). */
  resolvedWords: WordTiming[]

  /** The visible page's global start index (for O(1) span lookup by global index). */
  chunkStartIndex: number
  /** The visible page's words. */
  chunkWords: WordTiming[]
  /** The visible page index (drives caption-mode key/remount). */
  chunkIdx: number
  /** The active global word index, or -1 (idle / punctuation beat). */
  activeIndex: number

  /** Opening quotation mark ("" = none; quote mode only). */
  openQuoteMark: string
  /** Closing quotation mark ("" = none; quote mode only). */
  closeQuoteMark: string
  /** Composed author attribution ("" = none; quote mode only). */
  authorText: string
  /** Reel phase, mirrored onto the author's `data-active` (quote mode only). */
  quotePhase: "sweeping" | "dwelling"
}

/** Result of `renderer.measure()` — the real per-word widths + inter-word gap. */
export interface RendererMeasurement {
  wordWidths: number[]
  gapWidth: number
}

/**
 * Imperative DOM renderer: builds the `.cap-root` tree once, then applies surgical
 * updates. Emits the exact same classes + `--cap-*`/`--cap-author-*` inline vars as
 * the React component (the parity contract). Does NOT attach itself to a parent — the
 * orchestrator places `rootEl` (body-portal when anchored, mountEl when inline).
 */
export interface Renderer {
  /** The `.cap-root` element (not yet attached to any parent). */
  readonly rootEl: HTMLElement
  /** The hidden `.cap-measure` row, when a box width is set; null otherwise. */
  readonly measureRowEl: HTMLElement | null

  /** Construct the full tree from an initial state. */
  build: (state: RendererState) => void
  /** Diff `prev → next` and apply the minimal DOM mutations. */
  update: (prev: RendererState, next: RendererState) => void
  /** Per-tick: flip `data-active` on ≤2 spans (prev cleared, next set). */
  setActive: (prev: number, next: number) => void
  /**
   * Swap the visible page: caption mode replaces the track node (replays the CSS
   * enter animation); quote mode mutates children in place (stable node).
   */
  swapChunk: (idx: number, state: RendererState) => void
  /** Apply the anchored fixed-overlay position + visibility. */
  applyPosition: (pos: ComputePositionResult, visible: boolean) => void
  /** Read the real per-word widths + gap from the hidden measure row. */
  measure: () => RendererMeasurement
  /** The current rendered height of the root (for `auto` collision flipping). */
  getHeight: () => number
  /** Remove the root from the DOM and drop all references. */
  destroy: () => void
}

// ─── helpers (pure DOM construction — no state) ───────────────────────────────

/** Resolve the flex `justify`/`align` keyword from the caption's alignment token. */
function justifyOf(align: CaptionAlign): string {
  return align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"
}

/** Whether two word arrays render the same span text (timings don't affect the DOM). */
function sameWordText(a: WordTiming[], b: WordTiming[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i].text !== b[i].text) return false
  return true
}

/** A single `.cap-word` span. Quote marks are `aria-hidden`; track words are not. */
function makeWordSpan(
  text: string,
  active: boolean,
  ariaHidden: boolean,
): HTMLSpanElement {
  const span = document.createElement("span")
  span.className = "cap-word"
  span.setAttribute("data-active", active ? "true" : "false")
  if (ariaHidden) span.setAttribute("aria-hidden", "true")
  span.textContent = text
  return span
}

/**
 * Create an imperative renderer. Builds the byte-identical `.cap-root` DOM the React
 * component renders and applies surgical, parity-preserving updates.
 */
export function createRenderer(): Renderer {
  const rootEl = document.createElement("div")
  rootEl.setAttribute("role", "group")

  let trackEl: HTMLElement | null = null
  let measureRowEl: HTMLElement | null = null
  let authorEl: HTMLElement | null = null

  // O(1) active-word lookup: global word index → its `.cap-word` span. Holds only
  // the CURRENTLY visible chunk's words (quote marks are never keyed — never active).
  const wordSpans = new Map<number, HTMLSpanElement>()
  // The `--cap-*`/`--cap-author-*` custom props currently applied to the root, so an
  // update can remove ones that vanished before writing the new set.
  let appliedVars: string[] = []
  // Cache the last state so `applyPosition`/`update` can branch on placement/mode.
  let current: RendererState | null = null
  let destroyed = false

  // ── root-level appliers (idempotent) ────────────────────────────────────────

  function applyClass(state: RendererState): void {
    rootEl.className = [
      "cap-root",
      state.isAnchored ? null : "cap-root--inline",
      state.className,
    ]
      .filter(Boolean)
      .join(" ")
  }

  function applyVars(state: RendererState): void {
    for (const name of appliedVars) rootEl.style.removeProperty(name)
    appliedVars = []
    for (const [k, v] of Object.entries(state.themeVars)) {
      rootEl.style.setProperty(k, v)
      appliedVars.push(k)
    }
    for (const [k, v] of Object.entries(state.authorVars)) {
      rootEl.style.setProperty(k, v)
      appliedVars.push(k)
    }
  }

  function applyWidth(state: RendererState): void {
    if (state.resolvedBoxWidth !== undefined)
      rootEl.style.width = `${state.resolvedBoxWidth}px`
    else rootEl.style.removeProperty("width")
  }

  function applyAlignment(state: RendererState): void {
    const justify = justifyOf(state.align)
    // Quote mode stacks quote over author (column, cross-axis aligned); caption mode
    // keeps the classic single-axis row justification.
    if (state.isQuote) {
      rootEl.style.flexDirection = "column"
      rootEl.style.alignItems = justify
      rootEl.style.removeProperty("justify-content")
    } else {
      rootEl.style.justifyContent = justify
      rootEl.style.removeProperty("flex-direction")
      rootEl.style.removeProperty("align-items")
    }
    // Width mode: the visible track carries its own justify-content (wrapped lines
    // re-align live), so keep it in sync on a runtime align change too.
    if (state.resolvedBoxWidth !== undefined && trackEl) {
      trackEl.style.justifyContent = justify
    }
  }

  function applyBaseStyle(state: RendererState): void {
    // Anchored overlay: fixed + high z. Inline: no positioning (`.cap-root--inline`
    // owns it) — strip any anchored props left over from a placement flip.
    if (state.isAnchored) {
      rootEl.style.position = "fixed"
      rootEl.style.zIndex = "9999"
    } else {
      rootEl.style.removeProperty("position")
      rootEl.style.removeProperty("z-index")
      rootEl.style.removeProperty("left")
      rootEl.style.removeProperty("top")
      rootEl.style.removeProperty("transform")
    }
    // Hidden until the orchestrator reveals it via applyPosition (font/anchor gate).
    rootEl.style.visibility = "hidden"
    // Quote-reel crossfade: opacity-only (compositor-safe). The dwell timer drives
    // the opacity; the renderer just seeds the initial value + transition.
    if (state.isQuote) {
      rootEl.style.opacity = "1"
      rootEl.style.transition = `opacity ${QUOTE_FADE_MS}ms var(--cap-quote-transition-easing, ease)`
    } else {
      rootEl.style.removeProperty("opacity")
      rootEl.style.removeProperty("transition")
    }
  }

  // ── subtree builders ────────────────────────────────────────────────────────

  /** The hidden `.cap-measure` row (all words at full styling) for width-mode metrics. */
  function makeMeasureRow(state: RendererState): HTMLElement {
    const row = document.createElement("div")
    row.className = "cap-track cap-measure"
    row.setAttribute("aria-hidden", "true")
    for (const word of state.resolvedWords) {
      const span = document.createElement("span")
      span.className = "cap-word"
      span.setAttribute("data-active", "false")
      span.textContent = word.text
      row.appendChild(span)
    }
    return row
  }

  /** Fill a track element with the quote marks + one `.cap-word` per chunk word,
   *  (re)building the `wordSpans` map. Does not touch the element's own attrs. */
  function fillTrack(track: HTMLElement, state: RendererState): void {
    wordSpans.clear()
    if (state.isQuote && state.openQuoteMark !== "") {
      track.appendChild(makeWordSpan(state.openQuoteMark, false, true))
    }
    state.chunkWords.forEach((word, i) => {
      const globalIndex = state.chunkStartIndex + i
      const span = makeWordSpan(word.text, globalIndex === state.activeIndex, false)
      wordSpans.set(globalIndex, span)
      track.appendChild(span)
    })
    if (state.isQuote && state.closeQuoteMark !== "") {
      track.appendChild(makeWordSpan(state.closeQuoteMark, false, true))
    }
  }

  /** A fresh `.cap-track` element (used on build + caption-mode remount). */
  function makeTrack(state: RendererState): HTMLElement {
    const track = document.createElement("div")
    track.className = state.isQuote ? "cap-track cap-track--quote" : "cap-track"
    track.setAttribute("data-chunk", String(state.chunkIdx))
    track.setAttribute("aria-hidden", "true")
    if (state.resolvedBoxWidth !== undefined) {
      track.style.width = "100%"
      track.style.flexWrap = "wrap"
      track.style.justifyContent = justifyOf(state.align)
      track.style.rowGap = "0.12em"
    }
    fillTrack(track, state)
    return track
  }

  /** The static `.cap-author` attribution (`data-active` mirrors the reel phase). */
  function makeAuthor(state: RendererState): HTMLElement {
    const author = document.createElement("div")
    author.className = "cap-author"
    author.setAttribute("data-active", state.quotePhase)
    author.setAttribute("aria-hidden", "true")
    const span = document.createElement("span")
    span.className = "cap-author-word"
    span.textContent = state.authorText
    author.appendChild(span)
    return author
  }

  // ── update-time subtree sync ────────────────────────────────────────────────

  function syncMeasureRow(prev: RendererState, next: RendererState): void {
    const want = next.resolvedBoxWidth !== undefined
    if (!want) {
      if (measureRowEl) {
        measureRowEl.remove()
        measureRowEl = null
      }
      return
    }
    if (!measureRowEl) {
      measureRowEl = makeMeasureRow(next)
      rootEl.insertBefore(measureRowEl, rootEl.firstChild)
      return
    }
    if (!sameWordText(prev.resolvedWords, next.resolvedWords)) {
      const fresh = makeMeasureRow(next)
      rootEl.replaceChild(fresh, measureRowEl)
      measureRowEl = fresh
    }
  }

  function syncAuthor(next: RendererState): void {
    const want = next.isQuote && next.authorText !== ""
    if (!want) {
      if (authorEl) {
        authorEl.remove()
        authorEl = null
      }
      return
    }
    if (!authorEl) {
      authorEl = makeAuthor(next)
      rootEl.appendChild(authorEl)
      return
    }
    authorEl.setAttribute("data-active", next.quotePhase)
    const span = authorEl.firstElementChild
    if (span) span.textContent = next.authorText
  }

  /** Whether the visible track's rendered content (not just the active word) changed. */
  function trackContentChanged(prev: RendererState, next: RendererState): boolean {
    return (
      prev.chunkIdx !== next.chunkIdx ||
      prev.chunkStartIndex !== next.chunkStartIndex ||
      prev.openQuoteMark !== next.openQuoteMark ||
      prev.closeQuoteMark !== next.closeQuoteMark ||
      !sameWordText(prev.chunkWords, next.chunkWords)
    )
  }

  // ── public API ──────────────────────────────────────────────────────────────

  function build(state: RendererState): void {
    current = state
    while (rootEl.firstChild) rootEl.removeChild(rootEl.firstChild)
    applyClass(state)
    rootEl.setAttribute("aria-label", state.ariaLabel)
    applyVars(state)
    applyBaseStyle(state)
    applyWidth(state)
    applyAlignment(state)

    // Order matches the React render: hidden measure row → visible track → author.
    if (state.resolvedBoxWidth !== undefined) {
      measureRowEl = makeMeasureRow(state)
      rootEl.appendChild(measureRowEl)
    } else {
      measureRowEl = null
    }
    trackEl = makeTrack(state)
    rootEl.appendChild(trackEl)
    if (state.isQuote && state.authorText !== "") {
      authorEl = makeAuthor(state)
      rootEl.appendChild(authorEl)
    } else {
      authorEl = null
    }
  }

  function update(prev: RendererState, next: RendererState): void {
    if (destroyed) return
    // Placement or mode flips restructure the whole tree — rebuild from scratch
    // (matches React unmounting/remounting the portal vs inline subtree, and the
    // caption↔quote track/author/measure differences).
    if (prev.isAnchored !== next.isAnchored || prev.isQuote !== next.isQuote) {
      build(next)
      return
    }
    current = next
    applyClass(next)
    if (prev.ariaLabel !== next.ariaLabel)
      rootEl.setAttribute("aria-label", next.ariaLabel)
    applyVars(next)
    if (prev.resolvedBoxWidth !== next.resolvedBoxWidth) applyWidth(next)
    if (prev.align !== next.align) applyAlignment(next)
    syncMeasureRow(prev, next)
    if (trackContentChanged(prev, next)) swapChunk(next.chunkIdx, next)
    syncAuthor(next)
  }

  function setActive(prev: number, next: number): void {
    if (prev >= 0) {
      const p = wordSpans.get(prev)
      if (p) p.setAttribute("data-active", "false")
    }
    if (next >= 0) {
      const n = wordSpans.get(next)
      if (n) n.setAttribute("data-active", "true")
    }
  }

  function swapChunk(idx: number, state: RendererState): void {
    if (destroyed || !trackEl) return
    current = state
    if (state.isQuote) {
      // Stable node: mutate children in place. The crossfade is the root's opacity
      // (owned by the dwell timer), so the track must NOT remount here.
      trackEl.setAttribute("data-chunk", String(idx))
      while (trackEl.firstChild) trackEl.removeChild(trackEl.firstChild)
      fillTrack(trackEl, state)
    } else {
      // Caption: replace the whole track node so the CSS enter-animation replays
      // (reproduces React's `key={chunkIdx}` remount).
      const fresh = makeTrack(state)
      if (trackEl.parentNode) trackEl.parentNode.replaceChild(fresh, trackEl)
      else rootEl.appendChild(fresh)
      trackEl = fresh
    }
  }

  function applyPosition(pos: ComputePositionResult, visible: boolean): void {
    if (current?.isAnchored) {
      rootEl.style.left = `${pos.left}px`
      rootEl.style.top = `${pos.top}px`
      rootEl.style.transform = pos.transform
    }
    rootEl.style.visibility = visible ? "visible" : "hidden"
  }

  function measure(): RendererMeasurement {
    if (!measureRowEl) return { wordWidths: [], gapWidth: 0 }
    const spans = Array.from(measureRowEl.querySelectorAll<HTMLElement>(".cap-word"))
    const wordWidths = spans.map((s) => s.getBoundingClientRect().width)
    const cs = getComputedStyle(measureRowEl)
    const g = parseFloat(cs.columnGap || cs.gap || "0")
    return { wordWidths, gapWidth: Number.isNaN(g) ? 0 : g }
  }

  function getHeight(): number {
    return rootEl.getBoundingClientRect().height
  }

  function destroy(): void {
    if (destroyed) return
    destroyed = true
    rootEl.remove()
    wordSpans.clear()
    trackEl = null
    measureRowEl = null
    authorEl = null
    current = null
    appliedVars = []
  }

  return {
    rootEl,
    get measureRowEl() {
      return measureRowEl
    },
    build,
    update,
    setActive,
    swapChunk,
    applyPosition,
    measure,
    getHeight,
    destroy,
  }
}
