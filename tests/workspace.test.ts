import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoPlaces, exampleRequest } from "@/lib/fixtures";
import { planTrip, replanTrip } from "@/lib/planner";
import {
  applyModifications,
  createWorkspace,
  receiveReplan,
  toSchedule,
} from "@/lib/trip-workspace";
import type { TripModification, WorkspaceTrip } from "@/types/workspace";

beforeEach(() => vi.stubEnv("DATA_MODE", "demo"));
const initial = async () => createWorkspace(await planTrip(exampleRequest()));
const apply = (state: WorkspaceTrip, ...modifications: TripModification[]) =>
  applyModifications(state, {
    tripId: state.trip.id,
    baseVersion: state.version,
    modifications,
  });

describe("frontend JSON modification contract", () => {
  it("reschedules every leg after an added stop, and preserves the input", async () => {
    const state = await initial();
    const original = structuredClone(state);
    const result = apply(state, {
      type: "ADD_STOP",
      index: 1,
      stop: {
        ...demoPlaces[4],
        arrivalTime: state.trip.request.startTime,
        durationMinutes: 20,
        locked: false,
        reason: "Chosen by the user",
      },
    });
    expect(result.trip.stops[1].id).toBe("demo-shopping");
    expect(result.trip.legs).toHaveLength(6);
    expect(result.trip.legs[1].to).toBe(demoPlaces[4].name);
    expect(Date.parse(result.trip.stops[2].arrivalTime)).toBeGreaterThan(
      Date.parse(result.trip.stops[1].arrivalTime) + 20 * 60000,
    );
    expect(state).toEqual(original);
    expect(result.version).toBe(1);
  });
  it("rejects a whole batch on lock violations, including indirectly shifted locks", async () => {
    const state = await initial();
    state.trip.stops[1].locked = true;
    const original = structuredClone(state);
    expect(() =>
      apply(
        state,
        {
          type: "CHANGE_DURATION",
          stopId: state.trip.stops[0].id,
          minutes: 40,
        },
        { type: "REMOVE_STOP", stopId: state.trip.stops[0].id },
      ),
    ).toThrow("locked stop");
    expect(() =>
      apply(state, {
        type: "MOVE_STOP",
        stopId: state.trip.stops[0].id,
        newIndex: 2,
      }),
    ).toThrow("locked stop");
    expect(state).toEqual(original);
  });
  it("rejects stale batches, duplicate IDs, and impossible deadlines", async () => {
    const state = await initial();
    expect(() =>
      applyModifications(state, {
        tripId: state.trip.id,
        baseVersion: 4,
        modifications: [
          { type: "REMOVE_STOP", stopId: state.trip.stops[0].id },
        ],
      }),
    ).toThrow("older trip");
    expect(() =>
      apply(state, { type: "ADD_STOP", index: 4, stop: state.trip.stops[0] }),
    ).toThrow("unique ID");
    state.trip.request.endTime = state.trip.arrivalTime;
    expect(() =>
      apply(state, {
        type: "CHANGE_DURATION",
        stopId: state.trip.stops[0].id,
        minutes: 180,
      }),
    ).toThrow("deadline");
  });
  it("keeps activities with their place and prevents overbooking", async () => {
    const state = await initial();
    const stopId = state.trip.stops[0].id;
    const activity = {
      id: "homework",
      type: "USER_TASK" as const,
      stopId,
      title: "Read CPSC notes",
      durationMinutes: 25,
      completed: false,
    };
    const withTask = apply(state, { type: "ADD_ACTIVITY", activity });
    expect(() =>
      apply(withTask, { type: "CHANGE_DURATION", stopId, minutes: 20 }),
    ).toThrow("Activities need 25 minutes");
    expect(() =>
      apply(withTask, {
        type: "ADD_ACTIVITY",
        activity: { ...activity, id: "more", durationMinutes: 10 },
      }),
    ).toThrow("Activities need 35 minutes");
    const moved = apply(withTask, { type: "MOVE_STOP", stopId, newIndex: 2 });
    const task = toSchedule(moved).find((item) => item.id === "homework")!;
    expect(task.startTime).toBe(moved.trip.stops[2].arrivalTime);
    expect(apply(moved, { type: "REMOVE_STOP", stopId }).activities).toEqual(
      [],
    );
  });
  it("keeps activities through server replanning and removes only orphaned tasks", async () => {
    let state = await initial();
    const stopId = state.trip.stops[0].id;
    state = apply(state, {
      type: "ADD_ACTIVITY",
      activity: {
        id: "task",
        type: "USER_TASK",
        stopId,
        title: "Study",
        durationMinutes: 20,
        completed: false,
      },
    });
    const trip = await replanTrip(state.trip, { type: "RAIN_EARLY" });
    expect(receiveReplan(state, trip).activities).toHaveLength(1);
    expect(
      receiveReplan(state, {
        ...trip,
        stops: trip.stops.filter((s) => s.id !== stopId),
      }).activities,
    ).toHaveLength(0);
  });
  it("does not substitute mock directions for live route edits", async () => {
    const state = await initial();
    state.trip.source = "live";
    expect(() =>
      apply(state, { type: "REMOVE_STOP", stopId: state.trip.stops[0].id }),
    ).toThrow("Live route editing");
    expect(
      apply(state, {
        type: "SET_LOCK",
        stopId: state.trip.stops[0].id,
        locked: true,
      }).trip.source,
    ).toBe("live");
  });
});
