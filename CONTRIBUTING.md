# Contributing to Capicola

Thanks for your interest in improving Capicola. This document covers everything
you need to get a change from idea to merged PR.

## Prerequisites

- **Node.js >= 18**
- **pnpm** (this repo uses pnpm as its package manager; do not use npm or yarn)

If you don't have pnpm yet:

```sh
corepack enable
corepack prepare pnpm@latest --activate
```

## Setup

```sh
git clone https://github.com/michaelandrewgamble/capicola.git
cd capicola
pnpm install
```

## Development

Capicola is developed against Storybook, which lets you drive the timing
model, chunking, and anchoring interactively without a host app.

```sh
pnpm storybook
```

Build the library (ESM + type declarations):

```sh
pnpm build
```

## Typecheck & lint

Run these before opening a PR — CI enforces both:

```sh
pnpm typecheck
pnpm lint
```

## Code style

The codebase follows one consistent style throughout `src/` and `scripts/`:

- **Double quotes**, not single quotes
- **No semicolons**
- **2-space indentation**
- Prefer explicit, named exports over default exports (see `src/index.ts`)

Prettier and ESLint are configured to match this style — run `pnpm lint`
(and `pnpm lint --fix` where applicable) rather than hand-formatting.

## Public API changes

`src/types.ts` is the frozen public contract described at the top of that
file. If your change touches it, call that out explicitly in your PR
description and make sure `src/index.ts`'s exports stay in sync.

## Branch & PR process

1. Fork the repo (or create a branch if you have push access).
2. Create a descriptive branch: `git checkout -b fix/anchor-flip-edge-case`.
3. Make your change, with tests/stories updated as needed.
4. Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` locally.
5. Commit using a [Conventional Commits](https://www.conventionalcommits.org/)
   style message, e.g.:
   - `fix(anchor): correct auto-flip near viewport bottom`
   - `feat(chunking): support width-based multiline pages`
   - `docs(readme): clarify cadence tuning knobs`
6. Push and open a pull request against `main`. Describe the _why_, not just
   the _what_, and link any related issue.
7. Be responsive to review feedback — small, focused PRs merge fastest.

## Reporting bugs / requesting features

Please use the issue templates under `.github/ISSUE_TEMPLATE/` so we have the
context (repro, expected vs. actual behavior, environment) needed to act on
your report quickly.
