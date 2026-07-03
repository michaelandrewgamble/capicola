import * as React from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

import { createCapicola } from "./engine/create-capicola"
import type { CapicolaOptions, Quote } from "./types"

// Vanilla-engine stories: these drive the framework-agnostic `createCapicola`
// IMPERATIVELY (useRef + useEffect create/destroy) inside a React host — the exact
// shape a non-React consumer would use, and proof the engine renders standalone.
// They reuse the same Stage anchor + the global `capicola.css` (imported in
// .storybook/preview) as the React <Capicola> stories, so the visual output is a
// like-for-like parity reference.

const SCRIPT = "While being evaluated for the role, I shipped the entire design system."

const QUOTES: Quote[] = [
  {
    text: "Design is not just what it looks like. Design is how it works.",
    author: "Steve Jobs",
  },
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
]

// ── Stage: the shared anchor sandbox (mirrors capicola.stories.tsx) ─────────────

function Stage({
  anchorRef,
  children,
  stageWidth,
}: {
  anchorRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
  stageWidth?: number
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 190,
        width: stageWidth ?? "auto",
        padding: "48px 28px",
        background: "linear-gradient(135deg,#f6d365 0%,#fda085 45%,#4facfe 100%)",
        borderRadius: 12,
        outline: stageWidth ? "1px dashed #ffffff44" : "none",
      }}
    >
      <div
        ref={anchorRef as React.RefObject<HTMLDivElement>}
        style={{
          padding: "10px 20px",
          background: "#0f3460cc",
          borderRadius: 8,
          color: "#e6e6e6",
          fontSize: 13,
          fontFamily: "sans-serif",
        }}
      >
        anchor
      </div>
      {children}
    </div>
  )
}

// ── EngineHost: mount createCapicola imperatively, tear it down on unmount ───────

/**
 * A thin React host for the vanilla engine. `optionsFor(anchor)` maps the live
 * anchor element into engine options (the vanilla equivalent of the React
 * wrapper's `anchorRef.current → anchorEl`). Caption mode self-loops via
 * `inst.update({ open })` on `onEnded`; quote mode cycles internally.
 */
function EngineHost({
  optionsFor,
  stageWidth,
  loop = false,
}: {
  optionsFor: (anchor: HTMLElement | null) => CapicolaOptions
  stageWidth?: number
  loop?: boolean
}) {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const anchorRef = React.useRef<HTMLDivElement>(null)
  // Stash the latest builder/flags in refs so the mount-once effect never needs
  // them in its dep array (matches the React wrapper's create effect).
  const optionsForRef = React.useRef(optionsFor)
  optionsForRef.current = optionsFor
  const loopRef = React.useRef(loop)
  loopRef.current = loop

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const base = optionsForRef.current(anchorRef.current)
    let reopen: ReturnType<typeof setTimeout> | undefined
    const inst = createCapicola(host, {
      ...base,
      onEnded: () => {
        base.onEnded?.()
        // Caption mode ends → briefly close, then reopen to replay (quote mode
        // self-cycles, so it opts out of the manual loop).
        if (!loopRef.current) return
        inst.update({ open: false })
        reopen = setTimeout(() => inst.update({ open: true }), 500)
      },
    })
    return () => {
      if (reopen) clearTimeout(reopen)
      inst.destroy()
    }
  }, [])

  return (
    <Stage anchorRef={anchorRef} stageWidth={stageWidth}>
      <div style={{ display: "contents" }} ref={hostRef} />
    </Stage>
  )
}

// ── stories ─────────────────────────────────────────────────────────────────────

const meta: Meta<typeof EngineHost> = {
  title: "Engine/Vanilla (createCapicola)",
  parameters: { layout: "centered" },
}
export default meta
type Story = StoryObj<typeof EngineHost>

export const AnchoredCaption: Story = {
  name: "Anchored caption (imperative)",
  render: () => (
    <EngineHost
      loop
      optionsFor={(anchor) => ({
        text: SCRIPT,
        anchorEl: anchor,
        preset: "box",
      })}
    />
  ),
}

export const InlineCaption: Story = {
  name: "Inline caption (imperative)",
  render: () => (
    <EngineHost
      loop
      stageWidth={420}
      optionsFor={() => ({
        text: SCRIPT,
        placement: "inline",
        preset: "box",
      })}
    />
  ),
}

export const QuoteReel: Story = {
  name: "Quote reel (imperative)",
  render: () => (
    <EngineHost
      optionsFor={(anchor) => ({
        mode: "quote",
        quotes: QUOTES,
        anchorEl: anchor,
        preset: "color",
        quote: { authorPauseMs: 1600, loop: true },
        authorAppearance: {
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600,
          fontSizePx: 18,
          textColor: "#ffffff",
        },
      })}
    />
  ),
}

export const QuoteInline: Story = {
  name: "Quote reel (inline, imperative)",
  render: () => (
    <EngineHost
      stageWidth={420}
      optionsFor={() => ({
        mode: "quote",
        placement: "inline",
        quotes: QUOTES,
        preset: "color",
        quote: { authorPauseMs: 1600, loop: true },
        authorAppearance: {
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600,
          fontSizePx: 18,
          textColor: "#ffffff",
        },
      })}
    />
  ),
}
