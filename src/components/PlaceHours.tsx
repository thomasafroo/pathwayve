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
