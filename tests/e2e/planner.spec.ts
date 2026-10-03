import { expect, test } from "@playwright/test";
test("plan a day and replan while preserving a locked stop", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Make a day of it." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Plan my day" }).click();
  await expect(
    page.getByRole("heading", { name: "Your itinerary" }),
  ).toBeVisible();
  await expect(page.locator(".stop")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Lock The Morning Cup", exact: true })
    .click();
  await page.getByRole("button", { name: "Rain starts early" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Demo rain event applied",
  );
  await expect(page.locator(".stop").first()).toContainText("The Morning Cup");
  await expect(
    page.getByRole("button", { name: "Unlock The Morning Cup", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("itinerary.png"),
    fullPage: true,
  });
});
test("shows server validation errors without replacing a previous plan", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Plan my day" }).click();
  await expect(page.locator(".stop")).toHaveCount(4);
  await page.getByLabel("Departure", { exact: true }).fill("2030-10-03T13:00");
  await page.getByLabel("Finish by", { exact: true }).fill("2030-10-03T12:00");
  await page.getByRole("button", { name: "Plan my day" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "End time must be after departure",
  );
  await expect(page.locator(".stop")).toHaveCount(4);
});
