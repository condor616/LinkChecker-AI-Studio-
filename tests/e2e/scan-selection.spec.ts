import { test, expect } from '@playwright/test';
import { getDb } from '../../lib/db';
import { users, scans, links, templates } from '../../lib/db/schema';

test.beforeAll(async () => {
    const db = getDb();
    await db.delete(links);
    await db.delete(scans);
    await db.delete(templates);
});

test.describe('Scan Selection Modal & Mode Switching', () => {
    
    test.beforeEach(async ({ page }) => {
        // Register and login for each test
        const db = getDb();
        await db.delete(users);
        const email = `test-selection-${Date.now()}@example.com`;
        await page.goto('/login');
        await page.click('button:has-text("Don\'t have an account? Sign up")');
        await page.fill('#email', email);
        await page.fill('#password', 'password123');
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL('/');
    });

    test('should open modal and navigate to normal scan', async ({ page }) => {
        await page.click('nav >> text=New audit');
        await expect(page.locator('text=Choose your Audit Mode')).toBeVisible();
        await page.click('text=Start audit');
        await expect(page).toHaveURL('/scans/new');
        
        // Verify Targeted Audit is NOT active
        const targetedAuditToggle = page.locator('div:has-text("Targeted Audit")').first();
        await expect(targetedAuditToggle).not.toHaveClass(/bg-primary\/10/);
    });

    test('should open modal and navigate to targeted scan', async ({ page }) => {
        await page.click('nav >> text=New audit');
        await expect(page.locator('text=Choose your Audit Mode')).toBeVisible();
        await page.click('text=Start targeted audit');
        await expect(page).toHaveURL('/scans/new?target=true');
        
        // Verify Targeted Audit IS active
        const targetedAuditToggle = page.locator('div.cursor-pointer:has-text("Targeted Audit")');
        await expect(targetedAuditToggle).toHaveClass(/bg-primary\/10/);
    });

    test('should reset state when switching from targeted to normal mode', async ({ page }) => {
        // 1. Go to Targeted audit
        await page.click('nav >> text=New audit');
        await page.click('text=Start targeted audit');
        await expect(page).toHaveURL('/scans/new?target=true');
        
        // Verify Targeted Audit is active
        await expect(page.locator('div.cursor-pointer:has-text("Targeted Audit")')).toHaveClass(/bg-primary\/10/);

        // 2. Open modal again and select Normal audit
        await page.click('nav >> text=New audit');
        await page.click('text=Start audit');
        await expect(page).toHaveURL('/scans/new');

        // 3. Verify Targeted Audit is now INACTIVE
        await expect(page.locator('div.cursor-pointer:has-text("Targeted Audit")')).not.toHaveClass(/bg-primary\/10/);
    });

    test('should open modal from Dashboard CTA', async ({ page }) => {
        await page.goto('/');
        await page.click('text=Start audit');
        await expect(page.locator('text=Choose your Audit Mode')).toBeVisible();
        await page.click('button:has-text("Start audit")');
        await expect(page).toHaveURL('/scans/new');
    });

    test('should open modal from Targeted Audit Highlight', async ({ page }) => {
        await page.goto('/');
        await page.click('text=Try Targeted Audit');
        await expect(page.locator('text=Choose your Audit Mode')).toBeVisible();
        await page.click('button:has-text("Start targeted audit")');
        await expect(page).toHaveURL('/scans/new?target=true');
    });
});
