import "server-only";
import { z } from "zod";
import type { Location, WeatherContext } from "@/types/trip";
import { requireEnv } from "./server/env";
import { AppError } from "./server/http";

export interface WeatherProvider {
  forecast(
    location: Location,
    startTime: string,
    endTime: string,
  ): Promise<WeatherContext[]>;
}

const HOUR = 3600000;
// Google's hourly forecast starts at the current hour and covers 240 hours.
const MAX_HOURS = 240;

const googleForecastSchema = z.object({
  forecastHours: z
    .array(
      z.object({
        interval: z.object({ startTime: z.string() }),
        temperature: z.object({ degrees: z.number() }).optional(),
        precipitation: z
          .object({
            probability: z.object({ percent: z.number() }).partial(),
          })
          .partial()
          .optional(),
        weatherCondition: z.object({ type: z.string() }).partial().optional(),
      }),
    )
    .default([]),
  nextPageToken: z.string().optional(),
});

export function weatherMode(): "off" | "live" {
  const mode = process.env.WEATHER_DATA_MODE?.trim();
  // Google Weather uses the Maps server key, so forecasts follow that key by default.
  if (!mode)
    return process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() ? "live" : "off";
  if (mode === "off" || mode === "live") return mode;
  throw new AppError(
    "CONFIGURATION",
    "WEATHER_DATA_MODE must be off or live.",
    503,
  );
}

// Snow before rain: types such as SNOW_SHOWERS and RAIN_AND_SNOW contain both.
export function conditionFromType(type = ""): WeatherContext["condition"] {
  if (type.includes("SNOW")) return "snow";
  if (/RAIN|SHOWER|THUNDER|HAIL/.test(type)) return "rain";
  if (/CLOUDY|WINDY/.test(type)) return "cloudy";
  return "clear";
}

export class GoogleWeatherProvider implements WeatherProvider {
  async forecast(
    location: Location,
    startTime: string,
    endTime: string,
  ): Promise<WeatherContext[]> {
    const start = Date.parse(startTime),
      end = Date.parse(endTime),
      now = Date.now();
    // Nothing to fetch for past trips or trips beyond the forecast horizon.
    if (end < now || start > now + MAX_HOURS * HOUR) return [];
    const hours = Math.min(MAX_HOURS, Math.ceil((end - now) / HOUR) + 1);
    const key = requireEnv("GOOGLE_MAPS_SERVER_API_KEY");
    const rows: z.infer<typeof googleForecastSchema>["forecastHours"] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(
        "https://weather.googleapis.com/v1/forecast/hours:lookup",
      );
      // This API rejects the X-Goog-Api-Key header; it needs the key parameter.
      url.searchParams.set("key", key);
      url.searchParams.set("location.latitude", String(location.lat));
      url.searchParams.set("location.longitude", String(location.lng));
      url.searchParams.set("hours", String(hours));
      url.searchParams.set("pageSize", "24");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok)
        throw new AppError(
          "WEATHER_PROVIDER_ERROR",
          "Google Weather could not complete the forecast request.",
          502,
        );
      const page = googleForecastSchema.parse(await response.json());
      rows.push(...page.forecastHours);
      const last = page.forecastHours.at(-1);
      // Stop paging once the forecast reaches the end of the trip.
      pageToken =
        last && Date.parse(last.interval.startTime) > end
          ? undefined
          : page.nextPageToken;
    } while (pageToken);

    return rows
      .filter((row) => {
        const hour = Date.parse(row.interval.startTime);
        // Keep each hour that overlaps the trip window.
        return hour + HOUR > start && hour <= end && row.temperature;
      })
      .map((row) => ({
        location,
        forecastTime: new Date(row.interval.startTime).toISOString(),
        temperatureCelsius: row.temperature!.degrees,
        precipitationProbability: Math.max(
          0,
          Math.min(100, row.precipitation?.probability?.percent ?? 0),
        ),
        condition: conditionFromType(row.weatherCondition?.type),
      }));
  }
}

export const googleWeather = new GoogleWeatherProvider();

export function summarizeWeather(weather: WeatherContext[]) {
  if (!weather.length) return [];
  const warnings: string[] = [];
  const maxPrecipitation = Math.max(
    ...weather.map((item) => item.precipitationProbability),
  );
  if (weather.some((item) => item.condition === "snow"))
    warnings.push(
      "Forecast near the destination includes snow during this trip.",
    );
  else if (
    weather.some((item) => item.condition === "rain") ||
    maxPrecipitation >= 50
  )
    warnings.push(
      `Forecast near the destination shows rain risk up to ${Math.round(maxPrecipitation)}%.`,
    );
  return warnings;
}
