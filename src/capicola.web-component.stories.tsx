import * as React from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"

// Side-effect import: registers <capicola-caption> with customElements.
import "./web-component"
import type { CapicolaCaption } from "./web-component"
import type { CaptionTheme, Quote, QuoteOptions } from "./types"

// ─── fixtures (mirrors capicola.stories.tsx so the two galleries read the same) ──

const SCRIPT =
  "While being evaluated for the role, I shipped the entire design system. There's a bunch more."

const QUOTES: Quote[] = [
  {
    text: "Design is not just what it looks like. Design is how it works.",
    author: "Steve Jobs",
  },
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
  {
    text: "The details are not the details. They make the design.",
    author: "Charles Eames",
  },
]

const AUTHOR_APPEARANCE: CaptionTheme = {
  fontFamily: "'Inter', sans-serif",
  fontWeight: 600,
  fontSizePx: 18,
  textColor: "#ffffff",
}

/** Gradient stage + a labelled anchor (matches the React stories' Stage). */
function Stage({
  children,
  stageWidth,
}: {
  children: (ref: React.RefObject<HTMLDivElement | null>) => React.ReactNode
  stageWidth?: number
}) {
  const anchorRef = React.useRef<HTMLDivElement>(null)
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
        ref={anchorRef}
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
      {children(anchorRef)}
    </div>
  )
}

// ─── the imperative React host: creates the element + sets attributes/.props ─────

interface HostProps {
  /** String/scalar props → attributes. */
  attrs?: Record<string, string | number | undefined>
  /** Mount an inline-only shadow root (self-contained; adopts capicola.css). */
  shadow?: boolean
  /** Object props → property setters. */
  quotes?: Quote[]
  appearance?: CaptionTheme
  authorAppearance?: CaptionTheme
  quote?: QuoteOptions
  /** Anchor (anchored placement only). */
  anchorRef?: React.RefObject<HTMLElement | null>
  /** Caption mode ends once — re-open on `onEnded` so the sweep loops while viewing. */
  loop?: boolean
}

/**
 * A tiny React host that demonstrates the plain-DOM contract of
 * `<capicola-caption>`: it `document.createElement`s the element, sets string
 * props as attributes and object props (`.quotes`, `.appearance`, `.anchorEl`,
 * callbacks) as properties, then appends it. Uses no React bindings for the
 * element itself — exactly how a vanilla page would consume it.
 */
function WebComponentCaption(props: HostProps) {
  const hostRef = React.useRef<HTMLDivElement>(null)
  const propsRef = React.useRef(props)
  propsRef.current = props

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const p = propsRef.current
    const el = document.createElement("capicola-caption") as CapicolaCaption

    if (p.shadow) el.setAttribute("shadow", "")
    for (const [k, v] of Object.entries(p.attrs ?? {})) {
      if (v !== undefined) el.setAttribute(k, String(v))
    }
    if (p.quotes) el.quotes = p.quotes
    if (p.appearance) el.appearance = p.appearance
    if (p.authorAppearance) el.authorAppearance = p.authorAppearance
    if (p.quote) el.quote = p.quote
    // Sibling refs are attached before this (child) effect runs, so `.current` is set.
    if (p.anchorRef?.current) el.anchorEl = p.anchorRef.current
    if (p.loop) {
      el.onEnded = () => {
        el.setAttribute("open", "false")
        window.setTimeout(() => el.setAttribute("open", "true"), 500)
      }
    }

    host.appendChild(el)
    return () => el.remove()
    // Static per story; mount once (the element's own setters handle live updates).
  }, [])

  return <div ref={hostRef} style={{ display: "contents" }} />
}

// ─── stories ─────────────────────────────────────────────────────────────────────

const meta: Meta = {
  title: "Components/Capicola (Web Component)",
  parameters: { layout: "centered" },
}
export default meta
type Story = StoryObj

export const CaptionAnchored: Story = {
  name: "Caption — light DOM, anchored",
  render: () => (
    <Stage>
      {(ref) => (
        <WebComponentCaption
          anchorRef={ref}
          loop
          attrs={{ text: SCRIPT, preset: "box", "anchor-y": "top" }}
        />
      )}
    </Stage>
  ),
}

export const QuoteReelInline: Story = {
  name: "Quote reel — light DOM, inline",
  render: () => (
    <Stage stageWidth={420}>
      {() => (
        <WebComponentCaption
          attrs={{ mode: "quote", placement: "inline", preset: "color" }}
          quotes={QUOTES}
          quote={{ authorPauseMs: 1600, loop: true }}
          authorAppearance={AUTHOR_APPEARANCE}
        />
      )}
    </Stage>
  ),
}

export const QuoteReelShadow: Story = {
  name: "Quote reel — shadow DOM (self-contained, inline)",
  render: () => (
    <Stage stageWidth={420}>
      {() => (
        <WebComponentCaption
          shadow
          attrs={{ mode: "quote", preset: "color" }}
          quotes={QUOTES}
          quote={{ authorPauseMs: 1600, loop: true }}
          authorAppearance={AUTHOR_APPEARANCE}
        />
      )}
    </Stage>
  ),
}
