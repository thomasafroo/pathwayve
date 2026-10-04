import { beforeEach, expect, it, vi } from "vitest";
import { scheduleIntent, owner } from "./fixtures/schedule";
import { discoverRoutePlace } from "@/lib/route-discovery";
import { materializeSchedule } from "@/lib/schedule-planning";
import { computeScheduleLeg } from "@/lib/schedule-routing";
import { searchPlaces } from "@/lib/place-search";
import { tryGroundPlaces } from "@/lib/maps-grounding";
import { planningConstraintsSchema } from "@/types/planning-constraints";
import {
  tripRequestSchema,
  type CandidatePlace,
  type PlaceInsight,
} from "@/types/trip";
vi.mock("@/lib/place-search", () => ({ searchPlaces: vi.fn() }));
vi.mock("@/lib/schedule-routing", () => ({ computeScheduleLeg: vi.fn() }));
vi.mock("@/lib/maps-grounding", () => ({ tryGroundPlaces: vi.fn() }));

const place = (id: string, lat: number, lng: number): CandidatePlace => ({
  id,
  name: id,
  category: "coffee",
  location: { lat, lng },
});
const origin = place("Origin", 49.28, -123.15);
const destination = place("Destination", 49.3, -123.12);
const near = place("Near", 49.289, -123.1365);
const better = place("Better", 49.29, -123.135);
const insight = (
  fit: number,
  verified: PlaceInsight["verified"] = [],
): PlaceInsight => ({
  provider: "google_maps_grounding",
  checkedFor: "coffee",
  summary: `Fit ${fit}`,
  highlights: [],
  fit,
  verified,
  sources: [{ kind: "place", title: "Place", uri: "https://maps.google.com/" }],
  checkedAt: "2030-10-04T12:00:00-07:00",
});
const request = tripRequestSchema.parse({
  origin,
  destination,
  transportation: "walking",
  activities: [],
  startTime: "2030-10-04T13:00:00-07:00",
  endTime: "2030-10-04T18:00:00-07:00",
  preferences: "Somewhere calm",
});
function item(requirements = { seating: false, quiet: false, wifi: false }) {
  return {
    ...scheduleIntent().schedule_items[0],
    kind: "task" as const,
    title: "Work for an hour",
    requirements,
    id: "work",
    schedule_id: "s",
    place_id: null,
  };
}
// "Better" adds `extra` minutes of travel each way compared with "Near".
function legs(extra: number) {
  vi.mocked(computeScheduleLeg).mockImplementation(async (from, to, req) => ({
    from: from.name,
    to: to.name,
    path: [from.location, to.location],
    durationMinutes:
      from.id === "Better" || to.id === "Better" ? 10 + extra : 10,
    distanceMeters: 1000,
    mode: req.transportation,
  }));
}
beforeEach(() => {
  vi.mocked(searchPlaces).mockReset();
  vi.mocked(searchPlaces).mockResolvedValue({
    source: "live",
    places: [near, better],
  });
  vi.mocked(tryGroundPlaces).mockReset();
  vi.mocked(computeScheduleLeg).mockReset();
});
const discover = (work = item()) =>
  discoverRoutePlace({
    query: "coffee shop",
    item: work,
    origin,
    destination,
    anchors: [],
    request,
    radiusMeters: 500,
  });

it("trades a little extra travel for a much better Google Maps match", async () => {
  legs(5);
  vi.mocked(tryGroundPlaces).mockResolvedValue(
    new Map([
      ["Near", insight(3)],
      ["Better", insight(9)],
    ]),
  );
  const result = await discover();
  expect(result?.place).toMatchObject({ id: "Better", insight: { fit: 9 } });
  expect(vi.mocked(tryGroundPlaces).mock.calls[0][0]).toMatchObject({
    want: "Work for an hour (coffee shop)",
    preferences: "Somewhere calm",
    candidates: expect.arrayContaining([
      expect.objectContaining({ id: "Near" }),
      expect.objectContaining({ id: "Better" }),
    ]),
  });
});

it("keeps the faster place when the better match costs too much time", async () => {
  legs(30);
  vi.mocked(tryGroundPlaces).mockResolvedValue(
    new Map([
      ["Near", insight(6)],
      ["Better", insight(9)],
    ]),
  );
  expect((await discover())?.place.id).toBe("Near");
});

it("prefers places whose requested amenities are verified", async () => {
  legs(30);
  vi.mocked(tryGroundPlaces).mockResolvedValue(
    new Map([
      ["Near", insight(8, ["seating"])],
      ["Better", insight(6, ["seating", "wifi"])],
    ]),
  );
  const result = await discover(
    item({ seating: true, quiet: false, wifi: true }),
  );
  expect(result?.place.id).toBe("Better");
});

it("falls back to the earliest arrival without grounding", async () => {
  legs(5);
  vi.mocked(tryGroundPlaces).mockResolvedValue(null);
  const result = await discover();
  expect(result?.place.id).toBe("Near");
  expect(result?.place.insight).toBeUndefined();
});

it("schedules a wifi task only when Google Maps verified wifi", async () => {
  legs(5);
  const constraints = planningConstraintsSchema.parse({
    origin: { ...origin, placeId: origin.id },
    destination: { ...destination, placeId: destination.id },
    transportation: "walking",
    selectedStops: [],
    startTime: request.startTime,
    endTime: request.endTime,
    timeZone: "America/Vancouver",
    routingPriority: "fastest",
    budget: "any",
    activities: [],
    interestTags: [],
    preferences: "",
    routeRadiusMeters: 500,
  });
  const draft = scheduleIntent();
  draft.schedule_items = [
    {
      ...draft.schedule_items[0],
      kind: "task",
      title: "Work for an hour",
      place_query: "coffee shop",
      location_scope: "along_route",
      requirements: { seating: false, quiet: false, wifi: true },
    },
  ];
  vi.mocked(tryGroundPlaces).mockResolvedValue(
    new Map([["Near", insight(8, ["wifi"])]]),
  );
  const verified = await materializeSchedule(draft, owner, constraints);
  const run = verified.document.schedule_runs[0];
  expect(run.result.placements).toHaveLength(1);
  expect(run.result.map_trip?.stops[0].insight?.verified).toEqual(["wifi"]);
  expect(run.result.warnings).toContainEqual(
    expect.stringMatching(/Gemini checked 1 stop/),
  );

  vi.mocked(tryGroundPlaces).mockResolvedValue(new Map([["Near", insight(8)]]));
  const unverified = await materializeSchedule(draft, owner, constraints);
  expect(
    unverified.document.schedule_runs[0].result.unscheduled_items[0]
      .reason_code,
  ).toBe("REQUIREMENTS_UNVERIFIED");
});
