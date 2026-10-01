import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(field + " is required");
  }
  return value.trim();
}

function toLocalHourKey(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day + "T" + values.hour + ":00";
}

function average(values) {
  const usable = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : undefined;
}

function maximum(values) {
  const usable = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  return usable.length ? Math.max(...usable) : undefined;
}

function sum(values) {
  const usable = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  return usable.length ? usable.reduce((total, value) => total + value, 0) : undefined;
}

async function readJson(response, label) {
  if (!response.ok) throw new Error(label + " returned " + response.status);
  return response.json();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Only POST is supported." }, 405);

  try {
    const input = await request.json();
    const city = typeof input.city === "string" ? input.city.trim() : "";
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
    if (!city && !hasCoordinates) throw new Error("city or coordinates are required");
    if ((Number.isFinite(latitude) && !Number.isFinite(longitude)) || (!Number.isFinite(latitude) && Number.isFinite(longitude))) {
      return json({ error: "latitude and longitude must be supplied together." }, 400);
    }
    const timeZone = requiredString(input.timezone, "timezone");
    const plannedStart = new Date(requiredString(input.start, "start"));
    const plannedEnd = new Date(requiredString(input.end, "end"));
    if (Number.isNaN(plannedStart.valueOf()) || Number.isNaN(plannedEnd.valueOf()) || plannedEnd < plannedStart) {
      return json({ error: "start and end must be valid, ordered timestamps." }, 400);
    }

    let place;
    if (hasCoordinates) {
      place = { latitude, longitude, name: city || "Your location", country: "" };
    } else {
      const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
      geocodeUrl.search = new URLSearchParams({ name: city, count: "1", language: "en", format: "json" }).toString();
      const geocoded = await readJson(await fetch(geocodeUrl), "Geocoding service");
      place = geocoded.results?.[0];
      if (!place || typeof place.latitude !== "number" || typeof place.longitude !== "number") {
        return json({ error: "That location could not be found." }, 404);
      }
    }

    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.search = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      hourly: "temperature_2m,apparent_temperature,precipitation_probability,rain,wind_speed_10m,uv_index,relative_humidity_2m",
      forecast_days: "7",
      timezone: timeZone,
    }).toString();
    const forecast = await readJson(await fetch(forecastUrl), "Forecast service");
    const times = Array.isArray(forecast.hourly?.time) ? forecast.hourly.time : [];
    const startKey = toLocalHourKey(plannedStart, timeZone);
    const endKey = toLocalHourKey(plannedEnd, timeZone);
    const selectedIndexes = times
      .map((time, index) => ({ time, index }))
      .filter(({ time }) => time >= startKey && time <= endKey)
      .map(({ index }) => index);
    const indexes = selectedIndexes.length ? selectedIndexes : [0];
    const values = (name) => indexes.map((index) => forecast.hourly?.[name]?.[index]);

    return json({
      observedAt: new Date().toISOString(),
      timezone: timeZone,
      locationLabel: [place.name, place.country].filter(Boolean).join(", "),
      tempC: average(values("temperature_2m")),
      feelsLikeC: average(values("apparent_temperature")),
      rainProbability: maximum(values("precipitation_probability")),
      windKph: maximum(values("wind_speed_10m")),
      uvIndex: maximum(values("uv_index")),
      humidity: average(values("relative_humidity_2m")),
      precipitationMm: sum(values("rain")),
      source: "Open-Meteo forecast",
      uncertainty: "Forecast for the planned time window; conditions can change.",
      plannedStart: plannedStart.toISOString(),
      plannedEnd: plannedEnd.toISOString(),
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Weather is temporarily unavailable." }, 502);
  }
});
