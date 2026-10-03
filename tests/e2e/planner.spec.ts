import { expect, test } from "@playwright/test";
test("plan a day and replan while preserving a locked stop", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample trip" }).click();
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
  await page.getByRole("button", { name: "Load sample trip" }).click();
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

test("edit a trip, attach an activity, undo, and export JSON", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample trip" }).click();
  await expect(
    page.getByRole("region", { name: "Trip map", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Plan my day" }).click();
  await expect(page.locator(".stop")).toHaveCount(4);
  const coffee = page.locator(".stop").filter({
    has: page.getByRole("heading", { name: "The Morning Cup", exact: true }),
  });
  await coffee
    .getByRole("button", { name: "Show The Morning Cup on map" })
    .click();
  await expect(coffee).toHaveClass(/selected/);
  await coffee.getByRole("button", { name: "Activity", exact: true }).click();
  await page.getByLabel("What would you like to do?").fill("Read CPSC notes");
  await page.getByRole("button", { name: "Add activity", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(coffee).toContainText("Read CPSC notes");
  await page
    .getByRole("checkbox", { name: "Complete Read CPSC notes" })
    .check();
  await expect(
    page.getByRole("checkbox", { name: "Complete Read CPSC notes" }),
  ).toBeChecked();
  await coffee
    .getByRole("button", { name: "Move The Morning Cup later" })
    .click();
  await expect(page.locator(".stop").nth(1)).toContainText("The Morning Cup");
  await expect(page.locator(".stop").nth(1)).toContainText("Read CPSC notes");
  await coffee.getByLabel("Duration for The Morning Cup").fill("45");
  await coffee.getByLabel("Duration for The Morning Cup").press("Enter");
  await expect(coffee.getByLabel("Duration for The Morning Cup")).toHaveValue(
    "45",
  );
  await page.getByRole("button", { name: "Add stop", exact: true }).click();
  await page.getByRole("button", { name: /Neighbourhood Market/ }).click();
  await expect(page.locator(".stop")).toHaveCount(5);
  await expect(page.locator(".chosen-stops>div")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Remove Neighbourhood Market", exact: true })
    .click();
  await expect(page.locator(".stop")).toHaveCount(4);
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect(page.locator(".stop")).toHaveCount(5);
  await expect(page.locator(".chosen-stops>div")).toHaveCount(5);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download trip JSON" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^pathwayve-.*\.json$/);
  const stream = await download.createReadStream();
  let contents = "";
  for await (const chunk of stream!) contents += chunk.toString();
  const exportedTrip = JSON.parse(contents);
  expect(exportedTrip.trip.stops).toHaveLength(5);
  expect(exportedTrip.activities[0]).toMatchObject({
    title: "Read CPSC notes",
    completed: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("workspace-edited.png"),
    fullPage: true,
  });
});

test("a rejected edit preserves the plan and dialogs support Escape", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample trip" }).click();
  await page.getByRole("button", { name: "Plan my day" }).click();
  await expect(page.locator(".stop")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Lock Harbour Green Break", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove The Morning Cup", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "locked stop",
  );
  await expect(page.locator(".stop")).toHaveCount(4);
  await page.getByRole("button", { name: "Add stop", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add stop", exact: true }),
  ).toBeFocused();
});

test("choose arbitrary endpoints and approve ranked places before planning", async ({
  page,
}) => {
  await page.route("**/api/search", async (route) => {
    const query = route.request().postDataJSON().query as string;
    const places = query.includes("Origin")
      ? [
          {
            id: "origin",
            name: "Library entrance",
            category: "attraction",
            location: { lat: 49.279, lng: -123.115 },
          },
        ]
      : query.includes("Destination")
        ? [
            {
              id: "destination",
              name: "Community Centre",
              category: "attraction",
              location: { lat: 49.28, lng: -123.12 },
            },
          ]
        : [
            {
              id: "cafe-a",
              name: "Sunset Cafe",
              category: "coffee",
              location: { lat: 49.28, lng: -123.116 },
              rating: 4.8,
              ratingCount: 100,
            },
            {
              id: "cafe-b",
              name: "Garden Cafe",
              category: "coffee",
              location: { lat: 49.282, lng: -123.117 },
              rating: 4.2,
              ratingCount: 20,
            },
          ];
    await route.fulfill({ json: { source: "live", places } });
  });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Search starting point", exact: true })
    .fill("Origin address");
  await page
    .getByRole("region", { name: "Search starting point", exact: true })
    .getByRole("button", { name: "Search", exact: true })
    .click();
  await page.getByRole("button", { name: /Library entrance/ }).click();
  await page
    .getByRole("textbox", { name: "Search destination", exact: true })
    .fill("Destination address");
  await page
    .getByRole("region", { name: "Search destination", exact: true })
    .getByRole("button", { name: "Search", exact: true })
    .click();
  await page.getByRole("button", { name: /Community Centre/ }).click();
  await page.getByRole("button", { name: "Find a place to visit" }).click();
  await page
    .getByRole("textbox", { name: "Search optional stops", exact: true })
    .fill("cafes");
  await page
    .getByRole("region", { name: "Search optional stops", exact: true })
    .getByRole("button", { name: "Search", exact: true })
    .click();
  await expect(page.locator(".chosen-stops>div")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Save Garden Cafe", exact: true })
    .click();
  await expect(page.locator(".place-result").first()).toContainText(
    "Garden Cafe",
  );
  await page
    .locator(".place-result")
    .filter({ hasText: "Sunset Cafe" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.locator(".chosen-stops>div")).toHaveCount(1);
  const requestEvent = page.waitForRequest((r) =>
    r.url().endsWith("/api/plan"),
  );
  await page.getByRole("button", { name: "Plan my day" }).click();
  const request = (await requestEvent).postDataJSON();
  expect(request.origin.name).toBe("Library entrance");
  expect(request.destination.name).toBe("Community Centre");
  expect(request.selectedStops.map((s: { id: string }) => s.id)).toEqual([
    "cafe-a",
  ]);
  expect(request.favoritePlaceIds).toEqual(["cafe-b"]);
  expect(new Date(request.startTime).getTime()).toBeGreaterThan(
    Date.now() - 60000,
  );
  await expect(page.locator(".stop")).toHaveCount(1);
  await expect(page.locator(".stop")).toContainText("Sunset Cafe");
});
