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
    voiceEnabled: false,
    aiEnabled: false,
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

test("keeps legacy local wardrobe data and supplies safe opt-in defaults", () => {
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
    });
    assert.equal(state.wearHistory.length, 1);
    assert.equal(state.wearHistory[0].feedback.woreIt, "yes");
    assert.equal(state.wearHistory[0].dayBrief.movement, "Walk");
    assert.equal(state.wearHistory[0].feedback.comfort, "good");
  });
});

test("writes versioned state and strips invalid settings and feedback", () => {
  withLocalStorage(null, (data) => {
    const state = {
      ...defaults,
      settings: { temperatureUnit: "kelvin", voiceEnabled: "yes", aiEnabled: false },
      wearHistory: [{
        id: "wear-2",
        itemIds: ["top"],
        feedback: { woreIt: "maybe", comfort: "good", likedColors: "yes", wouldWearAgain: "" },
      }],
    };
    assert.equal(writeLocalState(state), true);
    const saved = JSON.parse(data.get("wearwell-local-state-v1"));
    assert.equal(saved.version, 4);
    assert.deepEqual(saved.data.settings, defaults.settings);
    assert.equal(saved.data.wearHistory[0].feedback.woreIt, "");
    assert.equal(saved.data.wearHistory[0].feedback.comfort, "good");
  });
});