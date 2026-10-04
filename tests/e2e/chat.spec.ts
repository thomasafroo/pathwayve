import { expect, test } from "@playwright/test";

const id = "11111111-1111-4111-8111-111111111111";
const document = {
  schema_version: 1,
  schedules: [
    {
      id,
      name: "Coffee and study time",
      starts_at: "2030-10-04T13:00:00-07:00",
      ends_at: "2030-10-04T18:00:00-07:00",
      time_zone: "America/Vancouver",
    },
  ],
  schedule_items: [
    {
      id: "item-1",
      title: "Study for exam",
      kind: "task",
      duration_minutes: 45,
      priority: "optional",
      timing_type: "flexible",
      place_query: null,
    },
  ],
  schedule_runs: [
    {
      status: "feasible",
      calculated_at: "2030-10-03T12:00:00-07:00",
      result: {
        map_trip: {
          id,
          source: "demo",
          request: {
            origin: {
              name: "Saved origin",
              location: { lat: 49.28, lng: -123.1 },
            },
            destination: {
              name: "Saved destination",
              location: { lat: 49.26, lng: -123.2 },
            },
            transportation: "transit",
          },
          stops: [],
          legs: [
            {
              path: [
                { lat: 49.28, lng: -123.1 },
                { lat: 49.26, lng: -123.2 },
              ],
            },
          ],
        },
        placements: [],
        unscheduled_items: [
          { item_id: "item-1", reason: "Choose a quiet place to study." },
        ],
        warnings: [],
      },
    },
  ],
};

test("bottom composer sends prompt, saves, and reopens after refresh", async ({
  page,
}, testInfo) => {
  let saved = false;
  let requestBody: Record<string, unknown> = {};
  await page.route("**/api/schedules", async (route) => {
    if (route.request().method() === "POST") {
      requestBody = route.request().postDataJSON();
      saved = true;
      await route.fulfill({ json: { document, workspace: null } });
    } else
      await route.fulfill({
        json: saved
          ? [{ id, name: "Coffee and study time", status: "feasible" }]
          : [],
      });
  });
  await page.route(`**/api/schedules/${id}`, (route) =>
    route.fulfill({ json: document }),
  );
  await page.goto("/");
  const composer = page.getByRole("region", { name: "AI schedule planner" });
  await expect(composer).toBeVisible();
  const box = await composer.boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(
    2,
  );
  expect(viewport.height - (box!.y + box!.height)).toBeLessThan(25);
  await page
    .getByLabel("Describe your day")
    .fill("Coffee then study tomorrow from SFU to downtown.");
  await page
    .getByRole("button", { name: "Generate and save schedule" })
    .click();
  await expect(
    page.getByRole("region", { name: "Saved schedule details" }),
  ).toContainText("Not scheduled: Choose a quiet place");
  expect(requestBody.prompt).toBe(
    "User: Coffee then study tomorrow from SFU to downtown.",
  );
  expect(requestBody.requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(requestBody).not.toHaveProperty("user_id");
  await expect(page.locator(".map-section-heading")).toContainText(
    "Your day, on the map",
  );
  await expect(page.locator(".route-sketch")).toContainText(
    "Saved destination",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Saved schedules (1)", exact: true })
    .click();
  await page.getByRole("button", { name: /Coffee and study time/ }).click();
  await expect(
    page.getByRole("region", { name: "Saved schedule details" }),
  ).toBeVisible();
  await expect(page.locator(".map-section-heading")).toContainText(
    "Your day, on the map",
  );
  await expect(page.locator(".route-sketch")).toContainText(
    "Saved destination",
  );
  await page.screenshot({
    path: testInfo.outputPath("saved-chat-schedule.png"),
    fullPage: false,
  });
});

test("clarifications retain the original request and failures can be retried", async ({
  page,
}) => {
  const requests: { prompt: string; requestId: string }[] = [];
  await page.route("**/api/schedules", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    requests.push(route.request().postDataJSON());
    if (requests.length === 1)
      return route.fulfill({
        json: { clarification: "Should I schedule this for tomorrow?" },
      });
    if (requests.length === 2)
      return route.fulfill({
        status: 502,
        json: { error: { message: "Provider unavailable. Try again." } },
      });
    return route.fulfill({ json: { document, workspace: null } });
  });
  await page.goto("/");
  await page
    .getByLabel("Describe your day")
    .fill("Coffee and homework tomorrow.");
  await page
    .getByRole("button", { name: "Generate and save schedule" })
    .click();
  await expect(
    page.getByText("Should I schedule this for tomorrow?"),
  ).toBeVisible();
  await page.getByLabel("Describe your day").fill("yes");
  await page.getByLabel("Describe your day").press("Enter");
  await expect(
    page
      .getByRole("region", { name: "AI schedule planner" })
      .getByRole("alert"),
  ).toContainText("Provider unavailable");
  await expect(page.getByLabel("Describe your day")).toHaveValue("yes");
  await page
    .getByRole("button", { name: "Generate and save schedule" })
    .click();
  await expect(
    page.getByRole("region", { name: "Saved schedule details" }),
  ).toBeVisible();
  expect(requests[1].prompt).toContain("Coffee and homework tomorrow.");
  expect(requests[1].prompt).toContain(
    "Assistant clarification: Should I schedule this for tomorrow?",
  );
  expect(requests[1].prompt).toContain("yes");
  expect(requests[2].requestId).toBe(requests[1].requestId);
});
