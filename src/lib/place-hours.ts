import "server-only";
import { z } from "zod";
import {
  providerHoursFields,
  hoursFieldMask,
  readOpeningHours,
} from "@/types/opening-hours";
import type { CandidatePlace } from "@/types/trip";
import { mapsMode, requireEnv } from "./server/env";
export async function refreshPlaceHours<T extends CandidatePlace>(
  place: T,
): Promise<T> {
  if (mapsMode() !== "live" || place.attribution !== "Google Maps")
    return place;
  if (
    place.openingHours &&
    Date.now() - Date.parse(place.openingHours.checkedAt) < 60000
  )
    return place;
  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(place.id)}`,
      {
        headers: {
          "X-Goog-Api-Key": requireEnv("GOOGLE_MAPS_SERVER_API_KEY"),
          "X-Goog-FieldMask": hoursFieldMask,
        },
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      },
    );
    if (!response.ok) throw new Error("Hours unavailable");
    return {
      ...place,
      openingHours: readOpeningHours(
        z.object(providerHoursFields).parse(await response.json()),
      ),
    };
  } catch {
    // Stale hours must not silently act as verified opening times.
    return { ...place, openingHours: { checkedAt: new Date().toISOString() } };
  }
}
