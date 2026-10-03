import type { TripStop } from "@/types/trip";
export function formatTime(time: string) {
  return new Date(time).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
export function StopCard({
  stop,
  index,
  onLock,
  disabled,
}: {
  stop: TripStop;
  index: number;
  onLock: () => void;
  disabled: boolean;
}) {
  return (
    <li className="stop">
      <span className="stop-index">{index + 1}</span>
      <div>
        <p className="stop-meta">
          {formatTime(stop.arrivalTime)} · {stop.durationMinutes} min ·{" "}
          {stop.category}
        </p>
        <h3>{stop.name}</h3>
        <p>{stop.reason}</p>
      </div>
      <button
        className="lock-button"
        aria-label={`${stop.locked ? "Unlock" : "Lock"} ${stop.name}`}
        aria-pressed={stop.locked}
        onClick={onLock}
        disabled={disabled}
      >
        {stop.locked ? "Locked" : "Lock"}
      </button>
    </li>
  );
}
