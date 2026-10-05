const HISTORY_LIMIT = 200;

function historyDayKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lusaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function historyEntryFor(outfit, dayBrief, wardrobeById, now, eventId = "", eventLabel = "") {
  return {
    id: `wear-${now.getTime()}-${eventId || "day"}-${outfit.id}`,
    createdAt: now.toISOString(),
    eventId,
    eventLabel,
    outfitId: outfit.id,
    outfitName: outfit.name,
    itemIds: outfit.itemIds.slice(),
    itemNames: outfit.itemIds.map((itemId) => wardrobeById[itemId]?.name || "Wardrobe item"),
    reason: outfit.reason,
    weather: outfit.weather,
    formality: outfit.formality,
    dayBrief: { ...dayBrief },
    feedback: {
      woreIt: "",
      comfort: "",
      likedColors: "",
      wouldWearAgain: "",
    },
  };
}

export function restoreSelectedRecommendation(savedState, now = new Date(), eventId = "") {
  const latestHistoryEntry = [...(savedState?.wearHistory || [])]
    .reverse()
    .find(
      (entry) =>
        entry.outfitId === savedState?.selected &&
        (!eventId || entry.eventId === eventId),
    );
  if (
    latestHistoryEntry?.outfitId === savedState?.selected &&
    historyDayKey(latestHistoryEntry.createdAt) !== historyDayKey(now)
  ) {
    return null;
  }
  return typeof savedState?.selected === "string" ? savedState.selected : null;
}

export function selectRecommendation(
  state,
  outfit,
  { dayBrief = {}, wardrobeById = {}, now = new Date(), eventId = "", eventLabel = "" } = {},
) {
  const wearHistory = Array.isArray(state?.wearHistory) ? state.wearHistory : [];
  const latestEntryForLook = [...wearHistory]
    .reverse()
    .find((entry) =>
      entry.outfitId === outfit.id &&
      (!eventId || !entry.eventId || entry.eventId === eventId),
    );
  if (
    state?.selected === outfit.id &&
    latestEntryForLook &&
    historyDayKey(latestEntryForLook.createdAt) === historyDayKey(now)
  ) {
    return { selected: outfit.id, wearHistory };
  }

  return {
    selected: outfit.id,
    wearHistory: [
      ...wearHistory,
      historyEntryFor(outfit, dayBrief, wardrobeById, now, eventId, eventLabel),
    ].slice(-HISTORY_LIMIT),
  };
}

export function swapOptionsFor(outfit, candidates) {
  const currentIds = new Set(outfit?.itemIds || []);
  return (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate.id !== outfit?.id)
    .map((candidate) => {
      const removed = (outfit.itemIds || []).filter((id) => !candidate.itemIds.includes(id));
      const added = candidate.itemIds.filter((id) => !currentIds.has(id));
      if (removed.length !== 1 || added.length !== 1) return null;
      return { candidate, removedId: removed[0], addedId: added[0] };
    })
    .filter(Boolean);
}

export function swapSelectedRecommendation(
  state,
  outfit,
  alternative,
  options = {},
) {
  if (state?.selected !== outfit?.id) return state;
  return selectRecommendation(state, alternative, options);
}