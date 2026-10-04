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
              from: "Saved origin",
              to: "Saved destination",
              durationMinutes: 25,
              distanceMeters: 8200,
              mode: "transit",
              steps: [
                {
                  instruction: "Walk to Burrard Station",
                  mode: "WALK",
                  durationMinutes: 4,
                },
                {
                  instruction: "Ride toward UBC",
                  mode: "TRANSIT",
                  durationMinutes: 21,
                  line: "99 B-Line",
                },
              ],
              path: [
                { lat: 49.28, lng: -123.1 },
                { lat: 49.26, lng: -123.2 },
              ],
            },
          ],
        },
        placements: [],
        travel_legs: [],
        unscheduled_items: [
          { item_id: "item-1", reason: "Choose a quiet place to study." },
        ],
        warnings: [],
      },
    },
  ],
};

async function openChat(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Open trip chat" }).click();
  return page.getByRole("region", { name: "Trip chat", exact: true });
}

test("chat panel previews a schedule, then explicitly saves and reopens it", async ({
  page,
}, testInfo) => {
  let saved = false;
  let requestBody: Record<string, unknown> = {};
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Alice",
          email: "alice@example.com",
        },
        session: { id: "test-session", expiresAt: "2099-01-01T00:00:00Z" },
      },
    }),
  );
  await page.route("**/api/schedules/preview", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ json: { document, workspace: null } });
  });
  await page.route("**/api/schedules", async (route) => {
    if (route.request().method() === "POST") {
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
    route.fulfill({ json: { document, workspace: null } }),
  );
  await page.goto("/");
  const chat = await openChat(page);
  await chat
    .getByLabel("Chat message")
    .fill("Coffee then study tomorrow from SFU to downtown.");
  await chat.getByRole("button", { name: "Send message" }).click();
  await expect(chat).toContainText("Planned “Coffee and study time”");
  expect(saved).toBe(false);
  await page
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await expect(page.getByText("Saved to your account.")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Saved schedule details" }),
  ).toContainText("Not scheduled: Choose a quiet place");
  const route = page.getByRole("region", { name: "Route directions" });
  await expect(route).toContainText("Saved origin → Saved destination");
  await expect(route).toContainText("25 min on transit");
  await route.getByText("View directions").click();
  await expect(route).toContainText("99 B-Line Ride toward UBC · 21 min");
  expect(requestBody.prompt).toBe(
    "User: Coffee then study tomorrow from SFU to downtown.",
  );
  expect(requestBody.requestId).toMatch(/^[a-f0-9-]{36}$/);
  expect(requestBody).not.toHaveProperty("user_id");
  await expect(page.locator(".route-sketch")).toContainText(
    "Saved destination",
  );
  await page.reload();
  await page.getByRole("button", { name: "My schedules", exact: true }).click();
  await page.getByRole("button", { name: /Coffee and study time/ }).click();
  await expect(
    page.getByRole("region", { name: "Saved schedule details" }),
  ).toBeVisible();
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
  await page.route("**/api/schedules/preview", async (route) => {
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
  const chat = await openChat(page);
  const input = chat.getByLabel("Chat message");
  await input.fill("Coffee and homework tomorrow.");
  await chat.getByRole("button", { name: "Send message" }).click();
  await expect(chat).toContainText("Should I schedule this for tomorrow?");
  await input.fill("yes");
  await input.press("Enter");
  await expect(chat.getByRole("alert")).toContainText("Provider unavailable");
  await expect(input).toHaveValue("yes");
  await chat.getByRole("button", { name: "Send message" }).click();
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
