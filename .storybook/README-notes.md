# Storybook config notes (for the packaging/verify pass)

This config assumes **Storybook 10** with the "essentials" (actions, controls,
backgrounds, viewport, etc.) merged into `storybook` core — so no
`@storybook/addon-essentials` (or a standalone `@storybook/addon-backgrounds`)
is needed just to get the dark/light background switcher used in
`preview.tsx`'s `parameters.backgrounds`.

Addons referenced directly in `.storybook/main.ts` that DO need to land in
`package.json` devDependencies:

- `@storybook/addon-docs`
- `@storybook/react-vite` (framework package)
- `storybook` (core CLI/runtime — provides `storybook/preview-api`, imported
  by `src/capicola.stories.tsx`)

Peer/runtime packages `.storybook/*` and the stories file assume are already
present from the component itself:

- `react`, `react-dom` (v19)

If Storybook's actual current major (whatever ships as "10" at install time)
turns out to still require `@storybook/addon-backgrounds` explicitly, add it
alongside `@storybook/addon-docs` — the `parameters.backgrounds` shape in
`preview.tsx` is compatible with both the core-merged and standalone addon
versions.
