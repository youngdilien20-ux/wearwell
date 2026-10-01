import assert from "node:assert/strict";
import test from "node:test";
import {
  applyWardrobeVisionSuggestion,
  buildWardrobeItemRecord,
  validateWardrobePhotoFile,
} from "./wardrobeCapture.mjs";

const suggestion = {
  category: "Layer",
  suggestedName: "Cream check jacket",
  colorName: "Cream",
  colorHex: "#e8dfc9",
  pattern: "checks",
  visibleDetails: "Single-breasted front and long sleeves",
  formality: 2,
  weatherHint: "cool",
  confidence: "medium",
};

test("validates image type and size before analysis", () => {
  assert.equal(validateWardrobePhotoFile({ type: "image/gif", size: 500 }), "Choose a JPEG, PNG, or WebP photo.");
  assert.equal(validateWardrobePhotoFile({ type: "image/jpeg", size: 13 * 1024 * 1024 }), "Choose a photo smaller than 12 MB.");
  assert.equal(validateWardrobePhotoFile({ type: "image/webp", size: 500 }), "");
});

test("keeps the user's typed fields unchanged when reviewed suggestions are applied", () => {
  const manualDraft = {
    name: "My own cream jacket",
    type: "Top",
    tone: "Warm white",
    color: "#d4c4e8",
    note: "Roomy at the shoulders",
    formality: null,
    formalityExplicit: false,
    weather: "all",
    visualAttributes: { pattern: "uncertain", visibleDetails: "" },
  };
  const reviewed = applyWardrobeVisionSuggestion(manualDraft, suggestion, new Set(["name", "tone", "note"]));

  assert.equal(reviewed.name, manualDraft.name);
  assert.equal(reviewed.tone, manualDraft.tone);
  assert.equal(reviewed.note, manualDraft.note);
  assert.equal(reviewed.type, "Layer");
  assert.equal(reviewed.color, "#e8dfc9");
  assert.equal(reviewed.weather, "cool");
  assert.equal(reviewed.formalityExplicit, true);
  assert.deepEqual(reviewed.visualAttributes, {
    pattern: "checks",
    visibleDetails: "Single-breasted front and long sleeves",
    formalityConfirmed: true,
  });
});

test("preserves every wardrobe field the user has edited before accepting photo suggestions", () => {
  const manualDraft = {
    name: "My jacket",
    type: "Top",
    tone: "Warm white",
    color: "#d4c4e8",
    note: "Roomy at the shoulders",
    formality: 1,
    formalityExplicit: true,
    weather: "hot",
    visualAttributes: {
      pattern: "graphic",
      visibleDetails: "My own detail",
      formalityConfirmed: true,
    },
  };
  const touched = new Set([
    "name",
    "type",
    "tone",
    "color",
    "note",
    "formality",
    "weather",
    "visualAttributes.pattern",
    "visualAttributes.visibleDetails",
  ]);

  assert.deepEqual(
    applyWardrobeVisionSuggestion(manualDraft, suggestion, touched),
    manualDraft,
  );
});

test("manual wardrobe saving works without a photo and never persists image data or raw model text", () => {
  const record = buildWardrobeItemRecord({
    name: "Everyday shoes",
    type: "Shoes",
    tone: "Black",
    color: "#111111",
    note: "Comfortable for walking",
    formality: null,
    formalityExplicit: false,
    weather: "all",
    visualAttributes: { pattern: "solid", visibleDetails: "" },
    imageBase64: "private image bytes",
    photo: { name: "wardrobe.jpg" },
    rawAiText: "unstructured provider output",
  }, null, "custom-manual");

  assert.equal(record.id, "custom-manual");
  assert.equal(record.name, "Everyday shoes");
  assert.equal(record.note, "Comfortable for walking");
  assert.equal(record.visualAttributes.pattern, "solid");
  assert.equal("imageBase64" in record, false);
  assert.equal("photo" in record, false);
  assert.equal("rawAiText" in record, false);
});