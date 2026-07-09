<p align="center"><img src="https://raw.githubusercontent.com/michaelandrewgamble/capicola/main/capicola-logo.png" width="180" alt="Capicola" /></p>

<h1 align="center">Capicola</h1>

<p align="center">TikTok/CapCut-style narrated captions that sweep a highlight word-by-word, pinned to any element.</p>

<p align="center">
  <a href="https://michaelandrewgamble.github.io/capicola/"><img src="https://img.shields.io/badge/demo-Storybook-E62E64?logo=storybook&logoColor=white" alt="Live Storybook demo" /></a>
  <a href="https://github.com/michaelandrewgamble/capicola/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/michaelandrewgamble/capicola/ci.yml?branch=main&label=CI&color=E62E64" alt="CI status" /></a>
  <a href="https://github.com/michaelandrewgamble/capicola/releases"><img src="https://img.shields.io/github/v/release/michaelandrewgamble/capicola?color=E62E64" alt="Latest release" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/michaelandrewgamble/capicola?color=E62E64" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/types-included-E62E64?logo=typescript&logoColor=white" alt="TypeScript types included" />
  <img src="https://img.shields.io/badge/core%20deps-zero-E62E64" alt="Zero runtime dependencies in the core engine" />
</p>

<!-- Once published to npm, add the version / bundle-size badges back:
  <a href="https://www.npmjs.com/package/capicola"><img src="https://img.shields.io/npm/v/capicola.svg?color=E62E64" alt="npm version" /></a>
  <a href="https://bundlephobia.com/package/capicola"><img src="https://img.shields.io/bundlephobia/minzip/capicola.svg?color=E62E64" alt="minzipped size" /></a>
-->

---

**Capicola** renders a narrated, word-by-word caption — the animated karaoke style you see on TikTok and CapCut — and pins it to any anchor element (or lays it out inline). Feed it plain text and it paces the highlight itself with a research-tuned cadence model; feed it word-level timings plus an audio file and the highlight rides the narration exactly. It ships four ready-made presets, a featured-**quote mode**, and is fully themeable through typed tokens or raw CSS variables. At its core it's a **framework-agnostic engine** (`createCapicola`) with **zero runtime dependencies**; a React component (`capicola/react`) and a web component (`capicola/web-component`) are thin adapters on top.

<p align="center"><img src="https://raw.githubusercontent.com/michaelandrewgamble/capicola/main/docs/demo.gif" width="720" alt="Capicola cycling through its box, color, and bubble caption presets, then a featured-quote reel" /></p>

## Table of contents

- [Features](#features)
- [Install](#install)
- [Quickstart (React)](#quickstart-react)
- [Framework-agnostic engine](#framework-agnostic-engine-createcapicola) · [Web component](#web-component-capicola-caption)
- [Presets](#presets) · [Placement](#placement) · [Quote mode](#quote-mode) · [Theming](#theming)
- [How it works](#how-it-works)
- [API reference](#api-reference)
- [Caption CLI](#caption-cli) · [Fonts](#fonts) · [SSR & Next.js](#ssr--nextjs) · [Browser support](#browser-support)
- [Bundle size & tree-shaking](#bundle-size--tree-shaking) · [Stability](#stability) · [Contributing](#contributing)

## Features

- **Two drive modes** — silent _cadence_ mode (just pass `text`) or synced _audio_ mode (pass `words` + `audioSrc`).
- **Framework-agnostic core** — a headless `createCapicola(el, opts)` engine with **zero runtime dependencies**; ships React and web-component adapters. No design-system imports, no CSS-in-JS runtime.
- **Themeable, two ways** — a typed `appearance` prop or raw `--cap-*` CSS custom properties. Every token maps 1:1 to a variable.
- **Four presets** — `box`, `color`, `bubble`, `plain`, each a full bundle of tokens you can still override.
- **Featured-quote mode** — turn the same engine into an auto-cycling quote reel with a styled author attribution.
- **Anti-jitter by design** — the highlight is a paint change over constant padding; the pop is a compositor `transform: scale()`. Nothing reflows per word, ever.
- **Smart anchoring** — a 3×3 anchor grid plus collision-aware `auto` vertical placement that flips above/below to stay on-screen and tracks the anchor as the page scrolls.
- **CapCut-style chunking** — group words into on-screen "pages" by pause or by box width, with sentence-aware breaks and a max-lines cap.
- **Accessible & motion-aware** — the full caption is exposed to assistive tech as one labeled group (no chatty per-word announcements), and motion fully respects `prefers-reduced-motion`.
- **Caption CLI** — `npx capicola-caption` generates word timings from existing audio (WhisperX) or from TTS with word marks (Amazon Polly, ElevenLabs).

## Install

```sh
npm install capicola   # or: pnpm add capicola / yarn add capicola
```

Capicola ships as a **framework-agnostic core + thin adapters**, via subpath exports:

| Import                   | What you get                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `capicola`               | The headless engine `createCapicola(el, opts)` + the pure functions/types. No framework. |
| `capicola/react`         | The `<Capicola>` React component.                                                        |
| `capicola/web-component` | The `<capicola-caption>` custom element (works anywhere).                                |
| `capicola/styles.css`    | The stylesheet (import once) — every `--cap-*` default.                                  |

`react` is an **optional** peer dependency (`>=18`), needed only for `capicola/react`. There is **no `react-dom`** dependency. Whichever entry you use, import the stylesheet **once** in your app entry:

```ts
import "capicola/styles.css"
```

> **Upgrading from 0.1.x?** The React component moved from the package root to the `/react` subpath: change `import { Capicola } from "capicola"` → `import { Capicola } from "capicola/react"`. Nothing else changed — same props, same CSS import.

## Quickstart (React)

### Cadence mode (no audio)

Pass `text` and Capicola computes per-word timings from its cadence model.

```tsx
import { useRef } from "react"
import { Capicola } from "capicola/react"
import "capicola/styles.css"

function Example() {
  const anchor = useRef<HTMLDivElement>(null)
  return (
    <div>
      <div ref={anchor}>Anchor me</div>
      <Capicola open anchorRef={anchor} text="This caption paces itself, word by word." />
    </div>
  )
}
```

### Audio mode (synced to narration)

Pass `words` (word-level timings, in seconds) and an `audioSrc`. The highlight is driven from the audio element's `currentTime`. A `CaptionData` JSON from the [caption CLI](#caption-cli) spreads straight in.

```tsx
<Capicola
  open
  anchorRef={anchor}
  audioSrc="/narration.mp3"
  words={[
    { text: "This", start: 0.0, end: 0.32 },
    { text: "rides", start: 0.34, end: 0.71 },
    { text: "the", start: 0.72, end: 0.83 },
    { text: "audio.", start: 0.85, end: 1.4 },
  ]}
/>

// …or with a generated caption file:
// import caption from "./narration.caption.json"
// <Capicola open anchorRef={anchor} {...caption} />
```

## Framework-agnostic engine (`createCapicola`)

The React component is a thin wrapper over a headless engine that touches the DOM directly — no framework required. Import it from the package root and drive any element:

```ts
import { createCapicola } from "capicola"
import "capicola/styles.css"

const cap = createCapicola(document.getElementById("host")!, {
  text: "This caption paces itself, word by word.",
  placement: "inline", // or "anchored" with an `anchorEl`
})

// cap.play() / cap.pause() / cap.update({ preset: "color" }) / cap.destroy()
```

`createCapicola(mountEl, options)` returns `{ play, pause, update, destroy }`. The options mirror the React props (with `anchorEl: HTMLElement` in place of `anchorRef`). Everything else — presets, `appearance`, quote mode, cadence, chunking — works the same. This is the layer Vue/Svelte/Angular/Solid adapters would build on; the pure `computeCadence`, `chunkWords`, and quote-sequencer helpers are exported from the root too.

## Web component (`<capicola-caption>`)

Drop-in for any framework or plain HTML. Registering the element is a side-effect import:

```ts
import "capicola/web-component"
import "capicola/styles.css"
```

```html
<capicola-caption
  text="This caption paces itself, word by word."
  preset="color"
></capicola-caption>
```

String props are attributes (`text`, `mode`, `placement`, `preset`, `width`, `align`, `anchor-x`, `anchor-y`, `offset`); object props are set in JS (`el.quotes = [...]`, `el.appearance = {...}`, `el.anchorEl = ...`). It renders in **light DOM** by default (both placements, uses the global stylesheet); add the `shadow` attribute for a **self-contained shadow root** (styles adopted automatically, inline placement only).

## Presets

Set `preset` to pick a named style template, then override any individual token with `appearance` (appearance wins). Tokens are orthogonal, so combinations Just Work — e.g. `preset="bubble"` plus an `appearance.highlightColor` gives a per-word box on top of a line bubble.

| Preset   | Description                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| `box`    | Condensed heavy caps with a pink gradient box behind the active word. The signature look (also the stylesheet default). |
| `color`  | Heavy Inter with a black outline; the active word recolours to gold — no box.                                           |
| `bubble` | Clean semibold Inter, no outline, on a translucent dark bubble behind the whole line. Subtitle-sized.                   |
| `plain`  | Heavy Inter with a black outline and no per-word highlight or pop at all.                                               |

```tsx
// Preset as-is:
<Capicola open anchorRef={anchor} text="…" preset="bubble" />

// Preset + targeted overrides:
<Capicola
  open
  anchorRef={anchor}
  text="…"
  preset="color"
  appearance={{ highlightTextColor: "#38BDF8", fontSizePx: 40 }}
/>
```

> Note: when no `preset` is set, the component renders the stylesheet defaults directly — which closely match the `box` look.

## Placement

`placement` chooses where the caption renders, independent of everything else (preset, mode, drive mode):

- **`"anchored"`** (default) — the classic overlay. Capicola appends into `document.body`, renders `position: fixed`, and positions itself against the anchor with the 3×3 anchor grid and collision-aware flip. This is the original behaviour.
- **`"inline"`** — a normal in-flow block. The caption renders `position: relative` right where `<Capicola>` sits in your tree, participating in layout like any other element. `anchorRef` is ignored, and so are the anchoring props (`anchorX`, `anchorY`, `offset`).

```tsx
// Anchored (default) — pinned overlay, needs an anchorRef:
<Capicola open anchorRef={anchor} text="Pinned to the target." />

// Inline — flows in the document, no anchor:
<Capicola placement="inline" text="Rendered right here, in flow." />
```

> **Backward compatible.** `placement` defaults to `"anchored"`, so existing `<Capicola open anchorRef text />` usage is unchanged. `open` now defaults to `true` (so inline/quote content autoplays on mount), and `anchorRef` is only required when `placement="anchored"`.

## Quote mode

Set `mode="quote"` and pass `quotes` to turn Capicola into a featured-quote reel. The whole quote is visible at once and the highlight sweeps **only** the quote words, left to right; a separately-styled author attribution stays static beside it. After the sweep the reel dwells on the author (a read-pause), then crossfades to the next quote and — by default — loops.

```tsx
<Capicola
  placement="inline"
  mode="quote"
  quotes={[
    { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
    {
      text: "The details are not the details. They make the design.",
      author: "Charles Eames",
    },
  ]}
/>
```

Behaviour:

- **Whole quote visible** — quote mode forces a single chunk, so every word shows at once; the sweep is a highlight moving across the static line, not a paging animation.
- **Author never highlighted** — the author renders as its own element (never part of the swept words), so the highlight can never land on it. Style it via `authorAppearance` (see below).
- **Author dwell** — after a quote finishes sweeping, the reel holds on the author for `authorPauseMs` (default `1600`) before advancing.
- **Auto-cycle + loop** — the reel walks `quotes` in order. With `loop` (default `true`) it wraps from the last quote back to the first after `loopPauseMs` (defaults to `authorPauseMs`); with `loop: false` it freezes on the last quote's author and stops.
- **Crossfade** — quote-to-quote transitions crossfade, reusing the page-fade tokens (`--cap-scroll-duration` / `--cap-scroll-easing`).
- **Accessible** — each quote is exposed to assistive tech as a single labeled group reading `quote — author`; the decorative quotation marks and separator are `aria-hidden`. Motion respects `prefers-reduced-motion`.

### Quotation marks & separator

Capicola wraps the quote text in typographic quotation marks and prepends a separator to the author. Each mark is individually configurable through the `quote` options, and any of them can be set to `""` (empty string) to render none:

```tsx
<Capicola
  placement="inline"
  mode="quote"
  quotes={QUOTES}
  quote={{
    authorPauseMs: 2000,
    openQuote: "«",
    closeQuote: "»",
    authorSeparator: "~ ",
  }}
/>

// Bare quote, no marks or separator:
<Capicola
  placement="inline"
  mode="quote"
  quotes={QUOTES}
  quote={{ openQuote: "", closeQuote: "", authorSeparator: "" }}
/>
```

### Styling the author

The author attribution has its own theme, `authorAppearance`, with the exact same token shape as `appearance`. It maps to a parallel set of `--cap-author-*` CSS variables (see the token table), so you can give the author a different font, size, weight, or colour from the quote body. Author tokens mirror the quote's typography/stroke/shadow but never carry the per-word highlight box.

```tsx
<Capicola
  placement="inline"
  mode="quote"
  quotes={QUOTES}
  appearance={{ fontSizePx: 40 }}
  authorAppearance={{
    fontSizePx: 22,
    fontWeight: 600,
    textColor: "#9CA3AF",
    textTransform: "none",
  }}
/>
```

## Theming

Set a `preset`, then override any individual token through the typed `appearance` prop (or raw `--cap-*` CSS variables). Every token maps 1:1 to a CSS custom property — so a config reads exactly like the result it produces.

<p align="center"><img src="https://raw.githubusercontent.com/michaelandrewgamble/capicola/main/docs/expanded-config.png" width="820" alt="A Capicola appearance config and the caption it renders, side by side" /></p>

There are two equivalent routes; pick whichever fits your codebase. `appearance` is a thin typed wrapper that writes the very same `--cap-*` variables.

**1. The `appearance` prop (typed tokens):**

```tsx
<Capicola
  open
  anchorRef={anchor}
  text="…"
  appearance={{
    fontFamily: "'Anton', sans-serif",
    fontSizePx: 44,
    highlightColor: "#111827",
    highlightTextColor: "#F9FAFB",
    highlightRadiusPx: 12,
  }}
/>
```

**2. Raw `--cap-*` CSS variables:**

```tsx
<Capicola open anchorRef={anchor} text="…" className="my-caption" />
```

```css
.my-caption {
  --cap-font-size: 44px;
  --cap-highlight-color: #111827;
  --cap-highlight-text-color: #f9fafb;
  --cap-highlight-radius: 12px;
}
```

Precedence is: stylesheet defaults → `preset` → `appearance` (and inline `--cap-*` written by `appearance`) → any `--cap-*` you set via `className`.

Every prop and token is also a live control in the [Storybook playground](https://michaelandrewgamble.github.io/capicola/?path=/story/components-capicola--playground) — a live preview with a searchable Google-font picker up top, then settings, per-color opacity, stroke/shadow, chunking, layout, and cadence:

<p align="center"><img src="https://raw.githubusercontent.com/michaelandrewgamble/capicola/main/docs/config-options.png" width="560" alt="The full set of Capicola configuration options as live Storybook controls" /></p>

## How it works

### Cadence

In cadence mode Capicola derives per-word timings from `text` — no audio required. The **reading** model (default) holds each word for `charCount / cps` seconds, clamped between `minWordDuration` and `maxWordDuration`, so pacing scales directly with the `cps` dial and stays comfortable to read along with. The **speech** model instead uses a prosody model (function-word reduction, phrase-final lengthening) that sounds like spoken narration. Both models add a `commaPause` after commas/semicolons/colons and a longer `sentencePause` after sentence enders, so the highlight breathes at punctuation.

### Chunking

Words are grouped into on-screen "pages" that the highlight sweeps across. `pause` mode (CapCut's behaviour) cuts a new page when the gap between two words exceeds `gapThreshold`, after a sentence-ending word (when `breakOnPunctuation`), or at `maxWords`. `width` mode ignores gaps and greedily packs as many words as fit the resolved box width, wrapping up to `maxLines` before paging. During a punctuation beat (when no word is active) the current page is held rather than snapping back to the first page.

### Anchoring

The caption is portaled to `document.body` and positioned `fixed` against `anchorRef`. `anchorX` (`left`/`center`/`right`) and `anchorY` (`top`/`middle`/`bottom`) form a 3×3 grid — e.g. `top`+`center` sits above and centred, `middle`+`center` overlays the target, `middle`+`left` sits to its left. Edge positions are pushed out by `offset` px. Set `anchorY="auto"` for collision awareness: it prefers above, flips below when there isn't room above in the viewport, and re-evaluates as the page scrolls so the caption stays visible. Position tracks the anchor live via `ResizeObserver` plus scroll/resize listeners.

## API reference

The `<Capicola>` props below are also the engine's options — `createCapicola(el, options)` and `<capicola-caption>` take the same surface, except `anchorRef` (a React ref) becomes **`anchorEl`** (a raw `HTMLElement`).

### `CapicolaProps`

| Prop               | Type                                        | Default      | Description                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`             | `boolean`                                   | `true`       | Mounts + plays when `true`; resets and hides when `false`.                                                                                                                                                                                                                                                                                                                                         |
| `anchorRef`        | `React.RefObject<HTMLElement \| null>`      | `undefined`  | The element the caption is positioned against. Required (and only used) when `placement="anchored"`.                                                                                                                                                                                                                                                                                               |
| `placement`        | `"anchored" \| "inline"`                    | `"anchored"` | Where the caption renders: pinned overlay portaled to `document.body`, or a normal in-flow block. See [Placement](#placement).                                                                                                                                                                                                                                                                     |
| `mode`             | `"caption" \| "quote"`                      | `"caption"`  | What the engine sweeps: the rolling word-by-word caption, or the featured-quote reel. See [Quote mode](#quote-mode).                                                                                                                                                                                                                                                                               |
| `quotes`           | `Quote[]`                                   | `undefined`  | The featured quotes for `mode="quote"`; the reel cycles through them in order. Ignored in caption mode.                                                                                                                                                                                                                                                                                            |
| `authorAppearance` | `CaptionTheme`                              | `undefined`  | Aesthetic overrides for the quote author (quote mode), applied as `--cap-author-*` variables.                                                                                                                                                                                                                                                                                                      |
| `quote`            | `QuoteOptions`                              | see below    | Tuning for the quote reel (pauses, looping, quotation marks, separator).                                                                                                                                                                                                                                                                                                                           |
| `audioSrc`         | `string`                                    | `undefined`  | Audio-mode narration URL/path. Provide alongside `words`.                                                                                                                                                                                                                                                                                                                                          |
| `words`            | `WordTiming[]`                              | `undefined`  | Audio-mode word timings (seconds). When present, drives the highlight from the audio clock.                                                                                                                                                                                                                                                                                                        |
| `text`             | `string`                                    | `undefined`  | Cadence-mode text; per-word timings are computed from `cadence`.                                                                                                                                                                                                                                                                                                                                   |
| `cadence`          | `CadenceOptions`                            | see below    | Tuning for cadence mode's per-word pacing.                                                                                                                                                                                                                                                                                                                                                         |
| `chunking`         | `ChunkingOptions`                           | see below    | How words are grouped into on-screen pages.                                                                                                                                                                                                                                                                                                                                                        |
| `width`            | `number \| "parent" \| "auto"`              | `"auto"`     | Box width source: hug content (`"auto"`), match the caption's flow container (`"parent"`, live — the anchor's parent when anchored, the mount element when inline), or a max width in px (`number`).                                                                                                                                                                                               |
| `align`            | `"left" \| "center" \| "right"`             | `"center"`   | Horizontal alignment of the text within the box when the box is wider than the content.                                                                                                                                                                                                                                                                                                            |
| `balance`          | `boolean`                                   | `false`      | Balance wrapped lines to the narrowest width that keeps the same line count — even lines, no orphan word (the react-wrap-balancer effect, on the word track). In quote mode it is also **sentence-aware**: each sentence starts on its own line, so a word never strands onto a line with a different sentence. Needs a resolved `width` (`number` \| `"parent"`); no-op for single-line captions. |
| `anchorX`          | `"left" \| "center" \| "right"`             | `"center"`   | Horizontal anchor position relative to the target.                                                                                                                                                                                                                                                                                                                                                 |
| `anchorY`          | `"top" \| "middle" \| "bottom" \| "auto"`   | `"top"`      | Vertical anchor position: above / over / below the target, or collision-aware `"auto"`.                                                                                                                                                                                                                                                                                                            |
| `offset`           | `number`                                    | `8`          | Gap (px) pushed outward for edge positions. Ignored for `center`/`middle`.                                                                                                                                                                                                                                                                                                                         |
| `preset`           | `"box" \| "color" \| "bubble" \| "plain"`   | `undefined`  | Named style template; `appearance` merges on top.                                                                                                                                                                                                                                                                                                                                                  |
| `appearance`       | `CaptionTheme`                              | `undefined`  | Aesthetic token overrides, merged over the preset (or defaults) and applied as `--cap-*` variables.                                                                                                                                                                                                                                                                                                |
| `onWordChange`     | `(index: number, word: WordTiming) => void` | `undefined`  | Fires whenever the active word index changes. Good for analytics.                                                                                                                                                                                                                                                                                                                                  |
| `onEnded`          | `() => void`                                | `undefined`  | Fires once the sequence/audio completes.                                                                                                                                                                                                                                                                                                                                                           |
| `className`        | `string`                                    | `undefined`  | Extra class on the caption root — the escape hatch for raw `--cap-*` overrides.                                                                                                                                                                                                                                                                                                                    |

Provide **either** `text` (cadence mode) **or** `words` + `audioSrc` (audio mode). If both `words` and `text` are supplied, `words` wins.

#### `WordTiming`

| Field   | Type     | Description                                          |
| ------- | -------- | ---------------------------------------------------- |
| `text`  | `string` | The word to display.                                 |
| `start` | `number` | Seconds from start when the word becomes active.     |
| `end`   | `number` | Seconds from start when the word stops being active. |

### `CadenceOptions` (cadence mode)

| Option              | Type                    | Default     | Description                                                                                                                                |
| ------------------- | ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `style`             | `"reading" \| "speech"` | `"reading"` | Pacing model. `reading` is char-proportional (subtitle CPS, tuned for comprehension); `speech` is a prosody model that sounds like speech. |
| `cps`               | `number`                | `15`        | Characters per second (reading model). ~15 comfortable, ~25 fast.                                                                          |
| `minWordDuration`   | `number`                | `0.2`       | Per-word floor, seconds — keeps a highlight trackable.                                                                                     |
| `maxWordDuration`   | `number`                | `0.7`       | Per-word ceiling, seconds — long words don't stall.                                                                                        |
| `commaPause`        | `number`                | `0.8`       | Extra dwell after a comma / semicolon / colon, seconds (both models). The highlight clears during the beat.                                |
| `sentencePause`     | `number`                | `0.8`       | Extra dwell after a sentence ender (`.` `!` `?`), seconds (both models). The highlight clears during the beat.                             |
| `rate`              | `number`                | `165`       | Approximate words-per-minute baseline (speech model).                                                                                      |
| `perSyllable`       | `number`                | `0.05`      | Seconds added per syllable beyond the first (speech model).                                                                                |
| `functionWordScale` | `number`                | `0.62`      | Multiplier for unstressed function words (speech model).                                                                                   |
| `phraseFinalScale`  | `number`                | `1.18`      | Multiplier for the last word before a boundary (speech model).                                                                             |

### `ChunkingOptions`

| Option               | Type                 | Default   | Description                                                                                                                                           |
| -------------------- | -------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`               | `"pause" \| "width"` | `"pause"` | `pause` cuts pages on word-gaps + sentence punctuation (CapCut-style); `width` greedily packs as many words as fit the box.                           |
| `maxWords`           | `number`             | `4`       | Hard cap on words per page (both modes).                                                                                                              |
| `gapThreshold`       | `number`             | `0.5`     | Pause mode: a gap (seconds) larger than this between two words starts a new page.                                                                     |
| `breakOnPunctuation` | `boolean`            | `true`    | Always end a page after a sentence-ending word, even mid-pack.                                                                                        |
| `maxLines`           | `number`             | `2`       | Max lines a page may wrap to before paging. Only engages when a box width is resolved (`width` = `number` \| `"parent"`); single-line under `"auto"`. |

> `width` chunking requires a resolved numeric box width. Under `width: "auto"` it falls back to `maxWords`-only packing.

### `Quote` (quote mode)

| Field    | Type     | Description                                                            |
| -------- | -------- | ---------------------------------------------------------------------- |
| `text`   | `string` | The quote body — the words the highlight sweeps across.                |
| `author` | `string` | Optional attribution. Rendered as its own static element, never swept. |

### `QuoteOptions` (quote mode)

All optional; defaults keep the reference look. `openQuote`, `closeQuote`, and `authorSeparator` may each be set to `""` (empty string) to render none.

| Option            | Type      | Default         | Description                                                        |
| ----------------- | --------- | --------------- | ------------------------------------------------------------------ |
| `authorPauseMs`   | `number`  | `1600`          | Extra dwell on the author after a quote's sweep finishes, ms.      |
| `loop`            | `boolean` | `true`          | Auto-cycle and loop back to the first quote after the last.        |
| `loopPauseMs`     | `number`  | `authorPauseMs` | Dwell before looping from the last quote back to the first, ms.    |
| `openQuote`       | `string`  | `"“"`           | Opening quotation mark wrapped around the quote text. `""` = none. |
| `closeQuote`      | `string`  | `"”"`           | Closing quotation mark wrapped around the quote text. `""` = none. |
| `authorSeparator` | `string`  | `"— "`          | Separator prepended to the author attribution. `""` = none.        |

### `CaptionTheme` tokens (used by `appearance` and each preset)

Every token maps to a `--cap-*` CSS custom property. Omit a token and the CSS default (below) applies. Values are all optional.

| Token                  | Type                                                   | CSS variable                                       | Default                                             |
| ---------------------- | ------------------------------------------------------ | -------------------------------------------------- | --------------------------------------------------- |
| `fontFamily`           | `string`                                               | `--cap-font-family`                                | `'Barlow Condensed', 'Arial Narrow', sans-serif`    |
| `fontWeight`           | `number \| string`                                     | `--cap-font-weight`                                | `900`                                               |
| `fontSizePx`           | `number`                                               | `--cap-font-size`                                  | `30px`                                              |
| `lineHeight`           | `number`                                               | `--cap-line-height`                                | `1.25`                                              |
| `letterSpacingEm`      | `number`                                               | `--cap-letter-spacing`                             | `0.02em`                                            |
| `textTransform`        | `"uppercase" \| "none" \| "lowercase" \| "capitalize"` | `--cap-text-transform`                             | `uppercase`                                         |
| `textColor`            | `string`                                               | `--cap-text-color`                                 | `#ffffff`                                           |
| `strokeColor`          | `string`                                               | `--cap-stroke-color`                               | `#000000`                                           |
| `strokeWidthPx`        | `number`                                               | `--cap-stroke-width`                               | `3px`                                               |
| `shadowColor`          | `string`                                               | `--cap-shadow-color`                               | `rgba(0,0,0,0.55)`                                  |
| `shadowBlurPx`         | `number`                                               | `--cap-shadow-blur`                                | `5px`                                               |
| `shadowDistancePx`     | `number`                                               | `--cap-shadow-offset-x` / `--cap-shadow-offset-y`* | `0px` / `4px`                                       |
| `shadowAngleDeg`       | `number`                                               | resolves into `--cap-shadow-offset-x/y`*           | —                                                   |
| `highlightColor`       | `string`                                               | `--cap-highlight-color`                            | `linear-gradient(180deg, #E62E64 0%, #C4124C 100%)` |
| `highlightTextColor`   | `string`                                               | `--cap-highlight-text-color`                       | `#ffffff`                                           |
| `highlightPaddingXPx`  | `number`                                               | `--cap-highlight-padding-x`                        | `8px`                                               |
| `highlightPaddingYPx`  | `number`                                               | `--cap-highlight-padding-y`                        | `3px`                                               |
| `highlightRadiusPx`    | `number`                                               | `--cap-highlight-radius`                           | `8px`                                               |
| `highlightOpacity`     | `number`                                               | `--cap-highlight-opacity`                          | `1`                                                 |
| `backgroundColor`      | `string`                                               | `--cap-background-color`                           | `transparent`                                       |
| `backgroundPaddingXPx` | `number`                                               | `--cap-background-padding-x`                       | `0px`                                               |
| `backgroundPaddingYPx` | `number`                                               | `--cap-background-padding-y`                       | `0px`                                               |
| `backgroundRadiusPx`   | `number`                                               | `--cap-background-radius`                          | `0px`                                               |
| `popScale`             | `number`                                               | `--cap-pop-scale`                                  | `1`                                                 |
| `popDurationMs`        | `number`                                               | `--cap-pop-duration`                               | `150ms`                                             |
| `popEasing`            | `string`                                               | `--cap-pop-easing`                                 | `ease-out`                                          |
| `wordGapEm`            | `number`                                               | `--cap-word-gap`                                   | `0.62em`                                            |

\* The drop shadow is expressed as a **distance + angle** in tokens (like CapCut) and resolved into x/y offsets. When you set only `shadowDistancePx`, it maps to `--cap-shadow-offset-y`. Set both `shadowDistancePx` and `shadowAngleDeg` for a directional offset. The `--cap-shadow-offset-x` / `--cap-shadow-offset-y` variables can also be set directly via CSS.

> The stylesheet also exposes `--cap-scroll-duration` (`150ms`) and `--cap-scroll-easing` (`ease-out`) for the page fade-in — reused for the quote-to-quote crossfade in quote mode. These have no `appearance` token — set them via CSS if you want to retune the paging/crossfade transition.

#### `--cap-author-*` tokens (author attribution, quote mode)

The quote author is themed separately from the quote body. Every `CaptionTheme` token above has a parallel `--cap-author-*` custom property, written by the `authorAppearance` prop (which shares the `CaptionTheme` shape). The naming mirrors the base set one-to-one — swap the `--cap-` prefix for `--cap-author-`:

| `appearance` token / `--cap-*`                        | Author equivalent (`--cap-author-*`)                      |
| ----------------------------------------------------- | --------------------------------------------------------- |
| `--cap-font-family`                                   | `--cap-author-font-family`                                |
| `--cap-font-weight`                                   | `--cap-author-font-weight`                                |
| `--cap-font-size`                                     | `--cap-author-font-size`                                  |
| `--cap-line-height`                                   | `--cap-author-line-height`                                |
| `--cap-text-color`                                    | `--cap-author-text-color`                                 |
| `--cap-stroke-color` / `--cap-stroke-width`           | `--cap-author-stroke-color` / `--cap-author-stroke-width` |
| `--cap-shadow-*`                                      | `--cap-author-shadow-*`                                   |
| …every other `--cap-*` typography/stroke/shadow token | …its `--cap-author-*` counterpart                         |

The author carries **no** per-word highlight box (the `highlight*` tokens don't apply — the author is never swept). By default it renders a touch smaller and lighter than the quote body — `--cap-author-font-size` is `19px`, `--cap-author-font-weight` is `600`, and `--cap-author-text-transform` is `none` — while colour, stroke, and shadow inherit the corresponding `--cap-*` quote value unless overridden. Set any of these via `authorAppearance` (typed) or raw `--cap-author-*` CSS on `className`.

## Caption CLI

The `capicola-caption` CLI generates `*.caption.json` files (matching `CaptionData`) that spread straight into `<Capicola {...caption} />`.

```sh
# From existing audio — word-level transcription via WhisperX
npx capicola-caption --from-audio narration.mp3 --name my-caption --out ./assets

# TTS with word marks — Amazon Polly
npx capicola-caption --tts "Hello world, this is a caption." \
  --provider polly --voice Joanna --name my-caption --out ./assets

# TTS with word marks — ElevenLabs
npx capicola-caption --tts "Hello world, this is a caption." \
  --provider elevenlabs --voice 21m00Tcm4TlvDq8ikWAM --name my-caption --out ./assets
```

- **`--from-audio`** transcribes an audio file at the word level with [WhisperX](https://github.com/m-bain/whisperX) (`pip install whisperx`; model overridable via `WHISPERX_MODEL`).
- **`--tts`** synthesizes speech and emits both the audio and word timings in one step, via **Amazon Polly** (needs the AWS CLI + credentials) or **ElevenLabs** (needs `ELEVENLABS_API_KEY`).

The CLI uses only Node.js built-ins — no `npm install` to run it. External tools/keys are checked at runtime, with clear guidance and a non-zero exit when something is missing. See [`scripts/README.md`](./scripts/README.md) for the full option reference and output format.

## Fonts

The default font is **Barlow Condensed** (first in the `--cap-font-family` stack, weight `900`). Load it for the reference look — it isn't bundled:

```html
<!-- Google Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link
  href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;900&display=swap"
  rel="stylesheet"
/>
```

```sh
# or via @fontsource
pnpm add @fontsource/barlow-condensed
```

Any font works — set `--cap-font-family` or `appearance.fontFamily` (the `color`, `bubble`, and `plain` presets use Inter). Capicola waits for the requested webfont to load before revealing the caption, so there's no flash of the fallback face.

## SSR & Next.js

Capicola is client-side: it measures the DOM and, for anchored placement, appends into `document.body`, so it only runs on the client (the React wrapper creates the engine in an effect, after hydration). In the **Next.js App Router**, import `capicola/react` from a Client Component (add `"use client"` at the top of that file). No other configuration is needed. The `createCapicola` engine and the `<capicola-caption>` web component are likewise client-only — call/mount them in the browser.

## Browser support

Capicola targets modern evergreen browsers. The outline is rendered with `-webkit-text-stroke` + `paint-order: stroke fill` (Chromium, Safari, and Firefox all support these). Anchored positioning appends into `document.body` with `position: fixed`. Motion respects `prefers-reduced-motion` (the pop and page fade are disabled).

## Bundle size & tree-shaking

The core engine is small (well under 12 kB gzipped) and ships **ESM + CJS** with `"sideEffects"` set so bundlers tree-shake freely; the stylesheet is a separate `capicola/styles.css` import. The core has **zero runtime dependencies**; the React adapter's only (optional) peer is `react` itself.

## Stability

Capicola is pre-1.0 (`0.x`) and follows semver: while `0.x`, minor versions may contain breaking changes and patch versions are safe. The prop names and `--cap-*` variables in this README are the intended stable surface; changes are called out in the [CHANGELOG](./CHANGELOG.md).

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) to get started.

## Links

- **Live demo / Storybook** — [michaelandrewgamble.github.io/capicola](https://michaelandrewgamble.github.io/capicola/)
- **Changelog** — [CHANGELOG.md](./CHANGELOG.md)
- **Contributing** — [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Security policy** — [SECURITY.md](./SECURITY.md)

## License

[MIT](./LICENSE) © Michael Gamble
