import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Pure functions only (cadence + chunking) — no DOM needed.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
