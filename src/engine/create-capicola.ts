import { computeCadence } from "../cadence"
import { chunkWords, findChunkIndex } from "../chunking"
import type { Chunk } from "../chunking"
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
} from "../quote-sequencer"
import type { QuoteSequencerState } from "../quote-sequencer"
import { QUOTE_FADE_MS, mergeTheme, themeToVars } from "../theme"
import type {
  CaptionAlign,
  CaptionTheme,
  CapicolaInstance,
  CapicolaOptions,
  WordTiming,
} from "../types"
import { awaitFonts } from "./font-gate"
import type { FontGate, FontTarget } from "./font-gate"
import { computePosition } from "./positioning"
import { createRenderer } from "./renderer"
import type { Renderer, RendererState } from "./renderer"
import { createWordDriver } from "./word-driver"
import type { WordDriver } from "./word-driver"

/**
 * The framework-agnostic Capicola engine. Reproduces — imperatively and React-free —
 * the eight effects of the React component (`capicola.tsx`): word driver, theme,
 * chunking, anchor positioning + `auto` collision-flip, the webfont FOUT gate, the
 * width-mode measurement, and the quote-reel dwell/crossfade state machine. Emits the
 * BYTE-IDENTICAL `.cap-root` DOM the component rendered (the parity contract) and
 * aggregates every observer/timer/listener/rAF/node teardown in `destroy()`.
 */
export function createCapicola(
  mountEl: HTMLElement,
  opts: CapicolaOptions,
): CapicolaInstance {
  // ── live options + lifecycle flags ─────────────────────────────────────────
  let o: CapicolaOptions = { ...opts }
  let destroyed = false
  // Whether the DOM is currently mounted (root placed + observers/driver live).
  // Mirrors React mounting/unmounting the subtree on `open` (which returns null
  // when closed).
  let placed = false

  // ── mutable state (the React `useState`/`useRef` scaffolding, de-hooked) ────
  let seq: QuoteSequencerState = initialQuoteState
  let fadingOut = false
  let fontReady = false
  let parentWidth: number | undefined = undefined
  let anchorBox: DOMRect | null = null
  let wordWidths: number[] = []
  let gapWidth = 0
  let captionHeight = 0
  // Holds the page shown during a punctuation beat (activeIndex === -1) so the
  // caption doesn't snap back to page 0 every beat.
  let lastChunkIdx = 0
  let activeIndex = -1

  // ── derived (recomputed on demand) ─────────────────────────────────────────
  let resolvedWords: WordTiming[] = []
  let chunks: Chunk[] = []
  let chunkIdx = 0
  let mergedTheme: CaptionTheme = {}
  let themeVars: Record<string, string> = {}
  let authorVars: Record<string, string> = {}

  // ── resources (torn down in closeDown/destroy) ─────────────────────────────
  let renderer: Renderer | null = null
  let driver: WordDriver | null = null
  let audioEl: HTMLAudioElement | null = null
  let fontGate: FontGate | null = null
  let anchorRO: ResizeObserver | null = null
  let parentRO: ResizeObserver | null = null
  let scrollResizeInstalled = false
  let dwellTimer: ReturnType<typeof setTimeout> | undefined
  let swapTimer: ReturnType<typeof setTimeout> | undefined
  // The last RendererState pushed to the renderer, so `update` can diff against it.
  let prevState: RendererState | null = null

  // ── scalar accessors (default-resolving, read from live `o`) ────────────────
  const isAnchored = () => (o.placement ?? "anchored") === "anchored"
  const isQuote = () => (o.mode ?? "caption") === "quote"
  const isOpen = () => o.open ?? true
  const align = (): CaptionAlign => o.align ?? "center"

  const quoteCount = () => o.quotes?.length ?? 0
  const loop = () => o.quote?.loop ?? true
  const authorPauseMs = () => o.quote?.authorPauseMs ?? 1600
  const loopPauseMs = () => o.quote?.loopPauseMs ?? authorPauseMs()
  const openMark = () => o.quote?.openQuote ?? DEFAULT_OPEN_QUOTE
  const closeMark = () => o.quote?.closeQuote ?? DEFAULT_CLOSE_QUOTE
  const authorSep = () => o.quote?.authorSeparator ?? DEFAULT_AUTHOR_SEPARATOR

  const resolvedBoxWidth = (): number | undefined => {
    const w = o.width ?? "auto"
    return typeof w === "number" ? w : w === "parent" ? parentWidth : undefined
  }

  const activeQuote = () => (isQuote() ? o.quotes?.[seq.quoteIndex] : undefined)

  // ── recompute helpers (mirror the component's `useMemo`s) ───────────────────
  function recomputeTheme(): void {
    mergedTheme = mergeTheme(o.preset, o.appearance)
    themeVars = themeToVars(mergedTheme)
    authorVars = o.authorAppearance ? themeToVars(o.authorAppearance, "cap-author") : {}
  }

  function recomputeWords(): void {
    if (isQuote()) {
      const q = o.quotes?.[seq.quoteIndex]
      resolvedWords = q ? quoteWords(q, o.cadence) : []
    } else if (o.words && o.words.length > 0) {
      resolvedWords = o.words
    } else if (o.text) {
      resolvedWords = computeCadence(o.text, o.cadence)
    } else {
      resolvedWords = []
    }
  }

  function recomputeChunks(): void {
    const rbw = resolvedBoxWidth()
    // Quote mode forces the WHOLE quote onto one page (QUOTE_CHUNKING) and skips
    // width measurement so it never splits — the highlight sweeps one chunk.
    const measure =
      !isQuote() && typeof rbw === "number" && wordWidths.length === resolvedWords.length
        ? { wordWidths, gapWidth, targetWidth: rbw }
        : undefined
    chunks = chunkWords(resolvedWords, isQuote() ? QUOTE_CHUNKING : o.chunking, measure)
  }

  function recomputeChunkIdx(): void {
    if (activeIndex >= 0 && chunks.length > 0) {
      chunkIdx = findChunkIndex(chunks, activeIndex)
      lastChunkIdx = chunkIdx
    } else {
      chunkIdx = Math.min(lastChunkIdx, Math.max(0, chunks.length - 1))
    }
  }

  function buildRendererState(): RendererState {
    const q = activeQuote()
    // Quote mode reads as "quote — author" so assistive tech hears the attribution.
    const ariaLabel = isQuote()
      ? q
        ? [q.text, q.author].filter(Boolean).join(" — ")
        : ""
      : resolvedWords.map((w) => w.text).join(" ")
    const chunk = chunks[chunkIdx] ?? { startIndex: 0, words: [] as WordTiming[] }
    return {
      isAnchored: isAnchored(),
      isQuote: isQuote(),
      className: o.className,
      ariaLabel,
      themeVars,
      authorVars,
      resolvedBoxWidth: resolvedBoxWidth(),
      align: align(),
      resolvedWords,
      chunkStartIndex: chunk.startIndex,
      chunkWords: chunk.words,
      chunkIdx,
      activeIndex,
      openQuoteMark: openMark(),
      closeQuoteMark: closeMark(),
      authorText: composeAuthor(q?.author, authorSep()),
      quotePhase: seq.phase,
    }
  }

  /** Push the current derived state to the renderer (build on first call, else diff). */
  function commit(): void {
    if (!renderer) return
    const next = buildRendererState()
    if (!prevState) renderer.build(next)
    else renderer.update(prevState, next)
    prevState = next
  }

  // ── font targets (mirror capicola.tsx's target computation) ─────────────────
  function computeFontTargets(): FontTarget[] {
    const normFamily = (fam: string) =>
      fam.split(",")[0].trim().replace(/['"]/g, "").toLowerCase()
    const targets: FontTarget[] = [
      {
        family: normFamily(mergedTheme.fontFamily ?? "Barlow Condensed"),
        weight: Number(mergedTheme.fontWeight ?? 900),
      },
    ]
    const author = o.authorAppearance
    if (author && (author.fontFamily !== undefined || author.fontWeight !== undefined)) {
      const authorFamily = normFamily(
        author.fontFamily ?? mergedTheme.fontFamily ?? "Barlow Condensed",
      )
      const authorWeight = Number(author.fontWeight ?? mergedTheme.fontWeight ?? 900)
      if (authorFamily !== targets[0].family || authorWeight !== targets[0].weight) {
        targets.push({ family: authorFamily, weight: authorWeight })
      }
    }
    return targets
  }

  // ── measurement ─────────────────────────────────────────────────────────────
  function measureWidths(): void {
    if (!renderer) return
    if (typeof resolvedBoxWidth() !== "number") {
      wordWidths = []
      gapWidth = 0
      return
    }
    const m = renderer.measure()
    wordWidths = m.wordWidths
    gapWidth = m.gapWidth
  }

  function measureCaptionHeight(): void {
    if (renderer && isAnchored() && o.anchorEl) captionHeight = renderer.getHeight()
  }

  // ── position + visibility gate ──────────────────────────────────────────────
  function positionAndReveal(): void {
    if (!renderer) return
    const visible = fontReady && (!isAnchored() || anchorBox != null)
    if (isAnchored() && anchorBox) {
      const pos = computePosition({
        anchorBox,
        captionHeight,
        anchorX: o.anchorX ?? "center",
        anchorY: o.anchorY ?? "top",
        offset: o.offset ?? 8,
        viewportHeight: typeof window !== "undefined" ? window.innerHeight : 0,
      })
      renderer.applyPosition(pos, visible)
    } else {
      // Inline (applyPosition ignores left/top/transform when not anchored) or
      // anchored-but-unmeasured (visible === false).
      renderer.applyPosition(
        { left: 0, top: 0, transform: "", resolvedAnchorY: "top" },
        visible,
      )
    }
  }

  /** Quote-reel crossfade — opacity-only (compositor-safe), owned by the dwell timer. */
  function applyCrossfade(): void {
    if (renderer) renderer.rootEl.style.opacity = fadingOut ? "0" : "1"
  }

  // ── word driver plumbing ────────────────────────────────────────────────────
  function handleIndexChange(idx: number): void {
    const prevActive = activeIndex
    activeIndex = idx
    const prevChunkIdx = chunkIdx
    recomputeChunkIdx()
    if (!renderer) return
    if (chunkIdx !== prevChunkIdx) {
      // Page changed: swap the visible track (caption remount / quote in-place). The
      // fresh spans already carry data-active for the new active word.
      const next = buildRendererState()
      renderer.swapChunk(chunkIdx, next)
      prevState = next
    } else if (prevActive !== idx) {
      renderer.setActive(prevActive, idx)
      if (prevState) prevState = { ...prevState, activeIndex: idx }
    }
  }

  function handleEnded(): void {
    // Quote mode: a finished sweep advances the reel into the author dwell.
    if (isQuote()) {
      seq = advanceOnEnded(seq, quoteCount(), loop())
      applySeq()
    }
    o.onEnded?.()
  }

  function createDriver(): void {
    driver = createWordDriver({
      getWords: () => resolvedWords,
      getAudioEl: () => audioEl,
      onIndexChange: handleIndexChange,
      onWordChange: (i, w) => o.onWordChange?.(i, w),
      onEnded: handleEnded,
    })
  }

  // ── quote reel: sweep re-drive + dwell/crossfade state machine ──────────────
  /** Restart the sweep on the freshly rendered word track (gated on fontReady). */
  function driveQuoteSweep(): void {
    if (!driver) return
    if (!isQuote() || !isOpen() || !fontReady || seq.phase !== "sweeping") return
    driver.reset()
    driver.play()
  }

  function clearDwellTimers(): void {
    if (dwellTimer) clearTimeout(dwellTimer)
    if (swapTimer) clearTimeout(swapTimer)
    dwellTimer = undefined
    swapTimer = undefined
  }

  /** (Re)schedule the post-sweep author read-pause → crossfade → advance. */
  function scheduleDwell(): void {
    clearDwellTimers()
    if (!isQuote() || !isOpen() || seq.phase !== "dwelling") return
    // Freeze on the last quote when not looping — no advance, no fade.
    if (advanceAfterDwell(seq, quoteCount(), loop()).done) return
    const isLast = seq.quoteIndex >= Math.max(1, quoteCount()) - 1
    const pauseMs = isLast ? loopPauseMs() : authorPauseMs()
    // 1) hold on the author, 2) fade the finished quote OUT, 3) swap while hidden and
    // fade the next quote IN — a real crossfade, not a hard cut.
    dwellTimer = setTimeout(() => {
      fadingOut = true
      applyCrossfade()
      swapTimer = setTimeout(() => {
        fadingOut = false
        applyCrossfade()
        seq = advanceAfterDwell(seq, quoteCount(), loop()).next
        applySeq()
      }, QUOTE_FADE_MS)
    }, pauseMs)
  }

  /** React to a `seq` change: re-derive the quote, swap it in, re-drive + reschedule. */
  function applySeq(): void {
    recomputeWords()
    recomputeChunks()
    recomputeChunkIdx()
    commit()
    driveQuoteSweep()
    scheduleDwell()
  }

  // ── observers (install/uninstall pairs — the leak-risk surface) ─────────────
  const onAnchorMove = () => {
    if (!o.anchorEl) return
    anchorBox = o.anchorEl.getBoundingClientRect()
    positionAndReveal()
  }

  function installAnchorObservers(): void {
    if (!isAnchored() || !o.anchorEl) return
    onAnchorMove()
    anchorRO = new ResizeObserver(onAnchorMove)
    anchorRO.observe(o.anchorEl)
    // Capture scroll so the caption tracks the anchor as ancestors scroll.
    window.addEventListener("scroll", onAnchorMove, true)
    window.addEventListener("resize", onAnchorMove)
    scrollResizeInstalled = true
  }

  function uninstallAnchorObservers(): void {
    if (anchorRO) {
      anchorRO.disconnect()
      anchorRO = null
    }
    if (scrollResizeInstalled) {
      // The capture flag MUST match the addEventListener call (true) or removal is a
      // no-op → a leaked listener.
      window.removeEventListener("scroll", onAnchorMove, true)
      window.removeEventListener("resize", onAnchorMove)
      scrollResizeInstalled = false
    }
  }

  /** resolvedBoxWidth changed → add/remove the measure row, re-measure, re-chunk. */
  function onWidthResolved(): void {
    recomputeChunks()
    recomputeChunkIdx()
    commit() // ensures the hidden measure row is present (or removed) in the DOM
    measureWidths()
    recomputeChunks()
    recomputeChunkIdx()
    commit()
    measureCaptionHeight()
    positionAndReveal()
  }

  function installParentWidthObserver(): void {
    if (!isOpen() || (o.width ?? "auto") !== "parent") return
    // The element whose width "parent" tracks:
    //  - anchored → the anchor's parent (the caption overlays the anchor).
    //  - inline   → the caption's flow container. mountEl is where the caption
    //    lives, but the React wrapper's host is `display: contents` (no box), so
    //    fall through to its parent in that case.
    let container: Element | null
    if (isAnchored()) {
      container = o.anchorEl?.parentElement ?? null
    } else {
      container =
        typeof getComputedStyle !== "undefined" &&
        getComputedStyle(mountEl).display === "contents"
          ? mountEl.parentElement
          : mountEl
    }
    if (!container) return
    const el = container
    const update = () => {
      parentWidth = el.clientWidth
      onWidthResolved()
    }
    update()
    parentRO = new ResizeObserver(update)
    parentRO.observe(el)
  }

  function uninstallParentWidthObserver(): void {
    if (parentRO) {
      parentRO.disconnect()
      parentRO = null
    }
  }

  // ── audio node ──────────────────────────────────────────────────────────────
  function installAudio(): void {
    if (!o.audioSrc) return
    audioEl = document.createElement("audio")
    audioEl.src = o.audioSrc
    audioEl.preload = "auto"
    audioEl.setAttribute("aria-hidden", "true")
    mountEl.appendChild(audioEl)
  }

  function uninstallAudio(): void {
    if (audioEl) {
      audioEl.remove()
      audioEl = null
    }
  }

  // ── mount / unmount (the `open` transitions) ────────────────────────────────
  function openUp(): void {
    if (placed || destroyed) return
    recomputeTheme()
    recomputeWords()
    recomputeChunks()
    recomputeChunkIdx()

    renderer = createRenderer()
    prevState = null
    installAudio()
    commit() // builds the tree into the (detached) root

    // Place the root: anchored → portal into document.body; inline → mountEl.
    if (isAnchored()) document.body.appendChild(renderer.rootEl)
    else mountEl.appendChild(renderer.rootEl)

    createDriver()
    // Only run the font gate if we haven't already released it (fontReady persists
    // across an open/close cycle — fonts don't unload). Re-running it needlessly on
    // every reopen re-polls (and can hit the 3s safety cap), stalling a looped reel.
    if (!fontReady) fontGate = awaitFonts(computeFontTargets(), onFontsReady)

    installAnchorObservers()
    installParentWidthObserver()

    measureCaptionHeight()
    // Fixed numeric width: measure real per-word widths + re-chunk (the parent-width
    // path is handled by installParentWidthObserver's initial update).
    if (typeof resolvedBoxWidth() === "number") {
      measureWidths()
      recomputeChunks()
      recomputeChunkIdx()
      commit()
    }
    positionAndReveal()

    // Play on open — but hold the sweep until the caption is actually revealed
    // (fontReady), so the first words aren't swept away behind the font-load gate.
    // The slow path is started from onFontsReady; this covers the fonts-already-loaded
    // fast path (awaitFonts fired onFontsReady synchronously above).
    if (isOpen() && !isQuote() && fontReady) driver!.play()
    scheduleDwell()

    placed = true
  }

  function closeDown(): void {
    if (!placed) return
    if (fontGate) {
      fontGate.cancel()
      fontGate = null
    }
    if (driver) {
      driver.destroy()
      driver = null
    }
    clearDwellTimers()
    uninstallAnchorObservers()
    uninstallParentWidthObserver()
    if (renderer) {
      renderer.destroy()
      renderer = null
    }
    uninstallAudio()

    // Reset transient state so a reopen starts clean (mirrors the component's
    // reset-on-close: lastChunkIdxRef → 0, driver reset, unmount).
    prevState = null
    lastChunkIdx = 0
    activeIndex = -1
    anchorBox = null
    parentWidth = undefined
    wordWidths = []
    gapWidth = 0
    captionHeight = 0
    // NOTE: fontReady is intentionally NOT reset — fonts don't unload, so once the
    // gate has released it stays released across an open/close cycle (matches the
    // React component, whose fontReady state persisted the `open` toggle). Resetting
    // it made every loop re-run the font gate (and hit its 3s timeout), stalling the
    // reel. A genuine font change re-gates via the update() path instead.
    fadingOut = false
    placed = false
  }

  function onFontsReady(): void {
    fontReady = true
    // Re-measure width mode once metrics are real, then re-chunk + re-reveal.
    if (typeof resolvedBoxWidth() === "number") measureWidths()
    recomputeChunks()
    recomputeChunkIdx()
    commit()
    measureCaptionHeight()
    positionAndReveal()
    // Now that the caption is revealed, start the sweep from the first word —
    // quote mode via the reel re-drive, caption mode directly.
    driveQuoteSweep()
    if (isOpen() && !isQuote() && driver) driver.play()
  }

  // ── update (partial-options diff) ───────────────────────────────────────────
  function update(partial: Partial<CapicolaOptions>): void {
    if (destroyed) return
    const prev = o
    o = { ...o, ...partial }

    const wasOpen = prev.open ?? true
    const nowOpen = o.open ?? true

    // Open transitions mount/unmount the whole subtree.
    if (!wasOpen && nowOpen) {
      openUp()
      return
    }
    if (wasOpen && !nowOpen) {
      closeDown()
      return
    }
    if (!nowOpen) return // still closed — options are just stored
    if (!placed) {
      openUp()
      return
    }

    const placementChanged =
      (prev.placement ?? "anchored") !== (o.placement ?? "anchored")
    const anchorChanged = prev.anchorEl !== o.anchorEl
    const widthChanged = prev.width !== o.width
    const audioChanged = prev.audioSrc !== o.audioSrc
    const quoteCfgChanged =
      prev.mode !== o.mode || prev.quotes !== o.quotes || prev.quote !== o.quote

    // audioSrc change → the driver captured the old <audio> at creation, so recreate
    // both node and driver.
    if (audioChanged) {
      if (driver) {
        driver.destroy()
        driver = null
      }
      uninstallAudio()
      installAudio()
      createDriver()
    }

    const reinstallObservers = placementChanged || anchorChanged || widthChanged
    if (reinstallObservers) {
      uninstallAnchorObservers()
      uninstallParentWidthObserver()
    }
    // Placement flip → detach the root; the commit below rebuilds it (renderer.update
    // rebuilds when isAnchored differs), then it's re-placed under the new parent.
    if (placementChanged && renderer) renderer.rootEl.remove()

    recomputeTheme()
    recomputeWords()
    recomputeChunks()
    recomputeChunkIdx()
    commit()

    if (placementChanged && renderer) {
      if (isAnchored()) document.body.appendChild(renderer.rootEl)
      else mountEl.appendChild(renderer.rootEl)
    }

    if (reinstallObservers) {
      installAnchorObservers()
      installParentWidthObserver()
    }

    if (typeof resolvedBoxWidth() === "number") {
      measureWidths()
      recomputeChunks()
      recomputeChunkIdx()
      commit()
    }
    measureCaptionHeight()
    positionAndReveal()

    if (quoteCfgChanged) {
      driveQuoteSweep()
      scheduleDwell()
    }
  }

  // ── construct ───────────────────────────────────────────────────────────────
  if (isOpen()) openUp()

  return {
    play() {
      if (!destroyed) driver?.play()
    },
    pause() {
      if (!destroyed) driver?.pause()
    },
    update,
    destroy() {
      if (destroyed) return
      destroyed = true
      closeDown()
    },
  }
}
