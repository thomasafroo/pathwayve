import { beforeEach, describe, expect, it, vi } from "vitest";
import { exampleRequest } from "@/lib/fixtures";
import { planTrip, replanTrip } from "@/lib/planner";
import { tripRequestSchema } from "@/types/trip";
import { POST } from "@/app/api/plan/route";

beforeEach(() => {
  vi.stubEnv("DATA_MODE", "demo");
});
describe("planning contract", () => {
  it("builds a complete schedule with a final destination leg", async () => {
    const trip = await planTrip(exampleRequest());
    expect(trip.source).toBe("demo");
    expect(trip.stops).toHaveLength(4);
    expect(trip.legs).toHaveLength(5);
    expect(Date.parse(trip.arrivalTime)).toBeLessThanOrEqual(
      Date.parse(trip.request.endTime),
    );
    for (let index = 1; index < trip.stops.length; index++) {
      const previous = trip.stops[index - 1];
      expect(Date.parse(trip.stops[index].arrivalTime)).toBeGreaterThanOrEqual(
        Date.parse(previous.arrivalTime) + previous.durationMinutes * 60_000,
      );
    }
  });
  it("rejects impossible time windows rather than returning an infeasible trip", async () => {
    const request = exampleRequest();
    request.endTime = new Date(
      Date.parse(request.startTime) + 60_000,
    ).toISOString();
    await expect(planTrip(request)).rejects.toMatchObject({
      code: "TIME_WINDOW",
    });
  });
  it("rejects invalid coordinates, duplicate interests, and reversed times", () => {
    const request = exampleRequest();
    expect(
      tripRequestSchema.safeParse({ ...request, endTime: request.startTime })
        .success,
    ).toBe(false);
    expect(
      tripRequestSchema.safeParse({
        ...request,
        activities: ["coffee", "coffee"],
      }).success,
    ).toBe(false);
    expect(
      tripRequestSchema.safeParse({
        ...request,
        origin: { name: "Bad point", location: { lat: 100, lng: 0 } },
      }).success,
    ).toBe(false);
  });
});
describe("replanning invariants", () => {
  it("moves the park earlier without moving or mutating locked stops", async () => {
    const trip = await planTrip(exampleRequest());
    trip.stops[0].locked = true;
    const original = structuredClone(trip);
    const replanned = await replanTrip(trip, { type: "RAIN_EARLY" });
    expect(replanned.stops[0].id).toBe(trip.stops[0].id);
    expect(replanned.stops[1].category).toBe("park");
    expect(trip).toEqual(original);
  });
  it("removes optional stops to meet an earlier deadline", async () => {
    const trip = await planTrip(exampleRequest());
    const endTime = new Date(
      Date.parse(trip.arrivalTime) - 25 * 60_000,
    ).toISOString();
    const replanned = await replanTrip(trip, { type: "EARLIER_END", endTime });
    expect(replanned.stops.length).toBeLessThan(trip.stops.length);
    expect(Date.parse(replanned.arrivalTime)).toBeLessThanOrEqual(
      Date.parse(endTime),
    );
  });
  it("reports a conflict when locked stops cannot fit", async () => {
    const trip = await planTrip(exampleRequest());
    trip.stops.forEach((stop) => {
      stop.locked = true;
    });
    await expect(
      replanTrip(trip, {
        type: "EARLIER_END",
        endTime: new Date(Date.parse(trip.arrivalTime) - 60_000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "LOCKED_CONFLICT" });
  });
  it("does not accept live trips into the simulated replan flow", async () => {
    const trip = await planTrip(exampleRequest());
    await expect(
      replanTrip({ ...trip, source: "live" }, { type: "RAIN_EARLY" }),
    ).rejects.toMatchObject({ status: 501 });
  });
});
describe("API errors", () => {
  it("returns a structured 400 for invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/plan", { method: "POST", body: "{" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_JSON" },
    });
  });
  it("returns validation errors for an empty request", async () => {
    const response = await POST(
      new Request("http://localhost/api/plan", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION" },
    });
  });
});
