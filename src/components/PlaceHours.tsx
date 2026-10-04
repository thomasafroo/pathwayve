import type { CandidatePlace, TripStop } from "@/types/trip";
export function PlaceHours({
  place,
}: {
  place: CandidatePlace &
    Partial<Pick<TripStop, "hoursStatus" | "waitMinutes">>;
}) {
  const hours = place.openingHours;
  const lines =
    hours?.current?.weekdayDescriptions ?? hours?.regular?.weekdayDescriptions;
  const closed = hours?.businessStatus?.startsWith("CLOSED_");
  return (
    <div className="place-hours">
      <p>
        {closed
          ? "Reported closed"
          : place.hoursStatus === "current"
            ? "Visit fits reported opening hours"
            : place.hoursStatus === "regular"
              ? "Visit fits regular hours · holiday changes may differ"
              : "Opening hours unverified"}
        {!!place.waitMinutes && ` · Wait ${place.waitMinutes} min before visit`}
      </p>
      {place.hoursStatus === "unknown" &&
        place.attribution === "Google Maps" && (
          <p>
            Google Places did not provide usable opening hours. Confirm hours
            and, for cinemas, showtimes before visiting.
            {place.mapsUrl && (
              <>
                {" "}
                <a href={place.mapsUrl} target="_blank" rel="noreferrer">
                  Check place details
                </a>
              </>
            )}
          </p>
        )}
      {!!lines?.length && (
        <details>
          <summary>
            Opening hours{hours?.timeZone ? ` · ${hours.timeZone}` : ""}
          </summary>
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </details>
      )}
    </div>
  );
}
