import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";

// Read from .env if present (though we mainly inject via Main process)
dotenv.config();

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 1, // Sequential execution for safety
  reporter: "html",
  use: {
    // Base URL will be overridden by the process.env passed from Main
    baseURL: process.env.BASE_URL, 
    headless: false,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    // 1. Setup Project (Login Only)
    // Run this manually via the "Login" button
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      testDir: "./tests/auth-setup",
      use: {
        storageState: undefined, // Do not load existing session for login
      },
    },
    // 2. BA Tests (Run Scripts)
    // Uses the saved storageState from 'setup'
    {
      name: "ba-tests",
      testDir: "./tests/bot-scripts",
      use: {
        ...devices["Desktop Chrome"],
        // Load session from dynamic path passed by Main process
        storageState: process.env.STORAGE_STATE,
      },
    },
  ],
});
