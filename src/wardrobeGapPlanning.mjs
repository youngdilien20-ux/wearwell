import { categoryFor } from "./outfitCandidates.mjs";

const CORE_CATEGORIES = Object.freeze(["top", "bottom", "onePiece"]);

const CATEGORY_DETAILS = Object.freeze({
  top: { label: "A top", type: "top" },
  bottom: { label: "A bottom", type: "bottom" },
  onePiece: { label: "A one-piece outfit", type: "onePiece" },
});

export const WARDROBE_BUDGET_OPTIONS = Object.freeze([
  { id: "low", label: "Low budget", detail: "Keep spending low" },
  { id: "medium", label: "Medium budget", detail: "A balanced spend" },
  { id: "flexible", label: "Any price", detail: "No set price limit" },
]);

const BUDGET_GUIDANCE = Object.freeze({
  low: "Look at resale, second-hand, local-market, or sale options. Start with one versatile piece that works with clothes you already own.",
  medium: "Aim for a durable mid-range staple that can work with several pieces already in your wardrobe.",
  flexible: "With no price cap, compare fit, fabric, construction, and how often you will wear the piece—not just the brand.",
});

function isUnavailable(item) {
  return item?.available === false ||
    String(item?.availability || "").trim().toLowerCase() === "unavailable" ||
    String(item?.laundryState || "").trim().toLowerCase() === "dirty" ||
    String(item?.condition || "").trim().toLowerCase() === "needs repair";
}

function routesFor(missingCategories, availableCategories) {
  if (missingCategories.includes("top") && missingCategories.includes("bottom")) {
    return [
      {
        id: "separates",
        title: "A top and a bottom",
        detail: "This gives you a two-piece base for a complete outfit.",
      },
      {
        id: "one-piece",
        title: "A one-piece outfit",
        detail: "A dress, jumpsuit, or similar one-piece can fill the same role.",
      },
    ];
  }

  if (missingCategories.length > 0) {
    const missingRoutes = missingCategories.map((category) => ({
      id: category === "onePiece" ? "one-piece" : category,
      title: category === "onePiece"
        ? "A one-piece alternative"
        : CATEGORY_DETAILS[category].label,
      detail: category === "top"
        ? "Choose a top that works with your available bottoms."
        : category === "bottom"
          ? "Choose bottoms that work with your available tops."
          : "A dress, jumpsuit, or similar one-piece can provide a complete-outfit base.",
    }));
    if (!missingCategories.includes("onePiece")) {
      missingRoutes.push({
        id: "one-piece",
        title: "A one-piece alternative",
        detail: "A dress or jumpsuit can work instead of separate top-and-bottom pieces.",
      });
    }
    return missingRoutes;
  }

  const alternatives = availableCategories.map((category) => ({
    id: `alternative-${category}`,
    title: `An alternative ${CATEGORY_DETAILS[category].label.toLowerCase().replace(/^a /, "")}`,
    detail: "Look for a piece in this category that better matches your recorded outfit needs.",
  }));
  return alternatives.length
    ? alternatives
    : [
        {
          id: "separates",
          title: "A top and a bottom",
          detail: "A two-piece base gives Wearwell the essentials for a complete outfit.",
        },
        {
          id: "one-piece",
          title: "A one-piece outfit",
          detail: "A dress or jumpsuit is another way to build a complete outfit.",
        },
      ];
}

export function buildWardrobeGapPlan(wardrobe, brief = {}) {
  const items = Array.isArray(wardrobe) ? wardrobe : [];
  const availableItems = items.filter((item) =>
    item && typeof item.name === "string" && item.name.trim() && !isUnavailable(item),
  );
  const coreItems = availableItems.filter((item) =>
    CORE_CATEGORIES.includes(categoryFor(item)),
  );
  const counts = Object.fromEntries(CORE_CATEGORIES.map((category) => [
    category,
    coreItems.filter((item) => categoryFor(item) === category).length,
  ]));
  const hasOnePiece = counts.onePiece > 0;
  const hasSeparates = counts.top > 0 && counts.bottom > 0;
  const hasCompleteBase = hasOnePiece || hasSeparates;
  const missingCategories = hasCompleteBase
    ? []
    : CORE_CATEGORIES.filter((category) => counts[category] === 0);
  const availableCategories = CORE_CATEGORIES.filter((category) => counts[category] > 0);
  const requirements = [
    ["Dress code", brief?.dressCode],
    ["Comfort", brief?.comfortNeeds],
    ["Movement", brief?.movement],
    ["Coverage", brief?.coverageNeeds],
  ]
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([label, value]) => ({ label, value: value.trim() }));

  return {
    availableItems,
    coreItems,
    hasCompleteBase,
    missingCategories,
    requirements,
    shoppingRoutes: routesFor(missingCategories, availableCategories),
  };
}

export function budgetGuidanceFor(budgetId) {
  return BUDGET_GUIDANCE[budgetId] || "";
}