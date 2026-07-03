import { describe, expect, it } from "vitest"
import { computePosition, resolveAnchorY } from "./positioning"

// Node env has no DOMRect — build a plain object with the fields the pure math
// reads (left/right/top/bottom/width/height) and cast to DOMRect.
function rect(r: { left: number; top: number; width: number; height: number }): DOMRect {
  const { left, top, width, height } = r
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {
      return this
    },
  } as DOMRect
}

const VIEWPORT = 1000

describe("resolveAnchorY", () => {
  it("passes non-auto values through unchanged", () => {
    const input = {
      anchorBox: rect({ left: 0, top: 0, width: 10, height: 10 }),
      captionHeight: 50,
      offset: 8,
      viewportHeight: VIEWPORT,
    }
    expect(resolveAnchorY("top", input)).toBe("top")
    expect(resolveAnchorY("middle", input)).toBe("middle")
    expect(resolveAnchorY("bottom", input)).toBe("bottom")
  })

  it("falls back to 'top' when the anchor is not yet measured", () => {
    expect(
      resolveAnchorY("auto", {
        anchorBox: null,
        captionHeight: 50,
        offset: 8,
        viewportHeight: VIEWPORT,
      }),
    ).toBe("top")
  })

  it("falls back to 'top' when the caption height is not yet measured", () => {
    expect(
      resolveAnchorY("auto", {
        anchorBox: rect({ left: 0, top: 10, width: 100, height: 40 }),
        captionHeight: 0,
        offset: 8,
        viewportHeight: VIEWPORT,
      }),
    ).toBe("top")
  })

  it("prefers 'top' when there is room above (auto)", () => {
    // top=500 → spaceAbove=500 ≥ need(60) → top
    expect(
      resolveAnchorY("auto", {
        anchorBox: rect({ left: 0, top: 500, width: 100, height: 40 }),
        captionHeight: 52,
        offset: 8,
        viewportHeight: VIEWPORT,
      }),
    ).toBe("top")
  })

  it("flips to 'bottom' when there is no room above but room below (auto)", () => {
    // top=20 → spaceAbove=20 < need(60); bottom=60 → spaceBelow=940 ≥ 60 → bottom
    expect(
      resolveAnchorY("auto", {
        anchorBox: rect({ left: 0, top: 20, width: 100, height: 40 }),
        captionHeight: 52,
        offset: 8,
        viewportHeight: VIEWPORT,
      }),
    ).toBe("bottom")
  })

  it("picks the larger gap when neither side fits (auto) — more room below", () => {
    // Tall caption: need=940. anchor near top: spaceAbove=100, spaceBelow=860 → bottom
    expect(
      resolveAnchorY("auto", {
        anchorBox: rect({ left: 0, top: 100, width: 100, height: 40 }),
        captionHeight: 932,
        offset: 8,
        viewportHeight: VIEWPORT,
      }),
    ).toBe("bottom")
  })

  it("picks the larger gap when neither side fits (auto) — more room above", () => {
    // Tall caption: need=940. anchor near bottom: spaceAbove=860, spaceBelow=100 → top
    expect(
      resolveAnchorY("auto", {
        anchorBox: rect({ left: 0, top: 860, width: 100, height: 40 }),
        captionHeight: 932,
        offset: 8,
        viewportHeight: VIEWPORT,
      }),
    ).toBe("top")
  })

  it("prefers 'top' on an exact tie when neither side fits (auto)", () => {
    // spaceAbove === spaceBelow, neither fits → spaceAbove >= spaceBelow → top
    expect(
      resolveAnchorY("auto", {
        anchorBox: rect({ left: 0, top: 480, width: 100, height: 40 }),
        captionHeight: 992,
        offset: 8,
        viewportHeight: VIEWPORT,
      }),
    ).toBe("top")
  })
})

describe("computePosition — horizontal (anchorX)", () => {
  const box = rect({ left: 200, top: 500, width: 100, height: 40 })
  const base = {
    anchorBox: box,
    captionHeight: 52,
    anchorY: "top" as const,
    offset: 8,
    viewportHeight: VIEWPORT,
  }

  it("left: pins the left edge, translates fully left, offset pushed outward", () => {
    const p = computePosition({ ...base, anchorX: "left" })
    expect(p.left).toBe(200) // anchorBox.left
    expect(p.transform).toBe(
      "translate(calc(-100% + -8px), calc(-100% + -8px)) translateZ(0)",
    )
  })

  it("center: pins the horizontal centre, translates half left, no horizontal offset", () => {
    const p = computePosition({ ...base, anchorX: "center" })
    expect(p.left).toBe(250) // left + width/2
    expect(p.transform).toBe(
      "translate(calc(-50% + 0px), calc(-100% + -8px)) translateZ(0)",
    )
  })

  it("right: pins the right edge, no left translate, offset pushed outward", () => {
    const p = computePosition({ ...base, anchorX: "right" })
    expect(p.left).toBe(300) // anchorBox.right
    expect(p.transform).toBe(
      "translate(calc(0% + 8px), calc(-100% + -8px)) translateZ(0)",
    )
  })
})

describe("computePosition — vertical (anchorY)", () => {
  const box = rect({ left: 200, top: 500, width: 100, height: 40 })
  const base = {
    anchorBox: box,
    captionHeight: 52,
    anchorX: "center" as const,
    offset: 8,
    viewportHeight: VIEWPORT,
  }

  it("top: pins the top edge, translates fully up, offset pushed outward", () => {
    const p = computePosition({ ...base, anchorY: "top" })
    expect(p.top).toBe(500) // anchorBox.top
    expect(p.resolvedAnchorY).toBe("top")
    expect(p.transform).toBe(
      "translate(calc(-50% + 0px), calc(-100% + -8px)) translateZ(0)",
    )
  })

  it("middle: pins the vertical centre, translates half up, no vertical offset", () => {
    const p = computePosition({ ...base, anchorY: "middle" })
    expect(p.top).toBe(520) // top + height/2
    expect(p.resolvedAnchorY).toBe("middle")
    expect(p.transform).toBe(
      "translate(calc(-50% + 0px), calc(-50% + 0px)) translateZ(0)",
    )
  })

  it("bottom: pins the bottom edge, no up translate, offset pushed outward", () => {
    const p = computePosition({ ...base, anchorY: "bottom" })
    expect(p.top).toBe(540) // anchorBox.bottom
    expect(p.resolvedAnchorY).toBe("bottom")
    expect(p.transform).toBe("translate(calc(-50% + 0px), calc(0% + 8px)) translateZ(0)")
  })
})

describe("computePosition — full 3×3 anchor grid (non-auto)", () => {
  const box = rect({ left: 200, top: 500, width: 100, height: 40 })
  const base = { anchorBox: box, captionHeight: 52, offset: 8, viewportHeight: VIEWPORT }
  const xs = ["left", "center", "right"] as const
  const ys = ["top", "middle", "bottom"] as const

  const expectedLeft = { left: 200, center: 250, right: 300 }
  const expectedTop = { top: 500, middle: 520, bottom: 540 }
  const txMap = { left: -100, center: -50, right: 0 }
  const tyMap = { top: -100, middle: -50, bottom: 0 }
  const oxMap = { left: -8, center: 0, right: 8 }
  const oyMap = { top: -8, middle: 0, bottom: 8 }

  for (const ax of xs) {
    for (const ay of ys) {
      it(`${ax} × ${ay}`, () => {
        const p = computePosition({ ...base, anchorX: ax, anchorY: ay })
        expect(p.left).toBe(expectedLeft[ax])
        expect(p.top).toBe(expectedTop[ay])
        expect(p.resolvedAnchorY).toBe(ay)
        expect(p.transform).toBe(
          `translate(calc(${txMap[ax]}% + ${oxMap[ax]}px), calc(${tyMap[ay]}% + ${oyMap[ay]}px)) translateZ(0)`,
        )
      })
    }
  }
})

describe("computePosition — auto collision flip", () => {
  const base = {
    captionHeight: 52,
    anchorX: "center" as const,
    anchorY: "auto" as const,
    offset: 8,
    viewportHeight: VIEWPORT,
  }

  it("stays above when there's room (pins top edge, translates up)", () => {
    const box = rect({ left: 200, top: 500, width: 100, height: 40 })
    const p = computePosition({ ...base, anchorBox: box })
    expect(p.resolvedAnchorY).toBe("top")
    expect(p.top).toBe(500) // anchorBox.top
    expect(p.transform).toBe(
      "translate(calc(-50% + 0px), calc(-100% + -8px)) translateZ(0)",
    )
  })

  it("flips below when there's no room above (pins bottom edge, translates down)", () => {
    const box = rect({ left: 200, top: 20, width: 100, height: 40 })
    const p = computePosition({ ...base, anchorBox: box })
    expect(p.resolvedAnchorY).toBe("bottom")
    expect(p.top).toBe(60) // anchorBox.bottom
    expect(p.transform).toBe("translate(calc(-50% + 0px), calc(0% + 8px)) translateZ(0)")
  })
})
