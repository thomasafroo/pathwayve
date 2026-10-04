import type { RouteLeg, TripRequest } from "@/types/trip";
import { Icon } from "./Icon";

// One travel leg with its turn-by-turn directions. Shared by the editable
// itinerary and the saved-schedule view so both show the same directions.
export function TravelLeg({
  leg,
  mode,
}: {
  leg: RouteLeg;
  mode: TripRequest["transportation"];
}) {
  return (
    <li className="travel-leg">
      <Icon name={mode} size={15} />
      <span>
        {Math.round(leg.durationMinutes)} min{" "}
        {mode === "transit"
          ? "on transit"
          : mode === "walking"
            ? "walk"
            : "drive"}
      </span>
      <span className="travel-distance">
        {(leg.distanceMeters / 1000).toFixed(1)} km
      </span>
      {!!leg.steps?.length && (
        <details className="route-directions">
          <summary>View directions</summary>
          <ol>
            {leg.steps.map((step, index) => (
              <li key={index}>
                <strong>
                  {step.mode === "TRANSIT"
                    ? (step.line ?? "Transit")
                    : step.mode === "WALK"
                      ? "Walk"
                      : "Drive"}
                </strong>{" "}
                {step.instruction}
                {step.durationMinutes > 0
                  ? ` · ${step.durationMinutes} min`
                  : ""}
              </li>
            ))}
          </ol>
          {leg.warnings?.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </details>
      )}
    </li>
  );
}
