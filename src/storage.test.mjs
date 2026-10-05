import assert from "node:assert/strict";
import test from "node:test";
import { readLocalState, writeLocalState } from "./storage.js";

const defaults = {
  wardrobe: [{ id: "top", name: "Top", type: "Top", color: "#fff" }],
  plan: "Work",
  brief: "A short brief",
  options: 3,
  selected: null,
  dayBrief: {
    occasion: "Work",
    timeWindow: "",
    duration: "",
    movement: "",
    dressCode: "",
    mood: "",
    comfortNeeds: "",
    coverageNeeds: "",
  },
  settings: {
    temperatureUnit: "C",
    voiceLanguage: "en-GB",
    voiceEnabled: true,
    speechVoiceId: "",
    aiEnabled: true,
    profileReminderDismissed: false,
    shareProfileWithAi: true,
    savedLookRemindersEnabled: false,
    weatherAlertsEnabled: false,
  },
  wearHistory: [],
};

function withLocalStorage(saved, run) {
  const previousWindow = globalThis.window;
  const data = new Map(saved ? [["wearwell-local-state-v1", JSON.stringify(saved)]] : []);
  globalThis.window = {
    localStorage: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, value),
    },
  };
  try {
    run(data);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
}

test("keeps legacy local wardrobe data and enables speech, AI, and profile sharing by default", () => {
  withLocalStorage({
    wardrobe: defaults.wardrobe,
    plan: "Work",
    brief: "A saved brief",
    options: 2,
    selected: "old-look",
  }, () => {
    const state = readLocalState({ defaults, validPlans: ["Work", "Walk"] });
    assert.equal(state.brief, "A saved brief");
    assert.equal(state.selected, "old-look");
    assert.deepEqual(state.settings, defaults.settings);
    assert.deepEqual(state.wearHistory, []);
  });
});

test("defaults profile sharing on for new state but preserves a saved opt-out", () => {
  withLocalStorage(null, () => {
    const state = readLocalState({ defaults, validPlans: ["Work", "Walk"] });
    assert.equal(state.settings.shareProfileWithAi, true);
  });

  withLocalStorage({
    wardrobe: defaults.wardrobe,
    settings: { ...defaults.settings, shareProfileWithAi: false },
  }, () => {
    const state = readLocalState({ defaults, validPlans: ["Work", "Walk"] });
    assert.equal(state.settings.shareProfileWithAi, false);
  });
});

test("removes untouched bundled sample clothes but preserves edited and user-added items", () => {
  const legacyStarterBrief = "I’m going to work today, then meeting a friend for a walk. I feel good, but I want something easy.";
  const bundledShirt = {
    id: "shirt-seafoam",
    name: "Seafoam linen shirt",
    type: "Top",
    tone: "Seafoam",
    color: "#b7d8cf",
    icon: "✦",
    formality: 2,
    weather: "hot",
    note: "Relaxed fit · breathable",
  };
  const editedStarter = { ...bundledShirt, note: "My own fit note" };
  const userItem = { id: "my-coat", name: "My wool coat", type: "Layer", color: "#222" };
  const savedState = {
    version: 5,
    data: {
      ...defaults,
      wardrobe: [bundledShirt, editedStarter, userItem],
      brief: legacyStarterBrief,
      selected: "starter-look",
      dayBrief: { ...defaults.dayBrief, movement: "meeting a friend for a walk" },
      dayPlan: {
        activeEventId: "event-1",
        events: [{
          id: "event-1",
          label: "Work",
          brief: legacyStarterBrief,
          dayBrief: { ...defaults.dayBrief, movement: "meeting a friend for a walk" },
          selectedRecommendation: "starter-look",
          excludedItemSets: ["starter-set"],
          regenerationReason: "different_items",
        }],
      },
      wearHistory: [{
        id: "history-1",
        itemIds: ["my-coat"],
        outfitName: "My look",
      }],
    },
  };

  withLocalStorage(savedState, () => {
    const state = readLocalState({ defaults, validPlans: ["Work", "Walk"] });
    assert.deepEqual(state.wardrobe, [editedStarter, userItem].map((item) => ({
      ...item,
      visualAttributes: {
        pattern: "uncertain",
        visibleDetails: "",
        formalityConfirmed: false,
      },
    })));
    assert.equal(state.brief, "");
    assert.equal(state.dayBrief.movement, "");
    assert.equal(state.selected, null);
    assert.equal(state.dayPlan.events[0].brief, "");
    assert.equal(state.dayPlan.events[0].selectedRecommendation, null);
    assert.deepEqual(state.dayPlan.events[0].excludedItemSets, []);
    assert.equal(state.dayPlan.events[0].regenerationReason, "");
    assert.equal(state.wearHistory[0].id, "history-1");
  });
});

test("normalizes settings and explicit feedback without accepting malformed history", () => {
  withLocalStorage({
    version: 2,
    data: {
      ...defaults,
      settings: {
        temperatureUnit: "F",
        voiceLanguage: "en-GB",
        voiceEnabled: false,
        aiEnabled: true,
        unexpected: "discard",
      },
      wearHistory: [
        {
          id: "wear-1",
          createdAt: "2026-09-30T09:00:00.000Z",
          eventId: "event-2",
          eventLabel: "Birthday dinner",
          outfitId: "look-1",
          outfitName: "Look 01",
          itemIds: ["top", "bottom"],
          itemNames: ["Top", "Bottom"],
          dayBrief: { movement: "Walk" },
          feedback: {
            woreIt: "yes",
            comfort: "good",
            likedColors: "yes",
            wouldWearAgain: "yes",
          },
        },
        { id: "bad-entry", itemIds: "not-an-array" },
      ],
    },
  }, () => {
    const state = readLocalState({ defaults, validPlans: ["Work", "Walk"] });
    assert.deepEqual(state.settings, {
      temperatureUnit: "F",
      voiceLanguage: "en-GB",
      voiceEnabled: false,
      aiEnabled: true,
        speechVoiceId: "",
      profileReminderDismissed: false,
      shareProfileWithAi: true,
        savedLookRemindersEnabled: false,
        weatherAlertsEnabled: false,
    });
    assert.equal(state.wearHistory.length, 1);
    assert.equal(state.wearHistory[0].feedback.woreIt, "yes");
    assert.equal(state.wearHistory[0].dayBrief.movement, "Walk");
    assert.equal(state.wearHistory[0].feedback.comfort, "good");
    assert.equal(state.wearHistory[0].eventId, "event-2");
    assert.equal(state.wearHistory[0].eventLabel, "Birthday dinner");
  });
});

test("local wardrobe persistence keeps confirmed visual details but drops transient photo and model data", () => {
  withLocalStorage(null, (data) => {
    const item = {
      id: "custom-photo-item",
      name: "Blue striped shirt",
      type: "Top",
      tone: "Blue",
      color: "#336699",
      visualAttributes: { pattern: "stripes", visibleDetails: "Long sleeves" },
      imageBase64: "temporary image bytes",
      photo: { name: "shirt.jpg" },
      rawAiText: "temporary unstructured response",
    };
    assert.equal(writeLocalState({ ...defaults, wardrobe: [item] }), true);
    const savedItem = JSON.parse(data.get("wearwell-local-state-v1")).data.wardrobe[0];

    assert.deepEqual(savedItem.visualAttributes, {
      pattern: "stripes",
      visibleDetails: "Long sleeves",
      formalityConfirmed: false,
    });
    assert.equal("imageBase64" in savedItem, false);
    assert.equal("photo" in savedItem, false);
    assert.equal("rawAiText" in savedItem, false);
  });
});

test("writes versioned state and strips invalid settings and feedback", () => {
  withLocalStorage(null, (data) => {
    const state = {
      ...defaults,
      settings: {
        temperatureUnit: "kelvin",
        voiceEnabled: "yes",
        aiEnabled: false,
        speechVoiceId: "en-gb.voice.2",
      },
      wearHistory: [{
        id: "wear-2",
        itemIds: ["top"],
        feedback: { woreIt: "maybe", comfort: "good", likedColors: "yes", wouldWearAgain: "" },
      }],
    };
    assert.equal(writeLocalState(state), true);
    const saved = JSON.parse(data.get("wearwell-local-state-v1"));
    assert.equal(saved.version, 7);
    assert.deepEqual(saved.data.settings, {
      ...defaults.settings,
      aiEnabled: false,
      speechVoiceId: "en-gb.voice.2",
    });
    assert.equal(saved.data.wearHistory[0].feedback.woreIt, "");
    assert.equal(saved.data.wearHistory[0].feedback.comfort, "good");
  });
});

test("persists the active event and event-specific state through local storage", () => {
  const dayPlan = {
    id: "today",
    activeEventId: "event-2",
    events: [
      {
        id: "event-1",
        label: "University",
        brief: "Morning lectures",
        dayBrief: { occasion: "University", timeWindow: "08:00–12:00" },
        selectedRecommendation: "look-a",
        excludedItemSets: ["top\u001fbottom"],
        regenerationReason: "more_comfort",
      },
      {
        id: "event-2",
        label: "Dinner",
        brief: "Dinner with friends",
        dayBrief: { occasion: "Dinner", timeWindow: "19:00–22:00" },
        selectedRecommendation: "look-b",
      },
    ],
  };

  withLocalStorage(null, (data) => {
    assert.equal(writeLocalState({ ...defaults, dayPlan }), true);
    const state = readLocalState({ defaults, validPlans: ["Work", "Walk"] });
    assert.equal(state.dayPlan.activeEventId, "event-2");
    assert.equal(state.dayPlan.events[0].brief, "Morning lectures");
    assert.equal(state.dayPlan.events[0].selectedRecommendation, "look-a");
    assert.deepEqual(state.dayPlan.events[0].excludedItemSets, ["top\u001fbottom"]);
    assert.equal(state.dayPlan.events[1].selectedRecommendation, "look-b");
    const saved = JSON.parse(data.get("wearwell-local-state-v1"));
    assert.equal(saved.data.dayPlan.activeEventId, "event-2");
  });
});