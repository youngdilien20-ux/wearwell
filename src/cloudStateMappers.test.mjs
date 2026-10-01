import assert from "node:assert/strict";
import test from "node:test";
import {
  historyEventMetadataFromCloud,
  historyEventMetadataToCloud,
} from "./cloudStateMappers.mjs";

test("maps event attribution to nullable cloud history columns", () => {
  assert.deepEqual(
    historyEventMetadataToCloud({ eventId: "event-2", eventLabel: "Dinner" }),
    { event_id: "event-2", event_label: "Dinner" },
  );
  assert.deepEqual(
    historyEventMetadataToCloud({ eventId: "", eventLabel: "" }),
    { event_id: null, event_label: null },
  );
});

test("loads nullable legacy history metadata without losing event attribution", () => {
  assert.deepEqual(
    historyEventMetadataFromCloud({ event_id: "event-2", event_label: "Dinner" }),
    { eventId: "event-2", eventLabel: "Dinner" },
  );
  assert.deepEqual(
    historyEventMetadataFromCloud({ event_id: null, event_label: null }),
    { eventId: "", eventLabel: "" },
  );
});