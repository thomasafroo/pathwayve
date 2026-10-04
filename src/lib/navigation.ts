import type { Location, TripRequest } from "@/types/trip";
export function navigationUrl(
  destination: { name: string; location: Location; placeId?: string },
  mode: TripRequest["transportation"],
) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  // Omit origin so Google Maps uses its own freshest device location.
  url.searchParams.set(
    "destination",
    `${destination.location.lat},${destination.location.lng}`,
  );
  if (destination.placeId && !destination.placeId.startsWith("coordinate:"))
    url.searchParams.set("destination_place_id", destination.placeId);
  url.searchParams.set("travelmode", mode);
  url.searchParams.set("dir_action", "navigate");
  return url.toString();
}
export function positionDistance(a: Location, b: Location) {
  const rad = Math.PI / 180;
  return (
    6371000 *
    2 *
    Math.asin(
      Math.sqrt(
        Math.min(
          1,
          Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
            Math.cos(a.lat * rad) *
              Math.cos(b.lat * rad) *
              Math.sin(((b.lng - a.lng) * rad) / 2) ** 2,
        ),
      ),
    )
  );
}
