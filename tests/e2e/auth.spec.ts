import { expect, test } from "@playwright/test";

test("guest save survives Google redirect, saves once, reopens and signs out", async ({
  page,
}, testInfo) => {
  let signedIn = false;
  let savedBody: Record<string, unknown> | undefined;
  let saves = 0;
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: signedIn
        ? {
            user: {
              id: "22222222-2222-4222-8222-222222222222",
              name: "Alice",
              email: "alice@example.com",
            },
            session: { id: "test-session", expiresAt: "2099-01-01T00:00:00Z" },
          }
        : null,
    }),
  );
  await page.route("**/api/auth/sign-in/social", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.provider).toBe("google");
    signedIn = true;
    await route.fulfill({ json: { url: body.callbackURL, redirect: true } });
  });
  await page.route("**/api/auth/sign-out", async (route) => {
    signedIn = false;
    await route.fulfill({ json: { success: true } });
  });
  await page.route("**/api/schedules", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: saves
          ? [
              {
                id: "saved-test",
                name: "My private day",
                starts_at: "2030-10-04T13:00:00Z",
                status: "feasible",
              },
            ]
          : [],
      });
    expect(signedIn).toBe(true);
    saves += 1;
    savedBody = route.request().postDataJSON();
    await route.fulfill({
      json: { document: null, workspace: savedBody!.workspace },
    });
  });
  await page.route("**/api/schedules/saved-test", (route) =>
    route.fulfill({
      json: { document: null, workspace: savedBody!.workspace },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign up", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load sample trip" }).click();
  await page
    .getByRole("button", { name: "Create itinerary", exact: true })
    .click();
  await expect(page.locator(".stop")).toHaveCount(4);
  expect(saves).toBe(0);
  await page
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "Log in to save this schedule",
  });
  await expect(modal).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("pathwayve.pending-save.v1")!),
  );
  await modal.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByText("Saved to your account.")).toBeVisible();
  expect(saves).toBe(1);
  expect(savedBody).toEqual(stored.payload);
  await expect(page.locator(".stop")).toHaveCount(4);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("pathwayve.pending-save.v1"),
    ),
  ).toBeNull();
  await page.reload();
  expect(saves).toBe(1);
  await page.getByRole("button", { name: "My schedules", exact: true }).click();
  await page.getByRole("button", { name: /My private day/ }).click();
  await expect(page.locator(".stop")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "SFU Burnaby Change" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Downtown Vancouver Change" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("signed-in-planner.png"),
    fullPage: false,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Log in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "My schedules", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".stop")).toHaveCount(0);
  await expect(page.locator(".chosen-stops>div")).toHaveCount(0);
});

test("cancelled Google login restores the draft without saving", async ({
  page,
}) => {
  let saves = 0;
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({ json: null }),
  );
  await page.route("**/api/auth/sign-in/social", (route) =>
    route.fulfill({
      json: {
        redirect: true,
        url: `${new URL(route.request().url()).origin}/?auth=error`,
      },
    }),
  );
  await page.route("**/api/schedules", (route) => {
    saves++;
    return route.fulfill({ status: 401, json: {} });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample trip" }).click();
  await page
    .getByRole("button", { name: "Create itinerary", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.locator(".account-error")).toContainText(
    "Google sign-in was cancelled",
  );
  await expect(page.locator(".stop")).toHaveCount(4);
  expect(saves).toBe(0);
});
