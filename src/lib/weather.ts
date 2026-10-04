import "server-only";
import { z } from "zod";
import type { Location, WeatherContext } from "@/types/trip";
import { AppError } from "./server/http";

export interface WeatherProvider {
  forecast(
    location: Location,
    startTime: string,
    endTime: string,
  ): Promise<WeatherContext[]>;
}

const openMeteoResponseSchema = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number().nullable()),
    precipitation_probability: z.array(z.number().nullable()).optional(),
    weather_code: z.array(z.number().nullable()).optional(),
  }),
});

function utcDate(time: string) {
  return new Date(time).toISOString().slice(0, 10);
}

function toIsoHour(time: string) {
  return new Date(`${time.endsWith("Z") ? time : `${time}Z`}`).toISOString();
}

export function weatherMode(): "off" | "live" {
  const mode = process.env.WEATHER_DATA_MODE?.trim();
  if (!mode) return "off";
  if (mode === "off" || mode === "live") return mode;
  throw new AppError(
    "CONFIGURATION",
    "WEATHER_DATA_MODE must be off or live.",
    503,
  );
}

function conditionFromCode(code: number): WeatherContext["condition"] {
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if (
    [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(
      code,
    )
  )
    return "rain";
  if ([1, 2, 3, 45, 48].includes(code)) return "cloudy";
  return "clear";
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  async forecast(
    location: Location,
    startTime: string,
    endTime: string,
  ): Promise<WeatherContext[]> {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(location.lat));
    url.searchParams.set("longitude", String(location.lng));
    url.searchParams.set(
      "hourly",
      "temperature_2m,precipitation_probability,weather_code",
    );
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("start_date", utcDate(startTime));
    url.searchParams.set("end_date", utcDate(endTime));

    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new AppError(
        "WEATHER_PROVIDER_ERROR",
        "Open-Meteo could not complete the forecast request.",
        502,
      );

    const data = openMeteoResponseSchema.parse(await response.json());
    const start = Date.parse(startTime);
    const end = Date.parse(endTime);

    return data.hourly.time
      .map((time, index) => ({
        time: toIsoHour(time),
        temperature: data.hourly.temperature_2m[index],
        precipitation:
          data.hourly.precipitation_probability?.[index] ?? undefined,
        code: data.hourly.weather_code?.[index] ?? undefined,
      }))
      .filter(
        (row) =>
          Date.parse(row.time) >= start &&
          Date.parse(row.time) <= end &&
          row.temperature !== null,
      )
      .map((row) => ({
        location,
        forecastTime: row.time,
        temperatureCelsius: row.temperature!,
        precipitationProbability: Math.max(
          0,
          Math.min(100, row.precipitation ?? 0),
        ),
        condition:
          typeof row.code === "number" ? conditionFromCode(row.code) : "clear",
      }));
  }
}

export const openMeteoWeather = new OpenMeteoWeatherProvider();

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
