import { expect, it } from "vitest";
import { visitWindow } from "@/lib/opening-hours";
import { openingHoursSchema } from "@/types/opening-hours";
import { navigationUrl } from "@/lib/navigation";
const stamp = (time: string) => Date.parse(`2030-10-04T${time}:00-07:00`); // Friday
const place = (periods: unknown[]) => ({
  openingHours: openingHoursSchema.parse({
    timeZone: "America/Vancouver",
    checkedAt: "2030-09-01T00:00:00Z",
    regular: { periods },
  }),
});
const daytime = place([
  { open: { day: 5, hour: 10 }, close: { day: 5, hour: 17 } },
]);
it("waits for opening and requires the entire duration before closing", () => {
  expect(visitWindow(daytime, stamp("09:00"), 30, stamp("23:00"))).toEqual({
    start: stamp("10:00"),
    status: "regular",
    waitMinutes: 60,
  });
  expect(visitWindow(daytime, stamp("16:30"), 30, stamp("23:00"))?.start).toBe(
    stamp("16:30"),
  );
  expect(visitWindow(daytime, stamp("16:31"), 30, stamp("23:00"))).toBeNull();
  expect(
    visitWindow(daytime, stamp("09:00"), 30, stamp("23:00"), true),
  ).toBeNull();
});
it("handles overnight hours and 24-hour businesses", () => {
  const night = place([
    { open: { day: 4, hour: 22 }, close: { day: 5, hour: 3 } },
  ]);
  expect(visitWindow(night, stamp("01:00"), 60, stamp("06:00"))?.start).toBe(
    stamp("01:00"),
  );
  const always = place([{ open: { day: 0, hour: 0, minute: 0 } }]);
  expect(
    visitWindow(always, stamp("23:00"), 180, stamp("23:00") + 6 * 3600000)
      ?.start,
  ).toBe(stamp("23:00"));
});
it("date-specific closures override regular hours but not dates outside their coverage", () => {
  const closed = {
    openingHours: {
      ...daytime.openingHours,
      checkedAt: "2030-10-04T12:00:00-07:00",
      current: { periods: [] },
    },
  };
  expect(visitWindow(closed, stamp("12:00"), 30, stamp("23:00"))).toBeNull();
  const nextWeek = stamp("12:00") + 7 * 86400000;
  expect(visitWindow(closed, nextWeek, 30, nextWeek + 3600000)?.status).toBe(
    "regular",
  );
});
it("uses the venue timezone across daylight saving changes", () => {
  const sunday = place([
    { open: { day: 0, hour: 9 }, close: { day: 0, hour: 17 } },
  ]);
  const arrival = Date.parse("2030-11-03T16:00:00Z"); // 8am PST after fallback
  expect(visitWindow(sunday, arrival, 30, arrival + 6 * 3600000)?.start).toBe(
    Date.parse("2030-11-03T17:00:00Z"),
  );
});
it("keeps unknown hours distinct from a reported closure", () => {
  expect(visitWindow({}, stamp("12:00"), 30, stamp("23:00"))?.status).toBe(
    "unknown",
  );
  expect(
    visitWindow(
      {
        openingHours: {
          checkedAt: new Date().toISOString(),
          businessStatus: "CLOSED_PERMANENTLY",
        },
      },
      stamp("12:00"),
      30,
      stamp("23:00"),
    ),
  ).toBeNull();
});
it.each(["driving", "walking", "transit"] as const)(
  "hands off %s directions using device location and the next stop",
  (mode) => {
    const url = new URL(
      navigationUrl(
        {
          name: "Cafe",
          placeId: "ChIJ-example",
          location: { lat: 49, lng: -123 },
        },
        mode,
      ),
    );
    expect(url.searchParams.get("origin")).toBeNull();
    expect(url.searchParams.get("destination_place_id")).toBe("ChIJ-example");
    expect(url.searchParams.get("travelmode")).toBe(mode);
    expect(url.searchParams.get("dir_action")).toBe("navigate");
  },
);
