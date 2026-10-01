function boundedString(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export function historyEventMetadataToCloud(entry) {
  return {
    event_id: boundedString(entry?.eventId, 80) || null,
    event_label: boundedString(entry?.eventLabel, 120) || null,
  };
}

export function historyEventMetadataFromCloud(row) {
  return {
    eventId: boundedString(row?.event_id, 80),
    eventLabel: boundedString(row?.event_label, 120),
  };
}