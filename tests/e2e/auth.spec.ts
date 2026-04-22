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


  test('First user auto-admin flow: popup, UI warning, and subsequent users', async ({ page }) => {
    // Ensure DB is clean before this specific test to guarantee first-user state
    const db = getDb();
    await db.delete(users);

    // 1. Visit homepage
    await page.goto('/');

    // 2. Expect the FirstUserPopup to appear
    await expect(page.locator('text=System Uninitialized')).toBeVisible();
    await expect(page.locator('text=Register your first user')).toBeVisible();

    // 3. Click the link to register
    await page.click('text=Register your first user');

    // 4. Expect redirection to /login?register=true
    await expect(page).toHaveURL(/.*\/login\?register=true/);

    // 5. Expect the Auto-admin UI message to be visible
    await expect(page.locator('text=You\'ll be granted admin access upon registration.')).toBeVisible();

    // 6. Register the FIRST user
    await page.fill('#email', 'first-admin@example.com');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');

    // 7. Should be redirected to dashboard
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toContainText('Lynx Scan');

    // 8. Logout
    await page.click('button[title="Account Settings"]');
    await page.click('button:has-text("Logout")');
    await expect(page).toHaveURL('/login');

    // 9. Go to registration page for a SECOND user
    await page.goto('/login?register=true');

    // 10. Expect the Auto-admin UI message NOT to be visible
    await expect(page.locator('text=You\'ll be granted admin access upon registration.')).not.toBeVisible();

    // 11. Register the SECOND user
    await page.fill('#email', 'second-user@example.com');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');

    // 12. Should be redirected to dashboard but show pending status
    await page.waitForURL('/');
    await expect(page.locator('text=Account Pending Approval')).toBeVisible();

    // 13. Verify backend roles directly
    const allUsers = await db.select().from(users);
    const firstUserDb = allUsers.find((u: any) => u.email === 'first-admin@example.com');
    const secondUserDb = allUsers.find((u: any) => u.email === 'second-user@example.com');
    
    expect(firstUserDb?.role).toBe('ADMIN');
    expect(secondUserDb?.role).toBe('PENDING');
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
