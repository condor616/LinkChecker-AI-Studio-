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
 * USE CASE: Full Browser Authentication Flow
 * Verifies:
 * 1. User registration as the first user (ADMIN).
 * 2. Automatic redirection to the dashboard.
 * 3. Handling of duplicate user registration.
 */
test.describe('Authentication Flow', () => {


  test('should register a new user as admin and login', async ({ page }) => {
    // Go to login page
    await page.goto('/login');

    // Toggle to Sign Up
    await page.click('button:has-text("Don\'t have an account? Sign up")');
    await expect(page.locator('text=Create an account')).toBeVisible();


    // Fill registration form
    await page.fill('#email', 'admin-e2e@example.com');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');

    // Should be redirected to dashboard
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toContainText('Lynx Scan');
    
    // Verify session by opening profile dropdown and checking for logout
    await page.click('button[title="Account Settings"]');
    await expect(page.locator('button:has-text("Logout")')).toBeVisible();
  });

  test('should show error for existing user', async ({ page }) => {
    // Register someone first
    await page.goto('/login');
    await page.click('button:has-text("Don\'t have an account? Sign up")');
    await page.fill('#email', 'duplicate@example.com');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');

    // Logout
    await page.click('button[title="Account Settings"]');
    await page.click('button:has-text("Logout")');
    await expect(page).toHaveURL('/login');
    
    // Try to register again
    await page.click('button:has-text("Don\'t have an account? Sign up")');
    await page.fill('#email', 'duplicate@example.com');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');

    // Should show error message
    // The error message is in a <p> with class "text-sm text-destructive"
    await expect(page.locator('p.text-destructive')).toContainText('User already exists');
  });
});
