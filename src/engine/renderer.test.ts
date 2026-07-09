// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"

import type { WordTiming } from "../types"
import { createRenderer, type RendererState } from "./renderer"

// ── state factory ─────────────────────────────────────────────────────────────

function w(text: string, start = 0, end = 0): WordTiming {
  return { text, start, end }
}

/** A caption-mode, anchored, hug-content state with three words (default active -1). */
function makeState(overrides: Partial<RendererState> = {}): RendererState {
  const chunkWords = overrides.chunkWords ?? [w("alpha"), w("beta"), w("gamma")]
  const base: RendererState = {
    isAnchored: true,
    isQuote: false,
    className: undefined,
    ariaLabel: "alpha beta gamma",
    themeVars: { "--cap-font-size": "30px" },
    authorVars: {},
    resolvedBoxWidth: undefined,
    balance: false,
    align: "center",
    resolvedWords: chunkWords,
    chunkStartIndex: 0,
    chunkWords,
    chunkIdx: 0,
    activeIndex: -1,
    openQuoteMark: "",
    closeQuoteMark: "",
    authorText: "",
    quotePhase: "sweeping",
  }
  return { ...base, ...overrides }
}

function trackOf(root: HTMLElement): HTMLElement {
  const t = root.querySelector<HTMLElement>(".cap-track:not(.cap-measure)")
  if (!t) throw new Error("no visible track")
  return t
}

function activeStates(track: HTMLElement): string[] {
  return Array.from(track.querySelectorAll<HTMLElement>(".cap-word")).map(
    (s) => s.getAttribute("data-active") ?? "",
  )
}

afterEach(() => {
  document.body.innerHTML = ""
})

// ── build: byte-identical DOM structure ───────────────────────────────────────

describe("createRenderer — build", () => {
  it("builds the anchored caption root with exact classes, attrs, and vars", () => {
    const r = createRenderer()
    r.build(makeState())
    const root = r.rootEl

    expect(root.className).toBe("cap-root")
    expect(root.getAttribute("role")).toBe("group")
    expect(root.getAttribute("aria-label")).toBe("alpha beta gamma")

    // theme var written via setProperty (not the React style object).
    expect(root.style.getPropertyValue("--cap-font-size")).toBe("30px")

    // anchored positioning base; hidden until applyPosition reveals it.
    expect(root.style.position).toBe("fixed")
    expect(root.style.zIndex).toBe("9999")
    expect(root.style.visibility).toBe("hidden")
    expect(root.style.justifyContent).toBe("center")

    // hug content → no measure row, no explicit width.
    expect(r.measureRowEl).toBeNull()
    expect(root.querySelector(".cap-measure")).toBeNull()
    expect(root.style.width).toBe("")

    // one .cap-track, aria-hidden, data-chunk=0, one span per word.
    const track = trackOf(root)
    expect(track.className).toBe("cap-track")
    expect(track.getAttribute("aria-hidden")).toBe("true")
    expect(track.getAttribute("data-chunk")).toBe("0")
    const spans = Array.from(track.querySelectorAll<HTMLElement>(".cap-word"))
    expect(spans.map((s) => s.textContent)).toEqual(["alpha", "beta", "gamma"])
    expect(spans.every((s) => s.getAttribute("data-active") === "false")).toBe(true)

    // no author in caption mode.
    expect(root.querySelector(".cap-author")).toBeNull()
  })

  it("marks the active word span when activeIndex is set", () => {
    const r = createRenderer()
    r.build(makeState({ activeIndex: 1 }))
    expect(activeStates(trackOf(r.rootEl))).toEqual(["false", "true", "false"])
  })

  it("adds --inline class + appended className and drops positioning for inline", () => {
    const r = createRenderer()
    r.build(makeState({ isAnchored: false, className: "custom" }))
    const root = r.rootEl
    expect(root.className).toBe("cap-root cap-root--inline custom")
    expect(root.style.position).toBe("")
    expect(root.style.zIndex).toBe("")
  })

  it("adds the hidden measure row before the track in width mode", () => {
    const words = [w("one"), w("two"), w("three"), w("four")]
    const r = createRenderer()
    r.build(makeState({ resolvedBoxWidth: 200, resolvedWords: words, chunkWords: words }))
    const root = r.rootEl

    expect(root.style.width).toBe("200px")
    const measure = r.measureRowEl
    expect(measure).not.toBeNull()
    expect(measure!.className).toBe("cap-track cap-measure")
    expect(measure!.getAttribute("aria-hidden")).toBe("true")
    expect(root.firstChild).toBe(measure) // measure row is first child, before track
    expect(measure!.querySelectorAll(".cap-word").length).toBe(4)

    // track picks up the width-mode wrap style.
    const track = trackOf(root)
    expect(track.style.width).toBe("100%")
    expect(track.style.flexWrap).toBe("wrap")
  })

  it("builds the quote track (marks + author) with column layout + crossfade seed", () => {
    const r = createRenderer()
    r.build(
      makeState({
        isQuote: true,
        openQuoteMark: "“",
        closeQuoteMark: "”",
        authorText: "— Ada",
        quotePhase: "dwelling",
        chunkWords: [w("be"), w("bold")],
        resolvedWords: [w("be"), w("bold")],
        ariaLabel: "be bold — Ada",
      }),
    )
    const root = r.rootEl

    // column stack + crossfade opacity seed.
    expect(root.style.flexDirection).toBe("column")
    expect(root.style.alignItems).toBe("center")
    expect(root.style.opacity).toBe("1")

    const track = trackOf(root)
    expect(track.className).toBe("cap-track cap-track--quote")

    // open mark, two words, close mark — marks are aria-hidden decorative spans.
    const spans = Array.from(track.querySelectorAll<HTMLElement>(".cap-word"))
    expect(spans.map((s) => s.textContent)).toEqual(["“", "be", "bold", "”"])
    expect(spans[0].getAttribute("aria-hidden")).toBe("true")
    expect(spans[3].getAttribute("aria-hidden")).toBe("true")
    // the middle word spans are NOT individually aria-hidden.
    expect(spans[1].hasAttribute("aria-hidden")).toBe(false)

    const author = root.querySelector<HTMLElement>(".cap-author")
    expect(author).not.toBeNull()
    expect(author!.getAttribute("data-active")).toBe("dwelling")
    expect(author!.getAttribute("aria-hidden")).toBe("true")
    expect(author!.querySelector(".cap-author-word")!.textContent).toBe("— Ada")
  })

  it("omits the opening/closing marks when they are empty strings", () => {
    const r = createRenderer()
    r.build(
      makeState({
        isQuote: true,
        openQuoteMark: "",
        closeQuoteMark: "",
        authorText: "",
        chunkWords: [w("x"), w("y")],
      }),
    )
    const spans = Array.from(trackOf(r.rootEl).querySelectorAll<HTMLElement>(".cap-word"))
    expect(spans.map((s) => s.textContent)).toEqual(["x", "y"])
    // no author when authorText is empty.
    expect(r.rootEl.querySelector(".cap-author")).toBeNull()
  })
})

// ── setActive: ≤2 spans toggled per tick ──────────────────────────────────────

describe("createRenderer — setActive", () => {
  it("flips exactly the prev + next spans, leaving the rest untouched", () => {
    const r = createRenderer()
    r.build(makeState())
    const track = trackOf(r.rootEl)

    r.setActive(-1, 1)
    expect(activeStates(track)).toEqual(["false", "true", "false"])

    r.setActive(1, 2)
    expect(activeStates(track)).toEqual(["false", "false", "true"])

    // never more than one active at a time.
    expect(activeStates(track).filter((s) => s === "true").length).toBe(1)
  })

  it("clears the active word when next is -1 (punctuation-beat hold)", () => {
    const r = createRenderer()
    r.build(makeState({ activeIndex: 0 }))
    const track = trackOf(r.rootEl)
    r.setActive(0, -1)
    expect(activeStates(track)).toEqual(["false", "false", "false"])
  })

  it("ignores indices outside the current chunk's word map", () => {
    const r = createRenderer()
    r.build(makeState())
    const track = trackOf(r.rootEl)
    // index 9 is not in the 3-word chunk → no-op, no throw.
    expect(() => r.setActive(-1, 9)).not.toThrow()
    expect(activeStates(track)).toEqual(["false", "false", "false"])
  })
})

// ── swapChunk: caption remount vs quote in-place ──────────────────────────────

describe("createRenderer — swapChunk", () => {
  it("caption mode REPLACES the track node (replays the enter animation)", () => {
    const r = createRenderer()
    r.build(makeState())
    const oldTrack = trackOf(r.rootEl)

    const next = makeState({
      chunkIdx: 1,
      chunkStartIndex: 3,
      chunkWords: [w("delta"), w("epsilon")],
      activeIndex: 3,
    })
    r.swapChunk(1, next)

    const newTrack = trackOf(r.rootEl)
    expect(newTrack).not.toBe(oldTrack) // node was replaced
    expect(oldTrack.parentNode).toBeNull() // old node detached
    expect(newTrack.getAttribute("data-chunk")).toBe("1")
    expect(activeStates(newTrack)).toEqual(["true", "false"])
    expect(
      Array.from(newTrack.querySelectorAll(".cap-word")).map((s) => s.textContent),
    ).toEqual(["delta", "epsilon"])
  })

  it("quote mode MUTATES children in place (stable node for the crossfade)", () => {
    const r = createRenderer()
    r.build(
      makeState({
        isQuote: true,
        openQuoteMark: "“",
        closeQuoteMark: "”",
        chunkWords: [w("first"), w("quote")],
        resolvedWords: [w("first"), w("quote")],
        authorText: "— A",
      }),
    )
    const oldTrack = trackOf(r.rootEl)

    const next = makeState({
      isQuote: true,
      openQuoteMark: "“",
      closeQuoteMark: "”",
      chunkWords: [w("second"), w("one")],
      resolvedWords: [w("second"), w("one")],
      authorText: "— B",
    })
    r.swapChunk(0, next)

    const newTrack = trackOf(r.rootEl)
    expect(newTrack).toBe(oldTrack) // SAME node — mutated in place
    expect(
      Array.from(newTrack.querySelectorAll(".cap-word")).map((s) => s.textContent),
    ).toEqual(["“", "second", "one", "”"])
  })
})

// ── update: width ─────────────────────────────────────────────────────────────

describe("createRenderer — width update", () => {
  it("applies track wrap when width switches auto→value at runtime in quote mode", () => {
    // Regression: quote mode uses one fixed chunk, so its track never rebuilds on a
    // width change — the wrap styles must be (re)applied via applyWidth, not only at
    // build. Before the fix the quote track stayed nowrap and overflowed the box.
    const words = [w("alpha"), w("beta"), w("gamma")]
    const r = createRenderer()
    const prev = makeState({
      isQuote: true,
      resolvedBoxWidth: undefined,
      resolvedWords: words,
      chunkWords: words,
    })
    r.build(prev)
    expect(trackOf(r.rootEl).style.width).toBe("") // auto → no track width

    const next = { ...prev, resolvedBoxWidth: 300 }
    r.update(prev, next)

    const track = trackOf(r.rootEl)
    expect(r.rootEl.style.width).toBe("300px")
    expect(track.style.width).toBe("100%")
    expect(track.style.flexWrap).toBe("wrap")

    // …and switching back to auto strips them.
    r.update(next, prev)
    const track2 = trackOf(r.rootEl)
    expect(r.rootEl.style.width).toBe("")
    expect(track2.style.width).toBe("")
    expect(track2.style.flexWrap).toBe("")
  })
})

// ── applyPosition ─────────────────────────────────────────────────────────────

describe("createRenderer — applyPosition", () => {
  it("writes left/top/transform + visibility for an anchored root", () => {
    const r = createRenderer()
    r.build(makeState())
    r.applyPosition(
      {
        left: 120,
        top: 40,
        transform: "translate(-50%, -100%) translateZ(0)",
        resolvedAnchorY: "top",
      },
      true,
    )
    const s = r.rootEl.style
    expect(s.left).toBe("120px")
    expect(s.top).toBe("40px")
    expect(s.transform).toBe("translate(-50%, -100%) translateZ(0)")
    expect(s.visibility).toBe("visible")
  })

  it("does not write positioning for an inline root, only visibility", () => {
    const r = createRenderer()
    r.build(makeState({ isAnchored: false }))
    r.applyPosition(
      { left: 10, top: 10, transform: "translate(0,0)", resolvedAnchorY: "top" },
      true,
    )
    expect(r.rootEl.style.left).toBe("")
    expect(r.rootEl.style.transform).toBe("")
    expect(r.rootEl.style.visibility).toBe("visible")
  })
})

// ── measure ───────────────────────────────────────────────────────────────────

describe("createRenderer — measure", () => {
  it("returns one width per measure-row word plus a numeric gap", () => {
    const words = [w("aa"), w("bb"), w("cc")]
    const r = createRenderer()
    r.build(makeState({ resolvedBoxWidth: 300, resolvedWords: words, chunkWords: words }))
    const m = r.measure()
    expect(m.wordWidths.length).toBe(3)
    expect(typeof m.gapWidth).toBe("number")
    expect(Number.isNaN(m.gapWidth)).toBe(false)
  })

  it("returns empties when there is no measure row (hug content)", () => {
    const r = createRenderer()
    r.build(makeState())
    expect(r.measure()).toEqual({ wordWidths: [], gapWidth: 0 })
  })
})

// ── destroy ───────────────────────────────────────────────────────────────────

describe("createRenderer — destroy", () => {
  it("removes the root from the DOM and clears handles idempotently", () => {
    const r = createRenderer()
    r.build(makeState({ resolvedBoxWidth: 200 }))
    document.body.appendChild(r.rootEl)
    expect(r.rootEl.parentNode).toBe(document.body)
    expect(r.measureRowEl).not.toBeNull()

    r.destroy()
    expect(r.rootEl.parentNode).toBeNull()
    expect(r.measureRowEl).toBeNull()

    // idempotent + inert after destroy.
    expect(() => r.destroy()).not.toThrow()
    expect(() => r.setActive(0, 1)).not.toThrow()
    expect(() => r.swapChunk(1, makeState())).not.toThrow()
  })
})

// ── update: surgical diff ─────────────────────────────────────────────────────

describe("createRenderer — update", () => {
  it("rewrites theme vars and aria-label without rebuilding the track", () => {
    const r = createRenderer()
    const prev = makeState()
    r.build(prev)
    const track = trackOf(r.rootEl)

    const next = makeState({
      themeVars: { "--cap-text-color": "#FFC53D" },
      ariaLabel: "changed label",
    })
    r.update(prev, next)

    expect(r.rootEl.getAttribute("aria-label")).toBe("changed label")
    expect(r.rootEl.style.getPropertyValue("--cap-text-color")).toBe("#FFC53D")
    // vanished var removed.
    expect(r.rootEl.style.getPropertyValue("--cap-font-size")).toBe("")
    // same words → same track node (no remount).
    expect(trackOf(r.rootEl)).toBe(track)
  })

  it("remounts the caption track when the visible chunk changes", () => {
    const r = createRenderer()
    const prev = makeState()
    r.build(prev)
    const oldTrack = trackOf(r.rootEl)
    const next = makeState({ chunkIdx: 1, chunkStartIndex: 3, chunkWords: [w("z")] })
    r.update(prev, next)
    expect(trackOf(r.rootEl)).not.toBe(oldTrack)
  })

  it("rebuilds from scratch on a placement flip", () => {
    const r = createRenderer()
    const prev = makeState()
    r.build(prev)
    r.update(prev, makeState({ isAnchored: false }))
    expect(r.rootEl.className).toBe("cap-root cap-root--inline")
    expect(r.rootEl.style.position).toBe("")
  })

  it("adds/removes the author element as quote content appears/disappears", () => {
    const r = createRenderer()
    const prev = makeState({ isQuote: true, authorText: "— A", chunkWords: [w("q")] })
    r.build(prev)
    expect(r.rootEl.querySelector(".cap-author")).not.toBeNull()

    const next = makeState({ isQuote: true, authorText: "", chunkWords: [w("q")] })
    r.update(prev, next)
    expect(r.rootEl.querySelector(".cap-author")).toBeNull()
  })
})
