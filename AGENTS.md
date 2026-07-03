# AGENTS.md

Guidance for AI coding agents (and humans skimming for the essentials) working in
this repository. Follows the [agents.md](https://agents.md) convention.

## What this project is

**Capicola** renders a TikTok/CapCut-style narrated, word-by-word caption (and a
featured-quote reel). It's a **framework-agnostic engine** with thin adapters,
shipped as a multi-entry package:

- `capicola` — the headless engine `createCapicola(el, opts)` + the pure
  functions/types. **No framework, zero runtime dependencies.**
- `capicola/react` — the `<Capicola>` React component.
- `capicola/web-component` — the `<capicola-caption>` custom element.
- `capicola/styles.css` — the stylesheet (every `--cap-*` default).

`react` is an **optional** peer (only `capicola/react` needs it); there is no
`react-dom` dependency. There's also a build-time CLI (`capicola-caption`, in
`scripts/`) that generates word timings.

## Setup & commands

Package manager is **pnpm** (pinned via `packageManager`; use it, not npm/yarn).

```sh
pnpm install          # install deps
pnpm dev              # tsup in watch mode
pnpm build            # build dist/ (multi-entry ESM+CJS+d.ts) and copy capicola.css
pnpm typecheck        # tsc --noEmit (strict)
pnpm lint             # eslint src
pnpm test             # vitest (watch)
pnpm test:run         # vitest run (one-shot; this is what CI runs)
pnpm format           # prettier --write .
pnpm storybook        # run Storybook on :6006
pnpm build-storybook  # static Storybook (Node >=20.19 required)
```

Before a PR: `pnpm typecheck`, `pnpm lint`, and `pnpm test:run` must pass. CI runs
these on Node 18/20/22, plus two guard jobs: **`core-react-free`** (typechecks the
core + web-component entries with React uninstalled) and **`react18-types`** (checks
the `/react` entry against the React 18 floor).

## Architecture map

**Pure core** (no DOM, no framework — reusable verbatim, unit-tested in node):

| File                     | Responsibility                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`           | **Public contract.** Exported option/prop/theme types incl. `CapicolaOptions` (engine) — React-free (`anchorEl: HTMLElement`, not a ref). |
| `src/cadence.ts`         | `computeCadence(text, opts)` — per-word timings (reading CPS + speech models) with punctuation beats.                                     |
| `src/chunking.ts`        | `chunkWords()` groups words into pages (pause/width, maxLines); `findChunkIndex()`.                                                       |
| `src/quote-sequencer.ts` | Quote-reel state machine (`advanceOnEnded`/`advanceAfterDwell`) + mark/separator helpers.                                                 |
| `src/theme.ts`           | `themeToVars(theme, prefix)`, `PRESETS`, `mergeTheme`, `weightInFace`, `QUOTE_FADE_MS`.                                                   |

**Engine** (`src/engine/*`, DOM-touching but framework-free):

| File                        | Responsibility                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine/word-driver.ts`     | `createWordDriver(...)` — the rAF driver (audio-clock or wall-clock), `play/pause/reset/destroy`.                                                                                     |
| `engine/positioning.ts`     | Pure `computePosition`/`resolveAnchorY` (anchor math + collision auto-flip).                                                                                                          |
| `engine/font-gate.ts`       | `awaitFonts(...)` — FontFaceSet rAF poll (3s cap) that gates the reveal to avoid FOUT.                                                                                                |
| `engine/renderer.ts`        | `createRenderer()` — builds the caption DOM once, then does surgical updates (`setActive` toggles `data-active` on ≤2 spans/tick; `swapChunk` remounts a page / swaps quote content). |
| `engine/create-capicola.ts` | `createCapicola(el, opts)` orchestrator — wires the modules + observers/timers, owns `mount`/`update`/`destroy`.                                                                      |

**Entries & adapters:**

| File                   | Responsibility                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/index.ts`         | Core barrel (`.` export) — `createCapicola` + pure fns + core types. **Imports no React.**                                           |
| `src/react.tsx`        | `<Capicola>` wrapper + `CapicolaProps` (adapts `anchorRef` → `anchorEl`). The `/react` entry.                                        |
| `src/web-component.ts` | `<capicola-caption>` custom element. The `/web-component` entry.                                                                     |
| `src/capicola.css`     | All styles + every `--cap-*`/`--cap-author-*` default.                                                                               |
| `src/*.stories.tsx`    | Storybook: `capicola.stories.tsx` (React playground), `capicola.engine.stories.tsx` (vanilla), `capicola.web-component.stories.tsx`. |

## Conventions (match the existing code)

- **Style:** TypeScript, **double quotes, no semicolons, 2-space indent.** Run
  `pnpm format` if unsure. `strict` on; avoid `any`.
- **The React-free core is an invariant.** Nothing reachable from `src/index.ts`
  (the `.` entry) or `src/web-component.ts` may import `react`/`react-dom` — the
  `core-react-free` CI job enforces it. Keep React types (`RefObject`, etc.) out of
  the core: the engine takes a raw `HTMLElement` `anchorEl`; only `react.tsx` deals
  in refs. `CapicolaProps` lives in `react.tsx`, not `types.ts`.
- **`src/types.ts` is a contract.** Renaming/changing exported types is breaking —
  update the README prop/token tables, the JSDoc `@default`s, and the CHANGELOG in
  the same PR (the cadence defaults have a regression test guarding them).
- **Byte-identical DOM.** The engine must emit the exact same classes
  (`cap-root`/`--inline`, `cap-track`/`--quote`, `cap-measure`, `cap-word`,
  `cap-author`) and `--cap-*` inline vars the React render produced — that's what
  makes React/vanilla/web-component parity provable, and it's why `src/capicola.css`
  is effectively frozen.
- **Pure logic stays pure.** `cadence.ts`, `chunking.ts`, `quote-sequencer.ts`,
  `theme.ts`, and `positioning.ts` must not touch the DOM/`window`/`performance` —
  that keeps them node-unit-testable. Environmental code lives in the engine.
- **Anti-jitter CSS contract** (see `src/capicola.css` header): a word's layout
  footprint never changes when it becomes active — the highlight is a `::before`
  paint + a compositor `transform: scale()`. Preserve it.

## Testing

Pure-logic tests are node-env and live next to the code (`src/*.test.ts`). Engine
tests that need a DOM opt in per-file with `// @vitest-environment jsdom` and use
`vi.useFakeTimers()` + a rAF stub (see `engine/*.test.ts`). Keep tests deterministic.

## Gotchas

- **`web-component.ts` MUST stay in `package.json` `sideEffects`** — it registers the
  element via a top-level `customElements.define`; if bundlers treat it as
  side-effect-free they tree-shake the registration and `<capicola-caption>` silently
  never mounts.
- **`fontReady` persists across an open/close cycle** in the engine — fonts don't
  unload, so re-running the gate on every reopen would re-hit its 3s cap and stall a
  looped reel. A genuine font change re-gates via `update()`.
- **Anchored placement** appends the caption into `document.body` (`position: fixed`);
  inline placement renders in the mount element. The React wrapper is client-only
  (create in an effect) — SSR-safe.
- The default font (Barlow Condensed) is **not bundled**; the engine gates rendering
  on the requested webfont loading to avoid a fallback flash.
- Storybook 10 needs Node ≥20.19; the library itself builds on Node 18.
- Publishing is automated: tag `vX.Y.Z` → the Release workflow builds and (when an
  `NPM_TOKEN` secret exists) publishes with provenance.
