import type { CaptionPreset, CaptionTheme } from "./types"

// Quote-reel crossfade duration (ms): fade the finished quote out, swap, fade the
// next in. Kept in sync with the inline opacity transition on the caption root.
export const QUOTE_FADE_MS = 220

// ─── style presets (CapCut-style templates) ──────────────────────────────────
// Each is a full bundle of CaptionTheme tokens tuned to its reference sample;
// `appearance` merges on top. Tokens are orthogonal, so combining a preset with
// overrides always renders correctly. Fonts: box = Barlow Condensed; the rest use
// Inter (both already loaded — no new @fontsource install).
const INTER = "'Inter Variable', system-ui, sans-serif"
export const PRESETS: Record<CaptionPreset, CaptionTheme> = {
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
export function weightInFace(faceWeight: string, want: number): boolean {
  const parts = faceWeight
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
  if (parts.length === 2) return want >= parts[0] && want <= parts[1]
  if (parts.length === 1) return parts[0] === want
  return true
}

// ─── theme merge ──────────────────────────────────────────────────────────────

/**
 * Merge a preset → appearance (appearance wins). Mirrors the component's
 * `{ ...(preset ? PRESETS[preset] : null), ...appearance }` — an undefined preset
 * falls back to no base (the CSS defaults reproduce the reference "box" look).
 */
export function mergeTheme(
  preset?: CaptionPreset,
  appearance?: CaptionTheme,
): CaptionTheme {
  return { ...(preset ? PRESETS[preset] : null), ...appearance }
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
 *
 * Returns a plain `Record<string,string>` (React-free): the React wrapper spreads
 * it into a `style` object, the engine writes each entry via `el.style.setProperty`.
 */
export function themeToVars(theme: CaptionTheme, prefix = "cap"): Record<string, string> {
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

  return vars
}
