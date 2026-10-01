import { generateOutfitCandidatePool } from "./outfitCandidates.mjs";

const TEXT_FIELDS = [
  "note",
  "fitNote",
  "comfort",
  "material",
  "fabric",
  "coverage",
  "coverageNotes",
  "mobility",
  "weatherNotes",
];

const FORMALITY_TARGETS = [
  [/white tie|black tie|business formal|semi[- ]formal|\bformal\b/i, 3],
  [/smart casual|business casual/i, 2],
  [/\bcasual\b/i, 1],
];

const REGENERATION_REASONS = new Set([
  "more_casual",
  "more_formal",
  "more_color",
  "less_attention",
  "different_shoes",
  "more_comfort",
  "different_items",
]);

const EXPLANATION_RULE_IDS = Object.freeze({
  ownedItemsOnly: "wardrobe.owned_items_only",
  unavailableItems: "wardrobe.explicitly_unavailable_excluded",
  coverageDetailsOnly: "constraints.coverage.recorded_details_only",
  comfortDetailsOnly: "constraints.comfort.recorded_details_only",
  movementDetailsOnly: "constraints.movement.recorded_details_only",
  weatherAlignment: "weather.temperature_band_compared_with_recorded_tags",
  unknownWeatherTags: "weather.item_tags_unrecorded",
  unknownWeather: "weather.temperature_unknown",
  formalityDistance: "context.recorded_formality_distance",
  unscoredDressCode: "context.unrecognized_dress_code_not_scored",
  unknownFormality: "context.item_formality_unknown",
  noDressCodeInference: "context.no_dress_code_inference",
  recordedDetailsOnly: "explanation.recorded_details_only",
  exactCombinationFeedback: "feedback.explicit_exact_item_set_only",
});

function itemSetKey(itemIds) {
  return Array.isArray(itemIds)
    ? itemIds.filter((id) => typeof id === "string").slice().sort().join("\u001f")
    : "";
}

function feedbackForExactSet(itemIds, history) {
  const key = itemSetKey(itemIds);
  if (!key || !Array.isArray(history)) return { score: 0 };

  let score = 0;
  for (const entry of history) {
    if (itemSetKey(entry?.itemIds) !== key) continue;
    const feedback = entry?.feedback;
    if (!feedback || typeof feedback !== "object") continue;
    if (feedback.wouldWearAgain === "yes") score += 4;
    if (feedback.wouldWearAgain === "no") score -= 4;
    if (feedback.comfort === "good") score += 2;
    if (feedback.comfort === "could-improve") score -= 2;
    if (feedback.likedColors === "yes") score += 2;
    if (feedback.likedColors === "no") score -= 2;
  }
  return { score: Math.max(-8, Math.min(8, score)) };
}

function cleanText(value) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

function detailsFor(item) {
  return TEXT_FIELDS.map((field) => cleanText(item?.[field])).filter(Boolean).join(" ");
}

function itemCategory(item) {
  const type = cleanText(item?.type).replace(/[_-]+/g, " ");
  if (/\b(top|shirt|blouse|tee|t-shirt)\b/.test(type)) return "top";
  if (/\b(bottom|trouser|trousers|pants|jeans|skirt|shorts)\b/.test(type)) return "bottom";
  if (/\b(dress|one piece|one-piece|jumpsuit|romper)\b/.test(type)) return "onePiece";
  if (/\b(layer|jacket|coat|cardigan|blazer|outerwear)\b/.test(type)) return "layer";
  if (/\b(shoe|shoes|footwear|boot|boots|sneaker|sneakers|loafer|loafers)\b/.test(type)) return "shoes";
  if (/\b(accessory|accessories|scarf|belt|hat|bag)\b/.test(type)) return "accessory";
  return "";
}

function hasUnnegatedTerm(text, pattern) {
  for (const match of text.matchAll(pattern)) {
    const preceding = text.slice(Math.max(0, match.index - 18), match.index);
    if (!/\b(?:not|non|never|avoid(?:ing)?)\s+(?:very\s+)?$/i.test(preceding)) return true;
  }
  return false;
}

function requiredCoverageRegions(value) {
  const text = cleanText(value);
  return ["shoulders", "arms", "legs", "chest", "back", "neck"].filter((region) =>
    new RegExp("\\b" + region + "\\b").test(text),
  );
}

function coverageState(items, regions) {
  if (regions.length === 0) return { supported: false, conflict: false };

  let supported = false;
  let conflict = false;
  for (const item of items) {
    const details = detailsFor(item);
    const coverage = item?.coverage;
    for (const region of regions) {
      const key = region === "shoulders" ? "shoulder" : region.replace(/s$/, "");
      const recorded = coverage && typeof coverage === "object" && !Array.isArray(coverage)
        ? (coverage[region] ?? coverage[key])
        : undefined;
      if (recorded === true || (Array.isArray(coverage) && coverage.map(cleanText).includes(region))) {
        supported = true;
      }
      if (recorded === false || new RegExp("\\b" + region + "\\b.{0,24}\\b(?:uncovered|exposed)\\b|\\b(?:uncovered|exposed)\\b.{0,24}\\b" + region + "\\b").test(details)) {
        conflict = true;
      }
      if (new RegExp("\\b(?:covers?|covering)\\s+(?:the\\s+)?" + key + "s?\\b|\\b" + region + "\\s+(?:are\\s+)?covered\\b").test(details)) {
        supported = true;
      }
    }
  }
  return { supported, conflict };
}

function comfortState(items, need) {
  const request = cleanText(need);
  if (!request) return { supported: false, conflict: false };

  const details = items.map(detailsFor).join(" ");
  if (/\b(?:scratchy|itchy)\b/.test(request)) {
    const supported = /\b(?:not scratchy|non[- ]itchy|tagless|soft seams)\b/.test(details);
    const conflict = hasUnnegatedTerm(details, /\b(?:scratchy|itchy)\b/g);
    return { supported, conflict };
  }

  const signals = [
    { request: /\bbreathable\b/, detail: /\bbreathable\b/ },
    { request: /\bsoft\b/, detail: /\bsoft\b/ },
    { request: /\b(?:comfortable|comfy)\b/, detail: /\b(?:comfortable|comfy)\b/ },
    { request: /\b(?:room to move|easy movement|loose fit|relaxed fit)\b/, detail: /\b(?:room to move|easy movement|stretch|relaxed fit)\b/ },
  ];
  return {
    supported: signals.some(({ request: needPattern, detail }) => needPattern.test(request) && detail.test(details)),
    conflict: false,
  };
}

function movementState(items, movement) {
  const request = cleanText(movement);
  if (!request) return { supported: false, conflict: false };

  const details = items.map(detailsFor).join(" ");
  const requestsWalking = /\b(?:walk|walking|hike|on my feet)\b/.test(request);
  const requestsSitting = /\b(?:seated|sitting)\b/.test(request);
  const requestsStanding = /\bstanding\b/.test(request);
  const supported = requestsWalking
    ? /\b(?:walking|walk|broken in|supportive|easy movement|room to move|stretch)\b/.test(details)
    : requestsSitting
      ? /\b(?:sitting|seated|easy movement|room to move|stretch)\b/.test(details)
      : requestsStanding
        ? /\b(?:standing|on my feet|supportive|comfortable|easy movement)\b/.test(details)
        : /\b(?:easy movement|room to move|stretch)\b/.test(details);
  const conflict = (requestsWalking && /\b(?:not for walking|not suited for walking|restricts walking)\b/.test(details)) ||
    (requestsSitting && /\b(?:not suitable for sitting|restricts sitting)\b/.test(details)) ||
    (requestsStanding && /\b(?:not suited for standing|restricts standing)\b/.test(details));
  return { supported, conflict };
}

function isExplicitlyUnavailable(item) {
  const availability = cleanText(item?.availability);
  const laundry = cleanText(item?.laundryState);
  const condition = cleanText(item?.condition);
  return item?.available === false ||
    availability === "unavailable" ||
    laundry === "dirty" ||
    condition === "needs repair";
}

function formalValue(item) {
  if (
    typeof item?.formality === "number" &&
    Number.isFinite(item.formality) &&
    !(item.id?.startsWith("custom-") && item.formality === 2 && item.formalityExplicit !== true)
  ) {
    return Math.max(1, Math.min(3, item.formality));
  }
  const text = cleanText(item?.formality);
  if (!text) return null;
  if (/\b(?:white tie|black tie|business formal|semi[- ]formal|formal)\b/.test(text)) return 3;
  if (/\b(?:smart casual|business casual)\b/.test(text)) return 2;
  if (/\bcasual\b/.test(text)) return 1;
  return null;
}

function formalTarget(value) {
  const text = cleanText(value);
  return FORMALITY_TARGETS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function uniqueItemColors(items) {
  return new Set(
    items
      .map((item) => cleanText(item?.tone || item?.color))
      .filter(Boolean),
  ).size;
}

function regenerationScore(items, reason) {
  if (!REGENERATION_REASONS.has(reason)) return 0;
  const formalValues = items.map(formalValue).filter((value) => value !== null);
  const averageFormality = formalValues.length
    ? formalValues.reduce((total, value) => total + value, 0) / formalValues.length
    : 0;
  const colorCount = uniqueItemColors(items);
  switch (reason) {
    case "more_casual":
      return formalValues.length ? 3 - averageFormality : 0;
    case "more_formal":
      return averageFormality;
    case "more_color":
      return Math.max(0, colorCount - 1);
    case "less_attention":
      return Math.max(0, 3 - colorCount);
    case "different_shoes":
      return items.some((item) => itemCategory(item) === "shoes") ? 3 : -1;
    case "more_comfort":
      return items.filter((item) => /\b(?:soft|comfortable|comfy|easy movement|room to move|stretch|breathable)\b/.test(detailsFor(item))).length;
    case "different_items":
      return 0;
    default:
      return 0;
  }
}

function weatherBand(tempC) {
  if (tempC >= 25) return "warm";
  if (tempC <= 18) return "cool";
  return "mild";
}

function weatherPreference(item) {
  const tag = cleanText(item?.weather);
  if (/\b(?:hot|warm|summer)\b/.test(tag)) return "warm";
  if (/\b(?:cool|cold|winter)\b/.test(tag)) return "cool";
  return "";
}

function weatherState(items, weather) {
  const tempC = weather?.tempC;
  if (typeof tempC !== "number" || !Number.isFinite(tempC)) {
    return { score: 0, summary: "No forecast is available; weather fit is unknown." };
  }

  const band = weatherBand(tempC);
  const preferences = items.map(weatherPreference).filter(Boolean);
  const matching = band !== "mild" ? preferences.filter((preference) => preference === band).length : 0;
  const mismatching = band !== "mild" ? preferences.filter((preference) => preference !== band).length : 0;
  const score = matching - mismatching;
  const temperature = Math.round(tempC) + "°C";
  const sample = weather?.isFallback ? "Sample only, not a live forecast. " : "";

  if (preferences.length === 0) {
    return { score: 0, summary: sample + "Weather suitability isn't recorded for these pieces." };
  }
  if (band === "mild") {
    return { score: 0, summary: sample + "Recorded warm/cool tags are neutral at " + temperature + "." };
  }
  const preferenceName = band === "warm" ? "warm-weather" : "cool-weather";
  if (matching > 0 && mismatching === 0) {
    return { score, summary: sample + "Saved " + preferenceName + " notes align with " + temperature + "." };
  }
  if (mismatching > 0 && matching === 0) {
    const other = band === "warm" ? "cool-weather" : "warm-weather";
    return { score, summary: sample + "A saved " + other + " tag may not match " + temperature + "." };
  }
  return { score, summary: sample + "Saved weather tags are mixed for " + temperature + "." };
}

function formalityState(items, dressCode) {
  const target = formalTarget(dressCode);
  const values = items.map(formalValue).filter((value) => value !== null);
  if (!dressCode) {
    return {
      score: 0,
      summary: values.length ? "Item formality is recorded; no dress code was stated." : "No dress code stated.",
    };
  }
  if (target === null) {
    return { score: 0, summary: "Stated dress code: " + dressCode + "; it isn't scored." };
  }
  if (values.length === 0) {
    return { score: 0, summary: "Stated dress code: " + dressCode + "; item formality isn't recorded." };
  }

  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const score = Math.round((2 - Math.abs(target - average)) * 2);
  const coverage = values.length < items.length ? " Some pieces have no formality details." : "";
  const relation = Math.abs(target - average) <= 0.5 ? "recorded formality is close to" : "recorded formality differs from";
  return {
    score,
    summary: "Stated " + dressCode + " dress code; " + relation + " it." + coverage,
  };
}

function explanationFor(items, brief, states) {
  const names = items.map((item) => item.name).filter(Boolean);
  const signals = [];
  if (states.comfort.supported) signals.push("saved notes match your comfort request");
  if (states.movement.supported) signals.push("saved notes support your movement needs");
  if (states.coverage.supported) signals.push("saved details record the coverage you requested");
  if (brief?.comfortNeeds && !states.comfort.supported) signals.push("comfort fit is not recorded for this combination");
  if (brief?.movement && !states.movement.supported) signals.push("movement details are not recorded for this combination");
  if (brief?.coverageNeeds && !states.coverage.supported) signals.push("requested coverage is not recorded for this combination");

  const pieces = names.length ? names.join(", ") : "your wardrobe pieces";
  return signals.length
    ? "Uses " + pieces + "; " + signals.join("; ") + "."
    : "Uses " + pieces + ". Fit details are limited, so this is a wardrobe combination, not a fit guarantee.";
}

function footwearExplanation(items) {
  const footwear = items.filter((item) => itemCategory(item) === "shoes");
  if (!footwear.length) return "No footwear is recorded in this combination.";
  return "Footwear: " + footwear.map((item) => item.name).join(", ") + ".";
}

function accessoriesExplanation(items) {
  const accessories = items.filter((item) => itemCategory(item) === "accessory");
  return accessories.length
    ? accessories.map((item) => item.name).join(", ")
    : "No accessory is needed for this combination.";
}

function oneItemDifference(left, right) {
  const leftIds = new Set(left.itemIds);
  const rightIds = new Set(right.itemIds);
  const removed = left.itemIds.filter((id) => !rightIds.has(id));
  const added = right.itemIds.filter((id) => !leftIds.has(id));
  return removed.length === 1 && added.length === 1 ? { removed: removed[0], added: added[0] } : null;
}

function substitutionExplanations(candidate, candidates, byId) {
  return candidates
    .filter((other) => other.id !== candidate.id)
    .map((other) => {
      const difference = oneItemDifference(candidate, other);
      if (!difference) return null;
      const removed = byId.get(difference.removed);
      const added = byId.get(difference.added);
      if (!removed || !added) return null;
      return {
        candidateId: other.id,
        replaceItemId: removed.id,
        withItemId: added.id,
        reason: `Try ${added.name} instead of ${removed.name}; it is another wardrobe combination that clears the same recorded constraints.`,
      };
    })
    .filter(Boolean)
    .slice(0, 3);
}

function discomfortExplanations(candidate, substitutions, brief) {
  if (substitutions.length) {
    return substitutions.map(({ reason }) => reason);
  }
  if (brief?.comfortNeeds) {
    return ["Comfort details are limited for this combination; review the item's fit and care notes before wearing it."];
  }
  return ["If anything feels uncomfortable, choose a different saved combination rather than treating the fit as guaranteed."];
}

function fewerItemsExplanation(items) {
  const optional = items.filter((item) => ["layer", "shoes", "accessory"].includes(itemCategory(item)));
  if (!optional.length) return "This is already the fewer-item path; no price information is recorded.";
  return "For fewer items, try the core pieces without " + optional.map((item) => item.name).join(", ") + ". Price information is not recorded.";
}

function explanationProvenance(items, brief, weather) {
  const ruleIds = [
    EXPLANATION_RULE_IDS.ownedItemsOnly,
    EXPLANATION_RULE_IDS.unavailableItems,
    EXPLANATION_RULE_IDS.recordedDetailsOnly,
  ];
  const evidenceIds = ["wardrobe.selected_item_names", "wardrobe.availability_fields"];
  const add = (ruleId, ...evidence) => {
    ruleIds.push(ruleId);
    evidenceIds.push(...evidence);
  };

  if (requiredCoverageRegions(brief?.coverageNeeds).length > 0) {
    add(
      EXPLANATION_RULE_IDS.coverageDetailsOnly,
      "day_brief.coverage_needs",
      "wardrobe.recorded_item_details",
    );
  }
  if (cleanText(brief?.comfortNeeds)) {
    add(
      EXPLANATION_RULE_IDS.comfortDetailsOnly,
      "day_brief.comfort_needs",
      "wardrobe.recorded_item_details",
    );
  }
  if (cleanText(brief?.movement)) {
    add(
      EXPLANATION_RULE_IDS.movementDetailsOnly,
      "day_brief.movement",
      "wardrobe.recorded_item_details",
    );
  }
  if (typeof weather?.tempC === "number" && Number.isFinite(weather.tempC)) {
    if (items.some((item) => weatherPreference(item))) {
      add(
        EXPLANATION_RULE_IDS.weatherAlignment,
        "weather.temperature_c",
        "wardrobe.weather_tags",
      );
    } else {
      add(EXPLANATION_RULE_IDS.unknownWeatherTags, "weather.temperature_c", "wardrobe.weather_tags");
    }
    if (weather.isFallback) evidenceIds.push("weather.fallback_flag");
  } else {
    add(EXPLANATION_RULE_IDS.unknownWeather, "weather.temperature_c");
  }
  if (cleanText(brief?.dressCode)) {
    const target = formalTarget(brief.dressCode);
    const hasRecordedFormality = items.some((item) => formalValue(item) !== null);
    if (target !== null && hasRecordedFormality) {
      add(
        EXPLANATION_RULE_IDS.formalityDistance,
        "day_brief.dress_code",
        "wardrobe.formality_values",
      );
    } else if (target === null) {
      add(EXPLANATION_RULE_IDS.unscoredDressCode, "day_brief.dress_code");
    } else {
      add(
        EXPLANATION_RULE_IDS.unknownFormality,
        "day_brief.dress_code",
        "wardrobe.formality_values",
      );
    }
  } else if (items.some((item) => formalValue(item) !== null)) {
    add(
      EXPLANATION_RULE_IDS.noDressCodeInference,
      "day_brief.dress_code",
      "wardrobe.formality_values",
    );
  } else {
    add(EXPLANATION_RULE_IDS.noDressCodeInference, "day_brief.dress_code");
  }

  return {
    ruleIds: [...new Set(ruleIds)],
    evidenceIds: [...new Set(evidenceIds)],
  };
}

export function scoreOutfitCandidates(
  wardrobe,
  {
    dayBrief = {},
    weather = {},
    wearHistory = [],
    regenerationReason = "",
    excludedItemSets = [],
  } = {},
) {
  const wardrobeItems = Array.isArray(wardrobe) ? wardrobe : [];
  const byId = new Map(wardrobeItems.filter((item) => item && typeof item.id === "string").map((item) => [item.id, item]));
  const pool = generateOutfitCandidatePool(wardrobeItems);
  const excluded = new Set(Array.isArray(excludedItemSets) ? excludedItemSets : []);
  const regions = requiredCoverageRegions(dayBrief?.coverageNeeds);
  let excludedCount = 0;

  const candidates = pool.flatMap((candidate, index) => {
    if (excluded.has(itemSetKey(candidate.itemIds))) return [];
    const items = candidate.itemIds.map((id) => byId.get(id)).filter(Boolean);
    const coverage = coverageState(items, regions);
    const comfort = comfortState(items, dayBrief?.comfortNeeds);
    const movement = movementState(items, dayBrief?.movement);
    const unavailable = items.some(isExplicitlyUnavailable);
    if (coverage.conflict || comfort.conflict || movement.conflict || unavailable) {
      excludedCount += 1;
      return [];
    }

    const weatherFit = weatherState(items, weather);
    const formality = formalityState(items, dayBrief?.dressCode);
    const feedback = feedbackForExactSet(candidate.itemIds, wearHistory);
    const provenance = explanationProvenance(items, dayBrief, weather);
    if (feedback.score !== 0) {
      provenance.ruleIds.push(EXPLANATION_RULE_IDS.exactCombinationFeedback);
      provenance.evidenceIds.push("feedback.exact_item_set");
    }
    const score =
      (coverage.supported ? 5 : 0) +
      (comfort.supported ? 4 : 0) +
      (movement.supported ? 3 : 0) +
      weatherFit.score +
      formality.score +
      feedback.score +
      regenerationScore(items, regenerationReason);
    const states = { coverage, comfort, movement };
    const explanation = explanationFor(items, dayBrief, states);
    const feedbackNote = feedback.score === 0
      ? ""
      : " Your explicit feedback on this exact combination also affects its rank.";

    return [{
      ...candidate,
      score,
      feedbackScore: feedback.score,
      reason: explanation + feedbackNote,
      weather: weatherFit.summary,
      formality: formality.summary,
      provenance,
      originalIndex: index,
    }];
  });

  candidates.sort((left, right) => right.score - left.score || left.originalIndex - right.originalIndex);
  const scoredCandidates = candidates.map(({ originalIndex, ...candidate }) => candidate);
  return {
    candidates: scoredCandidates.map((candidate) => {
      const substitutions = substitutionExplanations(candidate, scoredCandidates, byId);
      return {
        ...candidate,
        footwear: footwearExplanation(candidate.itemIds.map((id) => byId.get(id)).filter(Boolean)),
        accessories: accessoriesExplanation(candidate.itemIds.map((id) => byId.get(id)).filter(Boolean)),
        substitutions,
        ifUncomfortable: discomfortExplanations(candidate, substitutions, dayBrief),
        cheaperOrFewerItems: fewerItemsExplanation(candidate.itemIds.map((id) => byId.get(id)).filter(Boolean)),
      };
    }),
    generatedCount: pool.length,
    excludedCount,
  };
}