# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
