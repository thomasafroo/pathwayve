import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tripRequestSchema } from "@/types/trip";
import { exampleRequest, endpoints } from "@/lib/fixtures";
import { planTrip, replanTrip } from "@/lib/planner";
import { scheduleTrip } from "@/lib/routes";
import { searchPlaces } from "@/lib/place-search";
import { POST as editTrip } from "@/app/api/trip-edit/route";
import { createWorkspace } from "@/lib/trip-workspace";

function localParts(time: string, timeZone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(time))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

beforeEach(() => {
  vi.stubEnv("DATA_MODE", "demo");
  vi.stubEnv("MAPS_DATA_MODE", "demo");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("time windows and explicit user choices", () => {
  it("resolves omitted dates to now and local end of day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T02:00:00Z"));
    const request = tripRequestSchema.parse({
      ...exampleRequest(),
      startTime: undefined,
      endTime: undefined,
      timeZone: "America/Vancouver",
    });
    expect(request.startTime).toBe("2026-10-04T02:00:00.000Z");
    expect(request.endTime).toBe("2026-10-04T06:59:59.999Z");
  });
  it("handles DST, explicit multi-day ranges, and invalid timezones", () => {
    const base = exampleRequest();
    const dstEnd = tripRequestSchema.parse({
      ...base,
      timeZone: "America/Vancouver",
      startTime: "2026-11-01T07:30:00Z",
      endTime: undefined,
    }).endTime;
    expect(localParts(dstEnd, "America/Vancouver")).toMatchObject({
      year: "2026",
      month: "11",
      day: "01",
      hour: "23",
      minute: "59",
      second: "59",
    });
    expect(
      tripRequestSchema.parse({
        ...base,
        startTime: "2026-10-03T10:00:00-07:00",
        endTime: "2026-10-06T18:00:00-07:00",
      }).endTime,
    ).toBe("2026-10-06T18:00:00-07:00");
    expect(
      tripRequestSchema.safeParse({ ...base, timeZone: "not-a-zone" }).success,
    ).toBe(false);
  });
  it("never adds suggestions to an explicitly empty stop list", async () => {
    const trip = await planTrip({
      ...exampleRequest(),
      selectedStops: [],
      suggestionMode: "suggest",
      interestTags: ["Libraries"],
      favoritePlaceIds: ["my-favourite"],
    });
    expect(trip.stops).toEqual([]);
    expect(trip.legs).toHaveLength(1);
    expect(trip.request.interestTags).toEqual(["Libraries"]);
    expect(trip.request.favoritePlaceIds).toEqual(["my-favourite"]);
  });
});
const response = (duration: string, lat = 49.28) => ({
  duration,
  distanceMeters: 1500,
  polyline: {
    geoJsonLinestring: {
      coordinates: [
        [-123.1, lat],
        [-123.11, 49.29],
      ],
    },
  },
  legs: [
    {
      steps: [
        {
          staticDuration: "120s",
          travelMode: "WALK",
          navigationInstruction: { instructions: "Walk to the station" },
        },
        {
          staticDuration: "600s",
          travelMode: "TRANSIT",
          transitDetails: { transitLine: { nameShort: "R5" } },
        },
      ],
    },
  ],
});
it("preserves exact required choices when a shorter window cannot fit them", async () => {
  const base = await planTrip(exampleRequest());
  const selected = tripRequestSchema.parse({
    ...exampleRequest(),
    selectedStops: base.stops.map((stop) => ({
      ...stop,
      priority: "required",
    })),
  });
  const trip = await planTrip(selected);
  await expect(
    replanTrip(trip, {
      type: "EARLIER_END",
      endTime: new Date(Date.parse(trip.arrivalTime) - 60000).toISOString(),
    }),
  ).rejects.toMatchObject({ code: "LOCKED_CONFLICT" });
});

describe("live geographic providers without Gemini", () => {
  beforeEach(() => {
    vi.stubEnv("MAPS_DATA_MODE", "live");
    vi.stubEnv("GOOGLE_MAPS_SERVER_API_KEY", "test-only");
    vi.stubEnv("WEATHER_DATA_MODE", "off");
  });
  it.each(["driving", "walking", "transit"] as const)(
    "requests %s geometry and preserves steps",
    async (transportation) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(
          Response.json({ routes: [response("900s"), response("600s")] }),
        );
      vi.stubGlobal("fetch", fetch);
      const trip = await planTrip({
        ...exampleRequest(),
        transportation,
        selectedStops: [],
        routingPriority: "fastest",
      });
      const body = JSON.parse(fetch.mock.calls[0][1].body);
      expect(body.travelMode).toBe(
        { driving: "DRIVE", walking: "WALK", transit: "TRANSIT" }[
          transportation
        ],
      );
      expect(body.routingPreference).toBe(
        transportation === "driving" ? "TRAFFIC_AWARE" : undefined,
      );
      if (transportation === "walking")
        expect(body.departureTime).toBeUndefined();
      expect(trip.legs[0].durationMinutes).toBe(10);
      expect(trip.legs[0].path[0]).toEqual({ lat: 49.28, lng: -123.1 });
      expect(trip.legs[0].steps?.[1].line).toBe("R5");
      expect(fetch).toHaveBeenCalledTimes(1); // Routes only; no model invocation.
    },
  );
  it.each(["less_walking", "fewer_transfers"] as const)(
    "passes transit preference %s without overriding Google’s ranking",
    async (routingPriority) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(
          Response.json({ routes: [response("900s"), response("600s")] }),
        );
      vi.stubGlobal("fetch", fetch);
      const trip = await scheduleTrip(
        { ...exampleRequest(), routingPriority },
        [],
      );
      expect(
        JSON.parse(fetch.mock.calls[0][1].body).transitPreferences
          .routingPreference,
      ).toBe(
        routingPriority === "less_walking" ? "LESS_WALKING" : "FEWER_TRANSFERS",
      );
      expect(trip.legs[0].durationMinutes).toBe(15);
    },
  );
  it("searches arbitrary names and addresses and retains rating facts", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        places: [
          {
            id: "real-place",
            displayName: { text: "Central Library" },
            location: { latitude: 49.279, longitude: -123.115 },
            formattedAddress: "350 W Georgia St",
            rating: 4.7,
            userRatingCount: 100,
            googleMapsUri: "https://maps.google.com/?cid=123",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await searchPlaces({
      query: "Central Library Vancouver",
      category: "attraction",
      near: endpoints[1].location,
      budget: "any",
    });
    expect(result.source).toBe("live");
    expect(result.places[0]).toMatchObject({
      name: "Central Library",
      rating: 4.7,
      ratingCount: 100,
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body).textQuery).toBe(
      "Central Library Vancouver",
    );
  });
  it("propagates provider failures instead of inventing routes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 403 })),
    );
    await expect(scheduleTrip(exampleRequest(), [])).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });
  it("recomputes live legs when a JSON modification adds a stop", async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ routes: [response("600s")] })),
      );
    vi.stubGlobal("fetch", fetch);
    const state = createWorkspace(
      await planTrip({ ...exampleRequest(), selectedStops: [] }),
    );
    const result = await editTrip(
      new Request("http://localhost/api/trip-edit", {
        method: "POST",
        body: JSON.stringify({
          state,
          batch: {
            tripId: state.trip.id,
            baseVersion: 0,
            modifications: [
              {
                type: "ADD_STOP",
                index: 0,
                stop: {
                  id: "library",
                  name: "Library",
                  category: "attraction",
                  location: endpoints[1].location,
                  arrivalTime: state.trip.request.startTime,
                  durationMinutes: 30,
                  reason: "Chosen by you",
                  locked: false,
                },
              },
            ],
          },
        }),
      }),
    );
    expect(result.status).toBe(200);
    const json = await result.json();
    expect(json.trip.legs).toHaveLength(2);
    expect(json.trip.source).toBe("live");
    expect(json.version).toBe(1);
  });
  it("attaches structured weather when enabled without calling a model", async () => {
    vi.stubEnv("WEATHER_DATA_MODE", "live");
    const fetch = vi.fn().mockImplementation((url: string | URL) => {
      const value = String(url);
      if (value.includes("open-meteo"))
        return Promise.resolve(
          Response.json({
            hourly: {
              time: [
                "2030-10-03T19:00",
                "2030-10-03T20:00",
                "2030-10-03T21:00",
              ],
              temperature_2m: [13, 12.5, 12],
              precipitation_probability: [20, 65, 80],
              weather_code: [3, 61, 61],
            },
          }),
        );
      return Promise.resolve(Response.json({ routes: [response("600s")] }));
    });
    vi.stubGlobal("fetch", fetch);
    const trip = await planTrip({
      ...exampleRequest(),
      selectedStops: [],
      startTime: "2030-10-03T19:00:00Z",
      endTime: "2030-10-03T22:00:00Z",
    });
    expect(trip.weather).toHaveLength(3);
    expect(trip.weather?.[1]).toMatchObject({
      temperatureCelsius: 12.5,
      precipitationProbability: 65,
      condition: "rain",
    });
    expect(trip.bringAdvice).toMatchObject({
      warmth: "hoodie",
      precipitation: "rain_gear",
      accessories: ["umbrella", "rain_jacket"],
    });
    expect(trip.warnings[0]).toContain("rain risk up to 80%");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("reports unavailable weather without fabricating conditions", async () => {
    vi.stubEnv("WEATHER_DATA_MODE", "live");
    const fetch = vi.fn().mockImplementation((url: string | URL) => {
      if (String(url).includes("open-meteo"))
        return Promise.resolve(new Response("{}", { status: 503 }));
      return Promise.resolve(Response.json({ routes: [response("600s")] }));
    });
    vi.stubGlobal("fetch", fetch);
    const trip = await planTrip({
      ...exampleRequest(),
      selectedStops: [],
    });
    expect(trip.weather).toBeUndefined();
    expect(trip.warnings).toContain(
      "Weather forecast is unavailable right now; no conditions were estimated.",
    );
  });
});
