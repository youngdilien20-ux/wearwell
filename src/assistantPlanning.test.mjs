import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSISTANT_INTERVIEW_FIELD_KEYS,
  ASSISTANT_INTERVIEW_FIELD_LIMITS,
  buildAssistantConversationFromBrief,
  buildAssistantConversationFromMessages,
  buildAssistantRequestPayload,
  classifyAssistantFollowUp,
  classifyRecommendationIntent,
  normalizeAssistantInterviewAnswers,
  parseAssistantResponse,
} from "./assistantPlanning.mjs";

const emptyFields = {
  timeWindow: "",
  duration: "",
  movement: "",
  dressCode: "",
  mood: "",
  comfortNeeds: "",
  coverageNeeds: "",
};

test("long briefs are sent as bounded user turns for the assistant interview", () => {
  const brief = `${"I am going to the field to plant tomatoes. ".repeat(18)}`.trim();
  const conversation = buildAssistantConversationFromBrief(brief);

  assert.ok(conversation.length > 1);
  assert.ok(conversation.every((turn) => turn.role === "user" && turn.text.length <= 360));
  assert.equal(
    conversation.map((turn) => turn.text).join(" ").replace(/\s+/g, " "),
    brief.replace(/\s+/g, " "),
  );
});

test("assistant interview does not silently truncate an oversized brief", () => {
  assert.deepEqual(buildAssistantConversationFromBrief("x".repeat(1501)), []);
  assert.deepEqual(buildAssistantConversationFromBrief("  "), []);
});

test("follow-up history stays within the interview function's turn and text limits", () => {
  const conversation = buildAssistantConversationFromMessages([
    { role: "user", text: "x".repeat(1500) },
    { role: "assistant", text: "Will you be outdoors?" },
    { role: "user", text: "Yes, for most of the afternoon." },
  ]);

  assert.ok(conversation.length <= 8);
  assert.ok(conversation.every((turn) => turn.text.length > 0 && turn.text.length <= 360));
  assert.ok(conversation.reduce((total, turn) => total + turn.text.length, 0) <= 2880);
  assert.equal(conversation.at(-1).text, "Yes, for most of the afternoon.");
});

test("assistant interview answers use one shared allowlist and field limits", () => {
  const answers = normalizeAssistantInterviewAnswers({
    occasion: "o".repeat(150),
    timeWindow: "t".repeat(100),
    duration: "d".repeat(100),
    movement: "m".repeat(200),
    dressCode: "c".repeat(140),
    mood: "m".repeat(150),
    comfortNeeds: "c".repeat(200),
    coverageNeeds: "v".repeat(150),
    unexpectedField: "ignore this field",
  });

  assert.deepEqual(Object.keys(answers), ASSISTANT_INTERVIEW_FIELD_KEYS);
  for (const [key, limit] of Object.entries(ASSISTANT_INTERVIEW_FIELD_LIMITS)) {
    assert.equal(answers[key].length, limit);
  }
  assert.equal(
    normalizeAssistantInterviewAnswers({ timeWindow: "  Afternoon  " }).timeWindow,
    "Afternoon",
  );
  assert.equal("unexpectedField" in answers, false);
});

test("understands natural approval, hesitation, and added details after the interview", () => {
  assert.equal(classifyRecommendationIntent("Could you show me the looks now?"), "approve");
  assert.equal(classifyRecommendationIntent("I'm ready to see what you found."), "approve");
  assert.equal(classifyRecommendationIntent("Not yet, I have one more thing."), "wait");
  assert.equal(classifyRecommendationIntent("I need something less formal."), "add-detail");
});

test("assistant context contains only the active deterministic look's actual item names", () => {
  const payload = buildAssistantRequestPayload({
    brief: "University in the morning",
    occasion: "University",
    voiceLanguage: "en-GB",
    weather: { tempC: 24, conditionLabel: "sunny", source: "Open-Meteo" },
    weatherStatus: "live",
    candidate: {
      id: "private-candidate-id",
      itemIds: ["owned-shirt", "owned-trousers"],
      reason: "Recorded movement needs are supported.",
      weather: "Live forecast aligns with saved item notes.",
      formality: "Suitable for the stated occasion.",
    },
    activeEvent: {
      label: "University in the morning",
      timeWindow: "8–11 am",
      dayBrief: { occasion: "University", timeWindow: "8–11 am" },
    },
    dayContext: [
      { label: "University", timeWindow: "8–11 am" },
      { label: "Lunch with friends", timeWindow: "1–2 pm" },
      { label: "Birthday dinner", timeWindow: "7–9 pm" },
    ],
    followUpMessage: "Make the university look smarter",
    wardrobeById: {
      "owned-shirt": { id: "owned-shirt", name: "My blue shirt" },
      "owned-trousers": { id: "owned-trousers", name: "Black trousers" },
      unrelated: { id: "unrelated", name: "Unselected coat" },
    },
  });

  assert.deepEqual(payload.candidate.itemNames, ["My blue shirt", "Black trousers"]);
  assert.equal(JSON.stringify(payload).includes("private-candidate-id"), false);
  assert.equal(JSON.stringify(payload).includes("Unselected coat"), false);
  assert.equal(payload.weather.tempC, 24);
  assert.equal(payload.weather.isFallback, false);
  assert.deepEqual(payload.eventContext, {
    label: "University",
    timeWindow: "8–11 am",
  });
  assert.deepEqual(payload.dayContext, [
    { label: "University", timeWindow: "8–11 am" },
    { label: "Lunch with friends", timeWindow: "1–2 pm" },
    { label: "Birthday dinner", timeWindow: "7–9 pm" },
  ]);
  assert.equal(payload.followUpMessage, "Make the university look smarter");
  assert.equal("profile" in payload, false);
});

test("sample or unavailable weather is not sent to AI as a fact", () => {
  const payload = buildAssistantRequestPayload({
    brief: "Dinner",
    occasion: "Dinner",
    voiceLanguage: "en-GB",
    weather: {
      tempC: 26,
      rainProbability: 18,
      windKph: 8,
      uvIndex: 5,
      conditionLabel: "sample conditions",
      source: "Deterministic fallback",
      isFallback: true,
    },
    weatherStatus: "fallback",
    candidate: {
      itemIds: ["owned-shirt"],
      reason: "Sample only, not a live forecast. Looks good at 26°C.",
      weather: "Sample only, 26°C.",
      formality: "Suitable.",
    },
    wardrobeById: { "owned-shirt": { name: "My shirt" } },
  });

  assert.equal(payload.weather.tempC, null);
  assert.equal(payload.weather.rainProbability, null);
  assert.equal(payload.weather.isFallback, true);
  assert.equal(payload.weather.conditionLabel, "Weather unavailable");
  assert.equal(payload.candidate.reason.includes("26"), false);
  assert.equal(payload.candidate.weather.includes("26"), false);
});

test("valid AI responses are accepted without changing recommendation data", () => {
  const response = parseAssistantResponse({
    mode: "ai",
    fields: { ...emptyFields, timeWindow: "Morning" },
    followUpQuestion: "Will you be outdoors?",
    explanation: "The supplied look uses only the listed wardrobe items.",
  });

  assert.equal(response.mode, "ai");
  assert.equal(response.fields.timeWindow, "Morning");
  assert.equal(response.followUpQuestion, "Will you be outdoors?");
  assert.equal(response.fields.duration, "");
});

test("malformed AI output becomes an explicit deterministic fallback", () => {
  const response = parseAssistantResponse({
    mode: "ai",
    fields: { ...emptyFields, movement: { invented: true } },
    followUpQuestion: "",
    explanation: "Invalid field",
  });

  assert.equal(response.mode, "fallback");
  assert.equal(response.fields, null);
  assert.match(response.explanation, /could not be validated/i);
});

test("edge-function fallback response is displayed as a fallback", () => {
  const response = parseAssistantResponse({
    mode: "fallback",
    fields: null,
    followUpQuestion: "",
    explanation: "Gemini is not configured.",
  });

  assert.equal(response.mode, "fallback");
  assert.equal(response.explanation, "Gemini is not configured.");
});

test("follow-up outfit requests use deterministic regeneration reasons", () => {
  assert.deepEqual(classifyAssistantFollowUp("Make the dinner look smarter"), {
    kind: "regenerate",
    reason: "more_formal",
  });
  assert.deepEqual(classifyAssistantFollowUp("Change my mind"), {
    kind: "regenerate",
    reason: "different_items",
  });
  assert.deepEqual(classifyAssistantFollowUp("What does this outfit work well for?"), {
    kind: "assistant",
    reason: "",
  });
});

test("empty assistant follow-ups do not produce an action", () => {
  assert.deepEqual(classifyAssistantFollowUp("   "), { kind: "empty", reason: "" });
});