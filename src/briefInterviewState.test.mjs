import assert from "node:assert/strict";
import test from "node:test";
import { resolveInterviewTransition } from "../supabase/functions/_shared/briefInterviewState.mjs";

test("a submitted reply cannot trigger the same field again", () => {
  const transition = resolveInterviewTransition({
    action: "reply",
    currentField: "occasion",
    latestAnswer: "A long shift at a mine",
    resolvedFields: [],
    proposedNextField: "occasion",
    answers: { occasion: "Work" },
  });

  assert.equal(transition.nextField, null);
  assert.equal(transition.suppressDuplicateQuestion, true);
  assert.deepEqual(transition.resolvedFields, ["occasion"]);
});

test("the assistant can ask a different unresolved question", () => {
  const transition = resolveInterviewTransition({
    action: "reply",
    currentField: "occasion",
    latestAnswer: "A long shift at a mine",
    resolvedFields: [],
    proposedNextField: "timeWindow",
    answers: { occasion: "Work" },
  });

  assert.equal(transition.nextField, "timeWindow");
  assert.equal(transition.suppressDuplicateQuestion, false);
});

test("a direct request for outfit options ends the interview", () => {
  const transition = resolveInterviewTransition({
    action: "reply",
    currentField: "timeWindow",
    latestAnswer: "Show me my recommendations",
    resolvedFields: ["occasion"],
    proposedNextField: "movement",
    answers: { occasion: "Work" },
  });

  assert.equal(transition.nextField, null);
  assert.equal(transition.readyToProceed, true);
});