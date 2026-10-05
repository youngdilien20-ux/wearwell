import assert from "node:assert/strict";
import test from "node:test";
import { transcriptFromRecognitionResults } from "./speechRecognition.mjs";

test("combines final and interim speech results for a live preview", () => {
  const results = [
    Object.assign([{ transcript: "A light jacket" }], { isFinal: true }),
    Object.assign([{ transcript: "for a cool evening" }], { isFinal: false }),
  ];

  assert.equal(
    transcriptFromRecognitionResults(results),
    "A light jacket for a cool evening",
  );
});

test("returns an empty transcript when speech recognition has no results", () => {
  assert.equal(transcriptFromRecognitionResults(undefined), "");
});