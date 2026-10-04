import type { BringAdvice, WeatherContext } from "@/types/trip";
import { Icon, type IconName } from "./Icon";
import { formatTime } from "./StopCard";

function iconFor(condition: WeatherContext["condition"]): IconName {
  if (condition === "rain") return "rain";
  if (condition === "snow") return "snow";
  if (condition === "clear") return "sun";
  return "cloud";
}

function labelFor(condition: WeatherContext["condition"]) {
  return condition[0].toUpperCase() + condition.slice(1);
}

function accessoryLabel(accessory: BringAdvice["accessories"][number]) {
  const labels: Record<BringAdvice["accessories"][number], string> = {
    umbrella: "Umbrella",
    rain_jacket: "Rain jacket",
    gloves_optional: "Optional gloves",
    gloves: "Gloves",
    hat: "Hat",
    waterproof_shoes: "Waterproof shoes",
  };
  return labels[accessory];
}

function warmthLabel(warmth: BringAdvice["warmth"]) {
  const labels: Record<BringAdvice["warmth"], string> = {
    hot: "Dress light",
    warm: "T-shirt",
    mild: "Light layer",
    hoodie: "Hoodie",
    jacket: "Jacket",
    winter_jacket: "Warm jacket",
    freezing: "Warm jacket",
  };
  return labels[warmth];
}

function bringTitle(advice: BringAdvice) {
  return [warmthLabel(advice.warmth), ...advice.accessories.map(accessoryLabel)]
    .filter((item, index, items) => items.indexOf(item) === index)
    .join(" + ");
}

export function WeatherCard({
  weather,
  advice,
}: {
  weather?: WeatherContext[];
  advice?: BringAdvice;
}) {
  if (!weather?.length) return null;
  const sample = weather.filter((_, index) =>
    weather.length <= 3 ? true : index % Math.ceil(weather.length / 3) === 0,
  );
  const items = sample.slice(0, 3);
  const highestRain = Math.max(
    ...weather.map((item) => item.precipitationProbability),
  );
  return (
    <section className="weather-card card" aria-label="Weather forecast">
      <div className="weather-heading">
        <Icon name="cloud" size={20} />
        <div>
          <p className="eyebrow">WEATHER CHECK</p>
          <h3>
            {advice
              ? bringTitle(advice)
              : `${Math.round(highestRain)}% peak rain risk`}
          </h3>
        </div>
      </div>
      {advice && (
        <>
          <p className="weather-advice">{advice.message}</p>
          {advice.accessories.length > 0 && (
            <div className="weather-accessories" aria-label="Suggested items">
              {advice.accessories.map((accessory) => (
                <span key={accessory}>{accessoryLabel(accessory)}</span>
              ))}
            </div>
          )}
        </>
      )}
      <div className="weather-hours">
        {items.map((item) => (
          <div key={item.forecastTime}>
            <Icon name={iconFor(item.condition)} size={18} />
            <span>{formatTime(item.forecastTime)}</span>
            <strong>{Math.round(item.temperatureCelsius)}°C</strong>
            <small>{labelFor(item.condition)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
