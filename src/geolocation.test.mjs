import assert from "node:assert/strict";
import test from "node:test";
import { getBrowserLocation, normalizeBrowserLocation } from "./geolocation.mjs";

test("rounds browser coordinates to approximate weather precision", () => {
  assert.deepEqual(
    normalizeBrowserLocation({ latitude: -15.4167, longitude: 28.2833 }),
    { latitude: -15.42, longitude: 28.28 },
  );
});

test("rejects invalid browser coordinates", () => {
  assert.throws(
    () => normalizeBrowserLocation({ latitude: 91, longitude: 28 }),
    /invalid location coordinates/i,
  );
});

test("requests a low-accuracy location with bounded timeout and accepts the result", async () => {
  let receivedOptions;
  const location = await getBrowserLocation({
    getCurrentPosition(success, _failure, options) {
      receivedOptions = options;
      success({ coords: { latitude: -15.4167, longitude: 28.2833 } });
    },
  });

  assert.deepEqual(location, { latitude: -15.42, longitude: 28.28 });
  assert.deepEqual(receivedOptions, {
    enableHighAccuracy: false,
    maximumAge: 300_000,
    timeout: 10_000,
  });
});

test("rejects when browser geolocation is unavailable", async () => {
  await assert.rejects(getBrowserLocation(null), {
    message: "Location is not available in this browser.",
    code: "UNSUPPORTED",
  });
});