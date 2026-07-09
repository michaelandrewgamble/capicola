import * as React from "react"

import { createCapicola } from "./engine/create-capicola"
import type {
  AnchorX,
  AnchorY,
  CadenceOptions,
  CaptionAlign,
  CaptionMode,
  CaptionPlacement,
  CaptionPreset,
  CaptionTheme,
  CaptionWidth,
  CapicolaInstance,
  CapicolaOptions,
  ChunkingOptions,
  Quote,
  QuoteOptions,
  WordTiming,
} from "./types"

/**
 * The React props surface for `<Capicola>`. Field-for-field the same as the
 * React-free `CapicolaOptions`, except the anchor is a React `RefObject`
 * (`anchorRef`) instead of a raw `HTMLElement` (`anchorEl`). This interface lives
 * in the React adapter — not the core `types.ts` — so the React-free core never
 * depends on the `react` module at the type level.
 */
export interface CapicolaProps {
  /** Mounts + plays when true; resets/hides when false. Default true. */
  open?: boolean
  /** Element the caption is positioned against. Required (and only used) when `placement="anchored"`. */
  anchorRef?: React.RefObject<HTMLElement | null>

  // ── Audio mode: provide BOTH audioSrc and words (e.g. from the caption CLI).
  audioSrc?: string
  words?: WordTiming[]

  // ── Cadence mode: provide text; per-word timings are computed from `cadence`.
  text?: string
  cadence?: CadenceOptions

  /** Where the caption renders: overlay anchored to `anchorRef`, or in-flow inline. Default "anchored". */
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
  /** Balance wrapped lines to the narrowest width that keeps the same line count (even
   *  lines, no orphan word); in quote mode it also starts each sentence on its own line.
   *  Needs a resolved `width` (`number` | `"parent"`). Default `false`. */
  balance?: boolean
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

// Re-export the public React-typed surface from the adapter entry so consumers can
// `import { Capicola, type CapicolaProps } from "capicola/react"`.
export type {
  CaptionTheme,
  CaptionPreset,
  CaptionPlacement,
  CaptionMode,
  Quote,
  QuoteOptions,
  CaptionData,
  WordTiming,
  CadenceOptions,
  AnchorX,
  AnchorY,
  ChunkingOptions,
  CaptionWidth,
  CaptionAlign,
} from "./types"

/** Map the React props onto the React-free engine options (`anchorRef` → `anchorEl`). */
function toOptions(props: CapicolaProps): CapicolaOptions {
  const { anchorRef, ...rest } = props
  return { ...rest, anchorEl: anchorRef?.current ?? null }
}

/**
 * The React adapter for the headless Capicola engine — a thin wrapper that mounts
 * `createCapicola` into a `display: contents` host and forwards prop changes via
 * `update`. The full behavior (word driver, positioning, font gate, quote reel) lives
 * in the engine; this component owns only the React lifecycle. SSR-safe: the engine is
 * created only inside an effect (never during render).
 */
export function Capicola(props: CapicolaProps) {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const instRef = React.useRef<CapicolaInstance | null>(null)
  // Keep the latest props for the create effect without retriggering it.
  const propsRef = React.useRef(props)
  propsRef.current = props

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const inst = createCapicola(host, toOptions(propsRef.current))
    instRef.current = inst
    return () => {
      inst.destroy()
      instRef.current = null
    }
    // Mount once — subsequent prop changes flow through the update effect below.
  }, [])

  React.useEffect(() => {
    // Read anchorRef.current at update time (it may have attached after mount).
    instRef.current?.update(toOptions(props))
  })

  return <div style={{ display: "contents" }} ref={hostRef} />
}
