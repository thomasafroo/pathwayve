import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("pathwayve.welcomed", "true"),
  );
});
test("live navigation uses GPS, steps through stops, and releases tracking", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let success: PositionCallback;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        watchPosition(callback: PositionCallback) {
          success = callback;
          return 42;
        },
        clearWatch(id: number) {
          document.documentElement.dataset.clearedWatch = String(id);
        },
      },
    });
    window.addEventListener("test-position", (event) => {
      success?.({
        coords: (event as CustomEvent).detail,
        timestamp: Date.now(),
      } as GeolocationPosition);
    });
  });
  await page.route("**/api/plan", async (route) => {
    const response = await route.fetch();
    const trip = await response.json();
    trip.source = "live";
    await route.fulfill({ json: trip });
  });
  const requests: {
    origin: { lat: number; lng: number };
    destination: { name: string };
    transportation: string;
  }[] = [];
  await page.route("**/api/navigation", async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({
      json: {
        from: "Your location",
        to: body.destination.name,
        durationMinutes: 8,
        distanceMeters: 1800,
        mode: body.transportation,
        path: [body.origin, body.destination.location],
        steps: [
          {
            instruction: "Walk to the station",
            mode: "WALK",
            durationMinutes: 3,
          },
          { instruction: "Take bus 99", mode: "TRANSIT", durationMinutes: 5 },
        ],
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Departure", { exact: true }).fill("2030-10-04T09:00");
  await page.getByLabel("Finish by", { exact: true }).fill("2030-10-04T23:00");
  await page.getByRole("button", { name: "Load sample trip" }).click();
  await expect(page.locator(".stop")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Start navigation", exact: true })
    .click();
  await expect(
    page.getByText("Waiting for a fresh, accurate location fix", {
      exact: false,
    }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("test-position", {
        detail: { latitude: 49.28, longitude: -123.1, accuracy: 12 },
      }),
    ),
  );
  const navigation = page.getByRole("region", {
    name: "Live navigation",
    exact: true,
  });
  await expect(navigation.getByText("8 min", { exact: false })).toBeVisible();
  expect(requests[0].origin).toEqual({ lat: 49.28, lng: -123.1 });
  expect(requests[0].transportation).toBe("transit");
  await navigation.getByText("Route directions", { exact: true }).click();
  await expect(
    navigation.getByText("Take bus 99", { exact: true }),
  ).toBeVisible();
  const first = requests[0].destination.name;
  await navigation
    .getByRole("button", { name: "Continue to next stop" })
    .click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].destination.name).not.toBe(first);
  await expect(
    navigation.getByRole("link", { name: "Navigate in Google Maps" }),
  ).toHaveAttribute("href", /travelmode=transit/);
  await navigation.getByRole("button", { name: "Stop navigation" }).click();
  await expect(navigation).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute(
    "data-cleared-watch",
    "42",
  );
});
