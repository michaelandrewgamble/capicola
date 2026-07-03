// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Quote } from "../types"
import { createCapicola } from "./create-capicola"

// ─── rAF + clock stubs ────────────────────────────────────────────────────────
//
// The engine drives the word sweep through requestAnimationFrame and reads
// performance.now() for its wall clock. We queue frames manually (never auto-flush)
// so mount/destroy assertions are deterministic — a scheduled sweep frame stays
// pending until we explicitly flush it, and destroy() must cancel it.

let rafQueue: Map<number, FrameRequestCallback>
let nextRafId: number
let now: number

// ─── ResizeObserver spy ───────────────────────────────────────────────────────
//
// jsdom ships no ResizeObserver, and the anchored engine installs one (plus a
// second for width:"parent"). Record every instance + its observe/disconnect
// calls so we can assert the anchor observer is wired on mount and torn down on
// destroy.

class MockResizeObserver {
  static instances: MockResizeObserver[] = []
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  constructor(public cb: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this)
  }
}

let addSpy: ReturnType<typeof vi.spyOn>
let removeSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  rafQueue = new Map()
  nextRafId = 0
  now = 0
  vi.useFakeTimers()
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback): number => {
    const id = ++nextRafId
    rafQueue.set(id, cb)
    return id
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    rafQueue.delete(id)
  })
  vi.spyOn(performance, "now").mockImplementation(() => now)
  // jsdom doesn't implement media playback; the driver calls audio.play().then(...).
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {})
  MockResizeObserver.instances = []
  vi.stubGlobal("ResizeObserver", MockResizeObserver)
  addSpy = vi.spyOn(window, "addEventListener")
  removeSpy = vi.spyOn(window, "removeEventListener")
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ""
})

// ─── fixtures ─────────────────────────────────────────────────────────────────

const QUOTES: Quote[] = [
  { text: "Make it work", author: "Kent Beck" },
  { text: "Stay hungry", author: "Steve Jobs" },
]

/** Attach a fresh anchor + host to the body and return both. */
function mountEls() {
  const anchor = document.createElement("div")
  anchor.textContent = "anchor"
  document.body.appendChild(anchor)
  const host = document.createElement("div")
  document.body.appendChild(host)
  return { anchor, host }
}

/** The single `.cap-root` currently in the document (there is only ever one). */
function rootInDoc(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".cap-root")
}

/**
 * Serialize `.cap-root` for a structural snapshot, normalizing the volatile bits:
 * every `data-active` (per-tick highlight / reel phase) and the anchored
 * left/top/transform (depend on live layout rects) collapse to placeholders so the
 * snapshot captures the DOM *shape + classes + vars*, not the frame it was caught on.
 */
function serializeRoot(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement
  clone.style.removeProperty("left")
  clone.style.removeProperty("top")
  clone.style.removeProperty("transform")
  if (clone.hasAttribute("data-active")) clone.setAttribute("data-active", "*")
  clone
    .querySelectorAll("[data-active]")
    .forEach((el) => el.setAttribute("data-active", "*"))
  return clone.outerHTML
}

// ── (a) mount builds the exact DOM; destroy tears everything down ──────────────

describe("createCapicola — mount", () => {
  it("portals the exact .cap-root into document.body for an anchored caption", () => {
    const { anchor, host } = mountEls()
    const inst = createCapicola(host, {
      text: "hello brave world",
      anchorEl: anchor,
      preset: "box",
    })

    const root = rootInDoc()
    expect(root).not.toBeNull()
    // Anchored → the root is a direct child of <body> (the portal), NOT of host.
    expect(root!.parentElement).toBe(document.body)
    expect(host.contains(root)).toBe(false)

    // Exact classes / role / aria-label (the parity contract).
    expect(root!.className).toBe("cap-root")
    expect(root!.getAttribute("role")).toBe("group")
    expect(root!.getAttribute("aria-label")).toBe("hello brave world")

    // Theme vars land as --cap-* inline custom properties (not a style object).
    expect(root!.style.getPropertyValue("--cap-font-size").length).toBeGreaterThan(0)

    // Anchored positioning base + revealed (fonts ready sync in jsdom, anchor measured).
    expect(root!.style.position).toBe("fixed")
    expect(root!.style.zIndex).toBe("9999")
    expect(root!.style.visibility).toBe("visible")

    // One .cap-track (aria-hidden, data-chunk) with one .cap-word span per word.
    const track = root!.querySelector<HTMLElement>(".cap-track:not(.cap-measure)")!
    expect(track.className).toBe("cap-track")
    expect(track.getAttribute("aria-hidden")).toBe("true")
    expect(track.getAttribute("data-chunk")).toBe("0")
    const words = Array.from(track.querySelectorAll<HTMLElement>(".cap-word")).map(
      (s) => s.textContent,
    )
    expect(words).toEqual(["hello", "brave", "world"])

    // Caption mode → no author, no measure row (hug content).
    expect(root!.querySelector(".cap-author")).toBeNull()
    expect(root!.querySelector(".cap-measure")).toBeNull()

    inst.destroy()
  })

  it("appends the root into the host (not body) for inline placement", () => {
    const { host } = mountEls()
    const inst = createCapicola(host, {
      text: "inline block",
      placement: "inline",
    })
    const root = rootInDoc()
    expect(root).not.toBeNull()
    expect(root!.parentElement).toBe(host)
    expect(root!.className).toBe("cap-root cap-root--inline")
    // Inline strips the anchored fixed-overlay positioning.
    expect(root!.style.position).toBe("")
    expect(root!.style.zIndex).toBe("")
    inst.destroy()
  })

  it("wires an anchor ResizeObserver + capture scroll/resize listeners", () => {
    const { anchor, host } = mountEls()
    const inst = createCapicola(host, { text: "one two", anchorEl: anchor })

    // Exactly one RO (anchor) — width:"parent" isn't set, so no parent RO.
    expect(MockResizeObserver.instances.length).toBe(1)
    expect(MockResizeObserver.instances[0].observe).toHaveBeenCalledWith(anchor)

    // Scroll is observed in the CAPTURE phase (3rd arg true) so the caption tracks
    // the anchor as any ancestor scrolls; resize is a plain window listener.
    const scrollAdd = addSpy.mock.calls.find((c) => c[0] === "scroll")
    const resizeAdd = addSpy.mock.calls.find((c) => c[0] === "resize")
    expect(scrollAdd).toBeTruthy()
    expect(scrollAdd![2]).toBe(true)
    expect(resizeAdd).toBeTruthy()

    inst.destroy()
  })
})

// ── (a) destroy(): removes the body node + disconnects every observer/listener ──

describe("createCapicola — destroy", () => {
  it("removes the body-portaled root and disconnects the observer + listeners", () => {
    const { anchor, host } = mountEls()
    const inst = createCapicola(host, { text: "alpha beta gamma", anchorEl: anchor })

    const root = rootInDoc()
    expect(root!.parentElement).toBe(document.body)
    const ro = MockResizeObserver.instances[0]

    // The play-on-open sweep scheduled a frame.
    expect(rafQueue.size).toBe(1)

    // Grab the exact scroll handler that was registered, to assert symmetric removal.
    const scrollAdd = addSpy.mock.calls.find((c) => c[0] === "scroll")!
    const handler = scrollAdd[1]

    inst.destroy()

    // Root gone from the document.
    expect(rootInDoc()).toBeNull()
    expect(root!.parentElement).toBeNull()

    // ResizeObserver disconnected.
    expect(ro.disconnect).toHaveBeenCalledTimes(1)

    // Listeners removed with matching signatures (capture flag MUST match, or the
    // scroll listener leaks).
    expect(removeSpy).toHaveBeenCalledWith("scroll", handler, true)
    expect(removeSpy).toHaveBeenCalledWith("resize", handler)

    // The driver's pending rAF was cancelled — no leaked frame loop.
    expect(rafQueue.size).toBe(0)

    // Idempotent.
    expect(() => inst.destroy()).not.toThrow()
  })

  it("removes the hidden <audio> node it created for audio mode", () => {
    const { anchor, host } = mountEls()
    const inst = createCapicola(host, {
      words: [{ text: "hi", start: 0, end: 1 }],
      audioSrc: "blob:fake-audio",
      anchorEl: anchor,
    })
    const audio = host.querySelector("audio")
    expect(audio).not.toBeNull()
    expect(audio!.getAttribute("aria-hidden")).toBe("true")

    inst.destroy()
    expect(host.querySelector("audio")).toBeNull()
  })
})

// ── (b) DOM-parity: serialized .cap-root structure per mode ────────────────────

describe("createCapicola — DOM parity snapshot", () => {
  it("caption config serializes to the byte-identical .cap-root structure", () => {
    const { anchor, host } = mountEls()
    const inst = createCapicola(host, {
      text: "make it work",
      anchorEl: anchor,
      preset: "box",
    })
    expect(serializeRoot(rootInDoc()!)).toMatchInlineSnapshot(
      `"<div role="group" class="cap-root" aria-label="make it work" style="position: fixed; z-index: 9999; visibility: visible; justify-content: center; --cap-font-family: 'Barlow Condensed', 'Arial Narrow', sans-serif; --cap-font-weight: 900; --cap-font-size: 30px; --cap-letter-spacing: 0.02em; --cap-text-color: #ffffff; --cap-stroke-color: rgba(0,0,0,0.95); --cap-stroke-width: 3px; --cap-shadow-color: rgba(0,0,0,0.55); --cap-highlight-color: linear-gradient(180deg, #E62E64 0%, #C4124C 100%); --cap-highlight-text-color: #ffffff; --cap-word-gap: 0.62em;"><div class="cap-track" data-chunk="0" aria-hidden="true"><span class="cap-word" data-active="*">make</span><span class="cap-word" data-active="*">it</span><span class="cap-word" data-active="*">work</span></div></div>"`,
    )
    inst.destroy()
  })

  it("quote config serializes to the byte-identical .cap-root structure", () => {
    const { anchor, host } = mountEls()
    const inst = createCapicola(host, {
      mode: "quote",
      quotes: QUOTES,
      anchorEl: anchor,
      preset: "color",
      authorAppearance: { fontFamily: "'Inter', sans-serif", fontWeight: 600 },
    })
    expect(serializeRoot(rootInDoc()!)).toMatchInlineSnapshot(
      `"<div role="group" class="cap-root" aria-label="Make it work — Kent Beck" style="position: fixed; z-index: 9999; visibility: visible; opacity: 1; transition: opacity 220ms var(--cap-quote-transition-easing, ease); flex-direction: column; align-items: center; --cap-font-family: 'Inter Variable', system-ui, sans-serif; --cap-font-weight: 800; --cap-font-size: 32px; --cap-letter-spacing: 0em; --cap-text-color: #ffffff; --cap-stroke-color: rgba(0,0,0,0.95); --cap-stroke-width: 3.5px; --cap-shadow-color: rgba(0,0,0,0.5); --cap-highlight-color: transparent; --cap-highlight-text-color: #FFC53D; --cap-word-gap: 0.3em; --cap-author-font-family: 'Inter', sans-serif; --cap-author-font-weight: 600;"><div class="cap-track cap-track--quote" data-chunk="0" aria-hidden="true"><span class="cap-word" data-active="*" aria-hidden="true">“</span><span class="cap-word" data-active="*">Make</span><span class="cap-word" data-active="*">it</span><span class="cap-word" data-active="*">work</span><span class="cap-word" data-active="*" aria-hidden="true">”</span></div><div class="cap-author" data-active="*" aria-hidden="true"><span class="cap-author-word">— Kent Beck</span></div></div>"`,
    )
    inst.destroy()
  })
})
