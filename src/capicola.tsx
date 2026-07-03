import * as React from "react"
import { createPortal } from "react-dom"

import { computeCadence } from "./cadence"
import { chunkWords, findChunkIndex } from "./chunking"
import { useAudioWordSync } from "./use-audio-word-sync"
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
} from "./quote-sequencer"
import type { CaptionPreset, CaptionTheme, CapicolaProps, WordTiming } from "./types"

// useLayoutEffect logs a warning when run on the server (Next.js SSR/RSC). The
// caption only renders on the client, but this shim keeps the console clean for
// apps that import the component into a server-rendered tree.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect

// Quote-reel crossfade duration (ms): fade the finished quote out, swap, fade the
// next in. Kept in sync with the inline opacity transition on the caption root.
const QUOTE_FADE_MS = 220

// ─── style presets (CapCut-style templates) ──────────────────────────────────
// Each is a full bundle of CaptionTheme tokens tuned to its reference sample;
// `appearance` merges on top. Tokens are orthogonal, so combining a preset with
// overrides always renders correctly. Fonts: box = Barlow Condensed; the rest use
// Inter (both already loaded — no new @fontsource install).
const INTER = "'Inter Variable', system-ui, sans-serif"
const PRESETS: Record<CaptionPreset, CaptionTheme> = {
  // Condensed heavy caps + pink box behind the active word (the signature look).
  box: {
    fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
    fontWeight: 900,
    fontSizePx: 30,
    letterSpacingEm: 0.02,
    wordGapEm: 0.62,
    textColor: "#ffffff",
    strokeColor: "rgba(0,0,0,0.95)",
    strokeWidthPx: 3,
    shadowColor: "rgba(0,0,0,0.55)",
    highlightColor: "linear-gradient(180deg, #E62E64 0%, #C4124C 100%)",
    highlightTextColor: "#ffffff",
  },
  // Heavy Inter, black outline; the active word recolours to gold — no box. Big + punchy.
  color: {
    fontFamily: INTER,
    fontWeight: 800,
    fontSizePx: 32,
    letterSpacingEm: 0,
    wordGapEm: 0.3,
    textColor: "#ffffff",
    strokeColor: "rgba(0,0,0,0.95)",
    strokeWidthPx: 3.5,
    shadowColor: "rgba(0,0,0,0.5)",
    highlightColor: "transparent",
    highlightTextColor: "#FFC53D",
  },
  // Clean semibold Inter, NO outline; a translucent dark bubble behind the line. Subtitle-sized.
  bubble: {
    fontFamily: INTER,
    fontWeight: 600,
    fontSizePx: 21,
    letterSpacingEm: 0,
    wordGapEm: 0.26,
    textColor: "#ffffff",
    strokeColor: "transparent",
    strokeWidthPx: 0,
    shadowColor: "transparent",
    highlightColor: "transparent",
    highlightTextColor: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.6)",
    backgroundPaddingXPx: 14,
    backgroundPaddingYPx: 6,
    backgroundRadiusPx: 8,
  },
  // Heavy Inter, black outline, no per-word highlight at all. Big + punchy.
  plain: {
    fontFamily: INTER,
    fontWeight: 800,
    fontSizePx: 32,
    letterSpacingEm: 0,
    wordGapEm: 0.3,
    textColor: "#ffffff",
    strokeColor: "rgba(0,0,0,0.95)",
    strokeWidthPx: 3.5,
    shadowColor: "rgba(0,0,0,0.5)",
    highlightColor: "transparent",
    highlightTextColor: "#ffffff",
    popScale: 1,
  },
}

/** Match a wanted numeric weight against a FontFace weight (single or "min max" range). */
function weightInFace(faceWeight: string, want: number): boolean {
  const parts = faceWeight
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
  if (parts.length === 2) return want >= parts[0] && want <= parts[1]
  if (parts.length === 1) return parts[0] === want
  return true
}

// ─── theme → CSS variables ────────────────────────────────────────────────────

/**
 * Map a partial CaptionTheme onto `--${prefix}-*` CSS custom properties.
 * Undefined values are omitted so the CSS defaults in capicola.css win.
 *
 * `prefix` lets the same mapping drive parallel token families: the caption uses
 * the default `"cap"` (→ `--cap-*`); the quote author uses `"cap-author"`
 * (→ `--cap-author-*`), so author styling is themed with the identical token
 * shape without colliding with the main caption vars.
 */
function themeToVars(theme: CaptionTheme, prefix = "cap"): React.CSSProperties {
  const vars: Record<string, string> = {}
  const p = `--${prefix}`

  if (theme.fontFamily !== undefined) vars[`${p}-font-family`] = theme.fontFamily
  if (theme.fontWeight !== undefined) vars[`${p}-font-weight`] = String(theme.fontWeight)
  if (theme.fontSizePx !== undefined) vars[`${p}-font-size`] = `${theme.fontSizePx}px`
  if (theme.letterSpacingEm !== undefined)
    vars[`${p}-letter-spacing`] = `${theme.letterSpacingEm}em`
  if (theme.textTransform !== undefined) vars[`${p}-text-transform`] = theme.textTransform
  if (theme.textColor !== undefined) vars[`${p}-text-color`] = theme.textColor

  if (theme.strokeColor !== undefined) vars[`${p}-stroke-color`] = theme.strokeColor
  if (theme.strokeWidthPx !== undefined)
    vars[`${p}-stroke-width`] = `${theme.strokeWidthPx}px`

  if (theme.shadowColor !== undefined) vars[`${p}-shadow-color`] = theme.shadowColor
  if (theme.shadowBlurPx !== undefined)
    vars[`${p}-shadow-blur`] = `${theme.shadowBlurPx}px`
  if (theme.shadowDistancePx !== undefined && theme.shadowAngleDeg !== undefined) {
    const rad = (theme.shadowAngleDeg * Math.PI) / 180
    vars[`${p}-shadow-offset-x`] =
      `${Math.round(Math.cos(rad) * theme.shadowDistancePx)}px`
    vars[`${p}-shadow-offset-y`] =
      `${Math.round(Math.sin(rad) * theme.shadowDistancePx)}px`
  } else if (theme.shadowDistancePx !== undefined) {
    vars[`${p}-shadow-offset-y`] = `${theme.shadowDistancePx}px`
  }

  if (theme.highlightColor !== undefined)
    vars[`${p}-highlight-color`] = theme.highlightColor
  if (theme.highlightTextColor !== undefined)
    vars[`${p}-highlight-text-color`] = theme.highlightTextColor
  if (theme.highlightPaddingXPx !== undefined)
    vars[`${p}-highlight-padding-x`] = `${theme.highlightPaddingXPx}px`
  if (theme.highlightPaddingYPx !== undefined)
    vars[`${p}-highlight-padding-y`] = `${theme.highlightPaddingYPx}px`
  if (theme.highlightRadiusPx !== undefined)
    vars[`${p}-highlight-radius`] = `${theme.highlightRadiusPx}px`
  if (theme.highlightOpacity !== undefined)
    vars[`${p}-highlight-opacity`] = String(theme.highlightOpacity)

  if (theme.backgroundColor !== undefined)
    vars[`${p}-background-color`] = theme.backgroundColor
  if (theme.backgroundPaddingXPx !== undefined)
    vars[`${p}-background-padding-x`] = `${theme.backgroundPaddingXPx}px`
  if (theme.backgroundPaddingYPx !== undefined)
    vars[`${p}-background-padding-y`] = `${theme.backgroundPaddingYPx}px`
  if (theme.backgroundRadiusPx !== undefined)
    vars[`${p}-background-radius`] = `${theme.backgroundRadiusPx}px`

  if (theme.popScale !== undefined) vars[`${p}-pop-scale`] = String(theme.popScale)
  if (theme.popDurationMs !== undefined)
    vars[`${p}-pop-duration`] = `${theme.popDurationMs}ms`
  if (theme.popEasing !== undefined) vars[`${p}-pop-easing`] = theme.popEasing

  if (theme.wordGapEm !== undefined) vars[`${p}-word-gap`] = `${theme.wordGapEm}em`

  return vars as React.CSSProperties
}

// ─── Capicola ─────────────────────────────────────────────────────────

export function Capicola({
  open = true,
  anchorRef,
  audioSrc,
  words: wordsProp,
  text,
  cadence,
  placement = "anchored",
  mode = "caption",
  quotes,
  authorAppearance,
  quote,
  chunking,
  width = "auto",
  align = "center",
  anchorX = "center",
  anchorY = "top",
  offset = 8,
  preset,
  appearance,
  onWordChange,
  onEnded,
  className,
}: CapicolaProps) {
  // Placement: "anchored" is the classic fixed overlay positioned against
  // `anchorRef`; "inline" is a normal in-flow block. All anchor-coupled effects
  // and positioning below are gated on `isAnchored && anchorRef` so the inline
  // path never touches the (optional) ref. `mode` is consumed by later phases;
  // the engine (word track/measure/chunk/theme) is identical for both.
  const isAnchored = placement === "anchored"
  const isQuote = mode === "quote"

  // ── Quote reel config (mode="quote") ────────────────────────────────────────
  // Extracted to primitives so the timers/effects below don't re-run when a parent
  // re-renders with a fresh `quote` object carrying identical values.
  const quoteCount = quotes?.length ?? 0
  const loop = quote?.loop ?? true
  const authorPauseMs = quote?.authorPauseMs ?? 1600
  const loopPauseMs = quote?.loopPauseMs ?? authorPauseMs
  const openQuoteMark = quote?.openQuote ?? DEFAULT_OPEN_QUOTE
  const closeQuoteMark = quote?.closeQuote ?? DEFAULT_CLOSE_QUOTE
  const authorSeparator = quote?.authorSeparator ?? DEFAULT_AUTHOR_SEPARATOR

  // The reel's two-phase state: which quote is on screen, sweeping vs. author dwell.
  const [seq, setSeq] = React.useState(initialQuoteState)
  const activeQuote = isQuote ? quotes?.[seq.quoteIndex] : undefined
  // Crossfade: fade the finished quote OUT, swap while hidden, fade the next IN.
  const [fadingOut, setFadingOut] = React.useState(false)
  // Webfont-ready gate (set by the effect below). Declared up here so the quote
  // re-drive effect can hold the sweep until the caption is actually revealed.
  const [fontReady, setFontReady] = React.useState(false)

  // Resolve words: quote mode sweeps the active quote's BODY only (author excluded);
  // audio mode supplies words directly; cadence mode computes them from `text`.
  const resolvedWords = React.useMemo<WordTiming[]>(() => {
    if (isQuote) {
      const q = quotes?.[seq.quoteIndex]
      return q ? quoteWords(q, cadence) : []
    }
    if (wordsProp && wordsProp.length > 0) return wordsProp
    if (text) return computeCadence(text, cadence)
    return []
  }, [isQuote, quotes, seq.quoteIndex, wordsProp, text, cadence])

  // Hidden audio element for audio mode.
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const hasAudio = Boolean(audioSrc)

  // In quote mode, a finished word sweep advances the reel into the author dwell
  // (advanceOnEnded); the user's onEnded still fires per-quote. In caption mode this
  // is just the user's onEnded, unchanged.
  const handleEnded = React.useCallback(() => {
    if (isQuote) setSeq((s) => advanceOnEnded(s, quoteCount, loop))
    onEnded?.()
  }, [isQuote, quoteCount, loop, onEnded])

  // The timing hook drives activeIndex.
  const { activeIndex, play, reset } = useAudioWordSync({
    open,
    words: resolvedWords,
    audioRef: hasAudio ? audioRef : undefined,
    onWordChange,
    onEnded: handleEnded,
  })

  // Holds the page shown during a punctuation beat (when activeIndex === -1)
  // so the caption doesn't snap back to page 0 every beat.
  const lastChunkIdxRef = React.useRef(0)

  // Play on open, reset on close. Quote mode drives play() from the re-drive effect
  // below (keyed on the active quote) so the sweep restarts on the freshly rendered
  // word track; here we own only the caption-mode autoplay + the shared reset-on-close.
  React.useEffect(() => {
    if (open) {
      if (!isQuote) play()
    } else {
      reset()
      lastChunkIdxRef.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Quote reel — author read-pause. Once a sweep finishes (phase "dwelling"), hold on
  // the author for authorPauseMs (loopPauseMs before wrapping from the last quote),
  // then advance. `done` (loop:false on the last quote) freezes the reel.
  React.useEffect(() => {
    if (!isQuote || !open || seq.phase !== "dwelling") return
    // Freeze on the last quote when not looping — no advance, no fade.
    if (advanceAfterDwell(seq, quoteCount, loop).done) return
    const isLast = seq.quoteIndex >= Math.max(1, quoteCount) - 1
    const pauseMs = isLast ? loopPauseMs : authorPauseMs
    let swapTimer: ReturnType<typeof setTimeout> | undefined
    // 1) hold on the author, 2) fade the finished quote OUT, 3) swap while hidden
    // and fade the next quote IN — a real crossfade, not a hard cut.
    const dwellTimer = setTimeout(() => {
      setFadingOut(true)
      swapTimer = setTimeout(() => {
        setSeq((s) => advanceAfterDwell(s, quoteCount, loop).next)
        setFadingOut(false)
      }, QUOTE_FADE_MS)
    }, pauseMs)
    return () => {
      clearTimeout(dwellTimer)
      if (swapTimer) clearTimeout(swapTimer)
    }
  }, [isQuote, open, seq, quoteCount, loop, authorPauseMs, loopPauseMs])

  // Quote reel — sweep re-drive (the race fix). Runs AFTER the commit in which
  // `resolvedWords` was recomputed for the new quote, so reset()+play() always start
  // the hook on the freshly rendered word track — never play() in the same tick that
  // bumps quoteIndex. Guarded on "sweeping" so it starts each new quote AND restarts a
  // single-quote self-loop (dwelling→sweeping at the same index), while the
  // sweep→dwell transition stays a no-op.
  React.useEffect(() => {
    // Hold the sweep until the caption is actually revealed (fontReady), so the
    // first quote's sweep isn't spent behind the FOUT gate.
    if (!isQuote || !open || !fontReady || seq.phase !== "sweeping") return
    reset()
    play()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuote, open, fontReady, seq.quoteIndex, seq.phase])

  // Merge preset → appearance (appearance wins).
  const mergedTheme = React.useMemo<CaptionTheme>(
    () => ({ ...(preset ? PRESETS[preset] : null), ...appearance }),
    [preset, appearance],
  )
  const themeVars = React.useMemo(() => themeToVars(mergedTheme), [mergedTheme])
  // Quote-mode author styling → parallel --cap-author-* vars (same token shape as
  // the caption). Empty object when no override, so the CSS defaults win. Consumed
  // by the author render in a later phase.
  const authorVars = React.useMemo<React.CSSProperties>(
    () => (authorAppearance ? themeToVars(authorAppearance, "cap-author") : {}),
    [authorAppearance],
  )

  // ── Box width resolution ────────────────────────────────────────────────────
  // "parent" tracks the anchorRef's PARENT element width (live); number = fixed
  // box width; "auto" = hug content (undefined → no explicit width).
  const [parentWidth, setParentWidth] = React.useState<number | undefined>(undefined)
  React.useEffect(() => {
    if (!open || width !== "parent" || !isAnchored || !anchorRef) return
    const parent = anchorRef.current?.parentElement ?? null
    if (!parent) return
    const update = () => setParentWidth(parent.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [open, width, isAnchored, anchorRef])

  const resolvedBoxWidth: number | undefined =
    typeof width === "number" ? width : width === "parent" ? parentWidth : undefined

  // ── Anchor rect (for manual 2-axis positioning) ─────────────────────────────
  const [anchorBox, setAnchorBox] = React.useState<DOMRect | null>(null)
  React.useEffect(() => {
    if (!open || !isAnchored || !anchorRef) return
    const el = anchorRef.current
    if (!el) return
    const update = () => setAnchorBox(el.getBoundingClientRect())
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    // capture scroll so the caption tracks the anchor as ancestors scroll
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [open, isAnchored, anchorRef])

  // ── Width-mode measurement (real DOM widths of the actual font) ─────────────
  const measureRowRef = React.useRef<HTMLDivElement>(null)
  const [wordWidths, setWordWidths] = React.useState<number[]>([])
  const [gapWidth, setGapWidth] = React.useState(0)
  // Gate the caption until the webfont is loaded — avoids a flash of the fallback
  // face (FOUT). Kicked on mount (runs even while closed) so it's usually ready
  // before the first open; also re-measures width mode once metrics are real.
  // (fontReady state is declared near the top so the quote re-drive can gate on it.)
  React.useEffect(() => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    if (!fonts) {
      setFontReady(true)
      return
    }
    // Gate on the actual FontFace status, not fonts.check(): on a cold load the
    // effect can run BEFORE the @font-face is registered (CSS still parsing), and
    // fonts.check() then returns true ("no matching face → system fallback is
    // fine"), releasing the gate one frame too early → the FOUT you see. So we
    // wait until the specific face is both registered AND loaded.
    const normFamily = (fam: string) =>
      fam.split(",")[0].trim().replace(/['"]/g, "").toLowerCase()

    // The caption face is always awaited. In quote mode the author is styled via
    // `authorAppearance`; when it uses a DIFFERENT family/weight the author renders
    // in its own webfont, so gate on that face too — otherwise the author flashes
    // its fallback while the quote text is already sharp. Only a distinct target is
    // added (same family+weight ⇒ already covered).
    const targets: { family: string; weight: number }[] = [
      {
        family: normFamily(mergedTheme.fontFamily ?? "Barlow Condensed"),
        weight: Number(mergedTheme.fontWeight ?? 900),
      },
    ]
    if (
      authorAppearance &&
      (authorAppearance.fontFamily !== undefined ||
        authorAppearance.fontWeight !== undefined)
    ) {
      const authorFamily = normFamily(
        authorAppearance.fontFamily ?? mergedTheme.fontFamily ?? "Barlow Condensed",
      )
      const authorWeight = Number(
        authorAppearance.fontWeight ?? mergedTheme.fontWeight ?? 900,
      )
      if (authorFamily !== targets[0].family || authorWeight !== targets[0].weight) {
        targets.push({ family: authorFamily, weight: authorWeight })
      }
    }

    let alive = true
    let raf = 0
    const start = Date.now()

    // A single target family+weight is loaded (kicking off unloaded faces).
    const faceReady = (family: string, wantWeight: number) => {
      const faces: FontFace[] = []
      fonts.forEach((ff) => {
        if (ff.family.replace(/['"]/g, "").toLowerCase() === family) faces.push(ff)
      })
      if (faces.length === 0) return false // family not registered yet
      // Prefer the requested weight; if that weight isn't available (e.g. a
      // single-weight font like Anton at 900), accept ANY loaded face of the
      // family — the browser faux-bolds. Kick off loads for the relevant ones.
      const exact = faces.filter((ff) => weightInFace(ff.weight, wantWeight))
      const relevant = exact.length ? exact : faces
      for (const ff of relevant) {
        if (ff.status === "unloaded") {
          try {
            void ff.load()
          } catch {
            /* ignore */
          }
        }
      }
      return relevant.some((ff) => ff.status === "loaded")
    }

    const isReady = () => {
      try {
        return targets.every((t) => faceReady(t.family, t.weight))
      } catch {
        return false
      }
    }

    const poll = () => {
      if (!alive) return
      // 3s safety: never leave the caption invisible forever.
      if (isReady() || Date.now() - start > 3000) {
        setFontReady(true)
        return
      }
      raf = requestAnimationFrame(poll)
    }
    poll()

    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
    // Depend on the scalar font family/weight of the quote + author, not the
    // authorAppearance object identity (which changes every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mergedTheme.fontFamily,
    mergedTheme.fontWeight,
    authorAppearance?.fontFamily,
    authorAppearance?.fontWeight,
  ])

  useIsomorphicLayoutEffect(() => {
    if (!open || resolvedBoxWidth === undefined) return
    const row = measureRowRef.current
    if (!row) return
    const spans = Array.from(row.querySelectorAll<HTMLElement>(".cap-word"))
    setWordWidths(spans.map((s) => s.getBoundingClientRect().width))
    const cs = getComputedStyle(row)
    const g = parseFloat(cs.columnGap || cs.gap || "0")
    setGapWidth(Number.isNaN(g) ? 0 : g)
  }, [open, resolvedWords, themeVars, fontReady, resolvedBoxWidth])

  // ── Chunk into pages ────────────────────────────────────────────────────────
  const chunks = React.useMemo(() => {
    // Quote mode forces the WHOLE quote onto one page (QUOTE_CHUNKING) and skips
    // width-mode measurement so it can never split — the highlight sweeps one chunk.
    const measure =
      !isQuote &&
      typeof resolvedBoxWidth === "number" &&
      wordWidths.length === resolvedWords.length
        ? { wordWidths, gapWidth, targetWidth: resolvedBoxWidth }
        : undefined
    return chunkWords(resolvedWords, isQuote ? QUOTE_CHUNKING : chunking, measure)
  }, [isQuote, resolvedWords, chunking, resolvedBoxWidth, wordWidths, gapWidth])

  // ── Caption size (for `auto` collision flipping) ────────────────────────────
  const rootElRef = React.useRef<HTMLDivElement | null>(null)
  const [captionHeight, setCaptionHeight] = React.useState(0)
  useIsomorphicLayoutEffect(() => {
    if (!open || !isAnchored || !anchorRef) return
    const el = rootElRef.current
    if (el) setCaptionHeight(el.getBoundingClientRect().height)
  }, [open, isAnchored, anchorRef, resolvedWords, themeVars, fontReady, resolvedBoxWidth])

  // During a beat (activeIndex === -1) hold the current page instead of snapping
  // to page 0; only recompute the page when a word is actually active.
  let chunkIdx: number
  if (activeIndex >= 0 && chunks.length > 0) {
    chunkIdx = findChunkIndex(chunks, activeIndex)
    lastChunkIdxRef.current = chunkIdx
  } else {
    chunkIdx = Math.min(lastChunkIdxRef.current, Math.max(0, chunks.length - 1))
  }
  const chunk = chunks[chunkIdx] ?? { startIndex: 0, words: [] as WordTiming[] }

  // Don't render anything when closed.
  if (!open) return null

  const justify =
    align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"
  // Quote mode stacks the quote over the author (column) and aligns them on the cross
  // axis; caption mode keeps the classic single-axis row justification.
  const alignmentStyle: React.CSSProperties = isQuote
    ? { flexDirection: "column", alignItems: justify }
    : { justifyContent: justify }

  // Quote-reel crossfade: the whole caption (quote + author) fades out/in around
  // each reel step. opacity-only → compositor-safe, honours the anti-jitter contract.
  const quoteCrossfadeStyle: React.CSSProperties = {
    opacity: fadingOut ? 0 : 1,
    transition: `opacity ${QUOTE_FADE_MS}ms var(--cap-quote-transition-easing, ease)`,
  }

  // ── 2-axis anchor positioning ───────────────────────────────────────────────
  // Resolve `auto` → prefer above, flip below when there's no room above (and the
  // reverse), recomputing as the anchor scrolls. Falls back to above until measured.
  const resolvedAnchorY: "top" | "middle" | "bottom" =
    anchorY !== "auto"
      ? anchorY
      : anchorBox && captionHeight > 0
        ? (() => {
            const need = captionHeight + offset
            const spaceAbove = anchorBox.top
            const spaceBelow =
              (typeof window !== "undefined" ? window.innerHeight : 0) - anchorBox.bottom
            if (spaceAbove >= need) return "top"
            if (spaceBelow >= need) return "bottom"
            return spaceAbove >= spaceBelow ? "top" : "bottom"
          })()
        : "top"

  // Pin a point on the anchor, then translate the caption so an edge/centre meets
  // it: edges push the caption outside (above/below/left/right), centres align.
  const px = anchorBox
    ? anchorX === "left"
      ? anchorBox.left
      : anchorX === "right"
        ? anchorBox.right
        : anchorBox.left + anchorBox.width / 2
    : 0
  const py = anchorBox
    ? resolvedAnchorY === "top"
      ? anchorBox.top
      : resolvedAnchorY === "bottom"
        ? anchorBox.bottom
        : anchorBox.top + anchorBox.height / 2
    : 0
  const tx = anchorX === "left" ? -100 : anchorX === "right" ? 0 : -50
  const ty = resolvedAnchorY === "top" ? -100 : resolvedAnchorY === "bottom" ? 0 : -50
  const ox = anchorX === "left" ? -offset : anchorX === "right" ? offset : 0
  const oy =
    resolvedAnchorY === "top" ? -offset : resolvedAnchorY === "bottom" ? offset : 0

  const rootStyle: React.CSSProperties = isAnchored
    ? {
        // Anchored overlay: fixed + positioned against the anchor rect. Hidden
        // until the webfont is ready AND the anchor is measured (no flash/jump).
        ...themeVars,
        ...authorVars,
        ...(resolvedBoxWidth !== undefined ? { width: `${resolvedBoxWidth}px` } : null),
        ...alignmentStyle,
        position: "fixed",
        left: px,
        top: py,
        transform: `translate(calc(${tx}% + ${ox}px), calc(${ty}% + ${oy}px)) translateZ(0)`,
        zIndex: 9999,
        visibility: fontReady && anchorBox ? "visible" : "hidden",
        ...(isQuote ? quoteCrossfadeStyle : null),
      }
    : {
        // Inline block: no positioning/transform (handled by .cap-root--inline);
        // it flows where <Capicola> sits. Only gate on the webfont, never the anchor.
        ...themeVars,
        ...authorVars,
        ...(resolvedBoxWidth !== undefined ? { width: `${resolvedBoxWidth}px` } : null),
        ...alignmentStyle,
        visibility: fontReady ? "visible" : "hidden",
        ...(isQuote ? quoteCrossfadeStyle : null),
      }

  // When a box width is set the page wraps to lines; otherwise it's a single row.
  const trackStyle: React.CSSProperties =
    resolvedBoxWidth !== undefined
      ? { width: "100%", flexWrap: "wrap", justifyContent: justify, rowGap: "0.12em" }
      : {}

  // Expose the full caption to assistive tech as a single accessible name,
  // rather than a chatty aria-live region that re-announces each word/page as
  // the highlight sweeps. Callers should still caption the underlying media
  // through the normal accessible channels; this is a visual enhancement.
  // Quote mode reads as "quote — author" so assistive tech hears the attribution too.
  const captionText = isQuote
    ? activeQuote
      ? [activeQuote.text, activeQuote.author].filter(Boolean).join(" — ")
      : ""
    : resolvedWords.map((w) => w.text).join(" ")

  const caption = (
    <div
      ref={rootElRef}
      className={["cap-root", isAnchored ? null : "cap-root--inline", className]
        .filter(Boolean)
        .join(" ")}
      style={rootStyle}
      role="group"
      aria-label={captionText}
    >
      {/* Hidden measuring row (whenever a box width is set): all words at full
          styling so we can read real per-word widths for line-packing. */}
      {resolvedBoxWidth !== undefined && (
        <div ref={measureRowRef} className="cap-track cap-measure" aria-hidden>
          {resolvedWords.map((word, i) => (
            <span key={`m-${i}-${word.text}`} className="cap-word" data-active="false">
              {word.text}
            </span>
          ))}
        </div>
      )}

      {/* Visible page. Caption mode keys on chunk index (page fade); quote mode uses a
          stable key — the reel crossfade is driven by the root opacity above, and the
          words swap in place while hidden. The words are a visual presentation of the
          group's aria-label, so they're hidden from assistive tech. */}
      <div
        className={isQuote ? "cap-track cap-track--quote" : "cap-track"}
        key={isQuote ? "quote" : chunkIdx}
        data-chunk={chunkIdx}
        style={trackStyle}
        aria-hidden
      >
        {/* Decorative opening quotation mark — never part of the swept word track. */}
        {isQuote && openQuoteMark !== "" && (
          <span className="cap-word" data-active="false" aria-hidden>
            {openQuoteMark}
          </span>
        )}
        {chunk.words.map((word, i) => {
          const globalIndex = chunk.startIndex + i
          const isActive = globalIndex === activeIndex
          return (
            <span
              key={`${globalIndex}-${word.text}`}
              className="cap-word"
              data-active={isActive ? "true" : "false"}
            >
              {word.text}
            </span>
          )
        })}
        {/* Decorative closing quotation mark — never part of the swept word track. */}
        {isQuote && closeQuoteMark !== "" && (
          <span className="cap-word" data-active="false" aria-hidden>
            {closeQuoteMark}
          </span>
        )}
      </div>

      {/* Quote author attribution — its own static element (never in the swept word
          track), so the highlight can NEVER land on it. data-active mirrors the reel
          phase; the leading separator is composed via the pure helper ("" ⇒ none). */}
      {isQuote && activeQuote?.author && (
        <div className="cap-author" data-active={seq.phase} aria-hidden>
          <span className="cap-author-word">
            {composeAuthor(activeQuote.author, authorSeparator)}
          </span>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Hidden audio element (audio mode only) */}
      {hasAudio && <audio ref={audioRef} src={audioSrc} preload="auto" aria-hidden />}
      {/* Anchored: portal into document.body as a fixed overlay. Inline: render
          the caption in-flow, right where <Capicola> sits in the tree. */}
      {isAnchored
        ? typeof document !== "undefined" && createPortal(caption, document.body)
        : caption}
    </>
  )
}
