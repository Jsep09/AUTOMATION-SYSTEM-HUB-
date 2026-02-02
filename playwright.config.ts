import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";

// Read from .env if present (though we mainly inject via Main process)
dotenv.config();

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined, // Enable parallelism (uses all cores)
  reporter: "html",
  use: {
    // Base URL will be overridden by the process.env passed from Main
    baseURL: process.env.BASE_URL,
    headless: process.env.HEADLESS_MODE === "true",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure", // Save resources
    
    // Low-level browser optimization
    launchOptions: {
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu' // Often helps with stability/speed on headless
      ],
    }
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
        headless: true, // Run login in headless mode (no browser window)
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
