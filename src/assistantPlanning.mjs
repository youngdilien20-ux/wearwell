import { profileDetailsForAssistant } from "./profile.mjs";

export const ASSISTANT_FIELD_LIMITS = Object.freeze({
  timeWindow: 80,
  duration: 80,
  movement: 160,
  dressCode: 100,
  mood: 120,
  comfortNeeds: 160,
  coverageNeeds: 120,
});

function splitAssistantConversationMessage(role, value) {
  if (role !== "user" && role !== "assistant") return null;
  if (typeof value !== "string") return null;
  let remaining = value.trim();
  if (!remaining || remaining.length > 1500) return null;

  const conversation = [];
  while (remaining) {
    let end = Math.min(360, remaining.length);
    if (end < remaining.length) {
      const wordBoundary = remaining.lastIndexOf(" ", end);
      if (wordBoundary > 0) end = wordBoundary;
    }
    const text = remaining.slice(0, end).trim();
    if (!text) return null;
    conversation.push({ role, text });
    remaining = remaining.slice(end).trimStart();
  }

  return conversation;
}

export function buildAssistantConversationFromBrief(value) {
  return splitAssistantConversationMessage("user", value) || [];
}

export function buildAssistantConversationFromMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const conversation = [];
  for (const message of messages.slice(-8)) {
    if (!message || typeof message !== "object") return [];
    const turns = splitAssistantConversationMessage(message.role, message.text);
    if (!turns) return [];
    conversation.push(...turns);
  }
  return conversation.slice(-8);
}

const VOICE_LANGUAGES = new Set(["en-GB", "en-US", "fr-FR", "pt-PT", "es-ES"]);
const FALLBACK_EXPLANATION =
  "AI planning could not be completed. Your local brief and deterministic wardrobe recommendations remain available.";
const REGENERATION_INTENTS = [
  { reason: "different_shoes", pattern: /\b(?:different shoes|change (?:my|the) shoes)\b/i },
  { reason: "more_formal", pattern: /\b(?:smarter|more polished|more formal|dressier|dress it up)\b/i },
  { reason: "more_casual", pattern: /\b(?:more casual|less formal|more relaxed)\b/i },
  { reason: "more_color", pattern: /\b(?:more colou?r|brighter colours?|brighter colors?)\b/i },
  { reason: "less_attention", pattern: /\b(?:less attention|more subtle|less noticeable)\b/i },
  { reason: "more_comfort", pattern: /\b(?:more comfort|more comfortable|comfier)\b/i },
  { reason: "different_items", pattern: /\b(?:change my mind|something different|different (?:look|outfit|items?)|another (?:look|outfit))\b/i },
];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function boundedNumber(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function fallback(explanation = FALLBACK_EXPLANATION) {
  return {
    mode: "fallback",
    fields: null,
    followUpQuestion: "",
    explanation,
  };
}

export function classifyAssistantFollowUp(value) {
  const message = text(value, 300);
  if (!message) return { kind: "empty", reason: "" };
  const intent = REGENERATION_INTENTS.find(({ pattern }) => pattern.test(message));
  return intent
    ? { kind: "regenerate", reason: intent.reason }
    : { kind: "assistant", reason: "" };
}

export function classifyRecommendationIntent(value) {
  const message = text(value, 300);
  if (!message) return "add-detail";

  if (/\b(?:not yet|wait|hold on|give me (?:a )?(?:moment|minute)|one more thing|another question|i have more|i(?:'d| would) like to add|i need to add|not ready|let me think|i(?:'m| am) still thinking|repeat that|say that again|don't show|do not show)\b/i.test(message)) {
    return "wait";
  }

  if (/\b(?:go ahead|show(?: me)?|let(?:'s| us) see|see(?: the| my| our| those| them| what you| what we)?|view(?: the| my| our| those)?|display|bring (?:them|it) up|look at|ready(?: now)?|i(?:'m| am) ready|i(?:'m| am) done|that's all|that is all|all set|yes|yeah|yep|sure|okay|ok|please do|proceed|finish)\b/i.test(message)) {
    return "approve";
  }

  return "add-detail";
}

export function buildAssistantRequestPayload({
  brief,
  occasion,
  voiceLanguage,
  weather,
  weatherStatus,
  candidate,
  wardrobeById,
  activeEvent,
  dayContext,
  followUpMessage,
  profileDetails,
  shareProfileWithAi,
}) {
  const verifiedWeather = weatherStatus === "live" && weather?.isFallback !== true;
  const profileContext = shareProfileWithAi === true
    ? profileDetailsForAssistant(profileDetails)
    : {};
  const itemNames = (Array.isArray(candidate?.itemIds) ? candidate.itemIds : [])
    .map((itemId) => text(wardrobeById?.[itemId]?.name, 120))
    .filter(Boolean)
    .slice(0, 8);

  return {
    brief: text(brief, 1500),
    occasion: text(occasion, 120),
    voiceLanguage: VOICE_LANGUAGES.has(voiceLanguage) ? voiceLanguage : "en-GB",
    eventContext: {
      label: text(
        activeEvent?.dayBrief?.occasion || activeEvent?.label || occasion,
        120,
      ),
      timeWindow: text(
        activeEvent?.dayBrief?.timeWindow || activeEvent?.timeWindow,
        80,
      ),
    },
    dayContext: (Array.isArray(dayContext) ? dayContext : [])
      .slice(0, 8)
      .map((event) => ({
        label: text(event?.dayBrief?.occasion || event?.label, 120),
        timeWindow: text(event?.dayBrief?.timeWindow || event?.timeWindow, 80),
      }))
      .filter((event) => event.label || event.timeWindow),
    followUpMessage: text(followUpMessage, 300),
    weather: {
      tempC: verifiedWeather ? boundedNumber(weather?.tempC, -90, 60) : null,
      rainProbability: verifiedWeather ? boundedNumber(weather?.rainProbability, 0, 100) : null,
      windKph: verifiedWeather ? boundedNumber(weather?.windKph, 0, 500) : null,
      uvIndex: verifiedWeather ? boundedNumber(weather?.uvIndex, 0, 30) : null,
      conditionLabel: verifiedWeather ? text(weather?.conditionLabel, 100) || "unknown" : "Weather unavailable",
      source: verifiedWeather ? text(weather?.source, 100) || "unknown" : "No verified weather source",
      isFallback: !verifiedWeather,
    },
    candidate: {
      itemNames,
      reason: verifiedWeather
        ? text(candidate?.reason, 400)
        : "This deterministic outfit uses the stated event brief and real wardrobe items; no live weather data is available.",
      weather: verifiedWeather
        ? text(candidate?.weather, 300)
        : "No verified weather information is available for this event.",
      formality: text(candidate?.formality, 240),
    },
    ...(Object.keys(profileContext).length > 0 ? { profileContext } : {}),
  };
}

export function parseAssistantResponse(payload) {
  if (!isRecord(payload)) {
    return fallback("The AI response could not be validated. Your deterministic wardrobe recommendations remain available.");
  }

  if (payload.mode === "fallback") {
    return fallback(text(payload.explanation, 400) || FALLBACK_EXPLANATION);
  }

  if (payload.mode !== "ai" || !isRecord(payload.fields)) {
    return fallback("The AI response could not be validated. Your deterministic wardrobe recommendations remain available.");
  }

  const fields = {};
  for (const [key, limit] of Object.entries(ASSISTANT_FIELD_LIMITS)) {
    const value = payload.fields[key];
    if (typeof value !== "string" || value.trim().length > limit) {
      return fallback("The AI response could not be validated. Your deterministic wardrobe recommendations remain available.");
    }
    fields[key] = value.trim();
  }

  if (
    typeof payload.followUpQuestion !== "string" ||
    payload.followUpQuestion.trim().length > 240 ||
    typeof payload.explanation !== "string" ||
    payload.explanation.trim().length > 400
  ) {
    return fallback("The AI response could not be validated. Your deterministic wardrobe recommendations remain available.");
  }

  return {
    mode: "ai",
    fields,
    followUpQuestion: payload.followUpQuestion.trim(),
    explanation: payload.explanation.trim(),
  };
}