import { defineConfig } from "vitest/config";

// lib/ es lógica pura de TypeScript: no necesita DOM ni red, así que corre en Node.
// Los tests son API-FREE a propósito (no tocan TYPESAFE_API_KEY ni ANTHROPIC_API_KEY).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
