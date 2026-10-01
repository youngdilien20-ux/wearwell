import { supabase } from "./supabase.js";
import { getDefaultWeatherQuery, WEATHER_TIMEZONE } from "./weatherQuery.mjs";

export { getDefaultWeatherQuery, WEATHER_TIMEZONE };

export const WEATHER_PERMISSION_REQUIRED = Object.freeze({
  locationLabel: "",
  source: "Weather is off",
  uncertainty: "Allow weather and choose a place to see a forecast.",
  isFallback: false,
});

export const FALLBACK_WEATHER = Object.freeze({
  locationLabel: "Lusaka",
  tempC: 26,
  rainProbability: 18,
  windKph: 8,
  uvIndex: 5,
  conditionLabel: "sample conditions",
  source: "Deterministic fallback",
  uncertainty: "Live weather is unavailable; these are sample conditions.",
  isFallback: true,
});

export async function getWeatherContext(query) {
  if (!supabase) return FALLBACK_WEATHER;

  const { data, error } = await supabase.functions.invoke("get-weather-context", {
    body: query,
  });
  if (error) throw error;
  return { ...data, isFallback: false };
}
