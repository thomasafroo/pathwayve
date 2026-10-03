import "server-only";
import {
  tripRequestSchema,
  tripStateSchema,
  type TripEvent,
  type TripRequest,
  type TripState,
} from "@/types/trip";
import { findPlaces } from "./places";

import { scheduleTrip } from "./routes";
import { mapsMode } from "./server/env";
import { AppError } from "./server/http";

export async function planTrip(request: TripRequest): Promise<TripState> {
  if (
    mapsMode() === "live" &&
    Date.parse(request.startTime) < Date.now() - 60000
  )
    throw new AppError(
      "PAST_DEPARTURE",
      "Choose a future departure for live planning.",
    );
  // Explicit selections are authoritative. No Gemini request is made here.
  const selected =
    request.selectedStops !== undefined
      ? request.selectedStops.map((stop) => ({
          ...stop,
          arrivalTime: request.startTime,
          reason: "Chosen by you.",
        }))
      : mapsMode() === "demo"
        ? (await findPlaces(request)).map((place) => ({
            ...place,
            durationMinutes: 30,
            locked: false,
            priority: "optional" as const,
            arrivalTime: request.startTime,
            reason: `A sample ${place.category} stop for testing your itinerary.`,
          }))
        : [];
  if (new Set(selected.map((stop) => stop.id)).size !== selected.length)
    throw new AppError("DUPLICATE_STOP", "Choose each stop once.");
  const scheduled = await scheduleTrip(request, selected);
  if (Date.parse(scheduled.arrivalTime) > Date.parse(request.endTime))
    throw new AppError(
      "TIME_WINDOW",
      "These stops do not fit your time window. Allow more time or select fewer activities.",
      422,
    );
  return tripStateSchema.parse({
    id: crypto.randomUUID(),
    request: { ...request, selectedStops: scheduled.stops },
    ...scheduled,
    status: "ready",
    source: mapsMode(),
    summary:
      mapsMode() === "demo"
        ? "Your sample day, with a little room to explore."
        : "Your interests, connected into a day out.",
    warnings:
      mapsMode() === "demo"
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
  if (mapsMode() !== "demo" || trip.source !== "demo")
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
    const index = stops.findLastIndex(
      (stop) => !stop.locked && stop.priority !== "required",
    );
    if (index < 0)
      throw new AppError(
        "LOCKED_CONFLICT",
        "The time window cannot accommodate travel and required or locked stops. Remove a chosen stop or allow more time.",
        422,
      );
    removed.push(stops[index].name);
    stops.splice(index, 1);
    scheduled = await scheduleTrip(request, stops);
  }
  if (removed.length) summary += ` Removed to fit: ${removed.join(", ")}.`;
  return tripStateSchema.parse({
    ...trip,
    request: { ...request, selectedStops: scheduled.stops },
    ...scheduled,
    summary,
    lastUpdated: new Date().toISOString(),
  });
}
