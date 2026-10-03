import "server-only";
import {
  tripRequestSchema,
  tripStateSchema,
  type TripEvent,
  type TripRequest,
  type TripState,
} from "@/types/trip";
import { findPlaces } from "./places";
import { selectStops } from "./gemini";
import { scheduleTrip } from "./routes";
import { dataMode } from "./server/env";
import { AppError } from "./server/http";

export async function planTrip(request: TripRequest): Promise<TripState> {
  if (dataMode() === "live" && Date.parse(request.startTime) < Date.now())
    throw new AppError(
      "PAST_DEPARTURE",
      "Choose a future departure for live planning.",
    );
  const candidates = await findPlaces(request);
  const selected = await selectStops(request, candidates);
  const scheduled = await scheduleTrip(request, selected);
  if (Date.parse(scheduled.arrivalTime) > Date.parse(request.endTime))
    throw new AppError(
      "TIME_WINDOW",
      "These stops do not fit your time window. Allow more time or select fewer activities.",
      422,
    );
  return tripStateSchema.parse({
    id: crypto.randomUUID(),
    request,
    ...scheduled,
    status: "ready",
    source: dataMode(),
    summary:
      dataMode() === "demo"
        ? "Your sample day, with a little room to explore."
        : "Your interests, connected into a day out.",
    warnings:
      dataMode() === "demo"
        ? [
            "Fictional sample venues and estimated travel times. This is not a navigable route.",
          ]
        : [
            "Check venue opening hours and prices before leaving. Weather is not yet included.",
          ],
    lastUpdated: new Date().toISOString(),
  });
}
export async function replanTrip(
  trip: TripState,
  event: TripEvent,
): Promise<TripState> {
  if (dataMode() !== "demo" || trip.source !== "demo")
    throw new AppError(
      "NOT_IMPLEMENTED",
      "Live replanning is the next team milestone. These event controls currently support demo trips only.",
      501,
    );
  let stops = trip.stops.map((stop) => ({ ...stop }));
  let request = { ...trip.request };
  let summary: string;
  if (event.type === "RAIN_EARLY") {
    // Locked stops keep their exact sequence position; only free slots are reordered.
    const unlocked = stops
      .filter((stop) => !stop.locked)
      .sort(
        (a, b) => Number(b.category === "park") - Number(a.category === "park"),
      );
    stops = stops.map((stop) => (stop.locked ? stop : unlocked.shift()!));
    summary =
      "Demo rain event applied: outdoor stops move earlier where locks allow.";
  } else if (event.type === "DELAY") {
    request.startTime = new Date(
      Date.parse(request.startTime) + event.minutes * 60_000,
    ).toISOString();
    summary = `Demo departure delayed by ${event.minutes} minutes.`;
  } else {
    if (Date.parse(event.endTime) >= Date.parse(request.endTime))
      throw new AppError("INVALID_END", "Choose an earlier end time.");
    request.endTime = event.endTime;
    summary = "Demo schedule adjusted to finish earlier.";
  }
  request = tripRequestSchema.parse(request);
  let scheduled = await scheduleTrip(request, stops);
  const removed: string[] = [];
  while (Date.parse(scheduled.arrivalTime) > Date.parse(request.endTime)) {
    const index = stops.findLastIndex((stop) => !stop.locked);
    if (index < 0)
      throw new AppError(
        "LOCKED_CONFLICT",
        "The time window cannot accommodate travel and locked stops. Unlock a stop or allow more time.",
        422,
      );
    removed.push(stops[index].name);
    stops.splice(index, 1);
    scheduled = await scheduleTrip(request, stops);
  }
  if (removed.length) summary += ` Removed to fit: ${removed.join(", ")}.`;
  return tripStateSchema.parse({
    ...trip,
    request,
    ...scheduled,
    summary,
    lastUpdated: new Date().toISOString(),
  });
}
