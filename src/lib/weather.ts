import type { Location } from "@/types/trip";
/** Contract for the data owner's next milestone. No forecast is fabricated. */
export interface WeatherContext {
  location: Location;
  forecastTime: string;
  temperatureCelsius: number;
  precipitationProbability: number;
  condition: "clear" | "cloudy" | "rain" | "snow";
}
export interface WeatherProvider {
  forecast(
    location: Location,
    startTime: string,
    endTime: string,
  ): Promise<WeatherContext[]>;
}
