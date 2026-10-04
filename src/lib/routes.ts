import "server-only";
import { visitWindow } from "./opening-hours";
import { refreshPlaceHours } from "./place-hours";
import { z } from "zod";
import type { Location, RouteLeg, TripRequest, TripStop } from "@/types/trip";
import { mapsMode, requireEnv } from "./server/env";
import { AppError, googlePost } from "./server/http";

const routeResponseSchema = z.object({
  routes: z
    .array(
      z.object({
        duration: z.string().regex(/^\d+(\.\d+)?s$/),
        distanceMeters: z.number().nonnegative().default(0),
        warnings: z.array(z.string()).optional(),
        legs: z
          .array(
            z.object({
              steps: z
                .array(
                  z.object({
                    staticDuration: z.string().optional(),
                    travelMode: z.string().optional(),
                    navigationInstruction: z
                      .object({ instructions: z.string().optional() })
                      .optional(),
                    transitDetails: z
                      .object({
                        transitLine: z
                          .object({
                            name: z.string().optional(),
                            nameShort: z.string().optional(),
                          })
                          .optional(),
                      })
                      .optional(),
                  }),
                )
                .optional(),
            }),
          )
          .optional(),
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
export async function computeLeg(
  from: TripRequest["origin"],
  to: TripRequest["destination"],
  request: TripRequest,
  departureTime: string,
): Promise<RouteLeg> {
  if (mapsMode() === "demo") {
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
      mode: request.transportation,
    };
  }
  const waypoint = (point: Location) => ({
    location: { latLng: { latitude: point.lat, longitude: point.lng } },
  });
  const result = routeResponseSchema.safeParse(
    await googlePost(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      requireEnv("GOOGLE_MAPS_SERVER_API_KEY"),
      "routes.duration,routes.distanceMeters,routes.polyline.geoJsonLinestring,routes.warnings,routes.legs.steps.staticDuration,routes.legs.steps.travelMode,routes.legs.steps.navigationInstruction,routes.legs.steps.transitDetails.transitLine",
      {
        origin: waypoint(from.location),
        destination: waypoint(to.location),
        travelMode: { walking: "WALK", driving: "DRIVE", transit: "TRANSIT" }[
          request.transportation
        ],
        ...(request.transportation !== "walking"
          ? {
              departureTime: new Date(
                Math.max(Date.parse(departureTime), Date.now() + 1000),
              ).toISOString(),
            }
          : {}),
        ...(request.transportation === "driving"
          ? { routingPreference: "TRAFFIC_AWARE" }
          : {}),
        ...(request.transportation === "transit" &&
        request.routingPriority &&
        request.routingPriority !== "fastest"
          ? {
              transitPreferences: {
                routingPreference:
                  request.routingPriority === "less_walking"
                    ? "LESS_WALKING"
                    : "FEWER_TRANSFERS",
              },
            }
          : {}),
        computeAlternativeRoutes: true,
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
  const route =
    request.transportation === "transit" &&
    request.routingPriority &&
    request.routingPriority !== "fastest"
      ? result.data.routes[0]
      : [...result.data.routes].sort(
          (a, b) => parseFloat(a.duration) - parseFloat(b.duration),
        )[0];
  return {
    from: from.name,
    to: to.name,
    mode: request.transportation,
    warnings: route.warnings,
    steps: route.legs?.flatMap((leg) =>
      (leg.steps ?? []).map((step) => ({
        instruction:
          step.navigationInstruction?.instructions ??
          (step.travelMode === "TRANSIT" ? "Take transit" : "Continue"),
        mode: step.travelMode ?? request.transportation.toUpperCase(),
        durationMinutes: Math.ceil(
          parseFloat(step.staticDuration ?? "0s") / 60,
        ),
        line:
          step.transitDetails?.transitLine?.nameShort ??
          step.transitDetails?.transitLine?.name,
      })),
    ),
    durationMinutes: Math.ceil(parseFloat(route.duration) / 60),
    distanceMeters: route.distanceMeters,
    path: route.polyline.geoJsonLinestring.coordinates.map(([lng, lat]) => ({
      lat,
      lng,
    })),
  };
}
export async function scheduleTrip(request: TripRequest, stops: TripStop[]) {
  stops = await Promise.all(stops.map(refreshPlaceHours));
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
      const window = visitWindow(
        stop,
        time,
        stop.durationMinutes,
        Date.parse(request.endTime),
      );
      if (!window)
        throw new AppError(
          "OPENING_HOURS",
          `${stop.name}: the full visit does not fit its opening hours before your deadline. Change the order, duration, or date.`,
          422,
        );
      time = window.start;
      scheduled.push({
        ...stop,
        arrivalTime: new Date(time).toISOString(),
        hoursStatus: window.status,
        waitMinutes: window.waitMinutes,
      });
      time += stop.durationMinutes * 60_000;
    }
    current = next;
  }
  return { stops: scheduled, legs, arrivalTime: new Date(time).toISOString() };
}
