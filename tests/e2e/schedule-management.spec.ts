import { expect, test } from "@playwright/test";
test("manual trip can be saved, reopened, imported as a copy, and deleted", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Departure", { exact: true }).fill("2030-10-04T09:00");
  await page.getByLabel("Finish by", { exact: true }).fill("2030-10-04T23:00");
  await page.getByRole("button", { name: "Load sample trip" }).click();
  await expect(page.locator(".stop")).toHaveCount(4, { timeout: 20000 });
  const before = await page.request.get("/api/schedules");
  expect(await before.json()).toHaveLength(0);
  await page
    .getByRole("button", { name: "Save current trip", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Delete schedule", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open trip chat" }).click();
  await page
    .getByRole("button", { name: "Saved schedules (1)", exact: true })
    .click();
  await page.getByRole("button", { name: /Trip to/ }).click();
  await page
    .getByRole("button", { name: "Import places to planner", exact: true })
    .click();
  await expect(page.locator(".chosen-stops > div")).toHaveCount(4);
  await expect(page.getByLabel("Departure", { exact: true })).toHaveValue(
    "2030-10-04T09:00",
  );
  await page
    .getByRole("button", {
      name: "Remove selected The Morning Cup",
      exact: true,
    })
    .click();
  await expect(page.locator(".stop")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Save current trip", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saved schedules (2)", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete schedule", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saved schedules (1)", exact: true }),
  ).toBeVisible();
  const remaining = await (await page.request.get("/api/schedules")).json();
  const original = await (
    await page.request.get(`/api/schedules/${remaining[0].id}`)
  ).json();
  expect(original.schedule_items).toHaveLength(4);
});
test("left preferences survive reload and are sent to chat", async ({
  page,
}) => {
  let constraints: Record<string, unknown> = {};
  await page.route("**/api/schedules", (route) => {
    if (route.request().method() === "POST") {
      constraints = route.request().postDataJSON().constraints;
      return route.fulfill({
        json: { clarification: "Where would you like to go?" },
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/");
  await page.getByText("Preferences & suggestions", { exact: true }).click();
  await page.getByText("Interests & budget", { exact: true }).click();
  await page.getByLabel("How should suggestions work?").selectOption("suggest");
  await page.getByLabel("Libraries", { exact: true }).check();
  await page.getByLabel("Budget preference").selectOption("budget");
  await page.getByLabel("Anything else?").fill("Vegetarian food, quiet places");
  await page.reload();
  await page.getByText("Preferences & suggestions", { exact: true }).click();
  await page.getByText("Interests & budget", { exact: true }).click();
  await expect(page.getByLabel("Libraries", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Budget preference")).toHaveValue("budget");
  await expect(page.getByLabel("Anything else?")).toHaveValue(
    "Vegetarian food, quiet places",
  );
  await page.getByRole("button", { name: "Open trip chat" }).click();
  await page.getByLabel("Anything else?").fill("I don’t like Purebread bakery");
  await page
    .getByLabel("Chat message")
    .fill("Adapt to my new preferences on the side");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("log")).toContainText(
    "Where would you like to go?",
  );
  expect(constraints.budget).toBe("budget");
  expect(constraints.interestTags).toEqual(["Libraries"]);
  expect(constraints.preferences).toBe("I don’t like Purebread bakery");
  expect(constraints.suggestionMode).toBe("suggest");
});
