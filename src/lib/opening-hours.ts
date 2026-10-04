import type { CandidatePlace } from "@/types/trip";
const DAY = 86400000;
function civil(time: number, zone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(time);
  const n = (name: string) => Number(parts.find((p) => p.type === name)!.value);
  return Date.UTC(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour"),
    n("minute"),
    n("second"),
  );
}
function instant(local: number, zone: string) {
  let result = local;
  for (let i = 0; i < 4; i++) result += local - civil(result, zone);
  return civil(result, zone) === local ? result : NaN;
}
export type VisitWindow = {
  start: number;
  status: "current" | "regular" | "unknown";
  waitMinutes: number;
};
/** Require the entire visit to fit one open interval; never use open-now for a future visit. */
export function visitWindow(
  place: Pick<CandidatePlace, "openingHours">,
  arrival: number,
  duration: number,
  deadline: number,
  fixed = false,
): VisitWindow | null {
  const hours = place.openingHours;
  if (
    hours?.businessStatus === "CLOSED_PERMANENTLY" ||
    hours?.businessStatus === "CLOSED_TEMPORARILY"
  )
    return null;
  const unknown = {
    start: arrival,
    status: "unknown" as const,
    waitMinutes: 0,
  };
  if (!hours?.timeZone || (!hours.regular?.periods && !hours.current?.periods))
    return unknown;
  const zone = hours.timeZone;
  try {
    civil(arrival, zone);
  } catch {
    return unknown;
  }
  const localDay = Math.floor(civil(arrival, zone) / DAY) * DAY;
  const currentDay =
    Math.floor(civil(Date.parse(hours.checkedAt), zone) / DAY) * DAY;
  const coverageStart = instant(currentDay, zone),
    coverageEnd = instant(currentDay + 7 * DAY, zone);
  const intervals: {
    start: number;
    end: number;
    status: "current" | "regular" | "unknown";
  }[] = [];
  for (let day = localDay - 7 * DAY; day <= localDay + 32 * DAY; day += DAY) {
    const weekday = new Date(day).getUTCDay();
    const current =
      day >= currentDay &&
      day < currentDay + 7 * DAY &&
      hours.current?.periods !== undefined;
    const periods = current ? hours.current!.periods : hours.regular?.periods;
    const dayStart = instant(day, zone),
      dayEnd = instant(day + DAY, zone);
    if (!periods) {
      intervals.push({ start: dayStart, end: dayEnd, status: "unknown" });
      continue;
    }
    for (const period of periods) {
      const open = period.open,
        close = period.close;
      // Google's documented always-open representation.
      if (
        !close &&
        open.day === 0 &&
        open.hour === 0 &&
        open.minute === 0 &&
        !open.date
      ) {
        intervals.push({
          start: dayStart,
          end: dayEnd,
          status: current ? "current" : "regular",
        });
        continue;
      }
      const dated = open.date
        ? Date.UTC(open.date.year, open.date.month - 1, open.date.day)
        : null;
      if (dated !== null ? dated !== day : open.day !== weekday) continue;
      if (!close) continue; // Incomplete intervals cannot establish a closing time.
      const closeDay = close.date
        ? Date.UTC(close.date.year, close.date.month - 1, close.date.day)
        : day + ((close.day - open.day + 7) % 7) * DAY;
      let start = instant(day + (open.hour * 60 + open.minute) * 60000, zone);
      let end = instant(
        closeDay + (close.hour * 60 + close.minute) * 60000,
        zone,
      );
      if (current) {
        start = Math.max(start, coverageStart);
        end = Math.min(end, coverageEnd);
      } else if (hours.current?.periods !== undefined) {
        // Regular intervals cannot override date-specific closures.
        if (start < coverageStart) end = Math.min(end, coverageStart);
        else start = Math.max(start, coverageEnd);
      }
      if (Number.isFinite(start) && Number.isFinite(end) && end > start)
        intervals.push({ start, end, status: current ? "current" : "regular" });
    }
  }
  intervals.sort((a, b) => a.start - b.start);
  const merged: typeof intervals = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end && interval.status === last.status)
      last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  for (let i = 0; i < merged.length; i++) {
    const interval = merged[i];
    const start = Math.max(arrival, interval.start);
    if (fixed && start !== arrival) continue;
    const finish = start + duration * 60000;
    let end = interval.end,
      status = interval.status;
    for (
      let j = i + 1;
      end < finish && j < merged.length && merged[j].start <= end;
      j++
    ) {
      end = Math.max(end, merged[j].end);
      if (merged[j].status === "unknown" || status === "unknown")
        status = "unknown";
      else if (merged[j].status === "regular") status = "regular";
    }
    if (finish <= Math.min(deadline, end))
      return {
        start,
        status,
        waitMinutes: Math.ceil((start - arrival) / 60000),
      };
  }
  return null;
}
