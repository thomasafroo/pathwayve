import type { TripEvent, TripState } from "@/types/trip";
export function ReplanControls({
  trip,
  busy,
  onReplan,
}: {
  trip: TripState;
  busy: boolean;
  onReplan: (event: TripEvent) => Promise<void>;
}) {
  if (trip.source !== "demo") return null;
  return (
    <section className="replan">
      <h2>Plans change. Try it.</h2>
      <p>
        Simulated events for the hackathon demo. Locked stops stay in place.
      </p>
      <div className="event-buttons">
        <button
          disabled={busy}
          onClick={() => onReplan({ type: "RAIN_EARLY" })}
        >
          Rain starts early
        </button>
        <button
          disabled={busy}
          onClick={() => onReplan({ type: "DELAY", minutes: 20 })}
        >
          Leave 20 minutes late
        </button>
        <button
          disabled={busy}
          onClick={() =>
            onReplan({
              type: "EARLIER_END",
              endTime: new Date(
                Date.parse(trip.request.endTime) - 60 * 60_000,
              ).toISOString(),
            })
          }
        >
          Finish an hour earlier
        </button>
      </div>
    </section>
  );
}
