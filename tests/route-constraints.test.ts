import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { scheduleIntent, owner } from "./fixtures/schedule";
import { planningConstraintsSchema } from "@/types/planning-constraints";
import { enforceScheduleConstraints } from "@/lib/schedule-constraints";
import { materializeSchedule } from "@/lib/schedule-planning";
import { discoverRoutePlace, distanceToPath } from "@/lib/route-discovery";
import { computeScheduleLeg } from "@/lib/schedule-routing";
import { searchPlaces } from "@/lib/place-search";
import { tripRequestSchema, type CandidatePlace } from "@/types/trip";
import { AppError } from "@/lib/server/http";
vi.mock("@/lib/place-search", () => ({ searchPlaces: vi.fn() }));
vi.mock("@/lib/schedule-routing", () => ({ computeScheduleLeg: vi.fn() }));
const place = (id: string, lat: number, lng: number): CandidatePlace => ({
  id,
  name: id,
  category: "attraction",
  location: { lat, lng },
});
const origin = place("Origin", 49.28, -123.15);
const destination = place("Destination", 49.3, -123.12);
const requiredPlace = place("Exact museum", 49.29, -123.14);
function constraints() {
  return planningConstraintsSchema.parse({
    origin: { ...origin, placeId: origin.id },
    destination: { ...destination, placeId: destination.id },
    transportation: "transit",
    selectedStops: [{ ...requiredPlace, durationMinutes: 45, locked: false }],
    startTime: "2030-10-04T13:00:00-07:00",
    endTime: "2030-10-04T18:00:00-07:00",
    timeZone: "America/Vancouver",
    routingPriority: "fewer_transfers",
    budget: "budget",
    activities: [],
    interestTags: [],
    preferences: "",
    routeRadiusMeters: 500,
  });
}
beforeEach(() => {
  vi.stubEnv("MAPS_DATA_MODE", "live");
  vi.mocked(searchPlaces).mockReset();
  vi.mocked(searchPlaces).mockResolvedValue({ source: "live", places: [] });
  vi.mocked(computeScheduleLeg).mockReset();
  vi.mocked(computeScheduleLeg).mockImplementation(
    async (from, to, request) => ({
      from: from.name,
      to: to.name,
      path: [from.location, to.location],
      durationMinutes: 10,
      distanceMeters: 1000,
      mode: request.transportation,
    }),
  );
});
afterEach(() => vi.unstubAllEnvs());
it("routes CURRENT_LOCATION from the supplied coordinates without searching for it", async () => {
  const draft = scheduleIntent();
  draft.schedules[0].origin_query = "CURRENT_LOCATION";
  draft.schedule_items = [];
  vi.mocked(searchPlaces).mockResolvedValue({
    source: "live",
    places: [destination],
  });
  const position = { lat: 49.26, lng: -123.25 };
  const result = await materializeSchedule(draft, owner, undefined, position);
  expect(result.workspace?.trip.request.origin.location).toEqual(position);
  expect(
    vi
      .mocked(searchPlaces)
      .mock.calls.some(([input]) => input.query === "CURRENT_LOCATION"),
  ).toBe(false);
});
it("rejects current-location endpoints when no usable location was supplied", async () => {
  const draft = scheduleIntent();
  draft.schedules[0].origin_query = "CURRENT_LOCATION";
  await expect(materializeSchedule(draft, owner)).rejects.toMatchObject({
    code: "LOCATION_UNAVAILABLE",
  });
});
it("restores omitted sidebar places and overrides model mode, endpoints, duration and priority", async () => {
  const input = constraints();
  const draft = scheduleIntent();
  draft.schedule_items = [];
  const enforced = enforceScheduleConstraints(draft, input);
  expect(enforced.schedules[0]).toMatchObject({
    transportation: "transit",
    origin_query: origin.name,
    preferences: { routing_priority: "fewer_transfers", budget: "budget" },
  });
  expect(enforced.schedule_items[0]).toMatchObject({
    selected_stop_id: requiredPlace.id,
    duration_minutes: 45,
    priority: "required",
  });
  const { document } = await materializeSchedule(draft, owner, input);
  expect(searchPlaces).not.toHaveBeenCalled();
  expect(document.schedule_items[0].place_id).toBe(requiredPlace.id);
  expect(document.schedule_runs[0].result.map_trip?.stops[0].location).toEqual(
    requiredPlace.location,
  );
  expect(
    vi
      .mocked(computeScheduleLeg)
      .mock.calls.every((call) => call[2].transportation === "transit"),
  ).toBe(true);
});
it("deduplicates echoed required stops and does not let Gemini weaken them", () => {
  const draft = scheduleIntent();
  Object.assign(draft.schedule_items[0], {
    selected_stop_id: requiredPlace.id,
    priority: "optional",
    duration_minutes: 5,
  });
  const result = enforceScheduleConstraints(draft, constraints());
  expect(result.schedule_items).toHaveLength(1);
  expect(result.schedule_items[0]).toMatchObject({
    priority: "required",
    duration_minutes: 45,
  });
});
it("keeps impossible required choices in the saved document and marks the run infeasible", async () => {
  const input = constraints();
  input.endTime = "2030-10-04T13:15:00-07:00";
  const draft = scheduleIntent();
  draft.schedule_items = [];
  const { document } = await materializeSchedule(draft, owner, input);
  expect(document.schedule_items[0]).toMatchObject({
    place_id: requiredPlace.id,
    priority: "required",
  });
  expect(document.schedule_runs[0].status).toBe("infeasible");
  expect(document.schedule_runs[0].result.unscheduled_items).toHaveLength(1);
});
it("measures the actual bent route instead of its origin-destination straight line", () => {
  const path = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.1 },
    { lat: 0.1, lng: 0.1 },
  ];
  expect(distanceToPath({ lat: 0.001, lng: 0.05 }, path)).toBeLessThan(200);
  expect(distanceToPath({ lat: 0.05, lng: 0.05 }, path)).toBeGreaterThan(5000);
});
it.each(["transit", "walking", "driving"] as const)(
  "ranks corridor candidates by actual %s travel and excludes out-of-radius places",
  async (transportation) => {
    const fast = place("Fast", 49.289, -123.1365),
      slow = place("Slow", 49.29, -123.135),
      outside = place("Outside", 50, -124);
    vi.mocked(searchPlaces).mockResolvedValue({
      source: "live",
      places: [slow, outside, fast],
    });
    vi.mocked(computeScheduleLeg).mockImplementation(async (from, to, req) => ({
      from: from.name,
      to: to.name,
      path: [from.location, to.location],
      durationMinutes: from.id === "Slow" || to.id === "Slow" ? 40 : 10,
      distanceMeters: 1000,
      mode: req.transportation,
    }));
    const request = tripRequestSchema.parse({
      origin,
      destination,
      transportation,
      activities: [],
      startTime: constraints().startTime,
      endTime: constraints().endTime,
    });
    const item = {
      ...scheduleIntent().schedule_items[0],
      id: "coffee",
      schedule_id: "s",
      place_id: null,
    };
    const result = await discoverRoutePlace({
      query: "coffee shop",
      item,
      origin,
      destination,
      anchors: [],
      request,
      radiusMeters: 500,
    });
    expect(result?.place.id).toBe("Fast");
    expect(
      vi
        .mocked(computeScheduleLeg)
        .mock.calls.every((call) => call[2].transportation === transportation),
    ).toBe(true);
    expect(
      vi
        .mocked(computeScheduleLeg)
        .mock.calls.some((call) => call[1].id === "Outside"),
    ).toBe(false);
  },
);
it("allows specifically named places outside the route radius", async () => {
  const named = place("Named faraway cafe", 49.5, -123.5);
  vi.mocked(searchPlaces).mockResolvedValue({
    source: "live",
    places: [named],
  });
  const draft = scheduleIntent();
  draft.schedule_items[0].place_query = named.name;
  const { document } = await materializeSchedule(draft, owner, constraints());
  expect(document.schedule_items.map((item) => item.place_id)).toContain(
    named.id,
  );
  expect(searchPlaces).toHaveBeenCalledTimes(1);
  expect(vi.mocked(searchPlaces).mock.calls[0][0].near).toBeUndefined();
});
it("does not add coffee that would displace a required visit", async () => {
  const input = constraints();
  input.endTime = "2030-10-04T14:10:00-07:00"; // Required: 65 minutes; coffee won't fit.
  const draft = scheduleIntent();
  draft.schedule_items[0].location_scope = "along_route";
  vi.mocked(searchPlaces).mockResolvedValue({
    source: "live",
    places: [place("Coffee", 49.285, -123.145)],
  });
  const { document } = await materializeSchedule(draft, owner, input);
  expect(document.schedule_runs[0].status).toBe("feasible");
  expect(
    document.schedule_runs[0].result.map_trip?.stops.map((s) => s.id),
  ).toEqual([requiredPlace.id]);
  expect(
    document.schedule_runs[0].result.unscheduled_items[0].reason_code,
  ).toBe("NO_ROUTE_MATCH");
});
it("preserves selected places when corridor discovery has no route", async () => {
  vi.mocked(computeScheduleLeg).mockRejectedValueOnce(
    new AppError("NO_ROUTE", "No route", 422),
  );
  const draft = scheduleIntent();
  draft.schedule_items[0].location_scope = "along_route";
  const { document } = await materializeSchedule(draft, owner, constraints());
  expect(
    document.schedule_items.some(
      (item) =>
        item.place_id === requiredPlace.id && item.priority === "required",
    ),
  ).toBe(true);
  expect(
    document.schedule_runs[0].result.unscheduled_items.some(
      (item) => item.reason_code === "NO_ROUTE_MATCH",
    ),
  ).toBe(true);
});

it("inserts an along-route extra while retaining a locked selected stop at its position", async () => {
  const input = constraints();
  input.selectedStops[0].locked = true;
  const coffee = place("Coffee after museum", 49.295, -123.13);
  vi.mocked(searchPlaces).mockResolvedValue({
    source: "live",
    places: [coffee],
  });
  const draft = scheduleIntent();
  draft.schedule_items[0].location_scope = "along_route";
  const { document } = await materializeSchedule(draft, owner, input);
  const run = document.schedule_runs[0];
  expect(run.status).toBe("feasible");
  expect(run.result.map_trip?.stops.map((stop) => stop.id)).toEqual([
    requiredPlace.id,
    coffee.id,
  ]);
  expect(run.result.map_trip?.stops[0]).toMatchObject({
    locked: true,
    priority: "required",
    durationMinutes: 45,
  });
  expect(run.result.unscheduled_items).toHaveLength(0);
});

it.each(["driving", "transit"] as const)(
  "optimizes %s using timed route legs and retains required stops",
  async (transportation) => {
    const input = constraints();
    const second = place("Second stop", 49.3, -123.13);
    input.selectedStops.push({ ...second, durationMinutes: 30, locked: false });
    input.transportation = transportation;
    input.orderPolicy = "optimize";
    vi.mocked(computeScheduleLeg).mockImplementation(
      async (from, to, request, departure) => {
        expect(request.transportation).toBe(transportation);
        expect(request.routingPriority).toBe("fastest");
        expect(Date.parse(departure)).toBeGreaterThanOrEqual(
          Date.parse(input.startTime!),
        );
        return {
          from: from.name,
          to: to.name,
          mode: transportation,
          path: [from.location, to.location],
          distanceMeters: 100,
          durationMinutes:
            from.id === origin.id && to.id === requiredPlace.id ? 80 : 5,
        };
      },
    );
    const result = await materializeSchedule(
      { ...scheduleIntent(), schedule_items: [] },
      owner,
      input,
    );
    expect(result.workspace?.trip.stops.map((s) => s.id)).toEqual([
      second.id,
      requiredPlace.id,
    ]);
    expect(result.workspace?.trip.request.orderPolicy).toBe("optimize");
  },
);

it("enforces chosen order despite a faster reverse journey", async () => {
  const input = constraints();
  const second = place("Second stop", 49.3, -123.13);
  input.selectedStops.push({ ...second, durationMinutes: 30, locked: false });
  input.orderPolicy = "preserve";
  const result = await materializeSchedule(
    { ...scheduleIntent(), schedule_items: [] },
    owner,
    input,
  );
  expect(result.workspace?.trip.stops.map((s) => s.id)).toEqual([
    requiredPlace.id,
    second.id,
  ]);
});

it("AI planning waits for opening and records hours conflicts for mandatory stops", async () => {
  const input = constraints();
  input.selectedStops[0].openingHours = {
    timeZone: "America/Vancouver",
    checkedAt: "2030-09-01T00:00:00Z",
    regular: {
      periods: [
        {
          open: { day: 5, hour: 15, minute: 0 },
          close: { day: 5, hour: 16, minute: 0 },
        },
      ],
    },
  };
  const draft = { ...scheduleIntent(), schedule_items: [] };
  const result = await materializeSchedule(draft, owner, input);
  expect(result.workspace?.trip.stops[0].arrivalTime).toBe(
    "2030-10-04T22:00:00.000Z",
  );
  expect(result.workspace?.trip.stops[0].waitMinutes).toBe(110);
  input.selectedStops[0].durationMinutes = 90;
  const impossible = await materializeSchedule(draft, owner, input);
  expect(impossible.document.schedule_runs[0].status).toBe("infeasible");
  expect(
    impossible.document.schedule_runs[0].result.unscheduled_items[0]
      .reason_code,
  ).toBe("OPENING_HOURS");
});

it("removes explicitly requested optional stops but preserves required and locked choices", async () => {
  const input = constraints();
  input.selectedStops.push({
    ...place("Optional cafe", 49.29, -123.13),
    durationMinutes: 30,
    locked: false,
    priority: "optional",
  });
  input.selectedStops.push({
    ...place("Locked cafe", 49.3, -123.13),
    durationMinutes: 30,
    locked: true,
    priority: "optional",
  });
  const draft = {
    ...scheduleIntent(),
    schedule_items: [],
    removed_stop_ids: input.selectedStops.map((stop) => stop.id),
  };
  const enforced = enforceScheduleConstraints(draft, input);
  expect(enforced.schedule_items.map((item) => item.selected_stop_id)).toEqual([
    requiredPlace.id,
    "Locked cafe",
  ]);
  expect(
    enforced.schedule_items.every((item) => item.priority === "required"),
  ).toBe(true);
  const result = await materializeSchedule(draft, owner, input);
  expect(result.workspace?.trip.stops.map((stop) => stop.id)).toEqual([
    requiredPlace.id,
    "Locked cafe",
  ]);
});
it("does not accidentally delete optional stops omitted by the model", () => {
  const input = constraints();
  input.selectedStops[0].priority = "optional";
  const enforced = enforceScheduleConstraints(
    { ...scheduleIntent(), schedule_items: [] },
    input,
  );
  expect(enforced.schedule_items[0]).toMatchObject({
    selected_stop_id: requiredPlace.id,
    priority: "optional",
  });
});
it("rejects invented removal IDs and permits a conversational required upgrade", () => {
  const input = constraints();
  expect(() =>
    enforceScheduleConstraints(
      { ...scheduleIntent(), removed_stop_ids: ["invented"] },
      input,
    ),
  ).toThrow("unknown stop");
  input.selectedStops[0].priority = "optional";
  const draft = scheduleIntent();
  draft.schedule_items[0].selected_stop_id = requiredPlace.id;
  draft.schedule_items[0].priority = "required";
  expect(
    enforceScheduleConstraints(draft, input).schedule_items[0].priority,
  ).toBe("required");
});

it("does not rediscover a rejected optional venue as a named replacement", async () => {
  const input = constraints();
  input.selectedStops[0].priority = "optional";
  const replacement = place("Other cafe", 49.29, -123.13);
  vi.mocked(searchPlaces).mockResolvedValue({
    source: "live",
    places: [requiredPlace, replacement],
  });
  const draft = scheduleIntent();
  draft.removed_stop_ids = [requiredPlace.id];
  draft.schedule_items[0].place_query = "A different cafe";
  const result = await materializeSchedule(draft, owner, input);
  expect(result.workspace?.trip.stops.map((stop) => stop.id)).toEqual([
    replacement.id,
  ]);
});
it("does not rediscover a rejected venue in generic route-corridor searches", async () => {
  const input = constraints();
  input.selectedStops[0].priority = "optional";
  vi.mocked(searchPlaces).mockResolvedValue({
    source: "live",
    places: [requiredPlace],
  });
  const draft = scheduleIntent();
  draft.removed_stop_ids = [requiredPlace.id];
  draft.schedule_items[0].location_scope = "along_route";
  draft.schedule_items[0].place_query = "coffee";
  const result = await materializeSchedule(draft, owner, input);
  expect(
    result.document.schedule_runs[0].result.map_trip?.stops ?? [],
  ).toHaveLength(0);
});

it.each(["transit", "driving"] as const)(
  "inserts first breakfast before later locked visits for %s",
  async (transportation) => {
    const breakfast = place("Breakfast", 49.285, -123.145);
    const theater = place("Theater", 49.29, -123.14);
    const grocery = place("No Frills", 49.295, -123.13);
    vi.mocked(searchPlaces).mockImplementation(async ({ query }) => ({
      source: "live",
      places:
        query === "Theater"
          ? [theater]
          : query === "No Frills"
            ? [grocery]
            : [breakfast],
    }));
    const input = constraints();
    input.selectedStops = [];
    input.transportation = transportation;
    input.endTime = "2030-10-04T22:00:00-07:00";
    const draft = scheduleIntent();
    const template = draft.schedule_items[0];
    draft.schedule_items = ["Breakfast", "Theater", "No Frills"].map(
      (name, index) => ({
        ...template,
        title: name,
        place_query: name,
        location_scope: index === 0 ? "along_route" : "specific",
        preferred_sequence: index,
        order_locked: true,
        priority: "required",
        duration_minutes: 90,
      }),
    );
    const { document, workspace } = await materializeSchedule(
      draft,
      owner,
      input,
    );
    expect(document.schedule_runs[0].status).toBe("feasible");
    expect(document.schedule_runs[0].result.unscheduled_items).toEqual([]);
    expect(workspace?.trip.stops.map((stop) => stop.name)).toEqual([
      "Breakfast",
      "Theater",
      "No Frills",
    ]);
    expect(document.schedule_runs[0].result.map_trip).toEqual(workspace?.trip);
  },
);

it("does not accumulate echoed preferences over repeated planning updates", () => {
  const input = constraints();
  input.preferences = Array(5).fill("I don't like purebread bakery").join("\n");
  let draft = scheduleIntent();
  draft.schedules[0].preferences.notes =
    "I don't like purebread bakery\nVegetarian food";
  for (let iteration = 0; iteration < 5; iteration++) {
    draft = enforceScheduleConstraints(draft, input);
    input.preferences = draft.schedules[0].preferences.notes;
  }
  expect(draft.schedules[0].preferences.notes).toBe(
    "I don't like purebread bakery\nVegetarian food",
  );
});

it.each(["transit", "driving"] as const)(
  "uses downtown and near-UBC qualifiers outside the corridor for %s",
  async (transportation) => {
    const theater = place("Downtown theater", 49.28, -123.12);
    const grocery = place("Grocery near UBC", 49.3, -123.12);
    const fartherGrocery = place("Farther grocery", 49.34, -123.12);
    vi.mocked(searchPlaces).mockImplementation(async ({ query }) => ({
      source: "live",
      places: query.includes("downtown")
        ? [theater]
        : query.includes("UBC")
          ? query === "UBC"
            ? [destination]
            : [fartherGrocery, grocery]
          : [],
    }));
    const input = constraints();
    input.selectedStops = [];
    input.transportation = transportation;
    const draft = scheduleIntent();
    const template = draft.schedule_items[0];
    draft.schedule_items = [
      {
        ...template,
        title: "Movie Theater in Downtown",
        place_query: "movie theater in downtown",
        location_scope: "along_route",
        preferred_sequence: 0,
        order_locked: true,
      },
      {
        ...template,
        title: "No Frills near UBC",
        place_query: "No Frills",
        location_scope: "along_route",
        preferred_sequence: 1,
        order_locked: true,
      },
    ];
    const { workspace, document } = await materializeSchedule(
      draft,
      owner,
      input,
    );
    expect(workspace?.trip.stops.map((stop) => stop.id)).toEqual([
      theater.id,
      grocery.id,
    ]);
    expect(document.schedule_items[1].place_query).toBe("No Frills near UBC");
    expect(searchPlaces).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "No Frills near UBC",
        near: destination.location,
        radiusMeters: 10000,
      }),
    );
    expect(workspace?.trip.stops.every((stop) => !stop.locked)).toBe(true);
  },
);

it("leaves a geographic request unresolved when every candidate is outside its area", async () => {
  const input = constraints();
  input.selectedStops = [];
  const draft = scheduleIntent();
  draft.schedule_items[0] = {
    ...draft.schedule_items[0],
    title: "No Frills near Destination",
    place_query: "No Frills near Destination",
    location_scope: "specific",
    priority: "required",
  };
  vi.mocked(searchPlaces).mockResolvedValue({
    source: "live",
    places: [place("Distant store", 50.3, -123.12)],
  });
  const { document } = await materializeSchedule(draft, owner, input);
  expect(document.schedule_items[0].place_id).toBeNull();
  expect(document.schedule_runs[0].status).toBe("infeasible");
});

it("chooses three distinct open area cafes instead of reusing the nearest closed cafe", async () => {
  const closed = {
    ...place("Closed cafe", 49.29, -123.14),
    openingHours: {
      timeZone: "America/Vancouver",
      checkedAt: "2030-10-04T19:00:00Z",
      regular: { periods: [] },
    },
  };
  const cafes = [
    closed,
    ...[1, 2, 3].map((i) => ({
      ...place(`Open cafe ${i}`, 49.29 + i * 0.001, -123.14),
      openingHours: {
        timeZone: "America/Vancouver",
        checkedAt: "2030-10-04T19:00:00Z",
        regular: {
          periods: [
            {
              open: { day: 5, hour: 8, minute: 0 },
              close: { day: 5, hour: 20, minute: 0 },
            },
          ],
        },
      },
    })),
  ];
  vi.mocked(searchPlaces).mockImplementation(async ({ query }) => ({
    source: "live",
    places: query === "Burnaby" ? [requiredPlace] : cafes,
  }));
  const input = constraints();
  input.selectedStops = [];
  const draft = scheduleIntent();
  const template = draft.schedule_items[0];
  draft.schedule_items = [0, 1, 2].map((index) => ({
    ...template,
    title: `Coffee shop ${index + 1} in Burnaby`,
    place_query: "coffee shops in Burnaby",
    preferred_sequence: index,
    duration_minutes: 30,
    priority: "required",
  }));
  const { document, workspace } = await materializeSchedule(
    draft,
    owner,
    input,
  );
  expect(document.schedule_runs[0].status).toBe("feasible");
  expect(workspace?.trip.stops.map((stop) => stop.id)).toEqual([
    "Open cafe 1",
    "Open cafe 2",
    "Open cafe 3",
  ]);
  expect(document.schedule_items.map((item) => item.place_id)).toEqual([
    "Open cafe 1",
    "Open cafe 2",
    "Open cafe 3",
  ]);
});
