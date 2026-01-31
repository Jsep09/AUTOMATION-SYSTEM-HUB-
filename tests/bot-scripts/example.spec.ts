import { test, expect } from '@playwright/test';

test('Example Login Test', async ({ page }) => {
  // Demo script
  console.log('Running example test...');
  
  // 1. Go to Google
  await page.goto('https://www.google.com');
  
  // 2. Check title
  await expect(page).toHaveTitle(/Google/);
  
  console.log('Test completed successfully!');
});
