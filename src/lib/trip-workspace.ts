import { tripStateSchema, type Location, type TripState } from "@/types/trip";
import {
  modificationBatchSchema,
  workspaceSchema,
  type ModificationBatch,
  type WorkspaceTrip,
  type ScheduleItem,
} from "@/types/workspace";

export function createWorkspace(trip: TripState): WorkspaceTrip {
  return validateWorkspace({ trip, version: 0, activities: [] });
}

export function validateWorkspace(value: unknown): WorkspaceTrip {
  const state = workspaceSchema.parse(value);
  const ids = [
    ...state.trip.stops.map((s) => s.id),
    ...state.activities.map((a) => a.id),
  ];
  if (new Set(ids).size !== ids.length)
    throw new Error("Every stop and activity needs a unique ID.");
  for (const activity of state.activities) {
    if (!state.trip.stops.some((stop) => stop.id === activity.stopId))
      throw new Error("This activity needs a stop in your trip.");
  }
  for (const stop of state.trip.stops) {
    const minutes = state.activities
      .filter((a) => a.stopId === stop.id && a.type === "USER_TASK")
      .reduce((sum, a) => sum + a.durationMinutes, 0);
    if (minutes > stop.durationMinutes)
      throw new Error(
        `Activities need ${minutes} minutes at ${stop.name}. Increase the stop duration first.`,
      );
  }
  return state;
}

function distance(a: Location, b: Location) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h))));
}

// Demo-only scheduling. Live edits must return authoritative routes from the backend.
function rescheduleDemo(trip: TripState): TripState {
  if (trip.source !== "demo")
    throw new Error(
      "Live route editing needs the route service. Your current route has been kept.",
    );
  let previous = trip.request.origin;
  let time = Date.parse(trip.request.startTime);
  const legs: TripState["legs"] = [];
  const stops: TripState["stops"] = [];
  for (const stop of [...trip.stops, null]) {
    const next = stop ?? trip.request.destination;
    const meters = distance(previous.location, next.location);
    const minutes = Math.max(
      5,
      Math.ceil(
        meters /
          { transit: 300, walking: 70, driving: 500 }[
            trip.request.transportation
          ],
      ),
    );
    legs.push({
      from: previous.name,
      to: next.name,
      durationMinutes: minutes,
      distanceMeters: meters,
      path: [previous.location, next.location],
    });
    time += minutes * 60000;
    if (stop) {
      stops.push({ ...stop, arrivalTime: new Date(time).toISOString() });
      time += stop.durationMinutes * 60000;
    }
    previous = next;
  }
  if (time > Date.parse(trip.request.endTime))
    throw new Error(
      "This change would finish after your deadline. Shorten a stop or allow more time.",
    );
  return tripStateSchema.parse({
    ...trip,
    stops,
    legs,
    arrivalTime: new Date(time).toISOString(),
  });
}

/** Atomic, JSON-only commands. A future planner can emit the same batch. */
export function applyModifications(
  current: WorkspaceTrip,
  input: ModificationBatch,
  options: { deferRouting?: boolean } = {},
): WorkspaceTrip {
  const batch = modificationBatchSchema.parse(input);
  if (batch.tripId !== current.trip.id || batch.baseVersion !== current.version)
    throw new Error("This update is for an older trip. Please try again.");
  const next = structuredClone(current);
  let routeChanged = false;
  for (const change of batch.modifications) {
    const oldLocks = next.trip.stops
      .map((stop, index) => ({ ...stop, index }))
      .filter((s) => s.locked);
    if ("stopId" in change) {
      const stop = next.trip.stops.find((s) => s.id === change.stopId);
      if (!stop) throw new Error("That stop is no longer in your trip.");
      if (stop.locked && change.type !== "SET_LOCK")
        throw new Error(`Unlock ${stop.name} before changing it.`);
      switch (change.type) {
        case "SET_LOCK":
          stop.locked = change.locked;
          break;
        case "REMOVE_STOP":
          next.trip.stops = next.trip.stops.filter((s) => s.id !== stop.id);
          next.activities = next.activities.filter((a) => a.stopId !== stop.id);
          routeChanged = true;
          break;
        case "CHANGE_DURATION":
          stop.durationMinutes = change.minutes;
          routeChanged = true;
          break;
        case "MOVE_STOP": {
          if (change.newIndex >= next.trip.stops.length)
            throw new Error("Choose a position inside the itinerary.");
          next.trip.stops.splice(next.trip.stops.indexOf(stop), 1);
          next.trip.stops.splice(change.newIndex, 0, stop);
          routeChanged = true;
          break;
        }
      }
    } else if (change.type === "ADD_STOP") {
      if (next.trip.stops.length >= 6)
        throw new Error("This trip supports up to six stops.");
      if (change.index > next.trip.stops.length)
        throw new Error("Choose a position inside the itinerary.");
      next.trip.stops.splice(change.index, 0, change.stop);
      routeChanged = true;
    } else if (change.type === "ADD_ACTIVITY") {
      next.activities.push(change.activity);
    } else {
      const activity = next.activities.find((a) => a.id === change.activityId);
      if (!activity)
        throw new Error("That activity is no longer in your trip.");
      if (change.type === "REMOVE_ACTIVITY")
        next.activities = next.activities.filter((a) => a.id !== activity.id);
      else if (activity.type === "USER_TASK")
        activity.completed = change.completed;
      else throw new Error("AI task status must come from the task service.");
    }
    if (change.type !== "SET_LOCK") {
      for (const locked of oldLocks) {
        if (next.trip.stops[locked.index]?.id !== locked.id)
          throw new Error(
            `This would move locked stop ${locked.name}. Unlock it first.`,
          );
      }
    }
  }
  if (routeChanged && !options.deferRouting)
    next.trip = rescheduleDemo(next.trip);
  next.trip.request.selectedStops = next.trip.stops.map((stop) => ({
    ...stop,
    priority: stop.priority ?? "optional",
  }));
  next.version++;
  next.trip.lastUpdated = new Date().toISOString();
  return validateWorkspace(next);
}

export function receiveReplan(
  current: WorkspaceTrip,
  trip: TripState,
): WorkspaceTrip {
  if (trip.id !== current.trip.id)
    throw new Error("The update does not match your trip.");
  const activities = current.activities.filter((a) =>
    trip.stops.some((s) => s.id === a.stopId),
  );
  const removed = current.activities.length - activities.length;
  return validateWorkspace({
    trip: {
      ...trip,
      summary:
        trip.summary +
        (removed
          ? ` ${removed} attached activity/activities removed with their stop.`
          : ""),
    },
    activities,
    version: current.version + 1,
  });
}

// A typed projection, not a second independently mutable itinerary.
export function toSchedule(state: WorkspaceTrip): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  let departure = state.trip.request.startTime;
  state.trip.legs.forEach((leg, index) => {
    items.push({
      type: "TRANSIT",
      id: `leg-${index}`,
      startTime: departure,
      leg,
    });
    const stop = state.trip.stops[index];
    if (!stop) return;
    items.push({
      type: "PLACE",
      id: stop.id,
      startTime: stop.arrivalTime,
      stop,
    });
    let activityTime = Date.parse(stop.arrivalTime);
    state.activities
      .filter((a) => a.stopId === stop.id)
      .forEach((activity) => {
        items.push({
          ...activity,
          startTime: new Date(
            activity.type === "AI_TASK"
              ? Date.parse(stop.arrivalTime)
              : activityTime,
          ).toISOString(),
        });
        if (activity.type === "USER_TASK")
          activityTime += activity.durationMinutes * 60000;
      });
    departure = new Date(
      Date.parse(stop.arrivalTime) + stop.durationMinutes * 60000,
    ).toISOString();
  });
  return items;
}
