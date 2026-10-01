import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWardrobeGapPlan,
  budgetGuidanceFor,
} from "./wardrobeGapPlanning.mjs";

const shirt = { id: "shirt", name: "Linen shirt", type: "Top" };
const trousers = { id: "trousers", name: "Wide-leg trousers", type: "Bottom" };

test("offers a top-and-bottom route or a one-piece when the wardrobe has no outfit base", () => {
  const plan = buildWardrobeGapPlan([]);

  assert.equal(plan.hasCompleteBase, false);
  assert.deepEqual(plan.missingCategories, ["top", "bottom", "onePiece"]);
  assert.deepEqual(plan.shoppingRoutes.map(({ id }) => id), ["separates", "one-piece"]);
});

test("identifies only the missing core category and keeps a one-piece alternative", () => {
  const plan = buildWardrobeGapPlan([trousers]);

  assert.deepEqual(plan.missingCategories, ["top", "onePiece"]);
  assert.deepEqual(plan.shoppingRoutes.map(({ id }) => id), ["top", "one-piece"]);
});

test("suggests alternatives in owned core categories when a complete base exists", () => {
  const plan = buildWardrobeGapPlan([shirt, trousers]);

  assert.equal(plan.hasCompleteBase, true);
  assert.deepEqual(plan.missingCategories, []);
  assert.deepEqual(plan.shoppingRoutes.map(({ id }) => id), [
    "alternative-top",
    "alternative-bottom",
  ]);
});

test("does not treat dirty, unavailable, or repair-needed pieces as wearable options", () => {
  const plan = buildWardrobeGapPlan([
    shirt,
    { ...trousers, laundryState: "dirty" },
    { id: "dress", name: "Summer dress", type: "Dress", available: false },
  ]);

  assert.deepEqual(plan.availableItems.map(({ id }) => id), ["shirt"]);
  assert.deepEqual(plan.missingCategories, ["bottom", "onePiece"]);
});

test("only uses stated brief requirements and returns distinct budget guidance", () => {
  const plan = buildWardrobeGapPlan([], {
    dressCode: "Smart casual",
    comfortNeeds: "Breathable fabrics",
  });

  assert.deepEqual(plan.requirements, [
    { label: "Dress code", value: "Smart casual" },
    { label: "Comfort", value: "Breathable fabrics" },
  ]);
  assert.match(budgetGuidanceFor("low"), /resale|second-hand/i);
  assert.notEqual(budgetGuidanceFor("low"), budgetGuidanceFor("medium"));
  assert.match(budgetGuidanceFor("flexible"), /no price cap/i);
});