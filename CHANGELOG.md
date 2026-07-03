# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`placement` axis** (`"anchored" | "inline"`) — render the caption as the
  classic `position: fixed` overlay portaled to `document.body` (anchored, the
  default), or as a normal in-flow block (`inline`) where `<Capicola>` sits in
  the tree. Fully backward compatible: `placement` defaults to `"anchored"`,
  `open` now defaults to `true`, and `anchorRef` is only required when anchored,
  so existing `<Capicola open anchorRef text />` usage is unchanged.
- **Quote mode** (`mode="quote"`) — a featured-quote reel. Pass `quotes`
  (`{ text, author? }[]`) and the whole quote shows at once while the highlight
  sweeps only the quote words; the author renders as its own static element and
  is never highlighted. Includes an author read-pause (dwell), auto-cycle with
  looping, and a crossfade between quotes (reusing the `--cap-scroll-*` tokens).
- **`QuoteOptions`** (`quote` prop) — configurable reel tuning: `authorPauseMs`
  (author dwell), `loop` + `loopPauseMs` (auto-cycle/loop), and individually
  configurable quotation marks and attribution separator (`openQuote`,
  `closeQuote`, `authorSeparator`), each settable to `""` for none.
- **`authorAppearance`** — a separate `CaptionTheme` for the quote author,
  applied as a parallel set of `--cap-author-*` CSS variables so the attribution
  can be styled independently of the quote body.

## [0.1.0] — Initial release

### Added

- Narrated, word-by-word caption component (`<Capicola />`) pinned to an
  anchor element via `createPortal`, in the CapCut/TikTok karaoke-caption
  style.
- Reading and speech cadence models for silent (no-audio) mode: a
  char-proportional "reading" model tuned for comprehension, and a
  prosody-aware "speech" model (function-word reduction, phrase-final
  lengthening), both with comma/sentence pause tuning.
- Pause- and width-based chunking into multi-word "pages," with multiline
  support and a greedy width-packing mode for fixed-width boxes.
- Two-axis anchoring (3×3 horizontal × vertical grid) with a collision-aware
  `"auto"` vertical mode that flips above/below the anchor to stay in the
  viewport as the page scrolls.
- Built-in style presets (`box`, `color`, `bubble`, `plain`) plus a themeable
  token surface (`CaptionTheme`) for full visual overrides.
- `caption` CLI (`scripts/caption.mjs`) for generating `CaptionData` JSON
  from existing audio via WhisperX transcription, or via TTS synthesis
  (Amazon Polly or ElevenLabs) with word-level timing marks — output is
  designed to spread directly into `<Capicola {...caption} />`.
