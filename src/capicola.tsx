import * as React from "react"
import { createPortal } from "react-dom"

import { computeCadence } from "./cadence"
import { chunkWords, findChunkIndex } from "./chunking"
import { useAudioWordSync } from "./use-audio-word-sync"
import type {
  CaptionPreset,
  CaptionTheme,
  CapicolaProps,
  WordTiming,
} from "./types"

// useLayoutEffect logs a warning when run on the server (Next.js SSR/RSC). The
// caption only renders on the client, but this shim keeps the console clean for
// apps that import the component into a server-rendered tree.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect

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
 * Map a partial CaptionTheme onto `--cap-*` CSS custom properties.
 * Undefined values are omitted so the CSS defaults in capicola.css win.
 */
function themeToVars(theme: CaptionTheme): React.CSSProperties {
  const vars: Record<string, string> = {}

  if (theme.fontFamily !== undefined)
    vars["--cap-font-family"] = theme.fontFamily
  if (theme.fontWeight !== undefined)
    vars["--cap-font-weight"] = String(theme.fontWeight)
  if (theme.fontSizePx !== undefined)
    vars["--cap-font-size"] = `${theme.fontSizePx}px`
  if (theme.letterSpacingEm !== undefined)
    vars["--cap-letter-spacing"] = `${theme.letterSpacingEm}em`
  if (theme.textTransform !== undefined)
    vars["--cap-text-transform"] = theme.textTransform
  if (theme.textColor !== undefined)
    vars["--cap-text-color"] = theme.textColor

  if (theme.strokeColor !== undefined)
    vars["--cap-stroke-color"] = theme.strokeColor
  if (theme.strokeWidthPx !== undefined)
    vars["--cap-stroke-width"] = `${theme.strokeWidthPx}px`

  if (theme.shadowColor !== undefined)
    vars["--cap-shadow-color"] = theme.shadowColor
  if (theme.shadowBlurPx !== undefined)
    vars["--cap-shadow-blur"] = `${theme.shadowBlurPx}px`
  if (theme.shadowDistancePx !== undefined && theme.shadowAngleDeg !== undefined) {
    const rad = (theme.shadowAngleDeg * Math.PI) / 180
    vars["--cap-shadow-offset-x"] = `${Math.round(Math.cos(rad) * theme.shadowDistancePx)}px`
    vars["--cap-shadow-offset-y"] = `${Math.round(Math.sin(rad) * theme.shadowDistancePx)}px`
  } else if (theme.shadowDistancePx !== undefined) {
    vars["--cap-shadow-offset-y"] = `${theme.shadowDistancePx}px`
  }

  if (theme.highlightColor !== undefined)
    vars["--cap-highlight-color"] = theme.highlightColor
  if (theme.highlightTextColor !== undefined)
    vars["--cap-highlight-text-color"] = theme.highlightTextColor
  if (theme.highlightPaddingXPx !== undefined)
    vars["--cap-highlight-padding-x"] = `${theme.highlightPaddingXPx}px`
  if (theme.highlightPaddingYPx !== undefined)
    vars["--cap-highlight-padding-y"] = `${theme.highlightPaddingYPx}px`
  if (theme.highlightRadiusPx !== undefined)
    vars["--cap-highlight-radius"] = `${theme.highlightRadiusPx}px`
  if (theme.highlightOpacity !== undefined)
    vars["--cap-highlight-opacity"] = String(theme.highlightOpacity)

  if (theme.backgroundColor !== undefined)
    vars["--cap-background-color"] = theme.backgroundColor
  if (theme.backgroundPaddingXPx !== undefined)
    vars["--cap-background-padding-x"] = `${theme.backgroundPaddingXPx}px`
  if (theme.backgroundPaddingYPx !== undefined)
    vars["--cap-background-padding-y"] = `${theme.backgroundPaddingYPx}px`
  if (theme.backgroundRadiusPx !== undefined)
    vars["--cap-background-radius"] = `${theme.backgroundRadiusPx}px`

  if (theme.popScale !== undefined)
    vars["--cap-pop-scale"] = String(theme.popScale)
  if (theme.popDurationMs !== undefined)
    vars["--cap-pop-duration"] = `${theme.popDurationMs}ms`
  if (theme.popEasing !== undefined)
    vars["--cap-pop-easing"] = theme.popEasing

  if (theme.wordGapEm !== undefined)
    vars["--cap-word-gap"] = `${theme.wordGapEm}em`

  return vars as React.CSSProperties
}

// ─── Capicola ─────────────────────────────────────────────────────────

export function Capicola({
  open,
  anchorRef,
  audioSrc,
  words: wordsProp,
  text,
  cadence,
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
  // Resolve words: audio mode supplies words directly; cadence mode computes them.
  const resolvedWords = React.useMemo<WordTiming[]>(() => {
    if (wordsProp && wordsProp.length > 0) return wordsProp
    if (text) return computeCadence(text, cadence)
    return []
  }, [wordsProp, text, cadence])

  // Hidden audio element for audio mode.
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const hasAudio = Boolean(audioSrc)

  // The timing hook drives activeIndex.
  const { activeIndex, play, reset } = useAudioWordSync({
    open,
    words: resolvedWords,
    audioRef: hasAudio ? audioRef : undefined,
    onWordChange,
    onEnded,
  })

  // Holds the page shown during a punctuation beat (when activeIndex === -1)
  // so the caption doesn't snap back to page 0 every beat.
  const lastChunkIdxRef = React.useRef(0)

  // Play on open, reset on close.
  React.useEffect(() => {
    if (open) {
      play()
    } else {
      reset()
      lastChunkIdxRef.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Merge preset → appearance (appearance wins).
  const mergedTheme = React.useMemo<CaptionTheme>(
    () => ({ ...(preset ? PRESETS[preset] : null), ...appearance }),
    [preset, appearance],
  )
  const themeVars = React.useMemo(() => themeToVars(mergedTheme), [mergedTheme])

  // ── Box width resolution ────────────────────────────────────────────────────
  // "parent" tracks the anchorRef's PARENT element width (live); number = fixed
  // box width; "auto" = hug content (undefined → no explicit width).
  const [parentWidth, setParentWidth] = React.useState<number | undefined>(
    undefined,
  )
  React.useEffect(() => {
    if (!open || width !== "parent") return
    const parent = anchorRef.current?.parentElement ?? null
    if (!parent) return
    const update = () => setParentWidth(parent.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [open, width, anchorRef])

  const resolvedBoxWidth: number | undefined =
    typeof width === "number"
      ? width
      : width === "parent"
        ? parentWidth
        : undefined

  // ── Anchor rect (for manual 2-axis positioning) ─────────────────────────────
  const [anchorBox, setAnchorBox] = React.useState<DOMRect | null>(null)
  React.useEffect(() => {
    if (!open) return
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
  }, [open, anchorRef])

  // ── Width-mode measurement (real DOM widths of the actual font) ─────────────
  const measureRowRef = React.useRef<HTMLDivElement>(null)
  const [wordWidths, setWordWidths] = React.useState<number[]>([])
  const [gapWidth, setGapWidth] = React.useState(0)
  // Gate the caption until the webfont is loaded — avoids a flash of the fallback
  // face (FOUT). Kicked on mount (runs even while closed) so it's usually ready
  // before the first open; also re-measures width mode once metrics are real.
  const [fontReady, setFontReady] = React.useState(false)
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
    const family = (mergedTheme.fontFamily ?? "Barlow Condensed")
      .split(",")[0]
      .trim()
      .replace(/['"]/g, "")
      .toLowerCase()
    const wantWeight = Number(mergedTheme.fontWeight ?? 900)
    let alive = true
    let raf = 0
    const start = Date.now()

    const isReady = () => {
      try {
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
  }, [mergedTheme.fontFamily, mergedTheme.fontWeight])

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
    const measure =
      typeof resolvedBoxWidth === "number" &&
      wordWidths.length === resolvedWords.length
        ? { wordWidths, gapWidth, targetWidth: resolvedBoxWidth }
        : undefined
    return chunkWords(resolvedWords, chunking, measure)
  }, [resolvedWords, chunking, resolvedBoxWidth, wordWidths, gapWidth])

  // ── Caption size (for `auto` collision flipping) ────────────────────────────
  const rootElRef = React.useRef<HTMLDivElement | null>(null)
  const [captionHeight, setCaptionHeight] = React.useState(0)
  useIsomorphicLayoutEffect(() => {
    if (!open) return
    const el = rootElRef.current
    if (el) setCaptionHeight(el.getBoundingClientRect().height)
  }, [open, resolvedWords, themeVars, fontReady, resolvedBoxWidth])

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
  const oy = resolvedAnchorY === "top" ? -offset : resolvedAnchorY === "bottom" ? offset : 0

  const rootStyle: React.CSSProperties = {
    ...themeVars,
    ...(resolvedBoxWidth !== undefined ? { width: `${resolvedBoxWidth}px` } : null),
    justifyContent: justify,
    position: "fixed",
    left: px,
    top: py,
    transform: `translate(calc(${tx}% + ${ox}px), calc(${ty}% + ${oy}px)) translateZ(0)`,
    zIndex: 9999,
    // Hide until the webfont is ready AND the anchor is measured (no flash/jump).
    visibility: fontReady && anchorBox ? "visible" : "hidden",
  }

  // When a box width is set the page wraps to lines; otherwise it's a single row.
  const trackStyle: React.CSSProperties =
    resolvedBoxWidth !== undefined
      ? { width: "100%", flexWrap: "wrap", justifyContent: justify, rowGap: "0.12em" }
      : {}

  const caption = (
    <div
      ref={rootElRef}
      className={["cap-root", className].filter(Boolean).join(" ")}
      style={rootStyle}
      aria-live="polite"
      aria-atomic="false"
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

      {/* Visible page — keyed on chunk index so a new page fades in. */}
      <div className="cap-track" key={chunkIdx} data-chunk={chunkIdx} style={trackStyle}>
        {chunk.words.map((word, i) => {
          const globalIndex = chunk.startIndex + i
          const isActive = globalIndex === activeIndex
          return (
            <span
              key={`${globalIndex}-${word.text}`}
              className="cap-word"
              data-active={isActive ? "true" : "false"}
              aria-current={isActive ? "true" : undefined}
            >
              {word.text}
            </span>
          )
        })}
      </div>
    </div>
  )

  return (
    <>
      {/* Hidden audio element (audio mode only) */}
      {hasAudio && (
        <audio ref={audioRef} src={audioSrc} preload="auto" aria-hidden />
      )}
      {typeof document !== "undefined" && createPortal(caption, document.body)}
    </>
  )
}
