import { extractDayBrief } from "./dayBrief.mjs";

const BRIEF_FIELDS = [
  "occasion",
  "timeWindow",
  "duration",
  "movement",
  "dressCode",
  "mood",
  "comfortNeeds",
  "coverageNeeds",
];

const FIELD_LIMITS = Object.freeze({
  occasion: 120,
  timeWindow: 80,
  duration: 80,
  movement: 160,
  dressCode: 100,
  mood: 120,
  comfortNeeds: 160,
  coverageNeeds: 120,
});

const EVENT_LIMIT = 8;
const TIME_RANGE_PATTERN =
  /(\d{1,2}(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:–|—|-|to)\s*(\d{1,2}(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)?)/gi;

function boundedString(value, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeTime(value) {
  return boundedString(value, 40).replace(/\s*(a\.?m\.?|p\.?m\.?)$/i, (_, period) =>
    " " + period.replace(/\./g, "").toLowerCase(),
  );
}

function normalizeTimeWindow(start, end) {
  return normalizeTime(start) + "–" + normalizeTime(end);
}

function cleanEventLabel(value, fallback) {
  const cleaned = boundedString(value, 120)
    .replace(/^[\s,;:.\-–—]+/, "")
    .replace(/^(?:and|then|after that)\s+/i, "")
    .replace(/[,\.;:]+$/, "")
    .trim();
  return cleaned || fallback;
}

function titleCaseLabel(value) {
  const text = boundedString(value, 120);
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

function eventKey(event) {
  return [
    boundedString(event?.timeWindow, 80).toLowerCase(),
    boundedString(event?.label || event?.title || event?.description, 120).toLowerCase(),
  ].join("|");
}

function normalizeBrief(value, fallback) {
  const source = value && typeof value === "object" ? value : {};
  const defaultBrief = fallback && typeof fallback === "object" ? fallback : {};
  return Object.fromEntries(
    BRIEF_FIELDS.map((key) => [
      key,
      boundedString(source[key] ?? defaultBrief[key], FIELD_LIMITS[key]),
    ]),
  );
}

function carryEventState(nextEvent, previousEvent) {
  if (!previousEvent) return nextEvent;
  return {
    ...nextEvent,
    id: previousEvent.id || nextEvent.id,
    selectedRecommendation:
      typeof previousEvent.selectedRecommendation === "string"
        ? previousEvent.selectedRecommendation
        : null,
    excludedItemSets: Array.isArray(previousEvent.excludedItemSets)
      ? previousEvent.excludedItemSets.filter((value) => typeof value === "string").slice(-80)
      : [],
    regenerationReason:
      typeof previousEvent.regenerationReason === "string" ? previousEvent.regenerationReason : "",
  };
}

function eventFromSegment(segment, index, fallbackOccasion) {
  const text = boundedString(segment.text, 500).replace(/\s+/g, " ");
  const label = cleanEventLabel(segment.label, fallbackOccasion || `Event ${index + 1}`);
  const brief = extractDayBrief(text, titleCaseLabel(label));
  if (segment.timeWindow) brief.timeWindow = segment.timeWindow;
  return {
    id: `event-${index + 1}`,
    label,
    description: label,
    brief: text,
    timeWindow: brief.timeWindow,
    dayBrief: brief,
    recommendations: [],
    selectedRecommendation: null,
    excludedItemSets: [],
    regenerationReason: "",
  };
}

function segmentsFromTimedText(text) {
  const matches = [...text.matchAll(TIME_RANGE_PATTERN)];
  if (matches.length < 2) return [];
  return matches.slice(0, EVENT_LIMIT).map((match, index) => {
    const nextMatch = matches[index + 1];
    const end = nextMatch?.index ?? text.length;
    const label = text.slice(match.index + match[0].length, end);
    return {
      text: match[0] + " " + label,
      label,
      timeWindow: normalizeTimeWindow(match[1], match[2]),
    };
  });
}

function segmentsFromLines(text) {
  const segments = text
    .split(/\s*(?:\n|;)\s*/)
    .map((value) => value.trim())
    .filter(Boolean);
  return segments.length > 1 && segments.length <= EVENT_LIMIT
    ? segments.map((segment) => ({ text: segment, label: segment, timeWindow: "" }))
    : [];
}

function segmentsFromCommaText(text) {
  const segments = text
    .split(/\s*,\s*/)
    .map((value) => value.trim())
    .filter(Boolean);
  const eventSignals =
    /\b(?:morning|afternoon|evening|night|class|lecture|meeting|dinner|lunch|breakfast|friends?|work|school|university|shopping|church|party|appointment)\b/i;
  return segments.length >= 3 && segments.length <= EVENT_LIMIT && segments.every((segment) => eventSignals.test(segment))
    ? segments.map((segment) => ({ text: segment, label: segment, timeWindow: "" }))
    : [];
}

export function parseDayPlan(rawText, selectedOccasion = "", previousPlan = null) {
  const text = typeof rawText === "string" ? rawText.trim() : "";
  const timedSegments = segmentsFromTimedText(text);
  const lineSegments = segmentsFromLines(text);
  const segments = timedSegments.length
    ? timedSegments
    : (lineSegments.length ? lineSegments : segmentsFromCommaText(text));
  const sourceSegments = segments.length
    ? segments
    : [{ text, label: selectedOccasion || "Your next wear", timeWindow: "" }];
  const previousByKey = new Map(
    (previousPlan?.events || []).map((event) => [eventKey(event), event]),
  );

  const events = sourceSegments.map((segment, index) => {
    const nextEvent = eventFromSegment(segment, index, selectedOccasion);
    return carryEventState(nextEvent, previousByKey.get(eventKey(nextEvent)));
  });

  return {
    id: "today",
    activeEventId: events.some((event) => event.id === previousPlan?.activeEventId)
      ? previousPlan.activeEventId
      : events[0]?.id || "event-1",
    events,
  };
}

export function normalizeDayPlan(
  value,
  { fallbackBrief = "", fallbackOccasion = "", legacySelected = null } = {},
) {
  if (!value || typeof value !== "object" || !Array.isArray(value.events) || value.events.length === 0) {
    const plan = parseDayPlan(fallbackBrief, fallbackOccasion);
    if (legacySelected && plan.events[0]) {
      plan.events[0].selectedRecommendation = legacySelected;
    }
    return plan;
  }

  const fallbackPlan = typeof fallbackBrief === "string" && fallbackBrief.trim()
    ? parseDayPlan(fallbackBrief, fallbackOccasion, value)
    : null;
  const events = value.events.slice(0, EVENT_LIMIT).map((source, index) => {
    const dayBrief = normalizeBrief(source?.dayBrief, {
      occasion: source?.label || source?.title || fallbackOccasion,
      timeWindow: source?.timeWindow,
    });
    const label = boundedString(source?.label || source?.title || dayBrief.occasion, 120) || `Event ${index + 1}`;
    const fallbackEvent = fallbackPlan?.events.find((event) => eventKey(event) === eventKey({
      ...source,
      label,
      timeWindow: source?.timeWindow || dayBrief.timeWindow,
    })) || fallbackPlan?.events[index];
    return {
      id: boundedString(source?.id, 80) || `event-${index + 1}`,
      label,
      description: boundedString(source?.description || label, 200),
      brief: boundedString(
        source?.brief ||
          fallbackEvent?.brief ||
          (value.events.length === 1 ? fallbackBrief : source?.description || label),
        500,
      ),
      timeWindow: boundedString(source?.timeWindow || dayBrief.timeWindow, 80),
      dayBrief,
      recommendations: [],
      selectedRecommendation:
        typeof source?.selectedRecommendation === "string" ? source.selectedRecommendation : null,
      excludedItemSets: Array.isArray(source?.excludedItemSets)
        ? source.excludedItemSets.filter((item) => typeof item === "string").slice(-80)
        : [],
      regenerationReason:
        typeof source?.regenerationReason === "string" ? source.regenerationReason : "",
    };
  });

  if (legacySelected && events.length === 1 && !events[0].selectedRecommendation) {
    events[0].selectedRecommendation = legacySelected;
  }
  const activeEventId = events.some((event) => event.id === value.activeEventId)
    ? value.activeEventId
    : events[0]?.id || "event-1";
  return { id: boundedString(value.id, 80) || "today", activeEventId, events };
}

export function eventStateFor(plan, eventId) {
  return plan?.events?.find((event) => event.id === eventId) || plan?.events?.[0] || null;
}

export function updateDayPlanEvent(plan, eventId, updater) {
  const events = Array.isArray(plan?.events) ? plan.events : [];
  return {
    ...(plan || { id: "today" }),
    events: events.map((event) => (event.id === eventId ? updater(event) : event)),
  };
}

export function persistedDayPlan(plan) {
  const events = (Array.isArray(plan?.events) ? plan.events : []).map((event, index) => ({
    id: event.id || `event-${index + 1}`,
    label: boundedString(event.label, 120),
    description: boundedString(event.description || event.label, 200),
    brief: boundedString(event.brief, 500),
    timeWindow: boundedString(event.timeWindow, 80),
    dayBrief: normalizeBrief(event.dayBrief, {}),
    selectedRecommendation:
      typeof event.selectedRecommendation === "string" ? event.selectedRecommendation : null,
    excludedItemSets: Array.isArray(event.excludedItemSets)
      ? event.excludedItemSets.filter((value) => typeof value === "string").slice(-80)
      : [],
    regenerationReason: boundedString(event.regenerationReason, 40),
  }));
  const activeEventId = events.some((event) => event.id === plan?.activeEventId)
    ? plan.activeEventId
    : events[0]?.id || "event-1";
  return {
    id: plan?.id || "today",
    activeEventId,
    events,
  };
}