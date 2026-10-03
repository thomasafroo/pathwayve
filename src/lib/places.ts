import "server-only";
import { z } from "zod";
import type { CandidatePlace, TripRequest } from "@/types/trip";
import { demoPlaces } from "./fixtures";
import { mapsMode, requireEnv } from "./server/env";
import { googlePost } from "./server/http";

const responseSchema = z.object({
  places: z
    .array(
      z.object({
        id: z.string(),
        displayName: z.object({ text: z.string() }),
        location: z.object({ latitude: z.number(), longitude: z.number() }),
        formattedAddress: z.string().optional(),
      }),
    )
    .default([]),
});
export async function findPlaces(
  request: TripRequest,
): Promise<CandidatePlace[]> {
  if (mapsMode() === "demo")
    return demoPlaces.filter((place) =>
      request.activities.includes(place.category),
    );
  const key = requireEnv("GOOGLE_MAPS_SERVER_API_KEY");
  const groups = await Promise.all(
    request.activities.map(async (category) => {
      const result = responseSchema.parse(
        await googlePost(
          "https://places.googleapis.com/v1/places:searchText",
          key,
          "places.id,places.displayName,places.location,places.formattedAddress",
          {
            textQuery: `${category} near ${request.destination.name}`,
            pageSize: 5,
            locationBias: {
              circle: {
                center: {
                  latitude: request.destination.location.lat,
                  longitude: request.destination.location.lng,
                },
                radius: 5000,
              },
            },
          },
        ),
      );
      return result.places.map((place) => ({
        id: place.id,
        name: place.displayName.text,
        category,
        location: {
          lat: place.location.latitude,
          lng: place.location.longitude,
        },
        address: place.formattedAddress,
      }));
    }),
  );
  return Array.from(
    new Map(groups.flat().map((place) => [place.id, place])).values(),
  );
}
