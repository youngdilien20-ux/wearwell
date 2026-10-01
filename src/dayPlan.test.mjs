import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeDayPlan,
  parseDayPlan,
  persistedDayPlan,
  updateDayPlanEvent,
} from "./dayPlan.mjs";

test("keeps one ordinary brief as one clothing event", () => {
  const plan = parseDayPlan("I am going to university and want something easy.", "Work");
  assert.equal(plan.events.length, 1);
  assert.equal(plan.events[0].label, "Work");
  assert.equal(plan.events[0].dayBrief.movement, "");
});

test("parses three timed clothing situations from one natural brief", () => {
  const plan = parseDayPlan(
    "08:00–12:00 university\n13:00–17:00 town with friends\n19:00–22:00 birthday dinner",
    "Work",
  );

  assert.equal(plan.events.length, 3);
  assert.deepEqual(plan.events.map((event) => event.timeWindow), [
    "08:00–12:00",
    "13:00–17:00",
    "19:00–22:00",
  ]);
  assert.deepEqual(plan.events.map((event) => event.label), [
    "university",
    "town with friends",
    "birthday dinner",
  ]);
  assert.deepEqual(plan.events.map((event) => event.dayBrief.occasion), [
    "University",
    "Town with friends",
    "Birthday dinner",
  ]);
});

test("does not interpret ordinary comma-separated prose as multiple events", () => {
  const plan = parseDayPlan(
    "I am going to work, then meeting a friend, and I want something easy.",
    "Work",
  );

  assert.equal(plan.events.length, 1);
  assert.equal(plan.events[0].label, "Work");
});

test("parses line- and semicolon-separated events and keeps each raw event brief", () => {
  const linePlan = parseDayPlan("08:00–12:00 University\n13:00–17:00 Walk with friends", "Work");
  const plainLinePlan = parseDayPlan("Morning class\nEvening dinner", "Work");
  const semicolonPlan = parseDayPlan("Morning class; evening dinner", "Work");

  assert.equal(linePlan.events.length, 2);
  assert.equal(linePlan.events[0].brief, "08:00–12:00 University");
  assert.equal(linePlan.events[1].brief, "13:00–17:00 Walk with friends");
  assert.deepEqual(plainLinePlan.events.map((event) => event.label), ["Morning class", "Evening dinner"]);
  assert.deepEqual(semicolonPlan.events.map((event) => event.label), ["Morning class", "evening dinner"]);
});

test("parses comma-separated events when each segment names a clothing situation", () => {
  const plan = parseDayPlan(
    "Class in the morning, meeting friends in the afternoon, birthday dinner at night.",
    "Work",
  );

  assert.deepEqual(plan.events.map((event) => event.dayBrief.occasion), [
    "Class in the morning",
    "Meeting friends in the afternoon",
    "Birthday dinner at night",
  ]);
});

test("preserves event selections when the brief is edited", () => {
  const first = parseDayPlan("08:00–12:00 university\n19:00–22:00 dinner", "Work");
  first.events[0].selectedRecommendation = "look-a";
  const next = parseDayPlan(
    "08:00–12:00 university\n19:00–22:00 dinner",
    "Work",
    first,
  );

  assert.equal(next.events[0].selectedRecommendation, "look-a");
  assert.equal(next.events[1].selectedRecommendation, null);
});

test("updates one event without changing the other event", () => {
  const plan = parseDayPlan("08:00–12:00 university\n19:00–22:00 dinner", "Work");
  const next = updateDayPlanEvent(plan, "event-2", (event) => ({
    ...event,
    selectedRecommendation: "look-b",
  }));

  assert.equal(next.events[0].selectedRecommendation, null);
  assert.equal(next.events[1].selectedRecommendation, "look-b");
});

test("normalizes a persisted day plan and keeps wardrobe references as IDs", () => {
  const plan = normalizeDayPlan({
    events: [{
      id: "event-1",
      label: "University",
      timeWindow: "08:00–12:00",
      dayBrief: { occasion: "University" },
      selectedRecommendation: "wardrobe-top--bottom",
    }],
  }, { fallbackBrief: "fallback", fallbackOccasion: "Work" });
  const saved = persistedDayPlan(plan);

  assert.equal(saved.events[0].selectedRecommendation, "wardrobe-top--bottom");
  assert.deepEqual(saved.events[0].dayBrief.occasion, "University");
  assert.equal(Object.hasOwn(saved.events[0], "wardrobe"), false);
});

test("persists the active event and each event's recommendation state and context", () => {
  const plan = parseDayPlan("08:00–12:00 university\n19:00–22:00 dinner", "Work");
  plan.activeEventId = "event-2";
  plan.events[0].brief = "University in the morning";
  plan.events[0].selectedRecommendation = "look-a";
  plan.events[0].excludedItemSets = ["top\u001fbottom"];
  plan.events[0].regenerationReason = "more_comfort";

  const restored = normalizeDayPlan(persistedDayPlan(plan));

  assert.equal(restored.activeEventId, "event-2");
  assert.equal(restored.events[0].brief, "University in the morning");
  assert.equal(restored.events[0].selectedRecommendation, "look-a");
  assert.deepEqual(restored.events[0].excludedItemSets, ["top\u001fbottom"]);
  assert.equal(restored.events[0].regenerationReason, "more_comfort");
  assert.equal(restored.events[1].selectedRecommendation, null);
});