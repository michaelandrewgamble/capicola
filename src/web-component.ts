// ─────────────────────────────────────────────────────────────────────────────
// Capicola web component (`capicola/web-component`) — `<capicola-caption>`.
//
// A framework-agnostic custom element wrapping the headless engine
// (`createCapicola`). Imports NO React. String props flow through observed
// attributes; object props (quotes, appearance, callbacks, anchorEl, …) flow
// through property setters.
//
// Placement / styling (the maintainer's decision):
//  - LIGHT DOM by default (both placements) — the element renders into its own
//    light-DOM subtree (inline) or portals into `document.body` (anchored), and
//    relies on the global `capicola/styles.css`.
//  - Opt-in `shadow` attribute → an INLINE-ONLY shadow root with `capicola.css`
//    adopted via `adoptedStyleSheets`, so the element is fully self-contained.
//    (Anchored placement portals to `document.body`, escaping any shadow root, so
//    shadow mode forces `placement="inline"`.)
// ─────────────────────────────────────────────────────────────────────────────

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

// The frozen stylesheet, inlined as a string (Vite/tsup `?inline`), used only for
// the opt-in shadow root. Light DOM relies on the globally-loaded styles.css.
// (The `*.css?inline` module is typed ambiently in `src/css.d.ts`.)
import capicolaCss from "./capicola.css?inline"

/** Attributes that map 1:1 onto string/scalar engine options. */
const OBSERVED = [
  "text",
  "mode",
  "placement",
  "preset",
  "width",
  "align",
  "anchor-x",
  "anchor-y",
  "offset",
  "open",
] as const

/** The object-valued options exposed as property setters (never attributes). */
const OBJECT_PROPS = [
  "quotes",
  "words",
  "appearance",
  "authorAppearance",
  "quote",
  "cadence",
  "chunking",
  "anchorEl",
  "onWordChange",
  "onEnded",
] as const

/** `"auto" | "parent" | <number>` — a numeric string becomes a px max-width. */
function parseWidth(v: string): CaptionWidth {
  if (v === "auto" || v === "parent") return v
  const n = Number(v)
  return Number.isFinite(n) ? n : "auto"
}

/** Boolean attribute: absent → undefined (engine default true); "false"/"0" → false. */
function parseOpen(v: string | null): boolean | undefined {
  if (v === null) return undefined
  return v !== "false" && v !== "0"
}

// A constructable stylesheet is expensive to build; share one across all shadow
// instances. Null when the browser lacks constructable stylesheets (fall back to
// a <style> element).
let sharedSheet: CSSStyleSheet | null | undefined

function getSharedSheet(): CSSStyleSheet | null {
  if (sharedSheet !== undefined) return sharedSheet
  if (typeof CSSStyleSheet === "undefined") return (sharedSheet = null)
  try {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(capicolaCss)
    sharedSheet = sheet
  } catch {
    sharedSheet = null
  }
  return sharedSheet
}

// SSR-safe base: `class extends HTMLElement` throws at eval time in Node (where
// HTMLElement is undefined). Fall back to a shim so importing this entry
// server-side doesn't crash; `customElements.define` is guarded the same way and
// only runs in a real DOM.
const Base: typeof HTMLElement =
  typeof HTMLElement !== "undefined"
    ? HTMLElement
    : (class {} as unknown as typeof HTMLElement)

/**
 * `<capicola-caption>` — the custom-element adapter over `createCapicola`.
 *
 * @example
 *   const el = document.createElement("capicola-caption")
 *   el.setAttribute("mode", "quote")
 *   el.quotes = [{ text: "…", author: "…" }]
 *   document.body.appendChild(el)
 */
export class CapicolaCaption extends Base {
  static get observedAttributes(): readonly string[] {
    return OBSERVED
  }

  // The live engine instance (null while disconnected).
  private inst: CapicolaInstance | null = null
  // Whether this element mounted an inline-only shadow root (read at connect).
  private useShadow = false
  // The element the engine renders into: `this` (light DOM) or a shadow container.
  private mountTarget: HTMLElement | null = null

  // Backing fields for the object-valued props (attributes can't carry objects).
  private _quotes?: Quote[]
  private _words?: WordTiming[]
  private _appearance?: CaptionTheme
  private _authorAppearance?: CaptionTheme
  private _quote?: QuoteOptions
  private _cadence?: CadenceOptions
  private _chunking?: ChunkingOptions
  private _anchorEl?: HTMLElement | null
  private _onWordChange?: (index: number, word: WordTiming) => void
  private _onEnded?: () => void

  // ── object-prop setters/getters (mirror CapicolaOptions object fields) ──────

  get quotes(): Quote[] | undefined {
    return this._quotes
  }
  set quotes(v: Quote[] | undefined) {
    this._quotes = v
    this.sync()
  }

  get words(): WordTiming[] | undefined {
    return this._words
  }
  set words(v: WordTiming[] | undefined) {
    this._words = v
    this.sync()
  }

  get appearance(): CaptionTheme | undefined {
    return this._appearance
  }
  set appearance(v: CaptionTheme | undefined) {
    this._appearance = v
    this.sync()
  }

  get authorAppearance(): CaptionTheme | undefined {
    return this._authorAppearance
  }
  set authorAppearance(v: CaptionTheme | undefined) {
    this._authorAppearance = v
    this.sync()
  }

  get quote(): QuoteOptions | undefined {
    return this._quote
  }
  set quote(v: QuoteOptions | undefined) {
    this._quote = v
    this.sync()
  }

  get cadence(): CadenceOptions | undefined {
    return this._cadence
  }
  set cadence(v: CadenceOptions | undefined) {
    this._cadence = v
    this.sync()
  }

  get chunking(): ChunkingOptions | undefined {
    return this._chunking
  }
  set chunking(v: ChunkingOptions | undefined) {
    this._chunking = v
    this.sync()
  }

  get anchorEl(): HTMLElement | null | undefined {
    return this._anchorEl
  }
  set anchorEl(v: HTMLElement | null | undefined) {
    this._anchorEl = v
    this.sync()
  }

  get onWordChange(): ((index: number, word: WordTiming) => void) | undefined {
    return this._onWordChange
  }
  set onWordChange(v: ((index: number, word: WordTiming) => void) | undefined) {
    this._onWordChange = v
    this.sync()
  }

  get onEnded(): (() => void) | undefined {
    return this._onEnded
  }
  set onEnded(v: (() => void) | undefined) {
    this._onEnded = v
    this.sync()
  }

  // ── engine option assembly ──────────────────────────────────────────────────

  /** Read the current attributes + object fields into an engine options object. */
  private readOptions(): CapicolaOptions {
    const attr = (n: string): string | undefined => this.getAttribute(n) ?? undefined
    const width = this.getAttribute("width")
    const offset = this.getAttribute("offset")
    // Shadow mode is inline-only (anchored portals to document.body, escaping the
    // shadow root); force it regardless of the placement attribute.
    const placement: CaptionPlacement | undefined = this.useShadow
      ? "inline"
      : (attr("placement") as CaptionPlacement | undefined)
    return {
      text: attr("text"),
      mode: attr("mode") as CaptionMode | undefined,
      placement,
      preset: attr("preset") as CaptionPreset | undefined,
      align: attr("align") as CaptionAlign | undefined,
      anchorX: attr("anchor-x") as AnchorX | undefined,
      anchorY: attr("anchor-y") as AnchorY | undefined,
      width: width === null ? undefined : parseWidth(width),
      offset: offset === null ? undefined : Number(offset),
      open: parseOpen(this.getAttribute("open")),
      quotes: this._quotes,
      words: this._words,
      appearance: this._appearance,
      authorAppearance: this._authorAppearance,
      quote: this._quote,
      cadence: this._cadence,
      chunking: this._chunking,
      anchorEl: this._anchorEl ?? null,
      onWordChange: this._onWordChange,
      onEnded: this._onEnded,
    }
  }

  /** Push the current options to a live engine (no-op before connect). */
  private sync(): void {
    this.inst?.update(this.readOptions())
  }

  // ── lifecycle ────────────────────────────────────────────────────────────────

  connectedCallback(): void {
    if (this.inst) return // already connected
    // Adopt any object props assigned before the element was upgraded (property
    // set → shadowed the accessor); re-route them through the setters.
    for (const name of OBJECT_PROPS) {
      if (Object.prototype.hasOwnProperty.call(this, name)) {
        const value = (this as unknown as Record<string, unknown>)[name]
        delete (this as unknown as Record<string, unknown>)[name]
        ;(this as unknown as Record<string, unknown>)[name] = value
      }
    }

    this.useShadow = this.hasAttribute("shadow")
    if (this.useShadow) {
      // Reuse an existing shadow root across disconnect/reconnect (attachShadow
      // throws if called twice).
      const root = this.shadowRoot ?? this.attachShadow({ mode: "open" })
      this.adoptStyles(root)
      // The engine needs an HTMLElement mount (ShadowRoot isn't one) — render into
      // a container div inside the shadow root.
      let container = root.firstElementChild as HTMLElement | null
      if (!container) {
        container = document.createElement("div")
        root.appendChild(container)
      }
      this.mountTarget = container
    } else {
      this.mountTarget = this
    }

    this.inst = createCapicola(this.mountTarget, this.readOptions())
  }

  attributeChangedCallback(): void {
    // Any observed attribute change → re-derive the full option set + update.
    this.sync()
  }

  disconnectedCallback(): void {
    this.inst?.destroy()
    this.inst = null
  }

  // ── imperative controls (parity with CapicolaInstance) ──────────────────────

  play(): void {
    this.inst?.play()
  }

  pause(): void {
    this.inst?.pause()
  }

  // ── shadow-mode styling ─────────────────────────────────────────────────────

  /** Adopt `capicola.css` into the shadow root (constructable sheet, or <style>). */
  private adoptStyles(root: ShadowRoot): void {
    const sheet = getSharedSheet()
    if (sheet && "adoptedStyleSheets" in root) {
      if (!root.adoptedStyleSheets.includes(sheet)) {
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
      }
      return
    }
    if (!root.querySelector("style[data-capicola]")) {
      const style = document.createElement("style")
      style.setAttribute("data-capicola", "")
      style.textContent = capicolaCss
      root.appendChild(style)
    }
  }
}

// Register once. Guarded for SSR (no `customElements`) and duplicate imports (HMR).
if (typeof customElements !== "undefined" && !customElements.get("capicola-caption")) {
  customElements.define("capicola-caption", CapicolaCaption)
}
