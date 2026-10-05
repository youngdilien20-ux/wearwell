import assert from "node:assert/strict";
import test from "node:test";
import { generateOutfitCandidates } from "./outfitCandidates.mjs";

const starterWardrobe = [
  { id: "top-1", name: "Linen shirt", type: "Top", color: "#b7d8cf" },
  { id: "bottom-1", name: "Ink trousers", type: "Bottom", color: "#26324b" },
  { id: "shoes-1", name: "White sneakers", type: "Shoes", color: "#f3f0e8" },
  { id: "layer-1", name: "Cream cardigan", type: "Layer", color: "#e5dbc9" },
];

test("builds complete combinations from owned tops, bottoms, and optional pieces", () => {
  const candidates = generateOutfitCandidates(starterWardrobe, 3);

  assert.equal(candidates.length, 3);
  assert.ok(candidates.every((candidate) => candidate.itemIds.includes("top-1")));
  assert.ok(candidates.every((candidate) => candidate.itemIds.includes("bottom-1")));
  assert.ok(candidates.every((candidate) => candidate.itemIds.every((id) => starterWardrobe.some((item) => item.id === id))));
  assert.ok(candidates.some((candidate) => candidate.itemIds.includes("shoes-1")));
  assert.ok(candidates.some((candidate) => candidate.itemIds.includes("layer-1")));
});

test("uses a one-piece item when separates are not available", () => {
  const candidates = generateOutfitCandidates([
    { id: "dress-1", name: "Blue dress", type: "Dress", color: "#356b9a" },
  ]);

  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0].itemIds, ["dress-1"]);
});

test("does not present an incomplete top-only wardrobe as a complete look", () => {
  assert.deepEqual(generateOutfitCandidates([
    { id: "top-1", name: "Linen shirt", type: "Top", color: "#b7d8cf" },
  ]), []);
});

test("candidate rotation exposes different combinations when available", () => {
  const wardrobe = [
    ...starterWardrobe,
    { id: "bottom-2", name: "Terracotta skirt", type: "Bottom", color: "#bd725b" },
  ];
  const first = generateOutfitCandidates(wardrobe, 2, 0);
  const next = generateOutfitCandidates(wardrobe, 2, 2);

  assert.notDeepEqual(first.map((candidate) => candidate.id), next.map((candidate) => candidate.id));
});
