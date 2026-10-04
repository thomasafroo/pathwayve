import { expect, test } from "@playwright/test";

// Typing before hydration races React's replay of the input event. The header's
// session check is requested from an effect, so it only fires once hydrated.
async function gotoHydrated(page: import("@playwright/test").Page) {
  const hydrated = page.waitForRequest("**/api/auth/get-session");
  await page.goto("/");
  await hydrated;
}
test("plan a day and replan while preserving a locked stop", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample trip" }).click();
  await expect(page.getByRole("heading", { name: "Plan trip" })).toBeVisible();
  await page
    .getByRole("button", { name: /Create itinerary|Update route/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Itinerary", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".stop")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Lock The Morning Cup", exact: true })
    .click();
  await page.getByText("Weather and trip updates", { exact: true }).click();
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
  await page
    .getByRole("button", { name: /Create itinerary|Update route/ })
    .click();
  await expect(page.locator(".stop")).toHaveCount(4);
  await page.getByLabel("Departure", { exact: true }).fill("2030-10-03T13:00");
  await page.getByLabel("Finish by", { exact: true }).fill("2030-10-03T12:00");
  await page
    .getByRole("button", { name: /Create itinerary|Update route/ })
    .click();
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
  await page
    .getByRole("button", { name: /Create itinerary|Update route/ })
    .click();
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
  await page
    .locator(".itinerary-panel")
    .getByRole("button", { name: "Add stop", exact: true })
    .click();
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
  await page
    .getByRole("button", { name: /Create itinerary|Update route/ })
    .click();
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
  await page
    .locator(".itinerary-panel")
    .getByRole("button", { name: "Add stop", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page
      .locator(".itinerary-panel")
      .getByRole("button", { name: "Add stop", exact: true }),
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
    .getByRole("combobox", { name: "Search starting point", exact: true })
    .fill("Origin address");
  await page
    .getByRole("region", { name: "Search starting point", exact: true })
    .getByRole("button", { name: "Search", exact: true })
    .click();
  await page.getByRole("button", { name: /Library entrance/ }).click();
  await page
    .getByRole("combobox", { name: "Search destination", exact: true })
    .fill("Destination address");
  await page
    .getByRole("region", { name: "Search destination", exact: true })
    .getByRole("button", { name: "Search", exact: true })
    .click();
  await page.getByRole("button", { name: /Community Centre/ }).click();
  await page.getByRole("button", { name: "Add stop", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Search optional stops", exact: true })
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
  await page
    .getByRole("button", { name: /Create itinerary|Update route/ })
    .click();
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

test("four planner states keep chat messages and resize when the itinerary opens", async ({
  page,
}, testInfo) => {
  await page.route("**/api/schedules/preview", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: [] })
      : route.fulfill({
          json: { clarification: "Which day should I plan lunch for?" },
        }),
  );
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");
  const map = page.getByRole("region", { name: "Trip map", exact: true });
  expect((await map.boundingBox())!.width).toBe(1104);
  await expect(page.getByLabel("Itinerary panel", { exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({ path: testInfo.outputPath("01-planner.png") });
  await page.getByRole("button", { name: "Open trip chat" }).click();
  const chat = page.getByRole("region", { name: "Trip chat", exact: true });
  expect((await chat.boundingBox())!.width).toBe(
    (await map.boundingBox())!.width - 32,
  );
  await page.getByLabel("Chat message").fill("Leave time for lunch");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(chat).toContainText("Leave time for lunch");
  await expect(chat).toContainText("Which day should I plan lunch for?");
  await page.screenshot({ path: testInfo.outputPath("02-chat.png") });
  await page.getByRole("button", { name: "Load sample trip" }).click();
  await page.getByRole("button", { name: "Create itinerary" }).click();
  await expect(page.locator(".stop")).toHaveCount(4);
  await expect(chat).toHaveClass(/compact/);
  await expect.poll(async () => (await chat.boundingBox())!.width).toBe(688);
  expect((await map.boundingBox())!.width).toBe(720);
  await page.screenshot({ path: testInfo.outputPath("04-itinerary-chat.png") });
  await page.getByRole("button", { name: "Close chat panel" }).click();
  await expect(chat).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("03-itinerary.png") });
  await page.getByRole("button", { name: "Open trip chat" }).click();
  await expect(chat).toContainText("Leave time for lunch");
  await page
    .getByRole("button", { name: "Close itinerary", exact: true })
    .click();
  await expect(chat).not.toHaveClass(/compact/);
  await page.getByLabel("Chat message").press("Escape");
  await expect(
    page.getByRole("button", { name: "Open trip chat" }),
  ).toBeFocused();
});

test("mobile planner remains usable with chat and itinerary", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Load sample trip" }).click();
  await page.getByRole("button", { name: "Create itinerary" }).click();
  await expect(page.locator(".stop")).toHaveCount(4);
  await page.getByRole("button", { name: "Open trip chat" }).click();
  await expect(
    page.getByRole("region", { name: "Trip chat", exact: true }),
  ).toBeVisible();
  // The itinerary animates in; measure the settled responsive layout.
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("mobile.png"),
    fullPage: true,
  });
});

test("location tracking is opt-in, receives movement, and stops listening", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let success: PositionCallback;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition(callback: PositionCallback) {
          success = callback;
          document.documentElement.dataset.locationWatch = "started";
          return 42;
        },
        clearWatch(id: number) {
          document.documentElement.dataset.clearedWatch = String(id);
        },
      },
    });
    window.addEventListener("test-position", (event) => {
      const detail = (event as CustomEvent).detail;
      success?.({
        coords: detail,
        timestamp: Date.now(),
      } as GeolocationPosition);
    });
  });
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-location-watch",
    "started",
  );
  await page.getByRole("button", { name: "Follow my location" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-location-watch",
    "started",
  );
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("test-position", {
        detail: { latitude: 49.28, longitude: -123.1, accuracy: 18 },
      }),
    ),
  );
  await expect(page.locator(".location-readout")).toContainText("±18 m");
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("test-position", {
        detail: { latitude: 49.29, longitude: -123.12, accuracy: 9 },
      }),
    ),
  );
  await expect(page.locator(".location-readout")).toContainText("±9 m");
  await page.getByRole("button", { name: "Stop tracking" }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-cleared-watch",
    "42",
  );
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("test-position", {
        detail: { latitude: 49.3, longitude: -123.13, accuracy: 5 },
      }),
    ),
  );
  await expect(page.locator(".location-readout")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Follow my location" }),
  ).toBeVisible();
});

test("denied location permission leaves the trip planner usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition(
          _success: PositionCallback,
          failure: PositionErrorCallback,
        ) {
          setTimeout(
            () => failure({ code: 1 } as GeolocationPositionError),
            10,
          );
          return 3;
        },
        clearWatch() {},
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Follow my location" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Location permission was denied",
  );
  await expect(page.getByRole("button", { name: "Stop tracking" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Load sample trip" }).click();
  await page
    .getByRole("button", { name: /Create itinerary|Update route/ })
    .click();
  await expect(page.locator(".stop")).toHaveCount(4);
});

test("typing suggests places, keyboard selection resolves coordinates, and sessions reset", async ({
  page,
}, testInfo) => {
  const requests: { query: string; sessionToken: string }[] = [];
  const details: { placeId: string; sessionToken: string }[] = [];
  await page.route("**/api/autocomplete", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        source: "live",
        suggestions: [
          {
            placeId: "library",
            name: "Vancouver Public Library",
            address: "350 W Georgia Street, Vancouver",
          },
          {
            placeId: "museum",
            name: "Vancouver Museum",
            address: "Vanier Park, Vancouver",
          },
        ],
      },
    });
  });
  await page.route("**/api/place-details", async (route) => {
    details.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        place: {
          id: "museum",
          name: "Vancouver Museum",
          category: "attraction",
          location: { lat: 49.276, lng: -123.145 },
        },
      },
    });
  });
  await gotoHydrated(page);
  const input = page.getByRole("combobox", {
    name: "Search starting point",
    exact: true,
  });
  await input.fill("Vanc");
  await expect(
    page.getByRole("option", { name: /Vancouver Public Library/ }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  await input.fill("Vancouver");
  await expect(
    page.getByRole("option", { name: /Vancouver Public Library/ }),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0].sessionToken).toBe(requests[1].sessionToken);
  await page.screenshot({ path: testInfo.outputPath("autocomplete.png") });
  await input.press("ArrowDown");
  await input.press("ArrowDown");
  await expect(
    page.getByRole("option", { name: /Vancouver Museum/ }),
  ).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "Vancouver Museum Change" }),
  ).toBeVisible();
  expect(details[0]).toMatchObject({
    placeId: "museum",
    sessionToken: requests[0].sessionToken,
  });
  await expect(page.locator(".stop")).toHaveCount(0); // Enter selected a place; it did not submit the trip.
  const destination = page.getByRole("combobox", {
    name: "Search destination",
    exact: true,
  });
  await destination.fill("Vancouver");
  await expect(
    page.getByRole("option", { name: /Vancouver Museum/ }),
  ).toBeVisible();
  expect(requests.at(-1)!.sessionToken).not.toBe(requests[0].sessionToken);
  await destination.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(destination).toHaveValue("Vancouver");
  await page
    .getByRole("button", { name: "Clear Search destination", exact: true })
    .click();
  await expect(destination).toHaveValue("");
});

test("late suggestions cannot replace a newer query or reopen after dismissal", async ({
  page,
}) => {
  let releaseOld: () => void = () => {};
  const oldResponse = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  await page.route("**/api/autocomplete", async (route) => {
    const query = route.request().postDataJSON().query;
    if (query === "old") await oldResponse;
    await route
      .fulfill({
        json: {
          source: "live",
          suggestions: [
            { placeId: query, name: `${query} place`, address: "Vancouver" },
          ],
        },
      })
      .catch(() => {});
  });
  await gotoHydrated(page);
  const input = page.getByRole("combobox", {
    name: "Search starting point",
    exact: true,
  });
  const firstRequest = page.waitForRequest((r) =>
    r.url().endsWith("/api/autocomplete"),
  );
  await input.fill("old");
  await firstRequest;
  await input.fill("new");
  await expect(
    page.getByRole("option", { name: "new place Vancouver" }),
  ).toBeVisible();
  releaseOld();
  await expect(
    page.getByRole("option", { name: "old place Vancouver" }),
  ).toHaveCount(0);
  await input.press("Escape");
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await input.fill("latest");
  await expect(
    page.getByRole("option", { name: "latest place Vancouver" }),
  ).toBeVisible();
  await page.getByRole("heading", { name: "Plan trip" }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
});
