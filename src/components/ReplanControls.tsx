import type { TripEvent, TripState } from "@/types/trip";
import { Icon } from "./Icon";
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
    <section className="replan card">
      <span className="section-symbol">
        <Icon name="sparkle" size={22} />
      </span>
      <p className="eyebrow">A PLAN THAT CAN BEND</p>
      <h2>
        Life happens.
        <br />
        Your day can adapt.
      </h2>
      <p>
        Try a change and see your itinerary adjust around the stops you’ve
        locked.
      </p>
      <div className="event-buttons">
        <button
          disabled={busy}
          onClick={() => onReplan({ type: "RAIN_EARLY" })}
        >
          <Icon name="rain" size={19} />
          <span>Rain starts early</span>
          <Icon name="arrow" size={16} />
        </button>
        <button
          disabled={busy}
          onClick={() => onReplan({ type: "DELAY", minutes: 20 })}
        >
          <Icon name="transit" size={19} />
          <span>Leave 20 minutes late</span>
          <Icon name="arrow" size={16} />
        </button>
        <button
          disabled={busy}
          onClick={() =>
            onReplan({
              type: "EARLIER_END",
              endTime: new Date(
                Date.parse(trip.request.endTime) - 3600000,
              ).toISOString(),
            })
          }
        >
          <Icon name="clock" size={19} />
          <span>Finish an hour earlier</span>
          <Icon name="arrow" size={16} />
        </button>
      </div>
      <span className="simulation-label">
        <span />
        Simulated events · preview how it works
      </span>
    </section>
  );
}
