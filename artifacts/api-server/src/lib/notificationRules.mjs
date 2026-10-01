export const RAIN_LIKELY_THRESHOLD = 50;
export const MIN_RAIN_PROBABILITY_CHANGE = 25;
export const MIN_TEMPERATURE_CHANGE_C = 5;

export function significantWeatherChange(baseline, forecast) {
  const beforeRain = baseline?.rainProbability;
  const afterRain = forecast?.rainProbability;
  if (
    Number.isFinite(beforeRain) &&
    Number.isFinite(afterRain) &&
    beforeRain < RAIN_LIKELY_THRESHOLD &&
    afterRain >= RAIN_LIKELY_THRESHOLD &&
    afterRain - beforeRain >= MIN_RAIN_PROBABILITY_CHANGE
  ) {
    return {
      kind: "rain",
      before: beforeRain,
      after: afterRain,
    };
  }

  const beforeTemp = baseline?.tempC;
  const afterTemp = forecast?.tempC;
  if (
    Number.isFinite(beforeTemp) &&
    Number.isFinite(afterTemp) &&
    Math.abs(afterTemp - beforeTemp) >= MIN_TEMPERATURE_CHANGE_C
  ) {
    return {
      kind: "temperature",
      before: beforeTemp,
      after: afterTemp,
    };
  }

  return null;
}