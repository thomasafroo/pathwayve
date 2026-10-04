import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/bring-advice/route";
import { classifyBringAdvice } from "@/lib/bring-advice";
import type { WeatherContext } from "@/types/trip";

function weather(
  temperatureCelsius: number,
  precipitationProbability = 0,
  condition: WeatherContext["condition"] = "clear",
): WeatherContext {
  return {
    location: { lat: 49.2827, lng: -123.1207 },
    forecastTime: "2030-10-03T19:00:00.000Z",
    temperatureCelsius,
    precipitationProbability,
    condition,
  };
}

describe("bring advice classifier", () => {
  it.each([
    [26, "hot"],
    [20, "warm"],
    [15, "mild"],
    [10, "hoodie"],
    [5, "jacket"],
    [0, "winter_jacket"],
    [-1, "freezing"],
  ] as const)("classifies %dC as %s", (temperature, warmth) => {
    expect(classifyBringAdvice([weather(temperature)])?.warmth).toBe(warmth);
  });

  it.each([
    [24, "clear", "none"],
    [25, "clear", "maybe_umbrella"],
    [50, "clear", "bring_umbrella"],
    [70, "clear", "rain_gear"],
    [10, "rain", "rain_gear"],
    [10, "snow", "snow_gear"],
  ] as const)(
    "classifies %d%% and %s as %s",
    (precipitation, condition, advice) => {
      expect(
        classifyBringAdvice([
          weather(12, precipitation, condition as WeatherContext["condition"]),
        ])?.precipitation,
      ).toBe(advice);
    },
  );

  it.each([
    [6, "clear", ["gloves_optional"]],
    [2, "clear", ["gloves"]],
    [-1, "clear", ["gloves", "hat"]],
    [2, "snow", ["waterproof_shoes", "gloves"]],
  ] as const)(
    "classifies accessories for %dC and %s",
    (temperature, condition, accessories) => {
      expect(
        classifyBringAdvice([
          weather(temperature, 10, condition as WeatherContext["condition"]),
        ])?.accessories,
      ).toEqual(accessories);
    },
  );

  it("uses the coldest hour and wettest hour across the trip", () => {
    const advice = classifyBringAdvice([
      weather(18, 10),
      weather(4, 80),
      weather(9, 20),
    ]);
    expect(advice).toMatchObject({
      warmth: "winter_jacket",
      precipitation: "rain_gear",
      accessories: ["umbrella", "rain_jacket", "gloves_optional"],
      facts: {
        minTemperatureCelsius: 4,
        maxPrecipitationProbability: 80,
      },
    });
  });

  it("returns null rather than guessing without weather", () => {
    expect(classifyBringAdvice([])).toBeNull();
  });
});

describe("bring advice API", () => {
  it("returns advice for valid weather", async () => {
    const response = await POST(
      new Request("http://localhost/api/bring-advice", {
        method: "POST",
        body: JSON.stringify({
          weather: [weather(11, 55)],
        }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      advice: {
        warmth: "hoodie",
        precipitation: "bring_umbrella",
        accessories: ["umbrella"],
      },
    });
  });

  it("returns null advice for empty weather", async () => {
    const response = await POST(
      new Request("http://localhost/api/bring-advice", {
        method: "POST",
        body: JSON.stringify({ weather: [] }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ advice: null });
  });
});
