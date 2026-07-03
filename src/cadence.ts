import type { CadenceOptions, WordTiming } from "./types"

// ─── defaults ────────────────────────────────────────────────────────────────

// reading model
const DEFAULT_CPS = 15 // characters per second (comfortable read pace)
const DEFAULT_MIN_WORD_READING = 0.2 // floor: a highlight below ~0.2s can't be tracked
const DEFAULT_MAX_WORD = 0.7 // ceiling: a very long word doesn't stall the sweep

// shared — punctuation beats (real gaps; the highlight clears during them)
const DEFAULT_COMMA_PAUSE = 0.8
const DEFAULT_SENTENCE_PAUSE = 0.8

// speech model
const DEFAULT_RATE = 165 // wpm
const DEFAULT_MIN_WORD_SPEECH = 0.12
const DEFAULT_PER_SYLLABLE = 0.05
const DEFAULT_FUNCTION_WORD_SCALE = 0.62
const DEFAULT_PHRASE_FINAL_SCALE = 1.18

const FUNCTION_WORDS = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "these",
  "those",
  "my",
  "your",
  "his",
  "her",
  "its",
  "our",
  "their",
  "some",
  "any",
  "no",
  "each",
  "every",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "me",
  "him",
  "us",
  "them",
  "who",
  "whom",
  "whose",
  "which",
  "what",
  "of",
  "to",
  "in",
  "on",
  "at",
  "by",
  "for",
  "with",
  "from",
  "as",
  "into",
  "onto",
  "up",
  "out",
  "off",
  "over",
  "under",
  "about",
  "than",
  "through",
  "and",
  "or",
  "but",
  "nor",
  "so",
  "yet",
  "if",
  "then",
  "because",
  "while",
  "though",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "am",
  "do",
  "does",
  "did",
  "has",
  "have",
  "had",
  "will",
  "would",
  "can",
  "could",
  "shall",
  "should",
  "may",
  "might",
  "must",
  "not",
  "too",
  "very",
  "just",
  "also",
])

// ─── helpers ──────────────────────────────────────────────────────────────────

const COMMA_RE = /[,;:]$/
const SENTENCE_RE = /[.!?]$/

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "")
  if (w.length === 0) return 1
  const stripped = w.endsWith("e") && w.length > 2 ? w.slice(0, -1) : w
  const matches = stripped.match(/[aeiouy]+/g)
  return Math.max(1, matches ? matches.length : 1)
}

interface Token {
  rendered: string // shown text (keeps trailing punctuation)
  clean: string // alnum only, lowercased
  hasSentencePause: boolean
  hasCommaPause: boolean
  isLast: boolean
}

function parseTokens(text: string): Token[] {
  const raw = text.trim().split(/\s+/).filter(Boolean)
  return raw.map((token, i) => {
    const hasSentencePause = SENTENCE_RE.test(token)
    const hasCommaPause = !hasSentencePause && COMMA_RE.test(token)
    const rendered = token.replace(/^[^a-zA-Z0-9]+/, "").replace(/['")\]]+$/, "") || token
    const clean = rendered.toLowerCase().replace(/[^a-z0-9]/g, "")
    return {
      rendered,
      clean,
      hasSentencePause,
      hasCommaPause,
      isLast: i === raw.length - 1,
    }
  })
}

function dwellFor(t: Token, commaPause: number, sentencePause: number): number {
  return t.hasSentencePause ? sentencePause : t.hasCommaPause ? commaPause : 0
}

function assemble(
  tokens: Token[],
  durationOf: (t: Token) => number,
  commaPause: number,
  sentencePause: number,
): WordTiming[] {
  const timings: WordTiming[] = []
  let cursor = 0
  for (const t of tokens) {
    const start = cursor
    const end = start + durationOf(t)
    timings.push({ text: t.rendered, start, end })
    // The punctuation pause is a real GAP after the word — during it no word is
    // active, so the highlight clears for a beat, then resumes on the next word.
    cursor = end + dwellFor(t, commaPause, sentencePause)
  }
  return timings
}

// ─── reading model (default) ──────────────────────────────────────────────────

/**
 * Char-proportional reading cadence. Each word holds for charCount / cps, clamped
 * to a trackable floor and a ceiling. Grounded in subtitle CPS (~15-17 comfy) and
 * read-along/RSVP research (per-word ~0.2-0.3s, fully proportional to the dial).
 */
function computeReading(tokens: Token[], opts?: CadenceOptions): WordTiming[] {
  const cps = opts?.cps ?? DEFAULT_CPS
  const floor = opts?.minWordDuration ?? DEFAULT_MIN_WORD_READING
  const ceil = opts?.maxWordDuration ?? DEFAULT_MAX_WORD
  const commaPause = opts?.commaPause ?? DEFAULT_COMMA_PAUSE
  const sentencePause = opts?.sentencePause ?? DEFAULT_SENTENCE_PAUSE

  return assemble(
    tokens,
    (t) => {
      const chars = Math.max(1, t.clean.length)
      return Math.min(ceil, Math.max(floor, chars / cps))
    },
    commaPause,
    sentencePause,
  )
}

// ─── speech model (opt-in) ────────────────────────────────────────────────────

function computeSpeech(tokens: Token[], opts?: CadenceOptions): WordTiming[] {
  const rate = opts?.rate ?? DEFAULT_RATE
  const minWord = opts?.minWordDuration ?? DEFAULT_MIN_WORD_SPEECH
  const perSyllable = opts?.perSyllable ?? DEFAULT_PER_SYLLABLE
  const commaPause = opts?.commaPause ?? DEFAULT_COMMA_PAUSE
  const sentencePause = opts?.sentencePause ?? DEFAULT_SENTENCE_PAUSE
  const functionWordScale = opts?.functionWordScale ?? DEFAULT_FUNCTION_WORD_SCALE
  const phraseFinalScale = opts?.phraseFinalScale ?? DEFAULT_PHRASE_FINAL_SCALE
  const secondsPerWord = 60 / rate

  return assemble(
    tokens,
    (t) => {
      let d = secondsPerWord + (countSyllables(t.clean) - 1) * perSyllable
      if (FUNCTION_WORDS.has(t.clean)) d *= functionWordScale
      if (t.hasSentencePause || t.hasCommaPause || t.isLast) d *= phraseFinalScale
      return Math.max(minWord, d)
    },
    commaPause,
    sentencePause,
  )
}

// ─── main export ──────────────────────────────────────────────────────────────

/**
 * Compute per-word timing windows from text for silent (no-audio) cadence mode.
 * Default is the comprehension-tuned "reading" model; pass `style: "speech"` for
 * the prosody model. For exact timing, generate real word marks via the `caption`
 * CLI and use audio/words mode instead.
 *
 * Rendered `text` keeps trailing punctuation; leading quotes/brackets are trimmed.
 */
export function computeCadence(text: string, opts?: CadenceOptions): WordTiming[] {
  const tokens = parseTokens(text)
  if (tokens.length === 0) return []
  return (opts?.style ?? "reading") === "speech"
    ? computeSpeech(tokens, opts)
    : computeReading(tokens, opts)
}
