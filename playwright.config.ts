import { defineConfig } from "@playwright/test"

export default defineConfig({
  fullyParallel: false,
  reporter: "line",
  testDir: "tests",
  timeout: 60_000,
  use: {
    headless: true
  },
  workers: 1
})
