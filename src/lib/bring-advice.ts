import "server-only";
import type { BringAdvice, WeatherContext } from "@/types/trip";

type Warmth = BringAdvice["warmth"];
type Precipitation = BringAdvice["precipitation"];
type Accessory = BringAdvice["accessories"][number];

function classifyWarmth(minTemperature: number): Warmth {
  if (minTemperature >= 26) return "hot";
  if (minTemperature >= 20) return "warm";
  if (minTemperature >= 15) return "mild";
  if (minTemperature >= 10) return "hoodie";
  if (minTemperature >= 5) return "jacket";
  if (minTemperature >= 0) return "winter_jacket";
  return "freezing";
}

function classifyPrecipitation(
  maxPrecipitation: number,
  hasRain: boolean,
  hasSnow: boolean,
): Precipitation {
  if (hasSnow) return "snow_gear";
  if (hasRain || maxPrecipitation >= 70) return "rain_gear";
  if (maxPrecipitation >= 50) return "bring_umbrella";
  if (maxPrecipitation >= 25) return "maybe_umbrella";
  return "none";
}

function accessoriesFor(
  minTemperature: number,
  precipitation: Precipitation,
): Accessory[] {
  const accessories: Accessory[] = [];
  if (precipitation === "snow_gear") accessories.push("waterproof_shoes");
  if (precipitation === "rain_gear")
    accessories.push("umbrella", "rain_jacket");
  if (precipitation === "bring_umbrella" || precipitation === "maybe_umbrella")
    accessories.push("umbrella");

  if (minTemperature < 0) accessories.push("gloves", "hat");
  else if (minTemperature <= 2) accessories.push("gloves");
  else if (minTemperature <= 6) accessories.push("gloves_optional");

  return accessories;
}

function warmthMessage(warmth: Warmth) {
  const messages: Record<Warmth, string> = {
    hot: "Dress light. Bring water if you’ll be out for a while.",
    warm: "T-shirt weather. A light layer is optional.",
    mild: "Comfortable weather, but a light layer is a good call.",
    hoodie: "Hoodie weather. Bring one for the cooler parts of the trip.",
    jacket: "Bring a jacket. It gets chilly during this window.",
    winter_jacket: "Wear a warm jacket. It is cold enough to feel it.",
    freezing: "Bundle up. Warm jacket mode is very much activated.",
  };
  return messages[warmth];
}

function precipitationMessage(precipitation: Precipitation) {
  const messages: Record<Precipitation, string> = {
    none: "",
    maybe_umbrella: "Pack a small umbrella just in case.",
    bring_umbrella: "Bring an umbrella.",
    rain_gear: "Bring an umbrella or rain jacket.",
    snow_gear: "Snow is possible. Waterproof shoes are the move.",
  };
  return messages[precipitation];
}

function accessoryMessage(accessories: Accessory[]) {
  if (accessories.includes("hat") && accessories.includes("gloves"))
    return "Gloves and a hat are worth it.";
  if (accessories.includes("gloves")) return "Bring gloves.";
  if (accessories.includes("gloves_optional"))
    return "Gloves could be nice if your hands get cold.";
  return "";
}

export function classifyBringAdvice(
  weather: WeatherContext[],
): BringAdvice | null {
  if (!weather.length) return null;

  const minTemperatureCelsius = Math.min(
    ...weather.map((item) => item.temperatureCelsius),
  );
  const maxPrecipitationProbability = Math.max(
    ...weather.map((item) => item.precipitationProbability),
  );
  const hasRain = weather.some((item) => item.condition === "rain");
  const hasSnow = weather.some((item) => item.condition === "snow");
  const warmth = classifyWarmth(minTemperatureCelsius);
  const precipitation = classifyPrecipitation(
    maxPrecipitationProbability,
    hasRain,
    hasSnow,
  );
  const accessories = accessoriesFor(minTemperatureCelsius, precipitation);
  const message = [
    warmthMessage(warmth),
    precipitationMessage(precipitation),
    accessoryMessage(accessories),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    warmth,
    precipitation,
    accessories,
    message,
    facts: {
      minTemperatureCelsius,
      maxPrecipitationProbability,
      hasRain,
      hasSnow,
    },
  };
}
