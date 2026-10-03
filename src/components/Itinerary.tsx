import type { TripState } from "@/types/trip";
import { StopCard, formatTime } from "./StopCard";
export function Itinerary({
  trip,
  onLock,
  busy,
}: {
  trip: TripState;
  onLock: (id: string) => void;
  busy: boolean;
}) {
  return (
    <section className="itinerary" aria-labelledby="itinerary-heading">
      <div className="section-heading">
        <h2 id="itinerary-heading">Your itinerary</h2>
        <span>Arrive {formatTime(trip.arrivalTime)}</span>
      </div>
      <p role="status">{trip.summary}</p>
      <ol className="stops">
        {trip.stops.map((stop, index) => (
          <StopCard
            key={stop.id}
            stop={stop}
            index={index}
            onLock={() => onLock(stop.id)}
            disabled={busy}
          />
        ))}
      </ol>
      {!trip.stops.length && (
        <p>
          Just the journey this time. Your time window leaves no room for
          optional stops.
        </p>
      )}
      {trip.warnings.map((warning) => (
        <p className="notice" key={warning}>
          {warning}
        </p>
      ))}
    </section>
  );
}
