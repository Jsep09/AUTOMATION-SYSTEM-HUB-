import { test as setup, expect } from "@playwright/test";

setup("authenticate", async ({ page, context }) => {
  // Log environment variables for debugging
  const user = process.env.TEST_USER || "";
  const pass = process.env.TEST_PASS || "";
  console.log(`🤖 Bot attempting login for User: ${user}`);

  if (!user || !pass) {
    throw new Error("Missing TEST_USER or TEST_PASS in Variables!");
  }

  // Go to Base URL (injected via process.env.BASE_URL)
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const usernameInput = page.getByLabel(/Username/i);
  await expect(usernameInput).toBeVisible({ timeout: 10000 });

  await usernameInput.fill(user);
  await page.getByLabel(/Password/i).fill(pass);
  await page.getByRole("button", { name: /login/i }).click();

  // Wait for URL to change (more reliable than checking for specific text)
  await page.waitForURL((url) => !url.pathname.includes("login"), {
    timeout: 15000,
  });

  // Additional check: wait for any main content to be visible
  await page.waitForSelector("body", { state: "visible", timeout: 5000 });

  // Save storage state to the path injected by Main process
  const storagePath = process.env.STORAGE_STATE || "playwright/.auth/user.json";
  await page.context().storageState({ path: storagePath });
  console.log(`✅ Login successful! Session saved to ${storagePath}`);
});
