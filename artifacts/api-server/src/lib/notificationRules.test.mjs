import assert from "node:assert/strict";
import test from "node:test";
import { significantWeatherChange } from "./notificationRules.mjs";

test("rain alerts only when live probability becomes likely with a material increase", () => {
  assert.deepEqual(
    significantWeatherChange(
      { rainProbability: 20, tempC: 22 },
      { rainProbability: 55, tempC: 22 },
    ),
    { kind: "rain", before: 20, after: 55 },
  );
  assert.equal(
    significantWeatherChange(
      { rainProbability: 45, tempC: 22 },
      { rainProbability: 55, tempC: 22 },
    ),
    null,
  );
  assert.equal(
    significantWeatherChange(
      { rainProbability: 10, tempC: 22 },
      { rainProbability: 40, tempC: 22 },
    ),
    null,
  );
});

test("temperature alerts require at least a five degree Celsius change", () => {
  assert.deepEqual(
    significantWeatherChange(
      { rainProbability: 10, tempC: 23 },
      { rainProbability: 10, tempC: 17 },
    ),
    { kind: "temperature", before: 23, after: 17 },
  );
  assert.equal(
    significantWeatherChange(
      { rainProbability: 10, tempC: 23 },
      { rainProbability: 10, tempC: 19 },
    ),
    null,
  );
});

test("missing weather values never produce an alert", () => {
  assert.equal(significantWeatherChange({}, { rainProbability: 80 }), null);
  assert.equal(
    significantWeatherChange(
      { rainProbability: 10, tempC: 20 },
      { rainProbability: null, tempC: null },
    ),
    null,
  );
});