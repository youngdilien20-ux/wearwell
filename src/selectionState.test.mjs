import assert from "node:assert/strict";
import test from "node:test";
import {
  restoreSelectedRecommendation,
  selectRecommendation,
  swapOptionsFor,
  swapSelectedRecommendation,
} from "./selectionState.mjs";

const now = new Date("2026-09-30T10:00:00.000Z");
const wardrobeById = {
  topA: { name: "Top A" },
  topB: { name: "Top B" },
  bottom: { name: "Trousers" },
  shoesA: { name: "Walking shoes" },
  shoesB: { name: "Brown loafers" },
};
const lookA = {
  id: "look-a",
  name: "Look 01",
  itemIds: ["topA", "bottom", "shoesA"],
  reason: "Uses Top A.",
  weather: "Dry.",
  formality: "Casual.",
};
const lookB = {
  id: "look-b",
  name: "Look 02",
  itemIds: ["topB", "bottom", "shoesA"],
  reason: "Uses Top B.",
  weather: "Dry.",
  formality: "Casual.",
};
const lookWithDifferentShoes = {
  id: "look-c",
  name: "Look 03",
  itemIds: ["topA", "bottom", "shoesB"],
  reason: "Uses different shoes.",
  weather: "Dry.",
  formality: "Casual.",
};

test("selecting another recommendation changes active selection without marking it worn", () => {
  const first = selectRecommendation(
    { selected: null, wearHistory: [] },
    lookA,
    { wardrobeById, now, eventId: "event-2", eventLabel: "Dinner" },
  );
  const second = selectRecommendation(first, lookB, { wardrobeById, now });

  assert.equal(first.selected, "look-a");
  assert.equal(second.selected, "look-b");
  assert.equal(second.wearHistory.length, 2);
  assert.equal(second.wearHistory.at(-1).outfitId, "look-b");
  assert.equal(second.wearHistory.at(-1).feedback.woreIt, "");
  assert.equal(first.wearHistory.at(-1).eventId, "event-2");
  assert.equal(first.wearHistory.at(-1).eventLabel, "Dinner");
});

test("swapping a selected look persists the compatible replacement as the active choice", () => {
  const selected = selectRecommendation(
    { selected: null, wearHistory: [] },
    lookA,
    { wardrobeById, now },
  );
  const swapped = swapSelectedRecommendation(
    selected,
    lookA,
    lookWithDifferentShoes,
    { wardrobeById, now, eventId: "event-2", eventLabel: "Dinner" },
  );

  assert.equal(swapped.selected, "look-c");
  assert.equal(swapped.wearHistory.at(-1).outfitId, "look-c");
  assert.deepEqual(swapped.wearHistory.at(-1).itemIds, ["topA", "bottom", "shoesB"]);
  assert.equal(swapped.wearHistory.at(-1).feedback.woreIt, "");
  assert.equal(swapped.wearHistory.at(-1).eventId, "event-2");
  assert.equal(swapped.wearHistory.at(-1).eventLabel, "Dinner");
});

test("only exposes one-item alternatives from the scored wardrobe candidates", () => {
  const options = swapOptionsFor(lookA, [lookB, lookWithDifferentShoes]);
  assert.deepEqual(options.map(({ addedId }) => addedId), ["topB", "shoesB"]);
});

test("reports no replacement when no scored candidate preserves the outfit", () => {
  assert.deepEqual(swapOptionsFor(lookA, [{
    id: "look-invalid",
    itemIds: ["topB", "shoesB"],
  }]), []);
});

test("restores a selected recommendation after reload when its saved entry is current", () => {
  const selected = selectRecommendation(
    { selected: null, wearHistory: [] },
    lookB,
    { wardrobeById, now },
  );
  assert.equal(restoreSelectedRecommendation(selected, now), "look-b");
});