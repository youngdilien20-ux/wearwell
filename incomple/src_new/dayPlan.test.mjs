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