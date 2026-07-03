import type { WordTiming } from "../types"

// ─── binary search ────────────────────────────────────────────────────────────

/**
 * Return the index of the word that is active at `currentTime`, or -1 if
 * no word covers that time (before start or after last word).
 *
 * Words are non-overlapping and sorted by start time (guaranteed by
 * computeCadence and the caption CLI output format), so a binary search
 * gives O(log n) lookup per rAF tick.
 */
function findActiveIndex(words: WordTiming[], currentTime: number): number {
  if (words.length === 0) return -1

  let lo = 0
  let hi = words.length - 1

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const word = words[mid]

    if (currentTime < word.start) {
      hi = mid - 1
    } else if (currentTime >= word.end) {
      lo = mid + 1
    } else {
      // word.start <= currentTime < word.end → active
      return mid
    }
  }

  return -1
}

// ─── config / result types ──────────────────────────────────────────────────

/**
 * Configuration for `createWordDriver` — a de-hooked port of `useAudioWordSync`.
 *
 * Stable-prop refs become closures: the driver reads the live words + audio element
 * through getters (so the orchestrator can swap them without recreating the driver),
 * and reports the active-word index / lifecycle through callbacks.
 */
export interface WordDriverConfig {
  /** Live word timings (audio mode: opts.words; cadence mode: computeCadence(text)). */
  getWords: () => WordTiming[]
  /** The hidden `<audio>` element (audio mode), or null for wall-clock cadence mode. */
  getAudioEl: () => HTMLAudioElement | null
  /** Fires when the active-word index changes (index into words, or -1 when idle/beat). */
  onIndexChange: (index: number) => void
  /** Fires when a NEW word becomes active (never on -1). */
  onWordChange?: (index: number, word: WordTiming) => void
  /** Fires once when the sequence/audio completes. */
  onEnded: () => void
  /** Fires when the playing state flips (replaces the hook's `setIsPlaying`). */
  onPlayingChange?: (playing: boolean) => void
}

/** The imperative word-sync driver returned by `createWordDriver`. */
export interface WordDriver {
  play: () => void
  pause: () => void
  reset: () => void
  destroy: () => void
  /** The current active-word index (-1 when idle / before first word / during a beat). */
  readonly currentIndex: number
}

// ─── driver ───────────────────────────────────────────────────────────────────

/**
 * Create an imperative word-sync driver (rAF dual-clock: audio.currentTime or a
 * wall-clock). Verbatim port of the hook's tick/play/pause/reset/audio-listener
 * logic — `setActiveIndex`→`onIndexChange`, `setIsPlaying`→`onPlayingChange`, the
 * stable-prop refs→config closures, `useCallback`/`useEffect` dropped.
 */
export function createWordDriver(config: WordDriverConfig): WordDriver {
  const { getWords, getAudioEl, onIndexChange, onWordChange, onEnded, onPlayingChange } =
    config

  // Wall-clock start time for cadence (no-audio) mode.
  let startTime: number | null = null
  // Elapsed ms captured at pause time (cadence mode), so resume is accurate.
  let pausedElapsed: number | null = null
  // rAF handle.
  let raf: number | null = null
  // Track last active index to avoid redundant onWordChange calls (also the
  // publicly-exposed `currentIndex`).
  let currentIndex = -1
  // Whether we've already fired onEnded for this playthrough.
  let endedFired = false

  const setPlaying = (playing: boolean) => {
    onPlayingChange?.(playing)
  }

  // ── rAF tick ──────────────────────────────────────────────────────────────

  const tick = () => {
    const currentWords = getWords()

    // Resolve currentTime from audio element or wall-clock.
    let currentTime: number

    const audio = getAudioEl()
    if (audio) {
      currentTime = audio.currentTime
    } else {
      if (startTime === null) {
        // Not yet started — idle.
        raf = requestAnimationFrame(tick)
        return
      }
      currentTime = (performance.now() - startTime) / 1000
    }

    const idx = findActiveIndex(currentWords, currentTime)

    if (idx !== currentIndex) {
      currentIndex = idx
      onIndexChange(idx)
      if (idx !== -1 && onWordChange) {
        onWordChange(idx, currentWords[idx])
      }
    }

    // Check for sequence end (also fires immediately when words array is empty).
    const lastWord = currentWords[currentWords.length - 1]
    if (!endedFired && (currentWords.length === 0 || currentTime >= lastWord.end)) {
      endedFired = true
      raf = null
      setPlaying(false)
      onEnded()
      // Stop looping — sequence complete.
      return
    }

    raf = requestAnimationFrame(tick)
  }

  // ── cancel rAF ──────────────────────────────────────────────────────────────

  const cancelRaf = () => {
    if (raf !== null) {
      // Guard: requestAnimationFrame / cancelAnimationFrame exist in browsers
      // but not in SSR environments.
      if (typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(raf)
      }
      raf = null
    }
  }

  // ── reset internal state ─────────────────────────────────────────────────────

  const resetInternalState = () => {
    cancelRaf()
    startTime = null
    pausedElapsed = null
    currentIndex = -1
    endedFired = false
    onIndexChange(-1)
    setPlaying(false)
  }

  // ── public API ───────────────────────────────────────────────────────────────

  // Set by destroy(); guards the async audio.play() promise below from scheduling
  // a fresh rAF after teardown (the promise can resolve after destroy() ran).
  let destroyed = false

  const play = () => {
    // SSR guard — no rAF in Node/SSR.
    if (typeof requestAnimationFrame === "undefined") return

    const audio = getAudioEl()

    if (audio) {
      audio
        .play()
        .then(() => {
          if (destroyed) return
          endedFired = false
          setPlaying(true)
          // Kick off the loop if not already running.
          if (raf === null) {
            raf = requestAnimationFrame(tick)
          }
        })
        .catch(() => {
          // Autoplay blocked — roll back to idle state.
          cancelRaf()
          setPlaying(false)
        })
      return
    } else {
      // Cadence mode: stamp wall-clock start, honouring any paused elapsed time.
      if (pausedElapsed !== null) {
        // Resume from where we paused.
        startTime = performance.now() - pausedElapsed
        pausedElapsed = null
      } else if (startTime === null) {
        startTime = performance.now()
      }
    }

    endedFired = false
    setPlaying(true)

    // Kick off the loop if not already running.
    if (raf === null) {
      raf = requestAnimationFrame(tick)
    }
  }

  const pause = () => {
    const audio = getAudioEl()
    if (audio) {
      audio.pause()
    } else {
      // Cadence mode: capture elapsed ms so play() can resume accurately.
      if (startTime !== null) {
        pausedElapsed = performance.now() - startTime
        startTime = null
      }
    }
    cancelRaf()
    setPlaying(false)
  }

  const reset = () => {
    const audio = getAudioEl()
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    resetInternalState()
  }

  // ── audio element listeners (attach in constructor, remove in destroy) ───────

  // Capture the audio element once (parity with the hook's effect, which bound
  // handlers to `audioRef.current` at effect-run time).
  const audioEl = typeof window === "undefined" ? null : getAudioEl()

  const handlePlay = () => {
    endedFired = false
    setPlaying(true)
    if (raf === null) {
      raf = requestAnimationFrame(tick)
    }
  }

  const handlePause = () => {
    cancelRaf()
    setPlaying(false)
  }

  const handleEnded = () => {
    cancelRaf()
    setPlaying(false)
    if (!endedFired) {
      endedFired = true
      onEnded()
    }
  }

  const handleSeeked = () => {
    // Reset the ended-fired guard so onEnded can fire again if the user scrubs
    // backwards and plays through to the end a second time.
    const words = getWords()
    if (audioEl && audioEl.currentTime < (words[words.length - 1]?.end ?? 0)) {
      endedFired = false
    }
  }

  if (audioEl) {
    audioEl.addEventListener("play", handlePlay)
    audioEl.addEventListener("pause", handlePause)
    audioEl.addEventListener("ended", handleEnded)
    audioEl.addEventListener("seeked", handleSeeked)
  }

  // ── teardown ──────────────────────────────────────────────────────────────

  const destroy = () => {
    destroyed = true
    cancelRaf()
    if (audioEl) {
      audioEl.removeEventListener("play", handlePlay)
      audioEl.removeEventListener("pause", handlePause)
      audioEl.removeEventListener("ended", handleEnded)
      audioEl.removeEventListener("seeked", handleSeeked)
    }
  }

  return {
    play,
    pause,
    reset,
    destroy,
    get currentIndex() {
      return currentIndex
    },
  }
}
