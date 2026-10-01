export const WEATHER_TIMEZONE = "Africa/Lusaka";

function datePart(parts, type) {
  return parts.find((part) => part.type === type)?.value || "";
}

function parseClock(value) {
  const match = /^\s*(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?\s*$/i.exec(value || "");
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const period = match[3]?.toLowerCase();
  if (period) {
    if (hour < 1 || hour > 12) return null;
    if (period === "am" && hour === 12) hour = 0;
    if (period === "pm" && hour !== 12) hour += 12;
  }
  if (hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function plannedHours(timeWindow) {
  if (typeof timeWindow !== "string") return null;
  const parts = timeWindow.split(/\s*(?:–|—|-|to)\s*/i);
  if (parts.length !== 2) return null;
  const start = parseClock(parts[0]);
  const end = parseClock(parts[1]);
  return start && end ? { start, end } : null;
}

export function getDefaultWeatherQuery(location, now = new Date(), timeWindow = "") {
  const city = typeof location?.city === "string" ? location.city.trim() : "";
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
  if (!city && !hasCoordinates) throw new Error("A weather location is required.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WEATHER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const date = ["year", "month", "day"].map((type) => datePart(parts, type)).join("-");
  const hours = plannedHours(timeWindow) || { start: "09:00:00", end: "17:30:00" };

  return {
    ...(city ? { city } : { latitude, longitude }),
    start: date + "T" + hours.start + "+02:00",
    end: date + "T" + hours.end + "+02:00",
    timezone: WEATHER_TIMEZONE,
  };
}