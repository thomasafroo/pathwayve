import "server-only";
import { z } from "zod";
import type { Location, RouteLeg, TripRequest, TripStop } from "@/types/trip";
import { dataMode, requireEnv } from "./server/env";
import { AppError, googlePost } from "./server/http";

const routeResponseSchema = z.object({
  routes: z
    .array(
      z.object({
        duration: z.string().regex(/^\d+(\.\d+)?s$/),
        distanceMeters: z.number().nonnegative().default(0),
        polyline: z.object({
          geoJsonLinestring: z.object({
            coordinates: z.array(z.tuple([z.number(), z.number()])),
          }),
        }),
      }),
    )
    .min(1),
});
export function distanceMeters(a: Location, b: Location) {
  const rad = Math.PI / 180;
  const value =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return Math.round(6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, value))));
}
async function computeLeg(
  from: TripRequest["origin"],
  to: TripRequest["destination"],
  request: TripRequest,
  departureTime: string,
): Promise<RouteLeg> {
  if (dataMode() === "demo") {
    const distance = distanceMeters(from.location, to.location);
    const speed = { walking: 70, driving: 500, transit: 300 }[
      request.transportation
    ];
    return {
      from: from.name,
      to: to.name,
      distanceMeters: distance,
      durationMinutes: Math.max(5, Math.ceil(distance / speed)),
      path: [from.location, to.location],
    };
  }
  const waypoint = (point: Location) => ({
    location: { latLng: { latitude: point.lat, longitude: point.lng } },
  });
  const result = routeResponseSchema.safeParse(
    await googlePost(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      requireEnv("GOOGLE_MAPS_SERVER_API_KEY"),
      "routes.duration,routes.distanceMeters,routes.polyline.geoJsonLinestring",
      {
        origin: waypoint(from.location),
        destination: waypoint(to.location),
        travelMode: { walking: "WALK", driving: "DRIVE", transit: "TRANSIT" }[
          request.transportation
        ],
        departureTime,
        polylineEncoding: "GEO_JSON_LINESTRING",
      },
    ),
  );
  if (!result.success)
    throw new AppError(
      "NO_ROUTE",
      "No usable route was found between these stops.",
      422,
    );
  const route = result.data.routes[0];
  return {
    from: from.name,
    to: to.name,
    durationMinutes: Math.ceil(parseFloat(route.duration) / 60),
    distanceMeters: route.distanceMeters,
    path: route.polyline.geoJsonLinestring.coordinates.map(([lng, lat]) => ({
      lat,
      lng,
    })),
  };
}
export async function scheduleTrip(request: TripRequest, stops: TripStop[]) {
  let current = request.origin;
  let time = Date.parse(request.startTime);
  const legs: RouteLeg[] = [];
  const scheduled: TripStop[] = [];
  // Transit does not accept intermediate waypoints. Route each leg at its scheduled departure.
  for (const stop of [...stops, null]) {
    const next = stop ?? request.destination;
    const leg = await computeLeg(
      current,
      next,
      request,
      new Date(time).toISOString(),
    );
    legs.push(leg);
    time += leg.durationMinutes * 60_000;
    if (stop) {
      scheduled.push({ ...stop, arrivalTime: new Date(time).toISOString() });
      time += stop.durationMinutes * 60_000;
    }
    current = next;
  }
  return { stops: scheduled, legs, arrivalTime: new Date(time).toISOString() };
}
