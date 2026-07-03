// ─────────────────────────────────────────────────────────────────────────────
// Capicola core (`capicola`) — the framework-agnostic, React-FREE entry point.
//
// This barrel exposes the headless engine (`createCapicola`), the pure logic
// (cadence, chunking, quote sequencer), the theme mapping, and every agnostic type.
// It imports NO React (the `import type` in types.ts is erased at runtime). The
// React `<Capicola>` component lives at `capicola/react`.
// ─────────────────────────────────────────────────────────────────────────────

// ── headless engine ──
export { createCapicola } from "./engine/create-capicola"

// ── pure logic (DOM-free, unit-tested) ──
export { computeCadence } from "./cadence"
export { chunkWords, findChunkIndex } from "./chunking"
export type { Chunk, ChunkMeasure } from "./chunking"
export {
  initialQuoteState,
  advanceOnEnded,
  advanceAfterDwell,
  quoteWords,
  wrapQuote,
  composeAuthor,
  QUOTE_CHUNKING,
  DEFAULT_OPEN_QUOTE,
  DEFAULT_CLOSE_QUOTE,
  DEFAULT_AUTHOR_SEPARATOR,
} from "./quote-sequencer"
export type { QuoteSequencerState, AdvanceResult } from "./quote-sequencer"

// ── theme → CSS variables ──
export { themeToVars, mergeTheme, weightInFace, PRESETS, QUOTE_FADE_MS } from "./theme"

// ── public types (React-free) ──
export type {
  CapicolaOptions,
  CapicolaInstance,
  CaptionTheme,
  CaptionPreset,
  CaptionPlacement,
  CaptionMode,
  Quote,
  QuoteOptions,
  CaptionData,
  WordTiming,
  CadenceOptions,
  AnchorX,
  AnchorY,
  ChunkingOptions,
  CaptionWidth,
  CaptionAlign,
} from "./types"
