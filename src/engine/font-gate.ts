import { weightInFace } from "../theme"

/** A single font face to await (normalised family name + numeric weight). */
export interface FontTarget {
  family: string
  weight: number
}

/** Options for `awaitFonts`. */
export interface AwaitFontsOptions {
  /** Safety cap (ms): reveal even if the face never reports loaded. Default 3000. */
  timeoutMs?: number
}

/** Handle returned by `awaitFonts` — cancel the pending rAF poll on teardown. */
export interface FontGate {
  cancel: () => void
}

/**
 * De-hooked FontFaceSet rAF-poll gate: resolve once every target face is registered
 * AND loaded (kicking off unloaded faces), or after `timeoutMs` (default 3000).
 * Calls `onReady` at most once. When `document.fonts` is unavailable, readies
 * synchronously.
 *
 * Verbatim port of the font-load effect in the React component
 * (`capicola.tsx` ~388-488): gates on the actual FontFace status (not
 * `fonts.check()`), because on a cold load the gate can run before the
 * `@font-face` is registered and `check()` would then release one frame early
 * (the FOUT). We wait until the specific face is both registered AND loaded.
 */
export function awaitFonts(
  targets: FontTarget[],
  onReady: () => void,
  options?: AwaitFontsOptions,
): FontGate {
  const timeoutMs = options?.timeoutMs ?? 3000

  let destroyed = false
  let released = false
  const release = () => {
    if (destroyed || released) return
    released = true
    onReady()
  }

  const fonts =
    typeof document !== "undefined"
      ? (document as Document & { fonts?: FontFaceSet }).fonts
      : undefined

  // No FontFaceSet (SSR / older engines) → nothing to await, reveal now.
  if (!fonts) {
    release()
    return {
      cancel() {
        destroyed = true
      },
    }
  }

  let raf = 0
  const start = Date.now()

  // A single target family+weight is loaded (kicking off unloaded faces).
  const faceReady = (family: string, wantWeight: number) => {
    const faces: FontFace[] = []
    fonts.forEach((ff) => {
      if (ff.family.replace(/['"]/g, "").toLowerCase() === family) faces.push(ff)
    })
    if (faces.length === 0) return false // family not registered yet
    // Prefer the requested weight; if that weight isn't available (e.g. a
    // single-weight font like Anton at 900), accept ANY loaded face of the
    // family — the browser faux-bolds. Kick off loads for the relevant ones.
    const exact = faces.filter((ff) => weightInFace(ff.weight, wantWeight))
    const relevant = exact.length ? exact : faces
    for (const ff of relevant) {
      if (ff.status === "unloaded") {
        try {
          void ff.load()
        } catch {
          /* ignore */
        }
      }
    }
    return relevant.some((ff) => ff.status === "loaded")
  }

  const isReady = () => {
    try {
      return targets.every((t) => faceReady(t.family, t.weight))
    } catch {
      return false
    }
  }

  const poll = () => {
    if (destroyed) return
    // Safety cap: never leave the caption invisible forever.
    if (isReady() || Date.now() - start > timeoutMs) {
      release()
      return
    }
    raf = requestAnimationFrame(poll)
  }
  poll()

  return {
    cancel() {
      destroyed = true
      cancelAnimationFrame(raf)
    },
  }
}
