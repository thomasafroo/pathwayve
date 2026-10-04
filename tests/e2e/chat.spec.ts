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

test("chat panel sends prompt, saves, and reopens after refresh", async ({
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
  const chat = await openChat(page);
  await chat
    .getByLabel("Chat message")
    .fill("Coffee then study tomorrow from SFU to downtown.");
  await chat.getByRole("button", { name: "Send message" }).click();
  await expect(chat).toContainText("Saved “Coffee and study time”");
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
  const reopened = await openChat(page);
  await reopened
    .getByRole("button", { name: "Saved schedules (1)", exact: true })
    .click();
  await reopened.getByRole("button", { name: /Coffee and study time/ }).click();
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

test("chat uses current sidebar stops and mode before a manual trip is created", async ({
  page,
}) => {
  const requests: {
    constraints: import("../../src/types/planning-constraints").PlanningConstraints;
    requestId: string;
  }[] = [];
  await page.route("**/api/schedules", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: [] });
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      status: 502,
      json: { error: { message: "Test retry" } },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample trip" }).click();
  await page.getByRole("button", { name: "Drive", exact: true }).click();
  await page.getByLabel("Search distance from route").selectOption("500");
  await page.getByLabel("Departure", { exact: true }).fill("2030-10-04T13:00");
  await page.getByLabel("Finish by", { exact: true }).fill("2030-10-04T18:00");
  const chat = await openChat(page);
  await chat
    .getByLabel("Chat message")
    .fill("Add a coffee shop along this route.");
  await chat.getByRole("button", { name: "Send message" }).click();
  await expect(chat.getByRole("alert")).toHaveText("Test retry");
  expect(requests[0].constraints.transportation).toBe("driving");
  expect(requests[0].constraints.selectedStops).toHaveLength(4);
  expect(requests[0].constraints.origin?.name).toBe("SFU Burnaby");
  expect(requests[0].constraints.routeRadiusMeters).toBe(500);
  expect(requests[0].constraints.startTime).toBeTruthy();
  await page
    .getByRole("button", { name: "Move The Morning Cup down", exact: true })
    .click();
  await expect(page.getByLabel("Stop order", { exact: true })).toHaveValue(
    "preserve",
  );
  await page.getByLabel("Stop order", { exact: true }).selectOption("optimize");
  await page.getByRole("button", { name: "Walk", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Remove selected The Morning Cup",
      exact: true,
    })
    .click();
  await chat.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].constraints.orderPolicy).toBe("optimize");
  expect(requests[1].constraints.routingPriority).toBe("fastest");
  expect(requests[1].constraints.transportation).toBe("walking");
  expect(requests[1].constraints.selectedStops).toHaveLength(3);
  expect(requests[1].requestId).not.toBe(requests[0].requestId);
});

test("chat input grows for wrapped text and newlines, then shrinks", async ({
  page,
}) => {
  await page.route("**/api/schedules", (route) => route.fulfill({ json: [] }));
  await page.goto("/");
  const chat = await openChat(page);
  const input = chat.getByLabel("Chat message");
  const initial = (await input.boundingBox())!.height;
  await input.fill(
    "Find a coffee shop along the route and leave time for a walk. ".repeat(8),
  );
  await expect
    .poll(async () => (await input.boundingBox())!.height)
    .toBeGreaterThan(initial);
  await input.fill("First stop");
  await input.press("End");
  await input.press("Shift+Enter");
  await input.pressSequentially("Second stop");
  await expect(input).toHaveValue("First stop\nSecond stop");
  await expect
    .poll(async () => (await input.boundingBox())!.height)
    .toBeGreaterThan(initial);
  await input.fill("Many lines\n".repeat(25));
  await expect
    .poll(async () => (await input.boundingBox())!.height)
    .toBeLessThanOrEqual(160);
  await input.fill("");
  await expect
    .poll(async () => (await input.boundingBox())!.height)
    .toBe(initial);
});

test("map enters and exits fullscreen and supports embedded-browser fallback", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Exit fullscreen", exact: true }),
  ).toBeVisible();
  const map = page.getByRole("region", { name: "Trip map", exact: true });
  await expect
    .poll(async () => Math.round((await map.boundingBox())!.width))
    .toBe(page.viewportSize()!.width);
  await page
    .getByRole("button", { name: "Exit fullscreen", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Enter fullscreen", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    HTMLElement.prototype.requestFullscreen = async () => {
      throw new Error("Blocked in embedded browser");
    };
  });
  await page
    .getByRole("button", { name: "Enter fullscreen", exact: true })
    .click();
  await expect(map).toHaveClass(/map-fullscreen/);
  await page.keyboard.press("Escape");
  await expect(map).not.toHaveClass(/map-fullscreen/);
  await expect(
    page.getByRole("button", { name: "Enter fullscreen", exact: true }),
  ).toBeFocused();
});
