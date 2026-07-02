# AGENTS.md

Guidance for AI coding agents (and humans skimming for the essentials) working in
this repository. Follows the [agents.md](https://agents.md) convention.

## What this project is

**Capicola** is a self-contained React component that renders a TikTok/CapCut-style
narrated, word-by-word caption pinned to an anchor element. It ships as a library
(ESM + CJS + types via tsup) plus a Node CLI (`capicola-caption`) that generates
word timings. The only runtime dependencies are `react` and `react-dom`.

## Setup & commands

Package manager is **pnpm** (pinned via `packageManager`; use it, not npm/yarn).

```sh
pnpm install          # install deps
pnpm dev              # tsup in watch mode (rebuild dist on change)
pnpm build            # build dist/ (ESM+CJS+d.ts) and copy capicola.css
pnpm typecheck        # tsc --noEmit (strict)
pnpm lint             # eslint src
pnpm test             # vitest (watch)
pnpm test:run         # vitest run (one-shot; this is what CI runs)
pnpm format           # prettier --write .
pnpm storybook        # run Storybook locally on :6006
pnpm build-storybook  # static Storybook build (Node >=20.19 required)
```

Before opening a PR, make sure `pnpm typecheck`, `pnpm lint`, and `pnpm test:run`
all pass. CI (`.github/workflows/ci.yml`) runs these on Node 18/20/22.

## Architecture map

| File | Responsibility |
|------|----------------|
| `src/capicola.tsx` | The component. Portal render, 2-axis anchoring + collision flip, font-load gate, `CaptionTheme` → `--cap-*` inline vars, preset merge. |
| `src/cadence.ts` | Pure. `computeCadence(text, opts)` — derives per-word timings (reading CPS model + speech prosody model) with punctuation beats. |
| `src/chunking.ts` | Pure. `chunkWords()` groups words into on-screen pages (pause or width mode, maxLines); `findChunkIndex()` maps active word → page. |
| `src/use-audio-word-sync.ts` | Hook. Drives the active-word index from an audio element's clock or a wall-clock, via `requestAnimationFrame`. |
| `src/types.ts` | **Public API contract.** Exported prop/option/theme types. |
| `src/capicola.css` | All styles + every `--cap-*` custom property default. |
| `src/index.ts` | Public barrel — the package's entry point. |
| `src/capicola.stories.tsx` | Storybook playground / theme builder. |
| `scripts/caption.mjs` | The `capicola-caption` CLI (Node built-ins only). |

## Conventions (match the existing code)

- **Style:** TypeScript, **double quotes, no semicolons, 2-space indent.** Run
  `pnpm format` if unsure. `strict` is on; avoid `any`.
- **`src/types.ts` is a contract.** Renaming or changing exported types/fields is a
  breaking change — update the README table, the JSDoc `@default`s, and the
  CHANGELOG in the same PR. The docs and code defaults MUST agree (there is a
  regression test guarding the cadence defaults).
- **Pure logic stays pure.** `cadence.ts` and `chunking.ts` must not touch the DOM,
  `window`, or `Date.now()`-style nondeterminism — that's what keeps them unit
  testable. Put anything environmental in the component or the hook.
- **SSR safety.** The component may be imported into server-rendered trees
  (Next.js). Guard `window`/`document` access; the code uses a
  `useIsomorphicLayoutEffect` shim — don't reintroduce bare `useLayoutEffect`.
- **Anti-jitter CSS contract** (see the header comment in `src/capicola.css`): a
  word's layout footprint never changes when it becomes active. The highlight is a
  `::before` paint + a compositor `transform: scale()`, never a font-size/padding/
  weight change. Preserve this — it's the whole point of the visual quality.
- **Theming is one-way:** every `CaptionTheme` token maps 1:1 to a `--cap-*`
  variable in `themeToVars()`. Add a token ⇒ add the mapping ⇒ add the CSS default
  ⇒ add the README row.

## Testing

Unit tests live next to the code (`src/*.test.ts`) and run under Vitest (node
environment; the pure functions need no DOM). When you change `cadence.ts` or
`chunking.ts`, add/update tests with explicit numeric assertions derived from the
actual constants. Keep tests deterministic.

## Gotchas

- `dist/` is gitignored and rebuilt on install via the `prepare` script — this is
  what lets the package be consumed as a git dependency.
- The default font (Barlow Condensed) is **not bundled**; the component gates
  rendering on the requested webfont loading to avoid a fallback flash.
- Storybook 10 needs Node ≥20.19; the library itself builds on Node 18.
- Publishing is automated: tag `vX.Y.Z` → the Release workflow builds and (when an
  `NPM_TOKEN` secret exists) publishes with provenance.
