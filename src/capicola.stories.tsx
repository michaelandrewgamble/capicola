import * as React from "react"
import { createPortal } from "react-dom"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { InputType } from "storybook/internal/types"
// useArgs lets the Playground update its own controls (auto-switch preset → custom
// when a Style control changes). Provided by Storybook at build time.
import { useArgs } from "storybook/preview-api"
import { Capicola } from "./react"
import { PRESETS } from "./theme"
import type { CaptionPreset, CaptionTheme, Quote, WordTiming } from "./types"

// Ambient decl: storybook/preview-api resolves at Storybook build time, but not
// from packages/ui's tsc — this gives it types without a direct dependency.
declare module "storybook/preview-api" {
  export function useArgs<T = Record<string, unknown>>(): [
    T,
    (updated: Partial<T>) => void,
    (argNames?: string[]) => void,
  ]
}

// ─── fixtures ──────────────────────────────────────────────────────────────────

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
        // Photo-like gradient so translucency + drop shadows read (captions live
        // over real content, not a flat dark void).
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

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      }}
      style={{
        padding: "5px 14px",
        background: copied ? "#2e7d32" : "#e62e64",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 12,
        fontFamily: "sans-serif",
      }}
    >
      {copied ? "Copied!" : label}
    </button>
  )
}

const SCRIPT =
  "While being evaluated for the role, I shipped the entire design system. There's a bunch more."

// Featured-quote reel fixture (mode="quote"). Short quotes + attributions; the
// highlight sweeps only the quote words, the author stays static.
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

// Self-contained searchable combobox (React + inline styles, no design-system deps)
// so the story stays portable when Capicola is extracted to its own repo.
function FontCombobox({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [rect, setRect] = React.useState<DOMRect | null>(null)
  const filtered = options.filter((o) =>
    o.toLowerCase().includes(query.trim().toLowerCase()),
  )

  const MAX_H = 240
  // Position the (portaled) list at the input, flipping up if there's no room below.
  let listPos: React.CSSProperties = {}
  if (rect) {
    const below = window.innerHeight - rect.bottom
    const flipUp = below < MAX_H && rect.top > below
    listPos = flipUp
      ? { bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width }
      : { top: rect.bottom + 4, left: rect.left, width: rect.width }
  }

  return (
    <div
      style={{
        width: 260,
        maxWidth: "100%",
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      <input
        ref={inputRef}
        value={open ? query : value}
        placeholder="Search Google Font..."
        onFocus={() => {
          setRect(inputRef.current?.getBoundingClientRect() ?? null)
          setQuery("")
          setOpen(true)
        }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 34px 8px 12px",
          borderRadius: 8,
          border: "1px solid #d1d5db",
          background: "#ffffff",
          color: "#111827",
          fontSize: 13,
          outline: "none",
          cursor: "pointer",
          fontFamily: `'${value}', sans-serif`,
        }}
      />
      {/* Down-chevron affordance (rotates when open). */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#6b7280"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        style={{
          position: "absolute",
          right: 11,
          top: "50%",
          transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
          transition: "transform 120ms ease",
          pointerEvents: "none",
        }}
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
      {open &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            style={{
              position: "fixed",
              ...listPos,
              margin: 0,
              padding: 4,
              listStyle: "none",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              maxHeight: MAX_H,
              overflowY: "auto",
              zIndex: 2147483647,
              boxShadow: "0 10px 30px rgba(17,24,39,0.15)",
            }}
          >
            {filtered.length === 0 && (
              <li style={{ padding: "6px 10px", color: "#9ca3af", fontSize: 13 }}>
                No fonts found.
              </li>
            )}
            {filtered.map((o) => (
              <li
                key={o}
                onMouseDown={() => {
                  onChange(o)
                  setOpen(false)
                }}
                style={{
                  padding: "7px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 15,
                  color: o === value ? "#111827" : "#374151",
                  background: o === value ? "#e62e6418" : "transparent",
                  fontFamily: `'${o}', sans-serif`,
                }}
              >
                {o}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  )
}

// Type-search font list. Barlow Condensed + Inter are bundled (@fontsource); the
// rest load from Google Fonts in Storybook (see loadGoogleFonts). In your own app
// you load whichever family you pick — it's just a CSS font-family string.
const FONTS = [
  "Barlow Condensed",
  "Inter",
  "Alfa Slab One",
  "Anton",
  "Archivo Black",
  "Bangers",
  "Bebas Neue",
  "Bungee",
  "Fjalla One",
  "Fredoka",
  "Kanit",
  "Luckiest Guy",
  "Montserrat",
  "Oswald",
  "Passion One",
  "Poppins",
  "Righteous",
  "Rubik",
  "Sigmar One",
  "Titan One",
]
// css2 requires families in alphabetical order.
const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2" +
  "?family=Alfa+Slab+One" +
  "&family=Anton" +
  "&family=Archivo+Black" +
  "&family=Bangers" +
  "&family=Bebas+Neue" +
  "&family=Bungee" +
  "&family=Fjalla+One" +
  "&family=Fredoka:wght@500;600;700" +
  "&family=Kanit:wght@400;600;700;800" +
  "&family=Luckiest+Guy" +
  "&family=Montserrat:wght@400;600;700;800;900" +
  "&family=Oswald:wght@400;500;600;700" +
  "&family=Passion+One:wght@400;700;900" +
  "&family=Poppins:wght@400;600;700;800;900" +
  "&family=Righteous" +
  "&family=Rubik:wght@400;600;700;800;900" +
  "&family=Sigmar+One" +
  "&family=Titan+One" +
  "&display=swap"

function loadGoogleFonts() {
  if (typeof document === "undefined") return
  const id = "capicola-google-fonts"
  if (document.getElementById(id)) return
  const link = document.createElement("link")
  link.id = id
  link.rel = "stylesheet"
  link.href = GOOGLE_FONTS_HREF
  document.head.appendChild(link)
}

/** A caption that loops, so the highlight is always visible while tuning. */
type LoopProps = Omit<React.ComponentProps<typeof Capicola>, "open" | "onEnded">
function LoopCallout(props: LoopProps) {
  const [open, setOpen] = React.useState(true)
  // Quote mode self-cycles (the sequencer loops through `quotes`), so it only
  // needs the manual close/re-open trick in caption mode.
  const isQuote = props.mode === "quote"
  return (
    <Capicola
      {...props}
      open={open}
      onEnded={() => {
        if (isQuote) return
        setOpen(false)
        window.setTimeout(() => setOpen(true), 500)
      }}
    />
  )
}

// ─── the one Playground: behaviour + aesthetics + copy-paste config ─────────────

type Args = {
  // Preset (aesthetic starting point; "custom" = use the Style controls below)
  preset: CaptionPreset | "custom"
  // Style
  fontFamily: string
  fontWeight: number
  fontSizePx: number
  textColor: string
  fontOpacity: number
  strokeColor: string
  strokeWidthPx: number
  strokeOpacity: number
  shadowColor: string
  shadowBlurPx: number
  shadowDistancePx: number
  shadowOpacity: number
  wordBoxColor: string
  wordBoxOpacity: number
  highlightTextColor: string
  highlightPaddingXPx: number
  highlightPaddingYPx: number
  highlightRadiusPx: number
  backgroundOn: boolean
  backgroundColor: string
  backgroundOpacity: number
  letterSpacingEm: number
  wordGapEm: number
  textTransform: "uppercase" | "none" | "lowercase" | "capitalize"
  // Cadence
  style: "reading" | "speech"
  cps: number
  commaPause: number
  sentencePause: number
  // Chunking  (`chunkMode` avoids colliding with the component's `mode` prop)
  chunkMode: "pause" | "width"
  maxWords: number
  maxLines: number
  gapThreshold: number
  breakOnPunctuation: boolean
  // Layout / anchor
  anchorX: "left" | "center" | "right"
  anchorY: "top" | "middle" | "bottom" | "auto"
  width: "auto" | "parent" | number
  align: "left" | "center" | "right"
  // Quote  (mode="quote" reel + placement axis + author styling)
  // NB: `quoteMode`/`quotePlacement` keys avoid colliding with the chunking `mode`
  //     arg; the argTypes `name` labels display them as "mode"/"placement".
  quoteMode: "caption" | "quote"
  quotePlacement: "anchored" | "inline"
  authorPauseMs: number
  loop: boolean
  // Quote marks + author separator (empty string ⇒ that character is omitted).
  openQuote: string
  closeQuote: string
  authorSeparator: string
  authorFontFamily: string
  authorFontWeight: number
  authorColor: string
  authorFontSizePx: number
  authorTextTransform: "uppercase" | "none" | "lowercase" | "capitalize"
}

/** Apply an opacity (0–1) to any CSS color → rgba, so color + opacity stay separate
 *  (no hex-alpha fiddling). Normalises via canvas so hex/rgb/named all work. */
function withOpacity(color: string, opacity: number): string {
  if (opacity >= 1) return color
  if (typeof document === "undefined") return color
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return color
  ctx.fillStyle = color
  const norm = ctx.fillStyle // "#rrggbb" or "rgba(r, g, b, a)"
  let r = 0
  let g = 0
  let b = 0
  if (norm.startsWith("#")) {
    r = parseInt(norm.slice(1, 3), 16)
    g = parseInt(norm.slice(3, 5), 16)
    b = parseInt(norm.slice(5, 7), 16)
  } else {
    const m = norm.match(/rgba?\(([^)]+)\)/)
    if (m) [r, g, b] = m[1].split(",").map((s) => parseFloat(s))
  }
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function buildAppearance(a: Args): CaptionTheme {
  return {
    fontFamily: `'${a.fontFamily}', sans-serif`,
    fontWeight: a.fontWeight,
    fontSizePx: a.fontSizePx,
    textTransform: a.textTransform,
    textColor: withOpacity(a.textColor, a.fontOpacity),
    strokeColor: withOpacity(a.strokeColor, a.strokeOpacity),
    strokeWidthPx: a.strokeWidthPx,
    shadowColor: withOpacity(a.shadowColor, a.shadowOpacity),
    shadowBlurPx: a.shadowBlurPx,
    shadowDistancePx: a.shadowDistancePx,
    // Word box fades via its opacity token (smooth; avoids the gradient/background
    // transition flicker).
    highlightColor: a.wordBoxColor,
    highlightOpacity: a.wordBoxOpacity,
    highlightTextColor: a.highlightTextColor,
    highlightPaddingXPx: a.highlightPaddingXPx,
    highlightPaddingYPx: a.highlightPaddingYPx,
    highlightRadiusPx: a.highlightRadiusPx,
    letterSpacingEm: a.letterSpacingEm,
    wordGapEm: a.wordGapEm,
    ...(a.backgroundOn
      ? {
          backgroundColor: withOpacity(a.backgroundColor, a.backgroundOpacity),
          backgroundPaddingXPx: 14,
          backgroundPaddingYPx: 6,
          backgroundRadiusPx: 8,
        }
      : {}),
  }
}

// Author attribution styling for mode="quote" — mirrors buildAppearance but maps
// the author-specific controls (mapped to the parallel --cap-author-* vars).
function buildAuthorAppearance(a: Args): CaptionTheme {
  return {
    fontFamily: `'${a.authorFontFamily}', sans-serif`,
    fontWeight: a.authorFontWeight,
    fontSizePx: a.authorFontSizePx,
    textTransform: a.authorTextTransform,
    textColor: a.authorColor,
  }
}

const fmt = (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v))
const inline = (o: Record<string, unknown>) =>
  `{ ${Object.entries(o)
    .map(([k, v]) => `${k}: ${fmt(v)}`)
    .join(", ")} }`

function usageSnippet(a: Args): string {
  const cadence = {
    style: a.style,
    cps: a.cps,
    commaPause: a.commaPause,
    sentencePause: a.sentencePause,
  }
  const chunking = {
    mode: a.chunkMode,
    maxWords: a.maxWords,
    maxLines: a.maxLines,
    gapThreshold: a.gapThreshold,
    breakOnPunctuation: a.breakOnPunctuation,
  }
  // A named preset → one prop; "custom" → the full appearance token block.
  const styleLines =
    a.preset === "custom"
      ? [
          "  appearance={{",
          ...Object.entries(buildAppearance(a)).map(([k, v]) => `    ${k}: ${fmt(v)},`),
          "  }}",
        ]
      : [`  preset=${fmt(a.preset)}`]
  return [
    "<Capicola",
    "  open={open}",
    "  anchorRef={ref}",
    '  text="…"',
    `  anchorX=${fmt(a.anchorX)} anchorY=${fmt(a.anchorY)} width={${fmt(a.width)}} align=${fmt(a.align)}`,
    `  cadence={${inline(cadence)}}`,
    `  chunking={${inline(chunking)}}`,
    ...styleLines,
    "/>",
  ].join("\n")
}

function PlaygroundDemo({
  a,
  updateArgs,
}: {
  a: Args
  updateArgs: (u: Partial<Args>) => void
}) {
  const snippet = usageSnippet(a)
  const [showCode, setShowCode] = React.useState(false)
  React.useEffect(loadGoogleFonts, [])
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        alignItems: "center",
        fontFamily: "sans-serif",
      }}
    >
      <Stage stageWidth={a.width === "parent" ? 420 : undefined}>
        {(anchorRef) => (
          <LoopCallout
            anchorRef={anchorRef as React.RefObject<HTMLElement | null>}
            text={SCRIPT}
            mode={a.quoteMode}
            placement={a.quotePlacement}
            quotes={QUOTES}
            quote={{
              authorPauseMs: a.authorPauseMs,
              loop: a.loop,
              openQuote: a.openQuote,
              closeQuote: a.closeQuote,
              authorSeparator: a.authorSeparator,
            }}
            authorAppearance={buildAuthorAppearance(a)}
            anchorX={a.anchorX}
            anchorY={a.anchorY}
            width={a.width}
            align={a.align}
            cadence={{
              style: a.style,
              cps: a.cps,
              commaPause: a.commaPause,
              sentencePause: a.sentencePause,
            }}
            chunking={{
              mode: a.chunkMode,
              maxWords: a.maxWords,
              maxLines: a.maxLines,
              gapThreshold: a.gapThreshold,
              breakOnPunctuation: a.breakOnPunctuation,
            }}
            {...(a.preset === "custom"
              ? { appearance: buildAppearance(a) }
              : { preset: a.preset })}
          />
        )}
      </Stage>

      {/* Config: collapsed by default so it never crowds out the preview. */}
      <div
        style={{
          width: 480,
          maxWidth: "100%",
          display: "flex",
          gap: 8,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CopyButton text={snippet} label="Copy config" />
        <button
          onClick={() => setShowCode((v) => !v)}
          style={{
            padding: "5px 10px",
            background: "transparent",
            color: "#888",
            border: "1px solid #8884",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {showCode ? "▾ hide code" : "▸ view code"}
        </button>
      </div>
      {showCode && (
        <pre
          style={{
            width: 480,
            maxWidth: "100%",
            margin: 0,
            padding: 14,
            background: "#0f1020",
            color: "#d6d9f0",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.5,
            overflowX: "auto",
            maxHeight: 260,
            overflowY: "auto",
          }}
        >
          <code>{snippet}</code>
        </pre>
      )}

      {/* Font — searchable combobox, at the very bottom (portaled list, no scroll trap). */}
      <FontCombobox
        value={a.fontFamily}
        options={FONTS}
        onChange={(v) => updateArgs({ fontFamily: v, preset: "custom" })}
      />
    </div>
  )
}

const cat = (category: string) => ({ table: { category } })
// Real component props: documented but not interactively controlled here (the
// curated controls above drive them), and grouped to the bottom of the table.
const apiProp = () => ({
  control: false as const,
  table: { category: "Component props" },
})
const styleArg = (name: string, control: InputType["control"]) => ({
  name,
  control,
  ...cat("Style"),
})

// Each preset's font, so the combobox reflects it when you switch presets.
const PRESET_FONTS: Record<CaptionPreset, { fontFamily: string; fontWeight: number }> = {
  box: { fontFamily: "Barlow Condensed", fontWeight: 900 },
  color: { fontFamily: "Inter", fontWeight: 800 },
  bubble: { fontFamily: "Inter", fontWeight: 600 },
  plain: { fontFamily: "Inter", fontWeight: 800 },
}

// The Style-control keys — changing any of these auto-switches the preset to "custom".
const STYLE_KEYS = [
  "fontFamily",
  "fontWeight",
  "fontSizePx",
  "textColor",
  "fontOpacity",
  "strokeColor",
  "strokeWidthPx",
  "strokeOpacity",
  "shadowColor",
  "shadowBlurPx",
  "shadowDistancePx",
  "shadowOpacity",
  "wordBoxColor",
  "wordBoxOpacity",
  "highlightTextColor",
  "highlightPaddingXPx",
  "highlightPaddingYPx",
  "highlightRadiusPx",
  "backgroundOn",
  "backgroundColor",
  "backgroundOpacity",
  "letterSpacingEm",
  "wordGapEm",
  "textTransform",
] as const

// Decompose a preset colour token into the Playground's (hex + opacity) pair —
// presets bake opacity into rgba()/"transparent"; the controls keep them separate.
function splitColor(
  c: string | undefined,
  fallbackHex: string,
): { hex: string; opacity: number } {
  if (!c || c === "transparent") return { hex: fallbackHex, opacity: 0 }
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const p = m[1].split(",").map((s) => s.trim())
    const hex =
      "#" +
      p
        .slice(0, 3)
        .map((n) => Math.round(parseFloat(n)).toString(16).padStart(2, "0"))
        .join("")
    return { hex, opacity: p[3] !== undefined ? parseFloat(p[3]) : 1 }
  }
  return { hex: c, opacity: 1 }
}

// Map a named preset's resolved tokens back onto the Style controls, so the panel
// always mirrors what the selected preset renders (e.g. the gold active word for
// "color"). Colours that carry alpha are split into a (color + opacity) pair; a
// gradient word box has no single-colour control, so it maps to its dominant pink.
function presetToArgs(preset: CaptionPreset): Partial<Args> {
  const t = PRESETS[preset]
  const text = splitColor(t.textColor, "#ffffff")
  const stroke = splitColor(t.strokeColor, "#000000")
  const shadow = splitColor(t.shadowColor, "#000000")
  const box =
    typeof t.highlightColor === "string" && t.highlightColor.startsWith("linear-gradient")
      ? { hex: "#e62e64", opacity: 1 }
      : splitColor(t.highlightColor, "#e62e64")
  const hasBg = t.backgroundColor !== undefined && t.backgroundColor !== "transparent"
  const out: Partial<Args> = {
    fontFamily: PRESET_FONTS[preset].fontFamily,
    fontWeight: PRESET_FONTS[preset].fontWeight,
    fontSizePx: t.fontSizePx ?? 30,
    letterSpacingEm: t.letterSpacingEm ?? 0.02,
    wordGapEm: t.wordGapEm ?? 0.62,
    textTransform: t.textTransform ?? "uppercase",
    textColor: text.hex,
    fontOpacity: text.opacity,
    strokeColor: stroke.hex,
    strokeWidthPx: t.strokeWidthPx ?? 3,
    strokeOpacity: stroke.opacity,
    shadowColor: shadow.hex,
    shadowBlurPx: t.shadowBlurPx ?? 5,
    shadowDistancePx: t.shadowDistancePx ?? 4,
    shadowOpacity: shadow.opacity,
    wordBoxColor: box.hex,
    wordBoxOpacity: box.opacity,
    highlightTextColor: t.highlightTextColor ?? "#ffffff",
    highlightPaddingXPx: t.highlightPaddingXPx ?? 8,
    highlightPaddingYPx: t.highlightPaddingYPx ?? 3,
    highlightRadiusPx: t.highlightRadiusPx ?? 8,
    backgroundOn: hasBg,
  }
  // Only override the background colour/opacity when the preset actually has one,
  // so toggling "background box" on a boxless preset keeps a usable opacity.
  if (hasBg) {
    const bg = splitColor(t.backgroundColor, "#000000")
    out.backgroundColor = bg.hex
    out.backgroundOpacity = bg.opacity
  }
  return out
}

const meta: Meta<typeof Capicola> = {
  title: "Components/Capicola",
  component: Capicola,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
}
export default meta
type Story = StoryObj<typeof Capicola>

export const Playground: StoryObj<
  Args & Partial<Omit<React.ComponentProps<typeof Capicola>, keyof Args>>
> = {
  name: "Playground",
  parameters: { controls: { sort: "none" } },
  args: {
    preset: "box",
    fontFamily: "Barlow Condensed",
    fontWeight: 900,
    fontSizePx: 30,
    textColor: "#ffffff",
    fontOpacity: 1,
    strokeColor: "#000000",
    strokeWidthPx: 3,
    strokeOpacity: 0.95,
    shadowColor: "#000000",
    shadowBlurPx: 5,
    shadowDistancePx: 4,
    shadowOpacity: 0.55,
    wordBoxColor: "#e62e64",
    wordBoxOpacity: 1,
    highlightTextColor: "#ffffff",
    highlightPaddingXPx: 8,
    highlightPaddingYPx: 3,
    highlightRadiusPx: 8,
    backgroundOn: false,
    backgroundColor: "#000000",
    backgroundOpacity: 0.6,
    letterSpacingEm: 0.02,
    wordGapEm: 0.62,
    textTransform: "uppercase",
    chunkMode: "pause",
    maxWords: 4,
    maxLines: 2,
    gapThreshold: 0.5,
    breakOnPunctuation: true,
    anchorX: "center",
    anchorY: "top",
    width: "auto",
    align: "center",
    style: "reading",
    cps: 15,
    commaPause: 0.8,
    sentencePause: 0.8,
    quoteMode: "caption",
    quotePlacement: "anchored",
    authorPauseMs: 1600,
    loop: true,
    openQuote: "“",
    closeQuote: "”",
    authorSeparator: "— ",
    authorFontFamily: "Inter",
    authorFontWeight: 600,
    authorColor: "#ffffff",
    authorFontSizePx: 18,
    authorTextTransform: "none",
  },
  argTypes: {
    // Settings (first) — mode, placement, and the preset look.
    quoteMode: {
      name: "mode",
      control: "inline-radio",
      options: ["caption", "quote"],
      ...cat("Settings"),
    },
    quotePlacement: {
      name: "placement",
      control: "inline-radio",
      options: ["anchored", "inline"],
      ...cat("Settings"),
    },
    preset: {
      control: "select",
      options: ["box", "color", "bubble", "plain", "custom"],
      ...cat("Settings"),
    },
    // Style — only applied when preset is "custom".
    // font is chosen via the type-search combobox in the canvas (not a Storybook control)
    fontFamily: { table: { disable: true } },
    fontWeight: styleArg("font weight", {
      type: "range",
      min: 300,
      max: 900,
      step: 100,
    }),
    fontSizePx: styleArg("font size", { type: "range", min: 14, max: 64, step: 1 }),
    textTransform: {
      name: "text transform",
      control: "select",
      options: ["uppercase", "none", "lowercase", "capitalize"],
      ...cat("Style"),
    },
    textColor: styleArg("font color", "color"),
    fontOpacity: styleArg("font opacity", {
      type: "range",
      min: 0,
      max: 1,
      step: 0.05,
    }),
    strokeColor: styleArg("stroke color", "color"),
    strokeWidthPx: styleArg("stroke size", {
      type: "range",
      min: 0,
      max: 8,
      step: 0.5,
    }),
    strokeOpacity: styleArg("stroke opacity", {
      type: "range",
      min: 0,
      max: 1,
      step: 0.05,
    }),
    shadowColor: styleArg("shadow color", "color"),
    shadowBlurPx: styleArg("shadow blur", { type: "range", min: 0, max: 24, step: 1 }),
    shadowDistancePx: styleArg("shadow distance", {
      type: "range",
      min: 0,
      max: 24,
      step: 1,
    }),
    shadowOpacity: styleArg("shadow opacity", {
      type: "range",
      min: 0,
      max: 1,
      step: 0.05,
    }),
    wordBoxColor: styleArg("word box color", "color"),
    wordBoxOpacity: styleArg("word box opacity", {
      type: "range",
      min: 0,
      max: 1,
      step: 0.05,
    }),
    highlightTextColor: styleArg("active word color", "color"),
    highlightPaddingXPx: styleArg("word box padding x", {
      type: "range",
      min: 0,
      max: 40,
      step: 1,
    }),
    highlightPaddingYPx: styleArg("word box padding y", {
      type: "range",
      min: 0,
      max: 24,
      step: 1,
    }),
    highlightRadiusPx: styleArg("word box radius", {
      type: "range",
      min: 0,
      max: 40,
      step: 1,
    }),
    backgroundOn: styleArg("background box", "boolean"),
    backgroundColor: styleArg("background color", "color"),
    backgroundOpacity: styleArg("background opacity", {
      type: "range",
      min: 0,
      max: 1,
      step: 0.05,
    }),
    letterSpacingEm: styleArg("letter spacing", {
      type: "range",
      min: -0.02,
      max: 0.12,
      step: 0.005,
    }),
    wordGapEm: styleArg("word gap", { type: "range", min: 0, max: 1, step: 0.02 }),
    // Chunking
    chunkMode: {
      name: "mode",
      control: "inline-radio",
      options: ["pause", "width"],
      ...cat("Chunking"),
    },
    maxWords: {
      control: { type: "range", min: 1, max: 10, step: 1 },
      ...cat("Chunking"),
    },
    maxLines: {
      control: { type: "range", min: 1, max: 3, step: 1 },
      ...cat("Chunking"),
    },
    gapThreshold: {
      control: { type: "range", min: 0.1, max: 1.5, step: 0.05 },
      ...cat("Chunking"),
    },
    breakOnPunctuation: { control: "boolean", ...cat("Chunking") },
    // Layout
    anchorX: {
      control: "inline-radio",
      options: ["left", "center", "right"],
      ...cat("Layout"),
    },
    anchorY: {
      control: "inline-radio",
      options: ["top", "middle", "bottom", "auto"],
      ...cat("Layout"),
    },
    width: {
      control: "select",
      options: ["auto", "parent", 280, 420],
      ...cat("Layout"),
    },
    align: {
      control: "inline-radio",
      options: ["left", "center", "right"],
      ...cat("Layout"),
    },
    // Cadence (last)
    style: {
      control: "inline-radio",
      options: ["reading", "speech"],
      ...cat("Cadence"),
    },
    cps: { control: { type: "range", min: 10, max: 30, step: 1 }, ...cat("Cadence") },
    commaPause: {
      control: { type: "range", min: 0, max: 1.2, step: 0.02 },
      ...cat("Cadence"),
    },
    sentencePause: {
      control: { type: "range", min: 0, max: 1.5, step: 0.05 },
      ...cat("Cadence"),
    },
    // Quote  (mode="quote" reel — timing, marks, and author styling)
    authorPauseMs: {
      name: "author pause (ms)",
      control: { type: "range", min: 0, max: 4000, step: 100 },
      ...cat("Quote"),
    },
    loop: { control: "boolean", ...cat("Quote") },
    // Marks + separator: clear the field to omit that character entirely.
    openQuote: { name: "open quote", control: "text", ...cat("Quote") },
    closeQuote: { name: "close quote", control: "text", ...cat("Quote") },
    authorSeparator: {
      name: "author separator",
      control: "text",
      ...cat("Quote"),
    },
    authorFontFamily: { name: "author font", control: "text", ...cat("Quote") },
    authorFontWeight: {
      name: "author weight",
      control: { type: "range", min: 300, max: 900, step: 100 },
      ...cat("Quote"),
    },
    authorColor: { name: "author color", control: "color", ...cat("Quote") },
    authorFontSizePx: {
      name: "author size",
      control: { type: "range", min: 10, max: 40, step: 1 },
      ...cat("Quote"),
    },
    authorTextTransform: {
      name: "author text transform",
      control: "select",
      options: ["uppercase", "none", "lowercase", "capitalize"],
      ...cat("Quote"),
    },
    // Real component props — pushed to a group at the bottom, no dead controls.
    open: apiProp(),
    anchorRef: apiProp(),
    audioSrc: apiProp(),
    words: apiProp(),
    text: apiProp(),
    cadence: apiProp(),
    chunking: apiProp(),
    offset: apiProp(),
    appearance: apiProp(),
    mode: apiProp(),
    placement: apiProp(),
    quotes: apiProp(),
    authorAppearance: apiProp(),
    quote: apiProp(),
    onWordChange: apiProp(),
    onEnded: apiProp(),
    className: apiProp(),
  },
  render: function Render() {
    const [a, updateArgs] = useArgs<Args>()
    const prevRef = React.useRef<Args | null>(null)
    // Set true when WE change the font (preset population), so the resulting arg
    // change isn't mistaken for a user edit that would flip preset → custom.
    const skipNextRef = React.useRef(false)
    React.useEffect(() => {
      const prev = prevRef.current
      prevRef.current = a

      // On mount or when the preset changes → mirror that preset's tokens in the
      // controls, so the Style panel always reflects what the preset renders (the
      // gold active word for "color", the bubble background, etc.).
      if (!prev || a.preset !== prev.preset) {
        if (a.preset !== "custom") {
          const next = presetToArgs(a.preset)
          if ((Object.keys(next) as (keyof Args)[]).some((k) => a[k] !== next[k])) {
            skipNextRef.current = true
            updateArgs(next)
          }
        }
        return
      }

      if (a.preset === "custom") return
      if (skipNextRef.current) {
        skipNextRef.current = false
        return
      }
      // A Style control changed while on a named preset → switch to custom.
      if (STYLE_KEYS.some((k) => a[k] !== prev[k])) updateArgs({ preset: "custom" })
    }, [a, updateArgs])
    return <PlaygroundDemo a={a} updateArgs={updateArgs} />
  },
}

// ─── quick-look presets ─────────────────────────────────────────────────────────

function Quick({ preset, ...rest }: { preset: CaptionPreset } & Partial<LoopProps>) {
  return (
    <Stage stageWidth={rest.width === "parent" ? 420 : undefined}>
      {(ref) => (
        <LoopCallout
          anchorRef={ref as React.RefObject<HTMLElement | null>}
          text={SCRIPT}
          preset={preset}
          {...rest}
        />
      )}
    </Stage>
  )
}

export const PresetBox: Story = {
  name: "Preset: box (pink word box)",
  render: () => <Quick preset="box" />,
}
export const PresetColor: Story = {
  name: "Preset: color (gold active word)",
  render: () => <Quick preset="color" />,
}
export const PresetBubble: Story = {
  name: "Preset: bubble (translucent line box)",
  render: () => <Quick preset="bubble" />,
}
export const PresetPlain: Story = {
  name: "Preset: plain (no highlight)",
  render: () => <Quick preset="plain" />,
}

export const TwoLines: Story = {
  name: "Two lines (width mode, CapCut 2-line cap)",
  render: () => (
    <Quick
      preset="box"
      width="parent"
      chunking={{ mode: "width", maxWords: 16, maxLines: 2 }}
    />
  ),
}

export const CustomMix: Story = {
  name: "Custom: bubble + pink box (mix via appearance)",
  render: () => (
    <Quick
      preset="bubble"
      appearance={{ highlightColor: "linear-gradient(180deg,#E62E64,#C4124C)" }}
    />
  ),
}

export const AudioMode: Story = {
  name: "Audio-timings mode (explicit words)",
  render: () => {
    const words: WordTiming[] = [
      { text: "While", start: 0, end: 0.32 },
      { text: "being", start: 0.32, end: 0.68 },
      { text: "evaluated", start: 0.68, end: 1.2 },
      // a deliberate >0.5s gap → starts a new page
      { text: "for", start: 1.9, end: 2.12 },
      { text: "the", start: 2.12, end: 2.3 },
      { text: "role.", start: 2.3, end: 2.8 },
    ]
    return (
      <Stage>
        {(ref) => (
          <LoopCallout
            anchorRef={ref as React.RefObject<HTMLElement | null>}
            words={words}
            chunking={{ mode: "pause", maxWords: 4, gapThreshold: 0.5 }}
          />
        )}
      </Stage>
    )
  },
}

// ─── placement + quote mode ─────────────────────────────────────────────────────

export const QuoteMode: Story = {
  name: "Quote mode (anchored reel)",
  render: () => (
    <Stage>
      {(ref) => (
        <LoopCallout
          anchorRef={ref as React.RefObject<HTMLElement | null>}
          mode="quote"
          quotes={QUOTES}
          quote={{ authorPauseMs: 1600, loop: true }}
          preset="color"
          authorAppearance={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSizePx: 18,
            textColor: "#ffffff",
          }}
        />
      )}
    </Stage>
  ),
}

export const QuoteInline: Story = {
  name: "Quote mode (inline, in-flow)",
  render: () => (
    <Stage stageWidth={420}>
      {() => (
        <LoopCallout
          mode="quote"
          placement="inline"
          quotes={QUOTES}
          quote={{ authorPauseMs: 1600, loop: true }}
          preset="color"
          authorAppearance={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSizePx: 18,
            textColor: "#ffffff",
          }}
        />
      )}
    </Stage>
  ),
}

export const InlineCaption: Story = {
  name: "Inline caption (in-flow, not anchored)",
  render: () => (
    <Stage stageWidth={420}>
      {() => <LoopCallout placement="inline" text={SCRIPT} preset="box" />}
    </Stage>
  ),
}
