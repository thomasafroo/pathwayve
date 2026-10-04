import { expect, test } from "@playwright/test";
type SavedTrip = {
  request: { startTime: string; endTime: string; timeZone: string };
  stops: { id: string; name: string; durationMinutes: number }[];
};
// A saved document as the server would build it from a manual workspace.
function savedDocument(id: string, trip: SavedTrip) {
  return {
    schema_version: 1,
    schedules: [
      {
        id,
        name: `Trip to ${trip.stops.length} places`,
        starts_at: trip.request.startTime,
        ends_at: trip.request.endTime,
        time_zone: trip.request.timeZone,
        preferences: { interests: [] },
      },
    ],
    schedule_items: trip.stops.map((stop, index) => ({
      id: `item-${index}`,
      title: stop.name,
      kind: "visit",
      duration_minutes: stop.durationMinutes,
      priority: "required",
      timing_type: "flexible",
      place_query: stop.name,
    })),
    schedule_runs: [
      {
        status: "feasible",
        calculated_at: "2030-10-03T12:00:00Z",
        result: {
          map_trip: trip,
          placements: [],
          travel_legs: [],
          unscheduled_items: [],
          warnings: [],
        },
      },
    ],
  };
}

test("manual trip can be saved, reopened, imported as a copy, and deleted", async ({
  page,
}) => {
  const saved = new Map<string, ReturnType<typeof savedDocument>>();
  const deleted: string[] = [];
  // Saved-schedule actions live in a collapsed section under the itinerary.
  const openScheduleDetails = async () => {
    const details = page
      .locator("details.itinerary-extras")
      .filter({ hasText: "Schedule details & export" });
    if (
      !(await details.evaluate(
        (element) => (element as HTMLDetailsElement).open,
      ))
    )
      await details.locator("summary").click();
  };
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
  await page.route("**/api/schedules", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: [...saved.values()].map((document) => ({
          ...document.schedules[0],
          status: "feasible",
        })),
      });
    const { workspace } = route.request().postDataJSON();
    const id = `00000000-0000-4000-8000-00000000000${saved.size + 1}`;
    const document = savedDocument(id, workspace.trip);
    saved.set(id, document);
    await route.fulfill({ json: { document, workspace } });
  });
  await page.route("**/api/schedules/*", async (route) => {
    const id = route.request().url().split("/").at(-1)!;
    if (route.request().method() === "DELETE") {
      deleted.push(id);
      saved.delete(id);
      return route.fulfill({ json: { deleted: true } });
    }
    await route.fulfill({
      json: { document: saved.get(id), workspace: null },
    });
  });
  await page.goto("/");
  await page.getByLabel("Departure", { exact: true }).fill("2030-10-04T09:00");
  await page.getByLabel("Finish by", { exact: true }).fill("2030-10-04T23:00");
  await page.getByRole("button", { name: "Load sample trip" }).click();
  await expect(page.locator(".stop")).toHaveCount(4, { timeout: 20000 });
  await page
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await expect(page.getByText("Saved to your account.")).toBeVisible();
  await openScheduleDetails();
  await expect(
    page.getByRole("button", { name: "Delete schedule", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "My schedules", exact: true }).click();
  await page.getByRole("button", { name: /Trip to 4 places/ }).click();
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
    .getByRole("button", { name: "Save schedule", exact: true })
    .click();
  await expect.poll(() => saved.size).toBe(2);
  await openScheduleDetails();
  await expect(
    page.getByRole("button", { name: "Delete schedule", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete schedule", exact: true })
    .click();
  await expect(page.getByText(/Saved schedule deleted/)).toBeVisible();
  expect(deleted).toEqual(["00000000-0000-4000-8000-000000000002"]);
  // The original save is untouched by importing and editing a copy.
  expect(
    saved.get("00000000-0000-4000-8000-000000000001")!.schedule_items,
  ).toHaveLength(4);
});
test("left preferences survive reload and are sent to chat", async ({
  page,
}) => {
  let constraints: Record<string, unknown> = {};
  await page.route("**/api/schedules/preview", (route) => {
    constraints = route.request().postDataJSON().constraints;
    return route.fulfill({
      json: { clarification: "Where would you like to go?" },
    });
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
