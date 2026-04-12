import { test, expect } from '@playwright/test';
import { getDb } from '../../lib/db';
import { users, scans, links, templates } from '../../lib/db/schema';

test.beforeAll(async () => {
    const db = getDb();
    await db.delete(links);
    await db.delete(scans);
    await db.delete(templates);
});

test.describe('Scan Setup Wizard Flow', () => {
    
    test.beforeEach(async ({ page }) => {
        // Register and login for each test
        const db = getDb();
        await db.delete(users);
        const email = `test-wizard-${Date.now()}@example.com`;
        await page.goto('/login');
        await page.click('button:has-text("Don\'t have an account? Sign up")');
        await page.fill('#email', email);
        await page.fill('#password', 'password123');
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL('/');
    });

    test('should progress through mandatory steps and validate input', async ({ page }) => {
        await page.click('text=Launch New Scan');
        
        // Step 1: Mode Selection
        await expect(page.locator('text=Choose Scan Mode')).toBeVisible();
        await page.click('h4:has-text("Recursive Discovery")');

        // Step 2: Basic Details (Validation)
        await expect(page.locator('text=Basic Details')).toBeVisible();
        
        const continueBtn = page.locator('button:has-text("Continue")');
        await expect(continueBtn).toBeDisabled();

        await page.fill('input[placeholder="e.g. My Website Audit"]', 'E2E Test Scan');
        await page.fill('input[placeholder="https://example.com"]', 'https://playwright.dev');
        await expect(continueBtn).toBeEnabled();
        await continueBtn.click();

        // Step 3: Crawling Rules
        await expect(page.locator('text=Crawling Rules')).toBeVisible();
        await page.click('button:has-text("Continue")');

        // Step 4: Performance Tuning
        await expect(page.locator('text=Performance Tuning')).toBeVisible();
        await page.click('button:has-text("Continue")');

        // Step 5: Browser Identity
        await expect(page.locator('text=Browser Identity')).toBeVisible();
        await page.click('button:has-text("Continue")');

        // Step 6: Advanced Authentication
        await expect(page.locator('text=Advanced Authentication')).toBeVisible();
        await page.click('button:has-text("Continue")');

        // Step 7: Review
        await expect(page.locator('text=Review Configuration')).toBeVisible();
        await expect(page.locator('text=E2E Test Scan')).toBeVisible();
        
        // Launch Scan
        await page.click('button:has-text("Launch Engine")');
        
        // Verify redirection
        await expect(page).toHaveURL(/\/scans\/[a-f0-9-]{36}/);
    });

    test('should require target URLs for targeted scans', async ({ page }) => {
        await page.click('text=Launch New Scan');
        
        // Step 1: Mode Selection
        await page.click('h4:has-text("Targeted Audit")');

        // Step 2: Basic Details
        await expect(page.locator('text=Basic Details')).toBeVisible();
        await page.fill('input[placeholder="e.g. My Website Audit"]', 'Targeted Test');
        await page.fill('input[placeholder="https://example.com"]', 'https://playwright.dev');
        
        await expect(page.locator('text=At least one target URL is required')).toBeVisible();
        await expect(page.locator('button:has-text("Continue")')).toBeDisabled();

        await page.fill('textarea[placeholder="Paste URLs here..."]', 'https://playwright.dev/docs/intro');
        await expect(page.locator('button:has-text("Continue")')).toBeEnabled();
        
        // Step 2 -> 3
        await page.click('button:has-text("Continue")');
        await expect(page.locator('text=Crawling Rules')).toBeVisible();
        
        // Step 3 -> 4
        await page.click('button:has-text("Continue")');
        await expect(page.locator('text=Performance Tuning')).toBeVisible();

        // Step 4 -> 5
        await page.click('button:has-text("Continue")');
        await expect(page.locator('text=Browser Identity')).toBeVisible();

        // Step 5 -> 6
        await page.click('button:has-text("Continue")');
        await expect(page.locator('text=Advanced Authentication')).toBeVisible();

        // Step 6 -> 7
        await page.click('button:has-text("Continue")');
        await expect(page.locator('text=Review Configuration')).toBeVisible();
        await expect(page.locator('div:has-text("Mode") >> text=Targeted Audit')).toBeVisible();
    });

    test('should allow skipping to manual setup', async ({ page }) => {
        await page.click('text=Launch New Scan');
        await page.click('button:has-text("Skip to Manual Setup")');
        
        await expect(page).toHaveURL('/scans/new');
        await expect(page.locator('h1:has-text("Initialize Scan")')).toBeVisible();
    });

    test('should persist "Do not show again" preference', async ({ page }) => {
        await page.click('text=Launch New Scan');
        
        await page.click('h4:has-text("Recursive Discovery")');
        await page.fill('input[placeholder="e.g. My Website Audit"]', 'Preference Test');
        await page.fill('input[placeholder="https://example.com"]', 'https://prefs.test');
        
        // Navigate through steps to Step 7
        for (let i = 0; i < 5; i++) {
            await page.click('button:has-text("Continue")');
            await page.waitForTimeout(200);
        }

        // Final Step: Review
        await expect(page.locator('text=Review Configuration')).toBeVisible();
        await page.click('text=Do not show this wizard again');
        await page.click('button:has-text("Launch Engine")');
        
        await expect(page).toHaveURL(/\/scans\/[a-f0-9-]{36}/);

        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await page.click('text=Launch New Scan');
        
        // Should go to the selection modal, NOT the wizard
        await expect(page.locator('text=Choose your Scan Mode')).toBeVisible();
        await expect(page.locator('text=Launch Normal Scan')).toBeVisible();
    });
});
