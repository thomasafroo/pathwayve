import { afterEach, expect, it, vi } from "vitest";
import { searchPlaces } from "@/lib/place-search";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("keeps No Frills brand matches and requests strict cinema filtering", async () => {
  vi.stubEnv("MAPS_DATA_MODE", "live");
  vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "test-only");
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      places: [
        {
          id: "wrong",
          displayName: { text: "Open Kitchen" },
          location: { latitude: 49.2, longitude: -123.2 },
        },
        {
          id: "right",
          displayName: { text: "Joe's NOFRILLS" },
          location: { latitude: 49.2, longitude: -123.1 },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const result = await searchPlaces({
    query: "nofrills near UBC",
    category: "shopping",
    budget: "any",
  });
  expect(result.places.map((place) => place.id)).toEqual(["right"]);
  fetch.mockResolvedValueOnce(Response.json({ places: [] }));
  await searchPlaces({
    query: "movie theater downtown",
    category: "attraction",
    budget: "any",
  });
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
    includedType: "movie_theater",
    strictTypeFiltering: true,
  });
});
