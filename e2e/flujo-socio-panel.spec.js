/**
 * E2E — Panel socio: navegación y checklist de activación
 */
const { test, expect } = require('@playwright/test');

const DEMO_PROVIDER = {
  email: 'marta@fandez.cl',
  password: 'proveedor123'
};

test.describe('Panel socio', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(DEMO_PROVIDER.email);
    await page.locator('#password').fill(DEMO_PROVIDER.password);
    await page.locator('form[action="/login"] button[type="submit"]').click();
    await page.waitForURL(/\/(proveedor|verificar-email)(\/|$|\?)/);
    if (page.url().includes('/verificar-email')) {
      test.skip(true, 'Cuenta socio sin verificar en este entorno');
    }
  });

  test('muestra bottom nav y sección de activación o financiero', async ({ page }) => {
    await expect(page.locator('.nav-provider-bar')).toBeVisible();
    await expect(page.locator('.nav-provider-bar a[href="/proveedor/mando"]')).toBeVisible();
    const activation = page.locator('.provider-activation-list');
    const finance = page.getByText(/Resumen financiero|Financial summary/i);
    await expect(activation.or(finance).first()).toBeVisible();
  });

  test('navega a mando desde bottom nav', async ({ page }) => {
    await page.locator('.nav-provider-bar a[href="/proveedor/mando"]').click();
    await expect(page).toHaveURL(/\/proveedor\/mando/);
    await expect(page.locator('#mandoPage')).toBeVisible();
    await expect(page.locator('.nav-provider-active')).toContainText(/Mando|Jobs/i);
  });
});
