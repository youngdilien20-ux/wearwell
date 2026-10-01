import assert from "node:assert/strict";
import test from "node:test";
import { getDefaultWeatherQuery } from "./weatherQuery.mjs";

const fixedDate = new Date("2026-09-30T08:00:00.000Z");

test("uses the stated planned time window for the weather request", () => {
  assert.deepEqual(
    getDefaultWeatherQuery({ city: "Lusaka" }, fixedDate, "18:00–20:30"),
    {
      city: "Lusaka",
      start: "2026-09-30T18:00:00+02:00",
      end: "2026-09-30T20:30:00+02:00",
      timezone: "Africa/Lusaka",
    },
  );
});

test("keeps the daytime fallback when no valid planned window is stated", () => {
  const query = getDefaultWeatherQuery({ latitude: -15.4167, longitude: 28.2833 }, fixedDate, "after work");
  assert.equal(query.start, "2026-09-30T09:00:00+02:00");
  assert.equal(query.end, "2026-09-30T17:30:00+02:00");
});