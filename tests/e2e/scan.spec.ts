import { test, expect } from '@playwright/test';
import { getDb } from '../../lib/db';
import { users, scans, links, templates } from '../../lib/db/schema';

test.beforeAll(async () => {
    const db = getDb();
    await db.delete(links);
    await db.delete(scans);
    await db.delete(templates);
    await db.delete(users);
});




/**
 * USE CASE: Scan Management & Feedback
 * Verifies:
 * 1. Creation and execution of a scan from the browser.
 * 2. Real-time report generation and visibility of results.
 */
test.describe('Scan Management', () => {



  test('should allow a logged-in user to trigger a new scan', async ({ page }) => {
    // 1. Login/Register first
    const email = `test-${Date.now()}@example.com`;
    await page.goto('/login');
    await page.click('button:has-text("Don\'t have an account? Sign up")');
    await page.fill('#email', email);
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');

    // 2. Go to New Scan page (via Modal)
    await page.click('text=New Scan');
    await expect(page.locator('text=Choose your Scan Mode')).toBeVisible();
    await page.click('text=Launch Normal Scan');
    await expect(page).toHaveURL('/scans/new');

    // 3. Fill scan configuration
    await page.fill('input[placeholder="e.g. Weekly Health Check"]', 'E2E Test Scan');
    await page.fill('input[type="url"]', 'https://example.com');
    
    // 4. Ignite Scan
    await page.click('button:has-text("Ignite Scan")');

    // 5. Should be redirected to scan results page
    // URL pattern: /scans/[id]
    await expect(page).toHaveURL(/\/scans\/[a-zA-Z0-9_-]+/);
    await expect(page.locator('text=Scan Report')).toBeVisible();
    
    // 6. Verify scan status starts as RUNNING or COMPLETED

    const status = page.locator('.badge, [class*="badge"]'); // Adjust if needed based on UI
    await expect(page.locator('body')).toContainText(/RUNNING|COMPLETED/i);
  });
});
