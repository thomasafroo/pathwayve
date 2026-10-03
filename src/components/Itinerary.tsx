import type { WorkspaceTrip, TripModification } from "@/types/workspace";
import { toSchedule } from "@/lib/trip-workspace";
import { StopCard, formatTime } from "./StopCard";
import { Icon } from "./Icon";
export function Itinerary({
  state,
  selectedId,
  onSelect,
  onModify,
  onActivity,
  onAdd,
  busy,
}: {
  state: WorkspaceTrip;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onModify: (change: TripModification) => void;
  onActivity: (stopId: string) => void;
  onAdd: () => void;
  busy: boolean;
}) {
  const { trip } = state;
  const schedule = toSchedule(state);
  return (
    <section
      className="itinerary card"
      aria-labelledby="itinerary-heading"
      id="itinerary"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">THE DAY, UNFOLDED</p>
          <h2 id="itinerary-heading">
            Your itinerary
            <span className="count-badge">{trip.stops.length} stops</span>
          </h2>
        </div>
        <button
          className="subtle-button"
          disabled={busy || trip.stops.length >= 6}
          onClick={onAdd}
        >
          <Icon name="plus" size={16} />
          Add stop
        </button>
      </div>
      <p className="trip-window">
        {new Date(trip.request.startTime).toLocaleString([], {
          timeZone: trip.request.timeZone,
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}{" "}
        →{" "}
        {new Date(trip.request.endTime).toLocaleString([], {
          timeZone: trip.request.timeZone,
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}{" "}
        · {trip.request.timeZone}
      </p>
      <div className="timeline-endpoint">
        <span className="endpoint-dot" />
        <div>
          <strong>{trip.request.origin.name}</strong>
          <span>Head out at {formatTime(trip.request.startTime)}</span>
        </div>
        <span className="endpoint-label">START</span>
      </div>
      <ol className="stops">
        {schedule.map((item) => {
          switch (item.type) {
            case "TRANSIT":
              return (
                <li key={item.id} className="travel-leg">
                  <Icon name={trip.request.transportation} size={15} />
                  <span>
                    {Math.round(item.leg.durationMinutes)} min{" "}
                    {trip.request.transportation === "transit"
                      ? "on transit"
                      : trip.request.transportation === "walking"
                        ? "walk"
                        : "drive"}
                  </span>
                  <span className="travel-distance">
                    {(item.leg.distanceMeters / 1000).toFixed(1)} km
                  </span>
                  {!!item.leg.steps?.length && (
                    <details className="route-directions">
                      <summary>View directions</summary>
                      <ol>
                        {item.leg.steps.map((step, index) => (
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
                      {item.leg.warnings?.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </details>
                  )}
                </li>
              );
            case "PLACE":
              return (
                <StopCard
                  key={item.id}
                  stop={item.stop}
                  index={trip.stops.findIndex((s) => s.id === item.id)}
                  count={trip.stops.length}
                  selected={selectedId === item.id}
                  activities={state.activities.filter(
                    (a) => a.stopId === item.id,
                  )}
                  onSelect={() => onSelect(item.id)}
                  onModify={onModify}
                  onActivity={() => onActivity(item.id)}
                  disabled={busy}
                  editable={true}
                />
              );
            case "USER_TASK":
            case "AI_TASK":
              return null; // Render inside their host place card; no duplicated state.
          }
        })}
      </ol>
      <div className="timeline-endpoint destination">
        <Icon name="pin" size={20} />
        <div>
          <strong>{trip.request.destination.name}</strong>
          <span>Arrive around {formatTime(trip.arrivalTime)}</span>
        </div>
        <span className="endpoint-label">YOU MADE IT</span>
      </div>
      {!trip.stops.length && (
        <p className="hint">
          Just the journey for now. Add a stop to make it your own.
        </p>
      )}
      <p className="timeline-footnote">
        <Icon name="lock" size={13} />
        Lock a stop to keep it in your plan. Arrival times can still adjust.
      </p>
    </section>
  );
}
