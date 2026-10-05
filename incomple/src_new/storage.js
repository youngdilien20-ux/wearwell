const STORAGE_KEY = "wearwell-local-state-v1";
const STORAGE_VERSION = 4;
const HISTORY_LIMIT = 200;
const FEEDBACK_VALUES = Object.freeze({
  woreIt: ["", "yes", "not-yet"],
  comfort: ["", "good", "could-improve"],
  likedColors: ["", "yes", "no"],
  wouldWearAgain: ["", "yes", "no"],
});
const BRIEF_FIELDS = [
  "timeWindow",
  "duration",
  "movement",
  "dressCode",
  "mood",
  "comfortNeeds",
  "coverageNeeds",
];
const FIELD_LIMITS = Object.freeze({
  timeWindow: 80,
  duration: 80,
  movement: 160,
  dressCode: 100,
  mood: 120,
  comfortNeeds: 160,
  coverageNeeds: 120,
});
const DEFAULT_SETTINGS = Object.freeze({
  temperatureUnit: "C",
  voiceLanguage: "en-GB",
  voiceEnabled: false,
  aiEnabled: false,
});
const VOICE_LANGUAGES = ["en-GB", "en-US", "fr-FR", "pt-PT", "es-ES"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUsableWardrobeItem(item) {
  return (
    isRecord(item) &&
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.name === "string" &&
    item.name.trim().length > 0 &&
    typeof item.type === "string" &&
    typeof item.color === "string"
  );
}

function boundedString(value, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeSettings(value, defaults) {
  const source = isRecord(value) ? value : {};
  const fallback = isRecord(defaults) ? defaults : DEFAULT_SETTINGS;
  return {
    temperatureUnit: ["C", "F"].includes(source.temperatureUnit)
      ? source.temperatureUnit
      : (fallback.temperatureUnit || DEFAULT_SETTINGS.temperatureUnit),
    voiceLanguage: VOICE_LANGUAGES.includes(source.voiceLanguage)
      ? source.voiceLanguage
      : (fallback.voiceLanguage || DEFAULT_SETTINGS.voiceLanguage),
    voiceEnabled: typeof source.voiceEnabled === "boolean"
      ? source.voiceEnabled
      : (fallback.voiceEnabled ?? DEFAULT_SETTINGS.voiceEnabled),
    aiEnabled: typeof source.aiEnabled === "boolean"
      ? source.aiEnabled
      : (fallback.aiEnabled ?? DEFAULT_SETTINGS.aiEnabled),
  };
}

function normalizeWearHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) =>
      isRecord(entry) &&
      typeof entry.id === "string" &&
      entry.id.trim().length > 0 &&
      Array.isArray(entry.itemIds) &&
      entry.itemIds.length > 0 &&
      entry.itemIds.length <= 12 &&
      entry.itemIds.every((id) => typeof id === "string" && id.trim().length > 0 && id.length <= 160),
    )
    .slice(-HISTORY_LIMIT)
    .map((entry) => {
      const feedbackSource = isRecord(entry.feedback) ? entry.feedback : {};
      const feedback = Object.fromEntries(
        Object.entries(FEEDBACK_VALUES).map(([key, allowed]) => [
          key,
          allowed.includes(feedbackSource[key]) ? feedbackSource[key] : "",
        ]),
      );
      const briefSource = isRecord(entry.dayBrief) ? entry.dayBrief : {};
      const dayBrief = Object.fromEntries(
        BRIEF_FIELDS.map((key) => [
          key,
          boundedString(briefSource[key], FIELD_LIMITS[key]),
        ]),
      );
      return {
        id: boundedString(entry.id, 160),
        createdAt: boundedString(entry.createdAt, 80),
        eventId: boundedString(entry.eventId, 80),
        eventLabel: boundedString(entry.eventLabel, 120),
        outfitId: boundedString(entry.outfitId, 160),
        outfitName: boundedString(entry.outfitName, 120) || "Saved look",
        itemIds: entry.itemIds.map((id) => boundedString(id, 160)),
        itemNames: Array.isArray(entry.itemNames)
          ? entry.itemNames.slice(0, 12).map((name) => boundedString(name, 120))
          : [],
        reason: boundedString(entry.reason, 400),
        weather: boundedString(entry.weather, 300),
        formality: boundedString(entry.formality, 240),
        dayBrief,
        feedback,
      };
    });
}

function normalizeState(rawState, defaults, validPlans) {
  if (!isRecord(rawState)) return defaults;

  // The first local slice stored fields at the top level. Keep reading that
  // shape so existing users do not lose their local wardrobe on upgrade.
  const source = isRecord(rawState.data) ? rawState.data : rawState;

  const wardrobe = Array.isArray(source.wardrobe)
    ? source.wardrobe.filter(isUsableWardrobeItem)
    : defaults.wardrobe;
  const plan = validPlans.includes(source.plan) ? source.plan : defaults.plan;
  const brief =
    typeof source.brief === "string" ? source.brief : defaults.brief;
  const options = [2, 3].includes(source.options)
    ? source.options
    : defaults.options;
  const selected =
    typeof source.selected === "string" ? source.selected : null;
  const defaultDayBrief = isRecord(defaults.dayBrief) ? defaults.dayBrief : {};
  const savedDayBrief = isRecord(source.dayBrief) ? source.dayBrief : {};
  const dayBrief = Object.fromEntries(
    Object.entries(defaultDayBrief).map(([key, fallback]) => [
      key,
      typeof savedDayBrief[key] === "string" ? savedDayBrief[key] : fallback,
    ]),
  );
  const settings = normalizeSettings(source.settings, defaults.settings);
  const wearHistory = normalizeWearHistory(source.wearHistory);
  const dayPlan = source.dayPlan && typeof source.dayPlan === "object"
    ? source.dayPlan
    : defaults.dayPlan;

  return {
    wardrobe,
    plan,
    brief,
    options,
    selected,
    dayBrief,
    dayPlan,
    settings,
    wearHistory,
  };
}

export function readLocalState({ defaults, validPlans }) {
  if (typeof window === "undefined") return defaults;

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved
      ? normalizeState(JSON.parse(saved), defaults, validPlans)
      : defaults;
  } catch {
    return defaults;
  }
}

export function writeLocalState(state) {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        data: {
          ...state,
          settings: normalizeSettings(state.settings, DEFAULT_SETTINGS),
          wearHistory: normalizeWearHistory(state.wearHistory),
        },
      }),
    );
    return true;
  } catch {
    return false;
  }
}