const STORAGE_KEY = "wearwell-local-state-v1";
import { normalizeDayPlan, persistedDayPlan } from "./dayPlan.mjs";
import { EMPTY_PROFILE_DETAILS, normalizeProfileDetails } from "./profile.mjs";
import { normalizeWardrobeVisualAttributes } from "../supabase/functions/_shared/wardrobe-vision.js";

const STORAGE_VERSION = 7;
const HISTORY_LIMIT = 200;
const LEGACY_STARTER_BRIEF = "I’m going to work today, then meeting a friend for a walk. I feel good, but I want something easy.";
const LEGACY_STARTER_WARDROBE = [
  { id: "shirt-seafoam", name: "Seafoam linen shirt", type: "Top", tone: "Seafoam", color: "#b7d8cf", icon: "✦", formality: 2, weather: "hot", note: "Relaxed fit · breathable" },
  { id: "trousers-ink", name: "Ink straight-leg trousers", type: "Bottom", tone: "Ink", color: "#26324b", icon: "◒", formality: 3, weather: "all", note: "Clean line · easy movement" },
  { id: "skirt-terracotta", name: "Terracotta wrap skirt", type: "Bottom", tone: "Terracotta", color: "#bd725b", icon: "◐", formality: 2, weather: "hot", note: "Lightweight · adjustable waist" },
  { id: "cardigan-cream", name: "Cream knit cardigan", type: "Layer", tone: "Cream", color: "#e5dbc9", icon: "▱", formality: 2, weather: "cool", note: "Soft hand · AC friendly" },
  { id: "sneakers-white", name: "White everyday sneakers", type: "Shoes", tone: "White", color: "#f3f0e8", icon: "⌁", formality: 1, weather: "all", note: "Already broken in" },
  { id: "loafers-brown", name: "Brown leather loafers", type: "Shoes", tone: "Brown", color: "#7d563e", icon: "⌁", formality: 3, weather: "all", note: "Polished · comfortable" },
];
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
  voiceEnabled: true,
  speechVoiceId: "",
  aiEnabled: true,
  profileReminderDismissed: false,
  shareProfileWithAi: true,
  savedLookRemindersEnabled: false,
  weatherAlertsEnabled: false,
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

function normalizeLocalWardrobeItem(item) {
  const {
    image,
    imageData,
    imageBase64,
    photo,
    rawAiText,
    rawModelText,
    rawAiResponse,
    ...safeItem
  } = item;
  return {
    ...safeItem,
    visualAttributes: normalizeWardrobeVisualAttributes(item.visualAttributes),
  };
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
    speechVoiceId: typeof source.speechVoiceId === "string" && source.speechVoiceId.length <= 300
      ? source.speechVoiceId
      : (fallback.speechVoiceId || DEFAULT_SETTINGS.speechVoiceId),
    aiEnabled: typeof source.aiEnabled === "boolean"
      ? source.aiEnabled
      : (fallback.aiEnabled ?? DEFAULT_SETTINGS.aiEnabled),
    profileReminderDismissed: typeof source.profileReminderDismissed === "boolean"
      ? source.profileReminderDismissed
      : (fallback.profileReminderDismissed ?? DEFAULT_SETTINGS.profileReminderDismissed),
    shareProfileWithAi: typeof source.shareProfileWithAi === "boolean"
      ? source.shareProfileWithAi
      : (fallback.shareProfileWithAi ?? DEFAULT_SETTINGS.shareProfileWithAi),
    savedLookRemindersEnabled: typeof source.savedLookRemindersEnabled === "boolean"
      ? source.savedLookRemindersEnabled
      : (fallback.savedLookRemindersEnabled ?? DEFAULT_SETTINGS.savedLookRemindersEnabled),
    weatherAlertsEnabled: typeof source.weatherAlertsEnabled === "boolean"
      ? source.weatherAlertsEnabled
      : (fallback.weatherAlertsEnabled ?? DEFAULT_SETTINGS.weatherAlertsEnabled),
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
    ? source.wardrobe.filter(isUsableWardrobeItem).map(normalizeLocalWardrobeItem)
    : defaults.wardrobe.map(normalizeLocalWardrobeItem);
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
  const profileDetails = normalizeProfileDetails(source.profileDetails || defaults.profileDetails || EMPTY_PROFILE_DETAILS);
  const wearHistory = normalizeWearHistory(source.wearHistory);
  const dayPlan = normalizeDayPlan(source.dayPlan || defaults.dayPlan, {
    fallbackBrief: brief,
    fallbackOccasion: plan,
  });

  return {
    wardrobe,
    plan,
    brief,
    options,
    selected,
    dayBrief,
    dayPlan,
    settings,
    profileDetails,
    wearHistory,
  };
}

function isUnmodifiedLegacyStarterItem(item) {
  const starter = LEGACY_STARTER_WARDROBE.find((entry) => entry.id === item?.id);
  if (!starter || !isRecord(item)) return false;
  const keys = Object.keys(starter);
  const addedDefaultVisualAttributes =
    Object.keys(item).length === keys.length + 1 &&
    item.visualAttributes?.pattern === "uncertain" &&
    item.visualAttributes?.visibleDetails === "" &&
    item.visualAttributes?.formalityConfirmed === false;
  return (Object.keys(item).length === keys.length || addedDefaultVisualAttributes) &&
    keys.every((key) => item[key] === starter[key]);
}

function clearBriefDetails(dayBrief) {
  if (!isRecord(dayBrief)) return dayBrief;
  return {
    ...dayBrief,
    ...Object.fromEntries(BRIEF_FIELDS.map((field) => [field, ""])),
  };
}

function removeLegacyStarterData(state) {
  if (!isRecord(state)) return state;
  const wardrobe = Array.isArray(state.wardrobe)
    ? state.wardrobe.filter((item) => !isUnmodifiedLegacyStarterItem(item))
    : state.wardrobe;
  const removedStarterItems = Array.isArray(state.wardrobe) && wardrobe.length !== state.wardrobe.length;
  const removedStarterBrief = state.brief === LEGACY_STARTER_BRIEF;
  if (!removedStarterItems && !removedStarterBrief) return state;

  const dayPlan = isRecord(state.dayPlan) && Array.isArray(state.dayPlan.events)
    ? {
        ...state.dayPlan,
        events: state.dayPlan.events.map((event) => {
          if (!isRecord(event)) return event;
          const eventBrief = typeof event.brief === "string" ? event.brief.trim() : "";
          const eventHadStarterBrief = removedStarterBrief && (
            eventBrief === LEGACY_STARTER_BRIEF ||
            (eventBrief.length >= 12 && LEGACY_STARTER_BRIEF.toLowerCase().includes(eventBrief.toLowerCase()))
          );
          return {
            ...event,
            ...(eventHadStarterBrief
              ? { brief: "", dayBrief: clearBriefDetails(event.dayBrief) }
              : {}),
            ...(removedStarterItems
              ? {
                  selectedRecommendation: null,
                  excludedItemSets: [],
                  regenerationReason: "",
                }
              : {}),
          };
        }),
      }
    : state.dayPlan;

  return {
    ...state,
    ...(removedStarterItems ? { wardrobe, selected: null, dayPlan } : { dayPlan }),
    ...(removedStarterBrief
      ? { brief: "", dayBrief: clearBriefDetails(state.dayBrief) }
      : {}),
  };
}

export function readLocalState({ defaults, validPlans }) {
  if (typeof window === "undefined") return defaults;

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved
      ? removeLegacyStarterData(normalizeState(JSON.parse(saved), defaults, validPlans))
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
          wardrobe: Array.isArray(state.wardrobe)
            ? state.wardrobe.filter(isUsableWardrobeItem).map(normalizeLocalWardrobeItem)
            : [],
          dayPlan: persistedDayPlan(state.dayPlan),
          settings: normalizeSettings(state.settings, DEFAULT_SETTINGS),
          profileDetails: normalizeProfileDetails(state.profileDetails),
          wearHistory: normalizeWearHistory(state.wearHistory),
        },
      }),
    );
    return true;
  } catch {
    return false;
  }
}