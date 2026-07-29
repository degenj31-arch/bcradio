// Weather data via Open-Meteo (free, no API key, high-resolution models).
// Docs: https://open-meteo.com/en/docs

export type GeoPlace = {
  id: number;
  name: string;
  admin1?: string;
  admin2?: string;
  country?: string;
  country_code?: string;
  postcodes?: string[];
  latitude: number;
  longitude: number;
  timezone?: string;
};

export const DEFAULT_PLACE: GeoPlace = {
  id: 4949127,
  name: "Shrewsbury",
  admin1: "Massachusetts",
  admin2: "Worcester County",
  country: "United States",
  country_code: "US",
  postcodes: ["01545"],
  latitude: 42.29565,
  longitude: -71.71282,
  timezone: "America/New_York",
};

export function placeLabel(p: GeoPlace): string {
  return [p.name, p.admin1, p.country].filter(Boolean).join(", ");
}

export async function searchPlaces(query: string): Promise<GeoPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    q,
  )}&count=8&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Location lookup failed");
  const json = (await res.json()) as { results?: GeoPlace[] };
  return json.results ?? [];
}

export type WeatherData = {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    dew_point_2m: number;
    precipitation: number;
    rain: number;
    showers: number;
    snowfall: number;
    weather_code: number;
    cloud_cover: number;
    pressure_msl: number;
    surface_pressure: number;
    visibility: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    is_day: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    precipitation_probability: number[];
    precipitation: number[];
    snowfall: number[];
    weather_code: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
    relative_humidity_2m: number[];
    uv_index: number[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    apparent_temperature_max: number[];
    apparent_temperature_min: number[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: number[];
    precipitation_sum: number[];
    rain_sum: number[];
    snowfall_sum: number[];
    precipitation_hours: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
    wind_gusts_10m_max: number[];
  };
  timezone: string;
};

const CURRENT_VARS = [
  "temperature_2m","apparent_temperature","relative_humidity_2m","dew_point_2m","precipitation",
  "rain","showers","snowfall","weather_code","cloud_cover","pressure_msl","surface_pressure",
  "visibility","wind_speed_10m","wind_direction_10m","wind_gusts_10m","is_day",
].join(",");

const HOURLY_VARS = [
  "temperature_2m","apparent_temperature","precipitation_probability","precipitation","snowfall",
  "weather_code","wind_speed_10m","wind_gusts_10m","relative_humidity_2m","uv_index",
].join(",");

const DAILY_VARS = [
  "weather_code","temperature_2m_max","temperature_2m_min","apparent_temperature_max",
  "apparent_temperature_min","sunrise","sunset","uv_index_max","precipitation_sum","rain_sum",
  "snowfall_sum","precipitation_hours","precipitation_probability_max","wind_speed_10m_max",
  "wind_gusts_10m_max",
].join(",");

export async function fetchWeather(place: GeoPlace): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
    `&current=${CURRENT_VARS}&hourly=${HOURLY_VARS}&daily=${DAILY_VARS}` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch` +
    `&timezone=auto&forecast_days=7&models=best_match&cell_selection=nearest`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather service unavailable");
  return (await res.json()) as WeatherData;
}

// WMO weather interpretation codes.
const WMO: Record<number, { label: string; icon: string }> = {
  0: { label: "Clear sky", icon: "☀️" },
  1: { label: "Mainly clear", icon: "🌤️" },
  2: { label: "Partly cloudy", icon: "⛅" },
  3: { label: "Overcast", icon: "☁️" },
  45: { label: "Fog", icon: "🌫️" },
  48: { label: "Freezing fog", icon: "🌫️" },
  51: { label: "Light drizzle", icon: "🌦️" },
  53: { label: "Drizzle", icon: "🌦️" },
  55: { label: "Heavy drizzle", icon: "🌦️" },
  56: { label: "Freezing drizzle", icon: "🌧️" },
  57: { label: "Freezing drizzle", icon: "🌧️" },
  61: { label: "Light rain", icon: "🌧️" },
  63: { label: "Rain", icon: "🌧️" },
  65: { label: "Heavy rain", icon: "🌧️" },
  66: { label: "Freezing rain", icon: "🧊" },
  67: { label: "Freezing rain", icon: "🧊" },
  71: { label: "Light snow", icon: "🌨️" },
  73: { label: "Snow", icon: "🌨️" },
  75: { label: "Heavy snow", icon: "❄️" },
  77: { label: "Snow grains", icon: "🌨️" },
  80: { label: "Rain showers", icon: "🌦️" },
  81: { label: "Rain showers", icon: "🌧️" },
  82: { label: "Violent rain showers", icon: "⛈️" },
  85: { label: "Snow showers", icon: "🌨️" },
  86: { label: "Heavy snow showers", icon: "❄️" },
  95: { label: "Thunderstorm", icon: "⛈️" },
  96: { label: "Thunderstorm with hail", icon: "⛈️" },
  99: { label: "Severe thunderstorm with hail", icon: "⛈️" },
};

export function describeCode(code: number): { label: string; icon: string } {
  return WMO[code] ?? { label: "Unknown", icon: "🌡️" };
}

export function windDirection(deg: number): string {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

export function uvLabel(uv: number): string {
  if (uv < 3) return "Low";
  if (uv < 6) return "Moderate";
  if (uv < 8) return "High";
  if (uv < 11) return "Very high";
  return "Extreme";
}

// Nearest hourly index at/after "now" in the location's local time.
export function hourlyStartIndex(data: WeatherData): number {
  const nowIso = new Date().toISOString();
  void nowIso;
  const nowLocal = new Date(
    new Date().toLocaleString("en-US", { timeZone: data.timezone }),
  ).getTime();
  let idx = 0;
  for (let i = 0; i < data.hourly.time.length; i++) {
    const t = new Date(data.hourly.time[i]).getTime();
    if (t >= nowLocal - 30 * 60 * 1000) { idx = i; break; }
  }
  return idx;
}

// Next expected precipitation event within the forecast horizon.
export function nextPrecip(
  data: WeatherData,
  startIdx: number,
): { time: string; kind: "snow" | "rain" | "storm"; probability: number } | null {
  const h = data.hourly;
  for (let i = startIdx; i < h.time.length; i++) {
    const code = h.weather_code[i];
    const prob = h.precipitation_probability?.[i] ?? 0;
    const snow = h.snowfall?.[i] ?? 0;
    const precip = h.precipitation?.[i] ?? 0;
    const isStorm = code >= 95;
    const isSnow = snow > 0 || (code >= 71 && code <= 77) || code === 85 || code === 86;
    const isRain = precip > 0 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
    if (isStorm || isSnow || isRain) {
      if (prob < 20 && precip === 0 && snow === 0) continue;
      return { time: h.time[i], kind: isStorm ? "storm" : isSnow ? "snow" : "rain", probability: prob };
    }
  }
  return null;
}

export function formatHour(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const period = h >= 12 ? "PM" : "AM";
  h = ((h + 11) % 12) + 1;
  return `${h} ${period}`;
}

export function formatDay(iso: string, index: number): string {
  if (index === 0) return "Today";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const period = h >= 12 ? "PM" : "AM";
  h = ((h + 11) % 12) + 1;
  return `${h}:${m} ${period}`;
}
