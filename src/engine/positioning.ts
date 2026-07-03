import type { AnchorX, AnchorY } from "../types"

/** The concrete vertical anchor after `auto` collision-flip resolution. */
export type ResolvedAnchorY = "top" | "middle" | "bottom"

/** Inputs for `computePosition` (pure — no DOM/window access). */
export interface ComputePositionInput {
  /** The anchor element's viewport rect. */
  anchorBox: DOMRect
  /** Measured caption height (for `auto` collision flipping). */
  captionHeight: number
  anchorX: AnchorX
  anchorY: AnchorY
  /** Gap (px) pushed outward for edge positions. */
  offset: number
  /** Viewport height (window.innerHeight), passed in to stay pure. */
  viewportHeight: number
}

/** Result of `computePosition` — the fixed-overlay placement for the caption root. */
export interface ComputePositionResult {
  left: number
  top: number
  /** The `transform` string (translate percentages + px offset + translateZ). */
  transform: string
  /** The vertical anchor actually used after `auto` resolution. */
  resolvedAnchorY: ResolvedAnchorY
}

/** Inputs for `resolveAnchorY` — the `auto` collision-flip decision (pure). */
export interface ResolveAnchorYInput {
  anchorBox: DOMRect | null
  captionHeight: number
  offset: number
  viewportHeight: number
}

/**
 * Resolve `auto` → prefer above, flip below when there's no room above the viewport
 * (and the reverse); non-`auto` values pass through unchanged. Falls back to "top"
 * until the anchor + caption height are measured.
 */
export function resolveAnchorY(
  anchorY: AnchorY,
  input: ResolveAnchorYInput,
): ResolvedAnchorY {
  if (anchorY !== "auto") return anchorY

  const { anchorBox, captionHeight, offset, viewportHeight } = input
  if (anchorBox && captionHeight > 0) {
    const need = captionHeight + offset
    const spaceAbove = anchorBox.top
    const spaceBelow = viewportHeight - anchorBox.bottom
    if (spaceAbove >= need) return "top"
    if (spaceBelow >= need) return "bottom"
    return spaceAbove >= spaceBelow ? "top" : "bottom"
  }
  return "top"
}

/**
 * Compute the fixed-overlay left/top/transform for the caption anchored against a
 * target rect, resolving `auto` vertical placement. Pure.
 *
 * Pins a point on the anchor (left/right/centre × top/bottom/middle) then translates
 * the caption so an edge/centre meets it: edges push the caption outside (offset
 * pushed outward), centres align.
 */
export function computePosition(input: ComputePositionInput): ComputePositionResult {
  const { anchorBox, captionHeight, anchorX, anchorY, offset, viewportHeight } = input

  const resolvedAnchorY = resolveAnchorY(anchorY, {
    anchorBox,
    captionHeight,
    offset,
    viewportHeight,
  })

  const px =
    anchorX === "left"
      ? anchorBox.left
      : anchorX === "right"
        ? anchorBox.right
        : anchorBox.left + anchorBox.width / 2
  const py =
    resolvedAnchorY === "top"
      ? anchorBox.top
      : resolvedAnchorY === "bottom"
        ? anchorBox.bottom
        : anchorBox.top + anchorBox.height / 2

  const tx = anchorX === "left" ? -100 : anchorX === "right" ? 0 : -50
  const ty = resolvedAnchorY === "top" ? -100 : resolvedAnchorY === "bottom" ? 0 : -50
  const ox = anchorX === "left" ? -offset : anchorX === "right" ? offset : 0
  const oy =
    resolvedAnchorY === "top" ? -offset : resolvedAnchorY === "bottom" ? offset : 0

  return {
    left: px,
    top: py,
    transform: `translate(calc(${tx}% + ${ox}px), calc(${ty}% + ${oy}px)) translateZ(0)`,
    resolvedAnchorY,
  }
}
