/** End of the calendar day in the trip's IANA timezone, including DST. */
export function endOfDay(reference: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(reference);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  const target = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    23,
    59,
    59,
    999,
  );
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const part = (type: string) =>
      Number(local.find((p) => p.type === type)!.value);
    const represented = Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
      part("second"),
      999,
    );
    instant += target - represented;
  }
  return new Date(instant).toISOString();
}
