import "server-only";
import {
  providerHoursFields,
  hoursFieldMask,
  readOpeningHours,
} from "@/types/opening-hours";
import { z } from "zod";
import {
  autocompleteInputSchema,
  placeDetailsInputSchema,
} from "@/types/place-search";
import { candidatePlaceSchema } from "@/types/trip";
import { searchPlaces } from "./place-search";
import { demoPlaces, endpoints } from "./fixtures";
import { mapsMode, requireEnv } from "./server/env";
import { AppError, googlePost } from "./server/http";

const predictionResponse = z.object({
  suggestions: z
    .array(
      z.object({
        placePrediction: z
          .object({
            placeId: z.string(),
            text: z.object({ text: z.string() }),
            structuredFormat: z
              .object({
                mainText: z.object({ text: z.string() }),
                secondaryText: z.object({ text: z.string() }).optional(),
              })
              .optional(),
          })
          .optional(),
      }),
    )
    .default([]),
});
export async function autocompletePlaces(
  input: z.infer<typeof autocompleteInputSchema>,
) {
  if (mapsMode() === "demo") {
    const result = await searchPlaces({
      query: input.query,
      category: "attraction",
      budget: "any",
    });
    return {
      source: "demo" as const,
      suggestions: result.places.slice(0, 5).map((p) => ({
        placeId: p.id,
        name: p.name,
        address: ("address" in p ? p.address : undefined) ?? "Sample location",
      })),
    };
  }
  const result = predictionResponse.parse(
    await googlePost(
      "https://places.googleapis.com/v1/places:autocomplete",
      requireEnv("GOOGLE_MAPS_SERVER_API_KEY"),
      "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
      {
        input: input.query,
        sessionToken: input.sessionToken,
        includeQueryPredictions: false,
        ...(input.near
          ? {
              locationBias: {
                circle: {
                  center: {
                    latitude: input.near.lat,
                    longitude: input.near.lng,
                  },
                  radius: 10000,
                },
              },
            }
          : {}),
      },
    ),
  );
  return {
    source: "live" as const,
    suggestions: result.suggestions.flatMap((s) =>
      s.placePrediction
        ? [
            {
              placeId: s.placePrediction.placeId,
              name:
                s.placePrediction.structuredFormat?.mainText.text ??
                s.placePrediction.text.text,
              address:
                s.placePrediction.structuredFormat?.secondaryText?.text ?? "",
            },
          ]
        : [],
    ),
  };
}

const detailResponse = z.object({
  ...providerHoursFields,
  id: z.string(),
  displayName: z.object({ text: z.string() }),
  formattedAddress: z.string().optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }),
  googleMapsUri: z.string().optional(),
});
export async function resolvePlace(
  input: z.infer<typeof placeDetailsInputSchema>,
) {
  if (mapsMode() === "demo") {
    const place = [
      ...demoPlaces,
      ...endpoints.map((p, i) => ({
        ...p,
        id: `demo-endpoint-${i}`,
        category: "attraction" as const,
      })),
    ].find((p) => p.id === input.placeId);
    if (!place)
      throw new AppError(
        "PLACE_NOT_FOUND",
        "This sample place is no longer available. Search again.",
        404,
      );
    return { place: candidatePlaceSchema.parse(place) };
  }
  const url = new URL(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(input.placeId)}`,
  );
  url.searchParams.set("sessionToken", input.sessionToken);
  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": requireEnv("GOOGLE_MAPS_SERVER_API_KEY"),
      "X-Goog-FieldMask": `id,displayName,formattedAddress,location,googleMapsUri,${hoursFieldMask}`,
    },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new AppError(
      "PROVIDER_ERROR",
      "Google could not load this place. Try again, or check Places API access and quota.",
      502,
    );
  const place = detailResponse.parse(await response.json());
  return {
    place: candidatePlaceSchema.parse({
      id: place.id,
      name: place.displayName.text,
      address: place.formattedAddress,
      location: { lat: place.location.latitude, lng: place.location.longitude },
      category: input.category,
      mapsUrl: place.googleMapsUri,
      attribution: "Google Maps",
      openingHours: readOpeningHours(place),
    }),
  };
}
