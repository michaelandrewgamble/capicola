import { useState, useEffect, useRef, useCallback } from "react"
import type { UseAudioWordSyncArgs, UseAudioWordSyncResult, WordTiming } from "./types"

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

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useAudioWordSync({
  open,
  words,
  audioRef,
  onWordChange,
  onEnded,
}: UseAudioWordSyncArgs): UseAudioWordSyncResult {
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)

  // Wall-clock start time for cadence (no-audio) mode.
  const startTimeRef = useRef<number | null>(null)
  // Elapsed ms captured at pause time (cadence mode), so resume is accurate.
  const pausedElapsedRef = useRef<number | null>(null)
  // rAF handle.
  const rafRef = useRef<number | null>(null)
  // Track last active index to avoid redundant onWordChange calls.
  const lastActiveIndexRef = useRef(-1)
  // Whether we've already fired onEnded for this playthrough.
  const endedFiredRef = useRef(false)

  // Stable refs so the rAF loop always sees the latest props without
  // needing to be recreated on every render.
  const wordsRef = useRef(words)
  wordsRef.current = words
  const onWordChangeRef = useRef(onWordChange)
  onWordChangeRef.current = onWordChange
  const onEndedRef = useRef(onEnded)
  onEndedRef.current = onEnded
  const audioRefRef = useRef(audioRef)
  audioRefRef.current = audioRef

  // ── rAF tick ────────────────────────────────────────────────────────────────

  const tick = useCallback(() => {
    const currentWords = wordsRef.current

    // Resolve currentTime from audio element or wall-clock.
    let currentTime: number

    const audio = audioRefRef.current?.current
    if (audio) {
      currentTime = audio.currentTime
    } else {
      if (startTimeRef.current === null) {
        // Not yet started — idle.
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      currentTime = (performance.now() - startTimeRef.current) / 1000
    }

    const idx = findActiveIndex(currentWords, currentTime)

    if (idx !== lastActiveIndexRef.current) {
      lastActiveIndexRef.current = idx
      setActiveIndex(idx)
      if (idx !== -1 && onWordChangeRef.current) {
        onWordChangeRef.current(idx, currentWords[idx])
      }
    }

    // Check for sequence end (also fires immediately when words array is empty).
    const lastWord = currentWords[currentWords.length - 1]
    if (
      !endedFiredRef.current &&
      (currentWords.length === 0 || currentTime >= lastWord.end)
    ) {
      endedFiredRef.current = true
      rafRef.current = null
      setIsPlaying(false)
      if (onEndedRef.current) {
        onEndedRef.current()
      }
      // Stop looping — sequence complete.
      return
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // ── cancel rAF ──────────────────────────────────────────────────────────────

  const cancelRaf = useCallback(() => {
    if (rafRef.current !== null) {
      // Guard: requestAnimationFrame / cancelAnimationFrame exist in browsers
      // but not in SSR environments.
      if (typeof cancelAnimationFrame !== "undefined") {
        cancelAnimationFrame(rafRef.current)
      }
      rafRef.current = null
    }
  }, [])

  // ── reset internal state ─────────────────────────────────────────────────────

  const resetInternalState = useCallback(() => {
    cancelRaf()
    startTimeRef.current = null
    pausedElapsedRef.current = null
    lastActiveIndexRef.current = -1
    endedFiredRef.current = false
    setActiveIndex(-1)
    setIsPlaying(false)
  }, [cancelRaf])

  // ── public API ───────────────────────────────────────────────────────────────

  const play = useCallback(() => {
    // SSR guard — no rAF in Node/SSR.
    if (typeof requestAnimationFrame === "undefined") return

    const audio = audioRefRef.current?.current

    if (audio) {
      audio.play().then(() => {
        endedFiredRef.current = false
        setIsPlaying(true)
        // Kick off the loop if not already running.
        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(tick)
        }
      }).catch(() => {
        // Autoplay blocked — roll back to idle state.
        cancelRaf()
        setIsPlaying(false)
      })
      return
    } else {
      // Cadence mode: stamp wall-clock start, honouring any paused elapsed time.
      if (pausedElapsedRef.current !== null) {
        // Resume from where we paused.
        startTimeRef.current = performance.now() - pausedElapsedRef.current
        pausedElapsedRef.current = null
      } else if (startTimeRef.current === null) {
        startTimeRef.current = performance.now()
      }
    }

    endedFiredRef.current = false
    setIsPlaying(true)

    // Kick off the loop if not already running.
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(tick)
    }
  }, [tick, cancelRaf])

  const pause = useCallback(() => {
    const audio = audioRefRef.current?.current
    if (audio) {
      audio.pause()
    } else {
      // Cadence mode: capture elapsed ms so play() can resume accurately.
      if (startTimeRef.current !== null) {
        pausedElapsedRef.current = performance.now() - startTimeRef.current
        startTimeRef.current = null
      }
    }
    cancelRaf()
    setIsPlaying(false)
  }, [cancelRaf])

  const reset = useCallback(() => {
    const audio = audioRefRef.current?.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    resetInternalState()
  }, [resetInternalState])

  // ── audio element listeners ──────────────────────────────────────────────────

  useEffect(() => {
    // SSR guard.
    if (typeof window === "undefined") return

    const audio = audioRef?.current
    if (!audio) return

    const handlePlay = () => {
      endedFiredRef.current = false
      setIsPlaying(true)
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    const handlePause = () => {
      cancelRaf()
      setIsPlaying(false)
    }

    const handleEnded = () => {
      cancelRaf()
      setIsPlaying(false)
      if (!endedFiredRef.current) {
        endedFiredRef.current = true
        onEndedRef.current?.()
      }
    }

    const handleSeeked = () => {
      // Reset the ended-fired guard so onEnded can fire again if the user
      // scrubs backwards and plays through to the end a second time.
      if (audio.currentTime < (wordsRef.current[wordsRef.current.length - 1]?.end ?? 0)) {
        endedFiredRef.current = false
      }
    }

    audio.addEventListener("play", handlePlay)
    audio.addEventListener("pause", handlePause)
    audio.addEventListener("ended", handleEnded)
    audio.addEventListener("seeked", handleSeeked)

    return () => {
      audio.removeEventListener("play", handlePlay)
      audio.removeEventListener("pause", handlePause)
      audio.removeEventListener("ended", handleEnded)
      audio.removeEventListener("seeked", handleSeeked)
    }
    // audioRef is a stable RefObject; tick and cancelRaf are stable callbacks.
  }, [audioRef, cancelRaf, tick])

  // ── cleanup when open becomes false, or on unmount ───────────────────────────

  useEffect(() => {
    if (!open) {
      // Pause audio if playing.
      const audio = audioRef?.current
      if (audio && !audio.paused) {
        audio.pause()
      }
      resetInternalState()
    }
    // Cleanup fires on unmount too (open might still be true, but the effect
    // cleanup always runs).
    return () => {
      cancelRaf()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return {
    activeIndex,
    isPlaying,
    play,
    pause,
    reset,
  }
}
