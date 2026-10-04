import { PlaceHours } from "./PlaceHours";
import { PlaceInsight } from "./PlaceInsight";
import type { TripStop } from "@/types/trip";
import type { Activity, TripModification } from "@/types/workspace";
import { Icon } from "./Icon";
export function formatTime(time: string) {
  return new Date(time).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
export function StopCard({
  stop,
  index,
  count,
  activities,
  selected,
  onSelect,
  onModify,
  onActivity,
  disabled,
  editable,
}: {
  stop: TripStop;
  index: number;
  count: number;
  activities: Activity[];
  selected: boolean;
  onSelect: () => void;
  onModify: (change: TripModification) => void;
  onActivity: () => void;
  disabled: boolean;
  editable: boolean;
}) {
  return (
    <li className={`stop ${selected ? "selected" : ""}`} id={`stop-${stop.id}`}>
      <div className="stop-rail">
        <span className="stop-index">{index + 1}</span>
      </div>
      <div className="stop-content">
        <div className="stop-heading">
          <button
            className="stop-title-button"
            onClick={onSelect}
            aria-label={`Show ${stop.name} on map`}
            aria-pressed={selected}
          >
            <span className={`category-icon ${stop.category}`}>
              <Icon name={stop.category} />
            </span>
            <span>
              <span className="stop-meta">
                {formatTime(stop.arrivalTime)}
                <span> · {stop.category}</span>
              </span>
              <h3>{stop.name}</h3>
            </span>
          </button>
          <button
            className="icon-button lock-button"
            title={
              stop.locked ? "Unlock stop" : "Keep this stop and its position"
            }
            aria-label={`${stop.locked ? "Unlock" : "Lock"} ${stop.name}`}
            aria-pressed={stop.locked}
            onClick={() =>
              onModify({
                type: "SET_LOCK",
                stopId: stop.id,
                locked: !stop.locked,
              })
            }
            disabled={disabled}
          >
            <Icon name={stop.locked ? "lock" : "unlock"} size={17} />
          </button>
        </div>
        <PlaceHours place={stop} />
        <p className="stop-reason">{stop.reason}</p>
        {stop.insight && <PlaceInsight insight={stop.insight} />}
        <div className="stop-actions">
          <label className="duration-field">
            <Icon name="clock" size={14} />
            <input
              aria-label={`Duration for ${stop.name}`}
              type="number"
              min={5}
              max={180}
              step={5}
              key={`${stop.id}-${stop.durationMinutes}`}
              defaultValue={stop.durationMinutes}
              disabled={disabled || stop.locked || !editable}
              onBlur={(event) => {
                const minutes = Number(event.target.value);
                if (minutes !== stop.durationMinutes)
                  onModify({
                    type: "CHANGE_DURATION",
                    stopId: stop.id,
                    minutes,
                  });
                event.target.value = String(stop.durationMinutes);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <span>min</span>
          </label>
          <button
            className="subtle-button"
            onClick={onActivity}
            disabled={disabled}
          >
            <Icon name="plus" size={14} />
            Activity
          </button>
          <div className="stop-order">
            <button
              className="icon-button"
              aria-label={`Move ${stop.name} earlier`}
              disabled={disabled || stop.locked || !editable || index === 0}
              onClick={() =>
                onModify({
                  type: "MOVE_STOP",
                  stopId: stop.id,
                  newIndex: index - 1,
                })
              }
            >
              <Icon name="up" size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={`Move ${stop.name} later`}
              disabled={
                disabled || stop.locked || !editable || index === count - 1
              }
              onClick={() =>
                onModify({
                  type: "MOVE_STOP",
                  stopId: stop.id,
                  newIndex: index + 1,
                })
              }
            >
              <Icon name="down" size={16} />
            </button>
            <button
              className="icon-button remove-stop"
              aria-label={`Remove ${stop.name}`}
              disabled={disabled || stop.locked || !editable}
              onClick={() => onModify({ type: "REMOVE_STOP", stopId: stop.id })}
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        </div>
        {activities.map((activity) => (
          <div
            className={`activity-row ${activity.type === "USER_TASK" && activity.completed ? "completed" : ""}`}
            key={activity.id}
          >
            {activity.type === "USER_TASK" ? (
              <input
                type="checkbox"
                aria-label={`Complete ${activity.title}`}
                checked={activity.completed}
                disabled={disabled}
                onChange={(event) =>
                  onModify({
                    type: "COMPLETE_ACTIVITY",
                    activityId: activity.id,
                    completed: event.target.checked,
                  })
                }
              />
            ) : (
              <Icon name="sparkle" size={17} />
            )}
            <div>
              <strong>{activity.title}</strong>
              <span>
                {activity.durationMinutes} min ·{" "}
                {activity.type === "USER_TASK"
                  ? "Your activity"
                  : `AI task · ${activity.status}`}
              </span>
              {activity.type === "AI_TASK" && activity.result && (
                <p>{activity.result}</p>
              )}
            </div>
            <button
              className="icon-button"
              aria-label={`Remove activity ${activity.title}`}
              disabled={disabled}
              onClick={() =>
                onModify({ type: "REMOVE_ACTIVITY", activityId: activity.id })
              }
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </li>
  );
}
