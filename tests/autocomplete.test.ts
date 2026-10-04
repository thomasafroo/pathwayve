import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { autocompletePlaces, resolvePlace } from "@/lib/place-autocomplete";
import { POST as autocomplete } from "@/app/api/autocomplete/route";
const sessionToken = "0a04d186-2738-4017-b5de-0bf4b520b7dd";
beforeEach(() => {
  vi.stubEnv("MAPS_DATA_MODE", "live");
  vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "test-only");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("uses Google predictions and resolves the selected ID with the same session", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        suggestions: [
          {
            placePrediction: {
              placeId: "library-id",
              text: { text: "Vancouver Public Library, Vancouver BC" },
              structuredFormat: {
                mainText: { text: "Vancouver Public Library" },
                secondaryText: { text: "Vancouver, BC" },
              },
            },
          },
        ],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        id: "library-id",
        displayName: { text: "Vancouver Public Library" },
        location: { latitude: 49.279, longitude: -123.115 },
        formattedAddress: "350 W Georgia St",
      }),
    );
  vi.stubGlobal("fetch", fetch);
  const prediction = await autocompletePlaces({
    query: "vanc lib",
    near: { lat: 49.28, lng: -123.1 },
    sessionToken,
  });
  expect(prediction.suggestions[0]).toEqual({
    placeId: "library-id",
    name: "Vancouver Public Library",
    address: "Vancouver, BC",
  });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
    input: "vanc lib",
    sessionToken,
    locationBias: { circle: { radius: 10000 } },
  });
  const details = await resolvePlace({
    placeId: "library-id",
    sessionToken,
    category: "attraction",
  });
  expect(details.place.location).toEqual({ lat: 49.279, lng: -123.115 });
  const url = fetch.mock.calls[1][0] as URL;
  expect(url.pathname).toBe("/v1/places/library-id");
  expect(url.searchParams.get("sessionToken")).toBe(sessionToken);
  expect(url.searchParams.has("key")).toBe(false);
});
it("handles no predictions and rejects provider failures without inventing places", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(new Response("{}", { status: 403 })),
  );
  expect(
    (await autocompletePlaces({ query: "none", sessionToken })).suggestions,
  ).toEqual([]);
  await expect(
    resolvePlace({ placeId: "unknown", sessionToken, category: "attraction" }),
  ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
});
it("validates autocomplete input before contacting Google", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const response = await autocomplete(
    new Request("http://localhost/api/autocomplete", {
      method: "POST",
      body: JSON.stringify({ query: "x", sessionToken: "invalid" }),
    }),
  );
  expect(response.status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
it("resolves a demo suggestion to the same exact sample place", async () => {
  vi.stubEnv("MAPS_DATA_MODE", "demo");
  const result = await autocompletePlaces({ query: "Morning", sessionToken });
  expect(result.source).toBe("demo");
  const details = await resolvePlace({
    placeId: result.suggestions[0].placeId,
    sessionToken,
    category: "coffee",
  });
  expect(details.place.name).toBe(result.suggestions[0].name);
  expect(details.place.location).toBeDefined();
});
