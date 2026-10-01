import assert from "node:assert/strict";
import test from "node:test";
import { extractDayBrief } from "./dayBrief.mjs";

test("uses the selected occasion and extracts only stated activity, mood, and unknowns", () => {
  const brief = extractDayBrief(
    "I’m going to work today, then meeting a friend for a walk. I feel good, but I want something easy.",
    "Work",
  );

  assert.equal(brief.occasion, "Work");
  assert.equal(brief.movement, "Walk");
  assert.equal(brief.mood, "Good");
  assert.equal(brief.timeWindow, "");
  assert.equal(brief.duration, "");
  assert.equal(brief.dressCode, "");
  assert.equal(brief.comfortNeeds, "");
});

test("extracts explicit schedule, dress code, comfort, and coverage details", () => {
  const brief = extractDayBrief(
    "The event is from 18:00 to 20:00 for 2 hours. Dress code is smart casual. I need my shoulders covered and room to move.",
    "Friends",
  );

  assert.equal(brief.timeWindow, "18:00–20:00");
  assert.equal(brief.duration, "2 hours");
  assert.equal(brief.dressCode, "Smart casual");
  assert.equal(brief.coverageNeeds, "My shoulders covered");
  assert.equal(brief.comfortNeeds, "Room to move");
});

test("does not turn a negated dress-code phrase into a requirement", () => {
  const brief = extractDayBrief("I do not want a formal outfit; keep it comfortable.", "Work");

  assert.equal(brief.dressCode, "");
  assert.equal(brief.comfortNeeds, "Comfortable");
});
