import "server-only";
import { visitWindow } from "./opening-hours";
import type { CandidatePlace, Location, TripRequest } from "@/types/trip";
import type { SavedItem } from "@/types/schedule";
import { computeScheduleLeg } from "./schedule-routing";
import { searchPlaces } from "./place-search";
import { AppError } from "./server/http";
import { tryGroundPlaces, type Requirement } from "./maps-grounding";

// Each point of Google Maps fit is worth five minutes of extra travel.
const minutesPerFitPoint = 5;
export function requestedRequirements(item: SavedItem): Requirement[] {
  return (["seating", "quiet", "wifi"] as const).filter(
    (requirement) => item.requirements[requirement],
  );
}
export function meetsRequirements(item: SavedItem, place: CandidatePlace) {
  return requestedRequirements(item).every((requirement) =>
    place.insight?.verified.includes(requirement),
  );
}

export type RouteAnchor = { place: CandidatePlace; item: SavedItem };
// Distance to the provider's route segments, never to the origin-destination chord.
export function distanceToPath(point: Location, path: Location[]) {
  const wrap = (degrees: number) => ((degrees + 540) % 360) - 180;
  const xy = (p: Location) => ({
    x: wrap(p.lng - point.lng) * 111320 * Math.cos((point.lat * Math.PI) / 180),
    y: (p.lat - point.lat) * 111320,
  });
  let minimum = Infinity;
  for (let i = 0; i < path.length; i++) {
    const a = xy(path[i]),
      b = xy(path[Math.min(i + 1, path.length - 1)]);
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, -(a.x * dx + a.y * dy) / (dx * dx + dy * dy || 1)),
    );
    minimum = Math.min(minimum, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return minimum;
}

export async function traceRoute(
  origin: CandidatePlace,
  destination: CandidatePlace,
  anchors: RouteAnchor[],
  request: TripRequest,
) {
  let cursor = origin,
    time = Date.parse(request.startTime);
  const paths: Location[][] = [];
  let travelMinutes = 0;
  for (const anchor of [...anchors, null]) {
    const next = anchor?.place ?? destination;
    const leg = await computeScheduleLeg(
      cursor,
      next,
      request,
      new Date(time).toISOString(),
    );
    paths.push(leg.path);
    travelMinutes += leg.durationMinutes;
    time += leg.durationMinutes * 60000;
    if (anchor) {
      const item = anchor.item;
      if (item.fixed_start_at) {
        if (time > Date.parse(item.fixed_start_at)) return null;
        time = Date.parse(item.fixed_start_at);
      }
      if (item.earliest_start_at)
        time = Math.max(time, Date.parse(item.earliest_start_at));
      const window = visitWindow(
        anchor.place,
        time,
        item.duration_minutes,
        Math.min(
          Date.parse(request.endTime),
          item.latest_end_at ? Date.parse(item.latest_end_at) : Infinity,
        ),
        !!item.fixed_start_at,
      );
      if (!window) return null;
      time = window.start + item.duration_minutes * 60000;
      if (item.latest_end_at && time > Date.parse(item.latest_end_at))
        return null;
    }
    if (time > Date.parse(request.endTime)) return null;
    cursor = next;
  }
  return { paths, arrival: time, travelMinutes };
}

export async function discoverRoutePlace({
  query,
  item,
  origin,
  destination,
  anchors,
  request,
  radiusMeters,
  excludedPlaceIds = [],
}: {
  query: string;
  item: SavedItem;
  origin: CandidatePlace;
  destination: CandidatePlace;
  anchors: RouteAnchor[];
  request: TripRequest;
  radiusMeters: number;
  excludedPlaceIds?: string[];
}): Promise<{ place: CandidatePlace; index: number } | null> {
  if (anchors.length >= 6) return null;
  const base = await traceRoute(origin, destination, anchors, request);
  if (!base) return null; // Extra stops never take time reserved for existing choices.
  const points = base.paths.flat();
  if (points.length < 2)
    throw new AppError(
      "NO_ROUTE_GEOMETRY",
      "The route has no usable geometry for nearby discovery.",
      422,
    );
  // Bounded sampling along actual geometry, with final corridor filtering below.
  const sampleCount = Math.min(5, points.length);
  const centers = Array.from(
    { length: sampleCount },
    (_, i) =>
      points[
        Math.round((i * (points.length - 1)) / Math.max(1, sampleCount - 1))
      ],
  );
  const responses = await Promise.all(
    centers.map((near) =>
      searchPlaces({
        query,
        near,
        radiusMeters,
        budget: request.budget ?? "any",
        category: "attraction",
      }),
    ),
  );
  const unique = new Map<string, CandidatePlace>();
  for (const response of responses)
    for (const place of response.places) unique.set(place.id, place);
  // Sequence numbers describe the full requested itinerary, not indices in the
  // reduced list of already resolved anchors. A first breakfast belongs before
  // a later locked theater, rather than after the last locked anchor.
  const insertionIndex = anchors.filter(
    (anchor) =>
      (anchor.item.preferred_sequence ?? Infinity) <
      (item.preferred_sequence ?? Infinity),
  ).length;
  const candidates = [...unique.values()]
    .filter(
      (place) =>
        !excludedPlaceIds.includes(place.id) &&
        place.id !== origin.id &&
        place.id !== destination.id &&
        !anchors.some((a) => a.place.id === place.id),
    )
    .flatMap((place) => {
      const possible = base.paths
        .map((path, index) => ({
          index,
          distance: distanceToPath(place.location, path),
        }))
        .filter(
          (p) =>
            p.distance <= radiusMeters &&
            (!item.order_locked || p.index === insertionIndex),
        );
      const nearest = possible.sort((a, b) => a.distance - b.distance)[0];
      return nearest ? [{ place, ...nearest }] : [];
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);
  // Gemini checks the candidates against the request with Google Maps data while
  // the journeys are routed, so grounding adds no time beyond the slower of the two.
  const grounding = tryGroundPlaces({
    want: item.title === query ? query : `${item.title} (${query})`,
    requirements: requestedRequirements(item),
    preferences: request.preferences,
    interests: request.interestTags,
    budget: request.budget,
    near: candidates[0]?.place.location ?? origin.location,
    candidates: candidates.map((candidate) => candidate.place),
  });
  // Validate complete journeys with the chosen mode, including transit departure times,
  // stop duration and fixed appointments. Geographic proximity alone isn't efficiency.
  const [insights, evaluated] = await Promise.all([
    grounding,
    Promise.all(
      candidates.map(async (candidate) => {
        const withStop = [...anchors];
        withStop.splice(candidate.index, 0, { place: candidate.place, item });
        try {
          const routed = await traceRoute(
            origin,
            destination,
            withStop,
            request,
          );
          return routed
            ? {
                ...candidate,
                arrival: routed.arrival,
                travelMinutes: routed.travelMinutes,
              }
            : null;
        } catch (error) {
          if (error instanceof AppError && error.code === "NO_ROUTE")
            return null;
          throw error;
        }
      }),
    ),
  ]);
  const feasible = evaluated
    .filter((value) => value !== null)
    .map((candidate) => {
      const insight = insights?.get(candidate.place.id);
      return insight
        ? { ...candidate, place: { ...candidate.place, insight } }
        : candidate;
    });
  if (!feasible.length) return null;
  const earliest = Math.min(...feasible.map((candidate) => candidate.arrival));
  // Without grounding every candidate scores the same and the fastest wins.
  // Places Google Maps returned no data for rank below reasonable matches.
  const fit = (candidate: (typeof feasible)[number]) =>
    insights ? (candidate.place.insight?.fit ?? 3) : 0;
  const score = (candidate: (typeof feasible)[number]) =>
    fit(candidate) * minutesPerFitPoint -
    (candidate.arrival - earliest) / 60000;
  return (
    feasible.sort(
      (a, b) =>
        Number(meetsRequirements(item, b.place)) -
          Number(meetsRequirements(item, a.place)) ||
        score(b) - score(a) ||
        a.travelMinutes - b.travelMinutes,
    )[0] ?? null
  );
}
