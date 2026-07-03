import { afterEach, describe, expect, it, vi } from "vitest"
import { awaitFonts } from "./font-gate"

// ── Minimal FontFaceSet / FontFace mocks ──────────────────────────────────────
interface MockFace {
  family: string
  weight: string
  status: "unloaded" | "loading" | "loaded" | "error"
  load: () => void
}

function makeFace(partial: Partial<MockFace> = {}): MockFace {
  const face: MockFace = {
    family: "Barlow Condensed",
    weight: "900",
    status: "unloaded",
    load: vi.fn(() => {
      // by default loading is a no-op (stays unloaded) so timeout paths work
    }),
    ...partial,
  }
  return face
}

function makeFontSet(faces: MockFace[]) {
  return {
    faces,
    forEach(cb: (ff: MockFace) => void) {
      faces.forEach(cb)
    },
  }
}

// ── Controllable rAF + clock ──────────────────────────────────────────────────
let rafQueue: Array<{ id: number; cb: FrameRequestCallback }>
let rafId: number
let now: number

function flushRaf() {
  const pending = rafQueue
  rafQueue = []
  for (const { cb } of pending) cb(now)
}

function installEnv(fontSet: unknown) {
  rafQueue = []
  rafId = 0
  now = 1000
  vi.stubGlobal("document", { fonts: fontSet })
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = ++rafId
    rafQueue.push({ id, cb })
    return id
  })
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    rafQueue = rafQueue.filter((r) => r.id !== id)
  })
  vi.spyOn(Date, "now").mockImplementation(() => now)
}

const TARGET = [{ family: "barlow condensed", weight: 900 }]

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("awaitFonts", () => {
  it("readies synchronously when document.fonts is unavailable", () => {
    vi.stubGlobal("document", {})
    const onReady = vi.fn()
    awaitFonts(TARGET, onReady)
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it("readies synchronously when document itself is undefined (SSR)", () => {
    vi.stubGlobal("document", undefined)
    const onReady = vi.fn()
    awaitFonts(TARGET, onReady)
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it("resolves once the target face is loaded", () => {
    const face = makeFace({ status: "loaded" })
    installEnv(makeFontSet([face]))
    const onReady = vi.fn()
    awaitFonts(TARGET, onReady)
    // first poll runs synchronously and sees the loaded face
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(rafQueue.length).toBe(0)
  })

  it("kicks ff.load() on unloaded faces then resolves when a later poll sees loaded", () => {
    const face = makeFace({ status: "unloaded" })
    installEnv(makeFontSet([face]))
    const onReady = vi.fn()
    awaitFonts(TARGET, onReady)
    // not ready yet → load kicked, poll re-scheduled
    expect(face.load).toHaveBeenCalled()
    expect(onReady).not.toHaveBeenCalled()
    expect(rafQueue.length).toBe(1)
    // simulate the font finishing loading, then advance a frame
    face.status = "loaded"
    now += 16
    flushRaf()
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it("resolves on timeout even if the face never loads", () => {
    const face = makeFace({ status: "unloaded" })
    installEnv(makeFontSet([face]))
    const onReady = vi.fn()
    awaitFonts(TARGET, onReady, { timeoutMs: 3000 })
    expect(onReady).not.toHaveBeenCalled()
    // keep flushing frames while advancing the clock past the cap
    for (let i = 0; i < 5 && onReady.mock.calls.length === 0; i++) {
      now += 1000
      flushRaf()
    }
    expect(onReady).toHaveBeenCalledTimes(1)
    // once released, no further frames are scheduled
    expect(rafQueue.length).toBe(0)
  })

  it("cancel() stops the rAF poll and prevents onReady", () => {
    const face = makeFace({ status: "unloaded" })
    installEnv(makeFontSet([face]))
    const onReady = vi.fn()
    const gate = awaitFonts(TARGET, onReady)
    expect(rafQueue.length).toBe(1)
    gate.cancel()
    expect(rafQueue.length).toBe(0)
    // even if the face loads and time passes, a stray flush must not fire onReady
    face.status = "loaded"
    now += 5000
    flushRaf()
    expect(onReady).not.toHaveBeenCalled()
  })

  it("calls onReady at most once", () => {
    const face = makeFace({ status: "loaded" })
    installEnv(makeFontSet([face]))
    const onReady = vi.fn()
    awaitFonts(TARGET, onReady)
    now += 5000
    flushRaf()
    flushRaf()
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it("waits for ALL targets (author face on a distinct family)", () => {
    const quote = makeFace({ family: "Barlow Condensed", status: "loaded" })
    const author = makeFace({ family: "Anton", weight: "400", status: "unloaded" })
    installEnv(makeFontSet([quote, author]))
    const onReady = vi.fn()
    awaitFonts(
      [
        { family: "barlow condensed", weight: 900 },
        { family: "anton", weight: 400 },
      ],
      onReady,
    )
    // quote ready but author not → still gated
    expect(onReady).not.toHaveBeenCalled()
    author.status = "loaded"
    now += 16
    flushRaf()
    expect(onReady).toHaveBeenCalledTimes(1)
  })
})
