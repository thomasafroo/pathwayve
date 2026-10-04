import "server-only";
import type { CandidatePlace, RouteLeg, TripRequest } from "@/types/trip";
import { computeLeg } from "./routes";

// Schedule activities can occur at the current location (including endpoints).
// Google returns no route for identical waypoints; no travel is needed there.
export async function computeScheduleLeg(
  from: CandidatePlace,
  to: CandidatePlace,
  request: TripRequest,
  departure: string,
): Promise<RouteLeg> {
  if (
    from.id === to.id ||
    (from.location.lat === to.location.lat &&
      from.location.lng === to.location.lng)
  ) {
    return {
      from: from.name,
      to: to.name,
      mode: request.transportation,
      durationMinutes: 0,
      distanceMeters: 0,
      path: [from.location, to.location],
    };
  }
  return computeLeg(from, to, request, departure);
}
