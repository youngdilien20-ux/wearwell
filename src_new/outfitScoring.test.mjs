import assert from "node:assert/strict";
import test from "node:test";
import { scoreOutfitCandidates } from "./outfitScoring.mjs";

const baseWardrobe = [
  { id: "top-warm", name: "Breathable linen shirt", type: "Top", color: "#b7d8cf", weather: "hot", note: "Breathable · easy movement", formality: 2 },
  { id: "top-cool", name: "Warm knit top", type: "Top", color: "#ad9b90", weather: "cool", note: "Soft", formality: 2 },
  { id: "bottom", name: "Everyday trousers", type: "Bottom", color: "#26324b", weather: "all", note: "Comfortable", formality: 2 },
  { id: "shoes", name: "Walking shoes", type: "Shoes", color: "#f3f0e8", weather: "all", note: "Broken in · supportive", formality: 1 },
];

test("ranks outfits using a stated comfort need and recorded weather tags", () => {
  const result = scoreOutfitCandidates(baseWardrobe, {
    dayBrief: { comfortNeeds: "breathable", movement: "long walk" },
    weather: { tempC: 28, isFallback: false },
  });

  assert.ok(result.candidates.length > 0);
  assert.equal(result.candidates[0].itemIds.includes("top-warm"), true);
  assert.match(result.candidates[0].reason, /comfort request|movement needs/);
  assert.match(result.candidates[0].weather, /warm-weather notes align/);
  assert.ok(result.candidates[0].provenance.ruleIds.includes("weather.temperature_band_compared_with_recorded_tags"));
  assert.ok(result.candidates[0].provenance.ruleIds.includes("constraints.comfort.recorded_details_only"));
  assert.ok(result.candidates[0].provenance.evidenceIds.includes("day_brief.comfort_needs"));
  assert.ok(result.candidates[0].provenance.evidenceIds.includes("weather.temperature_c"));
  assert.equal(JSON.stringify(result.candidates[0].provenance).includes("breathable"), false);
});

test("excludes only a directly recorded conflict with a stated coverage need", () => {
  const wardrobe = [
    { id: "top-bare", name: "Bare-shoulder top", type: "Top", color: "#b7d8cf", note: "Shoulders uncovered" },
    { id: "top-covered", name: "Covered-shoulder top", type: "Top", color: "#b7d8cf", coverage: { shoulders: true } },
    { id: "bottom", name: "Trousers", type: "Bottom", color: "#26324b" },
  ];
  const result = scoreOutfitCandidates(wardrobe, {
    dayBrief: { coverageNeeds: "shoulders covered" },
    weather: {},
  });

  assert.equal(result.generatedCount, 2);
  assert.equal(result.excludedCount, 1);
  assert.equal(result.candidates.length, 1);
  assert.ok(result.candidates[0].itemIds.includes("top-covered"));
  assert.ok(result.candidates[0].provenance.ruleIds.includes("constraints.coverage.recorded_details_only"));
  assert.ok(result.candidates[0].provenance.evidenceIds.includes("day_brief.coverage_needs"));
});

test("keeps missing fit information unknown instead of treating it as a mismatch", () => {
  const wardrobe = [
    { id: "top", name: "Unrecorded top", type: "Top", color: "#b7d8cf" },
    { id: "bottom", name: "Unrecorded trousers", type: "Bottom", color: "#26324b" },
  ];
  const result = scoreOutfitCandidates(wardrobe, {
    dayBrief: { comfortNeeds: "not scratchy", coverageNeeds: "shoulders covered" },
    weather: { tempC: 26, isFallback: true },
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.excludedCount, 0);
  assert.match(result.candidates[0].reason, /comfort fit is not recorded/);
  assert.match(result.candidates[0].reason, /coverage is not recorded/);
  assert.match(result.candidates[0].weather, /Sample only, not a live forecast/);
  assert.ok(result.candidates[0].provenance.evidenceIds.includes("weather.fallback_flag"));
  assert.ok(result.candidates[0].provenance.ruleIds.includes("weather.item_tags_unrecorded"));
});

test("excludes an item explicitly marked dirty or unavailable", () => {
  const wardrobe = [
    { id: "top", name: "Top", type: "Top", color: "#b7d8cf" },
    { id: "bottom", name: "Trousers", type: "Bottom", color: "#26324b", laundryState: "dirty" },
  ];
  const result = scoreOutfitCandidates(wardrobe);

  assert.equal(result.generatedCount, 1);
  assert.equal(result.excludedCount, 1);
  assert.deepEqual(result.candidates, []);
});

test("ranks closer recorded formality above a more formal look for a stated casual dress code", () => {
  const wardrobe = [
    { id: "casual-top", name: "Casual top", type: "Top", color: "#b7d8cf", formality: 1 },
    { id: "formal-top", name: "Formal top", type: "Top", color: "#ad9b90", formality: 3 },
    { id: "bottom", name: "Casual trousers", type: "Bottom", color: "#26324b", formality: 1 },
  ];
  const result = scoreOutfitCandidates(wardrobe, {
    dayBrief: { dressCode: "Casual" },
    weather: {},
  });

  assert.equal(result.candidates[0].itemIds.includes("casual-top"), true);
  assert.match(result.candidates[0].formality, /recorded formality is close/);
});

test("does not claim a dress-code match when no code was provided", () => {
  const wardrobe = [
    { id: "top", name: "Top", type: "Top", color: "#b7d8cf", formality: 3 },
    { id: "bottom", name: "Trousers", type: "Bottom", color: "#26324b", formality: 2 },
  ];
  const result = scoreOutfitCandidates(wardrobe, { dayBrief: {}, weather: {} });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].formality, "Item formality is recorded; no dress code was stated.");
  assert.ok(result.candidates[0].provenance.ruleIds.includes("context.no_dress_code_inference"));
  assert.ok(result.candidates[0].provenance.ruleIds.includes("weather.temperature_unknown"));
  assert.ok(result.candidates[0].provenance.evidenceIds.includes("day_brief.dress_code"));
  assert.equal(result.candidates[0].provenance.evidenceIds.includes("day_brief.comfort_needs"), false);
});

test("treats the old auto-filled formality on custom wardrobe items as unrecorded", () => {
  const wardrobe = [
    { id: "custom-123", name: "Custom top", type: "Top", color: "#b7d8cf", formality: 2 },
    { id: "custom-456", name: "Custom trousers", type: "Bottom", color: "#26324b", formality: 2 },
  ];
  const result = scoreOutfitCandidates(wardrobe, {
    dayBrief: { dressCode: "Smart casual" },
    weather: {},
  });

  assert.equal(result.candidates[0].formality, "Stated dress code: Smart casual; item formality isn't recorded.");
  assert.ok(result.candidates[0].provenance.ruleIds.includes("context.item_formality_unknown"));
  assert.equal(result.candidates[0].provenance.ruleIds.includes("context.recorded_formality_distance"), false);
});

test("uses explicit feedback only for the exact item set and caps its ranking effect", () => {
  const wardrobe = [
    { id: "a", name: "Soft top", type: "Top", color: "#b7d8cf" },
    { id: "b", name: "Bright top", type: "Top", color: "#ad9b90" },
    { id: "c", name: "Trousers", type: "Bottom", color: "#26324b" },
    { id: "d", name: "Walking shoes", type: "Shoes", color: "#f3f0e8" },
  ];
  const baseline = scoreOutfitCandidates(wardrobe);
  const chosen = baseline.candidates.find((candidate) => candidate.itemIds.includes("a") && candidate.itemIds.includes("d"));
  const feedback = {
    itemIds: chosen.itemIds.slice().reverse(),
    feedback: {
      woreIt: "yes",
      comfort: "good",
      likedColors: "yes",
      wouldWearAgain: "yes",
    },
  };

  const ranked = scoreOutfitCandidates(wardrobe, { wearHistory: [feedback, feedback] });
  const matched = ranked.candidates.find((candidate) => candidate.id === chosen.id);
  const partialOverlap = ranked.candidates.find((candidate) =>
    candidate.itemIds.includes("a") &&
    candidate.itemIds.includes("c") &&
    candidate.itemIds.length !== chosen.itemIds.length,
  );

  assert.equal(matched.feedbackScore, 8);
  assert.equal(matched.score, chosen.score + 8);
  assert.match(matched.reason, /exact combination also affects its rank/);
  assert.ok(matched.provenance.ruleIds.includes("feedback.explicit_exact_item_set_only"));
  assert.ok(matched.provenance.evidenceIds.includes("feedback.exact_item_set"));
  assert.equal(partialOverlap.feedbackScore, 0);
  assert.equal(ranked.generatedCount, baseline.generatedCount);
  assert.equal(ranked.excludedCount, baseline.excludedCount);
});

test("does not infer a ranking preference from wear confirmation alone", () => {
  const wardrobe = [
    { id: "top", name: "Top", type: "Top", color: "#b7d8cf" },
    { id: "bottom", name: "Trousers", type: "Bottom", color: "#26324b" },
  ];
  const baseline = scoreOutfitCandidates(wardrobe);
  const onlyCombination = baseline.candidates[0];
  const ranked = scoreOutfitCandidates(wardrobe, {
    wearHistory: [{
      itemIds: onlyCombination.itemIds,
      feedback: { woreIt: "yes" },
    }],
  });

  assert.equal(ranked.candidates[0].feedbackScore, 0);
  assert.equal(ranked.candidates[0].score, onlyCombination.score);
  assert.equal(
    ranked.candidates[0].provenance.ruleIds.includes("feedback.explicit_exact_item_set_only"),
    false,
  );
});

test("can exclude the visible combinations while keeping other valid options", () => {
  const wardrobe = [
    { id: "top-a", name: "Top A", type: "Top", color: "#b7d8cf" },
    { id: "top-b", name: "Top B", type: "Top", color: "#bd725b" },
    { id: "bottom", name: "Trousers", type: "Bottom", color: "#26324b" },
  ];
  const baseline = scoreOutfitCandidates(wardrobe);
  const firstSet = baseline.candidates[0].itemIds.slice().sort().join("\u001f");
  const regenerated = scoreOutfitCandidates(wardrobe, {
    excludedItemSets: [firstSet],
    regenerationReason: "more_color",
  });

  assert.ok(regenerated.candidates.length > 0);
  assert.equal(regenerated.candidates.some((candidate) => candidate.itemIds.slice().sort().join("\u001f") === firstSet), false);
  assert.equal(regenerated.candidates.every((candidate) => candidate.itemIds.includes("bottom")), true);
});

test("includes grounded explanation fields for each scored look", () => {
  const result = scoreOutfitCandidates([
    { id: "top", name: "Top", type: "Top", color: "#b7d8cf" },
    { id: "bottom", name: "Trousers", type: "Bottom", color: "#26324b" },
    { id: "shoes", name: "Walking shoes", type: "Shoes", color: "#f3f0e8", note: "Broken in" },
  ]);

  assert.equal(result.candidates.length > 0, true);
  assert.match(result.candidates[0].footwear, /Walking shoes/);
  assert.match(result.candidates[0].cheaperOrFewerItems, /items|path/);
  assert.ok(Array.isArray(result.candidates[0].ifUncomfortable));
});