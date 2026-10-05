import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeWardrobeImage,
  normalizeWardrobeVisualAttributes,
  normalizeWardrobeVisionResult,
  runWardrobeVisionAnalysis,
} from "./wardrobe-vision.js";

const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
const jpegBase64 = btoa(String.fromCharCode(...jpegBytes));
const modelResult = {
  category: "Top",
  suggestedName: "Blue striped top",
  colorName: "Blue",
  colorHex: "#336699",
  pattern: "stripes",
  visibleDetails: "Long sleeves and a button front",
  formality: 2,
  weatherHint: "cool",
  confidence: "medium",
};

function providerResponse(result) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("accepts a supported JPEG with a matching image signature", () => {
  assert.deepEqual([...decodeWardrobeImage("image/jpeg", jpegBase64)], [...jpegBytes]);
  assert.throws(() => decodeWardrobeImage("image/png", jpegBase64), /does not match/);
  assert.throws(() => decodeWardrobeImage("image/gif", jpegBase64), /Choose a JPEG/);
});

test("returns only validated, structured visual suggestions after successful Gemini analysis", async () => {
  let called = false;
  const result = await runWardrobeVisionAnalysis({
    mimeType: "image/jpeg",
    imageBase64: jpegBase64,
    apiKey: "test-key",
    fetcher: async (_url, options) => {
      called = true;
      const body = JSON.parse(options.body);
      assert.equal(body.contents[0].parts[1].inlineData.data, jpegBase64);
      return providerResponse({ ...modelResult, rawModelText: "must not pass through" });
    },
  });
  assert.equal(called, true);
  assert.deepEqual(result, modelResult);
  assert.equal("rawModelText" in result, false);
});

test("fails explicitly when Gemini returns an error", async () => {
  await assert.rejects(
    runWardrobeVisionAnalysis({
      mimeType: "image/jpeg",
      imageBase64: jpegBase64,
      apiKey: "test-key",
      fetcher: async () => new Response("provider details", { status: 503 }),
    }),
    /provider failed/,
  );
});

test("rejects invalid image data before contacting Gemini", async () => {
  let called = false;
  await assert.rejects(
    runWardrobeVisionAnalysis({
      mimeType: "image/jpeg",
      imageBase64: "not-base64",
      apiKey: "test-key",
      fetcher: async () => {
        called = true;
        return providerResponse(modelResult);
      },
    }),
    /invalid or too large/,
  );
  assert.equal(called, false);
});

test("normalizes uncertain predictions and stores only confirmed structured visual attributes", () => {
  assert.deepEqual(
    normalizeWardrobeVisionResult({ category: "dress", pattern: "made-up", formality: 7 }),
    {
      category: "uncertain",
      suggestedName: "",
      colorName: "",
      colorHex: "",
      pattern: "uncertain",
      visibleDetails: "",
      formality: null,
      weatherHint: "unspecified",
      confidence: "low",
    },
  );
  assert.deepEqual(
    normalizeWardrobeVisualAttributes({
      pattern: "stripes",
      visibleDetails: "Long sleeves",
      imageBase64: jpegBase64,
      rawAiText: "unstructured output",
    }),
    { pattern: "stripes", visibleDetails: "Long sleeves", formalityConfirmed: false },
  );
});