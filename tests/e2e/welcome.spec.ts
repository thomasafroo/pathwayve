import { expect, test } from "@playwright/test";

test("welcome leads to centered authentication and guest planning", async ({
  page,
}) => {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: null }),
  );
  await page.goto("/");
  const welcome = page.getByRole("dialog", {
    name: "Where will your day take you?",
  });
  await expect(welcome).toBeVisible();
  await welcome.getByRole("button", { name: "Sign up", exact: true }).click();
  const login = page.getByRole("dialog", {
    name: "Create your PathWayve account",
  });
  await expect(login).toBeVisible();
  const box = await login.boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(
    2,
  );
  expect(Math.abs(box!.y + box!.height / 2 - viewport.height / 2)).toBeLessThan(
    2,
  );
  await login.getByRole("button", { name: "Keep planning" }).click();
  const entries = page.locator(".account-entry");
  const first = await entries.nth(0).boundingBox();
  const second = await entries.nth(1).boundingBox();
  expect(first!.width).toBe(second!.width);
  expect(first!.height).toBe(second!.height);
  await expect(
    page.locator("header").getByRole("button", { name: "Clear everything" }),
  ).toHaveCount(0);
  await page
    .getByRole("complementary", { name: "Trip planning panel" })
    .getByRole("button", { name: "Clear everything" })
    .click();
  await expect(welcome).not.toBeVisible();
  await expect(page.locator(".workspace-mode")).toHaveCount(0);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Log in to PathWayve" }),
  ).toBeVisible();
});

test("welcome supports guest entry on mobile with reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ json: null }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page.locator(".welcome-dialog")).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".welcome-dialog")).not.toBeVisible();
});
