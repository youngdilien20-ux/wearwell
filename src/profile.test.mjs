import assert from "node:assert/strict";
import test from "node:test";
import { profileDetailsForAssistant } from "./profile.mjs";

test("assistant profile context omits country and region while retaining city", () => {
  assert.deepEqual(
    profileDetailsForAssistant({
      country: "Zambia",
      region: "Copperbelt",
      city: "Kitwe",
    }),
    { city: "Kitwe" },
  );
});